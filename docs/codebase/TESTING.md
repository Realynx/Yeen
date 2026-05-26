# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- Primary test frameworks: Jest 30 for server unit/e2e tests; Vitest 4 for web tests.
- Assertion/mocking tools: Jest `expect`, `jest.fn`, `jest.spyOn`, `jest.restoreAllMocks`; Vitest `expect` and `vi`.
- Commands:

```bash
npm --prefix apps/server run test
npm --prefix apps/server run test:e2e
npm --prefix apps/server run test:cov
npm --prefix apps/web run test
npm run lint
npm run line-budget
npm run line-budget:hard
```

- Root `package.json` has no root `test` script; server and web tests are run separately.

### 2) Test Layout

- Server unit/integration test placement pattern: `apps\server\src\**\*.spec.ts` and `apps\server\test\*.spec.ts` through Jest `testRegex`.
- Server e2e placement pattern: `apps\server\test\*.e2e-spec.ts`.
- Web test placement pattern: `apps\web\src\**\*.spec.ts`.
- Naming convention: `.spec.ts` for server/web unit-style specs; `.e2e-spec.ts` for Nest e2e specs.
- Setup files: no `setupTests`, `jest.setup`, or `vitest.setup` file was found in the inspected configs. [TODO]
- Stale temporary Playwright artifacts were removed during the grill-with-docs session; Playwright is not currently a configured project test tool.

### 3) Test Scope Matrix

| Scope | Covered? | Typical target | Notes |
|-------|----------|----------------|-------|
| Unit | Yes | Backend services/helpers and web service utilities | Server uses Jest; web uses Vitest |
| Integration | Partial | Nest controllers with mocked providers/guards/services | Examples under `apps\server\test` |
| E2E | Partial | Nest app health/broadcast flows | `apps\server\test\jest-e2e.json` and `.e2e-spec.ts` files exist |
| Browser E2E | No | [TODO] | Playwright is not currently configured as a project test tool |
| Performance/load | No detected config | [TODO] | Scan reported no performance testing configs |

### 4) Mocking and Isolation Strategy

- Server mocking approach: Jest functions/spies and Nest testing modules; e2e/integration specs can override or provide mock services/guards.
- Web mocking approach: Vitest `vi` functions/spies.
- Isolation guarantees: Jest/Vitest examples reset mocks with `jest.restoreAllMocks` or `vi.restoreAllMocks`; no global setup/teardown convention was found. [TODO]
- Common failure mode in tests: [TODO] no flaky test catalog or documented common failure mode was found.

### 5) Coverage and Quality Signals

- Coverage tool + threshold: server Jest coverage command exists and collects from `src/**/*.(t|j)s`; no coverage threshold was found.
- Web coverage: no Vitest coverage config was found. [TODO]
- Current reported coverage: [TODO] no current coverage report was generated during this documentation scan.
- Known gaps/flaky areas:
  - No CI workflow files were detected under `.github\workflows`.
  - Accepted target: default CI should run install, lint, build, server tests, web tests, and line-budget hard mode; Android APK validation stays local through Android Studio/manual workflow.
  - No performance testing config was detected.
  - Root scripts include `build`, `lint`, and line-budget checks, but no root test aggregator.

### 6) Evidence

- `apps\server\package.json`
- `apps\server\test\jest-e2e.json`
- `apps\server\test\app.e2e-spec.ts`
- `apps\server\test\broadcast.e2e-spec.ts`
- `apps\server\src\domains\broadcast\application\services\broadcast.service.spec.ts`
- `apps\web\package.json`
- `apps\web\vitest.config.ts`
- `apps\web\src\features\broadcast\services\publicBroadcastPlaybackSync.spec.ts`
- `package.json`
- `docs\codebase\.codebase-scan.txt`
- user decision during grill-with-docs session on default CI and Android validation
