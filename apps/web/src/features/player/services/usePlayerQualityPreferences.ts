import { useCallback, useMemo } from 'react';
import {
  clamp,
  STANDARD_AUDIO_BITRATE_OPTIONS_KBPS,
  STANDARD_RESOLUTION_HEIGHT_OPTIONS,
  STANDARD_VIDEO_BITRATE_OPTIONS_KBPS,
  toResolutionBitrateHintKbps,
} from './playerUtils';
import type { PlaybackSource } from './usePlayerData';
import type { HlsSwitchOptions } from './playerData.types';

function toUniqueSortedNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function resolveMaxResolutionForBitrateBudget(bitrateBudgetKbps: number): number {
  let highestAllowed: number = STANDARD_RESOLUTION_HEIGHT_OPTIONS[0];

  for (const height of STANDARD_RESOLUTION_HEIGHT_OPTIONS) {
    if (toResolutionBitrateHintKbps(height) <= bitrateBudgetKbps) {
      highestAllowed = height;
    }
  }

  return highestAllowed;
}

interface DerivePlayerQualityOptionsInput {
  accountVideoQuotaKbps: number;
  maxResolutionForBitrateBudget: number;
  preferredMaxResolutionHeight: number | null;
  preferredVideoBitrateKbps: number | null;
  preferredAudioBitrateKbps: number | null;
  appliedMaxOutputHeight: number | null;
  appliedVideoBitrateKbps: number | null;
  appliedAudioBitrateKbps: number | null;
}

export interface PlayerQualityOptions {
  effectiveVideoBitrateQuotaKbps: number;
  resolutionHeightOptions: number[];
  videoBitrateOptionsKbps: number[];
  audioBitrateOptionsKbps: number[];
}

/**
 * Builds selectable transcode profiles from account capabilities and saved
 * preferences. Applied HLS values are included for status continuity, but they
 * must never become capability ceilings: doing so traps Playback at the first
 * lower profile selected during the current session.
 */
export function derivePlayerQualityOptions({
  accountVideoQuotaKbps,
  maxResolutionForBitrateBudget,
  preferredMaxResolutionHeight,
  preferredVideoBitrateKbps,
  preferredAudioBitrateKbps,
  appliedMaxOutputHeight,
  appliedVideoBitrateKbps,
  appliedAudioBitrateKbps,
}: DerivePlayerQualityOptionsInput): PlayerQualityOptions {
  const effectiveVideoBitrateQuotaKbps = clamp(
    Math.round(accountVideoQuotaKbps),
    250,
    50000,
  );
  const effectiveResolutionCeilingForUi = clamp(
    Math.round(maxResolutionForBitrateBudget),
    240,
    2160,
  );

  const resolutionHeightOptions: number[] = STANDARD_RESOLUTION_HEIGHT_OPTIONS.filter((height) => {
    return (
      height <= effectiveResolutionCeilingForUi
      && toResolutionBitrateHintKbps(height) <= effectiveVideoBitrateQuotaKbps
    );
  });

  if (resolutionHeightOptions.length === 0) {
    resolutionHeightOptions.push(STANDARD_RESOLUTION_HEIGHT_OPTIONS[0]);
  }

  if (typeof preferredMaxResolutionHeight === 'number') {
    resolutionHeightOptions.push(preferredMaxResolutionHeight);
  }

  if (typeof appliedMaxOutputHeight === 'number') {
    resolutionHeightOptions.push(appliedMaxOutputHeight);
  }

  const videoBitrateOptionsKbps: number[] = STANDARD_VIDEO_BITRATE_OPTIONS_KBPS.filter((value) => {
    return value <= effectiveVideoBitrateQuotaKbps;
  });

  if (videoBitrateOptionsKbps.length === 0) {
    videoBitrateOptionsKbps.push(effectiveVideoBitrateQuotaKbps);
  }

  if (!videoBitrateOptionsKbps.includes(effectiveVideoBitrateQuotaKbps)) {
    videoBitrateOptionsKbps.push(effectiveVideoBitrateQuotaKbps);
  }

  if (typeof preferredVideoBitrateKbps === 'number') {
    videoBitrateOptionsKbps.push(preferredVideoBitrateKbps);
  }

  if (typeof appliedVideoBitrateKbps === 'number') {
    videoBitrateOptionsKbps.push(appliedVideoBitrateKbps);
  }

  const audioBitrateOptionsKbps: number[] = [...STANDARD_AUDIO_BITRATE_OPTIONS_KBPS];

  if (typeof preferredAudioBitrateKbps === 'number') {
    audioBitrateOptionsKbps.push(preferredAudioBitrateKbps);
  }

  if (typeof appliedAudioBitrateKbps === 'number') {
    audioBitrateOptionsKbps.push(appliedAudioBitrateKbps);
  }

  return {
    effectiveVideoBitrateQuotaKbps,
    resolutionHeightOptions: toUniqueSortedNumbers(
      resolutionHeightOptions.filter((value) => (
        Number.isFinite(value) && value >= 240 && value <= 2160
      )),
    ),
    videoBitrateOptionsKbps: toUniqueSortedNumbers(
      videoBitrateOptionsKbps.filter((value) => (
        Number.isFinite(value) && value >= 250 && value <= effectiveVideoBitrateQuotaKbps
      )),
    ),
    audioBitrateOptionsKbps: toUniqueSortedNumbers(
      audioBitrateOptionsKbps.filter((value) => (
        Number.isFinite(value) && value >= 48 && value <= 384
      )),
    ),
  };
}

interface UsePlayerQualityPreferencesOptions {
  source: PlaybackSource | null;
  accountVideoQuotaKbps: number;
  maxResolutionForBitrateBudget: number;
  preferredMaxResolutionHeight: number | null;
  setPreferredVideoBitrateKbps: (nextValue: number | null) => void;
  setPreferredAudioBitrateKbps: (nextValue: number | null) => void;
  setPreferredMaxResolutionHeight: (nextValue: number | null) => void;
  effectivePreferredVideoBitrateKbps: number | null;
  effectivePreferredAudioBitrateKbps: number | null;
  effectivePreferredMaxResolutionHeight: number | null;
  selectedAudioStreamIndex: number | null;
  switchToHls: (options?: HlsSwitchOptions) => Promise<boolean>;
}

export interface PlayerQualityPreferences {
  effectiveVideoBitrateQuotaKbps: number;
  resolutionHeightOptions: number[];
  videoBitrateOptionsKbps: number[];
  audioBitrateOptionsKbps: number[];
  handlePreferredVideoBitrateChange: (nextVideoBitrateKbps: number | null) => void;
  handlePreferredAudioBitrateChange: (nextAudioBitrateKbps: number | null) => void;
  handlePreferredResolutionChange: (nextMaxResolutionHeight: number | null) => void;
}

export function usePlayerQualityPreferences({
  source,
  accountVideoQuotaKbps,
  maxResolutionForBitrateBudget,
  preferredMaxResolutionHeight,
  setPreferredVideoBitrateKbps,
  setPreferredAudioBitrateKbps,
  setPreferredMaxResolutionHeight,
  effectivePreferredVideoBitrateKbps,
  effectivePreferredAudioBitrateKbps,
  effectivePreferredMaxResolutionHeight,
  selectedAudioStreamIndex,
  switchToHls,
}: UsePlayerQualityPreferencesOptions): PlayerQualityPreferences {
  const isHlsSource = source?.hls === true;
  const sourceMaxVideoBitrateKbps =
    typeof source?.maxVideoBitrateKbps === 'number'
    && Number.isFinite(source.maxVideoBitrateKbps)
      ? source.maxVideoBitrateKbps
      : null;
  const sourceMaxOutputHeight =
    typeof source?.maxOutputHeight === 'number'
    && Number.isFinite(source.maxOutputHeight)
      ? source.maxOutputHeight
      : null;
  const sourceAudioBitrateKbps =
    typeof source?.audioBitrateKbps === 'number'
    && Number.isFinite(source.audioBitrateKbps)
      ? source.audioBitrateKbps
      : null;

  const {
    effectiveVideoBitrateQuotaKbps,
    resolutionHeightOptions,
    videoBitrateOptionsKbps,
    audioBitrateOptionsKbps,
  } = useMemo(() => derivePlayerQualityOptions({
    accountVideoQuotaKbps,
    maxResolutionForBitrateBudget,
    preferredMaxResolutionHeight: effectivePreferredMaxResolutionHeight,
    preferredVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
    preferredAudioBitrateKbps: effectivePreferredAudioBitrateKbps,
    appliedMaxOutputHeight: isHlsSource ? sourceMaxOutputHeight : null,
    appliedVideoBitrateKbps: isHlsSource ? sourceMaxVideoBitrateKbps : null,
    appliedAudioBitrateKbps: isHlsSource ? sourceAudioBitrateKbps : null,
  }), [
    accountVideoQuotaKbps,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredMaxResolutionHeight,
    effectivePreferredVideoBitrateKbps,
    isHlsSource,
    maxResolutionForBitrateBudget,
    sourceAudioBitrateKbps,
    sourceMaxOutputHeight,
    sourceMaxVideoBitrateKbps,
  ]);

  const handlePreferredVideoBitrateChange = useCallback((nextVideoBitrateKbps: number | null) => {
    const normalizedVideoBitrateKbps =
      typeof nextVideoBitrateKbps === 'number' && Number.isFinite(nextVideoBitrateKbps)
        ? clamp(Math.round(nextVideoBitrateKbps), 250, effectiveVideoBitrateQuotaKbps)
        : null;

    if (!isHlsSource) {
      setPreferredVideoBitrateKbps(normalizedVideoBitrateKbps);
      return;
    }

    const nextBitrateBudgetKbps = normalizedVideoBitrateKbps ?? accountVideoQuotaKbps;
    const nextResolutionCeiling = resolveMaxResolutionForBitrateBudget(nextBitrateBudgetKbps);
    const nextMaxOutputHeight =
      typeof preferredMaxResolutionHeight === 'number'
        ? Math.min(
            clamp(Math.round(preferredMaxResolutionHeight), 240, 2160),
            nextResolutionCeiling,
          )
        : null;

    void switchToHls({
      forceFresh: true,
      audioStreamIndex: selectedAudioStreamIndex,
      maxVideoBitrateKbps: normalizedVideoBitrateKbps,
      audioBitrateKbps: effectivePreferredAudioBitrateKbps,
      maxOutputHeight: nextMaxOutputHeight,
    }).then((switched) => {
      if (switched) {
        setPreferredVideoBitrateKbps(normalizedVideoBitrateKbps);
      }
    });
  }, [
    accountVideoQuotaKbps,
    effectivePreferredAudioBitrateKbps,
    effectiveVideoBitrateQuotaKbps,
    preferredMaxResolutionHeight,
    selectedAudioStreamIndex,
    isHlsSource,
    setPreferredVideoBitrateKbps,
    switchToHls,
  ]);

  const handlePreferredAudioBitrateChange = useCallback((nextAudioBitrateKbps: number | null) => {
    const normalizedAudioBitrateKbps =
      typeof nextAudioBitrateKbps === 'number' && Number.isFinite(nextAudioBitrateKbps)
        ? clamp(Math.round(nextAudioBitrateKbps), 48, 384)
        : null;

    if (!isHlsSource) {
      setPreferredAudioBitrateKbps(normalizedAudioBitrateKbps);
      return;
    }

    void switchToHls({
      forceFresh: true,
      audioStreamIndex: selectedAudioStreamIndex,
      maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      audioBitrateKbps: normalizedAudioBitrateKbps,
      maxOutputHeight: effectivePreferredMaxResolutionHeight,
    }).then((switched) => {
      if (switched) {
        setPreferredAudioBitrateKbps(normalizedAudioBitrateKbps);
      }
    });
  }, [
    effectivePreferredMaxResolutionHeight,
    effectivePreferredVideoBitrateKbps,
    selectedAudioStreamIndex,
    isHlsSource,
    setPreferredAudioBitrateKbps,
    switchToHls,
  ]);

  const handlePreferredResolutionChange = useCallback((nextMaxResolutionHeight: number | null) => {
    const bitrateBudgetKbps = effectivePreferredVideoBitrateKbps ?? accountVideoQuotaKbps;
    const bitrateCeiling = resolveMaxResolutionForBitrateBudget(bitrateBudgetKbps);

    const normalizedMaxResolutionHeight =
      typeof nextMaxResolutionHeight === 'number' && Number.isFinite(nextMaxResolutionHeight)
        ? Math.min(clamp(Math.round(nextMaxResolutionHeight), 240, 2160), bitrateCeiling)
        : null;

    if (!isHlsSource) {
      setPreferredMaxResolutionHeight(normalizedMaxResolutionHeight);
      return;
    }

    void switchToHls({
      forceFresh: true,
      audioStreamIndex: selectedAudioStreamIndex,
      maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      audioBitrateKbps: effectivePreferredAudioBitrateKbps,
      maxOutputHeight: normalizedMaxResolutionHeight,
    }).then((switched) => {
      if (switched) {
        setPreferredMaxResolutionHeight(normalizedMaxResolutionHeight);
      }
    });
  }, [
    accountVideoQuotaKbps,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredVideoBitrateKbps,
    selectedAudioStreamIndex,
    isHlsSource,
    setPreferredMaxResolutionHeight,
    switchToHls,
  ]);

  return {
    effectiveVideoBitrateQuotaKbps,
    resolutionHeightOptions,
    videoBitrateOptionsKbps,
    audioBitrateOptionsKbps,
    handlePreferredVideoBitrateChange,
    handlePreferredAudioBitrateChange,
    handlePreferredResolutionChange,
  };
}
