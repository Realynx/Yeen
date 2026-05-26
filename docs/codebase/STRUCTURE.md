# Codebase Structure

## Core Sections (Required)

### 1) Top-Level Map

| Path | Purpose | Evidence |
|------|---------|----------|
| `apps\server\` | NestJS backend API, static asset host, media processing, auth, storage, subtitle, stream, progress, broadcast, settings, and current torrent/download implementation | `README.md`, `apps\server\src\app.module.ts`, `apps\server\src\domains\README.md`, `docs\adr\0001-keep-downloader-functionality-outside-core-yeen.md` |
| `apps\web\` | React/Vite frontend with desktop, phone, TV, PWA, and Capacitor Android surfaces | `README.md`, `apps\web\package.json`, `apps\web\src\main.tsx`, `apps\web\src\features\README.md` |
| `packages\shared-contracts\` | Shared TypeScript contract package re-exporting API/domain types for server and web | `packages\shared-contracts\README.md`, `packages\shared-contracts\package.json`, `packages\shared-contracts\src\index.ts` |
| `scripts\` | Root automation for deploy packaging, Android SDK configuration, line-budget checks, source organization, and cleanup | `package.json`, `scripts\check-line-budget.mjs`, `scripts\prepare-deploy.mjs`, `scripts\create-zip.mjs` |
| `deployment\` | systemd and Cloudflared deployment templates for the single-port production app | `deployment\systemd\yeen.service`, `deployment\cloudflared\config.yml`, `README.md` |
| `.github\skills\` | Project-specific Copilot skills for bug cleanup and refactoring workflows | `docs\codebase\.codebase-scan.txt`, `.github\skills\deep-bug-identification-patching-test-cleanup\SKILL.md` |
| `docs\codebase\` | Generated codebase knowledge documents from this scan | `docs\codebase\.codebase-scan.txt` |
| `Backend\` | Empty or legacy directory tree detected with no source files found by `glob Backend/**/*`; status requires owner confirmation | terminal glob result, `docs\codebase\.codebase-scan.txt` |

### 2) Entry Points

- Main runtime entry: `apps\server\src\main.ts` creates `AppModule`, configures CORS, sets global prefix `/api`, enables validation, and listens on `PORT ?? 4000`.
- Server module entry: `apps\server\src\app.module.ts` imports Config, static serving, and domain modules.
- Web runtime entry: `apps\web\src\main.tsx` imports global CSS, registers the PWA service worker in production, and renders `<App />`.
- Web route/app shell entry: `apps\web\src\App.tsx` owns auth bootstrap, public watch/invite flows, client experience detection, and route rendering.
- Shared contracts entry: `packages\shared-contracts\src\index.ts`.
- Secondary entry points: Android/TV scripts in `apps\web\package.json`; deploy scripts in `scripts\prepare-deploy.mjs` and `scripts\create-zip.mjs`; systemd runtime through `deployment\systemd\yeen.service`.
- How entry is selected: root `package.json` orchestrates server/web commands with `npm --prefix`; production deploy package starts the server with npm and serves web static assets through Nest.

### 3) Module Boundaries

| Boundary | What belongs here | What must not be here |
|----------|-------------------|------------------------|
| `apps\server\src\domains\auth` | Accounts, login/register, JWT strategy, profile/avatar, invites, TV pairing, admin account management | Media scanning, playback, torrent search/control, UI state |
| `apps\server\src\domains\media` | Library locations, scanning, metadata, SQLite media store, image/preview serving, filesystem commits, remote metadata, torrent intake/search helpers | JWT issuance, direct HLS segment serving, web route state |
| `apps\server\src\domains\stream` | Direct/range streaming, HLS session lifecycle, manifest/segment serving, FFmpeg HLS transcoding | Account management, media metadata persistence ownership |
| `apps\server\src\domains\subtitle` | Embedded/external subtitle listing, extraction, WebVTT storage, online subtitle lookup | Media database ownership, player UI selection state |
| `apps\server\src\domains\progress` | Per-account watch progress persistence and completion rules | Playback UI or media file scanning |
| `apps\server\src\domains\system-settings` | Admin settings read/update, env defaults, system settings JSON store, admin guard provider | Per-feature UI state or media files |
| `apps\server\src\domains\torrent` | Current qBittorrent/torrent implementation slated for future extraction into the optional Downloader Add-on | Core Yeen library/playback behavior that must work without torrent/download tooling |
| `apps\server\src\domains\broadcast` | Broadcast Session state and public/owner broadcast endpoints | Core media scanning or account creation |
| `apps\web\src\features` | Feature-first UI pages/components/services for auth, home, library, media details/explore/management, navigation, player, settings, shared API, broadcast | Backend persistence or domain infrastructure |
| `packages\shared-contracts\src` | Cross-app DTO/type contracts and shared error/result shapes | Runtime-specific server services or React components |

### 4) Naming and Organization Rules

- Backend directory organization pattern: domain-first under `apps\server\src\domains\<domain>` with `application`, `domain`, `presentation`, and `infrastructure` subfolders.
- Backend imports should anchor from current `domains\*` paths instead of compatibility shim paths.
- Frontend directory organization pattern: feature-first under `apps\web\src\features`; layer folders use lowercase names such as `components`, `pages`, and `services`; Broadcast is its own Core Yeen feature boundary.
- Frontend feature folders use kebab-case, components/pages use PascalCase, hooks and non-component TypeScript modules use camelCase, and hyphenated TypeScript filenames are discouraged.
- Frontend import policy: import directly from implementation paths, avoid compatibility shim paths, and avoid wide barrel exports across features.
- TypeScript path aliases: no web `baseUrl`/`paths` alias was found in `apps\web\tsconfig.app.json`; imports are direct relative paths.

### 5) Evidence

- `README.md`
- `apps\server\src\main.ts`
- `apps\server\src\app.module.ts`
- `apps\server\src\domains\README.md`
- `apps\server\src\domains\media\media.module.ts`
- `apps\server\src\domains\stream\stream.module.ts`
- `apps\server\src\domains\broadcast\broadcast.module.ts`
- `apps\web\src\main.tsx`
- `apps\web\src\App.tsx`
- `apps\web\src\appRouteCatalog.tsx`
- `apps\web\src\features\README.md`
- `packages\shared-contracts\README.md`
- `packages\shared-contracts\src\index.ts`
- `package.json`
- `docs\codebase\.codebase-scan.txt`
