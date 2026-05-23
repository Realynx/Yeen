/**
 * Pure ffmpeg argument builders for the on-demand HLS pipeline.
 *
 * Split out from `StreamService` so encoder config is testable in isolation
 * and the transcoder doesn't need to know about `SystemSettings`.
 */

export interface VideoEncoderConfig {
  keyFrameInterval: number;
  preset: string;
  crf: number;
}

export function buildVideoEncoderArgs(config: VideoEncoderConfig): string[] {
  return [
    '-c:v',
    'libx264',
    '-vf',
    'setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'high',
    '-level',
    '4.1',
    // `-fps_mode` is unavailable on older ffmpeg releases often found on
    // long-term Ubuntu/Debian images. Use the broadly supported equivalent.
    '-vsync',
    'cfr',
    '-g',
    String(config.keyFrameInterval),
    '-keyint_min',
    String(config.keyFrameInterval),
    '-sc_threshold',
    '0',
    // Force a keyframe at the very start of every segment so the segment is
    // independently decodable by the player.
    '-force_key_frames',
    'expr:gte(t,0)',
    '-preset',
    config.preset,
    '-crf',
    String(config.crf),
  ];
}

export function buildAudioEncoderArgs(): string[] {
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
    '160k',
  ];
}

export interface SegmentFfmpegArgsInput {
  sourceFilePath: string;
  startSeconds: number;
  durationSeconds: number;
  audioMapSpecifier: string;
  videoArgs: string[];
  audioArgs: string[];
  outputPath: string;
}

export function buildSegmentFfmpegArgs(
  input: SegmentFfmpegArgsInput,
): string[] {
  const startStr = input.startSeconds.toFixed(3);

  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-analyzeduration',
    '50M',
    '-probesize',
    '50M',
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
    '-map',
    '0:v:0',
    '-map',
    input.audioMapSpecifier,
    '-sn',
    '-dn',
    ...input.videoArgs,
    ...input.audioArgs,
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
