export function normalizeInvitesInput(rawValue: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function normalizeBitrateInput(rawValue: string): number | null {
  const parsed = Number.parseInt(rawValue.trim(), 10);
  return Number.isFinite(parsed) ? Math.max(250, Math.min(50000, parsed)) : null;
}

export function toProgressLabel(progressPercent: number): string {
  const normalized = Number.isFinite(progressPercent)
    ? Math.max(0, Math.min(100, Math.round(progressPercent)))
    : 0;
  return `${normalized}%`;
}

export function toLastSeenLabel(value: string | null): string {
  if (!value) {
    return 'No activity recorded yet';
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return 'No activity recorded yet';
  }

  return new Date(parsed).toLocaleString();
}
