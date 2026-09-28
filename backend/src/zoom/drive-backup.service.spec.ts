// @nestjs/axios v12 is ESM-only and Jest cannot require it
jest.mock("@nestjs/axios", () => ({ HttpService: class HttpService {} }));

import { of } from "rxjs";
import { Readable } from "stream";
import { DriveBackupService } from "./drive-backup.service";

// A tiny in-memory stand-in for prisma.driveBackup
function fakePrisma() {
  let rows: any[] = [];
  let seq = 0;
  const match = (row: any, where: any = {}) =>
    Object.entries(where).every(([key, value]: [string, any]) => {
      if (key === "recordingId_fileType") return row.recordingId === value.recordingId && row.fileType === value.fileType;
      if (value && typeof value === "object" && "in" in value) return value.in.includes(row[key]);
      if (value && typeof value === "object" && "notIn" in value) return !value.notIn.includes(row[key]);
      if (value && typeof value === "object" && "gte" in value) return row[key] >= value.gte;
      return row[key] === value;
    });
  const apply = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data)) {
      row[key] = value && typeof value === "object" && "increment" in (value as any) ? row[key] + (value as any).increment : value;
    }
    row.updatedAt = new Date();
    return row;
  };
  return {
    rows: () => rows,
    driveBackup: {
      findUnique: jest.fn(async ({ where }) => rows.find((r) => match(r, where)) ?? null),
      findFirst: jest.fn(async ({ where }) => rows.find((r) => match(r, where)) ?? null),
      findMany: jest.fn(async ({ where }) => rows.filter((r) => match(r, where))),
      update: jest.fn(async ({ where, data }) => apply(rows.find((r) => r.id === where.id)!, data)),
      upsert: jest.fn(async ({ where, update, create }) => {
        const existing = rows.find((r) => match(r, where));
        if (existing) return apply(existing, update);
        const row = { id: `row-${++seq}`, attempts: 0, uploadUrl: null, createdAt: new Date(seq), ...create, updatedAt: new Date() };
        rows.push(row);
        return row;
      }),
    },
    seed: (row: any) => rows.push({ id: `row-${++seq}`, attempts: 0, uploadUrl: null, createdAt: new Date(seq), updatedAt: new Date(), ...row }),
    reset: () => (rows = []),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("DriveBackupService", () => {
  const big = 20 * 1024 * 1024;
  const zoomFiles = [
    { id: "mp4", file_type: "MP4", recording_type: "shared_screen_with_speaker_view", download_url: "zoom/mp4", file_size: big, status: "completed" },
    { id: "m4a", file_type: "M4A", download_url: "zoom/m4a", file_size: 1000, status: "completed" },
    { id: "vtt", file_type: "TRANSCRIPT", download_url: "zoom/vtt", file_size: 500, status: "completed" },
  ];
  let prisma: ReturnType<typeof fakePrisma>;
  let zoom: any;
  let drive: any;
  let googleDrive: any;
  let http: any;
  let service: DriveBackupService;

  beforeEach(() => {
    prisma = fakePrisma();
    zoom = {
      getWorkflowSettings: jest.fn().mockResolvedValue({
        driveBackupEnabled: true,
        driveFileTypes: ["MP4", "M4A", "TRANSCRIPT"],
        timeZone: "Asia/Ho_Chi_Minh",
      }),
      fetchRecordingFiles: jest.fn().mockResolvedValue(zoomFiles),
      openRecordingFile: jest.fn(async (_u, _url, start = 0) => ({ stream: Readable.from(["data"]), partial: start > 0 })),
    };
    drive = {
      files: {
        list: jest.fn().mockResolvedValue({ data: { files: [] } }),
        create: jest.fn(async ({ requestBody }) => ({
          data: { id: requestBody.mimeType ? `folder:${requestBody.name}` : `file:${requestBody.name}` },
        })),
      },
    };
    googleDrive = {
      isConnected: jest.fn().mockResolvedValue(true),
      drive: jest.fn().mockResolvedValue(drive),
      accessToken: jest.fn().mockResolvedValue("token"),
      markTokenInvalid: jest.fn(),
    };
    http = {
      post: jest.fn(() => of({ headers: { location: "https://upload/session-1" } })),
      put: jest.fn(() => of({ status: 200, data: { id: "file:big" }, headers: {} })),
    };
    service = new DriveBackupService(prisma as any, zoom, googleDrive, http);
  });

  const recording = { uuid: "rec-1", topic: "SOH|Buổi 1", start_time: "2026-09-25T12:30:00Z" };

  it("saves nothing unless the account turned automatic saving on", async () => {
    zoom.getWorkflowSettings.mockResolvedValue({ driveBackupEnabled: false, driveFileTypes: ["MP4"] });
    await service.onRecordingCompleted("user-1", recording);
    await service.onRecordingCompleted("system", recording);
    await settle();
    expect(prisma.rows()).toHaveLength(0);
    expect(zoom.fetchRecordingFiles).not.toHaveBeenCalled();
  });

  it("saves nothing when Google Drive is not connected", async () => {
    googleDrive.isConnected.mockResolvedValue(false);
    await service.onRecordingCompleted("user-1", recording);
    expect(prisma.rows()).toHaveLength(0);
    await expect(service.backupForUser("user-1", { recordingId: "rec-1", topic: "SOH", startTime: "x" })).rejects.toMatchObject({
      response: { code: "DRIVE_NOT_CONNECTED" },
    });
  });

  it("saves each chosen file into N3 Connect/Zoom/<year>/<date> <topic>", async () => {
    await service.onRecordingCompleted("user-1", recording);
    await settle();
    expect(prisma.rows().map((r) => [r.fileType, r.status])).toEqual([
      ["MP4", "done"],
      ["M4A", "done"],
      ["TRANSCRIPT", "done"],
    ]);
    const folders = drive.files.create.mock.calls.filter(([c]) => c.requestBody.mimeType).map(([c]) => c.requestBody.name);
    expect(folders).toEqual(["N3 Connect", "Zoom", "2026", "2026-09-25 SOH|Buổi 1"]);
    // Small files in one request, the big MP4 through a resumable session
    const names = drive.files.create.mock.calls.filter(([c]) => c.media).map(([c]) => c.requestBody.name);
    expect(names).toEqual(["2026-09-25 SOH|Buổi 1.m4a", "2026-09-25 SOH|Buổi 1 (transcript).vtt"]);
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("uploadType=resumable"),
      { name: "2026-09-25 SOH|Buổi 1.mp4", parents: ["folder:2026-09-25 SOH|Buổi 1"] },
      expect.objectContaining({ headers: expect.objectContaining({ "X-Upload-Content-Length": String(big) }) }),
    );
    expect(prisma.rows()[0]).toMatchObject({ driveFileId: "file:big", uploadUrl: null });
  });

  it("reuses folders it already created", async () => {
    drive.files.list.mockResolvedValue({ data: { files: [{ id: "existing" }] } });
    await service.onRecordingCompleted("user-1", recording);
    await settle();
    expect(drive.files.create.mock.calls.filter(([c]) => c.requestBody.mimeType)).toHaveLength(0);
  });

  it("never saves a file twice", async () => {
    prisma.seed({ userId: "user-1", recordingId: "rec-1", fileType: "MP4", status: "done", topic: "t", startTime: "s" });
    prisma.seed({ userId: "user-2", recordingId: "rec-1", fileType: "M4A", status: "failed", topic: "t", startTime: "s" });
    await service.backupForUser("user-1", { recordingId: "rec-1", topic: "SOH", startTime: recording.start_time });
    await settle();
    expect(http.post).not.toHaveBeenCalled(); // the MP4 was done already
    expect(prisma.rows().find((r) => r.fileType === "M4A")).toMatchObject({ userId: "user-2", status: "failed" });
  });

  it("resumes an interrupted upload where Google stopped, asking Zoom for the rest", async () => {
    prisma.seed({ userId: "user-1", recordingId: "rec-1", fileType: "MP4", status: "pending", topic: "SOH", startTime: recording.start_time, uploadUrl: "https://upload/session-0" });
    zoom.getWorkflowSettings.mockResolvedValue({ driveFileTypes: ["MP4"], timeZone: "Asia/Ho_Chi_Minh" });
    http.put
      .mockReturnValueOnce(of({ status: 308, headers: { range: "bytes=0-1048575" }, data: "" }))
      .mockReturnValueOnce(of({ status: 200, data: { id: "file:resumed" }, headers: {} }));
    await service.sweep();
    await settle();
    expect(zoom.openRecordingFile).toHaveBeenCalledWith("user-1", "zoom/mp4", 1048576);
    expect(http.put.mock.calls[1][2].headers).toMatchObject({
      "Content-Range": `bytes 1048576-${big - 1}/${big}`,
      "Content-Length": String(big - 1048576),
    });
    expect(http.post).not.toHaveBeenCalled();
    expect(prisma.rows()[0]).toMatchObject({ status: "done", driveFileId: "file:resumed" });
  });

  it("starts over in a new session when Zoom ignores the Range request", async () => {
    prisma.seed({ userId: "user-1", recordingId: "rec-1", fileType: "MP4", status: "pending", topic: "SOH", startTime: recording.start_time, uploadUrl: "https://upload/session-0" });
    zoom.getWorkflowSettings.mockResolvedValue({ driveFileTypes: ["MP4"], timeZone: "Asia/Ho_Chi_Minh" });
    zoom.openRecordingFile.mockImplementation(async () => ({ stream: Readable.from(["data"]), partial: false }));
    http.put
      .mockReturnValueOnce(of({ status: 308, headers: { range: "bytes=0-99" }, data: "" }))
      .mockReturnValueOnce(of({ status: 200, data: { id: "file:fresh" }, headers: {} }));
    await service.sweep();
    await settle();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.put.mock.calls[1][2].headers["Content-Range"]).toBeUndefined();
    expect(prisma.rows()[0]).toMatchObject({ status: "done", driveFileId: "file:fresh" });
  });

  it("stops on a full Drive, and skips a file deleted on Zoom", async () => {
    zoom.getWorkflowSettings.mockResolvedValue({ driveBackupEnabled: true, driveFileTypes: ["MP4", "M4A"], timeZone: "UTC" });
    http.put.mockImplementation(() => {
      throw { response: { status: 403, data: { error: { errors: [{ reason: "storageQuotaExceeded" }] } } } };
    });
    zoom.openRecordingFile.mockImplementation(async (_u, url) => {
      if (url === "zoom/m4a") throw { source: "zoom", response: { status: 404 } };
      return { stream: Readable.from(["data"]), partial: false };
    });
    await service.onRecordingCompleted("user-1", recording);
    await settle();
    expect(prisma.rows().map((r) => [r.fileType, r.status, r.errorCode])).toEqual([
      ["MP4", "failed", "storageQuotaExceeded"],
      ["M4A", "skipped", "ZOOM_FILE_GONE"],
    ]);
    // A full Drive is not retried by the sweep
    http.post.mockClear();
    await service.sweep(new Date(Date.now() + 24 * 60 * 60_000));
    await settle();
    expect(http.post).not.toHaveBeenCalled();
  });

  it("says clearly when the recording is not on Zoom, and skips one deleted later", async () => {
    zoom.fetchRecordingFiles.mockRejectedValue({ response: { status: 404 } });
    await expect(service.backupForUser("user-1", { recordingId: "gone", topic: "SOH", startTime: "x" })).rejects.toMatchObject({
      response: { code: "ZOOM_RECORDING_NOT_FOUND" },
    });
    prisma.seed({ userId: "user-1", recordingId: "rec-1", fileType: "M4A", status: "pending", topic: "SOH", startTime: recording.start_time });
    await service.sweep();
    await settle();
    expect(prisma.rows()[0]).toMatchObject({ status: "skipped", errorCode: "ZOOM_FILE_GONE" });
  });

  it("returns sizes as numbers (JSON has no BigInt)", async () => {
    prisma.seed({ userId: "user-1", recordingId: "rec-1", fileType: "MP4", status: "done", topic: "t", startTime: "s", bytes: BigInt(big) });
    const [view] = await service.listForUser("user-1", "rec-1");
    expect(view.bytes).toBe(big);
    expect(() => JSON.stringify(view)).not.toThrow();
  });
});
