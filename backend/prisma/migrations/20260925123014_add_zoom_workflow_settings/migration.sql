-- CreateTable
CREATE TABLE "ZoomWorkflowSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "autoUpload" BOOLEAN NOT NULL DEFAULT true,
    "titleTemplate" TEXT NOT NULL DEFAULT 'Zoom Recording: {topic}',
    "descriptionTemplate" TEXT NOT NULL DEFAULT 'Recorded on {date} {time}',
    "privacyStatus" TEXT NOT NULL DEFAULT 'private',
    "playlistId" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoomWorkflowSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZoomWorkflowSettings_userId_key" ON "ZoomWorkflowSettings"("userId");

-- AddForeignKey
ALTER TABLE "ZoomWorkflowSettings" ADD CONSTRAINT "ZoomWorkflowSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
