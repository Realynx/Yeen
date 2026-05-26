import { Injectable, NotFoundException } from '@nestjs/common';
import type { MediaItem } from '../../domain/entities/media-item.entity';
import { MediaStore } from '../../infrastructure/stores/media.store';

export interface MediaEpisodeNavigationResult {
  previousEpisode: MediaItem | null;
  nextEpisode: MediaItem | null;
}

@Injectable()
export class MediaEpisodeNavigationService {
  constructor(private readonly mediaStore: MediaStore) {}

  async getEpisodeNavigation(
    mediaId: string,
  ): Promise<MediaEpisodeNavigationResult> {
    const current = await this.requireMediaItem(mediaId);
    if (current.type !== 'show') {
      return {
        previousEpisode: null,
        nextEpisode: null,
      };
    }

    const showKey = this.normalizeEpisodeSeriesKey(current);
    const episodes = (await this.mediaStore.all())
      .filter(
        (item) =>
          item.type === 'show' &&
          this.normalizeEpisodeSeriesKey(item) === showKey,
      )
      .sort((left, right) => {
        const seasonDelta =
          (left.seasonNumber ?? 0) - (right.seasonNumber ?? 0);
        if (seasonDelta !== 0) {
          return seasonDelta;
        }

        const episodeDelta =
          (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0);
        if (episodeDelta !== 0) {
          return episodeDelta;
        }

        return left.title.localeCompare(right.title, undefined, {
          sensitivity: 'base',
        });
      });

    const currentIndex = episodes.findIndex((item) => item.id === current.id);
    return {
      previousEpisode:
        currentIndex > 0 ? (episodes[currentIndex - 1] ?? null) : null,
      nextEpisode:
        currentIndex >= 0 && currentIndex < episodes.length - 1
          ? (episodes[currentIndex + 1] ?? null)
          : null,
    };
  }

  private async requireMediaItem(mediaId: string): Promise<MediaItem> {
    const item = await this.mediaStore.findById(mediaId);
    if (!item) {
      throw new NotFoundException(
        'Media item not found. Scan your library first.',
      );
    }

    return item;
  }

  private normalizeEpisodeSeriesKey(item: MediaItem): string {
    const seeded = item.normalizedTitle?.trim();
    if (seeded) {
      return seeded;
    }

    return item.title
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\bs\d{1,2}e\d{1,3}\b/gi, '')
      .replace(/\b\d{1,2}x\d{1,3}\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
