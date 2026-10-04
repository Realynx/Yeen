import { Injectable, Logger } from '@nestjs/common';
import { isIP } from 'node:net';
import type { BroadcastViewerIpLocation } from '@yeen/shared-contracts';

interface CachedIpLocation {
  expiresAtMs: number;
  value: BroadcastViewerIpLocation | null;
}

interface IpWhoResponse {
  success?: unknown;
  city?: unknown;
  region?: unknown;
  country?: unknown;
  country_code?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  connection?: unknown;
}

const PRIVATE_IPV4_RANGES = [
  [0, 0, 255],
  [10, 0, 255],
  [127, 0, 255],
  [169, 254, 254],
  [172, 16, 31],
  [192, 168, 168],
  [100, 64, 127],
] as const;

@Injectable()
export class BroadcastIpLocationService {
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  private static readonly FAILURE_CACHE_TTL_MS = 15 * 60 * 1000;
  private static readonly REQUEST_TIMEOUT_MS = 3_500;
  private static readonly MAX_CACHE_ENTRIES = 500;

  private readonly logger = new Logger(BroadcastIpLocationService.name);
  private readonly cache = new Map<string, CachedIpLocation>();
  private readonly inflight = new Map<
    string,
    Promise<BroadcastViewerIpLocation | null>
  >();

  isPrivateAddress(ipAddress: string): boolean {
    const normalized = normalizeIpAddress(ipAddress);
    if (!normalized || isIP(normalized) === 0) return true;

    if (isIP(normalized) === 4) {
      const octets = normalized.split('.').map(Number);
      return PRIVATE_IPV4_RANGES.some(
        ([first, minimum, maximum]) =>
          octets[0] === first && octets[1] >= minimum && octets[1] <= maximum,
      );
    }

    const lower = normalized.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      /^fe[89ab]/.test(lower)
    );
  }

  async lookup(ipAddress: string): Promise<BroadcastViewerIpLocation | null> {
    const normalized = normalizeIpAddress(ipAddress);
    if (!normalized || this.isPrivateAddress(normalized)) return null;

    const nowMs = Date.now();
    const cached = this.cache.get(normalized);
    if (cached && cached.expiresAtMs > nowMs) return cached.value;

    const activeLookup = this.inflight.get(normalized);
    if (activeLookup) return activeLookup;

    const lookup = this.fetchLocation(normalized).finally(() => {
      this.inflight.delete(normalized);
    });
    this.inflight.set(normalized, lookup);
    return lookup;
  }

  private async fetchLocation(
    ipAddress: string,
  ): Promise<BroadcastViewerIpLocation | null> {
    try {
      const fields = [
        'success',
        'city',
        'region',
        'country',
        'country_code',
        'latitude',
        'longitude',
        'connection',
      ].join(',');
      const response = await fetch(
        `https://ipwho.is/${encodeURIComponent(ipAddress)}?fields=${fields}`,
        {
          signal: AbortSignal.timeout(
            BroadcastIpLocationService.REQUEST_TIMEOUT_MS,
          ),
        },
      );
      if (!response.ok) {
        throw new Error(`IP provider returned HTTP ${response.status}.`);
      }

      const payload = (await response.json()) as IpWhoResponse;
      const location = parseIpWhoLocation(payload);
      this.cacheValue(
        ipAddress,
        location,
        location
          ? BroadcastIpLocationService.CACHE_TTL_MS
          : BroadcastIpLocationService.FAILURE_CACHE_TTL_MS,
      );
      return location;
    } catch (error) {
      this.cacheValue(
        ipAddress,
        null,
        BroadcastIpLocationService.FAILURE_CACHE_TTL_MS,
      );
      this.logger.warn(
        `Unable to resolve approximate broadcast viewer location: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private cacheValue(
    ipAddress: string,
    value: BroadcastViewerIpLocation | null,
    ttlMs: number,
  ): void {
    this.cache.delete(ipAddress);
    this.cache.set(ipAddress, { value, expiresAtMs: Date.now() + ttlMs });
    while (this.cache.size > BroadcastIpLocationService.MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }
}

function normalizeIpAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith('::ffff:')) return trimmed.slice(7);
  const bracketMatch = /^\[([^\]]+)\](?::\d+)?$/.exec(trimmed);
  return bracketMatch?.[1] ?? trimmed;
}

function parseIpWhoLocation(
  payload: IpWhoResponse,
): BroadcastViewerIpLocation | null {
  if (payload.success !== true) return null;

  const connection = isRecord(payload.connection) ? payload.connection : {};
  const location: BroadcastViewerIpLocation = {
    city: asNullableText(payload.city),
    region: asNullableText(payload.region),
    country: asNullableText(payload.country),
    countryCode: asNullableText(payload.country_code),
    latitude: asNullableNumber(payload.latitude),
    longitude: asNullableNumber(payload.longitude),
    organization:
      asNullableText(connection['org']) ?? asNullableText(connection['isp']),
  };

  return Object.values(location).some((value) => value !== null)
    ? location
    : null;
}

function asNullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 160)
    : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
