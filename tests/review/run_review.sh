#!/bin/sh
# Runs every review test (Oct 23, 2026) on a fresh scratch database.
# Each test FAILS on today's code — that failure is the proof of the bug.
# Needs the local Postgres on /var/tmp/pgtest:5499 (see TESTING.md) and
# Playwright's Chromium. Usage: sh tests/review/run_review.sh [test-file ...]
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"
TESTS=${*:-"test_schema.py test_admin_final_grades.py test_save_progress_after_turnin.py
  test_admin_delete_assignment_warning.py test_admin_archive_messages_warning.py
  test_message_recipient_name.py test_selfpaced_request.py test_classes_to_watch_no_attendance.py
  test_outside_alaska_day.py test_lecture_dates_1000.py"}
fails=0
for t in $TESTS; do
  sh build_db.sh
  if [ "$t" = "test_lecture_dates_1000.py" ]; then
    REVIEW_MAX_ROWS=1000 python3 "$t" || fails=$((fails + 1))
  else
    python3 "$t" || fails=$((fails + 1))
  fi
done
echo "$fails test(s) failed (each failure is a confirmed bug)"
