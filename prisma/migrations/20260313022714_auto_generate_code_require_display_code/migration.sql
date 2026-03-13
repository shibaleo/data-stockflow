/*
  Warnings:

  - Made the column `display_code` on table `account` required. This step will fail if there are existing NULL values in that column.
  - Made the column `display_code` on table `counterparty` required. This step will fail if there are existing NULL values in that column.
  - Made the column `display_code` on table `department` required. This step will fail if there are existing NULL values in that column.
  - Made the column `display_code` on table `fiscal_period` required. This step will fail if there are existing NULL values in that column.
  - Made the column `display_code` on table `tag` required. This step will fail if there are existing NULL values in that column.
  - Made the column `display_code` on table `tax_class` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill: copy code → display_code where NULL
UPDATE "data_accounting"."account" SET display_code = code WHERE display_code IS NULL;
UPDATE "data_accounting"."counterparty" SET display_code = code WHERE display_code IS NULL;
UPDATE "data_accounting"."department" SET display_code = code WHERE display_code IS NULL;
UPDATE "data_accounting"."fiscal_period" SET display_code = code WHERE display_code IS NULL;
UPDATE "data_accounting"."tag" SET display_code = code WHERE display_code IS NULL;
UPDATE "data_accounting"."tax_class" SET display_code = code WHERE display_code IS NULL;

-- AlterTable
ALTER TABLE "data_accounting"."account" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text,
ALTER COLUMN "display_code" SET NOT NULL;

-- AlterTable
ALTER TABLE "data_accounting"."counterparty" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text,
ALTER COLUMN "display_code" SET NOT NULL;

-- AlterTable
ALTER TABLE "data_accounting"."department" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text,
ALTER COLUMN "display_code" SET NOT NULL;

-- AlterTable
ALTER TABLE "data_accounting"."fiscal_period" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text,
ALTER COLUMN "display_code" SET NOT NULL;

-- AlterTable
ALTER TABLE "data_accounting"."journal" ALTER COLUMN "posted_date" SET DEFAULT (now()::date)::timestamptz;

-- AlterTable
ALTER TABLE "data_accounting"."tag" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text,
ALTER COLUMN "display_code" SET NOT NULL;

-- AlterTable
ALTER TABLE "data_accounting"."tax_class" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text,
ALTER COLUMN "display_code" SET NOT NULL;
