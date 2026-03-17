# Schema v3 設計書

## 概要

append-only 複式簿記のスキーマ。単一スキーマ `data_stockflow` に全テーブルを配置。
`scripts/migration.sql` が唯一の DDL ソース。

### v2 からの変更点

1. **統合カテゴリシステム**: `tag`, `voucher_type`, `journal_type` → `category_type` + `category` + `entity_category`
2. **posted_at を journal に移動**: voucher から `posted_date`, `period_key` を除去。各 journal が自身の `posted_at` と `period_key` を持つ
3. **voucher の軽量化**: voucher はビジネスグルーピング（伝票番号、摘要）のみ。`book_key` も除去
4. **journal から type_key 除去**: `journal_type_key`, `voucher_type_key` → `entity_category` で表現
5. **project テーブル追加**: プロジェクト管理用マスタ
6. **event_log 追加**: ビジネスレベルの活動ログ（system_log とは別）

---

## テーブル一覧

| 区分 | テーブル | スコープ | append-only |
|------|---------|---------|:-----------:|
| 基盤 | tenant | - | Yes |
| 基盤 | role | - | Yes |
| 基盤 | user | tenant | Yes |
| マスタ | book | tenant | Yes |
| マスタ | account | book | Yes |
| マスタ | period | tenant | Yes |
| マスタ | category_type | - (seed) | No |
| マスタ | category | tenant | Yes |
| マスタ | department | tenant | Yes |
| マスタ | counterparty | tenant | Yes |
| マスタ | project | tenant | Yes |
| 取引 | voucher | tenant | Insert-only |
| 取引 | journal | tenant | Yes |
| 取引 | journal_line | journal | No (journal revision ごと再作成) |
| 分類 | entity_category | journal | No (journal revision ごと再作成) |
| 監査 | system_log | tenant | Insert-only |
| 監査 | event_log | tenant | Insert-only |
| 認証 | api_key | - | Insert-only |

---

## 共通カラム構造

### append-only テーブル共通

| Column | Type | 説明 |
|---|---|---|
| `key` | BIGINT | エンティティ識別子。revision 間で不変 |
| `revision` | INTEGER DEFAULT 1 | リビジョン番号 |
| `created_at` | TIMESTAMPTZ DEFAULT now() | 行の作成日時 |
| `valid_from` | TIMESTAMPTZ DEFAULT now() | 有効期間の開始 |
| `valid_to` | TIMESTAMPTZ | 有効期間の終了 (NULL = 現行) |
| `lines_hash` | TEXT NOT NULL | フィールドの SHA-256 hash |
| `prev_revision_hash` | TEXT NOT NULL | 前 revision の revision_hash |
| `revision_hash` | TEXT NOT NULL | この revision の hash |

- PK: `(key, revision)`
- `key` の採番: SEQUENCE から払い出し。revision 追加時は同じ `key` を再利用

### voucher のみ追加

| Column | Type | 説明 |
|---|---|---|
| `sequence_no` | INTEGER NOT NULL | テナント単位の連番 |
| `prev_header_hash` | TEXT NOT NULL | 前 voucher の header_hash |
| `header_hash` | TEXT NOT NULL | この voucher の hash |

---

## テーブル定義

### 基盤系

**tenant**: テナント。`locked_until` でロック制御。`created_by` なし。

**role**: ロール (platform / audit / admin / user)。seed データ。`created_by` なし。

**user**: ユーザー。`tenant_key`, `role_key`, `external_id` (Clerk sub), `email`, `code`, `name`。`created_by` なし。

### マスタ系

**book**: 帳簿 (`tenant_key`, `code`, `name`, `unit`, `unit_symbol`, `unit_position`, `type_labels` JSONB)

**account**: 勘定科目 (`book_key`, `code`, `name`, `account_type`, `parent_account_key`, `sign`)
- `sign`: asset/expense = -1, liability/equity/revenue = +1
- `is_leaf` なし — 中間ノードへの賦課を許可

**period**: 会計期間 (`tenant_key`, `code`, `start_date`, `end_date`, `status`, `parent_period_key`)
- 階層構造: 年度 → 月次

**department**: 部門 (`tenant_key`, `code`, `name`, `department_type`, `parent_department_key`)

**counterparty**: 取引先 (`tenant_key`, `code`, `name`, `parent_counterparty_key`)

**project**: プロジェクト (`tenant_key`, `code`, `name`, `department_key`, `start_date`, `end_date`, `parent_project_key`)

### カテゴリシステム

`tag`, `voucher_type`, `journal_type` を統合した汎用分類メカニズム。

**category_type** (seed テーブル、revision なし):

| Column | Type | 説明 |
|---|---|---|
| `code` | TEXT PK | 分類種別コード |
| `target_entity` | TEXT NOT NULL | 対象エンティティ ('journal') |
| `label` | TEXT NOT NULL | 表示ラベル |
| `allow_multiple` | BOOLEAN DEFAULT true | 複数割当可否 |

Seed データ:
- `journal_type` (allow_multiple=false) — 仕訳種別（1仕訳に1つ）
- `journal_tag` (allow_multiple=true) — 仕訳タグ（N:N）

**category** (tenant-scoped, append-only):
`tenant_key`, `category_type_code`, `code`, `name`, `parent_category_key`

**entity_category** (ジャンクション、revision なし):

| Column | Type | 説明 |
|---|---|---|
| `uuid` | UUID PK | 行レベル PK |
| `tenant_key` | BIGINT NOT NULL | テナント |
| `category_type_code` | TEXT NOT NULL | → category_type.code |
| `entity_key` | BIGINT NOT NULL | 対象エンティティの key |
| `entity_revision` | INTEGER NOT NULL | 対象エンティティの revision |
| `category_key` | BIGINT NOT NULL | → category.key |
| `created_by` | BIGINT NOT NULL | 作成者 |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

- `allow_multiple=false` の制約: 部分ユニーク索引で enforce
  ```sql
  CREATE UNIQUE INDEX uq_entity_category_journal_type
  ON entity_category (entity_key, entity_revision)
  WHERE category_type_code = 'journal_type';
  ```

### トランザクション系

**voucher** (insert-only、revision=1 固定):
`tenant_key`, `idempotency_key` (UNIQUE), `voucher_code`, `description`, `source_system`, header chain columns

- voucher は軽量なグルーピング単位。日付・期間・帳簿は持たない

**journal** (append-only):
`tenant_key`, `voucher_key`, `book_key`, `period_key`, `posted_at`, `project_key`, `adjustment_flag`, `description`, `metadata` JSONB, `is_active`, revision chain columns

- `posted_at`: 計上日時。仕訳ごとに独立
- `period_key`: 会計期間。API が `posted_at` から自動解決可能

**journal_line** (journal revision ごと再作成):
`uuid` PK, `journal_key`, `journal_revision`, `tenant_key`, `sort_order`, `side` (debit/credit), `account_key`, `department_key`, `counterparty_key`, `amount` DECIMAL(15,0), `description`

- FK: `(journal_key, journal_revision)` → journal `(key, revision)`
- 符号付金額: 貸方=正, 借方=負。`SUM(amount) = 0` が均衡恒等式

### 監査系

**system_log**: API 操作の監査ログ (`user_key`, `action`, `entity_type`, `entity_key`, `revision`, `detail`)

**event_log**: ビジネスレベルの活動ログ (`user_name`, `action`, `entity_type`, `entity_name`, `summary`, `changes` JSONB)

---

## ビュー

### current_* (最新有効リビジョン)

```sql
CREATE VIEW current_account AS
SELECT DISTINCT ON (key)
  *,
  CASE WHEN account_type IN ('asset', 'expense') THEN -1 ELSE 1 END AS sign
FROM account
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
ORDER BY key, created_at DESC;
```

対象: tenant, user, role, book, account, period, category, department, counterparty, project, journal

### history_* (全リビジョン)

```sql
CREATE VIEW history_account AS
SELECT * FROM account ORDER BY key, revision;
```

---

## API 設計

### ベースパス: `/api/v1`

Hono + `@hono/zod-openapi`。`key` は API レスポンスで `id` として公開。

### エンドポイント

| パス | 説明 |
|------|------|
| `/tenants`, `/roles` | プラットフォームスコープ |
| `/users`, `/books`, `/categories`, `/departments`, `/counterparties`, `/projects` | テナントスコープ |
| `/periods` | テナントスコープ |
| `/books/:bookId/accounts` | 帳簿スコープ |
| `/books/:bookId/reports` | 帳簿スコープ (残高集計) |
| `/vouchers` | テナントスコープ (伝票 CRUD) |
| `/vouchers/:voucherId/journals` | 伝票スコープ (仕訳 CRUD) |
| `/journals/:journalId/reverse` | 逆仕訳作成 |
| `/periods/:periodId/close`, `/reopen` | 期間締め/再開 |
| `/audit-logs`, `/event-logs` | 監査ログ |
| `/integrity/*` | ハッシュチェーン検証 |

### エンティティライフサイクル（マスタ系）

append-only テーブルのエンティティは以下の状態遷移を辿る。

```
 CREATE ──→ UPDATE ←──→ DELETE(無効化) ──→ PURGE(完全削除)
              ↑              ↓     ↑
              └──────────── RESTORE ┘
```

| 操作 | HTTP | パス | DB 変更 | 可逆 |
|------|------|------|---------|:----:|
| 作成 | `POST` | `/{entity}` | 新 key + revision=1 を INSERT | - |
| 更新 | `PUT` | `/{entity}/{id}` | 同 key で revision+1 を INSERT | Yes (履歴参照) |
| 無効化 | `DELETE` | `/{entity}/{id}` | `is_active=false` の revision を INSERT | Yes |
| 復元 | `POST` | `/{entity}/{id}/restore` | `is_active=true` の revision を INSERT | Yes |
| 完全削除 | `POST` | `/{entity}/{id}/purge` | 全 revision に `valid_to=now()` を SET | **No** |

**状態フラグ**:
- `is_active`: エンティティの論理状態。`false` = 無効化済み（復元可能）
- `valid_to`: bi-temporal の有効期間終了。`NOT NULL` = purge 済み（`current_*` ビューから除外、復元不可）

**参照整合性チェック**:
- 無効化・完全削除時に `canPurge` コールバックで他テーブルからの参照を検査
- 参照されているエンティティは無効化・完全削除ともにブロック（422 エラー）
- `checkReferences(columnName, key, excludeTables)` が `information_schema.columns` を動的に検索

### 伝票作成の入力構造

```json
{
  "idempotency_key": "web:uuid",
  "description": "伝票摘要",
  "journals": [
    {
      "book_id": 1,
      "posted_at": "2025-03-15T00:00:00Z",
      "period_id": 1,
      "journal_type_id": 5,
      "project_id": 1,
      "lines": [
        { "sort_order": 1, "side": "debit", "account_id": 10, "amount": 1000 },
        { "sort_order": 1, "side": "credit", "account_id": 20, "amount": 1000 }
      ],
      "tags": [10, 11]
    }
  ]
}
```

- `journal_type_id`, `tags` は API 入力フィールド。内部的には `entity_category` として保存
- `period_id` は省略可能 — `posted_at` から自動解決

---

## 廃止テーブル (v1 → v3)

| テーブル | 理由 | 移行先 |
|---|---|---|
| `tax_class` | スコープ外 | なし |
| `tenant_setting` | 統合 | tenant.locked_until |
| `journal_header` | 置換 | voucher |
| `account_mapping` | 責務外 | なし |
| `payment_mapping` | 責務外 | なし |
| `journal_attachment` | 未使用 | なし |
| `tag` | 統合 | category (category_type_code='journal_tag') |
| `voucher_type` | 統合 | category (category_type_code='journal_type' 等で拡張可) |
| `journal_type` | 統合 | category (category_type_code='journal_type') |
| `journal_tag` | 統合 | entity_category |
