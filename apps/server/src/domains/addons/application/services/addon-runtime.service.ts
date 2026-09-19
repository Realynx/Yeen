import { Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { lookup } from 'mime-types';
import type { Response } from 'express';
import type { AddonRecord } from '../../domain/addon-package.types';
import { AddonRegistryStore } from '../../infrastructure/addon-registry.store';
import { InstalledAddonVerifier } from './installed-addon-verifier.service';

@Injectable()
export class AddonRuntimeService {
  constructor(
    private readonly registry: AddonRegistryStore,
    private readonly verifier: InstalledAddonVerifier,
  ) {}

  async getWebManifest() {
    const snapshot = await this.registry.getSnapshot();
    const items: Array<{
      id: string;
      name: string;
      version: string;
      digest: string;
      webEntryUrl: string;
    }> = [];
    for (const original of snapshot.items) {
      let record: AddonRecord | null = original;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const active = record.enabled ? record.active : null;
        if (!active?.webEntrypoint) break;
        try {
          await this.verifier.verify(
            this.registry.getRootPath(),
            record,
            active,
            snapshot.allowUnsigned,
          );
          const assetPath = active.webEntrypoint
            .split('/')
            .map(encodeURIComponent)
            .join('/');
          items.push({
            id: record.id,
            name: record.name,
            version: active.version,
            digest: active.digest,
            webEntryUrl: `/api/addons/runtime/${encodeURIComponent(record.id)}/${active.digest}/assets/${assetPath}`,
          });
          break;
        } catch (error) {
          console.error(
            `Add-on ${record.id}@${active.version} failed runtime integrity validation and was quarantined:`,
            error,
          );
          record = await this.registry.quarantineActive(
            record.id,
            active.digest,
          );
          if (!record) break;
        }
      }
    }
    return {
      items,
      restartRequired: snapshot.restartRequired,
    };
  }

  async streamWebAsset(input: {
    id: string;
    digest: string;
    assetPath: string;
    response: Response;
  }): Promise<void> {
    const snapshot = await this.registry.getSnapshot();
    const record = snapshot.items.find(
      (candidate) => candidate.id === input.id,
    );
    if (!record?.enabled) notFound();
    const active = record.active;
    if (!active?.webEntrypoint || active.digest !== input.digest) notFound();
    try {
      await this.verifier.verify(
        this.registry.getRootPath(),
        record,
        active,
        snapshot.allowUnsigned,
      );
    } catch (error) {
      console.error(
        `Add-on ${record.id}@${active.version} failed asset integrity validation and was quarantined:`,
        error,
      );
      await this.registry.quarantineActive(record.id, active.digest);
      notFound();
    }
    const normalizedPath = normalizeAssetPath(input.assetPath);
    const webRoot = dirname(active.webEntrypoint);
    if (webRoot === '.') {
      if (normalizedPath !== active.webEntrypoint) notFound();
    } else if (
      normalizedPath !== webRoot &&
      !normalizedPath.startsWith(`${webRoot}/`)
    ) {
      notFound();
    }
    const packageRoot = resolve(
      this.registry.getRootPath(),
      active.relativeDirectory,
    );
    const assetFile = resolve(packageRoot, ...normalizedPath.split('/'));
    assertInside(packageRoot, assetFile);
    const fileStat = await stat(assetFile).catch(() => null);
    if (!fileStat?.isFile()) notFound();
    input.response.setHeader(
      'Content-Type',
      lookup(assetFile) || 'application/octet-stream',
    );
    input.response.setHeader(
      'Cache-Control',
      'private, max-age=31536000, immutable',
    );
    createReadStream(assetFile).pipe(input.response);
  }
}

function normalizeAssetPath(input: string): string {
  const path = input.replaceAll('\\', '/');
  if (
    !path ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    notFound();
  return path;
}

function assertInside(root: string, candidate: string): void {
  const pathFromRoot = relative(resolve(root), resolve(candidate));
  if (pathFromRoot.startsWith('..')) notFound();
}

function notFound(): never {
  throw new NotFoundException('Add-on asset was not found.');
}
