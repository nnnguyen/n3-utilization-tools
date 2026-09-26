import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import { isValidTimeZone } from "./workflow-template";
import { CAPTION_LANGUAGE } from "./captions";

@ValidatorConstraint({ name: "timeZone" })
class TimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === "string" && isValidTimeZone(value);
  }

  defaultMessage() {
    return "timeZone must be an IANA time zone (e.g. Asia/Ho_Chi_Minh)";
  }
}

export class UpdateWorkflowSettingsDto {
  @IsBoolean()
  autoUpload: boolean;

  @IsString()
  @MaxLength(200)
  titleTemplate: string;

  @IsString()
  @MaxLength(2000)
  descriptionTemplate: string;

  @IsIn(["public", "unlisted", "private"])
  privacyStatus: "public" | "unlisted" | "private";

  @IsString()
  @IsOptional()
  playlistId?: string | null;

  @Validate(TimeZoneConstraint)
  timeZone: string;

  // Captions (P2-5); optional so older clients keep working
  @IsBoolean()
  @IsOptional()
  captionsEnabled?: boolean;

  @Matches(CAPTION_LANGUAGE)
  @IsOptional()
  captionLanguage?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  captionName?: string | null;
}
