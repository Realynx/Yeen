# Yeen

Focused media server baseline built with NestJS + React + TypeScript.

## What is included

- Accounts: register/login/JWT bearer session
- Media scan: recursive library scan with FFprobe metadata
- Music library:
  - MP3, M4A/AAC, FLAC, OGG/Opus, WAV, and additional archival audio indexing
  - artist, album, track, genre, duration, and embedded artwork metadata
  - persisted Video/Music mode with a dedicated music player experience
- Transcoding: on-demand FFmpeg HLS pipeline
- Subtitles:
  - embedded stream detection
  - embedded extraction to WebVTT
  - external subtitle conversion to WebVTT
  - OpenSubtitles.com lookup endpoint
- Video player:
  - direct play when browser-compatible
  - automatic HLS fallback
  - subtitle track selection
  - watch progress sync
- Add-on host:
  - ZIP upload from the administrator portal
  - signed packages by default, with explicit unsigned-package trust
  - graceful or instant activation restart
- Installable Progressive Web App for supported mobile and desktop browsers

## Project structure

- apps/server: NestJS API
- apps/web: React app with video and Spotify-inspired music experiences
- packages/shared-contracts: shared TypeScript contracts for frontend/backend
- packages/addon-sdk: stable interfaces for separately maintained Yeen add-ons

## Prerequisites

- Node 22+
- FFmpeg + FFprobe installed and available on PATH

## Setup

1. Install root tooling:

```bash
npm install
```

2. Install backend dependencies:

```bash
npm --prefix apps/server install
```

3. Install frontend dependencies:

```bash
npm --prefix apps/web install
```

4. Configure environment:

- Copy apps/server/.env.example to apps/server/.env and update values.
- Copy apps/web/.env.example to apps/web/.env if needed.
- Default admin credentials come from server env values:
  - DEFAULT_ADMIN_EMAIL
  - DEFAULT_ADMIN_NAME
  - DEFAULT_ADMIN_PASSWORD

5. Start both apps:

```bash
npm run dev
```

- API: http://localhost:4000/api
- Web: http://localhost:5173

## First run flow

1. Start the server with apps/server/.env configured.
2. Sign in using the default admin credentials from the env file.
3. Use Rescan in the web UI and provide your media path (or set MEDIA_LIBRARY_PATH).
4. Use the Video/Music selector to switch libraries; the selected mode is remembered per account.
5. Open any title or track.
6. If video direct play is unsupported, HLS transcoding will auto-start.
7. Use subtitle panel to extract embedded subtitle streams when needed.

## Notes

- Storage is file-backed for MVP speed:
  - apps/server/data/accounts.json
  - apps/server/data/watch-progress.json
- Media metadata is stored in SQLite by default:
  - apps/server/data/media-metadata.sqlite
- HLS and extracted subtitles are written to apps/server/data/
- OpenSubtitles lookup requires OPENSUBTITLES_API_KEY.
- Torrent and download tooling is not included in Core Yeen. It is supplied by a separately maintained Downloader Add-on.

## Add-ons

Administrators manage Add-on Packages at `/admin/add-ons`. Upload a ZIP, review its publisher and signature status, enable it, then choose graceful or instant Add-on Activation. Graceful activation waits for active Playback to drain; instant activation restarts immediately.

Signed packages are required by default. Allowing unsigned packages is an explicit administrator trust setting and still requires acknowledging the package warning. Configure trusted Ed25519 publisher keys with `YEEN_ADDON_TRUSTED_KEYS`; see `scripts/addons/README.md` for package and key tooling.

Core Yeen keeps the Downloader Account Role so an installed Downloader Add-on can preserve authorization and user experience. The public UI calls the role **Downloader** (plural **Downloaders**); persisted accounts may retain the legacy `sailer` code for compatibility.

Before publishing Core Yeen, verify that it compiles without any Downloader implementation:

```bash
npm run verify:core-only
```

## Code quality

Run the local CodeFactor-equivalent gate before committing:

```bash
npm run codefactor:check
```

It enforces zero lint warnings, rejects duplicate imports, and limits cyclomatic
complexity to 15 across Core, shared packages, deployment tooling, and the private
Downloader Add-on when that checkout is present. Run the wider test, typecheck, and
production-build matrix with:

```bash
npm run quality:check
```

## Next upgrades

- Move from file-backed storage to PostgreSQL
- Add role-based library access controls
- GPU transcode profiles per hardware vendor
- Rich metadata ingestion (TMDB/TVDB)

## Single-port architecture

In production, one NestJS process serves both:

- frontend static assets from apps/web/dist
- backend API routes under /api/*

That means Cloudflared only needs one local origin, for example http://localhost:4000.

## Build and package for deployment

- npm run build builds server + web.
- npm run build:deploy verifies the Core-only deletion test, then creates a slim deploy/ folder for production.
- npm run build:zip creates artifacts/yeen-deploy.zip.
- Version tags publish a checksummed Core deployment through GitHub Actions; see [docs/github-releases.md](docs/github-releases.md).
- Tagged multi-platform GHCR images and Docker Compose usage are documented in [docs/docker.md](docs/docker.md).

## Android APK (Capacitor)

The web app now includes a Capacitor Android wrapper at apps/web/android.

Use these root-level commands:

```bash
npm run android:add
npm run android:configure-sdk
npm run android:sync
npm run android:open
npm run android:build:debug
npm run android:build:release
```

Run `npm run android:test` and `npm run android:audit` before opening Android
Studio. The tagged release workflow also runs these checks, Gradle unit tests,
Android Lint, and a debug APK build.

Google TV emulator workflow (development):

1. Start a Google TV emulator from Android Studio Device Manager.
2. List connected targets and confirm a TV emulator is detected:

```bash
npm run android:tv:list
```

3. Install and launch the latest debug APK on the emulator:

```bash
npm run android:tv:apk
```

4. For live iteration without rebuilding APK each change:

Terminal 1 (web dev server):

```bash
npm run dev:web:tv
```

Terminal 2 (deploy Capacitor app in live-reload mode):

```bash
npm run android:tv:live
```

Optional target override (if multiple emulators/devices are connected):

```bash
npm --prefix apps/web run android:tv:apk -- --serial emulator-5554
npm --prefix apps/web run android:tv:live -- --serial emulator-5554
```

Notes for live-reload mode:

- Default host is `10.0.2.2` with port `5173`, which maps emulator -> host machine.
- `android:tv:live` uses `--no-sync` for faster loops. Re-run `npm run android:sync` after native/plugin changes.

Notes:

- android:configure-sdk auto-detects Android SDK and writes
  apps/web/android/local.properties.
- android:build:release refuses to build an unsigned APK. Configure the four
  signing variables below with the same long-lived key for every release.
- android:build:debug publishes the built APK to artifacts/tv/yeen-tv.apk.
- android:build:release publishes release APK output to artifacts/tv/yeen-tv.apk.
- Packaged Android phone and TV clients support explicitly configured HTTP home-server
  URLs. On first sign-in, set **Yeen Server** to the reachable LAN or HTTPS API URL
  (for example `http://192.168.1.25:4000/api`); `localhost` refers to the Android
  device itself.
  HTTP exposes credentials and playback traffic on the network, so use HTTPS
  whenever possible.
- TV browsers are auto-gated to an install page when detected as `tv` UI.
- The install page downloads from `/api/install/android-tv-apk` by default.
  By default this serves artifacts/tv/yeen-tv.apk (latest published build).
  Configure `TV_APK_FILE_PATH` in `apps/server/.env` to override.
- Optional frontend override: `VITE_TV_APK_DOWNLOAD_URL` in `apps/web/.env`.

Signed release variables:

```bash
export YEEN_ANDROID_KEYSTORE_PATH=/absolute/path/to/yeen-release.jks
export YEEN_ANDROID_KEYSTORE_PASSWORD='...'
export YEEN_ANDROID_KEY_ALIAS='yeen'
export YEEN_ANDROID_KEY_PASSWORD='...'
npm run android:build:release
```

GitHub Actions uses the corresponding repository secrets and expects the
keystore itself in `YEEN_ANDROID_KEYSTORE_BASE64`. When all four secrets are
present, a checksummed signed APK is attached to the GitHub Release. The CI
debug APK remains a workflow artifact and is deliberately not published as a
release download because its disposable debug signature cannot support safe
in-place upgrades.

## Line Budget Guardrail

- npm run line-budget reports files above 400 lines (soft warning mode).
- npm run line-budget:hard fails if over-budget files are not in `.line-budget-allowlist.json`.
- Default scope includes source files under:
  - apps/server/src
  - apps/web/src
  - packages/shared-contracts/src
- Set `LINE_BUDGET_INCLUDE_TESTS=1` to include test files under:
  - apps/server/test
  - apps/web/test

build:zip excludes node_modules and does not copy local apps/server/data state.
Install production dependencies on the server after extraction.

## Ubuntu deployment with SSH + systemd

Use the native installer in [docs/installation-linux.md](docs/installation-linux.md)
for both fresh installations and upgrades. Current release archives use
`/opt/yeen/current` for immutable code and `/opt/yeen/shared` for persistent
state. Do not extract a current archive over `/var/www/yeen` or copy the static
systemd unit into that legacy layout.

This repository also includes a deployment wrapper for the existing Proxmox
installation. Its defaults are the OpenSSH alias `zen` and container `139`.
The alias must resolve to an account that can run `pct` without an interactive
sudo prompt. The wrapper performs a read-only preflight and only proceeds when
an existing environment and account database are present in `/opt/yeen/shared`
or `/var/www/yeen`; fresh installation remains an explicit native-installer
workflow.

The Proxmox wrapper is a coordinated Core + Downloader Add-on deployment. It
rebuilds and signs `private/yeen-downloader-addon`, embeds the signed package
and public publisher metadata in the checksummed Core archive, and accepts the
cutover only when production reports the exact expected add-on version and
digest as active. A failed Core or add-on health check restores the previous
Core release, add-on registry/packages, and `yeen.env` together.

Create the long-lived signing key once, outside the repository:

```bash
npm run addon:keygen -- --out "$HOME/.yeen/keys/downloader"
```

The wrapper defaults to `~/.yeen/keys/downloader.private.pem`. Override it with
`--addon-key` or `YEEN_DOWNLOADER_ADDON_SIGNING_KEY`; override the private
workspace with `--addon-root` or `YEEN_DOWNLOADER_ADDON_ROOT`.

```bash
npm run test:deploy:ssh
npm run deploy:ssh -- --host zen --container 139
```

Override the target and layout with `--host`, `--container`, `--deploy-root`,
`--legacy-root`, `--service-name`, `--addon-root`, and `--addon-key`, or the
corresponding `YEEN_*` environment variables. The deployment uploads only the
coordinated release archive and installer scripts. Accounts, settings, SQLite
metadata, environment values, and unrelated add-ons stay authoritative on the
server; the bundled Downloader Add-on is staged for the same restart.

`--skip-build` reuses the already-built coordinated archive and is intended
only for retrying an unchanged artifact. Do not use it after changing Core or
the Downloader Add-on.

View logs:

```bash
sudo journalctl -u yeen -f
```

8. Point Cloudflared tunnel to the single app port:

Quick temporary tunnel:

```bash
cloudflared tunnel --url http://localhost:4000
```

Named tunnel template is included at deployment/cloudflared/config.yml.
Copy it to /etc/cloudflared/config.yml, set your tunnel ID and hostname, then run Cloudflared as a service.

9. Validate from the server:

```bash
curl -I http://localhost:4000
curl http://localhost:4000/api
```
