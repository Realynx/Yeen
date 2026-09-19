import { createHash } from 'node:crypto';
import { verifyReleaseArtifactMetadata } from './release-artifact-verifier';

describe('release artifact verification', () => {
  const archive = Buffer.from('verified archive');
  const sha256 = createHash('sha256').update(archive).digest('hex');
  const archiveName = 'yeen-v1.2.3.zip';
  const metadata = JSON.stringify({
    schemaVersion: 1,
    product: 'yeen',
    version: '1.2.3',
    tag: 'v1.2.3',
    commit: 'abcdef1234567',
    archive: { file: archiveName, bytes: archive.length, sha256 },
    dataPolicy: 'runtime-data-and-environment-are-never-packaged',
  });

  it('accepts matching checksum and immutable release metadata', () => {
    expect(
      verifyReleaseArtifactMetadata({
        version: '1.2.3',
        archiveName,
        archiveBytes: archive.length,
        actualSha256: sha256,
        checksumText: `${sha256}  ${archiveName}\n`,
        metadataText: metadata,
      }),
    ).toMatchObject({ version: '1.2.3', sha256 });
  });

  it('rejects a checksum mismatch before deployment', () => {
    expect(() =>
      verifyReleaseArtifactMetadata({
        version: '1.2.3',
        archiveName,
        archiveBytes: archive.length,
        actualSha256: '0'.repeat(64),
        checksumText: `${sha256}  ${archiveName}\n`,
        metadataText: metadata,
      }),
    ).toThrow('checksum');
  });
});
