import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { SuperAdminGuard } from "./super-admin.guard";
import { AdminService } from "./admin.service";
import { CreateAccountDto, ResetTempPasswordDto, UpdateAccountDto } from "./admin.dto";

// Super admins only (docs/design/P2-2-workspaces.md §6b)
@Controller("admin")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("users")
  list(@Query("search") search?: string) {
    return this.adminService.listAccounts(search);
  }

  @Post("users")
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAccountDto) {
    return this.adminService.createAccount(user.id, dto);
  }

  @Patch("users/:id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.adminService.updateAccount(user.id, id, dto);
  }

  @Post("users/:id/temp-password")
  @HttpCode(200)
  resetTempPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ResetTempPasswordDto,
  ) {
    return this.adminService.resetTempPassword(user.id, id, dto);
  }

  @Delete("users/:id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.adminService.deleteAccount(user.id, id);
  }

  @Get("activity")
  activity(@Query("limit") limit?: string) {
    return this.adminService.listActivity(limit ? parseInt(limit, 10) || 100 : 100);
  }
}
