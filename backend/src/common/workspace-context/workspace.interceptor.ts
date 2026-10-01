import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { workspaceStorage } from './workspace.storage';

@Injectable()
export class WorkspaceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return next.handle();
    }

    const workspaceId = request.headers['x-workspace-id'] || user.workspaceId;

    if (!workspaceId) {
      // In a real multi-tenant app, you might want to force a workspace
      // But for now, we'll allow it if the user just logged in and hasn't picked one
      return next.handle();
    }

    return new Observable((subscriber) => {
      workspaceStorage.run({ workspaceId, userId: user.id }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
