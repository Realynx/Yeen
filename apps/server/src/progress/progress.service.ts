import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { ProgressEntry } from './entities/progress-entry.entity';
import { ProgressStore } from './progress.store';

@Injectable()
export class ProgressService {
  private static readonly WATCHED_REMAINING_SECONDS = 180;

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

  private resolveAccountId(user: AuthUser): string {
    const normalized = user.sub.trim();
    return normalized || user.sub;
  }

  private normalizeSeconds(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }

    return Math.floor(value);
  }

  private normalizePositionSeconds(
    positionSeconds: number,
    durationSeconds: number,
  ): number {
    if (!Number.isFinite(positionSeconds) || positionSeconds <= 0) {
      return 0;
    }

    const normalized = Math.floor(positionSeconds);
    return durationSeconds > 0
      ? Math.min(normalized, durationSeconds)
      : normalized;
  }

  private normalizeSyncTimestampMs(
    value: number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    return Math.floor(value);
  }

  private shouldMarkCompleted(
    positionSeconds: number,
    durationSeconds: number,
    requestedCompleted: boolean,
    existingCompleted: boolean,
  ): boolean {
    if (existingCompleted || requestedCompleted) {
      return true;
    }

    if (durationSeconds <= 0) {
      return false;
    }

    const remainingSeconds = Math.max(0, durationSeconds - positionSeconds);
    return remainingSeconds <= ProgressService.WATCHED_REMAINING_SECONDS;
  }

  private async persistProgress(
    existing: ProgressEntry | undefined,
    next: Omit<ProgressEntry, 'updatedAt'>,
  ): Promise<ProgressEntry> {
    if (
      existing &&
      (existing.accountId ?? existing.userId ?? '') === next.accountId &&
      (existing.userId ?? next.accountId) === next.userId &&
      existing.mediaId === next.mediaId &&
      existing.positionSeconds === next.positionSeconds &&
      existing.durationSeconds === next.durationSeconds &&
      (existing.syncTimestampMs ?? null) === (next.syncTimestampMs ?? null) &&
      existing.completed === next.completed &&
      (existing.seriesPreferenceKey ?? null) ===
        (next.seriesPreferenceKey ?? null) &&
      (existing.preferredAudioLanguage ?? null) ===
        (next.preferredAudioLanguage ?? null) &&
      (existing.preferredSubtitleLanguage ?? null) ===
        (next.preferredSubtitleLanguage ?? null) &&
      (existing.subtitlePreferenceEnabled ?? null) ===
        (next.subtitlePreferenceEnabled ?? null)
    ) {
      return existing;
    }

    return this.progressStore.upsert({
      ...next,
      updatedAt: new Date().toISOString(),
    });
  }

  list(user: AuthUser) {
    return this.progressStore.listForAccount(this.resolveAccountId(user));
  }

  get(user: AuthUser, mediaId: string) {
    return this.progressStore.get(this.resolveAccountId(user), mediaId);
  }

  async upsert(user: AuthUser, mediaId: string, dto: UpdateProgressDto) {
    const accountId = this.resolveAccountId(user);
    const existing = await this.progressStore.get(accountId, mediaId);
    const nextSyncTimestampMs = this.normalizeSyncTimestampMs(
      dto.syncTimestampMs,
    );
    const existingSyncTimestampMs = this.normalizeSyncTimestampMs(
      existing?.syncTimestampMs ?? null,
    );

    if (
      existing &&
      nextSyncTimestampMs !== null &&
      existingSyncTimestampMs !== null &&
      nextSyncTimestampMs < existingSyncTimestampMs
    ) {
      return existing;
    }

    const existingDurationSeconds = this.normalizeSeconds(
      existing?.durationSeconds ?? 0,
    );
    const durationSeconds = Math.max(
      this.normalizeSeconds(dto.durationSeconds),
      existingDurationSeconds,
    );
    const positionSeconds = this.normalizePositionSeconds(
      dto.positionSeconds,
      durationSeconds,
    );

    const nextSeriesPreferenceKey = this.normalizeNullableText(
      dto.seriesPreferenceKey,
    );
    const nextPreferredAudioLanguage = this.normalizeNullableText(
      dto.preferredAudioLanguage,
    );
    const nextPreferredSubtitleLanguage = this.normalizeNullableText(
      dto.preferredSubtitleLanguage,
    );

    const completed = this.shouldMarkCompleted(
      positionSeconds,
      durationSeconds,
      dto.completed ?? false,
      existing?.completed ?? false,
    );
    const persistedPositionSeconds =
      completed && durationSeconds > 0 ? durationSeconds : positionSeconds;

    return this.persistProgress(existing, {
      accountId,
      userId: accountId,
      mediaId,
      positionSeconds: persistedPositionSeconds,
      durationSeconds,
      syncTimestampMs: nextSyncTimestampMs ?? existingSyncTimestampMs,
      completed,
      seriesPreferenceKey:
        nextSeriesPreferenceKey === undefined
          ? (existing?.seriesPreferenceKey ?? null)
          : nextSeriesPreferenceKey,
      preferredAudioLanguage:
        nextPreferredAudioLanguage === undefined
          ? (existing?.preferredAudioLanguage ?? null)
          : nextPreferredAudioLanguage,
      preferredSubtitleLanguage:
        nextPreferredSubtitleLanguage === undefined
          ? (existing?.preferredSubtitleLanguage ?? null)
          : nextPreferredSubtitleLanguage,
      subtitlePreferenceEnabled:
        dto.subtitlePreferenceEnabled === undefined
          ? (existing?.subtitlePreferenceEnabled ?? null)
          : dto.subtitlePreferenceEnabled,
    });
  }
}
