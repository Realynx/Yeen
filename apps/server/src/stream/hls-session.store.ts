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
  ffmpegPath: string;
  segmentSeconds: number;
  totalDurationSeconds: number;
  totalSegments: number;
  videoArgs: string[];
  audioArgs: string[];
  keyFrameInterval: number;
}

@Injectable()
export class HlsSessionStore {
  private readonly sessions = new Map<string, HlsSession>();

  findReusableByMediaId(mediaId: string): HlsSession | undefined {
    return [...this.sessions.values()].find(
      (session) =>
        session.mediaId === mediaId && existsSync(session.manifestPath),
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
