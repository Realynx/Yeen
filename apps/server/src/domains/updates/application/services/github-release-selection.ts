export type UpdateChannel = 'stable' | 'prerelease';

export interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GithubReleasePayload {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: GithubReleaseAsset[];
}

export interface SelectedGithubRelease {
  version: string;
  tag: string;
  prerelease: boolean;
  publishedAt: string | null;
  archive: GithubReleaseAsset;
  checksum: GithubReleaseAsset;
  metadata: GithubReleaseAsset;
}

interface ParsedSemanticVersion {
  core: [number, number, number];
  prerelease: string[];
}

const SEMVER_PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

export function normalizeSemanticVersion(value: string): string | null {
  const match = SEMVER_PATTERN.exec(value.trim());
  if (!match) return null;
  return `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ''}`;
}

export function compareSemanticVersions(left: string, right: string): number {
  const parsedLeft = parseSemanticVersion(left);
  const parsedRight = parseSemanticVersion(right);
  if (!parsedLeft || !parsedRight) {
    throw new Error('Cannot compare invalid semantic versions.');
  }

  const coreComparison = compareCore(parsedLeft.core, parsedRight.core);
  if (coreComparison !== 0) return coreComparison;
  return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
}

function compareCore(
  left: ParsedSemanticVersion['core'],
  right: ParsedSemanticVersion['core'],
): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0) return right.length === 0 ? 0 : 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    return comparePrereleasePart(leftPart, rightPart);
  }
  return 0;
}

function comparePrereleasePart(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left.localeCompare(right);
}

export function selectLatestGithubRelease(
  releases: readonly GithubReleasePayload[],
  channel: UpdateChannel,
  currentVersion?: string,
): SelectedGithubRelease | null {
  const selected = releases
    .filter((release) => !release.draft)
    .map(toSelectedRelease)
    .filter((release): release is SelectedGithubRelease => release !== null)
    .filter((release) => channel === 'prerelease' || !release.prerelease)
    .filter(
      (release) =>
        !currentVersion ||
        compareSemanticVersions(release.version, currentVersion) > 0,
    )
    .sort((left, right) =>
      compareSemanticVersions(right.version, left.version),
    )[0];

  return selected ?? null;
}

export function isAllowedGithubReleaseAssetUrl(
  repository: string,
  value: string,
): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      parsed.pathname.startsWith(`/${repository}/releases/download/`)
    );
  } catch {
    return false;
  }
}

export function isAllowedGithubDownloadRedirect(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === 'https:' &&
      (host === 'github.com' || host.endsWith('.githubusercontent.com'))
    );
  } catch {
    return false;
  }
}

function parseSemanticVersion(value: string): ParsedSemanticVersion | null {
  const normalized = normalizeSemanticVersion(value);
  if (!normalized) return null;
  const separatorIndex = normalized.indexOf('-');
  const coreValue =
    separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : normalized;
  const prereleaseValue =
    separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : '';
  const core = coreValue.split('.').map(Number) as [number, number, number];
  return {
    core,
    prerelease: prereleaseValue ? prereleaseValue.split('.') : [],
  };
}

function toSelectedRelease(
  release: GithubReleasePayload,
): SelectedGithubRelease | null {
  const version = normalizeSemanticVersion(release.tag_name);
  if (!version) return null;
  const archiveName = `yeen-v${version}.zip`;
  const archive = release.assets.find((asset) => asset.name === archiveName);
  const checksum = release.assets.find(
    (asset) => asset.name === `${archiveName}.sha256`,
  );
  const metadata = release.assets.find(
    (asset) => asset.name === `yeen-v${version}.release.json`,
  );
  if (!archive || !checksum || !metadata) return null;
  if (![archive, checksum, metadata].every(isSecureGithubAsset)) return null;

  return {
    version,
    tag: `v${version}`,
    prerelease: release.prerelease || version.includes('-'),
    publishedAt: release.published_at,
    archive,
    checksum,
    metadata,
  };
}

function isSecureGithubAsset(asset: GithubReleaseAsset): boolean {
  if (!Number.isSafeInteger(asset.size) || asset.size <= 0) return false;
  try {
    return new URL(asset.browser_download_url).protocol === 'https:';
  } catch {
    return false;
  }
}
