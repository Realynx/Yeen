import { createHash } from 'node:crypto';

type BencodeValue = number | Buffer | BencodeValue[] | Map<string, BencodeValue>;

interface RootDictionaryParseResult {
  dictionary: Map<string, BencodeValue>;
  infoRange: { start: number; end: number } | null;
}

export interface TorrentMetadataFileHint {
  name: string;
  size: number;
}

export interface ParsedTorrentMetadata {
  infoHash: string | null;
  titleHint: string | null;
  files: TorrentMetadataFileHint[];
}

export function parseTorrentMetadata(buffer: Buffer): ParsedTorrentMetadata | null {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return null;
  }

  let parsedRoot: RootDictionaryParseResult;
  try {
    const parser = new BencodeParser(buffer);
    parsedRoot = parser.parseRootDictionary();
  } catch {
    return null;
  }

  const infoDictionary = parsedRoot.dictionary.get('info');
  if (!(infoDictionary instanceof Map)) {
    return null;
  }

  const titleHint = readBencodedString(infoDictionary, ['name.utf-8', 'name']);
  const files = parseTorrentFiles(infoDictionary, titleHint);

  const infoHash = parsedRoot.infoRange
    ? createHash('sha1')
        .update(buffer.subarray(parsedRoot.infoRange.start, parsedRoot.infoRange.end))
        .digest('hex')
    : null;

  return {
    infoHash,
    titleHint,
    files,
  };
}

function parseTorrentFiles(
  infoDictionary: Map<string, BencodeValue>,
  titleHint: string | null,
): TorrentMetadataFileHint[] {
  const filesValue = infoDictionary.get('files');
  const parsedFiles: TorrentMetadataFileHint[] = [];

  if (Array.isArray(filesValue)) {
    for (const value of filesValue) {
      if (!(value instanceof Map)) {
        continue;
      }

      const size = readBencodedInteger(value.get('length'));
      const path = readTorrentFilePath(value, titleHint);
      if (!path) {
        continue;
      }

      parsedFiles.push({
        name: path,
        size,
      });
    }

    return dedupeTorrentFiles(parsedFiles);
  }

  const singleFilePath = normalizeTorrentRelativePath(titleHint);
  if (!singleFilePath) {
    return [];
  }

  return [
    {
      name: singleFilePath,
      size: readBencodedInteger(infoDictionary.get('length')),
    },
  ];
}

function readTorrentFilePath(
  fileDictionary: Map<string, BencodeValue>,
  rootName: string | null,
): string | null {
  const value =
    fileDictionary.get('path.utf-8')
    ?? fileDictionary.get('path');

  if (!Array.isArray(value)) {
    return null;
  }

  const segments: string[] = [];

  const normalizedRoot = normalizeTorrentPathSegment(rootName);
  if (normalizedRoot) {
    segments.push(normalizedRoot);
  }

  for (const part of value) {
    const nextSegment = normalizeTorrentPathSegment(readBencodedStringValue(part));
    if (!nextSegment) {
      continue;
    }

    segments.push(nextSegment);
  }

  if (segments.length === 0) {
    return null;
  }

  return normalizeTorrentRelativePath(segments.join('/'));
}

function dedupeTorrentFiles(files: TorrentMetadataFileHint[]): TorrentMetadataFileHint[] {
  const deduped = new Map<string, TorrentMetadataFileHint>();

  for (const file of files) {
    const normalizedPath = normalizeTorrentRelativePath(file.name);
    if (!normalizedPath) {
      continue;
    }

    const mapKey = normalizedPath.toLowerCase();
    const existing = deduped.get(mapKey);
    if (!existing || file.size > existing.size) {
      deduped.set(mapKey, {
        name: normalizedPath,
        size: Math.max(0, Math.floor(file.size)),
      });
    }
  }

  return [...deduped.values()];
}

function normalizeTorrentRelativePath(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized) {
    return null;
  }

  const segments = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => segment !== '.');

  if (segments.length === 0) {
    return null;
  }

  if (segments.some((segment) => segment === '..')) {
    return null;
  }

  return segments.join('/');
}

function normalizeTorrentPathSegment(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\\/g, '/').trim();
  if (!normalized || normalized === '.' || normalized === '..') {
    return null;
  }

  return normalized;
}

function readBencodedString(
  dictionary: Map<string, BencodeValue>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = readBencodedStringValue(dictionary.get(key));
    if (value) {
      return value;
    }
  }

  return null;
}

function readBencodedStringValue(value: BencodeValue | undefined): string | null {
  if (!Buffer.isBuffer(value)) {
    return null;
  }

  const decoded = value.toString('utf8').replace(/\0/g, '').trim();
  return decoded || null;
}

function readBencodedInteger(value: BencodeValue | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

class BencodeParser {
  private offset = 0;

  constructor(private readonly source: Buffer) {}

  parseRootDictionary(): RootDictionaryParseResult {
    this.expectByte(0x64); // d

    const dictionary = new Map<string, BencodeValue>();
    let infoRange: { start: number; end: number } | null = null;

    while (!this.peekByteIs(0x65)) {
      const key = this.parseByteString().toString('utf8');
      const valueStart = this.offset;
      const value = this.parseValue();
      const valueEnd = this.offset;

      dictionary.set(key, value);

      if (key === 'info') {
        infoRange = { start: valueStart, end: valueEnd };
      }
    }

    this.expectByte(0x65); // e

    if (this.offset !== this.source.length) {
      throw new Error('Invalid torrent payload: trailing bytes.');
    }

    return {
      dictionary,
      infoRange,
    };
  }

  private parseValue(): BencodeValue {
    const nextByte = this.peekByte();

    if (nextByte === 0x69) {
      return this.parseInteger();
    }

    if (nextByte === 0x6c) {
      return this.parseList();
    }

    if (nextByte === 0x64) {
      return this.parseDictionary();
    }

    if (nextByte >= 0x30 && nextByte <= 0x39) {
      return this.parseByteString();
    }

    throw new Error('Invalid bencode token.');
  }

  private parseInteger(): number {
    this.expectByte(0x69); // i
    const start = this.offset;

    while (!this.peekByteIs(0x65)) {
      this.offset += 1;
      if (this.offset >= this.source.length) {
        throw new Error('Invalid bencode integer.');
      }
    }

    const integerText = this.source.toString('ascii', start, this.offset);
    this.expectByte(0x65); // e

    if (!/^-?\d+$/.test(integerText)) {
      throw new Error('Invalid bencode integer value.');
    }

    const parsed = Number.parseInt(integerText, 10);
    if (!Number.isFinite(parsed)) {
      throw new Error('Bencode integer out of range.');
    }

    return parsed;
  }

  private parseByteString(): Buffer {
    const lengthStart = this.offset;

    while (!this.peekByteIs(0x3a)) {
      const byte = this.peekByte();
      if (byte < 0x30 || byte > 0x39) {
        throw new Error('Invalid bencode byte-string length.');
      }
      this.offset += 1;
    }

    const lengthText = this.source.toString('ascii', lengthStart, this.offset);
    this.expectByte(0x3a); // :

    const length = Number.parseInt(lengthText, 10);
    if (!Number.isFinite(length) || length < 0) {
      throw new Error('Invalid bencode byte-string length.');
    }

    this.ensureReadable(length);
    const value = this.source.subarray(this.offset, this.offset + length);
    this.offset += length;

    return value;
  }

  private parseList(): BencodeValue[] {
    this.expectByte(0x6c); // l
    const values: BencodeValue[] = [];

    while (!this.peekByteIs(0x65)) {
      values.push(this.parseValue());
    }

    this.expectByte(0x65); // e
    return values;
  }

  private parseDictionary(): Map<string, BencodeValue> {
    this.expectByte(0x64); // d
    const values = new Map<string, BencodeValue>();

    while (!this.peekByteIs(0x65)) {
      const key = this.parseByteString().toString('utf8');
      values.set(key, this.parseValue());
    }

    this.expectByte(0x65); // e
    return values;
  }

  private ensureReadable(length: number): void {
    if (this.offset + length > this.source.length) {
      throw new Error('Unexpected end of bencode payload.');
    }
  }

  private peekByteIs(expected: number): boolean {
    return this.peekByte() === expected;
  }

  private peekByte(): number {
    if (this.offset >= this.source.length) {
      throw new Error('Unexpected end of bencode payload.');
    }

    return this.source[this.offset];
  }

  private expectByte(expected: number): void {
    const actual = this.peekByte();
    if (actual !== expected) {
      throw new Error('Unexpected bencode token.');
    }

    this.offset += 1;
  }
}
