#!/usr/bin/env bash
# Switches back to an earlier release.
#   sudo /opt/fh/bin/rollback.sh              the release before the current one
#   sudo /opt/fh/bin/rollback.sh <name>       a specific release in /opt/fh/releases
# Database migrations aren't undone, so only roll back across releases whose code works with the current schema.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
RELEASES=/opt/fh/releases
current="$(readlink -f /opt/fh/current 2>/dev/null || true)"
mapfile -t all < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d | sort)

if [[ $# -ge 1 ]]; then
  target="$RELEASES/$1"
else
  target=""
  for ((i = ${#all[@]} - 1; i > 0; i--)); do
    if [[ "${all[i]}" == "$current" ]]; then target="${all[i - 1]}"; break; fi
  done
fi

if [[ -z $target || ! -d $target ]]; then
  echo "No release to roll back to. Available:" >&2
  printf '  %s\n' "${all[@]##*/}" >&2
  exit 1
fi

echo "Switching from $(basename "$current") to $(basename "$target")"
ln -sfn "$target" /opt/fh/current.new
mv -T /opt/fh/current.new /opt/fh/current
systemctl restart fh-api fh-web

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3001/v1/health && curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "Rolled back to $(basename "$target")."
    exit 0
  fi
  sleep 2
done
echo "Switched, but the site isn't answering. Check: journalctl -u fh-api -u fh-web -n 50" >&2
exit 1
