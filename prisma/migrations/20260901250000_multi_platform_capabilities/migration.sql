-- Incremental: Bilibili as a social platform + trending region/kind for honest live vs VOD scoring.
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'BILIBILI';

ALTER TABLE "TrendingItem" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "TrendingItem" ADD COLUMN IF NOT EXISTS "kind" TEXT;

CREATE INDEX IF NOT EXISTS "TrendingItem_platform_region_kind_idx" ON "TrendingItem"("platform", "region", "kind");
