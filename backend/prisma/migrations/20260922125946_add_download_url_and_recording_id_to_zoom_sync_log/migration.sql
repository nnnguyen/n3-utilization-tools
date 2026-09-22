/*
  Warnings:

  - A unique constraint covering the columns `[recordingId]` on the table `ZoomSyncLog` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ZoomSyncLog" ADD COLUMN     "downloadUrl" TEXT,
ADD COLUMN     "recordingId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ZoomSyncLog_recordingId_key" ON "ZoomSyncLog"("recordingId");
