-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "data_accounting";

-- CreateTable
CREATE TABLE "data_accounting"."account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display_code" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'JPY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "account_type" TEXT NOT NULL,
    "sign" INTEGER NOT NULL,
    "parent_account_code" TEXT,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display_code" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "tag_type" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."fiscal_period" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display_code" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fiscal_year" INTEGER NOT NULL,
    "period_no" INTEGER NOT NULL,
    "start_date" TIMESTAMPTZ NOT NULL,
    "end_date" TIMESTAMPTZ NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "fiscal_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."department" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display_code" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "parent_department_code" TEXT,
    "department_type" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."tax_class" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "display_code" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "direction" TEXT,
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "deduction_ratio" DECIMAL(5,4),
    "invoice_type" TEXT,

    CONSTRAINT "tax_class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."counterparty" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "display_code" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "qualified_invoice_number" TEXT,
    "is_qualified_issuer" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "counterparty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."tenant_setting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ,

    CONSTRAINT "tenant_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."account_mapping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "source_system" TEXT NOT NULL,
    "source_field" TEXT NOT NULL,
    "source_value" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "account_code" TEXT NOT NULL,

    CONSTRAINT "account_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."payment_mapping" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "source_system" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "valid_from" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "account_code" TEXT NOT NULL,

    CONSTRAINT "payment_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."journal_header" (
    "idempotency_code" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "voucher_code" TEXT,
    "fiscal_period_code" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_header_pkey" PRIMARY KEY ("idempotency_code")
);

-- CreateTable
CREATE TABLE "data_accounting"."journal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "idempotency_code" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "posted_date" TIMESTAMPTZ NOT NULL DEFAULT (now()::date)::timestamptz,
    "journal_type" TEXT NOT NULL DEFAULT 'normal',
    "slip_category" TEXT NOT NULL DEFAULT 'ordinary',
    "adjustment_flag" TEXT NOT NULL DEFAULT 'none',
    "description" TEXT,
    "source_system" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."journal_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "line_group" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,
    "department_code" TEXT,
    "counterparty_code" TEXT,
    "tax_class_code" TEXT,
    "tax_rate" DECIMAL(5,4),
    "is_reduced" BOOLEAN,
    "amount" DECIMAL(15,0) NOT NULL,
    "description" TEXT,

    CONSTRAINT "journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."journal_tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "tag_code" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_accounting"."journal_attachment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "idempotency_code" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_tenant_id_code_revision_key" ON "data_accounting"."account"("tenant_id", "code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "tag_tenant_id_code_revision_key" ON "data_accounting"."tag"("tenant_id", "code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_period_tenant_id_code_revision_key" ON "data_accounting"."fiscal_period"("tenant_id", "code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "department_tenant_id_code_revision_key" ON "data_accounting"."department"("tenant_id", "code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "tax_class_code_revision_key" ON "data_accounting"."tax_class"("code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "counterparty_tenant_id_code_revision_key" ON "data_accounting"."counterparty"("tenant_id", "code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_setting_tenant_id_revision_key" ON "data_accounting"."tenant_setting"("tenant_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "account_mapping_tenant_id_source_system_source_field_source_key" ON "data_accounting"."account_mapping"("tenant_id", "source_system", "source_field", "source_value", "side", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "payment_mapping_tenant_id_source_system_payment_method_revi_key" ON "data_accounting"."payment_mapping"("tenant_id", "source_system", "payment_method", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "journal_header_tenant_id_fiscal_period_code_voucher_code_key" ON "data_accounting"."journal_header"("tenant_id", "fiscal_period_code", "voucher_code");

-- CreateIndex
CREATE UNIQUE INDEX "journal_idempotency_code_revision_key" ON "data_accounting"."journal"("idempotency_code", "revision");

-- AddForeignKey
ALTER TABLE "data_accounting"."journal" ADD CONSTRAINT "journal_idempotency_code_fkey" FOREIGN KEY ("idempotency_code") REFERENCES "data_accounting"."journal_header"("idempotency_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_accounting"."journal_line" ADD CONSTRAINT "journal_line_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "data_accounting"."journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_accounting"."journal_tag" ADD CONSTRAINT "journal_tag_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "data_accounting"."journal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_accounting"."journal_attachment" ADD CONSTRAINT "journal_attachment_idempotency_code_fkey" FOREIGN KEY ("idempotency_code") REFERENCES "data_accounting"."journal_header"("idempotency_code") ON DELETE RESTRICT ON UPDATE CASCADE;
