export function extractCookieHeader(response: Response): string {
  const setCookies = collectSetCookies(response);
  const cookiePairs = new Set<string>();

  for (const setCookie of setCookies) {
    const cookiePair = extractCookiePair(setCookie);
    if (cookiePair) {
      cookiePairs.add(cookiePair);
    }
  }

  return [...cookiePairs].join('; ');
}

function collectSetCookies(response: Response): string[] {
  const headersWithSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies =
    typeof headersWithSetCookie.getSetCookie === 'function'
      ? headersWithSetCookie.getSetCookie()
      : [];

  const combinedHeader = response.headers.get('set-cookie');
  if (combinedHeader) {
    cookies.push(...splitCombinedSetCookie(combinedHeader));
  }

  return cookies;
}

function splitCombinedSetCookie(combinedHeader: string): string[] {
  return combinedHeader
    .split(/,(?=[^;,\s]+=)/g)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function extractCookiePair(value: string): string | null {
  const firstPart = value.split(';', 1)[0]?.trim();
  if (!firstPart || !firstPart.includes('=')) {
    return null;
  }

  return firstPart;
}
