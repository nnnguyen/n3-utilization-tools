import { computePublishAt, findMatchingRule, resolveSyncOptions, SyncRule } from "./sync-rules";
import { renderUploadText, WorkflowSettings } from "./workflow-template";

// Upcoming meetings (P2-4a, docs/design/P2-4-upcoming-meetings.md): what the
// Zoom sync will do with each of them, from the same rules and templates.

/** A meeting as listed by Zoom's `users/me/meetings?type=upcoming`. */
export interface ZoomUpcomingMeeting {
  id?: number | string;
  topic?: string;
  type?: number;
  start_time?: string;
  duration?: number;
  timezone?: string;
}

export interface UpcomingMeeting {
  meetingId: string;
  topic: string;
  startTime: string;
  durationMinutes: number;
  recurring: boolean;
  rule: { id: string; matchText: string } | null;
  autoUpload: boolean;
  title: string;
  privacyStatus: string;
  playlistId: string | null;
  publishDelayMinutes: number | null;
  publishAt: string | null;
}

export const UPCOMING_DAYS_DEFAULT = 14;
export const UPCOMING_DAYS_MAX = 31;

/**
 * Occurrences starting from `now` to `now + days`, earliest first. Zoom lists
 * each occurrence of a recurring meeting on its own; meetings without a fixed
 * time (type 3) have no start time and are left out.
 */
export function upcomingInWindow(
  meetings: ZoomUpcomingMeeting[],
  now: Date,
  days: number,
): ZoomUpcomingMeeting[] {
  const end = now.getTime() + days * 24 * 60 * 60_000;
  const seen = new Set<string>();
  return meetings
    .filter((m) => {
      const start = Date.parse(m.start_time ?? "");
      if (Number.isNaN(start) || m.id === undefined) return false;
      // Still counts while it may be running (started less than its length ago)
      const running = start + (m.duration ?? 0) * 60_000 > now.getTime();
      if (!running || start > end) return false;
      const key = `${m.id}@${m.start_time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(a.start_time!) - Date.parse(b.start_time!));
}

/** What the sync will do with this meeting's recording. Never the join link or passcode. */
export function predictUpcoming(
  meeting: ZoomUpcomingMeeting,
  settings: WorkflowSettings,
  rules: SyncRule[],
  language: string,
): UpcomingMeeting {
  const topic = meeting.topic ?? "";
  const startTime = meeting.start_time!;
  const durationMinutes = meeting.duration ?? 0;
  const options = resolveSyncOptions(topic, settings, rules);
  const rule = findMatchingRule(topic, rules);
  const end = new Date(Date.parse(startTime) + durationMinutes * 60_000).toISOString();
  const publishAt = computePublishAt([{ recording_end: end }], startTime, options.publishDelayMinutes);
  return {
    meetingId: String(meeting.id),
    topic: topic.trim(),
    startTime,
    durationMinutes,
    recurring: meeting.type === 8,
    rule: rule ? { id: rule.id, matchText: rule.matchText } : null,
    autoUpload: options.autoUpload,
    title: renderUploadText(options, { topic, startTime }, language).title,
    // A scheduled publication uploads as private until then (P1-5)
    privacyStatus: publishAt ? "private" : options.privacyStatus,
    playlistId: options.playlistId || null,
    publishDelayMinutes: options.publishDelayMinutes,
    publishAt: publishAt?.toISOString() ?? null,
  };
}

/** Zoom refuses the call because the app lacks a scope (code 4711 / "scopes"). */
export function isMissingScopeError(error: any): boolean {
  const data = error?.response?.data;
  return data?.code === 4711 || /scope/i.test(String(data?.message ?? ""));
}
