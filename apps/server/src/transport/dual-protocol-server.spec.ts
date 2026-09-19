import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { get as httpGet, type RequestListener } from 'node:http';
import { get as httpsGet } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { TLSSocket } from 'node:tls';
import {
  createDualProtocolServer,
  loadDualProtocolTlsOptions,
} from './dual-protocol-server';

const execFileAsync = promisify(execFile);

function getBody(
  request: typeof httpGet,
  url: string,
  options: { rejectUnauthorized?: boolean } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    request(url, options, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

describe('dual protocol server', () => {
  it('leaves TLS disabled when neither certificate path is configured', async () => {
    await expect(loadDualProtocolTlsOptions({})).resolves.toBeUndefined();
  });

  it('rejects partial TLS configuration', async () => {
    await expect(
      loadDualProtocolTlsOptions({ certificatePath: '/tmp/yeen.crt' }),
    ).rejects.toThrow(/both be set/);
  });

  it('loads the certificate and private key without converting their bytes', async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), 'yeen-tls-'));
    const certificatePath = join(fixtureDirectory, 'yeen.crt');
    const keyPath = join(fixtureDirectory, 'yeen.key');

    try {
      await Promise.all([
        writeFile(certificatePath, 'certificate-bytes'),
        writeFile(keyPath, 'key-bytes'),
      ]);

      const options = await loadDualProtocolTlsOptions({
        certificatePath,
        keyPath,
      });

      expect(options?.cert).toEqual(Buffer.from('certificate-bytes'));
      expect(options?.key).toEqual(Buffer.from('key-bytes'));
      expect(options?.minVersion).toBe('TLSv1.2');
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true });
    }
  });

  it('serves HTTP and HTTPS from the same listening port', async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), 'yeen-dual-port-'));
    const certificatePath = join(fixtureDirectory, 'yeen.crt');
    const keyPath = join(fixtureDirectory, 'yeen.key');

    try {
      await execFileAsync('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-sha256',
        '-nodes',
        '-days',
        '1',
        '-keyout',
        keyPath,
        '-out',
        certificatePath,
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
        ...(process.platform === 'win32' ? ['-config', 'NUL'] : []),
      ]);
      const tlsOptions = await loadDualProtocolTlsOptions({
        certificatePath,
        keyPath,
      });
      if (!tlsOptions) throw new Error('TLS options were not loaded.');

      const requestListener: RequestListener = (request, response) =>
        response.end(
          (request.socket as TLSSocket).encrypted ? 'https' : 'http',
        );
      const server = createDualProtocolServer(requestListener, tlsOptions);
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });

      try {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Test server did not bind to a TCP port.');
        }
        const [httpBody, httpsBody] = await Promise.all([
          getBody(httpGet, `http://127.0.0.1:${address.port}/`),
          getBody(httpsGet, `https://127.0.0.1:${address.port}/`, {
            rejectUnauthorized: false,
          }),
        ]);

        expect(httpBody).toBe('http');
        expect(httpsBody).toBe('https');
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true });
    }
  });
});
