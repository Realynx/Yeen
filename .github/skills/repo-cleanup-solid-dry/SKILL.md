---
name: repo-cleanup-solid-dry
description: 'Long-running repository cleanup workflow that repeatedly scans for oversized source files (>400 lines), refactors one file at a time with SOLID and DRY principles, runs validation after meaningful changes, and loops until all eligible files are under budget or explicitly justified.'
argument-hint: 'Scope + exclusions + line budget + validation commands (example: apps/**,packages/** | exclude migrations/build/generated | 400 | npm run lint && npm run test && npm run typecheck)'
user-invocable: true
disable-model-invocation: false
---

# Repo Cleanup: Long-Running SOLID/DRY Refactor

## What This Skill Produces
- A repeatedly refreshed TODO list of oversized source files.
- Safe, incremental refactors that reduce file size and improve structure.
- Validation logs for tests, linting, and type checks run during cleanup.
- A final completion report with justified exceptions.

## When To Use
- You need sustained repository cleanup, not a one-off refactor.
- Oversized files are slowing delivery, review quality, or maintainability.
- You want behavior-preserving refactors with strict incremental safety.

## Inputs
- Scope: folders or globs to include in scanning.
- Line budget: default 400 lines unless user specifies otherwise.
- Validation commands: tests, lint, type checks, and build checks available in the repo.
- Optional exclusions beyond defaults.

## Eligibility Rules
Treat as eligible source files by default:
- Application/library source files (for example ts, tsx, js, jsx, py, go, rs, java, cs).
- Test files only if they are true source artifacts and not generated snapshots.

Always exclude:
- Generated code, vendor directories, lock files, build outputs, migrations, and minified files.
- Binary artifacts and compiled bundles.

If uncertain whether a file is generated/vendor, do not refactor it until confirmed.

## Core Constraints
- Preserve runtime behavior and public APIs unless fixing a clear correctness bug.
- Prefer small, testable extractions over broad rewrites.
- Remove duplication only when safe and stable.
- Do not introduce abstractions without clear reuse or boundary value.
- Do not stop after first pass; always rescan and continue.
- If pre-existing failures block full validation, document baseline failures and continue where safe.

## Operating Loop

1. Establish Baseline and Guardrails
- Identify validation commands available in the workspace.
- Run baseline checks and capture existing failures.
- Confirm include/exclude patterns and line budget.

Completion check:
- Baseline validation state is recorded.
- Scan rules and budget are explicit.

2. Scan Repository for Oversized Files
- Enumerate eligible source files in scope.
- Count lines per file and select files above budget.
- Build a TODO list sorted by highest line count first.

Completion check:
- A current TODO list exists with file path, line count, and status.

3. Process TODO List One File at a Time
For each file:
- Understand current responsibilities before editing:
  - Public exports and externally used APIs.
  - Main execution paths and side effects.
  - Couplings to other modules.
- Plan minimal extraction slices:
  - Split unrelated responsibilities into focused modules/classes/functions.
  - Consolidate duplicated logic where behavior is equivalent.
  - Keep the original contract stable.
- Apply incremental edits and keep each slice reversible.
- Update imports/exports/references/tests as needed.
- Run meaningful validation after each slice or grouped set of safe slices.
- Re-measure file line count and mark status:
  - Done: file now within budget.
  - Carry forward: improved but still over budget.
  - Exception: intentionally over budget with written justification.

Decision points:
- If a proposed extraction risks behavior drift, reduce scope and choose a smaller seam.
- If duplication appears temporary or low-confidence, defer abstraction.
- If a bug is discovered, fix only when required for correctness and document behavior impact.

Completion check:
- File was refactored safely, validated, and status was updated in the TODO list.

4. End-of-Pass Rescan
- After completing the current TODO list, run a fresh full scan.
- Create a new TODO list from remaining oversized files.
- Repeat processing until no eligible file remains over budget.

Completion check:
- Either zero eligible oversized files remain, or each remaining file has explicit exception rationale.

5. Final Report
- Provide a concise summary of:
  - Files refactored.
  - New modules/files created.
  - Validation commands run and outcomes.
  - Any files intentionally left above budget and why.

## Definition of Done
- Repository has been rescanned after each full pass.
- No eligible source files remain above the configured line budget,
  OR every remaining exception is clearly justified.

## Output Format
When invoked, respond in this order:
1. Baseline and scan configuration.
2. Current oversized-file TODO list.
3. Per-file refactor progress and validation outcomes.
4. End-of-pass rescan results.
5. Final completion summary with justified exceptions.

## Practical Heuristics
- Prioritize highest-impact oversized files first.
- Prefer extracting pure logic before moving stateful side effects.
- Keep naming and module boundaries consistent with repo conventions.
- Avoid combining unrelated refactors in one step.