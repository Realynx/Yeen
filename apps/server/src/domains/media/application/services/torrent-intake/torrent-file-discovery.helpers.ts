import type { Dirent, Stats } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { detectFromFilenameAndPath } from '../../../infrastructure/helpers/filename-metadata';
import {
  readFileHeaderValue,
  scoreMediaHeaderValue,
} from './media-header-probe.helpers';

/**
 * Depth-limited breadth-first walk that finds files whose name matches the
 * expected basename (with or without the qBittorrent .!qB in-progress
 * suffix). Keeps a hard cap on visited directories/files so a misconfigured
 * root never blocks the indexer. If multiple matches exist, we score and
 * pick the best candidate instead of returning the first directory hit.
 */
export async function discoverTorrentFileByWalkValue(
  searchRoots: string[],
  expectedBasename: string,
  logger: Logger,
): Promise<{
  canonicalPath: string;
  probePath: string;
  fileStats: Stats;
} | null> {
  const targetExact = expectedBasename.toLowerCase();
  const targetInProgress = `${targetExact}.!qb`;

  const maxDepth = 4;
  const maxEntries = 2000;
  const visited = new Set<string>();
  const matches: Array<{
    canonicalPath: string;
    probePath: string;
    fileStats: Stats;
  }> = [];
  const seenMatches = new Set<string>();

  interface Frame {
    directoryPath: string;
    depth: number;
  }

  const queue: Frame[] = searchRoots.map((directoryPath) => ({
    directoryPath,
    depth: 0,
  }));
  let entriesSeen = 0;

  while (queue.length > 0) {
    const frame = queue.shift();
    if (!frame) break;

    const directoryKey = frame.directoryPath.toLowerCase();
    if (visited.has(directoryKey)) continue;
    visited.add(directoryKey);

    let entries: Dirent[];
    try {
      entries = await readdir(frame.directoryPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (++entriesSeen > maxEntries) {
        logger.warn(
          `Torrent file walk hit entry cap (${maxEntries}); stopping search early.`,
        );
        return null;
      }

      const entryName = entry.name;
      const entryNameLower = entryName.toLowerCase();
      const absolutePath = resolve(frame.directoryPath, entryName);

      if (entry.isFile()) {
        let matched: {
          canonicalPath: string;
          probePath: string;
          fileStats: Stats;
        } | null = null;

        if (entryNameLower === targetExact) {
          try {
            const fileStats = await stat(absolutePath);
            if (fileStats.isFile()) {
              matched = {
                canonicalPath: absolutePath,
                probePath: absolutePath,
                fileStats,
              };
            }
          } catch {
            // ignore and continue
          }
        } else if (entryNameLower === targetInProgress) {
          const canonical = absolutePath.slice(0, -'.!qB'.length);
          try {
            const fileStats = await stat(absolutePath);
            if (fileStats.isFile()) {
              matched = {
                canonicalPath: canonical,
                probePath: absolutePath,
                fileStats,
              };
            }
          } catch {
            // ignore and continue
          }
        }

        if (matched) {
          const key = matched.probePath.toLowerCase();
          if (!seenMatches.has(key)) {
            seenMatches.add(key);
            matches.push(matched);
          }
        }
      } else if (entry.isDirectory() && frame.depth < maxDepth) {
        queue.push({ directoryPath: absolutePath, depth: frame.depth + 1 });
      }
    }
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0];
  }

  let best = matches[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestMtimeMs = Number.NEGATIVE_INFINITY;

  for (const candidate of matches) {
    const header = await readFileHeaderValue(candidate.probePath, 16);
    const score = scoreMediaHeaderValue(header, candidate.fileStats.size);
    const mtimeMs = Number.isFinite(candidate.fileStats.mtimeMs)
      ? candidate.fileStats.mtimeMs
      : Number.NEGATIVE_INFINITY;

    if (
      score > bestScore ||
      (score === bestScore && mtimeMs > bestMtimeMs) ||
      (score === bestScore &&
        mtimeMs === bestMtimeMs &&
        candidate.fileStats.size > best.fileStats.size)
    ) {
      best = candidate;
      bestScore = score;
      bestMtimeMs = mtimeMs;
    }
  }

  logger.debug(
    `Fallback torrent walk found ${matches.length} matches for ${expectedBasename}; selected ${best.probePath} (score=${bestScore}).`,
  );

  return best;
}

/**
 * Rank torrent video candidates by likelihood of being the primary/first episode.
 * Prioritizes files with season/episode hints, then by size.
 */
export function rankTorrentVideoCandidatesValue(
  files: Array<{ name: string; size: number }>,
): Array<{ name: string; size: number }> {
  const ranked = files.map((file) => {
    const detection = detectFromFilenameAndPath(
      basename(file.name, extname(file.name)),
      file.name,
    );
    const hasEpisodeSignal =
      detection.seasonNumber !== null || detection.episodeNumber !== null;

    return {
      ...file,
      isExtra: detection.suggestedType === 'other',
      hasEpisodeSignal,
      seasonNumber:
        detection.seasonNumber ??
        (hasEpisodeSignal ? 1 : Number.MAX_SAFE_INTEGER),
      episodeNumber: detection.episodeNumber ?? Number.MAX_SAFE_INTEGER,
    };
  });

  ranked.sort((left, right) => {
    if (left.isExtra !== right.isExtra) {
      return left.isExtra ? 1 : -1;
    }

    if (left.hasEpisodeSignal !== right.hasEpisodeSignal) {
      return left.hasEpisodeSignal ? -1 : 1;
    }

    if (left.hasEpisodeSignal && right.hasEpisodeSignal) {
      if (left.seasonNumber !== right.seasonNumber) {
        return left.seasonNumber - right.seasonNumber;
      }
      if (left.episodeNumber !== right.episodeNumber) {
        return left.episodeNumber - right.episodeNumber;
      }
    } else if (left.size !== right.size) {
      return right.size - left.size;
    }

    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });

  return ranked.map((entry) => ({ name: entry.name, size: entry.size }));
}

/**
 * Merge qBittorrent file list with hinted files, preferring the larger size
 * when the same file is reported from both sources.
 */
export function mergeTorrentFileHintsValue(
  qbFiles: Array<{ name: string; size: number }>,
  hintedFiles: Array<{ name: string; size: number }>,
): Array<{ name: string; size: number }> {
  const merged = new Map<string, { name: string; size: number }>();

  const addEntry = (name: string, size: number) => {
    const normalizedName = name.trim().replace(/\\/g, '/');
    if (!normalizedName) {
      return;
    }

    const key = normalizedName.toLowerCase();
    const safeSize = Number.isFinite(size) ? Math.max(0, Math.floor(size)) : 0;
    const existing = merged.get(key);
    if (!existing || safeSize > existing.size) {
      merged.set(key, {
        name: normalizedName,
        size: safeSize,
      });
    }
  };

  for (const file of qbFiles) {
    addEntry(file.name, file.size);
  }

  for (const file of hintedFiles) {
    addEntry(file.name, file.size);
  }

  return [...merged.values()];
}
