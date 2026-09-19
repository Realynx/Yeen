import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RemoteMusicResult } from '@yeen/shared-contracts';

vi.mock('../../addons/runtime/AddonHostSlots', () => ({
  AddonRemoteMusicResultActions: ({ remoteMusicResult }: { remoteMusicResult: RemoteMusicResult }) => (
    <button type="button">Save {remoteMusicResult.title}</button>
  ),
}));

import { RemoteMusicCard, RemoteMusicResultsSection } from './RemoteMusicSections';

const result: RemoteMusicResult = {
  id: 'track-1',
  title: 'Roygbiv',
  artists: ['Boards of Canada'],
  album: 'Music Has the Right to Children',
  durationSeconds: 151,
  releaseYear: 1998,
  artworkUrl: 'https://images.example.test/roygbiv.jpg',
  externalIds: { isrc: 'GBDUW9800001' },
  sources: [{
    provider: 'theaudiodb',
    sourceId: 'track-1',
    url: 'https://theaudiodb.com/track/track-1',
    playable: false,
    acquirable: false,
  }],
  localMediaId: 'local-track-1',
};

describe('remote music sections', () => {
  it('shows provider, local-match, source-link, and add-on actions', () => {
    const markup = renderToStaticMarkup(<RemoteMusicCard item={result} />);

    expect(markup).toContain('Roygbiv');
    expect(markup).toContain('Boards of Canada');
    expect(markup).toContain('TheAudioDB');
    expect(markup).toContain('In your library');
    expect(markup).toContain('View on TheAudioDB');
    expect(markup).toContain('Save Roygbiv');
  });

  it('keeps a submitted remote search visually distinct from local search', () => {
    const markup = renderToStaticMarkup(
      <RemoteMusicResultsSection
        query="Roygbiv"
        items={[result]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(markup).toContain('Around the web');
    expect(markup).toContain('Remote tracks are never added automatically.');
    expect(markup).toContain('Results for “Roygbiv”');
  });

  it('does not expose non-http provider URLs as links', () => {
    const unsafeResult = {
      ...result,
      localMediaId: null,
      sources: [{ ...result.sources[0]!, url: 'javascript:alert(1)' }],
    };
    const markup = renderToStaticMarkup(<RemoteMusicCard item={unsafeResult} />);

    expect(markup).not.toContain('javascript:');
    expect(markup).not.toContain('View on');
  });
});
