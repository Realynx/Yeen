import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { normalizeForKey } from '../../../infrastructure/helpers/title-normalizer';
import type {
  MediaItem,
  MusicMetadata,
  SeriesAssignmentRules,
} from '../../../domain/entities/media-item.entity';
import { MediaEpisodeCatalogService } from '../episode-catalog/media-episode-catalog.service';
import { MediaMetadataPatchApplicationService } from '../metadata-update/media-metadata-patch-application.service';
import {
  MediaMetadataIoService,
  type MetadataImportPathContext,
} from './media-metadata-io.service';

@Injectable()
export class MediaMetadataImportNormalizerService {
  constructor(
    private readonly mediaMetadataIoService: MediaMetadataIoService,
    private readonly mediaMetadataPatchApplicationService: MediaMetadataPatchApplicationService,
    private readonly mediaEpisodeCatalogService: MediaEpisodeCatalogService,
  ) {}

  normalizeImportedMediaItem(
    value: unknown,
    index: number,
    fallbackTimestamp: string,
    pathContext: MetadataImportPathContext,
  ): MediaItem {
    const context = `items[${index}]`;

    if (!this.mediaMetadataIoService.isObjectRecord(value)) {
      throw new BadRequestException(`Invalid metadata object at ${context}.`);
    }

    const title = this.mediaMetadataIoService.readRequiredString(
      value,
      'title',
      context,
    );
    const importedFilePath = this.mediaMetadataIoService.readRequiredString(
      value,
      'filePath',
      context,
    );
    const importedRelativePath = this.mediaMetadataIoService.readRequiredString(
      value,
      'relativePath',
      context,
    );
    const relativePath =
      this.mediaMetadataIoService.normalizeImportedRelativePath(
        importedRelativePath,
      );
    const filePath = this.mediaMetadataIoService.rebaseImportedFilePath(
      importedFilePath,
      relativePath,
      pathContext,
    );
    const id = this.importedId(value);
    const type = this.mediaMetadataIoService.normalizeImportedType(
      this.mediaMetadataIoService.readOptionalString(value, 'type'),
    );
    const normalizedTitle =
      this.mediaMetadataIoService.readOptionalString(
        value,
        'normalizedTitle',
      ) ?? normalizeForKey(title);
    const tags =
      this.mediaMetadataPatchApplicationService.normalizeEditableTags(
        this.mediaMetadataIoService.readStringArray(value, 'tags'),
      );
    const releaseYear =
      this.mediaMetadataPatchApplicationService.coerceOptionalInt(
        this.mediaMetadataIoService.readOptionalNumber(value, 'releaseYear'),
      );
    let seasonNumber =
      this.mediaMetadataPatchApplicationService.coerceOptionalInt(
        this.mediaMetadataIoService.readOptionalNumber(value, 'seasonNumber'),
      );
    let episodeNumber =
      this.mediaMetadataPatchApplicationService.coerceOptionalInt(
        this.mediaMetadataIoService.readOptionalNumber(value, 'episodeNumber'),
      );
    let episodeTitle = this.mediaMetadataIoService.readOptionalString(
      value,
      'episodeTitle',
    );

    if (type === 'show' && seasonNumber === null) {
      seasonNumber = 1;
    }

    if (type !== 'show') {
      seasonNumber = null;
      episodeNumber = null;
      episodeTitle = null;
    }

    const extension = this.importedExtension(value, filePath);
    const metadataRefreshedAt =
      this.mediaMetadataIoService.normalizeImportedTimestamp(
        this.mediaMetadataIoService.readOptionalString(
          value,
          'metadataRefreshedAt',
        ),
        fallbackTimestamp,
      );
    const updatedAt = this.mediaMetadataIoService.normalizeImportedTimestamp(
      this.mediaMetadataIoService.readOptionalString(value, 'updatedAt'),
      metadataRefreshedAt,
    );
    const remoteSource = this.mediaMetadataIoService.normalizeRemoteSource(
      this.mediaMetadataIoService.readOptionalString(value, 'remoteSource'),
    );
    const remoteSourceId = this.mediaMetadataIoService.readOptionalString(
      value,
      'remoteSourceId',
    );
    const episodeCatalogSource =
      this.mediaMetadataPatchApplicationService.normalizeEpisodeCatalogSource(
        this.mediaMetadataIoService.readOptionalString(
          value,
          'episodeCatalogSource',
        ),
      );
    const episodeCatalogSourceId =
      this.mediaMetadataIoService.readOptionalString(
        value,
        'episodeCatalogSourceId',
      );
    const digitalMediaType =
      this.mediaMetadataIoService.normalizeDigitalMediaType(
        this.mediaMetadataIoService.readOptionalString(
          value,
          'digitalMediaType',
        ),
      );
    const libraryType =
      this.mediaMetadataIoService.readOptionalString(value, 'libraryType') ===
        'music' || digitalMediaType === 'audio'
        ? 'music'
        : 'video';

    const item: MediaItem = {
      id,
      title,
      normalizedTitle,
      tags,
      description: this.mediaMetadataIoService.readOptionalString(
        value,
        'description',
      ),
      releaseYear,
      seasonNumber,
      episodeNumber,
      episodeTitle,
      dedupeKey: '',
      relativePath,
      filePath,
      extension,
      container: this.mediaMetadataIoService.readOptionalString(
        value,
        'container',
      ),
      type,
      digitalMediaType,
      libraryType,
      musicMetadata:
        libraryType === 'music'
          ? this.normalizeImportedMusicMetadata(value['musicMetadata'])
          : null,
      sizeBytes: this.mediaMetadataIoService.toNonNegativeInteger(
        this.mediaMetadataIoService.readOptionalNumber(value, 'sizeBytes'),
      ),
      durationSeconds: this.mediaMetadataIoService.toNonNegativeNumber(
        this.mediaMetadataIoService.readOptionalNumber(
          value,
          'durationSeconds',
        ),
      ),
      width: this.mediaMetadataIoService.toNonNegativeNullableInteger(
        this.mediaMetadataIoService.readOptionalNumber(value, 'width'),
      ),
      height: this.mediaMetadataIoService.toNonNegativeNullableInteger(
        this.mediaMetadataIoService.readOptionalNumber(value, 'height'),
      ),
      videoCodec: this.mediaMetadataIoService.readOptionalString(
        value,
        'videoCodec',
      ),
      audioCodec: this.mediaMetadataIoService.readOptionalString(
        value,
        'audioCodec',
      ),
      subtitleStreams: this.mediaMetadataIoService.toNonNegativeInteger(
        this.mediaMetadataIoService.readOptionalNumber(
          value,
          'subtitleStreams',
        ),
      ),
      subtitleDetails:
        this.mediaMetadataIoService.normalizeImportedSubtitleDetails(
          value['subtitleDetails'],
        ),
      previewImagePath: this.mediaMetadataIoService.readOptionalString(
        value,
        'previewImagePath',
      ),
      backdropImagePath: this.mediaMetadataIoService.readOptionalString(
        value,
        'backdropImagePath',
      ),
      chapterThumbnails:
        this.mediaMetadataIoService.normalizeImportedChapterThumbnails(
          value['chapterThumbnails'],
        ),
      mediaDetails: this.mediaMetadataIoService.normalizeImportedMediaDetails(
        value['mediaDetails'],
      ),
      metadataRefreshedAt,
      updatedAt,
      remoteSource,
      remoteSourceId: remoteSource ? remoteSourceId : null,
      remoteSourceLabel: remoteSource
        ? this.mediaMetadataPatchApplicationService.remoteSourceLabel(
            remoteSource,
          )
        : null,
      episodeCatalogSource,
      episodeCatalogSourceId: episodeCatalogSource
        ? episodeCatalogSourceId
        : null,
      seriesAssignmentRules:
        this.mediaMetadataPatchApplicationService.normalizeSeriesAssignmentRules(
          value['seriesAssignmentRules'] as
            | SeriesAssignmentRules
            | null
            | undefined,
        ),
    };

    this.mediaEpisodeCatalogService.reconcileEpisodeCatalogLink(
      item,
      null,
      null,
      false,
    );

    const importedDedupeKey = this.mediaMetadataIoService.readOptionalString(
      value,
      'dedupeKey',
    );
    item.dedupeKey =
      importedDedupeKey ||
      this.mediaMetadataPatchApplicationService.buildDedupeKey(item);

    return item;
  }

  private importedId(value: Record<string, unknown>): string {
    return (
      this.mediaMetadataIoService.readOptionalString(value, 'id') ??
      randomUUID()
    );
  }

  private importedExtension(
    value: Record<string, unknown>,
    filePath: string,
  ): string {
    return (
      this.mediaMetadataIoService.readOptionalString(value, 'extension') ||
      extname(filePath) ||
      '.bin'
    );
  }

  private normalizeImportedMusicMetadata(value: unknown): MusicMetadata {
    const record = this.mediaMetadataIoService.isObjectRecord(value)
      ? value
      : {};
    const readString = (key: string): string | null =>
      this.mediaMetadataIoService.readOptionalString(record, key);
    const readOrdinal = (key: string): number | null => {
      const raw = this.mediaMetadataIoService.readOptionalNumber(record, key);
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
        return null;
      }
      return Math.round(raw);
    };
    const rawArtworkKind = readString('artworkKind');

    return {
      artist: readString('artist'),
      album: readString('album'),
      albumArtist: readString('albumArtist'),
      trackNumber: readOrdinal('trackNumber'),
      discNumber: readOrdinal('discNumber'),
      genre: readString('genre'),
      artworkKind:
        rawArtworkKind === 'embedded' || rawArtworkKind === 'sidecar'
          ? rawArtworkKind
          : 'none',
    };
  }
}
