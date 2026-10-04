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

def mkuser(email, name, google=False, approve=True, verified=True):
    uid = str(uuid.uuid4())
    admin(f"insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ('{uid}', '{email}', '{{\"full_name\": \"{name}\", \"role\": \"faculty\"}}', {'now()' if verified else 'null'})")
    if google:
        admin(f"insert into auth.identities (user_id, provider) values ('{uid}', 'google')")
    if approve:
        admin(f"update public.profiles set status = 'active' where id = '{uid}'")
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
check("Faculty can't change anyone's level (Admins only)", False,
      f"update public.profiles set role = 'faculty' where id = '{stu3}'", phil)
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
check("An Admin can promote a student to faculty", True,
      f"update public.profiles set role = 'faculty' where id = '{stu3}'; select role from public.profiles where id = '{stu3}'", church, expect_out="faculty")
check("…and back to student", True,
      f"update public.profiles set role = 'student' where id = '{stu3}'; select role from public.profiles where id = '{stu3}'", church, expect_out="student")
check("Faculty can't demote themselves or others either", False,
      f"update public.profiles set role = 'student' where id = '{phil}'", phil)
check("Faculty can't turn an active account off", False,
      f"update public.profiles set status = 'inactive' where id = '{stu3}'", phil)
check("An Admin can turn an account off…", True,
      f"update public.profiles set status = 'inactive' where id = '{stu3}'; select status from public.profiles where id = '{stu3}'", church, expect_out="inactive")
check("…and faculty can't turn it back on", False,
      f"update public.profiles set status = 'active' where id = '{stu3}'", phil)
check("…but an Admin can", True,
      f"update public.profiles set status = 'active' where id = '{stu3}'; select status from public.profiles where id = '{stu3}'", church, expect_out="active")

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
check("…a course with no teacher yet notifies the Super Admins (not every faculty member)", True,
      "select count(*) from public.notifications where subject like 'Daniel Dotson requested%'", None, expect_out=1)
check("…and plain faculty aren't notified about a course they don't teach", True,
      f"select count(*) from public.notifications where user_id = '{phil}' and subject like 'Daniel Dotson requested%'", None, expect_out=0)
# Pastor Phil teaches the two courses the rest of these checks use.
admin("update public.courses set faculty_id = (select id from public.profiles where email = 'phil@example.com') where id in ('c1', 'c8')")
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

# --- course teachers: who teaches, who can reassign, who sees what -----------------
ruth = mkuser("ruth@example.com", "Ruth Faculty")
admin(f"update public.profiles set role = 'faculty' where id = '{ruth}'")
admin(f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '{stu2}', '{stu2}', 'student', 'Question about the reading')")
admin(f"insert into public.discussion_posts (course_id, author_id, text) values ('c1', '{phil}', 'Welcome to class')")
newc = check("A new course is assigned to whoever creates it", True,
      f"insert into public.courses (title, faculty_id) values ('Pastoral Epistles', '{ruth}') returning faculty_id", phil, expect_out=phil)
check("Another faculty member still sees the course in the catalogue", True, "select count(*) from public.courses where id = 'c1'", ruth, expect_out=1)
check("…and its roster", True, "select count(*) > 0 from public.enrollments where course_id = 'c1'", ruth, expect_out="t")
check("…but NOT its grades or turned-in work", True,
      "select count(*) from public.submissions s join public.assignments a on a.id = s.assignment_id where a.course_id = 'c1'", ruth, expect_out=0)
check("…NOT its private student messages", True, "select count(*) from public.messages where course_id = 'c1'", ruth, expect_out=0)
check("…NOT its discussion board", True, "select count(*) from public.discussion_posts where course_id = 'c1'", ruth, expect_out=0)
check("…and can't open its turned-in files", True,
      "select count(*) from storage.objects where bucket_id = 'submissions' and name like 'c1/%'", ruth, expect_out=0)
check("Other faculty can't grade the course", False,
      f"insert into public.submissions (assignment_id, student_id, status, score) values ('{aid}', '{stu2}', 'graded', 20)", ruth)
check("Other faculty can't post on its board", False,
      f"insert into public.discussion_posts (course_id, author_id, text) values ('c1', '{ruth}', 'hi')", ruth)
check("Other faculty can't message its students", False,
      f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '{stu2}', '{ruth}', 'faculty', 'hi')", ruth)
check("Other faculty can't change the course (0 rows)", True,
      "with u as (update public.courses set title = 'x' where id = 'c1' returning 1) select count(*) from u", ruth, expect_out=0)
check("Other faculty can't add assignments to it", False,
      "insert into public.assignments (course_id, title, due) values ('c1', 'x', '2026-12-01')", ruth)
check("Other faculty can't take over a course themselves", True,
      f"with u as (update public.courses set faculty_id = '{ruth}' where id = 'c8' returning 1) select count(*) from u", ruth, expect_out=0)
check("Other faculty can't settle its enrollment requests", False, f"select public.approve_enrollment('c1', '{stu3}')", ruth)
check("The teacher sees the course's messages", True, "select count(*) > 0 from public.messages where course_id = 'c1'", phil, expect_out="t")
# A Super Admin who doesn't teach the course: manages it, but doesn't read it.
check("A Super Admin who doesn't teach it can't see its grades", True,
      "select count(*) from public.submissions s join public.assignments a on a.id = s.assignment_id where a.course_id = 'c1'", church, expect_out=0)
check("…or its messages", True, "select count(*) from public.messages where course_id = 'c1'", church, expect_out=0)
check("…or its discussion board", True, "select count(*) from public.discussion_posts where course_id = 'c1'", church, expect_out=0)
check("…but can still manage it (schedule, assignments)", True,
      "update public.courses set sched_time = '19:00' where id = 'c1'; insert into public.assignments (course_id, title, due) values ('c1', 'Admin-added quiz', '2026-12-01'); select 1", church, expect_out=1)
# Handing a course off before it starts / reassigning after.
check("Before the start date, the teacher can hand the course to another faculty member", True,
      f"update public.courses set faculty_id = '{ruth}' where id = 'c8'; select faculty_id from public.courses where id = 'c8'", phil, expect_out=ruth)
check("…the new teacher is notified", True,
      f"select count(*) from public.notifications where user_id = '{ruth}' and subject like '%now the teacher for Genesis to Revelation%'", None, expect_out=1)
check("…sees the course's message history", True, "select count(*) > 0 from public.messages where course_id = 'c8'", ruth, expect_out="t")
check("…and the old teacher no longer does", True, "select count(*) from public.messages where course_id = 'c8'", phil, expect_out=0)
check("A course's teacher must be faculty (not a student)", False,
      f"update public.courses set faculty_id = '{stu2}' where id = 'c8'", ruth)
check("After the start date, the teacher can't change who teaches it", False,
      f"update public.courses set faculty_id = '{ruth}' where id = 'c1'", phil)
check("…but a Super Admin can (e.g. the teacher is ill)", True,
      f"update public.courses set faculty_id = '{ruth}' where id = 'c1'; select faculty_id from public.courses where id = 'c1'", church, expect_out=ruth)
check("…and the substitute sees the class's grades and messages", True,
      "select (select count(*) from public.submissions s join public.assignments a on a.id = s.assignment_id where a.course_id = 'c1') > 0 and (select count(*) from public.messages where course_id = 'c1') > 0", ruth, expect_out="t")
check("…while the original teacher no longer does", True,
      "select (select count(*) from public.submissions s join public.assignments a on a.id = s.assignment_id where a.course_id = 'c1') + (select count(*) from public.messages where course_id = 'c1')", phil, expect_out=0)
check("New courses can't be created on someone else's behalf, even by a Super Admin creating it", True,
      f"insert into public.courses (title, faculty_id) values ('Church History', '{phil}') returning faculty_id", church, expect_out=church)
# A teacher who leaves the faculty: the Super Admins cover the course.
admin(f"update public.profiles set role = 'student' where id = '{ruth}'")
check("If the teacher is no longer faculty, Super Admins cover the course's messages", True,
      "select count(*) > 0 from public.messages where course_id = 'c8'", church, expect_out="t")
check("…and the former teacher sees nothing", True, "select count(*) from public.messages where course_id = 'c8'", ruth, expect_out=0)
check("…a student can still message that course", True,
      f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c8', '{stu3}', '{stu3}', 'student', 'Still interested')", stu3)
check("…and that message notifies the Super Admins", True,
      f"select count(*) from public.notifications where user_id = '{church}' and subject like 'New message from Daniel%'", None, expect_out=1)
admin(f"update public.profiles set role = 'faculty' where id = '{ruth}'")
# Cleanup rules that a non-teacher Super Admin triggers still work.
admin(f"update public.courses set faculty_id = '{phil}' where id = 'c1'")
check("A Super Admin who doesn't teach the course can remove a student from it", True,
      f"with d as (delete from public.enrollments where course_id = 'c1' and student_id = '{stu2}' returning 1) select count(*) from d", church, expect_out=1)
check("…and that student's private thread with the teacher is cleared too", True,
      f"select count(*) from public.messages where course_id = 'c1' and student_id = '{stu2}'", None, expect_out=0)
admin(f"insert into public.enrollments (course_id, student_id) values ('c1', '{stu2}') on conflict do nothing")
admin("update public.courses set faculty_id = (select id from public.profiles where email = 'phil@example.com') where id in ('c1', 'c8')")
admin(f"delete from public.courses where faculty_id = '{church}' or title = 'Pastoral Epistles'")

# --- attendance --------------------------------------------------------------------------
LASTCLASS = "(select max(d) from public.course_class_dates('c1') d where d <= public.local_today())"
check("A course's class days come from its schedule (Hermeneutics: 15 Wednesdays)", True,
      "select count(*) || ',' || bool_and(to_char(d, 'Dy') = 'Wed') from public.course_class_dates('c1') d", None, expect_out="15,true")
check("The teacher takes attendance for a class day", True,
      f"""select public.save_attendance('c1', {LASTCLASS}, true, '{{"{stu1}": "late"}}'::jsonb); select count(*) from public.attendance where course_id = 'c1'""", phil, expect_out=3)
check("…students not tapped are marked Present", True,
      f"select status from public.attendance where course_id = 'c1' and student_id = '{stu2}'", phil, expect_out="present")
check("…and the tapped one is Late", True,
      f"select status from public.attendance where course_id = 'c1' and student_id = '{stu1}'", phil, expect_out="late")
check("A student sees only their own attendance", True, "select count(*) from public.attendance", stu2, expect_out=1)
check("…and which days class was held", True, "select count(*) from public.attendance_days where course_id = 'c1'", stu2, expect_out=1)
check("A student can't take attendance", False, f"select public.save_attendance('c1', {LASTCLASS}, true, '{{}}'::jsonb)", stu2)
check("A student can't change their own mark directly", False,
      f"update public.attendance set status = 'present' where student_id = '{stu1}'", stu1)
check("Other faculty can't see a course's attendance", True, "select count(*) from public.attendance where course_id = 'c1'", ruth, expect_out=0)
check("…or take it", False, f"select public.save_attendance('c1', {LASTCLASS}, true, '{{}}'::jsonb)", ruth)
check("A Super Admin who doesn't teach the course can't see its attendance", True,
      "select count(*) from public.attendance where course_id = 'c1'", church, expect_out=0)
check("Attendance can't be taken for a day that hasn't happened yet", False,
      "select public.save_attendance('c1', public.local_today() + 7, true, '{}'::jsonb)", phil)
check("Re-taking a day replaces its marks (no duplicates)", True,
      f"""select public.save_attendance('c1', {LASTCLASS}, true, '{{"{stu1}": "excused"}}'::jsonb); select count(*) || ',' || (select status from public.attendance where student_id = '{stu1}' and course_id = 'c1') from public.attendance where course_id = 'c1'""", phil, expect_out="3,excused")
check("'No class held' clears that day's marks", True,
      f"select public.save_attendance('c1', {LASTCLASS}, false, '{{}}'::jsonb); select count(*) from public.attendance where course_id = 'c1'", phil, expect_out=0)
check("Course attendance settings: only 0–100% allowed", False,
      "update public.courses set attendance_weight = 120 where id = 'c1'", phil)
check("The teacher sets attendance to 10% with Late = 75%", True,
      "update public.courses set attendance_on = true, attendance_weight = 10, attendance_late_credit = 75 where id = 'c1'; select attendance_weight::int || ',' || attendance_late_credit::int from public.courses where id = 'c1'", phil, expect_out="10,75")
check("Other faculty can't change a course's attendance settings (0 rows)", True,
      "with u as (update public.courses set attendance_weight = 50 where id = 'c1' returning 1) select count(*) from u", ruth, expect_out=0)

# --- phone reminders ----------------------------------------------------------------------
check("A teacher turns on reminders for their phone", True,
      "select public.register_push('https://push.example.com/abc', 'BKey', 'authsecret', 'iPhone'); select count(*) from public.push_subscriptions", phil, expect_out=1)
check("Nobody else can see that device", True, "select count(*) from public.push_subscriptions", stu1, expect_out=0)
check("Devices can't be added directly (only through the site's sign-up step)", False,
      f"insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('{stu1}', 'https://evil.example/x', 'k', 'a')", stu1)
check("A non-https device address is refused", False,
      "select public.register_push('http://push.example.com/abc', 'BKey', 'authsecret', 'x')", phil)
check("The push signing keys can't be read from the website", False, "select * from public.push_keys", phil)
check("The website can't trigger reminders itself", False, "select * from public.claim_attendance_reminders()", church)
admin(f"""insert into public.courses (id, title, faculty_id, attendance_on, sched_mode, sched_start, sched_weeks, sched_days, sched_time)
  values ('rm1', 'Reminder Test', '{phil}', true, 'now', public.local_today() - 7, 4,
          array[to_char(public.local_today(), 'Dy')], to_char((now() at time zone 'America/Anchorage') - interval '10 minutes', 'HH24:MI')),
         ('rm2', 'Already Taken', '{phil}', true, 'now', public.local_today() - 7, 4,
          array[to_char(public.local_today(), 'Dy')], to_char((now() at time zone 'America/Anchorage') - interval '10 minutes', 'HH24:MI')),
         ('rm3', 'Not Recording', '{phil}', false, 'now', public.local_today() - 7, 4,
          array[to_char(public.local_today(), 'Dy')], to_char((now() at time zone 'America/Anchorage') - interval '10 minutes', 'HH24:MI')),
         ('rm4', 'Later Today', '{phil}', true, 'now', public.local_today() - 7, 4,
          array[to_char(public.local_today(), 'Dy')], to_char((now() at time zone 'America/Anchorage') + interval '30 minutes', 'HH24:MI'))""")
admin("insert into public.attendance_days (course_id, class_date) values ('rm2', public.local_today())")
check("At class time, the reminder is claimed for the course's teacher", True,
      "select string_agg(course_id || '>' || (teacher_id = (select id from public.profiles where email = 'phil@example.com')), ',') from public.claim_attendance_reminders()", None, expect_out="rm1>true")
check("…exactly once (a second run sends nothing)", True,
      "select count(*) from public.claim_attendance_reminders()", None, expect_out=0)
admin("delete from public.courses where id like 'rm_'")
admin("delete from public.push_subscriptions")

# --- assignment due-date reminders ---------------------------------------------------------
check("A student picks when to be reminded (the morning it's due)", True,
      f"update public.profiles set due_reminders = 'morning' where id = '{stu2}'; select due_reminders from public.profiles where id = '{stu2}'", stu2, expect_out="morning")
check("…only from the allowed choices", False,
      f"update public.profiles set due_reminders = 'hourly' where id = '{stu2}'", stu2)
check("A student turns on reminders for their phone", True,
      "select public.register_push('https://push.example.com/s1', 'BKey', 'a', 'iPhone'); select count(*) from public.push_subscriptions", stu1, expect_out=1)
check("A second student turns on reminders for their phone", True,
      "select public.register_push('https://push.example.com/s2', 'BKey', 'a', 'Android')", stu2)
DUE_TMRW = "(public.local_today() + 1)"
rq1 = admin(f"insert into public.assignments (course_id, title, due, points) values ('c1', 'Reminder Essay', {DUE_TMRW}, 10) returning id").splitlines()[0]
rq2 = admin(f"insert into public.assignments (course_id, title, due, points) values ('c1', 'Already Done', {DUE_TMRW}, 10) returning id").splitlines()[0]
rq3 = admin(f"insert into public.assignments (course_id, title, due, points, submit_anytime, open_date) values ('c1', 'Still Locked', {DUE_TMRW}, 10, false, {DUE_TMRW}) returning id").splitlines()[0]
admin(f"insert into public.submissions (assignment_id, student_id, status) values ('{rq2}', '{stu1}', 'submitted')")
EVE = "((public.local_today() + time '18:30') at time zone 'America/Anchorage')"
MORN = "(((public.local_today() + 1) + time '08:15') at time zone 'America/Anchorage')"
NOON = "((public.local_today() + time '13:00') at time zone 'America/Anchorage')"
admin("delete from public.notifications where kind = 'due'")
check("The website can't trigger assignment reminders itself", False,
      "select public.queue_assignment_reminders()", stu1)
check("Early afternoon: no assignment reminders go out", True,
      f"select public.queue_assignment_reminders({NOON})", None, expect_out=0)
check("6:30 PM the evening before: only work not turned in, only students who chose evenings", True,
      f"select public.queue_assignment_reminders({EVE}) \\g /dev/null\nselect string_agg(subject || '>' || (user_id = '{stu1}'), ',') from public.notifications where kind = 'due'", None,
      expect_out="Due tomorrow: Reminder Essay (Hermeneutics I)>true")
check("…it's a notification that opens the assignment", True,
      f"select link = '/?assignment={rq1}' from public.notifications where kind = 'due'", None, expect_out="t")
check("…exactly once", True,
      f"select public.queue_assignment_reminders({EVE})", None, expect_out=0)
admin("delete from public.notifications where kind = 'due'")
check("8:15 AM the day it's due: the student who chose mornings (and the locked one has now opened)", True,
      f"select public.queue_assignment_reminders({MORN}) \\g /dev/null\nselect string_agg(subject || '>' || (user_id = '{stu2}'), ',' order by subject) from public.notifications where kind = 'due'", None,
      expect_out="Due today: Already Done (Hermeneutics I)>true,Due today: Reminder Essay (Hermeneutics I)>true,Due today: Still Locked (Hermeneutics I)>true")
admin("delete from public.notifications where kind = 'due'")
check("The reminder records can't be read from the website", False, "select * from public.assignment_reminders", phil)
admin(f"delete from public.assignments where id in ('{rq1}', '{rq2}', '{rq3}')")
admin("delete from public.push_subscriptions")

# --- phone calendar subscription ------------------------------------------------------------
tok1 = check("A student gets a private calendar link code", True, "select public.my_calendar_token()", stu1)
check("…the same code each time it's asked for", True, "select public.my_calendar_token()", stu1, expect_out=tok1)
check("…a long random code", True, f"select length('{tok1}') >= 40", None, expect_out="t")
check("Nobody can read anyone's calendar codes from the website", True,
      "select count(*) from public.calendar_feeds", None, expect_out=1)
check("…not even faculty", False, "select * from public.calendar_feeds", phil)
check("The website can't read anyone's calendar through the feed", False,
      f"select * from public.calendar_feed_events('{tok1}')", stu1)
check("Signed-out visitors can't get a calendar code", False, "select public.my_calendar_token()", None, role="anon")
admin("update public.courses set sched_time = '19:00', sched_weeks = 2 where id = 'c1'")
check("The feed holds the student's class days and due dates", True,
      f"select (count(*) filter (where kind = 'class') > 0) and (count(*) filter (where kind = 'due') > 0) from public.calendar_feed_events('{tok1}')", None, expect_out="t")
check("…only for courses they're enrolled in", True,
      f"select (select string_agg(distinct course_id, ',' order by course_id) from public.calendar_feed_events('{tok1}')) = (select string_agg(e.course_id, ',' order by e.course_id) from public.enrollments e join public.courses c on c.id = e.course_id where e.student_id = '{stu1}' and not c.archived)", None, expect_out="t")
check("Before: the last class day is on the calendar", True,
      f"select count(*) from public.calendar_feed_events('{tok1}') where kind = 'class' and course_id = 'c1' and day = {LASTCLASS}", None, expect_out=1)
check("The teacher marks that day 'no class'", True,
      f"select public.save_attendance('c1', {LASTCLASS}, false, '{{}}'::jsonb)", phil)
check("…and it's left off the calendar", True,
      f"select count(*) from public.calendar_feed_events('{tok1}') where kind = 'class' and course_id = 'c1' and day = {LASTCLASS}", None, expect_out=0)
admin("delete from public.attendance_days where course_id = 'c1'")
tokp = check("A teacher gets a calendar link too", True, "select public.my_calendar_token()", phil)
check("…with the courses they teach", True,
      f"select string_agg(distinct course_id, ',' order by course_id) from public.calendar_feed_events('{tokp}')", None, expect_out="c1,c8")
check("A wrong code shows nothing", True,
      "select count(*) from public.calendar_feed_events('0000000000000000000000000000000000000000000000ff')", None, expect_out=0)
tok1b = check("Resetting the link makes a new code", True, "select public.reset_calendar_token()", stu1)
check("…and the old link stops working", True,
      f"select count(*) from public.calendar_feed_events('{tok1}')", None, expect_out=0)
check("…while the new one works", True,
      f"select count(*) > 0 from public.calendar_feed_events('{tok1b}')", None, expect_out="t")
admin(f"update public.profiles set status = 'inactive' where id = '{stu2}'")
tok2 = admin(f"insert into public.calendar_feeds (user_id, token) values ('{stu2}', repeat('ab', 24)) returning token").splitlines()[0]
check("A turned-off account's calendar link shows nothing", True,
      f"select count(*) from public.calendar_feed_events('{tok2}')", None, expect_out=0)
admin(f"update public.profiles set status = 'active' where id = '{stu2}'")

# --- sign-up approval queue ---------------------------------------------------------------
admin("delete from public.notifications")
newbie = mkuser("newbie@example.com", "New Person", approve=False)
check("A new sign-up starts out waiting for approval", True, f"select status from public.profiles where id = '{newbie}'", None, expect_out="pending")
check("…and the Super Admins get a bell notification", True,
      f"select count(*) from public.notifications where user_id = '{church}' and subject like 'New sign-up waiting for approval: New Person%'", None, expect_out=1)
check("…but plain faculty don't", True, f"select count(*) from public.notifications where user_id = '{phil}'", None, expect_out=0)
check("A waiting account can see its own profile (to show the waiting screen)", True,
      "select count(*) from public.profiles", newbie, expect_out=1)
check("…but nothing else — not even the course catalogue", True, "select count(*) from public.courses", newbie, expect_out=0)
check("…can't fill in its profile yet", False, f"update public.profiles set bio = 'spam spam' where id = '{newbie}'", newbie)
check("…can't upload a photo", False, f"insert into storage.objects (bucket_id, name) values ('avatars', '{newbie}/x.jpg')", newbie)
check("…can't approve itself", False, f"update public.profiles set status = 'active' where id = '{newbie}'", newbie)
unv = mkuser("unverified@example.com", "Not Yet Verified", approve=False, verified=False)
check("An unverified sign-up doesn't notify anyone yet", True,
      "select count(*) from public.notifications where subject like '%Not Yet Verified%'", None, expect_out=0)
admin(f"update auth.users set email_confirmed_at = now() where id = '{unv}'")
check("…until they confirm their email", True,
      "select count(*) from public.notifications where subject like '%Not Yet Verified%'", None, expect_out=1)
check("…which is recorded on their profile", True,
      f"select email_verified_at is not null from public.profiles where id = '{unv}'", None, expect_out="t")
check("A waiting account can't change its own verified date", False,
      f"update public.profiles set email_verified_at = null where id = '{unv}'", unv)
sql(f"update public.profiles set status = 'active' where id = '{newbie}'", stu2)
check("Students can't approve sign-ups", True, f"select status from public.profiles where id = '{newbie}'", None, expect_out="pending")
check("Faculty approve a sign-up", True,
      f"update public.profiles set status = 'active' where id = '{newbie}'; select status from public.profiles where id = '{newbie}'", phil, expect_out="active")
check("…and the person is welcomed in their bell", True,
      f"select count(*) from public.notifications where user_id = '{newbie}' and subject like 'Welcome%approved%'", None, expect_out=1)
check("…and can now fill in their profile", True, f"update public.profiles set bio = 'Hello!' where id = '{newbie}'", newbie)
check("Faculty decline a sign-up (delete it)", True,
      f"select public.delete_user('{unv}'); select count(*) from public.profiles where id = '{unv}'", phil, expect_out=0)

# --- notifications: clearing ---------------------------------------------------------------
check("Nobody can clear someone else's notifications", True,
      f"with d as (delete from public.notifications where user_id = '{church}' returning 1) select count(*) from d", phil, expect_out=0)
check("People can clear their own notifications", True,
      f"with d as (delete from public.notifications where user_id = '{church}' returning 1) select count(*) > 0 from d", church, expect_out="t")

# --- notifications by phone and email ------------------------------------------------------
admin("delete from public.notifications")
admin("delete from public.push_subscriptions")
check("A student's phone is turned on", True,
      "select public.register_push('https://push.example.com/n1', 'BKey', 'a', 'iPhone')", stu1)
admin(f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '{stu1}', '{phil}', 'faculty', 'Please see me after class.')")
check("A teacher's message creates a bell notification that links to the conversation", True,
      f"select link from public.notifications where user_id = '{stu1}' and kind = 'message'", None, expect_out="/?thread=c1")
gq = admin("insert into public.assignments (course_id, title, due, points) values ('c1', 'Notify Quiz', public.local_today(), 10) returning id").splitlines()[0]
admin(f"insert into public.submissions (assignment_id, student_id, status, score) values ('{gq}', '{stu1}', 'graded', 9)")
check("A grade notification links to the assignment", True,
      f"select link from public.notifications where user_id = '{stu1}' and kind = 'grade'", None, expect_out=f"/?assignment={gq}")
check("Nothing is sent to phones in the first minute (so things arrive together)", True,
      "select count(*) from public.claim_push_deliveries(now())", None, expect_out=0)
NOW2 = "now() + interval '3 minutes'"
check("After a minute: sent to the student's phone, once", True,
      f"select count(*) from public.claim_push_deliveries({NOW2}) where user_id = '{stu1}'", None, expect_out=2)
check("…and never again", True, f"select count(*) from public.claim_push_deliveries({NOW2})", None, expect_out=0)
check("Instant email: the same notifications go out by email after two minutes", True,
      f"select count(*) || ',' || bool_and(email = 'blake@example.com') || ',' || bool_and(not digest) from public.claim_email_deliveries({NOW2}) where user_id = '{stu1}'", None, expect_out="2,true,true")
check("…once", True, f"select count(*) from public.claim_email_deliveries({NOW2})", None, expect_out=0)
check("A student picks a daily email summary", True,
      f"update public.profiles set notify_email = 'daily' where id = '{stu2}'", stu2)
check("…from the allowed choices only", False, f"update public.profiles set notify_email = 'hourly' where id = '{stu2}'", stu2)
check("…and can't fake when their last summary went out", False,
      f"update public.profiles set last_digest_on = '2030-01-01' where id = '{stu2}'", stu2)
admin(f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '{stu2}', '{phil}', 'faculty', 'Welcome!')")
admin(f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '{stu2}', '{phil}', 'faculty', 'One more thing.')")
LATE = "((public.local_today() + time '06:30') at time zone 'America/Anchorage') + interval '1 day'"
SEVEN = "((public.local_today() + time '07:05') at time zone 'America/Anchorage') + interval '1 day'"
check("Daily: nothing before 7 AM", True, f"select count(*) from public.claim_email_deliveries({LATE}) where user_id = '{stu2}'", None, expect_out=0)
check("Daily: one morning summary with everything waiting", True,
      f"select count(*) || ',' || bool_and(digest) from public.claim_email_deliveries({SEVEN}) where user_id = '{stu2}'", None, expect_out="2,true")
check("…only once that day", True,
      f"select count(*) from public.claim_email_deliveries({SEVEN} + interval '2 hours') where user_id = '{stu2}'", None, expect_out=0)
check("Email off: nothing is emailed", True,
      f"update public.profiles set notify_email = 'off' where id = '{stu2}'", stu2)
admin(f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '{stu2}', '{phil}', 'faculty', 'Quiet.')")
check("…(really nothing)", True, f"select count(*) from public.claim_email_deliveries({NOW2})", None, expect_out=0)
admin(f"insert into public.messages (course_id, student_id, sender_id, from_role, text) values ('c1', '{stu1}', '{phil}', 'faculty', 'Seen already.')")
admin(f"update public.notifications set read = true where user_id = '{stu1}' and pushed_at is null")
check("Something already seen on the site isn't sent to the phone", True,
      f"select count(*) from public.claim_push_deliveries({NOW2})", None, expect_out=0)
check("…or emailed", True, f"select count(*) from public.claim_email_deliveries({NOW2})", None, expect_out=0)
check("The website can't claim deliveries", False, "select * from public.claim_push_deliveries()", phil)
check("…or send notifications of its own", False, f"select public.notify('{stu1}', 'Fake grade: A')", phil)
check("A user can't send themselves a link to another website", False,
      f"update public.notifications set link = 'https://evil.example' where user_id = '{stu1}'", stu1)
admin(f"update public.profiles set notify_email = 'instant' where id = '{stu2}'")
admin("delete from public.push_subscriptions")

# --- class cancellations ---------------------------------------------------------------------
admin("update public.courses set sched_start = public.local_today() - 14, sched_weeks = 6, sched_days = array[to_char(public.local_today() + 2, 'Dy')], sched_time = '19:00' where id = 'c1'")
NEXT = "(public.local_today() + 2)"
admin("delete from public.notifications")
check("Students can't cancel a class", False, f"select public.cancel_class('c1', {NEXT}, 'snow')", stu1)
check("Other faculty can't cancel someone else's class", False, f"select public.cancel_class('c1', {NEXT}, 'snow')", ruth)
check("Only real class days can be canceled", False, f"select public.cancel_class('c1', {NEXT} + 1, 'snow')", phil)
check("Past classes can't be canceled", False, f"select public.cancel_class('c1', {NEXT} - 7, 'snow')", phil)
check("The teacher cancels Thursday's class because of snow", True,
      f"select public.cancel_class('c1', {NEXT}, 'Roads are closed by snow.')", phil)
check("…every active student is told, with the reason", True,
      f"select count(*) || ',' || bool_and(subject like 'Class canceled: Hermeneutics I on %Roads are closed by snow.') from public.notifications where kind = 'cancel'", None, expect_out="2,true")
check("…the day drops off the class days", True,
      f"select count(*) from public.course_class_dates('c1') d where d = {NEXT}", None, expect_out=0)
check("…students can see the cancellation", True, "select count(*) from public.class_cancellations", stu1, expect_out=1)
check("…but students in other courses can't", True, "select count(*) from public.class_cancellations", stu3, expect_out=0)
check("…nobody can change it directly", False, f"insert into public.class_cancellations (course_id, class_date) values ('c1', {NEXT} + 7)", phil)
check("The teacher puts the class back on", True,
      f"select public.restore_class('c1', {NEXT}); select count(*) from public.course_class_dates('c1') d where d = {NEXT}", phil, expect_out=1)
check("…and students hear it's back on", True,
      "select count(*) from public.notifications where subject like 'Class is back on%'", None, expect_out=2)

# --- announcements ---------------------------------------------------------------------------
admin("delete from public.notifications")
check("Students can't post announcements", False,
      f"insert into public.announcements (course_id, author_id, body) values ('c1', '{stu1}', 'Party at my house')", stu1)
check("Other faculty can't post to someone else's course", False,
      f"insert into public.announcements (course_id, author_id, body) values ('c1', '{ruth}', 'Hi')", ruth)
check("The teacher posts an announcement", True,
      f"insert into public.announcements (course_id, author_id, body) values ('c1', '{phil}', 'Bring your Bible and a notebook on Thursday.')", phil)
check("…every enrolled student is notified, linked to the course", True,
      "select count(*) || ',' || bool_and(link = '/?course=c1') from public.notifications where kind = 'announcement'", None, expect_out="2,true")
check("…students in the course see it", True, "select count(*) from public.announcements", stu1, expect_out=1)
check("…students outside it don't", True, "select count(*) from public.announcements", stu3, expect_out=0)
check("…nobody can post as someone else", False,
      f"insert into public.announcements (course_id, author_id, body) values ('c1', '{church}', 'x')", phil)

# --- location and online link ----------------------------------------------------------------
check("The teacher sets the room and an online link", True,
      "update public.courses set location = 'Fellowship Hall', meeting_url = 'https://zoom.us/j/123' where id = 'c1'", phil)
check("…only secure (https) links are allowed", False,
      "update public.courses set meeting_url = 'javascript:alert(1)' where id = 'c1'", phil)
check("…and they appear in the phone calendar feed", True,
      f"select bool_and(location = 'Fellowship Hall') from public.calendar_feed_events((select token from public.calendar_feeds where user_id = '{phil}')) where kind = 'class' and course_id = 'c1'", None, expect_out="t")
admin(f"select public.cancel_class('c1', {NEXT}, 'Snow') from (select set_config('request.jwt.claim.sub', '{phil}', true)) x")
check("A canceled class stays on the phone calendar, marked canceled", True,
      f"select count(*) from public.calendar_feed_events((select token from public.calendar_feeds where user_id = '{phil}')) where kind = 'canceled' and day = {NEXT}", None, expect_out=1)
admin("delete from public.class_cancellations")

# --- copy a course for next term ------------------------------------------------------------
NEWSTART = "(public.local_today() + 120)"
check("Students can't copy courses", False, f"select public.copy_course('c1', 'Copy', {NEWSTART})", stu1)
check("Other faculty can't copy someone else's course", False, f"select public.copy_course('c1', 'Copy', {NEWSTART})", ruth)
cpy = check("The teacher copies Hermeneutics I for next term", True,
      f"select public.copy_course('c1', 'Hermeneutics I (Spring)', {NEWSTART})", phil)
check("…same assignments, due dates moved with the new start date", True,
      f"select (select count(*) from public.assignments where course_id = '{cpy}') = (select count(*) from public.assignments where course_id = 'c1') and (select min(due) from public.assignments where course_id = '{cpy}') - (select min(due) from public.assignments where course_id = 'c1') = 134", None, expect_out="t")
check("…with no students, no turned-in work", True,
      f"select (select count(*) from public.enrollments where course_id = '{cpy}') + (select count(*) from public.submissions s join public.assignments a on a.id = s.assignment_id where a.course_id = '{cpy}')", None, expect_out=0)
check("…the copier teaches it, with the room and link carried over", True,
      f"select (faculty_id = '{phil}') || ',' || location || ',' || (sched_start = {NEWSTART}) from public.courses where id = '{cpy}'", None, expect_out="true,Fellowship Hall,true")
admin(f"delete from public.courses where id = '{cpy}'")
admin(f"delete from public.assignments where id = '{gq}'")

# --- transcripts -----------------------------------------------------------------------------
admin("delete from public.notifications")
ENTRIES = f"""'[{{"student": "{stu1}", "grade": "A", "percent": 93.5, "attendance": 100}}, {{"student": "{stu2}", "grade": "B", "percent": 84}}]'::jsonb"""
check("Students can't record grades", False, f"select public.record_final_grades('c1', {ENTRIES})", stu1)
check("Other faculty can't record grades for someone else's course", False, f"select public.record_final_grades('c1', {ENTRIES})", ruth)
check("Grades can only be recorded for students on the roster", False,
      f"""select public.record_final_grades('c1', '[{{"student": "{stu3}", "grade": "A"}}]'::jsonb)""", phil)
check("Only real letter grades are accepted", False,
      f"""select public.record_final_grades('c1', '[{{"student": "{stu1}", "grade": "A++"}}]'::jsonb)""", phil)
check("The teacher records final grades", True, f"select public.record_final_grades('c1', {ENTRIES})", phil, expect_out=2)
check("…each student is told, with a link to their transcript", True,
      "select count(*) || ',' || bool_and(link = '/?transcript=1') from public.notifications where kind = 'transcript'", None, expect_out="2,true")
check("…the entry keeps its own copy of the course and term", True,
      f"select course_title || ',' || credits || ',' || (term <> '') || ',' || teacher_name from public.transcript_entries where student_id = '{stu1}'", None, expect_out="Hermeneutics I,3,true,Pastor Phil McBroom")
check("Recording again updates rather than duplicates", True,
      f"""select public.record_final_grades('c1', '[{{"student": "{stu1}", "grade": "A", "percent": 95}}]'::jsonb) \\g /dev/null\nselect count(*) || ',' || max(percent) from public.transcript_entries where student_id = '{stu1}'""", phil, expect_out="1,95")
check("A student sees only their own transcript", True, "select count(*) || ',' || max(grade) from public.transcript_entries", stu1, expect_out="1,A")
check("…not a classmate's", True, f"select count(*) from public.transcript_entries where student_id = '{stu2}'", stu1, expect_out=0)
check("The course's teacher sees its entries", True, "select count(*) from public.transcript_entries", phil, expect_out=2)
check("Other faculty don't", True, "select count(*) from public.transcript_entries", ruth, expect_out=0)
check("Admins see every transcript", True, "select count(*) from public.transcript_entries", church, expect_out=2)
check("Nobody changes a transcript directly", False,
      f"update public.transcript_entries set grade = 'A' where student_id = '{stu2}'", stu2)
check("…not even the teacher", False, f"update public.transcript_entries set grade = 'A' where student_id = '{stu2}'", phil)
check("Faculty can't add past courses (Admins only)", False,
      f"select public.save_transcript_entry(null, '{stu2}', 'Old Course', 2, '', 'Fall 2024', null, null, 88, 'B', 'Bro. Smith', '')", phil)
hist = check("An Admin adds a course taken before the site existed", True,
      f"select public.save_transcript_entry(null, '{stu2}', 'Bible Doctrines I', 2, 'Foundational', 'Fall 2024', '2024-09-01', '2024-12-15', 88, 'B', 'Bro. Smith', 'From the paper records')", church)
check("…and corrects it", True,
      f"select public.save_transcript_entry('{hist}', null, 'Bible Doctrines I', 3, 'Foundational', 'Fall 2024', '2024-09-01', '2024-12-15', 91, 'A', 'Bro. Smith', ''); select grade || credits from public.transcript_entries where id = '{hist}'", church, expect_out=f"{hist}\nA3")
check("The student sees it on their transcript", True, "select count(*) from public.transcript_entries", stu2, expect_out=2)

# --- backups ---------------------------------------------------------------------------------
check("Nobody can read backups directly", False, "select * from public.site_backups", church)
check("Students can't download backups", False, "select public.download_backup()", stu1)
check("Faculty who aren't Admins can't either", False, "select public.download_backup()", phil)
check("An Admin downloads a fresh backup", True,
      "select (public.download_backup() -> 'tables' -> 'transcript_entries') is not null", church, expect_out="t")
check("…it holds every course and leaves out private phone keys and calendar links", True,
      "select (jsonb_array_length(public.download_backup() -> 'tables' -> 'courses') = (select count(*) from public.courses)) || ',' || ((public.download_backup() -> 'tables') ? 'calendar_feeds') || ',' || ((public.download_backup() -> 'tables') ? 'push_keys')", church, expect_out="true,false,false")
check("The nightly backup runs once a night from 2 AM", True,
      "select (public.take_nightly_backup_if_due((public.local_today() + time '01:00') at time zone 'America/Anchorage') is null) || ',' || (public.take_nightly_backup_if_due((public.local_today() + time '02:01') at time zone 'America/Anchorage') is not null) || ',' || (public.take_nightly_backup_if_due((public.local_today() + time '03:00') at time zone 'America/Anchorage') is null)", None, expect_out="true,true,true")
check("Admins see the list of backups", True, "select count(*) >= 1 from public.list_backups() where kind = 'nightly'", church, expect_out="t")
check("The website can't take or email backups itself", False, "select * from public.backup_to_email()", church)
check("Only Admins see service health", False, "select * from public.get_service_status()", phil)

# --- archive & delete ----------------------------------------------------------------------
admin("update public.courses set archived = true where id = 'c1'")
check("Archived course: its assignments disappear for students", True,
      "select count(*) from public.assignments", stu1, expect_out=0)
check("Archived course: students can't submit", False,
      f"insert into public.submissions (assignment_id, student_id, status) values ('{locked}', '{stu1}', 'in_progress')", stu1)
admin("update public.courses set archived = false where id = 'c1'")
check("Students cannot delete accounts", False, f"select public.delete_user('{stu2}')", stu1)
check("Faculty can't delete an active account (Admins only)", False, f"select public.delete_user('{stu2}')", phil)
check("An Admin deletes an account → all their data goes with it", True,
      f"select public.delete_user('{stu1}'); select (select count(*) from public.submissions where student_id = '{stu1}') + (select count(*) from public.messages where student_id = '{stu1}') + (select count(*) from public.enrollments where student_id = '{stu1}') + (select count(*) from public.profiles where id = '{stu1}')", church, expect_out=0)
check("…but their transcript is kept for the Institute's records", True,
      f"select count(*) || ',' || bool_and(student_id is null) || ',' || max(student_name) from public.transcript_entries where student_ref = '{stu1}'", church, expect_out="1,true,Blake A. Amis")
admin(f"insert into public.courses (id, title, faculty_id, archived) values ('rmc', 'Old Course', '{phil}', true)")
check("A course's own teacher (faculty) can't delete it — Admins only", True,
      "with d as (delete from public.courses where id = 'rmc' returning 1) select count(*) from d", phil, expect_out=0)
check("…faculty can still archive and reactivate it", True,
      "update public.courses set archived = false where id = 'rmc'; select archived from public.courses where id = 'rmc'", phil, expect_out="f")
check("An Admin can delete a course", True,
      "with d as (delete from public.courses where id = 'rmc' returning 1) select count(*) from d", church, expect_out=1)

# --- report -----------------------------------------------------------------------------------
fails = [r for r in results if not r[0]]
for passed, name, out in results:
    print(("PASS  " if passed else "FAIL  ") + name + (f"\n      → {out[:300]}" if not passed else ""))
print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
