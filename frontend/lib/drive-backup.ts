// Google Drive backups of Zoom files (P2-3, docs/design/P2-3-google-drive.md).
// One row per file; the recordings table shows one summary per recording.

export type DriveBackupStatus = 'pending' | 'uploading' | 'done' | 'failed' | 'skipped';

export interface DriveBackupRow {
  recordingId: string;
  fileType: string;
  status: DriveBackupStatus;
  fileName: string | null;
  bytes: number | null;
  driveFileId: string | null;
  folderId: string | null;
  errorCode: string | null;
  attempts: number;
  updatedAt: string;
}

// The state shown for a whole recording, in priority order
export type DriveBackupState = 'failed' | 'uploading' | 'done' | 'skipped';

export const DRIVE_STATE_COLORS: Record<DriveBackupState, string> = {
  done: 'success',
  uploading: 'processing',
  failed: 'error',
  skipped: 'warning',
};

/** One state for a recording from its files: a problem outranks progress outranks done. */
export function aggregateBackupState(rows: { status: string }[]): DriveBackupState | null {
  if (rows.length === 0) return null;
  if (rows.some(r => r.status === 'failed')) return 'failed';
  if (rows.some(r => r.status === 'pending' || r.status === 'uploading')) return 'uploading';
  if (rows.some(r => r.status === 'done')) return 'done';
  return 'skipped'; // every file skipped (deleted on Zoom)
}

export function isDriveBackupActive(rows: { status: string }[]): boolean {
  return rows.some(r => r.status === 'pending' || r.status === 'uploading');
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

// Offered in the file-type picker; a saved value outside this list is kept
export const DRIVE_FILE_TYPES = ['MP4', 'M4A', 'TRANSCRIPT', 'CHAT'] as const;

// 1073741824 -> "1 GB" (binary units, like Google Drive)
export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0 })} ${units[unit]}`;
}
