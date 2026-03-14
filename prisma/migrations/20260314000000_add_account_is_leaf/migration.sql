-- Add is_leaf column to account table
ALTER TABLE "data_accounting"."account"
  ADD COLUMN "is_leaf" BOOLEAN NOT NULL DEFAULT true;

-- Set is_leaf=false for accounts that have children in their latest revision
UPDATE "data_accounting"."account" a
SET is_leaf = false
WHERE EXISTS (
  SELECT 1
  FROM "data_accounting"."current_account" child
  WHERE child.parent_account_code = a.code
    AND child.tenant_id = a.tenant_id
    AND child.is_active = true
);

-- Recreate current_account view to include is_leaf
DROP VIEW IF EXISTS "data_accounting"."current_account";
CREATE VIEW "data_accounting"."current_account" AS
  SELECT DISTINCT ON (tenant_id, code) *
  FROM "data_accounting"."account"
  WHERE valid_from <= now()
    AND (valid_to IS NULL OR valid_to > now())
  ORDER BY tenant_id, code, created_at DESC;
