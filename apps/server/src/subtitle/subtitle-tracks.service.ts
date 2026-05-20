import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, readdir } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { SubtitleTrack } from './entities/subtitle-track.entity';
import { SubtitleCommandService } from './subtitle-command.service';
import { SubtitleStorageService } from './subtitle-storage.service';

interface FfprobeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  tags?: {
    language?: string;
  };
}

interface FfprobePayload {
  streams?: FfprobeStream[];
}

@Injectable()
export class SubtitleTracksService {
  private readonly logger = new Logger(SubtitleTracksService.name);
  private readonly externalExtensions = new Set([
    '.vtt',
    '.srt',
    '.ass',
    '.ssa',
  ]);
  private readonly textSubtitleCodecs = new Set([
    'subrip',
    'mov_text',
    'webvtt',
    'ass',
    'ssa',
    'text',
  ]);

  constructor(
    private readonly subtitleCommandService: SubtitleCommandService,
    private readonly subtitleStorageService: SubtitleStorageService,
  ) {}

  async probeEmbeddedTracks(
    mediaId: string,
    mediaFilePath: string,
    ffprobePath: string,
  ): Promise<SubtitleTrack[]> {
    const raw = await this.subtitleCommandService.run(
      ffprobePath || 'ffprobe',
      ['-v', 'error', '-show_streams', '-print_format', 'json', mediaFilePath],
    );

    const parsed = JSON.parse(raw) as FfprobePayload;
    const streams = parsed.streams ?? [];

    return streams
      .filter((stream) => stream.codec_type === 'subtitle')
      .map((stream) => {
        const codec = (stream.codec_name ?? 'unknown').toLowerCase();
        const outputName = `embedded_${stream.index}.vtt`;
        const outputPath = join(
          this.subtitleStorageService.subtitleFolder(mediaId),
          outputName,
        );
        const extractable = this.textSubtitleCodecs.has(codec);

        return {
          id: `embedded-${stream.index}`,
          kind: 'embedded',
          label: `Embedded ${stream.index}`,
          language: stream.tags?.language ?? null,
          format: codec,
          extractable,
          streamIndex: stream.index,
          url:
            extractable && existsSync(outputPath)
              ? this.subtitleStorageService.subtitleUrl(mediaId, outputName)
              : null,
        };
      });
  }

  async prepareExternalTracks(
    mediaId: string,
    mediaFilePath: string,
    ffmpegPath: string,
  ): Promise<SubtitleTrack[]> {
    const mediaDir = dirname(mediaFilePath);
    const mediaBaseName = basename(mediaFilePath, extname(mediaFilePath));
    const entries = await readdir(mediaDir, { withFileTypes: true });
    const subtitleFolder =
      await this.subtitleStorageService.ensureSubtitleFolder(mediaId);

    const tracks: SubtitleTrack[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      if (!this.externalExtensions.has(extension)) {
        continue;
      }

      if (
        !entry.name.toLowerCase().startsWith(`${mediaBaseName.toLowerCase()}.`)
      ) {
        continue;
      }

      const sourcePath = join(mediaDir, entry.name);
      const hash = createHash('sha1')
        .update(sourcePath)
        .digest('hex')
        .slice(0, 12);
      const outputName = `external_${hash}.vtt`;
      const outputPath = join(subtitleFolder, outputName);

      if (!existsSync(outputPath)) {
        try {
          if (extension === '.vtt') {
            await copyFile(sourcePath, outputPath);
          } else {
            await this.subtitleCommandService.run(ffmpegPath || 'ffmpeg', [
              '-hide_banner',
              '-loglevel',
              'error',
              '-y',
              '-i',
              sourcePath,
              outputPath,
            ]);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Skipping subtitle ${entry.name}: ${message}`);
          continue;
        }
      }

      const label = entry.name
        .replace(`${mediaBaseName}.`, '')
        .replace(extension, '')
        .replace(/[._-]+/g, ' ')
        .trim();

      tracks.push({
        id: `external-${hash}`,
        kind: 'external',
        label: label || 'External subtitle',
        language: null,
        format: extension.replace('.', ''),
        extractable: true,
        url: this.subtitleStorageService.subtitleUrl(mediaId, outputName),
      });
    }

    return tracks;
  }
}
