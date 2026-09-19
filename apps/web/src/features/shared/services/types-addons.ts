export type AddonSignatureStatus =
  | 'verified'
  | 'unsigned'
  | 'invalid'
  | 'unknown';

export type AddonRuntimeStatus =
  | 'active'
  | 'disabled'
  | 'staged'
  | 'failed';

export interface InstalledAddon {
  id: string;
  name: string;
  version: string;
  description?: string | null;
  publisher?: string | null;
  signer?: string | null;
  signatureStatus: AddonSignatureStatus;
  enabled: boolean;
  compatible: boolean;
  status: AddonRuntimeStatus;
  activeVersion?: string | null;
  stagedVersion?: string | null;
  restartRequired?: boolean;
  error?: string | null;
}

export interface AddonCatalog {
  items: InstalledAddon[];
  restartRequired: boolean;
}

export interface AddonTrustPolicy {
  allowUnsigned: boolean;
}

export interface AddonPackageInstallResult {
  item: InstalledAddon;
  restartRequired: boolean;
  message?: string;
}

export interface AddonMutationResult {
  item: InstalledAddon;
  restartRequired: boolean;
}

export type RuntimeRestartMode = 'graceful' | 'instant';

export type RuntimeRestartPhase =
  | 'idle'
  | 'scheduled'
  | 'draining'
  | 'restarting'
  | 'cancelled'
  | 'failed';

export interface RuntimeRestartStatus {
  id: string | null;
  mode: RuntimeRestartMode | null;
  phase: RuntimeRestartPhase;
  activePlaybackCount: number;
  requestedAt: string | null;
  supervisedRestartExpected: boolean;
  message?: string | null;
}

export interface RuntimeWebAddon {
  id: string;
  name: string;
  version: string;
  webEntryUrl: string;
}

export interface RuntimeWebAddonManifest {
  items: RuntimeWebAddon[];
}
