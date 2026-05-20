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

- Storage is file-backed JSON for MVP speed:
  - apps/server/data/accounts.json
  - apps/server/data/media-index.json
  - apps/server/data/watch-progress.json
- HLS and extracted subtitles are written to apps/server/data/
- OpenSubtitles lookup requires OPENSUBTITLES_API_KEY.

## Next upgrades

- Move from file-backed storage to PostgreSQL
- Add role-based library access controls
- GPU transcode profiles per hardware vendor
- Rich metadata ingestion (TMDB/TVDB)
