# PROJECT_BRIEF.md — Yeen Media Server

> Last updated: 2026-05-26 | Sprint 0 | Status: Planning

## 1. Project Overview

Yeen is a self-hosted media streaming platform for managing and streaming personal media libraries across desktop, phone, and TV experiences. The platform handles library scanning, metadata enrichment, transcoded/direct playback, subtitles, watch progress, account management, TV pairing, broadcast sharing, and administrative controls. The MVP focuses on features 1-20 from the top 50 feature list: secure authentication, library management, search/filter/sort, media details, reliable playback with HLS/direct streaming, subtitles, progress tracking, episode navigation, and multi-device support.

## 2. Concept / Product Description

Yeen enables households to stream their personal media collection across all devices with a Netflix-like experience. Users authenticate with JWT bearer sessions, browse a scanned media library with posters and metadata, search and filter content, view detailed media pages with cast/synopsis/quality info, and play videos with automatic quality selection (direct play when browser-compatible, HLS transcoding fallback). The player supports subtitle track selection (embedded extraction + external conversion to WebVTT), audio track selection, watch progress sync, and episode autoplay. The platform detects device type (desktop/phone/TV) and adapts the UX accordingly. TV clients pair to existing accounts using a short code. Admins bootstrap the platform on first run, configure media locations, manage accounts through invites, and access system settings. Broadcast sessions allow sharing synchronized playback via tokenized public links.

## 3. Tech Stack

- **Frontend:** React 19 + TypeScript + React Router + Vite + Tailwind + HLS.js + Capacitor (Android/TV)
- **Backend:** NestJS 11 + Express + TypeScript + Passport JWT + bcrypt + better-sqlite3 + FFmpeg/FFprobe
- **Storage:** SQLite (media metadata), JSON files (accounts, progress, settings), filesystem (media files, HLS segments, extracted subtitles)
- **Testing:** Jest + Supertest (server), Vitest (web), ESLint + Stylelint, line-budget guardrail
- **CI/CD:** GitHub Actions (planned), deployment via systemd service on Ubuntu + Cloudflared tunnel
- **Hosting:** Self-hosted on Ubuntu 22.04+ with Node 22 + FFmpeg, single-port architecture (one Nest process serves both API and static frontend)

## 4. Architecture

```
┌─────────────────────────────────────────────────┐
│           React Web UI (Vite + Capacitor)       │
│  Desktop/Phone/TV Experiences                   │
│  ┌──────────────────────────────────────────┐   │
│  │ Library │ Player │ Admin │ Settings     │   │
│  │ Feature folders with pages/components   │   │
│  └──────────────────────────────────────────┘   │
└──────────────┬──────────────────────────────────┘
               │ HTTPS/Bearer JWT
┌──────────────▼──────────────────────────────────┐
│           NestJS Backend API (/api/*)           │
│  ┌──────────────────────────────────────────┐   │
│  │ Auth │ Media │ Stream │ Broadcast │ ...  │   │
│  │ Domain modules with controllers/services│   │
│  └──────────────────────────────────────────┘   │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│      Storage, Filesystem, External Processes    │
│  SQLite (metadata) │ JSON (accounts/progress)   │
│  FFmpeg/FFprobe │ Filesystem (media/HLS/subs)   │
│  Optional: TMDB/Jikan/OpenSubtitles integrations│
└─────────────────────────────────────────────────┘
```

## 5. Key Files Map

| Area | Path | Contents |
|------|------|----------|
| Project root | `.` | Multi-app orchestration scripts, root package.json |
| Domain glossary | `CONTEXT.md` | Ubiquitous language and domain relationships |
| Codebase docs | `docs/codebase/` | ARCHITECTURE.md, STACK.md, STRUCTURE.md, CONVENTIONS.md, etc. |
| Architecture decisions | `docs/adr/` | ADRs for SQLite, security defaults, the Downloader Add-on seam, and scoped playback tokens |
| Server entry | `apps/server/src/main.ts` | Nest bootstrap with CORS, `/api` prefix, static serving |
| Server app module | `apps/server/src/app.module.ts` | Domain module composition, config, ServeStaticModule |
| Backend domains | `apps/server/src/domains/` | Auth, Media, Stream, Broadcast, Add-ons, Lifecycle, and System Settings modules |
| Web entry | `apps/web/src/main.tsx` | React bootstrap |
| Web app shell | `apps/web/src/App.tsx` | Auth bootstrap, experience detection, route rendering |
| Web routes | `apps/web/src/appRouteCatalog.tsx` | Feature routes with desktop/phone/TV variants |
| Web features | `apps/web/src/features/` | Feature folders for library, player, admin, auth, settings, add-on hosting, and other Core Yeen experiences |
| Shared contracts | `packages/shared-contracts/src/` | TypeScript API contracts shared by frontend/backend |
| Sprint docs | `docs/sprint-N/` | Plans, progress, done files |
| Brainstorm docs | `docs/brainstorm/` | Team ideation and concept votes |
| QA sign-offs | `docs/qa/` | QA playthrough results per sprint |

## 6. Team Roles

| Agent | Name | Role |
|-------|------|------|
| Producer | **Remy** | Sprint plans, coordination, merging, GitHub Issue triage |
| Product Designer | **Kira** | UX design, user flows, feature mechanics, accessibility |
| Art/Visual Director | **Milo** | CSS, animations, design system, visual polish |
| Frontend Engineer | **Nova** | React components, hooks, state management, client-side logic |
| Backend Engineer | **Sage** | NestJS controllers/services, API design, auth, database, security |
| DevOps Engineer | **Dash** | CI/CD, GitHub Actions, deployment scripts, infrastructure |
| QA Engineer | **Ivy** | Playtesting, E2E tests, bug filing, sign-off |

## 7. Sprint Status

| Sprint | Name | Status | Scope |
|--------|------|--------|-------|
| 0 | Architecture & Planning | ✅ Done | Bootstrap AI team structure, run brainstorm, create MVP sprint plans |
| 1 | Foundation & Auth | ⬜ Not started | Password reset (#5), RBAC audit (#3), thin home dashboard (#8), production security validation, structured errors |
| 2 | Discovery & Polish | ⬜ Not started | Dashboard polish (#8), search improvements (#10), media details (#12), library grid (#9), backend refactor |
| 3 | Playback Excellence | ⬜ Not started | Episode navigation (#16), playback polish (#13), subtitle errors (#17), HLS robustness (#20), error recovery UX |

## 8. Current State (rewrite every sprint)

**What works:**
- Backend: Account registration/login with JWT, media scan with FFprobe metadata, SQLite metadata store, HLS transcoding pipeline, direct play, embedded subtitle extraction, external subtitle conversion, watch progress sync, admin bootstrap, system settings, TV pairing, broadcast sessions
- Frontend: Netflix-inspired library grid, media details pages, video player with HLS.js fallback, subtitle track selection, desktop/phone/TV experience detection, admin panels, account management
- Build: Multi-app orchestration, Vite web build, Nest server build, Android APK via Capacitor, deployment zip/systemd/Cloudflared templates, line-budget guardrail
- **Sprint 0 complete:** AI team brainstorm complete with 3-sprint MVP plan, detailed task breakdowns, unanimous team approval (6/6)

**What doesn't work yet:**
- Password reset/recovery (blocker for production deployment)
- Home dashboard personalization (Continue Watching, Recently Added, Featured content)
- Episode navigation (Next Episode button, autoplay, season selector)
- Error recovery UX (HLS failures, subtitle extraction errors are silent)
- Production security enforcement (JWT secret validation, CORS validation)
- Line-budget violations in player and media detail files (need refactoring)

**What's next:**
- **Sprint 1 (2 weeks):** Password reset, RBAC audit, thin home dashboard, production security validation, structured errors
- **Sprint 2 (2 weeks):** Dashboard polish, search improvements, media details polish, library grid polish, backend refactor
- **Sprint 3 (2 weeks):** Episode navigation, playback polish, subtitle error handling, HLS robustness, error recovery UX
- **Total timeline:** 6 weeks to complete MVP (features 1-20)

## 9. Security Rules

1. Secrets live in environment variables only — never in code or git
2. JWT bearer authentication required for all non-public API routes (except account bootstrap, public broadcast viewer access, TV pairing code flow)
3. Administrator routes are protected by `AdminGuard`; an installed Downloader Add-on applies Downloader authorization to the routes it contributes
4. Account passwords hashed with bcrypt before storage
5. Production deployments must use non-default `JWT_SECRET` and strict `CORS_ORIGIN` per ADR-0003
6. Public broadcast tokens are scoped to specific media items and sessions per ADR-0004 (planned)
7. TV pairing codes are short-lived and single-use

## 10. How to Run Locally

```bash
# Install root orchestration dependencies
npm install

# Install backend dependencies
npm --prefix apps/server install

# Install frontend dependencies
npm --prefix apps/web install

# Copy environment templates and configure
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
# Edit apps/server/.env with your values (media paths, admin credentials, JWT secret)

# Start both server and web dev servers
npm run dev

# API: http://localhost:4000/api
# Web: http://localhost:5173
```

Optional: Android TV development
```bash
npm run android:configure-sdk
npm run android:sync
npm run android:tv:apk
```

## 11. How to Deploy

**Production build:**
```bash
npm run build:zip
# Creates artifacts/yeen-deploy.zip
```

**Ubuntu deployment via SFTP + systemd:**
1. Upload `artifacts/yeen-deploy.zip` to server `/tmp/`
2. Extract to `/var/www/yeen`
3. Copy `.env.example` to `.env` and configure production values
4. Run `npm install --omit=dev`
5. Install systemd service: `sudo cp deployment/systemd/yeen.service /etc/systemd/system/`
6. Enable and start: `sudo systemctl enable --now yeen`
7. Configure Cloudflared tunnel pointing to `http://localhost:4000`

See `README.md` for complete deployment guide.

## 12. Cross-Chat Handoff Protocol

Every sprint chat must do these before finishing:

1. Write `docs/sprint-N/done.md` — what was built, what's not done, what needs manual setup, files changed/created
2. Update PROJECT_BRIEF.md: Section 7 (mark sprint done) + Section 8 (rewrite current state)
3. Commit all changes with descriptive message: `sprint-N: <summary>`

This is how context survives across chats. If skipped, the next chat starts blind and may overwrite or duplicate work. The repo is the shared memory — keep it accurate.

## 13. Bug & Fix Tracking

Bugs are tracked as GitHub Issues on the repo. Single source of truth for all teams.

**For QA:** File bugs as GitHub Issues with labels (`bug`, `severity:blocker/major/minor`). Include: component, steps to reproduce, expected vs actual. When no blockers found: write `docs/qa/sprint-N-signoff.md` with test count, pass rate, explicit "no blockers" statement.

**For Dev Team:** Check GitHub Issues before starting work. Fix blockers and majors before polish. Use GitHub closing keywords in commits: `fix: description (Fixes #42)`. For reference-only, use `Refs #42`.

**For DevOps:** File infrastructure issues with label `infra`.

**For feature ideas:** add to `docs/ideas-backlog.md`.

## 14. Multi-Repo Setup

Each team works in their own separate clone of the repo. No worktrees. Everyone works on their own branch, pushes to origin, creates PRs.

**Teams:**
- Producer on `main` (coordination hub)
- Dev Team on `feature/sprint-N`
- QA on `feature/qa-N`
- DevOps on `feature/devops-N` (only when needed)

**Setup:**
```bash
git clone https://github.com/Realynx/Yeen.git <folder-name>
cd <folder-name>
git checkout -b <branch-name>
npm install
npm --prefix apps/server install
npm --prefix apps/web install
```

**Branch strategy:** Feature branches → PR → regular merge to main. Never push directly to main. Never squash. Never rebase feature branches (causes commit loss).

**Dev team workflow:**
```bash
cd yeen-dev
git pull origin main
git checkout -b feature/sprint-N
# ... work, commit, test ...
git push origin feature/sprint-N
# Create PR on GitHub
```

**QA team workflow:**
```bash
cd yeen-qa
git pull origin main
# Test merged features
# File bugs as GitHub Issues
# Write docs/qa/sprint-N-signoff.md when done
```

**Producer workflow:**
- Review PRs on GitHub
- Merge feature branches to main (regular merge, never squash/rebase)
- Update PROJECT_BRIEF.md after merges
- Triage GitHub Issues and assign to sprints
