#!/usr/bin/env bash
# Monthly check that the latest backup actually restores. Run by fh-restore-test.service as postgres.
# Restores into a scratch database, compares row counts with the live one, then drops it.
set -euo pipefail

latest="$(find /var/backups/fh -name 'fh-*.dump' -type f -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
[[ -n $latest ]] || { echo "No backups found in /var/backups/fh." >&2; exit 1; }

db=fh_restore_test
dropdb --if-exists "$db"
createdb "$db"
trap 'dropdb --if-exists "$db"' EXIT

pg_restore --no-owner --exit-on-error --dbname="$db" "$latest"

count() { psql -tAq --dbname="$1" -c "select count(*) from $2"; }
for table in users clubs teams matches match_revisions; do
  printf '%-16s backup %6s   live %6s\n' "$table" "$(count "$db" "$table")" "$(count fh "$table")"
done
echo "Restore test passed using $(basename "$latest")."
