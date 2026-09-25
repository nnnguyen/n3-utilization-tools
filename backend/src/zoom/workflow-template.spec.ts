import {
  DEFAULT_WORKFLOW_SETTINGS,
  formatRecordingTime,
  renderTemplate,
  renderUploadText,
} from "./workflow-template";

describe("renderTemplate", () => {
  it("replaces known placeholders, as often as they appear", () => {
    expect(
      renderTemplate("[Zoom] {topic} - {date} ({topic})", {
        topic: "SOH",
        date: "25/09/2026",
      }),
    ).toBe("[Zoom] SOH - 25/09/2026 (SOH)");
  });

  it("leaves unknown placeholders as-is", () => {
    expect(renderTemplate("{topic} {speaker}", { topic: "SOH" })).toBe(
      "SOH {speaker}",
    );
  });
});

describe("formatRecordingTime", () => {
  const start = "2026-09-25T10:05:00Z"; // 17:05 in Ho Chi Minh City

  it("formats in Vietnamese with the default time zone", () => {
    expect(formatRecordingTime(start, "vi", "Asia/Ho_Chi_Minh")).toEqual({
      date: "25/09/2026",
      time: "17:05",
    });
  });

  it("formats in English", () => {
    expect(formatRecordingTime(start, "en", "Asia/Ho_Chi_Minh")).toEqual({
      date: "Sep 25, 2026",
      time: "05:05 PM",
    });
  });

  it("uses the configured time zone", () => {
    expect(formatRecordingTime(start, "vi", "UTC").time).toBe("10:05");
  });

  it("falls back to the default time zone when it is invalid", () => {
    expect(formatRecordingTime(start, "vi", "Not/AZone").time).toBe("17:05");
  });

  it("keeps an unparsable start time as the date", () => {
    expect(formatRecordingTime("soon", "vi", "UTC")).toEqual({
      date: "soon",
      time: "",
    });
  });
});

describe("renderUploadText", () => {
  const recording = { topic: "SOH|Cầu nguyện", startTime: "2026-09-25T10:05:00Z" };

  it("reproduces the historical title with the default settings", () => {
    expect(renderUploadText(DEFAULT_WORKFLOW_SETTINGS, recording, "vi")).toEqual({
      title: "Zoom Recording: SOH|Cầu nguyện",
      description: "Recorded on 25/09/2026 17:05",
    });
  });

  it("trims the title to YouTube's 100-character limit", () => {
    const { title } = renderUploadText(
      { ...DEFAULT_WORKFLOW_SETTINGS, titleTemplate: "{topic}" },
      { ...recording, topic: "á".repeat(150) },
      "vi",
    );
    expect(Array.from(title)).toHaveLength(100);
  });

  it("falls back to the topic when the title renders empty", () => {
    const { title } = renderUploadText(
      { ...DEFAULT_WORKFLOW_SETTINGS, titleTemplate: "   " },
      recording,
      "vi",
    );
    expect(title).toBe("SOH|Cầu nguyện");
  });
});
