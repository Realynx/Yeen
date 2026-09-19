import type { MediaItem } from '../../../media/domain/entities/media-item.entity';
import { SubtitlePreExtractionJobService } from './subtitle-pre-extraction-job.service';

function videoMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'media-1',
    title: 'Episode One',
    libraryType: 'video',
    digitalMediaType: 'video',
    subtitleStreams: 1,
    ...overrides,
  } as MediaItem;
}

async function waitForTerminalStatus(service: SubtitlePreExtractionJobService) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const progress = service.getProgress();
    if (progress.status !== 'running') return progress;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Subtitle pre-extraction job did not finish.');
}

describe('SubtitlePreExtractionJobService', () => {
  it('starts in the background and completes missing Subtitle Extraction for a Local Media Item', async () => {
    const mediaStore = {
      all: jest.fn().mockResolvedValue([videoMediaItem()]),
    };
    const subtitleExtractionService = {
      extractAllEmbedded: jest.fn().mockResolvedValue({
        mediaId: 'media-1',
        totalTracks: 1,
        extracted: 1,
        alreadyReady: 0,
        unsupported: 0,
        failed: 0,
        tracks: [],
      }),
    };
    const service = new SubtitlePreExtractionJobService(
      mediaStore as never,
      subtitleExtractionService as never,
    );

    const started = service.start();
    const completed = await waitForTerminalStatus(service);

    expect(started.status).toBe('running');
    expect(completed).toMatchObject({
      status: 'completed',
      totalMediaItems: 1,
      processedMediaItems: 1,
      extractedTracks: 1,
      existingTracks: 0,
      failedMediaItems: 0,
    });
    expect(subtitleExtractionService.extractAllEmbedded).toHaveBeenCalledWith(
      'media-1',
    );
  });

  it('inspects every Local video even when its indexed subtitle count is stale', async () => {
    const mediaStore = {
      all: jest
        .fn()
        .mockResolvedValue([
          videoMediaItem({ id: 'stale-media', subtitleStreams: 0 }),
        ]),
    };
    const subtitleExtractionService = {
      extractAllEmbedded: jest.fn().mockResolvedValue({
        mediaId: 'stale-media',
        totalTracks: 1,
        extracted: 1,
        alreadyReady: 0,
        unsupported: 0,
        failed: 0,
        tracks: [],
      }),
    };
    const service = new SubtitlePreExtractionJobService(
      mediaStore as never,
      subtitleExtractionService as never,
    );

    service.start();
    const completed = await waitForTerminalStatus(service);

    expect(completed).toMatchObject({
      status: 'completed',
      totalMediaItems: 1,
      extractedTracks: 1,
    });
    expect(subtitleExtractionService.extractAllEmbedded).toHaveBeenCalledWith(
      'stale-media',
    );
  });

  it('uses a bounded worker pool while inspecting a large Media Library', async () => {
    const mediaStore = {
      all: jest
        .fn()
        .mockResolvedValue(
          Array.from({ length: 6 }, (_, index) =>
            videoMediaItem({ id: `media-${index}`, title: `Item ${index}` }),
          ),
        ),
    };
    let activeInspections = 0;
    let peakInspections = 0;
    const subtitleExtractionService = {
      extractAllEmbedded: jest
        .fn()
        .mockImplementation(async (mediaId: string) => {
          activeInspections += 1;
          peakInspections = Math.max(peakInspections, activeInspections);
          await new Promise((resolve) => setTimeout(resolve, 5));
          activeInspections -= 1;
          return {
            mediaId,
            totalTracks: 0,
            extracted: 0,
            alreadyReady: 0,
            unsupported: 0,
            failed: 0,
            tracks: [],
          };
        }),
    };
    const service = new SubtitlePreExtractionJobService(
      mediaStore as never,
      subtitleExtractionService as never,
    );

    service.start();
    const completed = await waitForTerminalStatus(service);

    expect(completed.processedMediaItems).toBe(6);
    expect(peakInspections).toBe(2);
  });

  it('keeps one job active when the manual trigger is pressed repeatedly', async () => {
    let releaseCatalog!: (items: MediaItem[]) => void;
    const mediaStore = {
      all: jest.fn().mockReturnValue(
        new Promise<MediaItem[]>((resolve) => {
          releaseCatalog = resolve;
        }),
      ),
    };
    const service = new SubtitlePreExtractionJobService(
      mediaStore as never,
      {
        extractAllEmbedded: jest.fn().mockResolvedValue({
          mediaId: 'unused',
          totalTracks: 0,
          extracted: 0,
          alreadyReady: 0,
          unsupported: 0,
          failed: 0,
          tracks: [],
        }),
      } as never,
    );

    const first = service.start();
    const second = service.start();

    expect(second.jobId).toBe(first.jobId);
    expect(mediaStore.all).toHaveBeenCalledTimes(1);

    releaseCatalog([]);
    await waitForTerminalStatus(service);
  });

  it('continues extracting other tracks and reports a partial media failure', async () => {
    const mediaStore = {
      all: jest.fn().mockResolvedValue([videoMediaItem()]),
    };
    const subtitleExtractionService = {
      extractAllEmbedded: jest.fn().mockResolvedValue({
        mediaId: 'media-1',
        totalTracks: 2,
        extracted: 1,
        alreadyReady: 0,
        unsupported: 0,
        failed: 1,
        tracks: [
          {
            streamIndex: 2,
            format: 'subrip',
            status: 'failed',
            url: null,
            error: 'Unsupported subtitle payload',
          },
          {
            streamIndex: 3,
            format: 'subrip',
            status: 'extracted',
            url: '/subtitle.vtt',
            error: null,
          },
        ],
      }),
    };
    const service = new SubtitlePreExtractionJobService(
      mediaStore as never,
      subtitleExtractionService as never,
    );

    service.start();
    const completed = await waitForTerminalStatus(service);

    expect(completed).toMatchObject({
      status: 'completed',
      processedMediaItems: 1,
      extractedTracks: 1,
      failedTracks: 1,
      failedMediaItems: 1,
    });
  });
});
