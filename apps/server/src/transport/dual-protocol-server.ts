import { createServer as createHttpPolyglotServer } from '@httptoolkit/httpolyglot';
import { readFile } from 'node:fs/promises';
import type { RequestListener } from 'node:http';
import type { ServerOptions } from 'node:https';
import type { Server as NetServer } from 'node:net';

export interface DualProtocolTlsPaths {
  certificatePath?: string;
  keyPath?: string;
}

export async function loadDualProtocolTlsOptions(
  paths: DualProtocolTlsPaths,
): Promise<ServerOptions | undefined> {
  const certificatePath = paths.certificatePath?.trim();
  const keyPath = paths.keyPath?.trim();

  if (!certificatePath && !keyPath) return undefined;
  if (!certificatePath || !keyPath) {
    throw new Error(
      'YEEN_TLS_CERT_PATH and YEEN_TLS_KEY_PATH must either both be set or both be omitted.',
    );
  }

  const [cert, key] = await Promise.all([
    readFile(certificatePath),
    readFile(keyPath),
  ]);
  return { cert, key, minVersion: 'TLSv1.2' };
}

export function createDualProtocolServer(
  requestListener: RequestListener,
  tlsOptions: ServerOptions,
): NetServer {
  return createHttpPolyglotServer({ tls: tlsOptions }, requestListener);
}
