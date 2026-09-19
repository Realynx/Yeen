export function normalizePersistedMediaAssetPath(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const releaseDataMatch = trimmed.match(
    /[\\/]releases[\\/][^\\/]+[\\/]data[\\/](.+)$/i,
  );
  if (!releaseDataMatch) {
    return trimmed;
  }

  const relativeAssetPath = releaseDataMatch[1]
    .split(/[\\/]+/)
    .filter(Boolean)
    .join('/');
  return relativeAssetPath ? `data/${relativeAssetPath}` : 'data';
}
