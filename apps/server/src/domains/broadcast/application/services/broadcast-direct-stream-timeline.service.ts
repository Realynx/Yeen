import { Injectable } from '@nestjs/common';

export interface BroadcastDirectStreamWindow {
  startSegmentIndex: number;
  maxSegments: number;
}

interface DirectStreamClock {
  sourceEpoch: number;
  startedAtMs: number;
  startSegmentIndex: number;
  lastAccessedAtMs: number;
}

@Injectable()
export class BroadcastDirectStreamTimeline {
  private static readonly WINDOW_TARGET_SECONDS = 30;
  private static readonly MIN_WINDOW_SEGMENTS = 3;
  private static readonly STALE_CLOCK_MS = 24 * 60 * 60 * 1000;

  private readonly clocks = new Map<string, DirectStreamClock>();

  resolveWindow(
    shareToken: string,
    sourceEpoch: number,
    segmentSeconds: number,
    totalSegments: number,
    anchorPositionSeconds: number,
    nowMs: number = Date.now(),
  ): BroadcastDirectStreamWindow {
    const normalizedNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
    const normalizedEpoch =
      Number.isSafeInteger(sourceEpoch) && sourceEpoch >= 0 ? sourceEpoch : 0;
    const normalizedSegmentSeconds =
      Number.isFinite(segmentSeconds) && segmentSeconds > 0
        ? segmentSeconds
        : 1;
    const normalizedTotalSegments =
      Number.isSafeInteger(totalSegments) && totalSegments > 0
        ? totalSegments
        : 1;
    const normalizedAnchorPositionSeconds =
      Number.isFinite(anchorPositionSeconds) && anchorPositionSeconds > 0
        ? anchorPositionSeconds
        : 0;
    const windowSegments = Math.min(
      normalizedTotalSegments,
      Math.max(
        BroadcastDirectStreamTimeline.MIN_WINDOW_SEGMENTS,
        Math.ceil(
          BroadcastDirectStreamTimeline.WINDOW_TARGET_SECONDS /
            normalizedSegmentSeconds,
        ),
      ),
    );
    const maxStartSegment = Math.max(
      0,
      normalizedTotalSegments - windowSegments,
    );
    const existing = this.clocks.get(shareToken);
    const clock =
      existing &&
      existing.sourceEpoch === normalizedEpoch &&
      existing.startedAtMs <= normalizedNowMs
        ? existing
        : {
            sourceEpoch: normalizedEpoch,
            startedAtMs: normalizedNowMs,
            startSegmentIndex: Math.min(
              Math.floor(
                normalizedAnchorPositionSeconds / normalizedSegmentSeconds,
              ),
              maxStartSegment,
            ),
            lastAccessedAtMs: normalizedNowMs,
          };

    clock.lastAccessedAtMs = normalizedNowMs;
    this.clocks.set(shareToken, clock);
    this.pruneStaleClocks(normalizedNowMs);

    const elapsedSeconds = Math.max(
      0,
      (normalizedNowMs - clock.startedAtMs) / 1000,
    );
    const desiredStartSegment =
      clock.startSegmentIndex +
      Math.floor(elapsedSeconds / normalizedSegmentSeconds);

    return {
      startSegmentIndex: Math.min(desiredStartSegment, maxStartSegment),
      maxSegments: windowSegments,
    };
  }

  private pruneStaleClocks(nowMs: number): void {
    for (const [shareToken, clock] of this.clocks) {
      if (
        nowMs - clock.lastAccessedAtMs >
        BroadcastDirectStreamTimeline.STALE_CLOCK_MS
      ) {
        this.clocks.delete(shareToken);
      }
    }
  }
}
