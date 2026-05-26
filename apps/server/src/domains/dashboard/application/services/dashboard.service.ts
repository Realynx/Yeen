import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../auth/domain/entities/auth-user.entity';
import type { MediaItem } from '../../../media/domain/entities/media-item.entity';
import { MediaService } from '../../../media/application/services/media.service';
import { ProgressService } from '../../../progress/application/services/progress.service';
import type { ProgressEntry } from '../../../progress/domain/entities/progress-entry.entity';

@Injectable()
export class DashboardService {
  constructor(
    private readonly mediaService: MediaService,
    private readonly progressService: ProgressService,
  ) {}

  async getContinueWatching(user: AuthUser) {
    const [mediaItems, progressItems] = await this.loadDashboardData(user);
    const mediaById = new Map(mediaItems.map((item) => [item.id, item]));

    return {
      items: progressItems
        .filter((entry) => !entry.completed && entry.positionSeconds > 5)
        .map((entry) => {
          const item = mediaById.get(entry.mediaId);
          return item ? { item, progress: entry } : null;
        })
        .filter(
          (entry): entry is { item: MediaItem; progress: ProgressEntry } =>
            entry !== null,
        )
        .sort(
          (left, right) =>
            Date.parse(right.progress.updatedAt) -
            Date.parse(left.progress.updatedAt),
        )
        .slice(0, 20),
    };
  }

  async getRecentlyAdded(user: AuthUser) {
    const [mediaItems] = await this.loadDashboardData(user);
    return {
      items: this.consolidateSeries(mediaItems)
        .sort(
          (left, right) =>
            this.timestampFor(right) - this.timestampFor(left) ||
            left.title.localeCompare(right.title, undefined, {
              sensitivity: 'base',
            }),
        )
        .slice(0, 24),
    };
  }

  async getFeatured(user: AuthUser) {
    const [mediaItems, progressItems] = await this.loadDashboardData(user);
    const progressByMediaId = new Set(
      progressItems.map((item) => item.mediaId),
    );
    const candidates = this.consolidateSeries(mediaItems).filter(
      (item) => item.digitalMediaType === 'video',
    );

    return {
      items: candidates
        .sort((left, right) => {
          const rightScore = this.featureScore(right, progressByMediaId);
          const leftScore = this.featureScore(left, progressByMediaId);
          return (
            rightScore - leftScore ||
            left.title.localeCompare(right.title, undefined, {
              sensitivity: 'base',
            })
          );
        })
        .slice(0, 8),
    };
  }

  async getGenreRows(user: AuthUser) {
    const [mediaItems] = await this.loadDashboardData(user);
    const rows = new Map<string, { label: string; items: MediaItem[] }>();

    for (const item of this.consolidateSeries(mediaItems)) {
      if (item.digitalMediaType !== 'video') {
        continue;
      }

      for (const rawTag of item.tags ?? []) {
        const label = rawTag.trim();
        if (!label) {
          continue;
        }

        const key = label.toLowerCase();
        const row = rows.get(key) ?? { label, items: [] };
        row.items.push(item);
        rows.set(key, row);
      }
    }

    return {
      rows: [...rows.entries()]
        .map(([key, row]) => ({
          id: `genre-${key.replace(/[^a-z0-9]+/g, '-')}`,
          label: row.label,
          items: row.items
            .sort(
              (left, right) =>
                this.timestampFor(right) - this.timestampFor(left),
            )
            .slice(0, 15),
        }))
        .filter((row) => row.items.length >= 3)
        .sort((left, right) => right.items.length - left.items.length)
        .slice(0, 8),
    };
  }

  private async loadDashboardData(
    user: AuthUser,
  ): Promise<[MediaItem[], ProgressEntry[]]> {
    return Promise.all([
      this.mediaService.list(),
      this.progressService.list(user),
    ]);
  }

  private consolidateSeries(items: MediaItem[]): MediaItem[] {
    const result: MediaItem[] = [];
    const indexBySeriesKey = new Map<string, number>();

    for (const item of items) {
      if (item.type !== 'show') {
        result.push(item);
        continue;
      }

      const key = this.seriesKey(item);
      const existingIndex = indexBySeriesKey.get(key);
      if (existingIndex === undefined) {
        indexBySeriesKey.set(key, result.length);
        result.push(item);
        continue;
      }

      if (this.timestampFor(item) > this.timestampFor(result[existingIndex])) {
        result[existingIndex] = item;
      }
    }

    return result;
  }

  private seriesKey(item: MediaItem): string {
    return (
      item.normalizedTitle?.trim() ||
      item.title
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\bs\d{1,2}e\d{1,3}\b/gi, '')
        .replace(/\b\d{1,2}x\d{1,3}\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  private timestampFor(item: MediaItem): number {
    return Math.max(
      Date.parse(item.metadataRefreshedAt) || 0,
      Date.parse(item.updatedAt) || 0,
    );
  }

  private featureScore(
    item: MediaItem,
    progressByMediaId: ReadonlySet<string>,
  ): number {
    const artworkBonus =
      item.backdropImagePath || item.previewImagePath ? 25 : 0;
    const metadataBonus = item.description ? 15 : 0;
    const progressPenalty = progressByMediaId.has(item.id) ? -10 : 0;
    const qualityBonus = item.height ? Math.min(20, item.height / 108) : 0;
    return artworkBonus + metadataBonus + progressPenalty + qualityBonus;
  }
}
