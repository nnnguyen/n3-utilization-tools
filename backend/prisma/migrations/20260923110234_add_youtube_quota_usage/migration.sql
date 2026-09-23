-- AlterTable
ALTER TABLE "ZoomSyncLog" ADD COLUMN     "playlistId" TEXT;

-- CreateTable
CREATE TABLE "YoutubeQuotaUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "unitsUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YoutubeQuotaUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeQuotaUsage_userId_date_key" ON "YoutubeQuotaUsage"("userId", "date");

-- AddForeignKey
ALTER TABLE "YoutubeQuotaUsage" ADD CONSTRAINT "YoutubeQuotaUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
