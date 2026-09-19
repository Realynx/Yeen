import {
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  clamp,
  readPlayerPreferences,
  STANDARD_RESOLUTION_HEIGHT_OPTIONS,
  toResolutionBitrateHintKbps,
  type SubtitleFontPreset,
} from './playerUtils';
import type { PlayerTranscodePreferences } from './usePlayerData';

function resolveMaxResolutionForBitrateBudget(bitrateBudgetKbps: number): number {
  let highestAllowed: number = STANDARD_RESOLUTION_HEIGHT_OPTIONS[0];

  for (const height of STANDARD_RESOLUTION_HEIGHT_OPTIONS) {
    if (toResolutionBitrateHintKbps(height) <= bitrateBudgetKbps) {
      highestAllowed = height;
    }
  }

  return highestAllowed;
}

interface UsePlayerPreferenceStateOptions {
  userMaxBitrateKbps: number | null | undefined;
}

export interface PlayerPreferenceState {
  theaterMode: boolean;
  setTheaterMode: Dispatch<SetStateAction<boolean>>;
  volume: number;
  setVolume: Dispatch<SetStateAction<number>>;
  muted: boolean;
  setMuted: Dispatch<SetStateAction<boolean>>;
  playbackRate: number;
  setPlaybackRate: Dispatch<SetStateAction<number>>;
  subtitleFontPreset: SubtitleFontPreset;
  setSubtitleFontPreset: Dispatch<SetStateAction<SubtitleFontPreset>>;
  preferredVideoBitrateKbps: number | null;
  setPreferredVideoBitrateKbps: Dispatch<SetStateAction<number | null>>;
  preferredAudioBitrateKbps: number | null;
  setPreferredAudioBitrateKbps: Dispatch<SetStateAction<number | null>>;
  preferredMaxResolutionHeight: number | null;
  setPreferredMaxResolutionHeight: Dispatch<SetStateAction<number | null>>;
  accountVideoQuotaKbps: number;
  effectivePreferredVideoBitrateKbps: number | null;
  effectivePreferredAudioBitrateKbps: number | null;
  maxResolutionForBitrateBudget: number;
  effectivePreferredMaxResolutionHeight: number | null;
  transcodePreferences: PlayerTranscodePreferences;
}

export function usePlayerPreferenceState({
  userMaxBitrateKbps,
}: UsePlayerPreferenceStateOptions): PlayerPreferenceState {
  const initialPreferences = useMemo(() => readPlayerPreferences(), []);

  const [theaterMode, setTheaterMode] = useState(initialPreferences.theaterMode);
  const [volume, setVolume] = useState(initialPreferences.volume);
  const [muted, setMuted] = useState(initialPreferences.muted);
  const [playbackRate, setPlaybackRate] = useState(initialPreferences.playbackRate);
  const [subtitleFontPreset, setSubtitleFontPreset] =
    useState(initialPreferences.subtitleFontPreset);
  const [preferredVideoBitrateKbps, setPreferredVideoBitrateKbps] =
    useState<number | null>(initialPreferences.preferredVideoBitrateKbps);
  const [preferredAudioBitrateKbps, setPreferredAudioBitrateKbps] =
    useState<number | null>(initialPreferences.preferredAudioBitrateKbps);
  const [preferredMaxResolutionHeight, setPreferredMaxResolutionHeight] =
    useState<number | null>(initialPreferences.preferredMaxResolutionHeight);

  const accountVideoQuotaKbps = useMemo(() => {
    if (typeof userMaxBitrateKbps === 'number' && Number.isFinite(userMaxBitrateKbps)) {
      return clamp(Math.round(userMaxBitrateKbps), 250, 50000);
    }

    return 50000;
  }, [userMaxBitrateKbps]);

  const effectivePreferredVideoBitrateKbps = useMemo(() => {
    if (
      typeof preferredVideoBitrateKbps !== 'number'
      || !Number.isFinite(preferredVideoBitrateKbps)
    ) {
      return null;
    }

    return clamp(Math.round(preferredVideoBitrateKbps), 250, accountVideoQuotaKbps);
  }, [accountVideoQuotaKbps, preferredVideoBitrateKbps]);

  const effectivePreferredAudioBitrateKbps = useMemo(() => {
    if (
      typeof preferredAudioBitrateKbps !== 'number'
      || !Number.isFinite(preferredAudioBitrateKbps)
    ) {
      return null;
    }

    return clamp(Math.round(preferredAudioBitrateKbps), 48, 384);
  }, [preferredAudioBitrateKbps]);

  const maxResolutionForBitrateBudget = useMemo(() => {
    const bitrateBudgetKbps = effectivePreferredVideoBitrateKbps ?? accountVideoQuotaKbps;
    return resolveMaxResolutionForBitrateBudget(bitrateBudgetKbps);
  }, [accountVideoQuotaKbps, effectivePreferredVideoBitrateKbps]);

  const effectivePreferredMaxResolutionHeight = useMemo(() => {
    if (
      typeof preferredMaxResolutionHeight !== 'number'
      || !Number.isFinite(preferredMaxResolutionHeight)
    ) {
      return null;
    }

    return Math.min(
      clamp(Math.round(preferredMaxResolutionHeight), 240, 2160),
      maxResolutionForBitrateBudget,
    );
  }, [maxResolutionForBitrateBudget, preferredMaxResolutionHeight]);

  const transcodePreferences = useMemo(() => {
    return {
      maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      audioBitrateKbps: effectivePreferredAudioBitrateKbps,
      maxOutputHeight: effectivePreferredMaxResolutionHeight,
    };
  }, [
    effectivePreferredAudioBitrateKbps,
    effectivePreferredMaxResolutionHeight,
    effectivePreferredVideoBitrateKbps,
  ]);

  return {
    theaterMode,
    setTheaterMode,
    volume,
    setVolume,
    muted,
    setMuted,
    playbackRate,
    setPlaybackRate,
    subtitleFontPreset,
    setSubtitleFontPreset,
    preferredVideoBitrateKbps,
    setPreferredVideoBitrateKbps,
    preferredAudioBitrateKbps,
    setPreferredAudioBitrateKbps,
    preferredMaxResolutionHeight,
    setPreferredMaxResolutionHeight,
    accountVideoQuotaKbps,
    effectivePreferredVideoBitrateKbps,
    effectivePreferredAudioBitrateKbps,
    maxResolutionForBitrateBudget,
    effectivePreferredMaxResolutionHeight,
    transcodePreferences,
  };
}
