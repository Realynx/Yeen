import { Module } from '@nestjs/common';
import { MetadataApiCacheStore } from './infrastructure/stores/metadata-api-cache.store';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { MediaAiMetadataService } from './application/services/ai-metadata/media-ai-metadata.service';
import { MediaAiTitleProviderService } from './application/services/ai-metadata/media-ai-title-provider.service';
import { MediaController } from './presentation/controllers/media.controller';
import { MediaImagesController } from './presentation/controllers/media-images.controller';
import { MediaLocationsStore } from './infrastructure/stores/media-locations.store';
import { MediaNfoReader } from './infrastructure/media-nfo.reader';
import { MediaPreviewResolver } from './infrastructure/resolvers/media-preview.resolver';
import { MediaProbeAdapter } from './infrastructure/media-probe.adapter';
import { MediaScannerService } from './application/services/scanner/media-scanner.service';
import { MediaScanStore } from './infrastructure/stores/media-scan.store';
import { MediaService } from './application/services/media.service';
import { MediaStore } from './infrastructure/stores/media.store';
import { MediaSubtitleResolver } from './infrastructure/resolvers/media-subtitle.resolver';
import { JikanMetadataService } from './application/services/remote-metadata/jikan-metadata.service';
import { TmdbMetadataService } from './application/services/remote-metadata/tmdb-metadata.service';
import { MediaCommitStore } from './infrastructure/stores/media-commit.store';
import { MediaFsCommitService } from './application/services/filesystem/media-fs-commit.service';
import { MediaFsCommitPlannerService } from './application/services/filesystem/media-fs-commit-planner.service';
import { MediaFsFileOpsService } from './application/services/filesystem/media-fs-file-ops.service';
import { MediaFsNfoService } from './application/services/filesystem/media-fs-nfo.service';
import { MediaFsRollbackService } from './application/services/filesystem/media-fs-rollback.service';
import { IptorrentsSearchService } from './application/services/torrent-search/iptorrents-search.service';
import { NyaaSearchService } from './application/services/torrent-search/nyaa-search.service';
import { MediaPathResolverService } from './application/services/path-resolution/media-path-resolver.service';
import { MediaTorrentIndexingService } from './application/services/torrent-intake/media-torrent-indexing.service';
import { MediaTorrentIntakePollingService } from './application/services/torrent-intake/media-torrent-intake-polling.service';
import { MediaTorrentIntakeCandidateService } from './application/services/torrent-intake/media-torrent-intake-candidate.service';
import { MediaSearchTorrentDownloadService } from './application/services/torrent-intake/media-search-torrent-download.service';
import { MediaLibraryLocationsService } from './application/services/media-library-locations.service';
import { MediaStorageSummaryService } from './application/services/media-storage-summary.service';
import { MediaIndexRefreshPolicyService } from './application/services/index-refresh/media-index-refresh-policy.service';
import { MediaIndexedItemRefreshService } from './application/services/index-refresh/media-indexed-item-refresh.service';
import { MediaIndexedItemMergeService } from './application/services/index-refresh/media-indexed-item-merge.service';
import { MediaRemoteCatalogService } from './application/services/remote-catalog/media-remote-catalog.service';
import { MediaMetadataPatchApplicationService } from './application/services/metadata-update/media-metadata-patch-application.service';
import { MediaMetadataPatchEnrichmentService } from './application/services/metadata-update/media-metadata-patch-enrichment.service';
import { MediaMetadataArtworkRefreshService } from './application/services/metadata-update/media-metadata-artwork-refresh.service';
import { MediaMetadataIoService } from './application/services/metadata-io/media-metadata-io.service';
import { MediaMetadataImportNormalizerService } from './application/services/metadata-io/media-metadata-import-normalizer.service';
import { MediaFileResolutionService } from './application/services/path-resolution/media-file-resolution.service';
import { MediaImageStreamService } from './application/services/media-image-stream.service';
import { MediaPlaybackService } from './application/services/media-playback.service';
import { MediaEpisodeNavigationService } from './application/services/media-episode-navigation.service';
import { MediaScanExecutionService } from './application/services/media-scan-execution.service';
import { MediaRecycleDeletionsService } from './application/services/recycle-deletions/media-recycle-deletions.service';
import { MediaPermanentDeleteService } from './application/services/recycle-deletions/media-permanent-delete.service';
import { MediaEpisodeCatalogService } from './application/services/episode-catalog/media-episode-catalog.service';
import { TorrentModule } from '../torrent/torrent.module';

@Module({
  imports: [SystemSettingsModule, TorrentModule],
  controllers: [MediaController, MediaImagesController],
  providers: [
    MediaStore,
    MediaLocationsStore,
    MetadataApiCacheStore,
    MediaAiMetadataService,
    MediaAiTitleProviderService,
    TmdbMetadataService,
    JikanMetadataService,
    MediaNfoReader,
    MediaProbeAdapter,
    MediaSubtitleResolver,
    MediaPreviewResolver,
    MediaScannerService,
    MediaScanStore,
    MediaCommitStore,
    MediaFsCommitPlannerService,
    MediaFsFileOpsService,
    MediaFsNfoService,
    MediaFsRollbackService,
    MediaPathResolverService,
    MediaTorrentIndexingService,
    MediaSearchTorrentDownloadService,
    MediaTorrentIntakeCandidateService,
    MediaTorrentIntakePollingService,
    MediaLibraryLocationsService,
    MediaStorageSummaryService,
    MediaIndexRefreshPolicyService,
    MediaIndexedItemMergeService,
    MediaIndexedItemRefreshService,
    MediaRemoteCatalogService,
    MediaEpisodeCatalogService,
    MediaMetadataPatchApplicationService,
    MediaMetadataPatchEnrichmentService,
    MediaMetadataArtworkRefreshService,
    MediaMetadataIoService,
    MediaMetadataImportNormalizerService,
    MediaFileResolutionService,
    MediaImageStreamService,
    MediaPlaybackService,
    MediaEpisodeNavigationService,
    MediaScanExecutionService,
    MediaRecycleDeletionsService,
    MediaPermanentDeleteService,
    MediaFsCommitService,
    IptorrentsSearchService,
    NyaaSearchService,
    MediaService,
  ],
  exports: [MediaService, MediaEpisodeNavigationService],
})
export class MediaModule {}
