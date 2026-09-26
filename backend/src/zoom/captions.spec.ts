import {
  CAPTION_LANGUAGE,
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
