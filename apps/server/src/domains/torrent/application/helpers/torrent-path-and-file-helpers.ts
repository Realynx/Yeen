import type { TorrentMetadataFileHint } from '../../domain/parsers/torrent-metadata.parser';
import type { TorrentFileHint } from '../types/torrent.service.types';

export interface TorrentPathMapping {
  from: string;
  to: string;
  fromNormalized: string;
}

export function normalizePathForCompare(value: string): string {
  return value.replace(/\\+/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function buildTorrentPathMappings(
  rawMappings: ReadonlyArray<{ from: string; to: string }>,
): TorrentPathMapping[] {
  return rawMappings
    .map((entry) => ({
      from: entry.from,
      to: entry.to,
      fromNormalized: normalizePathForCompare(entry.from),
    }))
    .filter((entry) => entry.fromNormalized.length > 0 && entry.to.length > 0)
    .sort((a, b) => b.fromNormalized.length - a.fromNormalized.length);
}

export function applyTorrentPathMappings(
  input: string | null,
  mappings: ReadonlyArray<TorrentPathMapping>,
): string | null {
  if (!input || mappings.length === 0) {
    return input;
  }

  const candidate = normalizePathForCompare(input);
  for (const mapping of mappings) {
    const prefix = mapping.fromNormalized;
    const matches =
      candidate === prefix ||
      candidate.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
    if (!matches) {
      continue;
    }

    const remainder = candidate.slice(prefix.length).replace(/^\/+/, '');
    const targetUsesBackslash =
      /[\\]/.test(mapping.to) || /^[A-Za-z]:[\\/]/.test(mapping.to);
    const trimmedTo = mapping.to.replace(/[\\/]+$/, '');
    if (!remainder) {
      return trimmedTo;
    }

    const remainderNative = targetUsesBackslash
      ? remainder.replace(/\//g, '\\')
      : remainder;
    const separator = targetUsesBackslash ? '\\' : '/';
    return `${trimmedTo}${separator}${remainderNative}`;
  }

  return input;
}

export function normalizeTorrentRelativePath(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized) {
    return null;
  }

  const segments = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => segment !== '.');

  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    return null;
  }

  return segments.join('/');
}

export function mergeKnownTorrentFiles(
  existingFiles: ReadonlyArray<TorrentFileHint>,
  incomingFiles: ReadonlyArray<TorrentMetadataFileHint>,
): TorrentFileHint[] {
  const merged = new Map<string, TorrentFileHint>();

  const insert = (name: string, size: number) => {
    const normalizedName = normalizeTorrentRelativePath(name);
    if (!normalizedName) {
      return;
    }

    const key = normalizedName.toLowerCase();
    const safeSize = Number.isFinite(size) ? Math.max(0, Math.floor(size)) : 0;
    const previous = merged.get(key);
    if (!previous || safeSize > previous.size) {
      merged.set(key, { name: normalizedName, size: safeSize });
    }
  };

  for (const file of existingFiles) {
    insert(file.name, file.size);
  }

  for (const file of incomingFiles) {
    insert(file.name, file.size);
  }

  return [...merged.values()];
}
