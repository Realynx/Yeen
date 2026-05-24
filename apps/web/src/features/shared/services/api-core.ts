const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000/api';
const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;
const API_BASE_TRIMMED = API_BASE.replace(/\/+$/, '');

export const TOKEN_STORAGE_KEY = 'yeen_access_token';

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

    try {
      const payload = (await response.json()) as { message?: string | string[] };
      const message = Array.isArray(payload.message)
        ? payload.message.join(', ')
        : payload.message ?? fallback;
      throw new ApiError(message, response.status);
    } catch {
      throw new ApiError(fallback, response.status);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function toApiErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
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

  const normalizedPath = normalizeApiPath(path);
  return `${API_BASE_TRIMMED}${normalizedPath}`;
}

function normalizeApiPath(path: string) {
  const candidate = path.trim();
  const pathWithLeadingSlash = candidate.startsWith('/') ? candidate : `/${candidate}`;

  if (/\/api$/i.test(API_BASE_TRIMMED) && /^\/api(?:\/|$)/i.test(pathWithLeadingSlash)) {
    const pathWithoutDuplicateApiPrefix = pathWithLeadingSlash.slice('/api'.length);
    return pathWithoutDuplicateApiPrefix || '/';
  }

  return pathWithLeadingSlash;
}
