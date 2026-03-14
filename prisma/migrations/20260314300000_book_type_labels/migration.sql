-- Add type_labels JSONB column to book table.
-- Stores custom display names for the 5 account types per book.
-- Example: {"asset":"在庫","revenue":"入荷"}

ALTER TABLE "data_accounting"."book"
  ADD COLUMN "type_labels" JSONB NOT NULL DEFAULT '{}';
