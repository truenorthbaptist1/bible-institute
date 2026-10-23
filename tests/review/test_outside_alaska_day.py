#!/usr/bin/env python3
"""Review test (Oct 23, 2026): docs/js/app.js lines 74-76 and 217-220.

The site's "today" is the phone's own date (todayStr), but the Institute
runs on Alaska time and the database decides by Alaska's date. An online
student outside Alaska sees the next day start hours early.

Scene: a student in Chicago (3 hours ahead of Alaska) opens the site at
9:30 PM Alaska time on Tuesday, Nov 10, 2026 (12:30 AM Wednesday in
Chicago). A locked assignment opens Wednesday, Nov 11. In Alaska it is
still Tuesday, so it should still show as locked (the database refuses to
accept it until Alaska's Wednesday).

Run:  sh tests/review/build_db.sh && python3 tests/review/test_outside_alaska_day.py
"""
import sys
from webhelp import psql, mkperson, start_server, open_as, report, sync_playwright

student = mkperson("Daniel Dotson", "daniel.review@example.com")
psql(f"""
  update public.courses set sched_start = date '2026-10-01', sched_weeks = 15, sched_days = '{{Tue}}', format = 'online'
   where id = 'c3';
  insert into public.enrollments (course_id, student_id) values ('c3', '{student}');
  insert into public.assignments (id, course_id, title, due, points, weight, submit_anytime, open_date)
    values ('22222222-2222-2222-2222-222222222222', 'c3', 'Quiz 6', date '2026-11-13', 10, 10, false, date '2026-11-11');
""")

# 9:30 PM Tuesday Nov 10 in Alaska (AKST, UTC-9) = 06:30 UTC Wednesday Nov 11.
MOMENT = "2026-11-11T06:30:00Z"

srv = start_server()
ok = False
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        orig_new_context = browser.new_context
        def ctx_with_clock(**kw):
            ctx = orig_new_context(**kw)
            ctx.clock.set_system_time(MOMENT)
            return ctx
        browser.new_context = ctx_with_clock
        page = open_as(browser, "daniel.review@example.com", timezone="America/Chicago")
        alaska = page.evaluate("alaskaToday()")
        locked = page.evaluate("assignmentLock(courses.find(c => c.id === 'c3').assignments.find(a => a.title === 'Quiz 6')).locked")
        ok = report("a student outside Alaska sees an assignment locked until it opens in Alaska",
                    locked is True,
                    f"shown as open (site's today = {page.evaluate('todayStr()')}, Alaska's = {alaska})",
                    f"shown as locked until 2026-11-11 in Alaska (Alaska's today = {alaska})")
        browser.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
