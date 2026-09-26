import {
  CAPTION_LANGUAGE,
  captionSweepDecision,
  captionTrackName,
  isRetryableCaptionError,
  pickTranscriptFile,
} from "./captions";

describe("pickTranscriptFile", () => {
  const mp4 = { file_type: "MP4", download_url: "u1", status: "completed" };
  const transcript = { file_type: "TRANSCRIPT", download_url: "u2", status: "completed" };
  const cc = { file_type: "CC", download_url: "u3", status: "completed" };

  it("prefers the audio transcript, then the meeting captions", () => {
    expect(pickTranscriptFile([mp4, cc, transcript])).toBe(transcript);
    expect(pickTranscriptFile([mp4, cc])).toBe(cc);
  });

  it("ignores files still processing or without a download link", () => {
    expect(pickTranscriptFile([{ ...transcript, status: "processing" }, mp4])).toBeNull();
    expect(pickTranscriptFile([{ file_type: "TRANSCRIPT" }])).toBeNull();
    expect(pickTranscriptFile(undefined)).toBeNull();
  });
});

describe("captionTrackName", () => {
  it("uses the chosen name, else a default per language", () => {
    expect(captionTrackName("vi", "  SOH captions ")).toBe("SOH captions");
    expect(captionTrackName("vi")).toBe("Tiếng Việt (Zoom)");
    expect(captionTrackName("fr", "")).toBe("fr (Zoom)");
  });
});

describe("CAPTION_LANGUAGE", () => {
  it("accepts BCP-47 tags only", () => {
    for (const ok of ["vi", "en", "en-US", "zh-Hant"]) expect(CAPTION_LANGUAGE.test(ok)).toBe(true);
    for (const bad of ["", "Vietnamese", "vi_VN", "e"]) expect(CAPTION_LANGUAGE.test(bad)).toBe(false);
  });
});

describe("isRetryableCaptionError", () => {
  it("retries quota and network problems only", () => {
    expect(isRetryableCaptionError("quotaExceeded")).toBe(true);
    expect(isRetryableCaptionError("networkError")).toBe(true);
    expect(isRetryableCaptionError("VIDEO_NOT_FOUND")).toBe(false);
    expect(isRetryableCaptionError(null)).toBe(false);
  });
});

describe("captionSweepDecision", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60_000);
  const log = (over: object = {}) => ({
    captionStatus: "waiting_transcript",
    captionErrorCode: null,
    captionAttempts: 0,
    captionUpdatedAt: hoursAgo(1),
    syncCompletedAt: hoursAgo(2),
    ...over,
  });

  it("re-checks a missing transcript every 10 minutes, for 48 hours", () => {
    expect(captionSweepDecision(log(), now)).toBe("retry");
    expect(captionSweepDecision(log({ captionUpdatedAt: new Date(now.getTime() - 60_000) }), now)).toBe("wait");
    expect(captionSweepDecision(log({ syncCompletedAt: hoursAgo(49) }), now)).toBe("give_up");
  });

  it("retries temporary failures with a growing delay, up to 5 attempts", () => {
    const failed = (over: object) => log({ captionStatus: "failed", captionErrorCode: "quotaExceeded", ...over });
    expect(captionSweepDecision(failed({ captionAttempts: 1, captionUpdatedAt: hoursAgo(1) }), now)).toBe("retry");
    expect(captionSweepDecision(failed({ captionAttempts: 3, captionUpdatedAt: hoursAgo(1) }), now)).toBe("wait");
    expect(captionSweepDecision(failed({ captionAttempts: 5, captionUpdatedAt: hoursAgo(10) }), now)).toBe("wait");
  });

  it("never retries permanent failures or finished work", () => {
    expect(captionSweepDecision(log({ captionStatus: "failed", captionErrorCode: "VIDEO_NOT_FOUND" }), now)).toBe("wait");
    expect(captionSweepDecision(log({ captionStatus: "uploaded" }), now)).toBe("wait");
    expect(captionSweepDecision(log({ captionStatus: "no_transcript" }), now)).toBe("wait");
  });

  it("resumes an upload interrupted in 'pending'", () => {
    expect(captionSweepDecision(log({ captionStatus: "pending", captionUpdatedAt: hoursAgo(1) }), now)).toBe("retry");
    expect(captionSweepDecision(log({ captionStatus: "pending", captionUpdatedAt: new Date(now.getTime() - 60_000) }), now)).toBe("wait");
  });
});
