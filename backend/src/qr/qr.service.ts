import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nanoid } from 'nanoid';

@Injectable()
export class QrService {
  constructor(private prisma: PrismaService) {}

  async create(workspaceId: string, data: { name?: string; targetUrl: string }) {
    const shortCode = nanoid(8);
    return this.prisma.dynamicQR.create({
      data: {
        ...data,
        shortCode,
        workspaceId,
      },
    });
  }

  async findAll(workspaceId: string) {
    return this.prisma.dynamicQR.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, workspaceId: string) {
    const qr = await this.prisma.dynamicQR.findFirst({
      where: { id, workspaceId },
    });
    if (!qr) throw new NotFoundException('QR Code not found');
    return qr;
  }

  async update(id: string, workspaceId: string, data: { name?: string; targetUrl?: string }) {
    await this.findOne(id, workspaceId);
    return this.prisma.dynamicQR.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, workspaceId: string) {
    await this.findOne(id, workspaceId);
    return this.prisma.dynamicQR.delete({
      where: { id },
    });
  }

  async resolveAndIncrement(shortCode: string) {
    const qr = await this.prisma.dynamicQR.findUnique({
      where: { shortCode },
    });
    if (!qr) throw new NotFoundException('QR Code not found');

    // Fire and forget increment
    this.prisma.dynamicQR.update({
      where: { id: qr.id },
      data: { scanCount: { increment: 1 } },
    }).catch(err => console.error('Failed to increment scan count', err));

    return qr;
  }
}
