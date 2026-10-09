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
-- Teacher-only materials (Oct 2026): answer keys, teacher notes and the like.
-- Faculty and Admins see them; students never do (enforced below and in
-- storage). Safe to re-run.
alter table public.materials add column if not exists teacher_only boolean not null default false;

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

-- ===========================================================================
-- Hybrid & online courses (added Oct 9, 2026)
-- ===========================================================================
-- A course can be attended three ways at once: in the classroom, live
-- online (watching the YouTube Live stream inside the site), or by watching
-- the recording afterward. Assignments, discussion, messages and grades are
-- the same for everyone; only attendance differs.
--   format  in_person — everyone in the room (recordings, if any, are make-ups)
--           hybrid    — classroom + online students
--           online    — online students only
--   pace    calendar  — everyone follows the class calendar
--           self      — online, self-paced: every lecture open at once; each
--                       student's dates count from the day they start, and
--                       they have one semester (sched_weeks) to finish
--   playlist_id   — the YouTube playlist the lectures are uploaded to
--   live_video_id — optional: the live stream for the next class, if it
--                   isn't in the playlist (normally found automatically)
--   class_minutes — how long a class lasts (live viewers need 75% of it)
alter table public.courses
  add column if not exists format text not null default 'in_person'
    check (format in ('in_person','hybrid','online')),
  add column if not exists pace text not null default 'calendar'
    check (pace in ('calendar','self')),
  add column if not exists playlist_id text not null default ''
    check (playlist_id ~ '^[A-Za-z0-9_-]{0,64}$'),
  add column if not exists live_video_id text not null default ''
    check (live_video_id ~ '^[A-Za-z0-9_-]{0,20}$'),
  add column if not exists class_minutes int not null default 90
    check (class_minutes between 15 and 480);

-- How each student attends. live and recorded are both "online": either way
-- of watching counts. start_on = the day a self-paced student started.
alter table public.enrollments
  add column if not exists track text not null default 'classroom'
    check (track in ('classroom','live','recorded')),
  add column if not exists track_chosen boolean not null default false,
  add column if not exists start_on date not null default ((now() at time zone 'America/Anchorage')::date);

-- Attendance days the site filled in by itself (online students), as
-- opposed to days the teacher actually took attendance in class.
alter table public.attendance_days add column if not exists teacher_taken boolean not null default true;
-- Marks the site set from watching (live or recording), and why.
alter table public.attendance
  add column if not exists auto boolean not null default false,
  add column if not exists note text not null default '';

-- One lecture video. Most come from the course's playlist; a teacher can
-- also add one by link, or swap in a better recording (replaces = the
-- playlist video it stands in for, so the playlist doesn't bring it back).
--   status ok | live | upcoming | private | no_embed | removed
create table if not exists public.lessons (
  id               uuid primary key default gen_random_uuid(),
  course_id        text not null references public.courses(id) on delete cascade,
  video_id         text not null check (video_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  title            text not null default '' check (length(title) <= 300),
  position         int  not null default 0,
  duration_seconds int  check (duration_seconds is null or duration_seconds > 0),
  published_at     timestamptz,
  status           text not null default 'ok'
                   check (status in ('ok','live','upcoming','private','no_embed','removed')),
  from_playlist    boolean not null default true,
  replaces         text not null default '',
  hidden           boolean not null default false,
  class_date       date,                 -- set by the teacher; null = automatic
  added_at         timestamptz not null default now(),
  notified_at      timestamptz,
  live_notified_at timestamptz,
  unique (course_id, video_id)
);
create index if not exists idx_lessons_course on public.lessons(course_id);

-- How much of each lecture a student has watched: 200 slices of the video,
-- each marked once it has actually played (skipping ahead doesn't count).
create table if not exists public.lesson_views (
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  seen         bit(200) not null default repeat('0', 200)::bit(200),
  pct          numeric not null default 0,
  first_at     timestamptz not null default now(),
  last_at      timestamptz not null default now(),
  completed_at timestamptz,               -- first time 95% was reached
  primary key (lesson_id, student_id)
);

-- Minutes each online student watched a class live, inside the site.
create table if not exists public.live_presence (
  course_id  text not null references public.courses(id) on delete cascade,
  class_date date not null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  minutes    int  not null default 0,
  last_beat  timestamptz,
  primary key (course_id, class_date, student_id)
);

-- The chat under the live stream: questions to the teacher during class.
create table if not exists public.live_chat (
  id         uuid primary key default gen_random_uuid(),
  course_id  text not null references public.courses(id) on delete cascade,
  class_date date not null default ((now() at time zone 'America/Anchorage')::date),
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists idx_live_chat_course on public.live_chat(course_id, created_at);

-- Playlist checking: when each course's playlist was last read from YouTube.
create table if not exists public.playlist_sync (
  course_id    text primary key references public.courses(id) on delete cascade,
  playlist_id  text not null default '',
  synced_at    timestamptz,
  requested_at timestamptz,
  ok           boolean,
  error        text not null default '',
  video_count  int not null default 0
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

-- Assignment due-date reminders (added Oct 2026). Each person picks when
-- they'd like a nudge about work that isn't turned in yet:
--   evening — 6 PM the evening before it's due (the default)
--   morning — 8 AM the day it's due
--   both    — both of those
--   off     — no assignment reminders
-- They only arrive on devices the person turned reminders on for.
alter table public.profiles
  add column if not exists due_reminders text not null default 'evening'
    check (due_reminders in ('off','evening','morning','both'));

-- Which assignment reminders have already gone out (each one at most once).
-- Not readable from the website.
create table if not exists public.assignment_reminders (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  kind          text not null check (kind in ('evening','morning')),
  sent_at       timestamptz not null default now(),
  primary key (assignment_id, student_id, kind)
);

-- Phone-calendar subscription (added Oct 2026). Each person gets a private
-- link their phone's calendar app checks for updates (class days and due
-- dates). The link carries a long random code instead of a password; the
-- person can replace it any time, which stops the old link working.
create table if not exists public.calendar_feeds (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Added Oct 4, 2026 (second update): locations, notifications by phone and
-- email, backups, transcripts, class cancellations, announcements, the
-- first-time tour.
-- ---------------------------------------------------------------------------

-- Where a class meets: a room or address, and/or an online meeting link.
alter table public.courses
  add column if not exists location    text not null default '' check (length(location) <= 200),
  add column if not exists meeting_url text not null default ''
    check (meeting_url = '' or (meeting_url ~* '^https://[^\s<>"]+$' and length(meeting_url) <= 500));

-- How each person hears about things when they're not on the site.
--   notify_email: instant (a short email a minute or two after it happens),
--                 daily (one summary each morning), or off.
--   last_digest_on: the day the last morning summary went out (set only by
--                   the server).
--   tour_seen_at: when they finished (or skipped) the first-time tour.
alter table public.profiles
  add column if not exists notify_email   text not null default 'instant'
    check (notify_email in ('instant','daily','off')),
  add column if not exists last_digest_on date,
  add column if not exists tour_seen_at   timestamptz;

-- Every bell notification can carry a link (where tapping it goes) and is
-- delivered to the person's phone and/or email once. Notifications that
-- existed before this update count as already delivered, so nobody gets a
-- burst of old news.
alter table public.notifications
  add column if not exists link       text not null default '/' check (link ~ '^/'),
  add column if not exists kind       text not null default 'general',
  add column if not exists pushed_at  timestamptz default now(),
  add column if not exists emailed_at timestamptz default now();
alter table public.notifications alter column pushed_at drop default;
alter table public.notifications alter column emailed_at drop default;
create index if not exists idx_notifications_undelivered on public.notifications(created_at)
  where pushed_at is null or emailed_at is null;

-- A teacher cancels a class day (weather, illness…). Students are told,
-- and the day drops off everyone's calendar.
create table if not exists public.class_cancellations (
  course_id   text not null references public.courses(id) on delete cascade,
  class_date  date not null,
  reason      text not null default '' check (length(reason) <= 300),
  canceled_by uuid references public.profiles(id) on delete set null,
  canceled_at timestamptz not null default now(),
  primary key (course_id, class_date)
);

-- A teacher's note to the whole class.
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  course_id  text not null references public.courses(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null default auth.uid(),
  body       text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists idx_announcements_course on public.announcements(course_id, created_at desc);

-- The permanent academic record. One row per student per finished course,
-- written when the teacher records final grades (or by an Admin for courses
-- taken before the site existed). It keeps its own copy of the names,
-- titles, and credits, so it survives the course being archived or deleted
-- and even the student's account being deleted (student_ref keeps the
-- original account id for grouping).
create table if not exists public.transcript_entries (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid references public.profiles(id) on delete set null,
  student_ref   uuid not null,
  student_name  text not null,
  student_email text not null default '',
  course_id     text references public.courses(id) on delete set null,
  course_title  text not null check (length(trim(course_title)) > 0),
  credits       numeric not null default 0 check (credits >= 0 and credits <= 12),
  level         text not null default '',
  term          text not null default '' check (length(term) <= 40),
  start_date    date,
  end_date      date,
  percent       numeric check (percent is null or (percent >= 0 and percent <= 100)),
  grade         text not null check (grade in ('A','B','C','D','F','P','I','W','AU')),
  attendance_percent numeric check (attendance_percent is null or (attendance_percent >= 0 and attendance_percent <= 100)),
  teacher_name  text not null default '',
  note          text not null default '' check (length(note) <= 300),
  recorded_by   uuid references public.profiles(id) on delete set null,
  recorded_at   timestamptz not null default now(),
  unique (student_ref, course_id)
);
create index if not exists idx_transcripts_student on public.transcript_entries(student_ref);

-- Letter grades with plus and minus, as on the Institute's grade sheets
-- (added Oct 8, 2026), and scores just over 100 from extra credit.
alter table public.transcript_entries drop constraint if exists transcript_entries_grade_check;
alter table public.transcript_entries add constraint transcript_entries_grade_check check (grade in
  ('A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F','P','I','W','AU'));
alter table public.transcript_entries drop constraint if exists transcript_entries_percent_check;
alter table public.transcript_entries add constraint transcript_entries_percent_check
  check (percent is null or (percent >= 0 and percent <= 110));

-- Past records waiting for their student (added Oct 8, 2026).
-- Grades from before the site existed, imported by an Admin from the old
-- grade sheets. Each one waits under the student's email; when someone
-- with that email confirms it and is approved, the records move onto their
-- transcript automatically. An Admin can also link a record to an account
-- by hand (different email, or none on file). Admins only: the website
-- never shows these to anyone else. A record stays here after it is
-- claimed (claimed_at / transcript_id) as a trail of where it came from.
create table if not exists public.past_records (
  id            uuid primary key default gen_random_uuid(),
  email         text not null default '' check (email = lower(email) and length(email) <= 200),
  student_name  text not null check (length(trim(student_name)) between 1 and 120),
  course_title  text not null check (length(trim(course_title)) between 1 and 160),
  credits       numeric not null default 0 check (credits >= 0 and credits <= 12),
  level         text not null default '' check (length(level) <= 40),
  term          text not null default '' check (length(term) <= 40),
  start_date    date,
  end_date      date,
  percent       numeric check (percent is null or (percent >= 0 and percent <= 110)),
  grade         text not null check (grade in
                  ('A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F','P','I','W','AU')),
  teacher_name  text not null default '' check (length(teacher_name) <= 120),
  note          text not null default '' check (length(note) <= 300),
  -- name + course + term, so importing the same sheet twice adds nothing.
  import_key    text not null unique,
  imported_by   uuid references public.profiles(id) on delete set null,
  imported_at   timestamptz not null default now(),
  claimed_by    uuid references public.profiles(id) on delete set null,
  claimed_at    timestamptz,
  transcript_id uuid references public.transcript_entries(id) on delete set null
);
create index if not exists idx_past_records_email on public.past_records(email) where claimed_at is null;
-- Past records go onto a transcript right away, before the student has an
-- account (added Oct 8, afternoon). Such an entry has no student_id yet and
-- is marked awaiting_signup; published_at says when it was put on.
alter table public.transcript_entries add column if not exists awaiting_signup boolean not null default false;
alter table public.past_records add column if not exists published_at timestamptz;

-- Backups: a snapshot of every table, taken nightly (and whenever an Admin
-- downloads one). Postgres compresses these automatically. Not readable
-- from the website except through the Admin-only functions below.
create table if not exists public.site_backups (
  id         bigserial primary key,
  kind       text not null default 'nightly' check (kind in ('nightly','manual')),
  taken_at   timestamptz not null default now(),
  size_bytes int not null default 0,
  data       jsonb not null,
  emailed_at timestamptz
);

-- How the behind-the-scenes services are doing (shown to Admins in
-- Settings), e.g. whether email sending is set up and working.
create table if not exists public.service_status (
  key        text primary key,
  ok         boolean not null,
  detail     text not null default '',
  updated_at timestamptz not null default now()
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
      and sched_start is not null
      and (sched_start > public.local_today() or pace = 'self')  -- self-paced: join any time
  )
$$;

-- How a student actually attends a course (Oct 9): everyone is in the
-- classroom for an in-person course; self-paced students watch recordings;
-- an online course has no classroom.
create or replace function public.student_track(p_course text, p_student uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when c.format = 'in_person' then 'classroom'
              when c.pace = 'self' then 'recorded'
              when c.format = 'online' and e.track = 'classroom' then 'live'
              else e.track end
    from courses c join enrollments e on e.course_id = c.id
   where c.id = p_course and e.student_id = p_student
$$;
-- Self-paced courses: how many days later than the course calendar this
-- student's dates fall (the day they started minus the course start).
-- 0 for everyone else.
create or replace function public.student_shift(p_course text, p_student uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select case when c.pace = 'self' and c.sched_start is not null then e.start_on - c.sched_start else 0 end
                     from courses c join enrollments e on e.course_id = c.id
                    where c.id = p_course and e.student_id = p_student), 0)
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
create or replace function public.course_scheduled_dates(p_course text) returns setof date
language sql stable security definer set search_path = public as $$
  select d::date
    from courses c,
         generate_series(c.sched_start, c.sched_start + (coalesce(c.sched_weeks, 52) * 7 - 1), interval '1 day') d
   where c.id = p_course and c.sched_start is not null
     and to_char(d, 'Dy') = any (c.sched_days)
$$;
-- The days a course actually meets: its scheduled days, minus any the
-- teacher canceled.
create or replace function public.course_class_dates(p_course text) returns setof date
language sql stable security definer set search_path = public as $$
  select d from public.course_scheduled_dates(p_course) d
   where not exists (select 1 from class_cancellations x where x.course_id = p_course and x.class_date = d)
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
  insert into notifications (user_id, subject, link, kind)
  select id, 'New sign-up waiting for approval: ' || coalesce(nullif(v_name, ''), v_email) || ' (' || v_email || ')',
         '/?settings=approvals', 'signup'
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
    insert into notifications (user_id, subject, link, kind)
    values (new.id, 'Welcome to the Bible Institute! Your account has been approved.', '/', 'welcome');
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
     or new.email_verified_at is distinct from old.email_verified_at
     or new.last_digest_on is distinct from old.last_digest_on then
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
  insert into notifications (user_id, subject, link, kind) values (p_student, 'You''re enrolled in ' || v_title, '/?course=' || p_course, 'enrollment');
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
  insert into notifications (user_id, subject, link, kind)
  values (p_student, 'Your enrollment request for ' || v_title || ' was not approved', '/?thread=' || p_course, 'enrollment');
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
  insert into attendance_days (course_id, class_date, held, taken_by, taken_at, teacher_taken)
  values (p_course, p_date, coalesce(p_held, true), auth.uid(), now(), true)
  on conflict (course_id, class_date) do update
    set held = excluded.held, taken_by = excluded.taken_by, taken_at = excluded.taken_at, teacher_taken = true;
  -- Classroom students are marked here (everyone defaults to Present).
  -- Online students are counted automatically from what they watched,
  -- unless the teacher marks one of them on purpose.
  if not coalesce(p_held, true) then
    delete from attendance where course_id = p_course and class_date = p_date;
    return;
  end if;
  delete from attendance a
   where a.course_id = p_course and a.class_date = p_date
     and (public.student_track(p_course, a.student_id) is distinct from 'live'
          and public.student_track(p_course, a.student_id) is distinct from 'recorded'
          or coalesce(p_marks, '{}'::jsonb) ? a.student_id::text);
  insert into attendance (course_id, class_date, student_id, status)
  select p_course, p_date, e.student_id, coalesce(p_marks ->> e.student_id::text, 'present')
    from enrollments e
   where e.course_id = p_course
     and (public.student_track(p_course, e.student_id) = 'classroom'
          or coalesce(p_marks, '{}'::jsonb) ? e.student_id::text)
  on conflict (course_id, class_date, student_id) do update
    set status = excluded.status, auto = false, note = '';
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
-- that starts within 5 minutes (or started in the last 2 hours), takes
-- attendance, has a teacher, and hasn't been taken or reminded yet today.
-- Each is claimed exactly once, so the reminder arrives 5 minutes early.
create or replace function public.claim_attendance_reminders()
returns table (course_id text, course_title text, class_date date, class_time text, teacher_id uuid)
language sql volatile security definer set search_path = public as $$
  with now_ak as (select (now() at time zone 'America/Anchorage') as t),
  due as (
    select c.id, c.title, (n.t)::date as d, c.sched_time, public.course_teacher(c.id) as teacher
      from courses c, now_ak n
     where not c.archived and c.attendance_on
       and c.format <> 'online' and c.pace = 'calendar'   -- no classroom to take attendance in
       and c.sched_time ~ '^[0-9]{1,2}:[0-9]{2}'
       and public.course_teacher(c.id) is not null
       and (n.t)::date in (select public.course_class_dates(c.id))
       and n.t >= (n.t)::date + c.sched_time::time - interval '5 minutes'
       and n.t <  (n.t)::date + c.sched_time::time + interval '2 hours'
       and not exists (select 1 from attendance_days ad where ad.course_id = c.id and ad.class_date = (n.t)::date and ad.teacher_taken)
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

-- Phone calendar: the signed-in person's private calendar link code
-- (made the first time it's asked for).
create or replace function public.my_calendar_token() returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not public.is_active_user() then raise exception 'Not signed in.'; end if;
  select token into v from calendar_feeds where user_id = auth.uid();
  if v is null then
    insert into calendar_feeds (user_id, token)
    values (auth.uid(), encode(gen_random_bytes(24), 'hex'))
    on conflict (user_id) do nothing;
    select token into v from calendar_feeds where user_id = auth.uid();
  end if;
  return v;
end $$;

-- Replace the link (the old one stops working everywhere it was added).
create or replace function public.reset_calendar_token() returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_user() then raise exception 'Not signed in.'; end if;
  delete from calendar_feeds where user_id = auth.uid();
  return public.my_calendar_token();
end $$;

-- Used only by the calendar-feed function (never by the website): every
-- event on one person's calendar, found by their link code. Students get
-- the courses they're enrolled in; teachers get the courses they teach.
-- Class days marked "no class" are left off. Nothing at all for an
-- account that isn't active.
--   kind 'class' — a class meeting (class_time empty = time not set yet)
--   kind 'due'   — an assignment due date (done = already turned in)
drop function if exists public.calendar_feed_events(text);
create or replace function public.calendar_feed_events(p_token text)
returns table (kind text, ref text, course_id text, course_title text, title text,
               day date, class_time text, done boolean, owner_name text,
               location text, meeting_url text, note text)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, p.name from calendar_feeds f join profiles p on p.id = f.user_id
     where f.token = p_token and length(p_token) >= 32 and p.status = 'active'
  ),
  my_courses as (
    -- shift: a self-paced student's dates count from the day they started
    select c.*, false as teaching,
           case when c.pace = 'self' and c.sched_start is not null then e.start_on - c.sched_start else 0 end as shift
      from courses c join enrollments e on e.course_id = c.id
     where e.student_id = (select id from me) and not c.archived
    union
    select c.*, true, 0 from courses c
     where public.course_teacher(c.id) = (select id from me) and not c.archived
  )
  select 'class', mc.id || '-' || d::text, mc.id, mc.title, mc.title, d,
         coalesce(mc.sched_time, ''), false, (select name from me), mc.location, mc.meeting_url, ''
    from my_courses mc, lateral public.course_class_dates(mc.id) d
   where not exists (select 1 from attendance_days ad
                      where ad.course_id = mc.id and ad.class_date = d and not ad.held)
     and not (mc.pace = 'self' and not mc.teaching)     -- self-paced students have no class days
  union all
  -- canceled days stay on the calendar, clearly marked, so nobody shows up
  select 'canceled', mc.id || '-' || x.class_date::text, mc.id, mc.title, mc.title, x.class_date,
         coalesce(mc.sched_time, ''), false, (select name from me), mc.location, mc.meeting_url, x.reason
    from my_courses mc join class_cancellations x on x.course_id = mc.id
   where not (mc.pace = 'self' and not mc.teaching)
  union all
  select 'due', a.id::text, mc.id, mc.title, a.title, a.due + mc.shift, '',
         (not mc.teaching and exists (select 1 from submissions s where s.assignment_id = a.id
            and s.student_id = (select id from me) and s.status in ('submitted','graded'))),
         (select name from me), '', '', ''
    from my_courses mc join assignments a on a.course_id = mc.id
$$;

-- ===========================================================================
-- Added Oct 4, 2026 (second update)
-- ===========================================================================

-- A bell notification, with where tapping it should go. Used only inside
-- the database's own functions and triggers (never callable from the site).
create or replace function public.notify(p_user uuid, p_subject text, p_link text default '/', p_kind text default 'general')
returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, subject, link, kind)
  values (p_user, left(p_subject, 300), coalesce(nullif(p_link, ''), '/'), coalesce(p_kind, 'general'))
$$;

-- "Fall 2026" etc., from a course's start date.
create or replace function public.term_label(d date) returns text
language sql immutable as $$
  select case
    when d is null then ''
    when extract(month from d) between 1 and 5 then 'Spring ' || extract(year from d)::int
    when extract(month from d) between 6 and 7 then 'Summer ' || extract(year from d)::int
    else 'Fall ' || extract(year from d)::int
  end
$$;

-- ---------------------------------------------------------------------------
-- Phone and email delivery of bell notifications. Used only by the
-- reminder function, which runs every minute.
-- ---------------------------------------------------------------------------
-- Phones: everything not yet sent that's at least a minute old (so a few
-- things happening together arrive as one note), for people with a phone
-- turned on. Anything already seen on the site is skipped.
create or replace function public.claim_push_deliveries(p_now timestamptz default now())
returns table (user_id uuid, subject text, link text, kind text)
language sql volatile security definer set search_path = public as $$
  with due as (
    select n.id from notifications n
     where n.pushed_at is null and n.created_at <= p_now - interval '1 minute'
     for update skip locked
  ), marked as (
    update notifications n set pushed_at = p_now from due where n.id = due.id
    returning n.user_id, n.subject, n.link, n.kind, n.read, n.created_at
  )
  select m.user_id, m.subject, m.link, m.kind
    from marked m join profiles p on p.id = m.user_id and p.status = 'active'
   where not m.read and exists (select 1 from push_subscriptions s where s.user_id = m.user_id)
   order by m.user_id, m.created_at
$$;

-- Email: "instant" people get anything unseen after two minutes; "daily"
-- people get one summary each morning from 7 AM (Alaska time); "off"
-- people get nothing. Each notification is emailed at most once.
create or replace function public.claim_email_deliveries(p_now timestamptz default now())
returns table (user_id uuid, email text, name text, digest boolean, subject text, link text, kind text, created_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
declare v_local timestamp := p_now at time zone 'America/Anchorage';
begin
  -- Nothing to send: already seen on the site, email turned off, or an
  -- account that isn't active.
  update notifications n set emailed_at = p_now
    from profiles p
   where p.id = n.user_id and n.emailed_at is null
     and (n.read or p.notify_email = 'off' or p.status <> 'active' or coalesce(p.email, '') = '');

  return query
  with digest_users as (
    update profiles p set last_digest_on = v_local::date
     where p.notify_email = 'daily' and p.status = 'active' and v_local::time >= time '07:00'
       and coalesce(p.last_digest_on, date '1900-01-01') < v_local::date
       and exists (select 1 from notifications x where x.user_id = p.id and x.emailed_at is null)
    returning p.id
  ), picked as (
    select n.id, (p.notify_email = 'daily') as is_digest
      from notifications n join profiles p on p.id = n.user_id
     where n.emailed_at is null and p.status = 'active'
       and ((p.notify_email = 'instant' and n.created_at <= p_now - interval '2 minutes')
         or (p.notify_email = 'daily' and p.id in (select id from digest_users)))
     for update of n skip locked
  ), marked as (
    update notifications n set emailed_at = p_now from picked where n.id = picked.id
    returning n.user_id, n.subject, n.link, n.kind, n.created_at, picked.is_digest
  )
  select m.user_id, p.email, p.name, m.is_digest, m.subject, m.link, m.kind, m.created_at
    from marked m join profiles p on p.id = m.user_id
   order by m.user_id, m.created_at;
end $$;

-- Assignment due-date reminders become ordinary notifications (bell,
-- phone, and email), at 6 PM the evening before and/or 8 AM the day it's
-- due, as each student chose. Returns how many were added.
drop function if exists public.claim_assignment_reminders();
drop function if exists public.claim_assignment_reminders(timestamptz);
create or replace function public.queue_assignment_reminders(p_now timestamptz default now())
returns int
language sql volatile security definer set search_path = public as $$
  with now_ak as (select (p_now at time zone 'America/Anchorage') as t),
  windows as (
    select 'evening'::text as kind, (n.t)::date + 1 as due_day
      from now_ak n where (n.t)::time >= time '18:00'
    union all
    select 'morning', (n.t)::date
      from now_ak n where (n.t)::time >= time '08:00' and (n.t)::time < time '12:00'
  ),
  due as (
    select e.student_id, w.kind, a.id as assignment_id, a.title as assignment_title,
           c.title as course_title
      from windows w
      join courses c on not c.archived
      join enrollments e on e.course_id = c.id
      join assignments a on a.course_id = c.id
       and a.due + case when c.pace = 'self' and c.sched_start is not null then e.start_on - c.sched_start else 0 end = w.due_day
      join profiles p on p.id = e.student_id and p.status = 'active'
     where p.due_reminders in (w.kind, 'both')
       and (a.submit_anytime or a.open_date is null
            or a.open_date + case when c.pace = 'self' and c.sched_start is not null then e.start_on - c.sched_start else 0 end
               <= (select (t)::date from now_ak))
       and not exists (select 1 from submissions s where s.assignment_id = a.id
                         and s.student_id = e.student_id and s.status in ('submitted','graded'))
       and (p.notify_email <> 'off' or exists (select 1 from push_subscriptions ps where ps.user_id = e.student_id))
  ),
  claimed as (
    insert into assignment_reminders (assignment_id, student_id, kind)
    select assignment_id, student_id, kind from due
    on conflict do nothing
    returning assignment_reminders.assignment_id, assignment_reminders.student_id, assignment_reminders.kind
  ),
  added as (
    insert into notifications (user_id, subject, link, kind)
    select due.student_id,
           (case when due.kind = 'evening' then 'Due tomorrow: ' else 'Due today: ' end)
             || due.assignment_title || ' (' || due.course_title || ')',
           '/?assignment=' || due.assignment_id, 'due'
      from due join claimed on claimed.assignment_id = due.assignment_id
                           and claimed.student_id = due.student_id and claimed.kind = due.kind
    returning 1
  )
  select count(*)::int from added
$$;

-- ---------------------------------------------------------------------------
-- Class cancellations
-- ---------------------------------------------------------------------------
create or replace function public.cancel_class(p_course text, p_date date, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not public.manages_course(p_course) then
    raise exception 'Only this course''s teacher or an Admin can cancel a class.';
  end if;
  if p_date < public.local_today() then
    raise exception 'That class day has already passed.';
  end if;
  if not exists (select 1 from public.course_scheduled_dates(p_course) d where d = p_date) then
    raise exception 'That isn''t one of this course''s class days.';
  end if;
  select title into v_title from courses where id = p_course;
  insert into class_cancellations (course_id, class_date, reason, canceled_by)
  values (p_course, p_date, left(trim(coalesce(p_reason, '')), 300), auth.uid())
  on conflict (course_id, class_date) do update set reason = excluded.reason, canceled_by = excluded.canceled_by, canceled_at = now();
  insert into notifications (user_id, subject, link, kind)
  select e.student_id,
         'Class canceled: ' || v_title || ' on ' || to_char(p_date, 'FMDay, FMMonth FMDD')
           || coalesce(nullif(' — ' || left(trim(coalesce(p_reason, '')), 200), ' — '), ''),
         '/?calendar=' || p_date, 'cancel'
    from enrollments e join profiles p on p.id = e.student_id and p.status = 'active'
   where e.course_id = p_course;
end $$;

create or replace function public.restore_class(p_course text, p_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not public.manages_course(p_course) then
    raise exception 'Only this course''s teacher or an Admin can change this.';
  end if;
  delete from class_cancellations where course_id = p_course and class_date = p_date;
  if not found then return; end if;
  if p_date >= public.local_today() then
    select title into v_title from courses where id = p_course;
    insert into notifications (user_id, subject, link, kind)
    select e.student_id, 'Class is back on: ' || v_title || ' on ' || to_char(p_date, 'FMDay, FMMonth FMDD'),
           '/?calendar=' || p_date, 'cancel'
      from enrollments e join profiles p on p.id = e.student_id and p.status = 'active'
     where e.course_id = p_course;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Announcements: every enrolled student hears about a new one.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_announcement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, subject, link, kind)
  select e.student_id,
         'Announcement — ' || c.title || ': ' || left(regexp_replace(new.body, '\s+', ' ', 'g'), 140),
         '/?course=' || c.id, 'announcement'
    from enrollments e
    join profiles p on p.id = e.student_id and p.status = 'active'
    join courses c on c.id = new.course_id
   where e.course_id = new.course_id;
  return new;
end $$;
drop trigger if exists notify_on_announcement on public.announcements;
create trigger notify_on_announcement after insert on public.announcements
  for each row execute function public.notify_on_announcement();

-- ---------------------------------------------------------------------------
-- Copy a course for a new term: same details, schedule pattern, attendance
-- settings, location, and assignments (due dates moved by the same number
-- of days the start date moved). Not copied: students, turned-in work,
-- grades, attendance, messages, discussion, announcements. (The site copies
-- the course's files separately.) The person copying becomes its teacher.
-- ---------------------------------------------------------------------------
create or replace function public.copy_course(p_course text, p_title text, p_start date)
returns text
language plpgsql security definer set search_path = public as $$
declare c courses%rowtype; v_new text; v_shift int;
begin
  if not public.manages_course(p_course) or not public.is_faculty() then
    raise exception 'Only this course''s teacher or an Admin can copy it.';
  end if;
  select * into c from courses where id = p_course;
  v_shift := case when c.sched_start is not null and p_start is not null then p_start - c.sched_start else 0 end;
  insert into courses (title, description, credits, level, faculty_id, sched_weeks, sched_days, sched_time,
                       sched_mode, sched_start, attendance_on, attendance_weight, attendance_late_credit,
                       location, meeting_url, format, pace, playlist_id, class_minutes)
  values (coalesce(nullif(trim(p_title), ''), c.title), c.description, c.credits, c.level, auth.uid(),
          c.sched_weeks, c.sched_days, c.sched_time,
          case when p_start is null then null else 'scheduled' end, p_start,
          c.attendance_on, c.attendance_weight, c.attendance_late_credit, c.location, c.meeting_url,
          c.format, c.pace, c.playlist_id, c.class_minutes)
  returning id into v_new;
  -- The lectures come along (re-dated automatically to the new calendar);
  -- the new course can switch to a different playlist later.
  insert into lessons (course_id, video_id, title, position, duration_seconds, published_at, status,
                       from_playlist, replaces, hidden, notified_at, live_notified_at)
  select v_new, video_id, title, position, duration_seconds, published_at, status,
         from_playlist, replaces, hidden, now(), now()
    from lessons where course_id = p_course and status <> 'removed';
  if c.playlist_id <> '' then
    insert into playlist_sync (course_id, playlist_id, synced_at, requested_at)
    values (v_new, c.playlist_id, null, now());
  end if;
  insert into assignments (course_id, title, instructions, due, points, weight, series_id, series_label, submit_anytime, open_date)
  select v_new, title, instructions, due + v_shift, points, weight, series_id, series_label, submit_anytime, open_date + v_shift
    from assignments where course_id = p_course;
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Transcripts
-- ---------------------------------------------------------------------------
-- The teacher (or an Admin) records each student's final grade at the end
-- of a course. Recording again updates it.
--   p_entries: [{ "student": uuid, "grade": "A", "percent": 93.5,
--                 "attendance": 95, "note": "" }, ...]
create or replace function public.record_final_grades(p_course text, p_entries jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare c courses%rowtype; e jsonb; s profiles%rowtype; v_n int := 0; v_end date; v_teacher text;
begin
  if not public.manages_course(p_course) then
    raise exception 'Only this course''s teacher or an Admin can record its final grades.';
  end if;
  select * into c from courses where id = p_course;
  select max(d) into v_end from public.course_class_dates(p_course) d where d <= public.local_today();
  -- The course's teacher (or, with none assigned, whoever records the grades).
  select name into v_teacher from profiles where id = coalesce(public.course_teacher(p_course), auth.uid());
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    select * into s from profiles where id = (e ->> 'student')::uuid;
    if s.id is null or not exists (select 1 from enrollments where course_id = p_course and student_id = s.id) then
      raise exception 'Final grades can only be recorded for students on this course''s roster.';
    end if;
    insert into transcript_entries (student_id, student_ref, student_name, student_email, course_id, course_title,
        credits, level, term, start_date, end_date, percent, grade, attendance_percent, teacher_name, note,
        recorded_by, recorded_at)
    values (s.id, s.id, s.name, s.email, c.id, c.title, c.credits, c.level, public.term_label(c.sched_start),
        c.sched_start, coalesce(v_end, public.local_today()), nullif(e ->> 'percent', '')::numeric, e ->> 'grade',
        nullif(e ->> 'attendance', '')::numeric, coalesce(v_teacher, ''), left(coalesce(e ->> 'note', ''), 300),
        auth.uid(), now())
    on conflict (student_ref, course_id) do update set
        student_name = excluded.student_name, student_email = excluded.student_email,
        course_title = excluded.course_title, credits = excluded.credits, level = excluded.level,
        term = excluded.term, start_date = excluded.start_date, end_date = excluded.end_date,
        percent = excluded.percent, grade = excluded.grade, attendance_percent = excluded.attendance_percent,
        teacher_name = excluded.teacher_name, note = excluded.note,
        recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at;
    perform public.notify(s.id, 'Final grade recorded for ' || c.title || ': ' || (e ->> 'grade'), '/?transcript=1', 'transcript');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Admins: add a course taken before the site existed (p_id null), or
-- correct any entry (p_id given).
create or replace function public.save_transcript_entry(
    p_id uuid, p_student uuid, p_course_title text, p_credits numeric, p_level text, p_term text,
    p_start date, p_end date, p_percent numeric, p_grade text, p_teacher text, p_note text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare s profiles%rowtype; v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Only an Admin can edit transcripts.'; end if;
  if p_id is null then
    select * into s from profiles where id = p_student;
    if s.id is null then raise exception 'That student couldn''t be found.'; end if;
    insert into transcript_entries (student_id, student_ref, student_name, student_email, course_title, credits,
        level, term, start_date, end_date, percent, grade, teacher_name, note, recorded_by)
    values (s.id, s.id, s.name, s.email, trim(p_course_title), coalesce(p_credits, 0), coalesce(p_level, ''),
        coalesce(p_term, ''), p_start, p_end, p_percent, p_grade, coalesce(p_teacher, ''), coalesce(p_note, ''), auth.uid())
    returning id into v_id;
  else
    update transcript_entries set course_title = trim(p_course_title), credits = coalesce(p_credits, 0),
        level = coalesce(p_level, ''), term = coalesce(p_term, ''), start_date = p_start, end_date = p_end,
        percent = p_percent, grade = p_grade, teacher_name = coalesce(p_teacher, ''), note = coalesce(p_note, ''),
        recorded_by = auth.uid(), recorded_at = now()
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'That transcript entry couldn''t be found.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.delete_transcript_entry(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Only an Admin can edit transcripts.'; end if;
  delete from transcript_entries where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Past records (grades from before the site) — added Oct 8, 2026
-- ---------------------------------------------------------------------------
-- Who a past record belongs to before that person has an account: the same
-- made-up id for every record with the same email (or, with no email, the
-- same name), so their courses group together on one transcript.
create or replace function public.past_person_ref(p_email text, p_name text) returns uuid
language sql immutable as $$
  select md5('tnbbi-past:' || case when coalesce(p_email, '') <> '' then lower(p_email)
                                   else 'name:' || lower(trim(coalesce(p_name, ''))) end)::uuid
$$;

-- Puts every waiting record on a transcript right away (added Oct 8,
-- afternoon), under the student's name with no account yet — marked
-- "awaiting_signup" — so teachers can see past courses before the student
-- joins the site. Each record is put on once; if an Admin later removes
-- that entry, it isn't put back. Internal.
create or replace function public.publish_past_records() returns int
language plpgsql security definer set search_path = public as $$
declare r past_records%rowtype; v_tid uuid; v_n int := 0;
begin
  for r in select * from past_records where claimed_at is null and published_at is null for update loop
    insert into transcript_entries (student_id, student_ref, student_name, student_email, course_id, course_title,
        credits, level, term, start_date, end_date, percent, grade, teacher_name, note, recorded_by, awaiting_signup)
    values (null, public.past_person_ref(r.email, r.student_name), r.student_name, r.email, null, r.course_title,
        r.credits, r.level, r.term, r.start_date, r.end_date, r.percent, r.grade, r.teacher_name, r.note, r.imported_by, true)
    returning id into v_tid;
    update past_records set transcript_id = v_tid, published_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Hands waiting records to one person: every unclaimed record under their
-- email (p_ids null), or the records an Admin picked. The transcript entry
-- that was already showing under their name simply becomes theirs.
-- Internal: called by the trigger and the Admin functions below.
create or replace function public.claim_past_records(p_profile uuid, p_ids uuid[] default null)
returns int
language plpgsql security definer set search_path = public as $$
declare s profiles%rowtype; r past_records%rowtype; v_tid uuid; v_n int := 0;
begin
  select * into s from profiles where id = p_profile;
  if s.id is null then return 0; end if;
  for r in select * from past_records
            where claimed_at is null
              and (case when p_ids is null then email <> '' and email = lower(s.email) else id = any(p_ids) end)
            order by start_date nulls first, term, course_title
            for update loop
    -- Already on this person's transcript (an Admin typed it in by hand)?
    -- Keep that one and drop the early copy.
    v_tid := null;
    select id into v_tid from transcript_entries
     where student_ref = s.id and lower(course_title) = lower(r.course_title) and term = r.term limit 1;
    if v_tid is not null then
      if r.transcript_id is not null and r.transcript_id <> v_tid then
        delete from transcript_entries where id = r.transcript_id and awaiting_signup;
      end if;
    elsif r.transcript_id is not null then
      -- The early entry becomes theirs (keeping any corrections made to it).
      update transcript_entries set student_id = s.id, student_ref = s.id,
             student_name = coalesce(nullif(s.name, ''), student_name), student_email = s.email, awaiting_signup = false
       where id = r.transcript_id and awaiting_signup
      returning id into v_tid;
      if v_tid is not null then v_n := v_n + 1; end if;
    elsif r.published_at is null then
      insert into transcript_entries (student_id, student_ref, student_name, student_email, course_id, course_title,
          credits, level, term, start_date, end_date, percent, grade, teacher_name, note, recorded_by)
      values (s.id, s.id, coalesce(nullif(s.name, ''), r.student_name), s.email, null, r.course_title,
          r.credits, r.level, r.term, r.start_date, r.end_date, r.percent, r.grade, r.teacher_name, r.note, r.imported_by)
      returning id into v_tid;
      v_n := v_n + 1;
    end if;
    -- (An early entry an Admin removed stays removed.)
    update past_records set claimed_by = s.id, claimed_at = now(), transcript_id = v_tid where id = r.id;
  end loop;
  if v_n > 0 then
    perform public.notify(s.id, case when v_n = 1 then 'A course you took at the Institute before this site was added to your transcript.'
        else v_n || ' courses you took at the Institute before this site were added to your transcript.' end,
        '/?transcript=1', 'transcript');
  end if;
  return v_n;
end $$;

-- A person's records arrive once their email is confirmed AND they're
-- approved (in either order). Pending or unconfirmed accounts get nothing.
create or replace function public.claim_past_records_on_activation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and new.email_verified_at is not null
     and not (old.status = 'active' and old.email_verified_at is not null) then
    perform public.claim_past_records(new.id, null);
  end if;
  return new;
end $$;
drop trigger if exists claim_past_records_on_activation on public.profiles;
create trigger claim_past_records_on_activation after update of status, email_verified_at on public.profiles
  for each row execute function public.claim_past_records_on_activation();

-- Admins: check (p_commit false) or save (p_commit true) a batch of past
-- records. Each row: { name, email, course, term, credits, level, start,
-- end, percent, grade, teacher, note }. Returns what happens to each row:
--   new      — waits for the student to sign up
--   attach   — the student already has an approved account; goes straight on
--   same     — already imported (same name, course and term); skipped
--   problem  — something's wrong with the row (see "message")
-- Saving is refused while any row has a problem.
create or replace function public.import_past_records(p_rows jsonb, p_commit boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb; i int := 0; v_out jsonb := '[]'::jsonb; v_status text; v_msg text; v_match profiles%rowtype;
        v_name text; v_email text; v_course text; v_term text; v_grade text; v_pct numeric; v_cred numeric;
        v_start date; v_end date;
        v_key text; v_keys text[] := '{}'; v_problems int := 0; v_profiles uuid[] := '{}'; v_attached int := 0;
        n_new int := 0; n_attach int := 0; n_same int := 0;
begin
  if not public.is_super_admin() then raise exception 'Only an Admin can import past records.'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Nothing to import.'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'Please import at most 2,000 rows at a time.'; end if;
  for e in select * from jsonb_array_elements(p_rows) loop
    i := i + 1; v_status := 'new'; v_msg := ''; v_match := null; v_pct := null; v_cred := 0; v_start := null; v_end := null;
    v_name   := trim(coalesce(e ->> 'name', ''));
    v_email  := lower(trim(coalesce(e ->> 'email', '')));
    v_course := trim(coalesce(e ->> 'course', ''));
    v_term   := trim(coalesce(e ->> 'term', ''));
    v_grade  := upper(replace(trim(coalesce(e ->> 'grade', '')), ' ', ''));
    begin
      v_pct   := nullif(trim(coalesce(e ->> 'percent', '')), '')::numeric;
      v_cred  := coalesce(nullif(trim(coalesce(e ->> 'credits', '')), '')::numeric, 0);
      v_start := nullif(trim(coalesce(e ->> 'start', '')), '')::date;
      v_end   := nullif(trim(coalesce(e ->> 'end', '')), '')::date;
    exception when others then
      v_status := 'problem'; v_msg := 'Score and credits must be numbers, and dates must look like 2025-01-24.';
    end;
    if v_status <> 'problem' then
      if v_name = '' then v_status := 'problem'; v_msg := 'Missing the student''s name.';
      elsif v_course = '' then v_status := 'problem'; v_msg := 'Missing the course.';
      elsif v_grade not in ('A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F','P','I','W','AU') then
        v_status := 'problem'; v_msg := 'Grade must be a letter (A+ to F), P, I, W, or AU.';
      elsif v_email <> '' and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        v_status := 'problem'; v_msg := 'That email doesn''t look right.';
      elsif v_pct is not null and (v_pct < 0 or v_pct > 110) then v_status := 'problem'; v_msg := 'Score must be 0 to 110.';
      elsif v_cred < 0 or v_cred > 12 then v_status := 'problem'; v_msg := 'Credits must be 0 to 12.';
      elsif length(v_term) > 40 or length(v_name) > 120 or length(v_course) > 160 then
        v_status := 'problem'; v_msg := 'Name, course, or term is too long.';
      end if;
    end if;
    v_key := lower(v_name) || '|' || lower(v_course) || '|' || lower(v_term);
    if v_status <> 'problem' then
      if v_key = any(v_keys) then v_status := 'problem'; v_msg := 'Listed twice in this file.';
      elsif exists (select 1 from past_records where import_key = v_key) then v_status := 'same'; v_msg := 'Already imported.';
      end if;
    end if;
    v_keys := v_keys || v_key;
    if v_status = 'new' and v_email <> '' then
      select * into v_match from profiles where lower(email) = v_email limit 1;
      if v_match.id is not null then
        if v_match.status = 'active' and v_match.email_verified_at is not null then
          v_status := 'attach'; v_msg := 'Goes straight onto ' || v_match.name || '''s transcript.';
        else
          v_msg := v_match.name || ' has an account that isn''t approved yet; this attaches once it is.';
        end if;
      end if;
    end if;
    if v_status = 'problem' then v_problems := v_problems + 1;
    elsif v_status = 'same' then n_same := n_same + 1;
    elsif v_status = 'attach' then n_attach := n_attach + 1;
    else n_new := n_new + 1; end if;
    v_out := v_out || jsonb_build_object('row', i, 'status', v_status, 'message', v_msg);
    if p_commit and v_status in ('new', 'attach') then
      insert into past_records (email, student_name, course_title, credits, level, term, start_date, end_date,
          percent, grade, teacher_name, note, import_key, imported_by)
      values (v_email, v_name, v_course, v_cred, left(trim(coalesce(e ->> 'level', '')), 40), v_term, v_start, v_end,
          v_pct, v_grade, left(trim(coalesce(e ->> 'teacher', '')), 120), left(trim(coalesce(e ->> 'note', '')), 300),
          v_key, auth.uid());
      if v_status = 'attach' and not (v_match.id = any(v_profiles)) then v_profiles := v_profiles || v_match.id; end if;
    end if;
  end loop;
  if p_commit and v_problems > 0 then
    raise exception 'Nothing was saved: % row(s) have a problem. Fix them and try again.', v_problems;
  end if;
  if p_commit then
    perform public.publish_past_records();
    for i in 1 .. coalesce(array_length(v_profiles, 1), 0) loop
      v_attached := v_attached + public.claim_past_records(v_profiles[i], null);
    end loop;
  end if;
  return jsonb_build_object('rows', v_out, 'new', n_new, 'attach', n_attach, 'same', n_same,
                            'problems', v_problems, 'saved', p_commit, 'attached', v_attached);
end $$;

-- Admins: put waiting records on a particular person's transcript by hand
-- (they use another email, or none was on file). The person must be approved.
create or replace function public.link_past_records(p_ids uuid[], p_profile uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Only an Admin can link past records.'; end if;
  if not exists (select 1 from profiles where id = p_profile and status = 'active') then
    raise exception 'Approve that account first, then link the records.';
  end if;
  if exists (select 1 from past_records where id = any(p_ids) and claimed_at is not null) then
    raise exception 'Some of those records are already on a transcript.';
  end if;
  return public.claim_past_records(p_profile, p_ids);
end $$;

-- Admins: remove a waiting record (imported by mistake). Records already on
-- a transcript are changed there instead.
create or replace function public.delete_past_record(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Only an Admin can remove past records.'; end if;
  if exists (select 1 from past_records where id = p_id and claimed_at is not null) then
    raise exception 'That record is already on a transcript. Change it there.';
  end if;
  delete from transcript_entries where awaiting_signup and id = (select transcript_id from past_records where id = p_id);
  delete from past_records where id = p_id;
end $$;

-- Accounts made before the site tracked email confirmation (early Oct
-- 2026) have no email_verified_at even though Supabase confirmed them. Fill
-- it in from Supabase's own record; that also hands them any past records
-- waiting under their email (the trigger above). Safe to re-run.
create or replace function public.backfill_email_verified() returns int
language sql security definer set search_path = public, auth as $$
  with u as (
    update public.profiles p set email_verified_at = a.email_confirmed_at
      from auth.users a
     where a.id = p.id and p.email_verified_at is null and a.email_confirmed_at is not null
    returning 1)
  select count(*)::int from u
$$;
revoke execute on function public.backfill_email_verified() from public, anon, authenticated;
do $$ begin perform public.backfill_email_verified(); end $$;

-- Records imported before early transcripts existed go on now (safe to re-run).
do $$ begin perform public.publish_past_records(); end $$;

-- ---------------------------------------------------------------------------
-- Backups
-- ---------------------------------------------------------------------------
-- Everything worth keeping, as one JSON document. Left out on purpose:
-- phone-notification keys and devices, private calendar links, and the
-- backups themselves. (Uploaded files live in storage, not here.)
create or replace function public.backup_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb := '{}'::jsonb; t text; rows jsonb;
begin
  foreach t in array array['profiles','courses','enrollments','enrollment_requests','materials','assignments',
      'submissions','discussion_posts','messages','notifications','bible_highlights','attendance_days',
      'attendance','class_cancellations','announcements','transcript_entries','past_records',
      'lessons','lesson_views','live_presence','assignment_materials'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into rows;
    v := v || jsonb_build_object(t, rows);
  end loop;
  return jsonb_build_object('format', 'tnbbi-backup-1', 'site', 'tnbbibleinstitute.com',
                            'taken_at', now(), 'tables', v);
end $$;

create or replace function public.take_backup(p_kind text) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint; v_data jsonb := public.backup_snapshot();
begin
  insert into site_backups (kind, data, size_bytes) values (p_kind, v_data, octet_length(v_data::text))
  returning id into v_id;
  delete from site_backups where kind = p_kind and id not in (
    select id from site_backups where kind = p_kind order by taken_at desc, id desc
     limit case when p_kind = 'nightly' then 14 else 5 end);
  return v_id;
end $$;

-- Used by the every-minute function: one nightly backup, from 2 AM Alaska time.
create or replace function public.take_nightly_backup_if_due(p_now timestamptz default now()) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_local timestamp := p_now at time zone 'America/Anchorage';
begin
  if v_local::time < time '02:00' then return null; end if;
  if exists (select 1 from site_backups where kind = 'nightly'
              and (taken_at at time zone 'America/Anchorage')::date = v_local::date) then
    return null;
  end if;
  perform pg_advisory_xact_lock(4242001);
  if exists (select 1 from site_backups where kind = 'nightly'
              and (taken_at at time zone 'America/Anchorage')::date = v_local::date) then
    return null;
  end if;
  return public.take_backup('nightly');
end $$;

-- Used by the every-minute function: the newest nightly backup, once a
-- week (Sunday from 3 AM), to email to the church's Gmail as an off-site copy.
create or replace function public.backup_to_email(p_now timestamptz default now())
returns table (id bigint, taken_at timestamptz, data jsonb)
language sql stable security definer set search_path = public as $$
  select b.id, b.taken_at, b.data from site_backups b
   where b.kind = 'nightly'
     and extract(dow from (p_now at time zone 'America/Anchorage')) = 0
     and (p_now at time zone 'America/Anchorage')::time >= time '03:00'
     and not exists (select 1 from site_backups x where x.emailed_at > p_now - interval '6 days')
   order by b.taken_at desc limit 1
$$;
create or replace function public.mark_backup_emailed(p_id bigint, p_at timestamptz default now()) returns void
language sql security definer set search_path = public as $$
  update site_backups set emailed_at = p_at where id = p_id
$$;

-- Admins (Settings → Backups).
create or replace function public.list_backups()
returns table (id bigint, kind text, taken_at timestamptz, size_bytes int, emailed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Only an Admin can see backups.'; end if;
  return query select b.id, b.kind, b.taken_at, b.size_bytes, b.emailed_at from site_backups b order by b.taken_at desc;
end $$;
-- A backup to download: a given one, or (p_id null) a fresh one made now.
create or replace function public.download_backup(p_id bigint default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v jsonb; v_id bigint;
begin
  if not public.is_super_admin() then raise exception 'Only an Admin can download backups.'; end if;
  if p_id is null then
    v_id := public.take_backup('manual');
    select data into v from site_backups where id = v_id;
  else
    select data into v from site_backups where id = p_id;
  end if;
  return v;
end $$;

-- Health of the behind-the-scenes services, for Admins.
create or replace function public.set_service_status(p_key text, p_ok boolean, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into service_status (key, ok, detail, updated_at) values (p_key, p_ok, left(coalesce(p_detail, ''), 500), now())
  on conflict (key) do update set ok = excluded.ok, detail = excluded.detail, updated_at = now()
$$;
create or replace function public.get_service_status()
returns table (key text, ok boolean, detail text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Only an Admin can see this.'; end if;
  return query select s.key, s.ok, s.detail, s.updated_at from service_status s order by s.key;
end $$;

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
  insert into notifications (user_id, subject, link, kind)
  select r.user_id, s.name || ' requested to enroll in ' || c.title, '/?course=' || c.id, 'enrollment'
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
    insert into notifications (user_id, subject, link, kind)
    select user_id, 'New message from ' || coalesce(v_sender, 'a student') || ' in ' || v_title,
           '/?thread=' || new.course_id || '&student=' || new.student_id, 'message'
      from public.course_recipients(new.course_id);
  else
    insert into notifications (user_id, subject, link, kind)
    values (new.student_id, 'New message from ' || coalesce(v_sender, 'your instructor') || ' in ' || v_title,
            '/?thread=' || new.course_id, 'message');
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
    insert into notifications (user_id, subject, link, kind)
    values (new.student_id, 'Grade posted for ' || v_a || ' in ' || v_c, '/?assignment=' || new.assignment_id, 'grade');
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

  select x.submit_anytime,
         x.open_date + coalesce((select case when c.pace = 'self' and c.sched_start is not null then e.start_on - c.sched_start else 0 end
                                   from enrollments e where e.course_id = c.id and e.student_id = new.student_id), 0) as open_date,
         c.archived into a
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
    insert into notifications (user_id, subject, link, kind)
    values (new.faculty_id, 'You''re now the teacher for ' || new.title, '/?course=' || new.id, 'teacher');
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
alter table public.assignment_reminders enable row level security;
alter table public.calendar_feeds       enable row level security;
alter table public.class_cancellations  enable row level security;
alter table public.announcements        enable row level security;
alter table public.transcript_entries   enable row level security;
alter table public.past_records         enable row level security;
alter table public.site_backups         enable row level security;
alter table public.service_status       enable row level security;

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
-- Teacher-only materials are hidden from students.
create policy materials_select on public.materials for select to authenticated
  using (public.is_faculty() or public.is_super_admin() or (public.is_enrolled(course_id) and not teacher_only));
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

-- Added Oct 4, 2026 (second update) ----------------------------------------
-- Class cancellations: the course's students and whoever manages it.
create policy cancel_select on public.class_cancellations for select to authenticated
  using (public.is_enrolled(course_id) or public.manages_course(course_id));
-- (Changed only through cancel_class() / restore_class().)

-- Announcements: the course's students see them; its teacher (or an Admin)
-- writes and removes them.
create policy ann_select on public.announcements for select to authenticated
  using (public.is_enrolled(course_id) or public.manages_course(course_id));
create policy ann_insert on public.announcements for insert to authenticated
  with check (public.manages_course(course_id) and author_id = auth.uid());
create policy ann_delete on public.announcements for delete to authenticated
  using (public.manages_course(course_id));

-- Transcripts: your own; every entry for Admins; a teacher sees the entries
-- for the courses they teach, and every faculty member sees courses from
-- before the site (added Oct 8). Written only through the functions above.
create policy transcript_select on public.transcript_entries for select to authenticated
  using (public.is_active_user() and (
    student_id = auth.uid() or public.is_super_admin()
    or (course_id is not null and public.teaches_course(course_id))
    -- Courses from before the site (no course on the site): every teacher.
    or (course_id is null and public.is_faculty())));
-- Past records waiting for their student: Admins only (changed through functions).
create policy past_records_select on public.past_records for select to authenticated
  using (public.is_active_user() and public.is_super_admin());
-- site_backups and service_status: no policies at all = no website access.

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
  using (bucket_id = 'materials' and (public.is_faculty() or public.is_super_admin()
         -- students: only files listed as an everyone-can-see material of a
         -- course they're in (teacher-only files stay closed to them)
         or exists (select 1 from public.materials m
                     where m.storage_path = name and m.course_id = (storage.foldername(name))[1]
                       and not m.teacher_only and public.is_enrolled(m.course_id))));
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
revoke execute on function public.notify(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.claim_push_deliveries(timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_email_deliveries(timestamptz) from public, anon, authenticated;
revoke execute on function public.queue_assignment_reminders(timestamptz) from public, anon, authenticated;
revoke execute on function public.backup_snapshot() from public, anon, authenticated;
revoke execute on function public.take_backup(text) from public, anon, authenticated;
revoke execute on function public.take_nightly_backup_if_due(timestamptz) from public, anon, authenticated;
revoke execute on function public.backup_to_email(timestamptz) from public, anon, authenticated;
revoke execute on function public.mark_backup_emailed(bigint, timestamptz) from public, anon, authenticated;
revoke execute on function public.set_service_status(text, boolean, text) from public, anon, authenticated;
revoke execute on function public.cancel_class(text, date, text) from public, anon;
revoke execute on function public.restore_class(text, date) from public, anon;
revoke execute on function public.copy_course(text, text, date) from public, anon;
revoke execute on function public.record_final_grades(text, jsonb) from public, anon;
revoke execute on function public.save_transcript_entry(uuid, uuid, text, numeric, text, text, date, date, numeric, text, text, text) from public, anon;
revoke execute on function public.delete_transcript_entry(uuid) from public, anon;
revoke execute on function public.claim_past_records(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.publish_past_records() from public, anon, authenticated;
revoke execute on function public.import_past_records(jsonb, boolean) from public, anon;
revoke execute on function public.link_past_records(uuid[], uuid) from public, anon;
revoke execute on function public.delete_past_record(uuid) from public, anon;
revoke execute on function public.list_backups() from public, anon;
revoke execute on function public.download_backup(bigint) from public, anon;
revoke execute on function public.get_service_status() from public, anon;
revoke execute on function public.course_scheduled_dates(text) from public, anon;
revoke execute on function public.calendar_feed_events(text) from public, anon, authenticated;
revoke execute on function public.my_calendar_token() from public, anon;
revoke execute on function public.reset_calendar_token() from public, anon;
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
grant execute on function public.my_calendar_token() to authenticated;
grant execute on function public.cancel_class(text, date, text) to authenticated;
grant execute on function public.restore_class(text, date) to authenticated;
grant execute on function public.copy_course(text, text, date) to authenticated;
grant execute on function public.record_final_grades(text, jsonb) to authenticated;
grant execute on function public.save_transcript_entry(uuid, uuid, text, numeric, text, text, date, date, numeric, text, text, text) to authenticated;
grant execute on function public.delete_transcript_entry(uuid) to authenticated;
grant execute on function public.import_past_records(jsonb, boolean) to authenticated;
grant execute on function public.link_past_records(uuid[], uuid) to authenticated;
grant execute on function public.delete_past_record(uuid) to authenticated;
grant execute on function public.list_backups() to authenticated;
grant execute on function public.download_backup(bigint) to authenticated;
grant execute on function public.get_service_status() to authenticated;
grant execute on function public.course_scheduled_dates(text) to authenticated;
grant execute on function public.reset_calendar_token() to authenticated;

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
-- Reminder records and calendar links: only through the functions above.
revoke all on public.assignment_reminders, public.calendar_feeds from authenticated;
-- Cancellations and transcripts change only through their functions;
-- backups and service health aren't reachable from the website at all.
revoke insert, update, delete on public.class_cancellations, public.transcript_entries, public.past_records from authenticated;
revoke update on public.announcements from authenticated;
revoke all on public.site_backups, public.service_status from authenticated;

-- ===========================================================================
-- Hybrid & online courses — lectures, watching, live class (Oct 9, 2026)
-- ===========================================================================
-- (Tables are near the top, after attendance.)

alter table public.lessons add column if not exists recorded_on date;  -- from YouTube: recording date / stream date / upload date

-- A lecture's number in its series, read from its title: "Lesson 3",
-- "Lecture #12", "Week 4", "Part 2", "03 - …". Null when there isn't one.
create or replace function public.lesson_number(p_title text) returns int
language sql immutable set search_path = public as $$
  select coalesce(
    substring(coalesce(p_title, '') from '(?i)(?:lesson|lecture|session|week|part|class|chapter|study|unit|day|no\.?|#)\s*#?\s*(\d{1,3})(?!\d)'),
    substring(coalesce(p_title, '') from '^\s*(\d{1,3})(?!\d)'))::int
$$;

-- Which class day each lecture belongs to:
--   1. the date the teacher set, if any;
--   2. a new recording (made since the course began) → the most recent class
--      day on or before the day it was recorded;
--   3. an older recording (reused from an earlier term) → the remaining class
--      days in series order (the lesson number in its title, then its
--      recording date, then playlist order).
create or replace function public.lesson_schedule(p_course text)
returns table (lesson_id uuid, class_date date)
language sql stable security definer set search_path = public as $$
  with c as (select sched_start from courses where id = p_course),
  dates as (select d from public.course_class_dates(p_course) d),
  vis as (
    select l.id, l.title, l.recorded_on, l.published_at, l.position, l.added_at, l.class_date as fixed,
           case when l.recorded_on is not null and l.recorded_on >= (select sched_start from c) - 1
                then (select max(d) from dates where d <= l.recorded_on) end as fresh
      from lessons l
     where l.course_id = p_course and not l.hidden and l.status <> 'removed'
  ),
  taken as (select coalesce(fixed, fresh) as d from vis where coalesce(fixed, fresh) is not null),
  free_dates as (select d, row_number() over (order by d) as n from dates where d not in (select d from taken)),
  rest as (select id, row_number() over (order by public.lesson_number(title) nulls last, recorded_on nulls last,
                                                 published_at nulls last, position, added_at, id) as k
             from vis where fixed is null and fresh is null)
  select id, coalesce(fixed, fresh) from vis where coalesce(fixed, fresh) is not null
  union all
  select r.id, f.d from rest r left join free_dates f on f.n = r.k
$$;

-- Online attendance, filled in by the site:
--   • an online student (live or recorded) is Present for a class day when
--     they watched the class live for 75% of its length inside the site, OR
--     watched 95% of that day's recording(s) within a week of it being
--     available; Absent once the week has passed; Excused if no recording
--     was ever posted for that day;
--   • a classroom student marked Absent is changed to Present the same way
--     (a make-up);
--   • self-paced students: Present for a class day's lecture(s) once watched
--     95%, as long as it's before the end of their semester; Absent after.
-- The teacher's own marks are kept, except an Absent that was made up.
create or replace function public.settle_online_attendance(p_course text default null, p_student uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  c record; e record; d date; v_today date := public.local_today();
  v_lessons uuid[]; v_window date; v_done boolean; v_live boolean; v_ok boolean; v_closed boolean;
  v_trk text; cur record; v_changed int := 0; v_end date; v_need int; v_note text;
begin
  for c in select * from courses x
            where not x.archived and x.attendance_on and x.sched_start is not null
              and (p_course is null or x.id = p_course)
              and (x.format <> 'in_person' or exists (select 1 from lessons l where l.course_id = x.id))
  loop
    v_need := ceil(c.class_minutes * 0.75);
    for d in select distinct ls.class_date from public.lesson_schedule(c.id) ls where c.pace = 'self' and ls.class_date is not null
             union
             select cd from public.course_class_dates(c.id) cd
              where c.pace = 'calendar' and cd <= v_today and (p_course is not null or cd >= v_today - 45)
             order by 1
    loop
      if exists (select 1 from attendance_days where course_id = c.id and class_date = d and not held) then continue; end if;
      select array_agg(ls.lesson_id) into v_lessons from public.lesson_schedule(c.id) ls
        join lessons l on l.id = ls.lesson_id
       where ls.class_date = d and l.status in ('ok','live','private','no_embed');
      select max(greatest(d, (l.added_at at time zone 'America/Anchorage')::date)) + 7 into v_window
        from lessons l where l.id = any (coalesce(v_lessons, '{}'));
      for e in select en.* from enrollments en join profiles p on p.id = en.student_id and p.status = 'active'
                where en.course_id = c.id and (p_student is null or en.student_id = p_student)
      loop
        v_trk := public.student_track(c.id, e.student_id);
        if c.pace = 'self' then
          v_end := e.start_on + coalesce(c.sched_weeks, 16) * 7 - 1;
          v_done := v_lessons is not null and not exists (
            select 1 from unnest(v_lessons) lid left join lesson_views v on v.lesson_id = lid and v.student_id = e.student_id
             where v.completed_at is null or (v.completed_at at time zone 'America/Anchorage')::date > v_end);
          v_live := false;
          v_closed := v_today > v_end;
        else
          v_done := v_lessons is not null and not exists (
            select 1 from unnest(v_lessons) lid left join lesson_views v on v.lesson_id = lid and v.student_id = e.student_id
             where v.completed_at is null or (v.completed_at at time zone 'America/Anchorage')::date > v_window);
          v_live := exists (select 1 from live_presence lp where lp.course_id = c.id and lp.class_date = d
                              and lp.student_id = e.student_id and lp.minutes >= v_need);
          v_closed := v_today > coalesce(v_window, d + 7);
        end if;
        v_ok := v_done or v_live;
        v_note := case when v_live then 'Watched the class live' else 'Watched the recording' end;
        select * into cur from attendance where course_id = c.id and class_date = d and student_id = e.student_id;

        if v_trk = 'classroom' then
          -- make-ups only, on top of the teacher's mark
          if cur.status = 'absent' and v_ok then
            update attendance set status = 'present', auto = true,
                   note = case when v_live then 'Made up — watched the class live' else 'Made up — watched the recording' end
             where course_id = c.id and class_date = d and student_id = e.student_id;
            v_changed := v_changed + 1;
          elsif cur.auto and not v_ok then   -- the recording it counted was taken away
            update attendance set status = 'absent', auto = false, note = ''
             where course_id = c.id and class_date = d and student_id = e.student_id;
            v_changed := v_changed + 1;
          end if;
          continue;
        end if;

        if cur.student_id is not null and not cur.auto then
          if cur.status = 'absent' and v_ok then
            update attendance set status = 'present', auto = true, note = v_note
             where course_id = c.id and class_date = d and student_id = e.student_id;
            v_changed := v_changed + 1;
          end if;
          continue;
        end if;

        if v_ok or v_closed then
          insert into attendance_days (course_id, class_date, held, teacher_taken)
          values (c.id, d, true, false) on conflict do nothing;
          insert into attendance (course_id, class_date, student_id, status, auto, note)
          values (c.id, d, e.student_id,
                  case when v_ok then 'present' when v_lessons is null then 'excused' else 'absent' end, true,
                  case when v_ok then v_note
                       when v_lessons is null then 'No recording was posted for this class'
                       when c.pace = 'self' then 'Not watched before the course ended'
                       else 'Not watched within a week' end)
          on conflict (course_id, class_date, student_id) do update
            set status = excluded.status, note = excluded.note, auto = true
            where attendance.status is distinct from excluded.status or attendance.note is distinct from excluded.note;
          if found then v_changed := v_changed + 1; end if;
        elsif cur.auto then
          delete from attendance where course_id = c.id and class_date = d and student_id = e.student_id;
          v_changed := v_changed + 1;
        end if;
      end loop;
    end loop;
  end loop;
  return v_changed;
end $$;

-- A student's player reports which slices of a lecture have played. Only
-- students enrolled in the (unarchived) course get credit; anyone else
-- watching — e.g. from the Lecture Archive — is simply not recorded. The
-- total can't grow faster than real time (at up to 2.5× speed), so it can't
-- be faked by skipping around.
create or replace function public.record_lesson_progress(p_lesson uuid, p_seen text, p_duration int default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare l record; v record; v_bits bit(200); v_merged bit(200); v_n int; v_slice numeric; v_allow numeric;
begin
  select ls.*, c.archived into l from lessons ls join courses c on c.id = ls.course_id where ls.id = p_lesson;
  if l.id is null or l.archived or l.hidden or l.status = 'removed' or not public.is_enrolled(l.course_id) then
    return jsonb_build_object('counted', false);
  end if;
  if p_seen !~ '^[01]{200}$' then raise exception 'Bad progress report.'; end if;
  v_bits := p_seen::bit(200);
  v_slice := greatest(coalesce(l.duration_seconds, least(greatest(coalesce(p_duration, 3600), 60), 21600)), 60) / 200.0;
  insert into lesson_views (lesson_id, student_id) values (p_lesson, auth.uid()) on conflict do nothing;
  select * into v from lesson_views where lesson_id = p_lesson and student_id = auth.uid() for update;
  v_merged := v.seen | v_bits;
  v_n := length(replace(v_merged::text, '0', ''));
  v_allow := extract(epoch from now() - v.first_at) * 2.5 + 2 * v_slice + 30;
  if v_n * v_slice > v_allow then
    v_merged := v.seen;  -- faster than possible; keep what we had
    v_n := length(replace(v_merged::text, '0', ''));
  end if;
  update lesson_views set seen = v_merged, pct = round(v_n / 2.0, 1), last_at = now(),
         completed_at = coalesce(completed_at, case when v_n >= 190 then now() end)
   where lesson_id = p_lesson and student_id = auth.uid()
   returning * into v;
  if v.completed_at is not null then perform public.settle_online_attendance(l.course_id, auth.uid()); end if;
  return jsonb_build_object('counted', true, 'pct', v.pct, 'completed', v.completed_at is not null);
end $$;

-- Is a course's class happening right now (from 15 minutes before it starts
-- until 30 minutes after it should end)? Returns today's date if so.
create or replace function public.class_in_session(p_course text) returns date
language sql stable security definer set search_path = public as $$
  select (n.t)::date
    from courses c, (select now() at time zone 'America/Anchorage' as t) n
   where c.id = p_course and not c.archived
     and c.sched_time ~ '^[0-9]{1,2}:[0-9]{2}'
     and (n.t)::date in (select public.course_class_dates(c.id))
     and n.t >= (n.t)::date + c.sched_time::time - interval '15 minutes'
     and n.t <  (n.t)::date + c.sched_time::time + make_interval(mins => c.class_minutes + 30)
$$;

-- While a student watches the live class inside the site, their player
-- checks in once a minute. Returns their minutes so far and how many are
-- needed (75% of the class).
create or replace function public.record_live_minute(p_course text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_day date; v_min int; v_need int;
begin
  if not public.is_enrolled(p_course) then return jsonb_build_object('counted', false); end if;
  v_day := public.class_in_session(p_course);
  if v_day is null then return jsonb_build_object('counted', false, 'reason', 'not in session'); end if;
  insert into live_presence (course_id, class_date, student_id, minutes, last_beat)
  values (p_course, v_day, auth.uid(), 1, now())
  on conflict (course_id, class_date, student_id) do update
    set minutes = live_presence.minutes + 1, last_beat = now()
    where live_presence.last_beat is null or live_presence.last_beat < now() - interval '50 seconds';
  select minutes into v_min from live_presence where course_id = p_course and class_date = v_day and student_id = auth.uid();
  select ceil(class_minutes * 0.75) into v_need from courses where id = p_course;
  if v_min = v_need then perform public.settle_online_attendance(p_course, auth.uid()); end if;
  return jsonb_build_object('counted', true, 'minutes', v_min, 'needed', v_need);
end $$;

-- Students choose how they attend; the teacher (or an Admin) can change it.
create or replace function public.check_track(p_course text, p_track text) returns void
language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select * into c from courses where id = p_course;
  if c.id is null or c.archived then raise exception 'This course isn''t running.'; end if;
  if p_track not in ('classroom','live','recorded') then raise exception 'Unknown way to attend.'; end if;
  if c.format = 'in_person' and p_track <> 'classroom' then raise exception 'This course meets in person only.'; end if;
  if c.format = 'online' and p_track = 'classroom' then raise exception 'This course is online only.'; end if;
  if c.pace = 'self' and p_track <> 'recorded' then raise exception 'This course is self-paced (recorded lectures).'; end if;
end $$;
create or replace function public.set_my_track(p_course text, p_track text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_enrolled(p_course) then raise exception 'You aren''t enrolled in this course.'; end if;
  perform public.check_track(p_course, p_track);
  update enrollments set track = p_track, track_chosen = true where course_id = p_course and student_id = auth.uid();
end $$;
create or replace function public.set_student_track(p_course text, p_student uuid, p_track text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.manages_course(p_course) then raise exception 'Only this course''s teacher or an Admin can change that.'; end if;
  perform public.check_track(p_course, p_track);
  update enrollments set track = p_track, track_chosen = true where course_id = p_course and student_id = p_student;
end $$;
-- Self-paced: when a student's semester began (their dates count from it).
create or replace function public.set_student_start(p_course text, p_student uuid, p_start date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.manages_course(p_course) then raise exception 'Only this course''s teacher or an Admin can change that.'; end if;
  if p_start is null then raise exception 'Choose a start date.'; end if;
  update enrollments set start_on = p_start where course_id = p_course and student_id = p_student;
  perform public.settle_online_attendance(p_course, p_student);
end $$;

-- "Check the playlist now" (teacher or Admin): the service picks it up
-- within a minute.
create or replace function public.request_playlist_sync(p_course text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.manages_course(p_course) then raise exception 'Only this course''s teacher or an Admin can do that.'; end if;
  insert into playlist_sync (course_id, playlist_id, requested_at)
  values (p_course, (select playlist_id from courses where id = p_course), now())
  on conflict (course_id) do update set requested_at = now();
end $$;

-- Used only by the service: which courses' playlists to read from YouTube
-- now. Every 30 minutes normally; every 2 minutes around class time (to
-- catch the live stream); daily for archived courses; at once when asked.
create or replace function public.courses_due_for_sync(p_now timestamptz default now())
returns table (course_id text, playlist_id text, extra_ids text[])
language sql stable security definer set search_path = public as $$
  select c.id, c.playlist_id,
         array(select l.video_id from lessons l where l.course_id = c.id and not l.from_playlist and l.status <> 'removed'
               union select nullif(c.live_video_id, '') where c.live_video_id <> '')
    from courses c left join playlist_sync ps on ps.course_id = c.id
   where (c.playlist_id <> '' or c.live_video_id <> ''
          or exists (select 1 from lessons l where l.course_id = c.id and not l.from_playlist
                       and (l.duration_seconds is null or l.status in ('live','upcoming') or l.notified_at is null)))
     and (ps.synced_at is null
          or ps.playlist_id is distinct from c.playlist_id
          or ps.requested_at > ps.synced_at
          or (not c.archived and ps.synced_at < p_now - interval '30 minutes')
          or (not c.archived and ps.synced_at < p_now - interval '2 minutes'
              and c.sched_time ~ '^[0-9]{1,2}:[0-9]{2}'
              and ((p_now at time zone 'America/Anchorage')::date) in (select public.course_class_dates(c.id))
              and (p_now at time zone 'America/Anchorage') between
                    ((p_now at time zone 'America/Anchorage')::date + c.sched_time::time - interval '20 minutes')
                and ((p_now at time zone 'America/Anchorage')::date + c.sched_time::time + make_interval(mins => c.class_minutes + 60)))
          or (c.archived and ps.synced_at < p_now - interval '1 day'))
   order by ps.synced_at nulls first
   limit 10
$$;

-- Used only by the service: what YouTube says is in a course's playlist
-- (p_items: [{video_id, title, position, duration, published_at,
-- recorded_on, status, in_playlist}]), or why it couldn't be read.
-- New lectures notify the online students; a stream going live notifies
-- the live students. The very first reading of a playlist is quiet.
create or replace function public.sync_course_lessons(p_course text, p_playlist text, p_items jsonb, p_error text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_first boolean; v_new int := 0; it jsonb; v_ids text[]; r record; c record; s record;
begin
  select * into c from courses where id = p_course;
  if c.id is null then return 0; end if;
  -- A list sent as JSON text arrives as one quoted string; unwrap it.
  if jsonb_typeof(p_items) = 'string' then p_items := (p_items #>> '{}')::jsonb; end if;
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then p_items := '[]'; end if;
  if p_error is not null then
    insert into playlist_sync (course_id, playlist_id, synced_at, ok, error)
    values (p_course, coalesce(p_playlist, ''), now(), false, left(p_error, 300))
    on conflict (course_id) do update set playlist_id = excluded.playlist_id, synced_at = now(), ok = false, error = excluded.error;
    return 0;
  end if;
  v_first := coalesce(p_playlist, '') <> ''
             and not exists (select 1 from playlist_sync where course_id = p_course and synced_at is not null and ok
                               and playlist_id = coalesce(p_playlist, ''));
  v_ids := array(select x ->> 'video_id' from jsonb_array_elements(coalesce(p_items, '[]')) x where (x ->> 'in_playlist')::boolean);
  if v_first then  -- everything already on the course counts as announced
    update lessons set notified_at = coalesce(notified_at, now()), live_notified_at = coalesce(live_notified_at, now())
     where course_id = p_course;
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    continue when (it ->> 'video_id') !~ '^[A-Za-z0-9_-]{6,20}$';
    if (it ->> 'in_playlist')::boolean then
      continue when exists (select 1 from lessons where course_id = p_course and replaces = it ->> 'video_id');
      insert into lessons (course_id, video_id, title, position, duration_seconds, published_at, recorded_on, status,
                           from_playlist, notified_at, live_notified_at)
      values (p_course, it ->> 'video_id', left(coalesce(it ->> 'title', ''), 300), coalesce((it ->> 'position')::int, 0),
              nullif((it ->> 'duration')::int, 0), (it ->> 'published_at')::timestamptz, (it ->> 'recorded_on')::date,
              coalesce(it ->> 'status', 'ok'), true,
              case when v_first then now() end, case when v_first then now() end)
      on conflict (course_id, video_id) do update
        set title = case when lessons.from_playlist then excluded.title else lessons.title end,
            position = case when lessons.from_playlist then excluded.position else lessons.position end,
            duration_seconds = coalesce(excluded.duration_seconds, lessons.duration_seconds),
            published_at = excluded.published_at, recorded_on = excluded.recorded_on, status = excluded.status,
            from_playlist = lessons.from_playlist or excluded.from_playlist
      returning (xmax = 0) as inserted into r;
      if r.inserted then v_new := v_new + 1; end if;
    else
      update lessons set duration_seconds = coalesce(nullif((it ->> 'duration')::int, 0), duration_seconds),
             status = coalesce(it ->> 'status', status),
             title = case when title = '' then left(coalesce(it ->> 'title', ''), 300) else title end,
             published_at = coalesce((it ->> 'published_at')::timestamptz, published_at),
             recorded_on = coalesce((it ->> 'recorded_on')::date, recorded_on)
       where course_id = p_course and video_id = it ->> 'video_id' and not from_playlist;
    end if;
  end loop;
  -- taken out of the playlist (or the course moved to a different one)
  update lessons set status = 'removed'
   where course_id = p_course and from_playlist and status <> 'removed' and not (video_id = any (v_ids));

  if not c.archived then
    -- "Class is live now" → students attending live
    for r in select * from lessons where course_id = p_course and status = 'live' and live_notified_at is null and not hidden loop
      for s in select e.student_id from enrollments e join profiles p on p.id = e.student_id and p.status = 'active'
                where e.course_id = p_course and public.student_track(p_course, e.student_id) = 'live' loop
        perform public.notify(s.student_id, 'Class is live now: ' || c.title || ' — tap to watch', '/?live=' || p_course, 'live');
      end loop;
      update lessons set live_notified_at = now() where id = r.id;
    end loop;
    -- a new lecture is ready → online and self-paced students
    for r in select * from lessons where course_id = p_course and status = 'ok' and notified_at is null and not hidden loop
      for s in select e.student_id from enrollments e join profiles p on p.id = e.student_id and p.status = 'active'
                where e.course_id = p_course and public.student_track(p_course, e.student_id) in ('live','recorded') loop
        perform public.notify(s.student_id, 'New lecture posted in ' || c.title || ': ' || coalesce(nullif(r.title, ''), 'Lecture'),
                              '/?lesson=' || r.id, 'lecture');
      end loop;
      update lessons set notified_at = now(), live_notified_at = coalesce(live_notified_at, now()) where id = r.id;
    end loop;
  end if;

  insert into playlist_sync (course_id, playlist_id, synced_at, ok, error, video_count)
  values (p_course, coalesce(p_playlist, ''), now(), true, '', coalesce(array_length(v_ids, 1), 0))
  on conflict (course_id) do update
    set playlist_id = excluded.playlist_id, synced_at = now(), ok = true, error = '', video_count = excluded.video_count;
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Privacy for the lecture tables
-- ---------------------------------------------------------------------------
alter table public.lessons       enable row level security;
alter table public.lesson_views  enable row level security;
alter table public.live_presence enable row level security;
alter table public.live_chat     enable row level security;
alter table public.playlist_sync enable row level security;

create or replace function public.lesson_course(p_lesson uuid) returns text
language sql stable security definer set search_path = public as $$
  select course_id from lessons where id = p_lesson
$$;

drop policy if exists lessons_select on public.lessons;
drop policy if exists lessons_insert on public.lessons;
drop policy if exists lessons_update on public.lessons;
drop policy if exists lessons_delete on public.lessons;
drop policy if exists views_select on public.lesson_views;
drop policy if exists live_select on public.live_presence;
drop policy if exists chat_select on public.live_chat;
drop policy if exists chat_insert on public.live_chat;
drop policy if exists chat_delete on public.live_chat;
drop policy if exists psync_select on public.playlist_sync;

-- Lectures: faculty see all; enrolled students see the course's lectures;
-- every active student can watch past (archived) courses' lectures in the
-- Lecture Archive — no credit there.
create policy lessons_select on public.lessons for select to authenticated
  using (public.is_faculty() or public.is_super_admin()
         or (not hidden and status <> 'removed' and public.is_enrolled(course_id))
         or (not hidden and status = 'ok' and public.is_active_user()
             and exists (select 1 from courses c where c.id = course_id and c.archived)));
create policy lessons_insert on public.lessons for insert to authenticated with check (public.manages_course(course_id));
create policy lessons_update on public.lessons for update to authenticated using (public.manages_course(course_id)) with check (public.manages_course(course_id));
create policy lessons_delete on public.lessons for delete to authenticated using (public.manages_course(course_id));

-- Watching records: like grades — the student and the course's teacher.
create policy views_select on public.lesson_views for select to authenticated
  using ((student_id = auth.uid() and public.is_active_user()) or public.teaches_course(public.lesson_course(lesson_id)));
create policy live_select on public.live_presence for select to authenticated
  using ((student_id = auth.uid() and public.is_active_user()) or public.teaches_course(course_id));

-- Live class chat: the class and its teacher (and Admins).
create policy chat_select on public.live_chat for select to authenticated
  using (public.is_enrolled(course_id) or public.manages_course(course_id));
create policy chat_insert on public.live_chat for insert to authenticated
  with check (author_id = auth.uid() and (public.is_enrolled(course_id) or public.manages_course(course_id))
              and exists (select 1 from courses c where c.id = course_id and not c.archived));
create policy chat_delete on public.live_chat for delete to authenticated
  using (author_id = auth.uid() or public.manages_course(course_id));

create policy psync_select on public.playlist_sync for select to authenticated
  using (public.is_faculty() or public.is_super_admin());

revoke insert, update, delete on public.lesson_views, public.live_presence, public.playlist_sync from authenticated;
revoke update on public.live_chat from authenticated;
-- Enrollment changes for tracks/start dates go through their functions.
revoke update on public.enrollments from authenticated;

revoke execute on function public.student_track(text, uuid) from public, anon, authenticated;
revoke execute on function public.student_shift(text, uuid) from public, anon, authenticated;
revoke execute on function public.settle_online_attendance(text, uuid) from public, anon, authenticated;
revoke execute on function public.courses_due_for_sync(timestamptz) from public, anon, authenticated;
revoke execute on function public.sync_course_lessons(text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.check_track(text, text) from public, anon, authenticated;
revoke execute on function public.lesson_schedule(text) from public, anon;
revoke execute on function public.lesson_course(uuid) from public, anon;
revoke execute on function public.class_in_session(text) from public, anon;
revoke execute on function public.record_lesson_progress(uuid, text, int) from public, anon;
revoke execute on function public.record_live_minute(text) from public, anon;
revoke execute on function public.set_my_track(text, text) from public, anon;
revoke execute on function public.set_student_track(text, uuid, text) from public, anon;
revoke execute on function public.set_student_start(text, uuid, date) from public, anon;
revoke execute on function public.request_playlist_sync(text) from public, anon;
grant execute on function public.lesson_schedule(text) to authenticated;
grant execute on function public.lesson_course(uuid) to authenticated;
grant execute on function public.class_in_session(text) to authenticated;
grant execute on function public.record_lesson_progress(uuid, text, int) to authenticated;
grant execute on function public.record_live_minute(text) to authenticated;
grant execute on function public.set_my_track(text, text) to authenticated;
grant execute on function public.set_student_track(text, uuid, text) to authenticated;
grant execute on function public.set_student_start(text, uuid, date) to authenticated;
grant execute on function public.request_playlist_sync(text) to authenticated;

-- Every lecture this person can see, with the class day it belongs to (one
-- call for the whole site).
create or replace function public.visible_lesson_dates() returns table (lesson_id uuid, class_date date)
language sql stable set search_path = public as $$
  select ls.lesson_id, ls.class_date
    from (select distinct course_id from public.lessons) l, lateral public.lesson_schedule(l.course_id) ls
$$;
revoke execute on function public.visible_lesson_dates() from public, anon;
grant execute on function public.visible_lesson_dates() to authenticated;

-- ===========================================================================
-- Assignment documents (Oct 9, 2026)
-- ===========================================================================
-- Documents from Course Materials attached to an assignment (e.g. "Quiz 3"
-- on week 3 of a weekly quiz). Students see the ones they're allowed to
-- see (never a Teachers-only document such as an answer key).
create table if not exists public.assignment_materials (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  material_id   uuid not null references public.materials(id) on delete cascade,
  position      int  not null default 0,
  primary key (assignment_id, material_id)
);
create index if not exists assignment_materials_material on public.assignment_materials (material_id);
alter table public.assignment_materials enable row level security;
grant select, insert, update, delete on public.assignment_materials to authenticated;

create or replace function public.material_course(p_material uuid) returns text
language sql stable security definer set search_path = public as $$
  select course_id from materials where id = p_material
$$;
create or replace function public.material_for_class(p_material uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from materials where id = p_material and not teacher_only)
$$;
revoke execute on function public.material_course(uuid) from public, anon;
revoke execute on function public.material_for_class(uuid) from public, anon;
grant execute on function public.material_course(uuid) to authenticated;
grant execute on function public.material_for_class(uuid) to authenticated;

drop policy if exists amat_select on public.assignment_materials;
drop policy if exists amat_insert on public.assignment_materials;
drop policy if exists amat_update on public.assignment_materials;
drop policy if exists amat_delete on public.assignment_materials;
create policy amat_select on public.assignment_materials for select to authenticated
  using (public.is_faculty() or public.is_super_admin()
         or (public.is_enrolled(public.assignment_course(assignment_id)) and public.material_for_class(material_id)));
-- Only the course's teacher, and only documents of that same course.
create policy amat_insert on public.assignment_materials for insert to authenticated
  with check (public.manages_course(public.assignment_course(assignment_id))
              and public.material_course(material_id) = public.assignment_course(assignment_id));
create policy amat_update on public.assignment_materials for update to authenticated
  using (public.manages_course(public.assignment_course(assignment_id)))
  with check (public.manages_course(public.assignment_course(assignment_id))
              and public.material_course(material_id) = public.assignment_course(assignment_id));
create policy amat_delete on public.assignment_materials for delete to authenticated
  using (public.manages_course(public.assignment_course(assignment_id)));
