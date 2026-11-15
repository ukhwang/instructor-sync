#!/usr/bin/env bash
# Docker 없이 로컬 Supabase 호환 스택을 띄운다 (E2E 전용, 운영과 무관).
#   PostgreSQL 16 (로컬 설치) + Supabase Auth(GoTrue) + PostgREST + /auth/v1·/rest/v1 게이트웨이
# Docker 가 있으면 이 스크립트 대신 `supabase start && supabase db reset` 을 써도 된다 (e2e/README.md).
#
# 사용: bash e2e/local-stack/start.sh   → e2e/local-stack/.stack/e2e.env 생성
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
STACK="$HERE/.stack"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PG_PORT="${PG_PORT:-54322}"
API_PORT="${API_PORT:-54321}"
AUTH_PORT="${AUTH_PORT:-9999}"
REST_PORT="${REST_PORT:-3001}"
APP_URL="${APP_URL:-http://localhost:3100}"
AUTH_VERSION="${AUTH_VERSION:-v2.180.0}"
POSTGREST_VERSION="${POSTGREST_VERSION:-v12.2.3}"
PSQL="psql -h 127.0.0.1 -p $PG_PORT -U postgres -v ON_ERROR_STOP=1 -q"

mkdir -p "$STACK/bin" "$STACK/log"

if [ ! -x "$STACK/bin/auth" ]; then
  curl -fsSL "https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz" | tar xz -C "$STACK/bin"
fi
if [ ! -x "$STACK/bin/postgrest" ]; then
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz" | tar xJ -C "$STACK/bin"
fi

node "$HERE/keys.mjs" > "$STACK/keys.env"
set -a; . "$STACK/keys.env"; set +a

# 1) PostgreSQL (매 실행마다 새 클러스터 → 테스트 데이터가 남지 않음)
RUN_AS=""; [ "$(id -u)" = "0" ] && RUN_AS="su postgres -c"
rm -rf "$STACK/pgdata"; mkdir -p "$STACK/pgdata"; touch "$STACK/log/pg.log"
[ -n "$RUN_AS" ] && chown -R postgres "$STACK/pgdata" "$STACK/log"
pg() { if [ -n "$RUN_AS" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
pg "$PG_BIN/initdb -D '$STACK/pgdata' -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null"
pg "$PG_BIN/pg_ctl -D '$STACK/pgdata' -o '-p $PG_PORT -c listen_addresses=127.0.0.1 -k /tmp' -l '$STACK/log/pg.log' -w start >/dev/null 2>&1 </dev/null"
$PSQL -f "$HERE/bootstrap.sql"

# 2) Auth (auth 스키마·auth.uid() 를 자체 마이그레이션으로 생성)
cat > "$STACK/auth.env" <<EOF
GOTRUE_API_HOST=127.0.0.1
PORT=$AUTH_PORT
API_EXTERNAL_URL=http://127.0.0.1:$API_PORT/auth/v1
GOTRUE_DB_DRIVER=postgres
DATABASE_URL=postgres://supabase_auth_admin:auth_admin@127.0.0.1:$PG_PORT/postgres_e2e?sslmode=disable
GOTRUE_DB_MIGRATIONS_PATH=$STACK/bin/migrations
GOTRUE_SITE_URL=$APP_URL
GOTRUE_JWT_SECRET=$JWT_SECRET
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_JWT_ADMIN_ROLES=service_role
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_MAILER_AUTOCONFIRM=true
GOTRUE_RATE_LIMIT_EMAIL_SENT=1000
GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000
GOTRUE_LOG_LEVEL=warn
EOF
# 백그라운드 프로세스는 표준 입출력을 모두 끊어 호출 측 파이프를 붙잡지 않게 한다.
(cd "$STACK/bin" && exec env $(xargs < "$STACK/auth.env") ./auth) </dev/null > "$STACK/log/auth.log" 2>&1 &
echo $! > "$STACK/auth.pid"
for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:$AUTH_PORT/health" >/dev/null && break; sleep 1; done

# 3) 앱 마이그레이션 (운영 SQL Editor 에 적용하는 것과 같은 파일, 같은 순서)
for file in "$REPO"/supabase/migrations/*.sql; do
  $PSQL -d postgres_e2e -f "$file" 2>&1 | grep -v "NOTICE" || true
done

# 4) PostgREST + 게이트웨이
cat > "$STACK/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:authenticator@127.0.0.1:$PG_PORT/postgres_e2e"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
db-max-rows = 1000
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $REST_PORT
log-level = "warn"
EOF
"$STACK/bin/postgrest" "$STACK/postgrest.conf" </dev/null > "$STACK/log/postgrest.log" 2>&1 &
echo $! > "$STACK/postgrest.pid"
GATEWAY_PORT=$API_PORT AUTH_PORT=$AUTH_PORT REST_PORT=$REST_PORT node "$HERE/gateway.mjs" </dev/null > "$STACK/log/gateway.log" 2>&1 &
echo $! > "$STACK/gateway.pid"
sleep 2

cat > "$STACK/e2e.env" <<EOF
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$API_PORT
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
export NEXT_PUBLIC_APP_URL=$APP_URL
export E2E_SUPABASE_URL=http://127.0.0.1:$API_PORT
export E2E_SUPABASE_ANON_KEY=$ANON_KEY
EOF
echo "로컬 스택 준비 완료 → source $STACK/e2e.env"
