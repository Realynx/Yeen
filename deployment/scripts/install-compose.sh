#!/usr/bin/env bash
set -Eeuo pipefail

ENGINE=docker
MEDIA_PATH=/srv/media
INSTALL_DIRECTORY="$HOME/yeen"
REPOSITORY=Realynx/Yeen
REF="${YEEN_COMPOSE_REF:-main}"

fail() { printf '[yeen-compose] %s\n' "$*" >&2; exit 1; }

main() {
  while (($#)); do
    case "$1" in
      --engine|--media|--directory)
        [[ $# -ge 2 && -n "$2" ]] || fail "$1 requires a value."
        case "$1" in
          --engine) ENGINE="$2" ;;
          --media) MEDIA_PATH="$2" ;;
          --directory) INSTALL_DIRECTORY="$2" ;;
        esac
        shift 2 ;;
      --help|-h)
        printf 'Usage: install-compose.sh [--engine docker|podman] [--media /srv/media] [--directory ~/yeen]\n'
        return ;;
      *) fail "Unknown option: $1" ;;
    esac
  done
  [[ "$ENGINE" == docker || "$ENGINE" == podman ]] || fail 'Engine must be docker or podman.'
  [[ "$REF" =~ ^[A-Za-z0-9._-]+$ ]] || fail 'Invalid YEEN_COMPOSE_REF.'
  [[ "$MEDIA_PATH" == /* && -d "$MEDIA_PATH" ]] || fail 'Media path must be an existing absolute directory.'
  [[ "$MEDIA_PATH" != *$'\n'* && "$MEDIA_PATH" != *$'\r'* && "$MEDIA_PATH" != *"'"* ]] || fail 'Media path contains unsupported characters.'
  for dependency in "$ENGINE" curl openssl; do
    command -v "$dependency" >/dev/null || fail "Install $dependency first."
  done
  "$ENGINE" compose version >/dev/null || fail 'Install a Compose provider for your container engine.'
  umask 077
  mkdir -p "$INSTALL_DIRECTORY"
  cd "$INSTALL_DIRECTORY"
  # Never silently replace an existing installation or its credentials.
  [[ ! -e .env && ! -L .env && ! -e compose.yml && ! -L compose.yml ]] \
    || fail "Installation files already exist in $INSTALL_DIRECTORY. Use '$ENGINE compose pull && $ENGINE compose up -d' there to upgrade."
  local temporary_compose secret password
  temporary_compose="$(mktemp .compose.XXXXXXXX)"
  trap 'rm -f -- "${temporary_compose:-}"' EXIT
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    "https://raw.githubusercontent.com/$REPOSITORY/$REF/deployment/docker/compose.yml" \
    --output "$temporary_compose"
  secret="$(openssl rand -hex 48)"
  password="$(openssl rand -hex 18)"
  cat > .env <<EOF
YEEN_VERSION=latest
YEEN_HTTP_PORT=4000
YEEN_MEDIA_PATH='$MEDIA_PATH'
NODE_ENV=production
PORT=4000
CORS_ORIGIN=http://localhost:4000
SERVE_WEB_APP=true
JWT_SECRET=$secret
DEFAULT_ADMIN_EMAIL=admin@yeen.local
DEFAULT_ADMIN_NAME=Yeen Admin
DEFAULT_ADMIN_PASSWORD=$password
MEDIA_LIBRARY_PATH=/media
MEDIA_LIBRARY_PATHS=/media
YEEN_SUPERVISED_RESTART=true
EOF
  mv "$temporary_compose" compose.yml
  "$ENGINE" compose config --quiet
  "$ENGINE" compose pull
  "$ENGINE" compose up -d
  printf '\nYeen started at http://<server-address>:4000\nAccount: admin@yeen.local\nInitial password: %s\n' "$password"
  printf 'Configuration: %s/.env\nAfter verifying login, remove DEFAULT_ADMIN_* from .env and run: %s compose up -d --force-recreate\n' "$PWD" "$ENGINE"
}

if [[ -z "${BASH_SOURCE[0]:-}" || "${BASH_SOURCE[0]:-}" == "$0" ]]; then
  main "$@"
fi
