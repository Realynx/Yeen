import {
  buildAudioEncoderArgs,
  buildContinuousAudioHlsArgs,
  buildSegmentFfmpegArgs,
  buildVideoDecoderInputArgs,
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

  it('does not mislabel 2160p output as H.264 Level 4.1', () => {
    const args = buildVideoEncoderArgs({
      keyFrameInterval: 144,
      preset: 'veryfast',
      crf: 22,
      maxVideoBitrateKbps: 12_000,
      maxOutputHeight: 2160,
      rateControlBufferSeconds: 3,
    });

    expect(args).not.toContain('-level');
    expect(args).not.toContain('4.1');
  });

  it('keeps compatible sources in a fully GPU-resident NVENC pipeline', () => {
    const inputArgs = buildVideoDecoderInputArgs('nvidia');
    const videoArgs = buildVideoEncoderArgs({
      hardwareAcceleration: 'nvidia',
      keyFrameInterval: 72,
      preset: 'medium',
      crf: 25,
      maxVideoBitrateKbps: 10_000,
      maxOutputHeight: 1440,
      rateControlBufferSeconds: 3,
    });

    expect(inputArgs).toEqual([
      '-hwaccel',
      'cuda',
      '-hwaccel_output_format',
      'cuda',
    ]);
    expect(videoArgs).toContain('h264_nvenc');
    expect(videoArgs).toContain('p4');
    expect(videoArgs.find((arg) => arg.includes('scale_cuda='))).toContain(
      'scale_cuda=-2:1440:force_original_aspect_ratio=decrease:force_divisible_by=2',
    );
    expect(videoArgs.join(' ')).not.toContain('hwdownload');
    expect(videoArgs.join(' ')).not.toContain('p010le');
    expect(videoArgs).toContain('-cq');
    expect(videoArgs).not.toContain('libx264');
    expect(videoArgs).not.toContain('-crf');
  });

  it('builds a 10-bit-safe software conversion with NVENC fallback pipeline', () => {
    const inputArgs = buildVideoDecoderInputArgs('nvidia', 'software');
    const videoArgs = buildVideoEncoderArgs({
      hardwareAcceleration: 'nvidia',
      nvidiaInputMode: 'software',
      keyFrameInterval: 72,
      preset: 'medium',
      crf: 25,
      maxVideoBitrateKbps: 10_000,
      maxOutputHeight: 1440,
      rateControlBufferSeconds: 3,
    });

    expect(inputArgs).toEqual([]);
    expect(videoArgs).toContain('h264_nvenc');
    expect(videoArgs.find((arg) => arg.includes('scale='))).toContain(
      'scale=-2:1440:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p',
    );
    expect(videoArgs.join(' ')).not.toContain('scale_cuda');
  });

  it('builds deterministic segment ffmpeg args with timeline offset', () => {
    const args = buildSegmentFfmpegArgs({
      mediaKind: 'video',
      sourceFilePath: 'C:/media/sample.mkv',
      startSeconds: 12.345,
      durationSeconds: 4,
      audioMapSpecifier: '0:a:0?',
      inputArgs: ['-hwaccel', 'cuda'],
      videoArgs: ['-c:v', 'libx264'],
      audioArgs: ['-c:a', 'aac'],
      outputPath: 'C:/tmp/segment_00003.ts.part',
    });

    expect(args).toContain('-ss');
    expect(args).toContain('12.345');
    expect(args).toContain('-output_ts_offset');
    const firstMapIndex = args.indexOf('-map');
    expect(args.slice(firstMapIndex, firstMapIndex + 4)).toEqual([
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
    ]);
    expect(args).not.toContain('-vn');
    expect(args.indexOf('-hwaccel')).toBeLessThan(args.indexOf('-i'));

    const offsetIndex = args.indexOf('-output_ts_offset');
    expect(args[offsetIndex + 1]).toBe('12.345');
    expect(args[args.length - 1]).toBe('C:/tmp/segment_00003.ts.part');
  });

  it('builds audio-only segments without video mapping or encoder args', () => {
    const args = buildSegmentFfmpegArgs({
      mediaKind: 'audio',
      sourceFilePath: 'C:/music/sample.flac',
      startSeconds: 6,
      durationSeconds: 6,
      audioMapSpecifier: '0:1?',
      videoArgs: ['-c:v', 'libx264', '-vf', 'scale=-2:1080'],
      audioArgs: ['-c:a', 'aac', '-b:a', '192k'],
      outputPath: 'C:/tmp/segment_00001.ts.part',
    });

    expect(args).toEqual([
      '-hide_banner',
      '-loglevel',
      'error',
      '-analyzeduration',
      '50M',
      '-probesize',
      '50M',
      '-ss',
      '6.000',
      '-i',
      'C:/music/sample.flac',
      '-t',
      '6.000',
      '-fflags',
      '+genpts+discardcorrupt',
      '-err_detect',
      'ignore_err',
      '-ignore_unknown',
      '-map',
      '0:1?',
      '-vn',
      '-sn',
      '-dn',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-output_ts_offset',
      '6.000',
      '-muxpreload',
      '0',
      '-muxdelay',
      '0',
      '-avoid_negative_ts',
      'disabled',
      '-f',
      'mpegts',
      '-y',
      'C:/tmp/segment_00001.ts.part',
    ]);
    expect(args).not.toContain('0:v:0');
    expect(args).not.toContain('libx264');
  });

  it('builds one continuous audio rendition instead of restarting AAC per segment', () => {
    const args = buildContinuousAudioHlsArgs({
      sourceFilePath: 'C:/media/sample.mkv',
      audioMapSpecifier: '0:a:1?',
      audioArgs: ['-c:a', 'aac', '-b:a', '160k'],
      segmentSeconds: 4,
      segmentPattern: 'C:/tmp/audio_%05d.ts',
      manifestPath: 'C:/tmp/audio.m3u8',
    });

    expect(args).toContain('0:a:1?');
    expect(args).toContain('C:/tmp/audio_%05d.ts');
    expect(args).toContain('C:/tmp/audio.m3u8');
    expect(args).toContain('event');
    expect(args.slice(args.indexOf('-muxpreload'), args.indexOf('-f'))).toEqual(
      ['-muxpreload', '0', '-muxdelay', '0', '-avoid_negative_ts', 'disabled'],
    );
    expect(args).not.toContain('-ss');
    expect(args).not.toContain('-t');
  });

  it('omits per-segment audio when a continuous audio rendition owns it', () => {
    const args = buildSegmentFfmpegArgs({
      mediaKind: 'video',
      sourceFilePath: 'C:/media/sample.mkv',
      startSeconds: 8,
      durationSeconds: 4,
      audioMapSpecifier: '0:a:0?',
      includeAudio: false,
      videoArgs: ['-c:v', 'libx264'],
      audioArgs: ['-c:a', 'aac'],
      outputPath: 'C:/tmp/segment_00002.ts.part',
    });

    expect(args).toContain('-an');
    expect(args).not.toContain('0:a:0?');
    expect(args).not.toContain('-c:a');
  });

  it('computes keyframe interval from source frame rate with fallback', () => {
    expect(computeKeyFrameInterval(23.976, 4)).toBe(96);
    expect(computeKeyFrameInterval(null, 4)).toBe(96);
    expect(computeKeyFrameInterval(1, 1)).toBe(24);
  });
});
