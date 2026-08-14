#!/bin/sh
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

mkdir -p "$DATA_DIR/uploads" "$BACKUP_DIR"
# FUSE and network mounts may not implement chown. Keep the container alive
# there; gosu still applies the requested runtime user to the application.
chown -R "$PUID:$PGID" "$DATA_DIR" "$BACKUP_DIR" 2>/dev/null || true

exec gosu "$PUID:$PGID" "$@"
