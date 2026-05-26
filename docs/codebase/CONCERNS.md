# Codebase Concerns

## Core Sections (Required)

### 1) Top Risks (Prioritized)

| Severity | Concern | Evidence | Impact | Suggested action |
|----------|---------|----------|--------|------------------|
| high | JWT secret falls back to `dev-change-this` when `JWT_SECRET` is unset | `apps\server\src\domains\auth\auth.module.ts`, `apps\server\src\domains\auth\infrastructure\jwt.strategy.ts` | Accidental weak production auth if env is missing | Fail startup in production when `JWT_SECRET` is absent or still default |
| high | CORS allows all origins when `CORS_ORIGIN` is empty | `apps\server\src\main.ts`, `apps\server\.env.example` | Broader browser access than intended when API is exposed cross-origin | Make production CORS strict or require explicit production origins |
| medium | JWTs are accepted in URL query string for streaming/subtitle/public media flows | `apps\server\src\domains\auth\infrastructure\jwt.strategy.ts`, `apps\web\src\features\shared\services\api-core.ts`, stream/subtitle controllers | Tokens can leak through browser history, logs, proxies, or referrers | Keep only where required for media element URLs, shorten TTL or move to scoped stream tokens |
| medium | Frontend stores bearer token in `localStorage` | `apps\web\src\App.tsx`, `apps\web\src\features\shared\services\api-core.ts` | XSS would expose long-lived access token | Consider httpOnly cookies or short-lived access tokens with scoped refresh |
| medium | No CI/CD pipeline detected | `.github\workflows` glob result, `docs\codebase\.codebase-scan.txt` | Builds/tests/lint may not run automatically before merge/deploy | Add GitHub Actions for install, lint, build, server tests, web tests, and line-budget hard mode; keep Android APK validation local/manual |
| medium | Current torrent/download implementation is built into core code despite the accepted Downloader Add-on boundary | `docs\adr\0001-keep-downloader-functionality-outside-core-yeen.md`, `apps\server\src\domains\torrent`, `apps\server\src\domains\media\application\services\torrent-search` | Open-source core may expose or depend on downloader functionality by default | Extract torrent/download code into optional Downloader Add-on later |
| medium | Several media/player/torrent files are just below the 400-line budget | terminal output from `node .\scripts\check-line-budget.mjs --json` | Small feature additions may create oversized mixed-responsibility files | Continue one-file-at-a-time decomposition before adding major behavior |

### 2) Technical Debt

| Debt item | Why it exists | Where | Risk if ignored | Suggested fix |
|-----------|---------------|-------|-----------------|---------------|
| Backend README is generic starter text | `apps\server\README.md` still describes starter repo, not Yeen backend | `apps\server\README.md` | Backend onboarding docs are misleading | Replace with Yeen-specific backend overview or link to `docs\codebase` |
| SQLite migrations are idempotent/additive only for now | `MediaStore.ensureSchema` creates/updates schema directly | `apps\server\src\domains\media\infrastructure\stores\media.store.ts`, `docs\adr\0002-use-sqlite-for-the-media-catalog.md` | Non-additive future migrations will need stronger ordering/versioning | Add a versioned migration table when destructive or data-transforming migrations appear |

### 3) Security Concerns

| Risk | OWASP category (if applicable) | Evidence | Current mitigation | Gap |
|------|--------------------------------|----------|--------------------|-----|
| Default JWT secret fallback | A02 Cryptographic Failures / A07 Identification and Authentication Failures | `apps\server\src\domains\auth\auth.module.ts`, `apps\server\src\domains\auth\infrastructure\jwt.strategy.ts`, `docs\adr\0003-use-dev-friendly-and-production-strict-security-defaults.md` | `.env.example` includes `JWT_SECRET=change-me-for-production` | Runtime does not yet force a non-default production secret |
| Permissive CORS when unset | A05 Security Misconfiguration | `apps\server\src\main.ts`, `apps\server\.env.example`, `docs\adr\0003-use-dev-friendly-and-production-strict-security-defaults.md` | Configured origins are supported via `CORS_ORIGIN` | Empty production value still permits all origins until production-strict enforcement is added |
| Full JWT in media URL query string | A01 Broken Access Control / A02 Cryptographic Failures | `apps\server\src\domains\auth\infrastructure\jwt.strategy.ts`, `apps\web\src\features\shared\services\api-core.ts`, `docs\adr\0004-move-media-urls-toward-scoped-playback-tokens.md` | Enables media element access where headers are difficult | Long-term target is scoped, short-lived playback tokens |
| Token in localStorage | A05 Security Misconfiguration | `apps\web\src\App.tsx`, `apps\web\src\features\shared\services\api-core.ts`, `docs\adr\0004-move-media-urls-toward-scoped-playback-tokens.md` | Token is cleared on failed bootstrap/logout | Accepted for MVP, but stronger browser storage can be revisited later |
| Secrets lifecycle unknown | N/A | `apps\server\.env.example`, `deployment\systemd\yeen.service` | Environment file support exists | No documented rotation, redaction, or secret manager policy [TODO] |

### 4) Performance and Scaling Concerns

| Concern | Evidence | Current symptom | Scaling risk | Suggested improvement |
|---------|----------|-----------------|-------------|-----------------------|
| Media list/filter paths load all rows in memory | `apps\server\src\domains\media\infrastructure\stores\media.store.ts`, `apps\server\src\domains\media\application\services\media-service-list.helper.ts` | No reported runtime symptom in docs | Large libraries can make list/filter/search expensive | Push filtering/pagination/search into SQLite queries |
| Scan preloads existing media and recursively walks directories | `apps\server\src\domains\media\application\services\media-scan-execution.service.ts`, `apps\server\src\domains\media\application\services\scanner\media-scanner.service.ts` | No reported runtime symptom in docs | Large libraries or slow disks can make scans long-running and process-local | Add incremental scan strategy, concurrency controls, and resumable job state if needed |
| HLS sessions and scan progress are in-memory | `apps\server\src\domains\stream\infrastructure\stores\hls-session.store.ts`, `apps\server\src\domains\media\infrastructure\stores\media-scan.store.ts` | State resets on process restart | Multi-instance deployments or restarts lose runtime state | Persist or externalize runtime state if scaling past one process |
| FFmpeg/FFprobe are local child processes | `apps\server\src\domains\media\infrastructure\media-probe.adapter.ts`, `apps\server\src\domains\stream\application\services\hls\hls-segment-transcoder.service.ts` | No reported runtime symptom in docs | CPU/IO saturation on busy servers | Add queueing/resource limits/telemetry per host profile |
| No performance testing configs detected | `docs\codebase\.codebase-scan.txt` | No baseline throughput/latency signal | Regressions may be hard to catch | Add targeted scan/playback/load benchmarks |

### 5) Fragile/High-Churn Areas

| Area | Why fragile | Churn signal | Safe change strategy |
|------|-------------|-------------|----------------------|
| `apps\web\src\App.tsx` | App shell owns auth bootstrap, route handling, broadcast provider, TV install/pairing decisions | 10 commits in last 90 days | Change with route/auth smoke tests and consider extracting app-shell concerns |
| `apps\web\src\features\player\services\usePlayerData.ts` | Player data orchestration intersects direct play, HLS, progress, subtitles, and preferences | 8 commits; 397 lines in line-budget output | Add focused tests before changing and split by playback-plan responsibilities |
| `apps\server\src\domains\auth\application\services\auth.service.ts` | Auth, default admin seeding, JWT response behavior, account workflows | 7 commits; 350 lines | Keep auth/security changes small and test login/register/admin flows |
| `apps\web\src\features\player\components\PlayerVideoPanel.tsx` | Central playback UI surface | 7 commits; 358 lines | Isolate UI state changes and test desktop/phone/TV behavior |
| `apps\server\src\domains\media\application\services\media.service.ts` | Media orchestration hub | 7 commits; 396 lines | Continue decomposition into focused media services |
| `apps\server\src\domains\stream\application\services\stream.service.ts` | Direct streaming and HLS coordination | 6 commits; 399 lines | Split range/direct/HLS orchestration before large additions |

### 6) Resolved Grill Decisions

1. README now documents SQLite media metadata and line-budget test inclusion behavior.
2. Stale `.line-budget-allowlist.json` entries were removed.
3. Desktop, Phone, and TV are first-class Client Experiences.
4. Broadcast is its own Core Yeen feature boundary.
5. Stale temporary Playwright artifacts were removed; Playwright is not currently configured.
6. Cloudflared is an optional deployment recipe, not a Core Yeen requirement.
7. Core Yeen excludes torrent/download tooling by default; that code belongs to a future optional Downloader Add-on.

### 7) Evidence

- `README.md`
- `apps\server\README.md`
- `apps\server\src\domains\README.md`
- `apps\web\src\features\README.md`
- `.line-budget-allowlist.json`
- `scripts\check-line-budget.mjs`
- `apps\server\src\main.ts`
- `apps\server\src\domains\auth\auth.module.ts`
- `apps\server\src\domains\auth\infrastructure\jwt.strategy.ts`
- `apps\server\src\domains\media\infrastructure\stores\media.store.ts`
- `apps\server\src\domains\media\application\services\scanner\media-scanner.service.ts`
- `apps\server\src\domains\stream\infrastructure\stores\hls-session.store.ts`
- `apps\web\src\App.tsx`
- `apps\web\src\features\shared\services\api-core.ts`
- `docs\codebase\.codebase-scan.txt`
- terminal output from `node .\scripts\check-line-budget.mjs --json`
- `CONTEXT.md`
- `docs\adr\0001-keep-downloader-functionality-outside-core-yeen.md`
- `docs\adr\0002-use-sqlite-for-the-media-catalog.md`
- `docs\adr\0003-use-dev-friendly-and-production-strict-security-defaults.md`
- `docs\adr\0004-move-media-urls-toward-scoped-playback-tokens.md`
