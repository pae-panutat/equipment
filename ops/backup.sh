#!/usr/bin/env bash
# equiplog backup: the database (mysqldump, gzip) and the uploaded photos (tar.gz), one pair of files per run.
# Meant for a DirectAdmin cron job on the host. It is NOT deployed by the pipeline: copy it once to the host
# (outside the web folder, e.g. ~/ops/backup.sh) and `chmod 700` it. Setup and restore steps: docs/BACKUP.md
#
# Settings are read from a private file (default ~/.equiplog-backup.env, chmod 600), never from the command line:
#   DB_HOST=localhost
#   DB_USER=...
#   DB_PASSWORD=...
#   DB_NAME=...
#   UPLOAD_DIR=/home/<user>/equiplog-uploads     # the same folder the app uses for photos
#   BACKUP_DIR=/home/<user>/equiplog-backups      # where the backups go (outside the web folder)
#   KEEP_DAYS=14                                  # optional, default 14
set -euo pipefail

CONF="${EQUIPLOG_BACKUP_ENV:-$HOME/.equiplog-backup.env}"
[ -r "$CONF" ] || { echo "backup: cannot read $CONF" >&2; exit 1; }
# shellcheck disable=SC1090
. "$CONF"

: "${DB_USER:?backup: DB_USER missing in $CONF}"
: "${DB_NAME:?backup: DB_NAME missing in $CONF}"
: "${BACKUP_DIR:?backup: BACKUP_DIR missing in $CONF}"
DB_HOST="${DB_HOST:-localhost}"
KEEP_DAYS="${KEEP_DAYS:-14}"

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
sql="$BACKUP_DIR/db-$stamp.sql.gz"
photos="$BACKUP_DIR/photos-$stamp.tar.gz"
# a run that stops half way must not leave a half-written file that looks like a backup
trap 'rm -f "$sql.part" "$photos.part"' EXIT

# The password goes through the environment so it never shows in the process list.
# --single-transaction: a consistent copy without locking the site while it runs.
MYSQL_PWD="${DB_PASSWORD:-}" mysqldump --host="$DB_HOST" --user="$DB_USER" \
  --single-transaction --routines --default-character-set=utf8mb4 "$DB_NAME" | gzip -9 > "$sql.part"
# a dump that ended early is worse than none: it must at least contain the end marker mysqldump writes
gzip -dc "$sql.part" | tail -n 5 | grep -q "Dump completed" || { rm -f "$sql.part"; echo "backup: the database dump is incomplete" >&2; exit 1; }
mv "$sql.part" "$sql"

if [ -n "${UPLOAD_DIR:-}" ] && [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$photos.part" -C "$UPLOAD_DIR" .
  mv "$photos.part" "$photos"
else
  echo "backup: UPLOAD_DIR not set or missing, photos skipped" >&2
fi

# keep the last KEEP_DAYS days, delete older backups
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'photos-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete

echo "backup: ok $stamp ($(du -h "$sql" | cut -f1) database, $( [ -f "$photos" ] && du -h "$photos" | cut -f1 || echo none ) photos)"
