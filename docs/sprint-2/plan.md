# Sprint 2: Discovery & Polish

> **Sprint Goal:** Deliver a gorgeous, fast home dashboard with multiple rows, instant search results, polished media detail pages, and a cleaner backend architecture.

**Branch:** `feature/sprint-2`  
**Estimated effort:** 2 weeks (10 working days)  
**Features:** #8 (Home dashboard polish), #10 (Search improvements), #12 (Media details polish), #9 (Library grid polish)

---

## Scope

### Core Features (from top 50)
- **#8: Home dashboard polish** — Add Recently Added row, Featured content (admin-picked), genre rows
- **#10: Search improvements** — Debounced search, instant results, better ranking
- **#12: Media details page polish** — Cast info, synopsis, quality badges, runtime, release year
- **#9: Library grid/list view polish** — Hover states, better lazy loading, smooth transitions

### Foundation Work
- **Backend refactor: Media service split** — Extract domain-specific services (scan, metadata, search)
- **Design system expansion** — Extract Card, Carousel, Input, Badge components
- **Line-budget compliance** — Ensure all files under 400 lines

---

## Prioritized Task List

| # | Task | Owner | Est | Description |
|---|------|-------|-----|-------------|
| 1 | Recently Added API | Sage | 0.5d | Add `/api/dashboard/recently-added` endpoint |
| 2 | Featured content API | Sage | 1d | Add admin-pickable featured media with `/api/dashboard/featured` |
| 3 | Genre rows API | Sage | 1d | Add `/api/dashboard/genre-rows` returning top items per genre |
| 4 | Dashboard rows frontend | Nova | 1.5d | Add Recently Added, Featured, and genre rows to home page |
| 5 | Search debouncing | Nova | 0.5d | Add debounced search hook with 300ms delay |
| 6 | Search instant results | Nova | 1d | Update search UI to show results as you type |
| 7 | Media details API enhancements | Sage | 1d | Add cast, runtime, release year to media details response |
| 8 | Media details frontend polish | Nova | 1.5d | Display cast grid, synopsis with expand/collapse, quality badges |
| 9 | Library grid hover states | Milo | 1d | Add hover animations with scale and shadow effects |
| 10 | Library grid lazy loading | Nova | 0.5d | Improve Intersection Observer for smoother loading |
| 11 | Backend refactor: Split media service | Sage | 1.5d | Extract MediaScanService, MetadataService, SearchService from MediaService |
| 12 | Design system: Card component | Milo | 0.5d | Extract reusable Card with poster, title, metadata layout |
| 13 | Design system: Input component | Milo | 0.5d | Extract Input with search icon, clear button, focus states |
| 14 | Design system: Badge component | Milo | 0.5d | Extract Badge for quality (4K, HD, SD), status, genre tags |
| 15 | E2E: Dashboard full flow | Ivy | 1d | Test all dashboard rows load and navigate correctly |
| 16 | E2E: Search flow | Ivy | 0.5d | Test search debouncing and results navigation |
| 17 | Integration & polish | All | 1d | Bug fixes, responsive adjustments, accessibility improvements |

**Total estimated days:** 14d (with parallelization → 10 working days)

---

## Work Schedule

### Phase 1: Dashboard Expansion Backend (Days 1-3)
**Tasks:** 1, 2, 3, 11
- Sage adds Recently Added, Featured, Genre Rows APIs
- Sage refactors media service into domain-specific services

**Checkpoint:** Commit `sprint-2-phase-1: dashboard APIs and backend refactor`

### Phase 2: Dashboard Frontend & Design System (Days 4-6)
**Tasks:** 4, 12, 14
- Nova adds all dashboard rows to home page
- Milo extracts Card and Badge components
- Milo styles dashboard with spacing tokens

**Checkpoint:** Commit `sprint-2-phase-2: dashboard rows and design system`

### Phase 3: Search & Details Polish (Days 7-8)
**Tasks:** 5, 6, 7, 8, 13
- Nova adds debounced search with instant results
- Sage enhances media details API response
- Nova polishes media details page with cast grid
- Milo extracts Input component

**Checkpoint:** Commit `sprint-2-phase-3: search and details polish`

### Phase 4: Library Grid & Testing (Days 9-10)
**Tasks:** 9, 10, 15, 16, 17
- Milo adds hover states to library grid
- Nova improves lazy loading performance
- Ivy writes E2E tests for dashboard and search
- All team members polish and fix bugs

**Checkpoint:** Final commit `sprint-2: complete`, push to GitHub, create PR

---

## Success Criteria

- [ ] Home dashboard has 4+ rows: Continue Watching, Recently Added, Featured, Genre rows (Action, Drama, etc.)
- [ ] Featured content can be admin-selected via settings panel
- [ ] Search returns results within 300ms of typing with debouncing
- [ ] Search results are ranked by relevance (exact title match > partial match > metadata match)
- [ ] Media details page shows cast grid (with headshots if available), full synopsis with expand/collapse, quality badge (4K/HD/SD), runtime, release year
- [ ] Library grid cards have hover states with smooth scale/shadow animations
- [ ] Library grid lazy loads images smoothly without layout shift
- [ ] Backend media service is split into 3 services: MediaScanService, MetadataService, SearchService
- [ ] Design system has Card, Input, Badge components with Storybook docs (optional)
- [ ] All files under 400-line budget
- [ ] E2E tests pass for dashboard and search flows
- [ ] CI passes (lint, build, tests, line-budget)

---

## What's NOT in This Sprint

| Feature | Reason |
|---------|--------|
| Trailer support | Requires video preview infrastructure; deferred to Sprint 4+ |
| Advanced filters (by year, genre, quality) | Basic filters exist; advanced UI deferred to Sprint 4 |
| Cast headshots from TMDB | TMDB integration exists but cast images need caching; deferred to Sprint 4 |
| Search history / saved searches | Nice-to-have; deferred to Sprint 4+ |
| Multi-language search | English-only for MVP; i18n in Sprint 5+ |

---

## Dependencies

- **Sprint 1 complete** — Requires Continue Watching carousel and structured error handling

---

## Risks

| Risk | Mitigation |
|------|------------|
| Genre rows API is slow with large libraries | Add caching layer for genre aggregations |
| Featured content admin UI is complex | Use simple checkboxes in media details admin panel |
| Cast grid requires TMDB API calls | Cache cast data in SQLite metadata store |
| Backend refactor breaks existing endpoints | Write integration tests before refactoring |

---

## Agent Prompt

```
Read PROJECT_BRIEF.md, then read docs/sprint-2/plan.md. Execute Sprint 2.

You are the Yeen dev team: Sage (backend), Nova (frontend), Milo (design).

First: git pull origin main && git checkout -b feature/sprint-2

Follow the 4-phase work schedule. Commit after each phase.
Close GitHub Issues in commits: "fix: description (Fixes #NN)"
Update docs/sprint-2/progress.md after each phase.
When done, push and create PR: git push origin feature/sprint-2

Follow Sections 12-14 of PROJECT_BRIEF.md for handoff protocol.
Use domain language from CONTEXT.md.
Extract design system components as you build features.
Refactor media service but keep tests green.

Take your time. Do it right.
```

---

## Notes

- Recently Added should show last 20 scanned items sorted by scan date descending
- Featured content should support 5-10 admin-picked items max
- Genre rows should show top 10 items per genre (by watch count or recent additions)
- Search debouncing should cancel previous requests on new input
- Media details synopsis should expand/collapse if longer than 3 lines
- Cast grid should show 6-8 cast members with names and roles
- Quality badge logic: 4K if resolution ≥3840, HD if ≥1920, SD otherwise
