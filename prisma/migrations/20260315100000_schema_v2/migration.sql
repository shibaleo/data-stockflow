-- Schema v2: Full rebuild
-- Drop and recreate the entire schema

DROP SCHEMA IF EXISTS data_stockflow CASCADE;
CREATE SCHEMA data_stockflow;

-- ============================================================
-- SEQUENCES (11)
-- ============================================================

CREATE SEQUENCE data_stockflow.tenant_key_seq;
CREATE SEQUENCE data_stockflow.role_key_seq;
CREATE SEQUENCE data_stockflow.user_key_seq;
CREATE SEQUENCE data_stockflow.book_key_seq;
CREATE SEQUENCE data_stockflow.account_key_seq;
CREATE SEQUENCE data_stockflow.fiscal_period_key_seq;
CREATE SEQUENCE data_stockflow.tag_key_seq;
CREATE SEQUENCE data_stockflow.department_key_seq;
CREATE SEQUENCE data_stockflow.counterparty_key_seq;
CREATE SEQUENCE data_stockflow.voucher_key_seq;
CREATE SEQUENCE data_stockflow.journal_key_seq;

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
  external_id      TEXT NOT NULL,
  tenant_key       BIGINT NOT NULL,
  role_key         BIGINT NOT NULL,
  PRIMARY KEY (key, revision)
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
  PRIMARY KEY (key, revision),
  UNIQUE (book_key, code, revision)
);

-- ---- fiscal_period ----
CREATE TABLE data_stockflow.fiscal_period (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.fiscal_period_key_seq'),
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
  start_date       TIMESTAMPTZ NOT NULL,
  end_date         TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  parent_period_key BIGINT,
  PRIMARY KEY (key, revision),
  UNIQUE (book_key, code, revision)
);

-- ---- tag ----
CREATE TABLE data_stockflow.tag (
  key              BIGINT NOT NULL DEFAULT nextval('data_stockflow.tag_key_seq'),
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
  tag_type         TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (key, revision),
  UNIQUE (tenant_key, code, revision)
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
  qualified_invoice_number TEXT,
  is_qualified_issuer BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (key, revision),
  UNIQUE (tenant_key, code, revision)
);

-- ---- voucher ----
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
  idempotency_key  TEXT NOT NULL UNIQUE,
  book_key         BIGINT NOT NULL,
  fiscal_period_key BIGINT NOT NULL,
  voucher_code     TEXT,
  posted_date      TIMESTAMPTZ NOT NULL,
  description      TEXT,
  source_system    TEXT,
  sequence_no      INTEGER NOT NULL,
  prev_header_hash TEXT NOT NULL,
  header_hash      TEXT NOT NULL,
  PRIMARY KEY (key, revision)
);

-- Conditional unique on voucher_code (only when non-null)
CREATE UNIQUE INDEX uq_voucher_code
  ON data_stockflow.voucher (tenant_key, fiscal_period_key, voucher_code)
  WHERE voucher_code IS NOT NULL;

-- ---- journal ----
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
  is_active        BOOLEAN NOT NULL DEFAULT true,
  journal_type     TEXT NOT NULL DEFAULT 'normal',
  slip_category    TEXT NOT NULL DEFAULT 'ordinary',
  adjustment_flag  TEXT NOT NULL DEFAULT 'none',
  description      TEXT,
  PRIMARY KEY (key, revision)
);

-- ---- journal_line ----
CREATE TABLE data_stockflow.journal_line (
  uuid             UUID NOT NULL DEFAULT gen_random_uuid(),
  journal_key      BIGINT NOT NULL,
  journal_revision INTEGER NOT NULL,
  tenant_key       BIGINT NOT NULL,
  line_group       INTEGER NOT NULL,
  side             TEXT NOT NULL,
  account_key      BIGINT NOT NULL,
  department_key   BIGINT,
  counterparty_key BIGINT,
  amount           DECIMAL(15,0) NOT NULL,
  description      TEXT,
  PRIMARY KEY (uuid),
  FOREIGN KEY (journal_key, journal_revision) REFERENCES data_stockflow.journal (key, revision)
);

-- ---- journal_tag ----
CREATE TABLE data_stockflow.journal_tag (
  uuid             UUID NOT NULL DEFAULT gen_random_uuid(),
  journal_key      BIGINT NOT NULL,
  journal_revision INTEGER NOT NULL,
  tenant_key       BIGINT NOT NULL,
  tag_key          BIGINT NOT NULL,
  created_by       BIGINT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (uuid),
  FOREIGN KEY (journal_key, journal_revision) REFERENCES data_stockflow.journal (key, revision)
);

-- ---- audit_log ----
CREATE TABLE data_stockflow.audit_log (
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

CREATE INDEX idx_audit_log_tenant_created
  ON data_stockflow.audit_log (tenant_key, created_at);

CREATE INDEX idx_audit_log_entity
  ON data_stockflow.audit_log (entity_type, entity_key);

-- ============================================================
-- VIEWS: current_* (latest valid revision)
-- ============================================================

CREATE VIEW data_stockflow.current_tenant AS
SELECT DISTINCT ON (key) *
FROM data_stockflow.tenant
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
ORDER BY key, created_at DESC;

CREATE VIEW data_stockflow.current_role AS
SELECT DISTINCT ON (key) *
FROM data_stockflow.role
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
ORDER BY key, created_at DESC;

CREATE VIEW data_stockflow.current_user AS
SELECT DISTINCT ON (key) *
FROM data_stockflow."user"
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
ORDER BY key, created_at DESC;

CREATE VIEW data_stockflow.current_book AS
SELECT DISTINCT ON (key) *
FROM data_stockflow.book
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
ORDER BY key, created_at DESC;

CREATE VIEW data_stockflow.current_account AS
SELECT DISTINCT ON (key) *,
  CASE WHEN account_type IN ('asset', 'expense') THEN -1 ELSE 1 END AS sign
FROM data_stockflow.account
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
ORDER BY key, created_at DESC;

CREATE VIEW data_stockflow.current_fiscal_period AS
SELECT DISTINCT ON (key) *
FROM data_stockflow.fiscal_period
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
ORDER BY key, created_at DESC;

CREATE VIEW data_stockflow.current_tag AS
SELECT DISTINCT ON (key) *
FROM data_stockflow.tag
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
ORDER BY key, created_at DESC;

CREATE VIEW data_stockflow.current_department AS
SELECT DISTINCT ON (key) *
FROM data_stockflow.department
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
ORDER BY key, created_at DESC;

CREATE VIEW data_stockflow.current_counterparty AS
SELECT DISTINCT ON (key) *
FROM data_stockflow.counterparty
WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
ORDER BY key, created_at DESC;

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

CREATE VIEW data_stockflow.history_fiscal_period AS
SELECT * FROM data_stockflow.fiscal_period ORDER BY key, revision;

CREATE VIEW data_stockflow.history_tag AS
SELECT * FROM data_stockflow.tag ORDER BY key, revision;

CREATE VIEW data_stockflow.history_department AS
SELECT * FROM data_stockflow.department ORDER BY key, revision;

CREATE VIEW data_stockflow.history_counterparty AS
SELECT * FROM data_stockflow.counterparty ORDER BY key, revision;

CREATE VIEW data_stockflow.history_journal AS
SELECT * FROM data_stockflow.journal ORDER BY key, revision;

-- ============================================================
-- BOOTSTRAP DATA
-- ============================================================

-- Default tenant
INSERT INTO data_stockflow.tenant (key, revision, name, lines_hash, prev_revision_hash, revision_hash)
VALUES (
  nextval('data_stockflow.tenant_key_seq'), 1, 'Default Tenant',
  'bootstrap', 'genesis', 'bootstrap'
);

-- Roles (4 types)
INSERT INTO data_stockflow.role (key, revision, code, name, lines_hash, prev_revision_hash, revision_hash) VALUES
  (nextval('data_stockflow.role_key_seq'), 1, 'platform', 'Platform Admin', 'bootstrap', 'genesis', 'bootstrap'),
  (nextval('data_stockflow.role_key_seq'), 1, 'audit', 'Auditor', 'bootstrap', 'genesis', 'bootstrap'),
  (nextval('data_stockflow.role_key_seq'), 1, 'admin', 'Tenant Admin', 'bootstrap', 'genesis', 'bootstrap'),
  (nextval('data_stockflow.role_key_seq'), 1, 'user', 'User', 'bootstrap', 'genesis', 'bootstrap');

-- Initial user (Clerk sub = placeholder, tenant_key=1, role_key=1 = platform)
INSERT INTO data_stockflow."user" (key, revision, external_id, tenant_key, role_key, lines_hash, prev_revision_hash, revision_hash)
VALUES (
  nextval('data_stockflow.user_key_seq'), 1, 'clerk_placeholder',
  1, 1,
  'bootstrap', 'genesis', 'bootstrap'
);
