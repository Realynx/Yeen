# Yeen

Focused media server baseline built with NestJS + React + TypeScript.

## What is included

- Accounts: register/login/JWT bearer session
- Media scan: recursive library scan with FFprobe metadata
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

## Project structure

- apps/server: NestJS API
- apps/web: React app (Netflix-inspired UI)
- packages/shared-contracts: shared TypeScript contracts for frontend/backend

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
4. Open any title.
5. If direct play is unsupported, HLS transcoding will auto-start.
6. Use subtitle panel to extract embedded subtitle streams when needed.

## Notes

- Storage is file-backed for MVP speed:
  - apps/server/data/accounts.json
  - apps/server/data/watch-progress.json
- Media metadata is stored in SQLite by default:
  - apps/server/data/media-metadata.sqlite
- HLS and extracted subtitles are written to apps/server/data/
- OpenSubtitles lookup requires OPENSUBTITLES_API_KEY.

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
- npm run build:deploy creates a slim deploy/ folder for production.
- npm run build:zip creates artifacts/yeen-deploy.zip.

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
- android:build:release builds an unsigned release APK by default.
- android:build:debug publishes the built APK to artifacts/tv/yeen-tv.apk.
- android:build:release publishes release APK output to artifacts/tv/yeen-tv.apk.
- TV browsers are auto-gated to an install page when detected as `tv` UI.
- The install page downloads from `/api/install/android-tv-apk` by default.
  By default this serves artifacts/tv/yeen-tv.apk (latest published build).
  Configure `TV_APK_FILE_PATH` in `apps/server/.env` to override.
- Optional frontend override: `VITE_TV_APK_DOWNLOAD_URL` in `apps/web/.env`.

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

## Ubuntu deployment with SFTP + SSH + systemd

These steps assume Ubuntu 22.04+ and a non-root SSH user with sudo access.

1. Install base packages, Node.js 22, and FFmpeg:

```bash
sudo apt update
sudo apt install -y curl unzip ca-certificates gnupg ffmpeg
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
ffmpeg -version
```

2. Build deployment zip on your local machine:

```bash
npm install
npm --prefix apps/server install
npm --prefix apps/web install
npm run build:zip
```

3. Upload zip via SFTP:

```bash
sftp youruser@your-server
sftp> put ./artifacts/yeen-deploy.zip /tmp/
sftp> exit
```

4. SSH into Ubuntu and extract:

```bash
ssh youruser@your-server
sudo mkdir -p /var/www/yeen
sudo chown -R $USER:$USER /var/www/yeen
cd /var/www/yeen
unzip -o /tmp/yeen-deploy.zip -d .
```

5. Configure environment:

```bash
cd /var/www/yeen
cp .env.example .env
nano .env
```

Recommended minimum values:

```env
PORT=4000
NODE_ENV=production
CORS_ORIGIN=https://your-domain.example.com
JWT_SECRET=replace-with-a-long-random-secret
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_NAME=Yeen Admin
DEFAULT_ADMIN_PASSWORD=change-this-password
MEDIA_LIBRARY_PATH=/srv/media
MEDIA_LIBRARY_PATHS=/srv/media/movies;/srv/media/tv
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
```

6. Install production dependencies and smoke test:

```bash
cd /var/www/yeen
npm install --omit=dev
npm start
```

Stop with Ctrl+C after verifying startup.

7. Install systemd service:

```bash
sudo cp /var/www/yeen/deployment/systemd/yeen.service /etc/systemd/system/yeen.service
sudo chown -R www-data:www-data /var/www/yeen
sudo systemctl daemon-reload
sudo systemctl enable --now yeen
sudo systemctl status yeen
```

If you deploy to a different path, update WorkingDirectory and EnvironmentFile inside /etc/systemd/system/yeen.service.

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
