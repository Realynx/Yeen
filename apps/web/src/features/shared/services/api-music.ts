import type {
  RemoteMusicDiscoverResponse,
  RemoteMusicSearchResponse,
} from '@yeen/shared-contracts';
import { request } from './api-core';

interface RemoteMusicRequestOptions {
  limit?: number;
  providers?: string[];
  signal?: AbortSignal;
}

interface RemoteMusicSearchOptions extends RemoteMusicRequestOptions {
  page?: number;
}

export async function searchRemoteMusic(
  token: string,
  query: string,
  options: RemoteMusicSearchOptions = {},
) {
  const params = remoteMusicParams(options);
  params.set('q', query.trim());
  if (typeof options.page === 'number' && Number.isFinite(options.page)) {
    params.set('page', String(Math.max(1, Math.floor(options.page))));
  }

  return request<RemoteMusicSearchResponse>(
    `/media/music/search/remote?${params.toString()}`,
    { signal: options.signal },
    token,
  );
}

export async function discoverRemoteMusic(
  token: string,
  options: RemoteMusicRequestOptions = {},
) {
  const params = remoteMusicParams(options);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return request<RemoteMusicDiscoverResponse>(
    `/media/music/discover${suffix}`,
    { signal: options.signal },
    token,
  );
}

function remoteMusicParams(options: RemoteMusicRequestOptions) {
  const params = new URLSearchParams();
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    params.set('limit', String(Math.max(1, Math.floor(options.limit))));
  }
  if (options.providers?.length) {
    params.set('providers', options.providers.join(','));
  }
  return params;
}
