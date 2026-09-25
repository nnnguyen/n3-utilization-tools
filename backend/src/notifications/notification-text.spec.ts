import {
  renderNotification,
  SYNC_ERROR_TEXT,
  syncErrorText,
  toLanguage,
} from "./notification-text";

describe("renderNotification", () => {
  it("renders a completed sync in both languages", () => {
    const data = { meeting: "SOH", videoId: "abc" };
    expect(renderNotification("sync_completed", data, "vi")).toEqual({
      title: "Video đã sẵn sàng",
      message: 'Video "SOH" đã sẵn sàng để xem',
    });
    expect(renderNotification("sync_completed", data, "en")).toEqual({
      title: "Video ready",
      message: 'The video "SOH" is ready to watch',
    });
  });

  it("translates a known sync error and mentions automatic retries", () => {
    const data = {
      meeting: "SOH",
      errorCode: "quotaExceeded",
      error: "Đã hết quota API YouTube trong ngày, thử lại vào ngày mai",
      autoRetryCount: 2,
    };
    expect(renderNotification("sync_failed", data, "en").message).toBe(
      'Syncing "SOH" failed: The YouTube API quota for today is used up; try again tomorrow (retried automatically 2 times)',
    );
    expect(renderNotification("sync_failed", data, "vi").message).toBe(
      'Sync "SOH" thất bại: Đã hết quota API YouTube trong ngày, thử lại vào ngày mai (đã tự động thử lại 2 lần)',
    );
  });

  it("shows the raw error when its code is unknown", () => {
    expect(
      renderNotification(
        "sync_failed",
        { meeting: "SOH", errorCode: null, error: "socket hang up", autoRetryCount: 0 },
        "en",
      ).message,
    ).toBe('Syncing "SOH" failed: socket hang up');
  });
});

describe("syncErrorText", () => {
  it("has both languages for every code", () => {
    for (const texts of Object.values(SYNC_ERROR_TEXT)) {
      expect(texts.vi).toBeTruthy();
      expect(texts.en).toBeTruthy();
    }
  });

  it("falls back to the given text", () => {
    expect(syncErrorText("unknown", "raw", "en")).toBe("raw");
  });
});

describe("toLanguage", () => {
  it("defaults to Vietnamese", () => {
    expect(toLanguage("en")).toBe("en");
    expect(toLanguage(undefined)).toBe("vi");
    expect(toLanguage("fr")).toBe("vi");
  });
});
