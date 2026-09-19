import { useCallback, useEffect, useState } from 'react';
import {
  applyCoreUpdate,
  checkForCoreUpdate,
  getCoreUpdateStatus,
  toApiErrorMessage,
} from '../../shared/services/api';
import type { CoreUpdateStatus, RuntimeRestartMode } from '../../shared/services/types';

const ACTIVE_PHASES = new Set(['checking', 'downloading', 'staged', 'draining', 'applying']);

export function useCoreUpdate(token: string) {
  const [status, setStatus] = useState<CoreUpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      setStatus(await getCoreUpdateStatus(token));
      setError(null);
    } catch (failure) {
      if (!quiet) setError(toApiErrorMessage(failure, 'Unable to load Core update status.'));
    } finally {
      if (!quiet) setBusy(false);
    }
  }, [token]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { void refresh(); }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!status || !ACTIVE_PHASES.has(status.phase)) return;
    const id = window.setInterval(() => void refresh(true), 2_000);
    return () => window.clearInterval(id);
  }, [refresh, status]);

  async function check() {
    setBusy(true);
    setError(null);
    try { setStatus(await checkForCoreUpdate(token)); }
    catch (failure) { setError(toApiErrorMessage(failure, 'Unable to check GitHub Releases.')); }
    finally { setBusy(false); }
  }

  async function apply(mode: RuntimeRestartMode) {
    setBusy(true);
    setError(null);
    try { setStatus(await applyCoreUpdate(token, mode)); }
    catch (failure) { setError(toApiErrorMessage(failure, 'Unable to apply the Core update.')); }
    finally { setBusy(false); }
  }

  return { status, busy, error, refresh, check, apply };
}
