import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UploadedAddonPackage } from '../../domain/addon-package.types';
import { AddonPackageStorage } from '../../infrastructure/addon-package-storage';
import { AddonRegistryStore } from '../../infrastructure/addon-registry.store';
import { AddonPackageVerifier } from './addon-package-verifier.service';

@Injectable()
export class AddonsService {
  private installChain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly registry: AddonRegistryStore,
    private readonly verifier: AddonPackageVerifier,
    private readonly storage: AddonPackageStorage,
  ) {}

  list() {
    return this.registry.getSnapshot();
  }

  getTrustPolicy() {
    return this.registry.getTrustPolicy();
  }

  async updateTrustPolicy(input: {
    allowUnsigned: boolean;
    acknowledgeRisk?: boolean;
  }) {
    if (input.allowUnsigned && input.acknowledgeRisk !== true) {
      throw new BadRequestException(
        'Enabling unsigned add-ons requires explicit risk acknowledgement.',
      );
    }
    return this.registry.setAllowUnsigned(input.allowUnsigned);
  }

  install(upload: UploadedAddonPackage | undefined) {
    if (
      !upload ||
      !Buffer.isBuffer(upload.buffer) ||
      upload.buffer.length === 0
    ) {
      throw new BadRequestException('Choose an add-on ZIP package to upload.');
    }
    const result = this.installChain.then(() => this.installExclusive(upload));
    this.installChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async enable(id: string) {
    return this.setEnabled(id, true);
  }

  async disable(id: string) {
    return this.setEnabled(id, false);
  }

  private async installExclusive(upload: UploadedAddonPackage) {
    const verified = this.verifier.verify(upload.buffer);
    const policy = await this.registry.getTrustPolicy();
    if (verified.trust === 'unsigned' && !policy.allowUnsigned) {
      throw new BadRequestException(
        'Unsigned add-on packages are disabled. Enable them in the trust policy only if you trust this package.',
      );
    }
    const relativeDirectory = await this.storage.store({
      id: verified.manifest.id,
      version: verified.manifest.version,
      digest: verified.digest,
      entries: verified.entries,
    });
    const record = await this.registry.stagePackage({
      id: verified.manifest.id,
      name: verified.manifest.name.trim(),
      package: {
        version: verified.manifest.version,
        digest: verified.digest,
        relativeDirectory,
        installedAt: new Date().toISOString(),
        trust: verified.trust,
        signingKeyId: verified.signingKeyId,
        serverEntrypoint: verified.manifest.entrypoints.server ?? null,
        webEntrypoint: verified.manifest.entrypoints.web ?? null,
      },
    });
    return {
      addon: record,
      restartRequired: true,
      uploadedFileName: upload.originalname,
    };
  }

  private async setEnabled(idInput: string, enabled: boolean) {
    const id = idInput.trim();
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(id)) {
      throw new NotFoundException('Add-on was not found.');
    }
    const record = await this.registry.setEnabled(id, enabled);
    if (!record) throw new NotFoundException('Add-on was not found.');
    return { addon: record, restartRequired: true };
  }
}
