import { Injectable } from '@nestjs/common';
import { dirname, join, resolve } from 'node:path';
import { JsonFileStore } from '../../../core/infrastructure/shared/json-file-store';

export interface TorrentIndexEntry {
  hash: string;
  mediaId: string;
  filePath: string;
  indexedAtMs: number;
}

type StoreState = Record<string, TorrentIndexEntry>;

/**
 * Persistent mapping from torrent hash to the media record produced by indexing.
 *
 * Allows the index probe to short-circuit when the user re-adds (or never
 * removed from disk) a torrent that Yeen already indexed previously, even when
 * qBittorrent no longer knows the torrent.
 */
@Injectable()
export class TorrentMediaIndexStore extends JsonFileStore<StoreState> {
  constructor() {
    super(join(process.cwd(), 'data', 'torrent-media-index.json'), {});
  }

  protected parseLoadedState(value: unknown): StoreState {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const result: StoreState = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (!entry || typeof entry !== 'object') continue;
      const raw = entry as Record<string, unknown>;
      const hash = typeof raw.hash === 'string' ? raw.hash : key;
      if (!hash || !/^[a-f0-9]{40}$/i.test(hash)) continue;
      const mediaId = typeof raw.mediaId === 'string' ? raw.mediaId : '';
      const filePath = typeof raw.filePath === 'string' ? raw.filePath : '';
      if (!mediaId || !filePath) continue;
      result[hash.toLowerCase()] = {
        hash: hash.toLowerCase(),
        mediaId,
        filePath,
        indexedAtMs:
          typeof raw.indexedAtMs === 'number' &&
          Number.isFinite(raw.indexedAtMs)
            ? raw.indexedAtMs
            : Date.now(),
      };
    }

    return result;
  }

  protected defaultState(): StoreState {
    return {};
  }

  async get(hash: string): Promise<TorrentIndexEntry | null> {
    await this.ensureLoaded();
    return this.state[hash.toLowerCase()] ?? null;
  }

  async getByMediaId(mediaId: string): Promise<TorrentIndexEntry | null> {
    await this.ensureLoaded();
    for (const entry of Object.values(this.state)) {
      if (entry.mediaId === mediaId) {
        return entry;
      }
    }
    return null;
  }

  async getByMediaIds(
    mediaIds: readonly string[],
  ): Promise<Map<string, TorrentIndexEntry>> {
    await this.ensureLoaded();

    const requestedIds = new Set(
      mediaIds
        .map((mediaId) => mediaId.trim())
        .filter((mediaId) => mediaId.length > 0),
    );

    const matches = new Map<string, TorrentIndexEntry>();
    if (requestedIds.size === 0) {
      return matches;
    }

    for (const entry of Object.values(this.state)) {
      if (!requestedIds.has(entry.mediaId)) {
        continue;
      }

      const existing = matches.get(entry.mediaId);
      if (!existing || entry.indexedAtMs > existing.indexedAtMs) {
        matches.set(entry.mediaId, entry);
      }
    }

    return matches;
  }

  async getByRelatedFilePath(
    filePath: string,
  ): Promise<TorrentIndexEntry | null> {
    await this.ensureLoaded();
    const target = this.normalizePath(filePath);
    const targetDir = dirname(target);

    let bestMatch: TorrentIndexEntry | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const entry of Object.values(this.state)) {
      const indexedPath = this.normalizePath(entry.filePath);
      const indexedDir = dirname(indexedPath);

      let score = Number.NEGATIVE_INFINITY;
      if (indexedPath === target) {
        score = 3;
      } else if (indexedDir === targetDir) {
        score = 2;
      } else if (
        target.startsWith(`${indexedDir}/`) ||
        indexedPath.startsWith(`${targetDir}/`)
      ) {
        score = 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    return bestScore >= 1 ? bestMatch : null;
  }

  async upsert(entry: TorrentIndexEntry): Promise<void> {
    await this.ensureLoaded();
    this.state[entry.hash.toLowerCase()] = entry;
    await this.queueSave();
  }

  async remove(hash: string): Promise<void> {
    await this.ensureLoaded();
    const key = hash.toLowerCase();
    if (this.state[key]) {
      delete this.state[key];
      await this.queueSave();
    }
  }

  async removeByMediaId(mediaId: string): Promise<void> {
    await this.ensureLoaded();
    let changed = false;
    for (const [key, entry] of Object.entries(this.state)) {
      if (entry.mediaId === mediaId) {
        delete this.state[key];
        changed = true;
      }
    }
    if (changed) {
      await this.queueSave();
    }
  }

  private normalizePath(value: string): string {
    return resolve(value).replace(/\\/g, '/').toLowerCase();
  }
}
