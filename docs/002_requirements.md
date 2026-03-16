# data-stockflow 要件定義

## 設計方針

- **DB は API を公開する**: 呼び出し元が手入力 UI か自動連携サービスかは DB の関心外
- **会計口座モデル**: 複式簿記の仕訳・勘定科目・残高管理に特化
- **Append-only**: すべてのテーブルで UPDATE / DELETE しない。変更は新 revision の INSERT で表現
- **Bi-temporal**: append-only テーブルは `valid_from/valid_to`（業務時間）+ `created_at`（システム時間）を持つ
- **業務状態は可逆、監査証跡は不変**: 業務状態（is_active, status 等）は新 revision の INSERT でいつでも変更可能。監査証跡は不変
- **BIGINT key**: 全テーブルが `(key, revision)` 複合PK。`key` は SEQUENCE 採番、API では `id` として公開
- **参照整合性は App 層で保証**: append-only テーブル間は DB REFERENCES を使わない。journal_line → journal の FK のみ例外
- **API は CRUD を提供**: 呼び出し元は append-only / bi-temporal を意識しない
- **マルチテナント**: テナント単位でデータを分離
- **符号付き金額モデル**: `journal_line.amount` は符号付き（貸方=正, 借方=負）。`SUM(amount) = 0` が均衡恒等式
- **口座残高**: `SUM(amount) * sign`。`sign` は `account_type` から導出（asset/expense=-1, liability/equity/revenue=+1）
- **account.sign は account_type と独立**: 控除科目対応のため `sign` を独立カラムとして保持
- **統合カテゴリシステム**: 仕訳種別・仕訳タグ等の分類は `category_type` + `category` + `entity_category` の汎用メカニズムで表現。`allow_multiple` フラグで 1:1 / N:N を制御
- **命名規約**:
  - 業務日時: `posted_at` (TIMESTAMPTZ)
  - 自由記述: `description`
  - 他テーブル参照: `{テーブル名}_key`（内部）→ API レスポンスでは `{テーブル名}_id`
  - 真偽値フラグ: `is_` プレフィクス
  - bi-temporal: `valid_from` / `valid_to`

---

## データ分類とライフサイクル

### 分類

| 分類 | 権限区分 | テーブル |
|------|---------|---------|
| マスタ | プラットフォーム | role |
| マスタ | テナント | book, account, period, department, counterparty, project, category |
| トランザクション | — | voucher, journal, journal_line, entity_category |
| 監査 | — | system_log, event_log |
| 認証 | プラットフォーム | api_key |

### ライフサイクルポリシー

**原則: 業務状態は可逆、監査証跡は不変**

| 操作 | PF | テナント | アドミン | ユーザー | トランザクション |
|------|:--:|:-------:|:------:|:------:|:--------------:|
| 作成 | - | - | - | - | - |
| 更新 | - | - | - | - | - (rev+1) |
| 無効化 | - | — | - | - | - (is_active=false) |
| 復元 | **-** | — | - | - | - |

### アクセス制御マトリクス

| 対象 | PF | テナント | アドミン | ユーザー |
|------|:--:|:------:|:------:|:------:|
| tenant/role 書込 | - | - | - | - |
| マスタ 書込 | — | — | - | - |
| マスタ 読取 | — | - | - | - |
| 仕訳 (通常) | — | — | - | - |
| 監査ログ閲覧 | - | - | - | - |

### 監査の境界

- **アプリケーション内の操作** (created_by で記録): 監査対象。全ロールの操作が append-only で記録
- **開発者の操作** (DB 直接アクセス等): 監査対象外

---

## 帳票（出力要件）

残高のキャッシュテーブルは持たない。journal_line からクエリで導出。

| 帳票 | データソース |
|------|------------|
| 仕訳帳 | current_journal + journal_line |
| 総勘定元帳 | journal_line WHERE account_key = ? |
| カテゴリ別元帳 | entity_category JOIN current_journal → journal_line |
| 合計残高試算表 | journal_line を account_key, department_key で集計 |
| 貸借対照表 | account_type IN (asset, liability, equity) |
| 損益計算書 | account_type IN (revenue, expense) |
| 部門別損益 | department_key で GROUP BY |
| 仕訳の編集履歴 | journal WHERE key = ? ORDER BY revision |
| 削除済み仕訳一覧 | journal WHERE is_active = false |

---

## 年度繰越処理

1. `adjustment_flag = 'year_end_adj'` の仕訳で収益/費用を繰越利益剰余金に振り替え
2. 決算整理期間にこの仕訳を計上
3. 新年度の期首残高は B/S 勘定（asset, liability, equity）の journal_line 累積で導出
4. period.status の遷移: `open` <-> `closed`（月次締め）<-> `finalized`（年度確定）。すべての遷移はアドミンが可逆
