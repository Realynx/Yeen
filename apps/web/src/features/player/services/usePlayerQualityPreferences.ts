import { useCallback, useMemo } from 'react';
import {
  clamp,
  STANDARD_AUDIO_BITRATE_OPTIONS_KBPS,
  STANDARD_RESOLUTION_HEIGHT_OPTIONS,
  STANDARD_VIDEO_BITRATE_OPTIONS_KBPS,
  toResolutionBitrateHintKbps,
} from './playerUtils';
import type { PlaybackSource } from './usePlayerData';

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
  switchToHls: (options?: {
    forceFresh?: boolean;
    audioStreamIndex?: number | null;
    maxVideoBitrateKbps?: number | null;
    audioBitrateKbps?: number | null;
    maxOutputHeight?: number | null;
  }) => Promise<boolean>;
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

  const effectiveVideoBitrateQuotaKbps = useMemo(() => {
    if (isHlsSource && sourceMaxVideoBitrateKbps !== null) {
      return Math.min(
        accountVideoQuotaKbps,
        clamp(Math.round(sourceMaxVideoBitrateKbps), 250, 50000),
      );
    }

    return accountVideoQuotaKbps;
  }, [accountVideoQuotaKbps, isHlsSource, sourceMaxVideoBitrateKbps]);

  const effectiveResolutionCeilingForUi = useMemo(() => {
    const sourceCeiling =
      isHlsSource && sourceMaxOutputHeight !== null
        ? clamp(Math.round(sourceMaxOutputHeight), 240, 2160)
        : 2160;

    return Math.min(sourceCeiling, maxResolutionForBitrateBudget);
  }, [isHlsSource, maxResolutionForBitrateBudget, sourceMaxOutputHeight]);

  const resolutionHeightOptions = useMemo(() => {
    const options: number[] = STANDARD_RESOLUTION_HEIGHT_OPTIONS.filter((height) => {
      return (
        height <= effectiveResolutionCeilingForUi
        && toResolutionBitrateHintKbps(height) <= effectiveVideoBitrateQuotaKbps
      );
    });

    if (options.length === 0) {
      options.push(STANDARD_RESOLUTION_HEIGHT_OPTIONS[0]);
    }

    if (typeof effectivePreferredMaxResolutionHeight === 'number') {
      options.push(effectivePreferredMaxResolutionHeight);
    }

    return toUniqueSortedNumbers(options);
  }, [
    effectivePreferredMaxResolutionHeight,
    effectiveResolutionCeilingForUi,
    effectiveVideoBitrateQuotaKbps,
  ]);

  const videoBitrateOptionsKbps = useMemo(() => {
    const options: number[] = STANDARD_VIDEO_BITRATE_OPTIONS_KBPS.filter((value) => {
      return value <= effectiveVideoBitrateQuotaKbps;
    });

    if (options.length === 0) {
      options.push(effectiveVideoBitrateQuotaKbps);
    }

    if (!options.includes(effectiveVideoBitrateQuotaKbps)) {
      options.push(effectiveVideoBitrateQuotaKbps);
    }

    if (typeof effectivePreferredVideoBitrateKbps === 'number') {
      options.push(effectivePreferredVideoBitrateKbps);
    }

    if (isHlsSource && sourceMaxVideoBitrateKbps !== null) {
      options.push(clamp(Math.round(sourceMaxVideoBitrateKbps), 250, 50000));
    }

    return toUniqueSortedNumbers(
      options.filter((value) => Number.isFinite(value) && value >= 250 && value <= 50000),
    );
  }, [
    effectivePreferredVideoBitrateKbps,
    effectiveVideoBitrateQuotaKbps,
    isHlsSource,
    sourceMaxVideoBitrateKbps,
  ]);

  const audioBitrateOptionsKbps = useMemo(() => {
    const options: number[] = [...STANDARD_AUDIO_BITRATE_OPTIONS_KBPS];

    if (typeof effectivePreferredAudioBitrateKbps === 'number') {
      options.push(effectivePreferredAudioBitrateKbps);
    }

    if (isHlsSource && sourceAudioBitrateKbps !== null) {
      options.push(clamp(Math.round(sourceAudioBitrateKbps), 48, 384));
    }

    return toUniqueSortedNumbers(
      options.filter((value) => Number.isFinite(value) && value >= 48 && value <= 384),
    );
  }, [effectivePreferredAudioBitrateKbps, isHlsSource, sourceAudioBitrateKbps]);

  const handlePreferredVideoBitrateChange = useCallback((nextVideoBitrateKbps: number | null) => {
    const normalizedVideoBitrateKbps =
      typeof nextVideoBitrateKbps === 'number' && Number.isFinite(nextVideoBitrateKbps)
        ? clamp(Math.round(nextVideoBitrateKbps), 250, effectiveVideoBitrateQuotaKbps)
        : null;

    setPreferredVideoBitrateKbps(normalizedVideoBitrateKbps);

    if (!isHlsSource) {
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

    setPreferredAudioBitrateKbps(normalizedAudioBitrateKbps);

    if (!isHlsSource) {
      return;
    }

    void switchToHls({
      forceFresh: true,
      audioStreamIndex: selectedAudioStreamIndex,
      maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      audioBitrateKbps: normalizedAudioBitrateKbps,
      maxOutputHeight: effectivePreferredMaxResolutionHeight,
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
    const sourceCeiling =
      isHlsSource && sourceMaxOutputHeight !== null
        ? clamp(Math.round(sourceMaxOutputHeight), 240, 2160)
        : 2160;
    const bitrateBudgetKbps = effectivePreferredVideoBitrateKbps ?? accountVideoQuotaKbps;
    const bitrateCeiling = resolveMaxResolutionForBitrateBudget(bitrateBudgetKbps);
    const effectiveCeiling = Math.min(sourceCeiling, bitrateCeiling);

    const normalizedMaxResolutionHeight =
      typeof nextMaxResolutionHeight === 'number' && Number.isFinite(nextMaxResolutionHeight)
        ? Math.min(clamp(Math.round(nextMaxResolutionHeight), 240, 2160), effectiveCeiling)
        : null;

    setPreferredMaxResolutionHeight(normalizedMaxResolutionHeight);

    if (!isHlsSource) {
      return;
    }

    void switchToHls({
      forceFresh: true,
      audioStreamIndex: selectedAudioStreamIndex,
      maxVideoBitrateKbps: effectivePreferredVideoBitrateKbps,
      audioBitrateKbps: effectivePreferredAudioBitrateKbps,
      maxOutputHeight: normalizedMaxResolutionHeight,
    });
  }, [
    accountVideoQuotaKbps,
    effectivePreferredAudioBitrateKbps,
    effectivePreferredVideoBitrateKbps,
    selectedAudioStreamIndex,
    isHlsSource,
    setPreferredMaxResolutionHeight,
    sourceMaxOutputHeight,
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
