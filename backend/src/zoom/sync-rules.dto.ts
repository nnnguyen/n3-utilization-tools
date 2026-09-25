import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateSyncRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  matchText: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  titleTemplate?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  descriptionTemplate?: string | null;

  @IsString()
  @IsOptional()
  playlistId?: string | null;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];

  @IsIn(["public", "unlisted", "private"])
  @IsOptional()
  privacyStatus?: "public" | "unlisted" | "private" | null;

  // Up to 30 days after the recording ends
  @IsInt()
  @Min(0)
  @Max(30 * 24 * 60)
  @IsOptional()
  publishDelayMinutes?: number | null;
}

// Every field optional; the rest is validated like CreateSyncRuleDto
export class UpdateSyncRuleDto extends CreateSyncRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  declare matchText: string;
}

export class ReorderSyncRulesDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}
