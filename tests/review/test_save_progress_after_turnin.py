#!/usr/bin/env python3
"""Review test (Oct 23, 2026): docs/js/app.js lines 1988-1995 (Turn In form).

A student turned in a paper (a file). Later they open the assignment again
— the form says "Awaiting a grade — you can still replace it below" — and,
changing nothing, press "Save as In Progress". Their paper should still be
turned in (waiting for the teacher), not taken back.

Run:  sh tests/review/build_db.sh && python3 tests/review/test_save_progress_after_turnin.py
"""
import sys
from webhelp import psql, mkperson, start_server, open_as, settle, report, sync_playwright

student = mkperson("Blake Amis", "blake2.review@example.com")
psql(f"""
  update public.courses set sched_start = public.local_today() - 30, sched_weeks = 15, sched_days = '{{Wed}}' where id = 'c1';
  insert into public.enrollments (course_id, student_id) values ('c1', '{student}');
  insert into public.assignments (id, course_id, title, due, points, weight)
    values ('33333333-3333-3333-3333-333333333333', 'c1', 'Book report', public.local_today() - 1, 10, 50);
  insert into public.submissions (assignment_id, student_id, status, submitted_at, file_name, storage_path, mime_type)
    values ('33333333-3333-3333-3333-333333333333', '{student}', 'submitted', public.local_today() - 2,
            'report.pdf', 'c1/33333333-3333-3333-3333-333333333333/{student}/x-report.pdf', 'application/pdf');
""")

srv = start_server()
ok = False
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = open_as(browser, "blake2.review@example.com")
        page.evaluate("activeCourseId = 'c1'; view = 'course'; renderNav(); renderMain();"); settle(page)
        page.evaluate("openSubmitModal(courses.find(c => c.id === 'c1'), courses.find(c => c.id === 'c1').assignments[0], currentStudentId)")
        page.wait_for_selector("#submitProgress")
        page.click("#submitProgress"); settle(page)
        status = psql(f"select status from public.submissions where student_id = '{student}'")
        ok = report("pressing Save as In Progress on turned-in work keeps it turned in",
                    status == "submitted", f"status '{status}' (taken back; shows as Missing, counts 0)",
                    "status 'submitted'")
        browser.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
