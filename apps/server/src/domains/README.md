# Domain Grouping (Services and Controllers)

Use these folders as the primary navigation entrypoint for backend layers:

- domains/<domain>/<domain>.module.ts
- domains/<domain>/application/services
- domains/<domain>/application/dto
- domains/<domain>/application/types
- domains/<domain>/domain/entities
- domains/<domain>/presentation/controllers
- domains/<domain>/presentation/guards
- domains/<domain>/presentation/decorators
- domains/<domain>/infrastructure/*

Navigation and depth rules:

- Keep domain layers shallow and predictable.
- Place single runtime files directly in `application/services` or `infrastructure`.
- Use a subfolder only when it groups 2+ closely related files (for example `remote-metadata`, `filesystem`, `stores`, `resolvers`, `hls`).
- Avoid one-file wrapper folders that add an extra click with no grouping value.
- Keep cross-domain imports anchored from each domain root, not through compatibility shim paths.

Current domains:

- domains/core
- domains/auth
- domains/media
- domains/stream
- domains/broadcast
- domains/subtitle
- domains/progress
- domains/system-settings
- domains/addons
- domains/lifecycle

Grouped domain paths now contain the real service/controller implementation files.

Compatibility shim files have been removed. Import from `domains/*` paths directly.
