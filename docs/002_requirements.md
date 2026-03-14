# data-stockflow 要件定義

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
- **符号付き金額モデル**: `journal_line.amount` は符号付き（貸方=正, 借方=負）。`SUM(amount) = 0` が仕訳の均衡恒等式。DB 層の Constraint Trigger で保証する
- **口座残高**: `SUM(amount) * sign`。`sign` は `account_type` から導出（asset/expense=-1, liability/equity/revenue=+1）。`current_account` ビューが計算済みの `sign` を提供する
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

## 帳票（出力要件）

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

## 勘定奉行 CSV エクスポート

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
