import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';

export interface FfprobeStreamTags {
  language?: string;
  title?: string;
}

export interface FfprobeFormatTags {
  [key: string]: string | undefined;
}

export interface FfprobeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  channels?: number;
  avg_frame_rate?: string;
  tags?: FfprobeStreamTags;
}

export interface FfprobeFormat {
  duration?: string;
  format_name?: string;
  bit_rate?: string;
  tags?: FfprobeFormatTags;
}

export interface FfprobePayload {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

@Injectable()
export class MediaProbeAdapter {
  async probeFile(filePath: string, ffprobePath: string): Promise<FfprobePayload> {
    const raw = await this.runCommand(ffprobePath, [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-print_format',
      'json',
      filePath,
    ]);

    return JSON.parse(raw) as FfprobePayload;
  }

  selectStreams(streams: FfprobeStream[]): {
    video: FfprobeStream | undefined;
    audio: FfprobeStream | undefined;
    subtitleStreams: FfprobeStream[];
  } {
    return {
      video: streams.find((stream) => stream.codec_type === 'video'),
      audio: streams.find((stream) => stream.codec_type === 'audio'),
      subtitleStreams: streams.filter(
        (stream) => stream.codec_type === 'subtitle',
      ),
    };
  }

  private runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(command, args, {
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        rejectPromise(error);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          rejectPromise(
            new Error(stderr.trim() || `Command failed with code ${code}`),
          );
          return;
        }

        resolvePromise(stdout);
      });
    });
  }
}
