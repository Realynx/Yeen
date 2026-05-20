import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { ProgressStore } from './progress.store';

@Injectable()
export class ProgressService {
  constructor(private readonly progressStore: ProgressStore) {}

  list(user: AuthUser) {
    return this.progressStore.listForUser(user.sub);
  }

  get(user: AuthUser, mediaId: string) {
    return this.progressStore.get(user.sub, mediaId);
  }

  upsert(user: AuthUser, mediaId: string, dto: UpdateProgressDto) {
    return this.progressStore.upsert({
      userId: user.sub,
      mediaId,
      positionSeconds: dto.positionSeconds,
      durationSeconds: dto.durationSeconds,
      completed: dto.completed ?? false,
      updatedAt: new Date().toISOString(),
    });
  }
}
