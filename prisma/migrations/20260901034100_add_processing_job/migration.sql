-- Additive migration for production databases created via db push.
-- Creates ProcessingJob and its enums only. Does not drop or alter existing tables or rows.
-- Idempotent so a partially applied attempt can be retried after P3009 / --rolled-back.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ProcessingJobType" AS ENUM ('VIDEO_IMPORT', 'VIDEO_PROCESSING', 'TRANSCRIPTION', 'AI_ANALYSIS', 'CLIP_GENERATION', 'RENDER', 'SOCIAL_PUBLISHING', 'ANALYTICS_SYNC', 'LIVE_MONITOR', 'NOTIFICATIONS', 'EXTRACT_AUDIO', 'BULK_DOWNLOAD');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "JobStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED', 'CANCELED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessingJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" "ProcessingJobType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'WAITING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessingJob_workspaceId_createdAt_idx" ON "ProcessingJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessingJob_entityId_type_idx" ON "ProcessingJob"("entityId", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessingJob_status_idx" ON "ProcessingJob"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessingJob_workspaceId_status_idx" ON "ProcessingJob"("workspaceId", "status");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
