#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
STACK="$HERE/.stack"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
for name in gateway postgrest auth; do
  [ -f "$STACK/$name.pid" ] && kill "$(cat "$STACK/$name.pid")" 2>/dev/null; rm -f "$STACK/$name.pid"
done
if [ -d "$STACK/pgdata" ]; then
  if [ "$(id -u)" = "0" ]; then su postgres -c "$PG_BIN/pg_ctl -D '$STACK/pgdata' -m fast stop"; else "$PG_BIN/pg_ctl" -D "$STACK/pgdata" -m fast stop; fi
fi
