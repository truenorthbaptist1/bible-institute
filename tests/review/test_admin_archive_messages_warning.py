#!/usr/bin/env python3
"""Review test (Oct 23, 2026): docs/js/app.js lines 1775-1777 (archiving a course).

Archiving a course permanently deletes its private student–teacher messages
(the database does it: clear_messages_on_archive). When the teacher
archives, the site first asks "This permanently deletes the course's
private student–teacher messages (export any you want to keep first)".
An Admin who isn't the teacher archives the same course: they should get
the same warning before the messages are gone.

Run:  sh tests/review/build_db.sh && python3 tests/review/test_admin_archive_messages_warning.py
"""
import sys
from webhelp import psql, mkperson, start_server, open_as, settle, report, sync_playwright

teacher = mkperson("Pastor Phil McBroom", "phil4.review@example.com", role="faculty")
student = mkperson("Blake Amis", "blake4.review@example.com")
psql(f"""
  update public.courses set faculty_id = '{teacher}', sched_start = public.local_today() - 30, sched_weeks = 15 where id = 'c1';
  insert into public.enrollments (course_id, student_id) values ('c1', '{student}');
  insert into public.messages (course_id, student_id, sender_id, from_role, text)
    values ('c1', '{student}', '{student}', 'student', 'Pastor, could we talk about my paper?');
""")

srv = start_server()
ok = False
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        admin = open_as(browser, "truenorthbaptist1@gmail.com")
        admin.locator(".tile h3", has_text="Courses").first.click(); settle(admin)
        admin.locator(".tile[data-course=c1] [data-archive-toggle]").click()
        admin.wait_for_selector("#arAnyway", timeout=10000)   # "Record final grades first?" → Archive Anyway
        admin.click("#arAnyway")
        warned = False
        try:
            admin.wait_for_selector("#confirmRoot", timeout=3000)
            warned = "private" in admin.inner_text("#confirmRoot")
            admin.click("#confirmNo")
        except Exception:
            pass
        settle(admin)
        left = psql("select count(*) from public.messages where course_id = 'c1'")
        ok = report("an Admin archiving a course is warned before its private messages are deleted",
                    warned, f"no warning; course archived and its messages deleted ({left} left)",
                    "the same 'permanently deletes the private messages' warning the teacher gets")
        browser.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
