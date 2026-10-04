CREATE TYPE "Role" AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE "Priority" AS ENUM ('HAUTE', 'MOYENNE', 'BASSE');
CREATE TYPE "Phase" AS ENUM ('APS', 'APD', 'DCE', 'EXE');
CREATE TYPE "Department" AS ENUM ('STR', 'ECO', 'FLU', 'ELEC', 'VRD', 'BIM');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "intitule" VARCHAR(200) NOT NULL,
  "priorite" "Priority",
  "chef" TEXT,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectLine" (
  "id" TEXT NOT NULL,
  "departement" "Department" NOT NULL,
  "phase" "Phase",
  "delaiJours" INTEGER,
  "dateLivrable" DATE,
  "commentaire" VARCHAR(2000),
  "projectId" TEXT NOT NULL,
  CONSTRAINT "ProjectLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Manager" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Manager_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Project_numero_idx" ON "Project"("numero");
CREATE INDEX "Project_chef_idx" ON "Project"("chef");
CREATE UNIQUE INDEX "ProjectLine_projectId_departement_key" ON "ProjectLine"("projectId", "departement");
CREATE UNIQUE INDEX "Manager_normalized_key" ON "Manager"("normalized");
ALTER TABLE "ProjectLine" ADD CONSTRAINT "ProjectLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
