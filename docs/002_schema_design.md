# data-stockflow スキーマ設計

## 設計方針

- **DB は API を公開する**: 呼び出し元が手入力 UI か自動連携サービスかは DB の関心外
- **会計口座モデル**: 複式簿記の仕訳・勘定科目・残高管理に特化。在庫・栄養等の別ドメインは同じ設計パターンを別テーブル群にコピーして実現する
- 税区分は仕訳行のプロパティ。同一口座でも取引ごとに税区分が異なりうる。消費税額は仮払/仮受消費税口座への通常の記入。デフォルト税区分はマッピングルール層（呼び出し元）が付与する
- **Append-only**: すべてのテーブルで UPDATE / DELETE しない。変更は新 revision の INSERT で表現
- **Bi-temporal**: append-only テーブルは `valid_from/valid_to`（業務時間）+ `created_at`（システム時間）を持つ。将来の変更の事前登録、過去の誤りの遡及修正に対応
- **業務状態は可逆、監査証跡は不変**: 業務状態（is_active, status 等）は新 revision の INSERT でいつでも変更可能。監査証跡（created_at, created_by, 過去の revision）は不変。唯一の例外はプラットフォームマスタの廃止（不可逆）
- **ID は UUID**: SERIAL は使わない。並び順は created_at で管理
- **Identity / Display 分離**: revision を持つテーブルは、不変の内部キー（identity — 他テーブルからの参照先）と、ユーザーが編集可能な表示用コード（display）を分離する。カラム名はテーブルごとに意味を優先し、構造上の役割は列コメント `[identity]` / `[display]` で示す。display の一意性は App 層が current_* ビュー上で検証する
- **参照整合性は App 層で保証**: append-only テーブルの identity キーは revision をまたいで重複するため、DB レベルの REFERENCES は使わない。App 層の API が INSERT 時に存在チェックを行う。ただし journal 系テーブル間の UUID/PK 参照（journal → journal_header, journal_line → journal 等）は append-only と競合しないため REFERENCES を使用する
- **API は CRUD を提供**: 呼び出し元は append-only / bi-temporal を意識しない。API が CRUD → append-only INSERT に変換する
- **マルチテナント**: テナント単位でデータを分離する。`tax_class` のみグローバル（プラットフォーム管理のため全テナント共通）。他のすべてのテーブルは `tenant_id UUID NOT NULL` を持つ
- **監査証跡**: すべてのテーブルに `created_by UUID NOT NULL`（操作者）を持つ。append-only モデルにより各 INSERT が監査イベントとなり、「誰が・いつ・何を」が自動的に記録される。ユーザー管理は外部（認証基盤）の責務で、DB は UUID を受け取るのみ
- **データ分類**: すべてのテーブルをマスタ/トランザクションに分類し、マスタはさらにプラットフォーム/テナント/アドミン/ユーザーに区分。区分ごとにライフサイクルポリシーを定義（詳細は「データ分類とライフサイクル」セクション）
  - **プラットフォーム**（platform 権限）: `tax_class` — 税法で定義。グローバル。廃止は不可逆。プラットフォーム運営者が API 経由で管理（コードデプロイ不要）
  - **テナント**（tenant 権限）: `tenant_setting` — テナント全体に影響する設定（locked_until 等）。アドミンが操作
  - **アドミン**（admin 権限）: `account`, `department`, `fiscal_period`, `account_mapping`, `payment_mapping` — 組織構造・設定。すべての状態変更が可逆
  - **ユーザー**（user 権限）: `tag`, `counterparty` — 日常業務で随時追加。無効化⇔復元可能
  - **トランザクション**: `journal_*` — journal_type と tenant_setting.locked_until で操作可否を制御
- **命名規約**:
  - 業務日付: `posted_date`
  - 自由記述: `description`
  - 他テーブル参照: `{テーブル名}_code`（例: `account_code`）— 参照先は identity フィールド（不変）
  - 他テーブル UUID 参照: `{テーブル名}_id`（例: `journal_id`）
  - 略称は使わない（`dept` → `department`, `memo` → `description`）
  - 真偽値フラグ: `is_` プレフィクス + `BOOL NOT NULL DEFAULT {true|false}`
  - 日付: すべて `TIMESTAMPTZ`。業務日付はデフォルト `now()::date::timestamptz`（当日 00:00:00）
  - bi-temporal: `valid_from TIMESTAMPTZ NOT NULL DEFAULT now()` / `valid_to TIMESTAMPTZ`

---

## データ分類とライフサイクル

### 分類

すべてのテーブルをマスタ/トランザクションに分類し、マスタはさらに権限区分で細分する。

| 分類 | 権限区分 | テーブル | tenant_id |
|------|---------|---------|:---------:|
| マスタ | プラットフォーム | tax_class | なし（グローバル） |
| マスタ | テナント | tenant_setting | あり |
| マスタ | アドミン | account, department, fiscal_period, account_mapping, payment_mapping | あり |
| マスタ | ユーザー | tag, counterparty | あり |
| トランザクション | — | journal_header, journal, journal_line, journal_tag, journal_attachment | あり |

### ライフサイクルポリシー

**原則: 業務状態は可逆、監査証跡は不変**

- 業務状態（is_active, status 等）は新 revision の INSERT でいつでも変更可能
- 監査証跡（created_at, created_by, 過去の revision 自体）は不変
- append-only モデルがこれを自動的に保証する

| 操作 | PF | テナント | アドミン | ユーザー | トランザクション |
|------|:--:|:-------:|:------:|:------:|:--------------:|
| 作成 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 更新 | ✓（改定） | ✓ | ✓ | ✓ | ✓（rev+1） |
| 無効化 | ✓（廃止） | — | ✓ | ✓ | ✓（is_active=false） |
| 復元 | **✗** | — | ✓ | ✓ | ✓ |
| 失効(EXPIRE) | **✗** | — | ✓ | ✗ | ✗ |
| ロック解除 | — | ✓ | — | — | — |

### 分類ごとの詳細

- **プラットフォームマスタ** (`tax_class`): 税法で定義される区分体系。プラットフォーム運営者が API 経由で管理する（コードデプロイ不要・データ操作のみ）。廃止は不可逆（税法上、廃止された区分が復活するケースはない）。テナント非依存
- **テナント設定** (`tenant_setting`): テナント全体に影響する設定。現在は `locked_until`（確定制御）のみ。将来の拡張用に独立テーブル化
- **アドミンマスタ**: 組織構造（account, department）・期間管理（fiscal_period）・変換ルール（account_mapping, payment_mapping）。すべての状態変更が可逆。失効（EXPIRE: valid_to 設定で current_* ビューから除外）が可能
- **ユーザーマスタ**: 無効化⇔復元が可能。失効はアドミン操作（ユーザーには許可しない）
- **トランザクション**: テーブルレベルの権限区分は不要。journal_type と tenant_setting.locked_until で操作可否を制御
  - `normal`, `auto`: ユーザー操作。posted_date が locked_until より後のとき
  - `closing`, `prior_adj`: アドミン操作
- **journal_attachment**: 追加のみ。削除不可（電子帳簿保存法の証憑保管義務）

**唯一の不可逆操作**: プラットフォームマスタの廃止。それ以外のすべての業務状態変更は可逆。

### アクセス制御マトリクス

| 対象 | PF | テナント | アドミン | ユーザー |
|------|:--:|:------:|:------:|:------:|
| tax_class 書込 | ✓ | ✗ | ✗ | ✗ |
| tax_class 読取 | ✓ | ✓ | ✓ | ✓ |
| tenant_setting 書込 | — | ✓ | ✗ | ✗ |
| アドミンマスタ 書込 | — | — | ✓ | ✗ |
| アドミンマスタ 読取 | — | ✓ | ✓ | ✓ |
| ユーザーマスタ 書込 | — | — | ✓ | ✓ |
| 仕訳 (normal/auto) | — | — | ✓ | ✓ |
| 仕訳 (closing/prior_adj) | — | — | ✓ | ✗ |
| 監査証跡（過去 revision） | ✓ | ✓ | ✓ | ✗ |
| locked_until 変更 | — | ✓ | ✗ | ✗ |

### 監査の境界

- **アプリケーション内の操作**（created_by で記録）: 監査対象。すべてのロールの操作が append-only で記録される
- **開発者の操作**（DB 直接アクセス・DDL 実行等）: 監査対象外。サービス提供者側の運用管理の範疇であり、アプリケーションの監査モデルには含めない
- サービスは**監査可能性**を提供する。信頼性の担保はサービス提供者の運用品質に依存する別次元の問題

### 拡張性

現在のライフサイクルは CRUD + 無効化/復元/失効で構成される。将来的に承認ワークフロー等の新しいビジネスイベントが必要になった場合、同じ append-only パターンで拡張できる（例: journal に `approval_status` を追加し、承認/差戻を新 revision INSERT で表現）。テーブル構造の変更ではなく、状態フィールドと API 層の操作追加で対応する設計。

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

-- journal と tag の N:N 中間テーブル（タグは仕訳単位で付与）
CREATE TABLE journal_tag (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  journal_id      UUID NOT NULL REFERENCES journal(id),
  tag_code        TEXT NOT NULL,          -- → tag.code [identity]
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
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

**設計判断:**

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
- **均衡制約は DB 層**: Constraint Trigger（DEFERRABLE INITIALLY DEFERRED）で `SUM(amount) = 0` を保証（issue #5）。行単位の検証（side と amount 符号の整合等）は App 層
- **account.sign は account_type と独立**: 口座残高 = `SUM(amount) * account.sign`。控除科目（貸倒引当金=資産だが貸方正 sign=+1、自己株式=純資産だが借方正 sign=-1）に対応するため、admin が口座ごとに設定。account_type からの自動導出はしない

**仕訳の例: 食品100円(税8%) + 物品100円(税10%) を現金で購入**

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

**バージョン管理の例: 仕訳の編集**

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

## 帳票（すべてクエリで導出・current_journal ビュー経由）

残高サマリのキャッシュテーブルは持たない。すべて journal_line からクエリで導出する。
パフォーマンスが必要になった時点で PostgreSQL MATERIALIZED VIEW を検討する。

| 帳票 | データソース |
|------|------------|
| 仕訳帳 | current_journal + journal_line |
| 総勘定元帳 | journal_line WHERE account_code = ? (current_journal 経由) |
| タグ別元帳 | current_journal JOIN journal_tag WHERE tag_code = ? → journal_line |
| 合計残高試算表 | current_journal 経由の journal_line を account_code, department_code で集計 |
| 貸借対照表 | 上記のうち account_type IN (asset, liability, equity) |
| 損益計算書 | 上記のうち account_type IN (revenue, expense) |
| 部門別損益 | 上記を department_code で GROUP BY |
| 消費税集計 | journal_line WHERE tax_class_code IS NOT NULL GROUP BY tax_class_code で集計。税額は同一 line_group 内の仮払/仮受消費税行から取得 |
| 仕訳の編集履歴 | journal WHERE idempotency_code = ? ORDER BY revision（監査用） |
| 削除済み仕訳一覧 | journal WHERE is_active = false（欠番の確認用） |

---

## 勘定奉行 CSV エクスポート（App 層の責務）

```
current_journal + journal_line
  → line_group で行をグルーピング
  → 各グループ内の仮払消費税行から税額を取得
  → 費用/資産の本体行の journal_line.tax_class_code から税区分コードを取得
  → 借方/貸方ペアに変換
  → OBC受入形式 CSV（Shift-JIS）生成
```

---

## 年度繰越処理

1. `journal_type = 'closing'` の仕訳で収益/費用を繰越利益剰余金に振り替え
2. `period_no = 13`（決算整理期間）にこの仕訳を計上
3. 新年度の期首残高は B/S 勘定（asset, liability, equity）の journal_line 累積で導出
4. fiscal_period.status の遷移: `open` ⇔ `closed`（月次締め）⇔ `finalized`（年度確定）。すべての遷移はアドミンが可逆（新 revision INSERT で状態を戻せる。変更履歴は監査証跡に残る）

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
