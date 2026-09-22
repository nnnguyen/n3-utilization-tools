import { IsString, IsNotEmpty } from 'class-validator';

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
}
