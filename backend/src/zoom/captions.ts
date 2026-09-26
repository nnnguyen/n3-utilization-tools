// Captions from the Zoom transcript (docs/design/P2-5-captions.md)

// BCP-47 language tag as YouTube expects it: 'vi', 'en', 'en-US', 'zh-Hant'…
export const CAPTION_LANGUAGE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export type CaptionStatus =
  | "waiting_transcript"
  | "pending"
  | "uploaded"
  | "failed"
  | "no_transcript";

export interface ZoomRecordingFile {
  file_type?: string;
  file_extension?: string;
  status?: string;
  download_url?: string;
  recording_type?: string;
}

/**
 * The transcript to use: Zoom's audio transcript, else the closed captions of
 * the meeting (both WebVTT). Only files Zoom finished processing.
 */
export function pickTranscriptFile(files: ZoomRecordingFile[] = []): ZoomRecordingFile | null {
  const ready = (f: ZoomRecordingFile) =>
    !!f.download_url && (f.status === undefined || f.status === "completed");
  return (
    files.find((f) => f.file_type === "TRANSCRIPT" && ready(f)) ??
    files.find((f) => f.file_type === "CC" && ready(f)) ??
    null
  );
}

// Track name on YouTube when the account did not choose one
const DEFAULT_TRACK_NAMES: Record<string, string> = {
  vi: "Tiếng Việt (Zoom)",
  en: "English (Zoom)",
};

export function captionTrackName(language: string, customName?: string | null): string {
  return customName?.trim() || DEFAULT_TRACK_NAMES[language] || `${language} (Zoom)`;
}

// YouTube errors worth retrying later (quota resets daily, network hiccups)
const RETRYABLE_CODES = new Set(["quotaExceeded", "networkError", "TRANSCRIPT_DOWNLOAD_FAILED"]);

export function isRetryableCaptionError(code: string | null | undefined): boolean {
  return !!code && RETRYABLE_CODES.has(code);
}

// How long to keep looking for a transcript after the video is done
export const CAPTION_WAIT_MS = 48 * 60 * 60_000;
// Retryable failures: at most this many attempts, spaced by 30 min × attempts
export const CAPTION_MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 30 * 60_000;
// A transcript is re-checked at most this often while waiting
const WAIT_RECHECK_MS = 10 * 60_000;
// A 'pending' upload older than this was interrupted (e.g. a restart)
const PENDING_STUCK_MS = 30 * 60_000;

export interface CaptionSweepCandidate {
  captionStatus: string | null;
  captionErrorCode: string | null;
  captionAttempts: number;
  captionUpdatedAt: Date | null;
  syncCompletedAt: Date | null;
}

/** What the scheduler does with a recording in the caption workflow. */
export function captionSweepDecision(
  log: CaptionSweepCandidate,
  now = new Date(),
): "retry" | "give_up" | "wait" {
  const since = (d: Date | null) => (d ? now.getTime() - d.getTime() : Infinity);
  const age = since(log.syncCompletedAt ?? log.captionUpdatedAt);
  const idle = since(log.captionUpdatedAt);

  switch (log.captionStatus) {
    case "waiting_transcript":
      if (age > CAPTION_WAIT_MS) return "give_up";
      return idle >= WAIT_RECHECK_MS ? "retry" : "wait";
    case "pending":
      if (age > CAPTION_WAIT_MS) return "give_up";
      return idle >= PENDING_STUCK_MS ? "retry" : "wait";
    case "failed":
      if (!isRetryableCaptionError(log.captionErrorCode)) return "wait";
      if (log.captionAttempts >= CAPTION_MAX_ATTEMPTS || age > CAPTION_WAIT_MS) return "wait";
      return idle >= RETRY_BACKOFF_MS * Math.max(1, log.captionAttempts) ? "retry" : "wait";
    default:
      return "wait";
  }
}
