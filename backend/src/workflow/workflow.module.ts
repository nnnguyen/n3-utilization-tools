import { Module } from '@nestjs/common';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AIModule } from '../ai/ai.module';
import { YoutubeModule } from '../youtube/youtube.module';
import { ZoomModule } from '../zoom/zoom.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    PrismaModule,
    AIModule,
    YoutubeModule,
    forwardRef(() => ZoomModule),
  ],
  providers: [WorkflowEngineService, WorkflowService],
  controllers: [WorkflowController],
  exports: [WorkflowEngineService, WorkflowService],
})
export class WorkflowModule {}
