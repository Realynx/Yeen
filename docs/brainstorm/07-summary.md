# Executive Summary — Yeen MVP Sprint Plan

**Date:** 2026-05-26  
**Team:** Kira, Milo, Nova, Sage, Remy, Ivy  
**Outcome:** Unanimous approval of 3-sprint MVP plan (6 weeks total)

---

## Context

Yeen is a self-hosted media streaming platform with Netflix-like UX across desktop, phone, and TV. The user identified **50 critical features** and prioritized **features 1-20 as the MVP**. Most of these features already exist in the codebase but are incomplete, rough, or lack error recovery.

The team ran a 3-phase brainstorm to validate priorities, debate sprint groupings, and converge on an executable plan.

---

## What We're Building (Features 1-20)

### Sprint 1: Foundation & Auth (2 weeks)
**Core features:** Password reset/change (#5), RBAC audit (#3), Thin home dashboard (#8)  
**Foundation:** Production security validation, structured error DTOs, React error boundaries

**User-facing wins:**
- Password recovery flow (email tokens)
- Continue Watching carousel on home page
- Graceful error handling across the app

**Why this matters:** Without password reset, users are locked out forever. Without security validation, production deployments are vulnerable. The thin dashboard gives users a taste of personalization.

---

### Sprint 2: Discovery & Polish (2 weeks)
**Core features:** Dashboard polish (#8), Search improvements (#10), Media details polish (#12), Library grid polish (#9)  
**Foundation:** Backend refactor (split media service), design system expansion

**User-facing wins:**
- Full home dashboard with Recently Added, Featured, genre rows
- Instant search results with debouncing
- Gorgeous media details pages with cast, synopsis, quality badges
- Smooth library grid hover states and lazy loading

**Why this matters:** Sprint 1 gives us a working product. Sprint 2 makes it *feel* like a real streaming platform. This is where Yeen earns user trust and delight.

---

### Sprint 3: Playback Excellence (2 weeks)
**Core features:** Episode navigation (#16), Playback polish (#13), Subtitle error handling (#17), HLS robustness (#20)  
**Foundation:** Player refactor, HLS session management, error recovery UX

**User-facing wins:**
- Next Episode button with autoplay countdown
- Season/episode selector for easy navigation
- Smooth player controls with fade animations
- Retry buttons for HLS and subtitle failures
- Automatic HLS session cleanup

**Why this matters:** Playback is the core experience. If users can't binge-watch seamlessly or recover from errors, they'll abandon the platform. Sprint 3 makes playback rock-solid.

---

## What We're Deferring (to Sprint 4+)

| Feature | Reason |
|---------|--------|
| Audio track selection (#18) | Nice-to-have; most users don't switch audio |
| Quality selection (#19) | HLS adaptive streaming is "good enough" for MVP |
| Advanced filters/sorting (#11) | Basic filters exist; advanced UI can wait |
| Multi-location UI (#7) | Backend supports it; UI polish deferred |
| SQLite migration (accounts/progress) | Infrastructure debt; Sprint 4 priority |
| Downloader extraction (ADR-0001) | Architecture cleanup; Sprint 4 priority |
| Rate limiting | Security feature; Sprint 4 priority |

---

## Key Decisions

### 1. Sprint 1 includes thin home dashboard
**Debate:** Nova pushed for user-facing impact in Sprint 1; Remy/Milo resisted scope creep.  
**Resolution:** Thin dashboard (Continue Watching only) as a compromise. Sprint 2 adds remaining rows.

### 2. Error recovery is split across sprints
**Debate:** Ivy wanted error recovery in Sprint 1; Sage prioritized auth blockers.  
**Resolution:** Structured error DTOs in Sprint 1, retry/recovery UX in Sprint 3.

### 3. Line-budget refactoring is tactical, not a separate sprint
**Decision:** Extract components during feature work to stay under 400-line budget. No dedicated refactor sprint.

### 4. Design system extraction is incremental
**Decision:** Build reusable components (Button, Carousel, Card, Modal) during feature sprints. Milo holds Nova accountable.

---

## Success Metrics (End of Sprint 3)

- [ ] Users can reset passwords via email tokens
- [ ] Home dashboard has 4+ rows (Continue Watching, Recently Added, Featured, Genre)
- [ ] Search returns results in <300ms
- [ ] Media details pages show cast, synopsis, quality badges
- [ ] Next Episode button works with autoplay countdown
- [ ] HLS failures show retry buttons and user-facing errors
- [ ] All files under 400-line budget
- [ ] E2E tests cover auth, dashboard, search, playback, error recovery
- [ ] CI passes (lint, build, tests, line-budget)

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Sprint 2 has 17 tasks and could slip | Cut genre rows or cast API if they're slow |
| HLS session cleanup is complex | Use polling fallback if WebSocket is too hard |
| Deferred tech debt will bite us in Sprint 4+ | Sprint 4 prioritizes SQLite migration and security hardening |
| E2E test coverage depends on Ivy's availability | Write tests during sprints, not after |

---

## Timeline

| Sprint | Dates (est.) | Deliverable |
|--------|--------------|-------------|
| Sprint 1 | Weeks 1-2 | Auth security + thin dashboard |
| Sprint 2 | Weeks 3-4 | Full dashboard + discovery polish |
| Sprint 3 | Weeks 5-6 | Playback excellence + error recovery |

**Total: 6 weeks from start to MVP**

---

## Team Vote: 6/6 Unanimous Approval

- **Kira:** Approve with enthusiasm (user delight delivered)
- **Milo:** Approve with design system accountability
- **Nova:** Approve with confidence (achievable and balanced)
- **Sage:** Approve with tech debt acknowledgment
- **Remy:** Approve and let's ship it
- **Ivy:** Approve with E2E test commitment

---

## What Happens Next

### For You (CEO):
1. **Review this summary** and the detailed sprint proposals in `docs/brainstorm/03-sprint-1-proposal.md`, `04-sprint-2-proposal.md`, `05-sprint-3-proposal.md`
2. **Clone the repo 3 times** for Producer, Dev, QA teams (see `docs/AI_TEAM_GETTING_STARTED.md`)
3. **Open separate VS Code windows** for each team
4. **Start Sprint 1** by giving the dev team this prompt:

```
Read PROJECT_BRIEF.md, then read docs/sprint-1/plan.md. Execute Sprint 1.

You are the Yeen dev team: Sage (backend), Nova (frontend), Milo (design).

First: git pull origin main && git checkout -b feature/sprint-1

Follow the 4-phase work schedule. Commit after each phase.
Update docs/sprint-1/progress.md after each phase.
When done, push and create PR: git push origin feature/sprint-1

Take your time. Do it right.
```

### For the AI Teams:
- **Dev team:** Execute sprints 1-3 sequentially on feature branches
- **QA team:** Playtest after each merge, file GitHub Issues, write sign-off docs
- **Producer:** Coordinate teams, merge PRs, triage issues, keep PROJECT_BRIEF.md updated

---

## Bottom Line

We have a **clear, executable plan** to ship Yeen MVP in 6 weeks. The team debated priorities, made tough tradeoffs, and converged on a balanced approach that delivers security, discovery, and playback excellence. 

Now it's time to build. 🎬

---

**Questions? See `docs/AI_TEAM_GETTING_STARTED.md` for the full orchestration playbook.**
