import {
  clampFraction,
  isObjectRecord,
  normalizeTorrentMediaHint,
  normalizeOptionalInfoHash,
  normalizeTorrentHashInput,
  toNonNegativeInteger,
  toNullableString,
  toNumberOrFallback,
  toOptionalBoolean,
  toStringOrEmpty,
} from './torrent-value-normalizers';

describe('torrent-value-normalizers', () => {
  describe('hash normalization', () => {
    it('normalizes required hash input', () => {
      expect(normalizeTorrentHashInput(' ABCdef ')).toBe('abcdef');
    });

    it('accepts only valid 40-char hex optional info hashes', () => {
      const valid = 'A'.repeat(40);
      expect(normalizeOptionalInfoHash(valid)).toBe('a'.repeat(40));
      expect(normalizeOptionalInfoHash('')).toBeNull();
      expect(normalizeOptionalInfoHash('abc')).toBeNull();
      expect(normalizeOptionalInfoHash('g'.repeat(40))).toBeNull();
      expect(normalizeOptionalInfoHash(null)).toBeNull();
    });
  });

  describe('object and string coercion', () => {
    it('detects plain object records', () => {
      expect(isObjectRecord({ a: 1 })).toBe(true);
      expect(isObjectRecord([])).toBe(false);
      expect(isObjectRecord(null)).toBe(false);
    });

    it('coerces string helpers correctly', () => {
      expect(toStringOrEmpty('hello')).toBe('hello');
      expect(toStringOrEmpty(5)).toBe('');

      expect(toNullableString('  value  ')).toBe('  value  ');
      expect(toNullableString('   ')).toBeNull();
      expect(toNullableString(5)).toBeNull();
    });
  });

  describe('number and boolean coercion', () => {
    it('coerces integer and float fallbacks', () => {
      expect(toNonNegativeInteger(12.6, 0)).toBe(13);
      expect(toNonNegativeInteger('-5', 9)).toBe(0);
      expect(toNonNegativeInteger('x', 9)).toBe(9);

      expect(toNumberOrFallback(3.5, 1)).toBe(3.5);
      expect(toNumberOrFallback('2.25', 1)).toBe(2.25);
      expect(toNumberOrFallback('x', 1)).toBe(1);
    });

    it('clamps fractions and parses optional booleans', () => {
      expect(clampFraction(-1)).toBe(0);
      expect(clampFraction(0.5)).toBe(0.5);
      expect(clampFraction(2)).toBe(1);

      expect(toOptionalBoolean(true)).toBe(true);
      expect(toOptionalBoolean(1)).toBe(true);
      expect(toOptionalBoolean('yes')).toBe(true);
      expect(toOptionalBoolean('0')).toBe(false);
      expect(toOptionalBoolean('unknown')).toBeNull();
    });
  });

  describe('normalizeTorrentMediaHint', () => {
    it('returns null for invalid hints', () => {
      expect(normalizeTorrentMediaHint(null)).toBeNull();
      expect(normalizeTorrentMediaHint({})).toBeNull();
      expect(normalizeTorrentMediaHint({ title: '   ' })).toBeNull();
    });

    it('normalizes and sanitizes valid hint fields', () => {
      const normalized = normalizeTorrentMediaHint({
        title: '  Example Title  ',
        normalizedTitle: '',
        releaseYear: 2024.9,
        mediaType: 'show',
        description: '  sample  ',
        tags: [' drama ', ''],
        posterUrl: '  https://image/poster.jpg  ',
        backdropUrl: '',
        remoteSource: 'tmdb',
        remoteSourceId: ' 12345 ',
      });

      expect(normalized).toEqual({
        title: 'Example Title',
        normalizedTitle: 'Example Title',
        releaseYear: 2024,
        mediaType: 'show',
        description: 'sample',
        tags: ['drama'],
        posterUrl: 'https://image/poster.jpg',
        backdropUrl: null,
        remoteSource: 'tmdb',
        remoteSourceId: '12345',
      });
    });
  });
});
