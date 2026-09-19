import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';

export interface PlaybackActivitySnapshot {
  activePlaybackCount: number;
  draining: boolean;
}

interface PlaybackActivityEntry {
  inFlightResponses: number;
  lastSeenAtMs: number;
}

@Injectable()
export class PlaybackActivityService {
  private static readonly PLAYBACK_IDLE_GRACE_MS = 15_000;

  private readonly entries = new Map<string, PlaybackActivityEntry>();
  private draining = false;

  beginDrain(): void {
    this.draining = true;
  }

  cancelDrain(): void {
    this.draining = false;
  }

  assertCanStartPlayback(): void {
    if (this.draining) {
      throw new ServiceUnavailableException(
        'Yeen is draining active playback for a graceful restart.',
      );
    }
  }

  assertCanContinuePlayback(key: string): void {
    this.prune();
    if (this.draining && !this.entries.has(key)) {
      throw new ServiceUnavailableException(
        'Yeen is draining active playback for a graceful restart.',
      );
    }
  }

  trackResponse(key: string, response: Response): void {
    const entry = this.touch(key);
    entry.inFlightResponses += 1;

    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      const current = this.entries.get(key);
      if (!current) {
        return;
      }
      current.inFlightResponses = Math.max(0, current.inFlightResponses - 1);
      current.lastSeenAtMs = Date.now();
    };

    response.once('finish', release);
    response.once('close', release);
  }

  touch(key: string): PlaybackActivityEntry {
    const existing = this.entries.get(key);
    if (existing) {
      existing.lastSeenAtMs = Date.now();
      return existing;
    }

    const created: PlaybackActivityEntry = {
      inFlightResponses: 0,
      lastSeenAtMs: Date.now(),
    };
    this.entries.set(key, created);
    return created;
  }

  getSnapshot(nowMs = Date.now()): PlaybackActivitySnapshot {
    this.prune(nowMs);
    return {
      activePlaybackCount: this.entries.size,
      draining: this.draining,
    };
  }

  private prune(nowMs = Date.now()): void {
    for (const [key, entry] of this.entries.entries()) {
      if (
        entry.inFlightResponses === 0 &&
        nowMs - entry.lastSeenAtMs >
          PlaybackActivityService.PLAYBACK_IDLE_GRACE_MS
      ) {
        this.entries.delete(key);
      }
    }
  }
}
