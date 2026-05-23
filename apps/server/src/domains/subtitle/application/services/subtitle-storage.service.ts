import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveSafePathFromFileName } from '../../../core/infrastructure/shared/safe-path';

@Injectable()
export class SubtitleStorageService {
  private readonly subtitleRoot = join(process.cwd(), 'data', 'subtitles');

  subtitleFolder(mediaId: string): string {
    return join(this.subtitleRoot, mediaId);
  }

  subtitleUrl(mediaId: string, fileName: string): string {
    return `/api/subtitles/file/${mediaId}/${fileName}`;
  }

  async ensureSubtitleFolder(mediaId: string): Promise<string> {
    const folder = this.subtitleFolder(mediaId);
    await mkdir(folder, { recursive: true });
    return folder;
  }

  resolveExistingSubtitlePath(mediaId: string, fileName: string): string {
    const fullPath = resolveSafePathFromFileName({
      basePath: this.subtitleFolder(mediaId),
      fileName,
      invalidFileNameMessage: 'Invalid subtitle file name.',
      invalidPathMessage: 'Invalid subtitle path.',
    });

    if (!existsSync(fullPath)) {
      throw new NotFoundException('Subtitle file not found.');
    }

    return fullPath;
  }
}
