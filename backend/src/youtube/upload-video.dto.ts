import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
} from "class-validator";

export class UploadVideoDto {
  // YouTube limits: title 100 chars, description 5000 chars
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @IsIn(["public", "private", "unlisted"])
  @IsOptional()
  privacyStatus?: "public" | "private" | "unlisted";

  @IsString()
  @IsOptional()
  playlistId?: string;
}
