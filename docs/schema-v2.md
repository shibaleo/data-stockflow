# Schema v2 設計書

## 概要

append-only 複式簿記 ledger のスキーマを全面再設計する。
既存テーブルをすべて DROP し、単一マイグレーションで再構築する。

### 変更の動機

1. `code` (UUID文字列) と `display_code` の混乱を解消
2. FK参照を UUID text から BIGINT `key` に統一
3. `journal_header` → `voucher` + `journal` の2層構造を正しくモデル化 (1:N)
4. 全テーブルに共通構造 (hash chain 含む) を導入
5. atom/ops のAPI分離を廃止し、エンティティ中心の `/api/v1` に統合
6. 14個のマイグレーション蓄積を1本に圧縮
7. 不要テーブル削除 (tax_class, account_mapping, payment_mapping, journal_attachment, tenant_setting)
8. `is_leaf` 廃止 — 中間ノードへの賦課を許可
9. role を独立テーブルに分離
10. fiscal_period を account と同じ階層パターンに統一

---

## 共通カラム構造

### 全テーブル共通

| Column | Type | Description |
|---|---|---|
| `key` | BIGINT | Entity識別子。リビジョン間で不変 |
| `revision` | INTEGER DEFAULT 1 | リビジョン番号 |
| `created_at` | TIMESTAMPTZ DEFAULT now() | 行の作成日時 |
| `valid_from` | TIMESTAMPTZ DEFAULT now() | 有効期間の開始 |
| `valid_to` | TIMESTAMPTZ | 有効期間の終了 (NULL = 現行) |
| `lines_hash` | TEXT NOT NULL | 自身フィールドまたは子行の SHA-256 hash |
| `prev_revision_hash` | TEXT NOT NULL | 前 revision の revision_hash |
| `revision_hash` | TEXT NOT NULL | この revision の hash |

- PK: `(key, revision)`
- `key` の採番: 新規エンティティ作成時に SEQUENCE から払い出し。revision 追加時は同じ `key` を再利用

### tenant, user 以外のテーブルに追加

| Column | Type | Description |
|---|---|---|
| `created_by` | BIGINT NOT NULL | 作成者の user.key |

### voucher のみ追加

| Column | Type | Description |
|---|---|---|
| `sequence_no` | INTEGER NOT NULL | テナント単位の連番 |
| `prev_header_hash` | TEXT NOT NULL | 前 voucher の header_hash |
| `header_hash` | TEXT NOT NULL | この voucher の hash |

---

## テーブル定義

### 基盤系

#### tenant

| Column | Type | Description |
|---|---|---|
| (共通) | | key, revision, created_at, valid_from, valid_to, hash chain |
| `name` | TEXT NOT NULL | テナント名 |
| `locked_until` | TIMESTAMPTZ | ロック期日 (旧 tenant_setting から統合) |

- `created_by` なし (bootstrap問題回避)

#### role

| Column | Type | Description |
|---|---|---|
| (共通) | | key, revision, created_at, valid_from, valid_to, hash chain |
| `code` | TEXT NOT NULL | ロールコード ("platform", "audit", "admin", "user") |
| `name` | TEXT NOT NULL | ロール名 |
| `is_active` | BOOLEAN DEFAULT true | 有効フラグ |

- `created_by` なし (bootstrap問題回避)
- UNIQUE: `(code, revision)`

#### user

| Column | Type | Description |
|---|---|---|
| (共通) | | key, revision, created_at, valid_from, valid_to, hash chain |
| `external_id` | TEXT NOT NULL | 外部認証ID (Clerk sub) |
| `tenant_key` | BIGINT NOT NULL | 所属テナント → tenant.key |
| `role_key` | BIGINT NOT NULL | ロール → role.key |

- `created_by` なし (bootstrap問題回避)
- UNIQUE: `(external_id)` ※ 最新 revision で一意 (ビューで担保)

---

### マスタ系

#### book

| Column | Type | Description |
|---|---|---|
| (共通 + created_by) | | |
| `tenant_key` | BIGINT NOT NULL | → tenant.key |
| `code` | TEXT NOT NULL | ユーザー設定の表示コード ("accounting", "grocery") |
| `name` | TEXT NOT NULL | 帳簿名 |
| `unit` | TEXT NOT NULL | 単位名 ("円", "個") |
| `unit_symbol` | TEXT DEFAULT '' | 単位記号 ("¥", "") |
| `unit_position` | TEXT DEFAULT 'left' | 記号位置 |
| `type_labels` | JSONB DEFAULT '{}' | account_type のカスタムラベル |
| `is_active` | BOOLEAN DEFAULT true | 有効フラグ |

- UNIQUE: `(tenant_key, code, revision)`

#### account

| Column | Type | Description |
|---|---|---|
| (共通 + created_by) | | |
| `book_key` | BIGINT NOT NULL | → book.key |
| `code` | TEXT NOT NULL | 表示コード ("1100", "5410") |
| `name` | TEXT NOT NULL | 勘定科目名 |
| `account_type` | TEXT NOT NULL | asset / liability / equity / revenue / expense |
| `is_active` | BOOLEAN DEFAULT true | 有効フラグ |
| `parent_account_key` | BIGINT | 親勘定 → account.key |

- UNIQUE: `(book_key, code, revision)`
- 中間ノードへの賦課を許可 (is_leaf なし)
- 集計: account_key ごとのフラット SUM → アプリ側でツリー積み上げ

#### fiscal_period

account と同じ階層パターン。`parent_key` で fiscal_year → period の親子関係を表現。

| Column | Type | Description |
|---|---|---|
| (共通 + created_by) | | |
| `book_key` | BIGINT NOT NULL | → book.key |
| `code` | TEXT NOT NULL | 表示コード ("2026", "2026-01") |
| `start_date` | TIMESTAMPTZ NOT NULL | 期間開始 |
| `end_date` | TIMESTAMPTZ NOT NULL | 期間終了 |
| `status` | TEXT DEFAULT 'open' | open / closed / finalized |
| `is_active` | BOOLEAN DEFAULT true | 有効フラグ |
| `parent_period_key` | BIGINT | 親期間 → fiscal_period.key |

- UNIQUE: `(book_key, code, revision)`
- fiscal_year は code="2026" の最上位ノード、月次は code="2026-01" でその子

#### tag

| Column | Type | Description |
|---|---|---|
| (共通 + created_by) | | |
| `tenant_key` | BIGINT NOT NULL | → tenant.key |
| `code` | TEXT NOT NULL | 表示コード |
| `name` | TEXT NOT NULL | タグ名 |
| `tag_type` | TEXT NOT NULL | タグ種別 |
| `is_active` | BOOLEAN DEFAULT true | |

- UNIQUE: `(tenant_key, code, revision)`

#### department

| Column | Type | Description |
|---|---|---|
| (共通 + created_by) | | |
| `tenant_key` | BIGINT NOT NULL | → tenant.key |
| `code` | TEXT NOT NULL | 表示コード |
| `name` | TEXT NOT NULL | 部門名 |
| `department_type` | TEXT | 部門種別 |
| `is_active` | BOOLEAN DEFAULT true | |
| `parent_department_key` | BIGINT | 親部門 → department.key |

- UNIQUE: `(tenant_key, code, revision)`

#### counterparty

| Column | Type | Description |
|---|---|---|
| (共通 + created_by) | | |
| `tenant_key` | BIGINT NOT NULL | → tenant.key |
| `code` | TEXT NOT NULL | 表示コード |
| `name` | TEXT NOT NULL | 取引先名 |
| `is_active` | BOOLEAN DEFAULT true | |
| `qualified_invoice_number` | TEXT | 適格請求書番号 |
| `is_qualified_issuer` | BOOLEAN DEFAULT false | 適格発行事業者 |

- UNIQUE: `(tenant_key, code, revision)`

---

### トランザクション系

#### voucher

伝票。1つ以上の journal をまとめる単位。revision 管理なし。

| Column | Type | Description |
|---|---|---|
| (共通 + created_by) | | |
| `tenant_key` | BIGINT NOT NULL | → tenant.key |
| `idempotency_key` | TEXT NOT NULL UNIQUE | 冪等性キー |
| `book_key` | BIGINT NOT NULL | → book.key |
| `fiscal_period_key` | BIGINT NOT NULL | → fiscal_period.key |
| `voucher_code` | TEXT | 伝票番号 (ユーザー設定、任意) |
| `posted_date` | TIMESTAMPTZ NOT NULL | 記帳日 |
| `description` | TEXT | 摘要 |
| `source_system` | TEXT | 外部取込元 |
| (header chain) | | sequence_no, prev_header_hash, header_hash |

- UNIQUE: `(tenant_key, fiscal_period_key, voucher_code)` ※ voucher_code がある場合
- voucher は revision=1 固定 (追記のみ、更新なし)

#### journal

仕訳。sum=0 の最小単位。revision 管理あり。

| Column | Type | Description |
|---|---|---|
| (共通 + created_by) | | |
| `tenant_key` | BIGINT NOT NULL | → tenant.key |
| `voucher_key` | BIGINT NOT NULL | → voucher.key |
| `is_active` | BOOLEAN DEFAULT true | 有効フラグ |
| `journal_type` | TEXT DEFAULT 'normal' | normal / closing / prior_adj / auto |
| `slip_category` | TEXT DEFAULT 'ordinary' | ordinary / transfer / receipt / payment |
| `adjustment_flag` | TEXT DEFAULT 'none' | none / monthly_adj / year_end_adj |
| `description` | TEXT | 仕訳摘要 |
| (revision chain) | | lines_hash, prev_revision_hash, revision_hash |

- PK: `(key, revision)`

#### journal_line

明細行。revision 管理なし (journal の revision ごとに丸ごと再作成)。

| Column | Type | Description |
|---|---|---|
| `uuid` | UUID DEFAULT gen_random_uuid() PK | Row-level PK |
| `journal_key` | BIGINT NOT NULL | → journal.key |
| `journal_revision` | INTEGER NOT NULL | → journal.revision |
| `tenant_key` | BIGINT NOT NULL | → tenant.key |
| `line_group` | INTEGER NOT NULL | 行グループ番号 |
| `side` | TEXT NOT NULL | debit / credit |
| `account_key` | BIGINT NOT NULL | → account.key |
| `department_key` | BIGINT | → department.key |
| `counterparty_key` | BIGINT | → counterparty.key |
| `amount` | DECIMAL(15,0) NOT NULL | 金額 |
| `description` | TEXT | 行摘要 |

- journal_line は共通カラムを持たない (revision管理は journal 側)
- FK: `(journal_key, journal_revision)` → journal の `(key, revision)`
- tax_class 廃止に伴い tax_class_key, tax_rate, is_reduced を削除

#### journal_tag

| Column | Type | Description |
|---|---|---|
| `uuid` | UUID DEFAULT gen_random_uuid() PK | Row-level PK |
| `journal_key` | BIGINT NOT NULL | → journal.key |
| `journal_revision` | INTEGER NOT NULL | → journal.revision |
| `tenant_key` | BIGINT NOT NULL | → tenant.key |
| `tag_key` | BIGINT NOT NULL | → tag.key |
| `created_by` | BIGINT NOT NULL | → user.key |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

---

### 監査系

#### audit_log

非 append-only。共通カラム構造を適用しない。

| Column | Type | Description |
|---|---|---|
| `uuid` | UUID DEFAULT gen_random_uuid() PK | Row-level PK |
| `tenant_key` | BIGINT | → tenant.key |
| `user_key` | BIGINT NOT NULL | → user.key |
| `user_role` | TEXT NOT NULL | 操作時のロール |
| `action` | TEXT NOT NULL | create / update / deactivate / ... |
| `entity_type` | TEXT NOT NULL | テーブル名 |
| `entity_key` | BIGINT NOT NULL | 対象エンティティの key |
| `revision` | INTEGER | 対象リビジョン |
| `detail` | TEXT | 詳細 |
| `source_ip` | TEXT | IPアドレス |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

- INDEX: `(tenant_key, created_at)`
- INDEX: `(entity_type, entity_key)`

---

## 廃止テーブル

| テーブル | 理由 | 移行先 |
|---|---|---|
| `tenant_setting` | locked_until のみ → tenant に統合 | tenant.locked_until |
| `tenant_user` | tenant + user に分離 | tenant, user |
| `tax_class` | スコープ外 | なし (将来必要なら再設計) |
| `account_mapping` | 外部同期の関心事。このリポジトリの責務外 | ドキュメント化 (docs/) |
| `payment_mapping` | 同上 | ドキュメント化 (docs/) |
| `journal_attachment` | 未使用 | なし (将来必要なら再設計) |
| `journal_header` | voucher に置換 | voucher |

---

## ビュー定義

### current_* ビュー (最新有効リビジョン)

各 append-only テーブルに定義。最新有効リビジョンを返す。

```sql
-- パターン (例: current_account)
CREATE VIEW current_account AS
SELECT DISTINCT ON (key)
  *,
  CASE WHEN account_type IN ('asset', 'expense') THEN -1 ELSE 1 END AS sign
FROM account
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
ORDER BY key, created_at DESC;
```

対象: tenant, user, role, book, account, fiscal_period, tag, department, counterparty

journal 用:
```sql
CREATE VIEW current_journal AS
SELECT * FROM (
  SELECT DISTINCT ON (key) *
  FROM journal
  ORDER BY key, revision DESC
) latest
WHERE latest.is_active;
```

### history_* ビュー (全リビジョン履歴)

エンティティの全リビジョンを時系列で返す。

```sql
-- パターン (例: history_account)
CREATE VIEW history_account AS
SELECT * FROM account
ORDER BY key, revision;
```

対象: 全 append-only テーブル (current_* と同じ対象)

用途: エンティティの編集履歴閲覧 API

---

## SEQUENCE 定義

各テーブルの `key` 列用に独立した SEQUENCE を定義。

```sql
CREATE SEQUENCE tenant_key_seq;
CREATE SEQUENCE role_key_seq;
CREATE SEQUENCE user_key_seq;
CREATE SEQUENCE book_key_seq;
CREATE SEQUENCE account_key_seq;
CREATE SEQUENCE fiscal_period_key_seq;
CREATE SEQUENCE tag_key_seq;
CREATE SEQUENCE department_key_seq;
CREATE SEQUENCE counterparty_key_seq;
CREATE SEQUENCE voucher_key_seq;
CREATE SEQUENCE journal_key_seq;
```

新規エンティティ作成時: `key = nextval('xxx_key_seq')`
revision 追加時: 既存の `key` をそのまま使用

---

## API 設計

### ベースパス: `/api/v1`

エンティティ中心のRESTful構造。

- Hono + `@hono/zod-openapi` で実装
- OpenAPI spec は Zod スキーマから自動生成
- Scalar UI を `/api/v1/reference` で公開
- `key` はAPIレスポンスでは `id` として公開

### 共通操作パターン

全エンティティ (voucher 除く) に適用:

| Method | Path | 動作 |
|---|---|---|
| GET | `/{entities}` | 一覧 (カーソルページネーション) |
| POST | `/{entities}` | 新規作成 |
| GET | `/{entities}/:id` | 取得 (current ビュー) |
| PUT | `/{entities}/:id` | 更新 (新 revision 追加)。`is_active: false` で無効化、`is_active: true` で復元 |
| DELETE | `/{entities}/:id` | 無効化のショートカット (`is_active: false` の新 revision) |
| GET | `/{entities}/:id/history` | 全リビジョン履歴 |

- PUT / DELETE は全て append-only (新 revision の INSERT)
- restore は `PUT /:id` に `is_active: true` を含めて実行

### エンドポイント一覧

#### Books
```
GET    /books                              一覧
POST   /books                              作成
GET    /books/:bookId                       取得
PUT    /books/:bookId                       更新 / 無効化 / 復元
DELETE /books/:bookId                       無効化
GET    /books/:bookId/history               編集履歴
```

#### Accounts (book-scoped)
```
GET    /books/:bookId/accounts              一覧
POST   /books/:bookId/accounts              作成
GET    /books/:bookId/accounts/:accountId    取得
PUT    /books/:bookId/accounts/:accountId    更新 / 無効化 / 復元
DELETE /books/:bookId/accounts/:accountId    無効化
GET    /books/:bookId/accounts/:accountId/history  編集履歴
```

#### Fiscal Periods (book-scoped)
```
GET    /books/:bookId/fiscal-periods                     一覧
POST   /books/:bookId/fiscal-periods                     作成
GET    /books/:bookId/fiscal-periods/:periodId            取得
PUT    /books/:bookId/fiscal-periods/:periodId            更新 / 無効化 / 復元
DELETE /books/:bookId/fiscal-periods/:periodId            無効化
GET    /books/:bookId/fiscal-periods/:periodId/history    編集履歴
```

#### Vouchers (tenant-scoped)
```
GET    /vouchers                            一覧
POST   /vouchers                            作成 (journal群を含む)
GET    /vouchers/:voucherId                  取得 (journals + lines 含む)
```

- voucher は revision 管理なし (追記のみ、更新・削除なし)

#### Journals (voucher-scoped)
```
GET    /vouchers/:voucherId/journals                     一覧
GET    /vouchers/:voucherId/journals/:journalId           取得 (lines含む)
PUT    /vouchers/:voucherId/journals/:journalId           更新 / 無効化 / 復元 (新revision)
DELETE /vouchers/:voucherId/journals/:journalId           無効化 (新revision)
GET    /vouchers/:voucherId/journals/:journalId/history   編集履歴
```

#### Tags (tenant-scoped)
```
GET    /tags                                一覧
POST   /tags                                作成
GET    /tags/:tagId                          取得
PUT    /tags/:tagId                          更新 / 無効化 / 復元
DELETE /tags/:tagId                          無効化
GET    /tags/:tagId/history                  編集履歴
```

#### Departments (tenant-scoped)
```
GET    /departments                          一覧
POST   /departments                          作成
GET    /departments/:departmentId             取得
PUT    /departments/:departmentId             更新 / 無効化 / 復元
DELETE /departments/:departmentId             無効化
GET    /departments/:departmentId/history     編集履歴
```

#### Counterparties (tenant-scoped)
```
GET    /counterparties                       一覧
POST   /counterparties                       作成
GET    /counterparties/:counterpartyId        取得
PUT    /counterparties/:counterpartyId        更新 / 無効化 / 復元
DELETE /counterparties/:counterpartyId        無効化
GET    /counterparties/:counterpartyId/history 編集履歴
```

#### Roles (platform-scoped)
```
GET    /roles                               一覧
POST   /roles                               作成
GET    /roles/:roleId                        取得
PUT    /roles/:roleId                        更新 / 無効化 / 復元
DELETE /roles/:roleId                        無効化
GET    /roles/:roleId/history                編集履歴
```

#### Users (tenant-scoped)
```
GET    /users                               一覧
POST   /users                               作成
GET    /users/:userId                        取得
PUT    /users/:userId                        更新 / 無効化 / 復元
DELETE /users/:userId                        無効化
GET    /users/:userId/history                編集履歴
```

#### Audit Logs (読み取り専用)
```
GET    /audit-logs                           一覧 (フィルタ対応)
```

#### Integrity (読み取り専用)
```
GET    /integrity/header-chain               voucher header chain 検証
GET    /integrity/revision-chain/:journalId  journal revision chain 検証
GET    /integrity/full-scan                  全体検証
```

### レスポンスの命名マッピング

| DB column | API response field |
|---|---|
| `key` | `id` |
| `code` | `code` |
| `tenant_key` | (暗黙、レスポンスに含めない) |
| `account_key` | `account_id` |
| `book_key` | `book_id` |
| `voucher_key` | `voucher_id` |
| `parent_account_key` | `parent_account_id` |
| `parent_period_key` | `parent_period_id` |
| `parent_department_key` | `parent_department_id` |
| `role_key` | `role_id` |

### 認証

- Bearer token (Clerk JWKS or dev HS256)
- `user.key` を `created_by` に記録
- テナントスコープは `user.tenant_key` から自動解決

### OpenAPI spec

- Hono の `@hono/zod-openapi` により、Zod スキーマからOpenAPI 3.1 spec を自動生成
- `GET /api/v1/doc` — JSON spec エンドポイント
- `GET /api/v1/reference` — Scalar UI (インタラクティブなAPIリファレンス)

---

## 集計方針

### 勘定残高の集計

中間ノードへの直接賦課を許可するため、集計は以下の方針:

1. **DB**: `account_key` ごとのフラット SUM (journal_line.amount の集計)
2. **アプリ**: `parent_account_key` を辿ってツリー構築
3. **表示**: 各ノードの表示残高 = 自身の直接残高 + 全子孫の合計

`is_leaf` 列は存在しない。すべてのノードが残高を持ちうる。

---

## 旧スキーマからの変更サマリ

| 項目 | v1 | v2 |
|---|---|---|
| Row PK | `id` (UUID) | `(key, revision)` 複合PK |
| Entity key | `code` (UUID text) | `key` (BIGINT) |
| 表示コード | `display_code` | `code` |
| FK参照 | `*_code` (UUID text) | `*_key` (BIGINT) |
| API上のID | `code` | `id` (= key) |
| 伝票テーブル | `journal_header` | `voucher` |
| 伝票:仕訳 | 1:1 | 1:N |
| hash chain | journal のみ | 全テーブル |
| tenant_setting | 独立テーブル | tenant に統合 |
| tenant_user | 1テーブル | tenant + user + role に分離 |
| filler勘定 | 自動生成 | 廃止 (中間ノード賦課許可) |
| is_leaf | あり | 廃止 |
| fiscal_period | flat + period_no | 階層構造 (parent_period_key) |
| tax_class | あり | 廃止 |
| account_mapping | あり | 廃止 (ドキュメント化) |
| payment_mapping | あり | 廃止 (ドキュメント化) |
| journal_attachment | あり | 廃止 |
| API構造 | atom/v1 + ops/v1 | v1 エンティティ中心 |
| マイグレーション | 14本 | 1本 |
| ビュー | current_* のみ | current_* + history_* |
| user role | TEXT列 | role テーブル + role_key 参照 |
