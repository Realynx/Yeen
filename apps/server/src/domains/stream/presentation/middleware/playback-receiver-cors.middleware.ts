import type { NextFunction, Request, Response } from 'express';

const EXPOSED_PLAYBACK_HEADERS = 'Accept-Ranges, Content-Length, Content-Range';
const DEFAULT_ALLOWED_REQUEST_HEADERS = 'Authorization, Content-Type, Range';

/**
 * Cast receivers fetch media outside the web app's configured UI origin.
 * Playback URLs remain protected by their bearer token; this middleware only
 * lets the receiver read an already-authorized response.
 */
export function playbackReceiverCorsMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestOrigin = request.headers.origin?.trim();
  response.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');
  response.setHeader('Access-Control-Expose-Headers', EXPOSED_PLAYBACK_HEADERS);

  if (requestOrigin) {
    response.setHeader('Vary', 'Origin');
  }

  if (request.method.toUpperCase() !== 'OPTIONS') {
    next();
    return;
  }

  const requestedHeaders =
    request.headers['access-control-request-headers']?.trim();
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    requestedHeaders || DEFAULT_ALLOWED_REQUEST_HEADERS,
  );
  response.setHeader('Access-Control-Max-Age', '600');
  response.status(204).end();
}
