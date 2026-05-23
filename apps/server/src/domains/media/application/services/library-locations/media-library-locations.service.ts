import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaLocationsStore } from '../../../infrastructure/stores/media-locations.store';

@Injectable()
export class MediaLibraryLocationsService {
  constructor(
    private readonly mediaLocationsStore: MediaLocationsStore,
    private readonly configService: ConfigService,
  ) {}

  async getLocations(): Promise<{
    locations: string[];
    source: 'settings' | 'env';
  }> {
    const configured = await this.mediaLocationsStore.all();
    const locations =
      configured.length > 0
        ? configured
        : this.normalizeLocations(this.defaultLibraryPaths());

    return {
      locations,
      source: configured.length > 0 ? 'settings' : 'env',
    };
  }

  async setLocations(locations: string[]): Promise<{
    locations: string[];
    source: 'settings';
  }> {
    const normalized = this.normalizeLocations(locations);
    const saved = await this.mediaLocationsStore.replaceAll(normalized);

    return {
      locations: saved,
      source: 'settings',
    };
  }

  async resolveScanLocations(
    libraryPath?: string,
    libraryPaths?: string[],
  ): Promise<string[]> {
    if (Array.isArray(libraryPaths) && libraryPaths.length > 0) {
      return this.normalizeLocations(libraryPaths);
    }

    if (libraryPath?.trim()) {
      return this.normalizeLocations([libraryPath]);
    }

    const configured = await this.mediaLocationsStore.all();
    if (configured.length > 0) {
      return this.normalizeLocations(configured);
    }

    return this.normalizeLocations(this.defaultLibraryPaths());
  }

  private defaultLibraryPaths(): string[] {
    const pathFromPlural =
      this.configService.get<string>('MEDIA_LIBRARY_PATHS') ?? '';
    const pathFromSingle =
      this.configService.get<string>('MEDIA_LIBRARY_PATH') ?? '';
    const combined = [pathFromPlural, pathFromSingle].filter(Boolean).join(';');

    if (!combined) {
      return [];
    }

    return combined
      .split(/[;,\n]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private normalizeLocations(paths: string[]): string[] {
    const unique = new Set<string>();
    for (const rawPath of paths) {
      const trimmed = rawPath.trim();
      if (!trimmed) {
        continue;
      }

      unique.add(trimmed);
    }

    return [...unique];
  }
}
