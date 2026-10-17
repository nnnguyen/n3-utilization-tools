import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";

// PATCH /connections/:provider. Field names are checked against the
// provider definition (connections/providers.ts) by the service.
export class UpdateConnectionDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  workspaceId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsObject()
  @IsOptional()
  settings?: Record<string, string | null>;

  // Empty or missing = keep the stored value
  @IsObject()
  @IsOptional()
  secrets?: Record<string, string | null>;
}
