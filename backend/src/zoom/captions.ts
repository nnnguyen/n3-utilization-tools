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
