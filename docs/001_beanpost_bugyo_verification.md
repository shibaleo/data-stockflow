# 会計・在庫の設計方針 — 事実からの導出モデル

## 設計決定: beanpost 不採用・複式簿記は導出する

### 経緯

1. beanpost（gerdemb/beanpost）の PG スキーマを検証
2. 勘定奉行 I/O フォーマットとの差分を分析
3. companion テーブルで差分を吸収する案を検討
4. **根本的な問い**: 内部で複式簿記をする必要があるか？

### 結論

> 複式簿記は概念上のシステムであり、出力フォーマットである。
> 事実を正しく記録し、マッピングルールが正しければ、仕訳は導出できる。
> DB は事実とルールの格納に徹し、仕訳生成・CSV 変換は App 層の責務。

### beanpost を採用しない理由

- beancount の PG 移植。個人の英語圏家計簿が出自
- 日本の税務会計（消費税・部門・補助科目・決算）の概念が一切ない
- 差分を companion テーブルで継ぎ足すと、継ぎ足しが本体より大きくなる
- transaction に date がない等、設計上の癖がある
- 内部で複式簿記を強制する必要がそもそもない

---

## アーキテクチャ

```
DB（Neon）
  事実テーブル ← 既存 DWH（fct_zaim 等）+ 手入力
  マッピングルール ← カテゴリ→勘定科目、決済手段→勘定科目、税区分
  在庫テーブル ← 入庫/出庫の事実記録

App 層
  ルール適用 → 複式簿記仕訳の導出（借方/貸方ペア生成）
  残高計算 → SUM(入庫) - SUM(出庫)
  フォーマット変換 → 勘定奉行 OBC受入形式 CSV 等
```

### DB の責務

- 事実の記録（何を・いつ・いくら・どこで・どの決済手段で）
- マッピングルールの保持（カテゴリ→科目コード、税区分等）
- 在庫の事実記録（入庫・出庫イベント）

### App 層の責務

- マッピングルールを事実に適用して仕訳を導出
- 税額計算（本体 × 税率、端数処理）
- CSV 等のフォーマット変換（Shift-JIS、OBC受入記号付与）
- 残高の導出（集計クエリ）

### やらないこと

- DB レベルでの貸借一致検証（ルールが正しければ定義上均衡する）
- posting の片側/両側モデルの議論（内部に仕訳構造を持たない）
- beanpost / beancount 互換性

---

## マッピングルール設計

### 勘定科目マッピング

```sql
-- カテゴリ → 勘定科目コードの変換ルール
account_mapping(
  id,
  source_category  TEXT,    -- DWH のカテゴリ値 e.g. 'food', '食料品'
  source_field     TEXT,    -- どのカラムの値か e.g. 'zaim_genre'
  account_code     TEXT,    -- 勘定科目コード e.g. '731'（食費）
  account_name     TEXT,    -- 参照用 e.g. '食費'
  sub_account_code TEXT,    -- 補助科目コード（NULL = なし）
  side             TEXT     -- 'debit' | 'credit'
)
```

### 決済手段マッピング

```sql
-- 決済手段 → 勘定科目（貸方）
payment_method_mapping(
  id,
  payment_method   TEXT,    -- e.g. 'cash', 'credit_card', 'suica'
  account_code     TEXT,    -- e.g. '100'（現金）, '210'（未払金）
  account_name     TEXT     -- 参照用
)
```

### 税区分マッピング

```sql
-- カテゴリ × 取引種別 → 税区分
tax_mapping(
  id,
  source_category  TEXT,    -- e.g. 'food'
  transaction_type TEXT,    -- 'purchase' | 'sale' | 'exempt'
  tax_category     TEXT,    -- 奉行の税区分コード
  tax_rate         NUMERIC, -- 10.0 / 8.0 / 0.0
  reduced_rate     BOOLEAN  -- 軽減税率フラグ
)
```

---

## 在庫管理

在庫も同じ原則: 事実（入庫・出庫）を記録し、残高は導出する。

```sql
-- 在庫イベント（事実）
inventory_event(
  id,
  date        DATE,
  item_code   TEXT,         -- e.g. 'MONSTER-RR', 'EGG'
  quantity    NUMERIC,      -- 正=入庫, 負=出庫
  unit        TEXT,         -- e.g. 'piece', 'g', 'ml'
  event_type  TEXT,         -- 'purchase' | 'consume' | 'waste' | 'adjust'
  memo        TEXT
)

-- 在庫残高 = SELECT item_code, SUM(quantity) FROM inventory_event GROUP BY item_code

-- 栄養変換比率（companion）
nutrition_ratio(
  item_code   TEXT,         -- e.g. 'MONSTER-RR'
  nutrient    TEXT,         -- e.g. 'CARB_G', 'KCAL'
  per_unit    NUMERIC       -- 1単位あたりの栄養量
)

-- 栄養摂取量 = inventory_event(consume) × nutrition_ratio で導出
```

---

## 勘定奉行 I/O リファレンス

### OBC 受入形式（仕訳伝票データ）

| 区分 | 受入記号 | 項目 |
|------|---------|------|
| ヘッダ | OBCD001 | 伝票区切（`*` = 伝票先頭行） |
| | CSJS005 | 日付 |
| | CSJS100 | 摘要 |
| 借方 | CSJS200 | 部門コード |
| | CSJS201 | 勘定科目コード |
| | CSJS202 | 補助科目コード |
| | CSJS203 | 消費税区分コード |
| | CSJS213 | 本体金額 |
| | CSJS220 | 消費税率 |
| | CSJS222 | 税率種別（0=標準, 1=軽減） |
| 貸方 | CSJS301〜322 | 借方と同構造 |

- 文字コード: Shift-JIS / CSV / カンマ区切り
- 複合仕訳: `*` で伝票グループ化
- 仕様の詳細: 勘定奉行メニュー `[随時処理] > [汎用データ受入]` の一覧表
- 外部連携ソフト（invox, board, MakeLeaps）のドキュメントが事実上の公開仕様

---

## beanpost スキーマ調査記録（参考）

beanpost の検証で得た知見。将来 PL/pgSQL 関数を部分的に流用する可能性があるため残す。

### 流用候補

| 関数/型 | 用途 | 流用可能性 |
|---------|------|-----------|
| `amount` 型 `(number, currency)` | 金額 + 通貨のペア | 在庫管理で使える |
| `cost_basis_fifo/lifo/avg` | 原価基準計算 | 在庫の原価管理に流用可能 |
| `account_hierarchy` ビュー（再帰CTE） | 階層集計 | 勘定科目の階層集計に応用可能 |
| `market_price()` | 時価評価 | 為替換算に流用可能 |

### 流用しないもの

| 関数/構造 | 理由 |
|----------|------|
| `transaction_is_balanced()` | 仕訳は導出するため貸借検証不要 |
| `posting` テーブル構造 | 片側モデルは採用しない |
| `assertion` テーブル | 残高検証は集計クエリで代替 |
| `transaction` テーブル（date なし） | 設計が不自然 |

### beanpost 基本情報

- リポジトリ: https://github.com/gerdemb/beanpost
- スキーマ: schema.sql（1329行、テーブル7、関数27、集計9）
- ライセンス: GPL-3.0
- 最終更新: 2024-04-29（以降開発停止）
- 作者の React + PostGraphile UI は非公開
