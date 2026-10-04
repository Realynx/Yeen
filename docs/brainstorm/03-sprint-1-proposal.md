# Sprint 1: Foundation & Auth

> **Sprint Goal:** Ship production-ready authentication with password recovery, secure defaults enforcement, structured error handling, and a thin personalized home dashboard.

**Branch:** `feature/sprint-1`  
**Estimated effort:** 2 weeks (10 working days)  
**Features:** #5 (Password reset/change), #3 (RBAC audit), #8 (Home dashboard - thin version), plus error handling foundation

---

## Scope

### Core Features (from top 50)
- **#5: Password reset/change** — Email-based password recovery flow with secure tokens
- **#3: Role-based access control** — Audit and enforce guards on all protected endpoints
- **#8: Home dashboard (thin version)** — Continue Watching carousel only

### Foundation Work (not in top 50, but critical)
- **Production security validation** — Enforce non-default JWT secrets and strict CORS per ADR-0003
- **Structured error DTOs** — All API endpoints return user-facing error messages
- **React error boundaries** — Graceful error handling for component crashes

---

## Prioritized Task List

| # | Task | Owner | Est | Description |
|---|------|-------|-----|-------------|
| 1 | Password reset backend | Sage | 1d | Add `/api/auth/request-reset` and `/api/auth/confirm-reset` endpoints with token generation/validation |
| 2 | Password reset frontend | Nova | 1d | Add reset request form and reset confirmation form with routing |
| 3 | RBAC audit | Sage | 1d | Audit all controllers, add missing guards, document protected routes |
| 4 | Production security validation | Sage | 0.5d | Add startup validation for JWT_SECRET and CORS_ORIGIN, fail fast if defaults detected |
| 5 | Structured error DTOs | Sage | 1d | Create `ApiErrorResponse` DTO, refactor all endpoints to return structured errors |
| 6 | React error boundaries | Nova | 0.5d | Add error boundary component and wrap route components |
| 7 | Continue Watching API | Sage | 1d | Add `/api/dashboard/continue-watching` endpoint returning media with progress |
| 8 | Continue Watching carousel | Nova | 1.5d | Build carousel component with horizontal scroll and poster cards |
| 9 | Home dashboard page | Nova | 1d | Create home page route, integrate carousel, add loading states |
| 10 | Design system: Button | Milo | 0.5d | Extract reusable Button component with design tokens |
| 11 | Design system: Carousel | Milo | 0.5d | Add Carousel container styles with smooth scrolling |
| 12 | E2E: Password reset | Ivy | 1d | Playwright test for full reset flow |
| 13 | E2E: Dashboard | Ivy | 0.5d | Test Continue Watching carousel loads and navigates |
| 14 | Integration & polish | All | 1d | Bug fixes, error message polish, responsive adjustments |

**Total estimated days:** 12d (with some parallelization → 10 working days)

---

## Work Schedule

### Phase 1: Backend Foundation (Days 1-3)
**Tasks:** 1, 3, 4, 5
- Sage builds password reset endpoints with token logic
- Sage audits RBAC guards and adds missing protections
- Sage adds startup validation for security defaults
- Sage refactors error responses to structured DTOs

**Checkpoint:** Commit `sprint-1-phase-1: backend foundation complete`

### Phase 2: Frontend Auth & Error Handling (Days 4-5)
**Tasks:** 2, 6
- Nova builds password reset request and confirmation forms
- Nova adds React error boundaries to route wrappers
- Milo extracts Button component

**Checkpoint:** Commit `sprint-1-phase-2: auth frontend and error boundaries`

### Phase 3: Dashboard (Days 6-8)
**Tasks:** 7, 8, 9, 11
- Sage builds Continue Watching API endpoint
- Nova builds carousel component
- Nova creates home dashboard page
- Milo styles carousel with smooth scrolling

**Checkpoint:** Commit `sprint-1-phase-3: home dashboard with continue watching`

### Phase 4: Testing & Polish (Days 9-10)
**Tasks:** 12, 13, 14
- Ivy writes E2E tests for password reset and dashboard
- All team members fix bugs and polish error messages
- Responsive adjustments for phone/TV

**Checkpoint:** Final commit `sprint-1: complete`, push to GitHub, create PR

---

## Success Criteria

- [ ] Password reset flow works E2E: user requests reset via email, receives token, sets new password, can log in
- [ ] All protected API endpoints have appropriate guards (`JwtAuthGuard`, `AdminGuard`)
- [ ] Server fails to start if `JWT_SECRET` is default value or `CORS_ORIGIN` is `*` in production mode
- [ ] All API endpoints return structured `ApiErrorResponse` with `statusCode`, `message`, `error`, `path`
- [ ] React error boundaries catch component crashes and show fallback UI
- [ ] Home dashboard shows Continue Watching carousel with media items that have watch progress
- [ ] Carousel is horizontally scrollable with smooth scroll behavior
- [ ] E2E tests pass for password reset and dashboard
- [ ] All modified files stay under 400-line budget
- [ ] No console errors in dev/production builds
- [ ] CI passes (lint, build, tests, line-budget)

---

## What's NOT in This Sprint

| Feature | Reason |
|---------|--------|
| Recently Added row | Deferred to Sprint 2 for thin MVP |
| Email delivery (SMTP) | Use console-logged tokens for MVP; SMTP in Sprint 4 |
| Password strength validation | Basic validation only; advanced rules in Sprint 4 |
| Account lockout after failed attempts | Security feature for Sprint 4 |
| Rate limiting | Security feature for Sprint 4 |
| Advanced error recovery (retry buttons) | Deferred to Sprint 3; Sprint 1 focuses on structured errors only |

---

## Dependencies

- **None** — This is the foundation sprint. All work is net-new or refactoring existing code.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Password reset tokens need secure storage | Use in-memory store for MVP; migrate to SQLite in Sprint 4 |
| Continue Watching API is slow with large libraries | Add pagination and limit to 20 items max |
| Carousel scrolling is janky on TV | Use CSS `scroll-snap` and test on TV emulator |
| RBAC audit uncovers missing guards on many endpoints | Budget extra time in Phase 1 for guard additions |

---

## Agent Prompt

```
Read PROJECT_BRIEF.md, then read docs/sprint-1/plan.md. Execute Sprint 1.

You are the Yeen dev team: Sage (backend), Nova (frontend), Milo (design).

First: git pull origin main && git checkout -b feature/sprint-1

Follow the 4-phase work schedule. Commit after each phase.
Close GitHub Issues in commits: "fix: description (Fixes #NN)"
Update docs/sprint-1/progress.md after each phase.
When done, push and create PR: git push origin feature/sprint-1

Follow Sections 12-14 of PROJECT_BRIEF.md for handoff protocol.
Use domain language from CONTEXT.md (e.g., "Account" not "User").
Stay under 400-line budget. Extract components as you go.

Take your time. Do it right.
```

---

## Notes

- Password reset tokens should be single-use and expire after 1 hour
- Continue Watching should sort by most recent progress update
- Error boundaries should log errors to console for debugging but show friendly UI to users
- Button component should support variants: primary, secondary, danger, ghost
- Carousel should support keyboard navigation (arrow keys) and focus management
