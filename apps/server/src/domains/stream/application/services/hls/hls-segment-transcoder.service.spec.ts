import {
  HlsSegmentTranscoder,
  SegmentTranscodeQueueOverloadedError,
  type SegmentTranscodeRequest,
} from './hls-segment-transcoder.service';

function createRequest(
  sessionId: string,
  segmentIndex: number,
): SegmentTranscodeRequest {
  return {
    sessionId,
    segmentIndex,
    segmentPath: `${process.cwd()}\\tmp-segment-${sessionId}-${segmentIndex}.ts`,
    ffmpegPath: 'ffmpeg',
    sourceFilePath: `${process.cwd()}\\source-${sessionId}.mkv`,
    startSeconds: segmentIndex * 6,
    durationSeconds: 6,
    audioMapSpecifier: '0:a:0?',
    videoArgs: [],
    audioArgs: [],
  };
}

describe('HlsSegmentTranscoder', () => {
  it('deduplicates identical inflight jobs and rejects new jobs under overload', async () => {
    const transcoder = new HlsSegmentTranscoder();
    const internal = transcoder as unknown as {
      runFfmpeg: (request: SegmentTranscodeRequest) => Promise<void>;
      maxGlobalInflightJobs: number;
      maxSessionInflightJobs: number;
    };

    internal.runFfmpeg = () => new Promise<void>(() => undefined);
    internal.maxGlobalInflightJobs = 1;
    internal.maxSessionInflightJobs = 1;

    const first = transcoder.ensureSegment(createRequest('session-a', 0));
    const duplicate = transcoder.ensureSegment(createRequest('session-a', 0));

    expect(duplicate).toBe(first);

    expect(() => {
      transcoder.ensureSegment(createRequest('session-a', 1));
    }).toThrow(SegmentTranscodeQueueOverloadedError);

    transcoder.cancelForSession('session-a');
  });

  it('exposes inflight queue limits for stats', () => {
    const transcoder = new HlsSegmentTranscoder();
    const limits = transcoder.getQueueLimits();

    expect(limits.maxGlobalInflightJobs).toBeGreaterThan(0);
    expect(limits.maxSessionInflightJobs).toBeGreaterThan(0);
    expect(limits.overloadRetryAfterSeconds).toBeGreaterThan(0);
  });
});
