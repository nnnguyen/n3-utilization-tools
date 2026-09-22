-- CreateTable
CREATE TABLE "ZoomSyncLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "meeting" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "youtubeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZoomSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZoomSyncLog_userId_idx" ON "ZoomSyncLog"("userId");

-- AddForeignKey
ALTER TABLE "ZoomSyncLog" ADD CONSTRAINT "ZoomSyncLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
