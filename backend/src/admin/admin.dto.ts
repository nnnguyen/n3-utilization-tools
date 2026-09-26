import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateAccountDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsBoolean()
  @IsOptional()
  isEmailVerified?: boolean;

  @IsBoolean()
  @IsOptional()
  mustChangePassword?: boolean;
}

export class UpdateAccountDto {
  @IsBoolean()
  @IsOptional()
  isEmailVerified?: boolean;

  @IsBoolean()
  @IsOptional()
  isLocked?: boolean;

  @IsIn(["user", "super_admin"])
  @IsOptional()
  platformRole?: "user" | "super_admin";
}

export class ResetTempPasswordDto {
  @IsBoolean()
  @IsOptional()
  mustChangePassword?: boolean;
}
