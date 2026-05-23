import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { JsonFileStore } from '../shared/json-file-store';
import { ProgressEntry } from './entities/progress-entry.entity';

@Injectable()
export class ProgressStore extends JsonFileStore<ProgressEntry[]> {
  constructor() {
    super(join(process.cwd(), 'data', 'watch-progress.json'), []);
  }

  async listForUser(accountId: string): Promise<ProgressEntry[]> {
    return this.listForAccount(accountId);
  }

  async listForAccount(accountId: string): Promise<ProgressEntry[]> {
    await this.ensureLoaded();
    return this.state
      .filter((entry) => this.entryAccountId(entry) === accountId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(
    accountId: string,
    mediaId: string,
  ): Promise<ProgressEntry | undefined> {
    await this.ensureLoaded();
    return this.state.find((entry) => {
      return (
        this.entryAccountId(entry) === accountId && entry.mediaId === mediaId
      );
    });
  }

  async upsert(next: ProgressEntry): Promise<ProgressEntry> {
    await this.ensureLoaded();

    const nextAccountId = this.entryAccountId(next);

    const existingIndex = this.state.findIndex((entry) => {
      return (
        this.entryAccountId(entry) === nextAccountId &&
        entry.mediaId === next.mediaId
      );
    });

    if (existingIndex >= 0) {
      this.state[existingIndex] = next;
    } else {
      this.state.push(next);
    }

    await this.queueSave();
    return next;
  }

  protected parseLoadedState(value: unknown): ProgressEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const parsed: ProgressEntry[] = [];
    for (const candidate of value) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }

      const raw = candidate as Record<string, unknown>;
      const accountId = this.normalizeId(raw.accountId ?? raw.userId);
      const mediaId = this.normalizeId(raw.mediaId);

      if (!accountId || !mediaId) {
        continue;
      }

      const durationSeconds = this.normalizeSeconds(raw.durationSeconds);
      const positionSeconds = this.normalizePosition(
        raw.positionSeconds,
        durationSeconds,
      );

      parsed.push({
        accountId,
        userId: accountId,
        mediaId,
        positionSeconds,
        durationSeconds,
        syncTimestampMs: this.normalizeTimestampMs(raw.syncTimestampMs),
        completed: typeof raw.completed === 'boolean' ? raw.completed : false,
        seriesPreferenceKey: this.normalizeNullableText(
          raw.seriesPreferenceKey,
        ),
        preferredAudioLanguage: this.normalizeNullableText(
          raw.preferredAudioLanguage,
        ),
        preferredSubtitleLanguage: this.normalizeNullableText(
          raw.preferredSubtitleLanguage,
        ),
        subtitlePreferenceEnabled:
          typeof raw.subtitlePreferenceEnabled === 'boolean'
            ? raw.subtitlePreferenceEnabled
            : null,
        updatedAt: this.normalizeTimestamp(raw.updatedAt),
      });
    }

    return parsed;
  }

  protected defaultState(): ProgressEntry[] {
    return [];
  }

  private entryAccountId(entry: ProgressEntry): string {
    const normalized = this.normalizeId(entry.accountId ?? entry.userId);
    return normalized ?? '';
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeSeconds(value: unknown): number {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }

    return Math.floor(parsed);
  }

  private normalizePosition(value: unknown, durationSeconds: number): number {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }

    const normalized = Math.floor(parsed);
    return durationSeconds > 0
      ? Math.min(normalized, durationSeconds)
      : normalized;
  }

  private normalizeNullableText(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeTimestampMs(value: unknown): number | null {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return Math.floor(parsed);
  }

  private normalizeTimestamp(value: unknown): string {
    if (typeof value !== 'string') {
      return new Date().toISOString();
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return new Date().toISOString();
    }

    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed)
      ? new Date(parsed).toISOString()
      : new Date().toISOString();
  }
}
