import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateWorkspaceDto {
  @IsString()
  @IsOptional()
  name?: string;
}
