#!/usr/bin/env python3
"""Review test (Oct 23, 2026): docs/js/app.js lines 2954-2958 (who a student is messaging).

A course's teacher has had their account turned off (status inactive) and
no new teacher is assigned yet. The database now delivers that course's
private messages to the Admins (course_recipients / teaches_course). A
student opening Messages should therefore see "Institute administrators",
not the old teacher's name — otherwise they write to "their teacher" while
someone else reads it.

Run:  sh tests/review/build_db.sh && python3 tests/review/test_message_recipient_name.py
"""
import sys
from webhelp import psql, mkperson, start_server, open_as, settle, report, sync_playwright

teacher = mkperson("Brother Tom Hale", "tom.review@example.com", role="faculty")
student = mkperson("Amber Amis", "amber2.review@example.com")
psql(f"""
  update public.courses set faculty_id = '{teacher}', sched_start = public.local_today() - 30 where id = 'c2';
  insert into public.enrollments (course_id, student_id) values ('c2', '{student}');
  update public.profiles set status = 'inactive' where id = '{teacher}';
""")
recipients = psql("select string_agg(p.name, ', ') from public.course_recipients('c2') r join public.profiles p on p.id = r.user_id")

srv = start_server()
ok = False
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = open_as(browser, "amber2.review@example.com")
        page.locator(".tile h3", has_text="Messages").first.click(); settle(page)
        row = page.locator("[data-thread^='c2|'] strong").first.inner_text()
        ok = report("a student sees who will actually read their private message",
                    "Tom Hale" not in row,
                    f"the thread is labeled '{row}' (but the database delivers it to: {recipients or 'the Admins'})",
                    "labeled 'Institute administrators'")
        browser.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
