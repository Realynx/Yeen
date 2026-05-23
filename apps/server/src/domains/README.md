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

Current domains:

- domains/core
- domains/auth
- domains/media
- domains/stream
- domains/subtitle
- domains/progress
- domains/system-settings
- domains/torrent

Grouped domain paths now contain the real service/controller implementation files.

Compatibility shim files have been removed. Import from `domains/*` paths directly.