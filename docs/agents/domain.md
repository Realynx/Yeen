# Domain docs

This is a single-context repository. Engineering skills must use the project domain language when exploring, designing, testing, and creating issues.

## Read before exploring

- Read `CONTEXT.md` at the repository root.
- Read ADRs under `docs/adr/` that affect the area being changed.
- If a referenced file does not exist, proceed silently.

## Use the glossary vocabulary

Use terms exactly as defined in `CONTEXT.md`. In particular, distinguish **Core Yeen** from the optional **Downloader Add-on** and do not replace those terms with ad hoc synonyms.

If a required concept is missing, first reconsider whether existing domain language already describes it. If the gap is real, record it through the domain-documentation workflow.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, surface the conflict explicitly instead of silently overriding the decision.

Example:

> Contradicts ADR-0001 (Keep downloader functionality outside Core Yeen) — but worth reopening because…
