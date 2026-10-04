#!/bin/sh
# Tests the Supabase functions (the behind-the-scenes service and the phone
# calendar feed) under Node, against a scratch database, a fake push
# service, and a fake Gmail server.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
P="psql -h /var/tmp/pgtest -p 5499 -U postgres -q"
$P -c "drop database if exists f" >/dev/null
$P -c "create database f" >/dev/null
$P -d f -v ON_ERROR_STOP=1 -f "$HERE/../db/supabase_stub.sql" >/dev/null 2>&1
$P -d f -v ON_ERROR_STOP=1 -f "$HERE/../../supabase/schema.sql" 2>&1 | grep -v NOTICE || true
$P -d f -v ON_ERROR_STOP=1 -f "$HERE/../../supabase/seed.sql" >/dev/null
WORK=$(mktemp -d)
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$WORK/key.pem" -out "$WORK/cert.pem" -days 1 -subj "/CN=localhost" >/dev/null 2>&1
python3 "$HERE/fake_smtp.py" 2465 "$WORK/cert.pem" "$WORK/key.pem" "$WORK/mail" "abcdefghijklmnop" > "$WORK/smtp.log" 2>&1 &
SMTP=$!
trap 'kill $SMTP 2>/dev/null; rm -rf "$WORK"' EXIT
sleep 1
cd "$HERE"
TESTDB=f MAILDIR="$WORK/mail" SMTP_PORT=2465 node --experimental-strip-types --no-warnings service_test.mjs
TESTDB=f node --experimental-strip-types --no-warnings feed_test.mjs
# Restore: delete a course by mistake, then put it back from the backup the
# weekly email carried.
Q="psql -h /var/tmp/pgtest -p 5499 -U postgres -d f -At -q"
BEFORE=$($Q -c "select (select count(*) from courses) || '/' || (select count(*) from assignments) || '/' || (select count(*) from submissions) || '/' || (select count(*) from messages)")
$Q -c "delete from courses where id = 'c1'"
python3 "$HERE/../../tools/backup/restore.py" "$HERE/.backup.json" > "$WORK/restore.sql"
$Q -v ON_ERROR_STOP=1 -f "$WORK/restore.sql" >/dev/null
AFTER=$($Q -c "select (select count(*) from courses) || '/' || (select count(*) from assignments) || '/' || (select count(*) from submissions) || '/' || (select count(*) from messages)")
if [ "$BEFORE" = "$AFTER" ]; then echo "  ✓ a deleted course comes back from the backup ($AFTER courses/assignments/work/messages)"; else echo "  ✗ restore: before $BEFORE, after $AFTER"; exit 1; fi
