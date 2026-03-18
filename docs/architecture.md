# アーキテクチャ概要

## 技術スタック

| 層 | 技術 |
|---|---|
| DB | PostgreSQL（ローカル Supabase / Neon Serverless） |
| API | Hono + @hono/zod-openapi（Next.js Route Handler 内） |
| 認証 | Clerk (Google OAuth) + JWT API Key (`sf_`) |
| UI | Next.js 16 + shadcn/ui + Tailwind CSS v4 |
| ORM | Drizzle ORM |

---

## エンティティ関係

```
Tenant                            組織の最上位単位
├── User                          ユーザー（Role で権限付与）
├── Book                          帳簿（通貨・単位ごとの独立した台帳）
│   ├── Account                   勘定科目（asset/liability/equity/revenue/expense）
│   │                             └→ Display Account へ N:1 マッピング
│   └── Display Account           表示科目（レポート用の別階層）
├── Voucher                       伝票（複数 Journal のグルーピング）
│   └── Journal                   仕訳（特定帳簿の借方・貸方セット）
│       ├── Journal Line          仕訳行（科目・部門・取引先・金額）
│       └── Entity Category       カテゴリ割当（種別・タグ）
├── Category                      分類値（journal_type, journal_tag 等）
│   └── Category Type             分類軸の定義（seed データ）
├── Department                    部門（仕訳行の補助分類）
├── Counterparty                  取引先（仕訳行の補助分類）
└── Project                       プロジェクト（仕訳の横断集計軸）
```

**スコープルール:**
- Tenant → 全データの親。Platform ロールのみテナント横断
- Book → Account, Display Account, Journal のスコープ
- Voucher → Journal のグルーピング単位。日付・帳簿は持たない

---

## 主要な設計判断

### 1. Append-only + Bi-temporal

全マスタ・トランザクションは INSERT のみ。`(key, revision)` 複合 PK。
- `valid_from / valid_to`: 業務時間の有効期間
- `created_at`: システム時間
- Purge 操作のみ `valid_to` を SET（`current_*` ビューから除外）

### 2. 符号付金額モデル

`journal_line.amount` は符号付き: 貸方 = +、借方 = -。
- **均衡恒等式**: `SUM(amount) = 0`（1 仕訳内）
- **口座残高**: `SUM(amount) × account.sign`
  - asset / expense → sign = -1
  - liability / equity / revenue → sign = +1
- API 入力では `side` (debit/credit) + 正の `amount` で指定。内部で符号変換。

### 3. 統合カテゴリシステム

旧 `tag`, `voucher_type`, `journal_type` テーブルを統合。
- `category_type` (seed): 分類軸。`allow_multiple` で 1:1 / N:N を制御
- `category` (append-only): テナントごとの分類値
- `entity_category` (junction): エンティティと分類値のリンク

### 4. Voucher の軽量化

Voucher はヘッダーのみ（伝票番号・摘要・冪等キー）。
`posted_at`, `book_key` は各 Journal が保持。1 伝票で異なる帳簿の仕訳を束ねられる。

### 5. 参照整合性は App 層

DB の FK は `journal_line → journal` のみ。
他の参照はアプリケーション層の `checkReferences()` で検査。
→ append-only テーブル間の FK 制約の複雑さを回避。

### 6. ハッシュチェーン

各エンティティ: `prev_revision_hash → revision_hash`。
Voucher: テナント内連番の `prev_header_hash → header_hash`。
`/integrity/verify` でオンデマンド検証可能。

---

## ディレクトリ構成

```
scripts/
  migration.sql           唯一の DDL ソース
  bootstrap.ts            初回セットアップ（テナント・API Key 発行）
  seed-accounting.mjs     勘定科目・デモデータ投入
  seed-grocery.mjs        食料品帳簿（デモ）
docs/
  api-reference.md        API リファレンス（外部 LLM 向け、英語）
  architecture.md         本ファイル
  setup.md                セットアップガイド
  002_requirements.md     要件定義・設計原則
  003_schema.md           Schema v3 テーブル定義詳細
src/
  lib/
    db/schema.ts          Drizzle ORM スキーマ定義
    hono-app.ts           API ルート登録（Hono + OpenAPI）
    crud-factory.ts       マスタ CRUD 共通ファクトリ
    validators.ts         Zod バリデーションスキーマ（全エンティティ）
    append-only.ts        共通クエリ（listCurrent, getCurrent, カーソル）
    entity-hash.ts        ハッシュチェーン計算 (SHA-256)
    voucher-cascade.ts    伝票リビジョン連動
    audit.ts              system_log 記録
    event-log.ts          event_log 記録 + 変更差分計算
    api-keys.ts           JWT 署名、API Key 管理
  middleware/
    context.ts            認証コンテキスト抽出（tenantKey, userKey, userRole）
    guards.ts             ミドルウェア（requireTenant, requireAuth, requireBook, requireRole, requireWritable）
  routes/
    各エンティティのハンドラ（books.ts, accounts.ts, vouchers.ts, journals.ts 等）
    ops/                  操作系（journal-ops.ts, audit-logs.ts, event-logs.ts, integrity.ts）
  components/             React UI コンポーネント
  hooks/                  カスタム React フック
  app/                    Next.js App Router ページ
```

---

## 詳細ドキュメント

- [要件定義・設計原則](002_requirements.md)
- [Schema v3 テーブル定義](003_schema.md)
- [セットアップガイド](setup.md)
- [API リファレンス](api-reference.md)
