# Schema v2 実装プラン

`docs/schema-v2.md` で確定した設計に基づき、全テーブルを DROP して単一マイグレーションで再構築する。
既存データは探索用で、正規データは外部にあるためデータ移行は不要。

主な変更: `(key, revision)` 複合PK、BIGINT FK、voucher 1:N journal、全テーブル hash chain、
エンティティ中心 `/api/v1`、is_leaf廃止、role テーブル分離、不要テーブル削除。

---

## Phase 1: DB層

### 1-1. マイグレーション

- `prisma/migrations/` 配下の全ディレクトリを削除
- 新規: `prisma/migrations/20260315100000_schema_v2/migration.sql`
  - `DROP SCHEMA IF EXISTS data_stockflow CASCADE`
  - `CREATE SCHEMA data_stockflow`
  - 全 SEQUENCE 作成 (11個)
  - 全テーブル作成 (設計書通り)
  - 全 current_* ビュー + history_* ビュー作成
  - bootstrap データ INSERT (デフォルト tenant, role 4種, 初期 user)
- Neon MCP で実行

### 1-2. Drizzle スキーマ (`src/lib/db/schema.ts`)

全面書き換え:
- 共通カラムの定義パターン確立
- 新テーブル: tenant, role, user, book, account, fiscal_period, tag, department, counterparty, voucher, journal, journal_line, journal_tag, audit_log
- 廃止: tax_class, account_mapping, payment_mapping, journal_attachment, tenant_setting, tenant_user, journal_header

### 1-3. 型定義 (`src/lib/types.ts`)

全面書き換え: 新テーブル構造に合わせた Current* インタフェース

---

## Phase 2: 共通ライブラリ

| ファイル | 変更内容 |
|---|---|
| `src/lib/append-only.ts` | key (BIGINT) ベースに変更、`listHistory()` 新規追加 |
| `src/lib/hash-chain.ts` | 全テーブル対応に汎用化、voucher 用 header chain 維持 |
| `src/lib/validators.ts` | 全面書き換え: BIGINT key、新エンティティ、history スキーマ |
| `src/lib/audit.ts` | entityCode → entityKey (BIGINT) |
| `src/lib/auth.ts` | tenant_user → user テーブル参照、AuthResult に userKey 追加 |
| `src/middleware/context.ts` | AppVariables: userKey 追加、bookCode → bookKey |
| `src/middleware/guards.ts` | requireBook: path param `:bookId` → BIGINT パース |

---

## Phase 3: ルートハンドラ

### 3-1. ルーター統合

- `src/lib/hono-app.ts` → `/api/v1` ベースパスに変更、全ルートマウント
- `src/lib/hono-ops.ts` → 削除
- `src/app/api/[...route]/route.ts` → ops マウント削除

### 3-2. ルートファイル

| ファイル | 状態 | 内容 |
|---|---|---|
| `src/routes/books.ts` | 書き換え | BIGINT key、history追加 |
| `src/routes/accounts.ts` | 書き換え | is_leaf削除、parent_account_key |
| `src/routes/fiscal-periods.ts` | 書き換え | period_no削除、parent_period_key |
| `src/routes/tags.ts` | 書き換え | BIGINT key |
| `src/routes/departments.ts` | 書き換え | BIGINT key |
| `src/routes/counterparties.ts` | 書き換え | BIGINT key |
| `src/routes/vouchers.ts` | **新規** | voucher CRUD + journal群の一括作成 |
| `src/routes/journals.ts` | 書き換え | voucher-scoped、key ベース |
| `src/routes/roles.ts` | **新規** | role CRUD |
| `src/routes/users.ts` | **新規** | user CRUD |
| `src/routes/integrity.ts` | 移動 | ops/ から移動、key ベース |
| `src/routes/audit-logs.ts` | 移動 | ops/ から移動 |

### 3-3. 削除

- `src/routes/tax-classes.ts`
- `src/routes/account-mappings.ts`
- `src/routes/payment-mappings.ts`
- `src/routes/tenant-settings.ts`
- `src/routes/reports.ts` (将来 ops で再実装)
- `src/routes/ops/` ディレクトリ全体
- `src/lib/hono-ops.ts`

---

## Phase 4: フロントエンド + 検証

### 4-1. 最小限のフロントエンド修正

- `src/lib/api-client.ts` — ベースパスを `/api/v1` に変更
- フロントエンド (src/app/, src/components/) — API パス追従のみ。本格UI再構築は別タスク

### 4-2. 検証

1. `npx tsc --noEmit` — 型チェック通過
2. Neon MCP でマイグレーション実行
3. dev サーバー起動確認
4. curl で主要 API 動作確認

---

## 実装順序

```
1-1 (migration SQL) → Neon実行 → 1-2 (schema.ts) → 1-3 (types.ts)
→ 2-* (共通ライブラリ、並行可)
→ 3-1 (ルーター) → 3-2 (各ルート) → 3-3 (削除)
→ 4-1 (フロントエンド) → 4-2 (検証)
```
