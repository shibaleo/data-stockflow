-- Hash Chain: journal_header columns
ALTER TABLE "data_stockflow"."journal_header"
  ADD COLUMN "sequence_no" INTEGER,
  ADD COLUMN "prev_header_hash" TEXT,
  ADD COLUMN "header_hash" TEXT;

CREATE UNIQUE INDEX "journal_header_tenant_id_sequence_no_key"
  ON "data_stockflow"."journal_header" ("tenant_id", "sequence_no");

-- Hash Chain: journal columns
ALTER TABLE "data_stockflow"."journal"
  ADD COLUMN "lines_hash" TEXT,
  ADD COLUMN "prev_revision_hash" TEXT,
  ADD COLUMN "revision_hash" TEXT;

-- Backfill existing data as PRE_CHAIN
WITH numbered AS (
  SELECT idempotency_code, tenant_id,
    ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at, idempotency_code) AS rn
  FROM "data_stockflow"."journal_header"
)
UPDATE "data_stockflow"."journal_header" jh
SET sequence_no = n.rn,
    prev_header_hash = 'PRE_CHAIN',
    header_hash = 'PRE_CHAIN'
FROM numbered n
WHERE jh.idempotency_code = n.idempotency_code;

UPDATE "data_stockflow"."journal"
SET lines_hash = 'PRE_CHAIN',
    prev_revision_hash = 'PRE_CHAIN',
    revision_hash = 'PRE_CHAIN';

-- Set NOT NULL after backfill
ALTER TABLE "data_stockflow"."journal_header"
  ALTER COLUMN "sequence_no" SET NOT NULL,
  ALTER COLUMN "prev_header_hash" SET NOT NULL,
  ALTER COLUMN "header_hash" SET NOT NULL;

ALTER TABLE "data_stockflow"."journal"
  ALTER COLUMN "lines_hash" SET NOT NULL,
  ALTER COLUMN "prev_revision_hash" SET NOT NULL,
  ALTER COLUMN "revision_hash" SET NOT NULL;
