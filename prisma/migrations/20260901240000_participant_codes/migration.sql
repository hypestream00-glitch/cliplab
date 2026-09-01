-- AlterTable
ALTER TABLE "CompetitionParticipant" ADD COLUMN IF NOT EXISTS "participantCode" TEXT;

UPDATE "CompetitionParticipant"
SET "participantCode" = 'CC-' || UPPER(SUBSTRING(MD5("id") FROM 1 FOR 6))
WHERE "participantCode" IS NULL OR "participantCode" = '';

CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionParticipant_participantCode_key"
  ON "CompetitionParticipant"("participantCode");

ALTER TABLE "CompetitionParticipant" ALTER COLUMN "participantCode" SET NOT NULL;
