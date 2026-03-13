-- AlterTable
ALTER TABLE "data_accounting"."journal" ALTER COLUMN "posted_date" SET DEFAULT (now()::date)::timestamptz;

-- CreateTable
CREATE TABLE "data_accounting"."tenant_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" TEXT NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_user_external_id_key" ON "data_accounting"."tenant_user"("external_id");
