// Texts the backend renders for a reader (notification emails, and the
// Vietnamese title/message kept on Notification rows for old clients). The
// frontend renders the same notifications from `data` with its own i18n keys
// (notif.type.*, syncError.*): keep both in step.

export type Language = "vi" | "en";

export type NotificationType = "sync_completed" | "sync_failed";

export interface SyncCompletedData {
  meeting: string;
  videoId: string;
}

export interface SyncFailedData {
  meeting: string;
  // Known codes are translated (SYNC_ERROR_TEXT); otherwise `error` is shown
  errorCode: string | null;
  error: string;
  autoRetryCount: number;
}

export type NotificationData = SyncCompletedData | SyncFailedData;

// Sync errors with a stable code (ZoomSyncLog.errorCode / Notification.data)
export const SYNC_ERROR_TEXT: Record<string, Record<Language, string>> = {
  uploadLimitExceeded: {
    vi: "Kênh YouTube đã đạt giới hạn upload trong ngày",
    en: "The YouTube channel reached its daily upload limit",
  },
  videoDurationTooLong: {
    vi: "Video quá dài — channel YouTube cần xác minh số điện thoại để upload video dài hơn 15 phút",
    en: "Video too long — the YouTube channel must be phone-verified to upload videos longer than 15 minutes",
  },
  invalid_grant: {
    vi: "Token xác thực YouTube đã hết hạn — cần Authorize lại trong trang Integrations",
    en: "The YouTube authorization expired — authorize again on the Integrations page",
  },
  quotaExceeded: {
    vi: "Đã hết quota API YouTube trong ngày, thử lại vào ngày mai",
    en: "The YouTube API quota for today is used up; try again tomorrow",
  },
  networkError: {
    vi: "Không tải được file từ Zoom (link download có thể đã hết hạn hoặc lỗi mạng)",
    en: "Could not download the file from Zoom (the download link may have expired, or a network error occurred)",
  },
  VIDEO_NOT_FOUND: {
    vi: "Video đã bị xoá trên YouTube",
    en: "The video was deleted on YouTube",
  },
  retryQuotaExhausted: {
    vi: "Không thể tự động thử lại vì đã hết quota API hôm nay, vui lòng Re-sync thủ công vào ngày mai",
    en: "Could not retry automatically because today's API quota is used up; re-sync manually tomorrow",
  },
};

export function syncErrorText(
  errorCode: string | null | undefined,
  fallback: string,
  language: Language,
): string {
  return (errorCode && SYNC_ERROR_TEXT[errorCode]?.[language]) || fallback;
}

const TEXT = {
  vi: {
    completedTitle: "Video đã sẵn sàng",
    completedMessage: (d: SyncCompletedData) =>
      `Video "${d.meeting}" đã sẵn sàng để xem`,
    failedTitle: "Sync thất bại",
    failedMessage: (d: SyncFailedData, reason: string) =>
      `Sync "${d.meeting}" thất bại: ${reason}` +
      (d.autoRetryCount > 0
        ? ` (đã tự động thử lại ${d.autoRetryCount} lần)`
        : ""),
    greeting: (name: string | null) => `Xin chào ${name || "bạn"},`,
    viewDetails: "Xem chi tiết",
    viewVideo: "Xem video",
    footer:
      "Đây là email tự động từ N3 Connect. Bạn có thể tắt email thông báo trong mục Notifications (biểu tượng chuông) tại",
  },
  en: {
    completedTitle: "Video ready",
    completedMessage: (d: SyncCompletedData) =>
      `The video "${d.meeting}" is ready to watch`,
    failedTitle: "Sync failed",
    failedMessage: (d: SyncFailedData, reason: string) =>
      `Syncing "${d.meeting}" failed: ${reason}` +
      (d.autoRetryCount > 0
        ? ` (retried automatically ${d.autoRetryCount} time${d.autoRetryCount > 1 ? "s" : ""})`
        : ""),
    greeting: (name: string | null) => `Hello ${name || "there"},`,
    viewDetails: "View details",
    viewVideo: "Watch the video",
    footer:
      "This is an automatic email from N3 Connect. You can turn notification emails off under Notifications (the bell icon) at",
  },
};

export function toLanguage(value: string | null | undefined): Language {
  return value === "en" ? "en" : "vi";
}

/** Title and message of a notification in a language. */
export function renderNotification(
  type: NotificationType,
  data: NotificationData,
  language: Language,
): { title: string; message: string } {
  const text = TEXT[language];
  if (type === "sync_completed") {
    return {
      title: text.completedTitle,
      message: text.completedMessage(data as SyncCompletedData),
    };
  }
  const failed = data as SyncFailedData;
  return {
    title: text.failedTitle,
    message: text.failedMessage(
      failed,
      syncErrorText(failed.errorCode, failed.error, language),
    ),
  };
}

/** Surrounding texts of the notification email. */
export function emailText(language: Language) {
  const { greeting, viewDetails, viewVideo, footer } = TEXT[language];
  return { greeting, viewDetails, viewVideo, footer };
}
