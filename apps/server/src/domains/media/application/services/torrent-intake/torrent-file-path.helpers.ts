import { dirname, resolve } from 'node:path';
import { stat } from 'node:fs/promises';

/**
 * Check if a file exists at the given path.
 */
export async function fileExistsValue(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Determine if two file paths point to the same location (case-insensitive).
 */
export function arePathsEquivalentValue(
  leftPath: string,
  rightPath: string,
): boolean {
  return resolve(leftPath).toLowerCase() === resolve(rightPath).toLowerCase();
}

/**
 * Builds the set of directories we should walk when looking for an in-progress
 * torrent file. Includes the configured save path, content path, and their
 * immediate parents so that qBittorrent's "keep incomplete torrents in a
 * separate folder" setting is covered without needing extra API calls.
 */
export function collectTorrentSearchRootsValue(input: {
  savePath: string;
  contentPath: string | null;
}): string[] {
  const roots = new Set<string>();

  const add = (candidate: string | null) => {
    if (!candidate) return;
    const resolved = resolve(candidate);
    // Skip filesystem roots like "C:\" or "/" — walking these from the cap
    // will exhaust the entry budget without ever reaching the torrent file.
    // These typically appear when qBittorrent reports a container path that
    // hasn't been remapped via system settings (e.g. "/downloads3" on
    // Windows resolves to "C:\downloads3" and its dirname is "C:\").
    const parent = dirname(resolved);
    if (parent === resolved) return;
    roots.add(resolved);
  };

  add(input.savePath);
  add(dirname(resolve(input.savePath)));

  if (input.contentPath) {
    const resolvedContent = resolve(input.contentPath);
    add(resolvedContent);
    add(dirname(resolvedContent));
  }

  return [...roots];
}
