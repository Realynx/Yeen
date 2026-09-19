import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import type { VideoEncoder } from '../../../infrastructure/hls/hls-ffmpeg-args';

export type TranscodeHardwareAcceleration = 'auto' | 'nvidia' | 'cpu';

export function buildNvidiaNvencProbeArgsValue(): string[] {
  return [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=size=256x256:rate=1',
    '-frames:v',
    '1',
    '-an',
    '-c:v',
    'h264_nvenc',
    '-f',
    'null',
    '-',
  ];
}

@Injectable()
export class HlsTranscodeCapabilityService {
  private readonly logger = new Logger(HlsTranscodeCapabilityService.name);
  private readonly nvidiaAvailability = new Map<string, Promise<boolean>>();

  async resolveVideoEncoder(
    preference: TranscodeHardwareAcceleration,
    ffmpegPath: string,
  ): Promise<VideoEncoder> {
    if (preference === 'cpu') {
      return 'cpu';
    }

    const available = await this.getNvidiaAvailability(ffmpegPath);
    if (available) {
      return 'nvidia';
    }

    this.logger.warn(
      preference === 'nvidia'
        ? 'NVIDIA transcoding was requested but NVENC is unavailable; falling back to CPU.'
        : 'NVENC is unavailable; using CPU transcoding.',
    );
    return 'cpu';
  }

  private getNvidiaAvailability(ffmpegPath: string): Promise<boolean> {
    const existing = this.nvidiaAvailability.get(ffmpegPath);
    if (existing) {
      return existing;
    }

    const probe = this.probeNvidiaNvenc(ffmpegPath);
    this.nvidiaAvailability.set(ffmpegPath, probe);
    return probe;
  }

  protected probeNvidiaNvenc(ffmpegPath: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const child = spawn(ffmpegPath, buildNvidiaNvencProbeArgsValue(), {
        windowsHide: true,
        stdio: 'ignore',
      });
      let settled = false;
      const finish = (available: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve(available);
      };
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        finish(false);
      }, 10_000);
      timeout.unref?.();

      child.once('error', () => finish(false));
      child.once('close', (code) => finish(code === 0));
    });
  }
}
