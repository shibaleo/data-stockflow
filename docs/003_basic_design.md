# data-stockflow 基本設計

要件定義は [002_requirements.md](002_requirements.md) を参照。

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
| DELETE（仕訳） | is_active=false の revision INSERT | INSERT |
| DELETE（マスタ） | is_active=false の revision INSERT | INSERT |
| RESTORE（仕訳） | is_active=true の revision INSERT | INSERT |
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
- 確定制御（tenant_setting.locked_until の確認）
- 伝票番号の採番（journal_header の MAX + 1 で導出）

---

## コアモデル

### 口座（account）

勘定科目を表現する。残高 = journal_line の累積。

```sql
CREATE TABLE account (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  code          TEXT NOT NULL,           -- [identity] 不変。他テーブルから account_code で参照
  display_code  TEXT,                    -- [display] ユーザー向け科目コード。revision で変更可能
  revision      INT NOT NULL DEFAULT 1,
  -- bi-temporal
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to      TIMESTAMPTZ,
  created_by    UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 属性
  name          TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'JPY',
  is_active     BOOL NOT NULL DEFAULT true,
  account_type  TEXT NOT NULL
    CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  sign          INT NOT NULL             -- +1=貸方正(credit-normal), -1=借方正(debit-normal)。account_type と独立（控除科目対応）
    CHECK (sign IN (1, -1)),
  parent_account_code TEXT,              -- → account.code [identity]（自己参照で階層構造）
  UNIQUE (tenant_id, code, revision)
);

CREATE VIEW current_account AS
  SELECT DISTINCT ON (tenant_id, code) *
  FROM account
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;

-- 例:
-- code='ACC001', display_code='731', rev=1, name='食費',
--   valid_from='2024-04-01', created_at='2024-04-01'
-- code='ACC001', display_code='731', rev=2, name='食料品費',
--   valid_from='2025-04-01', created_at='2025-03-01'              ← 将来の名称変更を事前登録
-- code='ACC001', display_code='7310', rev=3, name='食料品費',
--   valid_from='2025-04-01', created_at='2025-03-15'              ← コード変更（display_code のみ変更、code は不変）
```

### タグ（tag）

汎用分類ラベル。`tag_type` で分類軸を区別する。仕訳単位で N:N 紐付け。

```sql
CREATE TABLE tag (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  code          TEXT NOT NULL,           -- [identity] 不変。journal_tag から tag_code で参照
  display_code  TEXT,                    -- [display] ユーザー向けタグコード
  revision      INT NOT NULL DEFAULT 1,
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to      TIMESTAMPTZ,
  created_by    UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  name          TEXT NOT NULL,
  tag_type      TEXT NOT NULL,           -- 分類軸（例: 'project', 'cost_center', 'product'）
  is_active     BOOL NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code, revision)
);

CREATE VIEW current_tag AS
  SELECT DISTINCT ON (tenant_id, code) *
  FROM tag
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;
```

---

## 仕訳

仕訳 = 貸借がバランスする journal_line のグループ。API 経由で受け取り、append-only で格納する。
呼び出し元が仕訳をどう生成したか（手入力・ルール適用・外部連携）は DB の関心外。
**Append-only**: 編集は新しい revision を INSERT する。内容の UPDATE / DELETE は行わない。

### バージョン管理モデル

```
同じ論理仕訳 = 同じ idempotency_code を共有する revision の chain

  revision 1 (created_at: 3/1 10:00)  ← 初回生成
  revision 2 (created_at: 3/5 14:00)  ← 編集（新 INSERT）
  revision 3 (created_at: 3/8 09:00)  ← 再編集（新 INSERT）

最新版 = idempotency_code ごとに revision が最大のレコード
  SELECT DISTINCT ON (idempotency_code) *
  FROM journal
  ORDER BY idempotency_code, revision DESC

確定制御:
  tenant_setting.locked_until 以前の posted_date → 新 revision の INSERT を App 層が拒否
  アドミンが locked_until を変更することでロック範囲を調整（append-only で履歴に残る）
```

### DDL

```sql
CREATE TABLE journal_header (
  idempotency_code    TEXT PRIMARY KEY,    -- [identity] 不変。source:id 形式（例: 'zaim:12345'）
  tenant_id          UUID NOT NULL,
  voucher_code         TEXT,                -- [display] 伝票番号。ユーザー向け（削除時は欠番として残る）
  fiscal_period_code TEXT NOT NULL,       -- → fiscal_period.code [identity]
  created_by         UUID NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fiscal_period_code, voucher_code)
);

CREATE TABLE journal (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  idempotency_code   TEXT NOT NULL REFERENCES journal_header(idempotency_code),
  revision          INT NOT NULL DEFAULT 1,
  is_active         BOOL NOT NULL DEFAULT true,
  posted_date       TIMESTAMPTZ NOT NULL DEFAULT now()::date::timestamptz,
  journal_type      TEXT NOT NULL DEFAULT 'normal'
    CHECK (journal_type IN ('normal', 'closing', 'prior_adj', 'auto')),
  slip_category     TEXT NOT NULL DEFAULT 'ordinary'
    CHECK (slip_category IN ('ordinary', 'transfer', 'receipt', 'payment')),
  adjustment_flag   TEXT NOT NULL DEFAULT 'none'
    CHECK (adjustment_flag IN ('none', 'monthly_adj', 'year_end_adj')),
  description       TEXT,
  source_system     TEXT,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_code, revision)
);

CREATE TABLE journal_line (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  journal_id        UUID NOT NULL REFERENCES journal(id),
  line_group        INT NOT NULL,
  side              TEXT NOT NULL            -- 表示用（'debit'/'credit'）
    CHECK (side IN ('debit', 'credit')),
  account_code      TEXT NOT NULL,         -- → account.code [identity]
  department_code   TEXT,                  -- → department.code [identity]
  counterparty_code TEXT,                  -- → counterparty.code [identity]
  tax_class_code    TEXT,                  -- → tax_class.code [identity]
  tax_rate          NUMERIC(5,4),          -- 適用税率（例: 0.10, 0.08）。tax_class_code が NULL なら NULL
  is_reduced        BOOL,                  -- 軽減税率フラグ。勘定奉行 CSJS222（0=標準, 1=軽減）に対応
  amount            NUMERIC(15,0) NOT NULL CHECK (amount <> 0),  -- 符号付き: 貸方=正, 借方=負
  description       TEXT
);

-- journal と tag の N:N 中間テーブル（タグは仕訳単位で付与）
CREATE TABLE journal_tag (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  journal_id      UUID NOT NULL REFERENCES journal(id),
  tag_code        TEXT NOT NULL,          -- → tag.code [identity]
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE journal_attachment (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  idempotency_code   TEXT NOT NULL REFERENCES journal_header(idempotency_code),
  file_name         TEXT NOT NULL,
  file_path         TEXT NOT NULL,
  mime_type         TEXT,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE VIEW current_journal AS
  SELECT *
  FROM (
    SELECT DISTINCT ON (j.tenant_id, j.idempotency_code)
      jh.voucher_code,
      jh.fiscal_period_code,
      j.*
    FROM journal j
    JOIN journal_header jh ON jh.idempotency_code = j.idempotency_code
    ORDER BY j.tenant_id, j.idempotency_code, j.revision DESC
  ) latest
  WHERE latest.is_active;

-- 伝票番号の採番（API 層の責務）
-- journal_header から導出する。別途カウンターテーブルは持たない。
--   1. fiscal_period 行を SELECT FOR UPDATE でロック
--   2. SELECT COALESCE(MAX(voucher_code::int), 0) + 1
--      FROM journal_header WHERE tenant_id = ? AND fiscal_period_code = ?
--   3. journal_header を INSERT（採番結果を voucher_code に格納）
```

### 設計判断

- **journal_header + journal に分離**: revision 間で共有する属性（voucher_code, fiscal_period_code）は journal_header に、revision ごとに変わる内容は journal に格納
- **証憑は journal_header（= idempotency_code）に紐付け**: revision 間で証憑を共有。新 revision でも同じ証憑を参照可能
- **voucher_code は revision 間で引き継ぐ**: 伝票番号は journal_header の属性。採番は revision=1 のときのみ、journal_header の MAX(voucher_code) + 1 で導出
- **Append-only**: journal / journal_line の内容は INSERT のみ。編集は新 revision を追加。UPDATE / DELETE は行わない
- **削除も append-only**: `is_active = false` の revision を INSERT する。UPDATE は一切不要。伝票番号は欠番として残る。過去の revision はすべて残る（監査証跡）。current_journal ビューは最終 revision が非活性なら除外
- **確定制御は API 層**: `tenant_setting.locked_until` 以前の posted_date を持つ仕訳への新 revision INSERT（voided revision 含む）を拒否
- **消費税額は仮払消費税/仮受消費税口座への通常の記入**: 税はメタデータではなく口座の残高
- **line_group で表示行をグルーピング**: 同一 line_group の行が勘定奉行の1行に対応
- **税区分は仕訳行のプロパティ** (`journal_line.tax_class_code`): 同一口座でも取引ごとに税率・インボイス区分が異なりうるため、仕訳行で保持。デフォルト値はマッピングルール層（呼び出し元）が付与
- **符号付き金額モデル**: `amount` は符号付き（貸方=正, 借方=負）。`side` は表示用に残す。`SUM(amount) = 0` が仕訳の均衡恒等式
- **均衡制約は DB 層**: Constraint Trigger（DEFERRABLE INITIALLY DEFERRED）で `SUM(amount) = 0` を保証。行単位の検証（side と amount 符号の整合等）は App 層
- **account.sign は account_type と独立**: 口座残高 = `SUM(amount) * account.sign`。控除科目（貸倒引当金=資産だが貸方正 sign=+1、自己株式=純資産だが借方正 sign=-1）に対応するため、admin が口座ごとに設定。account_type からの自動導出はしない

### 仕訳の例: 食品100円(税8%) + 物品100円(税10%) を現金で購入

```
journal: id=abc, idempotency_code='zaim:12345', revision=1

journal_line:
line_group | side   | account_code   | tax_class_code | tax_rate | is_reduced | amount
-----------+--------+----------------+----------------+----------+------------+-------
1          | debit  | 731 食費        | 1              | 0.08     | true       | -100
1          | debit  | 151 仮払消費税   | NULL           | NULL     | NULL       | -8
2          | debit  | 732 消耗品費     | 1              | 0.10     | false      | -100
2          | debit  | 151 仮払消費税   | NULL           | NULL     | NULL       | -10
1          | credit | 100 現金        | NULL           | NULL     | NULL       | 218

→ 符号: 貸方=正, 借方=負。SUM(amount) = (-100)+(-8)+(-100)+(-10)+218 = 0 ✓
→ tax_class_code / tax_rate / is_reduced は費用/収益の本体行に付与。税額行・決済行は NULL
→ アプリ層が line_group で分解:
  勘定奉行 行1: 借方 食費100(税区分1, 8%軽)+税8      / 貸方 現金218
  勘定奉行 行2: 借方 消耗品費100(税区分1, 10%標準)+税10 / 貸方 (なし、行1に合算)
```

### バージョン管理の例: 仕訳の編集

```
-- 初回生成
INSERT journal (idempotency_code='zaim:12345', revision=1, ...)
INSERT journal_line (journal_id=上記, ...)

-- ユーザーが金額を修正（posted_date が locked_until より後の間のみ可能）
INSERT journal (idempotency_code='zaim:12345', revision=2, ...)
INSERT journal_line (journal_id=上記, ...)

-- revision=1 の行はそのまま残る（監査証跡）
-- current_journal ビューは revision=2 のみ返す
```

---

## テナント設定

```sql
CREATE TABLE tenant_setting (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  revision      INT NOT NULL DEFAULT 1,
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to      TIMESTAMPTZ,
  created_by    UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until  TIMESTAMPTZ,            -- この日以前の posted_date を持つ仕訳は編集不可。NULL=ロックなし
  UNIQUE (tenant_id, revision)
);

CREATE VIEW current_tenant_setting AS
  SELECT DISTINCT ON (tenant_id) *
  FROM tenant_setting
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, created_at DESC;
```

**確定制御**: API 層は仕訳の INSERT 前に `current_tenant_setting.locked_until` を確認し、`journal.posted_date <= locked_until` なら拒否する。ロック日の変更は新 revision の INSERT で表現（append-only）。アドミンが `locked_until` を過去に戻すことで、確定済み期間の仕訳を再編集可能にできる（変更履歴は監査証跡に残る）。

---

## マスタ系

### 会計期間

```sql
CREATE TABLE fiscal_period (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  code        TEXT NOT NULL,            -- [identity] 不変。journal_header から fiscal_period_code で参照
  display_code TEXT,                    -- [display] ユーザー向け期間コード（例: '2025-04'）
  revision    INT NOT NULL DEFAULT 1,
  valid_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to    TIMESTAMPTZ,
  created_by  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  fiscal_year INT NOT NULL,
  period_no   INT NOT NULL,           -- 1〜12, 13=決算整理期間
  start_date  TIMESTAMPTZ NOT NULL,
  end_date    TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'finalized')),
  UNIQUE (tenant_id, code, revision)
);

CREATE VIEW current_fiscal_period AS
  SELECT DISTINCT ON (tenant_id, code) *
  FROM fiscal_period
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;
```

### 部門

```sql
CREATE TABLE department (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  code        TEXT NOT NULL,            -- [identity] 不変。他テーブルから department_code で参照
  display_code TEXT,                     -- [display] ユーザー向け部門コード
  revision    INT NOT NULL DEFAULT 1,
  valid_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to    TIMESTAMPTZ,
  created_by  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  name        TEXT NOT NULL,
  parent_department_code TEXT,           -- → department.code [identity]（自己参照で階層構造）
  department_type TEXT CHECK (department_type IN ('statutory', 'management')),
  is_active   BOOL NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code, revision)
);

CREATE VIEW current_department AS
  SELECT DISTINCT ON (tenant_id, code) *
  FROM department
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;
```

### 消費税区分

**編集権限: platform**（税法に基づく消費税区分体系。プラットフォーム運営者が税制改正時に API 経由で更新する。テナントのアドミン・ユーザーには読み取りのみ公開）

税率（`tax_rate`）と軽減税率フラグ（`is_reduced`）は取引ごとに異なりうるため `journal_line` で保持する。`tax_class` は区分の分類属性（方向・課税区分・控除率・インボイス種別）のみを持つ。

```sql
CREATE TABLE tax_class (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL,       -- [identity] 不変。journal_line から tax_class_code で参照
  display_code      TEXT,                -- [display] ユーザー向け税区分コード
  revision          INT NOT NULL DEFAULT 1,
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to          TIMESTAMPTZ,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  name              TEXT NOT NULL,
  is_active         BOOL NOT NULL DEFAULT true,
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
  tenant_id                 UUID NOT NULL,
  code                      TEXT NOT NULL,  -- [identity] 不変。他テーブルから counterparty_code で参照
  display_code              TEXT,           -- [display] ユーザー向け取引先コード
  revision                  INT NOT NULL DEFAULT 1,
  valid_from                TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to                  TIMESTAMPTZ,
  created_by                UUID NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  name                      TEXT NOT NULL,
  is_active                 BOOL NOT NULL DEFAULT true,
  qualified_invoice_number  TEXT,
  is_qualified_issuer       BOOL NOT NULL DEFAULT false,
  UNIQUE (tenant_id, code, revision)
);

CREATE VIEW current_counterparty AS
  SELECT DISTINCT ON (tenant_id, code) *
  FROM counterparty
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;
```

### マッピングルール（事実 → 仕訳の導出用）

仕訳から直接参照されない設定データだが、append-only で管理する。
仕訳の journal_line には変換結果の account_code が記録されるため、
マッピングルールが変更されても過去の仕訳に影響しない。

```sql
CREATE TABLE account_mapping (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  source_system     TEXT NOT NULL,
  source_field      TEXT NOT NULL,
  source_value      TEXT NOT NULL,
  side              TEXT NOT NULL
    CHECK (side IN ('debit', 'credit')),
  revision          INT NOT NULL DEFAULT 1,
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to          TIMESTAMPTZ,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active         BOOL NOT NULL DEFAULT true,
  account_code      TEXT NOT NULL,        -- → account.code [identity]
  UNIQUE (tenant_id, source_system, source_field, source_value, side, revision)
);

CREATE VIEW current_account_mapping AS
  SELECT DISTINCT ON (tenant_id, source_system, source_field, source_value, side) *
  FROM account_mapping
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, source_system, source_field, source_value, side, created_at DESC;

CREATE TABLE payment_mapping (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  source_system     TEXT NOT NULL,
  payment_method    TEXT NOT NULL,
  revision          INT NOT NULL DEFAULT 1,
  valid_from        TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to          TIMESTAMPTZ,
  created_by        UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active         BOOL NOT NULL DEFAULT true,
  account_code      TEXT NOT NULL,        -- → account.code [identity]
  UNIQUE (tenant_id, source_system, payment_method, revision)
);

CREATE VIEW current_payment_mapping AS
  SELECT DISTINCT ON (tenant_id, source_system, payment_method) *
  FROM payment_mapping
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, source_system, payment_method, created_at DESC;
```

---

## テーブル一覧

すべてのテーブルが append-only（INSERT のみ）。UPDATE / DELETE を行うテーブルはゼロ。
`tax_class` のみグローバル（tenant_id なし）。他はすべて `tenant_id` でテナント分離。

| # | テーブル | 権限区分 | tenant_id | キー | 概要 |
|---|---------|---------|:---------:|------|------|
| 1 | account | アドミン | あり | tenant_id + code + revision | 勘定科目 |
| 2 | tag | ユーザー | あり | tenant_id + code + revision | タグ（分類軸 tag_type ごとの分類ラベル） |
| 3 | fiscal_period | アドミン | あり | tenant_id + code + revision | 会計期間 |
| 4 | department | アドミン | あり | tenant_id + code + revision | 部門 |
| 5 | tax_class | プラットフォーム | **なし** | code + revision | 消費税区分（グローバル） |
| 6 | counterparty | ユーザー | あり | tenant_id + code + revision | 取引先 |
| 7 | account_mapping | アドミン | あり | tenant_id + 複合 + revision | カテゴリ→科目の変換 |
| 8 | payment_mapping | アドミン | あり | tenant_id + 複合 + revision | 決済手段→科目の変換 |
| 9 | tenant_setting | テナント | あり | tenant_id + revision | テナント設定（locked_until 等） |
| 10 | journal_header | トランザクション | あり | idempotency_code | 論理仕訳 |
| 11 | journal | トランザクション | あり | idempotency_code + revision | 仕訳 revision |
| 12 | journal_line | トランザクション | あり | journal_id | 仕訳行 |
| 13 | journal_tag | トランザクション | あり | journal_id + tag_code | 仕訳タグ（N:N） |
| 14 | journal_attachment | トランザクション | あり | idempotency_code | 証憑（削除不可） |
| - | current_tenant_setting | ビュー | - | 最新版テナント設定 |
| - | current_account | ビュー | - | 最新版口座 |
| - | current_tag | ビュー | - | 最新版タグ |
| - | current_fiscal_period | ビュー | - | 最新版会計期間 |
| - | current_department | ビュー | - | 最新版部門 |
| - | current_tax_class | ビュー | - | 最新版消費税区分 |
| - | current_counterparty | ビュー | - | 最新版取引先 |
| - | current_account_mapping | ビュー | - | 最新版カテゴリマッピング |
| - | current_payment_mapping | ビュー | - | 最新版決済マッピング |
| - | current_journal | ビュー | - | 最新版仕訳（voided 除外） |
