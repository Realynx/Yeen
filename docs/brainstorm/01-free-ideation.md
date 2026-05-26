# Phase 1: Free Ideation — Raw Pitches

Each agent pitches their perspective on which features 1-20 need the most work, what's broken, and what technical debt to tackle.

---

## Kira (Product Designer)

**My top 5 priorities:**

1. **Password reset/change (#5)** — CRITICAL GAP. We have registration and login, but if someone forgets their password, they're locked out forever. This is a UX blocker for any real deployment.

2. **Home dashboard (#8)** — The library grid exists, but there's no personalized landing page. Users should see "Continue Watching" and "Recently Added" immediately. Right now it's just a cold list of everything.

3. **Episode navigation (#16)** — The player works, but switching between episodes is clunky. We need "Next Episode" autoplay and clear season/episode navigation. Binge-watching should feel effortless.

4. **Invite-only signup (#4)** — Admin bootstrap exists, but how do family members join? We need a smooth invite flow with QR codes or shareable links, not just "tell them to register and hope the admin approves."

5. **Media details page (#12)** — It exists but feels bare. We need cast info, synopsis, runtime, quality badges, and trailer support (future). Right now it's just a poster and a play button.

**What's missing:**
- **Error recovery UX**: When HLS fails or subtitles don't extract, users see nothing. We need friendly error messages and retry buttons.
- **Loading states**: Too many blank screens while data loads. We need skeletons and progress indicators.
- **TV remote navigation**: The TV experience exists but focus states are inconsistent. Remote navigation feels janky.

**Technical debt I care about:**
- The auth flow has too many screens. We should consolidate login/register into one modal with tabs.

---

## Milo (Art/Visual Director)

**My top 5 priorities:**

1. **Home dashboard (#8)** — Kira's right. The library grid is functional but soulless. We need hero carousels, featured content, personalized rows. This is the first impression — it needs to be gorgeous.

2. **Media details page (#12)** — The current detail page is a prototype at best. We need backdrop images, cast grids with headshots, genre tags, and smooth animations when you navigate from the library grid.

3. **Library grid/list view (#9)** — The grid exists but it's basic. We need hover states with trailers/previews (future), better poster lazy loading, and smooth transitions between grid and detail views.

4. **Playback page (#13)** — The player controls work, but they're not polished. We need smooth fade-in/fade-out on mouse movement, better scrubbing UX, and a clean timeline with chapter markers (future).

5. **Filters and sorting (#11)** — The filter UI is functional but ugly. We need dropdown animations, chip-style active filters, and better visual hierarchy.

**What's missing:**
- **Design system tokens**: We don't have a unified color/spacing/typography system. CSS is scattered across components.
- **Dark mode polish**: Everything is dark by default, but contrast ratios are inconsistent. Some text is hard to read.
- **Accessibility**: Focus indicators for keyboard nav are weak. ARIA labels are missing in places.

**Technical debt I care about:**
- Too much inline CSS and scattered Tailwind classes. We need a proper design system with reusable components.

---

## Nova (Frontend Engineer)

**My top 5 priorities:**

1. **Line-budget refactoring** — Several files are near 400 lines. `apps/web/src/features/player/pages/PlayerPlaybackPage.tsx` is 380+ lines. We need to extract components WHILE building new features, not after.

2. **Home dashboard (#8)** — This is net-new React work. We need to build "Continue Watching" and "Recently Added" carousels with proper state management and API endpoints.

3. **Password reset/change (#5)** — Frontend form + backend endpoint. Needs email flow or admin-initiated reset. This is a blocker for production.

4. **Episode navigation (#16)** — The player exists but episode switching is manual. We need "Next Episode" button, autoplay countdown, and season/episode selector UI.

5. **Search (#10)** — Search exists but it's slow and doesn't show results in real-time. We need debounced search with instant results and better result ranking.

**What's missing:**
- **Error boundaries**: When components crash, the whole app white-screens. We need React error boundaries.
- **State management**: We're using hooks and context everywhere. For complex features like the player, we might need Zustand or Redux.
- **Code splitting**: The web bundle is getting large. We need lazy loading for routes.

**Technical debt I care about:**
- File organization is inconsistent. Some features have `services/`, others don't. We need to standardize the folder structure.

---

## Sage (Backend Engineer)

**My top 5 priorities:**

1. **Password reset/change (#5)** — SECURITY BLOCKER. We can't ship without password recovery. We need email tokens, rate limiting, and secure reset flow.

2. **Role-based access control (#3)** — We have admin/standard/downloader roles, but enforcement is inconsistent. Some endpoints lack guards. We need a full RBAC audit.

3. **Multiple media locations (#7)** — The backend supports `MEDIA_LIBRARY_PATHS` (semicolon-separated), but the UI only shows one location at a time. We need to expose multi-location management in the admin panel.

4. **SQLite migration for accounts/progress** — JSON file stores are MVP debt. We need to migrate accounts and watch progress to SQLite before we scale. This is foundational work.

5. **HLS streaming/transcoding (#20)** — HLS works but it's fragile. Sessions don't clean up properly, transcoding errors are silent, and there's no bandwidth adaptation. We need robust error handling and session lifecycle management.

**What's missing:**
- **Production security enforcement**: ADR-0003 says we need to validate non-default JWT secrets and strict CORS on startup. This validation doesn't exist yet.
- **API rate limiting**: No rate limiting on auth endpoints. Brute force attacks are trivial.
- **Database migrations**: If we change the SQLite schema, we have no migration tooling. This will break deployments.

**Technical debt I care about:**
- Torrent/download code is implementation drift (ADR-0001). We should extract it into a plugin/addon architecture NOW, before it spreads further.

---

## Remy (Producer)

**My top 5 priorities:**

1. **Password reset/change (#5)** — Everyone agrees. This is Sprint 1, non-negotiable.

2. **Home dashboard (#8)** — High-impact, user-facing feature. This is what makes Yeen feel like a real product, not a prototype.

3. **Episode navigation (#16)** — Core playback feature. Without this, TV show watching is painful.

4. **HLS/playback error recovery** — Not on the 1-20 list, but Ivy's right. Silent failures kill user trust. We need error UX.

5. **Line-budget refactoring** — Nova's right. If we don't tackle this now, we'll violate the guardrail mid-sprint and block CI.

**What I'm cutting (for now):**
- **Audio track selection (#18)** — Nice to have, but most users don't switch audio tracks. Defer to Sprint 3 or 4.
- **Quality selection (#19)** — HLS adaptive streaming is "good enough" for MVP. Manual quality selection can wait.
- **Filters and sorting (#11)** — Basic filters exist. Advanced sorting (by year, genre, quality) can wait.

**My sprint grouping proposal:**
- **Sprint 1: Auth Polish & Foundation** (features 5, 3, production security)
- **Sprint 2: Home & Discovery** (features 8, 10, 12 polish, line-budget refactor)
- **Sprint 3: Playback Excellence** (features 16, 13 polish, error recovery)
- **Sprint 4: Admin & Scale** (features 7 UI, SQLite migration, downloader extraction)

---

## Ivy (QA Engineer)

**My top 5 priorities:**

1. **Error recovery UX** — NOT ON THE LIST, but critical. HLS transcoding fails silently. Subtitle extraction fails silently. Media scan errors are invisible. We need user-facing error messages and retry buttons.

2. **Password reset/change (#5)** — If this breaks in production, users are locked out. We need comprehensive E2E tests for the reset flow.

3. **Resume playback (#14)** — This exists but it's flaky. Sometimes progress doesn't save. Sometimes it resumes 10 seconds too early or too late. We need to fix the sync logic.

4. **Subtitle support (#17)** — Subtitle extraction works, but error cases are broken. If FFmpeg fails, the UI shows an empty subtitle list with no explanation. We need better error handling.

5. **HLS streaming/transcoding (#20)** — HLS sessions leak. If you close the tab mid-stream, the FFmpeg process keeps running. We need session cleanup on disconnect.

**What's broken:**
- **Watch progress edge cases**: What happens if two devices play the same media simultaneously? Last-write-wins will cause progress to jump around.
- **Media scan errors**: If a file is corrupted or FFprobe fails, the scan silently skips it. Users don't know which files failed.
- **TV experience bugs**: Remote navigation focus states are inconsistent. Sometimes focus gets stuck.

**Technical debt I care about:**
- We have E2E test files, but most tests are stubs. We need to actually write Playwright tests for critical flows.

---

## Summary of Top Priorities (by vote count)

| Feature | Votes | Who |
|---------|-------|-----|
| Password reset/change (#5) | 6 | Everyone |
| Home dashboard (#8) | 5 | Kira, Milo, Nova, Remy, (Ivy implicit) |
| Episode navigation (#16) | 3 | Kira, Nova, Remy |
| HLS streaming/error recovery (#20 + errors) | 3 | Sage, Remy, Ivy |
| Media details polish (#12) | 2 | Kira, Milo |
| Line-budget refactoring | 2 | Nova, Remy |
| SQLite migration (accounts/progress) | 1 | Sage |
| RBAC audit (#3) | 1 | Sage |
| Multiple media locations UI (#7) | 1 | Sage |

**Consensus:**
- Sprint 1 MUST include password reset (#5)
- Home dashboard (#8) is high-impact and should be Sprint 2
- Episode navigation (#16) is critical for playback
- Error recovery UX is missing from the 1-20 list but everyone agrees it's needed
