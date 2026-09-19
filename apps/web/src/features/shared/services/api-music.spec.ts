import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverRemoteMusic, searchRemoteMusic } from './api-music';

describe('remote music API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('encodes explicit provider search parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      query: 'Boards & Canada',
      page: 2,
      limit: 24,
      total: 0,
      providers: [],
      items: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await searchRemoteMusic('token', '  Boards & Canada  ', {
      limit: 24,
      page: 2,
      providers: ['theaudiodb', 'youtube'],
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/media/music/search/remote?');
    expect(url).toContain('q=Boards+%26+Canada');
    expect(url).toContain('providers=theaudiodb%2Cyoutube');
    expect(url).toContain('page=2');
    expect(new Headers(request.headers).get('Authorization')).toBe('Bearer token');
  });

  it('uses the separate Discover endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      country: 'US',
      generatedAt: '2026-08-23T00:00:00.000Z',
      providers: [],
      items: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await discoverRemoteMusic('token', { limit: 12 });

    expect(fetchMock.mock.calls[0]?.[0]).toContain('/media/music/discover?limit=12');
  });
});
