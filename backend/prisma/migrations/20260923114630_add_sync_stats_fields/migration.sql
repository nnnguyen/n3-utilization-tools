-- AlterTable
ALTER TABLE "ZoomSyncLog" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "failureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fileSize" BIGINT;

-- Backfill rows created before these counters existed (best effort: history
-- was not kept, so each existing row counts as one attempt)
UPDATE "ZoomSyncLog" SET "attemptCount" = 1 WHERE "attemptCount" = 0;
UPDATE "ZoomSyncLog" SET "failureCount" = 1 WHERE "syncStatus" = 'FAILED' AND "failureCount" = 0;
