import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../../auth/domain/entities/auth-user.entity';
import { UpdateProgressDto } from '../dto/update-progress.dto';
import { ProgressEntry } from '../../domain/entities/progress-entry.entity';
import { ProgressStore } from '../../infrastructure/stores/progress.store';

@Injectable()
export class ProgressService {
  private static readonly WATCHED_REMAINING_SECONDS = 180;
  private static readonly MIN_COMPLETION_RATIO = 0.9;

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
    if (requestedCompleted) {
      return true;
    }

    if (durationSeconds <= 0 || positionSeconds <= 0) {
      return existingCompleted;
    }

    const watchedRatio = positionSeconds / durationSeconds;
    if (watchedRatio < ProgressService.MIN_COMPLETION_RATIO) {
      return false;
    }

    const remainingSeconds = Math.max(0, durationSeconds - positionSeconds);
    return remainingSeconds <= ProgressService.WATCHED_REMAINING_SECONDS;
  }

  private async persistProgress(
    existing: ProgressEntry | undefined,
    next: Omit<ProgressEntry, 'updatedAt'>,
  ): Promise<ProgressEntry> {
    if (existing && this.progressMatches(existing, next)) {
      return existing;
    }

    return this.progressStore.upsert({
      ...next,
      updatedAt: new Date().toISOString(),
    });
  }

  private progressMatches(
    existing: ProgressEntry,
    next: Omit<ProgressEntry, 'updatedAt'>,
  ): boolean {
    return (
      this.identityMatches(existing, next) &&
      this.playbackMatches(existing, next) &&
      this.preferencesMatch(existing, next)
    );
  }

  private identityMatches(
    existing: ProgressEntry,
    next: Omit<ProgressEntry, 'updatedAt'>,
  ): boolean {
    return (
      (existing.accountId ?? existing.userId ?? '') === next.accountId &&
      (existing.userId ?? next.accountId) === next.userId &&
      existing.mediaId === next.mediaId
    );
  }

  private playbackMatches(
    existing: ProgressEntry,
    next: Omit<ProgressEntry, 'updatedAt'>,
  ): boolean {
    return (
      existing.positionSeconds === next.positionSeconds &&
      existing.durationSeconds === next.durationSeconds &&
      (existing.syncTimestampMs ?? null) === (next.syncTimestampMs ?? null) &&
      existing.completed === next.completed
    );
  }

  private preferencesMatch(
    existing: ProgressEntry,
    next: Omit<ProgressEntry, 'updatedAt'>,
  ): boolean {
    return (
      (existing.seriesPreferenceKey ?? null) ===
        (next.seriesPreferenceKey ?? null) &&
      (existing.preferredAudioLanguage ?? null) ===
        (next.preferredAudioLanguage ?? null) &&
      (existing.preferredSubtitleLanguage ?? null) ===
        (next.preferredSubtitleLanguage ?? null) &&
      (existing.subtitlePreferenceEnabled ?? null) ===
        (next.subtitlePreferenceEnabled ?? null)
    );
  }

  list(user: AuthUser) {
    return this.progressStore.listForAccount(this.resolveAccountId(user));
  }

  listForAccount(accountId: string) {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return Promise.resolve([] as ProgressEntry[]);
    }

    return this.progressStore.listForAccount(normalizedAccountId);
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

    const completed = this.shouldMarkCompleted(
      positionSeconds,
      durationSeconds,
      dto.completed ?? false,
      existing?.completed ?? false,
    );
    const persistedPositionSeconds =
      completed && durationSeconds > 0 ? durationSeconds : positionSeconds;

    const next = this.buildProgressEntry({
      accountId,
      mediaId,
      durationSeconds,
      positionSeconds: persistedPositionSeconds,
      syncTimestampMs: nextSyncTimestampMs ?? existingSyncTimestampMs,
      completed,
      dto,
      existing,
    });
    return this.persistProgress(existing, next);
  }

  private buildProgressEntry(input: {
    accountId: string;
    mediaId: string;
    positionSeconds: number;
    durationSeconds: number;
    syncTimestampMs: number | null;
    completed: boolean;
    dto: UpdateProgressDto;
    existing: ProgressEntry | undefined;
  }): Omit<ProgressEntry, 'updatedAt'> {
    return {
      accountId: input.accountId,
      userId: input.accountId,
      mediaId: input.mediaId,
      positionSeconds: input.positionSeconds,
      durationSeconds: input.durationSeconds,
      syncTimestampMs: input.syncTimestampMs,
      completed: input.completed,
      seriesPreferenceKey: this.resolveOptionalPreference(
        input.dto.seriesPreferenceKey,
        input.existing?.seriesPreferenceKey,
      ),
      preferredAudioLanguage: this.resolveOptionalPreference(
        input.dto.preferredAudioLanguage,
        input.existing?.preferredAudioLanguage,
      ),
      preferredSubtitleLanguage: this.resolveOptionalPreference(
        input.dto.preferredSubtitleLanguage,
        input.existing?.preferredSubtitleLanguage,
      ),
      subtitlePreferenceEnabled: this.resolveNullableBoolean(
        input.dto.subtitlePreferenceEnabled,
        input.existing?.subtitlePreferenceEnabled,
      ),
    };
  }

  private resolveOptionalPreference(
    value: string | null | undefined,
    existing: string | null | undefined,
  ): string | null {
    const normalized = this.normalizeNullableText(value);
    return normalized === undefined ? (existing ?? null) : normalized;
  }

  private resolveNullableBoolean(
    value: boolean | null | undefined,
    existing: boolean | null | undefined,
  ): boolean | null {
    return value === undefined ? (existing ?? null) : value;
  }
}
