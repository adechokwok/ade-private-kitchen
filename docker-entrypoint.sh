#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

mkdir -p "$DATA_DIR/uploads" "$BACKUP_DIR"
chown -R "$PUID:$PGID" "$DATA_DIR" "$BACKUP_DIR"

exec gosu "$PUID:$PGID" "$@"
