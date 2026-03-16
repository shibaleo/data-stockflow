# ドメインモデル分析 — 基盤 vs 隣接ドメインの境界

## このリポジトリの立ち位置

READMEは「汎用 Stockflow 管理システム」を謳い、docs/004 は「複数の業務アプリが共有する汎用基盤」と定義する。

**現実**: 現在の実装は **個人会計のための単一テナント Hono API** に最適化されている。
汎用基盤としての概念（在庫帳簿、日次区切り、数量・単価）は設計ドキュメントにあるが、DDL・API・UIのいずれにも実装されていない。

これは悪いことではない。ただし「基盤に追加すべき」と書かれたものの中で、**本当に今の利用形態に必要なもの** と **汎用化のときに初めて必要になるもの** を区別する必要がある。

---

## エンティティ別分析

### 1. Period（期間） — 最も薄い

**現状の実装**:
- DDL: `key, code, start_date, end_date, status, parent_period_key`
- API: CRUD + `close` / `reopen`（status を open→closed→open に切り替えるだけ）
- UI: `/periods` ページあり

**設計で語られているが未実装のもの**:

| 概念 | 設計ドキュメント上の記述 | 実装状態 | 分類 |
|---|---|---|---|
| **閉鎖済期間の記帳拒否** | 002: `closed 期間には仕訳を作成できない`、009 TODO に明記 | **部分実装** — voucher POST で `status !== 'open'` を拒否するが、journal PUT（更新）では無検証。journal の posted_date が closed 期間に該当するかの横断チェックなし | 基盤に必要 |
| **finalize** | 004: `closed→finalized の不可逆遷移 + 書き込み拒否` | **未実装** — status の CHECK 制約にも `finalized` がない（DDL は `DEFAULT 'open'` のみ、CHECK 制約なし） | 基盤に必要 |
| **包含判定** | 004: `日付→期間の問い合わせ API` | **部分実装** — voucher POST 内で `start_date <= posted_date AND end_date >= posted_date` を動的クエリしているが、汎用 API ではない | 基盤に必要 |
| **連続性検証** | 004: `期間の隙間・重複がないことを保証` | **未実装** | 基盤に必要 |
| **区切り (Cutoff)** | 004: `期間を2つの区切りの間として構造的に定義` | **未実装** — 現状は start_date/end_date の直接指定 | 汎用化時 |
| **locked_until** | 002/003: `tenant_setting.locked_until` で確定制御 | **未実装** — tenant テーブルに `locked_until` カラムはあるが、voucher/journal 作成時に参照していない | 基盤に必要 |

**根本的な問題**: Period は「ラベルだけ付けて何も強制しないエンティティ」になっている。close してもジャーナル更新を止められない。

---

### 2. Book（帳簿） — 器はあるが中身が汎用に足りない

**現状の実装**:
- DDL: `key, code, name, unit, unit_symbol, unit_position, type_labels`
- API: CRUD + 無効化（CRUD factory）
- `type_labels` (JSONB) で account_type のラベルをカスタマイズ可能

**未実装**:

| 概念 | 分類 |
|---|---|
| **精度 (Precision)** — 帳簿ごとの小数桁数。amount は `DECIMAL(15,0)` 固定で小数不可 | 汎用化時 |
| **丸め規則 (Rounding)** — 端数処理方法 | 汎用化時 |
| **amount の桁数検証** — 帳簿の precision に合致するかの API 層チェック | 汎用化時 |

**評価**: 個人会計（JPY 固定）なら現状で十分。kg 帳簿を作る日が来たら precision が必要。

---

### 3. Account（勘定科目） — 中核、ほぼ完成

**現状の実装**:
- DDL: `key, code, name, account_type, is_active, parent_account_key`
- 帳簿スコープ (`book_key`)
- `current_account` ビューで `sign` を派生
- API: CRUD + 無効化

**未実装**:

| 概念 | 分類 |
|---|---|
| **正常残高 (Normal Balance)** — debit/credit の明示的属性 | 基盤検討 |
| **display_code** — 設計ドキュメント (003) にあるが DDL に存在しない | 基盤に必要 |
| **is_leaf（集計/明細区分）** — 009 TODO で `is_leaf 設計・実装` は完了済みとあるが、**DDL に `is_leaf` カラムがない** | 不整合 |

**不整合の詳細**: docs/003 の DDL 定義には `is_leaf BOOL NOT NULL DEFAULT true` があるが、migration.sql (Schema v2) と Drizzle schema には存在しない。設計と実装のズレ。

---

### 4. Voucher（伝票） — 堅牢だがドメインルール不足

**現状の実装**:
- idempotency_key、voucher_code、header_hash チェーン、sequence_no
- posted_date → period の自動解決
- **period の open チェックあり**（唯一の期間強制）

**未実装**:

| 概念 | 分類 |
|---|---|
| **添付参照 (Attachment Ref)** — 003 に `journal_attachment` テーブル定義があるが DDL になし | 基盤に必要 |
| **locked_until チェック** — 伝票作成時に `tenant.locked_until` と posted_date を比較していない | 基盤に必要 |

---

### 5. Journal（仕訳）& JournalLine（仕訳行） — 中核ロジックは実装済み

**実装済み**:
- 貸借均衡検証（API 層で debit 合計 = credit 合計）
- side → 内部符号化（debit=負, credit=正）
- revision チェーン（hash）
- 逆仕訳（reverse）
- 無効化（is_active=false）

**未実装**:

| 概念 | Journal/JournalLine | 分類 |
|---|---|---|
| **閉鎖済期間チェック** | journal PUT（更新）時に period status 検証なし | 基盤に必要 |
| **locked_until チェック** | posted_date <= locked_until の検証なし | 基盤に必要 |
| **数量 (Quantity)** | JournalLine に quantity カラムなし | 汎用化時 |
| **単価 (Unit Price)** | JournalLine に unit_price カラムなし | 汎用化時 |
| **補助通貨金額** | JournalLine に secondary_amount カラムなし | 汎用化時 |
| **tax_class_code** | 003 の設計にあるが DDL に存在しない | 会計アプリ時 |
| **tax_rate, is_reduced** | 同上 | 会計アプリ時 |

---

### 6. 補助エンティティ群 — 分類軸として十分

| エンティティ | 現状 | 基盤追加 | アプリ層 |
|---|---|---|---|
| **Department** | CRUD + 階層 + 無効化 | なし | 配賦ルール |
| **Counterparty** | CRUD + 階層 + 無効化 | なし | 決済条件、与信 |
| **Tag** | CRUD + 階層 + tag_type + N:N | なし | 排他制約、必須ルール |
| **Project** | CRUD + 階層 + department_key + 期間 | なし | 予算、予実対比 |
| **VoucherType** | CRUD + 階層 + 無効化 | なし | 採番規則 |
| **JournalType** | CRUD + 階層 + 無効化（帳簿スコープ） | なし | デフォルト科目 |

---

### 7. 設計と実装の構造的ズレ

| 項目 | docs/003 (基本設計) | migration.sql (Schema v2) | 差分 |
|---|---|---|---|
| **ID 方式** | UUID PK | BIGINT (sequence) + composite PK | 完全に異なる。v2 で BIGINT key に移行済み |
| **テーブル名** | `fiscal_period` | `period` | リネーム |
| **テーブル名** | `journal_header` | `voucher` | 概念統合 |
| **is_leaf** | account に定義あり | account に存在しない | ズレ |
| **display_code** | 全マスタに定義あり | どのマスタにも存在しない | ズレ |
| **tax_class** | 独立テーブル | 存在しない | 未実装 |
| **tax_class_code 等** | journal_line に定義 | journal_line に存在しない | 未実装 |
| **journal_attachment** | 独立テーブル | 存在しない | 未実装 |
| **account_mapping** | 独立テーブル | 存在しない | 未実装 |
| **payment_mapping** | 独立テーブル | 存在しない | 未実装 |
| **tenant_setting** | 独立テーブル | `tenant.locked_until` に統合 | 簡略化 |

docs/003 は Schema v1 時代の設計。Schema v2 (migration.sql) で大幅にリファクタされたが、docs/003 は更新されていない。

---

## TODO: 優先度別

### P0: 基盤として今すぐ必要（データ整合性に影響）

1. **閉鎖済期間の記帳拒否を完全実装**
   - voucher POST: 実装済み（period の open チェックあり）
   - journal PUT: **未実装** — 更新先の voucher が属する period の status チェックが必要
   - journal-ops/reverse: **未実装** — 同上

2. **locked_until の強制**
   - `tenant.locked_until` を voucher POST / journal PUT で参照し、`posted_date <= locked_until` なら拒否
   - 現状: カラムは存在するが参照コードがない

3. **period の連続性検証**
   - period POST/PUT 時に、同一テナント内の他の period と日付が重複・隙間がないことを検証
   - 現状: 何のバリデーションもなく任意の期間を作成できる

### P1: 基盤として近い将来必要（設計上の不整合解消）

4. **finalize の実装**
   - period.status に `finalized` を追加（CHECK 制約の追加 or App 層検証）
   - `closed → finalized` の遷移（不可逆）
   - finalized 期間への書き込みを一切拒否

5. **包含判定 API**
   - `GET /periods/resolve?date=2025-04-15` のような汎用エンドポイント
   - 現状は voucher POST 内にハードコードされた動的クエリ

6. **is_leaf の DDL 追加 & 仕訳バリデーション**
   - account テーブルに `is_leaf` カラムを追加
   - journal POST/PUT で `is_leaf = false` の科目への直接仕訳を拒否

7. **display_code の DDL 追加**
   - 全マスタテーブルに `display_code TEXT` カラムを追加
   - Identity/Display 分離の設計方針を実現

8. **docs/003 の更新**
   - Schema v2 に合わせて基本設計ドキュメントを改訂
   - または docs/003 を「v1 アーカイブ」とし、schema-v2.md を正本にする

### P2: 汎用化時に必要（現在の個人会計利用では不要）

9. **Book に precision / rounding** — kg 帳簿など非通貨単位の帳簿を作る際に必要
10. **JournalLine に quantity / unit_price / secondary_amount** — 在庫管理や外貨取引
11. **Account に normal_balance** — 正常残高の明示的属性
12. **区切り (Cutoff) モデル** — 期間を区切りの間として構造的に定義

### P3: 会計アプリ層（基盤ではなくアプリの責務）

13. **tax_class テーブル & journal_line の税関連カラム** — 消費税計算
14. **account_mapping / payment_mapping** — Zaim 等からの仕訳変換ルール
15. **journal_attachment** — 証憑管理
16. **繰越処理** — 期末残高→期首残高の仕訳生成
17. **決算整理仕訳の生成**
18. **レポート拡充** — 総勘定元帳、仕訳帳、BS/PL

---

## まとめ

**この基盤の最大の弱点は Period**。open/closed の状態は持つが、それを強制するロジックが不完全。「締めたのに記帳できる」状態。locked_until も同様で、カラムだけあって参照されていない。

逆に **Voucher/Journal/JournalLine の中核ロジック（貸借均衡、符号化、ハッシュチェーン）は堅牢**。

設計ドキュメント (docs/003) と実装 (Schema v2) のズレが大きく、docs/003 を参照して開発すると混乱する。これの整理も優先度が高い。
