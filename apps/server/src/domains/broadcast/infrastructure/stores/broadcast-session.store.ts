import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import type { BroadcastSubtitleFontPreset } from '../../domain/entities/broadcast-session.entity';
import { JsonFileStore } from '../../../core/infrastructure/shared/json-file-store';
import { BroadcastSession } from '../../domain/entities/broadcast-session.entity';

const BROADCAST_SUBTITLE_FONT_PRESETS = new Set<BroadcastSubtitleFontPreset>([
  'clear',
  'rounded',
  'mono',
  'condensed',
]);

@Injectable()
export class BroadcastSessionStore extends JsonFileStore<BroadcastSession[]> {
  constructor() {
    super(join(process.cwd(), 'data', 'broadcast-sessions.json'), []);
  }

  async getByOwner(
    ownerAccountId: string,
  ): Promise<BroadcastSession | undefined> {
    await this.ensureLoaded();
    return this.state.find(
      (session) => session.ownerAccountId === ownerAccountId,
    );
  }

  async getByShareToken(
    shareToken: string,
  ): Promise<BroadcastSession | undefined> {
    await this.ensureLoaded();
    return this.state.find((session) => session.shareToken === shareToken);
  }

  async upsert(session: BroadcastSession): Promise<BroadcastSession> {
    await this.ensureLoaded();

    const existingIndex = this.state.findIndex(
      (entry) => entry.ownerAccountId === session.ownerAccountId,
    );

    if (existingIndex >= 0) {
      this.state[existingIndex] = session;
    } else {
      this.state.push(session);
    }

    await this.queueSave();
    return session;
  }

  protected parseLoadedState(value: unknown): BroadcastSession[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const dedupedByOwner = new Map<string, BroadcastSession>();

    for (const candidate of value) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }

      const raw = candidate as Record<string, unknown>;
      const ownerAccountId = this.normalizeId(raw.ownerAccountId);
      const shareToken = this.normalizeShareToken(raw.shareToken);

      if (!ownerAccountId || !shareToken) {
        continue;
      }

      const parsed: BroadcastSession = {
        ownerAccountId,
        shareToken,
        enabled: typeof raw.enabled === 'boolean' ? raw.enabled : false,
        activePlayer:
          typeof raw.activePlayer === 'boolean' ? raw.activePlayer : false,
        createdAt: this.normalizeIsoTimestamp(raw.createdAt),
        updatedAt: this.normalizeIsoTimestamp(raw.updatedAt),
        mediaId: this.normalizeId(raw.mediaId),
        hlsSessionId: this.normalizeId(raw.hlsSessionId),
        sourceEpoch:
          this.normalizeOptionalInteger(
            raw.sourceEpoch,
            0,
            Number.MAX_SAFE_INTEGER,
          ) ?? 0,
        subtitleFileName: this.normalizeSubtitleFileName(raw.subtitleFileName),
        subtitleFontPreset: this.normalizeSubtitleFontPreset(
          raw.subtitleFontPreset,
        ),
        playbackPositionSeconds: this.normalizeSeconds(
          raw.playbackPositionSeconds,
        ),
        playbackIsPlaying:
          typeof raw.playbackIsPlaying === 'boolean'
            ? raw.playbackIsPlaying
            : false,
        playbackUpdatedAt: this.normalizeOptionalIsoTimestamp(
          raw.playbackUpdatedAt,
        ),
        playbackSyncTimestampMs: this.normalizeOptionalInteger(
          raw.playbackSyncTimestampMs,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
        selectedAudioStreamIndex: this.normalizeOptionalInteger(
          raw.selectedAudioStreamIndex,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
        maxVideoBitrateKbps: this.normalizeOptionalInteger(
          raw.maxVideoBitrateKbps,
          250,
          50000,
        ),
        audioBitrateKbps: this.normalizeOptionalInteger(
          raw.audioBitrateKbps,
          48,
          384,
        ),
        maxOutputHeight: this.normalizeOptionalInteger(
          raw.maxOutputHeight,
          240,
          2160,
        ),
      };

      const existing = dedupedByOwner.get(ownerAccountId);
      if (!existing || existing.updatedAt < parsed.updatedAt) {
        dedupedByOwner.set(ownerAccountId, parsed);
      }
    }

    return [...dedupedByOwner.values()];
  }

  protected defaultState(): BroadcastSession[] {
    return [];
  }

  private normalizeId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed.slice(0, 128);
  }

  private normalizeShareToken(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (!/^[A-Za-z0-9_-]{12,256}$/.test(trimmed)) {
      return null;
    }

    return trimmed;
  }

  private normalizeSubtitleFileName(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    // Keep this conservative: plain filename only, no path separators.
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      return null;
    }

    return trimmed.slice(0, 260);
  }

  private normalizeSubtitleFontPreset(
    value: unknown,
  ): BroadcastSubtitleFontPreset | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim() as BroadcastSubtitleFontPreset;
    if (!BROADCAST_SUBTITLE_FONT_PRESETS.has(trimmed)) {
      return null;
    }

    return trimmed;
  }

  private normalizeSeconds(value: unknown): number {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }

    return Math.max(0, parsed);
  }

  private normalizeOptionalInteger(
    value: unknown,
    min: number,
    max: number,
  ): number | null {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;

    if (!Number.isFinite(parsed)) {
      return null;
    }

    const normalized = Math.floor(parsed);
    if (normalized < min || normalized > max) {
      return null;
    }

    return normalized;
  }

  private normalizeIsoTimestamp(value: unknown): string {
    if (typeof value !== 'string') {
      return new Date().toISOString();
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return new Date().toISOString();
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isFinite(parsed)) {
      return new Date().toISOString();
    }

    return new Date(parsed).toISOString();
  }

  private normalizeOptionalIsoTimestamp(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return new Date(parsed).toISOString();
  }
}
