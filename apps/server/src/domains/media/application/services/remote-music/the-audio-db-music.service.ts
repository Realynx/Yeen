import { Injectable, Logger } from '@nestjs/common';
import type { RemoteMusicResult } from '@yeen/shared-contracts';
import { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import { MetadataApiCacheStore } from '../../../infrastructure/stores/metadata-api-cache.store';

const FREE_API_KEY = '123';
const SEARCH_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_MS = 24 * 60 * 60 * 1000;
const TRENDING_CACHE_MS = 6 * 60 * 60 * 1000;
const TRENDING_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;

interface CachedResults {
  cachedAt: string;
  items: RemoteMusicResult[];
}

type AudioDbRow = Record<string, unknown>;

@Injectable()
export class TheAudioDbMusicService {
  readonly provider = 'theaudiodb';
  private readonly logger = new Logger(TheAudioDbMusicService.name);
  private nextRequestAt = 0;

  constructor(
    private readonly settingsService: SystemSettingsService,
    private readonly cache: MetadataApiCacheStore,
  ) {}

  async search(query: string, limit: number): Promise<RemoteMusicResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const settings = await this.settingsService.getSettings();
    if (!settings.theAudioDbEnabled) return [];

    const premium = Boolean(settings.theAudioDbCustomApiKey);
    const cacheKey = `${premium ? 'v2' : 'v1'}:search:${normalizedQuery.toLowerCase()}`;
    const cached = await this.readCache(cacheKey, SEARCH_CACHE_MS);
    if (cached) return cached.slice(0, limit);

    let rows: AudioDbRow[] = [];
    try {
      rows = premium
        ? await this.searchV2(normalizedQuery, settings.theAudioDbCustomApiKey)
        : await this.searchV1(normalizedQuery, FREE_API_KEY);
    } catch (error) {
      this.logger.warn(
        `TheAudioDB ${premium ? 'premium' : 'free'} search failed: ${this.errorMessage(error)}`,
      );
      if (premium) {
        try {
          rows = await this.searchV1(
            normalizedQuery,
            settings.theAudioDbCustomApiKey,
          );
        } catch (fallbackError) {
          this.logger.warn(
            `TheAudioDB v1 fallback failed: ${this.errorMessage(fallbackError)}`,
          );
        }
      }
    }

    const items = rows.map((row) => this.toResult(row)).filter(isPresent);
    await this.writeCache(cacheKey, items);
    return items.slice(0, limit);
  }

  async discover(country: string, limit: number): Promise<RemoteMusicResult[]> {
    const settings = await this.settingsService.getSettings();
    if (!settings.theAudioDbEnabled) return [];

    const normalizedCountry = country.trim().toLowerCase();
    const cacheKey = `v1:trending:${normalizedCountry}:singles`;
    const cached = await this.readCache(cacheKey, TRENDING_CACHE_MS);
    if (cached) return cached.slice(0, limit);

    const apiKey = settings.theAudioDbCustomApiKey || FREE_API_KEY;
    let rows: AudioDbRow[] = [];
    try {
      const payload = await this.requestJson(
        `https://www.theaudiodb.com/api/v1/json/${encodeURIComponent(apiKey)}/trending.php?country=${encodeURIComponent(normalizedCountry)}&type=itunes&format=singles`,
        undefined,
        Boolean(settings.theAudioDbCustomApiKey),
      );
      rows = this.rowsFrom(payload, ['trending']);
    } catch (error) {
      this.logger.warn(
        `TheAudioDB trending failed: ${this.errorMessage(error)}`,
      );
    }

    const items = rows
      .filter((row) => this.isFreshTrend(row))
      .map((row) => this.toResult(row))
      .filter(isPresent);
    await this.writeCache(cacheKey, items);
    return items.slice(0, limit);
  }

  private async searchV2(query: string, apiKey: string): Promise<AudioDbRow[]> {
    const payload = await this.requestJson(
      `https://www.theaudiodb.com/api/v2/json/search/track/${encodeURIComponent(query)}`,
      { 'X-API-KEY': apiKey },
      true,
    );
    return this.rowsFrom(payload, ['track', 'tracks', 'data']);
  }

  private async searchV1(query: string, apiKey: string): Promise<AudioDbRow[]> {
    const parsed = this.parseArtistTrackQuery(query);
    const endpoint = parsed
      ? `searchtrack.php?s=${encodeURIComponent(parsed.artist)}&t=${encodeURIComponent(parsed.track)}`
      : `track-top10.php?s=${encodeURIComponent(query)}`;
    const payload = await this.requestJson(
      `https://www.theaudiodb.com/api/v1/json/${encodeURIComponent(apiKey)}/${endpoint}`,
      undefined,
      apiKey !== FREE_API_KEY,
    );
    return this.rowsFrom(payload, ['track', 'tracks']);
  }

  private async requestJson(
    url: string,
    headers: Record<string, string> | undefined,
    premium: boolean,
  ): Promise<unknown> {
    await this.waitForRateLimit(premium ? 750 : 2500);
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json() as Promise<unknown>;
  }

  private async waitForRateLimit(intervalMs: number): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextRequestAt - now);
    this.nextRequestAt = Math.max(now, this.nextRequestAt) + intervalMs;
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private rowsFrom(payload: unknown, keys: string[]): AudioDbRow[] {
    if (!payload || typeof payload !== 'object') return [];
    const object = payload as Record<string, unknown>;
    for (const key of keys) {
      const value = object[key];
      if (Array.isArray(value)) return value.filter(isRecord);
      if (isRecord(value)) return [value];
    }
    return [];
  }

  private toResult(row: AudioDbRow): RemoteMusicResult | null {
    const title = text(row, 'strTrack', 'track', 'name');
    const artist = text(row, 'strArtist', 'artist');
    const sourceId = text(row, 'idTrack', 'id');
    if (!title || !sourceId) return null;

    const durationValue = numeric(row, 'intDuration', 'duration');
    const durationSeconds =
      durationValue === null
        ? null
        : Math.round(
            durationValue > 10_000 ? durationValue / 1000 : durationValue,
          );
    const releaseText = text(row, 'intYearReleased', 'intYear', 'dateReleased');
    const releaseYearMatch = releaseText?.match(/\b(19|20)\d{2}\b/);

    return {
      id: `remote-music:theaudiodb:${sourceId}`,
      title,
      artists: artist ? [artist] : [],
      album: text(row, 'strAlbum', 'album'),
      durationSeconds,
      releaseYear: releaseYearMatch ? Number(releaseYearMatch[0]) : null,
      artworkUrl: this.normalizeArtwork(
        text(row, 'strTrackThumb', 'strAlbumThumb'),
      ),
      externalIds: compactIds({
        theAudioDbTrackId: sourceId,
        theAudioDbAlbumId: text(row, 'idAlbum'),
        theAudioDbArtistId: text(row, 'idArtist'),
        musicBrainzTrackId: text(row, 'strMusicBrainzID', 'strTrackMBID'),
        musicBrainzAlbumId: text(row, 'strMusicBrainzAlbumID', 'strAlbumMBID'),
        musicBrainzArtistId: text(
          row,
          'strMusicBrainzArtistID',
          'strArtistMBID',
        ),
        spotifyId: text(row, 'strSpotifyID'),
        isrc: text(row, 'strISRC'),
      }),
      sources: [
        {
          provider: this.provider,
          sourceId,
          url: `https://www.theaudiodb.com/track/${encodeURIComponent(sourceId)}`,
          playable: false,
          acquirable: false,
        },
      ],
      localMediaId: null,
    };
  }

  private normalizeArtwork(value: string | null): string | null {
    if (!value || value.includes('upload_icon-transparent')) return null;
    return value;
  }

  private isFreshTrend(row: AudioDbRow): boolean {
    const dateAdded = text(row, 'dateAdded');
    if (!dateAdded) return false;
    const timestamp = Date.parse(dateAdded.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(timestamp)) return false;
    const age = Date.now() - timestamp;
    return age >= -2 * 24 * 60 * 60 * 1000 && age <= TRENDING_MAX_AGE_MS;
  }

  private parseArtistTrackQuery(
    query: string,
  ): { artist: string; track: string } | null {
    const parts = query.split(/\s+(?:-|–|—)\s+|:\s+/u);
    if (parts.length < 2) return null;
    const artist = parts.shift()?.trim() ?? '';
    const track = parts.join(' - ').trim();
    return artist && track ? { artist, track } : null;
  }

  private async readCache(
    key: string,
    maxAgeMs: number,
  ): Promise<RemoteMusicResult[] | null> {
    const cached = await this.cache.get<CachedResults>(this.provider, key, {
      maxAgeMs,
    });
    if (!cached || !Array.isArray(cached.items)) return null;
    if (cached.items.length > 0) return cached.items;
    const cachedAt = Date.parse(cached.cachedAt);
    return Number.isFinite(cachedAt) &&
      Date.now() - cachedAt <= NEGATIVE_CACHE_MS
      ? []
      : null;
  }

  private writeCache(key: string, items: RemoteMusicResult[]): Promise<void> {
    return this.cache.set(this.provider, key, {
      cachedAt: new Date().toISOString(),
      items,
    } satisfies CachedResults);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}

function isRecord(value: unknown): value is AudioDbRow {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function text(row: AudioDbRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
  }
  return null;
}

function numeric(row: AudioDbRow, ...keys: string[]): number | null {
  const value = text(row, ...keys);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function compactIds(
  values: Record<string, string | null>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
}
