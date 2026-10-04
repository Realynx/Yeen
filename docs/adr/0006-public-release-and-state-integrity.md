# Public release isolation and state integrity

## Status

Accepted.

## Decision

Core Yeen releases contain only Core implementation and generic add-on seams.
Private operator orchestration and private packages are not inputs to public
packaging. Public verification checks tracked and unignored paths, then compiles
actual source without rewriting it. Packaging repeats the boundary check on the
final deployment tree. Existing installed Add-on Packages survive upgrades, but
public releases never stage a private package or change publisher trust.

JSON-backed state remains appropriate for smaller single-process stores under
ADR 0002. One atomic JSON writer handles secure temporary files, flush, rename,
and cleanup. Stores coordinate their first load, initialize only absent files,
propagate corruption/read failures, and allow later saves after write failures.
This is per-document durability, not a multi-document transaction or a guarantee
against every filesystem/power failure.

Account recovery cannot expose a credential to an unauthenticated requester.
Until verified out-of-band delivery exists, Administrators reset Account passwords
through the existing authorized account-management flow. Public recovery responses
are uniform, issue no token, and reject legacy self-service reset tokens.

## Consequences

- Private workflows must be maintained in a separate private checkout.
- Current-tree checks do not sanitize Git history or previously published artifacts.
- Broken JSON documents require operator repair instead of silent data loss.
- Losing access to the only Administrator requires operator recovery from a backup;
  there is no unauthenticated password-reset bypass.
- Account Invite transactions remain a separate architectural concern because they
  span persisted Accounts and invitations; atomic document replacement alone is
  not a transaction across both.
