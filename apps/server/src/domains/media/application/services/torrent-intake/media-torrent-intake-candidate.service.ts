import { Injectable } from '@nestjs/common';
import { stat } from 'node:fs/promises';
import { TorrentMediaIndexStore } from '../../../../torrent/infrastructure/stores/torrent-media-index.store';
import { MediaStore } from '../../../infrastructure/stores/media.store';
import { MediaIndexRefreshPolicyService } from '../index-refresh/media-index-refresh-policy.service';
import { MediaTorrentIndexingService } from './media-torrent-indexing.service';
import { MediaService } from '../media.service';

@Injectable()
export class MediaTorrentIntakeCandidateService {
  constructor(
    private readonly mediaStore: MediaStore,
    private readonly torrentMediaIndexStore: TorrentMediaIndexStore,
    private readonly mediaIndexRefreshPolicyService: MediaIndexRefreshPolicyService,
    private readonly mediaTorrentIndexingService: MediaTorrentIndexingService,
    private readonly mediaService: MediaService,
  ) {}

  async processAutomaticTorrentIntakeCandidate(
    normalizedHash: string,
    refreshCooldownMs: number,
  ): Promise<void> {
    if (!normalizedHash) {
      return;
    }

    const existingMapping = await this.torrentMediaIndexStore.get(normalizedHash);
    if (existingMapping) {
      const existingMedia = await this.mediaStore.findById(existingMapping.mediaId);
      if (existingMedia) {
        const existsOnDisk = await this.fileExists(existingMedia.filePath);
        if (!existsOnDisk) {
          await this.torrentMediaIndexStore.remove(normalizedHash);
        } else {
          const shouldRefresh =
            this.mediaIndexRefreshPolicyService.shouldRefreshIndexedItem(
              existingMedia,
            ) &&
            this.mediaIndexRefreshPolicyService.isMetadataRefreshOlderThan(
              existingMedia,
              refreshCooldownMs,
            );

          if (shouldRefresh) {
            await this.mediaService.refreshIndexedMediaItemForAutomaticIntake(
              existingMedia,
            );
          }

          return;
        }
      } else {
        await this.torrentMediaIndexStore.remove(normalizedHash);
      }
    }

    await this.mediaTorrentIndexingService.indexTorrentFile(normalizedHash);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }
}
