#!/usr/bin/env python3
"""Review test (Oct 23, 2026): docs/js/features.js — Record Final Grades.

An Admin who is NOT a course's teacher archives that course from the
Courses page. The site asks "Record final grades first?" and opens the
Record Final Grades form, filled in "from the grade sheet". The student
earned 10/10 on the only assignment, so the form should suggest 100% / A+.

Run:  sh tests/review/build_db.sh && python3 tests/review/test_admin_final_grades.py
"""
import sys
from webhelp import psql, mkperson, start_server, open_as, settle, report, sync_playwright

teacher = mkperson("Pastor Phil McBroom", "phil.review@example.com", role="faculty")
student = mkperson("Blake Amis", "blake.review@example.com")
psql(f"""
  update public.courses set faculty_id = '{teacher}', sched_start = public.local_today() - 30, sched_weeks = 4,
         sched_days = '{{Wed}}', sched_mode = 'now' where id = 'c1';
  insert into public.enrollments (course_id, student_id) values ('c1', '{student}');
  insert into public.assignments (id, course_id, title, due, points, weight)
    values ('11111111-1111-1111-1111-111111111111', 'c1', 'Final paper', public.local_today() - 10, 10, 100);
  insert into public.submissions (assignment_id, student_id, status, submitted_at, score)
    values ('11111111-1111-1111-1111-111111111111', '{student}', 'graded', public.local_today() - 11, 10);
""")

srv = start_server()
ok = False
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # The church account: the founding Admin (signs in with Google).
        admin = open_as(browser, "truenorthbaptist1@gmail.com")
        admin.locator(".tile h3", has_text="Courses").first.click(); settle(admin)
        admin.locator(".tile[data-course=c1] [data-archive-toggle]").click()
        admin.wait_for_selector("#arRecord", timeout=10000)
        admin.click("#arRecord")
        admin.wait_for_selector(f"[data-rg-student='{student}']", timeout=10000)
        row = admin.locator(f"[data-rg-student='{student}']")
        pct = row.locator(".rg-pct").input_value()
        grade = row.locator(".rg-grade").input_value()
        ok = report("Admin's Record Final Grades form shows the grade the student earned",
                    pct == "100" and grade == "A+", f"score {pct!r}, grade {grade!r}", "score '100', grade 'A+'")
        browser.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
