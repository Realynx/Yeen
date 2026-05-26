const DEFAULT_API_BASE = 'http://localhost:4000/api';
const ENV_API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?? DEFAULT_API_BASE;
const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

export const TOKEN_STORAGE_KEY = 'yeen_access_token';
export const RUNTIME_API_BASE_STORAGE_KEY = 'yeen_runtime_api_base_url';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function jsonBody(payload: unknown): string {
  return JSON.stringify(payload);
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  const isMultipartBody =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (!headers.has('Content-Type') && options.body && !isMultipartBody) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(resolveApiUrl(path), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`;
    const payload = await response.json().catch(() => null) as {
      message?: string | string[];
      error?: string;
    } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(', ')
      : payload?.message ?? payload?.error ?? fallback;
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function toApiErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function getConfiguredApiBaseUrl() {
  return resolveApiBase();
}

export function getRuntimeApiBaseUrl() {
  return readRuntimeApiBase();
}

export function setRuntimeApiBaseUrl(nextApiBase: string | null | undefined) {
  const normalized = normalizeApiBaseValue(nextApiBase);

  if (typeof window === 'undefined') {
    return normalized;
  }

  try {
    if (normalized) {
      window.localStorage.setItem(RUNTIME_API_BASE_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(RUNTIME_API_BASE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures and fall back to environment defaults.
  }

  return normalized;
}

export function absoluteApiUrl(path: string) {
  return resolveApiUrl(path);
}

export function withAccessToken(path: string, token: string) {
  const candidateUrl = resolveApiUrl(path);

  if (!token) {
    return candidateUrl;
  }

  try {
    const url = new URL(candidateUrl);
    url.searchParams.set('access_token', token);
    return url.toString();
  } catch {
    return candidateUrl;
  }
}

export function mediaPreviewImageUrl(
  mediaId: string,
  version?: string | number | null,
) {
  return withVersionQuery(
    absoluteApiUrl(`/media-images/${encodeURIComponent(mediaId)}/preview`),
    version,
  );
}

export function mediaBackdropImageUrl(
  mediaId: string,
  version?: string | number | null,
) {
  return withVersionQuery(
    absoluteApiUrl(`/media-images/${encodeURIComponent(mediaId)}/backdrop`),
    version,
  );
}

export function mediaChapterThumbnailUrl(mediaId: string, index: number) {
  return absoluteApiUrl(
    `/media-images/${encodeURIComponent(mediaId)}/chapter/${index}`,
  );
}

function withVersionQuery(
  url: string,
  version: string | number | null | undefined,
) {
  if (version === null || version === undefined || version === '') {
    return url;
  }

  const stringVersion = String(version);
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('v', stringVersion);
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(stringVersion)}`;
  }
}

function resolveApiUrl(path: string) {
  if (ABSOLUTE_URL_PATTERN.test(path)) {
    return path;
  }

  const apiBase = resolveApiBase();
  const normalizedPath = normalizeApiPath(path, apiBase);
  return `${apiBase}${normalizedPath}`;
}

function resolveApiBase() {
  const runtimeApiBase = readRuntimeApiBase();
  if (runtimeApiBase) {
    return runtimeApiBase;
  }

  return normalizeApiBaseValue(ENV_API_BASE) ?? DEFAULT_API_BASE;
}

function readRuntimeApiBase() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return normalizeApiBaseValue(
      window.localStorage.getItem(RUNTIME_API_BASE_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

function normalizeApiBaseValue(value: string | null | undefined) {
  const candidate = value?.trim() ?? '';
  if (!candidate) {
    return null;
  }

  if (candidate.startsWith('/')) {
    return normalizeRelativeApiBase(candidate);
  }

  const absoluteCandidate = ABSOLUTE_URL_PATTERN.test(candidate)
    ? candidate
    : `http://${candidate}`;

  try {
    const parsed = new URL(absoluteCandidate);
    const normalizedPath = trimTrailingSlashes(parsed.pathname);
    parsed.pathname = normalizedPath === '' || normalizedPath === '/'
      ? '/api'
      : normalizedPath;
    parsed.search = '';
    parsed.hash = '';
    return trimTrailingSlashes(parsed.toString());
  } catch {
    return null;
  }
}

function normalizeRelativeApiBase(value: string) {
  const normalized = trimTrailingSlashes(value);
  if (normalized === '' || normalized === '/') {
    return '/api';
  }

  return normalized;
}

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, '');
}

function normalizeApiPath(path: string, apiBase: string) {
  const candidate = path.trim();
  const pathWithLeadingSlash = candidate.startsWith('/') ? candidate : `/${candidate}`;

  if (/\/api$/i.test(apiBase) && /^\/api(?:\/|$)/i.test(pathWithLeadingSlash)) {
    const pathWithoutDuplicateApiPrefix = pathWithLeadingSlash.slice('/api'.length);
    return pathWithoutDuplicateApiPrefix || '/';
  }

  return pathWithLeadingSlash;
}
