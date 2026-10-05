-- AlterTable: temporary-password lifecycle flag, defaults false so existing rows are unaffected
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: additive column to persist per-priority-group ordering
ALTER TABLE "Project" ADD COLUMN "priorityOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: deterministic initial positions per priority group, preserving the
-- product's existing stable order (createdAt, then id as a tie-breaker). The
-- partition is keyed on the "priorite" column value itself, so it does not
-- depend on the enum's declared ordering in Postgres.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "priorite"
    ORDER BY "createdAt" ASC, "id" ASC
  ) - 1 AS "rn"
  FROM "Project"
)
UPDATE "Project" AS p
SET "priorityOrder" = ranked."rn"
FROM ranked
WHERE p."id" = ranked."id";

-- CreateIndex
CREATE INDEX "Project_priorite_priorityOrder_idx" ON "Project"("priorite", "priorityOrder");

-- CreateTable: stores the single current Excel import template (binary + metadata)
CREATE TABLE "ExcelTemplate" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedBy" TEXT NOT NULL,
  CONSTRAINT "ExcelTemplate_pkey" PRIMARY KEY ("id")
);
