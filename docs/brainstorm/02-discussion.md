# Phase 2: Discussion & Refinement — Debate Transcript

The team debates sprint groupings, challenges assumptions, and converges on final sprint themes.

---

## Opening: Remy's Sprint Proposal

**Remy:** "Alright team, I've heard your pitches. Here's my proposed sprint breakdown:

- **Sprint 1: Auth Polish & Foundation** — Password reset, RBAC audit, production security validation
- **Sprint 2: Home & Discovery** — Home dashboard, search polish, media details polish
- **Sprint 3: Playback Excellence** — Episode navigation, error recovery, HLS robustness
- **Sprint 4: Admin & Scale** — Multi-location UI, SQLite migration, downloader extraction

Thoughts?"

---

## Disagreement #1: Nova vs. Remy on Sprint 1 Scope

**Nova:** "Remy, I appreciate the grouping, but Sprint 1 feels like infrastructure work without user-facing impact. Password reset is great, but RBAC audit and security validation are backend-only. Where's the visual win? Users won't see any difference."

**Remy:** "Nova, we CAN'T ship to production without password reset and security validation. ADR-0003 explicitly calls this out. If we deploy with default JWT secrets, we're asking to get hacked."

**Nova:** "I'm not saying skip it, I'm saying mix it with something visual. What if Sprint 1 includes password reset PLUS home dashboard? That way we have both security AND a user-facing feature?"

**Sage:** "Nova, that's scope creep. Home dashboard needs new API endpoints for 'Continue Watching' and 'Recently Added'. That's net-new backend work PLUS frontend carousels. It'll balloon Sprint 1 to 3+ weeks."

**Kira:** "I'm with Nova. If Sprint 1 is just auth stuff, we'll have nothing to show users. The dashboard is the #1 thing that makes Yeen feel real. Can we do a THIN version? Just 'Continue Watching' row, no 'Recently Added' yet?"

**Milo:** "Kira, a 'thin' dashboard is worse than no dashboard. It'll look unfinished. Either we do it right or we wait."

**Nova:** "Milo, I disagree. A single 'Continue Watching' row is still a massive UX improvement over the current cold library grid. We can add 'Recently Added' in Sprint 2."

**Remy:** "Alright, I hear you. Here's the compromise: Sprint 1 gets password reset + RBAC audit + THIN home dashboard (Continue Watching only). But if the dashboard slips, we cut it and ship auth-only. Deal?"

**Nova:** "Deal. I'll build the carousel component to be reusable, so 'Recently Added' is just adding another row in Sprint 2."

**Kira:** "I can live with that."

**Milo:** *grumbles* "Fine, but I want Sprint 2 to focus on polish. If we ship a half-baked dashboard in Sprint 1, Sprint 2 needs to make it gorgeous."

---

## Disagreement #2: Sage vs. Ivy on Error Recovery Priority

**Ivy:** "I need to push back on the sprint order. Remy has error recovery in Sprint 3, but we should tackle it in Sprint 1. Here's why: every sprint we ship without error UX, we're accumulating bug reports and user frustration. HLS failures, subtitle extraction failures, media scan errors — these are DAILY occurrences."

**Sage:** "Ivy, error recovery is important, but it's not a blocker for MVP. Users can work around HLS failures by refreshing. We can't work around missing password reset — that's a hard blocker."

**Ivy:** "Sage, 'just refresh' is not a solution. When HLS fails, users don't know if it's their network, the server, or the file. We need user-facing error messages and retry buttons. This is basic UX hygiene."

**Remy:** "Ivy, I hear you, but we can't do everything in Sprint 1. What if we add error boundaries and basic error messages to Sprint 1, and save the retry logic for Sprint 3?"

**Ivy:** "Error boundaries are frontend-only. What about backend errors? When FFmpeg crashes during subtitle extraction, the API returns 500 with no context. We need structured error responses."

**Sage:** "That's a valid point. I can add structured error DTOs in Sprint 1 as part of the RBAC audit work. It's low-effort and high-impact."

**Ivy:** "Okay, but I want explicit success criteria: 'All API endpoints return structured errors with user-facing messages.' If we don't commit to that, it won't happen."

**Remy:** "Agreed. I'll add that to Sprint 1 success criteria."

---

## Nova: Line-Budget Refactoring Must Happen Now

**Nova:** "Before we finalize sprints, we need to talk about line-budget refactoring. Several files are near 400 lines, and if we add features without refactoring, we'll violate the guardrail and block CI."

**Remy:** "Which files are the worst offenders?"

**Nova:** "Player page is 380+ lines. Media details page is close. Library grid is creeping up. We need to extract components while we're working on those files."

**Milo:** "Can we do this incrementally? Like, refactor the player page in Sprint 3 when we're adding episode navigation?"

**Nova:** "Yes, that's exactly what I'm proposing. Tactical refactoring during feature work, not a separate 'refactor sprint'."

**Sage:** "I support this. On the backend, the media service is also bloated. I can split it into domain-specific services during Sprint 2 when we add dashboard endpoints."

**Remy:** "Okay, let's bake refactoring into each sprint. I'll add 'Extract components to stay under 400-line budget' to each sprint's success criteria."

---

## Kira: Episode Navigation vs. Search Polish

**Kira:** "I want to challenge the priority of episode navigation (#16) over search polish (#10). Search exists but it's slow and clunky. If users can't find media quickly, they'll get frustrated."

**Nova:** "Search is already functional. Episode navigation is MISSING. If you're watching a TV show, you have to manually navigate back to the series page and click the next episode. That's a worse user experience."

**Kira:** "Fair, but how many users are binge-watching vs. searching for something new? I think search is more common."

**Ivy:** "Kira, the data disagrees. Watch progress shows most users are watching shows sequentially. Episode navigation is critical for retention."

**Kira:** "Okay, but can we at least add search improvements to Sprint 2? Debounced search and instant results are low-hanging fruit."

**Nova:** "Yes, I can add that to Sprint 2. It's a small hook change."

---

## Milo: Design System Work Needs a Home

**Milo:** "I'm concerned that design system work is being ignored. We have scattered CSS, inconsistent spacing, and no shared component library. This needs to be tackled."

**Remy:** "Milo, I agree it's important, but we can't stop feature work to build a design system from scratch."

**Milo:** "I'm not asking for that. I'm asking for incremental design system extraction. When Nova refactors the player page in Sprint 3, we extract a `<Button>` component with design tokens. When Kira adds dashboard carousels in Sprint 2, we extract a `<Carousel>` component."

**Nova:** "I can support that. It's basically the same as line-budget refactoring — tactical extraction during feature work."

**Remy:** "Okay, I'll add 'Extract reusable design system components' to each sprint."

---

## Final Convergence: 3 Sprints + Backlog

**Remy:** "Alright, based on the discussion, here's the revised plan:

### Sprint 1: Foundation & Auth (2 weeks)
- Password reset/change (#5)
- RBAC audit (#3)
- Production security validation (ADR-0003)
- Structured error DTOs for all API endpoints
- THIN home dashboard (Continue Watching only)
- React error boundaries

**Success criteria:**
- Password reset works E2E with email tokens
- All API endpoints return structured errors
- Continue Watching carousel shows progress-tracked media
- CI passes with line-budget guardrail

### Sprint 2: Discovery & Polish (2 weeks)
- Home dashboard polish (add Recently Added row)
- Search improvements (debounce, instant results)
- Media details page polish (cast, synopsis, quality badges)
- Library grid polish (hover states, lazy loading)
- Backend refactor: split media service

**Success criteria:**
- Home dashboard has 2+ rows (Continue Watching, Recently Added)
- Search returns results in <300ms
- Media details page shows cast and synopsis
- All files under 400-line budget

### Sprint 3: Playback Excellence (2 weeks)
- Episode navigation (#16) with Next Episode autoplay
- Playback page polish (controls, timeline)
- HLS error recovery (retry logic, session cleanup)
- Subtitle error handling
- Player page refactor (extract components)

**Success criteria:**
- Next Episode button works with autoplay countdown
- HLS failures show user-facing errors with retry button
- Player page under 400 lines
- E2E tests for playback flows

### Backlog (defer to Sprint 4+)
- Audio track selection (#18)
- Quality selection (#19)
- Advanced filters/sorting (#11)
- Multi-location UI (#7)
- SQLite migration for accounts/progress
- Downloader extraction (ADR-0001)

Does everyone agree?"

---

## Team Vote

**Kira:** "I'm in. Sprint 1 has the thin dashboard, Sprint 2 makes it gorgeous. Works for me."

**Milo:** "I accept it, but I'm holding everyone accountable for design system extraction in Sprint 2."

**Nova:** "Agreed. This is achievable if we stay disciplined."

**Sage:** "I'm good with Sprint 1 and 2. Sprint 3 feels tight, but we can manage."

**Ivy:** "I'm happy we have error recovery in Sprint 3. I'll write E2E tests during each sprint."

**Remy:** "Unanimous. Let's do it."

---

## Key Decisions

1. **Sprint 1 includes THIN home dashboard** (Continue Watching only) as a compromise between backend-heavy auth work and user-facing impact.
2. **Error recovery is split:** Structured error DTOs in Sprint 1, retry/recovery UX in Sprint 3.
3. **Line-budget refactoring is tactical:** Baked into each sprint during feature work, not a separate sprint.
4. **Design system extraction is incremental:** Extract components during feature work (Button, Carousel, etc.).
5. **3 sprints total** for MVP features 1-20, with advanced features deferred to Sprint 4+.

---

## Disagreements Logged

1. **Nova vs. Remy/Milo:** Nova pushed for home dashboard in Sprint 1 for user-facing impact; Remy/Milo resisted scope creep. Compromise: thin dashboard.
2. **Ivy vs. Sage:** Ivy wanted error recovery in Sprint 1 as critical UX hygiene; Sage prioritized auth blockers. Compromise: structured errors in Sprint 1, retry logic in Sprint 3.
