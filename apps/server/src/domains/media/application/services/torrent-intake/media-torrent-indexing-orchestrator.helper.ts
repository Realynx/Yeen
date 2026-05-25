import { BadRequestException } from '@nestjs/common';
import { dirname, extname } from 'node:path';
import type { TorrentFileHint } from '../../../../torrent/application/services/torrent.service';
import type { MediaItem } from '../../../domain/entities/media-item.entity';
import type { MediaProbeHint } from '../scanner/media-scanner.service';
import { resolvePrimaryTorrentMediaValue } from './media-torrent-indexing-candidate.helper';

export interface MediaTorrentIndexingContext {
  torrentUnavailableReason: string;
  logger: { warn(message: string): void; log(message: string): void };
  mediaStore: {
    findById(id: string): Promise<MediaItem | null | undefined>;
    findByFilePath(filePath: string): Promise<MediaItem | null | undefined>;
    upsert(media: MediaItem): Promise<void>;
  };
  torrentMediaIndexStore: {
    get(hash: string): Promise<{ mediaId: string } | null>;
    remove(hash: string): Promise<void>;
  };
  torrentService: {
    getTorrentPaths(
      hash: string,
    ): Promise<{ savePath: string | null; contentPath: string | null }>;
    getTorrentFiles(
      hash: string,
    ): Promise<Array<{ name: string; size: number }>>;
    getKnownTorrentFiles(hash: string): Promise<TorrentFileHint[]>;
    getKnownTorrentTitleHint(hash: string): Promise<string | null>;
    getKnownTorrentMediaHint(hash: string): Promise<{
      title?: string | null;
      normalizedTitle?: string | null;
      mediaType?: 'movie' | 'show' | 'other' | null;
      releaseYear?: number | null;
      tags?: string[] | null;
      description?: string | null;
    } | null>;
  };
  mediaPathResolver: {
    buildTorrentAbsoluteFileCandidates(input: {
      savePath: string;
      contentPath: string | null;
      torrentRelativePath: string;
    }): string[];
  };
  scanner: {
    probeFile(
      filePath: string,
      libraryRoot: string,
      probeHint?: MediaProbeHint,
    ): Promise<MediaItem>;
  };
  fileExists(filePath: string): Promise<boolean>;
  tryTorrentRead<T>(
    hash: string,
    phase: 'paths' | 'files',
    read: () => Promise<T>,
  ): Promise<T | null>;
  mergeTorrentFileHints(
    qbFiles: Array<{ name: string; size: number }>,
    hintedFiles: TorrentFileHint[],
  ): Array<{ name: string; size: number }>;
  rankTorrentVideoCandidates(
    files: Array<{ name: string; size: number }>,
  ): Array<{ name: string; size: number }>;
  findIndexedMediaByFilePathCandidates(
    absoluteFileCandidates: string[],
  ): Promise<MediaItem | null>;
  findAllocatedTorrentFileCandidate(absoluteFileCandidates: string[]): Promise<{
    canonicalPath: string;
    probePath: string;
    fileStats: import('node:fs').Stats;
  } | null>;
  shouldAttemptFallbackWalk(hash: string, minIntervalMs: number): boolean;
  collectTorrentSearchRoots(input: {
    savePath: string;
    contentPath: string | null;
  }): string[];
  discoverTorrentFileByWalk(
    searchRoots: string[],
    expectedBasename: string,
  ): Promise<{
    canonicalPath: string;
    probePath: string;
    fileStats: import('node:fs').Stats;
  } | null>;
  resolveLibraryRootForFile(
    absoluteFilePath: string,
    fallbackRoot: string,
  ): Promise<string>;
  buildProvisionalTorrentMediaItem(input: {
    canonicalPath: string;
    libraryRoot: string;
    fileSizeBytes: number;
    fallbackTitle: string;
    probeHint?: MediaProbeHint;
    relativePathHint?: string;
    mediaTypeHint?: 'show' | 'other' | null;
    seasonNumberHint?: number | null;
    episodeNumberHint?: number | null;
    episodeTitleHint?: string | null;
  }): MediaItem;
  readFileHeader(filePath: string, byteCount: number): Promise<Buffer | null>;
  scoreMediaHeader(header: Buffer | null, fileSize: number): number;
  logHeadGateDiagnostic(input: {
    hash: string;
    probePath: string;
    headerBytes: Buffer | null;
    headerScore: number;
    fileSize: number;
  }): Promise<void>;
  isRecoverableTorrentProbeError(message: string): boolean;
  rememberTorrentMediaMapping(hash: string, media: MediaItem): Promise<void>;
}

export async function indexTorrentFileValue(
  context: MediaTorrentIndexingContext,
  hash: string,
): Promise<
  | { status: 'indexed'; media: MediaItem }
  | { status: 'pending'; reason: string }
> {
  const normalizedHash = hash.trim();
  if (!normalizedHash) {
    throw new BadRequestException('Torrent hash is required.');
  }

  const previouslyIndexed =
    await context.torrentMediaIndexStore.get(normalizedHash);
  if (previouslyIndexed) {
    const cachedMedia = await context.mediaStore.findById(
      previouslyIndexed.mediaId,
    );
    if (cachedMedia) {
      const stillOnDisk = await context.fileExists(cachedMedia.filePath);
      if (stillOnDisk) {
        return { status: 'indexed', media: cachedMedia };
      }
      context.logger.warn(
        `Torrent ${normalizedHash} previously indexed as ${cachedMedia.id} but file is missing on disk (${cachedMedia.filePath}); dropping mapping.`,
      );
      await context.torrentMediaIndexStore.remove(normalizedHash);
    } else {
      await context.torrentMediaIndexStore.remove(normalizedHash);
    }
  }

  const torrentPaths = await context.tryTorrentRead(
    normalizedHash,
    'paths',
    () => context.torrentService.getTorrentPaths(normalizedHash),
  );
  if (!torrentPaths) {
    return { status: 'pending', reason: context.torrentUnavailableReason };
  }

  const savePath =
    torrentPaths.savePath ??
    (torrentPaths.contentPath ? dirname(torrentPaths.contentPath) : null);
  if (!savePath) {
    return {
      status: 'pending',
      reason: 'qBittorrent has not assigned a save path to this torrent yet.',
    };
  }

  const qbFiles = await context.tryTorrentRead(normalizedHash, 'files', () =>
    context.torrentService.getTorrentFiles(normalizedHash),
  );
  if (qbFiles === null) {
    return { status: 'pending', reason: context.torrentUnavailableReason };
  }

  const files = context.mergeTorrentFileHints(
    qbFiles,
    await context.torrentService.getKnownTorrentFiles(normalizedHash),
  );
  if (files.length === 0) {
    return {
      status: 'pending',
      reason: 'qBittorrent has not reported any files for this torrent yet.',
    };
  }

  const videoExtensions = new Set([
    '.mp4',
    '.m4v',
    '.mkv',
    '.mov',
    '.avi',
    '.webm',
  ]);
  const candidateFiles = context.rankTorrentVideoCandidates(
    files.filter((file) =>
      videoExtensions.has(extname(file.name).toLowerCase()),
    ),
  );
  if (candidateFiles.length === 0) {
    return {
      status: 'pending',
      reason: 'No playable video file detected inside the torrent.',
    };
  }

  const [titleHint, mediaHint] = await Promise.all([
    context.torrentService.getKnownTorrentTitleHint(normalizedHash),
    context.torrentService.getKnownTorrentMediaHint(normalizedHash),
  ]);
  const probeHint: MediaProbeHint | undefined = mediaHint
    ? {
        ...mediaHint,
        title: mediaHint.title || titleHint || undefined,
        normalizedTitle: mediaHint.normalizedTitle || titleHint || undefined,
        tags: Array.isArray(mediaHint.tags)
          ? mediaHint.tags.filter(
              (tag): tag is string => typeof tag === 'string',
            )
          : undefined,
      }
    : titleHint
      ? { title: titleHint, normalizedTitle: titleHint }
      : undefined;

  const {
    indexedByFilePath,
    primaryReadyMedia,
    primaryPendingReason: initialPrimaryPendingReason,
  } = await resolvePrimaryTorrentMediaValue({
    context,
    normalizedHash,
    savePath,
    contentPath: torrentPaths.contentPath,
    candidateFiles,
    probeHint,
  });
  let primaryPendingReason = initialPrimaryPendingReason;

  if (primaryReadyMedia) {
    await context.rememberTorrentMediaMapping(
      normalizedHash,
      primaryReadyMedia,
    );
    return { status: 'indexed', media: primaryReadyMedia };
  }

  if (!primaryPendingReason && indexedByFilePath.size > 0) {
    primaryPendingReason =
      'Indexed additional videos from this torrent; waiting for the first episode to become stream-ready.';
  }

  if (primaryPendingReason) {
    return { status: 'pending', reason: primaryPendingReason };
  }

  return {
    status: 'pending',
    reason:
      'Waiting for the first episode in this torrent to become readable on disk.',
  };
}
