export function parseTagsQuery(raw: string | string[] | undefined): string[] {
  if (typeof raw === 'undefined') {
    return [];
  }

  const values = Array.isArray(raw) ? raw : [raw];
  const deduped = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    for (const splitValue of value.split(',')) {
      const cleaned = splitValue.trim();
      if (cleaned) {
        deduped.add(cleaned);
      }
    }
  }

  return [...deduped];
}

export function parseRemoteProvidersQuery(
  raw: string | string[] | undefined,
): Array<'tmdb' | 'jikan'> | undefined {
  if (typeof raw === 'undefined') {
    return undefined;
  }

  const values = Array.isArray(raw) ? raw : [raw];
  const deduped = new Set<'tmdb' | 'jikan'>();

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    for (const splitValue of value.split(',')) {
      const cleaned = splitValue.trim().toLowerCase();

      if (cleaned === 'tmdb' || cleaned === 'jikan') {
        deduped.add(cleaned);
      }
    }
  }

  return deduped.size > 0 ? [...deduped] : undefined;
}

export function parseBooleanQuery(raw: string | string[] | undefined): boolean {
  if (typeof raw === 'undefined') {
    return false;
  }

  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string') {
    return false;
  }

  const cleaned = first.trim().toLowerCase();
  return (
    cleaned === '1' ||
    cleaned === 'true' ||
    cleaned === 'yes' ||
    cleaned === 'on'
  );
}

export function parseStringArrayBody(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const deduped = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string') {
      continue;
    }

    const cleaned = value.trim();
    if (cleaned) {
      deduped.add(cleaned);
    }
  }

  return [...deduped];
}

export function normalizeUploadedJsonFile(
  value: unknown,
): { buffer: Buffer; mimetype: string } | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const candidateBuffer = value['buffer'];
  if (!Buffer.isBuffer(candidateBuffer)) {
    return undefined;
  }

  const candidateType =
    typeof value['mimetype'] === 'string' ? value['mimetype'].trim() : '';

  return {
    buffer: candidateBuffer,
    mimetype: candidateType,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
