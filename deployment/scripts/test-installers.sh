#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

bash -n \
  "$SCRIPT_DIR/install-lib.sh" \
  "$SCRIPT_DIR/install.sh" \
  "$SCRIPT_DIR/install-release.sh" \
  "$SCRIPT_DIR/../updater/yeen-apply-staged-update.sh" \
  "$SCRIPT_DIR/tests/install-layout.test.sh"

node --check "$SCRIPT_DIR/addon-deploy.mjs"

bash "$SCRIPT_DIR/install.sh" --help >/dev/null
bash "$SCRIPT_DIR/tests/install-layout.test.sh"
(
  cd "$SCRIPT_DIR/../.."
  node --test deployment/scripts/tests/*.test.mjs
)
