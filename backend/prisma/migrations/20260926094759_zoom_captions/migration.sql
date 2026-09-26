-- AlterTable
ALTER TABLE "ZoomSyncLog" ADD COLUMN     "captionAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "captionError" TEXT,
ADD COLUMN     "captionErrorCode" TEXT,
ADD COLUMN     "captionStatus" TEXT,
ADD COLUMN     "captionTrackId" TEXT,
ADD COLUMN     "captionUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ZoomSyncRule" ADD COLUMN     "captionLanguage" TEXT;

-- AlterTable
ALTER TABLE "ZoomWorkflowSettings" ADD COLUMN     "captionLanguage" TEXT NOT NULL DEFAULT 'vi',
ADD COLUMN     "captionName" TEXT,
ADD COLUMN     "captionsEnabled" BOOLEAN NOT NULL DEFAULT false;
