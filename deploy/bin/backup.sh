#!/usr/bin/env bash
# Nightly database backup, run by fh-backup.service as the postgres user.
# Keeps KEEP_DAYS of local dumps and, if RCLONE_REMOTE is set, copies each one off-site.
set -euo pipefail

DIR=/var/backups/fh
KEEP_DAYS="${KEEP_DAYS:-14}"
file="$DIR/fh-$(date -u +%Y%m%d-%H%M%S).dump"

pg_dump --format=custom --file="$file.partial" fh
mv "$file.partial" "$file"
echo "Backup written: $file ($(du -h "$file" | cut -f1))"

find "$DIR" -name 'fh-*.dump' -mtime +"$KEEP_DAYS" -print -delete

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  rclone copy --config "${RCLONE_CONFIG:-/etc/fh/rclone.conf}" "$file" "$RCLONE_REMOTE"
  echo "Copied off-site to $RCLONE_REMOTE"
else
  echo "RCLONE_REMOTE isn't set: this backup is only on this server."
fi
