-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyEmailOnCompleted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyEmailOnFailed" BOOLEAN NOT NULL DEFAULT true;
