import {
  buildAudioEncoderArgs,
  buildSegmentFfmpegArgs,
  buildVideoEncoderArgs,
  computeKeyFrameInterval,
} from './hls-ffmpeg-args';

describe('hls-ffmpeg-args', () => {
  it('forces only the first output frame as keyframe', () => {
    const args = buildVideoEncoderArgs({
      keyFrameInterval: 96,
      preset: 'veryfast',
      crf: 22,
      maxVideoBitrateKbps: 4500,
      maxOutputHeight: 1080,
      rateControlBufferSeconds: 3,
    });

    const markerIndex = args.indexOf('-force_key_frames');
    expect(markerIndex).toBeGreaterThan(-1);
    expect(args[markerIndex + 1]).toBe('expr:eq(n,0)');
    expect(args).not.toContain('expr:gte(t,0)');
  });

  it('applies minimum safety clamps for video and audio bitrate knobs', () => {
    const videoArgs = buildVideoEncoderArgs({
      keyFrameInterval: 24,
      preset: 'medium',
      crf: 24,
      maxVideoBitrateKbps: 100,
      maxOutputHeight: 100,
      rateControlBufferSeconds: 0,
    });
    const audioArgs = buildAudioEncoderArgs({ audioBitrateKbps: 16 });

    expect(videoArgs).toContain('250k');
    expect(videoArgs).toContain('yuv420p');
    expect(audioArgs).toContain('48k');
  });

  it('builds deterministic segment ffmpeg args with timeline offset', () => {
    const args = buildSegmentFfmpegArgs({
      sourceFilePath: 'C:/media/sample.mkv',
      startSeconds: 12.345,
      durationSeconds: 4,
      audioMapSpecifier: '0:a:0?',
      videoArgs: ['-c:v', 'libx264'],
      audioArgs: ['-c:a', 'aac'],
      outputPath: 'C:/tmp/segment_00003.ts.part',
    });

    expect(args).toContain('-ss');
    expect(args).toContain('12.345');
    expect(args).toContain('-output_ts_offset');

    const offsetIndex = args.indexOf('-output_ts_offset');
    expect(args[offsetIndex + 1]).toBe('12.345');
    expect(args[args.length - 1]).toBe('C:/tmp/segment_00003.ts.part');
  });

  it('computes keyframe interval from source frame rate with fallback', () => {
    expect(computeKeyFrameInterval(23.976, 4)).toBe(96);
    expect(computeKeyFrameInterval(null, 4)).toBe(96);
    expect(computeKeyFrameInterval(1, 1)).toBe(24);
  });
});
