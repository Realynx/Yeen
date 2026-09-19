import { isExtensionAllowedForLibrary } from './media-scanner.service';

describe('typed media library extension filtering', () => {
  it('indexes only supported video files in a video location', () => {
    expect(isExtensionAllowedForLibrary('.mkv', 'video')).toBe(true);
    expect(isExtensionAllowedForLibrary('.flac', 'video')).toBe(false);
  });

  it('indexes only supported audio files in a music location', () => {
    expect(isExtensionAllowedForLibrary('.flac', 'music')).toBe(true);
    expect(isExtensionAllowedForLibrary('.mp3', 'music')).toBe(true);
    expect(isExtensionAllowedForLibrary('.mkv', 'music')).toBe(false);
  });

  it('keeps mixed inference for callers that do not provide a library type', () => {
    expect(isExtensionAllowedForLibrary('.mp4')).toBe(true);
    expect(isExtensionAllowedForLibrary('.ogg')).toBe(true);
  });
});
