#!/usr/bin/env python3
"""Review test (Oct 23, 2026): docs/js/app.js line 1463 (My Courses → Available).

A self-paced online course can be joined any time (each student gets one
semester from the day they start) — the database accepts an enrollment
request for it even after its start date (course_open_for_request). A
student who isn't in it should see it under "Available" with a Request
Enrollment button.

Run:  sh tests/review/build_db.sh && python3 tests/review/test_selfpaced_request.py
"""
import sys
from webhelp import psql, mkperson, start_server, open_as, settle, report, sync_playwright

student = mkperson("Cindy McFadden", "cindy.review@example.com")
psql("""
  update public.courses set format = 'online', pace = 'self', sched_mode = 'now',
         sched_start = public.local_today() - 20, sched_weeks = 16 where id = 'c4';
""")
db_allows = psql("select public.course_open_for_request('c4')")

srv = start_server()
ok = False
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = open_as(browser, "cindy.review@example.com")
        page.locator(".tile h3", has_text="My Courses").first.click(); settle(page)
        has_button = page.locator("[data-request=c4]").count() == 1
        ok = report("a self-paced course that has begun can still be requested from My Courses",
                    has_button,
                    f"no Request Enrollment button for it (the database would accept the request: {db_allows == 't'})",
                    "listed under Available with a Request Enrollment button")
        browser.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
