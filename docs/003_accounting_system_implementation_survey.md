# 会計システム内部実装パターン調査

> 調査日: 2026-03-11
> 目的: data-stockflow の「事実 + マッピングルール → 仕訳導出」アーキテクチャの位置づけを、
> 業界の実装パターンとの比較で明確にする。

---

## 1. データモデルの分類

会計システムの内部データモデルは、以下の4パターンに大別できる。

### A. 伝統的複式簿記モデル（Journal/Posting 中心）

仕訳帳（Journal）と元帳記入（Posting/Entry）を Source of Truth とする。
最も歴史が長く、商用・OSS を問わず圧倒的多数派。

| 採用システム | 特徴 |
|------------|------|
| SAP FI (ECC) | BKPF（伝票ヘッダ）+ BSEG（伝票明細）の 1:N 構造 |
| Oracle GL | GL_JE_BATCHES → GL_JE_HEADERS → GL_JE_LINES の 3層 |
| GnuCash | Transaction + Splits（2つ以上の Split で構成） |
| Odoo | account.move + account.move.line |
| ERPNext | Journal Entry + GL Entry |
| 勘定奉行 | 伝票ヘッダ + 仕訳行（非公開だが OBC 受入形式から推定可能） |
| 弥生会計 | 1行=1仕訳の CSV 形式（内部 DB は非公開） |
| マネーフォワード | 仕訳 API（journal）ベース |

**メリット**: 監査証跡が明確。会計の標準概念と直接対応。帳票生成が素直。
**デメリット**: 源泉となるビジネスイベントの意味が仕訳に変換された時点で失われがち。

### B. イベントソーシング型（事実記録 → 仕訳導出）

ビジネスイベント（取引事実）を Source of Truth とし、仕訳はルール適用で導出する。

| 採用システム | 特徴 |
|------------|------|
| Oracle Accounting Hub (SLA) | サブレジャー会計ルールでイベントから仕訳を自動生成 |
| freee（部分的） | 「取引」(deals) が事実。仕訳は取引から自動導出される |
| Mettle (NatWest) | Write Once Double Entry (WODE) パターン |
| **data-stockflow** | 事実 + マッピングルール → App 層で仕訳導出 |

**メリット**: ビジネスイベントの意味が保存される。ルール変更で仕訳を再導出可能。柔軟性が高い。
**デメリット**: 導出ロジックの正しさの保証が必要。パフォーマンス考慮が必要。一般的でないため経験者が少ない。

### C. REA モデル（Resources-Events-Agents）

William McCarthy（1982）が提唱。資源（Resources）・イベント（Events）・参加者（Agents）の
3要素でビジネスプロセスをモデル化する。

| 位置づけ | 特徴 |
|---------|------|
| 学術的モデル | 会計情報システムの教科書で標準的に教えられる |
| 実装例は限定的 | 純粋な REA のみで動く商用システムはほぼない |
| 影響は大きい | SAP, Oracle の設計思想に間接的に影響 |

REA の核心は「二重性（duality）」関係で、1つのイベント対（例: 販売 ←→ 入金）が
資源の増減として記録される。複式簿記はこの二重性の特殊な表現形式と位置づけられる。

**メリット**: ビジネスセマンティクスが最も豊かに表現される。
**デメリット**: 純粋な REA だけでは法定帳簿の生成に追加のマッピング層が必要。
実務上は「REA + バックグラウンドの GL」というハイブリッド構成になることが多い。

### D. ハイブリッド型

多くの商用 ERP は実質的にハイブリッド型を採用している。

| 採用システム | 構成 |
|------------|------|
| SAP S/4HANA | ビジネスドキュメント → Universal Journal (ACDOCA) に統合 |
| ERPNext | Sales Invoice/Purchase Invoice → GL Entry を自動生成 |
| Odoo | Invoice/Payment → account.move + account.move.line を自動生成 |
| freee | 取引(deals) + 振替伝票(manual_journals) の二重入口 |

大半の ERP は「ビジネスドキュメント（請求書・入金伝票等）を入力すると仕訳が自動生成される」
という構造を持ち、広義にはイベント→仕訳の導出を行っている。
ただし、生成された仕訳は DB に永続化され、以降は仕訳が Source of Truth として扱われる。

---

## 2. 仕訳の内部構造

### 片側モデル（Signed Amount）

1つの posting/entry 行に `account` と `amount`（符号付き金額）を持つ。
正の値がその勘定の自然な側（資産なら借方）、負の値が反対側を表す。

| 採用システム | 実装 |
|------------|------|
| GnuCash | Split: `account_guid` + `value`（符号付き）|
| Ledger/hledger | posting に符号付き金額。正=借方、負=貸方 |
| beancount | Posting: `account` + `units`（符号付き）|
| beanpost | posting テーブル: `number` + `currency`（符号付き）|

**利点**: データ構造が単純。SUM すればゼロになる不変量が自然に表現される。
**欠点**: 借方・貸方の概念が暗黙的。会計実務者には直感的でない。

### 両側モデル（Separate Debit/Credit）

各行に `debit` と `credit` の2つの金額カラムを持つ。一方のみが非ゼロ。

| 採用システム | 実装 |
|------------|------|
| Odoo | account.move.line: `debit` + `credit` カラム |
| Oracle GL | GL_JE_LINES: `entered_dr` + `entered_cr` |
| SAP (BSEG) | `SHKZG`(借方/貸方区分) + `DMBTR`(金額) |
| ERPNext | GL Entry: `debit` + `credit` + `debit_in_account_currency` + `credit_in_account_currency` |

**利点**: 会計実務者に直感的。帳票への変換が容易。借方合計・貸方合計の検証が素直。
**欠点**: 1行に1つしか意味のある値がない冗長性。SUM(debit) = SUM(credit) で検証する必要あり。

### 行モデル（Side カラム）

各行に `side`（debit/credit）と `amount`（常に正）を持つ。

| 採用システム | 実装 |
|------------|------|
| **data-stockflow** | journal_line: `side` TEXT + `amount` NUMERIC(15,0) |
| 勘定奉行 OBC 受入形式 | 借方項目群(CSJS2xx) と貸方項目群(CSJS3xx) が別カラム列 |

**利点**: 符号の解釈ミスがない。side を明示するため意図が明確。
**欠点**: 両側モデル同様、検証ロジックが必要。片側モデルほどの数学的シンプルさはない。

### 複合仕訳（3行以上）の扱い

| システム | 対応方法 |
|---------|---------|
| GnuCash | Transaction に 3つ以上の Split を持たせることで自然に対応 |
| Odoo | account.move に任意数の account.move.line を持たせる |
| ERPNext | GL Entry を複数行生成。Journal Entry はテーブルの子行で対応 |
| 弥生会計 | 複合仕訳対応。行モデルで、借方/貸方を行ごとに指定 |
| 勘定奉行 | `*` 記号で伝票をグループ化。伝票内に複数行を許容 |
| SAP | BSEG に複数行。S/4HANA の ACDOCA では最大999,999行 |
| Ledger/hledger/beancount | Transaction に複数 Posting を列挙（自然に複合仕訳） |
| **data-stockflow** | journal に複数の journal_line を紐付け |

全ての調査対象システムが複合仕訳に対応している。
ヘッダ + 明細行の 1:N 構造（あるいはテキストベースの Transaction 内複数 Posting）が普遍的。

---

## 3. Source of Truth の設計

### パターン A: 仕訳が Source of Truth（伝統的）

| システム | 説明 |
|---------|------|
| GnuCash | Transaction + Split がそのまま永続データ |
| Ledger/hledger/beancount | テキストファイルの journal がそのまま原本 |
| 弥生会計 | 仕訳帳が正本 |
| 勘定奉行 | 仕訳帳が正本 |

### パターン B: イベントが Source of Truth、仕訳は導出

| システム | 説明 |
|---------|------|
| Oracle Accounting Hub | サブレジャーイベントが源泉。Create Accounting プロセスで仕訳生成 |
| freee（取引モード） | 「取引」(deals) が源泉。仕訳は自動導出される |
| Mettle (WODE) | イベントが源泉。Double Entry イベントのみが残高を移動できる |
| **data-stockflow** | 事実テーブル + マッピングルールが源泉。仕訳は App 層で導出 |

### パターン C: ハイブリッド（大多数の商用 ERP）

| システム | 説明 |
|---------|------|
| SAP S/4HANA | ビジネスドキュメント→ACDOCA に仕訳として永続化。ACDOCA が Single Source of Truth |
| Odoo | Invoice → account.move を自動生成・永続化。以降は account.move が正本 |
| ERPNext | ドキュメント → GL Entry を自動生成・永続化 |
| マネーフォワード | 連携サービスからの入力→仕訳に変換・永続化 |

### 「導出した仕訳を永続化する」のは一般的か？

**非常に一般的**。むしろこれが商用 ERP の標準パターンである。

- SAP S/4HANA: ACDOCA テーブルに全ての仕訳行を永続化。これを Single Source of Truth と呼ぶ。
- Odoo: Invoice から account.move を生成し、DB に保存。
- ERPNext: ドキュメント submit 時に GL Entry を生成し、DB に保存。
- Oracle: Create Accounting プロセスで GL テーブルに永続化。

**キャッシュ管理（整合性確保）**:
- SAP: ドキュメント変更時は元伝票の reverse + 新伝票で対応（物理削除禁止）。
- Odoo: account.move の posted 状態変更時に再計算。ドラフト中のみ編集可能。
- ERPNext: ドキュメントの cancel → amend で対応。cancel 時に reverse GL Entry を生成。
- data-stockflow は仕訳を永続化しない方針（導出のみ）だが、period_balance テーブルで集計結果をキャッシュする設計になっている。

---

## 4. 残高管理

### リアルタイム計算（毎回 SUM で集計）

| システム | 方式 |
|---------|------|
| GnuCash | 原則はメモリ上のランニングバランスを保持。DB からは Split の SUM で計算 |
| Ledger/hledger/beancount | テキストファイルを毎回パースし、全 posting から計算 |
| **data-stockflow（在庫）** | `SUM(quantity) GROUP BY item_code` で毎回計算 |

### マテリアライズド残高（サマリテーブル）

| システム | 方式 |
|---------|------|
| SAP (ECC) | GLT0 等の合計テーブルに期間残高を保持。仕訳 post 時に更新 |
| SAP S/4HANA | ACDOCA に period 0 の残高繰越レコードを持ち、当年度の行のみ読めば残高算出可能 |
| ERPNext | Period Closing Voucher で期末に GL Entry を SUM し、P/L を B/S に振替 |
| **data-stockflow** | period_balance テーブルに月次の借方合計・貸方合計をキャッシュ |

### 両方を持つ場合の整合性管理

| システム | 方式 |
|---------|------|
| SAP (ECC) | 仕訳 post 時に「明細テーブル」と「合計テーブル」を同時更新（DB トランザクション） |
| SAP S/4HANA | 合計テーブルを廃止。HANA の高速集計で ACDOCA からリアルタイム算出に移行 |
| ERPNext | 帳票表示時は GL Entry の SUM で計算。Period Closing は期末バッチ処理 |
| Odoo | 帳票時にリアルタイム集計。キャッシュテーブルなし（Odoo 標準） |

### 商用システムの主流

**従来型 ERP（SAP ECC, Oracle EBS）**: マテリアライズド残高（合計テーブル）が主流だった。
大量データの SUM はパフォーマンス的に許容できなかったため。

**次世代 ERP（SAP S/4HANA）**: HANA のインメモリ DB 性能を活かし、合計テーブルを廃止。
ACDOCA からリアルタイムに集計する方向に移行。

**クラウド会計（freee, MF, 弥生）**: データ量が相対的に少ないため、リアルタイム集計で十分。

**data-stockflow の設計**: period_balance をキャッシュとして持つのは、
SAP ECC 以前の伝統的アプローチと同じ。ただし data-stockflow の場合は仕訳自体が導出なので、
period_balance は「導出結果のキャッシュのキャッシュ」になる点に留意。

---

## 5. 貸借一致の検証

### DB 制約で保証

| システム | 方式 |
|---------|------|
| TigerBeetle | データベースレベルで二重記入を強制。`debits_must_not_exceed_credits` 等のフラグ。転送は必ず equal and opposite な debit/credit のペア |
| beanpost | `transaction_is_balanced()` PL/pgSQL 関数で検証 |

### App 層（ORM/ビジネスロジック）で保証

| システム | 方式 |
|---------|------|
| Odoo | `_check_balanced()` メソッド（Python, @api.constrains）。account.move の create/write 時に SUM(debit) = SUM(credit) を検証。`check_move_validity=False` でバイパス可能 |
| ERPNext | `general_ledger.py` で GL Entry の精度ベース比較。debit/credit の小計を precision で丸めて検証 |
| GnuCash | エンジン層で Split ↔ Transaction の整合性を検証。Transaction 内の Split 合計がゼロになることを保証 |
| SAP | アプリケーション層でバランスチェック。BKPF/BSEG レベルで検証後 post |

### パース時に保証（テキスト会計ツール）

| システム | 方式 |
|---------|------|
| beancount | パーサが Transaction 読み込み時に全 posting の合計がゼロであることを検証。プラグインで追加検証 |
| hledger/Ledger | ファイル読み込み時に各 transaction の balance check。不均衡ならエラー |

### 検証しないシステム

| システム | 理由 |
|---------|------|
| **data-stockflow** | 仕訳を導出する設計のため、マッピングルールが正しければ定義上均衡する。DB レベルの貸借検証は不要と判断 |

### 業界のベストプラクティス

**App 層での検証が最も一般的**。DB 制約で保証するのは TigerBeetle のような特化型データベースに限られる。

理由:
1. 複数通貨対応時の丸め処理が必要（精度ベースの比較）
2. 税額の自動計算で端数が発生する場合の調整が必要
3. ドラフト状態では一時的に不均衡を許容したい場合がある（Odoo の `check_move_validity=False`）
4. CHECK 制約は同一テーブル内の検証しかできず、ヘッダ+明細の跨りテーブル検証は困難

data-stockflow の「ルールが正しければ均衡する」という設計判断は合理的だが、
ルールのテスト（全マッピングルール適用結果の貸借一致検証）は App 層で行うべきである。

---

## 6. 修正・取消の扱い

### 赤黒反対仕訳（Reversal）

| システム | 方式 |
|---------|------|
| SAP | FB08 で反対仕訳を生成。元伝票と反対仕訳が相互参照。**物理削除は禁止**。Normal reversal（借方→貸方に転記）と Negative posting（元の側で負の金額を転記）の2方式 |
| Oracle GL | Journal Reversal で反対仕訳を生成。元仕訳と参照紐付け |
| 勘定奉行 | 赤伝処理（反対仕訳）が標準 |
| Mettle (WODE) | イベントは不変（Write Once）。修正は常に新しい反対イベントで行う |
| Martin Fowler | Reversal Adjustment パターン: 誤った仕訳を残し、反対仕訳で打消し、正しい仕訳を追加 |

### 物理削除 + 再生成

| システム | 方式 |
|---------|------|
| Odoo（ドラフト状態） | ドラフト中は自由に編集・削除可能。posted 後は取消（反対仕訳）で対応 |
| ERPNext | Cancel → Amend のワークフロー。Cancel で reverse GL Entry 生成後、修正版を新規作成 |

### 論理削除

| システム | 方式 |
|---------|------|
| ERPNext | GL Entry に `is_cancelled` フラグ。Period Closing Voucher で除外すべきだが、過去にバグがあった（Issue #30849） |

### 商用会計ソフトでの一般的な扱い

**日本の会計ソフト（勘定奉行・弥生・freee・MF）**: 赤黒反対仕訳が標準。
元伝票を直接修正することは原則としてできない（確定後）。
税務調査・監査対応上、修正の証跡を残す必要があるため。

**大手 ERP（SAP・Oracle）**: 反対仕訳が必須。物理削除は原則禁止。
SAP S/4HANA では「FI documents の削除は許可されない」ことが明文化されている。

**data-stockflow の場合**: 事実テーブルのレコードについて修正方針を定める必要がある。
選択肢は:
1. 事実レコードは不変（WODE 方式）。修正は adjust イベントで行う → 監査証跡が最も強い
2. 未確定の事実は編集可。確定後は不変 → Odoo のドラフト/posted に近い
3. 事実を直接修正する → 最も単純だが監査証跡が弱い

---

## 7. イベントソーシング型の実例

### Oracle Accounting Hub（Subledger Accounting）

最も成熟した「イベント → 仕訳導出」の商用実装。

**仕組み**:
1. サブレジャー（AP/AR/FA 等）がビジネスイベントを発生させる
2. イベントにはイベントクラスとイベントタイプが付与される
3. Create Accounting プロセスが、会計ルール（Account Derivation Rules, Journal Line Rules）を適用
4. ソース値（取引先、品目、部門等）を読み取り、勘定科目を導出
5. サブレジャー仕訳を生成し、GL に転送

**事実と仕訳の関係**: イベントクラス/タイプ → 会計ルール（Application Accounting Definition）→ 仕訳行。
仕訳は永続化され、以降は GL が Source of Truth。

**再導出**: 会計ルールを変更し、Create Accounting を再実行すれば再導出可能。
ただし、既に GL 転送済みの仕訳は reverse が必要。

### freee の「取引」モデル

**仕組み**:
1. ユーザーは「取引」(deals) として記録（支出・収入・振替の3種）
2. 取引には勘定科目 + 決済方法（口座）を指定
3. freee が取引から仕訳を自動生成
4. 「自動で経理」機能: 銀行/カード明細 → AI/ルールでカテゴリ推定 → 取引に変換 → 仕訳導出

**data-stockflow との類似点**: freee の「取引→仕訳自動導出」は、data-stockflow の
「事実 + マッピングルール → 仕訳導出」と構造的に同じ。
freee は「非会計専門家が使える UI」を入口にしているが、内部的には導出型。

### Mettle Write Once Double Entry (WODE)

NatWest（英銀行）の fintech 子会社 Mettle が採用したパターン。

**仕組み**:
1. イベントストアに全イベントを不変（Write Once）で記録
2. 残高を移動できるイベントは「Double Entry イベント」のみ
3. Double Entry イベントは借方・貸方が常にペアで記録され、合計は常にゼロ
4. 修正は新しい反対イベントで行う（ペンで書く、消しゴムは使わない）

**パフォーマンス課題**:
- イベント数が増えると残高計算が遅くなる
- フィンテックの事例では、1日50,000イベントのアクティブ口座で、
  残高計算が2-5秒かかる問題が発生
- **対策**: スナップショット（定期的にある時点の残高を保存し、以降のイベントのみ計算）
  → 50-200ms に改善

### Martin Fowler の会計パターン

Fowler は Event Sourcing と会計の親和性を明確に論じている。

> When a Domain Event is processed, it can produce a set of Accounting Transactions.
> If all Accounting Transactions are produced from processing Domain Events
> then the Accounting Transactions use Event Sourcing.

主要パターン:
- **Account**: 残高は全 Entry の合計として導出
- **Accounting Entry**: 個別の記入。不変（immutable）
- **Accounting Transaction**: Entry のグループ。転送を表現
- **Reversal Adjustment**: 修正は反対仕訳で。元の Entry は変更しない

### data-stockflow の位置づけ

data-stockflow は以下の点で独自の位置にある:

| 特性 | data-stockflow | Oracle AH | freee | Mettle |
|------|---------------|-----------|-------|--------|
| 事実の記録 | DB（事実テーブル） | サブレジャーイベント | 取引 (deals) | イベントストア |
| ルールの管理 | DB（マッピングテーブル） | Application Accounting Definition | 勘定科目+決済方法の組合せ | Double Entry 制約 |
| 仕訳の永続化 | しない（導出のみ） | する（GL に転送） | する（仕訳帳に保存） | する（イベントとして） |
| 残高の計算 | SUM で導出 + period_balance キャッシュ | GL 残高テーブル | リアルタイム集計 | スナップショット + 差分 |

**data-stockflow が最もユニークな点**: 仕訳を永続化しないこと。
Oracle AH も freee も Mettle も、導出した仕訳は DB/イベントストアに保存する。
data-stockflow は毎回導出する方針であり、これは Ledger/hledger/beancount の
「テキストファイルを毎回パースする」アプローチに最も近い。

---

## 8. 日本の会計ソフトの特徴

### 内部モデルの比較

| 特性 | 勘定奉行 | 弥生会計 | freee | マネーフォワード |
|------|---------|---------|-------|---------------|
| 内部モデル | 伝統的仕訳帳（非公開） | 伝統的仕訳帳（非公開） | 取引→仕訳導出のハイブリッド | 仕訳ベース（連携入力あり） |
| 入力方式 | 仕訳形式 | 仕訳形式 | 取引形式（+振替伝票） | 仕訳形式（+連携入力） |
| API | OBC 受入形式 CSV | 弥生インポート形式 CSV | REST API (JSON) | REST API (仕訳API) |
| 複合仕訳 | `*` 記号でグループ化 | 1行1仕訳 + 複合対応 | details 配列（最大100行） | 仕訳行の配列 |
| DB | 非公開（独自） | 非公開（独自） | 非公開（クラウド） | 非公開（クラウド） |

### freee の独自性

freee は日本の会計ソフトの中で最もイベントソーシング型に近い。

1. **「取引」(deals)**: 金銭の収支を記録する入力単位。入力時に勘定科目と口座を指定する。
   未決済の場合は売掛金/買掛金が自動で設定される。
2. **「振替伝票」(manual_journals)**: 直接仕訳形式で入力するモード。
   通常の取引形式では表現できない決算整理仕訳等に使用。
3. **自動仕訳導出**: 取引の勘定科目 + 口座（決済手段）の組合せから仕訳が自動生成される。

これは data-stockflow の「カテゴリ→勘定科目マッピング」+「決済手段→勘定科目マッピング」と
構造的に等価である。

### インボイス制度対応のデータ構造

2023年10月から施行された適格請求書等保存方式への対応で、各社が追加した主なデータ項目:

| 項目 | 説明 | data-stockflow 対応 |
|------|------|-------------------|
| 適格請求書発行事業者番号 | T+13桁 | counterparty.qualified_invoice_number |
| 適格発行事業者フラグ | 仕入先が適格か | counterparty.is_qualified_issuer |
| インボイス種別 | 適格/経過措置(80%/50%)/非適格 | tax_class.invoice_type |
| 仕入税額控除割合 | 100%/80%/50%/0% | tax_class.deduction_ratio |
| 税率種別 | 標準(10%)/軽減(8%) | tax_class.is_reduced |

経過措置スケジュール:
- 2023/10/01 - 2026/09/30: 80% 控除
- 2026/10/01 - 2029/09/30: 50% 控除
- 2029/10/01 以降: 控除不可

data-stockflow の tax_class テーブルは `deduction_ratio` と `invoice_type` で
この経過措置を表現可能な設計になっている。

### 消費税計算のタイミング

| 方式 | 説明 | 採用例 |
|------|------|-------|
| 仕訳入力時（積上げ） | 各仕訳行の税込金額から消費税を計算し、仕訳に記録 | freee, MF, 弥生（既定） |
| 集計時（割戻し） | 期間の税込売上合計に税率を適用して消費税総額を算出 | 消費税申告時の選択肢 |
| 端数処理 | 切捨て/切上げ/四捨五入を設定 | 全社対応（設定で切替） |

**マネーフォワードの注意点**: 端数処理方法を変更すると、対象年度の全仕訳に対して
消費税額が再計算される。これは「消費税額は仕訳入力時に確定するが、端数処理ルール変更で
遡及的に再計算される」ことを意味し、一種の「導出」的な性質を持つ。

**data-stockflow の設計**: journal_line に `tax_amount` を持つため、
仕訳導出時に消費税を計算する「積上げ」方式を想定している。
ただし、申告時の「割戻し」計算は journal_line の集計クエリで対応可能。

---

## まとめ: data-stockflow の設計判断の評価

### 業界との比較での位置づけ

| 設計判断 | data-stockflow | 業界での一般性 | 評価 |
|---------|---------------|--------------|------|
| 事実→仕訳導出 | 採用 | Oracle AH, freee が部分採用。パターンとして認知済 | 妥当。先進的だが前例あり |
| 仕訳を永続化しない | 採用 | 極めて少数派。hledger/beancount のみ類似（毎回パース） | 独自判断。パフォーマンス注意 |
| journal + journal_line を持つ | 採用 | 導出結果のテーブルとして持つなら標準的 | 矛盾なし（導出結果の一時テーブル or キャッシュとして解釈） |
| side カラム方式 | 採用 | 少数派（大多数は separate debit/credit か signed amount） | 問題なし。勘定奉行 CSV 変換に便利 |
| period_balance キャッシュ | 採用 | SAP ECC 以前では標準。S/4HANA で廃止方向 | 小規模なら SUM で十分な可能性 |
| DB レベルの貸借検証なし | 採用 | TigerBeetle 以外は App 層検証が主流 | 妥当だが、App 層でのテストは必須 |
| マッピングルールの DB 管理 | 採用 | Oracle AH の Account Derivation Rules と同等の概念 | 良い設計 |
| インボイス制度対応 | tax_class で対応 | 日本の全会計ソフトが対応済 | 適切 |

### 推奨事項

1. **仕訳の永続化を検討**: 現在の「毎回導出」方針は、データ量増加時のパフォーマンスリスクがある。
   Mettle のスナップショット方式や、ERPNext のように「導出した GL Entry を永続化し、
   ソース変更時は reverse + 再生成」する方式を将来の選択肢として残しておくべき。

2. **App 層でのバランステスト**: ルールが正しければ均衡するとはいえ、
   全マッピングルール適用結果の `SUM(CASE WHEN side='debit' THEN amount ELSE -amount END) = 0`
   をテストスイートに含めるべき。

3. **事実の修正方針の明確化**: 在庫イベントで `event_type = 'adjust'` が定義されているように、
   会計事実についても修正方針（不変 + 調整イベント vs 直接修正）を明確にすべき。

---

## 参考文献・情報源

### OSS ソースコード
- [GnuCash SQL Object Model](https://piecash.readthedocs.io/en/master/object_model.html)
- [GnuCash Transactions and Splits (DeepWiki)](https://deepwiki.com/Gnucash/gnucash/2.2-transactions-and-splits)
- [GnuCash SQL Schema](https://wiki.gnucash.org/wiki/SQL)
- [Odoo account_move.py (GitHub)](https://github.com/odoo/odoo/blob/14.0/addons/account/models/account_move.py)
- [ERPNext gl_entry.py (GitHub)](https://github.com/frappe/erpnext/blob/develop/erpnext/accounts/doctype/gl_entry/gl_entry.py)
- [ERPNext general_ledger.py (GitHub)](https://github.com/frappe/erpnext/blob/develop/erpnext/accounts/general_ledger.py)
- [beancount data.py (GitHub)](https://github.com/beancount/beancount/blob/master/beancount/core/data.py)
- [beancount Design Doc](https://beancount.github.io/docs/beancount_design_doc.html)
- [hledger journal format](https://hledger.org/journal.html)

### 商用 ERP
- [SAP BKPF and BSEG Tables](https://www.saponlinetutorials.com/bkpf-and-bseg-table-in-sap/)
- [SAP S/4HANA Universal Journal (ACDOCA)](https://blog.sap-press.com/what-is-saps-universal-journal)
- [SAP S/4HANA GL Balance Calculation](https://sapficocorner.blogspot.com/2020/09/how-sap-s4-hana-calculates-gl-balances.html)
- [SAP Document Reversal (FB08)](https://www.guru99.com/how-to-perform-document-reversal.html)
- [Oracle GL Table Structure](http://oracleapps88.blogspot.com/2016/08/oracle-general-ledger-overview-of-table.html)
- [Oracle Accounting Hub (SLA)](https://docs.oracle.com/en/cloud/saas/financials/25b/faiac/how-subledger-journal-entries-are-created-and-processed-in.html)
- [Oracle GL Tables and Views](https://docs.oracle.com/en/cloud/saas/financials/25d/oedmf/gljelines-25162.html)

### 学術・パターン
- [Martin Fowler: Patterns for Accounting](https://martinfowler.com/eaaDev/AccountingNarrative.html)
- [Martin Fowler: Accounting Entry](https://martinfowler.com/eaaDev/AccountingEntry.html)
- [Martin Fowler: Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [REA Model (Wikipedia)](https://en.wikipedia.org/wiki/Resources,_Events,_Agents)
- [McCarthy 1982: The REA Accounting Model](https://home.business.utah.edu/actme/7410/McCarthy-82.pdf)

### 特化型データベース
- [TigerBeetle Documentation](https://docs.tigerbeetle.com/single-page/)
- [TigerBeetle Debit/Credit Schema](https://docs.tigerbeetle.com/concepts/debit-credit/)
- [TigerBeetle Data Modeling](https://docs.tigerbeetle.com/coding/data-modeling/)

### Fintech 事例
- [Mettle: Double Entry and Event Sourcing (WODE)](https://www.mettle.co.uk/blog/innovation-at-mettle-double-entry-and-event-sourcing/)
- [Event Sourcing CQRS FinTech Example (Medium)](https://lukasniessen.medium.com/this-is-a-detailed-breakdown-of-a-fintech-project-from-my-consulting-career-9ec61603709c)
- [Event Sourced Accounting (GitHub)](https://github.com/lnagel/event-sourced-accounting)

### 日本の会計ソフト
- [freee API リファレンス](https://developer.freee.co.jp/reference/accounting/reference)
- [freee 取引と仕訳の関係](https://support.freee.co.jp/hc/ja/articles/204865704)
- [freee 消費税・税区分の設定](https://support.freee.co.jp/hc/ja/articles/202848250)
- [マネーフォワード 消費税設定](https://biz.moneyforward.com/support/account/guide/office02/of02.html)
- [弥生会計 仕訳データ形式](https://support.yayoi-kk.co.jp/subcontents.html?page_id=18545)
- [国税庁 インボイス制度](https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_about.htm)
