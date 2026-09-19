# Yeen Backend

NestJS API and runtime host for Core Yeen.

## Responsibilities

- Accounts, JWT auth, account invites, TV pairing, and account roles.
- Media locations, media scans, metadata assignment, and the SQLite Media Catalog.
- Playback planning, Direct Play, Transcoded Playback, HLS segment delivery, subtitles, and watch progress.
- Broadcast Sessions for share-token synchronized playback.
- System settings and optional Core Yeen integrations such as remote metadata, subtitle lookup, and AI metadata providers.
- Add-on Package verification, installation, runtime loading, and Add-on Activation.

Torrent and download tooling is not part of Core Yeen. Install the separately maintained Downloader Add-on from the administrator portal when those tools are wanted.

## Layout

Backend source is organized by domain under `src/domains`:

- `auth`
- `media`
- `stream`
- `broadcast`
- `subtitle`
- `progress`
- `system-settings`
- `addons`
- `lifecycle`
- `core`

Each domain follows the project convention documented in `src/domains/README.md`: controllers under `presentation`, workflows under `application/services`, domain entities under `domain/entities`, and stores/clients/adapters under `infrastructure`.

## Commands

```bash
npm install
npm run start:dev
npm run build
npm run lint
npm run test
npm run test:e2e
npm run test:cov
```

From the repository root, use `npm run dev`, `npm run build`, and `npm run lint` to orchestrate both server and web.
Use `npm run verify:core-only` to compile the public server with every Downloader implementation path omitted.

## Environment

Copy `.env.example` to `.env` and set production-safe values before deploying.

Important variables include:

- `PORT`
- `YEEN_TLS_CERT_PATH` and `YEEN_TLS_KEY_PATH` (both set enables HTTP and HTTPS on `PORT`)
- `CORS_ORIGIN`
- `JWT_SECRET`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_NAME`
- `DEFAULT_ADMIN_PASSWORD`
- `MEDIA_LIBRARY_PATH` / `MEDIA_LIBRARY_PATHS`
- `FFMPEG_PATH`
- `FFPROBE_PATH`
- `OPENSUBTITLES_API_KEY`
- `YEEN_ADDONS_ROOT`
- `YEEN_ADDON_TRUSTED_KEYS`
- `YEEN_SUPERVISED_RESTART`

Development may use convenient defaults, but production should use explicit non-default security configuration.

## Documentation

- Root domain glossary: `../../CONTEXT.md`
- Codebase docs: `../../docs/codebase/`
- ADRs:
  - `../../docs/adr/0001-keep-downloader-functionality-outside-core-yeen.md`
  - `../../docs/adr/0002-use-sqlite-for-the-media-catalog.md`
  - `../../docs/adr/0003-use-dev-friendly-and-production-strict-security-defaults.md`
