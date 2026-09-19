import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { JsonFileStore } from '../../../core/infrastructure/shared/json-file-store';
import type { MediaLibraryLocation } from '@yeen/shared-contracts';

export function parsePersistedMediaLocations(
  value: unknown,
): MediaLibraryLocation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): MediaLibraryLocation[] => {
    if (typeof entry === 'string') {
      return [{ path: entry, type: 'video' }];
    }
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const candidate = entry as Partial<MediaLibraryLocation>;
    if (
      typeof candidate.path !== 'string' ||
      (candidate.type !== 'video' && candidate.type !== 'music')
    ) {
      return [];
    }
    return [{ path: candidate.path, type: candidate.type }];
  });
}

@Injectable()
export class MediaLocationsStore extends JsonFileStore<MediaLibraryLocation[]> {
  constructor() {
    super(join(process.cwd(), 'data', 'media-locations.json'), []);
  }

  async all(): Promise<string[]> {
    await this.ensureLoaded();
    return this.state.map((location) => location.path);
  }

  async allTyped(): Promise<MediaLibraryLocation[]> {
    await this.ensureLoaded();
    return this.state.map((location) => ({ ...location }));
  }

  async replaceAll(
    nextLocations: readonly MediaLibraryLocation[],
  ): Promise<MediaLibraryLocation[]> {
    await this.ensureLoaded();
    this.state = nextLocations.map((location) => ({ ...location }));
    await this.queueSave();
    return this.state.map((location) => ({ ...location }));
  }

  protected parseLoadedState(value: unknown): MediaLibraryLocation[] {
    return parsePersistedMediaLocations(value);
  }

  protected defaultState(): MediaLibraryLocation[] {
    return [];
  }
}
