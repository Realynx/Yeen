---
name: deep-refactor-solid-dry
description: 'Run an in-depth, behavior-preserving refactor to improve maintainability, readability, and code quality using SOLID and DRY principles. Use when code has grown messy after long iterations, with duplication, tight coupling, large classes/functions, or unclear responsibilities.'
argument-hint: 'Scope + goals + constraints (example: src/media services | reduce coupling and duplication | no API changes)'
user-invocable: true
disable-model-invocation: false
---

# In-Depth Refactor (SOLID + DRY)

## What This Skill Produces
- A prioritized refactor plan for a target scope.
- Incremental, behavior-preserving code changes.
- Validation results (tests, lint, type checks, build where relevant).
- A clear before/after architecture summary and remaining debt list.

## When To Use
- Long feature iterations have left modules hard to reason about.
- Code has duplication, mixed responsibilities, or hidden coupling.
- Readability and maintainability have degraded.
- You want a structured cleanup without rewriting everything.

## Inputs
- Scope: files, folders, modules, or layers to refactor.
- Goals: maintainability, readability, testability, lower complexity, reuse.
- Constraints: no API break, no schema change, keep behavior stable, timeline limits.

## Default Operating Mode
- Refactor mode: Conservative.
- Scope mode: Module-local first.
- Expansion rule: only widen to cross-layer changes after module-local cleanup is stable and validated.

## Procedure

1. Baseline and Guardrails
- Locate the target scope and its callers/dependencies.
- Run current checks (tests, lint, type checks, build as appropriate).
- Capture a baseline of failures, warnings, and risk hotspots.
- If test coverage is weak around changed behavior, add characterization tests first.

Completion check:
- There is a reproducible baseline command set and known starting state.

2. Smell and Risk Inventory
- Identify SOLID violations:
  - SRP: one unit handles multiple responsibilities.
  - OCP: frequent edits needed for new variants.
  - LSP: subtype behavior breaks caller expectations.
  - ISP: clients depend on methods they do not use.
  - DIP: high-level logic depends on concrete implementations.
- Identify DRY issues: repeated logic, duplicate condition trees, copy-pasted transformations.
- Rank opportunities by impact and risk.

Decision points:
- If risk is high, choose seam-first extraction and smaller slices.
- If duplication appears only twice and is still evolving, avoid premature abstraction.
- If public contracts are unstable, stabilize interfaces before deeper restructuring.

Completion check:
- A ranked candidate list exists with risk notes and expected value.

3. Refactor Strategy Design
- Build a step plan of 3-7 small, reversible slices.
- Start with module-local slices, then reassess whether cross-layer work is still necessary.
- For each slice, define: intent, touched files, validation command, rollback path.
- Prefer transformations such as:
  - Extract function/class/module for SRP.
  - Introduce interface and inject dependency for DIP.
  - Replace conditionals with strategy/polymorphism where OCP pressure is high.
  - Split broad interfaces to role-specific contracts for ISP.
  - Consolidate repeated logic into shared utilities for DRY.

Completion check:
- Every step has explicit success criteria and bounded change scope.

4. Execute Incrementally
- Apply one slice at a time.
- After each slice, run relevant validation.
- Keep naming, module boundaries, and error handling consistent.
- Do not mix feature behavior changes into refactor slices.

Decision points:
- If a slice unexpectedly changes behavior, stop and isolate it into a separate bug-fix path.
- If a planned abstraction increases complexity, revert and choose a simpler extraction.

Completion check:
- Each slice passes validation before moving to the next.

5. Final Quality Gate
- Re-run full checks for the touched project area.
- Verify behavior parity for critical flows.
- Confirm readability improvements:
  - Smaller focused units.
  - Reduced branching and cognitive load.
  - Clearer names and module responsibilities.
- Confirm maintainability improvements:
  - Lower coupling.
  - Better extension points.
  - Reduced duplication.

Completion check:
- No net regression in tests or static checks.
- Refactor goals and constraints are satisfied.

6. Handoff Summary
- Summarize changed modules and major structural improvements.
- Note tradeoffs and deferred cleanup opportunities.
- Provide recommended next cleanup batch.

## Output Format
When invoked, return results in this order:
1. Baseline findings and top risks.
2. Proposed step plan with rationale.
3. Executed changes and validation outcomes.
4. SOLID/DRY improvements achieved.
5. Remaining technical debt and next recommended steps.

## Practical Rules
- Favor clarity over clever abstractions.
- Default to conservative, behavior-preserving changes over broad rewrites.
- Keep edits localized and reversible.
- Preserve public contracts unless the prompt explicitly allows breaking changes.
- Prefer stable, test-backed seams before major structural movement.
