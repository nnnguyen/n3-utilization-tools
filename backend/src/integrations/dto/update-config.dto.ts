import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateZoomConfigDto {
  @IsString()
  @IsOptional()
  accountId?: string;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  clientSecret?: string;

  @IsString()
  @IsOptional()
  webhookSecretToken?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateYoutubeConfigDto {
  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  clientSecret?: string;

  @IsString()
  @IsOptional()
  refreshToken?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
