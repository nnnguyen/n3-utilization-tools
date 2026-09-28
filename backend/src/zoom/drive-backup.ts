// Google Drive backups of Zoom files (P2-3b, docs/design/P2-3-google-drive.md):
// which files, their names and folders, how errors are classified and retried.

export const DRIVE_FILE_TYPES = ["MP4", "M4A", "TRANSCRIPT", "CHAT"] as const;
export type DriveFileType = (typeof DRIVE_FILE_TYPES)[number];

export type DriveBackupStatus = "pending" | "uploading" | "done" | "failed" | "skipped";

export interface ZoomFile {
  id?: string;
  file_type?: string;
  file_extension?: string;
  file_size?: number;
  recording_type?: string;
  status?: string;
  download_url?: string;
}

export interface BackupFile {
  fileType: DriveFileType;
  zoomFileId: string | null;
  downloadUrl: string;
  size: number | null;
  extension: string;
  mimeType: string;
}

const MIME: Record<DriveFileType, [string, string]> = {
  MP4: ["mp4", "video/mp4"],
  M4A: ["m4a", "audio/mp4"],
  TRANSCRIPT: ["vtt", "text/vtt"],
  CHAT: ["txt", "text/plain"],
};

const ready = (f: ZoomFile) => !!f.download_url && (f.status === undefined || f.status === "completed");

/**
 * The Zoom files to save for the chosen types: the same MP4 as the YouTube
 * sync (screen share with speaker, else the first MP4), the audio, the
 * transcript (else the in-meeting captions) and the chat.
 */
export function pickBackupFiles(files: ZoomFile[] = [], types: readonly string[]): BackupFile[] {
  const byType: Record<DriveFileType, ZoomFile | undefined> = {
    MP4:
      files.find((f) => f.file_type === "MP4" && f.recording_type === "shared_screen_with_speaker_view" && ready(f)) ??
      files.find((f) => f.file_type === "MP4" && ready(f)),
    M4A: files.find((f) => f.file_type === "M4A" && ready(f)),
    TRANSCRIPT:
      files.find((f) => f.file_type === "TRANSCRIPT" && ready(f)) ?? files.find((f) => f.file_type === "CC" && ready(f)),
    CHAT: files.find((f) => f.file_type === "CHAT" && ready(f)),
  };
  return DRIVE_FILE_TYPES.filter((type) => types.includes(type) && byType[type]).map((type) => {
    const file = byType[type]!;
    return {
      fileType: type,
      zoomFileId: file.id ?? null,
      downloadUrl: file.download_url!,
      size: file.file_size ?? null,
      extension: MIME[type][0],
      mimeType: MIME[type][1],
    };
  });
}

/** "2026-09-25" in the account's time zone. */
export function recordingDate(startTime: string, timeZone: string): string {
  const date = new Date(startTime);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

// Drive accepts almost anything, but "/" reads as a path in most tools
function cleanTopic(topic: string): string {
  return (topic || "Zoom").replace(/[\\/]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 150) || "Zoom";
}

/** N3 Connect / Zoom / <year> / <date> <topic> */
export function backupFolderPath(topic: string, startTime: string, timeZone: string): string[] {
  const date = recordingDate(startTime, timeZone);
  return ["N3 Connect", "Zoom", date.slice(0, 4), `${date} ${cleanTopic(topic)}`];
}

export function backupFileName(topic: string, startTime: string, timeZone: string, file: BackupFile): string {
  const suffix = file.fileType === "TRANSCRIPT" ? " (transcript)" : file.fileType === "CHAT" ? " (chat)" : "";
  return `${recordingDate(startTime, timeZone)} ${cleanTopic(topic)}${suffix}.${file.extension}`;
}

export interface ClassifiedError {
  code: string;
  retryable: boolean;
  // The Zoom file no longer exists: nothing to save
  skip?: boolean;
}

/** Drive/Zoom failures as translatable codes; only transient ones are retried. */
export function classifyBackupError(error: any): ClassifiedError {
  const status = error?.response?.status ?? error?.status ?? error?.code;
  const data = error?.response?.data;
  const reason = data?.error?.errors?.[0]?.reason ?? data?.error?.status ?? data?.error;
  const text = `${reason ?? ""} ${error?.message ?? ""}`;
  if (/storageQuotaExceeded|quotaExceeded.*storage/i.test(text)) return { code: "storageQuotaExceeded", retryable: false };
  if (/invalid_grant|DRIVE_NOT_CONNECTED/i.test(text) || status === 401) return { code: "DRIVE_NOT_CONNECTED", retryable: false };
  if (error?.source === "zoom" && status === 404) return { code: "ZOOM_FILE_GONE", retryable: false, skip: true };
  if (status === 429 || (typeof status === "number" && status >= 500) || /ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(text)) {
    return { code: "networkError", retryable: true };
  }
  if (/rateLimitExceeded|userRateLimitExceeded/i.test(text)) return { code: "networkError", retryable: true };
  return { code: "DRIVE_ERROR", retryable: false };
}

/** Bytes Google already has from a resumable session ("bytes=0-1023" -> 1024). */
export function uploadedBytes(range: string | null | undefined): number {
  const match = /bytes=0-(\d+)/.exec(range ?? "");
  return match ? Number(match[1]) + 1 : 0;
}

export const BACKUP_MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 30 * 60_000;
// An 'uploading' row older than this was interrupted (e.g. a restart)
const UPLOAD_STUCK_MS = 60 * 60_000;

/** What the scheduler does with a backup row. */
export function backupSweepDecision(
  row: { status: string; errorCode: string | null; attempts: number; updatedAt: Date },
  now = new Date(),
): "retry" | "wait" {
  const idle = now.getTime() - row.updatedAt.getTime();
  if (row.status === "pending") return "retry";
  if (row.status === "uploading") return idle >= UPLOAD_STUCK_MS ? "retry" : "wait";
  if (row.status === "failed" && row.errorCode === "networkError" && row.attempts < BACKUP_MAX_ATTEMPTS) {
    return idle >= RETRY_BACKOFF_MS * Math.max(1, row.attempts) ? "retry" : "wait";
  }
  return "wait";
}
