import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowStepDto {
  @IsString()
  type: string;

  @IsOptional()
  config: any;

  @IsOptional()
  position: number;
}

export class CreateWorkflowDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  trigger?: string;

  @IsOptional()
  config?: any;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];
}

export class UpdateWorkflowDto extends CreateWorkflowDto {}
