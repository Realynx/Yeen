import { useCallback, useEffect, useState } from 'react';
import {
  disableAddon,
  enableAddon,
  getAddonCatalog,
  getAddonTrustPolicy,
  installAddonPackage,
  toApiErrorMessage,
  updateAddonTrustPolicy,
} from '../../shared/services/api';
import type {
  AddonCatalog,
  AddonTrustPolicy,
} from '../../shared/services/types';

const EMPTY_CATALOG: AddonCatalog = {
  items: [],
  restartRequired: false,
};

export function useAddonCatalog(token: string, enabled: boolean) {
  const [catalog, setCatalog] = useState<AddonCatalog>(EMPTY_CATALOG);
  const [trustPolicy, setTrustPolicy] = useState<AddonTrustPolicy>({
    allowUnsigned: false,
  });
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updatingPolicy, setUpdatingPolicy] = useState(false);
  const [updatingAddonId, setUpdatingAddonId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [nextCatalog, nextPolicy] = await Promise.all([
        getAddonCatalog(token),
        getAddonTrustPolicy(token),
      ]);
      setCatalog(nextCatalog);
      setTrustPolicy(nextPolicy);
    } catch (failure) {
      setError(toApiErrorMessage(failure, 'Unable to load add-ons.'));
    } finally {
      setLoading(false);
    }
  }, [enabled, token]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function install(packageFile: File): Promise<boolean> {
    setInstalling(true);
    setMessage(null);
    setError(null);

    try {
      const result = await installAddonPackage(token, packageFile);
      setMessage(result.message ?? `${result.item.name} was staged successfully.`);
      await refresh();
      return true;
    } catch (failure) {
      setError(toApiErrorMessage(failure, 'Unable to install this add-on package.'));
      return false;
    } finally {
      setInstalling(false);
    }
  }

  async function setAllowUnsigned(allowUnsigned: boolean): Promise<boolean> {
    setUpdatingPolicy(true);
    setMessage(null);
    setError(null);

    try {
      const nextPolicy = await updateAddonTrustPolicy(token, { allowUnsigned });
      setTrustPolicy(nextPolicy);
      setMessage(
        allowUnsigned
          ? 'Unsigned add-on packages are now allowed.'
          : 'Signed add-on packages are required.',
      );
      return true;
    } catch (failure) {
      setError(toApiErrorMessage(failure, 'Unable to update the add-on trust policy.'));
      return false;
    } finally {
      setUpdatingPolicy(false);
    }
  }

  async function setAddonEnabled(addonId: string, nextEnabled: boolean) {
    setUpdatingAddonId(addonId);
    setMessage(null);
    setError(null);

    try {
      const mutation = nextEnabled
        ? await enableAddon(token, addonId)
        : await disableAddon(token, addonId);
      setCatalog((current) => ({
        items: current.items.map((item) =>
          item.id === addonId ? mutation.item : item,
        ),
        restartRequired: current.restartRequired || mutation.restartRequired,
      }));
      setMessage(
        nextEnabled
          ? 'Add-on enabled. Restart to activate the change.'
          : 'Add-on disabled. Restart to complete the change.',
      );
    } catch (failure) {
      setError(toApiErrorMessage(failure, 'Unable to update this add-on.'));
    } finally {
      setUpdatingAddonId(null);
    }
  }

  return {
    catalog,
    trustPolicy,
    loading,
    installing,
    updatingPolicy,
    updatingAddonId,
    message,
    error,
    refresh,
    install,
    setAllowUnsigned,
    setAddonEnabled,
  };
}
