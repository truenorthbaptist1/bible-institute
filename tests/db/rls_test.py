#!/usr/bin/env python3
"""Privacy & permission tests for the TNBBI Supabase schema.

Runs against a local Postgres loaded with supabase_stub.sql + schema.sql +
seed.sql. Each check runs SQL *as* a given user (role "authenticated" with
that user's id), exactly the way Supabase runs a signed-in browser request.
"""
import subprocess, sys, uuid

PSQL = ["psql", "-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-d", "t", "-At", "-v", "ON_ERROR_STOP=1", "-q"]
results = []

def sql(query, as_user=None, role="authenticated"):
    pre = ""
    if as_user is not None or role == "anon":
        sub = as_user or ""
        pre = f"set role {role}; select set_config('request.jwt.claim.sub', '{sub}', false) \\g /dev/null\n"
    p = subprocess.run(PSQL, input=pre + query, capture_output=True, text=True)
    return p.returncode == 0, (p.stdout.strip() if p.returncode == 0 else p.stderr.strip())

def check(name, ok_expected, query, as_user=None, expect_out=None, role="authenticated"):
    ok, out = sql(query, as_user, role)
    passed = ok == ok_expected and (expect_out is None or out == str(expect_out))
    results.append((passed, name, out if not passed else ""))
    return out

def admin(query):
    ok, out = sql(query)
    if not ok:
        print("SETUP FAILED:", query, out); sys.exit(1)
    return out

def mkuser(email, name, google=False):
    uid = str(uuid.uuid4())
    admin(f"insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ('{uid}', '{email}', '{{\"full_name\": \"{name}\", \"role\": \"faculty\"}}', now())")
    if google:
        admin(f"insert into auth.identities (user_id, provider) values ('{uid}', 'google')")
    return uid

# --- people ----------------------------------------------------------------
phil  = mkuser("phil@example.com", "Pastor Phil McBroom")
stu1  = mkuser("blake@example.com", "Blake Amis")
stu2  = mkuser("amber@example.com", "Amber Amis")
stu3  = mkuser("daniel@example.com", "Daniel Dotson")
stu4  = mkuser("cindy@example.com", "Cindy McFadden")
admin(f"update public.profiles set role = 'faculty' where id = '{phil}'")
admin(f"update public.profiles set status = 'inactive' where id = '{stu4}'")
admin(f"insert into public.enrollments (course_id, student_id) values ('c1', '{stu1}'), ('c1', '{stu2}'), ('c1', '{stu4}')")

# --- accounts & roles --------------------------------------------------------
check("Sign-up always creates a STUDENT, even if the form sneaks in role=faculty", True,
      f"select role from public.profiles where id = '{stu3}'", expect_out="student")
check("Sign-up keeps the name typed in", True, f"select name from public.profiles where id = '{stu1}'", expect_out="Blake Amis")
check("A student sees only their own profile row (no classmate emails)", True,
      "select count(*) from public.profiles", stu1, expect_out=1)
check("A student cannot promote themself to faculty", False,
      f"update public.profiles set role = 'faculty' where id = '{stu1}'", stu1)
check("A student cannot make themself Super Admin", False,
      f"update public.profiles set super_admin = true where id = '{stu1}'", stu1)
check("A student cannot reactivate/deactivate accounts", False,
      f"update public.profiles set status = 'inactive' where id = '{stu1}'", stu1)
check("A student cannot touch someone else's profile (0 rows)", True,
      f"with u as (update public.profiles set name = 'x' where id = '{stu2}' returning 1) select count(*) from u", stu1, expect_out=0)
check("A student CAN fix their own name", True,
      f"update public.profiles set name = 'Blake A. Amis' where id = '{stu1}'", stu1)
check("Student directory shows instructor + classmates only (names, not emails)", True,
      "select string_agg(name, ',' order by name) from public.visible_people()", stu1,
      expect_out="Amber Amis,Blake A. Amis,Cindy McFadden,Pastor Phil McBroom")
check("A student not in any class sees only faculty + self", True,
      "select string_agg(name, ',' order by name) from public.visible_people()", stu3,
      expect_out="Daniel Dotson,Pastor Phil McBroom")
check("Faculty see every account", True, "select count(*) from public.profiles", phil, expect_out=5)
check("Faculty can promote a student to faculty", True,
      f"update public.profiles set role = 'faculty' where id = '{stu3}'", phil)
admin(f"update public.profiles set role = 'student' where id = '{stu3}'")
check("Faculty who aren't Super Admins cannot grant Super Admin", False,
      f"update public.profiles set super_admin = true where id = '{stu2}'", phil)
check("Signed-out visitors are refused outright", False, "select count(*) from public.courses", None, role="anon")

# --- Super Admin bootstrap ---------------------------------------------------
fake = mkuser("truenorthbaptist1@gmail.com", "Imposter")  # email/password sign-up, not Google
check("Typing the church email into Sign Up does NOT grant Super Admin", True,
      "select public.claim_bootstrap_super_admin()", fake, expect_out="f")
admin(f"delete from auth.users where id = '{fake}'")
church = mkuser("truenorthbaptist1@gmail.com", "True North Baptist", google=True)
check("Church Google account becomes founding Super Admin", True,
      "select public.claim_bootstrap_super_admin()", church, expect_out="t")
check("…and is promoted to Faculty at the same time", True,
      f"select role || ',' || super_admin from public.profiles where id = '{church}'", expect_out="faculty,true")
check("Bootstrap does not re-fire while a Super Admin exists", True,
      "select public.claim_bootstrap_super_admin()", church, expect_out="f")
check("Super Admin can add Super Admins", True,
      f"update public.profiles set super_admin = true where id in ('{phil}', '{stu2}', '{stu3}')", church)
check("A 5th Super Admin is refused (cap of 4)", False,
      f"update public.profiles set super_admin = true where id = '{stu1}'", church)
admin(f"update public.profiles set super_admin = false where id in ('{stu2}', '{stu3}', '{phil}')")
check("Plain faculty cannot deactivate a Super Admin", False,
      f"update public.profiles set status = 'inactive' where id = '{church}'", phil)
check("Plain faculty cannot delete a Super Admin", False,
      f"select public.delete_user('{church}')", phil)
admin(f"update public.profiles set super_admin = false where id = '{church}'")
check("Self-healing: with zero Super Admins, church Google sign-in restores it", True,
      "select public.claim_bootstrap_super_admin()", church, expect_out="t")

# --- courses & enrollment ------------------------------------------------------
check("Students can browse the catalogue", True, "select count(*) from public.courses", stu3, expect_out=8)
check("Students cannot create courses", False, "insert into public.courses (title) values ('Hack')", stu1)
check("Students cannot edit courses (0 rows)", True,
      "with u as (update public.courses set title = 'x' where id = 'c1' returning 1) select count(*) from u", stu1, expect_out=0)
check("Students see only their own enrollment rows", True,
      "select count(*) from public.enrollments", stu1, expect_out=1)
check("Students cannot enroll themselves directly", False,
      f"insert into public.enrollments (course_id, student_id) values ('c2', '{stu1}')", stu1)
check("Student can request an upcoming course", True,
      f"insert into public.enrollment_requests (course_id, student_id) values ('c8', '{stu3}')", stu3)
check("…and every active faculty member is notified", True,
      "select count(*) from public.notifications where subject like 'Daniel Dotson requested%'", None, expect_out=2)
check("Student cannot request a course that has already started", False,
      f"insert into public.enrollment_requests (course_id, student_id) values ('c2', '{stu3}')", stu3)
check("Student cannot request on someone else's behalf", False,
      f"insert into public.enrollment_requests (course_id, student_id) values ('c8', '{stu2}')", stu3)
check("Students cannot approve their own request", False,
      f"select public.approve_enrollment('c8', '{stu3}')", stu3)
check("Student can withdraw their own request", True,
      f"delete from public.enrollment_requests where student_id = '{stu3}'", stu3)
admin(f"insert into public.enrollment_requests (course_id, student_id) values ('c8', '{stu3}'), ('c8', '{stu1}')")
check("Faculty approve → student enrolled", True,
      f"select public.approve_enrollment('c8', '{stu1}'); select count(*) from public.enrollments where course_id = 'c8' and student_id = '{stu1}'", phil, expect_out=1)
check("Deny requires a note", False, f"select public.deny_enrollment('c8', '{stu3}', '  ')", phil)
check("Deny with note → note lands in the student's inbox", True,
      f"select public.deny_enrollment('c8', '{stu3}', 'Prerequisite not yet completed.'); select count(*) from public.messages where student_id = '{stu3}'", phil, expect_out=1)
check("Denied student can read the note", True,
      "select count(*) from public.messages", stu3, expect_out=1)
check("Denied student can reply in that thread", True,
      f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c8', '{stu3}', '{stu3}', 'student', 'Thank you')", stu3)

# --- assignments & submissions -------------------------------------------------
aid = admin("insert into public.assignments (course_id, title, due, points, weight) values ('c1', 'Reflection', '2026-09-01', 20, 40) returning id").splitlines()[0]
locked = admin("insert into public.assignments (course_id, title, due, points, submit_anytime, open_date) values ('c1', 'Final', '2027-01-01', 20, false, '2026-12-25') returning id").splitlines()[0]
admin(f"insert into public.materials (course_id, title, storage_path) values ('c1', 'Syllabus.pdf', 'c1/x-Syllabus.pdf')")
check("Enrolled student sees course assignments", True, "select count(*) from public.assignments", stu1, expect_out=2)
check("Student NOT in the course sees none of its assignments", True,
      "select count(*) from public.assignments where course_id = 'c1'", stu3, expect_out=0)
check("Student NOT in the course sees none of its materials", True,
      "select count(*) from public.materials", stu3, expect_out=0)
check("Student turns in work; server sets the date (no back-dating)", True,
      f"insert into public.submissions (assignment_id, student_id, status, file_name, submitted_at) values ('{aid}', '{stu1}', 'submitted', 'mine.pdf', '2026-08-01') returning submitted_at = public.local_today()", stu1, expect_out="t")
check("Student cannot grade their own work", False,
      f"update public.submissions set score = 20 where student_id = '{stu1}'", stu1)
check("Student cannot mark their own work 'graded'", False,
      f"update public.submissions set status = 'graded' where student_id = '{stu1}'", stu1)
check("Student cannot submit for a classmate", False,
      f"insert into public.submissions (assignment_id, student_id, status) values ('{aid}', '{stu2}', 'submitted')", stu1)
check("Student not in the course cannot submit", False,
      f"insert into public.submissions (assignment_id, student_id, status) values ('{aid}', '{stu3}', 'submitted')", stu3)
check("Locked assignment refuses submissions before it opens", False,
      f"insert into public.submissions (assignment_id, student_id, status) values ('{locked}', '{stu1}', 'submitted')", stu1)
check("A classmate cannot see another student's submission", True,
      "select count(*) from public.submissions", stu2, expect_out=0)
check("Faculty grade the submission", True,
      f"update public.submissions set status = 'graded', score = 18, feedback = 'Good work' where student_id = '{stu1}'", phil)
check("…and the student is notified once", True,
      f"select count(*) from public.notifications where user_id = '{stu1}' and subject like 'Grade posted%'", None, expect_out=1)
admin(f"set role authenticated; select set_config('request.jwt.claim.sub', '{phil}', false); update public.submissions set score = 19 where student_id = '{stu1}'")
check("Re-editing a grade doesn't re-notify", True,
      f"select count(*) from public.notifications where user_id = '{stu1}' and subject like 'Grade posted%'", None, expect_out=1)
check("Faculty can't read a student's private notifications", True,
      f"select count(*) from public.notifications where user_id = '{stu1}'", phil, expect_out=0)
check("Student sees their own grade", True, "select score from public.submissions", stu1, expect_out=19)
check("Student cannot change work after it's graded", False,
      f"update public.submissions set file_name = 'new.pdf', status = 'submitted' where student_id = '{stu1}'", stu1)
check("A classmate still can't see that grade", True,
      "select count(*) from public.submissions", stu2, expect_out=0)

# --- messages ---------------------------------------------------------------------
check("Student messages their instructor", True,
      f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '{stu1}', '{stu1}', 'student', 'Question about the reading')", stu1)
check("Student cannot pretend to be faculty in a message", False,
      f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '{stu1}', '{stu1}', 'faculty', 'hi')", stu1)
check("Student cannot write into a classmate's thread", False,
      f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '{stu2}', '{stu1}', 'student', 'hi')", stu1)
check("Student cannot message a course they're not in", False,
      f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c2', '{stu1}', '{stu1}', 'student', 'hi')", stu1)
check("Classmate can't read someone else's private messages", True,
      "select count(*) from public.messages", stu2, expect_out=0)
check("Faculty see student messages", True,
      f"select count(*) from public.messages where student_id = '{stu1}'", phil, expect_out=1)
check("Opening a thread marks it read (faculty side)", True,
      f"select public.mark_thread_read('c1', '{stu1}'); select count(*) from public.messages where student_id = '{stu1}' and not read", phil, expect_out=0)
check("Students can't mark someone else's thread read", True,
      f"select public.mark_thread_read('c8', '{stu3}')", stu1)
check("Students can't edit messages after sending (0 rows)", True,
      "with u as (update public.messages set text = 'changed' returning 1) select count(*) from u", stu1, expect_out=0)

# --- discussion ----------------------------------------------------------------------
post = check("Faculty post to a class board", True,
             f"insert into public.discussion_posts (course_id, author_id, text) values ('c1', '{phil}', 'Discuss Nehemiah 8') returning id", phil).splitlines()[0]
check("Enrolled student replies", True,
      f"insert into public.discussion_posts (course_id, parent_id, author_id, text) values ('c1', '{post}', '{stu1}', 'Great passage')", stu1)
check("Students can't start top-level posts", False,
      f"insert into public.discussion_posts (course_id, author_id, text) values ('c1', '{stu1}', 'Hi all')", stu1)
check("Students can't post as someone else", False,
      f"insert into public.discussion_posts (course_id, parent_id, author_id, text) values ('c1', '{post}', '{stu2}', 'x')", stu1)
check("Outsiders can't read a class board", True,
      "select count(*) from public.discussion_posts", stu3, expect_out=0)
check("Students can't delete the instructor's post (0 rows)", True,
      f"with d as (delete from public.discussion_posts where id = '{post}' returning 1) select count(*) from d", stu1, expect_out=0)

# --- notifications & highlights ------------------------------------------------------------
check("Users see only their own notifications", True,
      f"select count(*) from public.notifications where user_id <> '{stu1}'", stu1, expect_out=0)
check("Nobody can forge a notification", False,
      f"insert into public.notifications (user_id, subject) values ('{stu2}', 'Fake grade')", stu1)
check("Bible highlights save per person", True,
      "insert into public.bible_highlights (verse_key, reference, verse_text) values ('JHN.3.16', 'John 3:16', 'For God so loved…')", stu1)
check("…and are private", True, "select count(*) from public.bible_highlights", stu2, expect_out=0)

# --- inactive accounts ---------------------------------------------------------------------
check("An inactive account sees no courses", True, "select count(*) from public.courses", stu4, expect_out=0)
check("An inactive account sees no assignments, even in its old class", True,
      "select count(*) from public.assignments", stu4, expect_out=0)

# --- file storage ------------------------------------------------------------------------
check("Student uploads into their own submission folder", True,
      f"insert into storage.objects (bucket_id, name) values ('submissions', 'c1/{aid}/{stu1}/essay.pdf')", stu1)
check("Student cannot upload into a classmate's folder", False,
      f"insert into storage.objects (bucket_id, name) values ('submissions', 'c1/{aid}/{stu2}/essay.pdf')", stu1)
admin(f"insert into storage.objects (bucket_id, name) values ('submissions', 'c1/{aid}/{stu2}/theirs.pdf'), ('materials', 'c1/x-Syllabus.pdf')")
check("Student cannot open a classmate's uploaded file", True,
      "select count(*) from storage.objects where bucket_id = 'submissions'", stu1, expect_out=1)
check("Enrolled student can open course materials", True,
      "select count(*) from storage.objects where bucket_id = 'materials'", stu1, expect_out=1)
check("Outsider cannot open course materials", True,
      "select count(*) from storage.objects where bucket_id = 'materials'", stu3, expect_out=0)
check("Students cannot upload course materials", False,
      "insert into storage.objects (bucket_id, name) values ('materials', 'c1/evil.pdf')", stu1)
check("Faculty can open every submission file", True,
      "select count(*) from storage.objects where bucket_id = 'submissions'", phil, expect_out=2)

# --- profiles & profile photos ---------------------------------------------------------------
check("A student can fill in their own profile details", True,
      f"update public.profiles set phone = '907-555-0101', city = 'Moose Creek', home_church = 'True North Baptist', bio = 'Saved 2019.' where id = '{stu1}'", stu1)
check("A student's edit to a classmate's profile changes nothing", True,
      f"update public.profiles set bio = 'hacked' where id = '{stu2}'; select 1", stu1, expect_out=1)
check("…the classmate's profile is unchanged", True, f"select bio from public.profiles where id = '{stu2}'", phil, expect_out="")
check("A profile can't point at someone else's photo", False,
      f"update public.profiles set avatar_path = '{stu2}/me.jpg' where id = '{stu1}'", stu1)
check("A profile can point at a photo in its own folder", True,
      f"update public.profiles set avatar_path = '{stu1}/me.jpg' where id = '{stu1}'", stu1)
check("Overlong 'about me' is refused", False,
      f"update public.profiles set bio = repeat('x', 1001) where id = '{stu1}'", stu1)
check("Faculty can update a student's profile details (helping someone)", True,
      f"update public.profiles set phone = '907-555-0199' where id = '{stu2}'", phil)
check("Classmates see name, photo, church and about-me…", True,
      f"select home_church || '|' || bio || '|' || avatar_path from public.visible_people() where id = '{stu1}'", stu2,
      expect_out=f"True North Baptist|Saved 2019.|{stu1}/me.jpg")
check("…but never phone or address (still no access to the profile row)", True,
      f"select count(*) from public.profiles where id = '{stu1}'", stu2, expect_out=0)
check("A student outside the class can't see the classmate at all", True,
      f"select count(*) from public.visible_people() where id = '{stu1}'", stu3, expect_out=0)
check("Faculty see a student's phone", True,
      f"select phone from public.profiles where id = '{stu1}'", phil, expect_out="907-555-0101")
check("Student uploads a photo into their own avatar folder", True,
      f"insert into storage.objects (bucket_id, name) values ('avatars', '{stu1}/me.jpg')", stu1)
check("Student cannot upload a photo into someone else's folder", False,
      f"insert into storage.objects (bucket_id, name) values ('avatars', '{stu2}/fake.jpg')", stu1)
check("Student cannot upload a photo with a malformed path", False,
      "insert into storage.objects (bucket_id, name) values ('avatars', 'nope/fake.jpg')", stu1)
admin(f"insert into storage.objects (bucket_id, name) values ('avatars', '{stu3}/d.jpg'), ('avatars', '{phil}/p.jpg')")
check("Classmate sees the photo; outsider's and own-folder rules hold", True,
      "select count(*) from storage.objects where bucket_id = 'avatars'", stu2, expect_out=2)
check("Outsider sees only faculty photos and their own", True,
      "select count(*) from storage.objects where bucket_id = 'avatars'", stu3, expect_out=2)
check("Student cannot delete a classmate's photo", True,
      f"delete from storage.objects where bucket_id = 'avatars' and name = '{stu1}/me.jpg'; select 1", stu2, expect_out=1)
check("…it's still there", True, f"select count(*) from storage.objects where name = '{stu1}/me.jpg'", phil, expect_out=1)
check("Faculty can remove anyone's photo", True,
      f"delete from storage.objects where bucket_id = 'avatars' and name = '{stu3}/d.jpg'; select count(*) from storage.objects where name = '{stu3}/d.jpg'", phil, expect_out=0)
check("Inactive accounts can't upload photos", False,
      f"insert into storage.objects (bucket_id, name) values ('avatars', '{stu4}/x.jpg')", stu4)
check("Signed-out visitors can't list profile photos", True,
      "select count(*) from storage.objects where bucket_id = 'avatars'", None, expect_out=0, role="anon")

# --- archive & delete ----------------------------------------------------------------------
admin("update public.courses set archived = true where id = 'c1'")
check("Archived course: its assignments disappear for students", True,
      "select count(*) from public.assignments", stu1, expect_out=0)
check("Archived course: students can't submit", False,
      f"insert into public.submissions (assignment_id, student_id, status) values ('{locked}', '{stu1}', 'in_progress')", stu1)
admin("update public.courses set archived = false where id = 'c1'")
check("Students cannot delete accounts", False, f"select public.delete_user('{stu2}')", stu1)
check("Faculty delete an account → all their data goes with it", True,
      f"select public.delete_user('{stu1}'); select (select count(*) from public.submissions where student_id = '{stu1}') + (select count(*) from public.messages where student_id = '{stu1}') + (select count(*) from public.enrollments where student_id = '{stu1}') + (select count(*) from public.profiles where id = '{stu1}')", phil, expect_out=0)

# --- report -----------------------------------------------------------------------------------
fails = [r for r in results if not r[0]]
for passed, name, out in results:
    print(("PASS  " if passed else "FAIL  ") + name + (f"\n      → {out[:300]}" if not passed else ""))
print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
