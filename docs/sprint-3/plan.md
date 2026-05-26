# Sprint 3: Playback Excellence

> **Sprint Goal:** Deliver rock-solid playback with seamless episode navigation, comprehensive error recovery, polished player controls, and robust HLS session management.

**Branch:** `feature/sprint-3`  
**Estimated effort:** 2 weeks (10 working days)  
**Features:** #16 (Episode navigation), #13 (Playback page polish), #17 (Subtitle error handling), #20 (HLS robustness)

---

## Scope

### Core Features (from top 50)
- **#16: Episode navigation** — Next Episode button, autoplay countdown, season/episode selector
- **#13: Playback page polish** — Smooth control fade, better scrubbing, timeline preview
- **#17: Subtitle support enhancements** — Error recovery, automatic language detection, better sync
- **#20: HLS streaming/transcoding robustness** — Error recovery, session cleanup, bandwidth adaptation hints

### Foundation Work
- **Player page refactor** — Extract components to stay under 400-line budget
- **HLS session lifecycle management** — Automatic cleanup on disconnect, session timeout
- **Error recovery UX** — Retry buttons, user-facing error messages for playback failures

---

## Prioritized Task List

| # | Task | Owner | Est | Description |
|---|------|-------|-----|-------------|
| 1 | Next Episode API | Sage | 1d | Add `/api/media/{id}/next-episode` endpoint returning next episode in series |
| 2 | Next Episode button | Nova | 1d | Add Next Episode button to player with autoplay countdown (10s) |
| 3 | Season/episode selector UI | Nova | 1.5d | Build dropdown/modal for season and episode navigation |
| 4 | Autoplay logic | Nova | 0.5d | Implement countdown timer with cancel button |
| 5 | Player controls refactor | Nova | 1d | Extract PlayerControls, Timeline, VolumeControl components |
| 6 | Control fade animation | Milo | 0.5d | Smooth fade-in/out on mouse movement with idle timeout |
| 7 | Timeline scrubbing polish | Nova | 1d | Better drag UX, preview on hover (thumbnail later) |
| 8 | HLS session cleanup | Sage | 1.5d | Add WebSocket or polling to detect disconnects, auto-cleanup FFmpeg processes |
| 9 | HLS error recovery API | Sage | 1d | Return structured errors with retry hints, segment availability checks |
| 10 | HLS error recovery UI | Nova | 1d | Show error messages with Retry button, auto-retry on transient errors |
| 11 | Subtitle error handling | Sage | 1d | Return structured errors for extraction failures, format conversion issues |
| 12 | Subtitle error UI | Nova | 0.5d | Show error messages in subtitle panel with retry option |
| 13 | Subtitle language detection | Sage | 0.5d | Auto-detect embedded subtitle languages via FFprobe |
| 14 | Design system: Modal component | Milo | 0.5d | Extract Modal for season/episode selector and error dialogs |
| 15 | E2E: Episode navigation | Ivy | 1d | Test Next Episode button, autoplay, and season selector |
| 16 | E2E: Error recovery | Ivy | 1d | Test HLS failure retry, subtitle extraction retry |
| 17 | Integration & polish | All | 1d | Bug fixes, TV remote navigation testing, responsive adjustments |

**Total estimated days:** 15d (with parallelization → 10 working days)

---

## Work Schedule

### Phase 1: Episode Navigation Backend & Frontend (Days 1-3)
**Tasks:** 1, 2, 3, 4
- Sage builds Next Episode API with series traversal logic
- Nova adds Next Episode button with autoplay countdown
- Nova builds season/episode selector UI

**Checkpoint:** Commit `sprint-3-phase-1: episode navigation complete`

### Phase 2: Player Refactor & Polish (Days 4-5)
**Tasks:** 5, 6, 7, 14
- Nova extracts PlayerControls, Timeline, VolumeControl components
- Milo adds smooth control fade animations
- Nova polishes timeline scrubbing UX
- Milo extracts Modal component

**Checkpoint:** Commit `sprint-3-phase-2: player refactor and control polish`

### Phase 3: HLS & Subtitle Error Recovery (Days 6-8)
**Tasks:** 8, 9, 10, 11, 12, 13
- Sage implements HLS session cleanup with disconnect detection
- Sage adds structured HLS and subtitle error responses
- Nova builds error recovery UI with retry buttons
- Sage adds subtitle language auto-detection

**Checkpoint:** Commit `sprint-3-phase-3: error recovery and HLS robustness`

### Phase 4: Testing & Polish (Days 9-10)
**Tasks:** 15, 16, 17
- Ivy writes E2E tests for episode navigation and error recovery
- All team members test on TV emulator and fix remote navigation issues
- Polish responsive breakpoints and accessibility

**Checkpoint:** Final commit `sprint-3: complete`, push to GitHub, create PR

---

## Success Criteria

- [ ] Next Episode button appears in player when watching episodes
- [ ] Autoplay countdown shows 10-second timer with cancel option
- [ ] Season/episode selector shows all episodes grouped by season with clear labels
- [ ] Player controls fade out after 3 seconds of mouse inactivity and fade in on movement
- [ ] Timeline scrubbing is smooth with visual preview of playback position
- [ ] HLS sessions auto-cleanup when browser tab closes or user navigates away
- [ ] HLS transcoding errors show user-facing messages with Retry button
- [ ] Subtitle extraction errors show messages in subtitle panel with retry option
- [ ] Subtitle language auto-detection populates language field from FFprobe metadata
- [ ] Player page and all extracted components are under 400 lines each
- [ ] E2E tests pass for episode navigation and error recovery
- [ ] TV remote navigation works smoothly (tested on Android TV emulator)
- [ ] CI passes (lint, build, tests, line-budget)

---

## What's NOT in This Sprint

| Feature | Reason |
|---------|--------|
| Chapter markers (#24 from top 50) | Requires chapter metadata extraction; deferred to Sprint 4+ |
| Timeline thumbnail preview | Infrastructure-heavy; deferred to Sprint 5+ |
| Bandwidth adaptation controls | HLS.js handles this; manual override deferred to Sprint 4+ |
| Picture-in-picture mode | Browser API support varies; deferred to Sprint 4+ |
| Audio track selection (#18) | Deferred to Sprint 4 as agreed in brainstorm |
| Quality selection (#19) | Deferred to Sprint 4 as agreed in brainstorm |

---

## Dependencies

- **Sprint 1 complete** — Requires structured error DTOs
- **Sprint 2 complete** — Requires polished UI foundation

---

## Risks

| Risk | Mitigation |
|------|------------|
| HLS disconnect detection is complex | Use heartbeat polling every 10s as fallback to WebSocket |
| Autoplay countdown annoys users | Add setting to disable autoplay in account preferences |
| Season selector modal is slow with 100+ episodes | Add virtualized list with react-window |
| Player controls overlap subtitle text | Add padding-bottom to video container when controls are visible |
| FFmpeg session cleanup fails on crash | Add cron job to clean up stale sessions every hour |

---

## Agent Prompt

```
Read PROJECT_BRIEF.md, then read docs/sprint-3/plan.md. Execute Sprint 3.

You are the Yeen dev team: Sage (backend), Nova (frontend), Milo (design).

First: git pull origin main && git checkout -b feature/sprint-3

Follow the 4-phase work schedule. Commit after each phase.
Close GitHub Issues in commits: "fix: description (Fixes #NN)"
Update docs/sprint-3/progress.md after each phase.
When done, push and create PR: git push origin feature/sprint-3

Follow Sections 12-14 of PROJECT_BRIEF.md for handoff protocol.
Use domain language from CONTEXT.md.
Refactor player page components FIRST before adding new features.
Test error recovery flows thoroughly — these are critical for user trust.

Take your time. Do it right.
```

---

## Notes

- Next Episode API should return 404 if no next episode exists (season finale or series end)
- Autoplay countdown should be cancellable with ESC key or by clicking cancel button
- Season selector should highlight current episode
- Control fade timeout should be configurable (default 3s, but allow 5s/10s in settings)
- HLS session cleanup should terminate FFmpeg gracefully (SIGTERM first, SIGKILL after 5s)
- Error recovery retry should use exponential backoff (1s, 2s, 4s, 8s, then give up)
- Subtitle language detection should map ISO 639-2 codes to readable names (eng → English)
- Modal component should trap focus and support ESC to close
