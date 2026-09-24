// Finds Zoom recordings that are probably already on YouTube (uploaded before
// the app tracked them, or by hand) by comparing each recording with the
// videos of the user's channel. Pure functions: the service feeds them the
// recordings, the channel video cache and what to leave out.

export interface MatchRecording {
  recordingId: string;
  topic: string;
  startTime: string;
  // Lengths of the recording's MP4 files; a video uploaded by hand may be any of them
  durationsSeconds: number[];
}

export interface MatchVideo {
  videoId: string;
  title: string;
  durationSeconds: number | null;
  publishedAt: Date | null;
  // Set when the description carries this app's "Zoom recording ID:" line
  zoomRecordingId: string | null;
}

export interface MatchResult {
  score: number;
  // The video names the recording itself (an upload by this app): certain
  exact: boolean;
}

// Suggest from this score up. An MP4 of the same length (within 5s) reaches it
// on its own; a looser length needs the title or the date to agree as well.
export const MATCH_THRESHOLD = 60;

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

// "SOH|Thực hành cầu nguyện" -> "soh thuc hanh cau nguyen"
export function normalizeTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(value: string): Set<string> {
  return new Set(value.split(" ").filter((w) => w.length >= 2));
}

function durationPoints(video: MatchVideo, recording: MatchRecording): number {
  if (video.durationSeconds == null || recording.durationsSeconds.length === 0) return 0;
  const diff = Math.min(
    ...recording.durationsSeconds.map((d) => Math.abs(d - video.durationSeconds!)),
  );
  if (diff <= 5) return 60;
  if (diff <= 30) return 45;
  if (diff <= 120) return 20;
  return 0;
}

function titlePoints(video: MatchVideo, recording: MatchRecording): number {
  const topic = normalizeTitle(recording.topic);
  const title = normalizeTitle(video.title);
  if (!topic || !title) return 0;
  if (title.includes(topic)) return 30;
  const a = words(topic);
  const b = words(title);
  const shared = [...a].filter((w) => b.has(w)).length;
  const overlap = shared / Math.max(1, new Set([...a, ...b]).size);
  if (overlap >= 0.6) return 20;
  if (overlap >= 0.3) return 10;
  return 0;
}

export function scoreMatch(recording: MatchRecording, video: MatchVideo): MatchResult {
  if (video.zoomRecordingId && video.zoomRecordingId === recording.recordingId) {
    return { score: 100, exact: true };
  }

  const start = Date.parse(recording.startTime);
  const published = video.publishedAt?.getTime() ?? null;
  // A video published before the meeting took place cannot be its recording
  if (published != null && !Number.isNaN(start) && published < start - HOUR_MS) {
    return { score: 0, exact: false };
  }

  let score = durationPoints(video, recording) + titlePoints(video, recording);
  if (published != null && !Number.isNaN(start)) {
    const after = published - start;
    if (after <= 7 * DAY_MS) score += 10;
    else if (after <= 30 * DAY_MS) score += 5;
  }
  return { score: Math.min(score, 99), exact: false };
}

// Best video per recording, each video suggested for at most one recording
// (the one it matches best), leaving out videos already linked to a sync and
// pairs the user dismissed ("recordingId|videoId")
export function findMatches(
  recordings: MatchRecording[],
  videos: MatchVideo[],
  options: { usedVideoIds: Set<string>; dismissed: Set<string> },
): Map<string, { video: MatchVideo } & MatchResult> {
  const pairs: { recording: MatchRecording; video: MatchVideo; result: MatchResult }[] = [];
  for (const recording of recordings) {
    for (const video of videos) {
      if (options.usedVideoIds.has(video.videoId)) continue;
      if (options.dismissed.has(`${recording.recordingId}|${video.videoId}`)) continue;
      const result = scoreMatch(recording, video);
      if (result.score >= MATCH_THRESHOLD) pairs.push({ recording, video, result });
    }
  }
  pairs.sort((a, b) => b.result.score - a.result.score);

  const matches = new Map<string, { video: MatchVideo } & MatchResult>();
  const takenVideos = new Set<string>();
  for (const { recording, video, result } of pairs) {
    if (matches.has(recording.recordingId) || takenVideos.has(video.videoId)) continue;
    matches.set(recording.recordingId, { video, ...result });
    takenVideos.add(video.videoId);
  }
  return matches;
}

// The line this app writes in the description of its uploads, and reads back
export const RECORDING_ID_PREFIX = "Zoom recording ID:";

export function recordingIdFromDescription(description: string | null | undefined): string | null {
  const match = description?.match(/Zoom recording ID:\s*(\S+)/);
  return match ? match[1] : null;
}

// Seconds of each MP4 in a Zoom recording (from its files' start/end times)
export function mp4Durations(recordingFiles: any[] | undefined): number[] {
  return (recordingFiles || [])
    .filter((f) => f.file_type === "MP4")
    .map((f) => (Date.parse(f.recording_end) - Date.parse(f.recording_start)) / 1000)
    .filter((s) => Number.isFinite(s) && s > 0)
    .map((s) => Math.round(s));
}
