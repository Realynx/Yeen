import type { RemoteMusicResult } from '@yeen/shared-contracts';
import { RemoteMusicSourceRegistry } from '../../../../core/application/extensions/remote-music-source';
import type { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import type { MediaStore } from '../../../infrastructure/stores/media.store';
import { RemoteMusicCatalogService } from './remote-music-catalog.service';
import type { TheAudioDbMusicService } from './the-audio-db-music.service';

describe('RemoteMusicCatalogService', () => {
  it('deduplicates provider results by ISRC and links matching local music', async () => {
    const registry = new RemoteMusicSourceRegistry();
    registry.register({
      adapterId: 'downloader.youtube',
      provider: 'youtube',
      search: jest.fn().mockResolvedValue([
        result({
          id: 'youtube:abc',
          artworkUrl: null,
          sources: [source('youtube', 'abc')],
        }),
      ]),
    });
    const theAudioDb = {
      provider: 'theaudiodb',
      search: jest
        .fn()
        .mockResolvedValue([
          result({ sources: [source('theaudiodb', 'track-1')] }),
        ]),
    } as unknown as TheAudioDbMusicService;
    const mediaStore = {
      all: jest.fn().mockResolvedValue([
        {
          id: 'local-1',
          title: 'Yellow',
          libraryType: 'music',
          durationSeconds: 269,
          musicMetadata: { artist: 'Coldplay' },
        },
      ]),
    } as unknown as MediaStore;
    const settings = {
      getSettings: jest
        .fn()
        .mockResolvedValue({ theAudioDbChartCountry: 'US' }),
    } as unknown as SystemSettingsService;
    const service = new RemoteMusicCatalogService(
      theAudioDb,
      registry,
      mediaStore,
      settings,
    );

    const response = await service.search({ query: 'Yellow', limit: 20 });

    expect(response.total).toBe(1);
    expect(response.providers).toEqual(['theaudiodb', 'youtube']);
    expect(response.items[0]?.localMediaId).toBe('local-1');
    expect(response.items[0]?.sources).toHaveLength(2);
  });

  it('isolates an add-on provider failure', async () => {
    const registry = new RemoteMusicSourceRegistry();
    registry.register({
      adapterId: 'broken',
      provider: 'soundcloud',
      search: jest.fn().mockRejectedValue(new Error('offline')),
    });
    const service = new RemoteMusicCatalogService(
      {
        provider: 'theaudiodb',
        search: jest.fn().mockResolvedValue([result()]),
      } as unknown as TheAudioDbMusicService,
      registry,
      { all: jest.fn().mockResolvedValue([]) } as unknown as MediaStore,
      {
        getSettings: jest
          .fn()
          .mockResolvedValue({ theAudioDbChartCountry: 'US' }),
      } as unknown as SystemSettingsService,
    );

    await expect(service.search({ query: 'Yellow' })).resolves.toMatchObject({
      total: 1,
    });
  });

  it('builds TheAudioDB metadata candidates from a local track', async () => {
    const search = jest.fn().mockResolvedValue([result()]);
    const theAudioDb = {
      provider: 'theaudiodb',
      search,
    } as unknown as TheAudioDbMusicService;
    const mediaStore = {
      findById: jest.fn().mockResolvedValue({
        id: 'local-1',
        title: 'Yellow',
        libraryType: 'music',
        musicMetadata: { artist: 'Coldplay' },
      }),
      all: jest.fn().mockResolvedValue([]),
    } as unknown as MediaStore;
    const service = new RemoteMusicCatalogService(
      theAudioDb,
      new RemoteMusicSourceRegistry(),
      mediaStore,
      {} as SystemSettingsService,
    );

    await service.metadataCandidates('local-1', 5);

    expect(search).toHaveBeenCalledWith('Coldplay - Yellow', 5);
  });
});

function result(overrides: Partial<RemoteMusicResult> = {}): RemoteMusicResult {
  return {
    id: 'theaudiodb:track-1',
    title: 'Yellow',
    artists: ['Coldplay'],
    album: 'Parachutes',
    durationSeconds: 269,
    releaseYear: 2000,
    artworkUrl: 'https://images.example/yellow.jpg',
    externalIds: { isrc: 'GBAYE0000267' },
    sources: [source('theaudiodb', 'track-1')],
    localMediaId: null,
    ...overrides,
  };
}

function source(provider: string, sourceId: string) {
  return {
    provider,
    sourceId,
    url: `https://example.test/${sourceId}`,
    playable: false,
    acquirable: provider === 'youtube',
  };
}
