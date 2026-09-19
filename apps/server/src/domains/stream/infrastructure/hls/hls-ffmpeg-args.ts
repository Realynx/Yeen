/**
 * Pure ffmpeg argument builders for the on-demand HLS pipeline.
 *
 * Split out from `StreamService` so encoder config is testable in isolation
 * and the transcoder doesn't need to know about `SystemSettings`.
 */

export interface VideoEncoderConfig {
  hardwareAcceleration?: VideoEncoder;
  nvidiaInputMode?: 'cuda' | 'software';
  keyFrameInterval: number;
  preset: string;
  crf: number;
  maxVideoBitrateKbps: number;
  maxOutputHeight: number;
  rateControlBufferSeconds: number;
}

export type VideoEncoder = 'cpu' | 'nvidia';

export function buildVideoDecoderInputArgs(
  encoder: VideoEncoder,
  nvidiaInputMode: 'cuda' | 'software' = 'cuda',
): string[] {
  return encoder === 'nvidia' && nvidiaInputMode === 'cuda'
    ? ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda']
    : [];
}

export function buildVideoEncoderArgs(config: VideoEncoderConfig): string[] {
  const maxOutputHeight = Math.max(240, Math.round(config.maxOutputHeight));
  const maxVideoBitrateKbps = Math.max(
    250,
    Math.round(config.maxVideoBitrateKbps),
  );
  const rateControlBufferSeconds = Math.max(
    1,
    Math.round(config.rateControlBufferSeconds),
  );
  const rateControlBufferKbps = Math.max(
    maxVideoBitrateKbps,
    maxVideoBitrateKbps * rateControlBufferSeconds,
  );

  const commonArgs = [
    '-profile:v',
    'high',
    // Let the encoder select a level compatible with the actual output
    // dimensions and frame rate. A fixed Level 4.1 tag is invalid for 2160p.
    '-vsync',
    'cfr',
    '-g',
    String(config.keyFrameInterval),
    '-keyint_min',
    String(config.keyFrameInterval),
    '-sc_threshold',
    '0',
    '-force_key_frames',
    'expr:eq(n,0)',
  ];

  if (config.hardwareAcceleration === 'nvidia') {
    const filter =
      config.nvidiaInputMode === 'software'
        ? `setpts=PTS-STARTPTS,scale=-2:${maxOutputHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`
        : `setpts=PTS-STARTPTS,scale_cuda=-2:${maxOutputHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
    return [
      '-c:v',
      'h264_nvenc',
      '-vf',
      filter,
      '-pix_fmt',
      'yuv420p',
      ...commonArgs,
      '-preset',
      toNvencPreset(config.preset),
      '-tune',
      'hq',
      '-rc',
      'vbr',
      '-cq',
      String(config.crf),
      '-maxrate',
      `${maxVideoBitrateKbps}k`,
      '-bufsize',
      `${rateControlBufferKbps}k`,
      '-spatial_aq',
      '1',
      '-temporal_aq',
      '1',
    ];
  }

  return [
    '-c:v',
    'libx264',
    '-vf',
    `setpts=PTS-STARTPTS,scale=-2:${maxOutputHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`,
    '-pix_fmt',
    'yuv420p',
    ...commonArgs,
    '-preset',
    config.preset,
    '-crf',
    String(config.crf),
    '-maxrate',
    `${maxVideoBitrateKbps}k`,
    '-bufsize',
    `${rateControlBufferKbps}k`,
  ];
}

function toNvencPreset(preset: string): string {
  switch (preset.trim().toLowerCase()) {
    case 'ultrafast':
    case 'superfast':
      return 'p1';
    case 'veryfast':
    case 'faster':
      return 'p2';
    case 'fast':
      return 'p3';
    case 'slow':
      return 'p5';
    case 'slower':
      return 'p6';
    case 'veryslow':
      return 'p7';
    default:
      return 'p4';
  }
}

export interface AudioEncoderConfig {
  audioBitrateKbps: number;
}

export function buildAudioEncoderArgs(config: AudioEncoderConfig): string[] {
  const audioBitrateKbps = Math.max(48, Math.round(config.audioBitrateKbps));

  return [
    '-c:a',
    'aac',
    '-ac',
    '2',
    '-ar',
    '48000',
    '-af',
    'asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0',
    '-b:a',
    `${audioBitrateKbps}k`,
  ];
}

export interface SegmentFfmpegArgsInput {
  mediaKind: 'video' | 'audio';
  sourceFilePath: string;
  startSeconds: number;
  durationSeconds: number;
  audioMapSpecifier: string;
  includeAudio?: boolean;
  inputArgs?: string[];
  videoArgs: string[];
  audioArgs: string[];
  outputPath: string;
}

export function buildSegmentFfmpegArgs(
  input: SegmentFfmpegArgsInput,
): string[] {
  const startStr = input.startSeconds.toFixed(3);
  const includeAudio = input.includeAudio !== false;
  const mappedStreams =
    input.mediaKind === 'audio'
      ? ['-map', input.audioMapSpecifier, '-vn']
      : includeAudio
        ? ['-map', '0:v:0', '-map', input.audioMapSpecifier]
        : ['-map', '0:v:0', '-an'];
  const videoArgs = input.mediaKind === 'audio' ? [] : input.videoArgs;
  const audioArgs = includeAudio ? input.audioArgs : [];

  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-analyzeduration',
    '50M',
    '-probesize',
    '50M',
    ...(input.inputArgs ?? []),
    // Input-side accurate seek: decodes from the nearest preceding keyframe
    // then drops frames until reaching the requested time.
    '-ss',
    startStr,
    '-i',
    input.sourceFilePath,
    '-t',
    input.durationSeconds.toFixed(3),
    '-fflags',
    '+genpts+discardcorrupt',
    '-err_detect',
    'ignore_err',
    '-ignore_unknown',
    ...mappedStreams,
    '-sn',
    '-dn',
    ...videoArgs,
    ...audioArgs,
    // Place this segment's PTS at its true position in the overall timeline so
    // hls.js can stitch segments without seeing them as discontinuities.
    '-output_ts_offset',
    startStr,
    '-muxpreload',
    '0',
    '-muxdelay',
    '0',
    '-avoid_negative_ts',
    'disabled',
    '-f',
    'mpegts',
    '-y',
    input.outputPath,
  ];
}

export interface ContinuousAudioHlsArgsInput {
  sourceFilePath: string;
  audioMapSpecifier: string;
  audioArgs: string[];
  segmentSeconds: number;
  segmentPattern: string;
  manifestPath: string;
}

export function buildContinuousAudioHlsArgs(
  input: ContinuousAudioHlsArgsInput,
): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-analyzeduration',
    '50M',
    '-probesize',
    '50M',
    '-i',
    input.sourceFilePath,
    '-map',
    input.audioMapSpecifier,
    '-vn',
    '-sn',
    '-dn',
    ...input.audioArgs,
    // MPEG-TS otherwise starts near 1.4s. The independently generated video
    // rendition starts at zero, so keep both media timelines aligned.
    '-muxpreload',
    '0',
    '-muxdelay',
    '0',
    '-avoid_negative_ts',
    'disabled',
    '-f',
    'hls',
    '-hls_time',
    Math.max(1, input.segmentSeconds).toFixed(3),
    '-hls_list_size',
    '0',
    '-hls_playlist_type',
    'event',
    '-hls_flags',
    'temp_file+independent_segments',
    '-hls_segment_filename',
    input.segmentPattern,
    '-y',
    input.manifestPath,
  ];
}

export function computeKeyFrameInterval(
  frameRate: number | null | undefined,
  segmentSeconds: number,
): number {
  const normalized =
    frameRate != null && Number.isFinite(frameRate) && frameRate > 0
      ? frameRate
      : 24;
  return Math.max(24, Math.round(normalized * segmentSeconds));
}
