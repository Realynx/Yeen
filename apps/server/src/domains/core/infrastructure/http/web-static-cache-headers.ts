interface StaticAssetResponse {
  setHeader(name: string, value: string): unknown;
}

const VERSIONED_ASSET_PATTERN =
  /[/\\]assets[/\\][^/\\]+-[a-z0-9_-]{8,}\.(?:css|js|mjs|woff2?|png|jpe?g|svg|webp|avif)$/i;

export function setWebStaticCacheHeaders(
  response: StaticAssetResponse,
  filePath: string,
): void {
  const normalizedPath = filePath.replaceAll('\\', '/').toLowerCase();

  if (normalizedPath.endsWith('/sw.js')) {
    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.setHeader('Service-Worker-Allowed', '/');
    return;
  }

  if (
    normalizedPath.endsWith('/index.html') ||
    normalizedPath.endsWith('/manifest.webmanifest')
  ) {
    response.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return;
  }

  if (VERSIONED_ASSET_PATTERN.test(filePath)) {
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}
