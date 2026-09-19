# Core updates

Yeen can check GitHub Releases from the administrator portal and request a
newer Core release. It never replaces its own files inside the web process.
The supported in-app update target is the Linux systemd installation under
`/opt/yeen`.

## Release contract

Each release must publish all three assets for the same semantic version:

- `yeen-v<version>.zip`
- `yeen-v<version>.zip.sha256`
- `yeen-v<version>.release.json`

The updater rejects drafts, downgrades, incomplete asset sets, mismatched
checksums or metadata, unexpected repository URLs, oversized downloads, and
redirects outside GitHub-controlled storage. Stable is the default channel;
set `YEEN_UPDATE_CHANNEL=prerelease` to opt into prereleases.

## systemd setup

Install `deployment/systemd/yeen-update@.service`, install the sudoers fragment
as `/etc/sudoers.d/yeen-update` with mode `0440`, and validate it with
`visudo -cf /etc/sudoers.d/yeen-update`. The Yeen service account may only start
a UUID-named update unit. The service-owned request contains only the UUID and
requested version and is explicitly untrusted. The root unit ignores any
service-owned ZIP, path, checksum, or release metadata. It independently
downloads the exact asset trio from the root-configured GitHub repository into
a bounded root-owned incoming directory, then revalidates channel policy,
installed-version ordering, repository/tag/path/origin, checksum, and metadata
before calling the existing release installer.

Privileged job status is written under `/opt/yeen/shared/update-status`, owned
by `root` and readable by the Yeen service group. It is separate from the
service-writable request staging directory.

The installer stages code while Yeen remains online, validates production data,
backs up SQLite and shared runtime data, atomically changes the `current`
release link, restarts the service, and checks both API and web health. A failed
health check restores the previous code release automatically. Runtime data,
accounts, settings, SQLite databases, add-ons, and `yeen.env` remain under
`/opt/yeen/shared` and are never archive-swapped.

Graceful update waits for active Playback to drain before starting the external
unit. Instant update hands off immediately and may interrupt Playback.

## Docker

The server detects Docker and disables in-process replacement and systemctl.
Use the deployment's normal image workflow instead:

```sh
docker compose pull && docker compose up -d
```
