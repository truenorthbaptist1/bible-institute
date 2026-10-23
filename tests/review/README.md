# Review tests — Oct 23, 2026

Proof tests from the Oct 23 bug review. **Each one fails on today's code** —
the failure is the proof the bug is real. When a bug is fixed, its test
should pass unchanged.

Run them all (fresh scratch database for each):

    sh tests/review/run_review.sh

Needs the local Postgres used by the other tests (socket `/var/tmp/pgtest`,
port 5499 — see TESTING.md) and Playwright's Chromium.

`test_lecture_dates_1000.py` copies one Supabase hosting limit with a switch:
`REVIEW_MAX_ROWS=1000` (Supabase's API returns at most 1,000 rows per
request). `run_review.sh` turns it on for that test; without it the same
test passes, which shows the setup itself is sound.
