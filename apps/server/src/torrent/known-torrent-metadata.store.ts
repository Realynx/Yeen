import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { JsonFileStore } from '../shared/json-file-store';
import type { TorrentFileHint, TorrentMediaHint } from './torrent.service.types';

export interface PersistedKnownTorrentMetadata {
  hash: string;
  titleHint: string | null;
  mediaHint: TorrentMediaHint | null;
  savePath: string | null;
  contentPath: string | null;
  files: TorrentFileHint[];
  updatedAtMs: number;
}

type StoreState = Record<string, PersistedKnownTorrentMetadata>;

@Injectable()
export class KnownTorrentMetadataStore extends JsonFileStore<StoreState> {
  constructor() {
    super(join(process.cwd(), 'data', 'known-torrent-metadata.json'), {});
  }

  protected parseLoadedState(value: unknown): StoreState {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const result: StoreState = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue;
      const raw = entry as Record<string, unknown>;
      const hash = typeof raw.hash === 'string' ? raw.hash : key;
      if (!hash || !/^[a-f0-9]{40}$/i.test(hash)) continue;
      const files: TorrentFileHint[] = Array.isArray(raw.files)
        ? raw.files
            .filter((file): file is Record<string, unknown> => Boolean(file) && typeof file === 'object')
            .map((file) => ({
              name: typeof file.name === 'string' ? file.name : '',
              size:
                typeof file.size === 'number' && Number.isFinite(file.size)
                  ? Math.max(0, Math.floor(file.size))
                  : 0,
            }))
            .filter((file) => file.name.length > 0)
        : [];

      const mediaHintRaw = raw.mediaHint;
      let mediaHint: TorrentMediaHint | null = null;
      if (
        mediaHintRaw &&
        typeof mediaHintRaw === 'object' &&
        !Array.isArray(mediaHintRaw)
      ) {
        const candidate = mediaHintRaw as Record<string, unknown>;
        const title =
          typeof candidate.title === 'string' ? candidate.title.trim() : '';
        const normalizedTitle =
          typeof candidate.normalizedTitle === 'string'
            ? candidate.normalizedTitle.trim()
            : '';
        const releaseYear =
          typeof candidate.releaseYear === 'number' &&
          Number.isFinite(candidate.releaseYear)
            ? Math.floor(candidate.releaseYear)
            : null;
        const mediaType =
          candidate.mediaType === 'movie' ||
          candidate.mediaType === 'show' ||
          candidate.mediaType === 'other'
            ? candidate.mediaType
            : null;
        const description =
          typeof candidate.description === 'string'
            ? candidate.description.trim() || null
            : null;
        const tags = Array.isArray(candidate.tags)
          ? candidate.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter(Boolean)
          : [];
        const posterUrl =
          typeof candidate.posterUrl === 'string'
            ? candidate.posterUrl.trim() || null
            : null;
        const backdropUrl =
          typeof candidate.backdropUrl === 'string'
            ? candidate.backdropUrl.trim() || null
            : null;
        const remoteSource =
          candidate.remoteSource === 'tmdb' || candidate.remoteSource === 'jikan'
            ? candidate.remoteSource
            : null;
        const remoteSourceId =
          typeof candidate.remoteSourceId === 'string'
            ? candidate.remoteSourceId.trim() || null
            : null;

        if (title) {
          mediaHint = {
            title,
            normalizedTitle: normalizedTitle || title,
            releaseYear,
            mediaType,
            description,
            tags,
            posterUrl,
            backdropUrl,
            remoteSource,
            remoteSourceId,
          };
        }
      }

      result[hash.toLowerCase()] = {
        hash: hash.toLowerCase(),
        titleHint: typeof raw.titleHint === 'string' ? raw.titleHint : null,
        mediaHint,
        savePath: typeof raw.savePath === 'string' ? raw.savePath : null,
        contentPath: typeof raw.contentPath === 'string' ? raw.contentPath : null,
        files,
        updatedAtMs:
          typeof raw.updatedAtMs === 'number' && Number.isFinite(raw.updatedAtMs)
            ? raw.updatedAtMs
            : Date.now(),
      };
    }

    return result;
  }

  protected defaultState(): StoreState {
    return {};
  }

  async get(hash: string): Promise<PersistedKnownTorrentMetadata | null> {
    await this.ensureLoaded();
    return this.state[hash.toLowerCase()] ?? null;
  }

  async all(): Promise<PersistedKnownTorrentMetadata[]> {
    await this.ensureLoaded();
    return Object.values(this.state);
  }

  async upsert(entry: PersistedKnownTorrentMetadata): Promise<void> {
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
}
