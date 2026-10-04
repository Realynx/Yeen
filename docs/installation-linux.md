# Native Linux installation

Yeen's native installer targets systemd distributions. Debian and Ubuntu are
the primary path; Fedora/RHEL-style hosts are supported when the required Node
22+, FFmpeg, and systemd packages are available. Both x64 and arm64 use the
same release archive and install native npm dependencies on the host.

## Fresh install

The default installation path downloads and verifies the latest GitHub Release:

```bash
curl -fsSL https://raw.githubusercontent.com/Realynx/Yeen/main/deployment/scripts/install-github-release.sh | sudo bash
```

Requires curl, sudo, and systemd. The bootstrap installs unzip if missing;
the verified installer provisions Node.js 22 and available FFmpeg packages.
Prompts read from the terminal even when the script arrives through a pipe.
No Docker or source checkout is needed.

### Install a previously downloaded archive

Download a release ZIP and its SHA-256 file, then run the packaged installer as
root:

```bash
sudo bash deployment/scripts/install.sh \
  --archive /tmp/yeen-v1.2.3.zip \
  --sha256 '<64-character release checksum>' \
  --release-id 'v1.2.3-<checksum-prefix>'
```

The interactive flow asks for the public browser origin, administrator email,
display name, and password. Password input is not echoed. The installer creates
a random 96-character JWT secret, restricted shared directories, a systemd
service, and the initial administrator. After account creation is verified, it
removes the plaintext bootstrap password from `yeen.env`, restarts Yeen, and
checks `/api/health` again.

For unattended setup, pass ordinary values as flags and the password through a
protected environment variable or root-owned mode-0600 file:

```bash
sudo env YEEN_ADMIN_PASSWORD="$SECRET_FROM_YOUR_VAULT" \
  bash deployment/scripts/install.sh \
  --archive /tmp/yeen-v1.2.3.zip \
  --sha256 "$SHA256" \
  --release-id "v1.2.3-${SHA256:0:12}" \
  --base-url https://media.example.com \
  --admin-email root@example.com \
  --admin-name 'Media Admin' \
  --media-library /srv/media \
  --non-interactive
```

`--admin-password-file` rejects symlinks, files not owned by the installing
user, and files with any group/world permission bits.

## Upgrade and adoption guarantees

Running the same command upgrades an existing installation. The installer uses
this precedence:

1. Existing `/opt/yeen/shared/data`, `yeen.env`, and `addons` remain authoritative.
2. If shared state is absent, `/var/www/yeen/data` and `/var/www/yeen/.env` are adopted in place.
3. Legacy `data/addons` is adopted separately so private packages and registry state survive.
4. Only a genuinely empty installation receives administrator bootstrap values.

Release ZIPs are rejected if they contain `data`, `.env`, or SQLite runtime
files. Before code cutover, existing JSON and SQLite state is validated and
backed up. Code, the systemd unit, and updater integration files are rolled back
if the new release fails health checks. Existing accounts, passwords, settings,
watch progress, media metadata, add-ons, trust policy, and environment values
are never replaced by an upgrade.

Persistent paths:

- `/opt/yeen/shared/data` — accounts, settings, progress, subtitles, SQLite metadata
- `/opt/yeen/shared/addons` — private Add-on Packages and registry state
- `/opt/yeen/shared/yeen.env` — production environment, mode `0640`
- `/opt/yeen/shared/backups` — pre-cutover backups, mode `0700`

Use `YEEN_DEPLOY_ROOT`, `YEEN_LEGACY_ROOT`, `YEEN_SERVICE_NAME`,
`YEEN_SERVICE_USER`, and `YEEN_SERVICE_GROUP` to customize the layout.

Run the deterministic layout and syntax suite with:

```bash
npm run test:install
```
