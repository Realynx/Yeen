import { BadRequestException } from '@nestjs/common';
import { basename, dirname, extname, relative, sep } from 'node:path';
import { stat } from 'node:fs/promises';
import { detectFromFilenameAndPath } from '../../../infrastructure/helpers/filename-metadata';
import type { TorrentFileHint } from '../../../../torrent/application/services/torrent.service';
import type { MediaItem } from '../../../domain/entities/media-item.entity';
import type { MediaProbeHint } from '../scanner/media-scanner.service';
import { arePathsEquivalentValue } from './torrent-file-path.helpers';

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
    getTorrentPaths(hash: string): Promise<{ savePath: string | null; contentPath: string | null }>;
    getTorrentFiles(hash: string): Promise<Array<{ name: string; size: number }>>;
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
    probeFile(filePath: string, libraryRoot: string, probeHint?: MediaProbeHint): Promise<MediaItem>;
  };
  fileExists(filePath: string): Promise<boolean>;
  tryTorrentRead<T>(hash: string, phase: 'paths' | 'files', read: () => Promise<T>): Promise<T | null>;
  mergeTorrentFileHints(
    qbFiles: Array<{ name: string; size: number }>,
    hintedFiles: TorrentFileHint[],
  ): Array<{ name: string; size: number }>;
  rankTorrentVideoCandidates(files: Array<{ name: string; size: number }>): Array<{ name: string; size: number }>;
  findIndexedMediaByFilePathCandidates(absoluteFileCandidates: string[]): Promise<MediaItem | null>;
  findAllocatedTorrentFileCandidate(absoluteFileCandidates: string[]): Promise<{
    canonicalPath: string;
    probePath: string;
    fileStats: import('node:fs').Stats;
  } | null>;
  shouldAttemptFallbackWalk(hash: string, minIntervalMs: number): boolean;
  collectTorrentSearchRoots(input: { savePath: string; contentPath: string | null }): string[];
  discoverTorrentFileByWalk(
    searchRoots: string[],
    expectedBasename: string,
  ): Promise<{ canonicalPath: string; probePath: string; fileStats: import('node:fs').Stats } | null>;
  resolveLibraryRootForFile(absoluteFilePath: string, fallbackRoot: string): Promise<string>;
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
): Promise<{ status: 'indexed'; media: MediaItem } | { status: 'pending'; reason: string }> {
  const normalizedHash = hash.trim();
  if (!normalizedHash) {
    throw new BadRequestException('Torrent hash is required.');
  }

  const previouslyIndexed = await context.torrentMediaIndexStore.get(normalizedHash);
  if (previouslyIndexed) {
    const cachedMedia = await context.mediaStore.findById(previouslyIndexed.mediaId);
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

  const torrentPaths = await context.tryTorrentRead(normalizedHash, 'paths', () =>
    context.torrentService.getTorrentPaths(normalizedHash),
  );
  if (!torrentPaths) {
    return { status: 'pending', reason: context.torrentUnavailableReason };
  }

  const savePath = torrentPaths.savePath ?? (torrentPaths.contentPath ? dirname(torrentPaths.contentPath) : null);
  if (!savePath) {
    return { status: 'pending', reason: 'qBittorrent has not assigned a save path to this torrent yet.' };
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
    return { status: 'pending', reason: 'qBittorrent has not reported any files for this torrent yet.' };
  }

  const videoExtensions = new Set(['.mp4', '.m4v', '.mkv', '.mov', '.avi', '.webm']);
  const candidateFiles = context.rankTorrentVideoCandidates(
    files.filter((file) => videoExtensions.has(extname(file.name).toLowerCase())),
  );
  if (candidateFiles.length === 0) {
    return { status: 'pending', reason: 'No playable video file detected inside the torrent.' };
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
          ? mediaHint.tags.filter((tag): tag is string => typeof tag === 'string')
          : undefined,
      }
    : titleHint
      ? { title: titleHint, normalizedTitle: titleHint }
      : undefined;

  const indexedByFilePath = new Map<string, MediaItem>();
  let primaryReadyMedia: MediaItem | null = null;
  let primaryPendingReason: string | null = null;

  for (let i = 0; i < candidateFiles.length; i += 1) {
    const candidate = candidateFiles[i];
    const isPrimaryCandidate = i === 0;
    const candidateBaseName = basename(candidate.name);
    const candidateFileName = basename(candidate.name, extname(candidate.name));
    const candidateDetection = detectFromFilenameAndPath(candidateFileName, candidate.name);

    const absoluteFileCandidates = context.mediaPathResolver.buildTorrentAbsoluteFileCandidates({
      savePath,
      contentPath: torrentPaths.contentPath,
      torrentRelativePath: candidate.name,
    });

    const existing = await context.findIndexedMediaByFilePathCandidates(absoluteFileCandidates);
    if (existing) {
      if (isPrimaryCandidate) {
        const existingStats = await stat(existing.filePath).catch(() => null);
        if (!existingStats || !existingStats.isFile()) {
          primaryPendingReason = 'Waiting for the first episode file to become readable on disk.';
          continue;
        }

        const existingHeader = await context.readFileHeader(existing.filePath, 16);
        const existingHeaderScore = context.scoreMediaHeader(existingHeader, existingStats.size);
        if (existingHeaderScore < 100) {
          primaryPendingReason =
            existingHeader === null
              ? 'Waiting for the first episode file to become readable on disk.'
              : existingHeaderScore <= 0
                ? 'Waiting for the downloader to flush the first episode piece to disk.'
                : 'Waiting for a recognizable video container header to appear at the start of the first episode.';
          continue;
        }
      }

      indexedByFilePath.set(existing.filePath.toLowerCase(), existing);
      if (isPrimaryCandidate) primaryReadyMedia = existing;
      continue;
    }

    let allocated = await context.findAllocatedTorrentFileCandidate(absoluteFileCandidates);

    if (!allocated && context.shouldAttemptFallbackWalk(normalizedHash, 10_000)) {
      const searchRoots = context.collectTorrentSearchRoots({
        savePath,
        contentPath: torrentPaths.contentPath,
      });
      const discovered = await context.discoverTorrentFileByWalk(searchRoots, candidateBaseName);

      if (discovered) {
        context.logger.log(
          `Discovered torrent file via fallback walk: ${discovered.probePath} (expected basename ${candidateBaseName})`,
        );
        allocated = discovered;
      }
    }

    if (!allocated) {
      if (isPrimaryCandidate) {
        context.logger.warn(
          `Torrent file not yet allocated on disk. hash=${normalizedHash} savePath=${savePath} contentPath=${torrentPaths.contentPath ?? '(none)'} expected=${candidate.name} candidates=${JSON.stringify(absoluteFileCandidates)}`,
        );
        primaryPendingReason =
          'Waiting for qBittorrent to allocate the first episode on disk. If this keeps happening, check qBittorrent path mapping in Settings -> System.';
      }
      continue;
    }

    let { canonicalPath, probePath, fileStats } = allocated;
    const libraryRoot = await context.resolveLibraryRootForFile(canonicalPath, savePath);

    const upsertProvisional = async (): Promise<MediaItem> => {
      const provisional = context.buildProvisionalTorrentMediaItem({
        canonicalPath,
        libraryRoot,
        fileSizeBytes: fileStats.size,
        fallbackTitle: candidateFileName,
        probeHint,
        relativePathHint: candidate.name,
        mediaTypeHint: candidateDetection.suggestedType,
        seasonNumberHint: candidateDetection.seasonNumber,
        episodeNumberHint: candidateDetection.episodeNumber,
        episodeTitleHint: candidateDetection.episodeTitle,
      });
      await context.mediaStore.upsert(provisional);
      const stored = await context.mediaStore.findByFilePath(canonicalPath);
      return stored ?? provisional;
    };

    const minBytesForProbe = Math.min(
      candidate.size > 0 ? Math.max(4 * 1024 * 1024, candidate.size * 0.01) : 4 * 1024 * 1024,
      32 * 1024 * 1024,
    );
    if (fileStats.size < minBytesForProbe) {
      if (isPrimaryCandidate) {
        primaryPendingReason = `Waiting for enough of the first episode to download (${fileStats.size} / ~${Math.round(minBytesForProbe)} bytes).`;
        continue;
      }

      const provisional = await upsertProvisional();
      indexedByFilePath.set(canonicalPath.toLowerCase(), provisional);
      continue;
    }

    let headerBytes = await context.readFileHeader(probePath, 16);
    let headerScore = context.scoreMediaHeader(headerBytes, fileStats.size);

    if (headerScore <= 0 && context.shouldAttemptFallbackWalk(normalizedHash, 10_000)) {
      const searchRoots = context.collectTorrentSearchRoots({
        savePath,
        contentPath: torrentPaths.contentPath,
      });
      const discovered = await context.discoverTorrentFileByWalk(searchRoots, candidateBaseName);
      if (discovered && !arePathsEquivalentValue(discovered.probePath, probePath)) {
        const discoveredHeaderBytes = await context.readFileHeader(discovered.probePath, 16);
        const discoveredHeaderScore = context.scoreMediaHeader(
          discoveredHeaderBytes,
          discovered.fileStats.size,
        );
        if (discoveredHeaderScore > headerScore) {
          context.logger.log(
            `Switched torrent probe path for ${normalizedHash} to ${discovered.probePath} (previous ${probePath} score=${headerScore}, discovered score=${discoveredHeaderScore}).`,
          );
          canonicalPath = discovered.canonicalPath;
          probePath = discovered.probePath;
          fileStats = discovered.fileStats;
          headerBytes = discoveredHeaderBytes;
          headerScore = discoveredHeaderScore;
        }
      }
    }

    if (headerScore < 100) {
      await context.logHeadGateDiagnostic({
        hash: normalizedHash,
        probePath,
        headerBytes,
        headerScore,
        fileSize: fileStats.size,
      });

      if (isPrimaryCandidate) {
        primaryPendingReason =
          headerBytes === null
            ? 'Waiting for the first episode file to become readable on disk.'
            : headerScore <= 0
              ? 'Waiting for the downloader to flush the first episode piece to disk.'
              : 'Waiting for a recognizable video container header to appear at the start of the first episode.';
        continue;
      }

      const provisional = await upsertProvisional();
      indexedByFilePath.set(canonicalPath.toLowerCase(), provisional);
      continue;
    }

    let probed: MediaItem;
    try {
      probed = await context.scanner.probeFile(probePath, libraryRoot, probeHint);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      context.logger.warn(`Probe failed for torrent file ${probePath}: ${message}`);

      if (headerScore > 0 && context.isRecoverableTorrentProbeError(message)) {
        if (isPrimaryCandidate) {
          primaryPendingReason =
            'Waiting for first-episode metadata probe to stabilize while the file grows.';
          continue;
        }

        const provisional = await upsertProvisional();
        indexedByFilePath.set(canonicalPath.toLowerCase(), provisional);
        context.logger.warn(
          `Using provisional torrent metadata for ${normalizedHash} at ${canonicalPath} while probe errors are recoverable.`,
        );
        continue;
      }

      const shortMessage = message.length > 220 ? `${message.slice(0, 220)}…` : message;
      if (isPrimaryCandidate) {
        primaryPendingReason = `Video header is not yet readable; waiting for more data. (probe: ${shortMessage})`;
      }
      continue;
    }

    if (!Number.isFinite(probed.durationSeconds) || probed.durationSeconds <= 0) {
      if (isPrimaryCandidate) {
        primaryPendingReason =
          'Probed first episode does not yet expose a duration; waiting for more data.';
        continue;
      }

      const provisional = await upsertProvisional();
      indexedByFilePath.set(canonicalPath.toLowerCase(), provisional);
      continue;
    }

    if (probePath !== canonicalPath) {
      probed.filePath = canonicalPath;
      probed.relativePath = relative(libraryRoot, canonicalPath)
        .split(sep)
        .join('/');
      probed.extension = extname(canonicalPath).toLowerCase();
    }

    await context.mediaStore.upsert(probed);
    const stored = await context.mediaStore.findByFilePath(canonicalPath);
    const result = stored ?? probed;
    indexedByFilePath.set(canonicalPath.toLowerCase(), result);

    if (isPrimaryCandidate) {
      primaryReadyMedia = result;
    }
  }

  if (primaryReadyMedia) {
    await context.rememberTorrentMediaMapping(normalizedHash, primaryReadyMedia);
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
    reason: 'Waiting for the first episode in this torrent to become readable on disk.',
  };
}
