import { normalizeTitle } from "./youtube-match";
import type { WorkflowSettings } from "./workflow-template";

type Privacy = "public" | "unlisted" | "private";

export interface SyncRule {
  id: string;
  position: number;
  matchText: string;
  titleTemplate: string | null;
  descriptionTemplate: string | null;
  playlistId: string | null;
  tags: string[];
  privacyStatus: string | null;
  publishDelayMinutes: number | null;
  captionLanguage?: string | null;
}

export interface SyncOptions extends WorkflowSettings {
  ruleId: string | null;
  tags: string[];
  publishDelayMinutes: number | null;
}

/**
 * First rule (by position) whose text is contained in the topic, ignoring case
 * and accents; whole words only, so "GOH" does not match "GOHO".
 */
export function findMatchingRule<T extends SyncRule>(
  topic: string,
  rules: T[],
): T | null {
  const normalizedTopic = ` ${normalizeTitle(topic)} `;
  const sorted = [...rules].sort((a, b) => a.position - b.position);
  for (const rule of sorted) {
    const text = normalizeTitle(rule.matchText);
    if (text && normalizedTopic.includes(` ${text} `)) return rule;
  }
  return null;
}

/** Workflow settings overridden, field by field, by the first matching rule. */
export function resolveSyncOptions(
  topic: string,
  settings: WorkflowSettings,
  rules: SyncRule[],
): SyncOptions {
  const rule = findMatchingRule(topic, rules);
  if (!rule) {
    return { ...settings, ruleId: null, tags: [], publishDelayMinutes: null };
  }
  return {
    ...settings,
    ruleId: rule.id,
    titleTemplate: rule.titleTemplate || settings.titleTemplate,
    descriptionTemplate: rule.descriptionTemplate ?? settings.descriptionTemplate,
    playlistId: rule.playlistId || settings.playlistId,
    privacyStatus: (rule.privacyStatus as Privacy) || settings.privacyStatus,
    tags: rule.tags,
    publishDelayMinutes: rule.publishDelayMinutes ?? null,
    captionLanguage: rule.captionLanguage || settings.captionLanguage,
  };
}

// Leaves YouTube time to accept the schedule; a publish time closer than this
// is treated as "publish now"
const MIN_SCHEDULE_LEAD_MS = 60_000;

/**
 * YouTube only schedules private videos (status.publishAt). A publish time
 * already past when the upload runs (e.g. a late retry) means: publish now.
 */
export function scheduledPrivacy(
  publishAt: Date | null | undefined,
  privacyStatus: Privacy,
  now = new Date(),
): { privacyStatus: Privacy; publishAt?: string } {
  if (!publishAt) return { privacyStatus };
  if (publishAt.getTime() - now.getTime() < MIN_SCHEDULE_LEAD_MS) {
    return { privacyStatus: "public" };
  }
  return { privacyStatus: "private", publishAt: publishAt.toISOString() };
}

/** Publish time of a recording: its end (latest file end, else start) + delay. */
export function computePublishAt(
  recordingFiles: { recording_end?: string }[],
  startTime: string,
  delayMinutes: number | null,
): Date | null {
  if (delayMinutes === null || delayMinutes === undefined) return null;
  const ends = recordingFiles
    .map((f) => Date.parse(f.recording_end ?? ""))
    .filter((t) => !Number.isNaN(t));
  const base = ends.length > 0 ? Math.max(...ends) : Date.parse(startTime);
  if (Number.isNaN(base)) return null;
  return new Date(base + delayMinutes * 60_000);
}
