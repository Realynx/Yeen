import { useCallback, useEffect, useState } from 'react';
import {
  addMediaQueryChangeListener,
  isLikelyPhoneDevice,
  isStandaloneDisplayMode,
} from './homePhonePageUtils';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

interface UsePhoneInstallPromptState {
  deferredInstallPrompt: BeforeInstallPromptEvent | null;
  installStatusMessage: string | null;
  showInstallPanel: boolean;
  handleInstallPwa: () => Promise<void>;
}

export function usePhoneInstallPrompt(): UsePhoneInstallPromptState {
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installStatusMessage, setInstallStatusMessage] = useState<string | null>(null);
  const [showInstallPanel, setShowInstallPanel] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return isLikelyPhoneDevice(window) && !isStandaloneDisplayMode(window);
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const displayModeQuery = window.matchMedia('(display-mode: standalone)');

    const syncInstallPanelState = () => {
      const shouldShow = isLikelyPhoneDevice(window) && !isStandaloneDisplayMode(window);
      setShowInstallPanel(shouldShow);
      if (!shouldShow) {
        setDeferredInstallPrompt(null);
        setInstallStatusMessage(null);
      }
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallStatusMessage(null);
      syncInstallPanelState();
    };

    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setInstallStatusMessage(null);
      syncInstallPanelState();
    };

    syncInstallPanelState();
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('resize', syncInstallPanelState);
    const removeDisplayModeListener = addMediaQueryChangeListener(
      displayModeQuery,
      syncInstallPanelState,
    );

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt as EventListener,
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('resize', syncInstallPanelState);
      removeDisplayModeListener();
    };
  }, []);

  const handleInstallPwa = useCallback(async () => {
    if (deferredInstallPrompt) {
      try {
        await deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;

        if (choiceResult.outcome === 'accepted') {
          setInstallStatusMessage('Install started. Launch Yeen from your home screen.');
        } else {
          setInstallStatusMessage('Install dismissed. You can try again anytime.');
        }
      } catch {
        setInstallStatusMessage(
          'Install prompt unavailable. Use your browser menu and tap Add to Home Screen.',
        );
      } finally {
        setDeferredInstallPrompt(null);
      }

      return;
    }

    setInstallStatusMessage('Use your browser menu and tap Add to Home Screen to install Yeen.');
  }, [deferredInstallPrompt]);

  return {
    deferredInstallPrompt,
    installStatusMessage,
    showInstallPanel,
    handleInstallPwa,
  };
}
