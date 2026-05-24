import type {
  TorrentIntent,
  TorrentItem,
  TorrentOrderMode,
} from './types';
import { jsonBody, request } from './api-core';

export interface ListTorrentsResponse {
  items: TorrentItem[];
}

export interface AddTorrentPayload {
  magnetLink?: string;
  savePath?: string;
  paused?: boolean;
  intent?: TorrentIntent;
  orderMode?: TorrentOrderMode;
  torrentFile?: File | null;
}

export async function listTorrents(token: string) {
  return request<ListTorrentsResponse>('/torrents', {}, token);
}

export async function addTorrent(token: string, payload: AddTorrentPayload) {
  const formData = new FormData();

  const magnetLink = payload.magnetLink?.trim();
  if (magnetLink) {
    formData.set('magnetLink', magnetLink);
  }

  if (payload.torrentFile) {
    formData.append('torrentFile', payload.torrentFile, payload.torrentFile.name);
  }

  const savePath = payload.savePath?.trim();
  if (savePath) {
    formData.set('savePath', savePath);
  }

  if (typeof payload.paused === 'boolean') {
    formData.set('paused', payload.paused ? 'true' : 'false');
  }

  if (payload.intent) {
    formData.set('intent', payload.intent);
  }

  if (payload.orderMode) {
    formData.set('orderMode', payload.orderMode);
  }

  return request<{ message: string; orderMode: TorrentOrderMode; intent: TorrentIntent | null }>(
    '/torrents/add',
    {
      method: 'POST',
      body: formData,
    },
    token,
  );
}

export async function startTorrent(token: string, hash: string) {
  return request<{ hash: string; message: string }>(
    `/torrents/${encodeURIComponent(hash)}/start`,
    { method: 'POST' },
    token,
  );
}

export async function stopTorrent(token: string, hash: string) {
  return request<{ hash: string; message: string }>(
    `/torrents/${encodeURIComponent(hash)}/stop`,
    { method: 'POST' },
    token,
  );
}

export async function restartTorrent(token: string, hash: string) {
  return request<{ hash: string; message: string }>(
    `/torrents/${encodeURIComponent(hash)}/restart`,
    { method: 'POST' },
    token,
  );
}

export async function deleteTorrent(
  token: string,
  hash: string,
  deleteFiles: boolean,
) {
  return request<{ hash: string; deleteFiles: boolean; message: string }>(
    `/torrents/${encodeURIComponent(hash)}`,
    {
      method: 'DELETE',
      body: jsonBody({ deleteFiles }),
    },
    token,
  );
}

export async function setTorrentOrderMode(
  token: string,
  hash: string,
  orderMode: TorrentOrderMode,
) {
  return request<{
    hash: string;
    orderMode: TorrentOrderMode;
    sequentialChanged: boolean;
    firstLastPiecePriorityChanged: boolean;
    message: string;
  }>(
    `/torrents/${encodeURIComponent(hash)}/order-mode`,
    {
      method: 'PATCH',
      body: jsonBody({ orderMode }),
    },
    token,
  );
}
