import { describe, expect, it } from 'vitest';
import {
  normalizeAddonCatalogResponse,
  normalizeRuntimeRestartStatus,
  normalizeRuntimeWebAddonManifest,
} from './api-addons';

describe('add-on API normalization', () => {
  it('normalizes a raw registry array and detects staged packages', () => {
    const catalog = normalizeAddonCatalogResponse([
      {
        id: 'private.downloader',
        name: 'Downloader',
        enabled: true,
        active: {
          version: '1.0.0',
          trust: 'signed',
          signingKeyId: 'yeen-private',
        },
        pending: {
          version: '1.1.0',
          trust: 'signed',
          signingKeyId: 'yeen-private',
        },
      },
    ]);

    expect(catalog.restartRequired).toBe(true);
    expect(catalog.items[0]).toMatchObject({
      id: 'private.downloader',
      status: 'staged',
      activeVersion: '1.0.0',
      stagedVersion: '1.1.0',
      signatureStatus: 'verified',
    });
  });

  it('accepts a catalog wrapper', () => {
    const catalog = normalizeAddonCatalogResponse({
      items: [],
      restartRequired: true,
    });

    expect(catalog).toEqual({ items: [], restartRequired: true });
  });

  it('maps lifecycle signaling state to the UI restarting phase', () => {
    const status = normalizeRuntimeRestartStatus({
      id: 'restart-1',
      mode: 'instant',
      state: 'signaling',
      requestedAt: '2026-07-19T12:00:00.000Z',
      activePlaybackCount: 2,
      supervisedRestartExpected: false,
    });

    expect(status).toMatchObject({
      id: 'restart-1',
      mode: 'instant',
      phase: 'restarting',
      activePlaybackCount: 2,
    });
    expect(status.message).toContain('not supervised');
  });

  it('accepts the runtime web manifest entrypoint field during migration', () => {
    expect(normalizeRuntimeWebAddonManifest({
      items: [{
        id: 'private.demo',
        name: 'Demo',
        version: '1.0.0',
        entrypointUrl: '/api/addons/runtime/demo.js',
      }],
    }).items[0]?.webEntryUrl).toBe('/api/addons/runtime/demo.js');
  });
});
