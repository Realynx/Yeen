interface VerifyReleaseArtifactInput {
  version: string;
  archiveName: string;
  archiveBytes: number;
  actualSha256: string;
  checksumText: string;
  metadataText: string;
}

export interface VerifiedReleaseArtifact {
  version: string;
  tag: string;
  commit: string;
  archiveName: string;
  archiveBytes: number;
  sha256: string;
}

interface ReleaseMetadata {
  schemaVersion?: unknown;
  product?: unknown;
  version?: unknown;
  tag?: unknown;
  commit?: unknown;
  dataPolicy?: unknown;
  archive?: {
    file?: unknown;
    bytes?: unknown;
    sha256?: unknown;
  };
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{7,64}$/;

export function verifyReleaseArtifactMetadata({
  version,
  archiveName,
  archiveBytes,
  actualSha256,
  checksumText,
  metadataText,
}: VerifyReleaseArtifactInput): VerifiedReleaseArtifact {
  const normalizedActualSha = actualSha256.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalizedActualSha)) {
    throw new Error('Release archive checksum is invalid.');
  }

  const checksumMatch = /^([a-fA-F0-9]{64})\s+\*?([^\r\n]+)\s*$/.exec(
    checksumText,
  );
  if (!checksumMatch || checksumMatch[2] !== archiveName) {
    throw new Error(
      'Release checksum file does not name the expected archive.',
    );
  }
  if (checksumMatch[1].toLowerCase() !== normalizedActualSha) {
    throw new Error(
      'Release archive checksum does not match the published checksum.',
    );
  }

  let metadata: ReleaseMetadata;
  try {
    metadata = JSON.parse(metadataText) as ReleaseMetadata;
  } catch {
    throw new Error('Release metadata is not valid JSON.');
  }

  const expectedTag = `v${version}`;
  const commit =
    typeof metadata.commit === 'string' ? metadata.commit.toLowerCase() : '';
  if (
    !matchesReleaseMetadata(metadata, {
      version,
      expectedTag,
      commit,
      archiveName,
      archiveBytes,
      normalizedActualSha,
    })
  ) {
    throw new Error('Release metadata does not match the downloaded archive.');
  }

  return {
    version,
    tag: expectedTag,
    commit,
    archiveName,
    archiveBytes,
    sha256: normalizedActualSha,
  };
}

function matchesReleaseMetadata(
  metadata: ReleaseMetadata,
  expected: {
    version: string;
    expectedTag: string;
    commit: string;
    archiveName: string;
    archiveBytes: number;
    normalizedActualSha: string;
  },
): boolean {
  return (
    metadata.schemaVersion === 1 &&
    metadata.product === 'yeen' &&
    metadata.version === expected.version &&
    metadata.tag === expected.expectedTag &&
    COMMIT_PATTERN.test(expected.commit) &&
    metadata.dataPolicy === 'runtime-data-and-environment-are-never-packaged' &&
    metadata.archive?.file === expected.archiveName &&
    metadata.archive.bytes === expected.archiveBytes &&
    metadata.archive.sha256 === expected.normalizedActualSha
  );
}
