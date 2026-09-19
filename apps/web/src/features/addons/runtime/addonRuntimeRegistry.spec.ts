import { describe, expect, it } from 'vitest';
import {
  createAddonRegistrationContext,
  resolveAddonElementTag,
} from './addonRuntimeRegistry';

describe('add-on registration context', () => {
  it('normalizes registered routes and surfaces', () => {
    const { context, registration } = createAddonRegistrationContext({
      id: 'private.demo',
      name: 'Demo',
      version: '1.0.0',
      webEntryUrl: '/demo.js',
    });

    context.register({
      routes: [{
        id: 'home',
        path: '/demo',
        title: 'Demo',
        elementTag: 'yeen-demo-page',
        experienceElementTags: {
          phone: 'yeen-demo-page-phone',
          tv: 'yeen-demo-page-tv',
        },
        experiencePageKeys: {
          phone: 'demo-phone',
          tv: 'demo-tv',
        },
        shell: 'admin',
        allowedRoles: ['administrator', 'downloader'],
      }],
      navigation: [{
        id: 'demo',
        label: 'Demo',
        to: '/demo',
        placement: 'browse',
      }],
      mediaCardSurfaces: [{
        id: 'status-overlay',
        elementTag: 'yeen-demo-card-status',
        allowedRoles: ['administrator', 'downloader'],
      }],
      mediaItemActions: [{
        id: 'quick-action',
        label: 'Quick action',
        elementTag: 'yeen-demo-action',
      }],
      remoteMusicResultActions: [{
        id: 'save-track',
        label: 'Save track',
        elementTag: 'yeen-demo-save-track',
        placement: 'card',
        allowedRoles: ['administrator', 'downloader'],
      }],
      mediaItemSurfaces: [{
        id: 'details-status',
        elementTag: 'yeen-demo-details-status',
        placement: 'after-hero',
      }],
      preparationSurfaces: [{
        id: 'prepare-page',
        elementTag: 'yeen-demo-prepare',
        queryParameter: 'prepareRef',
      }],
      playbackStatusSurfaces: [{
        id: 'playback-status',
        elementTag: 'yeen-demo-playback-status',
      }],
    });

    expect(registration.routes[0]).toMatchObject({
      path: '/demo',
      elementTag: 'yeen-demo-page',
      addon: { id: 'private.demo' },
      allowedRoles: ['administrator', 'downloader'],
      experienceElementTags: {
        phone: 'yeen-demo-page-phone',
        tv: 'yeen-demo-page-tv',
      },
      experiencePageKeys: {
        phone: 'demo-phone',
        tv: 'demo-tv',
      },
      shell: 'admin',
    });
    expect(registration.navigation[0]?.order).toBe(100);
    expect(registration.mediaCardSurfaces[0]).toMatchObject({
      id: 'status-overlay',
      elementTag: 'yeen-demo-card-status',
      order: 100,
      addon: { id: 'private.demo' },
    });
    expect(registration.mediaItemActions[0]?.placement).toBe('hero-actions');
    expect(registration.remoteMusicResultActions[0]).toMatchObject({
      id: 'save-track',
      placement: 'card',
      order: 100,
      addon: { id: 'private.demo' },
    });
    expect(registration.mediaItemSurfaces[0]).toMatchObject({
      id: 'details-status',
      placement: 'after-hero',
    });
    expect(registration.preparationSurfaces[0]?.queryParameter).toBe('prepareRef');
    expect(registration.playbackStatusSurfaces[0]?.elementTag)
      .toBe('yeen-demo-playback-status');
    expect(resolveAddonElementTag(
      registration.routes[0]!.elementTag,
      registration.routes[0]!.experienceElementTags,
      'phone',
    )).toBe('yeen-demo-page-phone');
    expect(resolveAddonElementTag(
      registration.routes[0]!.elementTag,
      registration.routes[0]!.experienceElementTags,
      'desktop',
    )).toBe('yeen-demo-page');
  });

  it('supports profile navigation and categorized settings', () => {
    const { context, registration } = createAddonRegistrationContext({
      id: 'private.demo',
      name: 'Demo',
      version: '1.0.0',
      webEntryUrl: '/demo.js',
    });

    context.register({
      navigation: [{
        id: 'profile-link',
        label: 'Demo tools',
        to: '/demo',
        placement: 'profile',
      }],
      settingsSurfaces: [{
        id: 'provider-settings',
        title: 'Provider',
        shortTitle: 'Provider',
        note: 'Optional integration',
        sectionId: 'system-provider-settings',
        elementTag: 'yeen-demo-provider-settings',
        placement: 'system',
      }],
    });

    expect(registration.navigation[0]?.placement).toBe('profile');
    expect(registration.settingsSurfaces[0]).toMatchObject({
      sectionId: 'system-provider-settings',
      note: 'Optional integration',
    });
  });

  it('rejects navigation outside the app and invalid custom elements', () => {
    const { context } = createAddonRegistrationContext({
      id: 'private.demo',
      name: 'Demo',
      version: '1.0.0',
      webEntryUrl: '/demo.js',
    });

    expect(() => context.register({
      navigation: [{
        id: 'external',
        label: 'External',
        to: 'https://example.test',
        placement: 'browse',
      }],
    })).toThrow(/start with/);
    expect(() => context.register({
      routes: [{
        id: 'bad',
        path: '/bad',
        title: 'Bad',
        elementTag: 'invalid',
      }],
    })).toThrow(/custom element/);
  });
});
