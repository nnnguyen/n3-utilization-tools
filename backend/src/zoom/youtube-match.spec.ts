import {
  findMatches,
  mp4Durations,
  normalizeTitle,
  recordingIdFromDescription,
  scoreMatch,
  MATCH_THRESHOLD,
  MatchRecording,
  MatchVideo,
} from "./youtube-match";

const recording = (over: Partial<MatchRecording> = {}): MatchRecording => ({
  recordingId: "rec-1",
  topic: "SOH|Thực hành cầu nguyện và phân định",
  startTime: "2026-09-01T12:00:00Z",
  durationsSeconds: [3600],
  ...over,
});

const video = (over: Partial<MatchVideo> = {}): MatchVideo => ({
  videoId: "vid-1",
  title: "Zoom Recording: SOH|Thực hành cầu nguyện và phân định",
  durationSeconds: 3600,
  publishedAt: new Date("2026-09-01T15:00:00Z"),
  zoomRecordingId: null,
  ...over,
});

describe("normalizeTitle", () => {
  it("drops diacritics, case and punctuation", () => {
    expect(normalizeTitle("SOH|Thực hành cầu nguyện – Đợt 2")).toBe("soh thuc hanh cau nguyen dot 2");
  });
});

describe("scoreMatch", () => {
  it("is certain when the description names the recording", () => {
    expect(scoreMatch(recording(), video({ zoomRecordingId: "rec-1", title: "x", durationSeconds: 1 }))).toEqual({
      score: 100,
      exact: true,
    });
  });

  it("scores same length + title + date highly", () => {
    const { score, exact } = scoreMatch(recording(), video());
    expect(exact).toBe(false);
    expect(score).toBe(99); // 60 + 30 + 10, capped below an exact match
  });

  it("suggests on an identical length alone", () => {
    const { score } = scoreMatch(recording(), video({ title: "Buổi chia sẻ", publishedAt: null }));
    expect(score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("does not suggest on title and date without a close length", () => {
    const { score } = scoreMatch(recording(), video({ durationSeconds: 1800 }));
    expect(score).toBeLessThan(MATCH_THRESHOLD);
  });

  it("compares with every MP4 of the recording", () => {
    const { score } = scoreMatch(recording({ durationsSeconds: [5400, 3602] }), video());
    expect(score).toBe(99);
  });

  it("rules out videos published before the meeting", () => {
    expect(scoreMatch(recording(), video({ publishedAt: new Date("2026-08-01T00:00:00Z") })).score).toBe(0);
  });
});

describe("findMatches", () => {
  const options = { usedVideoIds: new Set<string>(), dismissed: new Set<string>() };

  it("suggests each video for one recording only, the best-matching one", () => {
    const weekly = [
      recording({ recordingId: "week-1", startTime: "2026-09-01T12:00:00Z", durationsSeconds: [3600] }),
      recording({ recordingId: "week-2", startTime: "2026-09-08T12:00:00Z", durationsSeconds: [3590] }),
    ];
    const videos = [
      video({ videoId: "v-week-1", durationSeconds: 3600, publishedAt: new Date("2026-09-01T14:00:00Z") }),
      video({ videoId: "v-week-2", durationSeconds: 3590, publishedAt: new Date("2026-09-08T14:00:00Z") }),
    ];
    const matches = findMatches(weekly, videos, options);
    expect(matches.get("week-1")?.video.videoId).toBe("v-week-1");
    expect(matches.get("week-2")?.video.videoId).toBe("v-week-2");
  });

  it("leaves out videos already linked and dismissed pairs", () => {
    expect(findMatches([recording()], [video()], { usedVideoIds: new Set(["vid-1"]), dismissed: new Set() }).size).toBe(0);
    expect(findMatches([recording()], [video()], { usedVideoIds: new Set(), dismissed: new Set(["rec-1|vid-1"]) }).size).toBe(0);
  });
});

describe("helpers", () => {
  it("reads the recording ID line back from a description", () => {
    expect(recordingIdFromDescription("Recorded on 2026-09-01\n\nZoom recording ID: abc/+=12==")).toBe("abc/+=12==");
    expect(recordingIdFromDescription("no marker")).toBeNull();
  });

  it("measures the MP4 files of a recording", () => {
    expect(
      mp4Durations([
        { file_type: "MP4", recording_start: "2026-09-01T12:00:00Z", recording_end: "2026-09-01T13:00:00Z" },
        { file_type: "M4A", recording_start: "2026-09-01T12:00:00Z", recording_end: "2026-09-01T13:00:00Z" },
      ]),
    ).toEqual([3600]);
  });
});
