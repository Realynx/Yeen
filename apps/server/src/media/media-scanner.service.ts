import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { MediaItem } from './entities/media-item.entity';
import { MediaNfoReader } from './media-nfo.reader';
import { MediaPreviewResolver } from './media-preview.resolver';
import { MediaProbeAdapter, type FfprobePayload } from './media-probe.adapter';
import { MediaSubtitleResolver } from './media-subtitle.resolver';
import { JikanMetadataService } from './jikan-metadata.service';
import { TmdbMetadataService } from './tmdb-metadata.service';
import { parseReleaseYear, parseSeasonEpisode } from './filename-metadata';
import { cleanTitle, normalizeForKey } from './title-normalizer';

export interface MediaProbeHint {
  title?: string;
  normalizedTitle?: string;
  releaseYear?: number | null;
  mediaType?: 'movie' | 'show' | 'other' | null;
  description?: string | null;
  tags?: string[];
  posterUrl?: string | null;
  backdropUrl?: string | null;
}

@Injectable()
export class MediaScannerService {
  private readonly logger = new Logger(MediaScannerService.name);
  private readonly videoExtensions = new Set([
    '.mp4',
    '.m4v',
    '.mkv',
    '.mov',
    '.avi',
    '.webm',
  ]);

  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly tmdbMetadataService: TmdbMetadataService,
    private readonly jikanMetadataService: JikanMetadataService,
    private readonly mediaProbeAdapter: MediaProbeAdapter,
    private readonly mediaSubtitleResolver: MediaSubtitleResolver,
    private readonly mediaPreviewResolver: MediaPreviewResolver,
    private readonly nfoReader: MediaNfoReader,
  ) {}

  async scanLibrary(libraryPath: string): Promise<MediaItem[]> {
    const resolvedPath = resolve(libraryPath);
    const files = await this.collectVideoFiles(resolvedPath);

    const items: MediaItem[] = [];
    for (const filePath of files) {
      try {
        const item = await this.probeFile(filePath, resolvedPath);
        items.push(item);
      } catch (error) {
        const message = this.toErrorMessage(error);
        this.logger.warn(`Skipping ${filePath}: ${message}`);
      }
    }

    return items.sort((left, right) => left.title.localeCompare(right.title));
  }

  async collectVideoFiles(libraryPath: string): Promise<string[]> {
    const resolvedPath = resolve(libraryPath);
    const files: string[] = [];
    await this.collectFiles(resolvedPath, files);
    return files;
  }

  private async collectFiles(
    directory: string,
    bucket: string[],
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        await this.collectFiles(fullPath, bucket);
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      if (this.videoExtensions.has(extension)) {
        bucket.push(fullPath);
      }
    }
  }

  async probeFile(
    filePath: string,
    libraryRoot: string,
    metadataHint?: MediaProbeHint,
  ): Promise<MediaItem> {
    const settings = await this.systemSettingsService.getSettings();
    const parsed = await this.mediaProbeAdapter.probeFile(
      filePath,
      settings.ffprobePath || 'ffprobe',
    );
    const { video, audio, subtitleStreams } =
      this.mediaProbeAdapter.selectStreams(parsed.streams ?? []);
    const embeddedSubtitles =
      this.mediaSubtitleResolver.toEmbeddedSubtitleDetails(subtitleStreams);

    const fileStats: Stats = await stat(filePath);
    // Sidecar lookups (external subs, .nfo, preview image, description) are
    // all optional enrichment. When indexing an in-progress torrent file,
    // the surrounding directory may be momentarily unreadable over SMB or
    // missing companion files entirely; failures there must not abort the
    // probe. Swallow individual rejections and substitute empty defaults.
    const settle = async <T>(
      promise: Promise<T>,
      fallback: T,
      label: string,
    ): Promise<T> => {
      try {
        return await promise;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.debug(
          `Sidecar lookup ${label} failed for ${filePath}: ${message}`,
        );
        return fallback;
      }
    };
    const [
      externalSubtitles,
      sidecarDescription,
      sidecarPreviewImagePath,
      nfoMetadata,
    ] = await Promise.all([
      settle(
        this.mediaSubtitleResolver.findExternalSubtitleDetails(filePath),
        [],
        'external-subtitles',
      ),
      settle(
        this.mediaPreviewResolver.readSidecarDescription(filePath),
        null,
        'sidecar-description',
      ),
      settle(
        this.mediaPreviewResolver.findPreviewImagePath(filePath),
        null,
        'preview-image',
      ),
      settle(this.nfoReader.readNfo(filePath), null, 'nfo'),
    ]);

    const fileName = basename(filePath, extname(filePath));
    const relativePath = relative(libraryRoot, filePath).split(sep).join('/');
    const filenameSE = parseSeasonEpisode(fileName, relativePath);
    const nfoSeasonEpisode =
      nfoMetadata?.seasonNumber != null || nfoMetadata?.episodeNumber != null
        ? {
            seasonNumber: nfoMetadata.seasonNumber ?? filenameSE.seasonNumber,
            episodeNumber:
              nfoMetadata.episodeNumber ?? filenameSE.episodeNumber,
          }
        : null;
    const seasonEpisode = nfoSeasonEpisode ?? filenameSE;
    const guessedMediaType = this.guessType(relativePath, seasonEpisode);
    const mediaType =
      metadataHint?.mediaType === 'movie' ||
      metadataHint?.mediaType === 'show' ||
      metadataHint?.mediaType === 'other'
        ? metadataHint.mediaType
        : guessedMediaType;
    const subtitleDetails = [...embeddedSubtitles, ...externalSubtitles];
    const durationSeconds = this.resolveDurationSeconds(parsed, fileStats.size);
    const fallbackTitle = cleanTitle(fileName);
    const nfoTitle =
      (nfoMetadata?.showTitle ?? nfoMetadata?.title)?.trim() || null;
    const hintTitle = metadataHint?.title?.trim() ?? '';
    const hintNormalizedTitle = metadataHint?.normalizedTitle?.trim() ?? '';
    const hintedTitle =
      nfoTitle ?? (hintTitle || hintNormalizedTitle || fallbackTitle);
    const hintedReleaseYear =
      typeof metadataHint?.releaseYear === 'number' &&
      Number.isFinite(metadataHint.releaseYear)
        ? Math.floor(metadataHint.releaseYear)
        : null;
    const parsedReleaseYear =
      nfoMetadata?.year ?? parseReleaseYear(fileName) ?? hintedReleaseYear;

    const hintTags = this.normalizeTags(metadataHint?.tags ?? null);
    const hasHintMetadataEnrichment =
      hintTags.length > 0 ||
      Boolean(metadataHint?.description?.trim()) ||
      Boolean(metadataHint?.posterUrl?.trim()) ||
      Boolean(metadataHint?.backdropUrl?.trim());
    const shouldLookupRemoteMetadata = !hasHintMetadataEnrichment;
    const tmdb = shouldLookupRemoteMetadata
      ? await this.tmdbMetadataService.lookup({
          title: hintedTitle,
          mediaType,
          releaseYear: parsedReleaseYear,
        })
      : null;
    const jikan =
      shouldLookupRemoteMetadata &&
      !tmdb &&
      this.shouldUseJikanFallback(relativePath, mediaType, hintedTitle)
        ? await this.jikanMetadataService.lookup({
            title: hintedTitle,
            releaseYear: parsedReleaseYear,
          })
        : null;
    const metadata = tmdb ?? jikan;
    const tmdbSeriesCatalogId =
      mediaType === 'show' && tmdb?.providerId ? tmdb.providerId : null;
    const jikanSeriesCatalogId =
      mediaType === 'show' && jikan?.providerId && jikan.mediaType === 'show'
        ? jikan.providerId
        : null;

    if (tmdbSeriesCatalogId) {
      this.tmdbMetadataService.warmSeriesEpisodeCatalog(tmdbSeriesCatalogId);
    }

    if (jikanSeriesCatalogId) {
      this.jikanMetadataService.warmSeriesEpisodeCatalog(jikanSeriesCatalogId);
    }

    const title = metadata?.title?.trim() || hintedTitle;
    const normalizedTitle = normalizeForKey(title);
    const tags = this.normalizeTags(
      hintTags.length > 0
        ? hintTags
        : metadata?.tags?.length
          ? metadata.tags
          : (nfoMetadata?.genres ?? null),
    );
    const releaseYear = parsedReleaseYear ?? metadata?.releaseYear ?? null;
    const episodeTitle =
      mediaType === 'show'
        ? this.normalizeEpisodeTitle(
            nfoMetadata?.episodeTitle ??
              this.extractEpisodeTitleFromTags(parsed.format?.tags),
            title,
          )
        : null;
    const seasonNumber =
      mediaType === 'show' ? seasonEpisode.seasonNumber : null;
    const episodeNumber =
      mediaType === 'show' ? seasonEpisode.episodeNumber : null;
    const chapterThumbnails =
      await this.mediaPreviewResolver.generateChapterThumbnails(
        filePath,
        durationSeconds,
        fileStats.mtimeMs,
        settings.ffmpegPath,
        settings.thumbnailCaptureCount,
      );
    const hintPosterUrl = metadataHint?.posterUrl?.trim() || null;
    const hintBackdropUrl = metadataHint?.backdropUrl?.trim() || null;
    const metadataPosterSourceUrl =
      hintPosterUrl || metadata?.posterUrl || null;
    const metadataBackdropSourceUrl =
      hintBackdropUrl || metadata?.backdropUrl || null;
    const downloadedPosterImagePath = metadataPosterSourceUrl
      ? await this.mediaPreviewResolver.downloadPosterThumbnail(
          metadataPosterSourceUrl,
          filePath,
        )
      : null;
    const downloadedBackdropImagePath = metadataBackdropSourceUrl
      ? await this.mediaPreviewResolver.downloadBackdropThumbnail(
          metadataBackdropSourceUrl,
          filePath,
        )
      : null;
    const metadataPosterImagePath =
      downloadedPosterImagePath || metadataPosterSourceUrl;
    const metadataBackdropImagePath =
      downloadedBackdropImagePath || metadataBackdropSourceUrl;
    const previewImagePath =
      this.mediaPreviewResolver.selectBestPreviewImagePath(
        sidecarPreviewImagePath,
        metadataPosterImagePath,
        chapterThumbnails,
      );
    const backdropImagePath =
      this.mediaPreviewResolver.selectBestBackdropImagePath(
        metadataBackdropImagePath,
        chapterThumbnails,
        sidecarPreviewImagePath,
      );
    const hintDescription = metadataHint?.description?.trim() || null;
    const description =
      sidecarDescription ?? hintDescription ?? metadata?.overview ?? null;
    const dedupeKey = this.buildDedupeKey({
      mediaType,
      normalizedTitle,
      releaseYear,
      seasonNumber,
      episodeNumber,
      durationSeconds,
    });
    const metadataRefreshedAt = new Date().toISOString();

    return {
      id: randomUUID(),
      title,
      normalizedTitle,
      tags,
      description,
      releaseYear,
      seasonNumber,
      episodeNumber,
      episodeTitle,
      dedupeKey,
      relativePath,
      filePath,
      extension: extname(filePath).toLowerCase(),
      container: parsed.format?.format_name ?? null,
      type: mediaType,
      digitalMediaType: 'video',
      sizeBytes: fileStats.size,
      durationSeconds,
      width: video?.width ?? null,
      height: video?.height ?? null,
      videoCodec: video?.codec_name ?? null,
      audioCodec: audio?.codec_name ?? null,
      subtitleStreams: subtitleDetails.length,
      subtitleDetails,
      previewImagePath,
      backdropImagePath,
      chapterThumbnails,
      mediaDetails: {
        formatName: parsed.format?.format_name ?? null,
        bitRate: this.parseNumber(parsed.format?.bit_rate),
        frameRate: this.parseFrameRate(video?.avg_frame_rate),
        audioChannels: audio?.channels ?? null,
      },
      metadataRefreshedAt,
      updatedAt: metadataRefreshedAt,
      episodeCatalogSource: tmdbSeriesCatalogId
        ? 'tmdb'
        : jikanSeriesCatalogId
          ? 'jikan'
          : null,
      episodeCatalogSourceId: tmdbSeriesCatalogId ?? jikanSeriesCatalogId,
    };
  }

  private buildDedupeKey(input: {
    mediaType: 'movie' | 'show' | 'other';
    normalizedTitle: string;
    releaseYear: number | null;
    seasonNumber: number | null;
    episodeNumber: number | null;
    durationSeconds: number;
  }): string {
    const safeTitle = input.normalizedTitle || 'untitled';

    if (input.mediaType === 'show') {
      const season = input.seasonNumber ?? 0;
      const episode = input.episodeNumber ?? 0;
      return `show:${safeTitle}:s${season}:e${episode}`;
    }

    if (input.mediaType === 'movie') {
      return `movie:${safeTitle}:y${input.releaseYear ?? 0}`;
    }

    const durationBucket = Math.max(0, Math.round(input.durationSeconds / 300));
    return `other:${safeTitle}:y${input.releaseYear ?? 0}:d${durationBucket}`;
  }

  private extractEpisodeTitleFromTags(
    tags: Record<string, string | undefined> | undefined,
  ): string | null {
    if (!tags) {
      return null;
    }

    const lowerCasedTags = new Map<string, string>();
    for (const [key, value] of Object.entries(tags)) {
      if (typeof value !== 'string') {
        continue;
      }

      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      lowerCasedTags.set(key.toLowerCase(), trimmed);
    }

    const episodeTitleKeys = [
      'episode_title',
      'episodetitle',
      'episode title',
      'title',
    ];

    for (const key of episodeTitleKeys) {
      const value = lowerCasedTags.get(key);
      if (value) {
        return value;
      }
    }

    return null;
  }

  private normalizeEpisodeTitle(
    episodeTitle: string | null,
    seriesTitle: string,
  ): string | null {
    if (!episodeTitle) {
      return null;
    }

    const trimmed = episodeTitle.trim();
    if (!trimmed) {
      return null;
    }

    if (normalizeForKey(trimmed) === normalizeForKey(seriesTitle)) {
      return null;
    }

    return trimmed;
  }

  private normalizeTags(tags: string[] | null | undefined): string[] {
    if (!Array.isArray(tags) || tags.length === 0) {
      return [];
    }

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

  private resolveDurationSeconds(
    payload: FfprobePayload,
    fileSizeBytes: number,
  ): number {
    const directDuration = this.parseNumber(payload.format?.duration);
    if (directDuration && directDuration > 0) {
      return directDuration;
    }

    const formatTagDuration = this.parseDurationFromTagCollection(
      payload.format?.tags,
    );
    if (formatTagDuration && formatTagDuration > 0) {
      return formatTagDuration;
    }

    for (const stream of payload.streams ?? []) {
      const streamTagDuration = this.parseDurationFromTagCollection(
        stream.tags,
      );
      if (streamTagDuration && streamTagDuration > 0) {
        return streamTagDuration;
      }
    }

    const formatBitRate = this.parseNumber(payload.format?.bit_rate);
    if (
      formatBitRate &&
      formatBitRate > 0 &&
      Number.isFinite(fileSizeBytes) &&
      fileSizeBytes > 0
    ) {
      const estimatedSeconds = (fileSizeBytes * 8) / formatBitRate;
      if (
        Number.isFinite(estimatedSeconds) &&
        estimatedSeconds > 30 &&
        estimatedSeconds < 12 * 60 * 60
      ) {
        return estimatedSeconds;
      }
    }

    return 0;
  }

  private parseDurationFromTagCollection(
    tags: Record<string, string | undefined> | undefined,
  ): number | null {
    if (!tags) {
      return null;
    }

    for (const [key, value] of Object.entries(tags)) {
      if (!value || !key.toLowerCase().startsWith('duration')) {
        continue;
      }

      const parsed = this.parseDurationString(value);
      if (parsed && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private parseDurationString(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed || /^n\/a$/i.test(trimmed)) {
      return null;
    }

    const numeric = this.parseNumber(trimmed);
    if (numeric && numeric > 0) {
      return numeric;
    }

    const hhmmssMatch = trimmed.match(
      /^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/,
    );
    if (hhmmssMatch) {
      const hours = Number.parseInt(hhmmssMatch[1], 10);
      const minutes = Number.parseInt(hhmmssMatch[2], 10);
      const seconds = Number.parseInt(hhmmssMatch[3], 10);
      const fraction = hhmmssMatch[4]
        ? Number.parseFloat(`0.${hhmmssMatch[4]}`)
        : 0;

      if (
        Number.isFinite(hours) &&
        Number.isFinite(minutes) &&
        Number.isFinite(seconds)
      ) {
        return (
          hours * 3600 +
          minutes * 60 +
          seconds +
          (Number.isFinite(fraction) ? fraction : 0)
        );
      }
    }

    return null;
  }

  private parseNumber(value?: string): number | null {
    if (!value) {
      return null;
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseFrameRate(value?: string): number | null {
    if (!value) {
      return null;
    }

    if (value.includes('/')) {
      const [numeratorRaw, denominatorRaw] = value.split('/');
      const numerator = Number.parseFloat(numeratorRaw);
      const denominator = Number.parseFloat(denominatorRaw);

      if (
        !Number.isFinite(numerator) ||
        !Number.isFinite(denominator) ||
        denominator === 0
      ) {
        return null;
      }

      return Math.round((numerator / denominator) * 1000) / 1000;
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 1000) / 1000 : null;
  }

  private shouldUseJikanFallback(
    relativePath: string,
    mediaType: 'movie' | 'show' | 'other',
    title: string,
  ): boolean {
    const normalizedPath = relativePath.toLowerCase();
    const hasAnimePathHint =
      normalizedPath.includes('/anime/') ||
      normalizedPath.includes('/animes/') ||
      normalizedPath.includes('/animation/anime/');

    if (hasAnimePathHint) {
      return true;
    }

    if (mediaType !== 'show') {
      return false;
    }

    return this.isLikelyAnimeTitle(title);
  }

  private isLikelyAnimeTitle(title: string): boolean {
    const cleaned = title.trim();
    if (!cleaned) {
      return false;
    }

    if (
      /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(cleaned)
    ) {
      return true;
    }

    const tokens = new Set(normalizeForKey(cleaned).split(' ').filter(Boolean));
    const animeMarkers = [
      'anime',
      'ova',
      'ona',
      'oad',
      'isekai',
      'senpai',
      'chan',
      'kun',
      'sama',
      'shonen',
      'shounen',
      'seinen',
      'josei',
      'shippuden',
    ];

    for (const marker of animeMarkers) {
      if (tokens.has(marker)) {
        return true;
      }
    }

    return false;
  }

  private guessType(
    relativePath: string,
    seasonEpisode: {
      seasonNumber: number | null;
      episodeNumber: number | null;
    },
  ): 'movie' | 'show' | 'other' {
    // Any concrete season/episode signal (from the filename OR a season
    // folder like "Show/Season 02/") is the strongest hint that this
    // file is part of a series.
    if (
      seasonEpisode.seasonNumber !== null ||
      seasonEpisode.episodeNumber !== null
    ) {
      return 'show';
    }

    const normalized = relativePath.toLowerCase();
    if (
      normalized.includes('/shows/') ||
      normalized.includes('/show/') ||
      normalized.includes('/tv/') ||
      normalized.includes('/series/')
    ) {
      return 'show';
    }

    if (
      normalized.includes('/movies/') ||
      normalized.includes('/movie/') ||
      normalized.includes('/films/')
    ) {
      return 'movie';
    }

    return 'other';
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
