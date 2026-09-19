import type { RegisterSWOptions } from 'virtual:pwa-register';

export type PwaRuntimeStatus =
  | 'idle'
  | 'ready-for-offline'
  | 'offline'
  | 'update-available'
  | 'update-failed';

export interface PwaRegistrationSignals {
  isProduction: boolean;
  isNativePlatform: boolean;
  serviceWorkerSupported: boolean;
}

type RegisterServiceWorker = (
  options?: RegisterSWOptions,
) => (reloadPage?: boolean) => Promise<void>;

type PwaWindow = Pick<
  Window,
  'addEventListener' | 'removeEventListener' | 'document' | 'navigator'
>;

const statusListeners = new Set<() => void>();
let currentStatus: PwaRuntimeStatus = 'idle';
let activateWaitingServiceWorker: (() => Promise<void>) | null = null;
let updateWaiting = false;

export function shouldRegisterYeenPwa(signals: PwaRegistrationSignals): boolean {
  return (
    signals.isProduction
    && !signals.isNativePlatform
    && signals.serviceWorkerSupported
  );
}

export function getPwaRuntimeStatus(): PwaRuntimeStatus {
  return currentStatus;
}

export function getPwaServerSnapshot(): PwaRuntimeStatus {
  return 'idle';
}

export function subscribeToPwaRuntimeStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function setPwaRuntimeStatus(status: PwaRuntimeStatus): void {
  if (currentStatus === status) {
    return;
  }

  currentStatus = status;
  statusListeners.forEach((listener) => listener());
}

export async function applyAvailablePwaUpdate(): Promise<void> {
  if (!activateWaitingServiceWorker) {
    return;
  }

  try {
    await activateWaitingServiceWorker();
  } catch (error) {
    console.error('Unable to activate the Yeen web app update.', error);
    setPwaRuntimeStatus('update-failed');
  }
}

/**
 * Registers the browser PWA and owns its small update/network lifecycle.
 * Capacitor deliberately calls this with `isNativePlatform: true`: WebView
 * assets are versioned by the APK and must never be shadowed by a web SW.
 */
export function registerYeenPwa(
  registerServiceWorker: RegisterServiceWorker,
  signals: PwaRegistrationSignals,
  target: PwaWindow = window,
): () => void {
  if (!shouldRegisterYeenPwa(signals)) {
    return () => undefined;
  }

  let registration: ServiceWorkerRegistration | undefined;
  let lastUpdateCheckAt = 0;
  const checkForUpdate = () => {
    const now = Date.now();
    if (!registration || now - lastUpdateCheckAt < 60_000) {
      return;
    }

    lastUpdateCheckAt = now;
    void registration.update().catch((error: unknown) => {
      console.error('Unable to check for a Yeen web app update.', error);
    });
  };
  const handleOnline = () => {
    setPwaRuntimeStatus(updateWaiting ? 'update-available' : 'idle');
    checkForUpdate();
  };
  const handleOffline = () => {
    setPwaRuntimeStatus('offline');
  };
  const handleVisibilityChange = () => {
    if (target.document.visibilityState === 'visible') {
      checkForUpdate();
    }
  };

  const updateServiceWorker = registerServiceWorker({
    immediate: true,
    onNeedRefresh: () => {
      updateWaiting = true;
      setPwaRuntimeStatus('update-available');
    },
    onOfflineReady: () => {
      if (target.navigator.onLine && !updateWaiting) {
        setPwaRuntimeStatus('ready-for-offline');
      }
    },
    onRegisteredSW: (_serviceWorkerUrl, registeredServiceWorker) => {
      registration = registeredServiceWorker;
      lastUpdateCheckAt = Date.now();
    },
    onRegisterError: (error: unknown) => {
      console.error('Unable to register the Yeen web app for offline use.', error);
    },
  });
  activateWaitingServiceWorker = () => updateServiceWorker(true);

  if (!target.navigator.onLine) {
    setPwaRuntimeStatus('offline');
  }
  target.addEventListener('online', handleOnline);
  target.addEventListener('offline', handleOffline);
  target.document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    target.removeEventListener('online', handleOnline);
    target.removeEventListener('offline', handleOffline);
    target.document.removeEventListener('visibilitychange', handleVisibilityChange);
    activateWaitingServiceWorker = null;
    updateWaiting = false;
  };
}
