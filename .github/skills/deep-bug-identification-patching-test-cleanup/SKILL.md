---
name: deep-bug-identification-patching-test-cleanup
description: 'Long-running autonomous bug cleanup workflow for deep bug identification, focused patching, regression test cleanup, and repeated repository rescans until no meaningful bug candidates remain.'
argument-hint: 'Scope + exclusions + validation commands + risk focus (example: apps/**,packages/** | exclude generated,deploy,data,artifacts | npm run test && npm run lint && npm run typecheck | null,async,race,error handling)'
user-invocable: true
disable-model-invocation: false
---

# Deep Bug Identification, Patching, and Test Cleanup

## What This Skill Produces
- A repository-wide bug candidate TODO list with visible status tracking.
- Focused bug fixes that preserve behavior unless current behavior is clearly incorrect.
- Regression tests that reproduce each fixed bug and prevent recurrence.
- Validation evidence from relevant tests, lint, type checks, and formatting runs.
- A final completion report listing bugs found, files changed, tests updated, commands run, and remaining risks.

## When To Use
- After heavy code changes where fragile behavior or regressions are likely.
- When you need a long-running autonomous cleanup session, not a one-off patch.
- When bug fixes must be evidence-backed with tests and quality checks.

## Inputs
- Scope to inspect (folders, modules, or globs).
- Exclusions (generated folders, artifacts, migrations, fixtures that should not be edited).
- Validation commands available in the repository.
- Priority risk areas (for example async flows, auth boundaries, serialization, platform-specific paths).

## Guardrails
- Read and understand each target file before editing.
- Fix real bugs and fragile behavior; avoid cosmetic rewrites.
- Keep patches small and focused.
- Apply SOLID, DRY, KISS, and separation-of-concerns principles while fixing bugs.
- Preserve existing public APIs unless an API change is required for correctness.
- Keep behavior backward compatible unless existing behavior is clearly incorrect.
- Do not introduce new dependencies unless clearly justified.
- Do not perform large unrelated refactors.
- Do not edit generated files unless required for a confirmed bug.
- Do not modify secrets, environment files, lockfiles, or unrelated configuration files.

## TODO Tracking Rules
Maintain a visible TODO list throughout execution.

Each TODO item should include:
- Area or file path.
- Bug hypothesis and risk type.
- Status: not-started, in-progress, completed, blocked.
- Evidence gathered.
- Fix summary (if changed).
- Test updates (or explicit reason tests were unnecessary).

Mark an item completed only after:
- Code was patched, and
- Tests were added or updated, or a clear, explicit test exception is documented.

## Operating Loop

1. Repository Scan and Baseline
- Scan repository structure and identify high-risk domains.
- Detect available test, lint, type-check, and formatting commands.
- Run baseline checks when practical to capture pre-existing failures.
- Record baseline failures so new failures can be distinguished.

Completion check:
- Scope, exclusions, and validation command set are explicit.
- Baseline state is recorded.

2. Build Initial TODO List
- Create an initial candidate list of files and areas likely to contain bugs.
- Prioritize by risk and blast radius (critical paths first).
- Include at least one scanning task for unread or under-tested files.

Completion check:
- A visible TODO list exists with priority and status.

3. Investigate One TODO Item at a Time
- Read target file(s), nearby dependencies, and nearby tests before editing.
- Validate whether the bug is real and reproducible.
- Identify root cause, edge cases, and affected call paths.

Decision points:
- If issue is not a real bug, document why and mark item completed with no code change.
- If issue is real but high-risk to patch broadly, choose a smaller seam and reduce patch scope.
- If issue reveals adjacent risk, add a new TODO item instead of broadening the current patch.

Completion check:
- Root cause and patch scope are explicit before editing.

4. Apply Focused Patch
- Implement the minimal safe fix.
- Keep interfaces stable unless correctness requires change.
- Improve local structure only as needed to support the fix.
- Ensure error handling and invalid-state handling are explicit.

Decision points:
- If a fix appears to require broad redesign, split into a safe immediate patch plus follow-up TODO.
- If behavior changes intentionally, document why previous behavior was incorrect.

Completion check:
- Patch is narrowly scoped and aligned to root cause.

5. Add or Update Regression Tests
- Add or update unit tests that reproduce the bug.
- Add nearby edge-case tests when useful.
- Ensure tests would fail before the fix and pass after the fix.
- Prefer targeted unit tests over broad integration tests unless integration behavior is what broke.

Test exception rule:
- Only skip tests if no test framework exists or the issue is not reasonably testable.
- If skipped, document a concrete reason and mark residual risk.

Completion check:
- Regression coverage exists for the fixed bug, or an explicit test exception is documented.

6. Run Validation Commands
- Run relevant formatter, linter, type checks, and tests.
- If command fails, investigate and fix the underlying issue when related to the current change.
- Do not ignore failures; distinguish new failures from baseline failures.

Decision points:
- If unrelated pre-existing failures block full validation, document them and continue safely with targeted checks.
- If new failures appear, resolve before marking TODO item completed.

Completion check:
- Validation results are recorded for the current patch.

7. Update TODO and Continue
- Mark item completed only when patch plus testing requirements are satisfied.
- After finishing the current TODO list, rescan for additional unread or under-tested files.
- Add a new TODO item that continues repository scanning.
- Repeat until full inspection is complete or no meaningful bug candidates remain.

Completion check:
- Loop continues until rescans produce no meaningful new bug candidates.

8. Final Completion Report
Produce a concise final summary with:
- Bugs found.
- Files changed.
- Tests added or updated.
- Commands run and outcomes.
- Remaining risks and follow-up recommendations.

## Bug-Finding Checklist
- Null, undefined, or missing-value handling.
- Incorrect async and await usage.
- Unhandled promise rejections.
- Race conditions or stale state.
- Incorrect error handling.
- Incorrect validation.
- Incorrect authorization or permission checks.
- Off-by-one errors.
- Incorrect date and time handling.
- Incorrect path, casing, or OS-specific assumptions.
- Incorrect serialization or deserialization.
- Incorrect dependency injection or lifecycle usage.
- Broken edge cases around empty arrays, missing objects, invalid IDs, duplicate values, or failed network or database calls.
- Tests that pass accidentally without asserting meaningful behavior.

## Definition of Done
This skill is complete only when:
- All initially identified TODO items are completed.
- Additional scans no longer reveal meaningful unread bug candidates.
- All patched bugs have regression tests (or documented test exceptions).
- Relevant tests, linters, and type checks pass, or remaining failures are documented with clear explanations.
- Final completion report is produced.

## Output Format
When invoked, present work in this order:
1. Baseline setup and repository scan scope.
2. Current visible TODO list.
3. Current in-progress item investigation and root cause.
4. Patch summary.
5. Test updates and results.
6. Validation command outcomes.
7. Rescan findings and new TODO additions.
8. Final completion report.

## Practical Heuristics
- Prefer deterministic reproduction steps before patching.
- Keep one bug fix per patch whenever possible.
- Add TODO items for related risks instead of widening active changes.
- Prefer straightforward logic over clever abstractions.
- Keep each cycle reversible, validated, and documented.
