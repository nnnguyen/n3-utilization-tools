import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto, UpdateWorkflowDto } from './workflow.dto';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, workspaceId: string, dto: CreateWorkflowDto) {
    const { steps, ...rest } = dto;
    return this.prisma.workflow.create({
      data: {
        ...rest,
        userId,
        workspaceId,
        steps: {
          create: steps?.map((step, index) => ({
            ...step,
            position: step.position ?? index,
          })),
        },
      },
      include: { steps: true },
    });
  }

  async findAll(workspaceId: string) {
    return this.prisma.workflow.findMany({
      where: { workspaceId },
      include: { steps: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.workflow.findUnique({
      where: { id },
      include: { steps: true },
    });
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    const { steps, ...rest } = dto;
    
    // Simple update: delete old steps and create new ones
    // In a more complex graph, we'd update existing ones
    if (steps) {
      await this.prisma.workflowStep.deleteMany({
        where: { workflowId: id },
      });
    }

    return this.prisma.workflow.update({
      where: { id },
      data: {
        ...rest,
        steps: steps ? {
          create: steps.map((step, index) => ({
            ...step,
            position: step.position ?? index,
          })),
        } : undefined,
      },
      include: { steps: true },
    });
  }

  async remove(id: string) {
    return this.prisma.workflow.delete({
      where: { id },
    });
  }
}
