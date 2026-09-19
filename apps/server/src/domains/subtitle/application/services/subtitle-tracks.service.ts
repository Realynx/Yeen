import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, type Dirent } from 'node:fs';
import {
  copyFile,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { SubtitleTrack } from '../../domain/entities/subtitle-track.entity';
import { SubtitleCommandService } from './subtitle-command.service';
import { SubtitleStorageService } from './subtitle-storage.service';
import { convertAssToVtt } from '../../infrastructure/subtitle-ass-to-vtt';
import { sanitizeVttFile } from '../../infrastructure/subtitle-vtt-sanitizer';

const POSITIONED_SUBTITLE_CACHE_VERSION = 'v3';

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
  private readonly activeExternalPreparations = new Map<
    string,
    Promise<boolean>
  >();
  private readonly externalExtensions = new Set([
    '.vtt',
    '.srt',
    '.ass',
    '.ssa',
  ]);
  private readonly bitmapSubtitleCodecs = new Set([
    'dvb_subtitle',
    'dvd_subtitle',
    'hdmv_pgs_subtitle',
    'xsub',
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
      { timeoutMs: 60_000 },
    );

    const parsed = JSON.parse(raw) as FfprobePayload;
    const streams = parsed.streams ?? [];

    const candidates = await Promise.all(
      streams
        .filter((stream) => stream.codec_type === 'subtitle')
        .map((stream) => this.buildEmbeddedTrackCandidate(mediaId, stream)),
    );

    return candidates
      .sort((left, right) => left.sortScore - right.sortScore)
      .map((candidate) => candidate.track);
  }

  private async buildEmbeddedTrackCandidate(
    mediaId: string,
    stream: FfprobeStream,
  ): Promise<EmbeddedTrackCandidate> {
    const codec = (stream.codec_name ?? 'unknown').toLowerCase();
    const outputName = `embedded_${stream.index}_${POSITIONED_SUBTITLE_CACHE_VERSION}.vtt`;
    const extractable = !this.bitmapSubtitleCodecs.has(codec);
    const streamTitle = stream.tags?.title?.trim() || null;
    const isDefault = stream.disposition?.default === 1;
    const isForced = stream.disposition?.forced === 1;

    return {
      track: {
        id: `embedded-${stream.index}`,
        kind: 'embedded',
        label: this.embeddedTrackLabel(
          stream.index,
          streamTitle,
          isDefault,
          isForced,
        ),
        language: stream.tags?.language?.trim() || null,
        format: codec,
        extractable,
        streamIndex: stream.index,
        url: await this.cachedEmbeddedTrackUrl(
          mediaId,
          outputName,
          stream.index,
          extractable,
        ),
      },
      sortScore: this.embeddedTrackSortScore(
        stream.index,
        extractable,
        streamTitle,
        isDefault,
        isForced,
      ),
    };
  }

  private async cachedEmbeddedTrackUrl(
    mediaId: string,
    outputName: string,
    streamIndex: number,
    extractable: boolean,
  ): Promise<string | null> {
    const outputPath = join(
      this.subtitleStorageService.subtitleFolder(mediaId),
      outputName,
    );
    if (!extractable || !existsSync(outputPath)) return null;
    try {
      await sanitizeVttFile(outputPath);
      return this.subtitleStorageService.subtitleUrl(mediaId, outputName);
    } catch (error) {
      await rm(outputPath, { force: true }).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Ignoring extracted embedded subtitle stream ${streamIndex} for ${mediaId}: ${message}`,
      );
      return null;
    }
  }

  private embeddedTrackSortScore(
    streamIndex: number,
    extractable: boolean,
    title: string | null,
    isDefault: boolean,
    isForced: boolean,
  ): number {
    let score = streamIndex;
    if (!extractable) score += 10_000;
    if (isForced) score += 1_000;
    if (title && this.nonDialogueTitlePattern.test(title)) score += 500;
    if (!isDefault) score += 10;
    return score;
  }

  private embeddedTrackLabel(
    streamIndex: number,
    title: string | null,
    isDefault: boolean,
    isForced: boolean,
  ): string {
    const labels = [
      isDefault ? 'default' : null,
      isForced ? 'forced' : null,
    ].filter((label): label is string => label !== null);
    const base = title || `Embedded ${streamIndex}`;
    return labels.length > 0 ? `${base} (${labels.join(', ')})` : base;
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
      const track = await this.prepareExternalTrack(entry, {
        mediaId,
        mediaDir,
        mediaBaseName,
        subtitleFolder,
        ffmpegPath,
      });
      if (track) tracks.push(track);
    }

    return tracks;
  }

  private async prepareExternalTrack(
    entry: Dirent,
    context: {
      mediaId: string;
      mediaDir: string;
      mediaBaseName: string;
      subtitleFolder: string;
      ffmpegPath: string;
    },
  ): Promise<SubtitleTrack | null> {
    if (!entry.isFile()) return null;
    const extension = extname(entry.name).toLowerCase();
    if (!this.externalExtensions.has(extension)) return null;
    if (
      !entry.name
        .toLowerCase()
        .startsWith(`${context.mediaBaseName.toLowerCase()}.`)
    ) {
      return null;
    }

    const sourcePath = join(context.mediaDir, entry.name);
    const hash = createHash('sha1')
      .update(sourcePath)
      .digest('hex')
      .slice(0, 12);
    const isAssSubtitle = extension === '.ass' || extension === '.ssa';
    const outputName = isAssSubtitle
      ? `external_${hash}_${POSITIONED_SUBTITLE_CACHE_VERSION}.vtt`
      : `external_${hash}.vtt`;
    const outputPath = join(context.subtitleFolder, outputName);
    const prepared = await this.ensureExternalOutput({
      sourcePath,
      outputPath,
      extension,
      isAssSubtitle,
      ffmpegPath: context.ffmpegPath,
      displayName: entry.name,
    });
    if (!prepared) return null;

    const label = entry.name
      .replace(`${context.mediaBaseName}.`, '')
      .replace(extension, '')
      .replace(/[._-]+/g, ' ')
      .trim();
    return {
      id: `external-${hash}`,
      kind: 'external',
      label: label || 'External subtitle',
      language: null,
      format: extension.replace('.', ''),
      extractable: true,
      url: this.subtitleStorageService.subtitleUrl(context.mediaId, outputName),
    };
  }

  private ensureExternalOutput(input: {
    sourcePath: string;
    outputPath: string;
    extension: string;
    isAssSubtitle: boolean;
    ffmpegPath: string;
    displayName: string;
  }): Promise<boolean> {
    const active = this.activeExternalPreparations.get(input.outputPath);
    if (active) return active;

    const preparation = this.prepareExternalOutputOnce(input).finally(() => {
      if (
        this.activeExternalPreparations.get(input.outputPath) === preparation
      ) {
        this.activeExternalPreparations.delete(input.outputPath);
      }
    });
    this.activeExternalPreparations.set(input.outputPath, preparation);
    return preparation;
  }

  private async prepareExternalOutputOnce(input: {
    sourcePath: string;
    outputPath: string;
    extension: string;
    isAssSubtitle: boolean;
    ffmpegPath: string;
    displayName: string;
  }): Promise<boolean> {
    if (existsSync(input.outputPath)) {
      try {
        await sanitizeVttFile(input.outputPath);
        return true;
      } catch {
        await rm(input.outputPath, { force: true }).catch(() => undefined);
      }
    }

    const pendingPath = `${input.outputPath}.${randomUUID()}.pending.vtt`;
    try {
      await this.writeExternalOutput(input, pendingPath);
      await sanitizeVttFile(pendingPath);
      await rename(pendingPath, input.outputPath);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Skipping subtitle ${input.displayName}: ${message}`);
      return false;
    } finally {
      await rm(pendingPath, { force: true }).catch(() => undefined);
    }
  }

  private async writeExternalOutput(
    input: {
      sourcePath: string;
      extension: string;
      isAssSubtitle: boolean;
      ffmpegPath: string;
    },
    outputPath: string,
  ): Promise<void> {
    if (input.isAssSubtitle) {
      const assContent = await readFile(input.sourcePath, 'utf8');
      await writeFile(outputPath, convertAssToVtt(assContent), 'utf8');
      return;
    }
    if (input.extension === '.vtt') {
      await copyFile(input.sourcePath, outputPath);
      return;
    }
    await this.subtitleCommandService.run(input.ffmpegPath || 'ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input.sourcePath,
      outputPath,
    ]);
  }
}
