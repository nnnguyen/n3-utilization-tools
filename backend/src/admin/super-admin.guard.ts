import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { codedError } from "../common/coded-error";
import { SUPER_ADMIN } from "./account-rules";

// After JwtAuthGuard: its user carries the current platformRole from the DB
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (user?.platformRole !== SUPER_ADMIN) {
      throw codedError(ForbiddenException, "ADMIN_ONLY", "Chỉ quản trị hệ thống được dùng chức năng này");
    }
    return true;
  }
}
