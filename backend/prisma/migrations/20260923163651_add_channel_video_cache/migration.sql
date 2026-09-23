-- AlterTable
ALTER TABLE "YoutubeConfig" ADD COLUMN     "channelVideosFetchedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChannelVideoCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnail" TEXT,
    "privacyStatus" TEXT,
    "durationSeconds" INTEGER,
    "viewCount" INTEGER,
    "likeCount" INTEGER,
    "commentCount" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelVideoCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelVideoCache_userId_idx" ON "ChannelVideoCache"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelVideoCache_userId_videoId_key" ON "ChannelVideoCache"("userId", "videoId");

-- AddForeignKey
ALTER TABLE "ChannelVideoCache" ADD CONSTRAINT "ChannelVideoCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
