#!/bin/sh
# Keeps the test server and fake Gmail running, then runs phases of a round
# against a restored snapshot (for working on one phase at a time).
# Usage: SIM=/tmp/sim3 ROUND=round3.py sh dev.sh restore:r3setup courses
HERE=$(cd "$(dirname "$0")" && pwd)
SIM=${SIM:-/tmp/sim}; export SIM
pgrep -f "semester_server.py 8765" >/dev/null || (python3 "$HERE/semester_server.py" 8765 > "$SIM/server.log" 2>&1 &)
pgrep -f "fake_smtp.py 2465" >/dev/null || (python3 "$HERE/../functions/fake_smtp.py" 2465 "$SIM/cert.pem" "$SIM/key.pem" "$SIM/mail/dev" "abcdefghijklmnop" > "$SIM/smtp.log" 2>&1 &)
sleep 1
cd "$HERE" && python3 ${ROUND:-semester.py} "$@"
