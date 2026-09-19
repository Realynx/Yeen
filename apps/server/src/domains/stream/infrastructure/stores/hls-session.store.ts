import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import type { ProgressivePlaybackSourceRef } from '../../../core/application/extensions/progressive-playback-source';
import type { VideoEncoder } from '../hls/hls-ffmpeg-args';

export interface HlsSession {
  sessionId: string;
  mediaId: string;
  outputDir: string;
  manifestPath: string;
  startedAt: string;
  formatVersion: number;
  mediaKind: 'video' | 'audio';
  // Inputs needed to transcode any segment on demand.
  sourceFilePath: string;
  progressiveSource: ProgressivePlaybackSourceRef | null;
  ffmpegPath: string;
  segmentSeconds: number;
  totalDurationSeconds: number;
  totalSegments: number;
  selectedAudioStreamIndex: number | null;
  maxVideoBitrateKbps: number;
  audioBitrateKbps: number;
  maxOutputHeight: number;
  audioMapSpecifier: string;
  videoEncoder: VideoEncoder;
  inputArgs: string[];
  videoArgs: string[];
  softwareNvencFallbackVideoArgs?: string[];
  cpuFallbackVideoArgs?: string[];
  audioArgs: string[];
  continuousAudio: boolean;
  keyFrameInterval: number;
  // Runtime-only counters for startup-segment self-healing.
  startSegmentRecoverableWindowStartedAtMs?: number;
  startSegmentRecoverableFailures?: number;
  lastAccessedAtMs?: number;
}

@Injectable()
export class HlsSessionStore {
  private readonly sessions = new Map<string, HlsSession>();

  findReusableByMediaId(
    mediaId: string,
    selectedAudioStreamIndex: number | null,
    maxVideoBitrateKbps: number,
    audioBitrateKbps: number,
    maxOutputHeight: number,
  ): HlsSession | undefined {
    for (const session of this.sessions.values()) {
      const matches =
        session.mediaId === mediaId &&
        session.selectedAudioStreamIndex === selectedAudioStreamIndex &&
        session.maxVideoBitrateKbps === maxVideoBitrateKbps &&
        session.audioBitrateKbps === audioBitrateKbps &&
        session.maxOutputHeight === maxOutputHeight &&
        existsSync(session.manifestPath);

      if (matches) {
        session.lastAccessedAtMs = Date.now();
        return session;
      }
    }

    return undefined;
  }

  get(sessionId: string): HlsSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessedAtMs = Date.now();
    }
    return session;
  }

  set(session: HlsSession): void {
    this.sessions.set(session.sessionId, {
      ...session,
      lastAccessedAtMs: Date.now(),
    });
  }

  delete(sessionId: string): HlsSession | undefined {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    return session;
  }

  all(): HlsSession[] {
    return [...this.sessions.values()];
  }

  deleteStale(maxIdleMs: number): HlsSession[] {
    const now = Date.now();
    const deleted: HlsSession[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const lastAccessedAtMs =
        session.lastAccessedAtMs ?? Date.parse(session.startedAt);
      if (now - lastAccessedAtMs <= maxIdleMs) {
        continue;
      }

      this.sessions.delete(sessionId);
      deleted.push(session);
    }

    return deleted;
  }
}
