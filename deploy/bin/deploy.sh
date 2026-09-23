#!/usr/bin/env bash
# Builds and switches to a new release, rolling back if it isn't healthy.
#   sudo /opt/fh/bin/deploy.sh v1.2.0      (a tag, or a branch name)
set -Eeuo pipefail

[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
REF="${1:?Usage: deploy.sh <tag or branch>}"
# shellcheck source=/dev/null
. /etc/fh/deploy.env
KEEP_RELEASES="${KEEP_RELEASES:-5}"

RELEASES=/opt/fh/releases
NAME="$(date -u +%Y%m%d-%H%M%S)-${REF//[^A-Za-z0-9._-]/_}"
DIR="$RELEASES/$NAME"
PREVIOUS="$(readlink -f /opt/fh/current 2>/dev/null || true)"
SWITCHED=0

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

cleanup_failed_build() {
  if [[ $SWITCHED -eq 0 && -d $DIR ]]; then
    echo "Deploy failed before switching; removing $DIR. The site is unchanged." >&2
    rm -rf "$DIR"
  fi
}
trap cleanup_failed_build ERR

# Builds run as fh-deploy, never root.
as_deploy() {
  runuser -u fh-deploy -- env HOME=/home/fh-deploy COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/fh/ms-playwright NEXT_TELEMETRY_DISABLED=1 "$@"
}

# Runs a command in the API's environment, as fh-api.
as_api() {
  systemd-run --quiet --wait --pipe --collect --uid=fh-api --gid=fh-api \
    -p EnvironmentFile=/etc/fh/api.env --working-directory="$1" "${@:2}"
}

switch_to() {
  ln -sfn "$1" /opt/fh/current.new
  mv -T /opt/fh/current.new /opt/fh/current
  systemctl restart fh-api fh-web
}

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:3001/v1/health && curl -fsS -o /dev/null http://127.0.0.1:3000/; then
      return 0
    fi
    sleep 2
  done
  return 1
}

cd /
say "Fetching $REF"
as_deploy git clone --quiet --depth 1 --branch "$REF" "$REPO_URL" "$DIR"
cd "$DIR"
echo "Commit $(as_deploy git -C "$DIR" rev-parse --short HEAD)"

say "Installing dependencies"
as_deploy pnpm install --frozen-lockfile

say "Building"
# The website build reads its production settings (site URL, API URL).
set -a
# shellcheck source=/dev/null
. /etc/fh/web.env
set +a
as_deploy pnpm build

say "Chromium for PDF reports"
as_deploy pnpm --filter @fh/api exec playwright-core install --only-shell chromium

say "Database migrations"
as_api "$DIR/api" /usr/bin/node dist/db/migrate.js

say "Scripts and services"
install -m 755 "$DIR"/deploy/bin/* /opt/fh/bin/
install -m 644 "$DIR"/deploy/systemd/* /etc/systemd/system/
systemctl daemon-reload
install -d -o fh-web -g fh-web "$DIR/web/.next/cache"
chown -R fh-web:fh-web "$DIR/web/.next/cache"

say "Switching to $NAME"
SWITCHED=1
switch_to "$DIR"

if ! healthy; then
  echo "The new release didn't come up healthy. Recent logs:" >&2
  journalctl -u fh-api -u fh-web -n 40 --no-pager >&2 || true
  if [[ -n $PREVIOUS && -d $PREVIOUS ]]; then
    switch_to "$PREVIOUS"
    echo "Rolled back to $(basename "$PREVIOUS"). Database migrations from the failed release stay applied." >&2
  fi
  exit 1
fi

say "Pruning old releases (keeping $KEEP_RELEASES)"
current="$(readlink -f /opt/fh/current)"
mapfile -t old < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +"$((KEEP_RELEASES + 1))")
for r in "${old[@]}"; do
  [[ "$r" != "$current" ]] && rm -rf "$r" && echo "Removed $(basename "$r")"
done

say "Deployed $REF ($NAME)"
