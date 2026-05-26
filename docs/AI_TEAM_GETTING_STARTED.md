# AI Team Orchestration — Getting Started

## ✅ What's Been Created

I've bootstrapped your Yeen MVP project with AI team orchestration:

1. **`PROJECT_BRIEF.md`** — Single source of truth for all AI agents across all chats
   - Contains architecture, tech stack, team roles, sprint status, security rules
   - Sections 12-14 define the cross-chat handoff protocol (critical for context survival)
   - Will be updated after every sprint

2. **`docs/brainstorm/00-brainstorm-prompt.md`** — Brainstorm session prompt
   - Defines 6 team members (Kira, Milo, Nova, Sage, Remy, Ivy) with distinct personalities
   - Sets up 3-phase debate: Free Ideation → Discussion → Sprint Proposals
   - Requires at least 2 genuine disagreements (prevents groupthink)

## 🎯 Next Steps — Multi-Chat Architecture

You'll run **parallel AI agent teams** in separate VS Code windows. Here's the workflow:

### Step 1: Run the Brainstorm (this chat or producer chat)

Run the brainstorm to validate MVP priorities and create sprint plans:

```
Read PROJECT_BRIEF.md and docs/brainstorm/00-brainstorm-prompt.md.
Execute the 3-phase brainstorm as described.
Create all output files in docs/brainstorm/.
```

This will produce:
- `01-free-ideation.md` — Raw pitches from each agent
- `02-discussion.md` — Debate transcript with disagreements
- `03-sprint-1-proposal.md` through `05-sprint-3-proposal.md` — Sprint concepts
- `06-team-vote.md` — Final vote
- `07-summary.md` — Executive summary

### Step 2: Create Sprint Plans (producer chat)

After brainstorm results are in, create detailed sprint plans:

```
Read PROJECT_BRIEF.md and docs/brainstorm/07-summary.md.
Create detailed sprint plans in docs/sprint-1/plan.md, docs/sprint-2/plan.md, etc.
Follow the sprint plan template from ai-team-orchestration skill.
Include prioritized task lists, work schedules, success criteria.
```

### Step 3: Clone the Repo for Each Team

**Windows PowerShell example:**

```powershell
# Clone for Dev Team
cd C:\Users\Hanny\source\repos
git clone https://github.com/Realynx/Yeen.git Yeen-dev

# Clone for QA Team
git clone https://github.com/Realynx/Yeen.git Yeen-qa

# Clone for Producer (coordination hub) - or use your existing clone
git clone https://github.com/Realynx/Yeen.git Yeen-producer
```

### Step 4: Open Separate VS Code Windows

1. **Producer window:** `C:\Users\Hanny\source\repos\Yeen-producer`
   - Branch: `main`
   - Role: Review PRs, merge branches, triage issues, coordinate teams

2. **Dev Team window:** `C:\Users\Hanny\source\repos\Yeen-dev`
   - Branch: `feature/sprint-1` (create before starting)
   - Role: Build features, fix bugs, push to GitHub

3. **QA window:** `C:\Users\Hanny\source\repos\Yeen-qa`
   - Branch: `feature/qa-1` (create before starting)
   - Role: Playtest, file GitHub Issues, write sign-off docs

### Step 5: Execute Sprints

**Dev Team prompt:**
```
Read PROJECT_BRIEF.md, then read docs/sprint-1/plan.md. Execute Sprint 1.

First: git pull origin main && git checkout -b feature/sprint-1

Close GitHub Issues in commits: "fix: description (Fixes #NN)"
Update docs/sprint-1/progress.md after each phase.
When done, push and create PR: git push origin feature/sprint-1
Follow Sections 12-14 of PROJECT_BRIEF.md.
```

**You (CEO) are the message bus:**
- Copy messages between teams when needed
- Dev team reports blockers → you notify Producer
- QA files issues → you notify Dev team
- Producer approves PRs → you merge via GitHub

### Step 6: QA Sign-Off

After dev merges Sprint 1:

**QA Team prompt:**
```
Read PROJECT_BRIEF.md. You are Ivy (QA).
Sprint 1 is merged to main. Do full playthrough.
File bugs as GitHub Issues. Write docs/qa/sprint-1-signoff.md.
```

### Step 7: Repeat for Sprint 2, 3, 4...

## 🔄 Context Recovery

If any chat gets long (>100 messages):

1. Update `docs/sprint-N/progress.md` with current status
2. Update `PROJECT_BRIEF.md` sections 7+8
3. Write `docs/sprint-N/done.md`
4. Start fresh chat with cold-start prompt:

```
Read PROJECT_BRIEF.md and docs/sprint-N/progress.md.
Continue from where it left off.
```

## 📋 Team Roles Quick Reference

| Agent | Name | Chat Type | Focus |
|-------|------|-----------|-------|
| Producer | **Remy** | @ai-team-producer | Plans, merges, never codes |
| Product | **Kira** | @ai-team-dev | UX, flows, fun factor |
| Art | **Milo** | @ai-team-dev | CSS, animations, polish |
| Frontend | **Nova** | @ai-team-dev | React, components, state |
| Backend | **Sage** | @ai-team-dev | API, auth, database |
| QA | **Ivy** | @ai-team-qa | Testing, bugs, sign-off |
| DevOps | **Dash** | (on demand) | CI/CD, deployment |

## 🚀 Ready to Start?

**Option A: Run brainstorm in this chat**
```
I'll execute the brainstorm now. Read PROJECT_BRIEF.md and docs/brainstorm/00-brainstorm-prompt.md and run the 3-phase brainstorm.
```

**Option B: Set up producer chat first**
1. Open a new GitHub Copilot chat
2. Paste: `Read PROJECT_BRIEF.md and docs/brainstorm/00-brainstorm-prompt.md. Execute the 3-phase brainstorm.`
3. Review results, then create sprint plans
4. Come back here when ready to execute sprints

## 📚 References

- `PROJECT_BRIEF.md` — The bible
- `C:\Users\Hanny\.agents\skills\ai-team-orchestration\references\` — Templates and anti-patterns
- CONTEXT.md — Domain language (all agents must use this)
- docs/codebase/ — Architecture, stack, conventions

---

**You are the CEO.** Your job is to carry messages between teams and approve their work. The agents do the heavy lifting. Let's build Yeen! 🎬
