import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import type { DriveBackup } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { GoogleDriveService } from "../google-drive/google-drive.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { sizeBucket } from "../analytics/analytics-events";
import { codedError } from "../common/coded-error";
import { ZoomService } from "./zoom.service";
import {
  BackupFile,
  backupFileName,
  backupFolderPath,
  backupSweepDecision,
  classifyBackupError,
  pickBackupFiles,
  uploadedBytes,
} from "./drive-backup";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id";
// Smaller files (transcript, chat) go up in one request
const RESUMABLE_FROM_BYTES = 8 * 1024 * 1024;

type DriveClient = NonNullable<Awaited<ReturnType<GoogleDriveService["drive"]>>>;

export interface DriveBackupView {
  recordingId: string;
  fileType: string;
  status: string;
  fileName: string | null;
  bytes: number | null;
  driveFileId: string | null;
  folderId: string | null;
  errorCode: string | null;
  attempts: number;
  updatedAt: Date;
}

/**
 * Saves Zoom files to the account's Google Drive (P2-3b,
 * docs/design/P2-3-google-drive.md). Only when the user chose to: all new
 * recordings (setting, off by default) or one recording by hand. Files are
 * streamed Zoom → Drive (resumable for large ones), one at a time per account,
 * never shared, and never touch the YouTube sync.
 */
@Injectable()
export class DriveBackupService {
  private readonly logger = new Logger(DriveBackupService.name);
  // One upload at a time per account: a chain of work per user id
  private readonly queues = new Map<string, Promise<void>>();
  // Rows being uploaded by this instance (the sweep leaves them alone)
  private readonly inProgress = new Set<string>();
  // "<userId>|<folder path>" -> Drive folder id
  private readonly folders = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly zoomService: ZoomService,
    private readonly googleDrive: GoogleDriveService,
    private readonly httpService: HttpService,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  /** A new Zoom recording (webhook): saved only if the account turned automatic saving on. */
  async onRecordingCompleted(
    userId: string | null | undefined,
    recording: { uuid?: string; id?: number | string; topic?: string; start_time?: string },
  ) {
    if (!userId || userId === "system") return;
    const recordingId = recording.uuid || recording.id?.toString();
    if (!recordingId) return;
    const settings = await this.zoomService.getWorkflowSettings(userId);
    if (!settings.driveBackupEnabled) return;
    if (!(await this.googleDrive.isConnected(userId))) {
      this.logger.warn(`Drive backup is on for ${userId} but Google Drive is not connected`);
      return;
    }
    await this.queue(userId, recordingId, recording.topic ?? "", recording.start_time ?? "", settings.driveFileTypes, false);
  }

  /** "Save to Drive" on one recording (or the Sync dialog's checkbox). */
  async backupForUser(userId: string, dto: { recordingId: string; topic: string; startTime: string }) {
    if (!(await this.googleDrive.isConnected(userId))) {
      throw codedError(BadRequestException, "DRIVE_NOT_CONNECTED", "Chưa kết nối Google Drive — hãy kết nối trong trang Tích hợp");
    }
    const settings = await this.zoomService.getWorkflowSettings(userId);
    return this.queue(userId, dto.recordingId, dto.topic, dto.startTime, settings.driveFileTypes, true);
  }

  async listForUser(userId: string, recordingId?: string): Promise<DriveBackupView[]> {
    const rows = await this.prisma.driveBackup.findMany({
      where: { userId, ...(recordingId ? { recordingId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map(toView);
  }

  /** Scheduler: pending, interrupted and transient failures, with backoff. */
  async sweep(now = new Date()) {
    const rows = await this.prisma.driveBackup.findMany({
      where: {
        status: { in: ["pending", "uploading", "failed"] },
        updatedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60_000) },
      },
      orderBy: { updatedAt: "asc" },
      take: 100,
    });
    const users = new Set<string>();
    for (const row of rows) {
      if (this.inProgress.has(row.id) || backupSweepDecision(row, now) !== "retry") continue;
      if (row.status !== "pending") {
        await this.prisma.driveBackup.update({ where: { id: row.id }, data: { status: "pending" } });
      }
      users.add(row.userId);
    }
    for (const userId of users) this.kick(userId);
  }

  private async queue(
    userId: string,
    recordingId: string,
    topic: string,
    startTime: string,
    types: string[],
    manual: boolean,
  ): Promise<DriveBackupView[]> {
    let zoomFiles: any[];
    try {
      zoomFiles = await this.zoomFiles(userId, recordingId);
    } catch (error) {
      if (error?.response?.status === 404) {
        throw codedError(NotFoundException, "ZOOM_RECORDING_NOT_FOUND", "Không tìm thấy recording này trên Zoom (có thể đã bị xoá)");
      }
      throw error;
    }
    const files = pickBackupFiles(zoomFiles, types);
    for (const file of files) {
      const existing = await this.prisma.driveBackup.findUnique({
        where: { recordingId_fileType: { recordingId, fileType: file.fileType } },
      });
      // Saved already, being saved, or another account's: leave it
      if (existing && (existing.userId !== userId || existing.status === "done" || existing.status === "uploading")) {
        continue;
      }
      const data = {
        topic,
        startTime,
        bytes: file.size ?? null,
        status: "pending",
        errorCode: null,
        error: null,
        // A new request by hand gets a fresh retry budget
        ...(manual ? { attempts: 0 } : {}),
      };
      await this.prisma.driveBackup.upsert({
        where: { recordingId_fileType: { recordingId, fileType: file.fileType } },
        update: data,
        create: { ...data, userId, recordingId, fileType: file.fileType },
      });
    }
    this.kick(userId);
    return this.listForUser(userId, recordingId);
  }

  private kick(userId: string) {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    const next = previous
      .then(() => this.drain(userId))
      .catch((error) => this.logger.error(`Drive backup queue of ${userId} stopped: ${error.message}`));
    this.queues.set(userId, next);
    void next.finally(() => {
      if (this.queues.get(userId) === next) this.queues.delete(userId);
    });
  }

  private async drain(userId: string) {
    for (;;) {
      const row = await this.prisma.driveBackup.findFirst({
        where: { userId, status: "pending", id: { notIn: [...this.inProgress] } },
        orderBy: { createdAt: "asc" },
      });
      if (!row) return;
      await this.process(row);
    }
  }

  private async process(row: DriveBackup) {
    this.inProgress.add(row.id);
    const started = await this.prisma.driveBackup.update({
      where: { id: row.id },
      data: { status: "uploading", attempts: { increment: 1 } },
    });
    try {
      const drive = await this.googleDrive.drive(row.userId);
      if (!drive) throw new Error("DRIVE_NOT_CONNECTED");
      const [file] = pickBackupFiles(await this.zoomFiles(row.userId, row.recordingId), [row.fileType]);
      if (!file) throw Object.assign(new Error("The Zoom file no longer exists"), { source: "zoom", status: 404 });

      const { timeZone } = await this.zoomService.getWorkflowSettings(row.userId);
      const folderId = await this.ensureFolderPath(row.userId, drive, backupFolderPath(row.topic, row.startTime, timeZone));
      const fileName = backupFileName(row.topic, row.startTime, timeZone, file);
      const driveFileId =
        file.size && file.size >= RESUMABLE_FROM_BYTES
          ? await this.resumableUpload(started, file, fileName, folderId)
          : await this.simpleUpload(row.userId, drive, file, fileName, folderId);

      await this.prisma.driveBackup.update({
        where: { id: row.id },
        data: { status: "done", driveFileId, folderId, fileName, uploadUrl: null, errorCode: null, error: null },
      });
      this.logger.log(`Saved ${row.fileType} of recording ${row.recordingId} to Google Drive`);
      this.analytics?.capture(row.userId, "drive_backup_completed", {
        file_type: row.fileType,
        size_bucket: sizeBucket(file.size),
      });
    } catch (error) {
      const classified = classifyBackupError(error);
      if (classified.code === "DRIVE_NOT_CONNECTED" && /invalid_grant/.test(String(error?.message ?? error?.response?.data?.error ?? ""))) {
        await this.googleDrive.markTokenInvalid(row.userId);
      }
      this.logger.warn(`Drive backup of ${row.fileType} ${row.recordingId} failed: ${classified.code} ${error?.message ?? ""}`);
      await this.prisma.driveBackup.update({
        where: { id: row.id },
        data: {
          status: classified.skip ? "skipped" : "failed",
          errorCode: classified.code,
          error: String(error?.message ?? "").slice(0, 500),
        },
      });
      this.analytics?.capture(row.userId, "drive_backup_failed", {
        file_type: row.fileType,
        error_code: classified.code,
        will_retry: classified.retryable,
      });
    } finally {
      this.inProgress.delete(row.id);
    }
  }

  // The recording's files from the Zoom API; failures are tagged as Zoom's
  private async zoomFiles(userId: string, recordingId: string) {
    try {
      return await this.zoomService.fetchRecordingFiles(userId, recordingId);
    } catch (error) {
      throw Object.assign(error, { source: "zoom" });
    }
  }

  /** N3 Connect / Zoom / <year> / <date> <topic>, created where missing; returns the last id. */
  private async ensureFolderPath(userId: string, drive: DriveClient, path: string[]): Promise<string> {
    let parent = "root";
    for (let depth = 1; depth <= path.length; depth++) {
      const key = `${userId}|${path.slice(0, depth).join("/")}`;
      const cached = this.folders.get(key);
      if (cached) {
        parent = cached;
        continue;
      }
      const name = path[depth - 1];
      // drive.file: only folders this app created are listed
      const found = await drive.files.list({
        q: `name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and '${parent}' in parents and trashed = false`,
        fields: "files(id)",
        spaces: "drive",
        pageSize: 1,
      });
      const id =
        found.data.files?.[0]?.id ??
        (await drive.files.create({ requestBody: { name, mimeType: FOLDER_MIME, parents: [parent] }, fields: "id" })).data.id!;
      this.folders.set(key, id);
      parent = id;
    }
    return parent;
  }

  private async simpleUpload(userId: string, drive: DriveClient, file: BackupFile, name: string, folderId: string) {
    const { stream } = await this.zoomService.openRecordingFile(userId, file.downloadUrl);
    const created = await drive.files.create({
      requestBody: { name, parents: [folderId] },
      media: { mimeType: file.mimeType, body: stream },
      fields: "id",
    });
    return created.data.id!;
  }

  /**
   * Google's resumable upload: a session (kept on the row), then the file
   * streamed from Zoom. After an interruption, asks Google how much it has
   * and sends only the rest (Zoom Range); starts over if Zoom ignores Range.
   */
  private async resumableUpload(row: DriveBackup, file: BackupFile, name: string, folderId: string) {
    const token = await this.googleDrive.accessToken(row.userId);
    if (!token) throw new Error("DRIVE_NOT_CONNECTED");
    const total = file.size!;
    const auth = { Authorization: `Bearer ${token}` };

    let url = row.uploadUrl;
    let offset = 0;
    if (url) {
      const status = await firstValueFrom(
        this.httpService.put(url, undefined, {
          headers: { ...auth, "Content-Range": `bytes */${total}` },
          validateStatus: () => true,
          maxRedirects: 0,
        }),
      );
      if (status.status === 200 || status.status === 201) return status.data.id as string;
      if (status.status === 308) offset = uploadedBytes(status.headers.range);
      else url = null; // expired session (404/410): start over
    }

    let { stream, partial } = await this.zoomService.openRecordingFile(row.userId, file.downloadUrl, offset);
    if (offset > 0 && !partial) {
      // Zoom sent the whole file: a new session from byte 0
      (stream as any).destroy?.();
      url = null;
      offset = 0;
      ({ stream } = await this.zoomService.openRecordingFile(row.userId, file.downloadUrl));
    }
    if (!url) {
      const session = await firstValueFrom(
        this.httpService.post(
          UPLOAD_ENDPOINT,
          { name, parents: [folderId] },
          {
            headers: {
              ...auth,
              "Content-Type": "application/json; charset=UTF-8",
              "X-Upload-Content-Type": file.mimeType,
              "X-Upload-Content-Length": String(total),
            },
          },
        ),
      );
      url = session.headers.location as string;
      await this.prisma.driveBackup.update({ where: { id: row.id }, data: { uploadUrl: url } });
    }

    const uploaded = await firstValueFrom(
      this.httpService.put(url!, stream, {
        headers: {
          ...auth,
          "Content-Type": file.mimeType,
          "Content-Length": String(total - offset),
          ...(offset > 0 ? { "Content-Range": `bytes ${offset}-${total - 1}/${total}` } : {}),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        maxRedirects: 0,
      }),
    );
    return uploaded.data.id as string;
  }
}

function toView(row: DriveBackup): DriveBackupView {
  return {
    recordingId: row.recordingId,
    fileType: row.fileType,
    status: row.status,
    fileName: row.fileName,
    // BigInt is not JSON
    bytes: row.bytes === null ? null : Number(row.bytes),
    driveFileId: row.driveFileId,
    folderId: row.folderId,
    errorCode: row.errorCode,
    attempts: row.attempts,
    updatedAt: row.updatedAt,
  };
}
