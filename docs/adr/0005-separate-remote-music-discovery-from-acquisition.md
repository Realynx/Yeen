# Separate remote music discovery from acquisition

## Status

Accepted

## Context

Music Mode needs two related capabilities that have different product and security boundaries:

- discover and enrich Tracks through remote music catalogs; and
- acquire audio from supported external sources and import it into a Music Location.

The first capability is useful to every Yeen installation. It supplies metadata, artwork, charts, and remote search results without requiring an external downloader. The second capability executes third-party tools, writes staged media to disk, and depends on source-specific credentials and policies. ADR 0001 already places download tooling outside Core Yeen.

## Decision

Core Yeen owns provider-neutral remote music contracts, remote search aggregation, local-library matching, discovery feeds, metadata-provider configuration, caching, and rate limiting. TheAudioDB is an optional Core remote metadata provider. Core supports TheAudioDB's documented default free API key and an Administrator-configured premium key.

The Downloader Add-on owns music acquisition. Source-specific integrations and operational workflows are maintained in the private implementation. Core does not document or orchestrate them.

Core exposes only generic add-on seams:

- a registry through which an add-on can contribute provider-neutral remote music sources;
- a remote-music-result action surface for add-on UI;
- typed Music Location discovery and local-media intake; and
- the existing bounded job, process, settings, and authorization capabilities.

Remote discovery never starts acquisition automatically. An authorized Account explicitly invokes an add-on action. Acquisition runs asynchronously, validates the selected source, writes to a staging path, finalizes atomically into a Music Location, and then invokes local-media intake. Tool resolution must be administrator-configurable or supplied by the signed add-on package; runtime self-updating and unverified executable downloads are excluded.

## Consequences

- Music search and Discover remain useful when the Downloader Add-on is absent.
- Core-only verification can omit every acquisition implementation.
- Additional metadata providers and acquisition add-ons can reuse the same provider-neutral contracts.
- The UI can show local matches and source provenance before an Account chooses an add-on action.
- The private add-on bears the operational and policy burden of external acquisition tools without coupling Core releases to them.

