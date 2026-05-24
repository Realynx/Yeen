export function normalizeForExactMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeTags(tags: readonly string[]): string[] {
  const deduped = new Map<string, string>();

  for (const tag of tags) {
    const cleaned = tag.trim();
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, cleaned);
    }
  }

  return [...deduped.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  );
}

export function extractPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.trunc(value);
    return rounded > 0 ? rounded : null;
  }

  if (typeof value === 'string') {
    const cleaned = value.trim();
    if (/^\d+$/.test(cleaned)) {
      const parsed = Number.parseInt(cleaned, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
  }

  return null;
}

export function extractNumericStringId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const numeric = Math.trunc(value);
    return numeric > 0 ? String(numeric) : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim();
  return /^\d+$/.test(cleaned) ? cleaned : null;
}
