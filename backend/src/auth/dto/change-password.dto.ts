import { IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class ChangePasswordDto {
  // Required when the account has a password (Google-only accounts set their first one)
  @IsString()
  @IsOptional()
  currentPassword?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6) // same rule as sign-up
  newPassword: string;
}
