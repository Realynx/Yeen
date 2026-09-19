# @yeen/addon-sdk

Public contracts for building optional Yeen add-ons. Add-on implementations do
not belong in Core Yeen; this package contains only the package format and the
small host-facing registration shapes.

An installable package is a ZIP containing:

- `yeen-addon.json` — package identity, compatibility, and entrypoints
- `integrity.json` — a canonical, sorted SHA-256 inventory of every payload file
- `signature.json` — an Ed25519 signature over the exact `integrity.json` bytes
- prebuilt server and/or web bundles

Uploaded packages are never allowed to run package-manager install scripts.
Bundle non-host dependencies into the entrypoint files before packing.

Server entrypoints return `{ nestModules }`; the SDK describes those module
constructors without importing Nest. Browser entrypoints may default-export an
initializer or expose a named `register(context)` method. The browser context
registers custom-element routes, navigation, settings surfaces, media actions,
preparation surfaces, and scoped styles without coupling an add-on to React.

See `scripts/addons/README.md` for the authoring commands.
