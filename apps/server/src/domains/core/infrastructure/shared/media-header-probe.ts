import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';

export type MediaHeaderReadFlag = 'r' | 'rs';

export async function readMediaFileHeader(
  filePath: string,
  byteCount: number,
): Promise<Buffer | null> {
  const cached = await readMediaFileHeaderCached(filePath, byteCount, 'r');
  if (cached === null || cached.length === 0) {
    return cached;
  }

  const cachedAllZero = cached.every((byte) => byte === 0);
  if (!cachedAllZero) {
    return cached;
  }

  const uncached = await readMediaFileHeaderCached(filePath, byteCount, 'rs');
  if (
    uncached !== null &&
    uncached.length > 0 &&
    !uncached.every((byte) => byte === 0)
  ) {
    return uncached;
  }

  if (process.platform === 'win32') {
    const unbuffered = await readMediaFileHeaderUnbuffered(filePath, byteCount);
    if (unbuffered !== null) {
      return unbuffered;
    }
  }

  return uncached ?? cached;
}

export async function readMediaFileHeaderCached(
  filePath: string,
  byteCount: number,
  flag: MediaHeaderReadFlag,
): Promise<Buffer | null> {
  const handle = await open(filePath, flag).catch(() => null);
  if (!handle) {
    return null;
  }

  try {
    const buffer = Buffer.alloc(byteCount);
    const { bytesRead } = await handle.read(buffer, 0, byteCount, 0);
    return bytesRead > 0 ? buffer.subarray(0, bytesRead) : null;
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

export async function readMediaFileHeaderUnbuffered(
  filePath: string,
  byteCount: number,
): Promise<Buffer | null> {
  const alignedBytes = Math.max(512, Math.ceil(byteCount / 512) * 512);
  const escapedPath = filePath.replace(/'/g, "''");
  const script =
    "$ErrorActionPreference='Stop';" +
    `$p='${escapedPath}';` +
    `$s=${alignedBytes};` +
    'try{' +
    '$fs=New-Object System.IO.FileStream(' +
    '$p,' +
    '[System.IO.FileMode]::Open,' +
    '[System.IO.FileAccess]::Read,' +
    '[System.IO.FileShare]::ReadWrite,' +
    '4096,' +
    '([System.IO.FileOptions][int]0x20000000));' +
    '$b=New-Object byte[] $s;' +
    '$n=$fs.Read($b,0,$s);' +
    '$fs.Close();' +
    'if($n -le 0){exit 2}' +
    '[Console]::OpenStandardOutput().Write($b,0,$n);' +
    'exit 0' +
    '}catch{[Console]::Error.WriteLine($_.Exception.Message);exit 3}';

  return await new Promise<Buffer | null>((resolvePromise) => {
    let settled = false;
    const settle = (value: Buffer | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolvePromise(value);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          script,
        ],
        { windowsHide: true },
      );
    } catch {
      settle(null);
      return;
    }

    const chunks: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', () => settle(null));
    child.on('close', (code) => {
      if (code !== 0) {
        settle(null);
        return;
      }

      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) {
        settle(null);
        return;
      }

      settle(
        buffer.length >= byteCount ? buffer.subarray(0, byteCount) : buffer,
      );
    });

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      settle(null);
    }, 5000);
    child.on('close', () => clearTimeout(timer));
  });
}

export function scoreMediaHeader(
  header: Buffer | null,
  fileSize?: number,
): number {
  if (!header || header.length < 4) {
    return 0;
  }

  if (hasKnownMediaSignature(header)) return 100;

  const isAllZero = header.every((byte) => byte === 0);
  if (isAllZero) {
    return -1;
  }

  if (isPositiveFiniteNumber(fileSize)) {
    return 1 + Math.min(10, Math.floor(fileSize / (1024 * 1024 * 1024)));
  }

  return 1;
}

function hasKnownMediaSignature(header: Buffer): boolean {
  return (
    matchesBytes(header, 0, [0x1a, 0x45, 0xdf, 0xa3]) ||
    matchesBytes(header, 4, [0x66, 0x74, 0x79, 0x70]) ||
    matchesBytes(header, 0, [0x52, 0x49, 0x46, 0x46])
  );
}

function matchesBytes(
  header: Buffer,
  offset: number,
  expected: readonly number[],
): boolean {
  return expected.every((byte, index) => header[offset + index] === byte);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
