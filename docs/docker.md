# Docker deployment

Tagged releases publish `ghcr.io/realynx/yeen` for `linux/amd64` and
`linux/arm64`. The same image runs through Docker Engine on Linux and Docker
Desktop on macOS or Windows.

The image contains compiled Core Yeen only. Runtime state is stored under
`/opt/yeen/shared`, which the supplied Compose file maps to the `yeen-shared`
named volume. The image contains no account data, media index, installed
add-ons, `.env`, JWT secret, or administrator password.

## Start from GHCR

Download `deployment/docker/compose.yml` and `.env.example` from the matching
release packet, then from that directory:

```bash
cp .env.example .env
```

Replace `JWT_SECRET`, `DEFAULT_ADMIN_PASSWORD`, and `CORS_ORIGIN` in `.env`.
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

The release ZIP is platform-neutral and includes a runtime Dockerfile. Extract
it, copy `.env.example` to `.env` under `deployment/docker`, and run from the
packet root:

```bash
docker compose \
  -f deployment/docker/compose.yml \
  -f deployment/docker/compose.local-build.yml \
  up -d --build
```

Native Node/systemd installation and Docker use the same Core environment
names for CORS, JWT, initial administrator credentials, media locations,
FFmpeg, subtitles, and add-ons.

The image and supplied Compose service set `YEEN_DEPLOYMENT_MODE=docker`.
The administrator update panel therefore reports the operator-safe upgrade
command, `docker compose pull && docker compose up -d`; it never attempts a
systemd restart or in-container self-replacement.
