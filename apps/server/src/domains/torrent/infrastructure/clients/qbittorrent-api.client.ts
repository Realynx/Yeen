import { Injectable } from '@nestjs/common';
import { QbittorrentHttpClient } from './qbittorrent-http.client';

export interface QbTorrentProperties {
  seq_dl?: boolean;
  f_l_piece_prio?: boolean;
  save_path?: string;
}

export interface QbTorrentFile {
  index: number;
  name: string;
  size: number;
  progress: number;
}

export interface AddTorrentInput {
  magnetLink?: string;
  savePath?: string;
  paused: boolean;
  seedAfterDownload?: boolean;
  orderMode: 'sequential' | 'random';
  tags?: string;
  torrentFile?: {
    buffer: Buffer;
    fileName: string;
  };
}

@Injectable()
export class QbittorrentApiClient {
  constructor(private readonly qbHttpClient: QbittorrentHttpClient) {}

  async listTorrents(filter?: {
    tag?: string;
    hashes?: string;
  }): Promise<unknown[]> {
    const params = new URLSearchParams();
    if (filter?.tag) {
      params.set('tag', filter.tag);
    }
    if (filter?.hashes) {
      params.set('hashes', filter.hashes);
    }
    const query = params.toString();
    const path = query
      ? `/api/v2/torrents/info?${query}`
      : '/api/v2/torrents/info';
    const payload = await this.qbHttpClient.requestJson(path, {
      method: 'GET',
    });

    if (!Array.isArray(payload)) {
      return [];
    }

    return payload.map((item) => item as unknown);
  }

  async getTorrentFiles(hash: string): Promise<QbTorrentFile[]> {
    const payload = await this.qbHttpClient.requestJson(
      `/api/v2/torrents/files?hash=${encodeURIComponent(hash)}`,
      { method: 'GET' },
    );

    if (!Array.isArray(payload)) {
      return [];
    }

    const files: QbTorrentFile[] = [];
    payload.forEach((raw, fallbackIndex) => {
      if (!isRecord(raw)) {
        return;
      }
      const name = typeof raw.name === 'string' ? raw.name : '';
      if (!name) {
        return;
      }
      const size =
        typeof raw.size === 'number' && Number.isFinite(raw.size)
          ? raw.size
          : 0;
      const progress =
        typeof raw.progress === 'number' && Number.isFinite(raw.progress)
          ? Math.max(0, Math.min(1, raw.progress))
          : 0;
      const index =
        typeof raw.index === 'number' && Number.isFinite(raw.index)
          ? raw.index
          : fallbackIndex;
      files.push({ index, name, size, progress });
    });

    return files;
  }

  async addTorrent(input: AddTorrentInput): Promise<void> {
    const formData = new FormData();

    if (input.magnetLink) {
      formData.set('urls', input.magnetLink);
    }

    if (input.torrentFile) {
      const torrentBytes = Uint8Array.from(input.torrentFile.buffer);
      const fileBlob = new Blob([torrentBytes], {
        type: 'application/x-bittorrent',
      });
      formData.append('torrents', fileBlob, input.torrentFile.fileName);
    }

    if (input.savePath) {
      formData.set('savepath', input.savePath);
    }

    if (input.tags && input.tags.trim()) {
      formData.set('tags', input.tags.trim());
    }

    // Always create a per-torrent subfolder (qBittorrent v4.3+ contentLayout)
    // so single-file torrents land in their own directory named after the
    // torrent, matching how multi-file torrents are organized.
    formData.set('contentLayout', 'Subfolder');

    const sequential = input.orderMode === 'sequential';
    formData.set('paused', input.paused ? 'true' : 'false');
    formData.set('sequentialDownload', sequential ? 'true' : 'false');
    formData.set('firstLastPiecePrio', sequential ? 'true' : 'false');

    if (input.seedAfterDownload === false) {
      // Stop the torrent as soon as it completes instead of seeding.
      formData.set('ratioLimit', '0');
      formData.set('seedingTimeLimit', '0');
      formData.set('inactiveSeedingTimeLimit', '0');
    }

    await this.qbHttpClient.requestNoContent('/api/v2/torrents/add', {
      method: 'POST',
      body: formData,
    });
  }

  async startTorrent(hash: string): Promise<void> {
    await this.postHashes('/api/v2/torrents/start', hash);
  }

  async stopTorrent(hash: string): Promise<void> {
    await this.postHashes('/api/v2/torrents/stop', hash);
  }

  async deleteTorrent(hash: string, deleteFiles: boolean): Promise<void> {
    await this.qbHttpClient.requestNoContent('/api/v2/torrents/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: this.formBody({
        hashes: hash,
        deleteFiles: deleteFiles ? 'true' : 'false',
      }),
    });
  }

  async toggleSequentialDownload(hash: string): Promise<void> {
    await this.postHashes('/api/v2/torrents/toggleSequentialDownload', hash);
  }

  async toggleFirstLastPiecePriority(hash: string): Promise<void> {
    await this.postHashes('/api/v2/torrents/toggleFirstLastPiecePrio', hash);
  }

  async getTorrentProperties(hash: string): Promise<QbTorrentProperties> {
    const payload = await this.qbHttpClient.requestJson(
      `/api/v2/torrents/properties?hash=${encodeURIComponent(hash)}`,
      { method: 'GET' },
    );

    if (!isRecord(payload)) {
      return {};
    }

    return {
      seq_dl: toOptionalBoolean(payload.seq_dl),
      f_l_piece_prio: toOptionalBoolean(payload.f_l_piece_prio),
      save_path:
        typeof payload.save_path === 'string' ? payload.save_path : undefined,
    };
  }

  private async postHashes(path: string, hash: string): Promise<void> {
    await this.qbHttpClient.requestNoContent(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: this.formBody({ hashes: hash }),
    });
  }

  private formBody(values: Record<string, string>): URLSearchParams {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      form.set(key, value);
    }
    return form;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
