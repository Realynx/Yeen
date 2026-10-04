# Yeen

A self-hosted media server for your Movies, Series, and Music Library. One server
serves the web app and API, with desktop, phone, TV, and Android clients.

## Install on Linux (recommended)

On a systemd Linux host with `curl` and `sudo`, copy and paste:

```bash
curl -fsSL https://raw.githubusercontent.com/Realynx/Yeen/master/deployment/scripts/install-github-release.sh | sudo bash
```

The installer downloads the latest published release, verifies its SHA-256,
installs Node.js and FFmpeg when needed, and asks for your browser URL and initial
administrator credentials. Debian/Ubuntu are the primary supported hosts; see
[Linux installation](docs/installation-linux.md) for other distributions,
unattended setup, upgrades, and rollback. A published GitHub Release is required.

To choose a media drive, forward installer options after `--`:

```bash
curl -fsSL https://raw.githubusercontent.com/Realynx/Yeen/master/deployment/scripts/install-github-release.sh | sudo bash -s -- -- --media-library /mnt/media
```

Open the browser URL you entered (normally `http://<server-address>:4000`), sign
in, and add Media Locations in Settings. The service account needs read/traverse
permission on those directories. Enable write access only if you use filesystem
organization features. Re-running the installer upgrades the code while keeping
Accounts, settings, Watch Progress, the Media Catalog, and installed add-ons.

```bash
sudo systemctl status yeen
sudo journalctl -u yeen -f
```

## Docker or Podman

Install your container engine and its Compose provider first. Replace `/mnt/media`
with an existing media drive or directory, then run:

```bash
curl -fsSL https://raw.githubusercontent.com/Realynx/Yeen/master/deployment/scripts/install-compose.sh | bash -s -- --engine docker --media /mnt/media
```

For Podman, use the same Compose file and installer:

```bash
curl -fsSL https://raw.githubusercontent.com/Realynx/Yeen/master/deployment/scripts/install-compose.sh | bash -s -- --engine podman --media /mnt/media
```

The script creates `~/yeen/compose.yml` and a restricted `~/yeen/.env`, generates
credentials, and prints the initial password. Open `http://<server-address>:4000`.
It mounts your media read-only at `/media` and keeps application state in the
`yeen-shared` named volume. Published images support Linux amd64 and arm64.

After your first successful login, remove the `DEFAULT_ADMIN_*` lines from
`~/yeen/.env` and run `docker compose up -d --force-recreate` from `~/yeen`.
Use `podman compose` in all commands for Podman.

To update:

```bash
cd ~/yeen
docker compose pull && docker compose up -d
```

For multiple drives, add bind mounts using the supplied
[media override](deployment/docker/compose-media.example.yml). Configure their
container paths in Yeen. See [Docker and Podman deployment](docs/docker.md) for
manual installation, permissions, SELinux, release pins, and local image builds.

## Features

- Accounts, invitations, TV pairing, and administrator-managed password recovery
- Media Scan with FFprobe metadata, SQLite Media Catalog, and metadata correction
- Music Library with Track, Artist, Album, artwork, and playback support
- Direct Play and FFmpeg HLS Transcoded Playback
- Embedded/external subtitles, subtitle extraction, and optional subtitle lookup
- Watch Progress, playback preferences, and shared Broadcast Sessions
- Desktop, phone, and TV experiences, an installable PWA, and Android clients
- A generic add-on host with signed packages, trust policy, and controlled activation

Optional metadata integrations include TMDB, TheAudioDB, Jikan, and AI providers.
Core Yeen manages and plays media you supply. Private acquisition implementations
and operator deployment workflows are maintained outside the public source and
release artifacts.

## Develop

Requirements: Node.js 22+, npm, FFmpeg, and FFprobe on `PATH`.

```bash
npm ci
npm --prefix apps/server ci
npm --prefix apps/web ci
cp apps/server/.env.example apps/server/.env
npm run dev
```

Set administrator credentials in `apps/server/.env` before starting. The API runs
at `http://localhost:4000/api`; the development web app at `http://localhost:5173`.
Production serves both on port 4000. Use HTTPS when exposing Yeen beyond a trusted
local network.

| Directory | Responsibility |
| --- | --- |
| `apps/server` | NestJS API, Media Catalog, Playback, Accounts, and add-on host |
| `apps/web` | React desktop, phone, TV, and music experiences |
| `packages/shared-contracts` | Frontend/backend domain contracts |
| `packages/addon-sdk` | Generic add-on interfaces |
| `deployment` | Native installer, updater, and portable container packet |

See [domain vocabulary](CONTEXT.md), [architecture decisions](docs/adr/), and
[add-on packaging](scripts/addons/README.md). Android build and emulator commands
are in [Android clients](docs/android.md).

## Verify and package

```bash
npm run quality:check
npm run test:install          # Linux / Bash installer tests
npm run test:release:shell
npm run build:zip
```

`quality:check` includes the public-source boundary, TypeScript, zero-warning lint,
complexity (maximum 15), duplicate imports, server/web/tooling tests, and production
builds. `npm run codefactor:check` runs the focused quality gate.

`build:zip` creates a verified `deploy/` packet and `artifacts/yeen-deploy.zip`.
Packaging checks the final tree again and rejects private implementations,
installed packages, environment files, and runtime state. Public verification
compiles the actual Core source without deleting or rewriting imports in memory.
Existing JSON documents are atomically replaced; malformed or unreadable state
is surfaced for repair rather than overwritten with defaults.

Tagged releases publish checksummed archives and container images; see
[GitHub Releases](docs/github-releases.md). These checks cover the current tree
and artifacts. They do not remove content already committed in Git history.

For a source export without historical commits, run `npm run package:source`.
It creates `artifacts/yeen-public-source.zip` from verified current public files,
including uncommitted work. Extract it into a new directory and initialize a new
Git repository if publishing with a fresh history. The existing repository and
its previous commits are not modified.
