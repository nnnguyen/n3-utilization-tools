import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards, 
  Redirect,
  Req
} from '@nestjs/common';
import { QrService } from './qr.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request } from 'express';

@Controller()
export class QrController {
  constructor(private readonly qrService: QrService) {}

  // Protected Workspace APIs
  @UseGuards(JwtAuthGuard)
  @Post('qr')
  create(@Req() req: Request, @Body() data: { name?: string; targetUrl: string }) {
    const workspaceId = req.headers['x-workspace-id'] as string;
    return this.qrService.create(workspaceId, data);
  }

  @UseGuards(JwtAuthGuard)
  @Get('qr')
  findAll(@Req() req: Request) {
    const workspaceId = req.headers['x-workspace-id'] as string;
    return this.qrService.findAll(workspaceId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('qr/:id')
  update(
    @Req() req: Request,
    @Param('id') id: string, 
    @Body() data: { name?: string; targetUrl?: string }
  ) {
    const workspaceId = req.headers['x-workspace-id'] as string;
    return this.qrService.update(id, workspaceId, data);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('qr/:id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const workspaceId = req.headers['x-workspace-id'] as string;
    return this.qrService.remove(id, workspaceId);
  }

  // Public Redirect Endpoint
  @Get('q/:shortCode')
  @Redirect()
  async redirect(@Param('shortCode') shortCode: string) {
    const qr = await this.qrService.resolveAndIncrement(shortCode);
    return { url: qr.targetUrl, statusCode: 302 };
  }
}
