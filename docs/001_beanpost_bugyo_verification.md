# beanpost 会計ロジック検証 & 勘定奉行 I/O 調和計画

## 目的

beanpost（gerdemb/beanpost）の PostgreSQL スキーマを Neon 上にデプロイし、
会計帳簿・在庫帳簿の基盤とする。本ドキュメントでは以下を整理する。

1. beanpost スキーマの会計ロジック検証
2. 勘定奉行 I/O フォーマットとの差分分析
3. 調和に向けた拡張計画

---

## 1. beanpost スキーマ概要

### カスタム型

| 型 | 定義 | 用途 |
|----|------|------|
| `amount` | `(number numeric, currency text)` | 金額 + 通貨。全テーブル・関数で使用 |
| `lot` | `(id int, amount, cost amount, date, label text)` | 原価基準追跡（FIFO/LIFO/AVG） |

### テーブル

| テーブル | 主要カラム | 備考 |
|---------|-----------|------|
| `account` | id, name, open_date, close_date, currencies[], meta | name はコロン区切り階層（`Assets:Bank:Checking`） |
| `transaction` | id, flag, payee, narration, tags, links | **date カラムなし**（posting 側に持つ） |
| `posting` | id, date, account_id, transaction_id, amount, price, cost, cost_date, cost_label, matching_lot_id | GENERATED ALWAYS（手動ID挿入不可） |
| `assertion` | id, date, account_id, amount | 残高検証（beancount balance directive） |
| `commodity` | id, date, currency, meta, decimal_places | 通貨/商品の定義。tolerance 計算に使用 |
| `price` | id, date, currency, amount | 市場価格 |
| `document` | id, date, account_id, data(bytea), filename | 添付書類 |

### ビュー

| ビュー | 用途 |
|--------|------|
| `account_hierarchy` | 再帰CTEで全階層レベルを展開（集計用） |
| `price_inverted` | 逆方向の価格変換を自動生成 |

### 主要関数（27個）

| カテゴリ | 関数 | 説明 |
|---------|------|------|
| 残高計算 | `account_change(account, daterange)` | 期間内の勘定変動額 |
| | `posting_balance(posting)` | posting の累計残高 |
| | `transaction_balance(transaction)` | 取引の貸借合計 |
| 検証 | `transaction_is_balanced(transaction)` | 貸借一致検証（tolerance 考慮） |
| | `assertion_is_balanced(assertion)` | 残高検証 |
| 原価基準 | `cost_basis_fifo/lifo/avg(posting[])` | FIFO/LIFO/平均原価 |
| | `inventory(posting[])` | 在庫ロット一覧 |
| 通貨変換 | `convert_currency(amount, amount)` | 為替換算 |
| | `market_price(amount, text, date)` | 時価評価 |
| tolerance | `tolerance(amount)` | commodity.decimal_places に基づく許容誤差 |

### カスタム集計（9個）

`sum(amount)`, `sum(posting)`, `cost_basis_fifo(posting)`, `cost_basis_lifo(posting)`,
`cost_basis_avg(posting)`, `inventory(posting)` 等。
SQL の `SELECT sum(p) FROM posting p` で複式簿記の合計が取れる。

---

## 2. 勘定奉行 I/O フォーマット

### OBC 受入形式（仕訳伝票データ）

勘定奉行のCSVインポートは「OBC受入形式」。伝票単位でグループ化される。

```
伝票区切(*),伝票区分,用途区分,部門指定,伝票部門CD,日付,摘要,
借方部門CD,借方科目CD,借方補助CD,借方税区分CD,...,借方本体金額,借方税率,借方税率種別,
貸方部門CD,貸方科目CD,貸方補助CD,貸方税区分CD,...,貸方本体金額,貸方税率,貸方税率種別
```

**主要項目（OBC受入記号）:**

| 区分 | 受入記号 | 項目 |
|------|---------|------|
| ヘッダ | OBCD001 | 伝票区切（`*` = 伝票の先頭行） |
| | CSJS005 | 日付 |
| | CSJS100 | 摘要（40〜200文字） |
| 借方 | CSJS200 | 部門コード |
| | CSJS201 | 勘定科目コード |
| | CSJS202 | 補助科目コード |
| | CSJS203 | 消費税区分コード |
| | CSJS213 | 本体金額 |
| | CSJS220 | 消費税率（0.0/3.0/5.0/8.0/10.0） |
| | CSJS222 | 税率種別（0=標準, 1=軽減） |
| 貸方 | CSJS301〜322 | 借方と同構造 |

**特徴:**

- **文字コード:** Shift-JIS
- **複合仕訳:** 伝票区切（`*`）で1伝票の先頭行を示す。以降の行は同一伝票
- **消費税:** 借方・貸方それぞれ独立した税区分・税率・軽減税率フラグ
- **部門:** 伝票レベル + 明細レベルの2階層
- **補助科目:** 勘定科目の下位分類。数値コード
- **勘定科目:** 数値コード体系（名称ではなくコードで指定）

---

## 3. 差分分析

### 構造マッピング

| 概念 | beanpost | 勘定奉行 | 差分 |
|------|---------|---------|------|
| 伝票 | `transaction` | 伝票（`*` でグループ） | **概念一致** |
| 明細行 | `posting` | CSV の1行（借方 + 貸方） | 奉行は1行に借方・貸方ペア。beanpost は片側ずつ |
| 日付 | `posting.date` | 伝票ヘッダの `CSJS005` | beanpost は posting 単位、奉行は伝票単位 |
| 勘定科目 | `account.name`（テキスト階層） | 数値コード | **要マッピングテーブル** |
| 補助科目 | account 階層の末端 | 独立コード（CSJS202/302） | beanpost では階層で表現 |
| 摘要 | `transaction.narration` | `CSJS100`（行単位） | beanpost は伝票単位、奉行は行単位 |
| 相手先 | `transaction.payee` | 取引先コード（CSJS208/308） | **要マッピング** |
| タグ | `transaction.tags` | なし | beanpost 固有 |
| リンク | `transaction.links` | なし | beanpost 固有 |
| メタデータ | `account.meta` (JSON) | なし | beanpost 固有 |

### 重大な差分（Gap）

#### Gap 1: 消費税処理 — beanpost に存在しない

beanpost には税の概念が一切ない。勘定奉行は明細行ごとに借方・貸方それぞれ
消費税区分・税率・軽減税率を管理する。

**対応方針:** 税情報は posting レベルの拡張メタデータとして管理する。

```
方法A: posting テーブルに tax 関連カラムを追加（スキーマ拡張）
方法B: 別テーブル posting_tax(posting_id, side, tax_category, tax_rate, reduced_rate_flag)
方法C: posting の meta JSON に税情報を格納
```

→ **方法B を推奨。** beanpost 本体スキーマを汚さず、奉行連携に必要な情報を保持できる。

#### Gap 2: 部門 — beanpost に存在しない

勘定奉行は伝票レベル・明細レベルの部門コードを持つ。
beanpost の account 階層でも部門を表現できなくはないが、勘定科目と直交する軸。

**対応方針:**

```
方法A: account 名に部門を埋め込む（Assets:Sales:Bank:Checking — 汚い）
方法B: 別テーブル posting_department(posting_id, side, department_code)
方法C: transaction レベルの meta JSON に部門を格納
```

→ **方法B を推奨。** 部門は科目と直交するため、account 階層に混ぜるべきではない。

#### Gap 3: 勘定科目コード体系 — テキスト vs 数値

beanpost: `Expenses:Food:Drink`（テキスト、コロン区切り）
勘定奉行: `810`（数値コード）

**対応方針:** マッピングテーブルが必要。

```sql
account_code_mapping(
  account_id   INTEGER REFERENCES account(id),
  system_name  TEXT,     -- 'bugyo' | 'freee' | 'mf'
  external_code TEXT,    -- '810'
  external_name TEXT     -- '消耗品費'（参照用）
)
```

これにより beanpost の account 体系を維持しつつ、外部システムとのコード変換が可能。
将来 freee やマネーフォワードにも対応できる汎用構造。

#### Gap 4: 明細構造 — 片側 vs 両側

beanpost の posting は「片側」（借方 or 貸方が amount の符号で決まる）。
勘定奉行の CSV 行は「借方 + 貸方のペア」。

**対応方針:** エクスポート時に変換。

- 1:1 仕訳: posting 2行 → CSV 1行
- 1:N / N:1: 金額の大きい側を固定、相手科目を行ごとに変える
- N:N: 「諸口」（複合科目）を使って行を分割

これはエクスポートロジック（App 層）の責務。スキーマ変更不要。

#### Gap 5: 日付の粒度 — posting vs 伝票

beanpost は posting ごとに日付を持つが、勘定奉行は伝票単位。
通常は同一 transaction 内の posting は同一日付なので実用上問題なし。
エクスポート時に `MIN(posting.date)` を伝票日付とする。

### 差分のない項目（そのまま使える）

| 項目 | 説明 |
|------|------|
| 複式簿記の基本構造 | beanpost の transaction + posting ≒ 奉行の伝票 + 明細 |
| 複合仕訳 | beanpost は1 transaction に N posting。奉行の伝票区切に対応 |
| 残高検証 | beanpost の assertion ≒ 奉行の残高試算表突合 |
| 複数通貨 | beanpost の amount 型は通貨コード付き |
| 原価基準追跡 | beanpost は FIFO/LIFO/AVG 対応。在庫管理に直接使える |

---

## 4. 拡張スキーマ設計（案）

beanpost 本体の `schema.sql` には手を加えず、companion テーブルで拡張する。

```sql
-- ============================================================
-- 勘定奉行連携用 companion tables
-- accounting スキーマ内に配置
-- ============================================================

-- 外部会計システムとの科目コード対応表
CREATE TABLE account_code_mapping (
  id          INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES account(id),
  system_name TEXT NOT NULL,    -- 'bugyo_i' | 'bugyo_cloud' | 'freee' | 'mf'
  external_code TEXT NOT NULL,  -- 勘定奉行の科目コード e.g. '810'
  sub_code    TEXT,             -- 補助科目コード（NULL = なし）
  UNIQUE(account_id, system_name)
);

-- posting 単位の消費税情報
CREATE TABLE posting_tax (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  posting_id      INTEGER NOT NULL REFERENCES posting(id),
  tax_category    TEXT NOT NULL,     -- 奉行の税区分コード
  tax_rate        NUMERIC,           -- 10.0 / 8.0 / 5.0 / 0.0
  reduced_rate    BOOLEAN DEFAULT FALSE, -- 軽減税率フラグ
  tax_amount      public.amount,     -- 税額（自動計算 or 手入力）
  UNIQUE(posting_id)
);

-- posting 単位の部門情報
CREATE TABLE posting_department (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  posting_id      INTEGER NOT NULL REFERENCES posting(id),
  department_code TEXT NOT NULL,     -- 奉行の部門コード
  UNIQUE(posting_id)
);

-- 取引先マスタ
CREATE TABLE trading_partner (
  id    INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  code  TEXT NOT NULL UNIQUE,        -- 取引先コード
  name  TEXT NOT NULL                -- 取引先名
);

-- transaction と取引先の関連
CREATE TABLE transaction_partner (
  id              INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  transaction_id  INTEGER NOT NULL REFERENCES transaction(id),
  partner_id      INTEGER NOT NULL REFERENCES trading_partner(id),
  UNIQUE(transaction_id)
);
```

---

## 5. エクスポートフロー（beanpost → 勘定奉行 CSV）

```
beanpost (Neon)
  │
  │  SQL: transaction + posting + companion tables を JOIN
  │
  ▼
App 層（Hono / スクリプト）
  │
  │  1. posting ペアを借方/貸方の行に変換
  │  2. account_code_mapping で科目コードに変換
  │  3. posting_tax から税情報を付与
  │  4. posting_department から部門コードを付与
  │  5. 伝票区切（*）を先頭行に付与
  │  6. Shift-JIS エンコード
  │
  ▼
勘定奉行 OBC受入形式 CSV
```

---

## 6. 検証項目チェックリスト

### Phase 1: スキーマ検証（beanpost 単体）

- [ ] `schema.sql` を Neon にデプロイできるか
- [ ] `transaction_is_balanced()` が正しく貸借一致を検証するか
- [ ] `assertion_is_balanced()` が残高検証できるか
- [ ] 複数通貨（JPY + USD）の transaction が正しく処理されるか
- [ ] `cost_basis_fifo/lifo/avg` が在庫原価を正しく計算するか
- [ ] `account_hierarchy` ビューが集計に使えるか
- [ ] `market_price()` が時価評価できるか
- [ ] `posting.id` が GENERATED ALWAYS のため、dc_catalog からの参照方法を確認

### Phase 2: 勘定奉行調和

- [ ] companion テーブル（account_code_mapping, posting_tax, posting_department）をデプロイ
- [ ] 日本の標準勘定科目体系を account + account_code_mapping に投入
- [ ] テスト仕訳（消費税あり、軽減税率あり、複合仕訳）を投入
- [ ] 奉行 OBC 受入形式 CSV へのエクスポートスクリプトを作成
- [ ] 勘定奉行にインポートして突合

### Phase 3: 在庫帳簿検証

- [ ] 在庫スキーマ（inventory）に beanpost + food_nutrition_ratio をデプロイ
- [ ] commodity 定義（MONSTER-RR, CARB-G, KCAL 等）を投入
- [ ] 入庫・摂取・外食の仕訳パターンが正しく記録・集計されるか
- [ ] `inventory(posting)` 集計で食品在庫が取れるか

---

## 7. リスクと制約

| リスク | 影響 | 対策 |
|--------|------|------|
| beanpost の開発停止（2024-04以降更新なし） | バグ修正・機能追加が得られない | schema.sql をフォーク管理。PL/pgSQL なので自前修正可能 |
| posting.id が GENERATED ALWAYS | 外部からの ID 指定不可 | dc_catalog.record は posting.id（自動採番値）を dwh_row_id として記録 |
| 勘定奉行 API が非公開 | REST API 連携は困難 | CSV 受入形式（OBC受入形式）で対応。実務上十分 |
| beanpost に trigger なし | データ整合性は App 層の責務 | PostgREST + RLS で制約を補完するか、trigger を自前追加 |

---

## 参考情報

### beanpost

- リポジトリ: https://github.com/gerdemb/beanpost
- スキーマ: schema.sql（1329行、テーブル7、関数27、集計9）
- ライセンス: GPL-3.0
- 最終更新: 2024-04-29

### 勘定奉行 I/O

- OBC受入形式は Shift-JIS / CSV / カンマ区切り
- 汎用データ受入形式一覧表: 勘定奉行メニュー `[随時処理] > [汎用データ受入]` から取得
- 外部連携ソフト（invox, board, MakeLeaps）のドキュメントが事実上の公開仕様
- REST API: 奉行クラウド API version（要契約、仕様非公開）
