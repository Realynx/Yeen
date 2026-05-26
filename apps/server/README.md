# Yeen Backend

NestJS API and runtime host for Core Yeen.

## Responsibilities

- Accounts, JWT auth, account invites, TV pairing, and account roles.
- Media locations, media scans, metadata assignment, and the SQLite Media Catalog.
- Playback planning, Direct Play, Transcoded Playback, HLS segment delivery, subtitles, and watch progress.
- Broadcast Sessions for share-token synchronized playback.
- System settings and optional Core Yeen integrations such as remote metadata, subtitle lookup, and AI metadata providers.

Current torrent/download code exists in this app, but the target architecture is to extract it into the optional Downloader Add-on rather than keep it in Core Yeen.

## Layout

Backend source is organized by domain under `src/domains`:

- `auth`
- `media`
- `stream`
- `broadcast`
- `subtitle`
- `progress`
- `system-settings`
- `torrent`
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

## Environment

Copy `.env.example` to `.env` and set production-safe values before deploying.

Important variables include:

- `PORT`
- `CORS_ORIGIN`
- `JWT_SECRET`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_NAME`
- `DEFAULT_ADMIN_PASSWORD`
- `MEDIA_LIBRARY_PATH` / `MEDIA_LIBRARY_PATHS`
- `FFMPEG_PATH`
- `FFPROBE_PATH`
- `OPENSUBTITLES_API_KEY`

Development may use convenient defaults, but production should use explicit non-default security configuration.

## Documentation

- Root domain glossary: `../../CONTEXT.md`
- Codebase docs: `../../docs/codebase/`
- ADRs:
  - `../../docs/adr/0001-keep-downloader-functionality-outside-core-yeen.md`
  - `../../docs/adr/0002-use-sqlite-for-the-media-catalog.md`
  - `../../docs/adr/0003-use-dev-friendly-and-production-strict-security-defaults.md`
