# Use SQLite for the Media Catalog

Yeen stores the **Media Catalog** in SQLite because Core Yeen should remain single-process and easy to self-host while still supporting better querying and indexing than JSON for media metadata. JSON file-backed storage remains acceptable for smaller account/progress/settings state, but media metadata needs database-style indexing as libraries grow.

Schema changes should use startup-safe idempotent schema creation and additive column/index helpers until non-additive Media Catalog migrations are needed. Introduce a versioned migration table when destructive or data-transforming migrations appear.
