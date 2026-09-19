#!/bin/sh
set -eu

shared_root="${YEEN_SHARED_ROOT:-/opt/yeen/shared}"
data_root="$shared_root/data"
addons_root="${YEEN_ADDONS_ROOT:-$shared_root/addons}"

case "$shared_root" in
  /opt/yeen/shared|/opt/yeen/shared/*) ;;
  *) printf '[yeen-container] Invalid shared root: %s\n' "$shared_root" >&2; exit 1 ;;
esac

install -d -m 0750 -o node -g node "$shared_root" "$data_root" "$addons_root"
if [ -e /app/data ] && [ ! -L /app/data ]; then
  printf '[yeen-container] /app/data must be a managed symlink.\n' >&2
  exit 1
fi
ln -sfn "$data_root" /app/data
chown -h node:node /app/data

export YEEN_ADDONS_ROOT="$addons_root"
exec gosu node:node "$@"
