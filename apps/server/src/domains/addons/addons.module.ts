import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../auth/presentation/guards/admin.guard';
import { AddonPackageVerifier } from './application/services/addon-package-verifier.service';
import { AddonSignatureVerifier } from './application/services/addon-signature-verifier.service';
import { AddonsService } from './application/services/addons.service';
import { AddonRuntimeService } from './application/services/addon-runtime.service';
import { InstalledAddonVerifier } from './application/services/installed-addon-verifier.service';
import { AddonPackageStorage } from './infrastructure/addon-package-storage';
import { AddonRegistryStore } from './infrastructure/addon-registry.store';
import { AdminAddonsController } from './presentation/controllers/admin-addons.controller';
import { AddonRuntimeController } from './presentation/controllers/addon-runtime.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminAddonsController, AddonRuntimeController],
  providers: [
    AdminGuard,
    AddonRegistryStore,
    AddonSignatureVerifier,
    AddonPackageVerifier,
    AddonPackageStorage,
    AddonsService,
    AddonRuntimeService,
    InstalledAddonVerifier,
  ],
  exports: [AddonRegistryStore, AddonsService],
})
export class AddonsModule {}
