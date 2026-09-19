import type {
  AddonCatalog,
  AddonMutationResult,
  AddonPackageInstallResult,
  AddonTrustPolicy,
  RuntimeRestartMode,
  RuntimeRestartStatus,
  RuntimeWebAddonManifest,
} from './types-addons';
import { jsonBody, request } from './api-core';

export function getAddonCatalog(token: string) {
  return request<unknown>('/addons', {}, token).then(normalizeAddonCatalogResponse);
}

export function getAddonTrustPolicy(token: string) {
  return request<AddonTrustPolicy>('/addons/trust-policy', {}, token);
}

export function updateAddonTrustPolicy(
  token: string,
  policy: AddonTrustPolicy,
) {
  return request<AddonTrustPolicy>(
    '/addons/trust-policy',
    {
      method: 'PUT',
      body: jsonBody({
        ...policy,
        acknowledgeRisk: policy.allowUnsigned,
      }),
    },
    token,
  );
}

export function installAddonPackage(token: string, packageFile: File) {
  const formData = new FormData();
  formData.append('package', packageFile, packageFile.name);

  return request<unknown>(
    '/addons/packages',
    {
      method: 'POST',
      body: formData,
    },
    token,
  ).then(normalizeInstallResult);
}

export function enableAddon(token: string, addonId: string) {
  return request<unknown>(
    `/addons/${encodeURIComponent(addonId)}/enable`,
    { method: 'POST' },
    token,
  ).then(normalizeMutationResult);
}

export function disableAddon(token: string, addonId: string) {
  return request<unknown>(
    `/addons/${encodeURIComponent(addonId)}/disable`,
    { method: 'POST' },
    token,
  ).then(normalizeMutationResult);
}

export function requestRuntimeRestart(
  token: string,
  mode: RuntimeRestartMode,
) {
  return request<unknown>(
    '/runtime/restarts',
    {
      method: 'POST',
      body: jsonBody({ mode }),
    },
    token,
  ).then(normalizeRuntimeRestartStatus);
}

export function getCurrentRuntimeRestart(token: string) {
  return request<unknown>('/runtime/restarts/current', {}, token)
    .then(normalizeRuntimeRestartStatus);
}

export function cancelCurrentRuntimeRestart(token: string) {
  return request<unknown>(
    '/runtime/restarts/current',
    { method: 'DELETE' },
    token,
  ).then(normalizeRuntimeRestartStatus);
}

export function getRuntimeWebAddons(token: string) {
  return request<unknown>('/addons/runtime', {}, token)
    .then(normalizeRuntimeWebAddonManifest);
}

export function normalizeRuntimeWebAddonManifest(
  value: unknown,
): RuntimeWebAddonManifest {
  const wrapper = isObject(value) ? value : {};
  const items = Array.isArray(wrapper.items) ? wrapper.items : [];

  return {
    items: items.flatMap((candidate) => {
      if (!isObject(candidate)) {
        return [];
      }

      const id = stringValue(candidate.id);
      const name = stringValue(candidate.name);
      const version = stringValue(candidate.version);
      const webEntryUrl =
        stringValue(candidate.webEntryUrl)
        ?? stringValue(candidate.entrypointUrl);

      if (!id || !name || !version || !webEntryUrl) {
        return [];
      }

      return [{ id, name, version, webEntryUrl }];
    }),
  };
}

export function normalizeAddonCatalogResponse(value: unknown): AddonCatalog {
  const wrapper = isObject(value) ? value : null;
  const rawItems = Array.isArray(value)
    ? value
    : Array.isArray(wrapper?.items)
      ? wrapper.items
      : [];
  const items = rawItems
    .filter(isObject)
    .map((item) => normalizeAddonRecord(item));

  return {
    items,
    restartRequired:
      wrapper?.restartRequired === true
      || items.some((item) => item.restartRequired),
  };
}

function normalizeInstallResult(value: unknown): AddonPackageInstallResult {
  const wrapper = isObject(value) ? value : {};
  const rawAddon = isObject(wrapper.addon)
    ? wrapper.addon
    : isObject(wrapper.item)
      ? wrapper.item
      : {};
  const item = normalizeAddonRecord(rawAddon);

  return {
    item,
    restartRequired: wrapper.restartRequired !== false,
    message: typeof wrapper.message === 'string' ? wrapper.message : undefined,
  };
}

function normalizeMutationResult(value: unknown): AddonMutationResult {
  const result = normalizeInstallResult(value);
  return {
    item: result.item,
    restartRequired: result.restartRequired,
  };
}

function addonDisplayName(value: Record<string, unknown>): string {
  return stringValue(value.name) ?? stringValue(value.id) ?? 'Unknown add-on';
}

function addonStatus(
  pending: Record<string, unknown> | null,
  active: Record<string, unknown> | null,
  enabled: boolean,
) {
  if (pending) return 'staged' as const;
  if (active && enabled) return 'active' as const;
  return 'disabled' as const;
}

function normalizeAddonRecord(value: Record<string, unknown>) {
  const active = isObject(value.active) ? value.active : null;
  const pending = isObject(value.pending) ? value.pending : null;
  const preferredPackage = pending ?? active;
  const trust = preferredPackage?.trust;
  const enabled = value.enabled === true;
  const activeVersion = stringValue(active?.version);
  const stagedVersion = stringValue(pending?.version);

  return {
    id: stringValue(value.id) ?? 'unknown-addon',
    name: addonDisplayName(value),
    version: stagedVersion ?? activeVersion ?? 'Not active',
    publisher: stringValue(preferredPackage?.signingKeyId),
    signer: stringValue(preferredPackage?.signingKeyId),
    signatureStatus: trust === 'signed' ? 'verified' as const : 'unsigned' as const,
    enabled,
    compatible: true,
    status: addonStatus(pending, active, enabled),
    activeVersion,
    stagedVersion,
    restartRequired: Boolean(pending),
  };
}

export function normalizeRuntimeRestartStatus(value: unknown): RuntimeRestartStatus {
  const status = isObject(value) ? value : {};
  const rawState = stringValue(status.state) ?? stringValue(status.phase) ?? 'idle';
  const phase = rawState === 'signaling'
    ? 'restarting' as const
    : rawState === 'draining'
      ? 'draining' as const
      : rawState === 'cancelled'
        ? 'cancelled' as const
        : rawState === 'failed'
          ? 'failed' as const
          : 'idle' as const;
  const supervisorMissing = status.supervisedRestartExpected === false;

  return {
    id: stringValue(status.id),
    mode: status.mode === 'graceful' || status.mode === 'instant'
      ? status.mode
      : null,
    phase,
    activePlaybackCount:
      typeof status.activePlaybackCount === 'number'
        ? Math.max(0, status.activePlaybackCount)
        : 0,
    requestedAt: stringValue(status.requestedAt),
    supervisedRestartExpected: !supervisorMissing,
    message: supervisorMissing
      ? 'Automatic restart is unavailable because this Yeen process is not supervised.'
      : undefined,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
