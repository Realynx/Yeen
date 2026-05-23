import { useEffect, useState } from 'react';
import {
  clearMediaApiCaches,
  clearMediaMetadataIndex,
  getSystemSettings,
  toApiErrorMessage,
  updateSystemSettings,
} from '../../shared/services/api';
import type { SystemSettings } from '../../shared/services/types';

export interface SystemSettingsState {
  systemSettings: SystemSettings | null;
  loadingSystemSettings: boolean;
  savingSystemSettings: boolean;
  clearingApiCaches: boolean;
  clearingMetadataIndex: boolean;
  systemMessage: string | null;
  systemError: string | null;
  updateSetting: <K extends keyof SystemSettings>(
    key: K,
    value: SystemSettings[K],
  ) => void;
  saveSystemSettings: () => Promise<void>;
  clearApiCaches: () => Promise<void>;
  clearMetadataIndex: () => Promise<void>;
}

export function useSystemSettings(
  token: string,
  enabled: boolean,
): SystemSettingsState {
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(
    null,
  );
  const [loadingSystemSettings, setLoadingSystemSettings] = useState(false);
  const [savingSystemSettings, setSavingSystemSettings] = useState(false);
  const [clearingApiCaches, setClearingApiCaches] = useState(false);
  const [clearingMetadataIndex, setClearingMetadataIndex] = useState(false);
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function loadSettings() {
      setLoadingSystemSettings(true);
      setSystemError(null);

      try {
        const response = await getSystemSettings(token);
        if (!cancelled) {
          setSystemSettings(response);
        }
      } catch (loadFailure) {
        if (!cancelled) {
          setSystemError(
            toApiErrorMessage(loadFailure, 'Failed to load system settings.'),
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingSystemSettings(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [enabled, token]);

  function updateSetting<K extends keyof SystemSettings>(
    key: K,
    value: SystemSettings[K],
  ) {
    setSystemSettings((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        [key]: value,
      };
    });
    setSystemMessage(null);
  }

  async function saveSystemSettings() {
    if (!systemSettings) {
      return;
    }

    setSavingSystemSettings(true);
    setSystemError(null);
    setSystemMessage(null);

    try {
      const response = await updateSystemSettings(token, systemSettings);
      setSystemSettings(response);
      setSystemMessage('System settings saved.');
    } catch (saveFailure) {
      setSystemError(
        toApiErrorMessage(saveFailure, 'Failed to save system settings.'),
      );
    } finally {
      setSavingSystemSettings(false);
    }
  }

  async function clearApiCaches() {
    if (!enabled) {
      return;
    }

    setClearingApiCaches(true);
    setSystemError(null);
    setSystemMessage(null);

    try {
      const response = await clearMediaApiCaches(token);
      setSystemMessage(response.message || 'API caches cleared.');
    } catch (clearFailure) {
      setSystemError(
        toApiErrorMessage(clearFailure, 'Failed to clear API caches.'),
      );
    } finally {
      setClearingApiCaches(false);
    }
  }

  async function clearMetadataIndex() {
    if (!enabled) {
      return;
    }

    setClearingMetadataIndex(true);
    setSystemError(null);
    setSystemMessage(null);

    try {
      const response = await clearMediaMetadataIndex(token);
      setSystemMessage(response.message || 'Media metadata cleared.');
    } catch (clearFailure) {
      setSystemError(
        toApiErrorMessage(clearFailure, 'Failed to clear media metadata.'),
      );
    } finally {
      setClearingMetadataIndex(false);
    }
  }

  return {
    systemSettings,
    loadingSystemSettings,
    savingSystemSettings,
    clearingApiCaches,
    clearingMetadataIndex,
    systemMessage,
    systemError,
    updateSetting,
    saveSystemSettings,
    clearApiCaches,
    clearMetadataIndex,
  };
}
