-- AlterTable
ALTER TABLE "data_accounting"."journal" ALTER COLUMN "posted_date" SET DEFAULT (now()::date)::timestamptz;
