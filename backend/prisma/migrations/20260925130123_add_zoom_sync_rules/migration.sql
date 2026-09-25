-- AlterTable
ALTER TABLE "ZoomSyncLog" ADD COLUMN     "publishAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ZoomSyncRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "matchText" TEXT NOT NULL,
    "titleTemplate" TEXT,
    "descriptionTemplate" TEXT,
    "playlistId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "privacyStatus" TEXT,
    "publishDelayMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoomSyncRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZoomSyncRule_userId_position_idx" ON "ZoomSyncRule"("userId", "position");

-- AddForeignKey
ALTER TABLE "ZoomSyncRule" ADD CONSTRAINT "ZoomSyncRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
