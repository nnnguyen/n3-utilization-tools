-- AlterTable
ALTER TABLE "ZoomWorkflowSettings" ADD COLUMN     "driveBackupEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "driveFileTypes" TEXT[] DEFAULT ARRAY['MP4', 'M4A', 'TRANSCRIPT']::TEXT[];

-- CreateTable
CREATE TABLE "DriveBackup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "fileName" TEXT,
    "bytes" BIGINT,
    "driveFileId" TEXT,
    "folderId" TEXT,
    "uploadUrl" TEXT,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriveBackup_userId_status_idx" ON "DriveBackup"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DriveBackup_recordingId_fileType_key" ON "DriveBackup"("recordingId", "fileType");
