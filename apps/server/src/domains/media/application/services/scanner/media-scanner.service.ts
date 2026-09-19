import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import {
  MediaItem,
  type MediaChapterThumbnail,
  type MediaSubtitleDetail,
  type MusicMetadata,
} from '../../../domain/entities/media-item.entity';
import {
  MediaNfoReader,
  type NfoMetadata,
} from '../../../infrastructure/media-nfo.reader';
import { MediaPreviewResolver } from '../../../infrastructure/resolvers/media-preview.resolver';
import {
  MediaProbeAdapter,
  type FfprobePayload,
  type FfprobeStream,
} from '../../../infrastructure/media-probe.adapter';
import { MediaSubtitleResolver } from '../../../infrastructure/resolvers/media-subtitle.resolver';
import { JikanMetadataService } from '../remote-metadata/jikan-metadata.service';
import { TmdbMetadataService } from '../remote-metadata/tmdb-metadata.service';
import {
  parseReleaseYear,
  parseSeasonEpisode,
} from '../../../infrastructure/helpers/filename-metadata';
import { normalizeFfprobeChapterMarkers } from '../../../infrastructure/helpers/media-chapter-markers';
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
import {
  extractMusicMetadata,
  findEmbeddedArtworkStream,
  isMusicExtension,
  MUSIC_FILE_EXTENSIONS,
} from './music-metadata.helpers';
import type { MediaLibraryType } from '@yeen/shared-contracts';
import type { TmdbLookupResult } from '../remote-metadata/tmdb-metadata.types';
import type { JikanLookupResult } from '../remote-metadata/jikan-metadata.types';

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

interface ScannerSidecars {
  externalSubtitles: MediaSubtitleDetail[];
  description: string | null;
  previewImagePath: string | null;
  nfo: NfoMetadata | null;
}

interface ScannerMusicEnrichment {
  embeddedArtworkPath: string | null;
  extracted:
    | (MusicMetadata & { title: string | null; releaseYear: number | null })
    | null;
  metadata: MusicMetadata | null;
}

interface ScannerIdentity {
  mediaType: MediaItem['type'];
  seasonNumber: number | null;
  episodeNumber: number | null;
}

interface ScannerRemoteEnrichment {
  metadata: TmdbLookupResult | JikanLookupResult | null;
  tmdbSeriesCatalogId: string | null;
  jikanSeriesCatalogId: string | null;
}

interface ScannerArtwork {
  previewImagePath: string | null;
  backdropImagePath: string | null;
  chapterThumbnails: MediaChapterThumbnail[];
}

interface ScannerItemInput {
  filePath: string;
  relativePath: string;
  extension: string;
  libraryType: MediaLibraryType;
  identity: ScannerIdentity;
  title: string;
  normalizedTitle: string;
  tags: string[];
  description: string | null;
  releaseYear: number | null;
  episodeTitle: string | null;
  dedupeKey: string;
  musicMetadata: MusicMetadata | null;
  fileStats: Stats;
  durationSeconds: number;
  video: FfprobeStream | undefined;
  audio: FfprobeStream | undefined;
  parsed: FfprobePayload;
  subtitleDetails: MediaSubtitleDetail[];
  artwork: ScannerArtwork;
  remote: ScannerRemoteEnrichment;
  metadataRefreshedAt: string;
}

const VIDEO_FILE_EXTENSIONS = new Set([
  '.mp4',
  '.m4v',
  '.mkv',
  '.mov',
  '.avi',
  '.webm',
]);

export function isExtensionAllowedForLibrary(
  extension: string,
  libraryType?: MediaLibraryType,
): boolean {
  const normalized = extension.toLowerCase();
  if (libraryType === 'video') {
    return VIDEO_FILE_EXTENSIONS.has(normalized);
  }
  if (libraryType === 'music') {
    return MUSIC_FILE_EXTENSIONS.has(normalized);
  }
  return (
    VIDEO_FILE_EXTENSIONS.has(normalized) ||
    MUSIC_FILE_EXTENSIONS.has(normalized)
  );
}

@Injectable()
export class MediaScannerService {
  private readonly logger = new Logger(MediaScannerService.name);
  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly tmdbMetadataService: TmdbMetadataService,
    private readonly jikanMetadataService: JikanMetadataService,
    private readonly mediaProbeAdapter: MediaProbeAdapter,
    private readonly mediaSubtitleResolver: MediaSubtitleResolver,
    private readonly mediaPreviewResolver: MediaPreviewResolver,
    private readonly nfoReader: MediaNfoReader,
  ) {}

  async scanLibrary(
    libraryPath: string,
    libraryType?: MediaLibraryType,
  ): Promise<MediaItem[]> {
    const resolvedPath = resolve(libraryPath);
    const files = await this.collectMediaFiles(resolvedPath, libraryType);

    const items: MediaItem[] = [];
    for (const filePath of files) {
      try {
        const item = await this.probeFile(
          filePath,
          resolvedPath,
          undefined,
          libraryType,
        );
        items.push(item);
      } catch (error) {
        const message = toErrorMessage(error);
        this.logger.warn(`Skipping ${filePath}: ${message}`);
      }
    }

    return items.sort((left, right) => left.title.localeCompare(right.title));
  }

  async collectVideoFiles(libraryPath: string): Promise<string[]> {
    return (await this.collectMediaFiles(libraryPath)).filter((filePath) =>
      isExtensionAllowedForLibrary(extname(filePath), 'video'),
    );
  }

  async collectMediaFiles(
    libraryPath: string,
    libraryType?: MediaLibraryType,
  ): Promise<string[]> {
    const resolvedPath = resolve(libraryPath);
    const files: string[] = [];
    await this.collectFiles(resolvedPath, files, libraryType);
    return files;
  }

  private async collectFiles(
    directory: string,
    bucket: string[],
    libraryType?: MediaLibraryType,
  ): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        await this.collectFiles(fullPath, bucket, libraryType);
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      if (isExtensionAllowedForLibrary(extension, libraryType)) {
        bucket.push(fullPath);
      }
    }
  }

  /**
   * Probe only the playable duration of a source file. Used to verify the HLS
   * manifest length against the real file at playback time, since an item's
   * stored `durationSeconds` may be a partial-file estimate or a remote
   * catalog runtime rather than the true probed file duration.
   */
  async probeDurationSeconds(filePath: string): Promise<number> {
    const settings = await this.systemSettingsService.getSettings();
    const parsed = await this.mediaProbeAdapter.probeFile(
      filePath,
      settings.ffprobePath || 'ffprobe',
    );
    const fileStats: Stats = await stat(filePath);
    return resolveDurationSeconds(parsed, fileStats.size);
  }

  async probeFile(
    filePath: string,
    libraryRoot: string,
    metadataHint?: MediaProbeHint,
    libraryTypeOverride?: MediaLibraryType,
  ): Promise<MediaItem> {
    const settings = await this.systemSettingsService.getSettings();
    const parsed = await this.mediaProbeAdapter.probeFile(
      filePath,
      settings.ffprobePath || 'ffprobe',
    );
    const { video, audio, subtitleStreams } =
      this.mediaProbeAdapter.selectStreams(parsed.streams ?? []);
    const extension = extname(filePath).toLowerCase();
    const libraryType = this.resolveLibraryType(extension, libraryTypeOverride);
    const embeddedSubtitles = this.embeddedSubtitles(
      libraryType,
      subtitleStreams,
    );
    const fileStats: Stats = await stat(filePath);
    const sidecars = await this.loadSidecars(filePath, libraryType);
    const fileName = basename(filePath, extname(filePath));
    const relativePath = relative(libraryRoot, filePath).split(sep).join('/');
    const music = await this.resolveMusicEnrichment(
      filePath,
      relativePath,
      libraryType,
      parsed,
      fileStats,
      settings.ffmpegPath,
      sidecars.previewImagePath,
    );
    const identity = this.resolveIdentity(
      fileName,
      relativePath,
      libraryType,
      metadataHint,
      sidecars.nfo,
    );
    const subtitleDetails = [
      ...embeddedSubtitles,
      ...sidecars.externalSubtitles,
    ];
    const durationSeconds = resolveDurationSeconds(parsed, fileStats.size);
    const chapterMarkers = normalizeFfprobeChapterMarkers(
      parsed.chapters,
      durationSeconds,
    );
    const hintedTitle = this.resolveHintedTitle(
      fileName,
      metadataHint,
      sidecars.nfo,
      music.extracted,
    );
    const parsedReleaseYear = this.resolveReleaseYear(
      fileName,
      metadataHint,
      sidecars.nfo,
      music.extracted,
    );
    const hintTags = normalizeTags(metadataHint?.tags ?? null);
    const remote = await this.lookupRemoteEnrichment(
      libraryType,
      metadataHint,
      hintTags,
      hintedTitle,
      identity.mediaType,
      parsedReleaseYear,
      relativePath,
    );
    this.warmSeriesCatalogs(remote);
    const title = remote.metadata?.title?.trim() || hintedTitle;
    const normalizedTitle = normalizeForKey(title);
    const tags = this.resolveTags(
      libraryType,
      music.extracted,
      hintTags,
      remote.metadata,
      sidecars.nfo,
    );
    const releaseYear =
      parsedReleaseYear ?? remote.metadata?.releaseYear ?? null;
    const episodeTitle = this.resolveEpisodeTitle(
      identity.mediaType,
      sidecars.nfo,
      parsed,
      title,
    );
    const artwork = await this.resolveArtwork(
      filePath,
      libraryType,
      durationSeconds,
      fileStats,
      settings.ffmpegPath,
      settings.thumbnailCaptureCount,
      chapterMarkers,
      metadataHint,
      remote.metadata,
      music.embeddedArtworkPath,
      sidecars.previewImagePath,
    );
    const description = this.resolveDescription(
      sidecars.description,
      metadataHint,
      remote.metadata,
    );
    const dedupeKey = buildDedupeKey({
      mediaType: identity.mediaType,
      normalizedTitle,
      releaseYear,
      seasonNumber: identity.seasonNumber,
      episodeNumber: identity.episodeNumber,
      durationSeconds,
      libraryType,
      musicMetadata: music.metadata,
    });
    const metadataRefreshedAt = new Date().toISOString();
    return this.buildMediaItem({
      filePath,
      relativePath,
      extension,
      libraryType,
      identity,
      title,
      normalizedTitle,
      tags,
      description,
      releaseYear,
      episodeTitle,
      dedupeKey,
      musicMetadata: music.metadata,
      fileStats,
      durationSeconds,
      video,
      audio,
      parsed,
      subtitleDetails,
      artwork,
      remote,
      metadataRefreshedAt,
    });
  }

  private buildMediaItem(input: ScannerItemInput): MediaItem {
    return {
      id: randomUUID(),
      title: input.title,
      normalizedTitle: input.normalizedTitle,
      tags: input.tags,
      description: input.description,
      releaseYear: input.releaseYear,
      seasonNumber: input.identity.seasonNumber,
      episodeNumber: input.identity.episodeNumber,
      episodeTitle: input.episodeTitle,
      dedupeKey: input.dedupeKey,
      relativePath: input.relativePath,
      filePath: input.filePath,
      extension: input.extension,
      container: input.parsed.format?.format_name ?? null,
      type: input.identity.mediaType,
      digitalMediaType: this.digitalMediaType(input.libraryType),
      libraryType: input.libraryType,
      musicMetadata: input.musicMetadata,
      sizeBytes: input.fileStats.size,
      durationSeconds: input.durationSeconds,
      ...this.technicalMediaFields(input),
      subtitleStreams: input.subtitleDetails.length,
      subtitleDetails: input.subtitleDetails,
      previewImagePath: input.artwork.previewImagePath,
      backdropImagePath: input.artwork.backdropImagePath,
      chapterThumbnails: input.artwork.chapterThumbnails,
      metadataRefreshedAt: input.metadataRefreshedAt,
      updatedAt: input.metadataRefreshedAt,
      ...this.episodeCatalogFields(input.remote),
    };
  }

  private technicalMediaFields(
    input: ScannerItemInput,
  ): Pick<
    MediaItem,
    'width' | 'height' | 'videoCodec' | 'audioCodec' | 'mediaDetails'
  > {
    return {
      width: input.video?.width ?? null,
      height: input.video?.height ?? null,
      videoCodec: input.video?.codec_name ?? null,
      audioCodec: input.audio?.codec_name ?? null,
      mediaDetails: {
        formatName: input.parsed.format?.format_name ?? null,
        bitRate: parseNumber(input.parsed.format?.bit_rate),
        frameRate: parseFrameRate(input.video?.avg_frame_rate),
        audioChannels: input.audio?.channels ?? null,
      },
    };
  }

  private episodeCatalogFields(
    remote: ScannerRemoteEnrichment,
  ): Pick<MediaItem, 'episodeCatalogSource' | 'episodeCatalogSourceId'> {
    let episodeCatalogSource: 'tmdb' | 'jikan' | null = null;
    if (remote.tmdbSeriesCatalogId) episodeCatalogSource = 'tmdb';
    else if (remote.jikanSeriesCatalogId) episodeCatalogSource = 'jikan';
    return {
      episodeCatalogSource,
      episodeCatalogSourceId:
        remote.tmdbSeriesCatalogId ?? remote.jikanSeriesCatalogId,
    };
  }

  private resolveLibraryType(
    extension: string,
    override: MediaLibraryType | undefined,
  ): MediaLibraryType {
    return override ?? (isMusicExtension(extension) ? 'music' : 'video');
  }

  private embeddedSubtitles(
    libraryType: MediaLibraryType,
    streams: FfprobeStream[],
  ): MediaSubtitleDetail[] {
    return libraryType === 'video'
      ? this.mediaSubtitleResolver.toEmbeddedSubtitleDetails(streams)
      : [];
  }

  private async loadSidecars(
    filePath: string,
    libraryType: MediaLibraryType,
  ): Promise<ScannerSidecars> {
    const externalPromise =
      libraryType === 'video'
        ? this.mediaSubtitleResolver.findExternalSubtitleDetails(filePath)
        : Promise.resolve<MediaSubtitleDetail[]>([]);
    const nfoPromise =
      libraryType === 'video'
        ? this.nfoReader.readNfo(filePath)
        : Promise.resolve<NfoMetadata | null>(null);
    const [externalSubtitles, description, previewImagePath, nfo] =
      await Promise.all([
        this.settleSidecar(filePath, externalPromise, [], 'external-subtitles'),
        this.settleSidecar(
          filePath,
          this.mediaPreviewResolver.readSidecarDescription(filePath),
          null,
          'sidecar-description',
        ),
        this.settleSidecar(
          filePath,
          this.mediaPreviewResolver.findPreviewImagePath(filePath),
          null,
          'preview-image',
        ),
        this.settleSidecar(filePath, nfoPromise, null, 'nfo'),
      ]);
    return { externalSubtitles, description, previewImagePath, nfo };
  }

  private async settleSidecar<T>(
    filePath: string,
    promise: Promise<T>,
    fallback: T,
    label: string,
  ): Promise<T> {
    try {
      return await promise;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(
        `Sidecar lookup ${label} failed for ${filePath}: ${message}`,
      );
      return fallback;
    }
  }

  private async resolveMusicEnrichment(
    filePath: string,
    relativePath: string,
    libraryType: MediaLibraryType,
    parsed: FfprobePayload,
    fileStats: Stats,
    ffmpegPath: string,
    sidecarArtworkPath: string | null,
  ): Promise<ScannerMusicEnrichment> {
    if (libraryType !== 'music') {
      return { embeddedArtworkPath: null, extracted: null, metadata: null };
    }
    const artworkStream = findEmbeddedArtworkStream(parsed.streams ?? []);
    const embeddedArtworkPath = artworkStream
      ? await this.mediaPreviewResolver.extractEmbeddedArtwork(
          filePath,
          artworkStream.index,
          fileStats.mtimeMs,
          ffmpegPath,
        )
      : null;
    const extracted = extractMusicMetadata(
      parsed,
      relativePath,
      Boolean(embeddedArtworkPath),
      Boolean(sidecarArtworkPath),
    );
    const metadata: MusicMetadata = {
      artist: extracted.artist,
      album: extracted.album,
      albumArtist: extracted.albumArtist,
      trackNumber: extracted.trackNumber,
      discNumber: extracted.discNumber,
      genre: extracted.genre,
      artworkKind: extracted.artworkKind,
    };
    return { embeddedArtworkPath, extracted, metadata };
  }

  private resolveIdentity(
    fileName: string,
    relativePath: string,
    libraryType: MediaLibraryType,
    hint: MediaProbeHint | undefined,
    nfo: NfoMetadata | null,
  ): ScannerIdentity {
    const filename = parseSeasonEpisode(fileName, relativePath);
    const seasonEpisode =
      nfo?.seasonNumber != null || nfo?.episodeNumber != null
        ? {
            seasonNumber: nfo.seasonNumber ?? filename.seasonNumber,
            episodeNumber: nfo.episodeNumber ?? filename.episodeNumber,
          }
        : filename;
    if (libraryType === 'music') {
      return { mediaType: 'other', seasonNumber: null, episodeNumber: null };
    }
    const guessed = guessType(relativePath, seasonEpisode);
    const hinted = hint?.mediaType;
    const mediaType =
      hinted === 'movie' || hinted === 'show' || hinted === 'other'
        ? hinted
        : guessed;
    return {
      mediaType,
      seasonNumber: mediaType === 'show' ? seasonEpisode.seasonNumber : null,
      episodeNumber: mediaType === 'show' ? seasonEpisode.episodeNumber : null,
    };
  }

  private resolveHintedTitle(
    fileName: string,
    hint: MediaProbeHint | undefined,
    nfo: NfoMetadata | null,
    music: ScannerMusicEnrichment['extracted'],
  ): string {
    const nfoTitle = (nfo?.showTitle ?? nfo?.title)?.trim() || null;
    return (
      (music?.title ?? nfoTitle ?? hint?.title?.trim()) ||
      hint?.normalizedTitle?.trim() ||
      cleanTitle(fileName)
    );
  }

  private resolveReleaseYear(
    fileName: string,
    hint: MediaProbeHint | undefined,
    nfo: NfoMetadata | null,
    music: ScannerMusicEnrichment['extracted'],
  ): number | null {
    const hinted =
      typeof hint?.releaseYear === 'number' && Number.isFinite(hint.releaseYear)
        ? Math.floor(hint.releaseYear)
        : null;
    return (
      music?.releaseYear ?? nfo?.year ?? parseReleaseYear(fileName) ?? hinted
    );
  }

  private async lookupRemoteEnrichment(
    libraryType: MediaLibraryType,
    hint: MediaProbeHint | undefined,
    hintTags: string[],
    title: string,
    mediaType: MediaItem['type'],
    releaseYear: number | null,
    relativePath: string,
  ): Promise<ScannerRemoteEnrichment> {
    const hasHintEnrichment = this.hasMetadataHint(hint, hintTags);
    if (libraryType !== 'video' || hasHintEnrichment) {
      return {
        metadata: null,
        tmdbSeriesCatalogId: null,
        jikanSeriesCatalogId: null,
      };
    }
    const tmdb = await this.tmdbMetadataService.lookup({
      title,
      mediaType,
      releaseYear,
    });
    const jikan = await this.lookupJikanFallback(
      tmdb,
      relativePath,
      mediaType,
      title,
      releaseYear,
    );
    const catalogIds = this.resolveSeriesCatalogIds(mediaType, tmdb, jikan);
    return {
      metadata: tmdb ?? jikan,
      ...catalogIds,
    };
  }

  private hasMetadataHint(
    hint: MediaProbeHint | undefined,
    tags: string[],
  ): boolean {
    return (
      tags.length > 0 ||
      Boolean(hint?.description?.trim()) ||
      Boolean(hint?.posterUrl?.trim()) ||
      Boolean(hint?.backdropUrl?.trim())
    );
  }

  private async lookupJikanFallback(
    tmdb: TmdbLookupResult | null,
    relativePath: string,
    mediaType: MediaItem['type'],
    title: string,
    releaseYear: number | null,
  ): Promise<JikanLookupResult | null> {
    if (tmdb || !shouldUseJikanFallback(relativePath, mediaType, title)) {
      return null;
    }
    return this.jikanMetadataService.lookup({ title, releaseYear });
  }

  private resolveSeriesCatalogIds(
    mediaType: MediaItem['type'],
    tmdb: TmdbLookupResult | null,
    jikan: JikanLookupResult | null,
  ): Pick<
    ScannerRemoteEnrichment,
    'tmdbSeriesCatalogId' | 'jikanSeriesCatalogId'
  > {
    if (mediaType !== 'show') {
      return { tmdbSeriesCatalogId: null, jikanSeriesCatalogId: null };
    }
    return {
      tmdbSeriesCatalogId: tmdb?.providerId ?? null,
      jikanSeriesCatalogId:
        jikan?.mediaType === 'show' ? jikan.providerId : null,
    };
  }

  private warmSeriesCatalogs(remote: ScannerRemoteEnrichment): void {
    if (remote.tmdbSeriesCatalogId) {
      this.tmdbMetadataService.warmSeriesEpisodeCatalog(
        remote.tmdbSeriesCatalogId,
      );
    }
    if (remote.jikanSeriesCatalogId) {
      this.jikanMetadataService.warmSeriesEpisodeCatalog(
        remote.jikanSeriesCatalogId,
      );
    }
  }

  private resolveTags(
    libraryType: MediaLibraryType,
    music: ScannerMusicEnrichment['extracted'],
    hintTags: string[],
    remote: ScannerRemoteEnrichment['metadata'],
    nfo: NfoMetadata | null,
  ): string[] {
    if (libraryType === 'music' && music?.genre)
      return normalizeTags([music.genre]);
    if (hintTags.length > 0) return normalizeTags(hintTags);
    if (remote?.tags?.length) return normalizeTags(remote.tags);
    return normalizeTags(nfo?.genres ?? null);
  }

  private resolveEpisodeTitle(
    mediaType: MediaItem['type'],
    nfo: NfoMetadata | null,
    parsed: FfprobePayload,
    title: string,
  ): string | null {
    if (mediaType !== 'show') return null;
    return normalizeEpisodeTitle(
      nfo?.episodeTitle ?? extractEpisodeTitleFromTags(parsed.format?.tags),
      title,
    );
  }

  private async resolveArtwork(
    filePath: string,
    libraryType: MediaLibraryType,
    durationSeconds: number,
    fileStats: Stats,
    ffmpegPath: string,
    captureCount: number,
    chapterMarkers: ReturnType<typeof normalizeFfprobeChapterMarkers>,
    hint: MediaProbeHint | undefined,
    remote: ScannerRemoteEnrichment['metadata'],
    embeddedArtworkPath: string | null,
    sidecarPreviewPath: string | null,
  ): Promise<ScannerArtwork> {
    if (libraryType === 'music') {
      const previewImagePath = embeddedArtworkPath ?? sidecarPreviewPath;
      return {
        previewImagePath,
        backdropImagePath: previewImagePath,
        chapterThumbnails: [],
      };
    }
    const chapterThumbnails =
      await this.mediaPreviewResolver.generateChapterThumbnails(
        filePath,
        durationSeconds,
        fileStats.mtimeMs,
        ffmpegPath,
        captureCount,
        chapterMarkers,
      );
    const posterSource = hint?.posterUrl?.trim() || remote?.posterUrl || null;
    const backdropSource =
      hint?.backdropUrl?.trim() || remote?.backdropUrl || null;
    const [downloadedPoster, downloadedBackdrop] = await Promise.all([
      this.downloadPoster(posterSource, filePath),
      this.downloadBackdrop(backdropSource, filePath),
    ]);
    const previewImagePath =
      this.mediaPreviewResolver.selectBestPreviewImagePath(
        sidecarPreviewPath,
        downloadedPoster || posterSource,
        chapterThumbnails,
      );
    const backdropImagePath =
      this.mediaPreviewResolver.selectBestBackdropImagePath(
        downloadedBackdrop || backdropSource,
        chapterThumbnails,
        sidecarPreviewPath,
      );
    return { previewImagePath, backdropImagePath, chapterThumbnails };
  }

  private downloadPoster(
    source: string | null,
    filePath: string,
  ): Promise<string | null> {
    return source
      ? this.mediaPreviewResolver.downloadPosterThumbnail(source, filePath)
      : Promise.resolve(null);
  }

  private downloadBackdrop(
    source: string | null,
    filePath: string,
  ): Promise<string | null> {
    return source
      ? this.mediaPreviewResolver.downloadBackdropThumbnail(source, filePath)
      : Promise.resolve(null);
  }

  private resolveDescription(
    sidecar: string | null,
    hint: MediaProbeHint | undefined,
    remote: ScannerRemoteEnrichment['metadata'],
  ): string | null {
    return (sidecar ?? hint?.description?.trim()) || remote?.overview || null;
  }

  private digitalMediaType(libraryType: MediaLibraryType): 'audio' | 'video' {
    return libraryType === 'music' ? 'audio' : 'video';
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
