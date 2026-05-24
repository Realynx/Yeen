import { BadRequestException, Injectable } from '@nestjs/common';
import { KnownTorrentMetadataStore } from '../../infrastructure/stores/known-torrent-metadata.store';
import {
  buildKnownTorrentMetadataUpsertEntry,
  cloneKnownTorrentMetadata,
  type KnownTorrentMetadataRecord,
  type KnownTorrentMetadataUpdateInput,
} from '../helpers/torrent-known-metadata-helpers';
import {
  normalizeTorrentHashInput,
  normalizeTorrentMediaHint,
} from '../helpers/torrent-value-normalizers';
import type {
  TorrentFileHint,
  TorrentMediaHint,
} from '../types/torrent.service.types';

@Injectable()
export class TorrentKnownMetadataService {
  constructor(
    private readonly knownTorrentMetadataStore: KnownTorrentMetadataStore,
  ) {}

  async getFiles(hash: string): Promise<TorrentFileHint[]> {
    const known = await this.getMetadata(hash);
    if (!known) {
      return [];
    }

    return known.files.map((file) => ({ ...file }));
  }

  async getSavePath(hash: string): Promise<string | null> {
    return (await this.getMetadata(hash))?.savePath ?? null;
  }

  async getContentPath(hash: string): Promise<string | null> {
    return (await this.getMetadata(hash))?.contentPath ?? null;
  }

  async getTitleHint(hash: string): Promise<string | null> {
    return (await this.getMetadata(hash))?.titleHint ?? null;
  }

  async getMediaHint(hash: string): Promise<TorrentMediaHint | null> {
    const hint = (await this.getMetadata(hash))?.mediaHint;
    if (!hint) {
      return null;
    }

    return {
      ...hint,
      tags: [...hint.tags],
    };
  }

  async setMediaHint(
    hash: string,
    hint: Partial<TorrentMediaHint> | null,
  ): Promise<void> {
    const normalizedHint = normalizeTorrentMediaHint(hint);

    await this.rememberMetadata({
      hash,
      titleHint: null,
      mediaHint: normalizedHint,
      savePath: null,
      contentPath: null,
      files: [],
    });
  }

  async rememberMetadata(
    input: KnownTorrentMetadataUpdateInput,
  ): Promise<void> {
    const normalizedHash = this.normalizeHash(input.hash);
    const existing = await this.knownTorrentMetadataStore.get(normalizedHash);

    await this.knownTorrentMetadataStore.upsert(
      buildKnownTorrentMetadataUpsertEntry({
        normalizedHash,
        existing,
        update: input,
        nowMs: Date.now(),
      }),
    );
  }

  async getMetadata(hash: string): Promise<KnownTorrentMetadataRecord | null> {
    const normalizedHash = this.normalizeHash(hash);
    const persisted = await this.knownTorrentMetadataStore.get(normalizedHash);
    return cloneKnownTorrentMetadata(persisted);
  }

  private normalizeHash(hash: string): string {
    const normalized = normalizeTorrentHashInput(hash);
    if (!normalized) {
      throw new BadRequestException('Torrent hash is required.');
    }

    return normalized;
  }
}
