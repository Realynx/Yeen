import { normalizePersistedMediaAssetPath } from './media-persisted-asset-path';

describe('normalizePersistedMediaAssetPath', () => {
  it('remaps release-scoped data assets to the stable data directory', () => {
    expect(
      normalizePersistedMediaAssetPath(
        '/opt/yeen/releases/20260821195851-old/data/thumbnails/posters/example.jpg',
      ),
    ).toBe('data/thumbnails/posters/example.jpg');
  });

  it('preserves sidecar and remote artwork paths', () => {
    expect(
      normalizePersistedMediaAssetPath('/media/show/episode-poster.jpg'),
    ).toBe('/media/show/episode-poster.jpg');
    expect(
      normalizePersistedMediaAssetPath('https://images.example/poster.jpg'),
    ).toBe('https://images.example/poster.jpg');
  });
});
