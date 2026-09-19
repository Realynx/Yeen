import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  fetchVerifiedRootRelease,
  readUntrustedUpdateIntent,
} from "../../deployment/updater/root-release-fetch.mjs";

const repository = "Realynx/Yeen";
const version = "1.1.0";
const archiveName = `yeen-v${version}.zip`;
const remoteArchive = Buffer.from("verified GitHub release bytes");
const remoteSha = createHash("sha256").update(remoteArchive).digest("hex");

function release(overrides = {}) {
  const baseUrl = `https://github.com/${repository}/releases/download/v${version}`;
  return {
    tag_name: `v${version}`,
    draft: false,
    prerelease: false,
    assets: [
      {
        name: archiveName,
        size: remoteArchive.length,
        browser_download_url: `${baseUrl}/${archiveName}`,
      },
      {
        name: `${archiveName}.sha256`,
        size: 100,
        browser_download_url: `${baseUrl}/${archiveName}.sha256`,
      },
      {
        name: `yeen-v${version}.release.json`,
        size: 500,
        browser_download_url: `${baseUrl}/yeen-v${version}.release.json`,
      },
    ],
    ...overrides,
  };
}

function response(body, url, init = {}) {
  const result = new Response(body, { status: 200, ...init });
  Object.defineProperty(result, "url", { value: url });
  return result;
}

function verificationMetadata() {
  return JSON.stringify({
    schemaVersion: 1,
    product: "yeen",
    version,
    tag: `v${version}`,
    commit: "a".repeat(40),
    dataPolicy: "runtime-data-and-environment-are-never-packaged",
    archive: {
      file: archiveName,
      bytes: remoteArchive.length,
      sha256: remoteSha,
    },
  });
}

function githubFetch(releaseDocument = release()) {
  return async (url) => {
    if (url.startsWith("https://api.github.com/"))
      return response(JSON.stringify(releaseDocument), url);
    if (url.endsWith(".zip"))
      return response(
        remoteArchive,
        "https://objects.githubusercontent.com/root-owned-archive",
      );
    if (url.endsWith(".sha256"))
      return response(
        `${remoteSha}  ${archiveName}\n`,
        "https://objects.githubusercontent.com/root-owned-checksum",
      );
    return response(
      verificationMetadata(),
      "https://objects.githubusercontent.com/root-owned-metadata",
    );
  };
}

test("privileged update ignores a forged service-owned archive and checksum", async () => {
  const root = await mkdtemp(join(tmpdir(), "yeen-root-update-"));
  try {
    const serviceStaging = join(
      root,
      "service-data",
      "updates",
      "staged",
      "attacker-job",
    );
    const rootIncoming = join(root, "root-owned-incoming");
    await mkdir(serviceStaging, { recursive: true });
    const forgedArchive = Buffer.from("forged service-owned release");
    const forgedSha = createHash("sha256").update(forgedArchive).digest("hex");
    await writeFile(join(serviceStaging, archiveName), forgedArchive);
    await writeFile(
      join(serviceStaging, `${archiveName}.sha256`),
      `${forgedSha}  ${archiveName}\n`,
    );
    const jobId = "123e4567-e89b-42d3-a456-426614174000";
    const forgedRequest = join(serviceStaging, "request.json");
    await writeFile(
      forgedRequest,
      JSON.stringify({
        jobId,
        version,
        archiveFile: archiveName,
        sha256: forgedSha,
      }),
    );
    await assert.rejects(
      readUntrustedUpdateIntent(forgedRequest, jobId),
      /only its matching jobId and semantic version/,
    );
    await writeFile(forgedRequest, JSON.stringify({ jobId, version }));
    assert.deepEqual(await readUntrustedUpdateIntent(forgedRequest, jobId), {
      jobId,
      version,
    });

    const result = await fetchVerifiedRootRelease({
      repository,
      channel: "stable",
      requestedVersion: version,
      installedVersion: "1.0.0",
      destination: rootIncoming,
      fetchImpl: githubFetch(),
      maxArchiveBytes: 1024 * 1024,
    });

    assert.deepEqual(await readFile(result.archivePath), remoteArchive);
    assert.notEqual(result.sha256, forgedSha);
    assert.equal(
      await readFile(join(serviceStaging, archiveName), "utf8"),
      forgedArchive.toString(),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("privileged update rejects downgrade and same-version requests before downloading", async () => {
  for (const installedVersion of ["1.1.0", "1.2.0"]) {
    let called = false;
    await assert.rejects(
      fetchVerifiedRootRelease({
        repository,
        channel: "stable",
        requestedVersion: version,
        installedVersion,
        destination: "unused",
        fetchImpl: async () => {
          called = true;
          throw new Error("must not fetch");
        },
      }),
      /not newer/,
    );
    assert.equal(called, false);
  }
});

test("stable policy rejects prereleases even when GitHub omits its prerelease flag", async () => {
  const prereleaseVersion = "2.0.0-beta.1";
  await assert.rejects(
    fetchVerifiedRootRelease({
      repository,
      channel: "stable",
      requestedVersion: prereleaseVersion,
      installedVersion: "1.0.0",
      destination: "unused",
      fetchImpl: async (url) =>
        response(
          JSON.stringify({
            tag_name: `v${prereleaseVersion}`,
            draft: false,
            prerelease: false,
            assets: [],
          }),
          url,
        ),
    }),
    /Prerelease updates are disabled/,
  );
});

test("privileged update rejects invalid repositories and cross-repository asset paths", async () => {
  await assert.rejects(
    fetchVerifiedRootRelease({
      repository: "../attacker",
      channel: "stable",
      requestedVersion: version,
      installedVersion: "1.0.0",
      destination: "unused",
      fetchImpl: githubFetch(),
    }),
    /repository is invalid/,
  );

  const badRelease = release();
  badRelease.assets[0].browser_download_url = `https://github.com/attacker/Yeen/releases/download/v${version}/${archiveName}`;
  await assert.rejects(
    fetchVerifiedRootRelease({
      repository,
      channel: "stable",
      requestedVersion: version,
      installedVersion: "1.0.0",
      destination: "unused",
      fetchImpl: githubFetch(badRelease),
    }),
    /outside the configured repository or tag/,
  );
});

test("privileged update rejects an asset redirect outside GitHub-controlled storage", async () => {
  const fetchImpl = async (url) => {
    if (url.startsWith("https://api.github.com/")) {
      return response(JSON.stringify(release()), url);
    }
    return response(
      remoteArchive,
      "https://downloads.attacker.example/forged.zip",
    );
  };
  await assert.rejects(
    fetchVerifiedRootRelease({
      repository,
      channel: "stable",
      requestedVersion: version,
      installedVersion: "1.0.0",
      destination: "unused",
      fetchImpl,
    }),
    /outside GitHub-controlled storage/,
  );
});

test("privileged update rejects a mismatched tag before downloading assets", async () => {
  let requests = 0;
  await assert.rejects(
    fetchVerifiedRootRelease({
      repository,
      channel: "stable",
      requestedVersion: version,
      installedVersion: "1.0.0",
      destination: "unused",
      fetchImpl: async (url) => {
        requests += 1;
        return response(JSON.stringify(release({ tag_name: "v1.2.0" })), url);
      },
    }),
    /release identity is invalid/,
  );
  assert.equal(requests, 1);
});

test("checksum or release-metadata mismatch removes the root-owned archive", async () => {
  const root = await mkdtemp(join(tmpdir(), "yeen-root-mismatch-"));
  try {
    for (const mismatch of ["checksum", "metadata"]) {
      const destination = join(root, mismatch);
      const fetchImpl = async (url) => {
        if (url.startsWith("https://api.github.com/"))
          return response(JSON.stringify(release()), url);
        if (url.endsWith(".zip"))
          return response(
            remoteArchive,
            "https://objects.githubusercontent.com/archive",
          );
        if (url.endsWith(".sha256")) {
          const sha = mismatch === "checksum" ? "b".repeat(64) : remoteSha;
          return response(
            `${sha}  ${archiveName}\n`,
            "https://objects.githubusercontent.com/checksum",
          );
        }
        const metadata = JSON.parse(verificationMetadata());
        if (mismatch === "metadata") metadata.archive.sha256 = "c".repeat(64);
        return response(
          JSON.stringify(metadata),
          "https://objects.githubusercontent.com/metadata",
        );
      };
      await assert.rejects(
        fetchVerifiedRootRelease({
          repository,
          channel: "stable",
          requestedVersion: version,
          installedVersion: "1.0.0",
          destination,
          fetchImpl,
          maxArchiveBytes: 1024 * 1024,
        }),
        /checksum|metadata/,
      );
      assert.deepEqual(await readdir(destination), []);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bounded root download removes a partial archive that exceeds the byte limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "yeen-root-bounded-"));
  try {
    const destination = join(root, "incoming");
    const fetchImpl = async (url) => {
      if (url.startsWith("https://api.github.com/"))
        return response(JSON.stringify(release()), url);
      return response(
        Buffer.alloc(1024 * 1024 + 1),
        "https://objects.githubusercontent.com/oversized",
      );
    };
    await assert.rejects(
      fetchVerifiedRootRelease({
        repository,
        channel: "stable",
        requestedVersion: version,
        installedVersion: "1.0.0",
        destination,
        fetchImpl,
        maxArchiveBytes: 1024 * 1024,
      }),
      /exceeds the configured size limit/,
    );
    assert.deepEqual(await readdir(destination), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Docker artifacts explicitly select operator-managed update guidance", async () => {
  const dockerfile = await readFile(
    new URL("../../deployment/docker/Dockerfile", import.meta.url),
    "utf8",
  );
  const compose = await readFile(
    new URL("../../deployment/docker/compose.yml", import.meta.url),
    "utf8",
  );
  assert.match(dockerfile, /YEEN_DEPLOYMENT_MODE=docker/);
  assert.match(compose, /YEEN_DEPLOYMENT_MODE:\s*docker/);
});

test("sudoers exposes only the exact UUID systemd command and status stays outside service staging", async () => {
  const sudoers = await readFile(
    new URL("../../deployment/systemd/yeen-update-sudoers", import.meta.url),
    "utf8",
  );
  const service = await readFile(
    new URL("../../deployment/systemd/yeen.service", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(sudoers, /\*/);
  assert.match(sudoers, /yeen-update@\?{8}-\?{4}-\?{4}-\?{4}-\?{12}\.service/);
  assert.match(
    service,
    /YEEN_UPDATE_STATUS_ROOT=\/opt\/yeen\/shared\/update-status/,
  );
});
