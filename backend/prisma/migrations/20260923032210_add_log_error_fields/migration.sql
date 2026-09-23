-- AlterTable
ALTER TABLE "ZoomSyncLog" ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "errorSource" TEXT;
