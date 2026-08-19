#!/bin/sh
set -eu

PUID="${PUID:-0}"
PGID="${PGID:-0}"
DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

mkdir -p "$DATA_DIR/uploads" "$BACKUP_DIR"
# Root already owns the process and does not need a potentially expensive
# recursive walk through a large cloud volume. For non-root deployments,
# FUSE and network mounts may not implement chown, so keep that best-effort.
if [ "$PUID" != "0" ] || [ "$PGID" != "0" ]; then
  chown -R "$PUID:$PGID" "$DATA_DIR" "$BACKUP_DIR" 2>/dev/null || true
fi

exec gosu "$PUID:$PGID" "$@"
