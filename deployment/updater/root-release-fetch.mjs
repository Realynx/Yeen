#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPOSITORY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const JOB_ID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const DEFAULT_MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;

export function compareSemanticVersions(left, right) {
  const parsedLeft = parseSemanticVersion(left);
  const parsedRight = parseSemanticVersion(right);
  if (!parsedLeft || !parsedRight) throw new Error("Invalid semantic version.");

  for (let index = 0; index < 3; index += 1) {
    const difference = parsedLeft.core[index] - parsedRight.core[index];
    if (difference !== 0) return difference;
  }
  return comparePrereleaseParts(parsedLeft.prerelease, parsedRight.prerelease);
}

function comparePrereleaseParts(left, right) {
  if (left.length === 0) return right.length === 0 ? 0 : 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric)
      return Number(leftPart) - Number(rightPart);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

export async function readInstalledVersion(deployRoot) {
  for (const fileName of ["release.json", "package.json"]) {
    try {
      const document = JSON.parse(
        await readFile(join(deployRoot, "current", fileName), "utf8"),
      );
      const version = normalizeSemanticVersion(document.version);
      if (version) return version;
    } catch {
      // Continue to the next immutable, root-owned release manifest.
    }
  }
  throw new Error("Installed Yeen version is unavailable or invalid.");
}

export async function readUntrustedUpdateIntent(requestFile, expectedJobId) {
  if (!JOB_ID_PATTERN.test(expectedJobId))
    throw new Error("Update job identifier is invalid.");
  const details = await lstat(requestFile);
  if (!details.isFile() || details.isSymbolicLink() || details.size > 1024) {
    throw new Error("Untrusted update request file is invalid.");
  }
  let request;
  try {
    request = JSON.parse(await readFile(requestFile, "utf8"));
  } catch {
    throw new Error("Untrusted update request is invalid JSON.");
  }
  const keys = Object.keys(request ?? {}).sort();
  const version = normalizeSemanticVersion(request?.version);
  if (
    keys.length !== 2 ||
    keys[0] !== "jobId" ||
    keys[1] !== "version" ||
    request.jobId !== expectedJobId ||
    version !== request.version
  ) {
    throw new Error(
      "Untrusted update request must contain only its matching jobId and semantic version.",
    );
  }
  return { jobId: expectedJobId, version };
}

export async function fetchVerifiedRootRelease(options) {
  const {
    repository,
    channel,
    requestedVersion,
    installedVersion,
    destination,
    fetchImpl = fetch,
    maxArchiveBytes = DEFAULT_MAX_ARCHIVE_BYTES,
  } = options;
  assertPolicy({
    repository,
    channel,
    requestedVersion,
    installedVersion,
    maxArchiveBytes,
  });
  await mkdir(destination, { recursive: true, mode: 0o700 });

  const tag = `v${requestedVersion}`;
  const apiUrl = `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`;
  const release = await downloadJson(fetchImpl, apiUrl, 1024 * 1024, {
    redirect: "error",
  });
  assertReleasePolicy(release, channel, requestedVersion);

  const archiveName = `yeen-v${requestedVersion}.zip`;
  const checksumName = `${archiveName}.sha256`;
  const metadataName = `yeen-v${requestedVersion}.release.json`;
  const archiveAsset = exactAsset(release.assets, repository, tag, archiveName);
  const checksumAsset = exactAsset(
    release.assets,
    repository,
    tag,
    checksumName,
  );
  const metadataAsset = exactAsset(
    release.assets,
    repository,
    tag,
    metadataName,
  );
  if (archiveAsset.size > maxArchiveBytes)
    throw new Error("Release archive exceeds the configured size limit.");

  const archivePath = resolve(destination, archiveName);
  if (archivePath !== join(resolve(destination), archiveName))
    throw new Error("Unsafe release archive path.");
  const archive = await downloadFile(
    fetchImpl,
    archiveAsset.browser_download_url,
    archivePath,
    maxArchiveBytes,
  );
  try {
    const checksumText = await downloadText(
      fetchImpl,
      checksumAsset.browser_download_url,
      4096,
    );
    const metadataText = await downloadText(
      fetchImpl,
      metadataAsset.browser_download_url,
      64 * 1024,
    );
    verifyPublishedArtifacts({
      requestedVersion,
      archiveName,
      archiveBytes: archive.bytes,
      archiveSha256: archive.sha256,
      checksumText,
      metadataText,
    });
    return { version: requestedVersion, archivePath, sha256: archive.sha256 };
  } catch (error) {
    await rm(archivePath, { force: true });
    throw error;
  }
}

function assertPolicy({
  repository,
  channel,
  requestedVersion,
  installedVersion,
  maxArchiveBytes,
}) {
  if (!REPOSITORY_PATTERN.test(repository))
    throw new Error("Configured update repository is invalid.");
  if (channel !== "stable" && channel !== "prerelease")
    throw new Error("Configured update channel is invalid.");
  if (normalizeSemanticVersion(requestedVersion) !== requestedVersion) {
    throw new Error("Requested update version is invalid.");
  }
  if (!normalizeSemanticVersion(installedVersion))
    throw new Error("Installed Yeen version is invalid.");
  if (compareSemanticVersions(requestedVersion, installedVersion) <= 0) {
    throw new Error("Requested release is not newer than installed Yeen.");
  }
  if (!Number.isSafeInteger(maxArchiveBytes) || maxArchiveBytes < 1024 * 1024) {
    throw new Error("Configured archive size limit is invalid.");
  }
}

function assertReleasePolicy(release, channel, requestedVersion) {
  if (
    !release ||
    typeof release !== "object" ||
    release.tag_name !== `v${requestedVersion}` ||
    release.draft !== false ||
    typeof release.prerelease !== "boolean"
  ) {
    throw new Error("GitHub release identity is invalid.");
  }
  const isPrerelease =
    release.prerelease === true || requestedVersion.includes("-");
  if (channel === "stable" && isPrerelease)
    throw new Error("Prerelease updates are disabled by the stable channel.");
  if (!Array.isArray(release.assets))
    throw new Error("GitHub release assets are invalid.");
}

function exactAsset(assets, repository, tag, expectedName) {
  const matches = assets.filter((asset) => asset?.name === expectedName);
  if (matches.length !== 1)
    throw new Error(
      `GitHub release must contain exactly one ${expectedName} asset.`,
    );
  const asset = matches[0];
  if (!Number.isSafeInteger(asset.size) || asset.size <= 0)
    throw new Error("GitHub release asset size is invalid.");
  const expectedPath = `/${repository}/releases/download/${tag}/${expectedName}`;
  let parsed;
  try {
    parsed = new URL(asset.browser_download_url);
  } catch {
    throw new Error("GitHub release asset URL is invalid.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.pathname !== expectedPath
  ) {
    throw new Error(
      "GitHub release asset is outside the configured repository or tag.",
    );
  }
  return asset;
}

async function downloadJson(fetchImpl, url, maxBytes, init) {
  const text = await downloadText(fetchImpl, url, maxBytes, init, true);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("GitHub returned invalid release metadata.");
  }
}

async function downloadText(
  fetchImpl,
  url,
  maxBytes,
  init = {},
  requireApiOrigin = false,
) {
  const response = await fetchImpl(url, { ...init, headers: githubHeaders() });
  if (!response.ok || !response.body)
    throw new Error(`GitHub download failed with ${response.status}.`);
  if (requireApiOrigin) {
    if (response.url && response.url !== url)
      throw new Error("GitHub API request redirected unexpectedly.");
  } else {
    assertDownloadOrigin(response.url);
  }
  const bytes = await readBoundedBody(response, maxBytes);
  if (bytes.byteLength === 0) throw new Error("GitHub release asset is empty.");
  return bytes.toString("utf8");
}

async function downloadFile(fetchImpl, url, destination, maxBytes) {
  const response = await fetchImpl(url, {
    headers: githubHeaders(),
    redirect: "follow",
  });
  if (!response.ok || !response.body)
    throw new Error(`GitHub download failed with ${response.status}.`);
  assertDownloadOrigin(response.url);
  const declaredBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes)
    throw new Error("Release archive exceeds the configured size limit.");

  const partial = `${destination}.partial`;
  const handle = await open(partial, "wx", 0o600);
  const hash = createHash("sha256");
  let bytes = 0;
  let downloadError;
  try {
    const reader = response.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes)
        throw new Error("Release archive exceeds the configured size limit.");
      hash.update(chunk.value);
      await handle.write(chunk.value);
    }
  } catch (error) {
    downloadError = error;
  } finally {
    await handle.close();
  }
  if (downloadError) {
    await rm(partial, { force: true });
    throw downloadError;
  }
  if (bytes === 0) {
    await rm(partial, { force: true });
    throw new Error("Release archive is empty.");
  }
  await rename(partial, destination);
  return { bytes, sha256: hash.digest("hex") };
}

async function readBoundedBody(response, maxBytes) {
  const declaredBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes)
    throw new Error("GitHub response exceeds the configured size limit.");
  const chunks = [];
  const reader = response.body.getReader();
  let totalBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("GitHub response exceeds the configured size limit.");
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks, totalBytes);
}

function verifyPublishedArtifacts({
  requestedVersion,
  archiveName,
  archiveBytes,
  archiveSha256,
  checksumText,
  metadataText,
}) {
  const checksumMatch = /^([a-f0-9]{64}) {2}([A-Za-z0-9._-]+)\r?\n?$/.exec(
    checksumText,
  );
  if (
    !checksumMatch ||
    checksumMatch[2] !== archiveName ||
    checksumMatch[1] !== archiveSha256
  ) {
    throw new Error(
      "Published release checksum does not match the downloaded archive.",
    );
  }
  let metadata;
  try {
    metadata = JSON.parse(metadataText);
  } catch {
    throw new Error("Published release metadata is invalid JSON.");
  }
  const expectedMetadata = {
    requestedVersion,
    archiveName,
    archiveBytes,
    archiveSha256,
  };
  if (!publishedMetadataMatches(metadata, expectedMetadata)) {
    throw new Error(
      "Published release metadata does not match the downloaded archive.",
    );
  }
}

function publishedMetadataMatches(metadata, expected) {
  const fixedFieldsMatch = metadata?.schemaVersion === 1
    && metadata.product === "yeen"
    && metadata.dataPolicy === "runtime-data-and-environment-are-never-packaged"
    && COMMIT_PATTERN.test(metadata.commit);
  const versionFieldsMatch = metadata?.version === expected.requestedVersion
    && metadata.tag === `v${expected.requestedVersion}`;
  const archiveFieldsMatch = metadata?.archive?.file === expected.archiveName
    && metadata.archive.bytes === expected.archiveBytes
    && metadata.archive.sha256 === expected.archiveSha256;
  return fixedFieldsMatch && versionFieldsMatch && archiveFieldsMatch;
}

function assertDownloadOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("GitHub release download origin is invalid.");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    (host !== "github.com" && !host.endsWith(".githubusercontent.com"))
  ) {
    throw new Error(
      "GitHub release download redirected outside GitHub-controlled storage.",
    );
  }
}

function normalizeSemanticVersion(value) {
  if (typeof value !== "string") return null;
  const match = SEMVER_PATTERN.exec(value.trim());
  if (!match) return null;
  if (
    match[4] &&
    match[4]
      .split(".")
      .some(
        (identifier) =>
          !identifier ||
          (/^\d+$/.test(identifier) &&
            identifier.length > 1 &&
            identifier.startsWith("0")),
      )
  ) {
    return null;
  }
  return `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ""}`;
}

function parseSemanticVersion(value) {
  const normalized = normalizeSemanticVersion(value);
  if (!normalized) return null;
  const separator = normalized.indexOf("-");
  const coreValue = separator < 0 ? normalized : normalized.slice(0, separator);
  const prereleaseValue = separator < 0 ? "" : normalized.slice(separator + 1);
  return {
    core: coreValue.split(".").map(Number),
    prerelease: prereleaseValue ? prereleaseValue.split(".") : [],
  };
}

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "Yeen-Privileged-Updater/1",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function main() {
  const [command, ...arguments_] = process.argv.slice(2);
  if (command === "intent") {
    const [requestFile, expectedJobId] = arguments_;
    const intent = await readUntrustedUpdateIntent(requestFile, expectedJobId);
    process.stdout.write(intent.version);
    return;
  }
  if (command !== "fetch")
    throw new Error("Privileged updater command must be intent or fetch.");
  const [
    deployRoot,
    repository,
    channel,
    requestedVersion,
    destination,
    maxBytesValue,
  ] = arguments_;
  if (
    !deployRoot ||
    !repository ||
    !channel ||
    !requestedVersion ||
    !destination
  ) {
    throw new Error(
      "Usage: root-release-fetch.mjs fetch DEPLOY_ROOT REPOSITORY CHANNEL VERSION DESTINATION [MAX_BYTES]",
    );
  }
  const installedVersion = await readInstalledVersion(deployRoot);
  const maxArchiveBytes = maxBytesValue
    ? Number(maxBytesValue)
    : DEFAULT_MAX_ARCHIVE_BYTES;
  const result = await fetchVerifiedRootRelease({
    repository,
    channel,
    requestedVersion,
    installedVersion,
    destination,
    maxArchiveBytes,
  });
  for (const value of [result.archivePath, result.sha256, result.version])
    process.stdout.write(`${value}\0`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(
      `[yeen-update] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
