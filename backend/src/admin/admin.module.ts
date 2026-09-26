import { Module } from "@nestjs/common";
import { ActivityModule } from "../activity/activity.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { SuperAdminGuard } from "./super-admin.guard";

@Module({
  imports: [ActivityModule],
  controllers: [AdminController],
  providers: [AdminService, SuperAdminGuard],
})
export class AdminModule {}
