# Team Vote — Final Sprint Plan

After three phases of brainstorming and debate, the team votes on the final sprint breakdown for Yeen MVP (features 1-20).

---

## Final Sprint Plan Overview

| Sprint | Name | Duration | Core Features | Foundation Work |
|--------|------|----------|---------------|-----------------|
| **1** | Foundation & Auth | 2 weeks | Password reset (#5), RBAC audit (#3), Thin home dashboard (#8) | Production security validation, structured errors, error boundaries |
| **2** | Discovery & Polish | 2 weeks | Dashboard polish (#8), Search improvements (#10), Media details (#12), Library grid (#9) | Backend refactor (split media service), design system expansion |
| **3** | Playback Excellence | 2 weeks | Episode navigation (#16), Playback polish (#13), Subtitle errors (#17), HLS robustness (#20) | Player refactor, HLS session management, error recovery UX |

**Total timeline:** 6 weeks for MVP features 1-20 (with features 18, 19, 11, 7 deferred to Sprint 4+)

---

## Individual Votes

### Kira (Product Designer) — ✅ APPROVE

**Vote:** Approve with enthusiasm.

**Justification:**
"I'm thrilled we compromised on the thin dashboard for Sprint 1. It gives us user-facing impact without blowing up the timeline. Sprint 2's focus on discovery and polish is exactly what Yeen needs to feel like a real product, not a prototype. Episode navigation in Sprint 3 is non-negotiable for TV show watchers. The only thing I'd watch closely is scope creep in Sprint 2 — if genre rows API is slow, we should cut it and ship with just Recently Added. But overall, this is a balanced plan that delivers user delight."

---

### Milo (Art/Visual Director) — ✅ APPROVE with conditions

**Vote:** Approve with design system accountability.

**Justification:**
"I'm approving this plan because we've baked design system extraction into every sprint. Nova and I have a pact: every feature we build, we extract a reusable component. Button, Carousel, Card, Input, Badge, Modal — these will form the foundation of Yeen's visual identity. My condition: Sprint 2 MUST deliver polished UI. If we ship a half-baked dashboard in Sprint 1, Sprint 2 is where we make it gorgeous. I'm also watching hover states and animations closely — they're what separate Yeen from generic media servers."

---

### Nova (Frontend Engineer) — ✅ APPROVE

**Vote:** Approve with confidence.

**Justification:**
"This is achievable. Sprint 1 is tight but doable if Sage delivers APIs on time. The thin dashboard compromise was smart — it keeps Sprint 1 from ballooning. Sprint 2's backend refactor is critical; we need to split that bloated media service before it becomes unmaintainable. Sprint 3's player refactor is where I'll earn my salary — extracting components from a 380-line file while adding features is tricky, but necessary. My only concern is E2E test coverage. Ivy needs to stay on top of tests during each sprint, not batch them at the end."

---

### Sage (Backend Engineer) — ✅ APPROVE with reservations

**Vote:** Approve with technical debt acknowledgment.

**Justification:**
"I approve this plan, but I want to be transparent about what we're NOT doing: SQLite migration for accounts/progress, downloader extraction (ADR-0001), and rate limiting. These are foundational for scaling beyond a household deployment. Sprint 1's production security validation is a good start, but we're still shipping with JSON file stores. I'll push for Sprint 4 to tackle infrastructure debt before we add more features. That said, Sprint 1-3 is solid for MVP. I'm particularly happy we're tackling HLS session cleanup in Sprint 3 — those leaked FFmpeg processes are a ticking bomb."

---

### Remy (Producer) — ✅ APPROVE

**Vote:** Approve and let's ship it.

**Justification:**
"This plan balances user-facing impact with technical foundation. Sprint 1 gives us auth security and a taste of personalization. Sprint 2 makes Yeen feel polished and fast. Sprint 3 delivers rock-solid playback. After 6 weeks, we'll have an MVP that real users can enjoy. My job now is to keep scope in check. If anything slips, we cut ruthlessly and defer to Sprint 4. I'm particularly vigilant about Sprint 2 — genre rows and cast grids are nice-to-haves, not must-haves. If they threaten the timeline, they're gone."

---

### Ivy (QA Engineer) — ✅ APPROVE with testing emphasis

**Vote:** Approve with E2E test commitment.

**Justification:**
"I approve this plan because error recovery is finally prioritized. Sprint 1 gets us structured errors, Sprint 3 gets us retry UX. That's what users need to trust the platform. My commitment: I'll write E2E tests during each sprint, not after. Password reset, dashboard rows, episode navigation, error recovery — these all need Playwright coverage. My concern: we're deferring a lot to Sprint 4 (rate limiting, SQLite migration, downloader extraction). Those are tech debt bombs. But for MVP, this plan works."

---

## Unanimous Decision

**Result:** 6/6 votes to approve.

**Consensus statement:**
The team unanimously approves the 3-sprint plan for Yeen MVP. Sprint 1 establishes foundation and auth security. Sprint 2 delivers discovery and polish. Sprint 3 ensures playback excellence. Features 18, 19, 11, 7 from the top 20 are deferred to Sprint 4+ along with infrastructure debt (SQLite migration, downloader extraction, rate limiting).

---

## Conditions and Commitments

| Condition | Owner | Sprint |
|-----------|-------|--------|
| Design system components extracted during feature work | Milo + Nova | All |
| E2E tests written during sprint, not batched at end | Ivy | All |
| Line-budget compliance enforced (all files <400 lines) | Nova | All |
| Backend media service refactored before adding more features | Sage | Sprint 2 |
| Player page refactored before adding episode navigation | Nova | Sprint 3 |
| Sprint 2 scope cut if genre rows or cast API is slow | Remy | Sprint 2 |
| Sprint 4 prioritizes infrastructure debt | Sage + Remy | Sprint 4 |

---

## Next Steps

1. **Remy creates detailed sprint plans** in `docs/sprint-1/plan.md`, `docs/sprint-2/plan.md`, `docs/sprint-3/plan.md`
2. **Dev team clones repo** to separate folder (`Yeen-dev`)
3. **QA team clones repo** to separate folder (`Yeen-qa`)
4. **Dev team executes Sprint 1** on branch `feature/sprint-1`
5. **After Sprint 1 PR merge, QA playtests and signs off**
6. **Repeat for Sprint 2 and Sprint 3**

---

## Risks Acknowledged

- Sprint 2 has the most tasks (17) and could slip
- HLS session cleanup (Sprint 3) is technically complex
- Deferred tech debt (SQLite, rate limiting, downloader extraction) will need Sprint 4
- E2E test coverage depends on Ivy's availability each sprint

---

## Team Motto

**"Take your time. Do it right. Ship with pride."** 🎬
