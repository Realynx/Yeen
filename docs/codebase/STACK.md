# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area | Value | Evidence |
|------|-------|----------|
| Primary language | TypeScript, with small JavaScript tooling scripts | `apps\server\package.json`, `apps\web\package.json`, `packages\shared-contracts\package.json`, `scripts\check-line-budget.mjs` |
| Runtime + version | Node.js; local scan command ran on `v22.13.1`, README requires Node 22+; no committed `engines` field was found | `README.md`, terminal output from `node -v`, package manifests |
| Package manager | npm with separate lockfiles and `npm --prefix` orchestration | `package.json`, `package-lock.json`, `apps\server\package-lock.json`, `apps\web\package-lock.json` |
| Module/build system | Nest CLI for server, Vite + TypeScript build mode for web, TypeScript source exports for shared contracts | `apps\server\package.json`, `apps\server\tsconfig.json`, `apps\web\package.json`, `apps\web\vite.config.ts`, `packages\shared-contracts\package.json` |

### 2) Production Frameworks and Dependencies

| Dependency | Version | Role in system | Evidence |
|------------|---------|----------------|----------|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` | `^11.0.1` | Backend HTTP/API framework on Express | `apps\server\package.json` |
| `@nestjs/config` | `^4.0.2` | Environment-backed server configuration | `apps\server\package.json`, `apps\server\src\app.module.ts` |
| `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt` | `^11.0.1`, `^11.0.5`, `^4.0.1` | JWT bearer authentication | `apps\server\package.json`, `apps\server\src\domains\auth\auth.module.ts`, `apps\server\src\domains\auth\infrastructure\jwt.strategy.ts` |
| `@nestjs/serve-static` | `^5.0.5` | Serves built React assets from the Nest process in production | `apps\server\package.json`, `apps\server\src\app.module.ts` |
| `better-sqlite3` | `^12.10.0` | Media metadata SQLite store | `apps\server\package.json`, `apps\server\src\domains\media\infrastructure\stores\media.store.ts` |
| `bcrypt` | `^6.0.0` | Account password hashing and verification | `apps\server\package.json`, `apps\server\src\domains\auth\application\services\auth.service.ts` |
| `react`, `react-dom` | `^19.2.6` | Web UI runtime | `apps\web\package.json`, `apps\web\src\main.tsx` |
| `react-router-dom` | `^6.30.1` | Client-side routes and redirects | `apps\web\package.json`, `apps\web\src\App.tsx`, `apps\web\src\appRouteCatalog.tsx` |
| `hls.js` | `^1.6.14` | Browser HLS playback fallback | `apps\web\package.json`, `apps\web\src\features\player` |
| `@capacitor/core`, `@capacitor/android` | `^8.3.4` | Android/TV native wrapper | `apps\web\package.json`, `apps\web\capacitor.config.json` |
| `@yeen/shared-contracts` | local `file:../../packages/shared-contracts` | Shared API/domain TypeScript contracts | `apps\server\package.json`, `apps\web\package.json`, `packages\shared-contracts\src\index.ts` |

### 3) Development Toolchain

| Tool | Purpose | Evidence |
|------|---------|----------|
| Nest CLI | Server build and dev server | `apps\server\package.json`, `apps\server\nest-cli.json` |
| TypeScript | Type-check/build for server, web, shared contracts | `apps\server\tsconfig.json`, `apps\web\tsconfig.app.json`, `packages\shared-contracts\tsconfig.json` |
| Vite | Web dev server and production bundle | `apps\web\package.json`, `apps\web\vite.config.ts` |
| ESLint | Server and web linting | `package.json`, `apps\server\eslint.config.mjs`, `apps\web\eslint.config.js` |
| Prettier | Server formatting via ESLint plugin and `format` script | `apps\server\package.json`, `apps\server\eslint.config.mjs`, `apps\server\.prettierrc` |
| Jest + ts-jest + Supertest | Server unit/e2e tests | `apps\server\package.json`, `apps\server\test\jest-e2e.json` |
| Vitest | Web unit tests | `apps\web\package.json`, `apps\web\vitest.config.ts` |
| Stylelint | Web CSS linting | `apps\web\package.json`, `apps\web\.stylelintrc.json` |
| Tailwind/PostCSS | CSS utility pipeline support | `apps\web\tailwind.config.cjs`, `apps\web\postcss.config.cjs` |
| Capacitor CLI + Gradle | Android APK sync/build/open flows | `apps\web\package.json`, `apps\web\android\gradlew.bat`, `apps\web\capacitor.config.json` |
| Custom Node scripts | deployment packaging, Add-on Package signing/verification, Core-only verification, Android local properties, and line-budget checks | `scripts\prepare-deploy.mjs`, `scripts\addons`, `scripts\verify-core-without-downloader.mjs`, `scripts\check-line-budget.mjs`, `scripts\configure-android-local-properties.mjs` |

### 4) Key Commands

```bash
npm install
npm --prefix apps/server install
npm --prefix apps/web install
npm run dev
npm run build
npm run lint
npm --prefix apps/server run test
npm --prefix apps/server run test:e2e
npm --prefix apps/web run test
npm run line-budget
npm run addon:test
npm run verify:core-only
npm run build:zip
npm run android:build:debug
```

### 5) Environment and Config

- Config sources: `apps\server\.env.example`, `apps\web\.env.example`, `apps\web\.env.production`, runtime system settings persisted by `apps\server\src\domains\system-settings`.
- Server env vars shown in examples: `PORT`, `CORS_ORIGIN`, `JWT_SECRET`, `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_NAME`, `DEFAULT_ADMIN_PASSWORD`, `MEDIA_LIBRARY_PATH`, `MEDIA_LIBRARY_PATHS`, `FFMPEG_PATH`, `FFPROBE_PATH`, `OPENSUBTITLES_API_KEY`, `TRANSCODE_PRESET`, `TRANSCODE_CRF`, `HLS_SEGMENT_SECONDS`, `SUBTITLE_DEFAULT_LANGUAGE`, `TV_APK_FILE_PATH`.
- Additional server env vars read by Core Yeen: `MEDIA_METADATA_SQLITE_PATH`, `AI_METADATA_ENABLED`, `AI_PROVIDER`, `AI_MODEL`, `AI_OLLAMA_BASE_URL`, `AI_OPENAI_API_KEY`, `AI_DEDUPLICATION_ENABLED`, `AI_REQUEST_TIMEOUT_MS`, `TMDB_API_KEY`, `YEEN_ADDONS_ROOT`, `YEEN_ADDON_TRUSTED_KEYS`, and `YEEN_SUPERVISED_RESTART`. Downloader credentials belong to the Downloader Add-on rather than Core Yeen configuration.
- Web env vars shown in examples: `VITE_API_BASE_URL`, `VITE_TV_APK_DOWNLOAD_URL`.
- Deployment/runtime constraints: production expects Node 22+, FFmpeg and FFprobe on `PATH`, one Nest process can serve both `/api/*` and built web assets, and the included systemd/cloudflared templates target `http://localhost:4000`.

### 6) Evidence

- `README.md`
- `package.json`
- `apps\server\package.json`
- `apps\web\package.json`
- `packages\shared-contracts\package.json`
- `apps\server\.env.example`
- `apps\web\.env.example`
- `apps\web\.env.production`
- `apps\server\src\main.ts`
- `apps\server\src\app.module.ts`
- `apps\server\src\domains\system-settings\application\services\system-settings.service.ts`
- `apps\web\vite.config.ts`
- `apps\web\capacitor.config.json`
- `deployment\systemd\yeen.service`
- `deployment\cloudflared\config.yml`
