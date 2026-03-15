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

### エンティティ操作一覧

| エンティティ | 操作 |
|---|---|
| **Tenant** | CRUD + 無効化 (platform のみ) |
| **User** | CRUD + 無効化 + 招待 (`/auth/invite`) |
| **Book** | CRUD + 無効化 |
| **Account** | CRUD + 無効化 (帳簿スコープ) |
| **Period** | CRUD + 無効化 + close / reopen |
| **Voucher** | 作成・一覧・詳細 |
| **Journal** | 作成・一覧 + 逆仕訳 (reverse) |
| **Department** | CRUD + 無効化 |
| **Counterparty** | CRUD + 無効化 |
| **Tag** | CRUD + 無効化 |
| **VoucherType** | CRUD + 無効化 |
| **JournalType** | CRUD + 無効化 (帳簿スコープ) |
| **Project** | CRUD + 無効化 |
| **Report** | 残高試算表・元帳 (帳簿スコープ、読み取り専用) |
| **監査ログ** | システムログ・イベントログ・完全性検証 (読み取り専用) |

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

## ドメインモデル

### エンティティ階層

```
Tenant                          テナント (組織の最上位単位)
├── User                        ユーザー (Role で権限付与)
├── Book                        帳簿 (通貨・単位・勘定体系を持つ独立した台帳)
│   ├── Account                 勘定科目 (asset/liability/equity/revenue/expense)
│   └── JournalType             仕訳種別
├── Period                      期間 (open → closed → finalized)
├── Voucher                     伝票 (複数の Journal をまとめるヘッダー)
│   └── Journal                 仕訳 (1つの帳簿に対する借方・貸方のセット)
│       ├── JournalLine         仕訳行 (科目・部門・取引先・金額)
│       └── JournalTag          仕訳タグ (多対多)
├── Department                  部門 (仕訳行の補助分類)
├── Counterparty                取引先 (仕訳行の補助分類)
├── Tag                         タグ (仕訳への自由分類)
├── VoucherType                 伝票種別 (仕訳の業務分類)
└── Project                     プロジェクト (仕訳の横断的な集計軸)
```

### 主要概念

| 概念 | スコープ | 説明 |
|---|---|---|
| **Tenant** | Platform | 組織の最上位単位。全データはテナントに属する |
| **Book** | Tenant | 独立した台帳。通貨 (`unit`)・勘定体系を持つ。1テナントに複数帳簿を持てる |
| **Account** | Book | 勘定科目。5種類の `account_type` (asset/liability/equity/revenue/expense) を持ち、階層構造 (`parent_account_id`) に対応 |
| **Period** | Tenant | 集計・締めの単位となる期間。帳簿横断で共通。`open` → `closed` → `finalized` のライフサイクル |
| **Voucher** | Tenant | 伝票。1つ以上の Journal をまとめるヘッダー。`idempotency_key` で重複防止、`sequence_no` + `header_hash` でチェーン化 |
| **Journal** | Book | 仕訳。特定の帳簿に属し、借方・貸方の JournalLine を持つ。1つの Voucher に複数の Journal (異なる帳簿) を含められる |
| **JournalLine** | Journal | 仕訳行。`side` (debit/credit) + `amount` (常に正数) で複式記帳。科目・部門・取引先を指定 |

### 複式記帳ルール

- 仕訳行の `amount` は常に正数。`side` で借方 (debit) / 貸方 (credit) を区別
- 1 Journal 内の借方合計 = 貸方合計 (バランスチェック)
- DB 内部では debit を負数、credit を正数で保持 (集計を単純な SUM で実現)
- `account.sign` (asset/expense = -1, liability/equity/revenue = +1) を掛けて表示用の符号を決定

### 補助分類

| 概念 | 用途 |
|---|---|
| **Department** | 仕訳行に部門を付与。組織別の集計に利用 |
| **Counterparty** | 仕訳行に取引先を付与。取引先別の集計に利用 |
| **Tag** | 仕訳に自由なラベルを付与 (多対多)。`tag_type` で種類を区分 |
| **VoucherType** | 伝票の業務分類 (例: 仕入伝票、売上伝票) |
| **JournalType** | 仕訳の種別 (帳簿ごとに定義) |
| **Project** | 仕訳の横断的な集計軸。部門に紐づけ可能 |

### 共通設計パターン

- **Append-only**: 全マスタ・トランザクションは INSERT のみ。`key` + `revision` の複合主キー
- **Bi-temporal**: `valid_from` / `valid_to` で時点指定クエリに対応
- **階層構造**: 多くのマスタが `parent_*_id` を持ち、ツリー構造を表現
- **論理削除**: `is_active = false` で無効化。物理削除は行わない
- **ハッシュチェーン**: `prev_revision_hash` → `revision_hash` で改ざん検知

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
