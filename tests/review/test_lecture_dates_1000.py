#!/usr/bin/env python3
"""Review test (Oct 23, 2026): docs/js/data.js line 182 — lecture class days.

Supabase's API returns at most 1,000 rows per request. data.js pages
through tables (selectAll), but asks for every lecture's class day with ONE
call to visible_lesson_dates(), which isn't paged. Once the site holds more
than 1,000 lectures (each term's courses, copied term after term, all stay
in the Lecture Archive), the lectures past the first 1,000 lose their class
day on screen.

Scene: 26 past (archived) courses of 40 lectures each (about three years of
terms) plus this term's course with 2 lectures. A student signs in. Every
lecture the database gives a class day should have that class day on screen.

Run with the hosting limit copied:
  sh tests/review/build_db.sh && REVIEW_MAX_ROWS=1000 python3 tests/review/test_lecture_dates_1000.py
and (to show the setup itself is sound) without it — that run passes:
  sh tests/review/build_db.sh && python3 tests/review/test_lecture_dates_1000.py
"""
import sys
from webhelp import psql, mkperson, start_server, open_as, report, sync_playwright

student = mkperson("Amber Amis", "amber.review@example.com")
psql(f"""
  insert into public.courses (id, title, sched_weeks, sched_days, sched_time, sched_mode, sched_start, archived, format, playlist_id)
  select 'old' || n, 'Past course ' || n, 20, '{{Tue,Thu}}', '19:00', 'now', date '2023-09-05' + (n * 7), true, 'hybrid', ''
    from generate_series(1, 26) n;
  insert into public.lessons (course_id, video_id, title, position, status, recorded_on)
  select 'old' || n, 'vid' || n || 'x' || k, 'Lesson ' || k, k, 'ok', null
    from generate_series(1, 26) n, generate_series(1, 40) k;
  update public.courses set sched_start = public.local_today() - 14, sched_weeks = 15, sched_days = '{{Mon,Wed}}',
         format = 'hybrid' where id = 'c1';
  insert into public.enrollments (course_id, student_id) values ('c1', '{student}');
  insert into public.lessons (course_id, video_id, title, position, status) values
    ('c1', 'thisTerm01', 'Lesson 1', 1, 'ok'), ('c1', 'thisTerm02', 'Lesson 2', 2, 'ok');
""")
expected = int(psql("select count(*) from public.lessons l, lateral public.lesson_schedule(l.course_id) s "
                    "where s.lesson_id = l.id and s.class_date is not null"))

srv = start_server()
ok = False
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = open_as(browser, "amber.review@example.com")
        shown = page.evaluate("courses.flatMap((c) => c.lessons).filter((l) => l.classDate).length")
        total = page.evaluate("courses.flatMap((c) => c.lessons).length")
        ok = report("every lecture keeps its class day on screen (more than 1,000 lectures)",
                    shown == expected,
                    f"{shown} of {total} lectures have a class day ({expected - shown} lost theirs)",
                    f"{expected} of {total} lectures have a class day")
        browser.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
