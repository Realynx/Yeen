import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../domain/entities/auth-user.entity';

@Injectable()
export class TorrentAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthUser | undefined;

    if (!user || (user.role !== 'admin' && user.role !== 'sailer')) {
      throw new ForbiddenException(
        'Sailer or admin access is required for torrent tools.',
      );
    }

    return true;
  }
}
