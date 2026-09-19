/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  readMediaMode,
  writeMediaMode,
  type MediaMode,
} from './mediaModePreference';

interface MediaModeContextValue {
  mode: MediaMode;
  setMode: (mode: MediaMode) => void;
  toggleMode: () => void;
}

const MediaModeContext = createContext<MediaModeContextValue | null>(null);

interface MediaModeProviderProps extends PropsWithChildren {
  accountId: string;
}

export function MediaModeProvider({ accountId, children }: MediaModeProviderProps) {
  const [mode, setModeState] = useState<MediaMode>(() => readMediaMode(accountId));

  const setMode = useCallback((nextMode: MediaMode) => {
    setModeState(nextMode);
    writeMediaMode(accountId, nextMode);
  }, [accountId]);

  const toggleMode = useCallback(() => {
    setMode(mode === 'video' ? 'music' : 'video');
  }, [mode, setMode]);

  const value = useMemo(() => ({ mode, setMode, toggleMode }), [mode, setMode, toggleMode]);

  return (
    <MediaModeContext.Provider value={value}>
      {children}
    </MediaModeContext.Provider>
  );
}

export function useMediaMode(): MediaModeContextValue {
  const context = useContext(MediaModeContext);
  if (!context) {
    throw new Error('useMediaMode must be used inside MediaModeProvider.');
  }

  return context;
}
