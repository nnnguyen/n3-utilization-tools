import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { WorkspacesService } from "./workspaces.service";
import { CreateWorkspaceDto, UpdateWorkspaceDto } from "./dto/workspace.dto";

@Controller("workspaces")
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.workspacesService.findAllForUser(user.id);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.workspacesService.findOne(id, user.id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(id, user.id, dto);
  }

  @Post(":id/switch")
  switch(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.workspacesService.switchWorkspace(user.id, id);
  }

  @Get(":id/activity")
  getActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.workspacesService.listActivity(id, user.id);
  }

  @Get(":id/suggestions/zoom")
  getZoomSuggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.workspacesService.getZoomConsolidationSuggestions(id, user.id);
  }
}
