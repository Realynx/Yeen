import { Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lookup } from 'mime-types';
import { MediaItem } from '../../domain/entities/media-item.entity';

@Injectable()
export class MediaImageStreamService {
  async streamPreviewImage(item: MediaItem, response: Response): Promise<void> {
    const previewImagePath = item.previewImagePath?.trim() || '';

    if (!previewImagePath) {
      throw new NotFoundException(
        'Preview image not available for this media item.',
      );
    }

    if (this.isRemoteUrl(previewImagePath)) {
      response.redirect(previewImagePath);
      return;
    }

    await this.streamImageFromPath(previewImagePath, response);
  }

  async streamBackdropImage(
    item: MediaItem,
    response: Response,
  ): Promise<void> {
    const backdropImagePath = item.backdropImagePath?.trim() || '';

    if (!backdropImagePath) {
      throw new NotFoundException(
        'Backdrop image not available for this media item.',
      );
    }

    if (this.isRemoteUrl(backdropImagePath)) {
      response.redirect(backdropImagePath);
      return;
    }

    await this.streamImageFromPath(backdropImagePath, response);
  }

  async streamChapterThumbnail(
    item: MediaItem,
    index: number,
    response: Response,
  ): Promise<void> {
    const thumbnail = item.chapterThumbnails[index];

    if (!thumbnail?.imagePath) {
      throw new NotFoundException('Chapter thumbnail not available.');
    }

    await this.streamImageFromPath(thumbnail.imagePath, response);
  }

  private async streamImageFromPath(
    imagePath: string,
    response: Response,
  ): Promise<void> {
    const resolvedPath = resolve(imagePath);

    let imageStats;
    try {
      imageStats = await stat(resolvedPath);
    } catch {
      throw new NotFoundException('Image file not found.');
    }

    if (!imageStats.isFile()) {
      throw new NotFoundException('Image file not found.');
    }

    const contentType = lookup(resolvedPath) || 'application/octet-stream';
    response.setHeader('Content-Type', contentType.toString());
    response.setHeader('Content-Length', imageStats.size);
    response.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(resolvedPath).pipe(response);
  }

  private isRemoteUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }
}
