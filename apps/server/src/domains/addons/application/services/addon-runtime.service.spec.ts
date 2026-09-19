import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { AddonRecord } from '../../domain/addon-package.types';
import type { AddonRegistryStore } from '../../infrastructure/addon-registry.store';
import { AddonRuntimeService } from './addon-runtime.service';
import type { InstalledAddonVerifier } from './installed-addon-verifier.service';

describe('AddonRuntimeService installed package validation', () => {
  const record = webRecord();

  it('does not advertise and quarantines a web package that fails revalidation', async () => {
    const registry = registryFor(record);
    const verifier = {
      verify: jest.fn().mockRejectedValue(new Error('payload changed')),
    };
    const runtime = new AddonRuntimeService(
      registry as unknown as AddonRegistryStore,
      verifier as unknown as InstalledAddonVerifier,
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runtime.getWebManifest()).resolves.toEqual({
      items: [],
      restartRequired: false,
    });

    expect(verifier.verify).toHaveBeenCalledWith(
      'C:\\addons',
      record,
      record.active,
      false,
    );
    expect(registry.quarantineActive).toHaveBeenCalledWith(
      record.id,
      record.active?.digest,
    );
  });

  it('rejects an asset request and quarantines the package when revalidation fails', async () => {
    const registry = registryFor(record);
    const verifier = {
      verify: jest.fn().mockRejectedValue(new Error('signature revoked')),
    };
    const runtime = new AddonRuntimeService(
      registry as unknown as AddonRegistryStore,
      verifier as unknown as InstalledAddonVerifier,
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      runtime.streamWebAsset({
        id: record.id,
        digest: record.active!.digest,
        assetPath: 'web/index.js',
        response: {} as Response,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(registry.quarantineActive).toHaveBeenCalledWith(
      record.id,
      record.active?.digest,
    );
  });

  afterEach(() => jest.restoreAllMocks());
});

function registryFor(record: AddonRecord) {
  return {
    getRootPath: jest.fn(() => 'C:\\addons'),
    getSnapshot: jest.fn(() =>
      Promise.resolve({
        items: [record],
        restartRequired: false,
        allowUnsigned: false,
      }),
    ),
    quarantineActive: jest.fn(() => {
      const quarantined = structuredClone(record);
      quarantined.active = null;
      quarantined.enabled = false;
      return Promise.resolve(quarantined);
    }),
  };
}

function webRecord(): AddonRecord {
  const digest = 'a'.repeat(64);
  return {
    id: 'com.yeen.web',
    name: 'Web Add-on',
    enabled: true,
    active: {
      version: '1.0.0',
      digest,
      relativeDirectory: `packages/com.yeen.web/1.0.0-${digest}`,
      installedAt: new Date(0).toISOString(),
      trust: 'signed',
      signingKeyId: 'owner',
      serverEntrypoint: null,
      webEntrypoint: 'web/index.js',
    },
    pending: null,
    previous: null,
  };
}
