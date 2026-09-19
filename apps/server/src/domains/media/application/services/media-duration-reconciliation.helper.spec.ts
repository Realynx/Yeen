import { reconcileDurationSecondsValue } from './media-duration-reconciliation.helper';

describe('reconcileDurationSecondsValue', () => {
  it('replaces an overstated stored runtime for a complete source', () => {
    expect(reconcileDurationSecondsValue(2267, 1451.179, false)).toEqual({
      durationSeconds: 1451,
      correctedStoredDurationSeconds: 1451,
    });
  });

  it('retains an overstated stored runtime while a source may be partial', () => {
    expect(reconcileDurationSecondsValue(2267, 1451.179, true)).toEqual({
      durationSeconds: 2267,
      correctedStoredDurationSeconds: null,
    });
  });

  it('still grows an understated stored runtime for a partial source', () => {
    expect(reconcileDurationSecondsValue(1200, 1451.179, true)).toEqual({
      durationSeconds: 1451,
      correctedStoredDurationSeconds: 1451,
    });
  });
});
