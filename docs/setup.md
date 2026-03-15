# セットアップガイド

## 前提条件

- Node.js 20+
- PostgreSQL (Neon Serverless 推奨)
- Clerk アカウント (Google OAuth 設定済み)

## 環境変数

`.env` に以下を設定:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=<ランダム文字列>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

## 1. 依存関係インストール

```bash
npm install
```

## 2. データベースマイグレーション

スキーマ `data_stockflow` を作成し、全テーブル・ビュー・トリガーを構築する。
ブートストラップデータとしてロール 4 件 (platform, audit, admin, user) のみ投入される。

```bash
psql $DATABASE_URL -f scripts/migration.sql
```

> **注意**: `DROP SCHEMA IF EXISTS data_stockflow CASCADE` が先頭にあるため、既存データは全て削除される。

## 3. プラットフォーム API キー発行

マイグレーション後、プラットフォーム操作用の API キーを生成する。
このキーは `userKey: 0, tenantKey: 0, role: platform` で発行され、テナント・ユーザー管理の全操作が可能。

```bash
npx tsx scripts/bootstrap.ts
```

出力された `PLATFORM_API_KEY=sf_...` を `.env` に追記する。
このキーは再表示できないため、安全に保管すること。

## 4. 初回テナント作成

プラットフォーム API キーを使ってテナントを作成する。

```bash
curl -X POST http://localhost:3000/api/v1/tenants \
  -H "Authorization: Bearer $PLATFORM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Company"}'
```

レスポンス例:
```json
{
  "data": {
    "id": 100000000000,
    "revision": 1,
    "name": "My Company",
    "locked_until": null
  }
}
```

レスポンスの `id` がテナント ID となる。

## 5. 管理者ユーザー登録 (招待)

テナントに管理者ユーザーをメールアドレスで事前登録する。
この時点では `external_id` は null — Clerk ログイン時にメールアドレスで自動紐付けされる。

```bash
curl -X POST http://localhost:3000/api/v1/tenants/{tenantId}/users \
  -H "Authorization: Bearer $PLATFORM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "shiba.dog.leo.private@gmail.com",
    "code": "admin001",
    "name": "Admin User",
    "role_id": 100000000002
  }'
```

### ロール ID 一覧

| role_id | code | 説明 |
|---------|------|------|
| 100000000000 | platform | プラットフォーム管理者 |
| 100000000001 | audit | 監査 (読み取り専用) |
| 100000000002 | admin | テナント管理者 |
| 100000000003 | user | 一般ユーザー |

## 6. ログインと自動紐付け

1. 登録したメールアドレスの Google アカウントで Clerk ログイン
2. システムが Clerk JWT の `sub` → `external_id` で検索 (初回は未登録)
3. Clerk Backend API からメールアドレスを取得
4. `email` で一致するユーザーを検索 → ヒット
5. `external_id` に Clerk User ID を書き込み (append-only で新リビジョン追加)
6. 以降のログインは `external_id` で即マッチ

## 7. アプリケーション起動

```bash
npm run dev
```

API ドキュメント: http://localhost:3000/api/reference

## フロー図

```
migration.sql  →  bootstrap.ts  →  POST /tenants  →  POST /tenants/:id/users  →  Clerk Login
   (roles)        (API key)        (tenant)          (admin by email)            (auto-bind)
```
