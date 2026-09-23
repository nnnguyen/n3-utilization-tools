-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'UPLOADING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "ZoomSyncLog" ADD COLUMN     "syncCompletedAt" TIMESTAMP(3),
ADD COLUMN     "syncError" TEXT,
ADD COLUMN     "syncStartedAt" TIMESTAMP(3),
ADD COLUMN     "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "youtubeVideoId" TEXT;
