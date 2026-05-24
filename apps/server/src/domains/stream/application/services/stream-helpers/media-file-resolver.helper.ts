import { Logger } from '@nestjs/common';
import { access } from 'node:fs/promises';

/**
 * Custom error thrown when the underlying media storage does not respond to
 * a file existence check within the timeout budget. Surfaced so callers can
 * fail the request fast with HTTP 503 + Retry-After instead of blocking
 * on an unresponsive I/O.
 */
export class SourceUnreachableError extends Error {
  constructor(public readonly filePath: string) {
    super(`Source media path is unreachable: ${filePath}`);
    this.name = 'SourceUnreachableError';
  }
}

/**
 * Probes whether a file exists with a timeout constraint. Uses async `access`
 * (libuv threadpool) so an unresponsive SMB share cannot block the Node event
 * loop. Returns:
 * - 'exists': file is accessible
 * - 'missing': file does not exist
 * - 'timeout': access did not respond within timeoutMs
 */
export async function pathExistsWithTimeoutValue(
  filePath: string,
  timeoutMs: number,
  logger: Logger,
): Promise<'exists' | 'missing' | 'timeout'> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const probe = access(filePath).then(
      () => 'exists' as const,
      () => 'missing' as const,
    );
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => {
        logger.warn(
          `pathExistsWithTimeout: ${filePath} did not respond within ${timeoutMs}ms; treating as unreachable.`,
        );
        resolve('timeout');
      }, timeoutMs);
    });
    return await Promise.race([probe, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Resolves the actual on-disk path for a media file. qBittorrent renames
 * downloading files to <name>.!qB, so we fall back to that variant when the
 * canonical path doesn't exist yet. Uses pathExistsWithTimeoutValue to ensure
 * an unresponsive media volume cannot block the event loop.
 *
 * Throws SourceUnreachableError if both canonical and in-progress variants
 * timeout or don't exist.
 */
export async function resolveActualFilePathValue(
  canonicalPath: string,
  timeoutMs: number,
  logger: Logger,
): Promise<string> {
  // Probe the canonical path first. The `.!qB` in-progress variant is only
  // produced by qBittorrent when its "Append .!qB extension to incomplete
  // files" option is enabled, so most setups only ever need the canonical
  // lookup. Falling back to the `.!qB` probe only when canonical is genuinely
  // missing avoids a wasted SMB roundtrip per segment request and halves the
  // wait when the share is unreachable.
  const canonicalProbe = await pathExistsWithTimeoutValue(
    canonicalPath,
    timeoutMs,
    logger,
  );
  if (canonicalProbe === 'exists') {
    return canonicalPath;
  }
  if (canonicalProbe === 'timeout') {
    throw new SourceUnreachableError(canonicalPath);
  }

  const inProgressPath = canonicalPath + '.!qB';
  const inProgressProbe = await pathExistsWithTimeoutValue(
    inProgressPath,
    timeoutMs,
    logger,
  );
  if (inProgressProbe === 'exists') {
    logger.debug(
      `Using in-progress source path for stream read: ${inProgressPath} (canonical missing)`,
    );
    return inProgressPath;
  }
  if (inProgressProbe === 'timeout') {
    throw new SourceUnreachableError(canonicalPath);
  }

  return canonicalPath;
}
