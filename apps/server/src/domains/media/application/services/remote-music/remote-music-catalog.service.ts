import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  RemoteMusicDiscoverResponse,
  RemoteMusicExternalIds,
  RemoteMusicResult,
  RemoteMusicSearchResponse,
} from '@yeen/shared-contracts';
import { RemoteMusicSourceRegistry } from '../../../../core/application/extensions/remote-music-source';
import { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import type { MediaItem } from '../../../domain/entities/media-item.entity';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import { TheAudioDbMusicService } from './the-audio-db-music.service';

export interface RemoteMusicSearchInput {
  query: string;
  limit?: number;
  page?: number;
  providers?: string[];
}

export interface RemoteMusicDiscoverInput {
  limit?: number;
  providers?: string[];
}

@Injectable()
export class RemoteMusicCatalogService {
  private readonly logger = new Logger(RemoteMusicCatalogService.name);

  constructor(
    private readonly theAudioDb: TheAudioDbMusicService,
    private readonly addonSources: RemoteMusicSourceRegistry,
    private readonly mediaStore: MediaStore,
    private readonly settingsService: SystemSettingsService,
  ) {}

  async search(
    input: RemoteMusicSearchInput,
  ): Promise<RemoteMusicSearchResponse> {
    const query = input.query.trim();
    const limit = clampInteger(input.limit, 1, 50, 20);
    const page = clampInteger(input.page, 1, 1000, 1);
    const requestedProviders = normalizeProviders(input.providers);
    if (!query) {
      return { query, page, limit, total: 0, providers: [], items: [] };
    }

    const providerLimit = Math.min(100, page * limit);
    const providers: string[] = [];
    const tasks: Array<Promise<RemoteMusicResult[]>> = [];
    if (isProviderSelected(this.theAudioDb.provider, requestedProviders)) {
      providers.push(this.theAudioDb.provider);
      tasks.push(this.theAudioDb.search(query, providerLimit));
    }

    for (const adapter of this.selectedAdapters(requestedProviders)) {
      providers.push(adapter.provider);
      tasks.push(
        adapter
          .search({ query, limit: providerLimit })
          .catch((error: unknown) => {
            this.logProviderFailure(adapter.provider, error);
            return [];
          }),
      );
    }

    const groups = await Promise.all(tasks);
    const localMusic = await this.localMusic();
    const merged = this.mergeResults(groups.flat()).map((item) =>
      this.linkLocalMedia(item, localMusic),
    );
    const offset = (page - 1) * limit;
    return {
      query,
      page,
      limit,
      total: merged.length,
      providers: unique(providers),
      items: merged.slice(offset, offset + limit),
    };
  }

  async discover(
    input: RemoteMusicDiscoverInput,
  ): Promise<RemoteMusicDiscoverResponse> {
    const settings = await this.settingsService.getSettings();
    const country = settings.theAudioDbChartCountry;
    const limit = clampInteger(input.limit, 1, 50, 10);
    const requestedProviders = normalizeProviders(input.providers);
    const providers: string[] = [];
    const tasks: Array<Promise<RemoteMusicResult[]>> = [];

    if (isProviderSelected(this.theAudioDb.provider, requestedProviders)) {
      providers.push(this.theAudioDb.provider);
      tasks.push(this.theAudioDb.discover(country, limit));
    }

    for (const adapter of this.selectedAdapters(requestedProviders)) {
      if (!adapter.discover) continue;
      providers.push(adapter.provider);
      tasks.push(
        adapter.discover({ country, limit }).catch((error: unknown) => {
          this.logProviderFailure(adapter.provider, error);
          return [];
        }),
      );
    }

    const groups = await Promise.all(tasks);
    const localMusic = await this.localMusic();
    const items = this.mergeResults(groups.flat())
      .map((item) => this.linkLocalMedia(item, localMusic))
      .slice(0, limit);
    return {
      country,
      generatedAt: new Date().toISOString(),
      providers: unique(providers),
      items,
    };
  }

  async metadataCandidates(
    mediaId: string,
    limit?: number,
  ): Promise<RemoteMusicSearchResponse> {
    const local = await this.mediaStore.findById(mediaId);
    if (!local || local.libraryType !== 'music') {
      throw new NotFoundException('Local music track not found.');
    }

    const artist = local.musicMetadata?.artist?.trim();
    const query = artist ? `${artist} - ${local.title}` : local.title;
    return this.search({
      query,
      limit,
      providers: [this.theAudioDb.provider],
    });
  }

  private selectedAdapters(requested: Set<string> | null) {
    return this.addonSources
      .list()
      .filter(
        (adapter) =>
          isProviderSelected(adapter.provider, requested) ||
          (requested?.has(adapter.adapterId.toLowerCase()) ?? false),
      );
  }

  private mergeResults(items: RemoteMusicResult[]): RemoteMusicResult[] {
    const merged: RemoteMusicResult[] = [];
    for (const item of items) {
      if (!item.title?.trim() || !Array.isArray(item.sources)) continue;
      const existing = merged.find((candidate) =>
        sameRecording(candidate, item),
      );
      if (existing) {
        mergeInto(existing, item);
      } else {
        merged.push(cloneResult(item));
      }
    }
    return merged;
  }

  private async localMusic(): Promise<MediaItem[]> {
    return (await this.mediaStore.all()).filter(
      (item) => item.libraryType === 'music',
    );
  }

  private linkLocalMedia(
    remote: RemoteMusicResult,
    localMusic: readonly MediaItem[],
  ): RemoteMusicResult {
    const match = localMusic.find((local) => localMatches(local, remote));
    return match ? { ...remote, localMediaId: match.id } : remote;
  }

  private logProviderFailure(provider: string, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.logger.warn(`Remote music provider ${provider} failed: ${message}`);
  }
}

function normalizeProviders(
  providers: string[] | undefined,
): Set<string> | null {
  const normalized =
    providers?.map((value) => value.trim().toLowerCase()).filter(Boolean) ?? [];
  return normalized.length > 0 ? new Set(normalized) : null;
}

function isProviderSelected(
  provider: string,
  requested: Set<string> | null,
): boolean {
  return !requested || requested.has(provider.toLowerCase());
}

function sameRecording(
  left: RemoteMusicResult,
  right: RemoteMusicResult,
): boolean {
  const leftIsrc = normalizeId(left.externalIds.isrc);
  const rightIsrc = normalizeId(right.externalIds.isrc);
  if (leftIsrc && rightIsrc && leftIsrc === rightIsrc) return true;

  const leftMbid = normalizeId(left.externalIds.musicBrainzTrackId);
  const rightMbid = normalizeId(right.externalIds.musicBrainzTrackId);
  if (leftMbid && rightMbid && leftMbid === rightMbid) return true;

  if (normalizeText(left.title) !== normalizeText(right.title)) return false;
  if (primaryArtist(left) !== primaryArtist(right)) return false;
  return durationsMatch(left.durationSeconds, right.durationSeconds);
}

function localMatches(local: MediaItem, remote: RemoteMusicResult): boolean {
  if (normalizeText(local.title) !== normalizeText(remote.title)) return false;
  const localArtist = normalizeText(local.musicMetadata?.artist ?? '');
  const remoteArtist = primaryArtist(remote);
  if (localArtist && remoteArtist && localArtist !== remoteArtist) return false;
  return durationsMatch(local.durationSeconds, remote.durationSeconds);
}

function durationsMatch(left: number | null, right: number | null): boolean {
  return left === null || right === null || Math.abs(left - right) <= 5;
}

function primaryArtist(result: RemoteMusicResult): string {
  return normalizeText(result.artists[0] ?? '');
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeId(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function mergeInto(
  target: RemoteMusicResult,
  incoming: RemoteMusicResult,
): void {
  target.sources = uniqueSources([...target.sources, ...incoming.sources]);
  target.externalIds = mergeIds(target.externalIds, incoming.externalIds);
  if (!target.album) target.album = incoming.album;
  if (!target.durationSeconds)
    target.durationSeconds = incoming.durationSeconds;
  if (!target.releaseYear) target.releaseYear = incoming.releaseYear;
  if (!target.artworkUrl) target.artworkUrl = incoming.artworkUrl;
  if (incoming.artists.length > target.artists.length) {
    target.artists = [...incoming.artists];
  }
  if (!target.localMediaId) target.localMediaId = incoming.localMediaId;
}

function mergeIds(
  target: RemoteMusicExternalIds,
  incoming: RemoteMusicExternalIds,
): RemoteMusicExternalIds {
  const merged = { ...incoming, ...target };
  return Object.fromEntries(
    Object.entries(merged).filter(([, value]) => Boolean(value)),
  );
}

function uniqueSources(sources: RemoteMusicResult['sources']) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.provider.toLowerCase()}:${source.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cloneResult(item: RemoteMusicResult): RemoteMusicResult {
  return {
    ...item,
    artists: [...item.artists],
    externalIds: { ...item.externalIds },
    sources: item.sources.map((source) => ({ ...source })),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
