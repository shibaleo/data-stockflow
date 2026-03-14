-- Drop sign and unit columns from account table.
-- sign is now derived from account_type in the current_account view.
-- unit (always JPY) is not an account-level property.

-- 1. Recreate current_account view with derived sign, without unit
DROP VIEW IF EXISTS "data_accounting"."current_account";
CREATE VIEW "data_accounting"."current_account" AS
  SELECT DISTINCT ON (tenant_id, code)
    id, tenant_id, code, display_code, revision,
    valid_from, valid_to, created_by, created_at,
    name, is_active, is_leaf, account_type,
    CASE WHEN account_type IN ('asset', 'expense') THEN -1 ELSE 1 END AS sign,
    parent_account_code
  FROM "data_accounting"."account"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;

-- 2. Drop CHECK constraint on sign
ALTER TABLE "data_accounting"."account"
  DROP CONSTRAINT IF EXISTS "account_sign_check";

-- 3. Drop columns
ALTER TABLE "data_accounting"."account"
  DROP COLUMN "sign",
  DROP COLUMN "unit";
