import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { IntegrationsService } from "./integrations.service";
import { UpdateConnectionDto } from "./dto/update-connection.dto";

// Connector API (docs/design/P2-1-connector.md §4); /integrations/* stays
// for the current Integrations page until it moves to cards (P2-1e)
@Controller("connections")
@UseGuards(JwtAuthGuard)
export class ConnectionsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.integrationsService.listConnections(user.id);
  }

  // Token health and quota of one app (the card, as GET /connections has it)
  @Get(":provider/status")
  status(@CurrentUser() user: AuthenticatedUser, @Param("provider") provider: string) {
    return this.integrationsService.getConnection(user.id, provider);
  }

  @Patch(":provider")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("provider") provider: string,
    @Body() body: UpdateConnectionDto,
  ) {
    return this.integrationsService.updateConnection(user.id, provider, body);
  }

  @Post(":provider/disconnect")
  disconnect(@CurrentUser() user: AuthenticatedUser, @Param("provider") provider: string) {
    return this.integrationsService.disconnect(user.id, provider);
  }
}
