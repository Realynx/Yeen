import { AniListCatalogService } from './anilist-catalog.service';

const ACTION_PAGE = {
  data: {
    Page: {
      pageInfo: { hasNextPage: true },
      media: [
        {
          idMal: 16498,
          format: 'TV',
          title: { english: 'Attack on Titan', romaji: 'Shingeki no Kyojin' },
          description: 'People fight <b>Titans</b>.<br>Humanity endures.',
          seasonYear: 2013,
          duration: 24,
          genres: ['Action', 'Drama'],
          tags: [{ name: 'Survival', rank: 92 }],
          coverImage: { extraLarge: 'https://images.example/poster.jpg' },
          bannerImage: 'https://images.example/backdrop.jpg',
        },
      ],
    },
  },
};

const ISEKAI_TAG_PAGE = {
  data: {
    genrePage: { media: [] },
    tagPage: {
      media: [
        {
          idMal: 1535,
          format: 'TV',
          title: { english: '.hack//SIGN' },
          genres: ['Adventure', 'Fantasy'],
          tags: [{ name: 'Isekai', rank: 88 }],
          coverImage: { large: 'https://images.example/hack-sign.jpg' },
        },
      ],
    },
  },
};

function cacheStore(staleValue?: unknown) {
  return {
    get: jest.fn().mockResolvedValue(staleValue),
    set: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AniListCatalogService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps public Anime Explorer pages to MAL-compatible remote candidates', async () => {
    const store = cacheStore();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(ACTION_PAGE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const service = new AniListCatalogService(store as never);

    const result = await service.searchCandidatesByTag({
      tag: 'Action',
      limit: 20,
      page: 1,
      useCache: false,
    });

    expect(result).toEqual([
      expect.objectContaining({
        provider: 'jikan',
        providerId: '16498',
        catalogSourceLabel: 'AniList',
        title: 'Attack on Titan',
        mediaType: 'show',
        tags: ['Action', 'Drama', 'Survival'],
        overview: 'People fight Titans.\nHumanity endures.',
        runtimeSeconds: 1440,
      }),
    ]);
    expect(store.set).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1];
    const requestBody = request?.body;
    expect(typeof requestBody).toBe('string');
    expect(
      JSON.parse(typeof requestBody === 'string' ? requestBody : '{}'),
    ).toEqual(
      expect.objectContaining({
        variables: { page: 1, perPage: 20, tag: 'Action' },
      }),
    );
  });

  it('searches AniList tags as well as genres for Anime Explorer filters', async () => {
    const store = cacheStore();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(ISEKAI_TAG_PAGE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const service = new AniListCatalogService(store as never);

    const result = await service.searchCandidatesByTag({
      tag: 'Isekai',
      limit: 20,
      page: 1,
      useCache: false,
    });

    expect(result).toEqual([
      expect.objectContaining({
        providerId: '1535',
        title: '.hack//SIGN',
        tags: ['Adventure', 'Fantasy', 'Isekai'],
      }),
    ]);
    const request = fetchMock.mock.calls[0]?.[1];
    const requestBody = request?.body;
    const payload = JSON.parse(
      typeof requestBody === 'string' ? requestBody : '{}',
    ) as { query?: string; variables?: Record<string, unknown> };
    expect(payload.query).toContain('genre: $tag');
    expect(payload.query).toContain('tag: $tag');
    expect(payload.variables).toEqual({ page: 1, perPage: 20, tag: 'Isekai' });
  });

  it('serves the last successful page when a forced refresh fails', async () => {
    const store = cacheStore(ACTION_PAGE);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('temporarily unavailable', { status: 503 }),
      );
    const service = new AniListCatalogService(store as never);

    const result = await service.searchCandidatesByTag({
      tag: 'Action',
      limit: 20,
      page: 1,
      useCache: false,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.providerId).toBe('16498');
  });

  it('reports provider unavailability instead of returning a misleading empty page', async () => {
    const store = cacheStore();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('temporarily unavailable', { status: 503 }),
      );
    const service = new AniListCatalogService(store as never);

    await expect(
      service.searchCandidatesByTag({
        tag: 'Action',
        limit: 20,
        page: 1,
        useCache: false,
      }),
    ).rejects.toThrow('anime catalog provider is temporarily unavailable');
  });
});
