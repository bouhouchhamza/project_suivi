-- CreateTable: stores the single current Excel import template (binary + metadata)
CREATE TABLE "ExcelTemplate" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "content" BYTEA NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedBy" TEXT NOT NULL,
  CONSTRAINT "ExcelTemplate_pkey" PRIMARY KEY ("id")
);
