-- Add "book" layer between tenant and book-scoped master data.
-- book = independent ledger with a single unit (JPY, USD, candy_pcs, ...).
-- Tables moving to book scope: account, fiscal_period, account_mapping, payment_mapping.
-- Tables staying at tenant scope: everything else.

-- ============================================================
-- 1. Create book table
-- ============================================================

CREATE TABLE "data_accounting"."book" (
  "id"         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"  UUID         NOT NULL,
  "code"       TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "name"       TEXT         NOT NULL,
  "unit"       TEXT         NOT NULL,
  "created_by" UUID         NOT NULL,
  "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "book_tenant_code_key" UNIQUE ("tenant_id", "code")
);

-- ============================================================
-- 2. Create default book for each tenant that has accounts
-- ============================================================

INSERT INTO "data_accounting"."book" ("tenant_id", "code", "name", "unit", "created_by")
SELECT DISTINCT
  a.tenant_id,
  'default',
  'Default (JPY)',
  'JPY',
  a.created_by
FROM "data_accounting"."account" a
WHERE NOT EXISTS (
  SELECT 1 FROM "data_accounting"."book" b WHERE b.tenant_id = a.tenant_id
);

-- ============================================================
-- 3. Add book_id to account, fiscal_period, account_mapping, payment_mapping
-- ============================================================

-- account
ALTER TABLE "data_accounting"."account"
  ADD COLUMN "book_id" UUID;

UPDATE "data_accounting"."account" a
SET book_id = b.id
FROM "data_accounting"."book" b
WHERE b.tenant_id = a.tenant_id AND b.code = 'default';

ALTER TABLE "data_accounting"."account"
  ALTER COLUMN "book_id" SET NOT NULL;

-- fiscal_period
ALTER TABLE "data_accounting"."fiscal_period"
  ADD COLUMN "book_id" UUID;

UPDATE "data_accounting"."fiscal_period" fp
SET book_id = b.id
FROM "data_accounting"."book" b
WHERE b.tenant_id = fp.tenant_id AND b.code = 'default';

ALTER TABLE "data_accounting"."fiscal_period"
  ALTER COLUMN "book_id" SET NOT NULL;

-- account_mapping
ALTER TABLE "data_accounting"."account_mapping"
  ADD COLUMN "book_id" UUID;

UPDATE "data_accounting"."account_mapping" am
SET book_id = b.id
FROM "data_accounting"."book" b
WHERE b.tenant_id = am.tenant_id AND b.code = 'default';

ALTER TABLE "data_accounting"."account_mapping"
  ALTER COLUMN "book_id" SET NOT NULL;

-- payment_mapping
ALTER TABLE "data_accounting"."payment_mapping"
  ADD COLUMN "book_id" UUID;

UPDATE "data_accounting"."payment_mapping" pm
SET book_id = b.id
FROM "data_accounting"."book" b
WHERE b.tenant_id = pm.tenant_id AND b.code = 'default';

ALTER TABLE "data_accounting"."payment_mapping"
  ALTER COLUMN "book_id" SET NOT NULL;

-- ============================================================
-- 4. Drop old unique constraints, create new ones with book_id
-- ============================================================

-- account: drop (tenant_id, code, revision), add (book_id, code, revision)
DROP INDEX "data_accounting"."account_tenant_id_code_revision_key";
CREATE UNIQUE INDEX "account_book_id_code_revision_key"
  ON "data_accounting"."account" ("book_id", "code", "revision");

-- fiscal_period: drop (tenant_id, code, revision), add (book_id, code, revision)
DROP INDEX "data_accounting"."fiscal_period_tenant_id_code_revision_key";
CREATE UNIQUE INDEX "fiscal_period_book_id_code_revision_key"
  ON "data_accounting"."fiscal_period" ("book_id", "code", "revision");

-- account_mapping: drop (tenant_id, ...), add (book_id, ...)
DROP INDEX "data_accounting"."account_mapping_tenant_id_source_system_source_field_source_key";
CREATE UNIQUE INDEX "account_mapping_book_id_source_system_source_field_source_v_key"
  ON "data_accounting"."account_mapping" ("book_id", "source_system", "source_field", "source_value", "side", "revision");

-- payment_mapping: drop (tenant_id, ...), add (book_id, ...)
DROP INDEX "data_accounting"."payment_mapping_tenant_id_source_system_payment_method_revi_key";
CREATE UNIQUE INDEX "payment_mapping_book_id_source_system_payment_method_revis_key"
  ON "data_accounting"."payment_mapping" ("book_id", "source_system", "payment_method", "revision");

-- ============================================================
-- 5. Drop tenant_id from book-scoped tables
-- ============================================================

ALTER TABLE "data_accounting"."account" DROP COLUMN "tenant_id";
ALTER TABLE "data_accounting"."fiscal_period" DROP COLUMN "tenant_id";
ALTER TABLE "data_accounting"."account_mapping" DROP COLUMN "tenant_id";
ALTER TABLE "data_accounting"."payment_mapping" DROP COLUMN "tenant_id";

-- ============================================================
-- 6. Recreate views for book-scoped tables
-- ============================================================

-- current_account
DROP VIEW IF EXISTS "data_accounting"."current_account";
CREATE VIEW "data_accounting"."current_account" AS
  SELECT DISTINCT ON (book_id, code)
    id, book_id, code, display_code, revision,
    valid_from, valid_to, created_by, created_at,
    name, is_active, is_leaf, account_type,
    CASE WHEN account_type IN ('asset', 'expense') THEN -1 ELSE 1 END AS sign,
    parent_account_code
  FROM "data_accounting"."account"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY book_id, code, created_at DESC;

-- current_fiscal_period
DROP VIEW IF EXISTS "data_accounting"."current_fiscal_period";
CREATE VIEW "data_accounting"."current_fiscal_period" AS
  SELECT DISTINCT ON (book_id, code)
    id, book_id, code, display_code, revision,
    valid_from, valid_to, created_by, created_at,
    fiscal_year, period_no, start_date, end_date, status
  FROM "data_accounting"."fiscal_period"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY book_id, code, created_at DESC;

-- current_account_mapping
DROP VIEW IF EXISTS "data_accounting"."current_account_mapping";
CREATE VIEW "data_accounting"."current_account_mapping" AS
  SELECT DISTINCT ON (book_id, source_system, source_field, source_value, side)
    id, book_id, source_system, source_field, source_value, side,
    revision, valid_from, valid_to, created_by, created_at,
    is_active, account_code
  FROM "data_accounting"."account_mapping"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY book_id, source_system, source_field, source_value, side, created_at DESC;

-- current_payment_mapping
DROP VIEW IF EXISTS "data_accounting"."current_payment_mapping";
CREATE VIEW "data_accounting"."current_payment_mapping" AS
  SELECT DISTINCT ON (book_id, source_system, payment_method)
    id, book_id, source_system, payment_method,
    revision, valid_from, valid_to, created_by, created_at,
    is_active, account_code
  FROM "data_accounting"."payment_mapping"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY book_id, source_system, payment_method, created_at DESC;

-- ============================================================
-- 7. Update constraint trigger to enforce book-level balance
-- ============================================================

CREATE OR REPLACE FUNCTION "data_accounting".check_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_balance NUMERIC;
  book_violation RECORD;
  group_violation RECORD;
BEGIN
  -- 1. Overall debit-credit balance (existing constraint)
  SELECT SUM(amount) INTO total_balance
  FROM "data_accounting"."journal_line"
  WHERE journal_id = NEW.journal_id;

  IF total_balance <> 0 THEN
    RAISE EXCEPTION 'Journal % is unbalanced: SUM(amount) = %',
      NEW.journal_id, total_balance;
  END IF;

  -- 2. Per-book debit-credit balance
  -- Uses current_account view to resolve account_code → book_id
  SELECT ca.book_id, SUM(jl.amount) AS balance
  INTO book_violation
  FROM "data_accounting"."journal_line" jl
  JOIN "data_accounting"."current_account" ca ON ca.code = jl.account_code
  WHERE jl.journal_id = NEW.journal_id
  GROUP BY ca.book_id
  HAVING SUM(jl.amount) <> 0
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Journal % book % is unbalanced: SUM(amount) = %',
      NEW.journal_id, book_violation.book_id, book_violation.balance;
  END IF;

  -- 3. Same line_group must reference same book
  SELECT jl.line_group
  INTO group_violation
  FROM "data_accounting"."journal_line" jl
  JOIN "data_accounting"."current_account" ca ON ca.code = jl.account_code
  WHERE jl.journal_id = NEW.journal_id
  GROUP BY jl.line_group
  HAVING COUNT(DISTINCT ca.book_id) > 1
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Journal % line_group % spans multiple books',
      NEW.journal_id, group_violation.line_group;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
