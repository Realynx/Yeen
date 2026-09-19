import type { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import type { MetadataApiCacheStore } from '../../../infrastructure/stores/metadata-api-cache.store';
import { TheAudioDbMusicService } from './the-audio-db-music.service';

describe('TheAudioDbMusicService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the free v1 key and maps recording identifiers', async () => {
    const { service, setCache } = createService();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          track: [
            {
              idTrack: '32724184',
              idAlbum: '2109615',
              idArtist: '111239',
              strTrack: 'Yellow',
              strArtist: 'Coldplay',
              strAlbum: 'Parachutes',
              intDuration: '269240',
              strISRC: 'GBAYE0000267',
              strMusicBrainzID: 'track-mbid',
              strTrackThumb: 'https://images.example/yellow.jpg',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const items = await service.search('Coldplay - Yellow', 10);

    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      '/api/v1/json/123/searchtrack.php?s=Coldplay&t=Yellow',
    );
    expect(items[0]).toMatchObject({
      title: 'Yellow',
      artists: ['Coldplay'],
      durationSeconds: 269,
      externalIds: {
        isrc: 'GBAYE0000267',
        musicBrainzTrackId: 'track-mbid',
      },
    });
    expect(setCache).toHaveBeenCalled();
  });

  it('uses premium v2 authentication without placing the custom key in the URL', async () => {
    const { service } = createService({
      theAudioDbCustomApiKey: 'premium-secret',
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ tracks: [] }), { status: 200 }),
      );

    await service.search('Yellow', 10);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).not.toContain('premium-secret');
    expect(init?.headers).toEqual({ 'X-API-KEY': 'premium-secret' });
  });

  it('rejects stale trending snapshots', async () => {
    const { service } = createService();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          trending: [
            {
              idTrack: '1',
              strTrack: 'Old chart entry',
              strArtist: 'Artist',
              dateAdded: '2025-02-16 00:00:04',
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(service.discover('US', 10)).resolves.toEqual([]);
  });
});

function createService(overrides: Record<string, unknown> = {}) {
  const settingsService = {
    getSettings: jest.fn().mockResolvedValue({
      theAudioDbEnabled: true,
      theAudioDbCustomApiKey: '',
      theAudioDbChartCountry: 'US',
      ...overrides,
    }),
  } as unknown as SystemSettingsService;
  const setCache = jest.fn().mockResolvedValue(undefined);
  const cache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: setCache,
  } as unknown as jest.Mocked<MetadataApiCacheStore>;
  return {
    cache,
    setCache,
    service: new TheAudioDbMusicService(settingsService, cache),
  };
}
