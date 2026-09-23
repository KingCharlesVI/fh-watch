#!/usr/bin/env bash
# Replaces the live database with a backup. The site is down while it runs.
#   sudo /opt/fh/bin/restore.sh /var/backups/fh/fh-20260920-031500.dump
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
dump="${1:?Usage: restore.sh <backup .dump file>}"
[[ -f $dump ]] || { echo "No such file: $dump" >&2; exit 1; }

echo "This replaces EVERYTHING in the live database with $(basename "$dump")."
echo "Changes made since that backup will be lost. A safety backup is taken first."
read -r -p "Type 'restore' to continue: " answer
[[ $answer == restore ]] || { echo "Cancelled."; exit 1; }

cd /
echo "Taking a safety backup of the current database..."
runuser -u postgres -- env KEEP_DAYS=36500 RCLONE_REMOTE= /opt/fh/bin/backup.sh

# pg_restore runs as postgres, which may not be able to read the file where it is.
tmp="$(mktemp --suffix=.dump /tmp/fh-restore-XXXXXX)"
cp "$dump" "$tmp"
chown postgres "$tmp"
trap 'rm -f "$tmp"' EXIT

systemctl stop fh-web fh-api
runuser -u postgres -- dropdb --force fh
runuser -u postgres -- createdb -O fh fh
runuser -u postgres -- pg_restore --no-owner --role=fh --exit-on-error --dbname=fh "$tmp"
systemctl start fh-api fh-web
echo "Restored $(basename "$dump"). Check the site, then: journalctl -u fh-api -n 20"
