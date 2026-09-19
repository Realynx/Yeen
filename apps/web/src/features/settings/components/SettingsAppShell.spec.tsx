import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '../../shared/services/types';

vi.mock('../../addons/runtime/AddonHostContext', () => ({
  useAddonHost: () => ({ navigation: [] }),
}));

import { SettingsAppShell } from './SettingsAppShell';

const administrator = {
  id: 'account-1',
  name: 'Administrator',
  email: 'administrator@example.test',
  role: 'admin',
} as User;

describe('SettingsAppShell', () => {
  it('uses a full-width page heading instead of duplicating desktop navigation', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsAppShell
          user={administrator}
          experience="desktop"
          title="Profile & preferences"
          description="Manage your identity, playback defaults, security, and connected devices."
        >
          <div>Profile content</div>
        </SettingsAppShell>
      </MemoryRouter>,
    );

    expect(markup).toContain('data-settings-page-header="true"');
    expect(markup).not.toContain('aria-label="Settings sections"');
    expect(markup).toContain('Profile &amp; preferences');
    expect(markup).toContain('Profile content');
  });

  it('does not duplicate the shared top navigation on TV', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin/system']}>
        <SettingsAppShell
          user={administrator}
          experience="tv"
          title="System"
          description="Configure the server."
        >
          <div>System content</div>
        </SettingsAppShell>
      </MemoryRouter>,
    );

    expect(markup).toContain('data-settings-experience="tv"');
    expect(markup).not.toContain('aria-label="Settings sections"');
    expect(markup).toContain('data-settings-page-header="true"');
    expect(markup).toContain('System content');
  });

  it('keeps the compact horizontal destination list on Phone', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/admin/system']}>
        <SettingsAppShell
          user={administrator}
          experience="phone"
          title="System"
          description="Configure the server."
        >
          <div>System content</div>
        </SettingsAppShell>
      </MemoryRouter>,
    );

    expect(markup).toContain('aria-label="Settings sections"');
    const systemLink = markup.match(/<a[^>]*href="\/admin\/system"[^>]*>/)?.[0] ?? '';
    expect(systemLink).toContain('aria-current="page"');
    expect(markup).toContain('data-tv-focus-key="settings-navigation:system"');
  });
});
