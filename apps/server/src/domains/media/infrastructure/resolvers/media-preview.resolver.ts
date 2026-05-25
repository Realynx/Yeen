import { Injectable, Logger } from '@nestjs/common';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, dirname, extname, join } from 'node:path';
import { MediaChapterThumbnail } from '../../domain/entities/media-item.entity';
import { extractDescriptionFromNfo } from './media-preview-description.helpers';
import {
  buildPreviewImageCandidates,
  type ChapterThumbnailCapturePoint,
  hashPath,
  pickChapterThumbnailCapturePoints,
  posterExtensionFromUrl,
} from './media-preview-path-helpers';

@Injectable()
export class MediaPreviewResolver {
  private readonly logger = new Logger(MediaPreviewResolver.name);
  private readonly previewImageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  private readonly nfoDescriptionTags = [
    'plot',
    'overview',
    'description',
    'synopsis',
    'outline',
    'summary',
  ];
  private readonly generatedChapterThumbnailDir = join(
    process.cwd(),
    'data',
    'thumbnails',
    'chapters',
  );
  private readonly generatedPosterThumbnailDir = join(
    process.cwd(),
    'data',
    'thumbnails',
    'posters',
  );
  private readonly generatedBackdropThumbnailDir = join(
    process.cwd(),
    'data',
    'thumbnails',
    'backdrops',
  );

  async generateChapterThumbnails(
    filePath: string,
    durationSeconds: number,
    sourceMtimeMs: number,
    ffmpegPath: string,
    requestedCount: number,
    chapterMarkers?: readonly ChapterThumbnailCapturePoint[],
  ): Promise<MediaChapterThumbnail[]> {
    const command = ffmpegPath?.trim() || 'ffmpeg';
    const captureCount = Math.max(1, Math.min(30, requestedCount));
    const fileHash = hashPath(filePath);
    const capturePoints = pickChapterThumbnailCapturePoints(
      durationSeconds,
      captureCount,
      fileHash,
      chapterMarkers,
    );
    const thumbnails: MediaChapterThumbnail[] = [];

    try {
      await mkdir(this.generatedChapterThumbnailDir, { recursive: true });

      for (let index = 0; index < capturePoints.length; index += 1) {
        const capturePoint = capturePoints[index];
        const captureSecond = capturePoint.second;
        const outputPath = join(
          this.generatedChapterThumbnailDir,
          `${fileHash}-${index + 1}.jpg`,
        );

        if (await this.pathExists(outputPath)) {
          const thumbnailStats = await stat(outputPath);
          if (thumbnailStats.mtimeMs >= sourceMtimeMs) {
            thumbnails.push({
              imagePath: outputPath,
              second: captureSecond,
              name: capturePoint.name,
            });
            continue;
          }
        }

        try {
          await this.runCommand(command, [
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-ss',
            captureSecond.toFixed(3),
            '-i',
            filePath,
            '-map',
            '0:v:0',
            '-frames:v',
            '1',
            '-q:v',
            '3',
            '-vf',
            "scale='min(640,iw)':-2",
            outputPath,
          ]);

          thumbnails.push({
            imagePath: outputPath,
            second: captureSecond,
            name: capturePoint.name,
          });
        } catch (error) {
          const message = this.toErrorMessage(error);
          this.logger.warn(
            `Chapter thumbnail generation failed for ${filePath} at ${captureSecond.toFixed(2)}s: ${message}`,
          );
        }
      }

      return thumbnails;
    } catch (error) {
      const message = this.toErrorMessage(error);
      this.logger.warn(
        `Chapter thumbnail generation setup failed for ${filePath}: ${message}`,
      );
      return [];
    }
  }

  async downloadPosterThumbnail(
    posterUrl: string,
    filePath: string,
    force = false,
  ): Promise<string | null> {
    return this.downloadRemoteThumbnail(
      posterUrl,
      filePath,
      'poster',
      this.generatedPosterThumbnailDir,
      'Poster thumbnail',
      force,
    );
  }

  async downloadBackdropThumbnail(
    backdropUrl: string,
    filePath: string,
    force = false,
  ): Promise<string | null> {
    return this.downloadRemoteThumbnail(
      backdropUrl,
      filePath,
      'backdrop',
      this.generatedBackdropThumbnailDir,
      'Backdrop thumbnail',
      force,
    );
  }

  private async downloadRemoteThumbnail(
    imageUrl: string,
    filePath: string,
    variant: 'poster' | 'backdrop',
    targetDirectory: string,
    label: string,
    force = false,
  ): Promise<string | null> {
    try {
      await mkdir(targetDirectory, { recursive: true });

      const extension = posterExtensionFromUrl(imageUrl);
      const outputPath = join(
        targetDirectory,
        `${hashPath(`${filePath}:${variant}`)}${extension}`,
      );

      if (!force && (await this.pathExists(outputPath))) {
        return outputPath;
      }

      const abortController = new AbortController();
      const timeoutHandle = setTimeout(() => abortController.abort(), 20_000);

      try {
        const response = await fetch(imageUrl, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} while fetching ${variant} image`,
          );
        }

        const payload = Buffer.from(await response.arrayBuffer());
        if (payload.length === 0) {
          throw new Error(`${variant} image payload was empty.`);
        }

        await writeFile(outputPath, payload);
        return outputPath;
      } finally {
        clearTimeout(timeoutHandle);
      }
    } catch (error) {
      const message = this.toErrorMessage(error);
      this.logger.warn(`${label} save failed for ${filePath}: ${message}`);
      return null;
    }
  }

  async readSidecarDescription(filePath: string): Promise<string | null> {
    const directory = dirname(filePath);
    const fileBaseName = basename(filePath, extname(filePath));
    const candidatePaths = [
      join(directory, `${fileBaseName}.nfo`),
      join(directory, 'movie.nfo'),
      join(directory, 'tvshow.nfo'),
    ];

    for (const candidatePath of candidatePaths) {
      if (!(await this.pathExists(candidatePath))) {
        continue;
      }

      try {
        const raw = await readFile(candidatePath, 'utf8');
        const extracted = this.extractDescriptionFromNfo(raw);
        if (extracted) {
          return extracted;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private extractDescriptionFromNfo(raw: string): string | null {
    return extractDescriptionFromNfo(raw, this.nfoDescriptionTags);
  }

  async findPreviewImagePath(filePath: string): Promise<string | null> {
    const directory = dirname(filePath);
    const fileBaseName = basename(filePath, extname(filePath));
    const candidates = buildPreviewImageCandidates(
      directory,
      fileBaseName,
      this.previewImageExtensions,
    );

    for (const candidate of candidates) {
      if (await this.pathExists(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  selectBestPreviewImagePath(
    sidecarPreviewImagePath: string | null,
    tmdbPosterImagePath: string | null,
    chapterThumbnails: MediaChapterThumbnail[],
  ): string | null {
    return (
      tmdbPosterImagePath ??
      sidecarPreviewImagePath ??
      chapterThumbnails[0]?.imagePath ??
      null
    );
  }

  selectBestBackdropImagePath(
    tmdbBackdropImagePath: string | null,
    chapterThumbnails: MediaChapterThumbnail[],
    sidecarPreviewImagePath: string | null,
  ): string | null {
    return (
      tmdbBackdropImagePath ??
      chapterThumbnails[0]?.imagePath ??
      sidecarPreviewImagePath ??
      null
    );
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async pathExists(pathValue: string): Promise<boolean> {
    try {
      await access(pathValue);
      return true;
    } catch {
      return false;
    }
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

      child.on('error', (error: Error) => {
        rejectPromise(error);
      });

      child.on('close', (code: number) => {
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
