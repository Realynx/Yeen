import { Injectable } from '@nestjs/common';
import { MediaItem } from '../../../domain/entities/media-item.entity';

@Injectable()
export class MediaFsNfoService {
  buildNfoXml(item: MediaItem): string | null {
    if (item.type === 'movie') {
      return this.wrapXml(
        'movie',
        [
          this.xmlTag('title', item.title),
          item.releaseYear ? this.xmlTag('year', String(item.releaseYear)) : '',
          item.description ? this.xmlTag('plot', item.description) : '',
          ...item.tags.map((tag) => this.xmlTag('tag', tag)),
        ].filter(Boolean),
      );
    }

    if (item.type === 'show') {
      return this.wrapXml(
        'episodedetails',
        [
          this.xmlTag(
            'title',
            item.episodeTitle && item.episodeTitle.trim()
              ? item.episodeTitle
              : item.title,
          ),
          this.xmlTag('showtitle', item.title),
          item.seasonNumber !== null
            ? this.xmlTag('season', String(item.seasonNumber))
            : '',
          item.episodeNumber !== null
            ? this.xmlTag('episode', String(item.episodeNumber))
            : '',
          item.releaseYear ? this.xmlTag('year', String(item.releaseYear)) : '',
          item.description ? this.xmlTag('plot', item.description) : '',
          ...item.tags.map((tag) => this.xmlTag('tag', tag)),
        ].filter(Boolean),
      );
    }

    return null;
  }

  private wrapXml(root: string, lines: string[]): string {
    const body = lines.map((line) => `  ${line}`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${root}>\n${body}\n</${root}>\n`;
  }

  private xmlTag(name: string, value: string): string {
    return `<${name}>${this.xmlEscape(value)}</${name}>`;
  }

  private xmlEscape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

