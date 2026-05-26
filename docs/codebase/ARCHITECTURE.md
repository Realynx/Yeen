# Architecture

## Core Sections (Required)

### 1) Architectural Style

- Primary style: domain-first NestJS backend plus feature-first React frontend in a multi-package TypeScript repository, with one root domain context documented in `CONTEXT.md`.
- Why this classification: backend source is organized under `apps\server\src\domains\<domain>` with controllers, services, domain entities, guards, stores, clients, adapters, and resolvers; frontend source is organized under `apps\web\src\features` with feature pages/components/services; root scripts orchestrate apps rather than an npm workspace field.
- Primary constraints:
  - Media playback depends on local filesystem media files plus FFmpeg/FFprobe process execution.
  - The MVP still uses file-backed JSON stores for several domains, but the Media Catalog uses SQLite by decision (`docs\adr\0002-use-sqlite-for-the-media-catalog.md`).
  - Production is designed around one Nest process serving both API routes and web static assets.
  - Core Yeen excludes torrent/download tooling by default; current torrent code is implementation drift that should be extracted into the optional Downloader Add-on.

### 2) System Flow

```text
browser/native web UI -> React route/page/hook -> shared fetch API client -> Nest controller/guard -> domain service/store/integration -> JSON/SQLite/filesystem/FFmpeg/external API -> API response or stream output
```

1. `apps\web\src\main.tsx` renders `App`, and `apps\web\src\App.tsx` boots auth from `localStorage`, resolves TV/phone/desktop experience, and renders React Router routes.
2. Feature pages and hooks call typed shared API modules under `apps\web\src\features\shared\services`, which resolve `VITE_API_BASE_URL` or runtime API base and add bearer tokens when present.
3. `apps\server\src\main.ts` receives API calls under `/api`, applies CORS and global validation, then dispatches to controllers from domain modules imported in `AppModule`.
4. Controllers use route guards (`JwtAuthGuard`, `AdminGuard`, `TorrentAccessGuard`) and delegate to domain services.
5. Domain services persist state in JSON stores, SQLite stores, in-memory runtime stores, filesystem paths, or call integrations such as FFmpeg/FFprobe, OpenSubtitles, TMDB, Jikan, qBittorrent, IPTorrents, Nyaa, Ollama, or OpenAI.
6. Playback endpoints either return JSON playback plans, direct/range media streams, HLS manifests/segments, WebVTT subtitles, images, or normal API JSON responses.

### 3) Layer/Module Responsibilities

| Layer or module | Owns | Must not own | Evidence |
|-----------------|------|--------------|----------|
| Server bootstrap | Nest app creation, CORS, `/api` prefix, validation pipe, listen port | Domain-specific business rules | `apps\server\src\main.ts` |
| `AppModule` | Global config, static web serving, domain module composition | Individual persistence implementations | `apps\server\src\app.module.ts` |
| Backend controllers | HTTP route shape, guards, DTO entrypoints, response headers/stream handoff | Persistence internals and long business workflows | `apps\server\src\domains\media\presentation\controllers\media.controller.ts`, `apps\server\src\domains\stream\presentation\controllers\stream.controller.ts` |
| Backend application services | Domain workflows such as login, scan, playback planning, HLS start, progress update, and current downloader workflows | UI state and raw route rendering | `apps\server\src\domains\auth\application\services\auth.service.ts`, `apps\server\src\domains\media\application\services\media.service.ts`, `apps\server\src\domains\stream\application\services\stream.service.ts` |
| Backend infrastructure | Stores, adapters, clients, filesystem/path helpers, external process/API wrappers | Route declarations and React components | `apps\server\src\domains\core\infrastructure\shared\json-file-store.ts`, `apps\server\src\domains\media\infrastructure\stores\media.store.ts`, `apps\server\src\domains\torrent\infrastructure\clients\qbittorrent-http.client.ts` |
| Frontend app shell | Auth bootstrap, route table rendering, public watch/invite handling, client experience setup | API persistence or server validation | `apps\web\src\App.tsx`, `apps\web\src\appRouteCatalog.tsx` |
| Frontend feature folders | UI pages/components/hooks/services by feature | Cross-feature hidden barrel behavior or backend logic | `apps\web\src\features\README.md`, `apps\web\src\features\library\services\useMediaLibrary.ts`, `apps\web\src\features\player\pages\PlayerPlaybackPage.tsx` |
| Shared contracts | Reusable type contracts for common responses/errors, broadcast, and auth | Runtime code | `packages\shared-contracts\src\index.ts` |

### 4) Reused Patterns

| Pattern | Where found | Why it exists |
|---------|-------------|---------------|
| Domain module composition | `apps\server\src\domains\*\*.module.ts` | Keeps backend domains navigable and registered through Nest DI |
| Thin controller to service delegation | Controllers under `apps\server\src\domains\*\presentation\controllers` | Keeps route handlers focused on HTTP shape/guards while services own workflows |
| Guard composition | `JwtAuthGuard`, `AdminGuard`, `TorrentAccessGuard` | Separates authentication, admin authorization, and current downloader authorization |
| Store abstraction | `JsonFileStore`, `MediaStore`, `MetadataApiCacheStore`, domain-specific stores | Encapsulates persistence details outside services/controllers |
| Runtime in-memory stores | `HlsSessionStore`, `MediaScanStore` | Tracks transient HLS sessions and scan state that are not durable records |
| External adapter/client wrappers | `MediaProbeAdapter`, `QbittorrentHttpClient`, subtitle/TMDB/Jikan/IPTorrents/Nyaa services | Centralizes process/API call behavior and error mapping; qBittorrent/IPTorrents/Nyaa belong to the future Downloader Add-on boundary |
| Feature-first frontend routing | `apps\web\src\appRouteCatalog.tsx`, `apps\web\src\features\README.md` | Allows desktop/phone/TV variants per route while sharing app-shell auth |
| Shared fetch wrapper | `apps\web\src\features\shared\services\api-core.ts` | Normalizes API base, auth header, JSON body handling, and API errors |

### 5) Known Architectural Risks

- Production security posture is documented in `docs\adr\0003-use-dev-friendly-and-production-strict-security-defaults.md`; current code still needs production enforcement for non-default JWT secrets and strict CORS.
- Current torrent/download code is built into the app but the target architecture is an optional Downloader Add-on.
- Several core media/player files are near the 400-line budget, so future feature work can quickly cross the guardrail unless refactoring continues.
- Long-running media scan/transcode/torrent flows rely on local process and filesystem behavior; there is no queue service or distributed worker boundary documented in code.

### 6) Evidence

- `README.md`
- `apps\server\src\main.ts`
- `apps\server\src\app.module.ts`
- `apps\server\src\domains\README.md`
- `apps\server\src\domains\auth\auth.module.ts`
- `apps\server\src\domains\media\media.module.ts`
- `apps\server\src\domains\stream\stream.module.ts`
- `apps\server\src\domains\broadcast\broadcast.module.ts`
- `apps\server\src\domains\core\infrastructure\shared\json-file-store.ts`
- `apps\server\src\domains\media\infrastructure\stores\media.store.ts`
- `apps\server\src\domains\auth\infrastructure\jwt.strategy.ts`
- `apps\web\src\main.tsx`
- `apps\web\src\App.tsx`
- `apps\web\src\appRouteCatalog.tsx`
- `apps\web\src\features\README.md`
- `apps\web\src\features\shared\services\api-core.ts`
- `packages\shared-contracts\src\index.ts`
- `CONTEXT.md`
- `docs\adr\0001-keep-downloader-functionality-outside-core-yeen.md`
- `docs\adr\0002-use-sqlite-for-the-media-catalog.md`
- `docs\adr\0003-use-dev-friendly-and-production-strict-security-defaults.md`
