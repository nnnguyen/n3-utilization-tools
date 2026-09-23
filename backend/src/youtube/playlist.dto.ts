import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
} from "class-validator";

// YouTube limits: playlist title 150 chars, description 5000 chars
export class CreatePlaylistDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @IsIn(["public", "private", "unlisted"])
  @IsOptional()
  privacyStatus?: "public" | "private" | "unlisted";
}

export class UpdatePlaylistDto extends CreatePlaylistDto {}
