import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('Media Home navigation contract', () => {
  it('uses a stable root destination and TV focus identity', () => {
    const source = readSource('../components/MediaHomeButton.tsx');

    expect(source).toContain('to="/"');
    expect(source).toContain('aria-label="Media Home"');
    expect(source).toContain('data-tv-focus-key="navigation:media-home"');
  });

  it('keeps an explicit Media Home action in contextual desktop and Phone Player headers', () => {
    const contextualHeaders = [
      '../components/AdminNav.tsx',
      '../../media-details/pages/MediaDetailsPage.tsx',
      '../../player/components/PlayerTopBar.tsx',
      '../../player/pages/PlayerPagePhone.tsx',
      '../../addons/runtime/AddonHostSlots.tsx',
      '../../music/pages/MusicExperiencePage.tsx',
    ];

    for (const sourcePath of contextualHeaders) {
      expect(readSource(sourcePath), sourcePath).toContain('<MediaHomeButton');
    }
  });

  it('keeps direct Home navigation in browse and persistent Phone navigation', () => {
    const browseHeaders = [
      '../../home/components/HomeTopNav.tsx',
      '../../library/components/MediaLibraryTopNav.tsx',
      '../../media-explore/components/ExploreTopNav.tsx',
    ];

    for (const sourcePath of browseHeaders) {
      expect(readSource(sourcePath), sourcePath).toMatch(/to=["']\/["']/);
    }
    expect(readSource('../components/PhoneBottomNav.tsx')).toContain("to: '/'");
  });
});
