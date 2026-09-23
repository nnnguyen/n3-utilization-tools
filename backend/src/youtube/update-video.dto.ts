import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsArray,
  MaxLength,
} from "class-validator";

export class UpdateVideoDto {
  // YouTube limits: title 100 chars, description 5000 chars
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsIn(["public", "private", "unlisted"])
  @IsOptional()
  privacyStatus?: "public" | "private" | "unlisted";
}
