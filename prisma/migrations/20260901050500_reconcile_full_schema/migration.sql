-- CLIPLAB full-schema reconciliation.
-- 20260901034100_add_processing_job is already applied in production and will not re-run.
-- This additive migration creates any missing enums/tables/indexes/FKs for the current Prisma schema.
-- Safe on empty databases and on partial Railway databases. Does not drop or wipe data.

CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'SUPER_ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'USER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'TEAM', 'AGENCY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "WorkspaceType" ADD VALUE IF NOT EXISTS 'PERSONAL';
ALTER TYPE "WorkspaceType" ADD VALUE IF NOT EXISTS 'TEAM';
ALTER TYPE "WorkspaceType" ADD VALUE IF NOT EXISTS 'AGENCY';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'EDITOR';
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'VIEWER';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "InvitationStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "InvitationStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "InvitationStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "InvitationStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ProjectStatus" AS ENUM ('CREATED', 'UPLOADING', 'QUEUED', 'PROCESSING', 'PROBING', 'AUDIO_EXTRACTING', 'TRANSCRIBING', 'ANALYZING', 'GENERATING', 'CLIPPING', 'READY', 'FAILED', 'CANCELED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'UPLOADING';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'PROBING';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'AUDIO_EXTRACTING';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'TRANSCRIBING';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'ANALYZING';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'GENERATING';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'CLIPPING';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS 'CANCELED';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SourceKind" AS ENUM ('UPLOAD', 'YOUTUBE', 'TWITCH', 'KICK', 'GOOGLE_DRIVE', 'DIRECT_URL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "SourceKind" ADD VALUE IF NOT EXISTS 'UPLOAD';
ALTER TYPE "SourceKind" ADD VALUE IF NOT EXISTS 'YOUTUBE';
ALTER TYPE "SourceKind" ADD VALUE IF NOT EXISTS 'TWITCH';
ALTER TYPE "SourceKind" ADD VALUE IF NOT EXISTS 'KICK';
ALTER TYPE "SourceKind" ADD VALUE IF NOT EXISTS 'GOOGLE_DRIVE';
ALTER TYPE "SourceKind" ADD VALUE IF NOT EXISTS 'DIRECT_URL';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ClipMode" AS ENUM ('AUTOMATIC', 'VIRAL', 'PODCAST', 'GAMING', 'HIGHLIGHTS', 'HUMOR', 'INFORMATIVE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "ClipMode" ADD VALUE IF NOT EXISTS 'AUTOMATIC';
ALTER TYPE "ClipMode" ADD VALUE IF NOT EXISTS 'VIRAL';
ALTER TYPE "ClipMode" ADD VALUE IF NOT EXISTS 'PODCAST';
ALTER TYPE "ClipMode" ADD VALUE IF NOT EXISTS 'GAMING';
ALTER TYPE "ClipMode" ADD VALUE IF NOT EXISTS 'HIGHLIGHTS';
ALTER TYPE "ClipMode" ADD VALUE IF NOT EXISTS 'HUMOR';
ALTER TYPE "ClipMode" ADD VALUE IF NOT EXISTS 'INFORMATIVE';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ClipStatus" AS ENUM ('CANDIDATE', 'READY', 'RENDERING', 'RENDERED', 'PUBLISHED', 'FAILED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "ClipStatus" ADD VALUE IF NOT EXISTS 'CANDIDATE';
ALTER TYPE "ClipStatus" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "ClipStatus" ADD VALUE IF NOT EXISTS 'RENDERING';
ALTER TYPE "ClipStatus" ADD VALUE IF NOT EXISTS 'RENDERED';
ALTER TYPE "ClipStatus" ADD VALUE IF NOT EXISTS 'PUBLISHED';
ALTER TYPE "ClipStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "ClipStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "RenderStatus" AS ENUM ('WAITING', 'RENDERING', 'DONE', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "RenderStatus" ADD VALUE IF NOT EXISTS 'WAITING';
ALTER TYPE "RenderStatus" ADD VALUE IF NOT EXISTS 'RENDERING';
ALTER TYPE "RenderStatus" ADD VALUE IF NOT EXISTS 'DONE';
ALTER TYPE "RenderStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SocialPlatform" AS ENUM ('TIKTOK', 'INSTAGRAM', 'FACEBOOK', 'X', 'LINKEDIN', 'BLUESKY', 'YOUTUBE', 'THREADS', 'PINTEREST', 'TWITCH', 'KICK', 'REDDIT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'TIKTOK';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'FACEBOOK';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'X';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'LINKEDIN';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'BLUESKY';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'YOUTUBE';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'THREADS';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'PINTEREST';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'TWITCH';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'KICK';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'REDDIT';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SocialAccountStatus" AS ENUM ('CONNECTED', 'TOKEN_EXPIRING', 'EXPIRED', 'REAUTH_REQUIRED', 'ERROR', 'CONFIGURATION_REQUIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "SocialAccountStatus" ADD VALUE IF NOT EXISTS 'CONNECTED';
ALTER TYPE "SocialAccountStatus" ADD VALUE IF NOT EXISTS 'TOKEN_EXPIRING';
ALTER TYPE "SocialAccountStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "SocialAccountStatus" ADD VALUE IF NOT EXISTS 'REAUTH_REQUIRED';
ALTER TYPE "SocialAccountStatus" ADD VALUE IF NOT EXISTS 'ERROR';
ALTER TYPE "SocialAccountStatus" ADD VALUE IF NOT EXISTS 'CONFIGURATION_REQUIRED';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'UPLOADING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "PublicationStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "PublicationStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "PublicationStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "PublicationStatus" ADD VALUE IF NOT EXISTS 'UPLOADING';
ALTER TYPE "PublicationStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "PublicationStatus" ADD VALUE IF NOT EXISTS 'PUBLISHED';
ALTER TYPE "PublicationStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "PublicationStatus" ADD VALUE IF NOT EXISTS 'CANCELED';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "LiveStatus" AS ENUM ('OFFLINE', 'LIVE', 'CHECKING', 'ERROR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "LiveStatus" ADD VALUE IF NOT EXISTS 'OFFLINE';
ALTER TYPE "LiveStatus" ADD VALUE IF NOT EXISTS 'LIVE';
ALTER TYPE "LiveStatus" ADD VALUE IF NOT EXISTS 'CHECKING';
ALTER TYPE "LiveStatus" ADD VALUE IF NOT EXISTS 'ERROR';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "CreditTransactionType" AS ENUM ('SUBSCRIPTION_GRANT', 'PURCHASE', 'VIDEO_ANALYSIS', 'TRANSCRIPTION', 'TRANSLATION', 'REFUND', 'ADMIN_ADJUSTMENT', 'PROMOTIONAL', 'EXPIRATION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_GRANT';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'PURCHASE';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'VIDEO_ANALYSIS';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'TRANSCRIPTION';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'TRANSLATION';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'REFUND';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'ADMIN_ADJUSTMENT';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'PROMOTIONAL';
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'EXPIRATION';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PlanCode" AS ENUM ('FREE', 'BASIC', 'PLUS', 'CREATOR', 'PRO', 'BUSINESS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "PlanCode" ADD VALUE IF NOT EXISTS 'FREE';
ALTER TYPE "PlanCode" ADD VALUE IF NOT EXISTS 'BASIC';
ALTER TYPE "PlanCode" ADD VALUE IF NOT EXISTS 'PLUS';
ALTER TYPE "PlanCode" ADD VALUE IF NOT EXISTS 'CREATOR';
ALTER TYPE "PlanCode" ADD VALUE IF NOT EXISTS 'PRO';
ALTER TYPE "PlanCode" ADD VALUE IF NOT EXISTS 'BUSINESS';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'TRIALING', 'UNPAID');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'CANCELED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'UNPAID';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "NotificationType" AS ENUM ('PROJECT_READY', 'CLIPS_READY', 'RENDER_READY', 'PUBLISH_SUCCESS', 'PUBLISH_FAILED', 'CREDITS_LOW', 'SUBSCRIPTION', 'TEAM_INVITE', 'LIVE_STARTED', 'PROCESSING_FAILED', 'ACCOUNT_RECONNECT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROJECT_READY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CLIPS_READY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RENDER_READY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PUBLISH_SUCCESS';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PUBLISH_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CREDITS_LOW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TEAM_INVITE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LIVE_STARTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROCESSING_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOUNT_RECONNECT';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ProcessingJobType" AS ENUM ('VIDEO_IMPORT', 'VIDEO_PROCESSING', 'TRANSCRIPTION', 'AI_ANALYSIS', 'CLIP_GENERATION', 'RENDER', 'SOCIAL_PUBLISHING', 'ANALYTICS_SYNC', 'LIVE_MONITOR', 'NOTIFICATIONS', 'EXTRACT_AUDIO', 'BULK_DOWNLOAD');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'VIDEO_IMPORT';
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'VIDEO_PROCESSING';
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'TRANSCRIPTION';
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'AI_ANALYSIS';
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'CLIP_GENERATION';
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'RENDER';
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'SOCIAL_PUBLISHING';
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'ANALYTICS_SYNC';
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'LIVE_MONITOR';
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'NOTIFICATIONS';
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'EXTRACT_AUDIO';
ALTER TYPE "ProcessingJobType" ADD VALUE IF NOT EXISTS 'BULK_DOWNLOAD';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "JobStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED', 'CANCELED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'WAITING';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'DELAYED';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'CANCELED';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ChampionshipStatus" AS ENUM ('DRAFT', 'OPEN', 'LIVE', 'CLOSED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "ChampionshipStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ChampionshipStatus" ADD VALUE IF NOT EXISTS 'OPEN';
ALTER TYPE "ChampionshipStatus" ADD VALUE IF NOT EXISTS 'LIVE';
ALTER TYPE "ChampionshipStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TYPE "ChampionshipStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AspectRatio" AS ENUM ('NINE_SIXTEEN', 'SIXTEEN_NINE', 'ONE_ONE', 'FOUR_FIVE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "AspectRatio" ADD VALUE IF NOT EXISTS 'NINE_SIXTEEN';
ALTER TYPE "AspectRatio" ADD VALUE IF NOT EXISTS 'SIXTEEN_NINE';
ALTER TYPE "AspectRatio" ADD VALUE IF NOT EXISTS 'ONE_ONE';
ALTER TYPE "AspectRatio" ADD VALUE IF NOT EXISTS 'FOUR_FIVE';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ReframeMode" AS ENUM ('AUTO', 'CENTER', 'SPEAKER', 'SPLIT', 'CAMERA_SCREEN', 'CUSTOM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "ReframeMode" ADD VALUE IF NOT EXISTS 'AUTO';
ALTER TYPE "ReframeMode" ADD VALUE IF NOT EXISTS 'CENTER';
ALTER TYPE "ReframeMode" ADD VALUE IF NOT EXISTS 'SPEAKER';
ALTER TYPE "ReframeMode" ADD VALUE IF NOT EXISTS 'SPLIT';
ALTER TYPE "ReframeMode" ADD VALUE IF NOT EXISTS 'CAMERA_SCREEN';
ALTER TYPE "ReframeMode" ADD VALUE IF NOT EXISTS 'CUSTOM';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'SENDING';
ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE "EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "UploadSessionStatus" AS ENUM ('PENDING', 'UPLOADING', 'UPLOADED', 'VALIDATING', 'COMPLETED', 'FAILED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "UploadSessionStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "UploadSessionStatus" ADD VALUE IF NOT EXISTS 'UPLOADING';
ALTER TYPE "UploadSessionStatus" ADD VALUE IF NOT EXISTS 'UPLOADED';
ALTER TYPE "UploadSessionStatus" ADD VALUE IF NOT EXISTS 'VALIDATING';
ALTER TYPE "UploadSessionStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "UploadSessionStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "UploadSessionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompletedAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "userType" TEXT,
    "primaryGoal" TEXT,
    "notificationPrefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "image" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" DEFAULT 'USER';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'pt-BR';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT DEFAULT 'America/Sao_Paulo';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingStep" INTEGER DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingCompleted" BOOLEAN DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "userType" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "primaryGoal" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."User"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_pkey') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "providerAccountId" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "refresh_token" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "access_token" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "expires_at" INTEGER;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "token_type" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "scope" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "id_token" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "session_state" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Account"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Account_pkey') THEN
        ALTER TABLE "Account" ADD CONSTRAINT "Account_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "sessionToken" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "expires" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Session"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Session_pkey') THEN
        ALTER TABLE "Session" ADD CONSTRAINT "Session_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "VerificationToken" ADD COLUMN IF NOT EXISTS "identifier" TEXT;
ALTER TABLE "VerificationToken" ADD COLUMN IF NOT EXISTS "token" TEXT;
ALTER TABLE "VerificationToken" ADD COLUMN IF NOT EXISTS "expires" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Authenticator" (
    "credentialID" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credentialDeviceType" TEXT NOT NULL,
    "credentialBackedUp" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "Authenticator_pkey" PRIMARY KEY ("userId","credentialID")
);
ALTER TABLE "Authenticator" ADD COLUMN IF NOT EXISTS "credentialID" TEXT;
ALTER TABLE "Authenticator" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Authenticator" ADD COLUMN IF NOT EXISTS "providerAccountId" TEXT;
ALTER TABLE "Authenticator" ADD COLUMN IF NOT EXISTS "credentialPublicKey" TEXT;
ALTER TABLE "Authenticator" ADD COLUMN IF NOT EXISTS "counter" INTEGER;
ALTER TABLE "Authenticator" ADD COLUMN IF NOT EXISTS "credentialDeviceType" TEXT;
ALTER TABLE "Authenticator" ADD COLUMN IF NOT EXISTS "credentialBackedUp" BOOLEAN;
ALTER TABLE "Authenticator" ADD COLUMN IF NOT EXISTS "transports" TEXT;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Authenticator"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Authenticator_pkey') THEN
        ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_pkey" PRIMARY KEY ("userId","credentialID");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LoginHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "LoginHistory" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "LoginHistory" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "LoginHistory" ADD COLUMN IF NOT EXISTS "ip" TEXT;
ALTER TABLE "LoginHistory" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "LoginHistory" ADD COLUMN IF NOT EXISTS "success" BOOLEAN;
ALTER TABLE "LoginHistory" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."LoginHistory"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoginHistory_pkey') THEN
        ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "WorkspaceType" NOT NULL DEFAULT 'PERSONAL',
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "type" "WorkspaceType" DEFAULT 'PERSONAL';
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "image" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Workspace"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Workspace_pkey') THEN
        ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "role" "WorkspaceRole" DEFAULT 'EDITOR';
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."WorkspaceMember"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceMember_pkey') THEN
        ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'EDITOR',
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "WorkspaceInvitation" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "WorkspaceInvitation" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "WorkspaceInvitation" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "WorkspaceInvitation" ADD COLUMN IF NOT EXISTS "role" "WorkspaceRole" DEFAULT 'EDITOR';
ALTER TABLE "WorkspaceInvitation" ADD COLUMN IF NOT EXISTS "status" "InvitationStatus" DEFAULT 'PENDING';
ALTER TABLE "WorkspaceInvitation" ADD COLUMN IF NOT EXISTS "token" TEXT;
ALTER TABLE "WorkspaceInvitation" ADD COLUMN IF NOT EXISTS "invitedById" TEXT;
ALTER TABLE "WorkspaceInvitation" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "WorkspaceInvitation" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."WorkspaceInvitation"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceInvitation_pkey') THEN
        ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Client" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "brandKitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "logo" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "brandKitId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Client"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Client_pkey') THEN
        ALTER TABLE "Client" ADD CONSTRAINT "Client_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'CREATED',
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "intervalSeconds" INTEGER NOT NULL DEFAULT 0,
    "clipDurationMin" INTEGER NOT NULL DEFAULT 15,
    "clipDurationMax" INTEGER NOT NULL DEFAULT 30,
    "clipCount" INTEGER NOT NULL DEFAULT 8,
    "mode" "ClipMode" NOT NULL DEFAULT 'AUTOMATIC',
    "detectSpeakers" BOOLEAN NOT NULL DEFAULT true,
    "removeSilences" BOOLEAN NOT NULL DEFAULT true,
    "autoReframe" BOOLEAN NOT NULL DEFAULT true,
    "autoCaptions" BOOLEAN NOT NULL DEFAULT true,
    "viralScore" BOOLEAN NOT NULL DEFAULT true,
    "generateTitle" BOOLEAN NOT NULL DEFAULT true,
    "generateDescription" BOOLEAN NOT NULL DEFAULT true,
    "generateHashtags" BOOLEAN NOT NULL DEFAULT true,
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "pipelineMeta" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "status" "ProjectStatus" DEFAULT 'CREATED';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'pt-BR';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "intervalSeconds" INTEGER DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clipDurationMin" INTEGER DEFAULT 15;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clipDurationMax" INTEGER DEFAULT 30;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "clipCount" INTEGER DEFAULT 8;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "mode" "ClipMode" DEFAULT 'AUTOMATIC';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "detectSpeakers" BOOLEAN DEFAULT true;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "removeSilences" BOOLEAN DEFAULT true;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "autoReframe" BOOLEAN DEFAULT true;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "autoCaptions" BOOLEAN DEFAULT true;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "viralScore" BOOLEAN DEFAULT true;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "generateTitle" BOOLEAN DEFAULT true;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "generateDescription" BOOLEAN DEFAULT true;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "generateHashtags" BOOLEAN DEFAULT true;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "authorized" BOOLEAN DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "creditsUsed" INTEGER DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "pipelineMeta" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Project"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_pkey') THEN
        ALTER TABLE "Project" ADD CONSTRAINT "Project_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SourceVideo" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "originalName" TEXT,
    "sourceUrl" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "durationMs" INTEGER,
    "thumbnailKey" TEXT,
    "audioStorageKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "fps" DOUBLE PRECISION,
    "codec" TEXT,
    "audioCodec" TEXT,
    "bitrate" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceVideo_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "kind" "SourceKind";
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "originalName" TEXT;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "thumbnailKey" TEXT;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "audioStorageKey" TEXT;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "fps" DOUBLE PRECISION;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "codec" TEXT;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "audioCodec" TEXT;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "bitrate" INTEGER;
ALTER TABLE "SourceVideo" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."SourceVideo"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SourceVideo_pkey') THEN
        ALTER TABLE "SourceVideo" ADD CONSTRAINT "SourceVideo_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Transcript" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "fullText" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MOCK',
    "model" TEXT,
    "sourceHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Transcript" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Transcript" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "Transcript" ADD COLUMN IF NOT EXISTS "language" TEXT;
ALTER TABLE "Transcript" ADD COLUMN IF NOT EXISTS "fullText" TEXT;
ALTER TABLE "Transcript" ADD COLUMN IF NOT EXISTS "provider" TEXT DEFAULT 'MOCK';
ALTER TABLE "Transcript" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "Transcript" ADD COLUMN IF NOT EXISTS "sourceHash" TEXT;
ALTER TABLE "Transcript" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Transcript" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Transcript"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transcript_pkey') THEN
        ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TranscriptSegment" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "speakerId" TEXT,
    "confidence" DOUBLE PRECISION,
    "words" JSONB,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "TranscriptSegment" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "TranscriptSegment" ADD COLUMN IF NOT EXISTS "transcriptId" TEXT;
ALTER TABLE "TranscriptSegment" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "TranscriptSegment" ADD COLUMN IF NOT EXISTS "startMs" INTEGER;
ALTER TABLE "TranscriptSegment" ADD COLUMN IF NOT EXISTS "endMs" INTEGER;
ALTER TABLE "TranscriptSegment" ADD COLUMN IF NOT EXISTS "text" TEXT;
ALTER TABLE "TranscriptSegment" ADD COLUMN IF NOT EXISTS "speakerId" TEXT;
ALTER TABLE "TranscriptSegment" ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION;
ALTER TABLE "TranscriptSegment" ADD COLUMN IF NOT EXISTS "words" JSONB;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."TranscriptSegment"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TranscriptSegment_pkey') THEN
        ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Clip" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "reason" TEXT,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "status" "ClipStatus" NOT NULL DEFAULT 'CANDIDATE',
    "thumbnailKey" TEXT,
    "storageKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER,
    "hashtags" TEXT[],
    "description" TEXT,
    "suggestedCaption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "startMs" INTEGER;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "endMs" INTEGER;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "status" "ClipStatus" DEFAULT 'CANDIDATE';
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "thumbnailKey" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "hashtags" TEXT[];
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "suggestedCaption" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Clip"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Clip_pkey') THEN
        ALTER TABLE "Clip" ADD CONSTRAINT "Clip_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClipScore" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "hookScore" INTEGER NOT NULL,
    "retentionScore" INTEGER NOT NULL,
    "clarityScore" INTEGER NOT NULL,
    "emotionScore" INTEGER NOT NULL,
    "shareabilityScore" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "ClipScore_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ClipScore" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ClipScore" ADD COLUMN IF NOT EXISTS "clipId" TEXT;
ALTER TABLE "ClipScore" ADD COLUMN IF NOT EXISTS "overall" INTEGER;
ALTER TABLE "ClipScore" ADD COLUMN IF NOT EXISTS "hookScore" INTEGER;
ALTER TABLE "ClipScore" ADD COLUMN IF NOT EXISTS "retentionScore" INTEGER;
ALTER TABLE "ClipScore" ADD COLUMN IF NOT EXISTS "clarityScore" INTEGER;
ALTER TABLE "ClipScore" ADD COLUMN IF NOT EXISTS "emotionScore" INTEGER;
ALTER TABLE "ClipScore" ADD COLUMN IF NOT EXISTS "shareabilityScore" INTEGER DEFAULT 50;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."ClipScore"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClipScore_pkey') THEN
        ALTER TABLE "ClipScore" ADD CONSTRAINT "ClipScore_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "EditorProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "aspectRatio" "AspectRatio" NOT NULL DEFAULT 'NINE_SIXTEEN',
    "reframeMode" "ReframeMode" NOT NULL DEFAULT 'AUTO',
    "canvasJson" JSONB,
    "captionStyle" JSONB,
    "brandKitId" TEXT,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorProject_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "EditorProject" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "EditorProject" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "EditorProject" ADD COLUMN IF NOT EXISTS "clipId" TEXT;
ALTER TABLE "EditorProject" ADD COLUMN IF NOT EXISTS "aspectRatio" "AspectRatio" DEFAULT 'NINE_SIXTEEN';
ALTER TABLE "EditorProject" ADD COLUMN IF NOT EXISTS "reframeMode" "ReframeMode" DEFAULT 'AUTO';
ALTER TABLE "EditorProject" ADD COLUMN IF NOT EXISTS "canvasJson" JSONB;
ALTER TABLE "EditorProject" ADD COLUMN IF NOT EXISTS "captionStyle" JSONB;
ALTER TABLE "EditorProject" ADD COLUMN IF NOT EXISTS "brandKitId" TEXT;
ALTER TABLE "EditorProject" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
ALTER TABLE "EditorProject" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EditorProject" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."EditorProject"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EditorProject_pkey') THEN
        ALTER TABLE "EditorProject" ADD CONSTRAINT "EditorProject_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "EditorElement" (
    "id" TEXT NOT NULL,
    "editorProjectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "layer" INTEGER NOT NULL DEFAULT 0,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "startMs" INTEGER NOT NULL DEFAULT 0,
    "endMs" INTEGER NOT NULL,
    "properties" JSONB,

    CONSTRAINT "EditorElement_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "editorProjectId" TEXT;
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "layer" INTEGER DEFAULT 0;
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "x" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "y" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "scale" DOUBLE PRECISION DEFAULT 1;
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "rotation" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "opacity" DOUBLE PRECISION DEFAULT 1;
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "startMs" INTEGER DEFAULT 0;
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "endMs" INTEGER;
ALTER TABLE "EditorElement" ADD COLUMN IF NOT EXISTS "properties" JSONB;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."EditorElement"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EditorElement_pkey') THEN
        ALTER TABLE "EditorElement" ADD CONSTRAINT "EditorElement_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "EditorRevision" (
    "id" TEXT NOT NULL,
    "editorProjectId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorRevision_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "EditorRevision" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "EditorRevision" ADD COLUMN IF NOT EXISTS "editorProjectId" TEXT;
ALTER TABLE "EditorRevision" ADD COLUMN IF NOT EXISTS "snapshot" JSONB;
ALTER TABLE "EditorRevision" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."EditorRevision"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EditorRevision_pkey') THEN
        ALTER TABLE "EditorRevision" ADD CONSTRAINT "EditorRevision_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CaptionPreset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "font" TEXT NOT NULL,
    "fontSize" INTEGER NOT NULL,
    "fontWeight" INTEGER NOT NULL,
    "alignment" TEXT NOT NULL,
    "lineHeight" DOUBLE PRECISION NOT NULL,
    "letterSpacing" DOUBLE PRECISION NOT NULL,
    "color" TEXT NOT NULL,
    "outline" TEXT,
    "shadow" TEXT,
    "background" TEXT,
    "position" TEXT NOT NULL,
    "animation" TEXT,
    "wordHighlight" BOOLEAN NOT NULL DEFAULT true,
    "maxWordsPerLine" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptionPreset_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN DEFAULT false;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "font" TEXT;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "fontSize" INTEGER;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "fontWeight" INTEGER;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "alignment" TEXT;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "lineHeight" DOUBLE PRECISION;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "letterSpacing" DOUBLE PRECISION;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "outline" TEXT;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "shadow" TEXT;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "background" TEXT;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "position" TEXT;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "animation" TEXT;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "wordHighlight" BOOLEAN DEFAULT true;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "maxWordsPerLine" INTEGER DEFAULT 4;
ALTER TABLE "CaptionPreset" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."CaptionPreset"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaptionPreset_pkey') THEN
        ALTER TABLE "CaptionPreset" ADD CONSTRAINT "CaptionPreset_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Template" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canvas" JSONB NOT NULL,
    "layout" JSONB,
    "captionStyle" JSONB,
    "brand" JSONB,
    "elements" JSONB,
    "animations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "canvas" JSONB;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "layout" JSONB;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "captionStyle" JSONB;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "brand" JSONB;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "elements" JSONB;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "animations" JSONB;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Template"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Template_pkey') THEN
        ALTER TABLE "Template" ADD CONSTRAINT "Template_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "BrandKit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "primaryColor" TEXT NOT NULL,
    "secondaryColor" TEXT NOT NULL,
    "fonts" TEXT[],
    "captionPreset" TEXT,
    "watermark" TEXT,

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BrandKit" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "BrandKit" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "BrandKit" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "BrandKit" ADD COLUMN IF NOT EXISTS "logo" TEXT;
ALTER TABLE "BrandKit" ADD COLUMN IF NOT EXISTS "primaryColor" TEXT;
ALTER TABLE "BrandKit" ADD COLUMN IF NOT EXISTS "secondaryColor" TEXT;
ALTER TABLE "BrandKit" ADD COLUMN IF NOT EXISTS "fonts" TEXT[];
ALTER TABLE "BrandKit" ADD COLUMN IF NOT EXISTS "captionPreset" TEXT;
ALTER TABLE "BrandKit" ADD COLUMN IF NOT EXISTS "watermark" TEXT;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."BrandKit"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandKit_pkey') THEN
        ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RenderJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "fps" INTEGER NOT NULL DEFAULT 30,
    "status" "RenderStatus" NOT NULL DEFAULT 'WAITING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "clipId" TEXT;
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "resolution" TEXT;
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "fps" INTEGER DEFAULT 30;
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "status" "RenderStatus" DEFAULT 'WAITING';
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "progress" INTEGER DEFAULT 0;
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
ALTER TABLE "RenderJob" ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."RenderJob"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RenderJob_pkey') THEN
        ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RenderedAsset" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "renderJobId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenderedAsset_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "RenderedAsset" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "RenderedAsset" ADD COLUMN IF NOT EXISTS "clipId" TEXT;
ALTER TABLE "RenderedAsset" ADD COLUMN IF NOT EXISTS "renderJobId" TEXT;
ALTER TABLE "RenderedAsset" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
ALTER TABLE "RenderedAsset" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "RenderedAsset" ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER;
ALTER TABLE "RenderedAsset" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."RenderedAsset"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RenderedAsset_pkey') THEN
        ALTER TABLE "RenderedAsset" ADD CONSTRAINT "RenderedAsset_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "expiresAt" TIMESTAMP(3),
    "refreshExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastSyncAt" TIMESTAMP(3),
    "mock" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'NATIVE',
    "providerProfileId" TEXT,
    "providerMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "platform" "SocialPlatform";
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "externalAccountId" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "accessTokenEncrypted" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "refreshTokenEncrypted" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "refreshExpiresAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "scopes" TEXT[];
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "status" "SocialAccountStatus" DEFAULT 'CONNECTED';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "mock" BOOLEAN DEFAULT false;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "provider" TEXT DEFAULT 'NATIVE';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "providerProfileId" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "providerMeta" JSONB;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."SocialAccount"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialAccount_pkey') THEN
        ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UploadPostProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "planName" TEXT,
    "planLimit" INTEGER,
    "lastSyncAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadPostProfile_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "UploadPostProfile" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "UploadPostProfile" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "UploadPostProfile" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "UploadPostProfile" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'ACTIVE';
ALTER TABLE "UploadPostProfile" ADD COLUMN IF NOT EXISTS "planName" TEXT;
ALTER TABLE "UploadPostProfile" ADD COLUMN IF NOT EXISTS "planLimit" INTEGER;
ALTER TABLE "UploadPostProfile" ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "UploadPostProfile" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "UploadPostProfile" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "UploadPostProfile" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."UploadPostProfile"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UploadPostProfile_pkey') THEN
        ALTER TABLE "UploadPostProfile" ADD CONSTRAINT "UploadPostProfile_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialUsageEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialUsageEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SocialUsageEvent" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "SocialUsageEvent" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "SocialUsageEvent" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "SocialUsageEvent" ADD COLUMN IF NOT EXISTS "quantity" INTEGER DEFAULT 1;
ALTER TABLE "SocialUsageEvent" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "SocialUsageEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."SocialUsageEvent"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialUsageEvent_pkey') THEN
        ALTER TABLE "SocialUsageEvent" ADD CONSTRAINT "SocialUsageEvent_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialPublication" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clipId" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[],
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "errorMessage" TEXT,
    "mock" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'NATIVE',
    "providerPublicationId" TEXT,
    "providerStatus" TEXT,
    "providerPayloadSafe" JSONB,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPublication_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "clipId" TEXT;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "caption" TEXT;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "hashtags" TEXT[];
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "status" "PublicationStatus" DEFAULT 'DRAFT';
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "timezone" TEXT DEFAULT 'America/Sao_Paulo';
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "mock" BOOLEAN DEFAULT false;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "provider" TEXT DEFAULT 'NATIVE';
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "providerPublicationId" TEXT;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "providerStatus" TEXT;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "providerPayloadSafe" JSONB;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "failureCode" TEXT;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."SocialPublication"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialPublication_pkey') THEN
        ALTER TABLE "SocialPublication" ADD CONSTRAINT "SocialPublication_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialPublicationTarget" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "externalPostId" TEXT,
    "externalPublishId" TEXT,
    "externalContainerId" TEXT,
    "privacy" TEXT,
    "platformOptions" JSONB,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "errorMessage" TEXT,
    "publishedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,

    CONSTRAINT "SocialPublicationTarget_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "publicationId" TEXT;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "socialAccountId" TEXT;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "platform" "SocialPlatform";
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "status" "PublicationStatus" DEFAULT 'DRAFT';
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "externalPostId" TEXT;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "externalPublishId" TEXT;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "externalContainerId" TEXT;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "privacy" TEXT;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "platformOptions" JSONB;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "views" INTEGER DEFAULT 0;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "likes" INTEGER DEFAULT 0;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "comments" INTEGER DEFAULT 0;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "shares" INTEGER DEFAULT 0;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "failureCode" TEXT;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "SocialPublicationTarget" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."SocialPublicationTarget"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialPublicationTarget_pkey') THEN
        ALTER TABLE "SocialPublicationTarget" ADD CONSTRAINT "SocialPublicationTarget_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialOAuthState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT,
    "redirectUri" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialOAuthState_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SocialOAuthState" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "SocialOAuthState" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "SocialOAuthState" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "SocialOAuthState" ADD COLUMN IF NOT EXISTS "platform" "SocialPlatform";
ALTER TABLE "SocialOAuthState" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "SocialOAuthState" ADD COLUMN IF NOT EXISTS "codeVerifier" TEXT;
ALTER TABLE "SocialOAuthState" ADD COLUMN IF NOT EXISTS "redirectUri" TEXT;
ALTER TABLE "SocialOAuthState" ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3);
ALTER TABLE "SocialOAuthState" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "SocialOAuthState" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."SocialOAuthState"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialOAuthState_pkey') THEN
        ALTER TABLE "SocialOAuthState" ADD CONSTRAINT "SocialOAuthState_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MetaPendingConnect" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intent" "SocialPlatform" NOT NULL,
    "payloadEncrypted" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaPendingConnect_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "MetaPendingConnect" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "MetaPendingConnect" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "MetaPendingConnect" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "MetaPendingConnect" ADD COLUMN IF NOT EXISTS "intent" "SocialPlatform";
ALTER TABLE "MetaPendingConnect" ADD COLUMN IF NOT EXISTS "payloadEncrypted" TEXT;
ALTER TABLE "MetaPendingConnect" ADD COLUMN IF NOT EXISTS "scopes" TEXT[];
ALTER TABLE "MetaPendingConnect" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "MetaPendingConnect" ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3);
ALTER TABLE "MetaPendingConnect" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."MetaPendingConnect"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MetaPendingConnect_pkey') THEN
        ALTER TABLE "MetaPendingConnect" ADD CONSTRAINT "MetaPendingConnect_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialMetricSnapshot" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "followers" INTEGER NOT NULL,
    "views" INTEGER NOT NULL,
    "likes" INTEGER NOT NULL,
    "comments" INTEGER NOT NULL,
    "shares" INTEGER NOT NULL,
    "posts" INTEGER NOT NULL,
    "engagement" DOUBLE PRECISION NOT NULL,
    "rawPayload" JSONB,

    CONSTRAINT "SocialMetricSnapshot_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SocialMetricSnapshot" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "SocialMetricSnapshot" ADD COLUMN IF NOT EXISTS "socialAccountId" TEXT;
ALTER TABLE "SocialMetricSnapshot" ADD COLUMN IF NOT EXISTS "capturedAt" TIMESTAMP(3);
ALTER TABLE "SocialMetricSnapshot" ADD COLUMN IF NOT EXISTS "followers" INTEGER;
ALTER TABLE "SocialMetricSnapshot" ADD COLUMN IF NOT EXISTS "views" INTEGER;
ALTER TABLE "SocialMetricSnapshot" ADD COLUMN IF NOT EXISTS "likes" INTEGER;
ALTER TABLE "SocialMetricSnapshot" ADD COLUMN IF NOT EXISTS "comments" INTEGER;
ALTER TABLE "SocialMetricSnapshot" ADD COLUMN IF NOT EXISTS "shares" INTEGER;
ALTER TABLE "SocialMetricSnapshot" ADD COLUMN IF NOT EXISTS "posts" INTEGER;
ALTER TABLE "SocialMetricSnapshot" ADD COLUMN IF NOT EXISTS "engagement" DOUBLE PRECISION;
ALTER TABLE "SocialMetricSnapshot" ADD COLUMN IF NOT EXISTS "rawPayload" JSONB;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."SocialMetricSnapshot"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialMetricSnapshot_pkey') THEN
        ALTER TABLE "SocialMetricSnapshot" ADD CONSTRAINT "SocialMetricSnapshot_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialPostMetricSnapshot" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "targetId" TEXT,
    "externalPostId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL,
    "likes" INTEGER NOT NULL,
    "comments" INTEGER NOT NULL,
    "shares" INTEGER NOT NULL,
    "engagement" DOUBLE PRECISION NOT NULL,
    "rawPayload" JSONB,

    CONSTRAINT "SocialPostMetricSnapshot_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SocialPostMetricSnapshot" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "SocialPostMetricSnapshot" ADD COLUMN IF NOT EXISTS "socialAccountId" TEXT;
ALTER TABLE "SocialPostMetricSnapshot" ADD COLUMN IF NOT EXISTS "targetId" TEXT;
ALTER TABLE "SocialPostMetricSnapshot" ADD COLUMN IF NOT EXISTS "externalPostId" TEXT;
ALTER TABLE "SocialPostMetricSnapshot" ADD COLUMN IF NOT EXISTS "capturedAt" TIMESTAMP(3);
ALTER TABLE "SocialPostMetricSnapshot" ADD COLUMN IF NOT EXISTS "views" INTEGER;
ALTER TABLE "SocialPostMetricSnapshot" ADD COLUMN IF NOT EXISTS "likes" INTEGER;
ALTER TABLE "SocialPostMetricSnapshot" ADD COLUMN IF NOT EXISTS "comments" INTEGER;
ALTER TABLE "SocialPostMetricSnapshot" ADD COLUMN IF NOT EXISTS "shares" INTEGER;
ALTER TABLE "SocialPostMetricSnapshot" ADD COLUMN IF NOT EXISTS "engagement" DOUBLE PRECISION;
ALTER TABLE "SocialPostMetricSnapshot" ADD COLUMN IF NOT EXISTS "rawPayload" JSONB;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."SocialPostMetricSnapshot"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialPostMetricSnapshot_pkey') THEN
        ALTER TABLE "SocialPostMetricSnapshot" ADD CONSTRAINT "SocialPostMetricSnapshot_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Schedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "publicationId" TEXT;
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Schedule"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Schedule_pkey') THEN
        ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AutopilotRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "destinations" JSONB NOT NULL,
    "minimumScore" INTEGER NOT NULL DEFAULT 85,
    "schedule" JSONB,
    "maxPostsPerDay" INTEGER NOT NULL DEFAULT 3,
    "templateId" TEXT,
    "captionPrompt" TEXT,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutopilotRule_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN DEFAULT false;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "destinations" JSONB;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "minimumScore" INTEGER DEFAULT 85;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "schedule" JSONB;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "maxPostsPerDay" INTEGER DEFAULT 3;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "captionPrompt" TEXT;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "consentGiven" BOOLEAN DEFAULT false;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AutopilotRule" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."AutopilotRule"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AutopilotRule_pkey') THEN
        ALTER TABLE "AutopilotRule" ADD CONSTRAINT "AutopilotRule_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LiveChannel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "socialAccountId" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "channelId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "monitoringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "LiveStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastLiveAt" TIMESTAMP(3),
    "clipEveryMinutes" INTEGER NOT NULL DEFAULT 10,
    "minimumScore" INTEGER NOT NULL DEFAULT 70,
    "clipDuration" INTEGER NOT NULL DEFAULT 45,
    "templateId" TEXT,
    "autoCaption" BOOLEAN NOT NULL DEFAULT true,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveChannel_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "socialAccountId" TEXT;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "platform" "SocialPlatform";
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "channelId" TEXT;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "monitoringEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "status" "LiveStatus" DEFAULT 'OFFLINE';
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "lastLiveAt" TIMESTAMP(3);
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "clipEveryMinutes" INTEGER DEFAULT 10;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "minimumScore" INTEGER DEFAULT 70;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "clipDuration" INTEGER DEFAULT 45;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "autoCaption" BOOLEAN DEFAULT true;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "autoPublish" BOOLEAN DEFAULT false;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "LiveChannel" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."LiveChannel"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LiveChannel_pkey') THEN
        ALTER TABLE "LiveChannel" ADD CONSTRAINT "LiveChannel_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "LiveSession" (
    "id" TEXT NOT NULL,
    "liveChannelId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "clipsGenerated" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "liveChannelId" TEXT;
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMP(3);
ALTER TABLE "LiveSession" ADD COLUMN IF NOT EXISTS "clipsGenerated" INTEGER DEFAULT 0;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."LiveSession"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LiveSession_pkey') THEN
        ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Championship" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "ChampionshipStatus" NOT NULL DEFAULT 'DRAFT',
    "prize" TEXT,
    "rules" TEXT,
    "banner" TEXT,
    "allowedSources" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Championship_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "startAt" TIMESTAMP(3);
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "endAt" TIMESTAMP(3);
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "status" "ChampionshipStatus" DEFAULT 'DRAFT';
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "prize" TEXT;
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "rules" TEXT;
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "banner" TEXT;
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "allowedSources" TEXT[];
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Championship" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Championship"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Championship_pkey') THEN
        ALTER TABLE "Championship" ADD CONSTRAINT "Championship_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChampionshipParticipant" (
    "id" TEXT NOT NULL,
    "championshipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChampionshipParticipant_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ChampionshipParticipant" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ChampionshipParticipant" ADD COLUMN IF NOT EXISTS "championshipId" TEXT;
ALTER TABLE "ChampionshipParticipant" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ChampionshipParticipant" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "ChampionshipParticipant" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."ChampionshipParticipant"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChampionshipParticipant_pkey') THEN
        ALTER TABLE "ChampionshipParticipant" ADD CONSTRAINT "ChampionshipParticipant_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClipSubmission" (
    "id" TEXT NOT NULL,
    "championshipId" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "moderated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClipSubmission_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ClipSubmission" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ClipSubmission" ADD COLUMN IF NOT EXISTS "championshipId" TEXT;
ALTER TABLE "ClipSubmission" ADD COLUMN IF NOT EXISTS "clipId" TEXT;
ALTER TABLE "ClipSubmission" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ClipSubmission" ADD COLUMN IF NOT EXISTS "views" INTEGER DEFAULT 0;
ALTER TABLE "ClipSubmission" ADD COLUMN IF NOT EXISTS "score" INTEGER DEFAULT 0;
ALTER TABLE "ClipSubmission" ADD COLUMN IF NOT EXISTS "moderated" BOOLEAN DEFAULT false;
ALTER TABLE "ClipSubmission" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."ClipSubmission"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClipSubmission_pkey') THEN
        ALTER TABLE "ClipSubmission" ADD CONSTRAINT "ClipSubmission_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CreditBalance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CreditBalance_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CreditBalance" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "CreditBalance" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "CreditBalance" ADD COLUMN IF NOT EXISTS "available" INTEGER DEFAULT 0;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."CreditBalance"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditBalance_pkey') THEN
        ALTER TABLE "CreditBalance" ADD CONSTRAINT "CreditBalance_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CreditBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditBatch_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CreditBatch" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "CreditBatch" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "CreditBatch" ADD COLUMN IF NOT EXISTS "amount" INTEGER;
ALTER TABLE "CreditBatch" ADD COLUMN IF NOT EXISTS "remaining" INTEGER;
ALTER TABLE "CreditBatch" ADD COLUMN IF NOT EXISTS "type" "CreditTransactionType";
ALTER TABLE "CreditBatch" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "CreditBatch" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."CreditBatch"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditBatch_pkey') THEN
        ALTER TABLE "CreditBatch" ADD CONSTRAINT "CreditBatch_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CreditTransaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "type" "CreditTransactionType";
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "amount" INTEGER;
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."CreditTransaction"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditTransaction_pkey') THEN
        ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Plan" (
    "id" TEXT NOT NULL,
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "stripePriceId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "limits" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "code" "PlanCode";
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "active" BOOLEAN DEFAULT true;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "limits" JSONB;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Plan"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Plan_pkey') THEN
        ALTER TABLE "Plan" ADD CONSTRAINT "Plan_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "gracePeriodEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "planId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "status" "SubscriptionStatus" DEFAULT 'ACTIVE';
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "currentPeriodStart" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" BOOLEAN DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "gracePeriodEndsAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Subscription"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_pkey') THEN
        ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "InvoiceRecord" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'brl',
    "status" TEXT NOT NULL,
    "hostedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRecord_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "InvoiceRecord" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "InvoiceRecord" ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT;
ALTER TABLE "InvoiceRecord" ADD COLUMN IF NOT EXISTS "stripeInvoiceId" TEXT;
ALTER TABLE "InvoiceRecord" ADD COLUMN IF NOT EXISTS "amount" INTEGER;
ALTER TABLE "InvoiceRecord" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'brl';
ALTER TABLE "InvoiceRecord" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "InvoiceRecord" ADD COLUMN IF NOT EXISTS "hostedUrl" TEXT;
ALTER TABLE "InvoiceRecord" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."InvoiceRecord"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceRecord_pkey') THEN
        ALTER TABLE "InvoiceRecord" ADD CONSTRAINT "InvoiceRecord_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "prefix" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "hashedKey" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "scopes" TEXT[];
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."ApiKey"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApiKey_pkey') THEN
        ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "url" TEXT;
ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "secret" TEXT;
ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "events" TEXT[];
ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "active" BOOLEAN DEFAULT true;
ALTER TABLE "WebhookEndpoint" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."WebhookEndpoint"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookEndpoint_pkey') THEN
        ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "endpointId" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "event" TEXT;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "payload" JSONB;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "statusCode" INTEGER;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "success" BOOLEAN DEFAULT false;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "attempts" INTEGER DEFAULT 0;
ALTER TABLE "WebhookDelivery" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."WebhookDelivery"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WebhookDelivery_pkey') THEN
        ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "type" "NotificationType";
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."Notification"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_pkey') THEN
        ALTER TABLE "Notification" ADD CONSTRAINT "Notification_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "action" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "ip" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."AuditLog"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_pkey') THEN
        ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
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
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "type" "ProcessingJobType";
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "status" "JobStatus" DEFAULT 'WAITING';
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "progress" INTEGER DEFAULT 0;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "attempt" INTEGER DEFAULT 0;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP(3);
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."ProcessingJob"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessingJob_pkey') THEN
        ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminAction" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "AdminAction" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "AdminAction" ADD COLUMN IF NOT EXISTS "adminId" TEXT;
ALTER TABLE "AdminAction" ADD COLUMN IF NOT EXISTS "action" TEXT;
ALTER TABLE "AdminAction" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "AdminAction" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
ALTER TABLE "AdminAction" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "AdminAction" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."AdminAction"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminAction_pkey') THEN
        ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UsageEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "amountSeconds" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "UsageEvent" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "UsageEvent" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "UsageEvent" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "UsageEvent" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "UsageEvent" ADD COLUMN IF NOT EXISTS "amountSeconds" INTEGER;
ALTER TABLE "UsageEvent" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "UsageEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."UsageEvent"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsageEvent_pkey') THEN
        ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessedStripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ProcessedStripeEvent" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ProcessedStripeEvent" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "ProcessedStripeEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."ProcessedStripeEvent"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessedStripeEvent_pkey') THEN
        ALTER TABLE "ProcessedStripeEvent" ADD CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ProcessedWebhookEvent" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "ProcessedWebhookEvent" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "ProcessedWebhookEvent" ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT '';
ALTER TABLE "ProcessedWebhookEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."ProcessedWebhookEvent"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProcessedWebhookEvent_pkey') THEN
        ALTER TABLE "ProcessedWebhookEvent" ADD CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailOutbox" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payload" JSONB,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "type" TEXT;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "recipient" TEXT;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "subject" TEXT;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "status" "EmailOutboxStatus" DEFAULT 'PENDING';
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "attempts" INTEGER DEFAULT 0;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "payload" JSONB;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."EmailOutbox"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailOutbox_pkey') THEN
        ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UploadSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "expectedMime" TEXT NOT NULL,
    "expectedSize" BIGINT NOT NULL,
    "status" "UploadSessionStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "originalName" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "expectedMime" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "expectedSize" BIGINT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "status" "UploadSessionStatus" DEFAULT 'PENDING';
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
-- PrimaryKey
DO $$ BEGIN
    IF to_regclass('public."UploadSession"') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UploadSession_pkey') THEN
        ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id");
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN invalid_table_definition THEN null;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Authenticator_credentialID_key" ON "Authenticator"("credentialID");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LoginHistory_userId_createdAt_idx" ON "LoginHistory"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Workspace_createdAt_idx" ON "Workspace"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvitation_token_key" ON "WorkspaceInvitation"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_workspaceId_idx" ON "WorkspaceInvitation"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_email_idx" ON "WorkspaceInvitation"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Client_workspaceId_idx" ON "Client"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_workspaceId_createdAt_idx" ON "Project"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_workspaceId_status_idx" ON "Project"("workspaceId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_workspaceId_isDemo_idx" ON "Project"("workspaceId", "isDemo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SourceVideo_projectId_key" ON "SourceVideo"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Transcript_projectId_key" ON "Transcript"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TranscriptSegment_projectId_idx" ON "TranscriptSegment"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TranscriptSegment_transcriptId_startMs_idx" ON "TranscriptSegment"("transcriptId", "startMs");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Clip_workspaceId_createdAt_idx" ON "Clip"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Clip_projectId_idx" ON "Clip"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Clip_status_idx" ON "Clip"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClipScore_clipId_key" ON "ClipScore"("clipId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EditorProject_clipId_key" ON "EditorProject"("clipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EditorProject_workspaceId_idx" ON "EditorProject"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EditorRevision_editorProjectId_createdAt_idx" ON "EditorRevision"("editorProjectId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Template_workspaceId_idx" ON "Template"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BrandKit_workspaceId_idx" ON "BrandKit"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RenderJob_workspaceId_createdAt_idx" ON "RenderJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RenderJob_clipId_idx" ON "RenderJob"("clipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RenderJob_status_idx" ON "RenderJob"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RenderJob_workspaceId_status_idx" ON "RenderJob"("workspaceId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialAccount_workspaceId_idx" ON "SocialAccount"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialAccount_platform_idx" ON "SocialAccount"("platform");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialAccount_status_idx" ON "SocialAccount"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialAccount_provider_idx" ON "SocialAccount"("provider");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SocialAccount_workspaceId_platform_externalAccountId_key" ON "SocialAccount"("workspaceId", "platform", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UploadPostProfile_workspaceId_key" ON "UploadPostProfile"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UploadPostProfile_username_key" ON "UploadPostProfile"("username");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialUsageEvent_workspaceId_createdAt_idx" ON "SocialUsageEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialUsageEvent_kind_createdAt_idx" ON "SocialUsageEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPublication_workspaceId_createdAt_idx" ON "SocialPublication"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPublication_status_idx" ON "SocialPublication"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPublication_scheduledFor_status_idx" ON "SocialPublication"("scheduledFor", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPublication_clipId_idx" ON "SocialPublication"("clipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPublication_providerPublicationId_idx" ON "SocialPublication"("providerPublicationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPublication_workspaceId_status_idx" ON "SocialPublication"("workspaceId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPublicationTarget_socialAccountId_idx" ON "SocialPublicationTarget"("socialAccountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPublicationTarget_status_idx" ON "SocialPublicationTarget"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPublicationTarget_externalPublishId_idx" ON "SocialPublicationTarget"("externalPublishId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPublicationTarget_idempotencyKey_idx" ON "SocialPublicationTarget"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SocialOAuthState_state_key" ON "SocialOAuthState"("state");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialOAuthState_workspaceId_userId_idx" ON "SocialOAuthState"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialOAuthState_expiresAt_idx" ON "SocialOAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MetaPendingConnect_workspaceId_userId_idx" ON "MetaPendingConnect"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MetaPendingConnect_expiresAt_idx" ON "MetaPendingConnect"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialMetricSnapshot_socialAccountId_capturedAt_idx" ON "SocialMetricSnapshot"("socialAccountId", "capturedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPostMetricSnapshot_socialAccountId_capturedAt_idx" ON "SocialPostMetricSnapshot"("socialAccountId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Schedule_publicationId_key" ON "Schedule"("publicationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Schedule_workspaceId_scheduledFor_idx" ON "Schedule"("workspaceId", "scheduledFor");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutopilotRule_workspaceId_idx" ON "AutopilotRule"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveChannel_workspaceId_idx" ON "LiveChannel"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveChannel_status_idx" ON "LiveChannel"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveSession_liveChannelId_startedAt_idx" ON "LiveSession"("liveChannelId", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Championship_workspaceId_idx" ON "Championship"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Championship_status_idx" ON "Championship"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ChampionshipParticipant_championshipId_userId_key" ON "ChampionshipParticipant"("championshipId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClipSubmission_championshipId_idx" ON "ClipSubmission"("championshipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClipSubmission_clipId_idx" ON "ClipSubmission"("clipId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CreditBalance_workspaceId_key" ON "CreditBalance"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditBatch_workspaceId_expiresAt_idx" ON "CreditBatch"("workspaceId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CreditTransaction_idempotencyKey_key" ON "CreditTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CreditTransaction_workspaceId_createdAt_idx" ON "CreditTransaction"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_workspaceId_key" ON "Subscription"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceRecord_stripeInvoiceId_key" ON "InvoiceRecord"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ApiKey_workspaceId_idx" ON "ApiKey"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WebhookEndpoint_workspaceId_idx" ON "WebhookEndpoint"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_workspaceId_idx" ON "Notification"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessingJob_workspaceId_createdAt_idx" ON "ProcessingJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessingJob_entityId_type_idx" ON "ProcessingJob"("entityId", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessingJob_status_idx" ON "ProcessingJob"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessingJob_workspaceId_status_idx" ON "ProcessingJob"("workspaceId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminAction_adminId_createdAt_idx" ON "AdminAction"("adminId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UsageEvent_idempotencyKey_key" ON "UsageEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsageEvent_workspaceId_createdAt_idx" ON "UsageEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UsageEvent_workspaceId_type_idx" ON "UsageEvent"("workspaceId", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessedWebhookEvent_provider_createdAt_idx" ON "ProcessedWebhookEvent"("provider", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmailOutbox_idempotencyKey_key" ON "EmailOutbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOutbox_userId_idx" ON "EmailOutbox"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOutbox_workspaceId_idx" ON "EmailOutbox"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UploadSession_projectId_key" ON "UploadSession"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UploadSession_workspaceId_status_idx" ON "UploadSession"("workspaceId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UploadSession_workspaceId_createdAt_idx" ON "UploadSession"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UploadSession_expiresAt_idx" ON "UploadSession"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UploadSession_storageKey_idx" ON "UploadSession"("storageKey");

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Account"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Account_userId_fkey'
       ) THEN
        ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Session"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Session_userId_fkey'
       ) THEN
        ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Authenticator"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Authenticator_userId_fkey'
       ) THEN
        ALTER TABLE "Authenticator" ADD CONSTRAINT "Authenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."LoginHistory"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'LoginHistory_userId_fkey'
       ) THEN
        ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."WorkspaceMember"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'WorkspaceMember_workspaceId_fkey'
       ) THEN
        ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."WorkspaceMember"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'WorkspaceMember_userId_fkey'
       ) THEN
        ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."WorkspaceInvitation"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'WorkspaceInvitation_workspaceId_fkey'
       ) THEN
        ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."WorkspaceInvitation"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'WorkspaceInvitation_invitedById_fkey'
       ) THEN
        ALTER TABLE "WorkspaceInvitation" ADD CONSTRAINT "WorkspaceInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Client"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Client_workspaceId_fkey'
       ) THEN
        ALTER TABLE "Client" ADD CONSTRAINT "Client_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Client"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Client_brandKitId_fkey'
       ) THEN
        ALTER TABLE "Client" ADD CONSTRAINT "Client_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Project"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Project_workspaceId_fkey'
       ) THEN
        ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Project"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Project_clientId_fkey'
       ) THEN
        ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."SourceVideo"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'SourceVideo_projectId_fkey'
       ) THEN
        ALTER TABLE "SourceVideo" ADD CONSTRAINT "SourceVideo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Transcript"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Transcript_projectId_fkey'
       ) THEN
        ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."TranscriptSegment"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'TranscriptSegment_transcriptId_fkey'
       ) THEN
        ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Clip"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Clip_workspaceId_fkey'
       ) THEN
        ALTER TABLE "Clip" ADD CONSTRAINT "Clip_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Clip"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Clip_projectId_fkey'
       ) THEN
        ALTER TABLE "Clip" ADD CONSTRAINT "Clip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."ClipScore"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ClipScore_clipId_fkey'
       ) THEN
        ALTER TABLE "ClipScore" ADD CONSTRAINT "ClipScore_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."EditorProject"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'EditorProject_workspaceId_fkey'
       ) THEN
        ALTER TABLE "EditorProject" ADD CONSTRAINT "EditorProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."EditorProject"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'EditorProject_clipId_fkey'
       ) THEN
        ALTER TABLE "EditorProject" ADD CONSTRAINT "EditorProject_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."EditorProject"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'EditorProject_brandKitId_fkey'
       ) THEN
        ALTER TABLE "EditorProject" ADD CONSTRAINT "EditorProject_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."EditorProject"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'EditorProject_templateId_fkey'
       ) THEN
        ALTER TABLE "EditorProject" ADD CONSTRAINT "EditorProject_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."EditorElement"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'EditorElement_editorProjectId_fkey'
       ) THEN
        ALTER TABLE "EditorElement" ADD CONSTRAINT "EditorElement_editorProjectId_fkey" FOREIGN KEY ("editorProjectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."EditorRevision"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'EditorRevision_editorProjectId_fkey'
       ) THEN
        ALTER TABLE "EditorRevision" ADD CONSTRAINT "EditorRevision_editorProjectId_fkey" FOREIGN KEY ("editorProjectId") REFERENCES "EditorProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."CaptionPreset"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'CaptionPreset_workspaceId_fkey'
       ) THEN
        ALTER TABLE "CaptionPreset" ADD CONSTRAINT "CaptionPreset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Template"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Template_workspaceId_fkey'
       ) THEN
        ALTER TABLE "Template" ADD CONSTRAINT "Template_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."BrandKit"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'BrandKit_workspaceId_fkey'
       ) THEN
        ALTER TABLE "BrandKit" ADD CONSTRAINT "BrandKit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."RenderJob"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'RenderJob_workspaceId_fkey'
       ) THEN
        ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."RenderJob"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'RenderJob_clipId_fkey'
       ) THEN
        ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."RenderedAsset"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'RenderedAsset_clipId_fkey'
       ) THEN
        ALTER TABLE "RenderedAsset" ADD CONSTRAINT "RenderedAsset_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."RenderedAsset"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'RenderedAsset_renderJobId_fkey'
       ) THEN
        ALTER TABLE "RenderedAsset" ADD CONSTRAINT "RenderedAsset_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "RenderJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."SocialAccount"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'SocialAccount_workspaceId_fkey'
       ) THEN
        ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."SocialAccount"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'SocialAccount_clientId_fkey'
       ) THEN
        ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."UploadPostProfile"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'UploadPostProfile_workspaceId_fkey'
       ) THEN
        ALTER TABLE "UploadPostProfile" ADD CONSTRAINT "UploadPostProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."SocialUsageEvent"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'SocialUsageEvent_workspaceId_fkey'
       ) THEN
        ALTER TABLE "SocialUsageEvent" ADD CONSTRAINT "SocialUsageEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."SocialPublication"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'SocialPublication_workspaceId_fkey'
       ) THEN
        ALTER TABLE "SocialPublication" ADD CONSTRAINT "SocialPublication_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."SocialPublication"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'SocialPublication_clipId_fkey'
       ) THEN
        ALTER TABLE "SocialPublication" ADD CONSTRAINT "SocialPublication_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."SocialPublicationTarget"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'SocialPublicationTarget_publicationId_fkey'
       ) THEN
        ALTER TABLE "SocialPublicationTarget" ADD CONSTRAINT "SocialPublicationTarget_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "SocialPublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."SocialPublicationTarget"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'SocialPublicationTarget_socialAccountId_fkey'
       ) THEN
        ALTER TABLE "SocialPublicationTarget" ADD CONSTRAINT "SocialPublicationTarget_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."SocialMetricSnapshot"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'SocialMetricSnapshot_socialAccountId_fkey'
       ) THEN
        ALTER TABLE "SocialMetricSnapshot" ADD CONSTRAINT "SocialMetricSnapshot_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."SocialPostMetricSnapshot"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'SocialPostMetricSnapshot_socialAccountId_fkey'
       ) THEN
        ALTER TABLE "SocialPostMetricSnapshot" ADD CONSTRAINT "SocialPostMetricSnapshot_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."SocialPostMetricSnapshot"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'SocialPostMetricSnapshot_targetId_fkey'
       ) THEN
        ALTER TABLE "SocialPostMetricSnapshot" ADD CONSTRAINT "SocialPostMetricSnapshot_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "SocialPublicationTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Schedule"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Schedule_workspaceId_fkey'
       ) THEN
        ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Schedule"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Schedule_publicationId_fkey'
       ) THEN
        ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "SocialPublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."AutopilotRule"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'AutopilotRule_workspaceId_fkey'
       ) THEN
        ALTER TABLE "AutopilotRule" ADD CONSTRAINT "AutopilotRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."LiveChannel"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'LiveChannel_workspaceId_fkey'
       ) THEN
        ALTER TABLE "LiveChannel" ADD CONSTRAINT "LiveChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."LiveChannel"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'LiveChannel_socialAccountId_fkey'
       ) THEN
        ALTER TABLE "LiveChannel" ADD CONSTRAINT "LiveChannel_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."LiveSession"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'LiveSession_liveChannelId_fkey'
       ) THEN
        ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_liveChannelId_fkey" FOREIGN KEY ("liveChannelId") REFERENCES "LiveChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Championship"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Championship_workspaceId_fkey'
       ) THEN
        ALTER TABLE "Championship" ADD CONSTRAINT "Championship_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Championship"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Championship_ownerId_fkey'
       ) THEN
        ALTER TABLE "Championship" ADD CONSTRAINT "Championship_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."ChampionshipParticipant"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ChampionshipParticipant_championshipId_fkey'
       ) THEN
        ALTER TABLE "ChampionshipParticipant" ADD CONSTRAINT "ChampionshipParticipant_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "Championship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."ClipSubmission"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ClipSubmission_championshipId_fkey'
       ) THEN
        ALTER TABLE "ClipSubmission" ADD CONSTRAINT "ClipSubmission_championshipId_fkey" FOREIGN KEY ("championshipId") REFERENCES "Championship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."ClipSubmission"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ClipSubmission_clipId_fkey'
       ) THEN
        ALTER TABLE "ClipSubmission" ADD CONSTRAINT "ClipSubmission_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."ClipSubmission"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ClipSubmission_userId_fkey'
       ) THEN
        ALTER TABLE "ClipSubmission" ADD CONSTRAINT "ClipSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."CreditBalance"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'CreditBalance_workspaceId_fkey'
       ) THEN
        ALTER TABLE "CreditBalance" ADD CONSTRAINT "CreditBalance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."CreditBatch"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'CreditBatch_workspaceId_fkey'
       ) THEN
        ALTER TABLE "CreditBatch" ADD CONSTRAINT "CreditBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."CreditTransaction"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'CreditTransaction_workspaceId_fkey'
       ) THEN
        ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Subscription"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Subscription_workspaceId_fkey'
       ) THEN
        ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Subscription"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Subscription_planId_fkey'
       ) THEN
        ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."InvoiceRecord"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'InvoiceRecord_subscriptionId_fkey'
       ) THEN
        ALTER TABLE "InvoiceRecord" ADD CONSTRAINT "InvoiceRecord_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."ApiKey"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ApiKey_workspaceId_fkey'
       ) THEN
        ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."ApiKey"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ApiKey_userId_fkey'
       ) THEN
        ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."WebhookEndpoint"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'WebhookEndpoint_workspaceId_fkey'
       ) THEN
        ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."WebhookDelivery"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'WebhookDelivery_endpointId_fkey'
       ) THEN
        ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Notification"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Notification_workspaceId_fkey'
       ) THEN
        ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."Notification"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'Notification_userId_fkey'
       ) THEN
        ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."AuditLog"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'AuditLog_userId_fkey'
       ) THEN
        ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."AuditLog"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'AuditLog_workspaceId_fkey'
       ) THEN
        ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."ProcessingJob"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ProcessingJob_workspaceId_fkey'
       ) THEN
        ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."ProcessingJob"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ProcessingJob_projectId_fkey'
       ) THEN
        ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."AdminAction"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'AdminAction_adminId_fkey'
       ) THEN
        ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."UsageEvent"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'UsageEvent_workspaceId_fkey'
       ) THEN
        ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF to_regclass('public."UploadSession"') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'UploadSession_workspaceId_fkey'
       ) THEN
        ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
