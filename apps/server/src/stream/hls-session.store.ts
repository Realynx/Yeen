import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';

export interface HlsSession {
  sessionId: string;
  mediaId: string;
  outputDir: string;
  manifestPath: string;
  startedAt: string;
  formatVersion: number;
  // Inputs needed to transcode any segment on demand.
  sourceFilePath: string;
  torrentHash: string | null;
  ffmpegPath: string;
  segmentSeconds: number;
  totalDurationSeconds: number;
  totalSegments: number;
  selectedAudioStreamIndex: number | null;
  audioMapSpecifier: string;
  videoArgs: string[];
  audioArgs: string[];
  keyFrameInterval: number;
  // Runtime-only counters for startup-segment self-healing.
  startSegmentRecoverableWindowStartedAtMs?: number;
  startSegmentRecoverableFailures?: number;
}

@Injectable()
export class HlsSessionStore {
  private readonly sessions = new Map<string, HlsSession>();

  findReusableByMediaId(
    mediaId: string,
    selectedAudioStreamIndex: number | null,
  ): HlsSession | undefined {
    return [...this.sessions.values()].find(
      (session) =>
        session.mediaId === mediaId
        && session.selectedAudioStreamIndex === selectedAudioStreamIndex
        && existsSync(session.manifestPath),
    );
  }

  get(sessionId: string): HlsSession | undefined {
    return this.sessions.get(sessionId);
  }

  set(session: HlsSession): void {
    this.sessions.set(session.sessionId, session);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  all(): HlsSession[] {
    return [...this.sessions.values()];
  }
}
