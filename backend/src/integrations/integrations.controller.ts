import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { IntegrationsService } from './integrations.service';
import { UpdateZoomConfigDto, UpdateYoutubeConfigDto } from './dto/update-config.dto';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get('config')
  async getConfigs(@CurrentUser() user: AuthenticatedUser) {
    return this.integrationsService.getConfigs(user.id);
  }

  @Patch('zoom')
  async updateZoom(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateZoomConfigDto) {
    return this.integrationsService.updateZoomConfig(user.id, dto);
  }

  @Patch('youtube')
  async updateYoutube(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateYoutubeConfigDto) {
    return this.integrationsService.updateYoutubeConfig(user.id, dto);
  }
}
