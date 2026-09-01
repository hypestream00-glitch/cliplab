-- Additive affiliate wallet, cash referral rewards, and manual withdrawals.
-- No drops of tables/columns, no truncates, no data rewrites of existing users/clips.

ALTER TABLE "ReferralReward" DROP CONSTRAINT IF EXISTS "ReferralReward_grantId_fkey";
ALTER TABLE "ReferralReward" ALTER COLUMN "grantId" DROP NOT NULL;
ALTER TABLE "ReferralReward" ALTER COLUMN "days" SET DEFAULT 0;
ALTER TABLE "ReferralReward" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "ReferralReward" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "ReferralReward" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "ReferralReward" ADD COLUMN IF NOT EXISTS "cashAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ReferralReward" ADD COLUMN IF NOT EXISTS "aiMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ReferralReward" ADD COLUMN IF NOT EXISTS "rewardType" TEXT NOT NULL DEFAULT 'FIRST_PAID_SUBSCRIPTION';
ALTER TABLE "ReferralReward" ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "ReferralReward" ADD COLUMN IF NOT EXISTS "availableAt" TIMESTAMP(3);
ALTER TABLE "ReferralReward" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "ReferralReward" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "WorkspaceGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ReferralReward_referrerUserId_status_idx" ON "ReferralReward"("referrerUserId", "status");
CREATE INDEX IF NOT EXISTS "ReferralReward_status_availableAt_idx" ON "ReferralReward"("status", "availableAt");

CREATE TABLE IF NOT EXISTS "WalletLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceKind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "referralRewardId" TEXT,
    "withdrawalId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WalletLedgerEntry_idempotencyKey_key" ON "WalletLedgerEntry"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "WalletLedgerEntry_userId_createdAt_idx" ON "WalletLedgerEntry"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletLedgerEntry_userId_balanceKind_idx" ON "WalletLedgerEntry"("userId", "balanceKind");

CREATE TABLE IF NOT EXISTS "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "pixKeyType" TEXT NOT NULL,
    "pixKeyFingerprint" TEXT NOT NULL,
    "pixKeyCipher" TEXT NOT NULL,
    "pixKeyMasked" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderDocumentMasked" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "adminNote" TEXT,
    "paymentReference" TEXT,
    "approvedById" TEXT,
    "paidById" TEXT,
    "rejectedById" TEXT,
    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Withdrawal_userId_status_idx" ON "Withdrawal"("userId", "status");
CREATE INDEX IF NOT EXISTS "Withdrawal_status_requestedAt_idx" ON "Withdrawal"("status", "requestedAt");

CREATE TABLE IF NOT EXISTS "MinuteGrant" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "MinuteGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MinuteGrant_sourceKey_key" ON "MinuteGrant"("sourceKey");
CREATE INDEX IF NOT EXISTS "MinuteGrant_workspaceId_revokedAt_idx" ON "MinuteGrant"("workspaceId", "revokedAt");

CREATE TABLE IF NOT EXISTS "ReferralClick" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referrerUserId" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralClick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReferralClick_code_createdAt_idx" ON "ReferralClick"("code", "createdAt");
CREATE INDEX IF NOT EXISTS "ReferralClick_referrerUserId_idx" ON "ReferralClick"("referrerUserId");

CREATE TABLE IF NOT EXISTS "AffiliateFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "AffiliateFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AffiliateFlag_userId_status_idx" ON "AffiliateFlag"("userId", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WalletLedgerEntry_userId_fkey') THEN
    ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WalletLedgerEntry_referralRewardId_fkey') THEN
    ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_referralRewardId_fkey" FOREIGN KEY ("referralRewardId") REFERENCES "ReferralReward"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WalletLedgerEntry_withdrawalId_fkey') THEN
    ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Withdrawal_userId_fkey') THEN
    ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MinuteGrant_workspaceId_fkey') THEN
    ALTER TABLE "MinuteGrant" ADD CONSTRAINT "MinuteGrant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MinuteGrant_userId_fkey') THEN
    ALTER TABLE "MinuteGrant" ADD CONSTRAINT "MinuteGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferralClick_referrerUserId_fkey') THEN
    ALTER TABLE "ReferralClick" ADD CONSTRAINT "ReferralClick_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateFlag_userId_fkey') THEN
    ALTER TABLE "AffiliateFlag" ADD CONSTRAINT "AffiliateFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
