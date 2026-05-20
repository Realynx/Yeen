import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { SubtitleStorageService } from './subtitle-storage.service';

@Injectable()
export class SubtitleFileStreamService {
  constructor(
    private readonly subtitleStorageService: SubtitleStorageService,
  ) {}

  getSubtitleFile(mediaId: string, fileName: string) {
    const fullPath = this.subtitleStorageService.resolveExistingSubtitlePath(
      mediaId,
      fileName,
    );

    return createReadStream(fullPath);
  }
}
