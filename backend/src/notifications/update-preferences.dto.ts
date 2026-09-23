import { IsBoolean, IsOptional } from "class-validator";

export class UpdatePreferencesDto {
  @IsBoolean()
  @IsOptional()
  notifyEmailOnCompleted?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyEmailOnFailed?: boolean;
}
