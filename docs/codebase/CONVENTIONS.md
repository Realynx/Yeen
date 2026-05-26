# Coding Conventions

## Core Sections (Required)

### 1) Naming Rules

| Item | Rule | Example | Evidence |
|------|------|---------|----------|
| Backend files | Domain-first files use lowercase/kebab-style domain names and descriptive service/controller suffixes | `auth.module.ts`, `media.controller.ts`, `media-scan-execution.service.ts` | `apps\server\src\domains\README.md`, `apps\server\src\domains\media\media.module.ts` |
| Frontend feature folders | Top-level feature folders use kebab-case | `media-details`, `media-management` | `apps\web\src\features\README.md` |
| Frontend layer folders | Layer folders use lowercase | `components`, `pages`, `services` | `apps\web\src\features\README.md` |
| React components/pages | PascalCase filenames and component names | `MediaDetailsPage.tsx`, `SystemSettingsTab.tsx` | `apps\web\src\features\README.md`, `apps\web\src\appRouteCatalog.tsx` |
| Hooks/non-component modules | camelCase filenames | `useMediaDetailsData.ts`, `filenameParse.ts`, `api-core.ts` | `apps\web\src\features\README.md`, `apps\web\src\features\shared\services\api-core.ts` |
| Functions/methods | camelCase in TypeScript | `bootstrap`, `handleAuthenticated`, `getSettings`, `probeFile` | `apps\server\src\main.ts`, `apps\web\src\App.tsx`, `apps\server\src\domains\system-settings\application\services\system-settings.service.ts` |
| Types/interfaces/classes | PascalCase | `AppModule`, `SystemSettingsService`, `ApiError`, `ExperienceRouteDefinition` | `apps\server\src\app.module.ts`, `apps\server\src\domains\system-settings\application\services\system-settings.service.ts`, `apps\web\src\features\shared\services\api-core.ts`, `apps\web\src\appRouteCatalog.tsx` |
| Constants/env vars | Env vars use uppercase snake case; module constants use uppercase or PascalCase depending on scope | `JWT_SECRET`, `VITE_API_BASE_URL`, `DEFAULT_API_BASE`, `TOKEN_STORAGE_KEY` | `apps\server\.env.example`, `apps\web\.env.example`, `apps\web\src\features\shared\services\api-core.ts` |

### 2) Formatting and Linting

- Formatter: server uses Prettier via `npm --prefix apps/server run format` and `eslint-plugin-prettier`; `.prettierrc` exists under `apps\server`.
- Linter: root `npm run lint` delegates to server and web lint scripts.
- Server linting: `eslint "{src,apps,libs,test}/**/*.ts" --fix`, TypeScript ESLint recommended type-checked config, Prettier plugin, Node/Jest globals.
- Web linting: `eslint .` plus `stylelint "src/**/*.css"` check; ESLint includes JS recommended, TypeScript recommended, React hooks, and Vite React Refresh rules.
- CSS linting: Stylelint ignores Tailwind at-rules and enforces common invalid/empty/duplicate checks.
- Most relevant enforced rules: server `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-unsafe-argument` warn, server Prettier is an error, web React hooks rules are enabled, web CSS unknown/empty/duplicate checks are enabled.
- Run commands: `npm run lint`, `npm --prefix apps/server run format`, `npm --prefix apps/web run lint:css`, `npm --prefix apps\web run lint:css:check`.

### 3) Import and Module Conventions

- Backend imports should be anchored from current `domains\*` paths; compatibility shim files have been removed.
- Backend domain layout follows `domains\<domain>\<domain>.module.ts`, `application\services`, `application\dto`, `application\types`, `domain\entities`, `presentation\controllers`, `presentation\guards`, `presentation\decorators`, and `infrastructure\*`.
- Frontend imports should point directly to the implementation path where code lives, avoid compatibility shim paths, and avoid wide barrel exports across features.
- Frontend uses relative imports; `apps\web\tsconfig.app.json` has bundler module resolution but no path alias mapping.
- Shared contracts are exported from `packages\shared-contracts\src\index.ts`, and server/web reference the package through local `file:` dependencies.

### 4) Error and Logging Conventions

- Server validation uses a global Nest `ValidationPipe` with `whitelist`, `transform`, and `forbidNonWhitelisted`.
- Server authentication errors use Nest exceptions such as `UnauthorizedException`; qBittorrent integration maps failures to `BadGatewayException` or `GatewayTimeoutException`; OpenSubtitles failures map to `BadRequestException`.
- Web API wrapper throws `ApiError` with HTTP status and attempts to extract a JSON `message` from failed responses.
- Logging uses Nest `Logger` in backend integration/runtime code such as media probing, qBittorrent, and media stores.
- Sensitive-data redaction rules: [TODO] no explicit project-wide redaction policy was found in inspected configs/docs.

### 5) Testing Conventions

- Server unit/integration specs are TypeScript files matching `(src|test)/.*\.spec\.ts` through Jest config in `apps\server\package.json`.
- Server e2e specs match `.e2e-spec.ts` through `apps\server\test\jest-e2e.json`.
- Web specs match `src/**/*.spec.ts` through `apps\web\vitest.config.ts`.
- Mocking norms: server tests use Jest mocks/spies; web tests use Vitest `vi` mocks/spies.
- Coverage expectation: server has `test:cov` and collects `src/**/*.(t|j)s`; no coverage thresholds were found. Web coverage config was not found. [TODO]

### 6) Evidence

- `apps\server\src\domains\README.md`
- `apps\web\src\features\README.md`
- `apps\server\eslint.config.mjs`
- `apps\web\eslint.config.js`
- `apps\web\.stylelintrc.json`
- `apps\server\package.json`
- `apps\web\package.json`
- `apps\server\tsconfig.json`
- `apps\web\tsconfig.app.json`
- `packages\shared-contracts\tsconfig.json`
- `apps\server\src\main.ts`
- `apps\web\src\features\shared\services\api-core.ts`
- `apps\server\src\domains\torrent\infrastructure\clients\qbittorrent-http.client.ts`
- `apps\server\src\domains\subtitle\application\services\subtitle-lookup.service.ts`
- `apps\server\test\jest-e2e.json`
- `apps\web\vitest.config.ts`
