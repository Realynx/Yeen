import { useSyncExternalStore } from 'react';
import {
  applyAvailablePwaUpdate,
  getPwaRuntimeStatus,
  getPwaServerSnapshot,
  subscribeToPwaRuntimeStatus,
} from './pwaRuntime';
import './pwa-runtime-notice.css';

export function PwaRuntimeNotice() {
  const status = useSyncExternalStore(
    subscribeToPwaRuntimeStatus,
    getPwaRuntimeStatus,
    getPwaServerSnapshot,
  );

  if (status === 'update-available' || status === 'update-failed') {
    const updateFailed = status === 'update-failed';
    return (
      <aside className="pwa-runtime-notice" role="status" aria-live="polite">
        <span>
          <strong>{updateFailed ? 'Update paused' : 'Yeen is ready to update'}</strong>
          {updateFailed
            ? ' Refresh the page when you are ready to try again.'
            : ' Reload to use the newest version.'}
        </span>
        <button
          type="button"
          onClick={() => {
            if (updateFailed) {
              window.location.reload();
              return;
            }
            void applyAvailablePwaUpdate();
          }}
        >
          Reload
        </button>
      </aside>
    );
  }

  if (status === 'offline') {
    return (
      <aside className="pwa-runtime-notice is-offline" role="status" aria-live="polite">
        <span>
          <strong>You are offline.</strong> Your app and sign-in remain available; playback
          and library data will reconnect automatically.
        </span>
      </aside>
    );
  }

  return null;
}
