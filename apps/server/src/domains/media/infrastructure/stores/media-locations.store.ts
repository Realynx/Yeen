import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { JsonFileStore } from '../../../core/infrastructure/shared/json-file-store';

@Injectable()
export class MediaLocationsStore extends JsonFileStore<string[]> {
  constructor() {
    super(join(process.cwd(), 'data', 'media-locations.json'), []);
  }

  async all(): Promise<string[]> {
    await this.ensureLoaded();
    return [...this.state];
  }

  async replaceAll(nextLocations: string[]): Promise<string[]> {
    await this.ensureLoaded();
    this.state = [...nextLocations];
    await this.queueSave();
    return [...this.state];
  }

  protected parseLoadedState(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  protected defaultState(): string[] {
    return [];
  }
}
