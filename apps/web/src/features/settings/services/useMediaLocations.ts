import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  getMediaScanProgress,
  getMediaLocations,
  scanLibrary,
  setMediaLocations,
  toApiErrorMessage,
} from '../../shared/services/api';
import type { MediaScanProgress } from '../../shared/services/types';

export interface MediaLocationsState {
  locations: string[];
  newLocation: string;
  setNewLocation: Dispatch<SetStateAction<string>>;
  locationsSource: 'settings' | 'env' | null;
  loadingLocations: boolean;
  savingLocations: boolean;
  scanBusy: boolean;
  scanProgress: MediaScanProgress | null;
  locationMessage: string | null;
  locationError: string | null;
  scanMessage: string | null;
  scanError: string | null;
  addLocation: () => void;
  removeLocation: (indexToRemove: number) => void;
  saveLocations: () => Promise<void>;
  scanConfiguredLocations: () => Promise<void>;
}

export function useMediaLocations(
  token: string,
  enabled: boolean,
): MediaLocationsState {
  const [locations, setLocations] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [locationsSource, setLocationsSource] = useState<'settings' | 'env' | null>(
    null,
  );
  const [loadingLocations, setLoadingLocations] = useState(enabled);
  const [savingLocations, setSavingLocations] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanProgress, setScanProgress] = useState<MediaScanProgress | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const applyScanProgress = useCallback((progress: MediaScanProgress) => {
    setScanProgress(progress);
    setScanBusy(progress.status === 'running');

    if (progress.status === 'completed') {
      setScanError(null);
      setScanMessage(
        progress.message?.trim() ||
          `Scan complete: ${progress.indexedItems} media items indexed across ${progress.libraryPaths.length} locations.`,
      );
      return;
    }

    if (progress.status === 'failed') {
      setScanMessage(null);
      setScanError(progress.error ?? 'Library scan failed.');
      return;
    }

    if (progress.status === 'running') {
      setScanMessage(null);
      setScanError(null);
      return;
    }

    setScanError(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function loadLocations() {
      setLoadingLocations(true);
      setLocationError(null);

      try {
        const response = await getMediaLocations(token);
        if (!cancelled) {
          setLocations(response.locations);
          setLocationsSource(response.source);
        }
      } catch (loadFailure) {
        if (!cancelled) {
          setLocationError(
            toApiErrorMessage(
              loadFailure,
              'Failed to load configured media locations.',
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingLocations(false);
        }
      }
    }

    void loadLocations();

    return () => {
      cancelled = true;
    };
  }, [enabled, token]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function loadScanProgress() {
      try {
        const progress = await getMediaScanProgress(token);
        if (!cancelled) {
          applyScanProgress(progress);
        }
      } catch (loadFailure) {
        if (!cancelled) {
          setScanError(
            toApiErrorMessage(loadFailure, 'Failed to load media scan progress.'),
          );
        }
      }
    }

    void loadScanProgress();

    return () => {
      cancelled = true;
    };
  }, [applyScanProgress, enabled, token]);

  useEffect(() => {
    if (!enabled || !scanBusy) {
      return;
    }

    let cancelled = false;

    async function pollProgress() {
      try {
        const progress = await getMediaScanProgress(token);
        if (!cancelled) {
          applyScanProgress(progress);
        }
      } catch (pollFailure) {
        if (!cancelled) {
          setScanBusy(false);
          setScanError(
            toApiErrorMessage(
              pollFailure,
              'Lost connection while tracking scan progress.',
            ),
          );
        }
      }
    }

    const intervalId = window.setInterval(() => {
      void pollProgress();
    }, 1500);

    void pollProgress();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [applyScanProgress, enabled, scanBusy, token]);

  function addLocation() {
    if (!enabled) {
      return;
    }

    const candidate = newLocation.trim();
    if (!candidate) {
      return;
    }

    if (
      locations.some(
        (location) => location.toLowerCase() === candidate.toLowerCase(),
      )
    ) {
      setLocationError('That media location is already listed.');
      return;
    }

    setLocations((previous) => [...previous, candidate]);
    setNewLocation('');
    setLocationError(null);
    setLocationMessage(null);
  }

  function removeLocation(indexToRemove: number) {
    if (!enabled) {
      return;
    }

    setLocations((previous) => {
      return previous.filter((_, index) => index !== indexToRemove);
    });
    setLocationMessage(null);
  }

  async function saveLocations() {
    if (!enabled) {
      return;
    }

    setSavingLocations(true);
    setLocationError(null);
    setLocationMessage(null);

    try {
      const response = await setMediaLocations(token, locations);
      setLocations(response.locations);
      setLocationsSource(response.source);
      setLocationMessage('Media locations saved.');
    } catch (saveFailure) {
      setLocationError(
        toApiErrorMessage(saveFailure, 'Failed to save media locations.'),
      );
    } finally {
      setSavingLocations(false);
    }
  }

  async function scanConfiguredLocations() {
    if (!enabled) {
      return;
    }

    setScanError(null);
    setScanMessage(null);

    try {
      const response = await scanLibrary(token, undefined, locations);
      applyScanProgress(response);
    } catch (scanFailure) {
      setScanError(toApiErrorMessage(scanFailure, 'Library scan failed.'));
    }
  }

  return {
    locations,
    newLocation,
    setNewLocation,
    locationsSource,
    loadingLocations,
    savingLocations,
    scanBusy,
    scanProgress,
    locationMessage,
    locationError,
    scanMessage,
    scanError,
    addLocation,
    removeLocation,
    saveLocations,
    scanConfiguredLocations,
  };
}
