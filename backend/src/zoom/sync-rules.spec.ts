import {
  computePublishAt,
  findMatchingRule,
  resolveSyncOptions,
  scheduledPrivacy,
  SyncRule,
} from "./sync-rules";
import { DEFAULT_WORKFLOW_SETTINGS } from "./workflow-template";

const rule = (over: Partial<SyncRule> = {}): SyncRule => ({
  id: "rule-1",
  position: 0,
  matchText: "SOH",
  titleTemplate: null,
  descriptionTemplate: null,
  playlistId: null,
  tags: [],
  privacyStatus: null,
  publishDelayMinutes: null,
  ...over,
});

const settings = {
  ...DEFAULT_WORKFLOW_SETTINGS,
  titleTemplate: "[Zoom] {topic}",
  playlistId: "PL-default",
  privacyStatus: "unlisted" as const,
};

describe("findMatchingRule", () => {
  it("matches ignoring case and Vietnamese accents", () => {
    const r = rule({ matchText: "thuc hanh cau nguyen" });
    expect(findMatchingRule("SOH|Thực hành CẦU NGUYỆN", [r])).toBe(r);
  });

  it("returns the first matching rule by position", () => {
    const later = rule({ id: "later", position: 2, matchText: "SOH" });
    const first = rule({ id: "first", position: 1, matchText: "soh" });
    expect(findMatchingRule("SOH meeting", [later, first])?.id).toBe("first");
  });

  it("matches whole words only", () => {
    expect(findMatchingRule("GOHO meeting", [rule({ matchText: "GOH" })])).toBeNull();
    expect(findMatchingRule("Buổi GOH tuần 3", [rule({ matchText: "GOH" })])).not.toBeNull();
  });

  it("ignores rules whose text is empty once normalized", () => {
    expect(findMatchingRule("SOH", [rule({ matchText: "  --  " })])).toBeNull();
  });
});

describe("resolveSyncOptions", () => {
  it("keeps the workflow settings when no rule matches", () => {
    expect(resolveSyncOptions("Other", settings, [rule()])).toEqual({
      ...settings,
      ruleId: null,
      tags: [],
      publishDelayMinutes: null,
    });
  });

  it("overrides only the fields the rule sets", () => {
    const options = resolveSyncOptions("SOH|Cầu nguyện", settings, [
      rule({
        titleTemplate: "SOH - {date}",
        playlistId: "PL-soh",
        tags: ["soh", "cau nguyen"],
      }),
    ]);
    expect(options).toMatchObject({
      ruleId: "rule-1",
      titleTemplate: "SOH - {date}",
      descriptionTemplate: settings.descriptionTemplate,
      playlistId: "PL-soh",
      privacyStatus: "unlisted",
      tags: ["soh", "cau nguyen"],
      publishDelayMinutes: null,
    });
  });

  it("lets a rule clear the description with an empty template", () => {
    expect(
      resolveSyncOptions("SOH", settings, [rule({ descriptionTemplate: "" })])
        .descriptionTemplate,
    ).toBe("");
  });

  it("carries the publish delay and privacy of the rule", () => {
    expect(
      resolveSyncOptions("SOH", settings, [
        rule({ privacyStatus: "public", publishDelayMinutes: 60 }),
      ]),
    ).toMatchObject({ privacyStatus: "public", publishDelayMinutes: 60 });
  });
});

describe("computePublishAt", () => {
  const files = [
    { recording_end: "2026-09-25T11:00:00Z" },
    { recording_end: "2026-09-25T11:05:00Z" },
    {},
  ];

  it("adds the delay to the latest recording end", () => {
    expect(computePublishAt(files, "2026-09-25T10:00:00Z", 90)?.toISOString()).toBe(
      "2026-09-25T12:35:00.000Z",
    );
  });

  it("falls back to the start time without file end times", () => {
    expect(computePublishAt([], "2026-09-25T10:00:00Z", 0)?.toISOString()).toBe(
      "2026-09-25T10:00:00.000Z",
    );
  });

  it("returns null without a delay", () => {
    expect(computePublishAt(files, "2026-09-25T10:00:00Z", null)).toBeNull();
  });
});

describe("scheduledPrivacy", () => {
  const now = new Date("2026-09-25T12:00:00Z");

  it("uploads private with publishAt for a future time", () => {
    expect(
      scheduledPrivacy(new Date("2026-09-26T12:00:00Z"), "unlisted", now),
    ).toEqual({ privacyStatus: "private", publishAt: "2026-09-26T12:00:00.000Z" });
  });

  it("publishes now when the time has already passed", () => {
    expect(scheduledPrivacy(new Date("2026-09-25T11:00:00Z"), "private", now)).toEqual({
      privacyStatus: "public",
    });
  });

  it("keeps the privacy without a schedule", () => {
    expect(scheduledPrivacy(null, "unlisted", now)).toEqual({ privacyStatus: "unlisted" });
  });
});
