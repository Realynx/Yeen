import { BadRequestException } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_COMMENT_BYTES = 65_535;

export interface AddonZipLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxExpandedBytes: number;
  maxCompressionRatio: number;
}

export interface AddonZipEntry {
  path: string;
  directory: boolean;
  compressedSize: number;
  uncompressedSize: number;
  read(): Buffer;
}

interface CentralEntry {
  path: string;
  rawName: Buffer;
  directory: boolean;
  flags: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

export function readAddonZip(
  archive: Buffer,
  limits: AddonZipLimits,
): AddonZipEntry[] {
  if (archive.length < 22) {
    invalid('The uploaded file is not a valid ZIP package.');
  }

  const endOffset = findEndRecord(archive);
  assertSingleDiskArchive(archive, endOffset);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);

  if (entryCount === 0 || entryCount === 0xffff) {
    invalid('Empty and ZIP64 add-on packages are not supported.');
  }
  if (entryCount > limits.maxEntries) {
    invalid(
      `Add-on packages may contain at most ${limits.maxEntries} entries.`,
    );
  }
  if (
    centralOffset === 0xffffffff ||
    centralSize === 0xffffffff ||
    centralOffset + centralSize > endOffset
  ) {
    invalid('The ZIP central directory is invalid or unsupported.');
  }

  const parsed = parseCentralEntries(
    archive,
    centralOffset,
    centralSize,
    entryCount,
    limits,
  );
  validateExpandedSize(parsed, limits);

  return parsed.map((entry) => ({
    path: entry.path,
    directory: entry.directory,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    read: () => readEntryData(archive, entry, centralOffset),
  }));
}

function findEndRecord(archive: Buffer): number {
  const earliest = Math.max(0, archive.length - 22 - MAX_COMMENT_BYTES);
  for (let offset = archive.length - 22; offset >= earliest; offset -= 1) {
    if (archive.readUInt32LE(offset) !== END_SIGNATURE) continue;
    const commentLength = archive.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === archive.length) return offset;
  }
  return invalid('The uploaded file is not a valid ZIP package.');
}

function assertSingleDiskArchive(archive: Buffer, offset: number): void {
  const disk = archive.readUInt16LE(offset + 4);
  const centralDisk = archive.readUInt16LE(offset + 6);
  const diskEntries = archive.readUInt16LE(offset + 8);
  const totalEntries = archive.readUInt16LE(offset + 10);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    invalid('Multi-disk ZIP packages are not supported.');
  }
}

function parseCentralEntries(
  archive: Buffer,
  start: number,
  size: number,
  count: number,
  limits: AddonZipLimits,
): CentralEntry[] {
  const entries: CentralEntry[] = [];
  const seenPaths = new Set<string>();
  const seenOffsets = new Set<number>();
  let offset = start;
  const end = start + size;

  for (let index = 0; index < count; index += 1) {
    if (
      offset + 46 > end ||
      archive.readUInt32LE(offset) !== CENTRAL_SIGNATURE
    ) {
      invalid('The ZIP central directory is malformed.');
    }
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const diskStart = archive.readUInt16LE(offset + 34);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localOffset = archive.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > end || diskStart !== 0)
      invalid('Invalid ZIP entry metadata.');
    if ((flags & 0x1) !== 0)
      invalid('Encrypted ZIP entries are not supported.');
    if (method !== 0 && method !== 8)
      invalid('ZIP entry compression is unsupported.');
    if (uncompressedSize > limits.maxEntryBytes) {
      invalid(`A ZIP entry exceeds the ${limits.maxEntryBytes} byte limit.`);
    }

    const rawName = archive.subarray(offset + 46, offset + 46 + nameLength);
    const decodedName = rawName.toString('utf8');
    if (decodedName.includes('\uFFFD'))
      invalid('ZIP entry names must be valid UTF-8.');
    const path = normalizeArchivePath(decodedName);
    const directory = path.endsWith('/');
    assertSafeEntryType(externalAttributes, directory);
    const duplicateKey = path.normalize('NFC').toLowerCase();
    if (seenPaths.has(duplicateKey))
      invalid('The ZIP contains duplicate paths.');
    if (seenOffsets.has(localOffset))
      invalid('The ZIP reuses a local entry offset.');
    seenPaths.add(duplicateKey);
    seenOffsets.add(localOffset);
    entries.push({
      path,
      rawName: Buffer.from(rawName),
      directory,
      flags,
      method,
      crc32: archive.readUInt32LE(offset + 16),
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    offset = nextOffset;
  }

  if (offset !== end) invalid('The ZIP central directory has trailing data.');
  return entries;
}

function normalizeArchivePath(input: string): string {
  if (!input || input.includes('\0'))
    invalid('The ZIP contains an invalid path.');
  const path = input.replaceAll('\\', '/');
  if (
    path.startsWith('/') ||
    path.startsWith('//') ||
    /^[A-Za-z]:/.test(path)
  ) {
    invalid('The ZIP contains an absolute path.');
  }
  const directory = path.endsWith('/');
  const parts = path.split('/').filter((part, index, all) => {
    return !(directory && index === all.length - 1 && part === '');
  });
  if (
    parts.length === 0 ||
    parts.some((part) => !part || part === '.' || part === '..')
  ) {
    invalid('The ZIP contains an unsafe path.');
  }
  return `${parts.join('/')}${directory ? '/' : ''}`;
}

function assertSafeEntryType(attributes: number, directory: boolean): void {
  const unixMode = attributes >>> 16;
  const type = unixMode & 0xf000;
  if (type !== 0 && type !== 0x8000 && type !== 0x4000) {
    invalid('Links and special files are not allowed in add-on packages.');
  }
  if (type === 0x4000 && !directory)
    invalid('ZIP directory metadata is inconsistent.');
  if (type === 0x8000 && directory)
    invalid('ZIP file metadata is inconsistent.');
}

function validateExpandedSize(
  entries: CentralEntry[],
  limits: AddonZipLimits,
): void {
  let total = 0;
  for (const entry of entries) {
    total += entry.uncompressedSize;
    if (total > limits.maxExpandedBytes) {
      invalid(
        `Expanded add-on packages may not exceed ${limits.maxExpandedBytes} bytes.`,
      );
    }
    if (
      entry.uncompressedSize > 0 &&
      (entry.compressedSize === 0 ||
        entry.uncompressedSize / entry.compressedSize >
          limits.maxCompressionRatio)
    ) {
      invalid('The ZIP compression ratio exceeds the safety limit.');
    }
  }
}

function readEntryData(
  archive: Buffer,
  entry: CentralEntry,
  centralOffset: number,
): Buffer {
  const offset = entry.localOffset;
  if (
    offset + 30 > centralOffset ||
    archive.readUInt32LE(offset) !== LOCAL_SIGNATURE
  ) {
    return invalid('A ZIP local entry is malformed.');
  }
  const flags = archive.readUInt16LE(offset + 6);
  const method = archive.readUInt16LE(offset + 8);
  const nameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const rawName = archive.subarray(offset + 30, offset + 30 + nameLength);
  if (
    flags !== entry.flags ||
    method !== entry.method ||
    !rawName.equals(entry.rawName)
  ) {
    return invalid('ZIP local and central entry metadata do not match.');
  }
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < offset || dataEnd > centralOffset) {
    return invalid('A ZIP entry points outside the archive.');
  }
  const compressed = archive.subarray(dataStart, dataEnd);
  let output: Buffer;
  try {
    output =
      entry.method === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, {
            maxOutputLength: entry.uncompressedSize + 1,
          });
  } catch {
    return invalid('A ZIP entry could not be decompressed safely.');
  }
  if (
    output.length !== entry.uncompressedSize ||
    crc32(output) !== entry.crc32
  ) {
    return invalid('A ZIP entry failed its integrity check.');
  }
  return output;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function invalid(message: string): never {
  throw new BadRequestException(message);
}
