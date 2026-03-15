# data-stockflow

複式簿記の仕訳・勘定科目・残高管理に特化した会計データベース。
Append-only / Bi-temporal / マルチテナント設計。

## 技術スタック

| 層 | 技術 |
|---|---|
| DB | PostgreSQL on Neon (serverless) |
| API | Hono (OpenAPI) on Next.js Route Handler |
| 認証 | Clerk (Google OAuth) + JWT API Key (`sf_`) |
| UI | Next.js 16 + shadcn/ui + Tailwind CSS v4 |
| ORM | Drizzle ORM |

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

`.env` に以下を設定:

```env
# Neon PostgreSQL
DATABASE_URL="postgresql://...?sslmode=require&search_path=data_stockflow"

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# JWT Secret (API Key 署名用)
JWT_SECRET=your-secret

# Platform API Key (bootstrap で生成)
PLATFORM_API_KEY=sf_...

BASE_URL=http://localhost:3000
```

### 3. DB マイグレーション

```bash
psql $DATABASE_URL < scripts/migration.sql
```

### 4. Bootstrap (初回のみ)

```bash
npx tsx scripts/bootstrap.ts
```

生成された `sf_...` キーを `.env` の `PLATFORM_API_KEY` に設定。

### 5. 開発サーバー起動

```bash
pnpm dev
```

### 6. シードデータ投入 (任意)

```bash
node scripts/seed-accounting.mjs   # 勘定科目
node scripts/seed-grocery.mjs      # 食料品帳簿 (デモ)
```

## API

- OpenAPI ドキュメント: `/api/doc`
- Scalar API Reference: `/api/reference`
- ヘルスチェック: `GET /api/v1/health`

### 主要エンドポイント

| パス | 説明 |
|---|---|
| `/api/v1/books` | 帳簿 CRUD |
| `/api/v1/books/:bookId/accounts` | 勘定科目 CRUD |
| `/api/v1/books/:bookId/journals` | 仕訳 CRUD |
| `/api/v1/books/:bookId/vouchers` | 伝票 CRUD |
| `/api/v1/counterparties` | 取引先 CRUD |
| `/api/v1/tags` | タグ CRUD |
| `/api/v1/departments` | 部門 CRUD |
| `/api/v1/fiscal-periods` | 会計期間 |
| `/api/v1/users` | ユーザー管理 |

### 認証方式

| 方式 | 用途 |
|---|---|
| Clerk セッション | ブラウザ UI |
| `sf_` API Key (JWT) | API / CI / スクリプト |

API Key は `Bearer sf_...` として Authorization ヘッダーに渡す。

```bash
curl -H "Authorization: Bearer $PLATFORM_API_KEY" http://localhost:3000/api/v1/books
```

## ロール体系

| ロール | 権限 |
|---|---|
| platform | 全操作 (bootstrap/CI 用) |
| audit | 読み取り専用 + 監査ログ |
| admin | マスタ管理 + 仕訳操作 |
| user | 仕訳操作 |

## 設計ドキュメント

- [docs/002_requirements.md](docs/002_requirements.md) — 要件定義
- [docs/003_basic_design.md](docs/003_basic_design.md) — 基本設計
- [docs/schema-v2.md](docs/schema-v2.md) — スキーマ v2 仕様

## ディレクトリ構成

```
scripts/                実行スクリプト
  bootstrap.ts          Platform API Key 生成
  migration.sql         スキーマ DDL
  seed-accounting.mjs   勘定科目シード
  seed-grocery.mjs      食料品帳簿シード
docs/                   プロジェクト設計
dev/                    開発日記・調査メモ
src/
  app/                  Next.js App Router (UI)
  components/           React コンポーネント
  hooks/                カスタムフック
  lib/                  共通ライブラリ (auth, db, api-keys, etc.)
  middleware/            Hono ミドルウェア (guards, context)
  routes/               Hono API ルート
```
