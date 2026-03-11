# data-stockflow スキーマ設計

## 設計方針

- **DB は API を公開する**: 呼び出し元が手入力 UI か自動連携サービスかは DB の関心外
- **会計口座モデル**: 複式簿記の仕訳・勘定科目・残高管理に特化。在庫・栄養等の別ドメインは同じ設計パターンを別テーブル群にコピーして実現する
- 税区分は口座のプロパティ。仕訳行には持たない。消費税額は仮払/仮受消費税口座への通常の記入
- **Append-only**: すべてのテーブルで UPDATE / DELETE しない。変更は新 revision の INSERT で表現
- **Bi-temporal**: append-only テーブルは `valid_from/valid_to`（業務時間）+ `created_at`（システム時間）を持つ。将来の変更の事前登録、過去の誤りの遡及修正に対応
- **確定前は編集可能、確定後は不変**: fiscal_period の状態で制御
- **ID は UUID**: SERIAL は使わない。並び順は created_at で管理
- **参照整合性は App 層で保証**: append-only テーブルの code は revision をまたいで重複するため、DB レベルの REFERENCES は使わない。App 層の API が INSERT 時に存在チェックを行う
- **API は CRUD を提供**: 呼び出し元は append-only / bi-temporal を意識しない。API が CRUD → append-only INSERT に変換する
- **命名規約**:
  - 業務日付: `posted_date`
  - 自由記述: `description`
  - 他テーブル参照: `{テーブル名}_code`（例: `account_code`, `department_code`）
  - 他テーブル UUID 参照: `{テーブル名}_id`（例: `journal_id`）
  - 略称は使わない（`dept` → `department`, `memo` → `description`）
  - 真偽値フラグ: `is_` プレフィクス + `BOOL NOT NULL DEFAULT {true|false}`
  - 日付: すべて `TIMESTAMPTZ`。業務日付はデフォルト `now()::date::timestamptz`（当日 00:00:00）
  - bi-temporal: `valid_from TIMESTAMPTZ NOT NULL DEFAULT now()` / `valid_to TIMESTAMPTZ`

---

## API 層

API は呼び出し元に RESTful CRUD を提供し、内部で append-only + bi-temporal に変換する。
呼び出し元は bi-temporal を意識する必要がないが、必要なときはオプションパラメータでアクセスできる。

### CRUD → append-only 変換

| 操作 | API の振る舞い | DB 操作 |
|------|--------------|--------|
| CREATE | revision=1, valid_from=now() で INSERT | INSERT |
| READ | current_* ビューから取得 | SELECT |
| READ (`as_of`) | 指定時点の有効レコードを取得 | SELECT with temporal filter |
| UPDATE | 最新 revision+1 を INSERT, valid_from=now() | INSERT |
| UPDATE (`effective_date`) | 最新 revision+1 を INSERT, valid_from=指定日時 | INSERT |
| DELETE（仕訳） | is_voided=true の revision INSERT | INSERT |
| DELETE（マスタ） | is_active=false の revision INSERT | INSERT |
| RESTORE（仕訳） | is_voided=false の revision INSERT | INSERT |
| RESTORE（マスタ） | is_active=true の revision INSERT | INSERT |
| EXPIRE（マスタ、管理操作） | valid_to=now() の revision INSERT | INSERT |

### 削除の3段階（bi-temporal + append-only が自然に提供）

| 操作 | current_* ビュー | DB の行 | 用途 |
|------|:---:|:---:|------|
| DELETE | 残る（非活性） | 残る | ユーザー操作。一覧に残るが新規利用不可 |
| RESTORE | 残る（活性） | 残る | 削除の取り消し |
| EXPIRE | **消える** | 残る | 管理操作。本来あるべきでないデータの失効 |

すべて INSERT。物理削除は一切行わない。

### デフォルト動作

- `valid_from`: 省略時 = now()
- `as_of`: 省略時 = now()（current_* ビュー相当）
- 呼び出し元は「普通の CRUD」と同じ感覚で操作可能

### API の責務

- CRUD → append-only INSERT への変換（revision 自動採番）
- 参照整合性の検証（code の存在チェック）
- バランス検証（仕訳の貸借一致）
- 確定制御（fiscal_period の status 確認）
- 伝票番号の採番（journal_header の MAX + 1 で導出）

---

## コアモデル

### 口座（account）

勘定科目を表現する。残高 = journal_line の累積。

```sql
CREATE TABLE account (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL,
  revision      INT NOT NULL DEFAULT 1,
  -- bi-temporal
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 属性
  name          TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'JPY',
  is_active     BOOL NOT NULL DEFAULT true,
  account_type  TEXT NOT NULL
    CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  balance_side  TEXT NOT NULL
    CHECK (balance_side IN ('debit', 'credit')),
  tax_class_code TEXT,                    -- → tax_class.code（App 層で整合性保証）
  is_sub_required BOOL NOT NULL DEFAULT false,
  parent_code   TEXT,                    -- 階層構造（科目分類）
  UNIQUE (code, revision)
);

CREATE VIEW current_account AS
  SELECT DISTINCT ON (code) *
  FROM account
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY code, created_at DESC;

-- 例:
-- code='731', rev=1, valid_from='2024-04-01', valid_to=NULL,
--   name='食費', tax_class_code='K08', created_at='2024-04-01'
-- code='731', rev=2, valid_from='2024-04-01', valid_to=NULL,
--   name='食費', tax_class_code='K10', created_at='2024-10-15'       ← あとから税区分を修正
-- code='731', rev=3, valid_from='2025-04-01', valid_to=NULL,
--   name='食料品費', tax_class_code='K10', created_at='2025-03-01'   ← 将来の名称変更を事前登録

CREATE TABLE sub_account (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code    TEXT NOT NULL,
  code            TEXT NOT NULL,
  revision        INT NOT NULL DEFAULT 1,
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  name            TEXT NOT NULL,
  is_active       BOOL NOT NULL DEFAULT true,
  counterparty_code TEXT,                -- → counterparty.code（App 層で整合性保証）
  UNIQUE (account_code, code, revision)
);

CREATE VIEW current_sub_account AS
  SELECT DISTINCT ON (account_code, code) *
  FROM sub_account
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY account_code, code, created_at DESC;
```

---

## 仕訳

仕訳 = 貸借がバランスする journal_line のグループ。API 経由で受け取り、append-only で格納する。
呼び出し元が仕訳をどう生成したか（手入力・ルール適用・外部連携）は DB の関心外。
**Append-only**: 編集は新しい revision を INSERT する。内容の UPDATE / DELETE は行わない。

### バージョン管理モデル

```
同じ論理仕訳 = 同じ idempotency_key を共有する revision の chain

  revision 1 (created_at: 3/1 10:00)  ← 初回生成
  revision 2 (created_at: 3/5 14:00)  ← 編集（新 INSERT）
  revision 3 (created_at: 3/8 09:00)  ← 再編集（新 INSERT）

最新版 = idempotency_key ごとに revision が最大のレコード
  SELECT DISTINCT ON (idempotency_key) *
  FROM journal
  ORDER BY idempotency_key, revision DESC

確定制御:
  fiscal_period.is_locked = true → 新 revision の INSERT を App 層が拒否
  fiscal_period.status = 'finalized' → 完全に不変
```

```sql
CREATE TABLE journal_header (
  idempotency_key    TEXT PRIMARY KEY,
  voucher_no         TEXT,                -- 伝票番号（削除時は欠番として残る）
  fiscal_period_code TEXT NOT NULL,       -- → fiscal_period.code（App 層で整合性保証）
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_period_code, voucher_no)
);

CREATE TABLE journal (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   TEXT NOT NULL REFERENCES journal_header(idempotency_key),
  revision          INT NOT NULL DEFAULT 1,
  is_voided         BOOL NOT NULL DEFAULT false,
  posted_date       TIMESTAMPTZ NOT NULL DEFAULT now()::date::timestamptz,
  journal_type      TEXT NOT NULL DEFAULT 'normal'
    CHECK (journal_type IN ('normal', 'closing', 'prior_adj', 'auto')),
  slip_category     TEXT NOT NULL DEFAULT 'ordinary'
    CHECK (slip_category IN ('ordinary', 'transfer', 'receipt', 'payment')),
  adjustment_flag   TEXT NOT NULL DEFAULT 'none'
    CHECK (adjustment_flag IN ('none', 'monthly_adj', 'year_end_adj')),
  description       TEXT,
  source_system     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, revision)
);

CREATE TABLE journal_line (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id        UUID NOT NULL REFERENCES journal(id),
  line_group        INT NOT NULL,
  side              TEXT NOT NULL
    CHECK (side IN ('debit', 'credit')),
  account_code      TEXT NOT NULL,         -- → account.code（App 層で整合性保証）
  sub_account_code  TEXT,
  department_code   TEXT,                  -- → department.code（App 層で整合性保証）
  counterparty_code TEXT,                  -- → counterparty.code（App 層で整合性保証）
  amount            NUMERIC(15,0) NOT NULL CHECK (amount > 0),
  description       TEXT
);

CREATE TABLE journal_attachment (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   TEXT NOT NULL REFERENCES journal_header(idempotency_key),
  file_name         TEXT NOT NULL,
  file_path         TEXT NOT NULL,
  mime_type         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE VIEW current_journal AS
  SELECT *
  FROM (
    SELECT DISTINCT ON (j.idempotency_key)
      jh.voucher_no,
      jh.fiscal_period_code,
      j.*
    FROM journal j
    JOIN journal_header jh ON jh.idempotency_key = j.idempotency_key
    ORDER BY j.idempotency_key, j.revision DESC
  ) latest
  WHERE NOT latest.is_voided;

-- 伝票番号の採番（API 層の責務）
-- journal_header から導出する。別途カウンターテーブルは持たない。
--   1. fiscal_period 行を SELECT FOR UPDATE でロック
--   2. SELECT COALESCE(MAX(voucher_no::int), 0) + 1
--      FROM journal_header WHERE fiscal_period_code = ?
--   3. journal_header を INSERT（採番結果を voucher_no に格納）
```

**設計判断:**

- **journal_header + journal に分離**: revision 間で共有する属性（voucher_no, fiscal_period_code）は journal_header に、revision ごとに変わる内容は journal に格納
- **証憑は journal_header（= idempotency_key）に紐付け**: revision 間で証憑を共有。新 revision でも同じ証憑を参照可能
- **voucher_no は revision 間で引き継ぐ**: 伝票番号は journal_header の属性。採番は revision=1 のときのみ、journal_header の MAX(voucher_no) + 1 で導出
- **Append-only**: journal / journal_line の内容は INSERT のみ。編集は新 revision を追加。UPDATE / DELETE は行わない
- **削除も append-only**: `is_voided = true` の revision を INSERT する。UPDATE は一切不要。伝票番号は欠番として残る。過去の revision はすべて残る（監査証跡）。current_journal ビューは最終 revision が voided なら除外
- **確定制御は API 層**: `fiscal_period.is_locked` が true なら新 revision の INSERT（voided revision 含む）を拒否
- **消費税額は仮払消費税/仮受消費税口座への通常の記入**: 税はメタデータではなく口座の残高
- **line_group で表示行をグルーピング**: 同一 line_group の行が勘定奉行の1行に対応
- **税区分は口座のプロパティ** (`account.tax_class_code`): 勘定奉行 CSV 出力時に account から導出
- **行モデル（side + 正の金額）**: 勘定奉行 CSV 形式と構造が一致
- **貸借一致検証は App 層の責務**: 仕訳単位で均衡していれば DB 全体も数学的に均衡

**仕訳の例: 食品100円(税8%) + 物品100円(税10%) を現金で購入**

```
journal: id=abc, idempotency_key='zaim:12345', revision=1

journal_line:
line_group | side   | account_code   | amount
-----------+--------+----------------+-------
1          | debit  | 731 食費        | 100
1          | debit  | 151 仮払消費税   | 8
2          | debit  | 732 消耗品費     | 100
2          | debit  | 151 仮払消費税   | 10
1          | credit | 100 現金        | 218

→ アプリ層が line_group で分解:
  勘定奉行 行1: 借方 食費100+税8    / 貸方 現金218
  勘定奉行 行2: 借方 消耗品費100+税10 / 貸方 (なし、行1に合算)
```

**バージョン管理の例: 仕訳の編集**

```
-- 初回生成
INSERT journal (idempotency_key='zaim:12345', revision=1, ...)
INSERT journal_line (journal_id=上記, ...)

-- ユーザーが金額を修正（fiscal_period が open の間のみ可能）
INSERT journal (idempotency_key='zaim:12345', revision=2, ...)
INSERT journal_line (journal_id=上記, ...)

-- revision=1 の行はそのまま残る（監査証跡）
-- current_journal ビューは revision=2 のみ返す
```

---

## マスタ系

### 会計期間

```sql
CREATE TABLE fiscal_period (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL,           -- '2025-04', '2025-13' 等
  revision    INT NOT NULL DEFAULT 1,
  valid_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  fiscal_year INT NOT NULL,
  period_no   INT NOT NULL,           -- 1〜12, 13=決算整理期間
  start_date  TIMESTAMPTZ NOT NULL,
  end_date    TIMESTAMPTZ NOT NULL,
  is_locked   BOOL NOT NULL DEFAULT false,
  status      TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'finalized')),
  UNIQUE (code, revision)
);

CREATE VIEW current_fiscal_period AS
  SELECT DISTINCT ON (code) *
  FROM fiscal_period
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY code, created_at DESC;
```

### 部門

```sql
CREATE TABLE department (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL,
  revision    INT NOT NULL DEFAULT 1,
  valid_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  name        TEXT NOT NULL,
  parent_code TEXT,
  department_type TEXT CHECK (department_type IN ('statutory', 'management')),
  is_active   BOOL NOT NULL DEFAULT true,
  UNIQUE (code, revision)
);

CREATE VIEW current_department AS
  SELECT DISTINCT ON (code) *
  FROM department
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY code, created_at DESC;
```

### 消費税区分

```sql
CREATE TABLE tax_class (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL,
  revision          INT NOT NULL DEFAULT 1,
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  name              TEXT NOT NULL,
  is_active         BOOL NOT NULL DEFAULT true,
  tax_rate          NUMERIC(5,4),
  is_reduced        BOOL NOT NULL DEFAULT false,
  direction         TEXT CHECK (direction IN ('purchase', 'sale')),
  is_taxable        BOOL NOT NULL DEFAULT true,
  deduction_ratio   NUMERIC(5,4),
  invoice_type      TEXT
    CHECK (invoice_type IN ('qualified', 'transitional_80', 'transitional_50', 'none')),
  UNIQUE (code, revision)
);

CREATE VIEW current_tax_class AS
  SELECT DISTINCT ON (code) *
  FROM tax_class
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY code, created_at DESC;
```

### 取引先

```sql
CREATE TABLE counterparty (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                      TEXT NOT NULL,
  revision                  INT NOT NULL DEFAULT 1,
  valid_from                TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to                  TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  name                      TEXT NOT NULL,
  is_active                 BOOL NOT NULL DEFAULT true,
  qualified_invoice_number  TEXT,
  is_qualified_issuer       BOOL NOT NULL DEFAULT false,
  UNIQUE (code, revision)
);

CREATE VIEW current_counterparty AS
  SELECT DISTINCT ON (code) *
  FROM counterparty
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY code, created_at DESC;
```

### マッピングルール（事実 → 仕訳の導出用）

仕訳から直接参照されない設定データだが、append-only で管理する。
仕訳の journal_line には変換結果の account_code が記録されるため、
マッピングルールが変更されても過去の仕訳に影響しない。

```sql
CREATE TABLE account_mapping (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system     TEXT NOT NULL,
  source_field      TEXT NOT NULL,
  source_value      TEXT NOT NULL,
  side              TEXT NOT NULL
    CHECK (side IN ('debit', 'credit')),
  revision          INT NOT NULL DEFAULT 1,
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active         BOOL NOT NULL DEFAULT true,
  account_code      TEXT NOT NULL,
  sub_account_code  TEXT,
  UNIQUE (source_system, source_field, source_value, side, revision)
);

CREATE VIEW current_account_mapping AS
  SELECT DISTINCT ON (source_system, source_field, source_value, side) *
  FROM account_mapping
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY source_system, source_field, source_value, side, created_at DESC;

CREATE TABLE payment_mapping (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system     TEXT NOT NULL,
  payment_method    TEXT NOT NULL,
  revision          INT NOT NULL DEFAULT 1,
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active         BOOL NOT NULL DEFAULT true,
  account_code      TEXT NOT NULL,
  sub_account_code  TEXT,
  UNIQUE (source_system, payment_method, revision)
);

CREATE VIEW current_payment_mapping AS
  SELECT DISTINCT ON (source_system, payment_method) *
  FROM payment_mapping
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY source_system, payment_method, created_at DESC;
```

---

## 帳票（すべてクエリで導出・current_journal ビュー経由）

残高サマリのキャッシュテーブルは持たない。すべて journal_line からクエリで導出する。
パフォーマンスが必要になった時点で PostgreSQL MATERIALIZED VIEW を検討する。

| 帳票 | データソース |
|------|------------|
| 仕訳帳 | current_journal + journal_line |
| 総勘定元帳 | journal_line WHERE account_code = ? (current_journal 経由) |
| 補助元帳 | journal_line WHERE account_code + sub_account_code = ? |
| 合計残高試算表 | current_journal 経由の journal_line を account_code, department_code で集計 |
| 貸借対照表 | 上記のうち account_type IN (asset, liability, equity) |
| 損益計算書 | 上記のうち account_type IN (revenue, expense) |
| 部門別損益 | 上記を department_code で GROUP BY |
| 消費税集計 | journal_line WHERE account_code IN ('151','251') GROUP BY line_group → 対応する費用口座の tax_class_code で分類 |
| 仕訳の編集履歴 | journal WHERE idempotency_key = ? ORDER BY revision（監査用） |
| 削除済み仕訳一覧 | journal WHERE is_voided = true（欠番の確認用） |

---

## 勘定奉行 CSV エクスポート（App 層の責務）

```
current_journal + journal_line
  → line_group で行をグルーピング
  → 各グループ内の仮払消費税行から税額を取得
  → 費用/資産口座の account.tax_class_code から税区分コードを取得
  → 借方/貸方ペアに変換
  → OBC受入形式 CSV（Shift-JIS）生成
```

---

## 年度繰越処理

1. `journal_type = 'closing'` の仕訳で収益/費用を繰越利益剰余金に振り替え
2. `period_no = 13`（決算整理期間）にこの仕訳を計上
3. 新年度の期首残高は B/S 勘定（asset, liability, equity）の journal_line 累積で導出
4. fiscal_period.status の遷移: `open` → `closed`（月次締め）→ `finalized`（年度確定）

---

## テーブル一覧

すべてのテーブルが append-only（INSERT のみ）。UPDATE / DELETE を行うテーブルはゼロ。

| # | テーブル | 分類 | キー | 概要 |
|---|---------|------|------|------|
| 1 | account | マスタ | code + revision | 勘定科目 |
| 2 | sub_account | マスタ | account_code + code + revision | 補助科目 |
| 3 | fiscal_period | マスタ | code + revision | 会計期間 |
| 4 | department | マスタ | code + revision | 部門 |
| 5 | tax_class | マスタ | code + revision | 消費税区分 |
| 6 | counterparty | マスタ | code + revision | 取引先 |
| 7 | account_mapping | 設定 | 複合 + revision | カテゴリ→科目の変換 |
| 8 | payment_mapping | 設定 | 複合 + revision | 決済手段→科目の変換 |
| 9 | journal_header | トランザクション | idempotency_key | 論理仕訳 |
| 10 | journal | トランザクション | UUID | 仕訳 revision |
| 11 | journal_line | トランザクション | UUID | 仕訳行 |
| 12 | journal_attachment | トランザクション | UUID | 証憑添付 |
| - | current_account | ビュー | - | 最新版口座 |
| - | current_sub_account | ビュー | - | 最新版補助口座 |
| - | current_fiscal_period | ビュー | - | 最新版会計期間 |
| - | current_department | ビュー | - | 最新版部門 |
| - | current_tax_class | ビュー | - | 最新版消費税区分 |
| - | current_counterparty | ビュー | - | 最新版取引先 |
| - | current_account_mapping | ビュー | - | 最新版カテゴリマッピング |
| - | current_payment_mapping | ビュー | - | 最新版決済マッピング |
| - | current_journal | ビュー | - | 最新版仕訳（voided 除外） |
