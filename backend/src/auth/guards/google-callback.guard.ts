import { ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Google's redirect back to the app: never throws, so a refused consent
 * (access_denied) or a used/expired code (invalid_grant, e.g. Back or reload)
 * ends on the login page with a message instead of a raw 500/401 JSON page.
 * The controller reads `googleAuthError` to pick the message.
 */
@Injectable()
export class GoogleCallbackGuard extends AuthGuard("google") {
  private readonly logger = new Logger(GoogleCallbackGuard.name);

  handleRequest<TUser = any>(err: any, user: any, _info: any, context: ExecutionContext): TUser {
    if (err) {
      this.logger.warn(`Google sign-in failed: ${err.code ?? ""} ${err.message}`);
      context.switchToHttp().getRequest().googleAuthError = true;
    }
    return (err ? null : user || null) as TUser;
  }
}
