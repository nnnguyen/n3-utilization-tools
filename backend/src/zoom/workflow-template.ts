// Automation Workflow templates: title/description of Zoom recordings
// uploaded to YouTube, with {topic}, {date} and {time} placeholders.

// Accounts that never saved the Automation Workflow form use these values.
// Auto-upload is off by default (2026-09-25): recordings reach YouTube only
// after the account turns it on or syncs them by hand.
export const DEFAULT_WORKFLOW_SETTINGS = {
  autoUpload: false,
  titleTemplate: "Zoom Recording: {topic}",
  descriptionTemplate: "Recorded on {date} {time}",
  privacyStatus: "private" as "public" | "unlisted" | "private",
  playlistId: null as string | null,
  timeZone: "Asia/Ho_Chi_Minh",
  // Captions from the Zoom transcript (P2-5): off by default, Vietnamese
  captionsEnabled: false,
  captionLanguage: "vi",
  captionName: null as string | null,
};

export type WorkflowSettings = typeof DEFAULT_WORKFLOW_SETTINGS;

// YouTube rejects longer titles
export const YOUTUBE_TITLE_MAX_LENGTH = 100;

/** Replaces known {placeholders}; unknown ones are left as-is. */
export function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

/** {date} and {time} of a recording, in the account's language and time zone. */
export function formatRecordingTime(
  startTime: string,
  language: string,
  timeZone: string,
): { date: string; time: string } {
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return { date: startTime, time: "" };
  const locale = language === "en" ? "en-US" : "vi-VN";
  const zone = isValidTimeZone(timeZone)
    ? timeZone
    : DEFAULT_WORKFLOW_SETTINGS.timeZone;
  return {
    date: new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      year: "numeric",
      month: locale === "en-US" ? "short" : "2-digit",
      day: "2-digit",
    }).format(date),
    time: new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: locale === "en-US",
    }).format(date),
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Title and description of an upload; the title fits YouTube's limit and is never empty. */
export function renderUploadText(
  settings: Pick<WorkflowSettings, "titleTemplate" | "descriptionTemplate" | "timeZone">,
  recording: { topic: string; startTime: string },
  language: string,
): { title: string; description: string } {
  const { date, time } = formatRecordingTime(
    recording.startTime,
    language,
    settings.timeZone,
  );
  const values = { topic: recording.topic, date, time };
  const title =
    renderTemplate(settings.titleTemplate, values).trim() ||
    recording.topic ||
    "Zoom Recording";
  return {
    title: Array.from(title).slice(0, YOUTUBE_TITLE_MAX_LENGTH).join("").trim(),
    description: renderTemplate(settings.descriptionTemplate, values).trim(),
  };
}
