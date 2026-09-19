import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { MediaService } from '../../../media/application/services/media.service';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { SubtitleCommandService } from './subtitle-command.service';
import { SubtitleStorageService } from './subtitle-storage.service';
import { SubtitleTracksService } from './subtitle-tracks.service';
import { convertAssToVtt } from '../../infrastructure/subtitle-ass-to-vtt';
import { sanitizeVttFile } from '../../infrastructure/subtitle-vtt-sanitizer';

const POSITIONED_SUBTITLE_CACHE_VERSION = 'v3';

export interface SubtitleExtractionResult {
  mediaId: string;
  streamIndex: number;
  url: string;
  status: 'extracted' | 'already-ready';
}

export interface SubtitleExtractionTrackResult {
  streamIndex: number;
  format: string;
  status: 'extracted' | 'already-ready' | 'unsupported' | 'failed';
  url: string | null;
  error: string | null;
}

export interface SubtitleExtractionSummary {
  mediaId: string;
  totalTracks: number;
  extracted: number;
  alreadyReady: number;
  unsupported: number;
  failed: number;
  tracks: SubtitleExtractionTrackResult[];
}

@Injectable()
export class SubtitleExtractionService {
  private readonly activeExtractions = new Map<
    string,
    Promise<SubtitleExtractionResult>
  >();

  constructor(
    private readonly mediaService: MediaService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly subtitleCommandService: SubtitleCommandService,
    private readonly subtitleStorageService: SubtitleStorageService,
    private readonly subtitleTracksService: SubtitleTracksService,
  ) {}

  extractEmbedded(
    mediaId: string,
    streamIndex: number,
  ): Promise<SubtitleExtractionResult> {
    if (streamIndex < 0) {
      throw new BadRequestException('streamIndex must be >= 0.');
    }

    const extractionKey = `${mediaId}:${streamIndex}`;
    const activeExtraction = this.activeExtractions.get(extractionKey);
    if (activeExtraction) {
      return activeExtraction;
    }

    const extraction = this.extractEmbeddedOnce(mediaId, streamIndex).finally(
      () => {
        if (this.activeExtractions.get(extractionKey) === extraction) {
          this.activeExtractions.delete(extractionKey);
        }
      },
    );
    this.activeExtractions.set(extractionKey, extraction);
    return extraction;
  }

  async extractAllEmbedded(
    mediaId: string,
  ): Promise<SubtitleExtractionSummary> {
    const media = await this.mediaService.getById(mediaId);
    const resolvedMediaFilePath = await this.mediaService.resolveMediaFilePath(
      media.filePath,
      media.relativePath,
    );
    const systemSettings = await this.systemSettingsService.getSettings();
    const tracks = await this.subtitleTracksService.probeEmbeddedTracks(
      mediaId,
      resolvedMediaFilePath,
      systemSettings.ffprobePath,
    );
    const results: SubtitleExtractionTrackResult[] = [];

    for (const track of tracks) {
      if (!track.extractable || typeof track.streamIndex !== 'number') {
        results.push({
          streamIndex: track.streamIndex ?? -1,
          format: track.format,
          status: 'unsupported',
          url: null,
          error: null,
        });
        continue;
      }

      if (track.url) {
        results.push({
          streamIndex: track.streamIndex,
          format: track.format,
          status: 'already-ready',
          url: track.url,
          error: null,
        });
        continue;
      }

      try {
        const result = await this.extractEmbedded(mediaId, track.streamIndex);
        results.push({
          streamIndex: track.streamIndex,
          format: track.format,
          status: result.status,
          url: result.url,
          error: null,
        });
      } catch (error) {
        results.push({
          streamIndex: track.streamIndex,
          format: track.format,
          status: 'failed',
          url: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.summarizeExtraction(mediaId, results);
  }

  private async extractEmbeddedOnce(
    mediaId: string,
    streamIndex: number,
  ): Promise<SubtitleExtractionResult> {
    const media = await this.mediaService.getById(mediaId);
    const resolvedMediaFilePath = await this.mediaService.resolveMediaFilePath(
      media.filePath,
      media.relativePath,
    );
    const systemSettings = await this.systemSettingsService.getSettings();
    const folder =
      await this.subtitleStorageService.ensureSubtitleFolder(mediaId);

    const outputFileName = `embedded_${streamIndex}_${POSITIONED_SUBTITLE_CACHE_VERSION}.vtt`;
    const outputPath = join(folder, outputFileName);
    const cachedResult = await this.validCachedResult(
      mediaId,
      streamIndex,
      outputFileName,
      outputPath,
    );
    if (cachedResult) {
      return cachedResult;
    }

    const pendingId = randomUUID();
    const intermediateAssPath = join(
      folder,
      `.embedded_${streamIndex}_${pendingId}.ass`,
    );
    const pendingOutputPath = join(
      folder,
      `.embedded_${streamIndex}_${pendingId}.vtt`,
    );

    try {
      await this.subtitleCommandService.run(systemSettings.ffmpegPath, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        resolvedMediaFilePath,
        '-map',
        `0:${streamIndex}`,
        '-c:s',
        'ass',
        intermediateAssPath,
      ]);
      const assContent = await readFile(intermediateAssPath, 'utf8');
      await writeFile(pendingOutputPath, convertAssToVtt(assContent), 'utf8');
      await sanitizeVttFile(pendingOutputPath);
      await rename(pendingOutputPath, outputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Unable to extract subtitle stream ${streamIndex}. ${message}`,
      );
    } finally {
      await Promise.all([
        rm(intermediateAssPath, { force: true }).catch(() => undefined),
        rm(pendingOutputPath, { force: true }).catch(() => undefined),
      ]);
    }

    return this.result(mediaId, streamIndex, outputFileName, 'extracted');
  }

  private async validCachedResult(
    mediaId: string,
    streamIndex: number,
    outputFileName: string,
    outputPath: string,
  ): Promise<SubtitleExtractionResult | null> {
    if (!existsSync(outputPath)) {
      return null;
    }

    try {
      await sanitizeVttFile(outputPath);
      return this.result(mediaId, streamIndex, outputFileName, 'already-ready');
    } catch {
      await rm(outputPath, { force: true }).catch(() => undefined);
      return null;
    }
  }

  private result(
    mediaId: string,
    streamIndex: number,
    outputFileName: string,
    status: SubtitleExtractionResult['status'],
  ): SubtitleExtractionResult {
    return {
      mediaId,
      streamIndex,
      url: this.subtitleStorageService.subtitleUrl(mediaId, outputFileName),
      status,
    };
  }

  private summarizeExtraction(
    mediaId: string,
    tracks: SubtitleExtractionTrackResult[],
  ): SubtitleExtractionSummary {
    const count = (status: SubtitleExtractionTrackResult['status']) =>
      tracks.filter((track) => track.status === status).length;
    return {
      mediaId,
      totalTracks: tracks.length,
      extracted: count('extracted'),
      alreadyReady: count('already-ready'),
      unsupported: count('unsupported'),
      failed: count('failed'),
      tracks,
    };
  }
}
