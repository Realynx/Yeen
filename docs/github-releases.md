# GitHub Releases

Core Yeen releases are built by `.github/workflows/release.yml`. A version tag
must match the version in the root `package.json`, for example `v1.0.0` for
package version `1.0.0`.

Every release publishes three adjacent assets:

- `yeen-v1.0.0.zip` — compiled Core Yeen server/web deployment
- `yeen-v1.0.0.zip.sha256` — SHA-256 in standard `sha256sum` format
- `yeen-v1.0.0.release.json` — version, source commit, build time, size, and hash

Tags also publish the same compiled Core release to
`ghcr.io/realynx/yeen` for `linux/amd64` and `linux/arm64`. The deployment ZIP
includes Compose files and a runtime Dockerfile; see [docker.md](docker.md).

The workflow installs from lockfiles, verifies Core without the private
Downloader implementation, runs server/web tests and lint, compiles both apps,
and then creates the deployment archive. Runtime `data/`, installed add-ons,
SQLite files, and `.env` are not copied into the archive.

## Publish

Update the root package version, commit it, then create and push the matching
annotated tag:

```bash
git tag -a v1.0.0 -m "Yeen v1.0.0"
git push origin v1.0.0
```

`workflow_dispatch` performs the same verification and uploads a temporary
Actions artifact, but intentionally does not create a GitHub Release.

## One-command install or upgrade

The safest bootstrap pins both the script and downloaded release:

```bash
curl -fsSL https://raw.githubusercontent.com/Realynx/Yeen/v1.0.0/deployment/scripts/install-github-release.sh \
  | sudo bash -s -- --repo Realynx/Yeen --version v1.0.0
```

To follow the newest published release, use the bootstrap from the default
branch and omit `--version`:

```bash
curl -fsSL https://raw.githubusercontent.com/Realynx/Yeen/master/deployment/scripts/install-github-release.sh \
  | sudo bash -s -- --repo Realynx/Yeen
```

The bootstrap downloads the ZIP and adjacent checksum into a private temporary
directory, verifies the SHA-256, extracts `deployment/scripts/install.sh` from
the verified ZIP, and invokes that installer. Installer options go after `--`.
See `deployment/scripts/install.sh --help` for first-install environment and
upgrade options.

Override the repository or version with CLI flags or the
`YEEN_GITHUB_REPOSITORY` and `YEEN_RELEASE_VERSION` environment variables. For
a private repository, provide `GH_TOKEN` or `GITHUB_TOKEN` in the environment;
the token is stored only in a mode-0600 temporary curl config, never placed in
the process command line, logs, download URL, or cross-host asset redirect.
