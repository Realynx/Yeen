import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MediaModeProvider } from '../services/MediaModeContext';
import {
  MediaModeControl,
  MediaModeSwitchSlot,
} from './MediaModeSwitcher';

function renderSlot(
  pathname: string,
  placement: 'top-nav' | 'phone-header' | 'music-header',
): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <MediaModeProvider accountId="mode-switcher-test">
        <MediaModeSwitchSlot placement={placement} />
      </MediaModeProvider>
    </MemoryRouter>,
  );
}

describe('MediaModeSwitcher', () => {
  it('exposes a compact accessible two-mode control', () => {
    const markup = renderToStaticMarkup(
      <MediaModeControl mode="video" placement="top-nav" onSelect={() => undefined} />,
    );

    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Media library mode"');
    expect(markup).toContain('aria-label="Open Video library"');
    expect(markup).toContain('aria-label="Open Music library"');
    expect(markup).toContain('data-mode="video"');
    expect(markup).toContain('data-placement="top-nav"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('data-tv-focus-key="media-mode-video"');
    expect(markup).toContain('data-tv-focus-key="media-mode-music"');
    expect(markup.match(/type="button"/g)).toHaveLength(2);
    expect(markup).toContain('<svg');
  });

  it.each(['top-nav', 'phone-header', 'music-header'] as const)(
    'renders inside the %s experience navigation',
    (placement) => {
      const markup = renderSlot(placement === 'music-header' ? '/music' : '/', placement);

      expect(markup).toContain(`data-media-mode-switcher-slot="${placement}"`);
      expect(markup).toContain('data-tv-focus-lane-id="media-mode"');
      expect(markup).toContain(`data-placement="${placement}"`);
    },
  );

  it('marks Music active on the dedicated music experience', () => {
    const markup = renderSlot('/music', 'music-header');

    expect(markup).toContain('data-mode="music"');
    expect(markup).toMatch(
      /class="[^"]*is-active[^"]*" type="button" aria-pressed="true" aria-label="Open Music library"/,
    );
  });

  it('stays out of dedicated playback surfaces', () => {
    expect(renderSlot('/player/media-1', 'phone-header')).toBe('');
    expect(renderSlot('/watch/session-1', 'top-nav')).toBe('');
  });
});
