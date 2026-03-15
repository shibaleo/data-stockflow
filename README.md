# data-stockflow

汎用 Stockflow 管理システム。複式記帳・勘定科目・残高管理を中核に、在庫・物流など幅広いフロー管理に対応。
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

### エンドポイント一覧

#### Platform スコープ

platform ロール専用。テナント・ロールの管理。

| パス | 説明 |
|---|---|
| `/api/v1/tenants` | テナント CRUD |
| `/api/v1/roles` | ロール CRUD |

#### Tenant スコープ

認証済みユーザーが自テナント内のリソースを操作。platform ロールは全テナントを横断可能。

| パス | 説明 |
|---|---|
| `/api/v1/users` | ユーザー管理 |
| `/api/v1/books` | 帳簿 CRUD |
| `/api/v1/periods` | 期間 CRUD + close/reopen |
| `/api/v1/tags` | タグ CRUD |
| `/api/v1/departments` | 部門 CRUD |
| `/api/v1/counterparties` | 取引先 CRUD |
| `/api/v1/voucher-types` | 伝票種別 CRUD |
| `/api/v1/projects` | プロジェクト CRUD |
| `/api/v1/vouchers` | 伝票 CRUD (仕訳含む) |

#### Book スコープ

帳簿配下のリソース。`bookId` パスパラメータでテナント所有権を検証。

| パス | 説明 |
|---|---|
| `/api/v1/books/:bookId/accounts` | 勘定科目 CRUD |
| `/api/v1/books/:bookId/journal-types` | 仕訳種別 CRUD |
| `/api/v1/books/:bookId/reports/balances` | 残高レポート |

#### 操作・監査

| パス | 説明 |
|---|---|
| `/api/v1/journals/:journalId/reverse` | 逆仕訳 |
| `/api/v1/periods/:periodId/close` | 期間締め |
| `/api/v1/periods/:periodId/reopen` | 期間再開 |
| `/api/v1/audit-logs` | システムログ (操作記録) |
| `/api/v1/event-logs` | イベントログ (業務活動) |
| `/api/v1/integrity` | ハッシュチェーン検証 |

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

| ロール | 読み取り | マスタ書き込み | 仕訳操作 | 期間 close/reopen | テナント管理 |
|---|---|---|---|---|---|
| platform | 全テナント | 全テナント | 全テナント | 全テナント | 可 |
| admin | 自テナント | 可 | 可 | 可 | 不可 |
| user | 自テナント | 不可 | 可 | 不可 | 不可 |
| audit | 自テナント | 不可 | 不可 | 不可 | 不可 |

- **platform**: 全操作・全テナントにアクセス可能。bootstrap / CI 用
- **admin**: 自テナント内のマスタ管理 + 仕訳操作 + 期間 close/reopen
- **user**: 仕訳操作のみ (伝票作成・逆仕訳)
- **audit**: 読み取り専用。全 POST/PUT/DELETE を `403` で拒否

### スコープ解決

1. **認証**: Clerk セッション or `sf_` API Key → `tenantKey`, `userKey`, `userRole` をコンテキストに設定
2. **テナント分離**: `requireTenant()` で tenantKey の存在を検証。platform ロールは `tenantKey=0` でテナントフィルタをバイパス
3. **帳簿分離**: `requireBook()` で `bookId` パスパラメータからテナント所有権 + active 状態を検証
4. **ロール制御**: `requireRole()` で操作権限を検証。platform ロールは常にパス
5. **監査ロール制限**: `requireWritable()` で audit ロールの書き込み操作をグローバルに拒否

## 監査ポリシー

### 原則

- **全操作を記録**: CUD (Create/Update/Delete) 操作は例外なくログに記録される
- **改ざん不可**: Append-only アーキテクチャにより、過去のデータは変更・削除されない
- **二層記録**: システムログ (技術) とイベントログ (業務) を分離

### 二層ログアーキテクチャ

| ログ | テーブル | 対象者 | エンドポイント |
|---|---|---|---|
| **システムログ** | `system_log` | 開発者・運用者 | `GET /api/v1/audit-logs` |
| **イベントログ** | `event_log` | 監査役・管理者 | `GET /api/v1/event-logs` |

#### システムログ (`system_log`)
- 全 CUD 操作を fire-and-forget で記録
- `entity_type` / `entity_key` / `revision` で操作対象を一意に特定
- 発生源 IP (`source_ip`) を記録
- 技術的トレーサビリティの確保が目的

#### イベントログ (`event_log`)
- **ユーザー名スナップショット**: 後からユーザー名が変更されても記録時点の名前が残る
- **人間可読な要約**: `summary` フィールド (例: `科目「現金」を作成しました`)
- **対象エンティティ名**: `entity_name` で操作対象を直感的に特定
- **変更差分**: `changes` (JSONB) にフィールド単位の `[{ field, from, to }]` を記録
- 「誰がいつ何をしたか」を時系列で追跡可能

### データ改ざん防止

- **Append-only**: 全マスタ・トランザクションは INSERT のみ。UPDATE / DELETE なし
- **リビジョンチェーン**: 各エンティティの `revision_hash` で改ざん検知。前リビジョンのハッシュを入力に含む
- **ヘッダーチェーン**: 伝票の `header_hash` でテナント内の連番改ざんを検知
- **完全性検証**: `GET /api/v1/integrity` でハッシュチェーンの整合性をオンデマンド検証

## API ファースト設計

- **OpenAPI 仕様駆動**: 全エンドポイントを `@hono/zod-openapi` で定義。バリデーションとドキュメント生成を型安全に一元管理
- **UI は API のクライアント**: フロントエンドは `/api/v1/*` を呼び出すだけ。ビジネスロジックは API 層に集約
- **複数クライアント対応**: ブラウザ UI、curl、CI スクリプト、外部システムが同一 API を利用
- **認証の統一**: Clerk セッションと `sf_` API Key を単一の `authenticate()` で処理

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
    ops/                操作系 (close/reopen, reverse, audit-logs)
```
