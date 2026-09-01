-- Additive competitions + trending. No drops, no data rewrites.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMPETITION';

DO $$ BEGIN
  CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'FINALIZING', 'FINISHED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CompetitionPrizeMode" AS ENUM ('RANKING', 'VIEWS', 'HYBRID');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CompetitionParticipantStatus" AS ENUM ('ACTIVE', 'DISQUALIFIED', 'LEFT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CompetitionSubmissionStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'REMOVED', 'FLAGGED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CompetitionPayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bannerUrl" TEXT,
    "prizePoolCents" INTEGER NOT NULL,
    "prizeMode" "CompetitionPrizeMode" NOT NULL DEFAULT 'RANKING',
    "rankingBudgetCents" INTEGER NOT NULL DEFAULT 0,
    "viewsBudgetCents" INTEGER NOT NULL DEFAULT 0,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allowedPlatforms" TEXT[],
    "maxClipsPerParticipant" INTEGER NOT NULL DEFAULT 20,
    "rules" TEXT,
    "requiredHashtags" TEXT[],
    "requiredText" TEXT,
    "createdById" TEXT NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "metricsSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Competition_slug_key" ON "Competition"("slug");
CREATE INDEX "Competition_status_startsAt_idx" ON "Competition"("status", "startsAt");
CREATE INDEX "Competition_endsAt_idx" ON "Competition"("endsAt");

CREATE TABLE "CompetitionPrizeRule" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "position" INTEGER,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "viewsRequired" INTEGER,
    "viewsPerUnit" INTEGER,
    "amountPerUnitCents" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompetitionPrizeRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompetitionPrizeRule_competitionId_kind_sortOrder_idx" ON "CompetitionPrizeRule"("competitionId", "kind", "sortOrder");

CREATE TABLE "CompetitionParticipant" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "CompetitionParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disqualifiedAt" TIMESTAMP(3),
    "disqualifyReason" TEXT,

    CONSTRAINT "CompetitionParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionParticipant_competitionId_userId_key" ON "CompetitionParticipant"("competitionId", "userId");
CREATE INDEX "CompetitionParticipant_competitionId_status_idx" ON "CompetitionParticipant"("competitionId", "status");

CREATE TABLE "CompetitionSubmission" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "publicationId" TEXT,
    "clipId" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "postExternalId" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "status" "CompetitionSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "flagReason" TEXT,
    "latestViews" INTEGER,
    "latestLikes" INTEGER,
    "latestComments" INTEGER,
    "latestShares" INTEGER,
    "metricsAvailable" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetitionSubmission_competitionId_platform_postExternalId_key" ON "CompetitionSubmission"("competitionId", "platform", "postExternalId");
CREATE INDEX "CompetitionSubmission_competitionId_status_idx" ON "CompetitionSubmission"("competitionId", "status");
CREATE INDEX "CompetitionSubmission_participantId_idx" ON "CompetitionSubmission"("participantId");
CREATE INDEX "CompetitionSubmission_socialAccountId_idx" ON "CompetitionSubmission"("socialAccountId");

CREATE TABLE "CompetitionSubmissionMetric" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "available" JSONB,

    CONSTRAINT "CompetitionSubmissionMetric_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompetitionSubmissionMetric_submissionId_capturedAt_idx" ON "CompetitionSubmissionMetric"("submissionId", "capturedAt");

CREATE TABLE "CompetitionOfficialSource" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "sourceUrl" TEXT,
    "platform" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompetitionOfficialSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompetitionOfficialSource_competitionId_idx" ON "CompetitionOfficialSource"("competitionId");

CREATE TABLE "CompetitionPayout" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "position" INTEGER,
    "status" "CompetitionPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionPayout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompetitionPayout_competitionId_status_idx" ON "CompetitionPayout"("competitionId", "status");
CREATE INDEX "CompetitionPayout_userId_idx" ON "CompetitionPayout"("userId");

CREATE TABLE "CompetitionAuditLog" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompetitionAuditLog_competitionId_createdAt_idx" ON "CompetitionAuditLog"("competitionId", "createdAt");

CREATE TABLE "TrendingItem" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Outros',
    "title" TEXT NOT NULL,
    "creatorName" TEXT,
    "thumbnailUrl" TEXT,
    "canonicalUrl" TEXT,
    "externalId" TEXT,
    "durationSeconds" INTEGER,
    "viewCount" INTEGER,
    "views24h" INTEGER,
    "views7d" INTEGER,
    "engagement" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "projectId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendingItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrendingItem_active_platform_category_idx" ON "TrendingItem"("active", "platform", "category");
CREATE INDEX "TrendingItem_publishedAt_idx" ON "TrendingItem"("publishedAt");

CREATE TABLE "TrendingScore" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "score" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "inputs" JSONB,

    CONSTRAINT "TrendingScore_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrendingScore_itemId_computedAt_idx" ON "TrendingScore"("itemId", "computedAt");

ALTER TABLE "Competition" ADD CONSTRAINT "Competition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompetitionPrizeRule" ADD CONSTRAINT "CompetitionPrizeRule_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionParticipant" ADD CONSTRAINT "CompetitionParticipant_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionParticipant" ADD CONSTRAINT "CompetitionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionParticipant" ADD CONSTRAINT "CompetitionParticipant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionSubmission" ADD CONSTRAINT "CompetitionSubmission_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionSubmission" ADD CONSTRAINT "CompetitionSubmission_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CompetitionParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionSubmission" ADD CONSTRAINT "CompetitionSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionSubmission" ADD CONSTRAINT "CompetitionSubmission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionSubmission" ADD CONSTRAINT "CompetitionSubmission_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionSubmission" ADD CONSTRAINT "CompetitionSubmission_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "SocialPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompetitionSubmission" ADD CONSTRAINT "CompetitionSubmission_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompetitionSubmissionMetric" ADD CONSTRAINT "CompetitionSubmissionMetric_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CompetitionSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionOfficialSource" ADD CONSTRAINT "CompetitionOfficialSource_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionOfficialSource" ADD CONSTRAINT "CompetitionOfficialSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompetitionPayout" ADD CONSTRAINT "CompetitionPayout_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionPayout" ADD CONSTRAINT "CompetitionPayout_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CompetitionParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionPayout" ADD CONSTRAINT "CompetitionPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionAuditLog" ADD CONSTRAINT "CompetitionAuditLog_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionAuditLog" ADD CONSTRAINT "CompetitionAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrendingScore" ADD CONSTRAINT "TrendingScore_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TrendingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
