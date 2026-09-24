import { IsString, IsNotEmpty } from "class-validator";

// Link a Zoom recording to a video already on the user's channel
export class LinkRecordingDto {
  @IsString()
  @IsNotEmpty()
  recordingId: string;

  @IsString()
  @IsNotEmpty()
  videoId: string;

  @IsString()
  @IsNotEmpty()
  topic: string;

  @IsString()
  @IsNotEmpty()
  startTime: string;
}

export class UnlinkRecordingDto {
  @IsString()
  @IsNotEmpty()
  recordingId: string;
}

// "Not this one": stop suggesting this video for this recording
export class DismissMatchDto {
  @IsString()
  @IsNotEmpty()
  recordingId: string;

  @IsString()
  @IsNotEmpty()
  videoId: string;
}
