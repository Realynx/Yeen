import { Injectable } from '@nestjs/common';
import type { MediaItem } from '../../domain/entities/media-item.entity';
import { MediaLocationsStore } from '../../infrastructure/stores/media-locations.store';
import { MediaStore } from '../../infrastructure/stores/media.store';
import { MediaIndexRefreshPolicyService } from './index-refresh/media-index-refresh-policy.service';
import { MediaPathResolverService } from './path-resolution/media-path-resolver.service';
import {
  MediaScannerService,
  type MediaProbeHint,
} from './scanner/media-scanner.service';
import { MediaIndexedItemRefreshService } from './index-refresh/media-indexed-item-refresh.service';

export const LOCAL_MEDIA_ITEM_INTAKE = Symbol.for(
  'com.yeen.addons.local-media-intake.v1',
);

/** Deep Core seam used by optional add-ons to hand playable files to the library. */
@Injectable()
export class LocalMediaItemIntakeFacade {
  constructor(
    private readonly store: MediaStore,
    private readonly locations: MediaLocationsStore,
    private readonly scanner: MediaScannerService,
    private readonly paths: MediaPathResolverService,
    private readonly refreshPolicy: MediaIndexRefreshPolicyService,
    private readonly indexedItemRefresh: MediaIndexedItemRefreshService,
  ) {}

  findById(id: string) {
    return this.store.findById(id);
  }

  findByFilePath(filePath: string) {
    return this.store.findByFilePath(filePath);
  }

  upsert(item: MediaItem) {
    return this.store.upsert(item);
  }

  listLibraryLocations() {
    return this.locations.all();
  }

  listTypedLibraryLocations() {
    return this.locations.allTyped();
  }

  buildAbsoluteFileCandidates(input: {
    savePath: string;
    contentPath: string | null;
    sourceRelativePath: string;
  }) {
    return this.paths.buildExternalAbsoluteFileCandidates({
      savePath: input.savePath,
      contentPath: input.contentPath,
      sourceRelativePath: input.sourceRelativePath,
    });
  }

  probeFile(filePath: string, libraryRoot: string, hint?: MediaProbeHint) {
    return this.scanner.probeFile(filePath, libraryRoot, hint);
  }

  async refreshIfStale(item: MediaItem, cooldownMs: number): Promise<void> {
    if (
      this.refreshPolicy.shouldRefreshIndexedItem(item) &&
      this.refreshPolicy.isMetadataRefreshOlderThan(item, cooldownMs)
    ) {
      await this.indexedItemRefresh.refreshIndexedMediaItem(item);
    }
  }
}
