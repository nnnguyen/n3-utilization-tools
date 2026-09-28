import {
  backupFileName,
  backupFolderPath,
  backupSweepDecision,
  classifyBackupError,
  pickBackupFiles,
  uploadedBytes,
} from "./drive-backup";

describe("Drive backups", () => {
  const files = [
    { id: "a", file_type: "MP4", recording_type: "active_speaker", download_url: "u-a", file_size: 10, status: "completed" },
    { id: "b", file_type: "MP4", recording_type: "shared_screen_with_speaker_view", download_url: "u-b", file_size: 20, status: "completed" },
    { id: "c", file_type: "M4A", recording_type: "audio_only", download_url: "u-c", file_size: 5 },
    { id: "d", file_type: "CC", download_url: "u-d" },
    { id: "e", file_type: "CHAT", download_url: "u-e" },
    { id: "f", file_type: "TIMELINE", download_url: "u-f" },
  ];

  it("picks the sync's MP4, the audio and the captions as transcript", () => {
    const picked = pickBackupFiles(files, ["MP4", "M4A", "TRANSCRIPT"]);
    expect(picked.map((f) => [f.fileType, f.zoomFileId, f.extension])).toEqual([
      ["MP4", "b", "mp4"],
      ["M4A", "c", "m4a"],
      ["TRANSCRIPT", "d", "vtt"],
    ]);
    expect(pickBackupFiles(files, ["CHAT"]).map((f) => f.zoomFileId)).toEqual(["e"]);
    expect(pickBackupFiles([{ file_type: "MP4", download_url: "x", status: "processing" }], ["MP4"])).toEqual([]);
    expect(pickBackupFiles(files, [])).toEqual([]);
  });

  it("names folders and files by date in the account's time zone", () => {
    // 20:30 UTC on the 25th is the 26th in Vietnam
    expect(backupFolderPath("SOH|Thực hành / cầu nguyện", "2026-09-25T20:30:00Z", "Asia/Ho_Chi_Minh")).toEqual([
      "N3 Connect",
      "Zoom",
      "2026",
      "2026-09-26 SOH|Thực hành - cầu nguyện",
    ]);
    const [mp4, , vtt] = pickBackupFiles(files, ["MP4", "M4A", "TRANSCRIPT"]);
    expect(backupFileName("SOH", "2026-09-25T12:00:00Z", "Asia/Ho_Chi_Minh", mp4)).toBe("2026-09-25 SOH.mp4");
    expect(backupFileName("SOH", "2026-09-25T12:00:00Z", "Asia/Ho_Chi_Minh", vtt)).toBe("2026-09-25 SOH (transcript).vtt");
  });

  it("classifies errors: full Drive and lost access are final, network is retried, gone is skipped", () => {
    const drive403 = { response: { status: 403, data: { error: { errors: [{ reason: "storageQuotaExceeded" }] } } } };
    expect(classifyBackupError(drive403)).toEqual({ code: "storageQuotaExceeded", retryable: false });
    expect(classifyBackupError(new Error("invalid_grant"))).toMatchObject({ code: "DRIVE_NOT_CONNECTED", retryable: false });
    expect(classifyBackupError({ response: { status: 503 } })).toMatchObject({ code: "networkError", retryable: true });
    expect(classifyBackupError(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }))).toMatchObject({ retryable: true });
    expect(classifyBackupError({ source: "zoom", response: { status: 404 } })).toMatchObject({ code: "ZOOM_FILE_GONE", skip: true });
    expect(classifyBackupError({ response: { status: 400 } })).toMatchObject({ code: "DRIVE_ERROR", retryable: false });
  });

  it("reads how much of a resumable upload Google already has", () => {
    expect(uploadedBytes("bytes=0-1023")).toBe(1024);
    expect(uploadedBytes(null)).toBe(0);
  });

  it("retries pending, interrupted and transient failures with backoff, up to 5 attempts", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
    const row = (over: object) => ({ status: "failed", errorCode: "networkError", attempts: 1, updatedAt: ago(31), ...over });
    expect(backupSweepDecision(row({ status: "pending", updatedAt: ago(0) }), now)).toBe("retry");
    expect(backupSweepDecision(row({ status: "uploading", updatedAt: ago(10) }), now)).toBe("wait");
    expect(backupSweepDecision(row({ status: "uploading", updatedAt: ago(61) }), now)).toBe("retry");
    expect(backupSweepDecision(row({}), now)).toBe("retry");
    expect(backupSweepDecision(row({ attempts: 2 }), now)).toBe("wait"); // needs 60 min
    expect(backupSweepDecision(row({ attempts: 5, updatedAt: ago(999) }), now)).toBe("wait");
    expect(backupSweepDecision(row({ errorCode: "storageQuotaExceeded", updatedAt: ago(999) }), now)).toBe("wait");
    expect(backupSweepDecision(row({ status: "done" }), now)).toBe("wait");
  });
});
