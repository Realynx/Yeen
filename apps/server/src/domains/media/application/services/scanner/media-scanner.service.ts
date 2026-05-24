import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import { MediaItem } from '../../../domain/entities/media-item.entity';
import { MediaNfoReader } from '../../../infrastructure/readers/media-nfo.reader';
import { MediaPreviewResolver } from '../../../infrastructure/resolvers/media-preview.resolver';
import {
  MediaProbeAdapter,
} from '../../../infrastructure/adapters/media-probe.adapter';
import { MediaSubtitleResolver } from '../../../infrastructure/resolvers/media-subtitle.resolver';
import { JikanMetadataService } from '../remote-metadata/jikan-metadata.service';
import { TmdbMetadataService } from '../remote-metadata/tmdb-metadata.service';
import {
  parseReleaseYear,
  parseSeasonEpisode,
} from '../../../infrastructure/helpers/filename-metadata';
import {
  cleanTitle,
  normalizeForKey,
} from '../../../infrastructure/helpers/title-normalizer';
import {
  buildDedupeKey,
  extractEpisodeTitleFromTags,
  guessType,
  normalizeEpisodeTitle,
  normalizeTags,
  shouldUseJikanFallback,
} from './media-scanner-classification-helpers';
import {
  parseFrameRate,
  parseNumber,
  resolveDurationSeconds,
} from './media-scanner-format-helpers';

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
        const message = toErrorMessage(error);
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
    const guessedMediaType = guessType(relativePath, seasonEpisode);
    const mediaType =
      metadataHint?.mediaType === 'movie' ||
      metadataHint?.mediaType === 'show' ||
      metadataHint?.mediaType === 'other'
        ? metadataHint.mediaType
        : guessedMediaType;
    const subtitleDetails = [...embeddedSubtitles, ...externalSubtitles];
    const durationSeconds = resolveDurationSeconds(parsed, fileStats.size);
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

    const hintTags = normalizeTags(metadataHint?.tags ?? null);
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
      shouldUseJikanFallback(relativePath, mediaType, hintedTitle)
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
    const tags = normalizeTags(
      hintTags.length > 0
        ? hintTags
        : metadata?.tags?.length
          ? metadata.tags
          : (nfoMetadata?.genres ?? null),
    );
    const releaseYear = parsedReleaseYear ?? metadata?.releaseYear ?? null;
    const episodeTitle =
      mediaType === 'show'
        ? normalizeEpisodeTitle(
            nfoMetadata?.episodeTitle ??
              extractEpisodeTitleFromTags(parsed.format?.tags),
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
    const dedupeKey = buildDedupeKey({
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
        bitRate: parseNumber(parsed.format?.bit_rate),
        frameRate: parseFrameRate(video?.avg_frame_rate),
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

}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
