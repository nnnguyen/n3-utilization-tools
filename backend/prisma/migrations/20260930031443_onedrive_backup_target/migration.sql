/*
  Warnings:

  - A unique constraint covering the columns `[recordingId,fileType,destination]` on the table `DriveBackup` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DriveBackupDestination" AS ENUM ('GOOGLE_DRIVE', 'ONEDRIVE');

-- DropIndex
DROP INDEX "DriveBackup_recordingId_fileType_key";

-- AlterTable
ALTER TABLE "DriveBackup" ADD COLUMN     "destination" "DriveBackupDestination" NOT NULL DEFAULT 'GOOGLE_DRIVE';

-- AlterTable
ALTER TABLE "ZoomWorkflowSettings" ADD COLUMN     "driveBackupTarget" "DriveBackupDestination" NOT NULL DEFAULT 'GOOGLE_DRIVE';

-- CreateIndex
CREATE UNIQUE INDEX "DriveBackup_recordingId_fileType_destination_key" ON "DriveBackup"("recordingId", "fileType", "destination");
