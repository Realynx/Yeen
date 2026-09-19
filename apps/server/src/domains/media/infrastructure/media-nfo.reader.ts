import { Injectable, Logger } from '@nestjs/common';
import { access, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

export interface NfoMetadata {
  title: string | null;
  originalTitle: string | null;
  showTitle: string | null;
  year: number | null;
  genres: string[];
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
}

@Injectable()
export class MediaNfoReader {
  private readonly logger = new Logger(MediaNfoReader.name);

  async readNfo(filePath: string): Promise<NfoMetadata | null> {
    const candidatePaths = this.buildCandidatePaths(filePath);

    for (const candidatePath of candidatePaths) {
      if (!(await this.pathExists(candidatePath))) {
        continue;
      }

      try {
        const raw = await readFile(candidatePath, 'utf8');
        const metadata = this.parseNfo(raw);
        if (metadata) {
          this.logger.debug(`Read NFO metadata from ${candidatePath}`);
          return metadata;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to read NFO at ${candidatePath}: ${message}`);
      }
    }

    return null;
  }

  private buildCandidatePaths(filePath: string): string[] {
    const directory = dirname(filePath);
    const fileBaseName = basename(filePath, extname(filePath));
    return [
      join(directory, `${fileBaseName}.nfo`),
      join(directory, 'movie.nfo'),
      join(directory, 'tvshow.nfo'),
      join(directory, 'episode.nfo'),
    ];
  }

  private parseNfo(raw: string): NfoMetadata | null {
    if (!raw.trim()) {
      return null;
    }

    const title = this.extractText(raw, 'title');
    const originalTitle = this.extractText(raw, 'originaltitle');
    const showTitle = this.extractText(raw, 'showtitle');
    const yearRaw =
      this.extractText(raw, 'year') ??
      this.extractYear(raw, 'premiered') ??
      this.extractYear(raw, 'aired');
    const year = yearRaw ? this.parseIntSafe(yearRaw) : null;
    const genres = this.extractAll(raw, 'genre');
    const seasonNumber = this.parseIntSafe(this.extractText(raw, 'season'));
    const episodeNumber = this.parseIntSafe(this.extractText(raw, 'episode'));
    const episodeTitle =
      this.extractText(raw, 'episodetitle') ?? this.extractText(raw, 'title');

    const hasAnyData =
      title !== null ||
      originalTitle !== null ||
      showTitle !== null ||
      year !== null ||
      genres.length > 0 ||
      seasonNumber !== null ||
      episodeNumber !== null;

    if (!hasAnyData) {
      return null;
    }

    return {
      title,
      originalTitle,
      showTitle,
      year,
      genres,
      seasonNumber,
      episodeNumber,
      episodeTitle: episodeTitle !== title ? episodeTitle : null,
    };
  }

  private extractText(raw: string, tagName: string): string | null {
    const pattern = new RegExp(
      `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
      'i',
    );
    const match = raw.match(pattern);
    if (!match) {
      return null;
    }
    const value = this.stripCdataAndTags(match[1]).trim();
    return value || null;
  }

  private extractYear(raw: string, tagName: string): string | null {
    const value = this.extractText(raw, tagName);
    if (!value) {
      return null;
    }
    const yearMatch = value.match(/\b(\d{4})\b/);
    return yearMatch?.[1] ?? null;
  }

  private extractAll(raw: string, tagName: string): string[] {
    const pattern = new RegExp(
      `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
      'gi',
    );
    const results: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(raw)) !== null) {
      const value = this.stripCdataAndTags(match[1]).trim();
      if (value) {
        results.push(value);
      }
    }

    return results;
  }

  private stripCdataAndTags(value: string): string {
    return value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseIntSafe(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
