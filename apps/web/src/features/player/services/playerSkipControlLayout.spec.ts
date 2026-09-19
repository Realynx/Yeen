import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readStyle(relativePath: string): string {
  return readFileSync(new URL(`../../../styles/${relativePath}`, import.meta.url), 'utf8');
}

describe('player skip control layout', () => {
  it('keeps the skip action just above the seek track in every client experience', () => {
    const overlaysCss = readStyle('player/player-overlays.css');
    const responsiveCss = readStyle('player/player-responsive.css');
    const phoneCss = readStyle('layouts/phone-player.css');
    const tvCss = readStyle('layouts/tv-shell.css');
    const androidCss = readStyle('responsive/android-native.css');

    expect(overlaysCss).toMatch(
      /\.player-skip-segment-cta\s*\{[^}]*bottom:\s*5\.75rem/s,
    );
    expect(responsiveCss).toMatch(
      /@media \(max-width:\s*980px\)[\s\S]*?\.player-skip-segment-cta\s*\{[^}]*bottom:\s*9rem/s,
    );
    expect(phoneCss).toMatch(
      /\.phone-page-shell \.phone-player-page \.player-skip-segment-cta\s*\{[^}]*bottom:\s*8rem/s,
    );
    expect(tvCss).toMatch(
      /:root\[data-yeen-experience='tv'\] \.player-skip-segment-cta\s*\{[^}]*bottom:\s*6\.75rem/s,
    );
    expect(androidCss).toMatch(
      /data-yeen-experience='phone'[\s\S]*?\.player-skip-segment-cta\s*\{[^}]*bottom:\s*calc\(8rem \+ max\(0\.5rem, var\(--yeen-safe-bottom\)\)\)/s,
    );
    expect(androidCss).toMatch(
      /data-yeen-experience='tv'[\s\S]*?\.player-skip-segment-cta\s*\{[^}]*bottom:\s*calc\(5\.75rem \+ var\(--yeen-tv-overscan-block\)\)/s,
    );
  });
});
