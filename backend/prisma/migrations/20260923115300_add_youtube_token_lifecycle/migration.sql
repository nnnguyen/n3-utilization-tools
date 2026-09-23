-- AlterTable
ALTER TABLE "YoutubeConfig" ADD COLUMN     "lastTokenRefreshAt" TIMESTAMP(3),
ADD COLUMN     "tokenInvalidAt" TIMESTAMP(3),
ADD COLUMN     "tokenObtainedAt" TIMESTAMP(3);

-- Best-effort backfill: the issue time of existing refresh tokens was never
-- recorded; updatedAt is the closest available approximation.
UPDATE "YoutubeConfig" SET "tokenObtainedAt" = "updatedAt"
WHERE "refreshToken" IS NOT NULL AND "refreshToken" <> '' AND "tokenObtainedAt" IS NULL;
