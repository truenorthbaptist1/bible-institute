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
--   faculty  — full admin over courses, grading, rosters, and users.
--   super_admin (separate flag, max 4) — can grant/remove Super Admin.
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

-- Names (never emails) of the people a student can legitimately see:
-- every faculty member, plus classmates in a shared course (so discussion
-- replies show who wrote them). Faculty see everyone.
create or replace function public.visible_people()
returns table (id uuid, name text, role text, super_admin boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.role, p.super_admin
  from profiles p
  where public.is_active_user() and (
    public.is_faculty()
    or p.id = auth.uid()
    or p.role = 'faculty'
    or exists (
      select 1 from enrollments e1
      join enrollments e2 on e1.course_id = e2.course_id
      where e1.student_id = auth.uid() and e2.student_id = p.id
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- New accounts → a student profile, always. Nothing a person types at
-- sign-up (including hidden form fields) can make them faculty.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      initcap(replace(replace(split_part(coalesce(new.email, ''), '@', 1), '.', ' '), '_', ' '))
    ),
    lower(coalesce(new.email, ''))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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
    raise exception 'There are already 4 Super Admins. Remove one before adding another.';
  end if;

  -- Trusted server-side functions (and the SQL Editor) skip the rest.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at then
    raise exception 'That field cannot be changed.';
  end if;

  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not public.is_faculty() then
    raise exception 'Only faculty can change roles or account status.';
  end if;

  if new.super_admin is distinct from old.super_admin and not public.is_super_admin() then
    raise exception 'Only a Super Admin can grant or remove Super Admin.';
  end if;

  if old.super_admin and old.id <> auth.uid() and not public.is_super_admin()
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'Only a Super Admin can change another Super Admin''s account.';
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
create or replace function public.delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_faculty() then
    raise exception 'Only faculty can delete accounts.';
  end if;
  if (select super_admin from public.profiles where id = p_user) and p_user <> auth.uid()
     and not public.is_super_admin() then
    raise exception 'Only a Super Admin can delete another Super Admin.';
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
  if not public.is_faculty() then raise exception 'Only faculty can approve enrollment.'; end if;
  select title into v_title from courses where id = p_course;
  insert into enrollments (course_id, student_id) values (p_course, p_student) on conflict do nothing;
  delete from enrollment_requests where course_id = p_course and student_id = p_student;
  insert into notifications (user_id, subject) values (p_student, 'You''re enrolled in ' || v_title);
end $$;

create or replace function public.deny_enrollment(p_course text, p_student uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not public.is_faculty() then raise exception 'Only faculty can deny enrollment.'; end if;
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

-- Mark the other side's messages in one thread as read.
create or replace function public.mark_thread_read(p_course text, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.is_faculty() then
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
  select f.id, s.name || ' requested to enroll in ' || c.title
    from profiles f, profiles s, courses c
   where f.role = 'faculty' and f.status = 'active'
     and s.id = new.student_id and c.id = new.course_id;
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
    select id, 'New message from ' || coalesce(v_sender, 'a student') || ' in ' || v_title
      from profiles where role = 'faculty' and status = 'active';
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
  if current_user not in ('authenticated', 'anon') or public.is_faculty() then
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

-- courses: the catalogue is visible to any active account; faculty edit.
create policy courses_select on public.courses for select to authenticated using (public.is_active_user());
create policy courses_insert on public.courses for insert to authenticated with check (public.is_faculty());
create policy courses_update on public.courses for update to authenticated using (public.is_faculty()) with check (public.is_faculty());
create policy courses_delete on public.courses for delete to authenticated using (public.is_faculty());

-- enrollments: students see only their own; faculty manage rosters.
create policy enroll_select on public.enrollments for select to authenticated
  using (public.is_faculty() or (student_id = auth.uid() and public.is_active_user()));
create policy enroll_insert on public.enrollments for insert to authenticated with check (public.is_faculty());
create policy enroll_delete on public.enrollments for delete to authenticated using (public.is_faculty());

-- enrollment requests: a student may request an upcoming course for
-- themself, and withdraw their own request; faculty see and settle all.
create policy req_select on public.enrollment_requests for select to authenticated
  using (public.is_faculty() or (student_id = auth.uid() and public.is_active_user()));
create policy req_insert on public.enrollment_requests for insert to authenticated
  with check (
    student_id = auth.uid() and public.is_active_user() and not public.is_faculty()
    and public.course_open_for_request(course_id)
    and not exists (select 1 from public.enrollments e where e.course_id = enrollment_requests.course_id and e.student_id = auth.uid())
  );
create policy req_delete on public.enrollment_requests for delete to authenticated
  using (public.is_faculty() or student_id = auth.uid());

-- materials & assignments: enrolled students read; faculty manage.
create policy materials_select on public.materials for select to authenticated
  using (public.is_faculty() or public.is_enrolled(course_id));
create policy materials_insert on public.materials for insert to authenticated with check (public.is_faculty());
create policy materials_update on public.materials for update to authenticated using (public.is_faculty());
create policy materials_delete on public.materials for delete to authenticated using (public.is_faculty());

create policy assignments_select on public.assignments for select to authenticated
  using (public.is_faculty() or public.is_enrolled(course_id));
create policy assignments_insert on public.assignments for insert to authenticated with check (public.is_faculty());
create policy assignments_update on public.assignments for update to authenticated using (public.is_faculty());
create policy assignments_delete on public.assignments for delete to authenticated using (public.is_faculty());

-- submissions: a student sees and saves only their own; faculty see all.
create policy subs_select on public.submissions for select to authenticated
  using (public.is_faculty() or (student_id = auth.uid() and public.is_active_user()));
create policy subs_insert on public.submissions for insert to authenticated
  with check (public.is_faculty() or (student_id = auth.uid() and public.is_enrolled(public.assignment_course(assignment_id))));
create policy subs_update on public.submissions for update to authenticated
  using (public.is_faculty() or (student_id = auth.uid() and public.is_enrolled(public.assignment_course(assignment_id))))
  with check (public.is_faculty() or (student_id = auth.uid() and public.is_enrolled(public.assignment_course(assignment_id))));
create policy subs_delete on public.submissions for delete to authenticated using (public.is_faculty());

-- discussion: enrolled students read and reply; faculty post and moderate.
create policy posts_select on public.discussion_posts for select to authenticated
  using (public.is_faculty() or public.is_enrolled(course_id));
create policy posts_insert on public.discussion_posts for insert to authenticated
  with check (
    author_id = auth.uid() and (
      public.is_faculty()
      or (parent_id is not null and public.is_enrolled(course_id))
    )
  );
create policy posts_delete on public.discussion_posts for delete to authenticated
  using (public.is_faculty() or author_id = auth.uid());

-- messages: private student ↔ faculty threads, one per course per student.
create policy msg_select on public.messages for select to authenticated
  using (public.is_faculty() or (student_id = auth.uid() and public.is_active_user()));
create policy msg_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid() and (
      (from_role = 'faculty' and public.is_faculty())
      or (from_role = 'student' and student_id = auth.uid() and public.is_active_user() and not public.is_faculty()
          and (public.is_enrolled(course_id) or public.has_message_thread(course_id)))
    )
  );
create policy msg_delete on public.messages for delete to authenticated using (public.is_faculty());

-- notifications: yours only. (Created by the database, never by users.)
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Bible highlights: yours only.
create policy hl_select on public.bible_highlights for select to authenticated using (user_id = auth.uid());
create policy hl_insert on public.bible_highlights for insert to authenticated with check (user_id = auth.uid() and public.is_active_user());
create policy hl_delete on public.bible_highlights for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- File storage: two private buckets with size and type limits.
--   materials/<course_id>/<file>                         (faculty upload)
--   submissions/<course_id>/<assignment_id>/<student_id>/<file>
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
     'audio/mpeg','audio/mp4','audio/x-m4a'])
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

create policy tnbbi_materials_read on storage.objects for select to authenticated
  using (bucket_id = 'materials' and (public.is_faculty() or public.is_enrolled((storage.foldername(name))[1])));
create policy tnbbi_materials_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and public.is_faculty());
create policy tnbbi_materials_delete on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and public.is_faculty());

create policy tnbbi_subs_read on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (public.is_faculty() or (storage.foldername(name))[3] = auth.uid()::text));
create policy tnbbi_subs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and (
    public.is_faculty()
    or ((storage.foldername(name))[3] = auth.uid()::text and public.is_enrolled((storage.foldername(name))[1]))
  ));
create policy tnbbi_subs_update on storage.objects for update to authenticated
  using (bucket_id = 'submissions' and (public.is_faculty() or (storage.foldername(name))[3] = auth.uid()::text));
create policy tnbbi_subs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and (public.is_faculty() or (storage.foldername(name))[3] = auth.uid()::text));

-- ---------------------------------------------------------------------------
-- Function permissions: signed-in users only.
-- ---------------------------------------------------------------------------
revoke execute on function public.claim_bootstrap_super_admin() from public, anon;
revoke execute on function public.delete_user(uuid) from public, anon;
revoke execute on function public.approve_enrollment(text, uuid) from public, anon;
revoke execute on function public.deny_enrollment(text, uuid, text) from public, anon;
revoke execute on function public.mark_thread_read(text, uuid) from public, anon;
revoke execute on function public.visible_people() from public, anon;
grant execute on function public.claim_bootstrap_super_admin() to authenticated;
grant execute on function public.delete_user(uuid) to authenticated;
grant execute on function public.approve_enrollment(text, uuid) to authenticated;
grant execute on function public.deny_enrollment(text, uuid, text) to authenticated;
grant execute on function public.mark_thread_read(text, uuid) to authenticated;
grant execute on function public.visible_people() to authenticated;

-- ---------------------------------------------------------------------------
-- Table access for signed-in users. This only opens the door; the Row Level
-- Security policies above decide which rows anyone can actually see or
-- change. Signed-out visitors (anon) get no table access at all.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
