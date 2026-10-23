#!/usr/bin/env python3
"""Review test (Oct 23, 2026): docs/js/app.js lines 3705-3708 (deleting an assignment).

An Admin who isn't the course's teacher opens the course's Manage page and
presses Delete on an assignment that a student has already turned in and
been graded on. Deleting it permanently erases that work and grade, so the
"Delete …?" question should warn about the 1 submission.

Run:  sh tests/review/build_db.sh && python3 tests/review/test_admin_delete_assignment_warning.py
"""
import sys
from webhelp import psql, mkperson, start_server, open_as, settle, report, sync_playwright

teacher = mkperson("Pastor Phil McBroom", "phil3.review@example.com", role="faculty")
student = mkperson("Blake Amis", "blake3.review@example.com")
psql(f"""
  update public.courses set faculty_id = '{teacher}', sched_start = public.local_today() - 30, sched_weeks = 15 where id = 'c1';
  insert into public.enrollments (course_id, student_id) values ('c1', '{student}');
  insert into public.assignments (id, course_id, title, due, points, weight)
    values ('44444444-4444-4444-4444-444444444444', 'c1', 'Midterm', public.local_today() - 5, 50, 30);
  insert into public.submissions (assignment_id, student_id, status, submitted_at, score)
    values ('44444444-4444-4444-4444-444444444444', '{student}', 'graded', public.local_today() - 6, 45);
""")

srv = start_server()
ok = False
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        admin = open_as(browser, "truenorthbaptist1@gmail.com")
        admin.evaluate("activeCourseId = 'c1'; view = 'manage'; renderNav(); renderMain();"); settle(admin)
        admin.evaluate("document.querySelector('[data-delete-assignment=\"44444444-4444-4444-4444-444444444444\"]').click()")
        admin.wait_for_selector("#confirmRoot", timeout=10000)
        text = admin.inner_text("#confirmRoot .confirm-box")
        admin.click("#confirmNo")
        ok = report("deleting a graded assignment warns that student work will be erased",
                    "1 submission" in text, " | ".join(text.split("\n")[:2]),
                    "a warning that 1 submission and its grade will be permanently deleted")
        browser.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
