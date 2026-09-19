import { describe, expect, it } from 'vitest';
import { mediaModeForPath, pathForMediaMode } from './mediaModeRouting';

describe('media mode routing', () => {
  it('always presents video mode on video media routes', () => {
    for (const path of ['/', '/library', '/explore', '/details/media-1', '/player/media-1']) {
      expect(mediaModeForPath(path, 'music')).toBe(path === '/' ? 'music' : 'video');
    }
  });

  it('always presents music mode on the music route', () => {
    expect(mediaModeForPath('/music', 'video')).toBe('music');
    expect(mediaModeForPath('/music/albums/album-1', 'video')).toBe('music');
  });

  it('keeps the selected mode on global settings routes', () => {
    expect(mediaModeForPath('/settings', 'music')).toBe('music');
    expect(mediaModeForPath('/admin/add-ons', 'video')).toBe('video');
  });

  it('maps mode changes to their stable experience entry routes', () => {
    expect(pathForMediaMode('video')).toBe('/');
    expect(pathForMediaMode('music')).toBe('/music');
  });
});
