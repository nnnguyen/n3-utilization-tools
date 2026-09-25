import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import { isValidTimeZone } from "./workflow-template";

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
}
