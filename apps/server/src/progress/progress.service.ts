import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { ProgressStore } from './progress.store';

@Injectable()
export class ProgressService {
  constructor(private readonly progressStore: ProgressStore) {}

  private normalizeNullableText(
    value: string | null | undefined,
  ): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  list(user: AuthUser) {
    return this.progressStore.listForUser(user.sub);
  }

  get(user: AuthUser, mediaId: string) {
    return this.progressStore.get(user.sub, mediaId);
  }

  async upsert(user: AuthUser, mediaId: string, dto: UpdateProgressDto) {
    const existing = await this.progressStore.get(user.sub, mediaId);

    const nextSeriesPreferenceKey = this.normalizeNullableText(
      dto.seriesPreferenceKey,
    );
    const nextPreferredAudioLanguage = this.normalizeNullableText(
      dto.preferredAudioLanguage,
    );
    const nextPreferredSubtitleLanguage = this.normalizeNullableText(
      dto.preferredSubtitleLanguage,
    );

    return this.progressStore.upsert({
      userId: user.sub,
      mediaId,
      positionSeconds: dto.positionSeconds,
      durationSeconds: dto.durationSeconds,
      completed: dto.completed ?? existing?.completed ?? false,
      seriesPreferenceKey:
        nextSeriesPreferenceKey === undefined
          ? existing?.seriesPreferenceKey ?? null
          : nextSeriesPreferenceKey,
      preferredAudioLanguage:
        nextPreferredAudioLanguage === undefined
          ? existing?.preferredAudioLanguage ?? null
          : nextPreferredAudioLanguage,
      preferredSubtitleLanguage:
        nextPreferredSubtitleLanguage === undefined
          ? existing?.preferredSubtitleLanguage ?? null
          : nextPreferredSubtitleLanguage,
      subtitlePreferenceEnabled:
        dto.subtitlePreferenceEnabled === undefined
          ? existing?.subtitlePreferenceEnabled ?? null
          : dto.subtitlePreferenceEnabled,
      updatedAt: new Date().toISOString(),
    });
  }
}
