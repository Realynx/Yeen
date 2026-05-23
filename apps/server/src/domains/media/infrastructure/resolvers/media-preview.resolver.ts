import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, dirname, extname, join } from 'node:path';
import { MediaChapterThumbnail } from '../../domain/entities/media-item.entity.ts/media-item.entity';

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
  ): Promise<MediaChapterThumbnail[]> {
    const command = ffmpegPath?.trim() || 'ffmpeg';
    const captureCount = Math.max(1, Math.min(30, requestedCount));
    const fileHash = this.hashPath(filePath);
    const captureSeconds = this.pickRandomThumbnailSeconds(
      durationSeconds,
      captureCount,
      fileHash,
    );
    const thumbnails: MediaChapterThumbnail[] = [];

    try {
      await mkdir(this.generatedChapterThumbnailDir, { recursive: true });

      for (let index = 0; index < captureSeconds.length; index += 1) {
        const captureSecond = captureSeconds[index];
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

      const extension = this.posterExtensionFromUrl(imageUrl);
      const outputPath = join(
        targetDirectory,
        `${this.hashPath(`${filePath}:${variant}`)}${extension}`,
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

  async findPreviewImagePath(filePath: string): Promise<string | null> {
    const directory = dirname(filePath);
    const fileBaseName = basename(filePath, extname(filePath));
    const candidates = this.buildPreviewImageCandidates(
      directory,
      fileBaseName,
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

  private posterExtensionFromUrl(urlValue: string): string {
    try {
      const pathname = new URL(urlValue).pathname.toLowerCase();
      const extension = extname(pathname);
      if (
        extension === '.jpg' ||
        extension === '.jpeg' ||
        extension === '.png' ||
        extension === '.webp'
      ) {
        return extension;
      }
    } catch {
      // Fall through to default extension.
    }

    return '.jpg';
  }

  private hashPath(filePath: string): string {
    return createHash('sha1').update(filePath.toLowerCase()).digest('hex');
  }

  private pickRandomThumbnailSeconds(
    durationSeconds: number,
    count: number,
    seed: string,
  ): number[] {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return [5].slice(0, count);
    }

    const minSecond =
      durationSeconds < 10 ? 0.5 : Math.min(20, durationSeconds * 0.08);
    const maxSecond = Math.max(minSecond + 0.5, durationSeconds - 1.2);
    const bucketSize = (maxSecond - minSecond) / Math.max(1, count);

    if (!Number.isFinite(bucketSize) || bucketSize <= 0) {
      return [
        Math.max(0.5, Math.min(durationSeconds - 0.8, durationSeconds * 0.5)),
      ];
    }

    const random = this.seededRandom(seed);
    const picks: number[] = [];

    for (let index = 0; index < count; index += 1) {
      const start = minSecond + bucketSize * index;
      const end = Math.min(maxSecond, start + bucketSize);
      const sample = start + random() * Math.max(0.1, end - start);
      const rounded = Math.max(minSecond, Math.min(maxSecond, sample));
      picks.push(Math.round(rounded * 1000) / 1000);
    }

    return picks.sort((left, right) => left - right);
  }

  private seededRandom(seed: string): () => number {
    let state = 0;

    for (let index = 0; index < seed.length; index += 1) {
      state = (state * 31 + seed.charCodeAt(index)) >>> 0;
    }

    if (state === 0) {
      state = 0x6d2b79f5;
    }

    return () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) & 0xffffffff) / 0x100000000;
    };
  }

  private buildPreviewImageCandidates(
    directory: string,
    fileBaseName: string,
  ): string[] {
    const baseNames = [
      fileBaseName,
      `${fileBaseName}-poster`,
      'poster',
      'folder',
    ];

    return baseNames.flatMap((baseName) =>
      this.previewImageExtensions.map((extension) =>
        join(directory, `${baseName}${extension}`),
      ),
    );
  }

  private extractDescriptionFromNfo(raw: string): string | null {
    for (const tagName of this.nfoDescriptionTags) {
      const tagValue = this.extractNfoTagValue(raw, tagName);
      const normalizedTagValue = this.normalizeDescriptionText(tagValue);
      if (this.isUsableDescription(normalizedTagValue)) {
        return normalizedTagValue;
      }
    }

    if (this.looksLikeXmlDocument(raw)) {
      return null;
    }

    const normalizedFallback = this.normalizeDescriptionText(raw);
    if (!this.isUsableDescription(normalizedFallback)) {
      return null;
    }

    return normalizedFallback;
  }

  private extractNfoTagValue(raw: string, tagName: string): string | null {
    const tagPattern = new RegExp(
      `<${tagName}\\b[^>]*>([\\s\\S]*?)<\/${tagName}>`,
      'i',
    );
    const match = raw.match(tagPattern);
    return match?.[1] ?? null;
  }

  private normalizeDescriptionText(
    value: string | null | undefined,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) {
      return null;
    }

    return normalized.slice(0, 1400);
  }

  private isUsableDescription(value: string | null): value is string {
    if (!value) {
      return false;
    }

    return !this.looksLikeStructuredMetadata(value);
  }

  private looksLikeXmlDocument(raw: string): boolean {
    const trimmed = raw.trim();
    if (!trimmed) {
      return false;
    }

    if (/^<\?xml[\s\S]*\?>/i.test(trimmed)) {
      return true;
    }

    return /<[a-z][^>]*>/i.test(trimmed) && /<\/[a-z][^>]*>/i.test(trimmed);
  }

  private looksLikeStructuredMetadata(value: string): boolean {
    const lower = value.toLowerCase();
    const metadataTokenCount =
      lower.match(
        /\b(h264|h265|x264|x265|hevc|avc|aac|ac3|eac3|dts|truehd|bitrate|fps|progressive|interlaced|aspect|poster\.jpg|und|jpn|eng)\b/g,
      )?.length ?? 0;
    const numericCount = value.match(/\b\d+(?:\.\d+)?\b/g)?.length ?? 0;
    const wordCount = value.split(/\s+/).filter(Boolean).length;
    const hasPath = /(?:[a-z]:\\|\/[a-z0-9._-]+\/)/i.test(value);
    const hasTimestamp =
      /\b\d{4}-\d{2}-\d{2}(?:[ t]\d{2}:\d{2}(?::\d{2})?)?\b/.test(value);
    const startsWithBoolean = /^(?:true|false)\b/i.test(value.trim());

    if (hasPath && hasTimestamp && numericCount >= 4) {
      return true;
    }

    if (metadataTokenCount >= 4 && numericCount >= 6 && wordCount >= 14) {
      return true;
    }

    if (startsWithBoolean && hasPath && numericCount >= 6) {
      return true;
    }

    return false;
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
