import { Injectable, Logger } from '@nestjs/common';
import { MetadataApiCacheStore } from './metadata-api-cache.store';

class JikanRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'JikanRateLimitError';
  }
}

interface JikanSearchResponse {
  data?: unknown[];
}

interface JikanCandidate {
  title: string;
  titlesForMatch: string[];
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  score: number | null;
}

interface JikanLookupInput {
  title: string;
  releaseYear: number | null;
}

export interface JikanLookupResult {
  title: string;
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

@Injectable()
export class JikanMetadataService {
  private readonly logger = new Logger(JikanMetadataService.name);
  private readonly cache = new Map<string, JikanLookupResult | null>();
  private readonly cacheProvider = 'jikan.anime';
  private readonly minRequestIntervalMs = 1_200;
  private readonly defaultRateLimitCooldownMs = 60_000;
  private readonly maxRateLimitCooldownMs = 5 * 60_000;
  private nextRequestAllowedAt = 0;
  private rateLimitedUntil = 0;
  private lastRateLimitWarningAt = 0;

  constructor(private readonly metadataApiCacheStore: MetadataApiCacheStore) {}

  clearLookupCache(): number {
    const clearedEntries = this.cache.size;
    this.cache.clear();
    return clearedEntries;
  }

  async lookup(input: JikanLookupInput): Promise<JikanLookupResult | null> {
    const cleanedTitle = input.title.trim();
    if (!cleanedTitle) {
      return null;
    }

    const cacheKey = this.cacheKey(cleanedTitle, input.releaseYear);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null;
    }

    if (Date.now() < this.rateLimitedUntil) {
      return null;
    }

    try {
      const result = await this.searchJikan({
        title: cleanedTitle,
        releaseYear: input.releaseYear,
      });

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      if (error instanceof JikanRateLimitError) {
        this.applyRateLimitCooldown(error.retryAfterMs, cleanedTitle);
        return null;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Jikan lookup failed for "${cleanedTitle}": ${message}`);
      this.cache.delete(cacheKey);
      return null;
    }
  }

  private async searchJikan(
    input: JikanLookupInput,
  ): Promise<JikanLookupResult | null> {
    const params = new URLSearchParams({
      q: input.title,
      limit: '10',
      sfw: 'true',
    });

    const requestKey = params.toString();
    const cachedPayload = await this.metadataApiCacheStore.get<JikanSearchResponse>(
      this.cacheProvider,
      requestKey,
    );

    let payload: JikanSearchResponse;
    if (cachedPayload !== undefined) {
      payload = cachedPayload;
    } else {
      const url = `https://api.jikan.moe/v4/anime?${params.toString()}`;
      payload = (await this.fetchJson(url, 15000)) as JikanSearchResponse;
      await this.metadataApiCacheStore.set(
        this.cacheProvider,
        requestKey,
        payload,
      );
    }

    const rawResults = Array.isArray(payload.data) ? payload.data : [];
    const candidates = rawResults
      .map((item) => this.toCandidate(item))
      .filter((candidate): candidate is JikanCandidate => candidate !== null);

    const exactCandidates = this.filterExactTitleCandidates(candidates, input);
    if (exactCandidates.length === 0) {
      return null;
    }

    const picked = this.pickBestCandidate(exactCandidates, input.releaseYear);
    return {
      title: picked.title,
      tags: picked.tags,
      overview: picked.overview,
      releaseYear: picked.releaseYear,
      posterUrl: picked.posterUrl,
      backdropUrl: picked.backdropUrl,
    };
  }

  private toCandidate(item: unknown): JikanCandidate | null {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return null;
    }

    const value = item as Record<string, unknown>;
    const titlesForMatch = this.collectTitles(value);
    if (titlesForMatch.length === 0) {
      return null;
    }

    const preferredTitle =
      this.getTitleString(value.title_english) ??
      this.getTitleString(value.title) ??
      titlesForMatch[0];

    return {
      title: preferredTitle,
      titlesForMatch,
      tags: this.extractTags(value),
      overview: this.getNullableString(value.synopsis),
      releaseYear: this.extractYear(value),
      posterUrl: this.extractPosterUrl(value),
      backdropUrl: this.extractBackdropUrl(value),
      score:
        typeof value.score === 'number' && Number.isFinite(value.score)
          ? value.score
          : null,
    };
  }

  private collectTitles(value: Record<string, unknown>): string[] {
    const titles = new Set<string>();

    this.addTitle(titles, value.title);
    this.addTitle(titles, value.title_english);
    this.addTitle(titles, value.title_japanese);

    if (Array.isArray(value.titles)) {
      for (const entry of value.titles) {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          Array.isArray(entry)
        ) {
          continue;
        }

        const title = (entry as Record<string, unknown>).title;
        this.addTitle(titles, title);
      }
    }

    return [...titles];
  }

  private addTitle(titles: Set<string>, value: unknown): void {
    if (typeof value !== 'string') {
      return;
    }

    const cleaned = value.trim();
    if (cleaned) {
      titles.add(cleaned);
    }
  }

  private extractTags(value: Record<string, unknown>): string[] {
    const tags: string[] = [];
    this.collectNamedTags(value.genres, tags);
    this.collectNamedTags(value.explicit_genres, tags);
    this.collectNamedTags(value.themes, tags);
    this.collectNamedTags(value.demographics, tags);
    return this.normalizeTags(tags);
  }

  private collectNamedTags(source: unknown, bucket: string[]): void {
    if (!Array.isArray(source)) {
      return;
    }

    for (const entry of source) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        Array.isArray(entry)
      ) {
        continue;
      }

      const name = this.getTitleString((entry as Record<string, unknown>).name);
      if (name) {
        bucket.push(name);
      }
    }
  }

  private normalizeTags(tags: string[]): string[] {
    const deduped = new Map<string, string>();

    for (const tag of tags) {
      const cleaned = tag.trim();
      if (!cleaned) {
        continue;
      }

      const key = cleaned.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, cleaned);
      }
    }

    return [...deduped.values()].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );
  }

  private filterExactTitleCandidates(
    candidates: JikanCandidate[],
    input: JikanLookupInput,
  ): JikanCandidate[] {
    const normalizedInput = this.normalizeForExactMatch(input.title);
    if (!normalizedInput) {
      return [];
    }

    return candidates.filter((candidate) => {
      const exactTitleMatch = candidate.titlesForMatch.some(
        (title) => this.normalizeForExactMatch(title) === normalizedInput,
      );
      if (!exactTitleMatch) {
        return false;
      }

      if (
        input.releaseYear &&
        candidate.releaseYear &&
        input.releaseYear !== candidate.releaseYear
      ) {
        return false;
      }

      return true;
    });
  }

  private normalizeForExactMatch(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private pickBestCandidate(
    candidates: JikanCandidate[],
    releaseYear: number | null,
  ): JikanCandidate {
    let best = candidates[0];
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      const yearScore =
        releaseYear && candidate.releaseYear
          ? releaseYear === candidate.releaseYear
            ? 0.9
            : 0
          : 0;
      const qualityScore = candidate.score ? candidate.score / 10 : 0;
      const posterScore = candidate.posterUrl ? 0.15 : 0;
      const backdropScore = candidate.backdropUrl ? 0.08 : 0;
      const detailScore = candidate.overview ? 0.08 : 0;
      const score =
        yearScore + qualityScore + posterScore + backdropScore + detailScore;

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  private getTitleString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.trim();
    return cleaned || null;
  }

  private getNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.trim();
    return cleaned || null;
  }

  private extractYear(value: Record<string, unknown>): number | null {
    if (typeof value.year === 'number' && Number.isFinite(value.year)) {
      return Math.trunc(value.year);
    }

    const aired = value.aired;
    if (
      typeof aired === 'object' &&
      aired !== null &&
      !Array.isArray(aired) &&
      typeof (aired as Record<string, unknown>).from === 'string'
    ) {
      const from = (aired as Record<string, unknown>).from as string;
      const match = from.match(/^(\d{4})/);
      if (match) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  private extractPosterUrl(value: Record<string, unknown>): string | null {
    const images =
      typeof value.images === 'object' &&
      value.images !== null &&
      !Array.isArray(value.images)
        ? (value.images as Record<string, unknown>)
        : null;

    if (!images) {
      return null;
    }

    const jpg =
      typeof images.jpg === 'object' &&
      images.jpg !== null &&
      !Array.isArray(images.jpg)
        ? (images.jpg as Record<string, unknown>)
        : null;

    const webp =
      typeof images.webp === 'object' &&
      images.webp !== null &&
      !Array.isArray(images.webp)
        ? (images.webp as Record<string, unknown>)
        : null;

    return (
      this.getTitleString(jpg?.large_image_url) ??
      this.getTitleString(jpg?.image_url) ??
      this.getTitleString(webp?.large_image_url) ??
      this.getTitleString(webp?.image_url) ??
      null
    );
  }

  private extractBackdropUrl(value: Record<string, unknown>): string | null {
    const trailer =
      typeof value.trailer === 'object' &&
      value.trailer !== null &&
      !Array.isArray(value.trailer)
        ? (value.trailer as Record<string, unknown>)
        : null;

    const images =
      trailer &&
      typeof trailer.images === 'object' &&
      trailer.images !== null &&
      !Array.isArray(trailer.images)
        ? (trailer.images as Record<string, unknown>)
        : null;

    return (
      this.getTitleString(images?.maximum_image_url) ??
      this.getTitleString(images?.large_image_url) ??
      this.getTitleString(images?.medium_image_url) ??
      this.getTitleString(images?.small_image_url) ??
      this.getTitleString(images?.image_url) ??
      null
    );
  }

  private cacheKey(title: string, releaseYear: number | null): string {
    return `${title.toLowerCase()}:${releaseYear ?? 0}`;
  }

  private async fetchJson(url: string, timeoutMs: number): Promise<unknown> {
    await this.waitForRequestWindow();

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: abortController.signal,
      });

      if (response.status === 429) {
        const raw = await response.text();
        const retryAfterMs = this.normalizeCooldownMs(
          this.parseRetryAfterMs(response.headers.get('retry-after')),
        );
        throw new JikanRateLimitError(
          `HTTP 429 from Jikan: ${raw.slice(0, 240)}`,
          retryAfterMs,
        );
      }

      if (!response.ok) {
        const raw = await response.text();
        throw new Error(
          `HTTP ${response.status} from Jikan: ${raw.slice(0, 240)}`,
        );
      }

      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async waitForRequestWindow(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextRequestAllowedAt - now);

    if (waitMs > 0) {
      await this.delay(waitMs);
    }

    this.nextRequestAllowedAt = Date.now() + this.minRequestIntervalMs;
  }

  private applyRateLimitCooldown(
    requestedCooldownMs: number,
    attemptedTitle: string,
  ): void {
    const cooldownMs = this.normalizeCooldownMs(requestedCooldownMs);
    const now = Date.now();
    this.rateLimitedUntil = Math.max(this.rateLimitedUntil, now + cooldownMs);

    const warningGapMs = 15_000;
    if (now - this.lastRateLimitWarningAt < warningGapMs) {
      return;
    }

    this.lastRateLimitWarningAt = now;
    const waitSeconds = Math.max(
      1,
      Math.ceil((this.rateLimitedUntil - now) / 1000),
    );
    this.logger.warn(
      `Jikan rate limit reached while searching "${attemptedTitle}". Pausing Jikan lookups for ~${waitSeconds}s.`,
    );
  }

  private parseRetryAfterMs(value: string | null): number | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const seconds = Number.parseInt(trimmed, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    const retryAt = Date.parse(trimmed);
    if (!Number.isFinite(retryAt)) {
      return null;
    }

    const delta = retryAt - Date.now();
    return delta > 0 ? delta : null;
  }

  private normalizeCooldownMs(value: number | null): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return this.defaultRateLimitCooldownMs;
    }

    const rounded = Math.round(value);
    return Math.max(
      this.minRequestIntervalMs,
      Math.min(this.maxRateLimitCooldownMs, rounded),
    );
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
