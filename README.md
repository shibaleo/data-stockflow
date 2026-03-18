# data-stockflow

複式簿記の仕訳・勘定科目・残高管理に特化した会計データベース。
Append-only / Bi-temporal / マルチテナント設計。

## 技術スタック

| 層 | 技術 |
|---|---|
| DB | PostgreSQL（ローカル / Neon Serverless） |
| API | Hono (OpenAPI) on Next.js Route Handler |
| 認証 | Clerk (Google OAuth) + JWT API Key (`sf_`) |
| UI | Next.js 16 + shadcn/ui + Tailwind CSS v4 |
| ORM | Drizzle ORM |

## クイックスタート

```bash
pnpm install                              # 1. 依存インストール
psql $DATABASE_URL -f scripts/migration.sql  # 2. スキーマ作成
pnpm dev                                  # 3. サーバー起動
npx tsx scripts/bootstrap.ts              # 4. テナント・API Key 発行
node scripts/seed-accounting.mjs          # 5. デモデータ投入（任意）
```

詳細は [セットアップガイド](docs/setup.md) を参照。

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [API リファレンス](docs/api-reference.md) | 全エンドポイント・リクエスト/レスポンス仕様（英語） |
| [アーキテクチャ概要](docs/architecture.md) | ドメインモデル・設計判断・ファイル構成 |
| [セットアップガイド](docs/setup.md) | 環境構築フロー |
| [要件定義](docs/002_requirements.md) | 設計原則・ライフサイクル・アクセス制御 |
| [Schema v3 設計書](docs/003_schema.md) | テーブル定義・ビュー・カテゴリシステム |

## API ドキュメント（対話型）

- OpenAPI 仕様: `/api/v1/doc`
- Scalar API Reference: `/api/v1/reference`
