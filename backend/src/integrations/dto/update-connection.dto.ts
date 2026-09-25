import { IsBoolean, IsObject, IsOptional } from "class-validator";

// PATCH /connections/:provider. Field names are checked against the
// provider definition (connections/providers.ts) by the service.
export class UpdateConnectionDto {
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
