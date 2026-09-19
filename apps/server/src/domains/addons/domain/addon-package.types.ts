export const ADDON_MANIFEST_FILE = 'yeen-addon.json';
export const ADDON_INTEGRITY_FILE = 'integrity.json';
export const ADDON_SIGNATURE_FILE = 'signature.json';

export interface AddonIntegrityFile {
  path: string;
  size: number;
  sha256: string;
}

export interface AddonManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  addonApiVersion: number;
  core: {
    minimumVersion: string;
    maximumVersionExclusive?: string;
  };
  entrypoints: {
    server?: string;
    web?: string;
  };
  permissions?: string[];
  platforms?: Array<{
    os: 'linux' | 'darwin' | 'win32';
    arch: 'arm64' | 'x64';
  }>;
}

export interface AddonIntegrity {
  schemaVersion: 1;
  algorithm: 'sha256';
  files: AddonIntegrityFile[];
}

export interface AddonPackageSignature {
  schemaVersion: 1;
  algorithm: 'Ed25519';
  keyId: string;
  signed: 'integrity.json';
  signature: string;
}

export interface InstalledAddonPackage {
  version: string;
  digest: string;
  relativeDirectory: string;
  installedAt: string;
  trust: 'signed' | 'unsigned';
  signingKeyId: string | null;
  serverEntrypoint: string | null;
  webEntrypoint: string | null;
}

export interface AddonRecord {
  id: string;
  name: string;
  enabled: boolean;
  active: InstalledAddonPackage | null;
  pending: InstalledAddonPackage | null;
  previous: InstalledAddonPackage | null;
  quarantined?: InstalledAddonPackage | null;
}

export interface AddonRegistryState {
  schemaVersion: 1;
  allowUnsigned: boolean;
  restartRequired: boolean;
  addons: Record<string, AddonRecord>;
}

export interface UploadedAddonPackage {
  buffer: Buffer;
  originalname: string;
}
