-- Schema v3: Category system + posted_at on journal
-- Drop and recreate the entire schema

DROP SCHEMA IF EXISTS data_stockflow CASCADE;
CREATE SCHEMA data_stockflow;

-- ============================================================
-- SEQUENCES (11)
-- ============================================================

CREATE SEQUENCE data_stockflow.tenant_key_seq        START WITH 100000000000;
CREATE SEQUENCE data_stockflow.role_key_seq          START WITH 100000000000;
CREATE SEQUENCE data_stockflow.user_key_seq          START WITH 100000000000;
CREATE SEQUENCE data_stockflow.book_key_seq          START WITH 100000000000;
CREATE SEQUENCE data_stockflow.account_key_seq       START WITH 100000000000;
CREATE SEQUENCE data_stockflow.category_key_seq      START WITH 100000000000;
CREATE SEQUENCE data_stockflow.department_key_seq    START WITH 100000000000;
CREATE SEQUENCE data_stockflow.counterparty_key_seq  START WITH 100000000000;
CREATE SEQUENCE data_stockflow.voucher_key_seq       START WITH 100000000000;
CREATE SEQUENCE data_stockflow.journal_key_seq       START WITH 100000000000;
CREATE SEQUENCE data_stockflow.project_key_seq       START WITH 100000000000;
CREATE SEQUENCE data_stockflow.display_account_key_seq START WITH 200000000000;

-- ============================================================
-- TABLES
-- ============================================================

-- ---- tenant ----
CREATE TABLE data_stockflow.tenant (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.tenant_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  name             TEXT NOT NULL,
  locked_until     TIMESTAMPTZ,
  PRIMARY KEY (key, revision)
);

-- ---- role ----
CREATE TABLE data_stockflow.role (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.role_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (key, revision),
  UNIQUE (code, revision)
);

-- ---- "user" (quoted - reserved word) ----
CREATE TABLE data_stockflow."user" (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.user_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  external_id      TEXT,
  tenant_key       BIGINT NOT NULL,
  role_key         BIGINT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (key, revision),
  UNIQUE (tenant_key, code, revision)
);

-- ---- book ----
CREATE TABLE data_stockflow.book (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.book_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  created_by       BIGINT NOT NULL,
  tenant_key       BIGINT NOT NULL,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  unit             TEXT NOT NULL,
  unit_symbol      TEXT NOT NULL DEFAULT '',
  unit_position    TEXT NOT NULL DEFAULT 'left',
  type_labels      JSONB NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (key, revision),
  UNIQUE (tenant_key, code, revision)
);

-- ---- account ----
CREATE TABLE data_stockflow.account (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.account_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  created_by       BIGINT NOT NULL,
  book_key         BIGINT NOT NULL,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  account_type     TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  parent_account_key BIGINT,
  display_account_key BIGINT,
  PRIMARY KEY (key, revision),
  UNIQUE (book_key, code, revision)
);

-- ---- display_account (表示科目 — 勘定科目とは独立した帳票表示用グルーピング) ----
CREATE TABLE data_stockflow.display_account (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.display_account_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  created_by       BIGINT NOT NULL,
  book_key         BIGINT NOT NULL,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  account_type     TEXT NOT NULL,
  parent_key       BIGINT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  authority_level  TEXT NOT NULL DEFAULT 'user',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (key, revision),
  UNIQUE (book_key, code, revision)
);

-- ---- category_type (system seed, no revision) ----
-- 分類軸の定義。role テーブルと同様、変更はマイグレーションのみ。
CREATE TABLE data_stockflow.category_type (
  code             TEXT PRIMARY KEY,
  entity_type      TEXT NOT NULL,
  name             TEXT NOT NULL,
  allow_multiple   BOOLEAN NOT NULL DEFAULT false
);

-- ---- category (tenant-scoped classification values) ----
-- tag, voucher_type, journal_type を統合した汎用分類マスタ。
CREATE TABLE data_stockflow.category (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.category_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  created_by       BIGINT NOT NULL,
  tenant_key       BIGINT NOT NULL,
  category_type_code TEXT NOT NULL REFERENCES data_stockflow.category_type(code),
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  parent_category_key BIGINT,
  PRIMARY KEY (key, revision),
  UNIQUE (tenant_key, category_type_code, code, revision)
);

-- ---- department ----
CREATE TABLE data_stockflow.department (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.department_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  created_by       BIGINT NOT NULL,
  tenant_key       BIGINT NOT NULL,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  department_type  TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  parent_department_key BIGINT,
  PRIMARY KEY (key, revision),
  UNIQUE (tenant_key, code, revision)
);

-- ---- counterparty ----
CREATE TABLE data_stockflow.counterparty (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.counterparty_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  created_by       BIGINT NOT NULL,
  tenant_key       BIGINT NOT NULL,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  parent_counterparty_key BIGINT,
  PRIMARY KEY (key, revision),
  UNIQUE (tenant_key, code, revision)
);

-- ---- project ----
CREATE TABLE data_stockflow.project (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.project_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  created_by       BIGINT NOT NULL,
  tenant_key       BIGINT NOT NULL,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  department_key   BIGINT,
  start_date       TIMESTAMPTZ,
  end_date         TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  parent_project_key BIGINT,
  PRIMARY KEY (key, revision),
  UNIQUE (tenant_key, code, revision)
);

-- ---- voucher (business grouping — no posted_date, no period_key) ----
CREATE TABLE data_stockflow.voucher (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.voucher_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  created_by       BIGINT NOT NULL,
  tenant_key       BIGINT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  voucher_code     TEXT,
  description      TEXT,
  source_system    TEXT,
  sequence_no      INTEGER NOT NULL,
  prev_header_hash TEXT NOT NULL,
  header_hash      TEXT NOT NULL,
  PRIMARY KEY (key, revision)
);

-- Idempotency: unique per tenant on first revision only
CREATE UNIQUE INDEX uq_voucher_idempotency
  ON data_stockflow.voucher (tenant_key, idempotency_key)
  WHERE revision = 1;

-- Conditional unique on voucher_code (only on first revision, non-null)
CREATE UNIQUE INDEX uq_voucher_code
  ON data_stockflow.voucher (tenant_key, voucher_code)
  WHERE voucher_code IS NOT NULL AND revision = 1;

-- ---- journal (posted_at determines period; no FK to period) ----
CREATE TABLE data_stockflow.journal (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.journal_key_seq'),
  revision         INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to         TIMESTAMPTZ,
  lines_hash       TEXT NOT NULL,
  prev_revision_hash TEXT NOT NULL,
  revision_hash    TEXT NOT NULL,
  created_by       BIGINT NOT NULL,
  tenant_key       BIGINT NOT NULL,
  voucher_key      BIGINT NOT NULL,
  book_key         BIGINT NOT NULL,
  posted_at        TIMESTAMPTZ NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  project_key      BIGINT NOT NULL,
  adjustment_flag  TEXT NOT NULL DEFAULT 'none',
  description      TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (key, revision)
);

-- ---- journal_line ----
CREATE TABLE data_stockflow.journal_line (
  uuid             UUID NOT NULL DEFAULT gen_random_uuid(),
  journal_key      BIGINT NOT NULL,
  journal_revision INTEGER NOT NULL,
  tenant_key       BIGINT NOT NULL,
  sort_order       INTEGER NOT NULL,
  side             TEXT NOT NULL,
  account_key      BIGINT NOT NULL,
  department_key   BIGINT,
  counterparty_key BIGINT,
  amount           DECIMAL(15,0) NOT NULL,
  description      TEXT,
  PRIMARY KEY (uuid),
  FOREIGN KEY (journal_key, journal_revision) REFERENCES data_stockflow.journal (key, revision),
  UNIQUE (journal_key, journal_revision, side, sort_order)
);

-- ---- entity_category (polymorphic junction — replaces journal_tag) ----
-- エンティティと分類の紐付。journal のスナップショット分類を含む。
CREATE TABLE data_stockflow.entity_category (
  uuid             UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_key       BIGINT NOT NULL,
  category_type_code TEXT NOT NULL REFERENCES data_stockflow.category_type(code),
  entity_key       BIGINT NOT NULL,
  entity_revision  INTEGER,
  category_key     BIGINT NOT NULL,
  created_by       BIGINT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (uuid)
);

-- allow_multiple=false の category_type に対するユニーク制約
-- 各エンティティに対して _type は 1つだけ
CREATE UNIQUE INDEX uq_entity_category_user_type
  ON data_stockflow.entity_category (tenant_key, entity_key, entity_revision)
  WHERE category_type_code = 'user_type';
CREATE UNIQUE INDEX uq_entity_category_book_type
  ON data_stockflow.entity_category (tenant_key, entity_key, entity_revision)
  WHERE category_type_code = 'book_type';
CREATE UNIQUE INDEX uq_entity_category_account_class
  ON data_stockflow.entity_category (tenant_key, entity_key, entity_revision)
  WHERE category_type_code = 'account_class';
CREATE UNIQUE INDEX uq_entity_category_department_type
  ON data_stockflow.entity_category (tenant_key, entity_key, entity_revision)
  WHERE category_type_code = 'department_type';
CREATE UNIQUE INDEX uq_entity_category_counterparty_type
  ON data_stockflow.entity_category (tenant_key, entity_key, entity_revision)
  WHERE category_type_code = 'counterparty_type';
CREATE UNIQUE INDEX uq_entity_category_project_type
  ON data_stockflow.entity_category (tenant_key, entity_key, entity_revision)
  WHERE category_type_code = 'project_type';
CREATE UNIQUE INDEX uq_entity_category_voucher_type
  ON data_stockflow.entity_category (tenant_key, entity_key, entity_revision)
  WHERE category_type_code = 'voucher_type';
CREATE UNIQUE INDEX uq_entity_category_journal_type
  ON data_stockflow.entity_category (tenant_key, entity_key, entity_revision)
  WHERE category_type_code = 'journal_type';

-- journal_tag の検索用インデックス
CREATE INDEX idx_entity_category_entity
  ON data_stockflow.entity_category (category_type_code, entity_key, entity_revision);

CREATE INDEX idx_entity_category_category
  ON data_stockflow.entity_category (category_key);

-- ---- api_key ----
CREATE TABLE data_stockflow.api_key (
  uuid             UUID NOT NULL DEFAULT gen_random_uuid(),
  user_key         BIGINT NOT NULL,
  tenant_key       BIGINT NOT NULL,
  name             TEXT NOT NULL,
  key_prefix       TEXT NOT NULL,
  key_hash         TEXT NOT NULL,
  role             TEXT NOT NULL,
  expires_at       TIMESTAMPTZ,
  last_used_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (uuid)
);

CREATE INDEX idx_api_key_user ON data_stockflow.api_key (user_key);
CREATE INDEX idx_api_key_prefix ON data_stockflow.api_key (key_prefix);

-- ---- system_log ----
CREATE TABLE data_stockflow.system_log (
  uuid             UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_key       BIGINT,
  user_key         BIGINT NOT NULL,
  user_role        TEXT NOT NULL,
  action           TEXT NOT NULL,
  entity_type      TEXT NOT NULL,
  entity_key       BIGINT NOT NULL,
  revision         INTEGER,
  detail           TEXT,
  source_ip        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (uuid)
);

CREATE INDEX idx_system_log_tenant_created
  ON data_stockflow.system_log (tenant_key, created_at);

CREATE INDEX idx_system_log_entity
  ON data_stockflow.system_log (entity_type, entity_key);

-- ---- event_log ----
CREATE TABLE data_stockflow.event_log (
  uuid             UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_key       BIGINT,
  user_key         BIGINT NOT NULL,
  user_name        TEXT NOT NULL,
  user_role        TEXT NOT NULL,
  action           TEXT NOT NULL,
  entity_type      TEXT NOT NULL,
  entity_key       BIGINT NOT NULL,
  entity_name      TEXT,
  summary          TEXT NOT NULL,
  changes          JSONB,
  source_ip        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (uuid)
);

CREATE INDEX idx_event_log_tenant_created
  ON data_stockflow.event_log (tenant_key, created_at);

CREATE INDEX idx_event_log_entity
  ON data_stockflow.event_log (entity_type, entity_key);

-- ---- entity_color (mutable, no revision tracking) ----
CREATE TABLE data_stockflow.entity_color (
  entity_type      TEXT NOT NULL,
  entity_key       BIGINT NOT NULL,
  color            TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_key)
);

-- ============================================================
-- VIEWS: current_* (latest valid revision)
-- ============================================================

-- current_* views: first get latest revision per key, then filter by temporal validity.
-- This ensures purged entities (valid_to set on latest revision) are excluded,
-- even when older revisions have valid_to IS NULL.

CREATE VIEW data_stockflow.current_tenant AS
SELECT * FROM (
  SELECT DISTINCT ON (key) * FROM data_stockflow.tenant ORDER BY key, created_at DESC
) latest
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now());

CREATE VIEW data_stockflow.current_role AS
SELECT * FROM (
  SELECT DISTINCT ON (key) * FROM data_stockflow.role ORDER BY key, created_at DESC
) latest
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now());

CREATE VIEW data_stockflow.current_user AS
SELECT * FROM (
  SELECT DISTINCT ON (key) * FROM data_stockflow."user" ORDER BY key, created_at DESC
) latest
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now());

CREATE VIEW data_stockflow.current_book AS
SELECT * FROM (
  SELECT DISTINCT ON (key) * FROM data_stockflow.book ORDER BY key, created_at DESC
) latest
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now());

CREATE VIEW data_stockflow.current_account AS
SELECT *,
  CASE WHEN account_type IN ('asset', 'expense') THEN -1 ELSE 1 END AS sign
FROM (
  SELECT DISTINCT ON (key) * FROM data_stockflow.account ORDER BY key, created_at DESC
) latest
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now());

CREATE VIEW data_stockflow.current_display_account AS
SELECT * FROM (
  SELECT DISTINCT ON (key) * FROM data_stockflow.display_account ORDER BY key, created_at DESC
) latest
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now());

CREATE VIEW data_stockflow.current_category AS
SELECT * FROM (
  SELECT DISTINCT ON (key) * FROM data_stockflow.category ORDER BY key, created_at DESC
) latest
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now());

CREATE VIEW data_stockflow.current_department AS
SELECT * FROM (
  SELECT DISTINCT ON (key) * FROM data_stockflow.department ORDER BY key, created_at DESC
) latest
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now());

CREATE VIEW data_stockflow.current_counterparty AS
SELECT * FROM (
  SELECT DISTINCT ON (key) * FROM data_stockflow.counterparty ORDER BY key, created_at DESC
) latest
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now());

CREATE VIEW data_stockflow.current_project AS
SELECT * FROM (
  SELECT DISTINCT ON (key) * FROM data_stockflow.project ORDER BY key, created_at DESC
) latest
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now());

CREATE VIEW data_stockflow.current_voucher AS
SELECT DISTINCT ON (key) *
FROM data_stockflow.voucher
ORDER BY key, revision DESC;

CREATE VIEW data_stockflow.current_journal AS
SELECT * FROM (
  SELECT DISTINCT ON (key) *
  FROM data_stockflow.journal
  ORDER BY key, revision DESC
) latest
WHERE latest.is_active;

-- ============================================================
-- VIEWS: history_* (all revisions chronological)
-- ============================================================

CREATE VIEW data_stockflow.history_tenant AS
SELECT * FROM data_stockflow.tenant ORDER BY key, revision;

CREATE VIEW data_stockflow.history_role AS
SELECT * FROM data_stockflow.role ORDER BY key, revision;

CREATE VIEW data_stockflow.history_user AS
SELECT * FROM data_stockflow."user" ORDER BY key, revision;

CREATE VIEW data_stockflow.history_book AS
SELECT * FROM data_stockflow.book ORDER BY key, revision;

CREATE VIEW data_stockflow.history_account AS
SELECT * FROM data_stockflow.account ORDER BY key, revision;

CREATE VIEW data_stockflow.history_display_account AS
SELECT * FROM data_stockflow.display_account ORDER BY key, revision;

CREATE VIEW data_stockflow.history_category AS
SELECT * FROM data_stockflow.category ORDER BY key, revision;

CREATE VIEW data_stockflow.history_department AS
SELECT * FROM data_stockflow.department ORDER BY key, revision;

CREATE VIEW data_stockflow.history_counterparty AS
SELECT * FROM data_stockflow.counterparty ORDER BY key, revision;

CREATE VIEW data_stockflow.history_project AS
SELECT * FROM data_stockflow.project ORDER BY key, revision;

CREATE VIEW data_stockflow.history_voucher AS
SELECT * FROM data_stockflow.voucher ORDER BY key, revision;

CREATE VIEW data_stockflow.history_journal AS
SELECT * FROM data_stockflow.journal ORDER BY key, revision;

-- ============================================================
-- BOOTSTRAP DATA
-- ============================================================

-- Roles (system seed)
INSERT INTO data_stockflow.role (key, revision, code, name, lines_hash, prev_revision_hash, revision_hash) VALUES
  (nextval('data_stockflow.role_key_seq'), 1, 'platform', 'Platform Admin', 'bootstrap', 'genesis', 'bootstrap'),
  (nextval('data_stockflow.role_key_seq'), 1, 'audit',    'Auditor',        'bootstrap', 'genesis', 'bootstrap'),
  (nextval('data_stockflow.role_key_seq'), 1, 'admin',    'Tenant Admin',   'bootstrap', 'genesis', 'bootstrap'),
  (nextval('data_stockflow.role_key_seq'), 1, 'user',     'User',           'bootstrap', 'genesis', 'bootstrap');

-- Category types (system seed)
-- 各ドメインエンティティに種別（単一）、仕訳のみタグ（複数可）
INSERT INTO data_stockflow.category_type (code, entity_type, name, allow_multiple) VALUES
  ('user_type',         'user',         'ユーザー種別',       false),
  ('book_type',         'book',         '帳簿種別',          false),
  ('account_class',     'account',      '勘定科目分類',       false),
  ('department_type',   'department',   '部門種別',          false),
  ('counterparty_type', 'counterparty', '取引先種別',         false),
  ('project_type',      'project',      'プロジェクト種別',    false),
  ('voucher_type',      'voucher',      '伝票種別',          false),
  ('journal_type',      'journal',      '仕訳種別',          false),
  ('journal_tag',       'journal',      '仕訳タグ',          true);
