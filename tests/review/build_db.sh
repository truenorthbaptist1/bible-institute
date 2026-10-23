#!/bin/sh
# Builds a fresh scratch database "t" from schema.sql + seed.sql (no tests run).
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
P="psql -h /var/tmp/pgtest -p 5499 -U postgres -q"
$P -c "drop database if exists t" >/dev/null
$P -c "create database t" >/dev/null
$P -d t -v ON_ERROR_STOP=1 -f "$HERE/../db/supabase_stub.sql" >/dev/null 2>&1
$P -d t -v ON_ERROR_STOP=1 -f "$HERE/../../supabase/schema.sql" 2>&1 | grep -v NOTICE || true
$P -d t -v ON_ERROR_STOP=1 -f "$HERE/../../supabase/seed.sql" >/dev/null
