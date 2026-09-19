import { MediaEpisodeCatalogService } from './media-episode-catalog.service';

describe('MediaEpisodeCatalogService remote series catalog', () => {
  it('returns provider-neutral seasons and episodes for a remote TMDB series', async () => {
    const tmdbMetadataService = {
      getSeriesEpisodeCatalog: jest.fn().mockResolvedValue({
        providerId: '1399',
        totalEpisodeCount: 3,
        updatedAt: '2026-08-26T12:00:00.000Z',
        episodes: [
          {
            seasonNumber: 2,
            episodeNumber: 2,
            title: 'The Night Lands',
            synopsis: 'Arya shares a secret.',
            airedAt: '2012-04-08',
          },
          {
            seasonNumber: 1,
            episodeNumber: 1,
            title: 'Winter Is Coming',
            synopsis: 'The royal party arrives.',
            airedAt: '2011-04-17',
          },
          {
            seasonNumber: 2,
            episodeNumber: 1,
            title: 'The North Remembers',
            synopsis: null,
            airedAt: '2012-04-01',
          },
        ],
      }),
    };
    const service = new MediaEpisodeCatalogService(
      {} as never,
      tmdbMetadataService as never,
      {} as never,
    );

    const result = await service.getRemoteSeriesEpisodeCatalog({
      id: 'remote_tmdb_show_1399',
      type: 'show',
      isRemote: true,
      remoteSource: 'tmdb',
      remoteSourceId: '1399',
    } as never);

    expect(result).toEqual({
      status: 'ready',
      source: 'tmdb',
      sourceLabel: 'TMDB',
      providerId: '1399',
      totalEpisodeCount: 3,
      updatedAt: '2026-08-26T12:00:00.000Z',
      seasons: [
        {
          seasonNumber: 1,
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'Winter Is Coming',
              synopsis: 'The royal party arrives.',
              airedAt: '2011-04-17',
            },
          ],
        },
        {
          seasonNumber: 2,
          episodes: [
            {
              seasonNumber: 2,
              episodeNumber: 1,
              title: 'The North Remembers',
              synopsis: null,
              airedAt: '2012-04-01',
            },
            {
              seasonNumber: 2,
              episodeNumber: 2,
              title: 'The Night Lands',
              synopsis: 'Arya shares a secret.',
              airedAt: '2012-04-08',
            },
          ],
        },
      ],
    });
  });

  it('normalizes Jikan anime episodes into season one', async () => {
    const jikanMetadataService = {
      getSeriesEpisodeCatalog: jest.fn().mockResolvedValue({
        providerId: '52991',
        totalEpisodeCount: 1,
        updatedAt: '2026-08-26T12:00:00.000Z',
        episodes: [
          {
            episodeNumber: 7,
            title: 'The Mage and the Swordsman',
            synopsis: null,
            airedAt: '2024-02-18',
          },
        ],
      }),
    };
    const service = new MediaEpisodeCatalogService(
      {} as never,
      {} as never,
      jikanMetadataService as never,
    );

    const result = await service.getRemoteSeriesEpisodeCatalog({
      id: 'remote_jikan_show_52991',
      type: 'show',
      isRemote: true,
      remoteSource: 'jikan',
      remoteSourceId: '52991',
    } as never);

    expect(result).toMatchObject({
      status: 'ready',
      source: 'jikan',
      providerId: '52991',
      seasons: [
        {
          seasonNumber: 1,
          episodes: [
            {
              seasonNumber: 1,
              episodeNumber: 7,
              title: 'The Mage and the Swordsman',
            },
          ],
        },
      ],
    });
  });
});
