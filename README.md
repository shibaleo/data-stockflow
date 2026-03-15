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

## API ファースト設計

本システムは **API ファースト** で設計されています。

- **OpenAPI 仕様駆動**: 全エンドポイントを `@hono/zod-openapi` で定義。リクエスト・レスポンスのバリデーションとドキュメント生成を型安全に一元管理
- **UI は API のクライアント**: フロントエンド (Next.js) は `/api/v1/*` を RESTful に呼び出すだけ。ビジネスロジックは API 層に集約
- **複数クライアント対応**: ブラウザ UI、curl、CI スクリプト、外部システムのいずれも同一 API を利用
- **認証の統一**: Clerk セッション (ブラウザ) と `sf_` API Key (スクリプト/CI) を単一の `authenticate()` で処理
- **Scalar API Reference**: `/api/v1/reference` でインタラクティブな API ドキュメントを提供

## 監査・ログ設計

### 二層ログアーキテクチャ

| ログ | テーブル | 用途 | エンドポイント |
|---|---|---|---|
| **システムログ** | `system_log` | システム操作の記録 (entity_type, entity_key, revision) | `GET /api/v1/audit-logs` |
| **イベントログ** | `event_log` | ビジネスレベルの活動記録 (誰が何をしたか) | `GET /api/v1/event-logs` |

### システムログ (`system_log`)
- 全 CUD 操作を fire-and-forget で記録
- entity_type / entity_key / revision で操作対象を特定
- 開発者・運用者向けのトレーサビリティ

### イベントログ (`event_log`)
- **ユーザー名のスナップショット**: 後からユーザー名が変更されても記録が残る
- **人間可読な要約**: `summary` フィールド (例: `科目「現金」を作成しました`)
- **対象エンティティ名**: `entity_name` で操作対象を直感的に特定
- **変更差分**: `changes` (JSONB) にフィールド単位の変更 `[{ field, from, to }]` を記録
- 監査役・管理者が「誰がいつ何をしたか」を時系列で確認可能

### データ改ざん防止
- **Append-only**: 全マスタ・トランザクションは INSERT のみ。UPDATE / DELETE なし
- **リビジョンチェーン**: 各エンティティの revision_hash で改ざん検知
- **ヘッダーチェーン**: 伝票の header_hash で連番の改ざんを検知
- **完全性検証**: `GET /api/v1/integrity` でハッシュチェーンの整合性を検証

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
