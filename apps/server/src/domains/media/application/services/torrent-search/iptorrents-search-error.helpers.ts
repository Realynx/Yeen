export function looksLikeIptLoginPage(html: string): boolean {
  return (
    /<form[^>]+action=["']?do-login\.php["']?/i.test(html) ||
    /<title>\s*iPT\s*[\u2013-]\s*Sign\s*In\s*<\/title>/i.test(html)
  );
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return (
      error.name === 'AbortError' ||
      error.message.toLowerCase().includes('aborted')
    );
  }

  return error instanceof Error && error.name === 'AbortError';
}
