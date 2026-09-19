import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaLocationsStore } from '../../infrastructure/stores/media-locations.store';
import type {
  MediaLibraryLocation,
  MediaLibraryType,
} from '@yeen/shared-contracts';

@Injectable()
export class MediaLibraryLocationsService {
  constructor(
    private readonly mediaLocationsStore: MediaLocationsStore,
    private readonly configService: ConfigService,
  ) {}

  async getLocations(): Promise<{
    locations: string[];
    libraryLocations: MediaLibraryLocation[];
    source: 'settings' | 'env';
  }> {
    const configured = await this.mediaLocationsStore.allTyped();
    const libraryLocations =
      configured.length > 0
        ? configured
        : this.normalizeLocations(this.defaultLibraryPaths());

    return {
      locations: libraryLocations.map((location) => location.path),
      libraryLocations,
      source: configured.length > 0 ? 'settings' : 'env',
    };
  }

  async setLocations(
    locations: readonly (string | MediaLibraryLocation)[],
  ): Promise<{
    locations: string[];
    libraryLocations: MediaLibraryLocation[];
    source: 'settings';
  }> {
    const normalized = this.normalizeLocations(locations);
    const saved = await this.mediaLocationsStore.replaceAll(normalized);

    return {
      locations: saved.map((location) => location.path),
      libraryLocations: saved,
      source: 'settings',
    };
  }

  async resolveScanLocations(
    libraryPath?: string,
    libraryPaths?: string[],
  ): Promise<string[]> {
    return (
      await this.resolveScanLibraryLocations(libraryPath, libraryPaths)
    ).map((location) => location.path);
  }

  async resolveScanLibraryLocations(
    libraryPath?: string,
    libraryPaths?: string[],
    libraryLocations?: MediaLibraryLocation[],
  ): Promise<MediaLibraryLocation[]> {
    if (Array.isArray(libraryLocations) && libraryLocations.length > 0) {
      return this.normalizeLocations(libraryLocations);
    }
    if (Array.isArray(libraryPaths) && libraryPaths.length > 0) {
      return this.normalizeLocations(libraryPaths);
    }

    if (libraryPath?.trim()) {
      return this.normalizeLocations([libraryPath]);
    }

    const configured = await this.mediaLocationsStore.allTyped();
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

  private normalizeLocations(
    locations: readonly (string | MediaLibraryLocation)[],
  ): MediaLibraryLocation[] {
    const unique = new Map<string, MediaLibraryLocation>();
    for (const location of locations) {
      const rawPath = typeof location === 'string' ? location : location.path;
      const type: MediaLibraryType =
        typeof location === 'string' ? 'video' : location.type;
      const trimmed = rawPath.trim();
      if (!trimmed) {
        continue;
      }

      const key = trimmed.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, { path: trimmed, type });
      }
    }

    return [...unique.values()];
  }
}
