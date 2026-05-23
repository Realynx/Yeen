import type { TorrentMetadataFileHint } from '../../domain/parsers/torrent-metadata.parser';
import type {
  TorrentFileHint,
  TorrentMediaHint,
} from '../types/torrent.service.types';
import { mergeKnownTorrentFiles } from './torrent-path-and-file-helpers';
import { normalizeTorrentMediaHint } from './torrent-value-normalizers';

export interface KnownTorrentMetadataRecord {
  hash: string;
  titleHint: string | null;
  mediaHint: TorrentMediaHint | null;
  savePath: string | null;
  contentPath: string | null;
  files: TorrentFileHint[];
  updatedAtMs: number;
}

export interface KnownTorrentMetadataUpdateInput {
  hash: string;
  titleHint: string | null;
  mediaHint?: Partial<TorrentMediaHint> | TorrentMediaHint | null;
  savePath: string | null;
  contentPath: string | null;
  files: TorrentMetadataFileHint[];
}

export function cloneKnownTorrentMetadata(
  persisted: KnownTorrentMetadataRecord | null,
): KnownTorrentMetadataRecord | null {
  if (!persisted) {
    return null;
  }

  return {
    hash: persisted.hash,
    titleHint: persisted.titleHint,
    mediaHint: persisted.mediaHint
      ? {
          ...persisted.mediaHint,
          tags: [...persisted.mediaHint.tags],
        }
      : null,
    savePath: persisted.savePath,
    contentPath: persisted.contentPath,
    files: persisted.files.map((file) => ({ ...file })),
    updatedAtMs: persisted.updatedAtMs,
  };
}

export function buildKnownTorrentMetadataUpsertEntry(input: {
  normalizedHash: string;
  existing: KnownTorrentMetadataRecord | null;
  update: KnownTorrentMetadataUpdateInput;
  nowMs: number;
}): KnownTorrentMetadataRecord {
  const mergedFiles = mergeKnownTorrentFiles(
    input.existing?.files ?? [],
    input.update.files,
  );
  const nextSavePath =
    input.update.savePath?.trim() || input.existing?.savePath || null;
  const nextContentPath =
    input.update.contentPath?.trim() || input.existing?.contentPath || null;
  const nextTitleHint =
    input.update.titleHint?.trim() || input.existing?.titleHint || null;
  const incomingMediaHint = normalizeTorrentMediaHint(input.update.mediaHint);
  const nextMediaHint = incomingMediaHint ?? input.existing?.mediaHint ?? null;

  return {
    hash: input.normalizedHash,
    titleHint: nextTitleHint,
    mediaHint: nextMediaHint,
    savePath: nextSavePath,
    contentPath: nextContentPath,
    files: mergedFiles,
    updatedAtMs: input.nowMs,
  };
}
