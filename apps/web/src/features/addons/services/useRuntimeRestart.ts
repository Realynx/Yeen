import { useCallback, useEffect, useState } from 'react';
import {
  cancelCurrentRuntimeRestart,
  getCurrentRuntimeRestart,
  requestRuntimeRestart,
  toApiErrorMessage,
} from '../../shared/services/api';
import type {
  RuntimeRestartMode,
  RuntimeRestartStatus,
} from '../../shared/services/types';
import { restartPhaseIsActive } from './addonAdminUtils';

const IDLE_RESTART: RuntimeRestartStatus = {
  id: null,
  mode: null,
  phase: 'idle',
  activePlaybackCount: 0,
  requestedAt: null,
  supervisedRestartExpected: false,
};

export function useRuntimeRestart(token: string, enabled: boolean) {
  const [status, setStatus] = useState<RuntimeRestartStatus>(IDLE_RESTART);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!enabled) {
      return;
    }

    if (!quiet) {
      setLoading(true);
    }

    try {
      const nextStatus = await getCurrentRuntimeRestart(token);
      setStatus(nextStatus);
      setError(null);
    } catch (failure) {
      if (!quiet) {
        setError(toApiErrorMessage(failure, 'Unable to load restart status.'));
      }
    } finally {
      if (!quiet) {
        setLoading(false);
      }
    }
  }, [enabled, token]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!restartPhaseIsActive(status.phase)) {
      return;
    }

    const pollId = window.setInterval(() => {
      void refresh(true);
    }, 2000);

    return () => window.clearInterval(pollId);
  }, [refresh, status.phase]);

  async function restart(mode: RuntimeRestartMode) {
    setSubmitting(true);
    setError(null);

    try {
      const nextStatus = await requestRuntimeRestart(token, mode);
      setStatus(nextStatus);
    } catch (failure) {
      setError(toApiErrorMessage(failure, 'Unable to request a restart.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    setSubmitting(true);
    setError(null);

    try {
      const nextStatus = await cancelCurrentRuntimeRestart(token);
      setStatus(nextStatus);
    } catch (failure) {
      setError(toApiErrorMessage(failure, 'Unable to cancel the graceful restart.'));
    } finally {
      setSubmitting(false);
    }
  }

  return {
    status,
    loading,
    submitting,
    error,
    restart,
    cancel,
  };
}
