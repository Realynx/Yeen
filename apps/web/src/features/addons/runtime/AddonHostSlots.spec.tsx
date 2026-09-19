import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { RegisteredAddonRoute } from './addonRuntime.types';

const hostState = vi.hoisted(() => ({
  clientExperience: 'desktop' as 'desktop' | 'phone' | 'tv',
}));

vi.mock('../../navigation/components/AdminNav', () => ({
  AdminNav: () => <header data-testid="admin-nav" />,
}));

vi.mock('../../navigation/components/PhonePageHeader', () => ({
  PhonePageHeader: ({
    onOpenRandomDetails,
  }: {
    onOpenRandomDetails?: (() => void | Promise<void>) | null;
  }) => (
    <header
      data-testid="phone-page-header"
      data-has-random-details={typeof onOpenRandomDetails === 'function'}
    />
  ),
}));

vi.mock('../../navigation/components/PhonePageShell', () => ({
  PhonePageShell: ({ children, pageKey }: { children: React.ReactNode; pageKey: string }) => (
    <div data-testid="phone-page-shell" data-page-key={pageKey}>{children}</div>
  ),
}));

vi.mock('../../navigation/components/TvPageShell', () => ({
  TvPageShell: ({ children, pageKey }: { children: React.ReactNode; pageKey: string }) => (
    <div data-testid="tv-page-shell" data-page-key={pageKey}>{children}</div>
  ),
}));

vi.mock('../../settings/components/system-settings-categories/SettingsCategorySection', () => ({
  SettingsCategorySection: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('./AddonSurfaceHost', () => ({
  AddonSurfaceHost: ({ className }: { className?: string }) => (
    <div className={className} data-testid="addon-surface" />
  ),
}));

vi.mock('./AddonHostContext', () => ({
  useAddonHost: () => ({
    accessToken: 'test-token',
    user: {
      id: 'account-1',
      name: 'Administrator',
      email: 'admin@example.test',
      role: 'admin',
    },
    clientExperience: hostState.clientExperience,
    onLogout: vi.fn(),
    routes: [],
    navigation: [],
    settingsSurfaces: [],
    mediaItemActions: [],
    mediaItemSurfaces: [],
    mediaCardSurfaces: [],
    preparationSurfaces: [],
    playbackStatusSurfaces: [],
    styles: [],
    errors: [],
    loading: false,
  }),
}));

import { AddonRouteSurface } from './AddonHostSlots';

const route: RegisteredAddonRoute = {
  addon: { id: 'com.example.workspace', name: 'Workspace', version: '1.0.0' },
  id: 'workspace',
  path: '/admin/workspace',
  title: 'Workspace',
  elementTag: 'example-workspace',
  experiencePageKeys: {
    phone: 'workspace-phone',
    tv: 'workspace-tv',
  },
  shell: 'admin',
  allowedRoles: ['administrator'],
};

describe('AddonRouteSurface', () => {
  it('keeps an admin route inside the native navigation and full-width content grid', () => {
    hostState.clientExperience = 'desktop';
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={[route.path]}>
        <AddonRouteSurface route={route} />
      </MemoryRouter>,
    );

    expect(markup).toContain('data-testid="admin-nav"');
    expect(markup).toMatch(
      /class="settings-content-grid"[^>]*><div class="addon-route-surface"/,
    );

    const css = readFileSync(
      new URL('../../../styles/components/addon-host.css', import.meta.url),
      'utf8',
    );
    const routeSurfaceRule = css.match(/\.addon-route-surface\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(routeSurfaceRule).toMatch(/grid-column:\s*1\s*\/\s*-1\s*;/);
    expect(routeSurfaceRule).toMatch(/width:\s*100%\s*;/);
  });

  it('retains contribution-defined Phone and TV shell identities', () => {
    hostState.clientExperience = 'phone';
    const phoneMarkup = renderToStaticMarkup(
      <MemoryRouter initialEntries={[route.path]}>
        <AddonRouteSurface route={route} />
      </MemoryRouter>,
    );
    expect(phoneMarkup).toContain('data-page-key="workspace-phone"');
    expect(phoneMarkup).toContain('phone-workspace-phone-page');
    expect(phoneMarkup).toContain('data-has-random-details="true"');

    hostState.clientExperience = 'tv';
    const tvMarkup = renderToStaticMarkup(
      <MemoryRouter initialEntries={[route.path]}>
        <AddonRouteSurface route={route} />
      </MemoryRouter>,
    );
    expect(tvMarkup).toContain('data-page-key="workspace-tv"');
    expect(tvMarkup).toContain('data-testid="admin-nav"');
  });
});
