import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';

export interface FfprobeStreamTags {
  [key: string]: string | undefined;
  language?: string;
  title?: string;
}

export interface FfprobeStreamDisposition {
  [key: string]: number | undefined;
  default?: number;
  forced?: number;
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
  disposition?: FfprobeStreamDisposition;
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
  private readonly logger = new Logger(MediaProbeAdapter.name);

  async probeFile(filePath: string, ffprobePath: string): Promise<FfprobePayload> {
    // For in-progress torrent downloads we may be probing a `.!qB` partial
    // file or an .mkv that doesn't yet contain its trailing Cues. Give
    // ffprobe more head bytes to work with (default analyzeduration is
    // 5s/5MB) so it can resolve duration + stream info from a partial file,
    // and ignore unreadable trailing data when the cluster index is missing.
    const primaryArgs = [
      '-v',
      'error',
      '-analyzeduration',
      '50M',
      '-probesize',
      '50M',
      '-fflags',
      '+discardcorrupt',
      '-err_detect',
      'ignore_err',
      '-show_streams',
      '-show_format',
      '-print_format',
      'json',
      filePath,
    ];

    try {
      const raw = await this.runCommand(ffprobePath, primaryArgs);
      return JSON.parse(raw) as FfprobePayload;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (!this.isRecoverableProbeError(message)) {
        throw error;
      }

      this.logger.warn(
        `Primary ffprobe failed for ${filePath}; retrying with head-only interval. (${message})`,
      );

      const fallbackArgs = [
        ...primaryArgs.slice(0, -1),
        '-read_intervals',
        '0%+180',
        filePath,
      ];
      const fallbackRaw = await this.runCommand(ffprobePath, fallbackArgs);
      return JSON.parse(fallbackRaw) as FfprobePayload;
    }
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
        const trimmedStdout = stdout.trim();

        if (code !== 0) {
          // ffprobe can exit non-zero on partial/in-progress files even when
          // it already emitted valid JSON stream metadata. Accept that payload
          // so torrent indexing can continue while the file is still growing.
          if (trimmedStdout) {
            try {
              const parsed = JSON.parse(trimmedStdout) as FfprobePayload;
              const hasStreams =
                Array.isArray(parsed.streams) && parsed.streams.length > 0;
              const hasFormat = Boolean(
                parsed.format && Object.keys(parsed.format).length > 0,
              );

              if (hasStreams || hasFormat) {
                this.logger.warn(
                  `ffprobe exited with code ${code} but returned usable metadata; continuing with partial probe output.`,
                );
                resolvePromise(trimmedStdout);
                return;
              }
            } catch {
              // Ignore parse failures and fall through to the original error.
            }
          }

          rejectPromise(
            new Error(stderr.trim() || `Command failed with code ${code}`),
          );
          return;
        }

        resolvePromise(stdout);
      });
    });
  }

  private isRecoverableProbeError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('invalid data found')
      || normalized.includes('end of file')
      || normalized.includes('error reading')
      || normalized.includes('moov atom not found')
    );
  }
}
