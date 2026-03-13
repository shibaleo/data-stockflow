-- CHECK制約（Prisma が生成しないもの）

-- account
ALTER TABLE "data_accounting"."account"
  ADD CONSTRAINT "account_account_type_check"
    CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  ADD CONSTRAINT "account_sign_check"
    CHECK (sign IN (1, -1));

-- fiscal_period
ALTER TABLE "data_accounting"."fiscal_period"
  ADD CONSTRAINT "fiscal_period_status_check"
    CHECK (status IN ('open', 'closed', 'finalized'));

-- tax_class
ALTER TABLE "data_accounting"."tax_class"
  ADD CONSTRAINT "tax_class_direction_check"
    CHECK (direction IN ('purchase', 'sale')),
  ADD CONSTRAINT "tax_class_invoice_type_check"
    CHECK (invoice_type IN ('qualified', 'transitional_80', 'transitional_50', 'none'));

-- account_mapping
ALTER TABLE "data_accounting"."account_mapping"
  ADD CONSTRAINT "account_mapping_side_check"
    CHECK (side IN ('debit', 'credit'));

-- journal
ALTER TABLE "data_accounting"."journal"
  ADD CONSTRAINT "journal_journal_type_check"
    CHECK (journal_type IN ('normal', 'closing', 'prior_adj', 'auto')),
  ADD CONSTRAINT "journal_slip_category_check"
    CHECK (slip_category IN ('ordinary', 'transfer', 'receipt', 'payment')),
  ADD CONSTRAINT "journal_adjustment_flag_check"
    CHECK (adjustment_flag IN ('none', 'monthly_adj', 'year_end_adj'));

-- journal_line
ALTER TABLE "data_accounting"."journal_line"
  ADD CONSTRAINT "journal_line_side_check"
    CHECK (side IN ('debit', 'credit')),
  ADD CONSTRAINT "journal_line_amount_check"
    CHECK (amount <> 0);

-- ============================================================
-- current_* ビュー（10個）
-- ============================================================

CREATE VIEW "data_accounting"."current_account" AS
  SELECT DISTINCT ON (tenant_id, code) *
  FROM "data_accounting"."account"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;

CREATE VIEW "data_accounting"."current_tag" AS
  SELECT DISTINCT ON (tenant_id, code) *
  FROM "data_accounting"."tag"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;

CREATE VIEW "data_accounting"."current_fiscal_period" AS
  SELECT DISTINCT ON (tenant_id, code) *
  FROM "data_accounting"."fiscal_period"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;

CREATE VIEW "data_accounting"."current_department" AS
  SELECT DISTINCT ON (tenant_id, code) *
  FROM "data_accounting"."department"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;

CREATE VIEW "data_accounting"."current_tax_class" AS
  SELECT DISTINCT ON (code) *
  FROM "data_accounting"."tax_class"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY code, created_at DESC;

CREATE VIEW "data_accounting"."current_counterparty" AS
  SELECT DISTINCT ON (tenant_id, code) *
  FROM "data_accounting"."counterparty"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;

CREATE VIEW "data_accounting"."current_tenant_setting" AS
  SELECT DISTINCT ON (tenant_id) *
  FROM "data_accounting"."tenant_setting"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, created_at DESC;

CREATE VIEW "data_accounting"."current_account_mapping" AS
  SELECT DISTINCT ON (tenant_id, source_system, source_field, source_value, side) *
  FROM "data_accounting"."account_mapping"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, source_system, source_field, source_value, side, created_at DESC;

CREATE VIEW "data_accounting"."current_payment_mapping" AS
  SELECT DISTINCT ON (tenant_id, source_system, payment_method) *
  FROM "data_accounting"."payment_mapping"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, source_system, payment_method, created_at DESC;

CREATE VIEW "data_accounting"."current_journal" AS
  SELECT *
  FROM (
    SELECT DISTINCT ON (j.tenant_id, j.idempotency_code)
      jh.voucher_code,
      jh.fiscal_period_code,
      j.*
    FROM "data_accounting"."journal" j
    JOIN "data_accounting"."journal_header" jh ON jh.idempotency_code = j.idempotency_code
    ORDER BY j.tenant_id, j.idempotency_code, j.revision DESC
  ) latest
  WHERE latest.is_active;

-- ============================================================
-- Constraint Trigger: SUM(amount) = 0
-- ============================================================

CREATE OR REPLACE FUNCTION "data_accounting".check_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
  balance NUMERIC;
BEGIN
  SELECT SUM(amount) INTO balance
  FROM "data_accounting"."journal_line"
  WHERE journal_id = NEW.journal_id;

  IF balance <> 0 THEN
    RAISE EXCEPTION 'Journal % is unbalanced: SUM(amount) = %',
      NEW.journal_id, balance;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_check_journal_balance
  AFTER INSERT ON "data_accounting"."journal_line"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "data_accounting".check_journal_balance();
