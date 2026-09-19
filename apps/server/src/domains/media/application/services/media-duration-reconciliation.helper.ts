export interface DurationReconciliationResult {
  durationSeconds: number;
  correctedStoredDurationSeconds: number | null;
}

const DURATION_CORRECTION_EPSILON_SECONDS = 1;

export function reconcileDurationSecondsValue(
  storedDurationSeconds: number,
  probedDurationSeconds: number,
  mayBePartial: boolean,
): DurationReconciliationResult {
  const storedDuration = positiveDurationOrZero(storedDurationSeconds);
  const probedDuration = positiveDurationOrZero(probedDurationSeconds);

  if (probedDuration === 0) {
    return {
      durationSeconds: storedDuration,
      correctedStoredDurationSeconds: null,
    };
  }

  const difference = probedDuration - storedDuration;
  const correctionAllowed =
    Math.abs(difference) > DURATION_CORRECTION_EPSILON_SECONDS &&
    (!mayBePartial || difference > 0);

  if (correctionAllowed) {
    const correctedDuration = Math.round(probedDuration);
    return {
      durationSeconds: correctedDuration,
      correctedStoredDurationSeconds: correctedDuration,
    };
  }

  return {
    durationSeconds: mayBePartial
      ? Math.max(storedDuration, probedDuration)
      : probedDuration,
    correctedStoredDurationSeconds: null,
  };
}

function positiveDurationOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
