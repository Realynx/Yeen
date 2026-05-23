import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeForKey } from '../../../infrastructure/helpers/title-normalizer';
import type {
  MediaItem,
  SeriesAssignmentRules,
} from '../../../domain/entities/media-item.entity';
import { MediaEpisodeCatalogService } from '../episode-catalog/media-episode-catalog.service';
import type { MediaMetadataPatch } from './media-metadata-patch.types';

@Injectable()
export class MediaMetadataPatchApplicationService {
  constructor(
    private readonly mediaEpisodeCatalogService: MediaEpisodeCatalogService,
  ) {}

  applyPatch(existing: MediaItem, patch: MediaMetadataPatch): MediaItem {
    const hasOwn = <K extends keyof MediaMetadataPatch>(key: K) =>
      Object.prototype.hasOwnProperty.call(patch, key);

    const next: MediaItem = { ...existing };

    if (hasOwn('title')) {
      const cleaned = (patch.title ?? '').trim();
      if (!cleaned) {
        throw new BadRequestException('Title cannot be empty.');
      }
      next.title = cleaned;
    }

    if (hasOwn('description')) {
      const value = patch.description;
      if (value === null || value === undefined) {
        next.description = null;
      } else {
        const cleaned = value.trim();
        next.description = cleaned ? cleaned : null;
      }
    }

    if (hasOwn('releaseYear')) {
      next.releaseYear = this.coerceOptionalInt(patch.releaseYear);
    }

    if (hasOwn('type')) {
      const value = patch.type;
      if (value !== 'movie' && value !== 'show' && value !== 'other') {
        throw new BadRequestException('Invalid media type.');
      }
      next.type = value;
    }

    if (hasOwn('seasonNumber')) {
      next.seasonNumber = this.coerceOptionalInt(patch.seasonNumber);
    }

    if (hasOwn('episodeNumber')) {
      next.episodeNumber = this.coerceOptionalInt(patch.episodeNumber);
    }

    if (hasOwn('episodeTitle')) {
      const value = patch.episodeTitle;
      if (value === null || value === undefined) {
        next.episodeTitle = null;
      } else {
        const cleaned = value.trim();
        next.episodeTitle = cleaned ? cleaned : null;
      }
    }

    if (hasOwn('tags')) {
      next.tags = this.normalizeEditableTags(patch.tags ?? []);
    }

    if (hasOwn('remoteSource')) {
      const value = patch.remoteSource;
      if (value === null || value === undefined) {
        next.remoteSource = undefined;
      } else if (value === 'tmdb' || value === 'jikan') {
        next.remoteSource = value;
      } else {
        throw new BadRequestException('Invalid remote metadata source.');
      }
    }

    if (hasOwn('remoteSourceId')) {
      const value = patch.remoteSourceId;
      if (value === null || value === undefined) {
        next.remoteSourceId = null;
      } else {
        const cleaned = value.trim();
        next.remoteSourceId = cleaned ? cleaned : null;
      }
    }

    if (!next.remoteSource || !next.remoteSourceId) {
      next.remoteSource = undefined;
      next.remoteSourceId = null;
      next.remoteSourceLabel = null;
    } else {
      next.remoteSourceLabel = this.remoteSourceLabel(next.remoteSource);
    }

    if (hasOwn('seriesAssignmentRules')) {
      next.seriesAssignmentRules = this.normalizeSeriesAssignmentRules(
        patch.seriesAssignmentRules,
      );
    }

    // Shows always need a season; default to 1 if becoming a show and unset.
    if (next.type === 'show' && next.seasonNumber === null) {
      next.seasonNumber = 1;
    }

    // Movies and others do not carry season/episode fields.
    if (next.type !== 'show') {
      next.seasonNumber = null;
      next.episodeNumber = null;
      next.episodeTitle = null;
    }

    this.mediaEpisodeCatalogService.reconcileEpisodeCatalogLink(
      next,
      existing,
      null,
      false,
    );

    next.normalizedTitle = normalizeForKey(next.title);
    next.dedupeKey = this.buildDedupeKey(next);

    const previousTimestamp = Date.parse(
      existing.metadataRefreshedAt || existing.updatedAt,
    );
    let nextTimestamp = Date.now();
    if (
      Number.isFinite(previousTimestamp) &&
      nextTimestamp <= previousTimestamp
    ) {
      nextTimestamp = previousTimestamp + 1;
    }

    const now = new Date(nextTimestamp).toISOString();
    next.updatedAt = now;
    next.metadataRefreshedAt = now;

    return next;
  }

  buildDedupeKey(item: MediaItem): string {
    const normalizedTitle = item.normalizedTitle || normalizeForKey(item.title);
    if (item.type === 'show') {
      return `show:${normalizedTitle}:s${item.seasonNumber ?? 0}:e${item.episodeNumber ?? 0}`;
    }
    if (item.type === 'movie') {
      return `movie:${normalizedTitle}:y${item.releaseYear ?? 0}`;
    }
    const durationBucket = Math.max(0, Math.round(item.durationSeconds / 300));
    return `other:${normalizedTitle}:y${item.releaseYear ?? 0}:d${durationBucket}`;
  }

  coerceOptionalInt(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    return Math.floor(value);
  }

  normalizeEditableTags(tags: readonly string[]): string[] {
    const deduped = new Map<string, string>();
    for (const tag of tags) {
      if (typeof tag !== 'string') {
        continue;
      }
      const cleaned = tag.trim();
      if (!cleaned) {
        continue;
      }
      const key = cleaned.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, cleaned);
      }
    }

    return [...deduped.values()].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );
  }

  normalizeSeriesAssignmentRules(
    rules: SeriesAssignmentRules | null | undefined,
  ): SeriesAssignmentRules | null {
    if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
      return null;
    }

    const keywordMappings = this.normalizeSeriesKeywordMappings(
      rules.keywordMappings,
    );
    const patternMappings = this.normalizeSeriesPatternMappings(
      rules.patternMappings,
    );

    if (keywordMappings.length === 0 && patternMappings.length === 0) {
      return null;
    }

    const normalized: SeriesAssignmentRules = {};
    if (keywordMappings.length > 0) {
      normalized.keywordMappings = keywordMappings;
    }
    if (patternMappings.length > 0) {
      normalized.patternMappings = patternMappings;
    }

    return normalized;
  }

  normalizeEpisodeCatalogSource(value: string | null): 'tmdb' | 'jikan' | null {
    return value === 'tmdb' || value === 'jikan' ? value : null;
  }

  remoteSourceLabel(provider: 'tmdb' | 'jikan'): string {
    return provider === 'tmdb' ? 'TMDB' : 'Jikan';
  }

  private normalizeSeriesKeywordMappings(
    value: SeriesAssignmentRules['keywordMappings'] | undefined,
  ): NonNullable<SeriesAssignmentRules['keywordMappings']> {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalized: NonNullable<SeriesAssignmentRules['keywordMappings']> =
      [];

    for (const rule of value) {
      if (!rule || typeof rule !== 'object') {
        continue;
      }

      const keyword =
        typeof rule.keyword === 'string' ? rule.keyword.trim() : '';
      if (!keyword) {
        continue;
      }

      const seasonNumber = this.coerceOptionalSeasonInt(rule.seasonNumber);
      const episodeNumber = this.coerceOptionalNonNegativeInt(
        rule.episodeNumber,
      );
      if (seasonNumber === null && episodeNumber === null) {
        continue;
      }

      normalized.push({
        keyword,
        seasonNumber,
        episodeNumber,
      });
    }

    return normalized;
  }

  private normalizeSeriesPatternMappings(
    value: SeriesAssignmentRules['patternMappings'] | undefined,
  ): NonNullable<SeriesAssignmentRules['patternMappings']> {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalized: NonNullable<SeriesAssignmentRules['patternMappings']> =
      [];

    for (const rule of value) {
      if (!rule || typeof rule !== 'object') {
        continue;
      }

      const pattern =
        typeof rule.pattern === 'string' ? rule.pattern.trim() : '';
      if (!pattern) {
        continue;
      }

      const flags = this.sanitizeRegexFlags(rule.flags);
      try {
        RegExp(pattern, flags);
      } catch {
        continue;
      }

      const seasonGroup = this.coerceOptionalPositiveInt(rule.seasonGroup);
      const episodeGroup = this.coerceOptionalPositiveInt(rule.episodeGroup);
      const seasonNumber = this.coerceOptionalSeasonInt(rule.seasonNumber);
      const episodeNumber = this.coerceOptionalNonNegativeInt(
        rule.episodeNumber,
      );

      if (
        seasonGroup === null &&
        episodeGroup === null &&
        seasonNumber === null &&
        episodeNumber === null
      ) {
        continue;
      }

      normalized.push({
        pattern,
        flags: flags || undefined,
        seasonGroup,
        episodeGroup,
        seasonNumber,
        episodeNumber,
      });
    }

    return normalized;
  }

  private sanitizeRegexFlags(value: string | undefined): string {
    if (typeof value !== 'string') {
      return '';
    }

    const allowed = new Set(['i', 'm', 's', 'u']);
    const deduped = new Set<string>();

    for (const char of value.toLowerCase()) {
      if (allowed.has(char)) {
        deduped.add(char);
      }
    }

    return [...deduped].join('');
  }

  private coerceOptionalNonNegativeInt(
    value: number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    const floored = Math.floor(value);
    return floored >= 0 ? floored : null;
  }

  private coerceOptionalSeasonInt(
    value: number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    const floored = Math.floor(value);
    return floored >= -1 ? floored : null;
  }

  private coerceOptionalPositiveInt(
    value: number | null | undefined,
  ): number | null {
    const parsed = this.coerceOptionalNonNegativeInt(value);
    if (parsed === null || parsed < 1) {
      return null;
    }

    return parsed;
  }
}
