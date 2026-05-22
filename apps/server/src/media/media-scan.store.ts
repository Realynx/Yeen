import { Injectable } from '@nestjs/common';
import {
  createIdleMediaScanProgress,
  MediaScanProgress,
} from './entities/media-scan-progress.entity';

@Injectable()
export class MediaScanStore {
  private state: MediaScanProgress = createIdleMediaScanProgress();

  get(): MediaScanProgress {
    return this.clone(this.state);
  }

  start(scanId: string, libraryPaths: string[]): MediaScanProgress {
    const now = new Date().toISOString();

    this.state = {
      scanId,
      status: 'running',
      phase: 'collecting',
      libraryPaths: [...libraryPaths],
      totalFiles: 0,
      processedFiles: 0,
      indexedItems: 0,
      failedFiles: 0,
      skippedIndexedFiles: 0,
      currentFile: null,
      message: 'Collecting media files...',
      error: null,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
      scannedAt: null,
    };

    return this.clone(this.state);
  }

  update(
    scanId: string,
    patch: Partial<Omit<MediaScanProgress, 'scanId'>>,
  ): MediaScanProgress {
    if (this.state.scanId !== scanId) {
      return this.clone(this.state);
    }

    this.state = {
      ...this.state,
      ...patch,
      libraryPaths: patch.libraryPaths
        ? [...patch.libraryPaths]
        : this.state.libraryPaths,
      updatedAt: new Date().toISOString(),
    };

    return this.clone(this.state);
  }

  complete(
    scanId: string,
    patch: Partial<Omit<MediaScanProgress, 'scanId'>> = {},
  ): MediaScanProgress {
    const now = new Date().toISOString();

    return this.update(scanId, {
      status: 'completed',
      phase: 'completed',
      currentFile: null,
      error: null,
      completedAt: now,
      scannedAt: now,
      ...patch,
    });
  }

  fail(
    scanId: string,
    errorMessage: string,
    patch: Partial<Omit<MediaScanProgress, 'scanId'>> = {},
  ): MediaScanProgress {
    const now = new Date().toISOString();

    return this.update(scanId, {
      status: 'failed',
      phase: 'failed',
      currentFile: null,
      message: 'Media scan failed.',
      error: errorMessage,
      completedAt: now,
      ...patch,
    });
  }

  private clone(state: MediaScanProgress): MediaScanProgress {
    return {
      ...state,
      libraryPaths: [...state.libraryPaths],
    };
  }
}
