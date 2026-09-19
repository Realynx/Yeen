import {
  HlsSegmentTranscoder,
  SegmentTranscodeCancelledError,
  SegmentTranscodeQueueOverloadedError,
  type SegmentTranscodeRequest,
} from './hls-segment-transcoder.service';

function createRequest(
  sessionId: string,
  segmentIndex: number,
  videoEncoder: 'cpu' | 'nvidia' = 'nvidia',
): SegmentTranscodeRequest {
  return {
    mediaKind: 'video',
    videoEncoder,
    sessionId,
    segmentIndex,
    segmentPath: `${process.cwd()}\\tmp-segment-${sessionId}-${segmentIndex}.ts`,
    ffmpegPath: 'ffmpeg',
    sourceFilePath: `${process.cwd()}\\source-${sessionId}.mkv`,
    startSeconds: segmentIndex * 6,
    durationSeconds: 6,
    audioMapSpecifier: '0:a:0?',
    inputArgs: [],
    videoArgs: [],
    audioArgs: [],
  };
}

describe('HlsSegmentTranscoder', () => {
  it('limits a time-window prefetch to one concurrent ffmpeg job', async () => {
    const transcoder = new HlsSegmentTranscoder();
    const pending = new Map<
      number,
      { resolve: () => void; reject: (error: Error) => void }
    >();
    const internal = transcoder as unknown as {
      runFfmpeg: (
        request: SegmentTranscodeRequest,
        registerCancel: (cancel: (reason: Error) => void) => void,
      ) => Promise<void>;
    };
    internal.runFfmpeg = (request, registerCancel) =>
      new Promise<void>((resolve, reject) => {
        pending.set(request.segmentIndex, { resolve, reject });
        registerCancel(reject);
      });

    transcoder.prefetchSegments(
      [1, 2, 3, 4].map((index) => createRequest('session-a', index)),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(transcoder.getInflightSegmentIndices('session-a')).toEqual([1]);
    pending.get(1)?.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(transcoder.getInflightSegmentIndices('session-a')).toEqual([2]);

    pending.get(2)?.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    pending.get(3)?.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    pending.get(4)?.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(transcoder.getInflightCount()).toBe(0);
  });

  it('admits only one CPU video transcode while GPU capacity remains available', async () => {
    const transcoder = new HlsSegmentTranscoder();
    const internal = transcoder as unknown as {
      runFfmpeg: (
        request: SegmentTranscodeRequest,
        registerCancel: (cancel: (reason: Error) => void) => void,
      ) => Promise<void>;
    };
    internal.runFfmpeg = (_request, registerCancel) =>
      new Promise<void>((_resolve, reject) => registerCancel(reject));

    const cpuJob = transcoder.ensureSegment(
      createRequest('cpu-session-a', 0, 'cpu'),
    );
    expect(() =>
      transcoder.ensureSegment(createRequest('cpu-session-b', 0, 'cpu')),
    ).toThrow(SegmentTranscodeQueueOverloadedError);
    expect(() =>
      transcoder.ensureSegment({
        ...createRequest('software-nvenc-session', 0, 'nvidia'),
        softwareVideoPipeline: true,
      }),
    ).toThrow(SegmentTranscodeQueueOverloadedError);

    const gpuJob = transcoder.ensureSegment(
      createRequest('gpu-session', 0, 'nvidia'),
    );
    expect(transcoder.getInflightCount()).toBe(2);

    await Promise.all([
      transcoder.cancelForSession('cpu-session-a'),
      transcoder.cancelForSession('gpu-session'),
    ]);
    await expect(cpuJob).rejects.toBeInstanceOf(SegmentTranscodeCancelledError);
    await expect(gpuJob).rejects.toBeInstanceOf(SegmentTranscodeCancelledError);
  });

  it('deduplicates identical inflight jobs and rejects new jobs under overload', async () => {
    const transcoder = new HlsSegmentTranscoder();
    const internal = transcoder as unknown as {
      runFfmpeg: (
        request: SegmentTranscodeRequest,
        registerCancel: (cancel: (reason: Error) => void) => void,
      ) => Promise<void>;
      maxGlobalInflightJobs: number;
      maxSessionInflightJobs: number;
    };

    internal.runFfmpeg = (_request, registerCancel) =>
      new Promise<void>((_resolve, reject) => {
        registerCancel(reject);
      });
    internal.maxGlobalInflightJobs = 1;
    internal.maxSessionInflightJobs = 1;

    const first = transcoder.ensureSegment(createRequest('session-a', 0));
    const duplicate = transcoder.ensureSegment(createRequest('session-a', 0));

    expect(duplicate).toBe(first);

    expect(() => {
      void transcoder.ensureSegment(createRequest('session-a', 1));
    }).toThrow(SegmentTranscodeQueueOverloadedError);

    await transcoder.cancelForSession('session-a');
    await expect(first).rejects.toBeInstanceOf(SegmentTranscodeCancelledError);
    expect(transcoder.getInflightCount()).toBe(0);
  });

  it('rejects late segment requests after a session is cancelled', async () => {
    const transcoder = new HlsSegmentTranscoder();

    await transcoder.cancelForSession('session-a');

    await expect(
      transcoder.ensureSegment(createRequest('session-a', 0)),
    ).rejects.toBeInstanceOf(SegmentTranscodeCancelledError);
  });

  it('keeps a cancelling job inflight until process termination settles', async () => {
    const transcoder = new HlsSegmentTranscoder();
    const cancellationControl: { finish?: () => void } = {};
    const internal = transcoder as unknown as {
      runFfmpeg: (
        request: SegmentTranscodeRequest,
        registerCancel: (cancel: (reason: Error) => void) => void,
      ) => Promise<void>;
    };
    internal.runFfmpeg = (_request, registerCancel) =>
      new Promise<void>((_resolve, reject) => {
        registerCancel((reason) => {
          cancellationControl.finish = () => reject(reason);
        });
      });

    const segmentPromise = transcoder.ensureSegment(
      createRequest('session-a', 0),
    );
    const cancellationPromise = transcoder.cancelForSession('session-a');

    expect(transcoder.getInflightCount()).toBe(1);
    expect(cancellationControl.finish).toBeDefined();
    cancellationControl.finish?.();
    await cancellationPromise;
    await expect(segmentPromise).rejects.toBeInstanceOf(
      SegmentTranscodeCancelledError,
    );
    expect(transcoder.getInflightCount()).toBe(0);
  });

  it('exposes inflight queue limits for stats', () => {
    const transcoder = new HlsSegmentTranscoder();
    const limits = transcoder.getQueueLimits();

    expect(limits.maxGlobalInflightJobs).toBeGreaterThan(0);
    expect(limits.maxSessionInflightJobs).toBeGreaterThan(0);
    expect(limits.maxCpuInflightJobs).toBe(1);
    expect(limits.overloadRetryAfterSeconds).toBeGreaterThan(0);
  });
});
