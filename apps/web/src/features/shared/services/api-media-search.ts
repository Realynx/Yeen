import type {
  MediaLibraryType,
  MediaLibraryLocation,
  MediaItem,
  MediaLocationsResponse,
  MediaStorageSummary,
  SystemSettings,
} from './types';
import { jsonBody, request } from './api-core';

export async function listMedia(
  token: string,
  query?: string,
  tags?: string[],
  libraryType?: MediaLibraryType,
) {
  const params = new URLSearchParams();

  const normalizedQuery = query?.trim();
  if (normalizedQuery) {
    params.set('q', normalizedQuery);
  }

  const normalizedTags = (tags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  if (normalizedTags.length > 0) {
    params.set('tags', normalizedTags.join(','));
  }

  if (libraryType) {
    params.set('libraryType', libraryType);
  }

  const queryString = params.toString();
  const suffix = queryString ? `?${queryString}` : '';
  return request<MediaItem[]>(`/media${suffix}`, {}, token);
}

export interface RemoteMediaSearchResponse {
  query: string;
  providers: Array<'tmdb' | 'jikan'>;
  total: number;
  page: number;
  hasMore: boolean;
  items: MediaItem[];
}

export async function searchRemoteMedia(
  token: string,
  query: string,
  limit?: number,
  providers?: Array<'tmdb' | 'jikan'>,
  tags?: string[],
  noCache?: boolean,
  page?: number,
) {
  const params = new URLSearchParams();
  const cleanedQuery = query.trim();

  if (cleanedQuery) {
    params.set('q', cleanedQuery);
  }

  if (typeof limit === 'number' && Number.isFinite(limit)) {
    params.set('limit', String(Math.floor(limit)));
  }

  if (Array.isArray(providers) && providers.length > 0) {
    params.set('providers', providers.join(','));
  }

  const normalizedTags = (tags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  if (normalizedTags.length > 0) {
    params.set('tags', normalizedTags.join(','));
  }

  if (noCache) {
    params.set('noCache', '1');
  }

  if (typeof page === 'number' && Number.isFinite(page)) {
    params.set('page', String(Math.max(1, Math.floor(page))));
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request<RemoteMediaSearchResponse>(`/media/search/remote${suffix}`, {}, token);
}

export async function getMediaLocations(token: string) {
  return request<MediaLocationsResponse>('/media/locations', {}, token);
}

export async function getMediaStorageSummary(token: string) {
  return request<MediaStorageSummary>('/media/storage-summary', {}, token);
}

export async function setMediaLocations(
  token: string,
  libraryLocations: MediaLibraryLocation[],
) {
  return request<MediaLocationsResponse>(
    '/media/locations',
    {
      method: 'PUT',
      body: jsonBody({ libraryLocations }),
    },
    token,
  );
}

export async function getSystemSettings(token: string) {
  return request<SystemSettings>('/system-settings', {}, token);
}

export async function updateSystemSettings(
  token: string,
  payload: SystemSettings,
) {
  const writableSettings: Partial<SystemSettings> = { ...payload };
  delete writableSettings.theAudioDbHasCustomApiKey;
  return request<SystemSettings>(
    '/system-settings',
    {
      method: 'PUT',
      body: jsonBody(writableSettings),
    },
    token,
  );
}
