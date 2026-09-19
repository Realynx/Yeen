import type { RuntimeWebAddon } from '../../shared/services/types';
import { getConfiguredApiBaseUrl } from '../../shared/services/api-core';
import type { YeenWebAddonContext } from './addonRuntime.types';

interface YeenWebAddonModule {
  default?: (context: YeenWebAddonContext) => void | Promise<void>;
  register?: (context: YeenWebAddonContext) => void | Promise<void>;
}

export function authenticatedAddonEntryUrl(
  webEntryUrl: string,
  accessToken: string,
  pageUrl = window.location.href,
  apiBaseUrl = pageUrl,
): string {
  const page = new URL(pageUrl);
  const apiBase = new URL(apiBaseUrl, page.origin);
  const entry = resolveAddonEntryUrl(webEntryUrl, apiBase);

  if (entry.protocol !== 'http:' && entry.protocol !== 'https:') {
    throw new Error('Add-on web entrypoints must use HTTP or HTTPS.');
  }
  if (entry.origin !== page.origin && entry.origin !== apiBase.origin) {
    throw new Error('Add-on web entrypoints must use a Yeen origin (web or API).');
  }

  entry.searchParams.set('access_token', accessToken);
  return entry.toString();
}

export async function loadAddonWebModule(
  addon: RuntimeWebAddon,
  accessToken: string,
  context: YeenWebAddonContext,
): Promise<void> {
  const entryUrl = authenticatedAddonEntryUrl(
    addon.webEntryUrl,
    accessToken,
    window.location.href,
    getConfiguredApiBaseUrl(),
  );
  const module = await import(/* @vite-ignore */ entryUrl) as YeenWebAddonModule;
  const register = typeof module.default === 'function'
    ? module.default
    : module.register;

  if (typeof register !== 'function') {
    throw new Error(
      `Add-on ${addon.id} does not export a registration function.`,
    );
  }

  await register(context);
}

function resolveAddonEntryUrl(webEntryUrl: string, apiBase: URL): URL {
  if (/^https?:\/\//i.test(webEntryUrl)) {
    return new URL(webEntryUrl);
  }

  const basePath = apiBase.pathname.replace(/\/+$/, '');
  const entryPath = webEntryUrl.startsWith('/')
    ? webEntryUrl
    : `/${webEntryUrl}`;
  const apiPrefixedEntry = /^\/api(?:\/|$)/i.test(entryPath);
  const baseAlreadyEndsWithApi = /\/api$/i.test(basePath);
  const resolvedPath = baseAlreadyEndsWithApi && !apiPrefixedEntry
    ? `${basePath}${entryPath}`
    : entryPath;

  return new URL(resolvedPath, apiBase.origin);
}
