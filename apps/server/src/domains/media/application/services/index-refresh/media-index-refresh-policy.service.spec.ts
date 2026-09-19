import type { MediaItem } from '../../../domain/entities/media-item.entity';
import { MediaIndexRefreshPolicyService } from './media-index-refresh-policy.service';

describe('MediaIndexRefreshPolicyService', () => {
  const service = new MediaIndexRefreshPolicyService();

  it('does not repeatedly refresh a probed music track without tags or artwork', () => {
    const track = {
      libraryType: 'music',
      extension: '.flac',
      container: 'flac',
      mediaDetails: { formatName: 'flac' },
      audioCodec: 'flac',
      videoCodec: null,
      width: null,
      height: null,
      subtitleStreams: 0,
      chapterThumbnails: [],
      tags: [],
      description: null,
      previewImagePath: null,
      backdropImagePath: null,
      remoteSource: null,
      remoteSourceId: null,
    } as unknown as MediaItem;

    expect(service.shouldRefreshIndexedItem(track)).toBe(false);
  });

  it('preserves artwork refresh behavior for video items', () => {
    const video = {
      libraryType: 'video',
      extension: '.mkv',
      container: 'matroska',
      mediaDetails: { formatName: 'matroska' },
      audioCodec: 'aac',
      videoCodec: 'h264',
      width: 1920,
      height: 1080,
      subtitleStreams: 0,
      chapterThumbnails: [],
      tags: [],
      description: null,
      previewImagePath: null,
      backdropImagePath: null,
      remoteSource: null,
      remoteSourceId: null,
    } as unknown as MediaItem;

    expect(service.shouldRefreshIndexedItem(video)).toBe(true);
  });
});
