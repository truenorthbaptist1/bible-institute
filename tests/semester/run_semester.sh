#!/bin/sh
# Runs the simulated semester (see README.md). Needs: Postgres 16 started
# under libfaketime reading /tmp/simclock (start_db.sh does that), Node 22,
# Playwright's Chromium. Usage: sh tests/semester/run_semester.sh [phase ...]
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
SIM=${SIM:-/tmp/sim}; export SIM
[ -n "$KEEP_SIM" ] || rm -rf "$SIM"; mkdir -p "$SIM/mail"
echo "+0" > /tmp/simclock
P="psql -h /var/tmp/pgtest -p 5499 -U postgres -q"
$P -c "drop database if exists t" >/dev/null 2>&1
$P -c "create database t" >/dev/null
$P -d t -v ON_ERROR_STOP=1 -f "$HERE/../db/supabase_stub.sql" >/dev/null 2>&1
$P -d t -v ON_ERROR_STOP=1 -f "$HERE/../../supabase/schema.sql" 2>&1 | grep -v NOTICE || true
$P -d t -v ON_ERROR_STOP=1 -f "$HERE/../../supabase/seed.sql" >/dev/null
# The real site has no starter courses running this spring; keep only the catalogue.
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$SIM/key.pem" -out "$SIM/cert.pem" -days 400 -subj "/CN=localhost" >/dev/null 2>&1
python3 "$HERE/../functions/fake_smtp.py" 2465 "$SIM/cert.pem" "$SIM/key.pem" "$SIM/mail/run-$$" "abcdefghijklmnop" > "$SIM/smtp.log" 2>&1 &
SMTP=$!
python3 "$HERE/semester_server.py" 8765 > "$SIM/server.log" 2>&1 &
SERVER=$!
trap 'kill $SMTP $SERVER 2>/dev/null' EXIT
sleep 1
cd "$HERE"
python3 ${ROUND:-semester.py} "$@"
