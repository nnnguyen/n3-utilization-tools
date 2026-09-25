import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { ZoomSyncRulesService } from "./sync-rules.service";
import {
  CreateSyncRuleDto,
  ReorderSyncRulesDto,
  UpdateSyncRuleDto,
} from "./sync-rules.dto";

@Controller("zoom/sync-rules")
@UseGuards(JwtAuthGuard)
export class ZoomSyncRulesController {
  constructor(private readonly rulesService: ZoomSyncRulesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.rulesService.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateSyncRuleDto,
  ) {
    return this.rulesService.create(user.id, body);
  }

  // Declared before ":id" so "order" is not taken for a rule id
  @Put("order")
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ReorderSyncRulesDto,
  ) {
    return this.rulesService.reorder(user.id, body.ids);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() body: UpdateSyncRuleDto,
  ) {
    return this.rulesService.update(user.id, id, body);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.rulesService.remove(user.id, id);
  }
}
