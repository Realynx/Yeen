import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../../../index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../../../App.tsx', import.meta.url), 'utf8');
const androidCss = readFileSync(
  new URL('../../../styles/responsive/android-native.css', import.meta.url),
  'utf8',
);

describe('Android APK visual surface contract', () => {
  it('opts into edge-to-edge viewport safe-area measurements', () => {
    expect(html).toContain('viewport-fit=cover');
    expect(appSource).toContain("data-yeen-native-platform");
    expect(androidCss).toContain('env(safe-area-inset-top');
    expect(androidCss).toContain('env(safe-area-inset-bottom');
    expect(androidCss).toContain('env(safe-area-inset-left');
    expect(androidCss).toContain('env(safe-area-inset-right');
  });

  it('keeps phone navigation and player controls touch-sized', () => {
    expect(androidCss).toMatch(/\.phone-bottom-nav-link[\s\S]*min-height:\s*48px/);
    expect(androidCss).toMatch(/\.player-icon-button[\s\S]*min-width:\s*44px/);
    expect(androidCss).toMatch(/\.player-menu-item[\s\S]*min-height:\s*48px/);
  });

  it('defines dedicated fullscreen landscape and TV overscan treatments', () => {
    expect(androidCss).toContain('(orientation: landscape)');
    expect(androidCss).toContain('.phone-page-shell-player');
    expect(androidCss).toContain('.video-shell.is-fullscreen');
    expect(androidCss).toContain('--yeen-tv-overscan-inline');
    expect(androidCss).toContain('--yeen-tv-overscan-block');
  });

  it('bounds native dialogs and menus to the visible dynamic viewport', () => {
    expect(androidCss).toContain('.metadata-modal-backdrop');
    expect(androidCss).toContain('.addon-confirm-backdrop');
    expect(androidCss).toContain('.admin-accounts-editor-backdrop');
    expect(androidCss).toContain('100dvh');
    expect(androidCss).toContain('overscroll-behavior: contain');
  });
});
