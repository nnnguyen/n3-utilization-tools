/*
  Warnings:

  - A unique constraint covering the columns `[workspaceId,videoId]` on the table `ChannelVideoCache` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[workspaceId,provider]` on the table `Connection` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[workspaceId,provider,date]` on the table `QuotaUsage` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[workspaceId,recordingId]` on the table `ZoomSyncLog` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[workspaceId]` on the table `ZoomWorkflowSettings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[workspaceId,recordingId,videoId]` on the table `ZoomYoutubeMatchDismissal` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ChannelVideoCache" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Connection" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "QuotaUsage" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeWorkspaceId" TEXT;

-- AlterTable
ALTER TABLE "ZoomSyncLog" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "ZoomSyncRule" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "ZoomWorkflowSettings" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "ZoomYoutubeMatchDismissal" ADD COLUMN     "workspaceId" TEXT;

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateTable
CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_tokenHash_key" ON "WorkspaceInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "ChannelVideoCache_workspaceId_idx" ON "ChannelVideoCache"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelVideoCache_workspaceId_videoId_key" ON "ChannelVideoCache"("workspaceId", "videoId");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_workspaceId_provider_key" ON "Connection"("workspaceId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaUsage_workspaceId_provider_date_key" ON "QuotaUsage"("workspaceId", "provider", "date");

-- CreateIndex
CREATE INDEX "ZoomSyncLog_workspaceId_createdAt_idx" ON "ZoomSyncLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ZoomSyncLog_workspaceId_recordingId_key" ON "ZoomSyncLog"("workspaceId", "recordingId");

-- CreateIndex
CREATE INDEX "ZoomSyncRule_workspaceId_position_idx" ON "ZoomSyncRule"("workspaceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ZoomWorkflowSettings_workspaceId_key" ON "ZoomWorkflowSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "ZoomYoutubeMatchDismissal_workspaceId_idx" ON "ZoomYoutubeMatchDismissal"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoomYoutubeMatchDismissal_workspaceId_recordingId_videoId_key" ON "ZoomYoutubeMatchDismissal"("workspaceId", "recordingId", "videoId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoomWorkflowSettings" ADD CONSTRAINT "ZoomWorkflowSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoomSyncRule" ADD CONSTRAINT "ZoomSyncRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotaUsage" ADD CONSTRAINT "QuotaUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoomSyncLog" ADD CONSTRAINT "ZoomSyncLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelVideoCache" ADD CONSTRAINT "ChannelVideoCache_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoomYoutubeMatchDismissal" ADD CONSTRAINT "ZoomYoutubeMatchDismissal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
