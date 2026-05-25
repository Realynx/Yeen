import { stat } from 'node:fs/promises';
import { basename, extname, relative, sep } from 'node:path';
import { detectFromFilenameAndPath } from '../../../infrastructure/helpers/filename-metadata';
import type { MediaItem } from '../../../domain/entities/media-item.entity';
import type { MediaProbeHint } from '../scanner/media-scanner.service';
import { arePathsEquivalentValue } from './torrent-file-path.helpers';
import type { MediaTorrentIndexingContext } from './media-torrent-indexing-orchestrator.helper';

interface ResolvePrimaryTorrentMediaInput {
  context: MediaTorrentIndexingContext;
  normalizedHash: string;
  savePath: string;
  contentPath: string | null;
  candidateFiles: Array<{ name: string; size: number }>;
  probeHint: MediaProbeHint | undefined;
}

export interface ResolvePrimaryTorrentMediaResult {
  indexedByFilePath: Map<string, MediaItem>;
  primaryReadyMedia: MediaItem | null;
  primaryPendingReason: string | null;
}

function toPrimaryHeaderPendingReason(
  headerBytes: Buffer | null,
  headerScore: number,
): string {
  if (headerBytes === null) {
    return 'Waiting for the first episode file to become readable on disk.';
  }

  if (headerScore <= 0) {
    return 'Waiting for the downloader to flush the first episode piece to disk.';
  }

  return 'Waiting for a recognizable video container header to appear at the start of the first episode.';
}

export async function resolvePrimaryTorrentMediaValue({
  context,
  normalizedHash,
  savePath,
  contentPath,
  candidateFiles,
  probeHint,
}: ResolvePrimaryTorrentMediaInput): Promise<ResolvePrimaryTorrentMediaResult> {
  const indexedByFilePath = new Map<string, MediaItem>();
  let primaryReadyMedia: MediaItem | null = null;
  let primaryPendingReason: string | null = null;

  for (let i = 0; i < candidateFiles.length; i += 1) {
    const candidate = candidateFiles[i];
    const isPrimaryCandidate = i === 0;
    const candidateBaseName = basename(candidate.name);
    const candidateFileName = basename(candidate.name, extname(candidate.name));
    const candidateDetection = detectFromFilenameAndPath(
      candidateFileName,
      candidate.name,
    );

    const absoluteFileCandidates =
      context.mediaPathResolver.buildTorrentAbsoluteFileCandidates({
        savePath,
        contentPath,
        torrentRelativePath: candidate.name,
      });

    const existing = await context.findIndexedMediaByFilePathCandidates(
      absoluteFileCandidates,
    );
    if (existing) {
      if (isPrimaryCandidate) {
        const existingStats = await stat(existing.filePath).catch(() => null);
        if (!existingStats || !existingStats.isFile()) {
          primaryPendingReason =
            'Waiting for the first episode file to become readable on disk.';
          continue;
        }

        const existingHeader = await context.readFileHeader(
          existing.filePath,
          16,
        );
        const existingHeaderScore = context.scoreMediaHeader(
          existingHeader,
          existingStats.size,
        );
        if (existingHeaderScore < 100) {
          primaryPendingReason = toPrimaryHeaderPendingReason(
            existingHeader,
            existingHeaderScore,
          );
          continue;
        }
      }

      indexedByFilePath.set(existing.filePath.toLowerCase(), existing);
      if (isPrimaryCandidate) {
        primaryReadyMedia = existing;
      }
      continue;
    }

    let allocated = await context.findAllocatedTorrentFileCandidate(
      absoluteFileCandidates,
    );

    if (
      !allocated &&
      context.shouldAttemptFallbackWalk(normalizedHash, 10_000)
    ) {
      const searchRoots = context.collectTorrentSearchRoots({
        savePath,
        contentPath,
      });
      const discovered = await context.discoverTorrentFileByWalk(
        searchRoots,
        candidateBaseName,
      );

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
          `Torrent file not yet allocated on disk. hash=${normalizedHash} savePath=${savePath} contentPath=${contentPath ?? '(none)'} expected=${candidate.name} candidates=${JSON.stringify(absoluteFileCandidates)}`,
        );
        primaryPendingReason =
          'Waiting for qBittorrent to allocate the first episode on disk. If this keeps happening, check qBittorrent path mapping in Settings -> System.';
      }
      continue;
    }

    let { canonicalPath, probePath, fileStats } = allocated;
    const libraryRoot = await context.resolveLibraryRootForFile(
      canonicalPath,
      savePath,
    );

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
      candidate.size > 0
        ? Math.max(4 * 1024 * 1024, candidate.size * 0.01)
        : 4 * 1024 * 1024,
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

    if (
      headerScore <= 0 &&
      context.shouldAttemptFallbackWalk(normalizedHash, 10_000)
    ) {
      const searchRoots = context.collectTorrentSearchRoots({
        savePath,
        contentPath,
      });
      const discovered = await context.discoverTorrentFileByWalk(
        searchRoots,
        candidateBaseName,
      );
      if (
        discovered &&
        !arePathsEquivalentValue(discovered.probePath, probePath)
      ) {
        const discoveredHeaderBytes = await context.readFileHeader(
          discovered.probePath,
          16,
        );
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
        primaryPendingReason = toPrimaryHeaderPendingReason(
          headerBytes,
          headerScore,
        );
        continue;
      }

      const provisional = await upsertProvisional();
      indexedByFilePath.set(canonicalPath.toLowerCase(), provisional);
      continue;
    }

    let probed: MediaItem;
    try {
      probed = await context.scanner.probeFile(
        probePath,
        libraryRoot,
        probeHint,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      context.logger.warn(
        `Probe failed for torrent file ${probePath}: ${message}`,
      );

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

      const shortMessage =
        message.length > 220 ? `${message.slice(0, 220)}…` : message;
      if (isPrimaryCandidate) {
        primaryPendingReason = `Video header is not yet readable; waiting for more data. (probe: ${shortMessage})`;
      }
      continue;
    }

    if (
      !Number.isFinite(probed.durationSeconds) ||
      probed.durationSeconds <= 0
    ) {
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

  return {
    indexedByFilePath,
    primaryReadyMedia,
    primaryPendingReason,
  };
}
