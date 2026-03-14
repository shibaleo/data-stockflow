-- Book をバイテンポラル化 + child tables を book_id (UUID FK) → book_code (text identity) に移行

-- ============================================================
-- 1. Book テーブルにバイテンポラルカラム追加
-- ============================================================

ALTER TABLE "data_accounting"."book"
  ADD COLUMN "display_code" TEXT,
  ADD COLUMN "revision" INT NOT NULL DEFAULT 1,
  ADD COLUMN "valid_from" TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN "valid_to" TIMESTAMPTZ,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- display_code を code からバックフィル
UPDATE "data_accounting"."book" SET display_code = code WHERE display_code IS NULL;
ALTER TABLE "data_accounting"."book" ALTER COLUMN "display_code" SET NOT NULL;

-- ============================================================
-- 2. Child tables: book_id → book_code に切り替え
-- ============================================================

-- account
ALTER TABLE "data_accounting"."account" ADD COLUMN "book_code" TEXT;
UPDATE "data_accounting"."account" a
  SET book_code = b.code
  FROM "data_accounting"."book" b
  WHERE b.id = a.book_id;
ALTER TABLE "data_accounting"."account" ALTER COLUMN "book_code" SET NOT NULL;

-- fiscal_period
ALTER TABLE "data_accounting"."fiscal_period" ADD COLUMN "book_code" TEXT;
UPDATE "data_accounting"."fiscal_period" fp
  SET book_code = b.code
  FROM "data_accounting"."book" b
  WHERE b.id = fp.book_id;
ALTER TABLE "data_accounting"."fiscal_period" ALTER COLUMN "book_code" SET NOT NULL;

-- account_mapping
ALTER TABLE "data_accounting"."account_mapping" ADD COLUMN "book_code" TEXT;
UPDATE "data_accounting"."account_mapping" am
  SET book_code = b.code
  FROM "data_accounting"."book" b
  WHERE b.id = am.book_id;
ALTER TABLE "data_accounting"."account_mapping" ALTER COLUMN "book_code" SET NOT NULL;

-- payment_mapping
ALTER TABLE "data_accounting"."payment_mapping" ADD COLUMN "book_code" TEXT;
UPDATE "data_accounting"."payment_mapping" pm
  SET book_code = b.code
  FROM "data_accounting"."book" b
  WHERE b.id = pm.book_id;
ALTER TABLE "data_accounting"."payment_mapping" ALTER COLUMN "book_code" SET NOT NULL;

-- ============================================================
-- 3. Unique constraints: book_id → book_code
-- ============================================================

-- Book: drop old (tenant_id, code) unique, add (tenant_id, code, revision)
ALTER TABLE "data_accounting"."book" DROP CONSTRAINT "book_tenant_code_key";
CREATE UNIQUE INDEX "book_tenant_id_code_revision_key"
  ON "data_accounting"."book" ("tenant_id", "code", "revision");

-- Account: drop (book_id, code, revision), add (book_code, code, revision)
DROP INDEX "data_accounting"."account_book_id_code_revision_key";
CREATE UNIQUE INDEX "account_book_code_code_revision_key"
  ON "data_accounting"."account" ("book_code", "code", "revision");

-- FiscalPeriod: drop (book_id, code, revision), add (book_code, code, revision)
DROP INDEX "data_accounting"."fiscal_period_book_id_code_revision_key";
CREATE UNIQUE INDEX "fiscal_period_book_code_code_revision_key"
  ON "data_accounting"."fiscal_period" ("book_code", "code", "revision");

-- AccountMapping: drop (book_id, ...), add (book_code, ...)
DROP INDEX "data_accounting"."account_mapping_book_id_source_system_source_field_source_v_key";
CREATE UNIQUE INDEX "account_mapping_book_code_source_system_source_field_sourc_key"
  ON "data_accounting"."account_mapping" ("book_code", "source_system", "source_field", "source_value", "side", "revision");

-- PaymentMapping: drop (book_id, ...), add (book_code, ...)
DROP INDEX "data_accounting"."payment_mapping_book_id_source_system_payment_method_revis_key";
CREATE UNIQUE INDEX "payment_mapping_book_code_source_system_payment_method_rev_key"
  ON "data_accounting"."payment_mapping" ("book_code", "source_system", "payment_method", "revision");

-- ============================================================
-- 4. Drop book_id FK columns from child tables
-- ============================================================

ALTER TABLE "data_accounting"."account" DROP COLUMN "book_id";
ALTER TABLE "data_accounting"."fiscal_period" DROP COLUMN "book_id";
ALTER TABLE "data_accounting"."account_mapping" DROP COLUMN "book_id";
ALTER TABLE "data_accounting"."payment_mapping" DROP COLUMN "book_id";

-- ============================================================
-- 5. Create / Recreate views
-- ============================================================

-- current_book (new)
CREATE VIEW "data_accounting"."current_book" AS
  SELECT DISTINCT ON (tenant_id, code)
    id, tenant_id, code, display_code, revision,
    valid_from, valid_to, created_by, created_at,
    name, unit, type_labels, is_active
  FROM "data_accounting"."book"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;

-- current_account: book_id → book_code
DROP VIEW IF EXISTS "data_accounting"."current_account";
CREATE VIEW "data_accounting"."current_account" AS
  SELECT DISTINCT ON (book_code, code)
    id, book_code, code, display_code, revision,
    valid_from, valid_to, created_by, created_at,
    name, is_active, is_leaf, account_type,
    CASE WHEN account_type IN ('asset', 'expense') THEN -1 ELSE 1 END AS sign,
    parent_account_code
  FROM "data_accounting"."account"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY book_code, code, created_at DESC;

-- current_fiscal_period: book_id → book_code
DROP VIEW IF EXISTS "data_accounting"."current_fiscal_period";
CREATE VIEW "data_accounting"."current_fiscal_period" AS
  SELECT DISTINCT ON (book_code, code)
    id, book_code, code, display_code, revision,
    valid_from, valid_to, created_by, created_at,
    fiscal_year, period_no, start_date, end_date, status
  FROM "data_accounting"."fiscal_period"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY book_code, code, created_at DESC;

-- current_account_mapping: book_id → book_code
DROP VIEW IF EXISTS "data_accounting"."current_account_mapping";
CREATE VIEW "data_accounting"."current_account_mapping" AS
  SELECT DISTINCT ON (book_code, source_system, source_field, source_value, side)
    id, book_code, source_system, source_field, source_value, side,
    revision, valid_from, valid_to, created_by, created_at,
    is_active, account_code
  FROM "data_accounting"."account_mapping"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY book_code, source_system, source_field, source_value, side, created_at DESC;

-- current_payment_mapping: book_id → book_code
DROP VIEW IF EXISTS "data_accounting"."current_payment_mapping";
CREATE VIEW "data_accounting"."current_payment_mapping" AS
  SELECT DISTINCT ON (book_code, source_system, payment_method)
    id, book_code, source_system, payment_method,
    revision, valid_from, valid_to, created_by, created_at,
    is_active, account_code
  FROM "data_accounting"."payment_mapping"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY book_code, source_system, payment_method, created_at DESC;

-- ============================================================
-- 6. Update check_journal_balance trigger (book_id → book_code)
-- ============================================================

CREATE OR REPLACE FUNCTION "data_accounting".check_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_balance NUMERIC;
  book_violation RECORD;
  group_violation RECORD;
BEGIN
  -- 1. Overall debit-credit balance
  SELECT SUM(amount) INTO total_balance
  FROM "data_accounting"."journal_line"
  WHERE journal_id = NEW.journal_id;

  IF total_balance <> 0 THEN
    RAISE EXCEPTION 'Journal % is unbalanced: SUM(amount) = %',
      NEW.journal_id, total_balance;
  END IF;

  -- 2. Per-book debit-credit balance
  SELECT ca.book_code, SUM(jl.amount) AS balance
  INTO book_violation
  FROM "data_accounting"."journal_line" jl
  JOIN "data_accounting"."current_account" ca ON ca.code = jl.account_code
  WHERE jl.journal_id = NEW.journal_id
  GROUP BY ca.book_code
  HAVING SUM(jl.amount) <> 0
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Journal % book % is unbalanced: SUM(amount) = %',
      NEW.journal_id, book_violation.book_code, book_violation.balance;
  END IF;

  -- 3. Same line_group must reference same book
  SELECT jl.line_group
  INTO group_violation
  FROM "data_accounting"."journal_line" jl
  JOIN "data_accounting"."current_account" ca ON ca.code = jl.account_code
  WHERE jl.journal_id = NEW.journal_id
  GROUP BY jl.line_group
  HAVING COUNT(DISTINCT ca.book_code) > 1
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Journal % line_group % spans multiple books',
      NEW.journal_id, group_violation.line_group;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
