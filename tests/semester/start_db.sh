#!/bin/sh
# Starts the scratch Postgres (tests' usual socket /var/tmp/pgtest:5499) under
# libfaketime, so the simulation can move the database's clock by writing an
# offset in seconds (e.g. "+5715272") to /tmp/simclock. Run as root.
# apt-get install faketime   (once)
PGBIN=/usr/lib/postgresql/16/bin
LIB=/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1
mkdir -p /var/tmp/pgtest && chown postgres /var/tmp/pgtest
[ -f /tmp/simclock ] || echo "+0" > /tmp/simclock; chmod 666 /tmp/simclock
[ -d /tmp/pgdata ] || su postgres -c "$PGBIN/initdb -D /tmp/pgdata -A trust" >/dev/null
su postgres -c "$PGBIN/pg_ctl -D /tmp/pgdata stop" >/dev/null 2>&1
su postgres -c "LD_PRELOAD=$LIB FAKETIME_TIMESTAMP_FILE=/tmp/simclock FAKETIME_NO_CACHE=1 FAKETIME_DONT_FAKE_MONOTONIC=1 \
  $PGBIN/pg_ctl -D /tmp/pgdata -l /tmp/pg.log -o \"-k /var/tmp/pgtest -p 5499 -c listen_addresses=''\" start" >/dev/null
