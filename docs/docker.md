# Docker and Podman deployment

Tagged releases publish `ghcr.io/realynx/yeen` for `linux/amd64` and
`linux/arm64`. The same image runs through Docker Engine on Linux and Docker
Desktop on macOS or Windows.

The image contains compiled Core Yeen only. Runtime state is stored under
`/opt/yeen/shared`, which the supplied Compose file maps to the `yeen-shared`
named volume. The image contains no account data, media index, installed
add-ons, `.env`, JWT secret, or administrator password.

## Quick install

```bash
curl -fsSL https://raw.githubusercontent.com/Realynx/Yeen/main/deployment/scripts/install-compose.sh | bash -s -- --engine docker --media /mnt/media
```

Use `--engine podman` for Podman. Both engines use the same Compose specification;
[Podman requires an external Compose provider](https://docs.podman.io/en/latest/markdown/podman-compose.1.html).
The installer requires Bash, curl, and openssl and refuses to overwrite existing
configuration. Use `--directory` to choose a directory other than `~/yeen`.
Same-origin browser access needs no CORS override; configure `CORS_ORIGIN` only
when using a separate trusted web origin. For a versioned bootstrap, set
`YEEN_COMPOSE_REF` to a published tag and pin `YEEN_VERSION` in `.env`.

## Start from GHCR manually

Download `deployment/docker/compose.yml` and `.env.example` from the matching
release packet, then from that directory:

```bash
cp .env.example .env
```

Set `YEEN_MEDIA_PATH` to an existing host directory. Replace `JWT_SECRET`, `DEFAULT_ADMIN_PASSWORD`, and `CORS_ORIGIN` in `.env`.
For a local Docker Desktop install, `CORS_ORIGIN=http://localhost:4000` is
correct. For another host or reverse proxy, use the exact browser-facing
origin. Generate a JWT secret with:

```bash
openssl rand -hex 32
```

Start or upgrade:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

Sign in once and verify the administrator Account works. Then delete
`DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_NAME`, and `DEFAULT_ADMIN_PASSWORD` from
the host `.env` file and recreate the container:

```bash
docker compose up -d --force-recreate
```

The Account and password hash persist in `yeen-shared`; the one-time plaintext
bootstrap password must not remain in the Compose environment or host file.

Set `YEEN_VERSION=v1.0.0` in `.env` to pin a release. `latest` follows the
newest stable tagged image. Compose preserves the named volume during image
updates; do not use `docker compose down --volumes` unless you intend to delete
Yeen's persistent state.

## Media mounts

The base Compose file mounts `YEEN_MEDIA_PATH` read-only at `/media` and rejects
missing host paths. Add more drives with an override. The named data volume is
independent from these media mounts. Do not put the data volume inside a media drive.

The application runs as UID/GID 1000 inside the image. Grant that identity read
and directory traversal access to media. With rootless Podman, container UID 1000
maps into the host's subordinate UID range; use the mapped identity in filesystem
ACLs (inspect with `podman unshare cat /proc/self/uid_map`). Do not recursively
change ownership of existing media just to start the container. On SELinux hosts,
use a suitable shared label (`:z`) on dedicated media bind mounts, or an existing
container-readable label according to your host policy. Named volumes are managed
by the engine. GPU passthrough requires an engine-specific override.

See the [Compose bind-mount reference](https://docs.docker.com/reference/compose-file/services/#volumes).

Copy `compose-media.example.yml`, replace `/path/to/media`, and include it as an
override:

```bash
docker compose -f compose.yml -f compose-media.example.yml up -d
```

Docker Desktop users must first share the host media directory with Docker.
Paths in Yeen settings are container paths such as `/media/Movies`, not Windows
drive letters or macOS host paths. The example is read-only; change `:ro` only
when filesystem organization features require write access.

## Build the downloaded packet locally

Run `npm run build:deploy` first if building from a source checkout. The release ZIP is platform-neutral and includes a runtime Dockerfile. Extract
it, copy `.env.example` to `.env` under `deployment/docker`, and run from the
packet root:

```bash
docker compose \
  -f deployment/docker/compose.yml \
  -f deployment/docker/compose.local-build.yml \
  up -d --build
```

Native Node/systemd installation and containers use the same Core environment
names for CORS, JWT, initial administrator credentials, media locations,
FFmpeg, subtitles, and add-ons.

The image and supplied Compose service set `YEEN_DEPLOYMENT_MODE=docker`.
The administrator update panel therefore reports the operator-safe upgrade
command, `docker compose pull && docker compose up -d`; it never attempts a
systemd restart or in-container self-replacement.

Replace `docker compose` with `podman compose` throughout for Podman. Keep the
same environment file and explicit `-f` arguments on every update. Automatic
container startup after a host reboot depends on your engine; rootless Podman
operators should configure their user service/restart integration.
