#!/usr/bin/env python3
"""Review test (Oct 23, 2026): docs/js/home.js lines 142-149 ("Classes to watch").

A hybrid course whose teacher doesn't record attendance (the default for a
new course). A student attends live online and watched last Wednesday's
class live, start to finish, inside the site. Its recording is posted.
They did not miss that class, so their Dashboard's This Week card should
not list it under "Classes to watch" as a "missed class".

Run:  sh tests/review/build_db.sh && python3 tests/review/test_classes_to_watch_no_attendance.py
"""
import sys
from webhelp import psql, mkperson, start_server, open_as, report, sync_playwright

student = mkperson("Daniel Dotson", "daniel2.review@example.com")
last_wed = psql("select (public.local_today() - ((extract(isodow from public.local_today())::int + 4) % 7) - "
                "case when extract(isodow from public.local_today())::int = 3 then 7 else 0 end)::text")
psql(f"""
  update public.courses set format = 'hybrid', attendance_on = false, sched_start = public.local_today() - 28,
         sched_weeks = 15, sched_days = '{{Wed}}', sched_time = '19:00', class_minutes = 90 where id = 'c1';
  insert into public.enrollments (course_id, student_id, track, track_chosen) values ('c1', '{student}', 'live', true);
  insert into public.live_presence (course_id, class_date, student_id, minutes, last_beat)
    values ('c1', date '{last_wed}', '{student}', 90, now());
  insert into public.lessons (course_id, video_id, title, position, status, class_date, duration_seconds)
    values ('c1', 'wedClass001', 'Hermeneutics — Week 4', 1, 'ok', date '{last_wed}', 5400);
""")

srv = start_server()
ok = False
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = open_as(browser, "daniel2.review@example.com")
        missed = page.evaluate("thisWeekItems().missed.map(m => m.d)")
        shown = page.locator(".week-missed").count()
        ok = report("a class the student watched live isn't listed as missed (attendance not recorded)",
                    not missed, f"'Classes to watch' lists {shown} class(es) as missed: {missed}",
                    "no missed classes listed")
        browser.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
