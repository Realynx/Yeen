# Yeen MVP Brainstorm — Team Debate

You are orchestrating a brainstorm with the Yeen Media Server team.
Each member has a DISTINCT voice, perspective, and expertise.
They should DEBATE, build on each other's ideas, and CHALLENGE weak concepts.
This is a planning session to validate the MVP feature priorities (1-20) and decide how to break them into achievable sprints.

## Team Members

### Kira (Product Designer)
- Thinks about: user delight, accessibility, "would this be fun to use?"
- Tendency: pushes for features that feel seamless and joyful, pushes back on anything that feels like admin homework or confusing flows
- Perspective: Multi-device UX is hard — TV remote navigation feels completely different from mouse/keyboard

### Milo (Art/Visual Director)
- Thinks about: visual cohesion, design system, "does this look and feel polished?"
- Tendency: wants every screen beautiful and consistent, sometimes at odds with "just ship it" mentality
- Perspective: Netflix didn't become Netflix by shipping ugly grids and broken player controls

### Nova (Frontend Engineer)
- Thinks about: component architecture, state management, "can we actually build this with React?"
- Tendency: pragmatic, flags scope risks, suggests simpler alternatives when complexity explodes
- Perspective: The existing codebase has several files near 400-line budget — we need to refactor while building new features

### Sage (Backend Engineer)
- Thinks about: data model, API design, security, "where do secrets live and what breaks at scale?"
- Tendency: security-first, sometimes over-engineers, good at spotting edge cases
- Perspective: Current JSON file stores for accounts/progress are MVP debt — SQLite migration should happen before we scale user count

### Remy (Producer)
- Thinks about: timeline, scope, "will this ship in a reasonable timeframe?"
- Tendency: cuts scope aggressively, keeps the team focused on deliverables, blocks feature creep
- Perspective: Features 1-20 are still a LOT — we need to break this into 3-4 sprints with clear success criteria

### Ivy (QA Engineer)
- Thinks about: testability, edge cases, "what breaks when the user does X?"
- Tendency: pessimistic about reliability, asks uncomfortable "what if" questions
- Perspective: HLS transcoding failures and subtitle extraction errors are silent killers — we need error recovery UX, not just happy-path features

## Context

The user has identified the **top 50 features** for a self-hosted media streaming platform and prioritized **features 1-20 as the MVP**:

1. User authentication
2. Admin account bootstrap
3. Role-based access control
4. Invite-only signup
5. Password reset/change
6. Media library scan
7. Multiple media locations
8. Home dashboard
9. Library grid/list view
10. Search
11. Filters and sorting
12. Media details page
13. Playback page
14. Resume playback
15. Watch progress tracking
16. Episode navigation
17. Subtitle support
18. Audio track selection
19. Quality selection
20. HLS streaming/transcoding

**Current codebase state:**
- Most of these features already exist in some form (see `PROJECT_BRIEF.md` Section 8)
- But: several are incomplete, have rough edges, lack error recovery, or need refactoring
- Line-budget guardrail (400 lines) is being violated by some core files
- Some features (torrent/download code) are implementation drift that should be extracted per ADR-0001

## Brainstorm Task

Run a 3-phase brainstorm:

### Phase 1 — Free Ideation (30 minutes)
Each agent pitches their perspective on:
- **Which features 1-20 need the most work?** (rank your top 5)
- **What's missing or broken in the current implementation?**
- **What technical debt should we tackle alongside feature work?**

Wild ideas welcome. No filtering. Be specific about what you'd prioritize and why.

### Phase 2 — Discussion & Refinement (45 minutes)
Agents debate, combine, and critique ideas.
- Reference each other by name: "Kira, that's great but..."
- Push back on weak points
- **At least 2 genuine disagreements** must emerge
- Converge on 3-4 **sprint themes** that group features logically

Possible sprint themes to debate:
- Sprint 1: Auth & Onboarding (features 1-5)
- Sprint 2: Library & Discovery (features 6-12)
- Sprint 3: Playback & Progress (features 13-16)
- Sprint 4: Media Quality & Streaming (features 17-20)

OR different groupings — challenge the defaults!

### Phase 3 — Final Sprint Proposals (30 minutes)
3-4 polished sprint concepts.
Each sprint proposal includes:
- **Name** (catchy, clear)
- **Scope** (which features 1-20)
- **Success criteria** (testable)
- **Estimated effort** (story points or days)
- **Risks** (what could go wrong)
- **Dependencies** (what must be done first)

Team vote with brief justification from each voter.

## Output Files

Write separate markdown files to `docs/brainstorm/`:

1. `01-free-ideation.md` — raw pitches from each agent
2. `02-discussion.md` — debate transcript with disagreements
3. `03-sprint-1-proposal.md` — first sprint concept
4. `04-sprint-2-proposal.md` — second sprint concept
5. `05-sprint-3-proposal.md` — third sprint concept (optional 4th)
6. `06-team-vote.md` — final vote results with justifications
7. `07-summary.md` — executive summary for the CEO (the human)

## Critical Rules

- **Name each agent explicitly** in their sections
- **Require at least 2 genuine disagreements** in Phase 2
- **Debate sprint groupings** — don't just accept the defaults
- **Be specific** — cite actual files, components, API endpoints, and technical concerns from the codebase
- **Consider existing code** — read `PROJECT_BRIEF.md`, `CONTEXT.md`, and `README.md` for current state
