import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CoreUpdatePanel } from './CoreUpdatePanel';

vi.mock('../services/useCoreUpdate', () => ({
  useCoreUpdate: () => ({
    status: {
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      repository: 'Realynx/Yeen',
      channel: 'stable',
      configured: true,
      managedMode: 'systemd',
      operatorCommand: null,
      updateAvailable: true,
      phase: 'available',
      mode: null,
      activePlaybackCount: 0,
      checkedAt: '2026-01-01T00:00:00Z',
      publishedAt: '2026-01-01T00:00:00Z',
      message: 'Yeen 1.2.0 is available.',
    },
    busy: false,
    error: null,
    refresh: vi.fn(),
    check: vi.fn(),
    apply: vi.fn(),
  }),
}));

describe('CoreUpdatePanel', () => {
  it('shows installed/latest versions and explicit graceful/instant choices', () => {
    const markup = renderToStaticMarkup(<CoreUpdatePanel token="token" />);
    expect(markup).toContain('1.0.0');
    expect(markup).toContain('1.2.0');
    expect(markup).toContain('Update gracefully');
    expect(markup).toContain('Update now');
    expect(markup).toContain('Realynx/Yeen');
  });
});
