import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, verify } from 'node:crypto';
import type { AddonPackageSignature } from '../../domain/addon-package.types';

@Injectable()
export class AddonSignatureVerifier {
  private readonly trustedKeys: Map<string, string>;

  constructor(configService: ConfigService) {
    this.trustedKeys = parseTrustedKeys(
      configService.get<string>('YEEN_ADDON_TRUSTED_KEYS'),
    );
  }

  verify(
    integrityBytes: Buffer,
    signatureBytes: Buffer | undefined,
  ): {
    trust: 'signed' | 'unsigned';
    signingKeyId: string | null;
  } {
    return verifyAddonSignature(
      integrityBytes,
      signatureBytes,
      this.trustedKeys,
    );
  }
}

export function verifyAddonSignature(
  integrityBytes: Buffer,
  signatureBytes: Buffer | undefined,
  trustedKeys: ReadonlyMap<string, string>,
): {
  trust: 'signed' | 'unsigned';
  signingKeyId: string | null;
} {
  if (!signatureBytes) return { trust: 'unsigned', signingKeyId: null };

  const signature = parseSignature(signatureBytes);
  const encodedKey = trustedKeys.get(signature.keyId);
  if (!encodedKey) {
    throw new BadRequestException(
      `The add-on package uses an untrusted signing key (${signature.keyId}).`,
    );
  }

  let valid = false;
  try {
    const key = encodedKey.includes('BEGIN PUBLIC KEY')
      ? createPublicKey(encodedKey)
      : createPublicKey({
          key: Buffer.from(encodedKey, 'base64'),
          format: 'der',
          type: 'spki',
        });
    valid = verify(
      null,
      integrityBytes,
      key,
      Buffer.from(signature.signature, 'base64'),
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new BadRequestException('The add-on package signature is invalid.');
  }
  return { trust: 'signed', signingKeyId: signature.keyId };
}

export function parseTrustedKeys(raw: string | undefined): Map<string, string> {
  if (!raw?.trim()) return new Map();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) throw new Error('not an object');
    return new Map(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          /^[A-Za-z0-9._:-]{1,128}$/.test(entry[0]) &&
          typeof entry[1] === 'string' &&
          entry[1].trim().length > 0,
      ),
    );
  } catch {
    throw new Error(
      'YEEN_ADDON_TRUSTED_KEYS must be a JSON object of key ids to Ed25519 public keys.',
    );
  }
}

function parseSignature(bytes: Buffer): AddonPackageSignature {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new BadRequestException('The add-on signature file is malformed.');
  }
  if (
    !isObject(parsed) ||
    parsed.schemaVersion !== 1 ||
    parsed.algorithm !== 'Ed25519' ||
    typeof parsed.keyId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(parsed.keyId) ||
    parsed.signed !== 'integrity.json' ||
    typeof parsed.signature !== 'string' ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(parsed.signature)
  ) {
    throw new BadRequestException('The add-on signature file is malformed.');
  }
  return parsed as unknown as AddonPackageSignature;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
