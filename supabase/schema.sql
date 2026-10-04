-- ============================================================================
-- True North Baptist Church Bible Institute — database schema
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run again later (it drops and recreates its own policies
-- and functions), but it does NOT delete any data on a re-run.
--
-- The single most important idea in this file: privacy is enforced HERE,
-- by the database itself (Row Level Security), not by what the website
-- chooses to show. Even if someone opened their browser's developer tools
-- and asked the database directly for another student's grades, the
-- database would refuse. The app's screens are a convenience on top.
--
-- Roles:
--   student  — every new account. Sees only their own work, grades, and
--              messages, plus the courses they're enrolled in.
--   faculty  — create and run courses (schedules, rosters, assignments,
--              materials, grading); approve new sign-ups and enrollment
--              requests; archive courses.
--   super_admin (flag, max 4; shown on the site as "Admin") — everything
--              faculty can do, plus: change anyone's level (student /
--              faculty / admin), turn accounts off or back on, delete
--              accounts, and permanently delete courses. Admins manage (but
--              don't read the grades of) every course.
--
-- Each course has ONE teacher (courses.faculty_id). Only that teacher sees
-- the course's grades, private messages, and discussion board. Course
-- set-up (schedule, roster, enrollment requests, assignments, materials) is
-- done by its teacher or any Super Admin. A course with no teacher (or
-- whose teacher is no longer active faculty) is covered by the Super
-- Admins until one is assigned.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  role        text not null default 'student' check (role in ('student','faculty')),
  status      text not null default 'active'  check (status in ('active','inactive')),
  super_admin boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Profile details each person fills in on their own My Profile page.
-- (Added Oct 2026. "add column if not exists" makes this safe to re-run.)
--   Seen by: the person themself and faculty — everything.
--            classmates and other students — only name, photo, home church,
--            and "about me" (through visible_people() below). Never phone,
--            address, or email.
alter table public.profiles
  add column if not exists phone        text not null default '' check (length(phone) <= 40),
  add column if not exists address_line text not null default '' check (length(address_line) <= 200),
  add column if not exists city         text not null default '' check (length(city) <= 80),
  add column if not exists state        text not null default '' check (length(state) <= 40),
  add column if not exists postal_code  text not null default '' check (length(postal_code) <= 20),
  add column if not exists home_church  text not null default '' check (length(home_church) <= 120),
  add column if not exists bio          text not null default '' check (length(bio) <= 1000),
  -- The photo's path inside the private "avatars" storage bucket. It must
  -- sit in the person's own folder (<their id>/...), so nobody can point
  -- their profile at someone else's picture.
  add column if not exists avatar_path  text check (avatar_path is null or avatar_path like (id::text || '/%'));

-- New sign-ups wait for approval (added Oct 2026, to keep spammers out).
--   pending  — signed up; can't see or do anything until an admin approves
--   active   — approved
--   inactive — turned off by faculty
-- email_verified_at: when they confirmed their email (Google sign-ins are
-- verified immediately). The approval queue lists verified sign-ups.
alter table public.profiles add column if not exists email_verified_at timestamptz;
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('active','inactive','pending'));
alter table public.profiles alter column status set default 'pending';

create table if not exists public.courses (
  id          text primary key default ('c_' || replace(gen_random_uuid()::text, '-', '')),
  title       text not null check (length(trim(title)) > 0),
  description text not null default '',
  credits     int  not null default 3 check (credits between 0 and 12),
  level       text not null default '100',
  faculty_id  uuid references public.profiles(id) on delete set null,
  archived    boolean not null default false,
  sched_weeks int,
  sched_days  text[] not null default '{}',
  sched_time  text,
  sched_mode  text check (sched_mode in ('now','scheduled')),
  sched_start date,
  created_at  timestamptz not null default now()
);

-- Attendance settings for each course (added Oct 2026).
--   attendance_on          — is attendance being recorded at all?
--   attendance_weight      — % of the final grade (0 = recorded, not graded)
--   attendance_late_credit — how much a "Late" counts, as % of "Present"
alter table public.courses
  add column if not exists attendance_on boolean not null default false,
  add column if not exists attendance_weight numeric not null default 0
    check (attendance_weight >= 0 and attendance_weight <= 100),
  add column if not exists attendance_late_credit numeric not null default 50
    check (attendance_late_credit >= 0 and attendance_late_credit <= 100);

create table if not exists public.enrollments (
  course_id  text not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, student_id)
);

create table if not exists public.enrollment_requests (
  id           uuid primary key default gen_random_uuid(),
  course_id    text not null references public.courses(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  unique (course_id, student_id)
);

create table if not exists public.materials (
  id           uuid primary key default gen_random_uuid(),
  course_id    text not null references public.courses(id) on delete cascade,
  type         text not null default 'material',
  title        text not null,
  storage_path text,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create table if not exists public.assignments (
  id             uuid primary key default gen_random_uuid(),
  course_id      text not null references public.courses(id) on delete cascade,
  title          text not null check (length(trim(title)) > 0),
  instructions   text not null default '',
  due            date not null,
  points         int  not null default 10 check (points > 0),
  weight         numeric not null default 0 check (weight >= 0),
  series_id      text,
  series_label   text,
  submit_anytime boolean not null default true,
  open_date      date,
  created_at     timestamptz not null default now()
);

create table if not exists public.submissions (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null references public.assignments(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'in_progress' check (status in ('not_started','in_progress','submitted','graded')),
  file_name       text,
  storage_path    text,
  mime_type       text,
  written_content text,
  submitted_at    date,
  score           numeric,
  feedback        text not null default '',
  updated_at      timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table if not exists public.discussion_posts (
  id         uuid primary key default gen_random_uuid(),
  course_id  text not null references public.courses(id) on delete cascade,
  parent_id  uuid references public.discussion_posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  course_id  text not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  sender_id  uuid references public.profiles(id) on delete set null,
  from_role  text not null check (from_role in ('student','faculty')),
  text       text not null check (length(trim(text)) > 0),
  sent_at    timestamptz not null default now(),
  read       boolean not null default false
);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  subject    text not null,
  created_at timestamptz not null default now(),
  read       boolean not null default false
);

create table if not exists public.bible_highlights (
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  verse_key  text not null,          -- e.g. "JHN.3.16"
  reference  text not null,          -- e.g. "John 3:16"
  verse_text text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, verse_key)
);

-- Attendance: one row per class day the teacher took (or marked "no class"),
-- and one mark per student for that day.
create table if not exists public.attendance_days (
  course_id  text not null references public.courses(id) on delete cascade,
  class_date date not null,
  held       boolean not null default true,      -- false = no class held that day
  taken_by   uuid references public.profiles(id) on delete set null,
  taken_at   timestamptz not null default now(),
  primary key (course_id, class_date)
);

create table if not exists public.attendance (
  course_id  text not null,
  class_date date not null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status     text not null check (status in ('present','late','absent','excused')),
  primary key (course_id, class_date, student_id),
  foreign key (course_id, class_date) references public.attendance_days(course_id, class_date) on delete cascade
);

-- Phone reminders (Web Push). One row per device a person turned them on for.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  device     text not null default '',
  created_at timestamptz not null default now()
);

-- The site's push-signing keys (made once by the reminder function) and a
-- record of which class days have already been reminded. Neither is
-- readable from the website at all.
create table if not exists public.push_keys (
  id          int primary key default 1 check (id = 1),
  public_key  text not null,
  private_jwk jsonb not null,
  created_at  timestamptz not null default now()
);
create table if not exists public.attendance_reminders (
  course_id  text not null references public.courses(id) on delete cascade,
  class_date date not null,
  sent_at    timestamptz not null default now(),
  primary key (course_id, class_date)
);

create index if not exists idx_assignments_course on public.assignments(course_id);
create index if not exists idx_submissions_student on public.submissions(student_id);
create index if not exists idx_messages_thread on public.messages(course_id, student_id);
create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);
create index if not exists idx_posts_course on public.discussion_posts(course_id);
create index if not exists idx_materials_course on public.materials(course_id);

-- ---------------------------------------------------------------------------
-- Helper functions (who is asking?)
--
-- SECURITY DEFINER so they can read profiles without tripping over the
-- profiles table's own privacy rules. Each only ever answers a yes/no
-- question about the person currently signed in.
-- ---------------------------------------------------------------------------

-- "Today" in Alaska, so a course start date or assignment unlock date flips
-- over at local midnight rather than at midnight UTC (3-4 PM in Alaska).
create or replace function public.local_today() returns date
language sql stable as $$ select (now() at time zone 'America/Anchorage')::date $$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active')
$$;

create or replace function public.is_faculty() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active' and role = 'faculty')
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active' and super_admin)
$$;

create or replace function public.is_enrolled(p_course text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments e
    join profiles p on p.id = e.student_id
    join courses c on c.id = e.course_id
    where e.course_id = p_course and e.student_id = auth.uid()
      and p.status = 'active' and not c.archived
  )
$$;

create or replace function public.course_open_for_request(p_course text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from courses
    where id = p_course and not archived and sched_mode is not null
      and sched_start is not null and sched_start > public.local_today()
  )
$$;

create or replace function public.assignment_course(p_assignment uuid) returns text
language sql stable security definer set search_path = public as $$
  select course_id from assignments where id = p_assignment
$$;

create or replace function public.has_message_thread(p_course text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from messages where course_id = p_course and student_id = auth.uid())
$$;

-- A course's teacher: its assigned instructor, as long as that person is
-- still an active faculty member. NULL means "no teacher right now".
create or replace function public.course_teacher(p_course text) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from courses c join profiles p on p.id = c.faculty_id
  where c.id = p_course and p.role = 'faculty' and p.status = 'active'
$$;

-- Does the signed-in person TEACH this course? Teaching is what unlocks
-- the course's grades, private messages, and discussion board. When a
-- course has no teacher, the Super Admins cover it.
create or replace function public.teaches_course(p_course text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and coalesce(
    public.course_teacher(p_course) = auth.uid(),
    public.is_super_admin()
  )
$$;

-- Can the signed-in person MANAGE this course (schedule, roster,
-- enrollment requests, assignments, materials, details)? Its teacher and
-- every Super Admin.
create or replace function public.manages_course(p_course text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or public.teaches_course(p_course)
$$;

-- Has the course started? (Its start date is today or earlier.)
create or replace function public.course_started(p_course text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from courses where id = p_course
                 and sched_start is not null and sched_start <= public.local_today())
$$;

-- Who hears about a course's student messages and enrollment requests:
-- its teacher, or every active Super Admin when it has none.
create or replace function public.course_recipients(p_course text)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select public.course_teacher(p_course) where public.course_teacher(p_course) is not null
  union
  select id from profiles
   where super_admin and status = 'active' and public.course_teacher(p_course) is null
$$;

-- Every day a course meets, from its schedule: the chosen weekdays, from the
-- start date for the given number of weeks (a year if no length is set).
create or replace function public.course_class_dates(p_course text) returns setof date
language sql stable security definer set search_path = public as $$
  select d::date
    from courses c,
         generate_series(c.sched_start, c.sched_start + (coalesce(c.sched_weeks, 52) * 7 - 1), interval '1 day') d
   where c.id = p_course and c.sched_start is not null
     and to_char(d, 'Dy') = any (c.sched_days)
$$;

-- Can the signed-in person see this other person at all? Faculty see
-- everyone; everyone sees themself and every faculty member; students also
-- see classmates who share a course with them (so discussion replies show
-- who wrote them). Used for names, profile photos, and "about me".
create or replace function public.can_see_person(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_user() and (
    public.is_faculty()
    or p_id = auth.uid()
    or exists (select 1 from profiles where id = p_id and role = 'faculty')
    or exists (
      select 1 from enrollments e1
      join enrollments e2 on e1.course_id = e2.course_id
      where e1.student_id = auth.uid() and e2.student_id = p_id
    )
  )
$$;

-- The public-facing part of everyone a person can see: name, role, photo,
-- home church, and "about me". Never email, phone, or address.
drop function if exists public.visible_people();
create or replace function public.visible_people()
returns table (id uuid, name text, role text, super_admin boolean,
               avatar_path text, home_church text, bio text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.role, p.super_admin, p.avatar_path, p.home_church, p.bio
  from profiles p
  where public.can_see_person(p.id)
$$;

-- ---------------------------------------------------------------------------
-- New accounts → a student profile, always. Nothing a person types at
-- sign-up (including hidden form fields) can make them faculty.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, status, email_verified_at)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      initcap(replace(replace(split_part(coalesce(new.email, ''), '@', 1), '.', ' '), '_', ' '))
    ),
    lower(coalesce(new.email, '')),
    'pending',
    new.email_confirmed_at
  )
  on conflict (id) do nothing;
  if new.email_confirmed_at is not null then
    perform public.notify_admins_of_signup(new.id);
  end if;
  return new;
end $$;

-- Tell every active Super Admin that a verified sign-up is waiting.
create or replace function public.notify_admins_of_signup(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text; v_email text;
begin
  select name, email into v_name, v_email from profiles where id = p_user and status = 'pending';
  if v_email is null then return; end if;
  insert into notifications (user_id, subject)
  select id, 'New sign-up waiting for approval: ' || coalesce(nullif(v_name, ''), v_email) || ' (' || v_email || ')'
    from profiles where super_admin and status = 'active';
end $$;

-- When someone confirms their email, they join the approval queue.
create or replace function public.handle_email_verified() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update profiles set email_verified_at = new.email_confirmed_at where id = new.id;
    perform public.notify_admins_of_signup(new.id);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
drop trigger if exists on_auth_email_verified on auth.users;
create trigger on_auth_email_verified
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_email_verified();

-- Approved: welcome them (they'll see it in their bell).
create or replace function public.notify_on_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'active' then
    insert into notifications (user_id, subject)
    values (new.id, 'Welcome to the Bible Institute! Your account has been approved.');
  end if;
  return new;
end $$;
drop trigger if exists notify_on_approval on public.profiles;
create trigger notify_on_approval after update of status on public.profiles
  for each row execute function public.notify_on_approval();

create or replace function public.super_admin_count_excluding(p_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from profiles where super_admin and id <> p_id
$$;

-- ---------------------------------------------------------------------------
-- Guard rails on profile changes (who can change a role, status, or the
-- Super Admin flag). These run no matter how the change is attempted.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_update() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Hard cap of 4 Super Admins, enforced everywhere.
  if new.super_admin and not old.super_admin
     and public.super_admin_count_excluding(new.id) >= 4 then
    raise exception 'There are already 4 Admins. Remove one before adding another.';
  end if;

  -- Trusted server-side functions (and the SQL Editor) skip the rest.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at
     or new.email_verified_at is distinct from old.email_verified_at then
    raise exception 'That field cannot be changed.';
  end if;

  -- An account waiting for approval (or turned off) can't change anything,
  -- including its own profile.
  if old.id = auth.uid() and old.status <> 'active' then
    raise exception 'Your account is waiting for approval.';
  end if;

  -- Levels (student / faculty / admin) are changed by Admins only.
  if new.role is distinct from old.role and not public.is_super_admin() then
    raise exception 'Only an Admin can change someone''s level.';
  end if;

  -- Faculty may approve a new sign-up (pending -> active); every other
  -- change of account status (turning an account off or back on) is for
  -- Admins.
  if new.status is distinct from old.status and not public.is_super_admin()
     and not (public.is_faculty() and old.status = 'pending' and new.status = 'active') then
    raise exception 'Only an Admin can turn accounts off or back on.';
  end if;

  if new.super_admin is distinct from old.super_admin and not public.is_super_admin() then
    raise exception 'Only an Admin can make someone an Admin or remove it.';
  end if;

  if old.super_admin and old.id <> auth.uid() and not public.is_super_admin()
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'Only an Admin can change another Admin''s account.';
  end if;

  if new.name is distinct from old.name and not (public.is_faculty() or old.id = auth.uid()) then
    raise exception 'You can only change your own name.';
  end if;

  return new;
end $$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Super Admin bootstrap (and self-healing recovery)
--
-- The church's Google account becomes the founding Super Admin (and
-- Faculty) the first time it signs in WITH GOOGLE while no active Super
-- Admin exists. Requiring a Google sign-in means nobody can claim it by
-- simply typing the church's email into the Sign Up form.
-- ---------------------------------------------------------------------------
create or replace function public.claim_bootstrap_super_admin() returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text;
begin
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is distinct from 'truenorthbaptist1@gmail.com' then return false; end if;
  if not exists (select 1 from auth.identities where user_id = auth.uid() and provider = 'google') then
    return false;
  end if;
  if exists (select 1 from public.profiles where super_admin and status = 'active') then
    return false;
  end if;
  update public.profiles set super_admin = true, role = 'faculty', status = 'active' where id = auth.uid();
  return true;
end $$;

-- Permanently delete an account and everything tied to it (enrollments,
-- submissions, messages, requests, highlights all cascade away).
-- Admins can delete any account. Faculty can only decline (delete) a
-- sign-up that is still waiting for approval.
create or replace function public.delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_super_admin() and not (
       public.is_faculty()
       and (select status from public.profiles where id = p_user) = 'pending') then
    raise exception 'Only an Admin can delete accounts.';
  end if;
  delete from auth.users where id = p_user;
end $$;

-- ---------------------------------------------------------------------------
-- Enrollment requests: approve / deny (faculty), atomically.
-- ---------------------------------------------------------------------------
create or replace function public.approve_enrollment(p_course text, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not public.manages_course(p_course) then raise exception 'Only this course''s teacher or an Admin can approve enrollment.'; end if;
  select title into v_title from courses where id = p_course;
  insert into enrollments (course_id, student_id) values (p_course, p_student) on conflict do nothing;
  delete from enrollment_requests where course_id = p_course and student_id = p_student;
  insert into notifications (user_id, subject) values (p_student, 'You''re enrolled in ' || v_title);
end $$;

create or replace function public.deny_enrollment(p_course text, p_student uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not public.manages_course(p_course) then raise exception 'Only this course''s teacher or an Admin can deny enrollment.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'A note to the student is required.'; end if;
  select title into v_title from courses where id = p_course;
  delete from enrollment_requests where course_id = p_course and student_id = p_student;
  perform set_config('tnbbi.skip_message_notify', 'on', true);
  insert into messages (course_id, student_id, sender_id, from_role, text)
  values (p_course, p_student, auth.uid(), 'faculty',
          'Your request to enroll in "' || v_title || '" was not approved. ' || trim(p_note));
  perform set_config('tnbbi.skip_message_notify', 'off', true);
  insert into notifications (user_id, subject)
  values (p_student, 'Your enrollment request for ' || v_title || ' was not approved');
end $$;

-- Take (or re-take) attendance for one class day, all at once. Only the
-- course's teacher; never for a day that hasn't happened yet. Marks are
-- kept only for students actually on the roster.
create or replace function public.save_attendance(p_course text, p_date date, p_held boolean, p_marks jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.teaches_course(p_course) then
    raise exception 'Only this course''s teacher can take its attendance.';
  end if;
  if p_date > public.local_today() then
    raise exception 'Attendance can''t be taken for a day that hasn''t happened yet.';
  end if;
  insert into attendance_days (course_id, class_date, held, taken_by, taken_at)
  values (p_course, p_date, coalesce(p_held, true), auth.uid(), now())
  on conflict (course_id, class_date) do update
    set held = excluded.held, taken_by = excluded.taken_by, taken_at = excluded.taken_at;
  delete from attendance where course_id = p_course and class_date = p_date;
  if coalesce(p_held, true) then
    insert into attendance (course_id, class_date, student_id, status)
    select p_course, p_date, e.student_id, coalesce(p_marks ->> e.student_id::text, 'present')
      from enrollments e
     where e.course_id = p_course;
  end if;
end $$;

-- Clear a day's attendance (e.g. taken on the wrong day by mistake).
create or replace function public.clear_attendance(p_course text, p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.teaches_course(p_course) then
    raise exception 'Only this course''s teacher can change its attendance.';
  end if;
  delete from attendance_days where course_id = p_course and class_date = p_date;
end $$;

-- Phone reminders: register this device for the signed-in person. A device
-- belongs to whoever last turned reminders on with it.
create or replace function public.register_push(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_user() then raise exception 'Not signed in.'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'That isn''t a valid device.'; end if;
  delete from push_subscriptions where endpoint = p_endpoint;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_device, ''), 120));
end $$;

-- The site's public push key (safe to share; it's how a phone knows a
-- reminder really came from the Institute).
create or replace function public.push_public_key() returns text
language sql stable security definer set search_path = public as $$
  select public_key from push_keys where id = 1
$$;

-- Used only by the reminder function (never by the website): every class
-- that has just started, takes attendance, has a teacher, and hasn't been
-- taken or reminded yet today. Each is claimed exactly once.
create or replace function public.claim_attendance_reminders()
returns table (course_id text, course_title text, class_date date, class_time text, teacher_id uuid)
language sql volatile security definer set search_path = public as $$
  with now_ak as (select (now() at time zone 'America/Anchorage') as t),
  due as (
    select c.id, c.title, (n.t)::date as d, c.sched_time, public.course_teacher(c.id) as teacher
      from courses c, now_ak n
     where not c.archived and c.attendance_on
       and c.sched_time ~ '^[0-9]{1,2}:[0-9]{2}'
       and public.course_teacher(c.id) is not null
       and (n.t)::date in (select public.course_class_dates(c.id))
       and n.t >= (n.t)::date + c.sched_time::time
       and n.t <  (n.t)::date + c.sched_time::time + interval '2 hours'
       and not exists (select 1 from attendance_days ad where ad.course_id = c.id and ad.class_date = (n.t)::date)
  ),
  claimed as (
    insert into attendance_reminders (course_id, class_date)
    select id, d from due
    on conflict do nothing
    returning attendance_reminders.course_id, attendance_reminders.class_date
  )
  select due.id, due.title, due.d, due.sched_time, due.teacher
    from due join claimed on claimed.course_id = due.id and claimed.class_date = due.d
$$;

-- Mark the other side's messages in one thread as read.
create or replace function public.mark_thread_read(p_course text, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.teaches_course(p_course) then
    update messages set read = true
     where course_id = p_course and student_id = p_student and from_role = 'student' and not read;
  elsif p_student = auth.uid() and public.is_active_user() then
    update messages set read = true
     where course_id = p_course and student_id = p_student and from_role = 'faculty' and not read;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Automatic in-app notifications (the bell). Generated by the database
-- from real events, so nobody can forge one.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_enrollment_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, subject)
  select r.user_id, s.name || ' requested to enroll in ' || c.title
    from public.course_recipients(new.course_id) r, profiles s, courses c
   where s.id = new.student_id and c.id = new.course_id;
  return new;
end $$;
drop trigger if exists notify_on_enrollment_request on public.enrollment_requests;
create trigger notify_on_enrollment_request after insert on public.enrollment_requests
  for each row execute function public.notify_on_enrollment_request();

-- A manual roster add settles any outstanding request from that student.
create or replace function public.clear_request_on_enroll() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from enrollment_requests where course_id = new.course_id and student_id = new.student_id;
  return new;
end $$;
drop trigger if exists clear_request_on_enroll on public.enrollments;
create trigger clear_request_on_enroll after insert on public.enrollments
  for each row execute function public.clear_request_on_enroll();

create or replace function public.notify_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_sender text;
begin
  if coalesce(current_setting('tnbbi.skip_message_notify', true), 'off') = 'on' then return new; end if;
  select title into v_title from courses where id = new.course_id;
  select name into v_sender from profiles where id = new.sender_id;
  if new.from_role = 'student' then
    insert into notifications (user_id, subject)
    select user_id, 'New message from ' || coalesce(v_sender, 'a student') || ' in ' || v_title
      from public.course_recipients(new.course_id);
  else
    insert into notifications (user_id, subject)
    values (new.student_id, 'New message from ' || coalesce(v_sender, 'your instructor') || ' in ' || v_title);
  end if;
  return new;
end $$;
drop trigger if exists notify_on_message on public.messages;
create trigger notify_on_message after insert on public.messages
  for each row execute function public.notify_on_message();

create or replace function public.notify_on_grade() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_a text; v_c text;
begin
  if new.status = 'graded' and (tg_op = 'INSERT' or old.status is distinct from 'graded') then
    select a.title, c.title into v_a, v_c from assignments a join courses c on c.id = a.course_id where a.id = new.assignment_id;
    insert into notifications (user_id, subject) values (new.student_id, 'Grade posted for ' || v_a || ' in ' || v_c);
  end if;
  return new;
end $$;
drop trigger if exists notify_on_grade on public.submissions;
create trigger notify_on_grade after insert or update on public.submissions
  for each row execute function public.notify_on_grade();

-- ---------------------------------------------------------------------------
-- Submissions guard: a student can save or turn in their own work, but can
-- never grade it, change a grade, edit after grading, back-date it, or
-- submit before a locked assignment opens.
-- ---------------------------------------------------------------------------
create or replace function public.guard_submission() returns trigger
language plpgsql set search_path = public as $$
declare a record;
begin
  new.updated_at := now();
  if current_user not in ('authenticated', 'anon')
     or public.teaches_course(public.assignment_course(new.assignment_id)) then
    return new;
  end if;

  if new.student_id is distinct from auth.uid() then
    raise exception 'You can only submit your own work.';
  end if;
  if new.status not in ('in_progress', 'submitted') then
    raise exception 'Students cannot set that status.';
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'graded' then raise exception 'This assignment has already been graded.'; end if;
    if new.score is distinct from old.score or new.feedback is distinct from old.feedback
       or new.assignment_id is distinct from old.assignment_id then
      raise exception 'Students cannot change grades.';
    end if;
  else
    if new.score is not null or coalesce(new.feedback, '') <> '' then
      raise exception 'Students cannot change grades.';
    end if;
  end if;

  select x.submit_anytime, x.open_date, c.archived into a
    from assignments x join courses c on c.id = x.course_id where x.id = new.assignment_id;
  if a.archived then raise exception 'This course has been archived.'; end if;
  if not a.submit_anytime and a.open_date is not null and a.open_date > public.local_today() then
    raise exception 'This assignment is not open yet.';
  end if;

  -- The server decides the turn-in date, so the "Late" flag can be trusted.
  if new.status = 'submitted' then
    new.submitted_at := public.local_today();
  elsif tg_op = 'UPDATE' then
    new.submitted_at := old.submitted_at;
  else
    new.submitted_at := null;
  end if;
  return new;
end $$;
drop trigger if exists guard_submission on public.submissions;
create trigger guard_submission before insert or update on public.submissions
  for each row execute function public.guard_submission();

-- Discussion replies must hang off a top-level post in the same course.
create or replace function public.guard_discussion() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.parent_id is not null then
    select course_id, parent_id into p from discussion_posts where id = new.parent_id;
    if p.course_id is distinct from new.course_id or p.parent_id is not null then
      raise exception 'Replies must belong to a post in the same course.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_discussion on public.discussion_posts;
create trigger guard_discussion before insert on public.discussion_posts
  for each row execute function public.guard_discussion();

-- ---------------------------------------------------------------------------
-- Course teachers.
--   * Whoever creates a course becomes its teacher (if they're faculty).
--   * Before the start date, the current teacher can hand the course to
--     another faculty member; any Super Admin can reassign it at any time
--     (e.g. a teacher falls ill mid-course).
--   * The new teacher sees the course's whole history; the old one no
--     longer sees its grades, messages, or discussion.
-- ---------------------------------------------------------------------------
create or replace function public.guard_course_teacher() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;

  if tg_op = 'INSERT' then
    new.faculty_id := case when public.is_faculty() then auth.uid() else null end;
    return new;
  end if;

  if new.faculty_id is distinct from old.faculty_id then
    if new.faculty_id is not null and not exists (
      select 1 from profiles where id = new.faculty_id and role = 'faculty' and status = 'active'
    ) then
      raise exception 'A course''s teacher must be an active faculty member.';
    end if;
    if not public.is_super_admin() then
      if old.faculty_id is distinct from auth.uid() or not public.is_faculty() then
        raise exception 'Only this course''s teacher or an Admin can change who teaches it.';
      end if;
      if old.sched_start is not null and old.sched_start <= public.local_today() then
        raise exception 'This course has already started, so only an Admin can change its teacher.';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_course_teacher on public.courses;
create trigger guard_course_teacher before insert or update on public.courses
  for each row execute function public.guard_course_teacher();

-- Let the new teacher know.
create or replace function public.notify_on_teacher_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.faculty_id is not null and new.faculty_id is distinct from old.faculty_id
     and new.faculty_id is distinct from auth.uid() then
    insert into notifications (user_id, subject)
    values (new.faculty_id, 'You''re now the teacher for ' || new.title);
  end if;
  return new;
end $$;
drop trigger if exists notify_on_teacher_change on public.courses;
create trigger notify_on_teacher_change after update on public.courses
  for each row execute function public.notify_on_teacher_change();

-- Private messages belong to an enrollment: they're removed when a student
-- leaves a course or the course is archived. Done here (not by the site)
-- so it works even for a Super Admin who can't read those messages.
create or replace function public.clear_messages_on_unenroll() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from messages where course_id = old.course_id and student_id = old.student_id;
  return old;
end $$;
drop trigger if exists clear_messages_on_unenroll on public.enrollments;
create trigger clear_messages_on_unenroll after delete on public.enrollments
  for each row execute function public.clear_messages_on_unenroll();

create or replace function public.clear_messages_on_archive() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.archived and not old.archived then
    delete from messages where course_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists clear_messages_on_archive on public.courses;
create trigger clear_messages_on_archive after update on public.courses
  for each row execute function public.clear_messages_on_archive();

-- ---------------------------------------------------------------------------
-- Row Level Security — who can see and change which rows.
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.courses             enable row level security;
alter table public.enrollments         enable row level security;
alter table public.enrollment_requests enable row level security;
alter table public.materials           enable row level security;
alter table public.assignments         enable row level security;
alter table public.submissions         enable row level security;
alter table public.discussion_posts    enable row level security;
alter table public.messages            enable row level security;
alter table public.notifications       enable row level security;
alter table public.bible_highlights    enable row level security;
alter table public.attendance_days      enable row level security;
alter table public.attendance           enable row level security;
alter table public.push_subscriptions   enable row level security;
alter table public.push_keys            enable row level security;
alter table public.attendance_reminders enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles: you see yourself; faculty see everyone. (Students get names of
-- instructors and classmates through visible_people(), never emails.)
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_faculty());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_faculty())
  with check (id = auth.uid() or public.is_faculty());

-- courses: the catalogue is visible to any active account. Faculty and
-- Super Admins add courses; a course is changed by its teacher or a Super
-- Admin (guard_course_teacher decides who may change the teacher itself).
create policy courses_select on public.courses for select to authenticated using (public.is_active_user());
create policy courses_insert on public.courses for insert to authenticated with check (public.is_faculty() or public.is_super_admin());
create policy courses_update on public.courses for update to authenticated
  using (public.manages_course(id)) with check (public.is_faculty() or public.is_super_admin());
-- Permanently deleting a course is for Admins only (faculty can archive).
create policy courses_delete on public.courses for delete to authenticated using (public.is_super_admin());

-- enrollments: students see only their own; faculty can see rosters; the
-- course's teacher or a Super Admin changes them.
create policy enroll_select on public.enrollments for select to authenticated
  using (public.is_faculty() or public.is_super_admin() or (student_id = auth.uid() and public.is_active_user()));
create policy enroll_insert on public.enrollments for insert to authenticated with check (public.manages_course(course_id));
create policy enroll_delete on public.enrollments for delete to authenticated using (public.manages_course(course_id));

-- enrollment requests: a student may request an upcoming course for
-- themself, and withdraw their own request; the course's teacher or a
-- Super Admin sees and settles them.
create policy req_select on public.enrollment_requests for select to authenticated
  using (public.manages_course(course_id) or (student_id = auth.uid() and public.is_active_user()));
create policy req_insert on public.enrollment_requests for insert to authenticated
  with check (
    student_id = auth.uid() and public.is_active_user() and not public.is_faculty()
    and public.course_open_for_request(course_id)
    and not exists (select 1 from public.enrollments e where e.course_id = enrollment_requests.course_id and e.student_id = auth.uid())
  );
create policy req_delete on public.enrollment_requests for delete to authenticated
  using (public.manages_course(course_id) or student_id = auth.uid());

-- materials & assignments: enrolled students and faculty read; the
-- course's teacher or a Super Admin manages them.
create policy materials_select on public.materials for select to authenticated
  using (public.is_faculty() or public.is_super_admin() or public.is_enrolled(course_id));
create policy materials_insert on public.materials for insert to authenticated with check (public.manages_course(course_id));
create policy materials_update on public.materials for update to authenticated using (public.manages_course(course_id));
create policy materials_delete on public.materials for delete to authenticated using (public.manages_course(course_id));

create policy assignments_select on public.assignments for select to authenticated
  using (public.is_faculty() or public.is_super_admin() or public.is_enrolled(course_id));
create policy assignments_insert on public.assignments for insert to authenticated with check (public.manages_course(course_id));
create policy assignments_update on public.assignments for update to authenticated using (public.manages_course(course_id));
create policy assignments_delete on public.assignments for delete to authenticated using (public.manages_course(course_id));

-- submissions & grades: a student sees and saves only their own; only the
-- course's teacher sees and grades the class's work.
create policy subs_select on public.submissions for select to authenticated
  using (public.teaches_course(public.assignment_course(assignment_id)) or (student_id = auth.uid() and public.is_active_user()));
create policy subs_insert on public.submissions for insert to authenticated
  with check (public.teaches_course(public.assignment_course(assignment_id)) or (student_id = auth.uid() and public.is_enrolled(public.assignment_course(assignment_id))));
create policy subs_update on public.submissions for update to authenticated
  using (public.teaches_course(public.assignment_course(assignment_id)) or (student_id = auth.uid() and public.is_enrolled(public.assignment_course(assignment_id))))
  with check (public.teaches_course(public.assignment_course(assignment_id)) or (student_id = auth.uid() and public.is_enrolled(public.assignment_course(assignment_id))));
create policy subs_delete on public.submissions for delete to authenticated using (public.teaches_course(public.assignment_course(assignment_id)));

-- discussion: enrolled students read and reply; the course's teacher posts
-- and moderates. Other faculty don't see the board.
create policy posts_select on public.discussion_posts for select to authenticated
  using (public.teaches_course(course_id) or public.is_enrolled(course_id));
create policy posts_insert on public.discussion_posts for insert to authenticated
  with check (
    author_id = auth.uid() and (
      public.teaches_course(course_id)
      or (parent_id is not null and public.is_enrolled(course_id))
    )
  );
create policy posts_delete on public.discussion_posts for delete to authenticated
  using (public.teaches_course(course_id) or author_id = auth.uid());

-- messages: private student ↔ teacher threads, one per course per student.
-- Only that course's teacher (or, with no teacher, the Super Admins) sees
-- the student's side.
create policy msg_select on public.messages for select to authenticated
  using (public.teaches_course(course_id) or (student_id = auth.uid() and public.is_active_user()));
create policy msg_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid() and (
      (from_role = 'faculty' and public.teaches_course(course_id))
      or (from_role = 'student' and student_id = auth.uid() and public.is_active_user() and not public.is_faculty()
          and (public.is_enrolled(course_id) or public.has_message_thread(course_id)))
    )
  );
create policy msg_delete on public.messages for delete to authenticated using (public.teaches_course(course_id));

-- notifications: yours only. (Created by the database, never by users.)
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- attendance: like grades — the course's teacher takes and sees it; each
-- student sees only their own marks (and which days class was held).
-- Changes go through save_attendance()/clear_attendance().
create policy attdays_select on public.attendance_days for select to authenticated
  using (public.teaches_course(course_id) or public.is_enrolled(course_id));
create policy att_select on public.attendance for select to authenticated
  using (public.teaches_course(course_id) or (student_id = auth.uid() and public.is_active_user()));

-- push subscriptions: your own devices only (added via register_push()).
create policy push_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
-- push_keys and attendance_reminders: no policies at all = no website access.

-- Bible highlights: yours only.
create policy hl_select on public.bible_highlights for select to authenticated using (user_id = auth.uid());
create policy hl_insert on public.bible_highlights for insert to authenticated with check (user_id = auth.uid() and public.is_active_user());
create policy hl_delete on public.bible_highlights for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- File storage: three private buckets with size and type limits.
--   materials/<course_id>/<file>                         (faculty upload)
--   submissions/<course_id>/<assignment_id>/<student_id>/<file>
--   avatars/<user_id>/<file>                             (profile photos)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('materials', 'materials', false, 52428800, array[
     'application/pdf','application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-powerpoint',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/vnd.oasis.opendocument.text','application/rtf','text/plain',
     'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
     'audio/mpeg','audio/mp4','audio/x-m4a','video/mp4']),
  ('submissions', 'submissions', false, 26214400, array[
     'application/pdf','application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-powerpoint',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/vnd.oasis.opendocument.text','application/rtf','text/plain',
     'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
     'audio/mpeg','audio/mp4','audio/x-m4a']),
  -- Profile photos. The site shrinks every photo to a small square JPEG
  -- before uploading, so 2 MB is generous.
  ('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tnbbi_materials_read   on storage.objects;
drop policy if exists tnbbi_materials_insert on storage.objects;
drop policy if exists tnbbi_materials_delete on storage.objects;
drop policy if exists tnbbi_subs_read        on storage.objects;
drop policy if exists tnbbi_subs_insert      on storage.objects;
drop policy if exists tnbbi_subs_update      on storage.objects;
drop policy if exists tnbbi_subs_delete      on storage.objects;
drop policy if exists tnbbi_avatars_read     on storage.objects;
drop policy if exists tnbbi_avatars_insert   on storage.objects;
drop policy if exists tnbbi_avatars_update   on storage.objects;
drop policy if exists tnbbi_avatars_delete   on storage.objects;

create policy tnbbi_materials_read on storage.objects for select to authenticated
  using (bucket_id = 'materials' and (public.is_faculty() or public.is_super_admin() or public.is_enrolled((storage.foldername(name))[1])));
create policy tnbbi_materials_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and public.manages_course((storage.foldername(name))[1]));
create policy tnbbi_materials_delete on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and public.manages_course((storage.foldername(name))[1]));

-- Turned-in files: the student who turned them in, and the course's teacher.
create policy tnbbi_subs_read on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (public.teaches_course((storage.foldername(name))[1]) or (storage.foldername(name))[3] = auth.uid()::text));
create policy tnbbi_subs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and (
    public.teaches_course((storage.foldername(name))[1])
    or ((storage.foldername(name))[3] = auth.uid()::text and public.is_enrolled((storage.foldername(name))[1]))
  ));
create policy tnbbi_subs_update on storage.objects for update to authenticated
  using (bucket_id = 'submissions' and (public.teaches_course((storage.foldername(name))[1]) or (storage.foldername(name))[3] = auth.uid()::text));
-- (Deleting a whole course clears its files: the teacher or a Super Admin.)
create policy tnbbi_subs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and (public.manages_course((storage.foldername(name))[1]) or (storage.foldername(name))[3] = auth.uid()::text));

-- Profile photos: you can see the photo of anyone you can see by name.
-- You manage your own; faculty can also add or remove anyone's (e.g. to
-- help someone who isn't comfortable with uploads, or take one down).
create or replace function public.avatar_owner(p_name text) returns uuid
language sql stable as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-f-]{36}$'
              then ((storage.foldername(p_name))[1])::uuid end
$$;
create policy tnbbi_avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.can_see_person(public.avatar_owner(name)));
create policy tnbbi_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_active_user()
    and (public.avatar_owner(name) = auth.uid() or public.is_faculty()));
create policy tnbbi_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_active_user()
    and (public.avatar_owner(name) = auth.uid() or public.is_faculty()));
create policy tnbbi_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_active_user()
    and (public.avatar_owner(name) = auth.uid() or public.is_faculty()));

-- ---------------------------------------------------------------------------
-- Function permissions: signed-in users only.
-- ---------------------------------------------------------------------------
revoke execute on function public.claim_bootstrap_super_admin() from public, anon;
revoke execute on function public.delete_user(uuid) from public, anon;
revoke execute on function public.approve_enrollment(text, uuid) from public, anon;
revoke execute on function public.deny_enrollment(text, uuid, text) from public, anon;
revoke execute on function public.mark_thread_read(text, uuid) from public, anon;
revoke execute on function public.visible_people() from public, anon;
revoke execute on function public.can_see_person(uuid) from public, anon;
revoke execute on function public.course_teacher(text) from public, anon;
revoke execute on function public.teaches_course(text) from public, anon;
revoke execute on function public.manages_course(text) from public, anon;
revoke execute on function public.course_started(text) from public, anon;
revoke execute on function public.course_recipients(text) from public, anon;
revoke execute on function public.course_class_dates(text) from public, anon;
revoke execute on function public.save_attendance(text, date, boolean, jsonb) from public, anon;
revoke execute on function public.clear_attendance(text, date) from public, anon;
revoke execute on function public.register_push(text, text, text, text) from public, anon;
revoke execute on function public.push_public_key() from public, anon;
revoke execute on function public.claim_attendance_reminders() from public, anon, authenticated;
grant execute on function public.claim_bootstrap_super_admin() to authenticated;
grant execute on function public.delete_user(uuid) to authenticated;
grant execute on function public.approve_enrollment(text, uuid) to authenticated;
grant execute on function public.deny_enrollment(text, uuid, text) to authenticated;
grant execute on function public.mark_thread_read(text, uuid) to authenticated;
grant execute on function public.visible_people() to authenticated;
grant execute on function public.can_see_person(uuid) to authenticated;
grant execute on function public.course_teacher(text) to authenticated;
grant execute on function public.teaches_course(text) to authenticated;
grant execute on function public.manages_course(text) to authenticated;
grant execute on function public.course_started(text) to authenticated;
grant execute on function public.course_recipients(text) to authenticated;
grant execute on function public.course_class_dates(text) to authenticated;
revoke execute on function public.notify_admins_of_signup(uuid) from public, anon, authenticated;
grant execute on function public.save_attendance(text, date, boolean, jsonb) to authenticated;
grant execute on function public.clear_attendance(text, date) to authenticated;
grant execute on function public.register_push(text, text, text, text) to authenticated;
grant execute on function public.push_public_key() to authenticated;

-- ---------------------------------------------------------------------------
-- Table access for signed-in users. This only opens the door; the Row Level
-- Security policies above decide which rows anyone can actually see or
-- change. Signed-out visitors (anon) get no table access at all.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
-- Attendance and push data change only through the functions above.
revoke insert, update, delete on public.attendance_days, public.attendance from authenticated;
revoke insert, update on public.push_subscriptions from authenticated;
revoke all on public.push_keys, public.attendance_reminders from authenticated;
