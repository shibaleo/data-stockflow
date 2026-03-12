# 設計方針 — 会計口座モデルによる残高管理

## 設計決定

### 経緯

1. beanpost（gerdemb/beanpost）の PG スキーマを検証
2. 勘定奉行 I/O フォーマットとの差分を分析
3. companion テーブルで差分を吸収する案を検討
4. **根本的な問い**: 内部で複式簿記をする必要があるか？
5. 業界の実装パターンを調査（SAP, Odoo, freee 等）
6. **設計パターンの汎用化**: 会計・在庫・栄養は「口座の残高管理」として同じパターンで設計できる
7. **スキーマは会計に特化**: パターンは共通だがテーブルは分離。在庫・栄養は同じ設計パターンを別テーブル群にコピーして実現する

### 結論

> account（口座）= 勘定科目。残高 = 仕訳行の累積。
> 税区分は仕訳行のプロパティ。同一口座でも取引ごとに税区分が異なりうる。
> 仕訳単位の貸借均衡を API が検証する。
> 在庫・栄養等の別ドメインは、同じ設計パターン（append-only, bi-temporal, CRUD API）を別テーブル群で実現する。

### beanpost を採用しない理由

- beancount の PG 移植。個人の英語圏家計簿が出自
- 日本の税務会計（消費税・部門・補助科目・決算）の概念が一切ない
- 差分を companion テーブルで継ぎ足すと、継ぎ足しが本体より大きくなる
- transaction に date がない等、設計上の癖がある

---

## アーキテクチャ

### コアモデル

```
account（勘定科目）
  現金, 食費, 売掛金, 仮払消費税, ...
  残高 = journal_line の累積（仕訳単位で貸借均衡）
```

### DB と API の責務

```
DB（append-only, bi-temporal）
  マスタ ← 口座・税区分・部門・取引先・マッピングルール（すべて append-only, bi-temporal）
  トランザクション ← journal / journal_line（append-only）
  集計 ← すべて journal_line からクエリで導出（キャッシュテーブルなし）

API 層（CRUD → append-only 変換）
  呼び出し元に RESTful CRUD を提供し、内部で append-only INSERT に変換する。
  呼び出し元は bi-temporal を意識する必要がない。
  必要なときは as_of / effective_date パラメータで時間軸にアクセス可能。

  API の責務:
    CRUD → append-only INSERT への変換（revision 自動採番）
    参照整合性の検証（code の存在チェック）
    バランス検証（仕訳の貸借一致）
    確定制御（fiscal_period の status 確認）
    伝票番号の採番

API の呼び出し元の責務
  仕訳の生成（ルール適用・税額計算）
  CSV 等のフォーマット変換
  バッチ連携（zaim、銀行 API 等）
```

### 設計原則

1. **会計特化、パターンは汎用**: スキーマは会計に特化。在庫・栄養等は同じ設計パターンを別テーブル群で実現する
2. **Append-only + Bi-temporal**: すべてのテーブルで INSERT のみ。変更は新 revision で表現。UPDATE / DELETE は行わない。`valid_from/valid_to`（業務時間 TIMESTAMPTZ）+ `created_at`（システム時間）の二時間軸で管理。将来変更の事前登録・過去の遡及修正に対応
3. **確定前は編集可能、確定後は不変**: fiscal_period の状態で制御
4. **仕訳単位の貸借均衡**: API が受け取り時に検証。DB 全体の検証は不要（個々が均衡していれば総和も均衡）
5. **税区分は仕訳行のプロパティ**: 同一口座でも取引ごとに税区分が異なりうるため journal_line で保持。消費税額は仮払/仮受消費税口座への通常の記入。デフォルト値はマッピングルール層（呼び出し元）が付与

### やらないこと（DB のスコープ外）

- 仕訳の生成ロジック（マッピングルールの適用は呼び出し元の責務）
- DB レベルでのバランス検証（API の受け取り時検証で十分）
- beanpost / beancount 互換性
- 多通貨対応（将来対応予定、当面は日本円のみ）
- 在庫管理・栄養管理（同じ設計パターンを別テーブル群で実現）
- 固定資産管理・管理会計（予算・配賦）

---

## 仕訳のバージョン管理

### Append-only モデル

- journal / journal_line は INSERT のみ。UPDATE / DELETE は行わない
- 編集は新しい revision を API に POST する。旧 revision はそのまま残る（監査証跡）
- `current_journal` ビューで最新版のみ参照

### 冪等性の保証

`journal.idempotency_key` + `revision` で同一論理仕訳の版を管理する。

```
idempotency_key の命名は呼び出し元が決定する。DB は一意性のみを保証。
例: zaim:12345, manual:2024-03-15-001, bank:stmt-20240315-003
```

### 確定制御

- `fiscal_period.is_locked = true` → 新 revision の INSERT を API が拒否
- `fiscal_period.status = 'finalized'` → 完全に不変

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
| `cost_basis_fifo/lifo/avg` | 原価基準計算 | 在庫の原価管理に流用可能 |
| `account_hierarchy` ビュー（再帰CTE） | 階層集計 | 口座の階層集計に応用可能 |

### 流用しないもの

| 関数/構造 | 理由 |
|----------|------|
| `transaction_is_balanced()` | バランス検証は App 層で行う |
| `posting` テーブル構造 | 行モデル（side + 正の金額）を採用 |
| `assertion` テーブル | 残高検証は集計クエリで代替 |
| `transaction` テーブル（date なし） | 設計が不自然 |
| `amount` 型 `(number, currency)` | 多通貨は当面対応しない |
| `market_price()` | 同上 |

### beanpost 基本情報

- リポジトリ: https://github.com/gerdemb/beanpost
- スキーマ: schema.sql（1329行、テーブル7、関数27、集計9）
- ライセンス: GPL-3.0
- 最終更新: 2024-04-29（以降開発停止）
- 作者の React + PostGraphile UI は非公開
