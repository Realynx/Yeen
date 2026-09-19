import { join } from 'node:path';
import { buildPreviewImageCandidates } from './media-preview-path-helpers';

describe('buildPreviewImageCandidates', () => {
  it('includes common album artwork sidecars', () => {
    const candidates = buildPreviewImageCandidates('D:/Music/Album', 'Track', [
      '.jpg',
    ]);

    expect(candidates).toContain(join('D:/Music/Album', 'cover.jpg'));
    expect(candidates).toContain(join('D:/Music/Album', 'front.jpg'));
  });
});
