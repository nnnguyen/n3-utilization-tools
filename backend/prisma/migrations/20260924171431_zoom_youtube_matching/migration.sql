-- AlterTable
ALTER TABLE "ChannelVideoCache" ADD COLUMN     "zoomRecordingId" TEXT;

-- AlterTable
ALTER TABLE "ZoomSyncLog" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'upload';

-- CreateTable
CREATE TABLE "ZoomYoutubeMatchDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZoomYoutubeMatchDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZoomYoutubeMatchDismissal_userId_idx" ON "ZoomYoutubeMatchDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoomYoutubeMatchDismissal_userId_recordingId_videoId_key" ON "ZoomYoutubeMatchDismissal"("userId", "recordingId", "videoId");

-- AddForeignKey
ALTER TABLE "ZoomYoutubeMatchDismissal" ADD CONSTRAINT "ZoomYoutubeMatchDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
