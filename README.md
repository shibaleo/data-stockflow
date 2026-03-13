# data-stockflow

複式簿記の仕訳・勘定科目・残高管理に特化した会計データベース。
Append-only / Bi-temporal / マルチテナント設計。

## 技術スタック

| 層 | 技術 |
|---|---|
| DB | PostgreSQL on Neon (serverless) |
| API | Hono (OpenAPI) on Next.js Route Handler |
| 認証 | Clerk (Google OAuth) + 開発用 HS256 JWT |
| UI | Next.js + shadcn/ui + Tailwind CSS v4 |
| ORM | Prisma (with @prisma/adapter-pg) |

## セットアップ

### 前提条件

- Node.js 20+
- pnpm 10+
- Neon PostgreSQL プロジェクト
- Clerk プロジェクト (Google OAuth 有効)

### 1. 依存インストール

```bash
pnpm install
```

### 2. 環境変数

`.env.example` をコピーして `.env` を作成:

```bash
cp .env.example .env
```

必要な環境変数:

```env
# Neon PostgreSQL (direct TCP)
DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xxx.aws.neon.tech/neondb?sslmode=require&search_path=data_accounting"

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Dev JWT (curl/APIテスト用)
JWT_SECRET=your-dev-secret
AUTH_SECRET=your-auth-secret
```

### 3. DB マイグレーション

```bash
npx prisma db push
```

### 4. 開発サーバー起動

```bash
pnpm dev
```

### 5. Clerk Dashboard 設定

1. Sessions → Customize session token:
```json
{
  "tenant_id": "{{user.public_metadata.tenant_id}}",
  "role": "{{user.public_metadata.role}}",
  "user_id": "{{user.public_metadata.user_id}}"
}
```

2. ユーザーの publicMetadata を設定:
```json
{
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "role": "admin",
  "user_id": "00000000-0000-0000-0000-000000000099"
}
```

## Vercel デプロイ

1. GitHub リポジトリを Vercel に接続
2. 環境変数を設定 (`DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `JWT_SECRET`, `AUTH_SECRET`)
3. ビルドコマンド: `pnpm build` (デフォルト)
4. `prisma db push` は Vercel 上では不要 (Neon は共有DB)

## API

- OpenAPI ドキュメント: `/api/doc`
- Scalar API Reference: `/api/reference`
- ヘルスチェック: `GET /api/health`

### 主要エンドポイント

| パス | 説明 |
|---|---|
| `/api/accounts` | 勘定科目 CRUD |
| `/api/journals` | 仕訳 CRUD |
| `/api/counterparties` | 取引先 CRUD |
| `/api/tags` | タグ CRUD |
| `/api/fiscal-periods` | 会計期間 |
| `/api/departments` | 部門 |
| `/api/tax-classes` | 税区分 |

### 開発用 JWT トークン取得

```bash
curl -s http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"secret":"$AUTH_SECRET"}' | jq -r .token
```

## 設計ドキュメント

- [docs/002_requirements.md](docs/002_requirements.md) — 要件定義
- [docs/003_basic_design.md](docs/003_basic_design.md) — 基本設計 (DDL, API)
- [docs/006_zaim_migration_exploration.md](docs/006_zaim_migration_exploration.md) — Zaim 移行設計
