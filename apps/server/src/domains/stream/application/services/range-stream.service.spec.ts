import { parseSingleByteRange } from './range-stream.service';

describe('parseSingleByteRange', () => {
  it('parses bounded, open-ended, and suffix byte ranges', () => {
    expect(parseSingleByteRange('bytes=10-19', 100)).toEqual({
      start: 10,
      end: 19,
    });
    expect(parseSingleByteRange('bytes=90-', 100)).toEqual({
      start: 90,
      end: 99,
    });
    expect(parseSingleByteRange('bytes=-10', 100)).toEqual({
      start: 90,
      end: 99,
    });
  });

  it('clamps an oversized end to the current file end', () => {
    expect(parseSingleByteRange('bytes=90-500', 100)).toEqual({
      start: 90,
      end: 99,
    });
  });

  it('rejects malformed, multiple, and unsatisfiable ranges', () => {
    expect(parseSingleByteRange('items=0-1', 100)).toBeNull();
    expect(parseSingleByteRange('bytes=0-1,4-5', 100)).toBeNull();
    expect(parseSingleByteRange('bytes=100-', 100)).toBeNull();
    expect(parseSingleByteRange('bytes=-0', 100)).toBeNull();
    expect(parseSingleByteRange('bytes=0-1', 0)).toBeNull();
  });
});
