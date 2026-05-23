import { Injectable } from '@nestjs/common';
import { readdir } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { MediaSubtitleDetail } from '../../domain/entities/media-item.entity';
import { FfprobeStream } from '../adapters/media-probe.adapter';

@Injectable()
export class MediaSubtitleResolver {
  private readonly subtitleExtensions = new Set([
    '.srt',
    '.vtt',
    '.ass',
    '.ssa',
    '.sub',
  ]);

  toEmbeddedSubtitleDetails(
    subtitleStreams: FfprobeStream[],
  ): MediaSubtitleDetail[] {
    return subtitleStreams.map((stream) => ({
      kind: 'embedded',
      label: stream.tags?.title?.trim() || `Embedded #${stream.index}`,
      language: stream.tags?.language?.trim() || null,
      source: `stream:${stream.index}`,
    }));
  }

  async findExternalSubtitleDetails(
    filePath: string,
  ): Promise<MediaSubtitleDetail[]> {
    const directory = dirname(filePath);
    const mediaBaseName = basename(filePath, extname(filePath)).toLowerCase();
    const entries = await readdir(directory, { withFileTypes: true });

    const subtitles: MediaSubtitleDetail[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      if (!this.subtitleExtensions.has(extension)) {
        continue;
      }

      const subtitleName = basename(entry.name, extension).toLowerCase();
      if (!this.isMatchingSubtitleName(subtitleName, mediaBaseName)) {
        continue;
      }

      const language = this.extractSubtitleLanguage(
        subtitleName,
        mediaBaseName,
      );
      subtitles.push({
        kind: 'external',
        label: language ? `External (${language})` : `External (${entry.name})`,
        language,
        source: join(directory, entry.name),
      });
    }

    return subtitles.sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }

  private isMatchingSubtitleName(
    subtitleName: string,
    mediaBaseName: string,
  ): boolean {
    return (
      subtitleName === mediaBaseName ||
      subtitleName.startsWith(`${mediaBaseName}.`) ||
      subtitleName.startsWith(`${mediaBaseName}-`) ||
      subtitleName.startsWith(`${mediaBaseName}_`) ||
      subtitleName.startsWith(`${mediaBaseName} `)
    );
  }

  private extractSubtitleLanguage(
    subtitleName: string,
    mediaBaseName: string,
  ): string | null {
    const suffix = subtitleName
      .slice(mediaBaseName.length)
      .replace(/^[.\-_ ]+/, '')
      .trim();

    if (!suffix) {
      return null;
    }

    const token = suffix.split(/[.\-_ ]+/).find(Boolean) ?? '';
    return /^[a-z]{2,3}$/.test(token) ? token : null;
  }
}

