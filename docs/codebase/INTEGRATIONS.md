# External Integrations

## Core Sections (Required)

### 1) Integration Inventory

| System | Type (API/DB/Queue/etc) | Purpose | Auth model | Criticality | Evidence |
|--------|---------------------------|---------|------------|-------------|----------|
| Local filesystem media library | Filesystem | Scans, streams, renames/copies/deletes media and related metadata/assets | OS filesystem permissions | High | `apps\server\.env.example`, `apps\server\src\domains\media\application\services\scanner\media-scanner.service.ts`, `apps\server\src\domains\media\application\services\filesystem\media-fs-file-ops.service.ts` |
| FFprobe | External process | Extracts stream/container/chapter metadata from media files | Executable path from settings/env | High | `apps\server\.env.example`, `apps\server\src\domains\media\infrastructure\media-probe.adapter.ts`, `apps\server\src\domains\system-settings\application\services\system-settings.service.ts` |
| FFmpeg | External process | HLS transcoding, subtitle extraction/conversion, previews | Executable path from settings/env | High | `apps\server\.env.example`, `apps\server\src\domains\stream\application\services\hls\hls-segment-transcoder.service.ts`, `apps\server\src\domains\subtitle\application\services\subtitle-command.service.ts` |
| OpenSubtitles | External API | Subtitle search by title/language | API key header from `OPENSUBTITLES_API_KEY`/settings | Medium | `apps\server\.env.example`, `apps\server\src\domains\subtitle\application\services\subtitle-lookup.service.ts`, `apps\server\src\domains\system-settings\application\services\system-settings.service.ts` |
| TMDB | External API | Movie/TV metadata and image lookup | API key from `TMDB_API_KEY`/settings | Medium | `apps\server\src\domains\media\application\services\remote-metadata\tmdb-metadata.service.ts`, `apps\server\src\domains\media\application\services\remote-metadata\tmdb-remote-search.helper.ts`, `apps\server\src\domains\system-settings\application\services\system-settings.service.ts` |
| TheAudioDB | External API | Remote Track metadata, artwork, search, charts, and trending discovery | Documented default free key or Administrator-configured premium key | Medium/optional | `apps\server\src\domains\media\application\services\remote-music`, `docs\adr\0005-separate-remote-music-discovery-from-acquisition.md` |
| Jikan | External API | Anime metadata lookup | Public HTTP API; code includes rate/cooldown behavior | Medium | `apps\server\src\domains\media\application\services\remote-metadata\jikan-metadata.service.ts` |
| Downloader integrations | External systems owned by the optional Downloader Add-on | Torrent and music acquisition search, intake, progress, and control when the private Add-on Package is installed | Defined and stored by the Downloader Add-on; music sources may include yt-dlp and Spotify client credentials for metadata matching | Absent from Core Yeen; add-on-defined when enabled | `docs\adr\0001-keep-downloader-functionality-outside-core-yeen.md`, `docs\adr\0005-separate-remote-music-discovery-from-acquisition.md`, `packages\addon-sdk`, `scripts\addons\README.md` |
| Ollama | External/local API | AI metadata title/provider calls | Base URL/model settings; no secret by default | Low/optional | `apps\server\src\domains\system-settings\application\services\system-settings.service.ts`, `apps\server\src\domains\media\application\services\ai-metadata\media-ai-title-provider.service.ts` |
| OpenAI chat completions | External API | AI metadata provider option | API key from `AI_OPENAI_API_KEY` | Low/optional | `apps\server\src\domains\system-settings\application\services\system-settings.service.ts`, `apps\server\src\domains\media\application\services\ai-metadata\media-ai-title-provider.service.ts` |
| Browser Fetch API | Web/client API transport | Frontend talks to backend API | Bearer token from `localStorage` | High | `apps\web\src\features\shared\services\api-core.ts` |
| Capacitor Android/Gradle | Native build tooling | Android/Google TV wrapper and APK build/install | Local Android SDK/tooling | Medium | `apps\web\package.json`, `apps\web\capacitor.config.json`, `apps\web\android\app\src\main\AndroidManifest.xml` |
| systemd | Process manager | Linux production service | OS service user/env file | Medium | `deployment\systemd\yeen.service`, `README.md` |
| Cloudflared | Optional deployment recipe | Example tunnel/proxy for exposing the single local Nest origin | Tunnel credentials file | Medium | `deployment\cloudflared\config.yml`, `README.md` |

### 2) Data Stores

| Store | Role | Access layer | Key risk | Evidence |
|-------|------|--------------|----------|----------|
| JSON files under `data\` | Accounts, invites, TV pairings, settings, progress, locations, add-on registry/trust policy, and Broadcast Sessions | `JsonFileStore` subclasses and the add-on registry | Single-process file persistence and no documented migration/backup strategy | `apps\server\src\domains\core\infrastructure\shared\json-file-store.ts`, `apps\server\src\domains\addons`, domain store files |
| SQLite `data\media-metadata.sqlite` by default | Media Catalog and metadata API cache | `MediaStore`, `MetadataApiCacheStore` with WAL | Use idempotent schema evolution until non-additive migrations require a versioned migration table | `apps\server\src\domains\system-settings\application\services\system-settings.service.ts`, `apps\server\src\domains\media\infrastructure\stores\media.store.ts`, `apps\server\src\domains\media\infrastructure\stores\metadata-api-cache.store.ts`, `docs\adr\0002-use-sqlite-for-the-media-catalog.md` |
| In-memory HLS sessions | Runtime HLS session map | `HlsSessionStore` | Sessions do not survive process restart | `apps\server\src\domains\stream\infrastructure\stores\hls-session.store.ts` |
| In-memory scan state | Runtime media scan progress | `MediaScanStore` | Scan progress is process-local | `apps\server\src\domains\media\infrastructure\stores\media-scan.store.ts` |
| Built web assets | Production static frontend | `ServeStaticModule` from server | Requires `apps\web\dist` to exist in deploy package | `apps\server\src\app.module.ts`, `scripts\prepare-deploy.mjs` |

### 3) Secrets and Credentials Handling

- Credential sources: `.env`/environment variables read by Nest `ConfigService`, persisted administrator-updatable system settings, web Vite env files, systemd environment files, and add-on-owned settings for installed add-ons.
- Hardcoding checks: server `.env.example` contains placeholder values; code falls back to JWT secret `dev-change-this` if `JWT_SECRET` is unset, which conflicts with the accepted production-strict ADR until enforcement is added.
- Frontend stores bearer token in `localStorage` under `yeen_access_token`.
- Rotation or lifecycle notes: [TODO] no key rotation policy was found.
- Add-on publisher trust is configured with `YEEN_ADDON_TRUSTED_KEYS`. Signed packages are required by default; enabling unsigned packages requires an explicit administrator trust setting and warning acknowledgement.
- Cloudflared tunnel ID, hostname, and credentials path are template placeholders because Cloudflared is an optional deployment recipe, not a Core Yeen requirement.

### 4) Reliability and Failure Behavior

- Retry/backoff behavior:
  - FFprobe retries recoverable probe failures with a head-only interval fallback.
  - TMDB/Jikan search services include timeout/cooldown behavior per inspected service references.
  - OpenSubtitles lookup has no explicit timeout/retry in inspected code. [TODO]
- Timeout policy:
  - HLS FFmpeg segment transcode kills timed-out child processes.
  - AI request timeout is configurable through system settings.
- Circuit-breaker or fallback behavior:
  - No generic circuit breaker framework was found. [TODO]
  - Some integrations degrade by returning disabled/empty states when settings such as OpenSubtitles API key are absent.

### 5) Observability for Integrations

- Logging around external calls: Nest `Logger` appears in media probing fallback, media store database selection, TMDB/Jikan failures, scan skips, add-on package quarantine, and other domain services.
- Metrics/tracing coverage: no Sentry, Datadog, Prometheus, OpenTelemetry, or similar monitoring config was found. [TODO]
- Missing visibility gaps: integration latency/error rates, FFmpeg job metrics, Media Scan metrics, add-on runtime health, and cache hit rates are not documented as metrics.

### 6) Evidence

- `apps\server\.env.example`
- `apps\web\.env.example`
- `apps\web\.env.production`
- `apps\server\src\app.module.ts`
- `apps\server\src\main.ts`
- `apps\server\src\domains\core\infrastructure\shared\json-file-store.ts`
- `apps\server\src\domains\system-settings\application\services\system-settings.service.ts`
- `apps\server\src\domains\media\infrastructure\stores\media.store.ts`
- `apps\server\src\domains\media\infrastructure\media-probe.adapter.ts`
- `apps\server\src\domains\stream\application\services\hls\hls-segment-transcoder.service.ts`
- `apps\server\src\domains\subtitle\application\services\subtitle-lookup.service.ts`
- `apps\server\src\domains\addons`
- `packages\addon-sdk`
- `scripts\addons\README.md`
- `apps\web\src\features\shared\services\api-core.ts`
- `apps\web\capacitor.config.json`
- `deployment\systemd\yeen.service`
- `deployment\cloudflared\config.yml`
- `docs\adr\0001-keep-downloader-functionality-outside-core-yeen.md`
- `docs\adr\0002-use-sqlite-for-the-media-catalog.md`
- `docs\adr\0003-use-dev-friendly-and-production-strict-security-defaults.md`
