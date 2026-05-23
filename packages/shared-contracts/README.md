# @yeen/shared-contracts

Shared TypeScript contracts for server and web.

Initial scope:
- Common API error/result shape types
- Auth domain user/session types

Migration approach:
1. Move duplicated interfaces here.
2. Re-export from app-level type modules to keep callsites stable.
3. Incrementally replace local duplicates by domain.
