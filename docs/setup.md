# セットアップガイド

## 前提条件

- Node.js 20+
- pnpm 10+
- PostgreSQL 15+（TCP 接続可能な任意のインスタンス）
- Clerk アカウント (Google OAuth 設定済み)

## 環境変数

`.env` に以下を設定:

```env
# PostgreSQL（search_path に data_stockflow を指定）
DATABASE_URL=postgresql://user:password@host:5432/dbname?search_path=data_stockflow

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# JWT Secret（API Key 署名用）
JWT_SECRET=<ランダム文字列>

# Platform API Key（bootstrap で生成後に設定）
PLATFORM_API_KEY=sf_...

BASE_URL=http://localhost:3000
```

> SSL が必要な場合は `?sslmode=require&search_path=data_stockflow` のように接続文字列に追記。

## フロー図

```
migration.sql → pnpm dev → bootstrap.ts → seed-accounting.mjs → Clerk Login
  (build)       (server)    (bootstrap)     (seed)               (利用開始)
```

| フェーズ | スコープ | 内容 |
|----------|----------|------|
| build | なし | スキーマ作成、ロール seed |
| bootstrap | platform | テナント・ユーザー作成、API key 発行 |
| seed | admin | 帳簿・勘定科目・デモデータ投入 |

## 1. 依存関係インストール

```bash
pnpm install
```

## 2. データベースマイグレーション (build)

スキーマ `data_stockflow` を作成し、全テーブル・ビュー・トリガーを構築する。
ブートストラップデータとしてロール 4 件 + カテゴリ種別 2 件が投入される。

```bash
psql $DATABASE_URL -f scripts/migration.sql
```

> **注意**: `DROP SCHEMA IF EXISTS data_stockflow CASCADE` が先頭にあるため、既存データは全て削除される。

## 3. アプリケーション起動

bootstrap / seed はいずれも API 経由で動作するため、先にサーバーを起動する。

```bash
pnpm dev
```

API ドキュメント: http://localhost:3000/api/reference

## 4. ブートストラップ (bootstrap)

**別ターミナルで実行。** 1 つのテナントが使える状態まで自動セットアップする。

1. Platform API key 発行 (platform スコープ)
2. テナント作成 (`POST /tenants`)
3. 管理者ユーザー登録 (`POST /users`)
4. Admin API key 発行 (admin スコープ)

```bash
npx tsx scripts/bootstrap.ts
```

出力された `PLATFORM_API_KEY` と `ADMIN_API_KEY` を `.env` に追記する。
これらのキーは再表示できないため、安全に保管すること。

### ロール ID 一覧

| role_id | code | 説明 |
|---------|------|------|
| 100000000000 | platform | プラットフォーム管理者 |
| 100000000001 | audit | 監査 (読み取り専用) |
| 100000000002 | admin | テナント管理者 |
| 100000000003 | user | 一般ユーザー |

## 5. デモデータ投入 (seed)

admin API key を使い、帳簿・勘定科目・マスタ・サンプル伝票を投入する。

```bash
# 一般帳簿 + 全勘定科目 + 基盤マスタ + サンプル伝票
node scripts/seed-accounting.mjs

# 食料品帳簿 (オプション)
node scripts/seed-grocery.mjs
```

## 6. ログインと自動紐付け

1. bootstrap で登録したメールアドレスの Google アカウントで Clerk ログイン
2. システムが Clerk JWT の `sub` → `external_id` で検索 (初回は未登録)
3. Clerk Backend API からメールアドレスを取得
4. `email` で一致するユーザーを検索 → ヒット
5. `external_id` に Clerk User ID を書き込み (append-only で新リビジョン追加)
6. 以降のログインは `external_id` で即マッチ
