-- AlterTable
ALTER TABLE "data_accounting"."account" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "data_accounting"."counterparty" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "data_accounting"."department" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "data_accounting"."fiscal_period" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "data_accounting"."journal" ALTER COLUMN "posted_date" SET DEFAULT (now()::date)::timestamptz;

-- AlterTable
ALTER TABLE "data_accounting"."tag" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "data_accounting"."tax_class" ALTER COLUMN "code" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "data_accounting"."audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "user_id" UUID NOT NULL,
    "user_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_code" TEXT NOT NULL,
    "revision" INTEGER,
    "detail" TEXT,
    "source_ip" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_created_at_idx" ON "data_accounting"."audit_log"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_code_idx" ON "data_accounting"."audit_log"("entity_type", "entity_code");
