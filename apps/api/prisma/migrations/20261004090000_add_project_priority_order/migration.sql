-- AlterTable: additive column to persist per-priority-group ordering
ALTER TABLE "Project" ADD COLUMN "priorityOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: deterministic initial positions per priority group, preserving
-- current stable order (createdAt, then id as a tie-breaker).
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
