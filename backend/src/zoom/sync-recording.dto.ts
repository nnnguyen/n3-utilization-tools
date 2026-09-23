import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class SyncRecordingDto {
  @IsString()
  @IsNotEmpty()
  recordingId: string;

  @IsString()
  @IsNotEmpty()
  topic: string;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsOptional()
  privacyStatus?: "public" | "private" | "unlisted";

  @IsString()
  @IsOptional()
  playlistId?: string;
}
