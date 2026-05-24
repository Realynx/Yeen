export function redactAccessToken(url: string | null | undefined): string | null {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    parsed.searchParams.delete('access_token');
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch {
    return trimmed
      .replace(/([?&])access_token=[^&]+/gi, '$1')
      .replace(/[?&]$/, '');
  }
}
