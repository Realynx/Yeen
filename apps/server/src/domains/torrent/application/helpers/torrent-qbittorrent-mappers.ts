import type {
  TorrentListItem,
  TorrentPaths,
} from '../types/torrent.service.types';
import {
  clampFraction,
  isObjectRecord,
  toNonNegativeInteger,
  toNullableString,
  toNumberOrFallback,
  toOptionalBoolean,
  toStringOrEmpty,
} from './torrent-value-normalizers';

export function mapQbTorrentToListItem(value: unknown): TorrentListItem | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const hash = toStringOrEmpty(value.hash).trim();
  if (!hash) {
    return null;
  }

  return {
    hash,
    name: toStringOrEmpty(value.name) || hash,
    state: toStringOrEmpty(value.state) || 'unknown',
    progress: clampFraction(toNumberOrFallback(value.progress, 0)),
    etaSeconds: toNonNegativeInteger(value.eta, 0),
    downloadRate: toNonNegativeInteger(value.dlspeed, 0),
    uploadRate: toNonNegativeInteger(value.upspeed, 0),
    sizeBytes: toNonNegativeInteger(value.size, 0),
    completedBytes: toNonNegativeInteger(value.completed, 0),
    savePath: toNullableString(value.save_path),
    sequentialDownload: toOptionalBoolean(value.seq_dl),
    firstLastPiecePriority: toOptionalBoolean(value.f_l_piece_prio),
  };
}

export function extractTorrentPathsFromInfoList(
  torrentInfoList: unknown[],
): TorrentPaths {
  let savePath: string | null = null;
  let contentPath: string | null = null;

  for (const raw of torrentInfoList) {
    if (!isObjectRecord(raw)) {
      continue;
    }

    savePath = toTrimmedNullablePath(raw['save_path']);
    contentPath = toTrimmedNullablePath(raw['content_path']);
    break;
  }

  return {
    savePath,
    contentPath,
  };
}

function toTrimmedNullablePath(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}
