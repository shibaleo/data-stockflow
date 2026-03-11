# data-stockflow スキーマ設計

## 設計方針

- 業務会計ソフト（勘定奉行クラス）の機能を念頭にスキーマを設計する
- 内部で複式簿記を行わない。事実 + マッピングルールを DB に格納し、仕訳は App 層が導出する
- 在庫管理も同じ原則（事実記録 → 残高導出）

---

## 1. マスタ系

### 会計期間

```sql
fiscal_period(
  id          SERIAL PRIMARY KEY,
  fiscal_year INT NOT NULL,
  period_no   INT NOT NULL,           -- 1〜12（月次）, 13=決算整理期間
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_locked   BOOL DEFAULT false,     -- 月次締め
  status      TEXT DEFAULT 'open'     -- open / closed / finalized
)
```

### 勘定科目

```sql
account(
  code          TEXT PRIMARY KEY,      -- 3〜4桁（文字列）
  name          TEXT NOT NULL,
  account_type  TEXT NOT NULL,         -- asset / liability / equity / revenue / expense
  balance_side  TEXT NOT NULL,         -- debit / credit
  default_tax_class TEXT,              -- デフォルト消費税区分コード
  requires_sub  BOOL DEFAULT false,    -- 補助科目必須フラグ
  is_active     BOOL DEFAULT true
)

sub_account(
  account_code  TEXT REFERENCES account(code),
  code          TEXT,                  -- 1〜4桁
  name          TEXT NOT NULL,
  counterparty_id TEXT,                -- 取引先紐付け（売掛/買掛用）
  PRIMARY KEY (account_code, code)
)
```

### 部門

```sql
department(
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_code TEXT REFERENCES department(code),
  dept_type   TEXT,                    -- statutory / management
  is_active   BOOL DEFAULT true
)
```

### 消費税区分

```sql
tax_class(
  code              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  tax_rate          NUMERIC(5,4),      -- 0.10 / 0.08 / 0.00
  is_reduced        BOOL DEFAULT false,-- 軽減税率
  direction         TEXT,              -- purchase / sale
  is_taxable        BOOL,
  deduction_ratio   NUMERIC(5,4),      -- 1.0 / 0.8 / 0.5（経過措置）
  invoice_type      TEXT               -- qualified / transitional_80 / transitional_50 / none
)
```

### 取引先

```sql
counterparty(
  id                        TEXT PRIMARY KEY,
  name                      TEXT NOT NULL,
  qualified_invoice_number  TEXT,       -- T+13桁（適格請求書発行事業者番号）
  is_qualified_issuer       BOOL DEFAULT false
)
```

---

## 2. トランザクション系

### 仕訳

```sql
journal(
  id                BIGSERIAL PRIMARY KEY,
  posted_date       DATE NOT NULL,
  fiscal_period_id  INT REFERENCES fiscal_period(id),
  journal_type      TEXT DEFAULT 'normal', -- normal / closing / prior_adj / auto
  description       TEXT,
  counterparty_id   TEXT REFERENCES counterparty(id),
  idempotency_key   TEXT UNIQUE,
  created_at        TIMESTAMPTZ DEFAULT now()
)

journal_line(
  id                BIGSERIAL PRIMARY KEY,
  journal_id        BIGINT NOT NULL REFERENCES journal(id),
  line_no           INT NOT NULL,
  side              TEXT NOT NULL,         -- debit / credit
  account_code      TEXT NOT NULL REFERENCES account(code),
  sub_account_code  TEXT,
  department_code   TEXT REFERENCES department(code),
  amount            NUMERIC(15,0) NOT NULL,
  tax_class_code    TEXT REFERENCES tax_class(code),
  tax_amount        NUMERIC(15,0) DEFAULT 0,
  description       TEXT,
  UNIQUE(journal_id, line_no)
)
```

### マッピングルール（事実 → 仕訳の導出用）

```sql
-- カテゴリ → 勘定科目の変換ルール
account_mapping(
  id                SERIAL PRIMARY KEY,
  source_system     TEXT NOT NULL,        -- 'zaim' / 'manual' / 'bank'
  source_field      TEXT NOT NULL,        -- 'genre' / 'category'
  source_value      TEXT NOT NULL,        -- '食料品' / '交通'
  account_code      TEXT NOT NULL REFERENCES account(code),
  sub_account_code  TEXT,
  side              TEXT NOT NULL,        -- debit / credit
  tax_class_code    TEXT REFERENCES tax_class(code),
  UNIQUE(source_system, source_field, source_value, side)
)

-- 決済手段 → 勘定科目（貸方）
payment_mapping(
  id                SERIAL PRIMARY KEY,
  source_system     TEXT NOT NULL,
  payment_method    TEXT NOT NULL,        -- 'cash' / 'credit_card' / 'suica'
  account_code      TEXT NOT NULL REFERENCES account(code),
  sub_account_code  TEXT,
  UNIQUE(source_system, payment_method)
)
```

---

## 3. 在庫系

```sql
-- 在庫イベント（事実）
inventory_event(
  id          BIGSERIAL PRIMARY KEY,
  date        DATE NOT NULL,
  item_code   TEXT NOT NULL,
  quantity    NUMERIC NOT NULL,        -- 正=入庫, 負=出庫
  unit        TEXT NOT NULL,           -- piece / g / ml
  event_type  TEXT NOT NULL,           -- purchase / consume / waste / adjust
  unit_cost   NUMERIC,                -- 取得単価（FIFO/AVG 用）
  memo        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
)

-- 在庫残高 = SELECT item_code, SUM(quantity) FROM inventory_event GROUP BY item_code

-- 栄養変換比率
nutrition_ratio(
  item_code   TEXT NOT NULL,
  nutrient    TEXT NOT NULL,           -- KCAL / CARB_G / PROTEIN_G / FAT_G / SALT_G
  per_unit    NUMERIC NOT NULL,        -- 1単位あたりの栄養量
  PRIMARY KEY (item_code, nutrient)
)

-- 栄養摂取量 = inventory_event(consume) JOIN nutrition_ratio で導出
```

---

## 4. 固定資産系

```sql
fixed_asset(
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  asset_account_code  TEXT REFERENCES account(code),
  department_code     TEXT REFERENCES department(code),
  category            TEXT,               -- 建物 / 車両 / 器具備品 / ソフトウェア 等
  acquired_date       DATE NOT NULL,
  disposed_date       DATE,
  status              TEXT DEFAULT 'active' -- active / disposed / sold
)

-- 償却ルール（会計基準ごと）
depreciation_rule(
  asset_id            TEXT REFERENCES fixed_asset(id),
  basis               TEXT,               -- tax / gaap / ifrs
  acquisition_cost    NUMERIC(15,0),
  residual_value      NUMERIC(15,0),
  useful_life_months  INT,
  method              TEXT,               -- straight_line / 200db / 250db / bulk_3yr / non_depreciable
  PRIMARY KEY (asset_id, basis)
)

-- 月次償却実績
depreciation_record(
  asset_id            TEXT,
  basis               TEXT,
  fiscal_period_id    INT REFERENCES fiscal_period(id),
  amount              NUMERIC(15,0),
  book_value          NUMERIC(15,0),
  PRIMARY KEY (asset_id, basis, fiscal_period_id)
)
```

---

## 5. 管理会計系

```sql
budget(
  id              SERIAL PRIMARY KEY,
  fiscal_year     INT NOT NULL,
  version         INT NOT NULL,        -- 1=当初, 2=修正1, 3=修正2
  name            TEXT,
  is_active       BOOL DEFAULT true
)

budget_line(
  budget_id       INT REFERENCES budget(id),
  account_code    TEXT REFERENCES account(code),
  department_code TEXT REFERENCES department(code),
  period_no       INT,                 -- 1〜12
  amount          NUMERIC(15,0),
  PRIMARY KEY (budget_id, account_code, department_code, period_no)
)

-- 配賦ルール
allocation_rule(
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  from_dept       TEXT REFERENCES department(code),
  to_dept         TEXT REFERENCES department(code),
  basis           TEXT,                -- amount / headcount / hours
  ratio           NUMERIC(5,4)
)
```

---

## 6. 集計系（高速化用）

```sql
-- 月次残高サマリ（帳票生成の高速化）
period_balance(
  fiscal_period_id  INT REFERENCES fiscal_period(id),
  account_code      TEXT REFERENCES account(code),
  sub_account_code  TEXT,
  department_code   TEXT,
  debit_total       NUMERIC(15,0) DEFAULT 0,
  credit_total      NUMERIC(15,0) DEFAULT 0,
  PRIMARY KEY (fiscal_period_id, account_code, COALESCE(sub_account_code,''), COALESCE(department_code,''))
)
```

---

## 帳票（すべてクエリで導出）

| 帳票 | データソース |
|------|------------|
| 仕訳帳 | journal + journal_line |
| 総勘定元帳 | journal_line WHERE account_code = ? |
| 補助元帳 | journal_line WHERE account_code + sub_account_code = ? |
| 合計残高試算表 | period_balance の集計 |
| 貸借対照表 | period_balance WHERE account_type IN (asset, liability, equity) |
| 損益計算書 | period_balance WHERE account_type IN (revenue, expense) |
| 部門別損益 | period_balance GROUP BY department_code |
| 予算実績対比 | budget_line LEFT JOIN period_balance |
| 消費税集計 | journal_line GROUP BY tax_class_code |
| 在庫残高 | SUM(inventory_event.quantity) GROUP BY item_code |
| 栄養摂取量 | inventory_event(consume) JOIN nutrition_ratio |

---

## 勘定奉行 CSV エクスポート（App 層の責務）

```
journal + journal_line + account_mapping
  → 借方/貸方ペアに変換
  → 科目コード・税区分・部門コード付与
  → OBC受入形式 CSV（Shift-JIS）生成
```

これはスキーマではなく App 層のロジック。
