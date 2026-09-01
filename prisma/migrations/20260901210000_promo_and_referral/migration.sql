-- Additive promo + referral tables. No drops, no data rewrites.

CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "benefitType" TEXT NOT NULL DEFAULT 'PLAN_GRANT',
    "grantPlanCode" "PlanCode" NOT NULL,
    "benefitDays" INTEGER NOT NULL,
    "maxRedemptions" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

CREATE TABLE "WorkspaceGrant" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT,
    "planCode" "PlanCode" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceGrant_workspaceId_endsAt_idx" ON "WorkspaceGrant"("workspaceId", "endsAt");
CREATE INDEX "WorkspaceGrant_source_sourceKey_idx" ON "WorkspaceGrant"("source", "sourceKey");

CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoRedemption_grantId_key" ON "PromoRedemption"("grantId");
CREATE UNIQUE INDEX "PromoRedemption_promoCodeId_userId_key" ON "PromoRedemption"("promoCodeId", "userId");
CREATE INDEX "PromoRedemption_promoCodeId_redeemedAt_idx" ON "PromoRedemption"("promoCodeId", "redeemedAt");
CREATE INDEX "PromoRedemption_workspaceId_idx" ON "PromoRedemption"("workspaceId");

CREATE TABLE "ReferralProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralProfile_userId_key" ON "ReferralProfile"("userId");
CREATE UNIQUE INDEX "ReferralProfile_code_key" ON "ReferralProfile"("code");

CREATE TABLE "ReferralAttribution" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralAttribution_referredUserId_key" ON "ReferralAttribution"("referredUserId");
CREATE INDEX "ReferralAttribution_referrerUserId_idx" ON "ReferralAttribution"("referrerUserId");
CREATE INDEX "ReferralAttribution_code_idx" ON "ReferralAttribution"("code");

CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "stripeEventId" TEXT,
    "stripeInvoiceId" TEXT,
    "days" INTEGER NOT NULL DEFAULT 7,
    "status" TEXT NOT NULL DEFAULT 'GRANTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralReward_attributionId_key" ON "ReferralReward"("attributionId");
CREATE UNIQUE INDEX "ReferralReward_grantId_key" ON "ReferralReward"("grantId");
CREATE UNIQUE INDEX "ReferralReward_stripeEventId_key" ON "ReferralReward"("stripeEventId");
CREATE INDEX "ReferralReward_referrerUserId_idx" ON "ReferralReward"("referrerUserId");
CREATE INDEX "ReferralReward_workspaceId_idx" ON "ReferralReward"("workspaceId");

ALTER TABLE "WorkspaceGrant" ADD CONSTRAINT "WorkspaceGrant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceGrant" ADD CONSTRAINT "WorkspaceGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "WorkspaceGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralProfile" ADD CONSTRAINT "ReferralProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "ReferralAttribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "WorkspaceGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PromoCode" ("id", "code", "name", "description", "active", "benefitType", "grantPlanCode", "benefitDays", "createdAt", "updatedAt")
VALUES (
  'promo_mugao12',
  'MUGAO12',
  '3 dias grátis',
  'Ganhe 3 dias grátis no CortaClip.',
  true,
  'PLAN_GRANT',
  'CREATOR',
  3,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
