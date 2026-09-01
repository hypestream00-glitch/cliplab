-- Legacy production snapshot: isolated ProcessingJob migration only.
-- Used in tests to simulate Railway after 20260901034100 was applied without the rest of the schema.

DO $$ BEGIN
    CREATE TYPE "ProcessingJobType" AS ENUM ('VIDEO_IMPORT', 'VIDEO_PROCESSING', 'TRANSCRIPTION', 'AI_ANALYSIS', 'CLIP_GENERATION', 'RENDER', 'SOCIAL_PUBLISHING', 'ANALYTICS_SYNC', 'LIVE_MONITOR', 'NOTIFICATIONS', 'EXTRACT_AUDIO', 'BULK_DOWNLOAD');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "JobStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED', 'CANCELED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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

CREATE INDEX IF NOT EXISTS "ProcessingJob_workspaceId_createdAt_idx" ON "ProcessingJob"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProcessingJob_entityId_type_idx" ON "ProcessingJob"("entityId", "type");
CREATE INDEX IF NOT EXISTS "ProcessingJob_status_idx" ON "ProcessingJob"("status");
CREATE INDEX IF NOT EXISTS "ProcessingJob_workspaceId_status_idx" ON "ProcessingJob"("workspaceId", "status");
