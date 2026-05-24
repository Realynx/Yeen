import { request } from './api-core';

export interface MetadataSearchCandidate {
  title: string;
  mediaType: 'movie' | 'show' | 'other';
  tags: string[];
  overview: string | null;
  releaseYear: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  remoteSource: 'tmdb' | 'jikan';
  remoteSourceId: string;
}

export async function searchMetadataCandidates(
  token: string,
  params: {
    title: string;
    type: 'movie' | 'show' | 'other';
    year?: number | null;
    limit?: number;
    signal?: AbortSignal;
  },
) {
  const search = new URLSearchParams({
    title: params.title,
    type: params.type,
  });

  if (typeof params.year === 'number' && Number.isFinite(params.year)) {
    search.set('year', String(params.year));
  }

  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    search.set('limit', String(params.limit));
  }

  return request<{ candidates: MetadataSearchCandidate[] }>(
    `/media/metadata/search?${search.toString()}`,
    { method: 'GET', signal: params.signal },
    token,
  );
}
