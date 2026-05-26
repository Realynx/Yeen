# Yeen MVP Sprint Plans — Index

This directory contains the complete sprint planning output from the AI team brainstorm session.

## Brainstorm Results

The team ran a 3-phase brainstorm to validate MVP priorities (features 1-20 from the top 50 list) and create executable sprint plans:

### Phase 1: Free Ideation
**File:** `01-free-ideation.md`

Each team member (Kira, Milo, Nova, Sage, Remy, Ivy) pitched their top 5 priorities and identified gaps:
- **Consensus:** Password reset (#5) is non-negotiable
- **High priority:** Home dashboard (#8), Episode navigation (#16)
- **Hidden gap:** Error recovery UX (not in top 20 but critical)

### Phase 2: Discussion & Refinement
**File:** `02-discussion.md`

Team debates with **2 genuine disagreements:**
1. **Nova vs. Remy/Milo:** Should Sprint 1 include dashboard or just auth? (Resolved: thin dashboard)
2. **Ivy vs. Sage:** Should error recovery be Sprint 1 or Sprint 3? (Resolved: split across sprints)

**Key decisions:**
- Sprint 1 includes thin home dashboard (Continue Watching only)
- Error recovery split: structured errors in Sprint 1, retry UX in Sprint 3
- Line-budget refactoring is tactical, not a separate sprint
- Design system extraction is incremental during feature work

### Phase 3: Sprint Proposals
**Files:** `03-sprint-1-proposal.md`, `04-sprint-2-proposal.md`, `05-sprint-3-proposal.md`

Three detailed sprint plans with task lists, schedules, success criteria, and risks.

### Team Vote
**File:** `06-team-vote.md`

**Result:** 6/6 unanimous approval
- Kira: Approve with enthusiasm
- Milo: Approve with design system accountability
- Nova: Approve with confidence
- Sage: Approve with tech debt acknowledgment
- Remy: Approve and let's ship it
- Ivy: Approve with E2E test commitment

### Executive Summary
**File:** `07-summary.md`

Concise overview of the 3-sprint plan, timeline, risks, and next steps.

---

## Sprint Plans (Executable)

### Sprint 1: Foundation & Auth
**File:** `../sprint-1/plan.md`  
**Duration:** 2 weeks  
**Features:** Password reset (#5), RBAC audit (#3), Thin home dashboard (#8)  
**Foundation:** Production security validation, structured errors, error boundaries

### Sprint 2: Discovery & Polish
**File:** `../sprint-2/plan.md`  
**Duration:** 2 weeks  
**Features:** Dashboard polish (#8), Search improvements (#10), Media details (#12), Library grid (#9)  
**Foundation:** Backend refactor (split media service), design system expansion

### Sprint 3: Playback Excellence
**File:** `../sprint-3/plan.md`  
**Duration:** 2 weeks  
**Features:** Episode navigation (#16), Playback polish (#13), Subtitle errors (#17), HLS robustness (#20)  
**Foundation:** Player refactor, HLS session management, error recovery UX

---

## What's Deferred (Sprint 4+)

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

## How to Use These Plans

### Option A: Run with AI Team Orchestration
Follow the multi-chat workflow from `../AI_TEAM_GETTING_STARTED.md`:
1. Clone repo 3 times (producer, dev, qa)
2. Open separate VS Code windows
3. Execute sprints with dev team agents
4. QA playtests after each merge
5. Producer coordinates and merges PRs

### Option B: Execute Manually
Use the sprint plans as a roadmap for human developers:
1. Read `sprint-1/plan.md` task list
2. Work through tasks in order
3. Commit after each phase
4. Create PR when sprint is complete
5. Repeat for Sprint 2 and 3

---

## Timeline

| Sprint | Weeks | Deliverable |
|--------|-------|-------------|
| Sprint 1 | 1-2 | Auth security + thin dashboard |
| Sprint 2 | 3-4 | Full dashboard + discovery polish |
| Sprint 3 | 5-6 | Playback excellence + error recovery |

**Total: 6 weeks to MVP**

---

## Questions?

- See `PROJECT_BRIEF.md` for the complete project context
- See `AI_TEAM_GETTING_STARTED.md` for orchestration workflow
- See individual sprint plan files for detailed task breakdowns
