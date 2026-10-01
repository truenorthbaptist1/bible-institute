#!/bin/sh
# Rebuilds a scratch database from schema.sql + seed.sql and runs every
# privacy/permission check. Needs a local Postgres on the socket below.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
P="psql -h /var/tmp/pgtest -p 5499 -U postgres -q"
$P -c "drop database if exists t" >/dev/null
$P -c "create database t" >/dev/null
$P -d t -v ON_ERROR_STOP=1 -f "$HERE/supabase_stub.sql" >/dev/null 2>&1
$P -d t -v ON_ERROR_STOP=1 -f "$HERE/../../supabase/schema.sql" 2>&1 | grep -v NOTICE || true
$P -d t -v ON_ERROR_STOP=1 -f "$HERE/../../supabase/seed.sql"
python3 "$HERE/rls_test.py"
