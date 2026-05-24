import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, readdir } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { SubtitleTrack } from '../../domain/entities/subtitle-track.entity';
import { SubtitleCommandService } from './subtitle-command.service';
import { SubtitleStorageService } from './subtitle-storage.service';
import { sanitizeVttFile } from '../../infrastructure/subtitle-vtt-sanitizer';

interface FfprobeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  tags?: {
    language?: string;
    title?: string;
  };
  disposition?: {
    default?: number;
    forced?: number;
  };
}

interface FfprobePayload {
  streams?: FfprobeStream[];
}

interface EmbeddedTrackCandidate {
  track: SubtitleTrack;
  sortScore: number;
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
  private readonly nonDialogueTitlePattern =
    /\b(signs?|songs?|karaoke|commentary|lyrics?|forced)\b/i;

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

    const candidates = await Promise.all(
      streams
        .filter((stream) => stream.codec_type === 'subtitle')
        .map(async (stream): Promise<EmbeddedTrackCandidate> => {
          const codec = (stream.codec_name ?? 'unknown').toLowerCase();
          const outputName = `embedded_${stream.index}.vtt`;
          const outputPath = join(
            this.subtitleStorageService.subtitleFolder(mediaId),
            outputName,
          );
          const extractable = this.textSubtitleCodecs.has(codec);
          const streamTitle = stream.tags?.title?.trim() || null;
          const language = stream.tags?.language?.trim() || null;
          const isDefault = stream.disposition?.default === 1;
          const isForced = stream.disposition?.forced === 1;
          const likelyNonDialogue =
            streamTitle !== null &&
            this.nonDialogueTitlePattern.test(streamTitle);

          let subtitleUrl: string | null = null;
          if (extractable && existsSync(outputPath)) {
            try {
              await sanitizeVttFile(outputPath);
              subtitleUrl = this.subtitleStorageService.subtitleUrl(
                mediaId,
                outputName,
              );
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              this.logger.warn(
                `Ignoring extracted embedded subtitle stream ${stream.index} for ${mediaId}: ${message}`,
              );
            }
          }

          let sortScore = stream.index;
          if (!extractable) {
            sortScore += 10_000;
          }
          if (isForced) {
            sortScore += 1_000;
          }
          if (likelyNonDialogue) {
            sortScore += 500;
          }
          if (!isDefault) {
            sortScore += 10;
          }

          const labelParts: string[] = [];
          if (isDefault) {
            labelParts.push('default');
          }
          if (isForced) {
            labelParts.push('forced');
          }

          const labelBase = streamTitle || `Embedded ${stream.index}`;
          const label =
            labelParts.length > 0
              ? `${labelBase} (${labelParts.join(', ')})`
              : labelBase;

          return {
            track: {
              id: `embedded-${stream.index}`,
              kind: 'embedded',
              label,
              language,
              format: codec,
              extractable,
              streamIndex: stream.index,
              url: subtitleUrl,
            },
            sortScore,
          };
        }),
    );

    return candidates
      .sort((left, right) => left.sortScore - right.sortScore)
      .map((candidate) => candidate.track);
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
