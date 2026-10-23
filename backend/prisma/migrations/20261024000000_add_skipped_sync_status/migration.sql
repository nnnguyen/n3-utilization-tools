-- Add a SKIPPED value to the SyncStatus enum.
--
-- createWebhookReceivedLog records a ZoomSyncLog when a recording.completed
-- webhook arrives even if auto-upload is off, marking it syncStatus = SKIPPED
-- so it is not treated as a pending or active sync (it is excluded from
-- ACTIVE_STATUSES and from the PENDING match filter in YoutubeMatchService).

ALTER TYPE "SyncStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';
