import type { MediaItem, ProgressEntry } from './types';
import { request } from './api-core';

export interface ContinueWatchingItem {
  item: MediaItem;
  progress: ProgressEntry;
}

export interface DashboardGenreRow {
  id: string;
  label: string;
  items: MediaItem[];
}

export async function getContinueWatching(token: string) {
  return request<{ items: ContinueWatchingItem[] }>(
    '/dashboard/continue-watching',
    {},
    token,
  );
}

export async function getRecentlyAdded(token: string) {
  return request<{ items: MediaItem[] }>(
    '/dashboard/recently-added',
    {},
    token,
  );
}

export async function getFeaturedDashboardItems(token: string) {
  return request<{ items: MediaItem[] }>('/dashboard/featured', {}, token);
}

export async function getDashboardGenreRows(token: string) {
  return request<{ rows: DashboardGenreRow[] }>(
    '/dashboard/genre-rows',
    {},
    token,
  );
}
