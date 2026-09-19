import { Injectable } from '@nestjs/common';

export const PROGRESSIVE_PLAYBACK_SOURCES = Symbol.for(
  'com.yeen.addons.progressive-playback-sources.v1',
);
export interface PlaybackMediaDescriptor {
  id: string;
  filePath: string;
}

export interface ProgressivePlaybackSourceRef {
  adapterId: string;
  sourceId: string;
  mayBePartial: boolean;
  compatibility: Record<string, string>;
}

export interface ProgressiveSegmentReadinessInput {
  filePath: string;
  segmentIndex: number;
  startSeconds: number;
  durationSeconds: number;
  totalDurationSeconds: number;
  fileSize: number;
}

export interface ProgressivePlaybackSourceAdapter {
  readonly adapterId: string;
  resolveSource(
    mediaId: string,
    filePath: string,
  ): Promise<ProgressivePlaybackSourceRef | null>;
  prioritize(source: ProgressivePlaybackSourceRef): Promise<void>;
  assertSegmentReadable(
    source: ProgressivePlaybackSourceRef,
    input: ProgressiveSegmentReadinessInput,
  ): Promise<void>;
  decoratePlaybackPlan(
    item: PlaybackMediaDescriptor,
  ): Promise<Record<string, unknown>>;
}

export class ProgressiveSourceNotReadyError extends Error {
  readonly code = 'YEEN_PROGRESSIVE_SOURCE_NOT_READY';

  constructor(message: string) {
    super(message);
    this.name = 'ProgressiveSourceNotReadyError';
  }
}

@Injectable()
export class ProgressivePlaybackSourceRegistry {
  private readonly adapters = new Map<
    string,
    ProgressivePlaybackSourceAdapter
  >();

  register(adapter: ProgressivePlaybackSourceAdapter): () => void {
    if (this.adapters.has(adapter.adapterId)) {
      throw new Error(
        `Progressive playback adapter already registered: ${adapter.adapterId}`,
      );
    }
    this.adapters.set(adapter.adapterId, adapter);
    return () => {
      if (this.adapters.get(adapter.adapterId) === adapter)
        this.adapters.delete(adapter.adapterId);
    };
  }

  async resolveSource(mediaId: string, filePath: string) {
    for (const adapter of this.adapters.values()) {
      const source = await adapter.resolveSource(mediaId, filePath);
      if (source) return source;
    }
    return null;
  }

  async prioritize(source: ProgressivePlaybackSourceRef): Promise<void> {
    await this.adapters.get(source.adapterId)?.prioritize(source);
  }

  async assertSegmentReadable(
    source: ProgressivePlaybackSourceRef,
    input: ProgressiveSegmentReadinessInput,
  ): Promise<void> {
    await this.adapters
      .get(source.adapterId)
      ?.assertSegmentReadable(source, input);
  }

  async decoratePlaybackPlan(
    item: PlaybackMediaDescriptor,
  ): Promise<Record<string, unknown>> {
    const decorations: Record<string, unknown> = {};
    for (const adapter of this.adapters.values()) {
      Object.assign(decorations, await adapter.decoratePlaybackPlan(item));
    }
    return decorations;
  }
}
