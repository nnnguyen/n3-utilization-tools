import { isMissingScopeError, predictUpcoming, upcomingInWindow } from "./upcoming-meetings";
import { DEFAULT_WORKFLOW_SETTINGS } from "./workflow-template";

describe("upcoming meetings", () => {
  const now = new Date("2026-09-27T00:00:00Z");
  const meeting = (over: object = {}) => ({
    id: 88122981202,
    topic: "SOH|Thực hành cầu nguyện",
    type: 8,
    start_time: "2026-10-02T12:30:00Z",
    duration: 120,
    timezone: "Asia/Saigon",
    join_url: "https://zoom.us/j/88122981202?pwd=secret",
    ...over,
  });
  const settings = { ...DEFAULT_WORKFLOW_SETTINGS, autoUpload: true, timeZone: "Asia/Ho_Chi_Minh" };
  const rule = {
    id: "rule-soh",
    position: 0,
    matchText: "SOH",
    titleTemplate: "SOH – {topic} ({date})",
    descriptionTemplate: null,
    playlistId: "PL-soh",
    tags: [],
    privacyStatus: "unlisted",
    publishDelayMinutes: 24 * 60,
  };

  it("keeps the next 14 days, earliest first, once per occurrence", () => {
    const list = upcomingInWindow(
      [
        meeting({ start_time: "2026-10-09T12:30:00Z" }),
        meeting(),
        meeting(), // listed twice by Zoom
        meeting({ id: 1, start_time: "2026-10-20T12:30:00Z" }), // after 14 days
        meeting({ id: 2, type: 3, start_time: undefined }), // no fixed time
        meeting({ id: 3, start_time: "2026-09-26T23:30:00Z", duration: 60 }), // running now
        meeting({ id: 4, start_time: "2026-09-26T20:00:00Z", duration: 60 }), // over
      ],
      now,
      14,
    );
    expect(list.map((m) => `${m.id}@${m.start_time}`)).toEqual([
      "3@2026-09-26T23:30:00Z",
      "88122981202@2026-10-02T12:30:00Z",
      "88122981202@2026-10-09T12:30:00Z",
    ]);
  });

  it("predicts the rule, title, playlist and scheduled publication", () => {
    const predicted = predictUpcoming(meeting(), settings, [rule], "vi");
    expect(predicted).toMatchObject({
      meetingId: "88122981202",
      recurring: true,
      rule: { id: "rule-soh", matchText: "SOH" },
      autoUpload: true,
      title: "SOH – SOH|Thực hành cầu nguyện (02/10/2026)",
      playlistId: "PL-soh",
      publishDelayMinutes: 1440,
      // End (14:30Z) + 24 h; private until then
      publishAt: "2026-10-03T14:30:00.000Z",
      privacyStatus: "private",
    });
  });

  it("falls back to the workflow settings without a matching rule", () => {
    const predicted = predictUpcoming(meeting({ topic: "GOH họp" }), settings, [rule], "vi");
    expect(predicted).toMatchObject({
      rule: null,
      playlistId: null,
      publishAt: null,
      privacyStatus: settings.privacyStatus,
    });
  });

  it("never returns the join link or passcode", () => {
    const json = JSON.stringify(predictUpcoming(meeting(), settings, [rule], "vi"));
    expect(json).not.toMatch(/zoom\.us|pwd|secret/);
  });

  it("recognises a missing Zoom scope", () => {
    expect(isMissingScopeError({ response: { data: { code: 4711, message: "Invalid access token, does not contain scopes" } } })).toBe(true);
    expect(isMissingScopeError({ response: { data: { code: 124, message: "Invalid access token." } } })).toBe(false);
  });
});
