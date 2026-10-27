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

-- Oct 9: a fourth email choice, "important" (the default for new accounts):
-- right away, but only for what someone shouldn't miss — class cancellations,
-- private messages, announcements, due-date reminders, enrollment news, and
-- (for faculty) new sign-ups. Everything else stays on the bell.
alter table public.profiles drop constraint if exists profiles_notify_email_check;
alter table public.profiles add constraint profiles_notify_email_check
  check (notify_email in ('instant','important','daily','off'));
alter table public.profiles alter column notify_email set default 'important';
-- Oct 9 (night): a memory verse of the week for each course, set by its
-- teacher (or an Admin) and shown to the class.
alter table public.courses
  add column if not exists memory_ref    text not null default '' check (length(memory_ref) <= 80),
  add column if not exists memory_text   text not null default '' check (length(memory_text) <= 1200),
  add column if not exists memory_set_at timestamptz;

create or replace function public.email_kind_important(p_kind text)
returns boolean language sql immutable as $$
  select coalesce(p_kind, '') in ('cancel','message','announcement','due','enrollment','signup','teacher')
$$;

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

-- An extra class day (Oct 10, 2026): a make-up class, or a class moved to
-- a different day (the old day is canceled, the new one added here).
create table if not exists public.class_extra_days (
  course_id  text not null references public.courses(id) on delete cascade,
  class_date date not null,
  note       text not null default '' check (length(note) <= 300),
  added_by   uuid references public.profiles(id) on delete set null,
  added_at   timestamptz not null default now(),
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
-- The days a course actually meets: its scheduled days plus any extra
-- days the teacher added (a make-up or moved class), minus any canceled.
create or replace function public.course_class_dates(p_course text) returns setof date
language sql stable security definer set search_path = public as $$
  select d from (select d from public.course_scheduled_dates(p_course) d
                 union
                 select class_date from class_extra_days where course_id = p_course) s(d)
   where not exists (select 1 from class_cancellations x where x.course_id = p_course and x.class_date = s.d)
   order by 1
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
               avatar_path text, home_church text, bio text, status text)
language sql stable security definer set search_path = public as $$
  -- status (Oct 23, 2026): so a student can tell a teacher whose account was
  -- turned off — that course's messages then go to the Admins.
  select p.id, p.name, p.role, p.super_admin, p.avatar_path, p.home_church, p.bio, p.status
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
     and (n.read or p.notify_email = 'off' or p.status <> 'active' or coalesce(p.email, '') = ''
          or (p.notify_email = 'important' and not public.email_kind_important(n.kind)));

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
       and ((p.notify_email in ('instant','important') and n.created_at <= p_now - interval '2 minutes')
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
  if not exists (select 1 from public.course_scheduled_dates(p_course) d where d = p_date)
     and not exists (select 1 from class_extra_days x where x.course_id = p_course and x.class_date = p_date) then
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
      'lessons','lesson_views','live_presence','assignment_materials',
      'class_extra_days','slide_decks','slide_notes','course_plan','live_chat','teach_events',
      'library_books','library_borrowers','library_loans'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into rows;
    v := v || jsonb_build_object(t, rows);
  end loop;
  return jsonb_build_object('format', 'tnbbi-backup-1', 'site', 'institute.truenorthbaptist.com',
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
-- Oct 26, 2026: if a week's copy didn't go out, it's sent on any day from
-- 3 AM, not only on Sunday. After a failed try it waits an hour before
-- trying again, or 24 hours if Gmail said the daily sending limit was
-- reached (it used to retry every minute, which kept Gmail blocked).
create or replace function public.backup_to_email(p_now timestamptz default now())
returns table (id bigint, taken_at timestamptz, data jsonb)
language sql stable security definer set search_path = public as $$
  select b.id, b.taken_at, b.data from site_backups b
   where b.kind = 'nightly'
     and (p_now at time zone 'America/Anchorage')::time >= time '03:00'
     and (extract(dow from (p_now at time zone 'America/Anchorage')) = 0
          or not exists (select 1 from site_backups x where x.emailed_at > p_now - interval '7 days'))
     and not exists (select 1 from site_backups x where x.emailed_at > p_now - interval '6 days')
     and not exists (select 1 from service_status s
                      where s.key = 'backup_email' and not s.ok
                        and s.updated_at > p_now - case when s.detail ~* '5\.4\.5|sending limit|quota exceeded'
                                                        then interval '24 hours' else interval '1 hour' end)
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
alter table public.class_extra_days     enable row level security;
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
                           from_playlist, notified_at, live_notified_at, stream_started_at)
      values (p_course, it ->> 'video_id', left(coalesce(it ->> 'title', ''), 300), coalesce((it ->> 'position')::int, 0),
              nullif((it ->> 'duration')::int, 0), (it ->> 'published_at')::timestamptz, (it ->> 'recorded_on')::date,
              coalesce(it ->> 'status', 'ok'), true,
              case when v_first then now() end, case when v_first then now() end,
              (it ->> 'stream_started_at')::timestamptz)
      on conflict (course_id, video_id) do update
        set title = case when lessons.from_playlist then excluded.title else lessons.title end,
            position = case when lessons.from_playlist then excluded.position else lessons.position end,
            duration_seconds = coalesce(excluded.duration_seconds, lessons.duration_seconds),
            published_at = excluded.published_at, recorded_on = excluded.recorded_on, status = excluded.status,
            stream_started_at = coalesce(excluded.stream_started_at, lessons.stream_started_at),
            from_playlist = lessons.from_playlist or excluded.from_playlist
      returning (xmax = 0) as inserted into r;
      if r.inserted then v_new := v_new + 1; end if;
    else
      update lessons set duration_seconds = coalesce(nullif((it ->> 'duration')::int, 0), duration_seconds),
             status = coalesce(it ->> 'status', status),
             title = case when title = '' then left(coalesce(it ->> 'title', ''), 300) else title end,
             published_at = coalesce((it ->> 'published_at')::timestamptz, published_at),
             recorded_on = coalesce((it ->> 'recorded_on')::date, recorded_on),
             stream_started_at = coalesce((it ->> 'stream_started_at')::timestamptz, stream_started_at)
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

-- ===========================================================================
-- Teaching with slides (Oct 10, 2026)
-- ===========================================================================
-- • Lesson plan: each course keeps an ordered list of lessons, one per class
--   meeting. Dates are never typed — the site pairs lessons with the class
--   days in order, so a canceled or moved class shifts everything after it.
-- • Slide decks: a presentation turned into one picture per slide when it's
--   uploaded (bucket "slides", path <course>/<deck>/<n>.jpg and <n>-s.jpg).
-- • Teach mode: the teacher's iPad moves the slides; the classroom TV and
--   every online student follow along (teach_live, one row per course).
-- • Questions: online students ask through the class chat. A student sees
--   only their own questions, the teacher's messages, and a question the
--   teacher puts on the screen; the teacher sees them all and marks them
--   answered.
-- ===========================================================================

-- When students may page through a course's slides on their own:
--   after  — once that lesson has been taught (default)
--   before — any time
--   never  — only while the teacher is presenting them live
alter table public.courses
  add column if not exists slides_share text not null default 'after'
    check (slides_share in ('after','before','never'));

create table if not exists public.slide_decks (
  id          uuid primary key default gen_random_uuid(),
  course_id   text not null references public.courses(id) on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 300),
  source      text not null default 'pdf' check (source in ('pdf','pptx','gslides')),
  slide_count int  not null default 0 check (slide_count between 0 and 400),
  status      text not null default 'ready' check (status in ('converting','ready','failed')),
  version     int  not null default 1,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_slide_decks_course on public.slide_decks(course_id);

-- Speaker notes from the presentation, one per slide — the teacher's only.
create table if not exists public.slide_notes (
  deck_id uuid primary key references public.slide_decks(id) on delete cascade,
  notes   jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array')
);

create table if not exists public.course_plan (
  id                uuid primary key default gen_random_uuid(),
  course_id         text not null references public.courses(id) on delete cascade,
  position          int  not null default 0,
  title             text not null check (length(trim(title)) between 1 and 300),
  notes_material_id uuid references public.materials(id) on delete set null,
  deck_id           uuid references public.slide_decks(id) on delete set null,
  -- planned | taught | partial (stopped partway; it carries on in the next row)
  status            text not null default 'planned' check (status in ('planned','taught','partial')),
  taught_on         date,
  resume_slide      int  not null default 1 check (resume_slide >= 1),
  stopped_slide     int,
  continued_from    uuid references public.course_plan(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_course_plan_course on public.course_plan(course_id, position);

-- The class being taught right now (one row per course, kept between classes
-- so the classroom TV can wait on it). channel_key names the instant-update
-- channel; only the course's class and teachers can read it.
create table if not exists public.teach_live (
  course_id       text primary key references public.courses(id) on delete cascade,
  active          boolean not null default false,
  plan_id         uuid references public.course_plan(id) on delete set null,
  deck_id         uuid references public.slide_decks(id) on delete set null,
  slide           int  not null default 1 check (slide >= 1),
  blanked         boolean not null default false,
  pinned_question uuid references public.live_chat(id) on delete set null,
  class_date      date,
  started_at      timestamptz,
  teacher_id      uuid references public.profiles(id) on delete set null,
  channel_key     text not null default md5(random()::text || clock_timestamp()::text),
  updated_at      timestamptz not null default now()
);

-- A question the teacher has dealt with.
alter table public.live_chat add column if not exists answered_at timestamptz;

alter table public.slide_decks enable row level security;
alter table public.slide_notes enable row level security;
alter table public.course_plan enable row level security;
alter table public.teach_live  enable row level security;
grant select, insert, update, delete on public.slide_decks, public.slide_notes, public.course_plan, public.teach_live to authenticated;
grant select on public.class_extra_days to authenticated;
revoke insert, update, delete on public.class_extra_days from authenticated;

create or replace function public.deck_course(p_deck uuid) returns text
language sql stable security definer set search_path = public as $$
  select course_id from slide_decks where id = p_deck
$$;
-- May the class see this deck's pictures right now?
create or replace function public.deck_open_to_class(p_deck uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from slide_decks d join courses c on c.id = d.course_id
     where d.id = p_deck and d.status = 'ready'
       and (c.slides_share = 'before'
            or (c.slides_share = 'after' and exists (select 1 from course_plan p
                  where p.deck_id = d.id and p.status in ('taught','partial')))
            or exists (select 1 from teach_live t where t.deck_id = d.id and t.active))
  )
$$;
revoke execute on function public.deck_course(uuid) from public, anon;
revoke execute on function public.deck_open_to_class(uuid) from public, anon;
grant execute on function public.deck_course(uuid) to authenticated;
grant execute on function public.deck_open_to_class(uuid) to authenticated;

drop policy if exists decks_select on public.slide_decks;
drop policy if exists decks_insert on public.slide_decks;
drop policy if exists decks_update on public.slide_decks;
drop policy if exists decks_delete on public.slide_decks;
create policy decks_select on public.slide_decks for select to authenticated
  using (public.is_faculty() or public.is_super_admin()
         or (public.is_enrolled(course_id) and public.deck_open_to_class(id)));
create policy decks_insert on public.slide_decks for insert to authenticated with check (public.manages_course(course_id));
create policy decks_update on public.slide_decks for update to authenticated
  using (public.manages_course(course_id)) with check (public.manages_course(course_id));
create policy decks_delete on public.slide_decks for delete to authenticated using (public.manages_course(course_id));

drop policy if exists snotes_all on public.slide_notes;
create policy snotes_all on public.slide_notes for all to authenticated
  using (public.manages_course(public.deck_course(deck_id)))
  with check (public.manages_course(public.deck_course(deck_id)));

drop policy if exists plan_select on public.course_plan;
drop policy if exists plan_insert on public.course_plan;
drop policy if exists plan_update on public.course_plan;
drop policy if exists plan_delete on public.course_plan;
create policy plan_select on public.course_plan for select to authenticated
  using (public.is_faculty() or public.is_super_admin() or public.is_enrolled(course_id));
create policy plan_insert on public.course_plan for insert to authenticated
  with check (public.manages_course(course_id)
              and (deck_id is null or public.deck_course(deck_id) = course_id)
              and (notes_material_id is null or public.material_course(notes_material_id) = course_id));
create policy plan_update on public.course_plan for update to authenticated
  using (public.manages_course(course_id))
  with check (public.manages_course(course_id)
              and (deck_id is null or public.deck_course(deck_id) = course_id)
              and (notes_material_id is null or public.material_course(notes_material_id) = course_id));
create policy plan_delete on public.course_plan for delete to authenticated using (public.manages_course(course_id));

drop policy if exists tlive_select on public.teach_live;
drop policy if exists tlive_insert on public.teach_live;
drop policy if exists tlive_update on public.teach_live;
create policy tlive_select on public.teach_live for select to authenticated
  using (public.manages_course(course_id) or public.is_enrolled(course_id));
create policy tlive_insert on public.teach_live for insert to authenticated
  with check (public.manages_course(course_id) and (deck_id is null or public.deck_course(deck_id) = course_id));
create policy tlive_update on public.teach_live for update to authenticated
  using (public.manages_course(course_id))
  with check (public.manages_course(course_id) and (deck_id is null or public.deck_course(deck_id) = course_id));
-- (Rows are never deleted by people; the course's deletion clears them.)
revoke delete on public.teach_live from authenticated;

drop policy if exists extra_select on public.class_extra_days;
create policy extra_select on public.class_extra_days for select to authenticated
  using (public.is_enrolled(course_id) or public.manages_course(course_id));

-- The class chat during Teach mode is for questions: a student sees their
-- own, anything a teacher wrote, and a question shown on the screen.
create or replace function public.chat_author_is_teacher(p_author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_author and role = 'faculty')
$$;
create or replace function public.chat_on_screen(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teach_live where pinned_question = p_id and active)
$$;
revoke execute on function public.chat_author_is_teacher(uuid) from public, anon;
revoke execute on function public.chat_on_screen(uuid) from public, anon;
grant execute on function public.chat_author_is_teacher(uuid) to authenticated;
grant execute on function public.chat_on_screen(uuid) to authenticated;
drop policy if exists chat_select on public.live_chat;
create policy chat_select on public.live_chat for select to authenticated
  using (public.manages_course(course_id)
         or (public.is_enrolled(course_id)
             and (author_id = auth.uid() or public.chat_author_is_teacher(author_id) or public.chat_on_screen(id))));

-- Mark a question answered (or not).
create or replace function public.mark_question(p_id uuid, p_answered boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_course text;
begin
  select course_id into v_course from live_chat where id = p_id;
  if v_course is null or not public.manages_course(v_course) then
    raise exception 'Only this course''s teacher can do that.';
  end if;
  update live_chat set answered_at = case when p_answered then now() end where id = p_id;
end $$;

-- Add a class day (a make-up, or the new day of a moved class) / take one
-- off again. Students are told either way.
create or replace function public.add_class_day(p_course text, p_date date, p_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not public.manages_course(p_course) then
    raise exception 'Only this course''s teacher or an Admin can add a class day.';
  end if;
  if p_date is null or p_date < public.local_today() then
    raise exception 'Pick a day that hasn''t passed yet.';
  end if;
  if exists (select 1 from public.course_class_dates(p_course) d where d = p_date) then
    raise exception 'That day is already a class day.';
  end if;
  -- A canceled regular day can simply come back.
  delete from class_cancellations where course_id = p_course and class_date = p_date;
  if not exists (select 1 from public.course_scheduled_dates(p_course) d where d = p_date) then
    insert into class_extra_days (course_id, class_date, note, added_by)
    values (p_course, p_date, left(trim(coalesce(p_note, '')), 300), auth.uid())
    on conflict (course_id, class_date) do nothing;
  end if;
  select title into v_title from courses where id = p_course;
  insert into notifications (user_id, subject, link, kind)
  select e.student_id, 'Class added: ' || v_title || ' on ' || to_char(p_date, 'FMDay, FMMonth FMDD')
           || coalesce(nullif(' — ' || left(trim(coalesce(p_note, '')), 200), ' — '), ''),
         '/?calendar=' || p_date, 'cancel'
    from enrollments e join profiles p on p.id = e.student_id and p.status = 'active'
   where e.course_id = p_course;
end $$;

create or replace function public.remove_class_day(p_course text, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not public.manages_course(p_course) then
    raise exception 'Only this course''s teacher or an Admin can change this.';
  end if;
  delete from class_extra_days where course_id = p_course and class_date = p_date;
  if not found then return; end if;
  if p_date >= public.local_today() then
    select title into v_title from courses where id = p_course;
    insert into notifications (user_id, subject, link, kind)
    select e.student_id, 'Class removed: ' || v_title || ' on ' || to_char(p_date, 'FMDay, FMMonth FMDD'),
           '/?calendar=' || p_date, 'cancel'
      from enrollments e join profiles p on p.id = e.student_id and p.status = 'active'
     where e.course_id = p_course;
  end if;
end $$;

-- Start teaching a lesson: the iPad, the TV and online students all switch
-- to it. Opens the slides where the lesson left off.
create or replace function public.teach_start(p_course text, p_plan uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r course_plan%rowtype; t teach_live%rowtype;
begin
  if not public.manages_course(p_course) then
    raise exception 'Only this course''s teacher or an Admin can teach it.';
  end if;
  if p_plan is not null then
    select * into r from course_plan where id = p_plan and course_id = p_course;
    if not found then raise exception 'That lesson isn''t part of this course.'; end if;
  end if;
  insert into teach_live (course_id, active, plan_id, deck_id, slide, blanked, pinned_question, class_date, started_at, teacher_id, updated_at)
  values (p_course, true, p_plan, r.deck_id, coalesce(r.resume_slide, 1), false, null, public.local_today(), now(), auth.uid(), now())
  on conflict (course_id) do update
    set active = true, plan_id = excluded.plan_id, deck_id = excluded.deck_id, slide = excluded.slide,
        blanked = false, pinned_question = null, class_date = excluded.class_date,
        -- coming back to the same lesson the same day keeps the class clock
        started_at = case when teach_live.active and teach_live.plan_id is not distinct from excluded.plan_id
                          then teach_live.started_at else now() end,
        teacher_id = excluded.teacher_id, updated_at = now()
  returning * into t;
  return to_jsonb(t);
end $$;

-- End class. p_outcome: finished — the lesson is done;
--                       continue — stopped at p_slide; the rest of the lesson
--                                  becomes the next class's lesson;
--                       pause    — just stop presenting (nothing recorded).
-- Returns the id of the continuation lesson, if one was made.
create or replace function public.teach_end(p_course text, p_outcome text, p_slide int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare t teach_live%rowtype; r course_plan%rowtype; v_new uuid; v_title text;
begin
  if not public.manages_course(p_course) then
    raise exception 'Only this course''s teacher or an Admin can do that.';
  end if;
  if p_outcome not in ('finished','continue','pause') then raise exception 'Unknown choice.'; end if;
  select * into t from teach_live where course_id = p_course;
  update teach_live set active = false, pinned_question = null, blanked = false, updated_at = now() where course_id = p_course;
  if p_outcome = 'pause' or t.plan_id is null then return null; end if;
  select * into r from course_plan where id = t.plan_id;
  if not found then return null; end if;
  if p_outcome = 'finished' then
    update course_plan set status = 'taught', taught_on = coalesce(t.class_date, public.local_today()), stopped_slide = null
     where id = r.id;
    return null;
  end if;
  update course_plan set status = 'partial', taught_on = coalesce(t.class_date, public.local_today()),
                         stopped_slide = greatest(coalesce(p_slide, t.slide, 1), 1)
   where id = r.id;
  -- If this lesson already carries on in the next row, just move its start.
  select id into v_new from course_plan where continued_from = r.id and status = 'planned' limit 1;
  if v_new is not null then
    update course_plan set resume_slide = greatest(coalesce(p_slide, t.slide, 1), 1) where id = v_new;
    return v_new;
  end if;
  update course_plan set position = position + 1 where course_id = p_course and position > r.position;
  v_title := regexp_replace(r.title, '\s*\(continued\)$', '');
  insert into course_plan (course_id, position, title, notes_material_id, deck_id, resume_slide, continued_from)
  values (p_course, r.position + 1, left(v_title || ' (continued)', 300), r.notes_material_id, r.deck_id,
          greatest(coalesce(p_slide, t.slide, 1), 1), r.id)
  returning id into v_new;
  return v_new;
end $$;

revoke execute on function public.mark_question(uuid, boolean) from public, anon;
revoke execute on function public.add_class_day(text, date, text) from public, anon;
revoke execute on function public.remove_class_day(text, date) from public, anon;
revoke execute on function public.teach_start(text, uuid) from public, anon;
revoke execute on function public.teach_end(text, text, int) from public, anon;
grant execute on function public.mark_question(uuid, boolean) to authenticated;
grant execute on function public.add_class_day(text, date, text) to authenticated;
grant execute on function public.remove_class_day(text, date) to authenticated;
grant execute on function public.teach_start(text, uuid) to authenticated;
grant execute on function public.teach_end(text, text, int) to authenticated;

-- Slide pictures. Small JPEGs; teachers manage them, the class sees a deck
-- when deck_open_to_class allows it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slides', 'slides', false, 5242880, array['image/jpeg','image/webp','image/png'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.slide_path_deck(p_name text) returns uuid
language sql immutable as $$
  select case when (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
              then ((storage.foldername(p_name))[2])::uuid end
$$;
drop policy if exists tnbbi_slides_read   on storage.objects;
drop policy if exists tnbbi_slides_insert on storage.objects;
drop policy if exists tnbbi_slides_update on storage.objects;
drop policy if exists tnbbi_slides_delete on storage.objects;
create policy tnbbi_slides_read on storage.objects for select to authenticated
  using (bucket_id = 'slides' and (public.is_faculty() or public.is_super_admin()
         or (public.is_enrolled((storage.foldername(name))[1])
             and public.deck_course(public.slide_path_deck(name)) = (storage.foldername(name))[1]
             and public.deck_open_to_class(public.slide_path_deck(name)))));
create policy tnbbi_slides_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'slides' and public.manages_course((storage.foldername(name))[1]));
create policy tnbbi_slides_update on storage.objects for update to authenticated
  using (bucket_id = 'slides' and public.manages_course((storage.foldername(name))[1]));
create policy tnbbi_slides_delete on storage.objects for delete to authenticated
  using (bucket_id = 'slides' and public.manages_course((storage.foldername(name))[1]));

-- Instant updates: let Supabase Realtime send teach_live changes (a backup
-- to the direct slide messages the iPad sends).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'teach_live') then
    execute 'alter publication supabase_realtime add table public.teach_live';
  end if;
end $$;

-- ===========================================================================
-- Class replays (added Oct 11, 2026)
-- ===========================================================================
-- A student who missed a class watches its recording with the slides
-- turning as they did in class and the class's questions appearing as they
-- were asked and answered.
--   • teach_events: every slide change in Teach mode, with the exact time
--     (written by a trigger on teach_live, so nothing depends on the iPad).
--   • lessons.stream_started_at: when the YouTube live stream began (from
--     YouTube) — video time 0. lessons.replay_zero_at: the teacher's own
--     lining-up, used instead when set.
--   • class_replay(): everything a replay needs, for the course's teachers and
--     enrolled students (questions with their askers' names).
alter table public.lessons add column if not exists stream_started_at timestamptz;
alter table public.lessons add column if not exists replay_zero_at timestamptz;

create table if not exists public.teach_events (
  id              bigserial primary key,
  course_id       text not null references public.courses(id) on delete cascade,
  class_date      date not null,
  at              timestamptz not null default clock_timestamp(),
  active          boolean not null,
  plan_id         uuid references public.course_plan(id) on delete set null,
  deck_id         uuid references public.slide_decks(id) on delete set null,
  slide           int  not null default 1,
  blanked         boolean not null default false,
  pinned_question uuid references public.live_chat(id) on delete set null
);
create index if not exists idx_teach_events_class on public.teach_events(course_id, class_date, at);
alter table public.teach_events enable row level security;
-- Read through class_replay(); teachers may also read their own courses' rows.
drop policy if exists teach_events_read on public.teach_events;
create policy teach_events_read on public.teach_events for select to authenticated
  using (public.manages_course(course_id));

create or replace function public.log_teach_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_date date;
begin
  if tg_op = 'INSERT' then
    if not new.active then return new; end if;
    v_date := new.class_date;
  else
    if not new.active and not old.active then return new; end if;
    if new.active = old.active and new.deck_id is not distinct from old.deck_id and new.slide = old.slide
       and new.blanked = old.blanked and new.pinned_question is not distinct from old.pinned_question then
      return new;
    end if;
    v_date := coalesce(new.class_date, old.class_date);
  end if;
  insert into teach_events (course_id, class_date, active, plan_id, deck_id, slide, blanked, pinned_question)
  values (new.course_id, coalesce(v_date, (now() at time zone 'America/Anchorage')::date), new.active,
          new.plan_id, new.deck_id, new.slide, new.blanked, new.pinned_question);
  return new;
end $$;
drop trigger if exists teach_live_log on public.teach_live;
create trigger teach_live_log after insert or update on public.teach_live
  for each row execute function public.log_teach_event();

-- Slide pictures shown in class can be seen in that class's replay (by the
-- course's students) — even when the teacher doesn't let students page
-- through the decks (slides_share = 'never'); the decks themselves stay as
-- deck_open_to_class says.
create or replace function public.deck_shown_in_class(p_deck uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teach_events e where e.deck_id = p_deck)
$$;
revoke execute on function public.deck_shown_in_class(uuid) from public, anon;
grant execute on function public.deck_shown_in_class(uuid) to authenticated;
drop policy if exists tnbbi_slides_read on storage.objects;
create policy tnbbi_slides_read on storage.objects for select to authenticated
  using (bucket_id = 'slides' and (public.is_faculty() or public.is_super_admin()
         or (public.is_enrolled((storage.foldername(name))[1])
             and public.deck_course(public.slide_path_deck(name)) = (storage.foldername(name))[1]
             and (public.deck_open_to_class(public.slide_path_deck(name))
                  or public.deck_shown_in_class(public.slide_path_deck(name))))));

-- Everything a class replay needs (null when there's nothing to show or the
-- caller isn't the course's teacher or one of its students).
create or replace function public.class_replay(p_lesson uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l record; v_date date;
begin
  select * into l from lessons where id = p_lesson;
  if l.id is null then return null; end if;
  if not (public.manages_course(l.course_id) or public.is_enrolled(l.course_id)) then return null; end if;
  select ls.class_date into v_date from public.lesson_schedule(l.course_id) ls where ls.lesson_id = p_lesson;
  v_date := coalesce(v_date, l.class_date, l.recorded_on);
  if v_date is null then return null; end if;
  return jsonb_build_object(
    'class_date', v_date,
    'zero', coalesce(l.replay_zero_at, l.stream_started_at),
    'auto_zero', l.stream_started_at,
    'manual', l.replay_zero_at is not null,
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'active', e.active, 'deck', e.deck_id,
                 'slide', e.slide, 'blanked', e.blanked, 'pinned', e.pinned_question) order by e.at, e.id)
               from teach_events e where e.course_id = l.course_id and e.class_date = v_date), '[]'::jsonb),
    'decks', coalesce((select jsonb_agg(to_jsonb(d))
               from slide_decks d where d.id in (select e.deck_id from teach_events e
                                                  where e.course_id = l.course_id and e.class_date = v_date)), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', p.name, 'teacher', p.role = 'faculty',
                 'body', m.body, 'at', m.created_at, 'answered_at', m.answered_at) order by m.created_at)
               from live_chat m join profiles p on p.id = m.author_id
               where m.course_id = l.course_id and m.class_date = v_date), '[]'::jsonb)
  );
end $$;

-- The teacher lines the slides up by hand (p_zero = the moment the video
-- starts), or null to go back to YouTube's stream start.
create or replace function public.set_replay_zero(p_lesson uuid, p_zero timestamptz) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_course text;
begin
  select course_id into v_course from lessons where id = p_lesson;
  if v_course is null or not public.manages_course(v_course) then
    raise exception 'Only this course''s teacher can line up its slides.' using errcode = '42501';
  end if;
  update lessons set replay_zero_at = p_zero where id = p_lesson;
end $$;

revoke execute on function public.log_teach_event() from public, anon, authenticated;
revoke execute on function public.class_replay(uuid) from public, anon;
revoke execute on function public.set_replay_zero(uuid, timestamptz) from public, anon;
grant execute on function public.class_replay(uuid) to authenticated;
grant execute on function public.set_replay_zero(uuid, timestamptz) to authenticated;

-- ===========================================================================
-- Church library checkout (Oct 15, 2026)
--
-- A QR code by the church library opens institute.truenorthbaptist.com/library/.
-- Borrowers don't have accounts: the first time, they give a name and email,
-- and their phone keeps a private key (the borrower "token") so it remembers
-- them. They scan a book's barcode or type its title, and it's theirs for two
-- weeks; reminder emails go out before it's due (attendance-reminders function).
--
-- Who sees what:
--   * Borrowers (signed out, "anon"): only the functions below — search the
--     list, check out, and see/return/renew THEIR OWN books (by their key).
--   * Admins (super_admin): everything, in the site's Library → Checkouts page.
--   * Everyone else (students, faculty): nothing.
-- ===========================================================================
create table if not exists public.library_books (
  id         bigint generated by default as identity primary key,
  title      text not null check (length(trim(title)) between 1 and 300),
  author     text not null default '' check (length(author) <= 200),
  subject    text not null default '' check (length(subject) <= 100),
  copies     int  not null default 1 check (copies between 0 and 50),
  isbns      text[] not null default '{}',     -- barcodes seen on this book (learned as people scan)
  source     text not null default 'list' check (source in ('list', 'borrower', 'admin')),
  reviewed   boolean not null default true,    -- false = added by a borrower, librarian hasn't checked it
  photo_path text,                             -- library-photos/… (a borrower's picture of the cover)
  created_at timestamptz not null default now()
);
create index if not exists library_books_isbns on public.library_books using gin (isbns);
-- Book covers (Oct 23, 2026): a picture on the site, library/covers/<key>.jpg.
--   cover_kind: 'found' = the real cover, looked up online (Open Library)
--               'made'  = a stand-in with the title and author, until a real one is added
alter table public.library_books add column if not exists cover text check (cover is null or cover ~ '^library/covers/[0-9a-f]{8}\.jpg$');
alter table public.library_books add column if not exists cover_kind text check (cover_kind is null or cover_kind in ('found', 'made'));

create table if not exists public.library_borrowers (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,
  name         text not null check (length(trim(name)) between 2 and 100),
  email        text not null check (length(email) <= 200 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists library_borrowers_email on public.library_borrowers (lower(email));

create table if not exists public.library_loans (
  id             bigint generated by default as identity primary key,
  book_id        bigint not null references public.library_books(id) on delete restrict,
  borrower_id    uuid not null references public.library_borrowers(id) on delete cascade,
  out_at         timestamptz not null default now(),
  due_on         date not null,
  returned_at    timestamptz,
  returned_by    text check (returned_by in ('borrower', 'librarian')),
  renewals       int not null default 0,
  renew_token    text not null unique,
  reminded_stage int not null default 0,       -- 0 none · 1 three days before · 2 due today · 3+ overdue notes
  reminded_at    timestamptz
);
create index if not exists library_loans_open on public.library_loans (due_on) where returned_at is null;
-- 'next_borrower': the book was checked out again by someone else, so it had
-- been brought back without anyone tapping Returned.
alter table public.library_loans drop constraint if exists library_loans_returned_by_check;
alter table public.library_loans add constraint library_loans_returned_by_check
  check (returned_by in ('borrower', 'librarian', 'next_borrower'));
create index if not exists library_loans_borrower on public.library_loans (borrower_id);

alter table public.library_books enable row level security;
alter table public.library_borrowers enable row level security;
alter table public.library_loans enable row level security;
drop policy if exists library_books_admin on public.library_books;
drop policy if exists library_borrowers_admin on public.library_borrowers;
drop policy if exists library_loans_admin on public.library_loans;
create policy library_books_admin on public.library_books for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy library_borrowers_admin on public.library_borrowers for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy library_loans_admin on public.library_loans for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
revoke all on public.library_books, public.library_borrowers, public.library_loans from anon;
grant select, insert, update, delete on public.library_books, public.library_borrowers, public.library_loans to authenticated;

create or replace function public.library_new_key() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

-- Squash a title for matching: lower case, letters and digits only.
create or replace function public.library_norm(p text) returns text
language sql immutable as $$ select regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '', 'g') $$;

-- Books matching what's typed (every word must appear in the title or author),
-- best first, with how many copies are out right now and — when every copy is
-- out — the soonest one is due back (never who has it).
drop function if exists public.library_search(text);
drop function if exists public.library_by_isbn(text);
create or replace function public.library_search(p_q text)
returns table (id bigint, title text, author text, subject text, copies int, out_now int, back_on date, cover text)
language sql stable security definer set search_path = public as $$
  with words as (
    select w from regexp_split_to_table(lower(trim(coalesce(p_q, ''))), '\s+') w where length(w) > 0 limit 8
  )
  select b.id, b.title, b.author, b.subject, b.copies, o.n, case when o.n >= b.copies then o.due end, b.cover
    from library_books b
    cross join lateral (select count(*)::int as n, min(l.due_on) as due from library_loans l
                         where l.book_id = b.id and l.returned_at is null) o
   where length(trim(coalesce(p_q, ''))) >= 2
     and not exists (select 1 from words where position(w in lower(b.title || ' ' || b.author)) = 0)
   order by (lower(b.title) like lower(trim(p_q)) || '%') desc,
            (position(lower(trim(p_q)) in lower(b.title)) > 0) desc,
            length(b.title), b.title
   limit 8
$$;

-- A scanned barcode → the book it was seen on before (if any).
create or replace function public.library_by_isbn(p_isbn text)
returns table (id bigint, title text, author text, subject text, copies int, out_now int, back_on date, cover text)
language sql stable security definer set search_path = public as $$
  select b.id, b.title, b.author, b.subject, b.copies, o.n, case when o.n >= b.copies then o.due end, b.cover
    from library_books b
    cross join lateral (select count(*)::int as n, min(l.due_on) as due from library_loans l
                         where l.book_id = b.id and l.returned_at is null) o
   where regexp_replace(coalesce(p_isbn, ''), '[^0-9Xx]', '', 'g') <> ''
     and b.isbns @> array[upper(regexp_replace(p_isbn, '[^0-9Xx]', '', 'g'))]
   order by b.id limit 1
$$;

-- The borrower's books (by the key their phone keeps).
create or replace function public.library_my_books(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v library_borrowers;
begin
  select * into v from library_borrowers where token = p_token and length(coalesce(p_token, '')) >= 32;
  if v.id is null then return null; end if;
  update library_borrowers set last_seen_at = now() where id = v.id;
  return jsonb_build_object('name', v.name, 'email', v.email,
    'books', coalesce((select jsonb_agg(jsonb_build_object('loan', l.id, 'title', b.title, 'author', b.author, 'cover', b.cover,
                         'out_at', l.out_at, 'due_on', l.due_on, 'renewals', l.renewals,
                         'can_renew', l.renewals < 2) order by l.due_on, b.title)
                       from library_loans l join library_books b on b.id = l.book_id
                      where l.borrower_id = v.id and l.returned_at is null), '[]'::jsonb));
end $$;

-- Check out one or more books.
--   p_token: the phone's key, or null the first time (a new key is returned).
--   p_items: [{"book": 12}] for books on the list, or
--            [{"title": "…", "author": "…", "isbn": "…", "photo": "new/…jpg"}] for
--            one that isn't (it's added for the librarian to look over).
--   An "isbn" with a listed book teaches the list that barcode.
create or replace function public.library_checkout(p_token text, p_name text, p_email text, p_items jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v library_borrowers; it jsonb; v_book bigint; v_isbn text; v_title text; v_author text;
  v_due date := public.local_today() + 14; n int := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one book.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 10 then
    raise exception 'Up to 10 books at a time, please.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Please enter your name.' using errcode = '22023'; end if;
  if coalesce(p_email, '') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Please enter your email address, so we can remind you when it''s due.' using errcode = '22023';
  end if;

  select * into v from library_borrowers where token = p_token and length(coalesce(p_token, '')) >= 32;
  if v.id is null then
    insert into library_borrowers (token, name, email)
    values (public.library_new_key(), trim(p_name), lower(trim(p_email))) returning * into v;
  else
    update library_borrowers set name = trim(p_name), email = lower(trim(p_email)), last_seen_at = now()
     where id = v.id returning * into v;
  end if;
  -- A little guard against a prank flood: 30 books a day per phone.
  if (select count(*) from library_loans where borrower_id = v.id and out_at > now() - interval '1 day')
     + jsonb_array_length(p_items) > 30 then
    raise exception 'That''s a lot of books for one day. Please see the librarian.' using errcode = '22023';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_isbn := nullif(upper(regexp_replace(coalesce(it->>'isbn', ''), '[^0-9Xx]', '', 'g')), '');
    if v_isbn is not null and length(v_isbn) not in (10, 13) then v_isbn := null; end if;
    v_book := null;
    if it ? 'book' then
      select id into v_book from library_books where id = (it->>'book')::bigint;
      if v_book is null then raise exception 'That book isn''t on the list any more.' using errcode = '22023'; end if;
    else
      v_title := left(trim(coalesce(it->>'title', '')), 300);
      v_author := left(trim(coalesce(it->>'author', '')), 200);
      if length(v_title) < 1 then raise exception 'Please type the book''s title.' using errcode = '22023'; end if;
      -- Already on the list under the same title (and author, when given)?
      select id into v_book from library_books
       where library_norm(title) = library_norm(v_title)
         and (v_author = '' or author = '' or library_norm(author) = library_norm(v_author))
       order by (source = 'list') desc, id limit 1;
      if v_book is null then
        insert into library_books (title, author, source, reviewed, photo_path, isbns)
        values (v_title, v_author, 'borrower', false,
                case when coalesce(it->>'photo', '') ~ '^new/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$' then it->>'photo' end,
                case when v_isbn is null then '{}'::text[] else array[v_isbn] end)
        returning id into v_book;
      end if;
    end if;
    if v_isbn is not null then
      update library_books set isbns = array_append(isbns, v_isbn)
       where id = v_book and not (isbns @> array[v_isbn]) and cardinality(isbns) < 10;
    end if;
    -- One copy of each book: if it's in this person's hands, whoever had it
    -- before must have put it back (they stop getting reminders). That
    -- includes this same person borrowing it again (fixed Oct 23, 2026).
    update library_loans set returned_at = now(),
           returned_by = case when borrower_id = v.id then 'borrower' else 'next_borrower' end
     where book_id = v_book and returned_at is null
       and (select copies from library_books where id = v_book) <= 1;
    insert into library_loans (book_id, borrower_id, due_on, renew_token)
    values (v_book, v.id, v_due, public.library_new_key());
    n := n + 1;
  end loop;
  return public.library_my_books(v.token) || jsonb_build_object('token', v.token, 'checked_out', n, 'due_on', v_due);
end $$;

-- "I brought it back."
create or replace function public.library_return(p_token text, p_loan bigint) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from library_borrowers where token = p_token and length(coalesce(p_token, '')) >= 32;
  if v_id is null then raise exception 'This phone isn''t set up for the library yet.' using errcode = '42501'; end if;
  update library_loans set returned_at = now(), returned_by = 'borrower'
   where id = p_loan and borrower_id = v_id and returned_at is null;
  return public.library_my_books(p_token);
end $$;

-- Two more weeks (up to two times). From the page (p_token + p_loan) or from
-- the link in a reminder email (p_renew = that loan's own key).
create or replace function public.library_renew(p_token text, p_loan bigint, p_renew text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare l library_loans; v_title text;
begin
  if p_renew is not null and length(p_renew) >= 32 then
    select * into l from library_loans where renew_token = p_renew;
  else
    select ln.* into l from library_loans ln join library_borrowers b on b.id = ln.borrower_id
     where ln.id = p_loan and b.token = p_token and length(coalesce(p_token, '')) >= 32;
  end if;
  if l.id is null then raise exception 'We couldn''t find that book.' using errcode = '22023'; end if;
  select title into v_title from library_books where id = l.book_id;
  if l.returned_at is not null then
    return jsonb_build_object('title', v_title, 'returned', true);
  end if;
  if l.renewals >= 2 then
    return jsonb_build_object('title', v_title, 'due_on', l.due_on, 'renewed', false, 'limit', true);
  end if;
  update library_loans set due_on = greatest(due_on, public.local_today()) + 14, renewals = renewals + 1,
         reminded_stage = 0, reminded_at = null
   where id = l.id returning * into l;
  return jsonb_build_object('title', v_title, 'due_on', l.due_on, 'renewed', true, 'renewals', l.renewals);
end $$;

-- For the every-minute function: reminders that are due now (9 AM–8 PM Alaska
-- time). 3 days before, the day it's due, then once a week while overdue (up
-- to four times — after that the librarian follows up in person).
create or replace function public.claim_library_reminders(p_now timestamptz default now())
returns table (loan_id bigint, stage int, title text, author text, due_on date, renewals int,
               renew_token text, name text, email text)
language plpgsql volatile security definer set search_path = public as $$
declare v_local timestamp := p_now at time zone 'America/Anchorage'; v_today date := (p_now at time zone 'America/Anchorage')::date;
begin
  if v_local::time < time '09:00' or v_local::time >= time '20:00' then return; end if;
  return query
  with want as (
    select l.id, case when v_today < l.due_on - 3 then 0
                      when v_today < l.due_on then 1
                      when v_today = l.due_on then 2
                      else 3 end as w, l.reminded_stage, l.reminded_at
      from library_loans l
     where l.returned_at is null
  ), pick as (
    select id, case when w < 3 then w else greatest(reminded_stage + 1, 3) end as new_stage
      from want
     where (w > 0 and w < 3 and reminded_stage < w)
        or (w = 3 and reminded_stage < 3)
        or (w = 3 and reminded_stage between 3 and 5 and reminded_at <= p_now - interval '7 days')
  ), upd as (
    update library_loans l set reminded_stage = p.new_stage, reminded_at = p_now
      from pick p where l.id = p.id
    returning l.id, l.reminded_stage, l.book_id, l.borrower_id, l.due_on, l.renewals, l.renew_token
  )
  select u.id, u.reminded_stage, b.title, b.author, u.due_on, u.renewals, u.renew_token, br.name, br.email
    from upd u join library_books b on b.id = u.book_id join library_borrowers br on br.id = u.borrower_id
   order by br.email, u.due_on;
end $$;

revoke execute on function public.library_new_key() from public, anon, authenticated;
revoke execute on function public.claim_library_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.library_search(text) to anon, authenticated;
grant execute on function public.library_by_isbn(text) to anon, authenticated;
grant execute on function public.library_my_books(text) to anon, authenticated;
grant execute on function public.library_checkout(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.library_return(text, bigint) to anon, authenticated;
grant execute on function public.library_renew(text, bigint, text) to anon, authenticated;

-- ---- For Admins: the Library → Checkouts page ---------------------------
create or replace function public.library_require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only Admins can manage the church library.' using errcode = '42501';
  end if;
end $$;

create or replace function public.library_admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_today date := public.local_today();
begin
  perform public.library_require_admin();
  return jsonb_build_object(
    'today', v_today,
    'out', coalesce((select jsonb_agg(jsonb_build_object('loan', l.id, 'book', b.id, 'title', b.title, 'author', b.author, 'cover', b.cover,
              'name', br.name, 'email', br.email, 'out_at', l.out_at, 'due_on', l.due_on, 'renewals', l.renewals,
              'overdue', l.due_on < v_today, 'reminded', l.reminded_stage) order by l.due_on, br.name, b.title)
            from library_loans l join library_books b on b.id = l.book_id join library_borrowers br on br.id = l.borrower_id
           where l.returned_at is null), '[]'::jsonb),
    'returned', coalesce((select jsonb_agg(x order by x->>'returned_at' desc) from (
              select jsonb_build_object('loan', l.id, 'title', b.title, 'name', br.name, 'email', br.email,
                     'out_at', l.out_at, 'returned_at', l.returned_at, 'returned_by', l.returned_by) as x
                from library_loans l join library_books b on b.id = l.book_id join library_borrowers br on br.id = l.borrower_id
               where l.returned_at is not null order by l.returned_at desc limit 60) q), '[]'::jsonb),
    'new_books', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'author', b.author,
              'subject', b.subject, 'isbns', b.isbns, 'photo', b.photo_path, 'added', b.created_at,
              'loans', (select count(*) from library_loans l where l.book_id = b.id)) order by b.created_at desc)
            from library_books b where not b.reviewed), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(distinct subject order by subject) from library_books where subject <> ''), '[]'::jsonb),
    'counts', jsonb_build_object(
      'titles', (select count(*) from library_books),
      'copies', (select coalesce(sum(copies), 0) from library_books),
      'out', (select count(*) from library_loans where returned_at is null),
      'overdue', (select count(*) from library_loans where returned_at is null and due_on < v_today),
      'borrowers', (select count(distinct lower(email)) from library_borrowers),
      'this_year', (select count(*) from library_loans where out_at >= date_trunc('year', now())))
  );
end $$;

-- Find books on the list (Admins): up to 40, with copies out and times borrowed.
drop function if exists public.library_admin_books(text);
create or replace function public.library_admin_books(p_q text)
returns table (id bigint, title text, author text, subject text, copies int, out_now int, times bigint, reviewed boolean, isbns text[], cover text, cover_kind text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.library_require_admin();
  return query
  select b.id, b.title, b.author, b.subject, b.copies,
         (select count(*)::int from library_loans l where l.book_id = b.id and l.returned_at is null),
         (select count(*) from library_loans l where l.book_id = b.id), b.reviewed, b.isbns, b.cover, b.cover_kind
    from library_books b
   where length(trim(coalesce(p_q, ''))) >= 1
     and not exists (select 1 from regexp_split_to_table(lower(trim(p_q)), '\s+') w
                      where length(w) > 0 and position(w in lower(b.title || ' ' || b.author || ' ' || b.subject)) = 0)
   order by (lower(b.title) like lower(trim(p_q)) || '%') desc, b.title
   limit 40;
end $$;

-- Add (p_id null) or change a book. Saving also marks a borrower-added book as looked over.
create or replace function public.library_admin_save_book(p_id bigint, p_title text, p_author text, p_subject text, p_copies int)
returns bigint language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint;
begin
  perform public.library_require_admin();
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'A book needs a title.' using errcode = '22023'; end if;
  if p_id is null then
    insert into library_books (title, author, subject, copies, source, reviewed)
    values (trim(p_title), trim(coalesce(p_author, '')), trim(coalesce(p_subject, '')), greatest(coalesce(p_copies, 1), 0), 'admin', true)
    returning id into v_id;
  else
    update library_books set title = trim(p_title), author = trim(coalesce(p_author, '')), subject = trim(coalesce(p_subject, '')),
           copies = greatest(coalesce(p_copies, 1), 0), reviewed = true
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'That book isn''t on the list any more.' using errcode = '22023'; end if;
  end if;
  return v_id;
end $$;

-- A borrower typed a book that IS on the list (under another spelling): move
-- its checkouts and barcodes onto the listed book and remove the extra one.
create or replace function public.library_admin_merge_book(p_from bigint, p_into bigint) returns void
language plpgsql volatile security definer set search_path = public as $$
declare f library_books;
begin
  perform public.library_require_admin();
  if p_from = p_into then return; end if;
  select * into f from library_books where id = p_from;
  if f.id is null or not exists (select 1 from library_books where id = p_into) then
    raise exception 'That book isn''t on the list any more.' using errcode = '22023';
  end if;
  update library_loans set book_id = p_into where book_id = p_from;
  update library_books set isbns = (select coalesce(array_agg(distinct x), '{}') from unnest(isbns || f.isbns) x),
         photo_path = coalesce(photo_path, f.photo_path),
         cover = coalesce(cover, f.cover), cover_kind = case when cover is null then f.cover_kind else cover_kind end
   where id = p_into;
  delete from library_books where id = p_from;
end $$;

-- Remove a book from the list (only if it has never been checked out).
create or replace function public.library_admin_delete_book(p_id bigint) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.library_require_admin();
  if exists (select 1 from library_loans where book_id = p_id) then
    raise exception 'This book has been checked out before, so it stays on the list. You can set its copies to 0 instead.' using errcode = '22023';
  end if;
  delete from library_books where id = p_id;
end $$;

-- The librarian checks a book back in, or gives it two more weeks.
create or replace function public.library_admin_return(p_loan bigint) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.library_require_admin();
  update library_loans set returned_at = now(), returned_by = 'librarian' where id = p_loan and returned_at is null;
end $$;
create or replace function public.library_admin_extend(p_loan bigint) returns date
language plpgsql volatile security definer set search_path = public as $$
declare v date;
begin
  perform public.library_require_admin();
  update library_loans set due_on = greatest(due_on, public.local_today()) + 14, reminded_stage = 0, reminded_at = null
   where id = p_loan and returned_at is null returning due_on into v;
  return v;
end $$;

revoke execute on function public.library_require_admin() from public, anon;
revoke execute on function public.library_admin_overview() from public, anon;
revoke execute on function public.library_admin_books(text) from public, anon;
revoke execute on function public.library_admin_save_book(bigint, text, text, text, int) from public, anon;
revoke execute on function public.library_admin_merge_book(bigint, bigint) from public, anon;
revoke execute on function public.library_admin_delete_book(bigint) from public, anon;
revoke execute on function public.library_admin_return(bigint) from public, anon;
revoke execute on function public.library_admin_extend(bigint) from public, anon;
grant execute on function public.library_admin_overview() to authenticated;
grant execute on function public.library_admin_books(text) to authenticated;
grant execute on function public.library_admin_save_book(bigint, text, text, text, int) to authenticated;
grant execute on function public.library_admin_merge_book(bigint, bigint) to authenticated;
grant execute on function public.library_admin_delete_book(bigint) to authenticated;
grant execute on function public.library_admin_return(bigint) to authenticated;
grant execute on function public.library_admin_extend(bigint) to authenticated;

-- Pictures of books that aren't on the list (taken by the borrower). Anyone
-- may add one under new/; only Admins can look at them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library-photos', 'library-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists tnbbi_libphotos_insert on storage.objects;
drop policy if exists tnbbi_libphotos_read on storage.objects;
drop policy if exists tnbbi_libphotos_delete on storage.objects;
create policy tnbbi_libphotos_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'library-photos' and (storage.foldername(name))[1] = 'new');
create policy tnbbi_libphotos_read on storage.objects for select to authenticated
  using (bucket_id = 'library-photos' and public.is_super_admin());
create policy tnbbi_libphotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'library-photos' and public.is_super_admin());

-- BEGIN library seed (generated by tools/library/build_library_seed.mjs — 702 books, one copy each)
insert into public.library_books (title, author, subject, copies)
select v.* from (values
  ('A Pocket Guide to ????', 'Answers in Genesis', 'Apologetics', 1),
  ('A Pocket Guide to Charles Darwin', 'Answers in Genesis', 'Apologetics', 1),
  ('A Pocket Guide to Compromise', 'Answers in Genesis', 'Apologetics', 1),
  ('A Pocket Guide to Dinosaurs', 'Answers in Genesis', 'Apologetics', 1),
  ('A Pocket Guide to Global Warming', 'Answers in Genesis', 'Apologetics', 1),
  ('A Pocket Guide to Social Issues', 'Answers in Genesis', 'Apologetics', 1),
  ('One Human Family - The Bible, Science, Race & Culture', 'Carl Wieland', 'Apologetics', 1),
  ('Stones and Bones - Powerful Evidence against Evolution', 'Carl Wieland', 'Apologetics', 1),
  ('World Winding Down', 'Carl Wieland', 'Apologetics', 1),
  ('Cosmos Creator and Human Destiny', 'Dave Hunt', 'Apologetics', 1),
  ('Scientists who Believe the Bible', 'David W. Cloud', 'Apologetics', 1),
  ('Evolution: Another False Religion of Humanism', 'Dennis Helton', 'Apologetics', 1),
  ('Is the Gap Theory Credible?', 'Dennis Helton', 'Apologetics', 1),
  ('15 Reasons to Take Genesis as History', 'Don Batten and Jonathan Sarfati', 'Apologetics', 1),
  ('Creation versus Evolution', 'Frank A. Godsoe', 'Apologetics', 1),
  ('The Biblical Basis for Modern Science', 'Henry M. Morris', 'Apologetics', 1),
  ('The Twilight of Evolution', 'Henry M. Morris', 'Apologetics', 1),
  ('5 Reasons to Believe in Recent Creation', 'Henry Morris', 'Apologetics', 1),
  ('Biblical Creationism - What Each Book of the Bible Teaches about Creation and the Flood', 'Henry Morris', 'Apologetics', 1),
  ('Evolution and the Modern Christian', 'Henry Morris', 'Apologetics', 1),
  ('Exploring the Evidence for Creation', 'Henry Morris', 'Apologetics', 1),
  ('Many Evidences for the Infallible Christian Faith Proofs', 'Henry Morris', 'Apologetics', 1),
  ('Men of Science Men of God - Great Scientists Who Believed the BIble', 'Henry Morris', 'Apologetics', 1),
  ('Science and the Bible', 'Henry Morris', 'Apologetics', 1),
  ('Scientific Creationism', 'Henry Morris', 'Apologetics', 1),
  ('That you Might Believe', 'Henry Morris', 'Apologetics', 1),
  ('The Biblical Basis for Modern Science', 'Henry Morris', 'Apologetics', 1),
  ('The Long War Against God', 'Henry Morris', 'Apologetics', 1),
  ('The Remarkable Birth of Planet Earth', 'Henry Morris', 'Apologetics', 1),
  ('The Twilight of Evolution', 'Henry Morris', 'Apologetics', 1),
  ('Buried Alive', 'Jack Cuozzo', 'Apologetics', 1),
  ('Discerning Truth - Exposing Errors in Evolutionary Arguments', 'Jason Lisle', 'Apologetics', 1),
  ('Fractals - the Secret Code of Creation', 'Jason Lisle', 'Apologetics', 1),
  ('Inroduction to Logic', 'Jason Lisle', 'Apologetics', 1),
  ('Logic and Faith - Discerning truth in logical arguments -  A Poket Guide', 'Jason Lisle', 'Apologetics', 1),
  ('Taking Back Astronomy', 'Jason Lisle', 'Apologetics', 1),
  ('The Physics of Einstein - Black Holes, time travel, distant starlight', 'Jason Lisle', 'Apologetics', 1),
  ('The Solar System: GOd''s Heavenly Handiwork', 'Jason Lisle', 'Apologetics', 1),
  ('The Ultimate Proof of Creation', 'Jason Lisle', 'Apologetics', 1),
  ('Understanding Genesis - How to Analyze, Interpret and Defend Scripture', 'Jason Lisle', 'Apologetics', 1),
  ('Why Genesis Matters', 'Jason Lisle', 'Apologetics', 1),
  ('The Genesis Flood', 'John Whitcomb and Henry Morris', 'Apologetics', 1),
  ('Noah''s Ark: A Feasibility Study', 'John Woodmorappe', 'Apologetics', 1),
  ('By Design - Evidence for nature''s Intelligent Designer - the God of the Bible', 'Jonathan Sarfati', 'Apologetics', 1),
  ('Refuting Compromise', 'Jonathan Sarfati', 'Apologetics', 1),
  ('Refuting Evolution', 'Jonathan Sarfati', 'Apologetics', 1),
  ('Refuting Evolution 2', 'Jonathan Sarfati', 'Apologetics', 1),
  ('The Answers Book', 'Ken Ham', 'Apologetics', 1),
  ('The New Answers Book 1', 'Ken Ham & Bodie Hodge', 'Apologetics', 1),
  ('The New Answers Book 2', 'Ken Ham & Bodie Hodge', 'Apologetics', 1),
  ('The New Answers Book 3', 'Ken Ham & Bodie Hodge', 'Apologetics', 1),
  ('Creation Vs. Evolution - An evaluation of the theory of evolution in the light of Scripture', 'Thomas F. Heinze', 'Apologetics', 1),
  ('Science According to Moses', 'Thomas Sharp', 'Apologetics', 1),
  ('Old Earth Creationism on Trial - The Verdict is in', 'Tim Chaffey and Jason Lisle', 'Apologetics', 1),
  ('Did God Use Evolution', 'Werner Gitt', 'Apologetics', 1),
  ('In the Beginning was Information', 'Werner Gitt', 'Apologetics', 1),
  ('The Wonder of Man', 'Werner Gitt', 'Apologetics', 1),
  ('Time and Eternity', 'Werner Gitt', 'Apologetics', 1),
  ('Without Excuse', 'Werner Gitt', 'Apologetics', 1),
  ('On Guard', 'William Lane Craig', 'Apologetics', 1),
  ('Reasonable Faith - Christian Truth and Apologetics', 'William Lane Craig', 'Apologetics', 1),
  ('Charles Darwin - His Life and Impact - A Pocket Guide', '', 'Apologetics', 1),
  ('Why Can''t I Understand My King James Bible', 'Bobby Adams', 'Bible Preservation', 1),
  ('Why I Believe the Old King James Bible', 'Bruce Lackey', 'Bible Preservation', 1),
  ('Those So-Called Errors', 'Chelster Kulus', 'Bible Preservation', 1),
  ('If the Foundations be Destroyed', 'Chick Salliby', 'Bible Preservation', 1),
  ('Defending the King James Bible', 'D. A. Waite', 'Bible Preservation', 1),
  ('Does the Critical Text Contain Doctrinal Errors', 'D. A. Waite', 'Bible Preservation', 1),
  ('Foes of the King James Bible Refuted', 'D. A. Waite', 'Bible Preservation', 1),
  ('Fundamentalist Mis-Information on Bible Preservation', 'D. A. Waite', 'Bible Preservation', 1),
  ('Gnosticism - The Doctrinal Foundation of the New Bible Preservation', 'D. A. Waite', 'Bible Preservation', 1),
  ('Heresies of Westcott and Hort', 'D. A. Waite', 'Bible Preservation', 1),
  ('The Superior Foundation of the King James Bible', 'D. A. Waite', 'Bible Preservation', 1),
  ('Westcott & Hort''s Greek Text & Theory Refuted', 'D. A. Waite', 'Bible Preservation', 1),
  ('Dean John Burgon''s Defense of The Authorized Version', 'David C. Bennett', 'Bible Preservation', 1),
  ('Touch Not the Unclean Thing', 'David H. Sorenson', 'Bible Preservation', 1),
  ('Understanding the Battle over Bible Versions', 'David L. Brown', 'Bible Preservation', 1),
  ('The "Impregnable Rock of Holy Scripture"', 'David Otis Fuller', 'Bible Preservation', 1),
  ('True or False?', 'David Otis Fuller', 'Bible Preservation', 1),
  ('Which Bible?', 'David Otis Fuller', 'Bible Preservation', 1),
  ('Faith vs. the Modern Bible Versions', 'David W. Cloud', 'Bible Preservation', 1),
  ('For Love of the Bible The Battle for the King James Version and the Received Text from 1800 to Present', 'David W. Cloud', 'Bible Preservation', 1),
  ('the Bible & Western Society', 'David W. Cloud', 'Bible Preservation', 1),
  ('The Bible Version Question/Answer Database', 'David W. Cloud', 'Bible Preservation', 1),
  ('The Modern Bible Version Hall of Shame', 'David W. Cloud', 'Bible Preservation', 1),
  ('Why we Hold to the King James Bible', 'David W. Cloud', 'Bible Preservation', 1),
  ('Causes of Corruption of the New Testament Text', 'Dean John William Burgon', 'Bible Preservation', 1),
  ('Inspiration and Interpretation', 'Dean John William Burgon', 'Bible Preservation', 1),
  ('The Last Twelve Verses of Mark', 'Dean John William Burgon', 'Bible Preservation', 1),
  ('The Revision Revised', 'Dean John William Burgon', 'Bible Preservation', 1),
  ('One Book Stands Alone - The Key to Believing the Bible', 'Douglas D. Stauffer', 'Bible Preservation', 1),
  ('The King James Version Defended', 'Edward F. Hills', 'Bible Preservation', 1),
  ('Evaluating Versions of the New Testament', 'Everett W. Fowler', 'Bible Preservation', 1),
  ('The JW Bible', 'Gerald Wright', 'Bible Preservation', 1),
  ('Logical Criticisms of Textual Criticism', 'Gordon H. Clark', 'Bible Preservation', 1),
  ('The Attack on the Canon of Scripture', 'H. D. Williams', 'Bible Preservation', 1),
  ('Trial by Fire', 'Harold Rawlings', 'Bible Preservation', 1),
  ('Trial by Fire - The Struggle to Get the Bible into English', 'Harold Rawlings', 'Bible Preservation', 1),
  ('Early Manuscripts, Church Fathers and the Authorized Version', 'J. A. Moorman', 'Bible Preservation', 1),
  ('21 Alleged Mistakes in the King James Bible', 'Jack A. Moorman', 'Bible Preservation', 1),
  ('Forever Settled - A Survey of the Documents and History of the Bible', 'Jack A. Moorman', 'Bible Preservation', 1),
  ('Missing in Modern Bibles - The Old Heresy Revived', 'Jack A. Moorman', 'Bible Preservation', 1),
  ('A Testimony Founded For Ever - THe King James Bible Defended in Faith and History', 'James H. Sightler', 'Bible Preservation', 1),
  ('Wescott''s New BIbles - Changing the Truth of God Into a Lie', 'James H. Sightler', 'Bible Preservation', 1),
  ('A Testimony Founded For Ever', 'James Sightler', 'Bible Preservation', 1),
  ('The Gnostics, The New Versions and The Deity of Christ', 'Jay P. Green', 'Bible Preservation', 1),
  ('Kept Pure in All Age', 'Jeffrey Khoo', 'Bible Preservation', 1),
  ('The Traditional Text of the Holy Gospels', 'John William Burgon', 'Bible Preservation', 1),
  ('Thou Shalt Keep Them', 'Kent Brandenburg', 'Bible Preservation', 1),
  ('Baptists and the Bible', 'L. Russ Bush & Tom J. Nettles', 'Bible Preservation', 1),
  ('Archaic Words and the Authorized Version', 'Laurance M. Vance', 'Bible Preservation', 1),
  ('King James His Bible and It''s Translators', 'Laurence M. Vance', 'Bible Preservation', 1),
  ('We Can Trust the Bible', 'Lehman Strauss', 'Bible Preservation', 1),
  ('The Word of God in English', 'Leland Ryken', 'Bible Preservation', 1),
  ('Ready Answers', 'Phil Stringer', 'Bible Preservation', 1),
  ('Landmarks of English Bible: Manuscript Evidence', 'Robert J. Sargent', 'Bible Preservation', 1),
  ('The Interpreter''s Bible', 'Robert L. Sumner', 'Bible Preservation', 1),
  ('A Practical Theology of Bible Translating', 'Steve Combs', 'Bible Preservation', 1),
  ('So Shall My Word Be', 'Steve Combs', 'Bible Preservation', 1),
  ('The Lord God Hath Spoken', 'Thomas M. Strouse', 'Bible Preservation', 1),
  ('From the Mind of God to the Mind of Man', 'Various', 'Bible Preservation', 1),
  ('Inspiration of the Bible', 'B.H. Carroll', 'Bible Versions', 1),
  ('4,114 Definitions from the Defined King James Bible', 'D.A. Waite', 'Bible Versions', 1),
  ('The Case for the King James Bible', 'D.A. Waite', 'Bible Versions', 1),
  ('The Lie that changed the Modern World', 'H. D. Williams', 'Bible Versions', 1),
  ('The Miracle of Biblical Inspiration', 'H. D. Williams', 'Bible Versions', 1),
  ('Lively Oracles - The Inspired Bible in the Hearts of Believers', 'James H. Sightler', 'Bible Versions', 1),
  ('In Defense of the Textus Receptus', 'Jim Taylor', 'Bible Versions', 1),
  ('Majestic Legacy', 'Phil Stringer', 'Bible Versions', 1),
  ('Melody''s Kooky Cover-Up', 'Ernie & Debby Rettino', 'Children''s Books', 1),
  ('Psalty in Alaska', 'Ernie & Debby Rettino', 'Children''s Books', 1),
  ('Psalty in Egypt', 'Ernie & Debby Rettino', 'Children''s Books', 1),
  ('Psalty in the South Pacific', 'Ernie & Debby Rettino', 'Children''s Books', 1),
  ('Psalty in the Soviet Circus', 'Ernie & Debby Rettino', 'Children''s Books', 1),
  ('Spotlight on Charity', 'Ernie & Debby Rettino', 'Children''s Books', 1),
  ('Psalty in Australia', 'Ernie& Debby Rettino', 'Children''s Books', 1),
  ('Barnaby Goes Wild', 'Gary Richmond', 'Children''s Books', 1),
  ('Howard the Horrible Gets Even', 'Gary Richmond', 'Children''s Books', 1),
  ('Life is a Zoo', 'Gary Richmond', 'Children''s Books', 1),
  ('The Forgotten Friend', 'Gary Richmond', 'Children''s Books', 1),
  ('The Prodigal Wolf', 'Gary Richmond', 'Children''s Books', 1),
  ('A Christian Perspective of Halloween, Easter, Christmas in the Light of God''s Word', 'Allegra McBirney', 'Christian Living', 1),
  ('Ethics - An Early American Handbook', 'Benjamin B. Comegys', 'Christian Living', 1),
  ('What the Bible Teaches about Drinking Wine', 'Bruce Lackey', 'Christian Living', 1),
  ('Faith is the Victory', 'Buell H. Kazee', 'Christian Living', 1),
  ('The Right to Live; The Right to Die', 'C. Everett Koop', 'Christian Living', 1),
  ('Mission: Motherhood', 'Cathy Corle', 'Christian Living', 1),
  ('The Bible and its Wines', 'Charles Ewing', 'Christian Living', 1),
  ('Marriage, Divorce and Remarriage', 'Charles J. Kriessman', 'Christian Living', 1),
  ('The Church', 'Chester Tulga', 'Christian Living', 1),
  ('Should Christians Drink', 'Curtis Hutson', 'Christian Living', 1),
  ('Spiritual Depression', 'D. Martyn Lloyd-Jones', 'Christian Living', 1),
  ('Making Marriage Melodious', 'D.A. Waite', 'Christian Living', 1),
  ('Bible Separation: its Doctrine and Practice', 'David W. Cloud', 'Christian Living', 1),
  ('Child Discipline', 'David W. Cloud', 'Christian Living', 1),
  ('Dressing for the Lord', 'David W. Cloud', 'Christian Living', 1),
  ('Effectual Prayer in Perilous Times', 'David W. Cloud', 'Christian Living', 1),
  ('Fantasy Dangers', 'David W. Cloud', 'Christian Living', 1),
  ('Holiness: Pitfalls, Struggles & Victory', 'David W. Cloud', 'Christian Living', 1),
  ('Keeping the Kids in the Social Media Age', 'David W. Cloud', 'Christian Living', 1),
  ('Knowing God''s Will', 'David W. Cloud', 'Christian Living', 1),
  ('One Year Discipleship Course', 'David W. Cloud', 'Christian Living', 1),
  ('Spiritual Safety in the Facebook Age', 'David W. Cloud', 'Christian Living', 1),
  ('The Bible, Diet & Alternative Health Care', 'David W. Cloud', 'Christian Living', 1),
  ('The Collapse of Separatism Among Fundamental Baptists', 'David W. Cloud', 'Christian Living', 1),
  ('The Effectual Bible Student', 'David W. Cloud', 'Christian Living', 1),
  ('Woman and her Service to God', 'David W. Cloud', 'Christian Living', 1),
  ('Created to be His Help Meet', 'Debi Pearl', 'Christian Living', 1),
  ('Preparing to be a Help Meet', 'Debi Pearl', 'Christian Living', 1),
  ('Happily Married - Ladies BIble Study and Workbook', 'Debi Pryde', 'Christian Living', 1),
  ('Secrets of a Happy Heart - Titus 2 Series Book 1', 'Debi Pryde', 'Christian Living', 1),
  ('Elements of Godly Character Vol. 2', 'Dennis Corle', 'Christian Living', 1),
  ('Elements of Godly Character Volume 1', 'Dennis Corle', 'Christian Living', 1),
  ('The Crucified Life', 'Dennis Corle', 'Christian Living', 1),
  ('The Discipline of Prayer', 'Dennis Corle', 'Christian Living', 1),
  ('Weathering the Storms of Life Volume 2', 'Dennis Corle', 'Christian Living', 1),
  ('Christ or Therapy For Depression and Life''s Troubles', 'E.S. Williams', 'Christian Living', 1),
  ('The Great Divorce Controversy', 'E.S. Williams', 'Christian Living', 1),
  ('"Be Ye Holy" - The Call to Christian Separation', 'Fred Moritz', 'Christian Living', 1),
  ('The 5 Love Languages', 'Gary Chapman', 'Christian Living', 1),
  ('Holiness - The False and the True', 'Harry A. Ironside', 'Christian Living', 1),
  ('The Gospel and Mental illness', 'Heath Lambert', 'Christian Living', 1),
  ('How to Cope with Your Parents In the Generation Gap', 'Hugh F. Pyle', 'Christian Living', 1),
  ('How to Live Happily Ever After', 'Hugh F. Pyle', 'Christian Living', 1),
  ('Keeping the Honey in the Honeymoon', 'Hugh F. Pyle', 'Christian Living', 1),
  ('Skimpy Skirts and Hippy Hair', 'Hugh F. Pyle', 'Christian Living', 1),
  ('Causes and Cures of Poverty', 'J. Paul Reno', 'Christian Living', 1),
  ('Framework for Families', 'J. Paul Reno', 'Christian Living', 1),
  ('Christian Modesty and the Public Undressing of America', 'Jeff Pollard', 'Christian Living', 1),
  ('The Twenty One Tenents of Biblical Masculinity', 'Jerry Ross', 'Christian Living', 1),
  ('How to Win Over Worry - A Practical Formula for Successful Living', 'John Haggai', 'Christian Living', 1),
  ('Charity and Its Fruits', 'Jonathan Edwards', 'Christian Living', 1),
  ('Disciplines of a Godly Man', 'Kent Hughes', 'Christian Living', 1),
  ('Christian Maturity', 'Lester Hutson', 'Christian Living', 1),
  ('Attitudes of a Transformed Heart', 'Martha Peace', 'Christian Living', 1),
  ('Damsels in Distress - Biblical Solutions for Problems Women Face', 'Martha Peace', 'Christian Living', 1),
  ('Precious Truths in Practice', 'Martha Peace', 'Christian Living', 1),
  ('Psychologized Man - A Biblical Perspective', 'Martha Peace', 'Christian Living', 1),
  ('Modesty - More than a change of Clothes', 'Martha Peace & Kent Keller', 'Christian Living', 1),
  ('To Train Up a Child', 'Michael & Debi Pearl', 'Christian Living', 1),
  ('Hurting and Healing', 'Patti Williams', 'Christian Living', 1),
  ('A Maze of Grace - Claiming God''s grace during a season of Suffering', 'Paul Chappell', 'Christian Living', 1),
  ('Abiding in Christ', 'Paul Chappell', 'Christian Living', 1),
  ('All Things Through Christ', 'Paul Chappell', 'Christian Living', 1),
  ('Discerning Alcohol', 'Paul Chappell', 'Christian Living', 1),
  ('First Steps for New Christians', 'Paul Chappell', 'Christian Living', 1),
  ('Grace for Godly Living', 'Paul Chappell', 'Christian Living', 1),
  ('I''m Not Ok', 'Paul Chappell', 'Christian Living', 1),
  ('Living on God''s Economy', 'Paul Chappell', 'Christian Living', 1),
  ('The Burden Bearer', 'Paul Chappell', 'Christian Living', 1),
  ('When a Nation Turns its Back to God', 'Paul Chappell', 'Christian Living', 1),
  ('Your Pastor and You', 'Paul Chappell & Cary Schmidt', 'Christian Living', 1),
  ('Christian Child-Rearing and Personality Development', 'Paul D. Meier', 'Christian Living', 1),
  ('Marriage', 'Paul David Tripp', 'Christian Living', 1),
  ('Parenting', 'Paul David Tripp', 'Christian Living', 1),
  ('Teens and Sex', 'Paul David Tripp', 'Christian Living', 1),
  ('War of Words', 'Paul David Tripp', 'Christian Living', 1),
  ('The ABCs of Christian Growth', 'Robert J. Sargent', 'Christian Living', 1),
  ('God''s Wisdom for Marriage & the Home', 'Scott Markle', 'Christian Living', 1),
  ('In the World Not of the World', 'Scott Markle', 'Christian Living', 1),
  ('The Twenty One Tenents of Biblical Masculinity', 'Scott Markle', 'Christian Living', 1),
  ('Thou Shalt Do These Things', 'Scott Markle', 'Christian Living', 1),
  ('The Exemplary Husband', 'Stuart Scott', 'Christian Living', 1),
  ('Shepherding a Child''s Heart', 'Tedd Tripp', 'Christian Living', 1),
  ('Teaching Obedience', 'Walt Brock', 'Christian Living', 1),
  ('Formula for Family Unity', 'Walter and Trudy Fremont', 'Christian Living', 1),
  ('Bible Wines or Laws of Fermentations and Wines of the Ancients', 'William Patton', 'Christian Living', 1),
  ('The Treasury of Scripture Knowledge', 'Assorted Contributing Authors', 'Commentaries & Dictionaries', 1),
  ('Believer''s Bible Dictionary', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Corinthian Epistles', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Daniel', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of LIfe Commentary Series - Ezekiel', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Galatians', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - General Epistles', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of LIfe Commentary Series - Genesis-Deuteronomy Vol. 1 of 2', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of LIfe Commentary Series - Genesis-Deuteronomy Vol. 2 of 2', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Hebrews', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Isaiah', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of LIfe Commentary Series - Jeremiah', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Joshua-Chronicles', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Minor Prophets', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Pastoral Epistles', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Paul''s Prison Epistles', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Proverbs', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Psalms Vol 1 of 2', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Psalms Vol 2 of 2', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Revelation', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - Romans', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('Way of Life Commentary Series - The Thessalonian Epistles', 'David W. Cloud', 'Commentaries & Dictionaries', 1),
  ('The Bible Promise Book', 'Barbour Publishing', 'Devotional', 1),
  ('Boyhood and Beyond - Practical Wisdom for Becomign a Man', 'Bob Schultz', 'Devotional', 1),
  ('Boyhood and Beyond - Practical Wisdom for Becoming a Man', 'Bob Schultz', 'Devotional', 1),
  ('Created for Work', 'Bob Schultz', 'Devotional', 1),
  ('Practical Happiness', 'Bob Schultz', 'Devotional', 1),
  ('To the Golden Shore', 'Courtney Anderson', 'Devotional', 1),
  ('William Tyndale - A Biography', 'David Daniell', 'Devotional', 1),
  ('This Day in Baptist History II', 'David L. Cummins & E. Wayne Thompson', 'Devotional', 1),
  ('Forward in the Face of Fear', 'Edgar Feghaly', 'Devotional', 1),
  ('A New View from the Zoo', 'Gary Richmond', 'Devotional', 1),
  ('A Scary Night At the Zoo', 'Gary Richmond', 'Devotional', 1),
  ('A View from the Zoo', 'Gary Richmond', 'Devotional', 1),
  ('All God''s Creatures - Spiritual Lessons from the Animals of the Bible', 'Gary Richmond', 'Devotional', 1),
  ('The Heavens Declare the GLory of God', 'Henry Morris', 'Devotional', 1),
  ('Character Sketches Volume 2', 'Institute in Basic Youth Conflicts', 'Devotional', 1),
  ('Character Sketches Volume 3', 'Institute in Basic Youth Conflicts', 'Devotional', 1),
  ('The Little Baptist', 'J.M. Martin', 'Devotional', 1),
  ('Missionary Patriarch - The True Story of John G. Paton', 'James Paton', 'Devotional', 1),
  ('Grace Abounding - The Spiritual Autobiography of John Bunyan', 'John Bunyan', 'Devotional', 1),
  ('The Narrow Gate and the Heavenly Footman', 'John Bunyan', 'Devotional', 1),
  ('The Pilgrim''s Progress', 'John Bunyan', 'Devotional', 1),
  ('The Gold Mine', 'Lee Roberson', 'Devotional', 1),
  ('A Daily Word', 'Paul Chappell', 'Devotional', 1),
  ('A Word to the Wise - Practical Advice from the Book of Proverbs', 'Paul Chappell', 'Devotional', 1),
  ('Continue - A Biblical Journey Through Personal Discipleship', 'Paul Chappell', 'Devotional', 1),
  ('Disciple - 365 Devotional Readings for every day of the Year', 'Paul Chappell', 'Devotional', 1),
  ('Rooted in Christ - 366 Scriptural Devotions for Growing Christians', 'Paul Chappell', 'Devotional', 1),
  ('The Gospel In You', 'Paul Chappell', 'Devotional', 1),
  ('Trust and Obey', 'Paul Chappell', 'Devotional', 1),
  ('Halle Takes a Stand', 'Paul David Tripp', 'Devotional', 1),
  ('Baptist Heroes of the Faith Vol. 1 - John Clarke', 'Ted Alexander', 'Devotional', 1),
  ('Baptist Heroes of the Faith Vol. 10 - Isaac McCoy', 'Ted Alexander', 'Devotional', 1),
  ('Baptist Heroes of the Faith Vol. 2 - Obadiah Holmes', 'Ted Alexander', 'Devotional', 1),
  ('Baptist Heroes of the Faith Vol. 3 - Shobal Stearns', 'Ted Alexander', 'Devotional', 1),
  ('Baptist Heroes of the Faith Vol. 4 - John Leland', 'Ted Alexander', 'Devotional', 1),
  ('Baptist Heroes of the Faith Vol. 5 - Samuel Harriss', 'Ted Alexander', 'Devotional', 1),
  ('Baptist Heroes of the Faith Vol. 6 - William Carey', 'Ted Alexander', 'Devotional', 1),
  ('Baptist Heroes of the Faith Vol. 7 - John Gano', 'Ted Alexander', 'Devotional', 1),
  ('Baptist Heroes of the Faith Vol. 8 - John Taylor', 'Ted Alexander', 'Devotional', 1),
  ('Baptist Heroes of the Faith Vol. 9 - James Ireland', 'Ted Alexander', 'Devotional', 1),
  ('Songs of Glory', 'William Reynolds', 'Devotional', 1),
  ('The Obedience of a Christian Man', 'William Tyndale', 'Devotional', 1),
  ('Baptists and Their Doctrines', 'B.H. Carroll', 'Doctrine', 1),
  ('The Holy Spirit', 'B.H. Carroll', 'Doctrine', 1),
  ('Prophecy in Context', 'Bob Shelton', 'Doctrine', 1),
  ('The Case for the Atonement of Christ', 'Chester E. Tulga', 'Doctrine', 1),
  ('What the Bible Teaches about Biblical Separation', 'D.A. Waite', 'Doctrine', 1),
  ('The Bible''s Proof', 'David W. Cloud', 'Doctrine', 1),
  ('The Doctrine Which Ye have Learned', 'David W. Cloud', 'Doctrine', 1),
  ('Biblical Separation', 'Ernest Pickering', 'Doctrine', 1),
  ('Emblems of the Holy Spirit', 'F. E. Marsh', 'Doctrine', 1),
  ('Contending for the Faith', 'Fred Moritz', 'Doctrine', 1),
  ('A Handbook of Christian Truth', 'Harold Lindsell and Charles J. Woodbridge', 'Doctrine', 1),
  ('Basic Baptist Beliefs - An Exposition of Key Biblical Doctrines', 'Harold Rawlings', 'Doctrine', 1),
  ('The Bible Has the Answer', 'Henry M. Morris', 'Doctrine', 1),
  ('Old Landmarkism - What is it?', 'J. R. Graves', 'Doctrine', 1),
  ('Repentance', 'J. Thornton', 'Doctrine', 1),
  ('What we Believe and Why Volume 1', 'Lester Hutson', 'Doctrine', 1),
  ('Baptist Doctrine in One Year', 'M. L. Moser Jr.', 'Doctrine', 1),
  ('My Lord Delayeth His Coming - An Exposition of the Parable of the Unfaithful Steward in Luke 12', 'M. R. DeHann', 'Doctrine', 1),
  ('What is a Biblical Fundamentalist?', 'Paul Chappell', 'Doctrine', 1),
  ('Elder Rule in a Baptist Church?', 'Robert J. Sargent', 'Doctrine', 1),
  ('Landmarks of Baptist Doctrine Book 1', 'Robert J. Sargent', 'Doctrine', 1),
  ('Landmarks of Baptist Doctrine Book 4', 'Robert J. Sargent', 'Doctrine', 1),
  ('Forever His', 'Ron Tobin', 'Doctrine', 1),
  ('Faith and the Faith', 'T. T. Eaton', 'Doctrine', 1),
  ('The Virgin Birth of Jesus - Five Radio Sermons', 'M. R. DeHann', 'Doctrine', 1),
  ('Pilgrimage from Rome', 'Bartholomew F. Brewer', 'Evangelism', 1),
  ('Indigenous Churches', 'Bob Green', 'Evangelism', 1),
  ('Powerful Evangelism for the Powerless', 'C. John Miller', 'Evangelism', 1),
  ('Repentance and the 20th Century Man', 'C. John Miller', 'Evangelism', 1),
  ('How to Lead a Child to Christ', 'Daniel H. Smith', 'Evangelism', 1),
  ('The Drift in Baptist Missions, Churches and Schools', 'David Bennett', 'Evangelism', 1),
  ('Ideas for Evangelism', 'David Cloud & Linda Cloud', 'Evangelism', 1),
  ('Does Salvation Make a Difference', 'David W. Cloud', 'Evangelism', 1),
  ('Repentance & Soul-Winning', 'David W. Cloud', 'Evangelism', 1),
  ('Sowing and Reaping - A course in Evangelism', 'David W. Cloud', 'Evangelism', 1),
  ('The Seeker''s Bible Study', 'David W. Cloud', 'Evangelism', 1),
  ('Salvation Bible Basics', 'Doug Hammett', 'Evangelism', 1),
  ('Freedom''s Ring - Life, Liberty and the Pursuit of Salvation', 'Douglas D. Stauffer', 'Evangelism', 1),
  ('Sending Forth Laborers', 'Dwight Tomlinson & Paul Chappell', 'Evangelism', 1),
  ('Asahel Nettleton Revival Preacher', 'E. A. Johnston', 'Evangelism', 1),
  ('Except Ye Repent', 'Harry A. Ironside', 'Evangelism', 1),
  ('The Great Love of God - Encountering God''s Heart for a Hostile WO=orld', 'Heath Lambert', 'Evangelism', 1),
  ('Marks of Eternal Life', 'J. Paul Reno', 'Evangelism', 1),
  ('Evangelism Made Simple', 'Jim Scudder & Phil Stringer', 'Evangelism', 1),
  ('Johnathan Edwards on Revival', 'Jonathan Edwards', 'Evangelism', 1),
  ('Religious Affections', 'Jonathon Edwards', 'Evangelism', 1),
  ('Learning to Lead - Converting the Heart', 'Lance T. Ketchum', 'Evangelism', 1),
  ('The Lost Art of Disciple Making', 'LeRoy Eims', 'Evangelism', 1),
  ('Basic Bible Truths', 'Lester Hutson', 'Evangelism', 1),
  ('True Evangelism - Winning Souls by Prayer', 'Lewis Sperry Chafer', 'Evangelism', 1),
  ('The Gospel and Personal Evangelism', 'Mark Dever', 'Evangelism', 1),
  ('The Indigenous Church', 'Melvin L. Hodges', 'Evangelism', 1),
  ('Out of Commission', 'Paul Chappell', 'Evangelism', 1),
  ('Take it Personally', 'Paul Chappell', 'Evangelism', 1),
  ('To Seek and to Save - Winning and Building Committed Followers of Jesus Christ', 'Paul Chappell', 'Evangelism', 1),
  ('The Church that will be Left Behind', 'R. L. Hymers, Jr', 'Evangelism', 1),
  ('Preaching to a Dying Nation', 'R. L. Hymers, Jr.', 'Evangelism', 1),
  ('The Great Falling Away plus Old Time Pastoral Counselling', 'R. L. Hymers, Jr.', 'Evangelism', 1),
  ('Visitation in Action', 'R.O. Sanborn', 'Evangelism', 1),
  ('Hell''s Best Kept Secret', 'Ray Comfort', 'Evangelism', 1),
  ('Issues in Missiology - Volume 1A - Persecution', 'Robert D. Patton', 'Evangelism', 1),
  ('Issues in MIssiology - Volume 3 - Translation Issues', 'Robert D. Patton', 'Evangelism', 1),
  ('Issues in Missiology - Volume 4 - Worldview and World Religions', 'Robert D. Patton', 'Evangelism', 1),
  ('Issues in Missiology - Volume 5 - The Making of a Missionary', 'Robert D. Patton', 'Evangelism', 1),
  ('Issues in Missiology - Volumes 2A & 2B - Spiritual Warfare and Spiritual Life of the Missionary', 'Robert D. Patton', 'Evangelism', 1),
  ('The Masterplan of Evangelism', 'Robert E. Coleman', 'Evangelism', 1),
  ('Biblical Missions', 'Roy Dearmore', 'Evangelism', 1),
  ('The Soul Winner', 'Spurgeon', 'Evangelism', 1),
  ('Defense of the Faith', 'Albert Garner', 'False Doctrine', 1),
  ('17 Reasons why I left the Tongues Movement', 'Alfred H. Pohl', 'False Doctrine', 1),
  ('Mormonism', 'Anthony Hoekema', 'False Doctrine', 1),
  ('Calvinism - None Dare Call it Heresy', 'Bob Kirkland', 'False Doctrine', 1),
  ('Beyond Seduction - A Return to Biblical Christianity', 'Dave Hunt', 'False Doctrine', 1),
  ('Occult Invasion', 'Dave Hunt', 'False Doctrine', 1),
  ('What Love is This? - Calvanism Misrepresentation of God', 'Dave Hunt', 'False Doctrine', 1),
  ('America The Sorcerer''s New Apprentice - The Rise of New Age Shamanism', 'Dave Hunt & T.A. McMahon', 'False Doctrine', 1),
  ('The Seduction of Christianity - Spiritual Discernment in the Last Days', 'Dave Hunt & T.A. McMahon', 'False Doctrine', 1),
  ('Avoiding the Snare of Seventh Day Adventism', 'David W. Cloud', 'False Doctrine', 1),
  ('C.S. Lewis and Evangelicals Today Issues Facing the Churches', 'David W. Cloud', 'False Doctrine', 1),
  ('Defense of the Faith', 'David W. Cloud', 'False Doctrine', 1),
  ('Evangelicals & Contemplative Prayer', 'David W. Cloud', 'False Doctrine', 1),
  ('New Evangelicalism It''s History, Characteristics and Fruit', 'David W. Cloud', 'False Doctrine', 1),
  ('The Bible and Islam', 'David W. Cloud', 'False Doctrine', 1),
  ('The Calvinism Debate', 'David W. Cloud', 'False Doctrine', 1),
  ('The Emerging Church is Coming', 'David W. Cloud', 'False Doctrine', 1),
  ('The Hyles Effect', 'David W. Cloud', 'False Doctrine', 1),
  ('The Judge Not Heresy Is it Legalism to Judge Sin and Error', 'David W. Cloud', 'False Doctrine', 1),
  ('The Pentecostal-Charismatic Movements: The History & the Error', 'David W. Cloud', 'False Doctrine', 1),
  ('What about Steven Anderson?', 'David W. Cloud', 'False Doctrine', 1),
  ('What is the Emerging Church?', 'David W. Cloud', 'False Doctrine', 1),
  ('The New Calvinists', 'E. S. Williams', 'False Doctrine', 1),
  ('The God Makers', 'Ed Decker & Dave Hunt', 'False Doctrine', 1),
  ('Islam Made Easy - A Christian Guide to Understanding Islam', 'Edgar M. Feghaly', 'False Doctrine', 1),
  ('Charismatic Confusion', 'Ernest Pickering', 'False Doctrine', 1),
  ('Christian Hedonism? A biblical examination of John Piper''s teachings', 'ES Williams', 'False Doctrine', 1),
  ('Ecumenism: Another Gospel', 'ES Williams', 'False Doctrine', 1),
  ('Handbook of Denominations in the United States', 'Frank S. Mead', 'False Doctrine', 1),
  ('The Dark Side of Calvinism', 'George Bryson', 'False Doctrine', 1),
  ('Is Mormonism Christian - Mormon Doctrine Compared with Biblical Christianity', 'Gordon H. Fraser', 'False Doctrine', 1),
  ('Confronting the Cults', 'Gordon R. Lewis', 'False Doctrine', 1),
  ('Spirit Works - Charismatic Practices and the Bible', 'Jerry Vines', 'False Doctrine', 1),
  ('Fast Facts on Islam - What you Need to Know Now', 'John Ankerberg & John Weldon', 'False Doctrine', 1),
  ('Contemporary Compromise', 'John Goetsch', 'False Doctrine', 1),
  ('Has Mormonism Changed?', 'John L. Smith', 'False Doctrine', 1),
  ('Hope or Despair', 'John L. Smith', 'False Doctrine', 1),
  ('I Visited the Temple', 'John L. Smith', 'False Doctrine', 1),
  ('Thirty-Five Mormons and 1 Baptist Preacher', 'John L. Smith', 'False Doctrine', 1),
  ('Sunday or Sabbath Which Should Christians Observe', 'John R. Rice', 'False Doctrine', 1),
  ('Communicating Christ in a Religious World', 'John Thomas Rogers', 'False Doctrine', 1),
  ('The Foundation of Augustinian-Calvinism', 'Ken Wilson', 'False Doctrine', 1),
  ('The Other Side of Calvinism', 'Laurence M.  Vance', 'False Doctrine', 1),
  ('The Potter''s Promise - A Biblical Defense of Traditional Soteriology', 'Leighton Flowers', 'False Doctrine', 1),
  ('Capital Punishment - Christian or Barbarian', 'M. L. Moser Jr.', 'False Doctrine', 1),
  ('Psycho Heresy', 'Martin and Deirdre Bobgan', 'False Doctrine', 1),
  ('Preparing Catholics for Eternity', 'Mike Gendron', 'False Doctrine', 1),
  ('Seventh Day Adventists Believe - A Biblical Exposition of Fundamental Doctrines', 'Ministerial Association', 'False Doctrine', 1),
  ('Against the Protestant Gnostics', 'Philip J. Lee', 'False Doctrine', 1),
  ('A Struggle to Peace', 'Richard & Cindy Benson', 'False Doctrine', 1),
  ('Psychobabble - The Failure of Modern Psychology - and the Biblical Alternative', 'Richard Ganz', 'False Doctrine', 1),
  ('Understanding Roman Catholicism', 'Rick Jones', 'False Doctrine', 1),
  ('Falsities of Seventh-Day Adventism', 'Robert L. Sumner', 'False Doctrine', 1),
  ('The Islamic Invasion - Confronting the World''s Fastest Growing Religion', 'Robert Morey', 'False Doctrine', 1),
  ('Promise Unfulfilled - The Failed Strategy of Modern Evangelicalism', 'Rolland McCune', 'False Doctrine', 1),
  ('Salvation: Choice or Chosen', 'Ron Tobin', 'False Doctrine', 1),
  ('A Solemn Caution Against The Ten Horns of Calvinism', 'Thomas Taylor', 'False Doctrine', 1),
  ('Approaching Mormons in Love', 'Wilbur Lingle', 'False Doctrine', 1),
  ('Burning Questions about Islam', 'Wilbur Lingle', 'False Doctrine', 1),
  ('25 Important Questions for Mormons', 'Wilbur Lingle and Robert Delancy', 'False Doctrine', 1),
  ('Common Sense Parenting - The Essentials of building a Christian Family', 'Kent & Barbara Hughes', 'Family', 1),
  ('Tying the Knot Tighter - Because Marraige Lasts a Lifetime', 'Marth Peace & John Crotts', 'Family', 1),
  ('The Excellent Wife', 'Martha Peace', 'Family', 1),
  ('Becoming a Titus 2 Woman', 'Martha Peace', 'Family', 1),
  ('The Faithful Parent - A Biblical Guide to Raising a Family', 'Martha Peace & Stuart W. Scott', 'Family', 1),
  ('Far Above Rubies', 'Mrs. H.W. Darst', 'Family', 1),
  ('A Faith Full Marriage', 'Paul Chappell', 'Family', 1),
  ('A Firm Foundation', 'Paul Chappell', 'Family', 1),
  ('Making Home Work in a Broken Society', 'Paul Chappell', 'Family', 1),
  ('Time Out for Parents', 'Paul Chappell', 'Family', 1),
  ('Before You Meet Prince Charming', 'Sarah Mally', 'Family', 1),
  ('Speak Truth in your Heart', 'Sarah Mally', 'Family', 1),
  ('Making Brothers and Sisters Best Friends', 'Sarah, Stephen and Grace Mally', 'Family', 1),
  ('The Dissent and Nonconformity Series #3 - The Israel of the Apls - A History of the Waldenses Volume 1', 'Alexis Muston', 'History', 1),
  ('The Dissent and Nonconformity Series #4 - The Israel of the Alps - A History of the Waldenses Volume 2', 'Alexis Muston', 'History', 1),
  ('Memorials of Baptist Martyrs', 'Assorted Contributing Authors', 'History', 1),
  ('The Dissent and Nonconformity Series #10 - The Early English Dissenters Volume 2', 'Champlin Burrage', 'History', 1),
  ('The Dissent and Nonconformity Series #9 - The Early English Dissenters Voume 1', 'Champlin Burrage', 'History', 1),
  ('The Baptist Biography Series #5 - Memoirs of Elder Jesse Mercer', 'Charles D. Mallary', 'History', 1),
  ('Ras Shamra and the Bible - Baker Studies in Biblical Archaeology', 'Charles F. Pfeiffer', 'History', 1),
  ('The Jews and Israel', 'Charles Kriessman', 'History', 1),
  ('The Baptist History Series #5 - 50 Years Among the Baptists', 'David Benedict', 'History', 1),
  ('The Dissent and Nonconformity Series #12 - History of the Donatists', 'David Benedict', 'History', 1),
  ('In Pursuit of Purity', 'David O. Beale', 'History', 1),
  ('Bible Times & Ancient Kingdoms Treasures from History & Archaeology', 'David W. Cloud', 'History', 1),
  ('Highlights in Church History', 'David W. Cloud', 'History', 1),
  ('History of the Churches From a Baptist Perspective Volume 1', 'David W. Cloud', 'History', 1),
  ('History of the Churches From a Baptist Perspective Volume 2', 'David W. Cloud', 'History', 1),
  ('Jews in Fighter Jets: Israel Past, Present, and Future', 'David W. Cloud', 'History', 1),
  ('Protestant Persecution of Baptists', 'David W. Cloud', 'History', 1),
  ('Rome and the Bible', 'David W. Cloud', 'History', 1),
  ('The History and Heritage of Fundamentalism and Fundamental Baptist Churches', 'David W. Cloud', 'History', 1),
  ('The Romans - A Panoramic View of the Political, Economic, MIlitary, and Social Institutions of Rome', 'Donald R. Dudley', 'History', 1),
  ('The Dissent and Nonconformity Series #22 - The Recovery of the Anabaptist Vision', 'Edited by Guy F. Hershberger', 'History', 1),
  ('Persia and the Bible', 'Edwin M. Yamauchi', 'History', 1),
  ('Forty Stories of Famous Gospel Songs', 'Ernest K. Emurian', 'History', 1),
  ('When a Nation Forgets God', 'Erwin W. Lutzer', 'History', 1),
  ('The Dissent and Nonconformity Series #11 - The Anabaptist View of the Church', 'Franklin H. Littell', 'History', 1),
  ('Manners and Customs of Bible Lands', 'Fred H. Wight', 'History', 1),
  ('A Concise History of Baptists', 'G. H. Orchard', 'History', 1),
  ('A History of Fundamentalism in America', 'George W. Dollar', 'History', 1),
  ('The Baptist History Series #3 - A History of New England Baptists Volume 1 of 2', 'Isaac Backus', 'History', 1),
  ('The Baptist History Series #4 - A History of New England Baptists Volume 2 of 2', 'Isaac Backus', 'History', 1),
  ('The Trail of Blood', 'J. M. Carroll', 'History', 1),
  ('The Baptist History Series #15 - Baptist History', 'J. M. Cramp', 'History', 1),
  ('The Baptist History Series #10 - Memorials of Baptist Martyrs', 'J. Newton Brown', 'History', 1),
  ('Compendium of Baptist History', 'J.A. Shackelford', 'History', 1),
  ('Lives of Virginia Baptist Ministers', 'James B', 'History', 1),
  ('The Baptist Biography Series #3 - The Diary of John Comer', 'John Comer', 'History', 1),
  ('The Dissent and Nonconformity Series #13 - Lutheran Reformers Against Anabaptists', 'John S. Oyer', 'History', 1),
  ('Mirror of the Martyrs', 'John S. Oyer and Robert S. Kreider', 'History', 1),
  ('A History of the Baptists Volume I and II', 'John Tyler Christian', 'History', 1),
  ('Baptist History Vindicated', 'John Tyler Christian', 'History', 1),
  ('The Dissent and Nonconformity Series #14 - The Reformers and Their Stepchildren', 'Leonard Verduin', 'History', 1),
  ('A History of Churches', 'Lester Hutson', 'History', 1),
  ('The Baptist Biography Series #1 - John Clarke', 'Louis Franklin Asher', 'History', 1),
  ('Faith of Our Fathers: Scenes from American Church History', 'Mark Sidwell', 'History', 1),
  ('Outsiders - 15 Leaders who followed Christ and Changed the World', 'Paul Chappell', 'History', 1),
  ('The Tabernacle of God in the Wilderness of Sinai', 'Paul F. Kiene', 'History', 1),
  ('The Foundations of Our World Volume 1 - From Creation to the Middle Ages', 'Phil Stringer', 'History', 1),
  ('The Foundations of Our World Volume 2 - From the Middle Ages Until the Return of Christ', 'Phil Stringer', 'History', 1),
  ('The Heaven Rescued Land Volume 1', 'Phil Stringer', 'History', 1),
  ('The Heaven Rescued Land Volume 2', 'Phil Stringer', 'History', 1),
  ('Tne Faithful Baptist Witness', 'Phil Stringer', 'History', 1),
  ('Proving God - Financial Experiences of the China Inland Mission', 'Phyllis Thompson', 'History', 1),
  ('The Baptist History Series #14 - The Story of the Baptists in All Ages and Countries', 'Richard B. Cook', 'History', 1),
  ('The Lord''s Free People in a Free Land', 'Robert A. Baker', 'History', 1),
  ('Contending for the Faith', 'Robert Ashcraft', 'History', 1),
  ('Landmarks of Church History Book 1', 'Robert J. Sargent', 'History', 1),
  ('Landmarks of Church History Book 2', 'Robert J. Sargent', 'History', 1),
  ('The Origin of the Baptists', 'S. F. Ford', 'History', 1),
  ('The Dissent and Nonconformity Series #1 - The History of the Evangelical Churches of the Valleys of Piemont Volume 1', 'Samuel Morland', 'History', 1),
  ('The Dissent and Nonconformity Series #2 - The History of the Evangelical Churches of the Valleys of Piemont Volume 2', 'Samuel Morland', 'History', 1),
  ('Experiences of A Baptist Faith Missionary for 56 Years in China', 'T. L. Blalock', 'History', 1),
  ('The Waldenses of Whom the World was Not Worthy', 'Ted Alexander', 'History', 1),
  ('Martyrs Mirror', 'Thieleman J. van Braght', 'History', 1),
  ('History of the Baptists', 'Thomas Armitage', 'History', 1),
  ('The Baptist History Series #1 - A History of the Baptists Volume 1 of 2', 'Thomas Armitage', 'History', 1),
  ('The Baptist History Series #2 - A History of the Baptists Volume 2 of 2', 'Thomas Armitage', 'History', 1),
  ('The Baptist History Series #16 - The History of the English Baptists Volume 1 of 4', 'Thomas Crosby', 'History', 1),
  ('The Baptist History Series #17 - The History of the English Baptists Volume 2 of 4', 'Thomas Crosby', 'History', 1),
  ('The Baptist History Series #18 - The History of the English Baptists Volume 3 of 4', 'Thomas Crosby', 'History', 1),
  ('The Baptist History Series #19 - The History of the English Baptists Volume 4 of 4', 'Thomas Crosby', 'History', 1),
  ('St. Paul the Traveller and the Roman Citizen', 'W. M. Ramsay', 'History', 1),
  ('The Cities of St. Paul', 'W. M. Ramsay', 'History', 1),
  ('The Dissent and Nonconformity Series #5 - The History and Antiquities of the Dissenting Churches Volume 1', 'Walter Wilson', 'History', 1),
  ('The Dissent and Nonconformity Series #6 - The History and Antiquities of the Dissenting Churches Volume 2', 'Walter Wilson', 'History', 1),
  ('The Dissent and Nonconformity Series #7 - The History and Antiquities of the Dissenting Churches Volume 3', 'Walter Wilson', 'History', 1),
  ('The Dissent and Nonconformity Series #8 - The History and Antiquities of the Dissenting Churches Volume 4', 'Walter Wilson', 'History', 1),
  ('Rousseau and Revolution', 'Will & Ariel Durant', 'History', 1),
  ('The Age of Napoleon', 'Will & Ariel Durant', 'History', 1),
  ('The Age of Reason Begins', 'Will & Ariel Durant', 'History', 1),
  ('The Age of Voltaire', 'Will & Ariel Durant', 'History', 1),
  ('Caesar and Christ', 'Will Durant', 'History', 1),
  ('Our Oriental Heritage', 'Will Durant', 'History', 1),
  ('The Age of Faith', 'Will Durant', 'History', 1),
  ('The Life of Greece', 'Will Durant', 'History', 1),
  ('The Reformation', 'Will Durant', 'History', 1),
  ('The Renaissance', 'Will Durant', 'History', 1),
  ('And God Gave the Increase', 'William Estep', 'History', 1),
  ('CCM is Not the Problem - It''s Only a Symptom', 'David Bennett', 'Music', 1),
  ('A Plea to Sothern Gospel Music Lovers', 'David W. Cloud', 'Music', 1),
  ('Directory of Contemporary Worship Musicians', 'David W. Cloud', 'Music', 1),
  ('Rock & Roll''s War Against God', 'David W. Cloud', 'Music', 1),
  ('The Satanic Attack on Sacred Music', 'David W. Cloud', 'Music', 1),
  ('Transforming Congregational Singing for the 21st Century', 'David W. Cloud', 'Music', 1),
  ('What Every Christian Should Know about Rock Music', 'David W. Cloud', 'Music', 1),
  ('"The Pied Piper" of Rock Music', 'Dennis Corle', 'Music', 1),
  ('The Lord''s Song', 'Erich P. McCandless', 'Music', 1),
  ('Confronting Contemporary Christian Music', 'H. T. Spence', 'Music', 1),
  ('How to Conquer the Addiction of Rock Music', 'Institute in Basic Life Principles', 'Music', 1),
  ('Measuring the Music', 'John Makujina', 'Music', 1),
  ('Doing our Own Thing', 'John McWhorter', 'Music', 1),
  ('Let Those Who Have Ears to Hear', 'Kimberly Smith', 'Music', 1),
  ('Music and Morals', 'Kimberly Smith', 'Music', 1),
  ('Worship in the Melting Pot', 'Peter Masters', 'Music', 1),
  ('The Battle for Christian Music', 'Tim Fisher', 'Music', 1),
  ('The Three Baptisms - Water! Spirit! Fire!', 'B.H. Carroll', 'Ordinances', 1),
  ('The Church and the Ordinances', 'Buell H. Kazee', 'Ordinances', 1),
  ('The Baptism of the Holy Spirit', 'I. K. Cross', 'Ordinances', 1),
  ('John''s Baptism', 'J. R. Graves', 'Ordinances', 1),
  ('The Lord''s Supper', 'J. R. Graves', 'Ordinances', 1),
  ('Close Communion and Baptists', 'J.H. Grime', 'Ordinances', 1),
  ('The Act of Christian Baptism', 'J.R. Graves', 'Ordinances', 1),
  ('The Lord''s Supper - A Church Ordinance', 'James R. Graves', 'Ordinances', 1),
  ('Are Your Baptismal Waters Doctrinally Shallow?', 'Lance T. Ketchum', 'Ordinances', 1),
  ('The Baptism of the Holy Ghost and Tongues', 'Louis Entzminger', 'Ordinances', 1),
  ('The Battle for Biblical Baptism', 'Luis C. Ruiz', 'Ordinances', 1),
  ('A Sober Discourse of Right To Church Communion', 'William Kiffin', 'Ordinances', 1),
  ('Alien Baptism and the Baptists', 'William M. Nevins', 'Ordinances', 1),
  ('The Preacher and His Preaching', 'Alfred Gibbs', 'Pastoral', 1),
  ('Lectures to My Students', 'Charles H. Spurgeon', 'Pastoral', 1),
  ('Spiritual Leadership Volume 1', 'Dennis Corle', 'Pastoral', 1),
  ('Spiritual Leadership Volume 3', 'Dennis Corle', 'Pastoral', 1),
  ('A Theology of Biblical Counseling', 'Heath Lambert', 'Pastoral', 1),
  ('A Guide to Effective Sermon Delivery', 'Jerry Vines', 'Pastoral', 1),
  ('A Practical Guide to Serman Preparation', 'Jerry Vines', 'Pastoral', 1),
  ('Keep the Faith', 'Paul Chappell', 'Pastoral', 1),
  ('Leaders who make a Difference', 'Paul Chappell', 'Pastoral', 1),
  ('Strengthen your Hands', 'Paul Chappell', 'Pastoral', 1),
  ('The Ministry of a Baptist Deacon', 'Paul Chappell', 'Pastoral', 1),
  ('The Road Ahead - 10 Steps to Authentic Ministry for Independed Baptists', 'Paul Chappell', 'Pastoral', 1),
  ('Dangerous Calling', 'Paul David Tripp', 'Pastoral', 1),
  ('Instruments in the Redeemer''s Hands', 'Paul David Tripp', 'Pastoral', 1),
  ('God''s Prophetic Blueprint', 'Bob Shelton', 'Prophecy', 1),
  ('An Urgent Call to a Serious Faith', 'Dave Hunt', 'Prophecy', 1),
  ('Bible Prophecy as Light on the 21st Century', 'David W. Cloud', 'Prophecy', 1),
  ('Prophecy', 'David W. Cloud', 'Prophecy', 1),
  ('The Future According to the Bible', 'David W. Cloud', 'Prophecy', 1),
  ('Understanding Bible Prophecy', 'David W. Cloud', 'Prophecy', 1),
  ('Revelation Visualized', 'Gary G. Cohen and Salem Kirban', 'Prophecy', 1),
  ('Revelation Visualized', 'Harry A. Ironside', 'Prophecy', 1),
  ('The End Times', 'Herman A. Hoyt', 'Prophecy', 1),
  ('Understanding the Times - Living Courageously in Prophetic Times', 'Paul Chappell', 'Prophecy', 1),
  ('The Interpretation of Prophecy', 'Paul Lee Tan', 'Prophecy', 1),
  ('Kirban''s Prophecy New Testament', 'Salem Kirban', 'Prophecy', 1),
  ('Temporal Delusion', 'T.A. McMahon', 'Prophecy', 1),
  ('Bible Analysis', 'Albert Garner', 'Study & Reference', 1),
  ('The New Testament', 'American Bible Society', 'Study & Reference', 1),
  ('The Right Word III', 'American Heritage Dictionary', 'Study & Reference', 1),
  ('The Word Book III', 'American Heritage Dictionary', 'Study & Reference', 1),
  ('The Written Word III', 'American Heritage Dictionary', 'Study & Reference', 1),
  ('An Interpretation of the English Bible - The Four Gospels', 'B.H. Carroll', 'Study & Reference', 1),
  ('An Interpretation of the English Bible - Volume ?? The Four Gospels', 'B.H. Carroll', 'Study & Reference', 1),
  ('An Interpretation of the English Bible - Volume I - Genesis', 'B.H. Carroll', 'Study & Reference', 1),
  ('An Interpretation of the English Bible - Volume IV - The Poetical Books', 'B.H. Carroll', 'Study & Reference', 1),
  ('An Interpretation of the English Bible - Volume IX - Daniel and the Inter-Biblical Period', 'B.H. Carroll', 'Study & Reference', 1),
  ('An Interpretation of the English Bible - Volume VIII - The Prophets of the Chaldean Period', 'B.H. Carroll', 'Study & Reference', 1),
  ('An Interpretation of the English Bible - Volume XV - Colossians, Ephesians, Hebrews', 'B.H. Carroll', 'Study & Reference', 1),
  ('Notes on the Book of Deuteronomy', 'C. H. M.', 'Study & Reference', 1),
  ('Notes on the Book of Genesis', 'C. H. M.', 'Study & Reference', 1),
  ('Notes on the Book of Leviticus', 'C. H. M.', 'Study & Reference', 1),
  ('Notes on the Book of Numbers', 'C. H. M.', 'Study & Reference', 1),
  ('Different by Design - Discovering that a Godly life is Still a Good Life', 'Cary Schmidt', 'Study & Reference', 1),
  ('Discover your Destiny - Making Right Choices in a World Full of Wrong', 'Cary Schmidt', 'Study & Reference', 1),
  ('Life Quest - Braving Adulthood with Biblical Passion', 'Cary Schmidt', 'Study & Reference', 1),
  ('101 Select Sermon Outlines', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('12 Sermons for the Troubled and Tired', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('12 Sermons on Decisions', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('12 Sermons on Prayer', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('12 Sermons on the Holy Spirit', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('12 Sermons on the Passion and Death of Christ', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('12 Sermons on the Second Coming of Christ', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('12 Sermons on Various Subjects', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('12 Sermons to Young People', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('12 Striking Sermons', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('Christ''s Glorious Achievements', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('Counsel for Christian Workers', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('The King''s Highway', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('The Saint and his Saviour', 'Charles H. Spurgeon', 'Study & Reference', 1),
  ('The First 200 Questions Answered', 'D.A. Waite', 'Study & Reference', 1),
  ('A Portrait of Christ - The Tabernacle, The Priesthood, The Offerings', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - Acts', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - Galatians to Thessalonians', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - Galations - Thessalonians', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - General Epistles', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - Job and Psalms', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - Old Testament History Genesis to the Silent Years', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - Pastoral Epistles', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - Proverbs to Song of Solomon', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - Proverbs, Ecclesiastes, Song of Solomon', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - Revelation', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - Romans - Corinthians', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - The Gospels', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible - The Prophetic Books', 'David W. Cloud', 'Study & Reference', 1),
  ('Mastering the English Bible- Romans to Corinthians', 'David W. Cloud', 'Study & Reference', 1),
  ('Things Hard to be Understood', 'David W. Cloud', 'Study & Reference', 1),
  ('Understanding the Bible for Yourself', 'David W. Cloud', 'Study & Reference', 1),
  ('Way of LIife Encyclopedia of the Bible and Christianity', 'David W. Cloud', 'Study & Reference', 1),
  ('Contending for the Faith', 'Dennis Corle', 'Study & Reference', 1),
  ('Slaves, Citizens, Sons - Legal Metaphors in the Epistles', 'Francis Lyall', 'Study & Reference', 1),
  ('The Minor Prophets - The Men and their Messages', 'G. Campbell Morgan', 'Study & Reference', 1),
  ('Addresses on Luke - Volume I', 'Harry A. Ironside', 'Study & Reference', 1),
  ('The Song of Solomon', 'Harry A. Ironside', 'Study & Reference', 1),
  ('The Remarkable Wisdom of Solomon', 'Henry Morris', 'Study & Reference', 1),
  ('God''s Book of Faith - Meditations from Job', 'Herbert Lockyer', 'Study & Reference', 1),
  ('The Epistle to the Hebrew', 'Homer A. Kent, Jr.', 'Study & Reference', 1),
  ('The Pastoral Epistles', 'Homer A. Kent, Jr.', 'Study & Reference', 1),
  ('The Tabernacle Priesthood and Offerings', 'I. M. Haldeman', 'Study & Reference', 1),
  ('Principles of Biblical Hermeneutics', 'J. Edwin Hartill', 'Study & Reference', 1),
  ('God''s Laws of Learning', 'J. Paul Reno', 'Study & Reference', 1),
  ('Always Rejoicing - A Verse by Verse Study of the Book of Philippians', 'John Goetsch', 'Study & Reference', 1),
  ('Walking through the Fire - A Study from First Peter on the Trial of your Faith', 'John Goetsch', 'Study & Reference', 1),
  ('What''s on your Mind - Discover the Power of Biblical Thinking', 'John Goetsch', 'Study & Reference', 1),
  ('Chronological and Background Charts of the New Testament', 'John H. Walton', 'Study & Reference', 1),
  ('Chronological and Background Charts of the Old Testament', 'John H. Walton', 'Study & Reference', 1),
  ('The Pentateuch', 'L. Thomas Holdcroft', 'Study & Reference', 1),
  ('The Baptism and Filling of the Holy Spirit', 'Lance T. Ketchum', 'Study & Reference', 1),
  ('The Baptist Encyclopedia Vol. 2', 'Louis H. Everts', 'Study & Reference', 1),
  ('The Baptist Encyclopedia Vol.1', 'Louis H. Everts', 'Study & Reference', 1),
  ('Salt & Light - A study of Biblical Metaphors for the Christian Life', 'Mark Rasmussen', 'Study & Reference', 1),
  ('The Gospel According to John Volume I', 'Oliver B. Greene', 'Study & Reference', 1),
  ('The Gospel According to John Volume II', 'Oliver B. Greene', 'Study & Reference', 1),
  ('The Gospel According to John Volume III', 'Oliver B. Greene', 'Study & Reference', 1),
  ('Build Below the Baseline - Developing the Part of Your Life that Only God Sees', 'Paul Chappell', 'Study & Reference', 1),
  ('Consider Christ - Meditate on Who Jesus is and the Strength He Gives', 'Paul Chappell', 'Study & Reference', 1),
  ('Real Church - Discovering God''s Pattern for the Local Church', 'Paul Chappell', 'Study & Reference', 1),
  ('Stand Firm in the Faith - An Exposition of II Corinthians', 'Robert G. Gromacki', 'Study & Reference', 1),
  ('The Life and Labors of Paul the Apostle', 'Robert J. Sargent', 'Study & Reference', 1),
  ('The Bible Source Book', 'Steven Swihart', 'Study & Reference', 1),
  ('Bound for Joy - Philippians - Paul''s Letter from prison', 'Stuart Briscoe', 'Study & Reference', 1),
  ('Sound Doctrine: The Theology of I and II Timothy', 'Thomas M. Strouse', 'Study & Reference', 1),
  ('For the Faith - Understanding and Practicing the Faith Once Delivered to the Saints', 'Tim Christoson', 'Study & Reference', 1),
  ('Women in Ministry', 'Vicki Sargent', 'Study & Reference', 1),
  ('The Land and the Book', 'W. M. Thomson', 'Study & Reference', 1),
  ('The Gregg Reference Manual', 'William A. Sabin', 'Study & Reference', 1),
  ('The Baptist History Series #11 - The Baptist Encyclopedia Volume 1 of 3', 'William Cathcart', 'Study & Reference', 1),
  ('The Baptist History Series #12 - The Baptist Encyclopedia Volume 2 of 3', 'William Cathcart', 'Study & Reference', 1),
  ('The Baptist History Series #13 - The Baptist Encyclopedia Volume 3 of 3', 'William Cathcart', 'Study & Reference', 1),
  ('Basics of Biblical Greek', 'William D. Mounce', 'Study & Reference', 1),
  ('Bible Atlas & Companion', '', 'Study & Reference', 1),
  ('Ecclesia - the Church', 'B.H. Carroll', 'The Church', 1),
  ('The Disciple Making Church', 'Bill Hull', 'The Church', 1),
  ('The Pastor in Prayer', 'Charles H. Spurgeon', 'The Church', 1),
  ('21 Steps to a Stronger Church for the 21st Century', 'David W. Cloud', 'The Church', 1),
  ('Feed the Flock', 'David W. Cloud', 'The Church', 1),
  ('Keys to Fruitful Church Membership', 'David W. Cloud', 'The Church', 1),
  ('Pastors Deacons and Church Members', 'David W. Cloud', 'The Church', 1),
  ('The Discipling Church: The Church That Will Stand Until Christ Comes', 'David W. Cloud', 'The Church', 1),
  ('The High Calling of God - A Look at the Bride of Christ', 'Dennis R. Wharton', 'The Church', 1),
  ('What is a Deacon?', 'Gary Jones', 'The Church', 1),
  ('The Church Attending God''s Business', 'Gerald D. Keller', 'The Church', 1),
  ('The Baptist Heritage', 'J. M. Holliday', 'The Church', 1),
  ('New Testament Church Discipline', 'James W. Crumpton', 'The Church', 1),
  ('Still a Baptist', 'Jerry D. Locke', 'The Church', 1),
  ('The Baptist Distinctive Series #8 - The Church and the Kingdom: A New Testament Study', 'Jesse B. Thomas', 'The Church', 1),
  ('A Pure Church', 'Kent Brandenburg', 'The Church', 1),
  ('The Mystical Invisible Universal "Church"', 'Les Potter', 'The Church', 1),
  ('Baptist Handbook for Church Members', 'M. L. Moser Jr.', 'The Church', 1),
  ('The Church that Jesus Loved', 'Norman H. Wells', 'The Church', 1),
  ('Corrective Church Discipline', 'Patrick H. Mell', 'The Church', 1),
  ('Church Still Works', 'Paul Chappell & Clayton Reed', 'The Church', 1),
  ('The Fortress of the Truth (The New Testament Church)', 'R. E. Milam', 'The Church', 1),
  ('Set Apart - Calling a Worldly Church to a Godly Life', 'R. Kent Hughes', 'The Church', 1),
  ('"My Church" - A Study of the New Testament Church', 'Raleigh L. Campbell', 'The Church', 1),
  ('The Church that Jesus Built', 'Roy Mason', 'The Church', 1),
  ('The Myth of the Universal, Invisible Church Theory Exploded', 'Roy Mason', 'The Church', 1),
  ('I will Build my Church', 'Thomas Strouse', 'The Church', 1),
  ('The Non-Protestant Baptists', 'WM. F. Bekgaard', 'The Church', 1),
  ('A Handbook for Minister''s Wives', 'Dorothy Kelley Patterson', 'General', 1),
  ('The Pastor''s Wife and the Church', 'Dorothy Harrison Pentecost', 'General', 1),
  ('The Private Life of the Minister''s Wife', 'Betty J. Coble', 'General', 1),
  ('Making Money from Home', 'Donna Partow', 'General', 1)
) as v(title, author, subject, copies)
where not exists (select 1 from public.library_books);
-- END library seed
-- One copy of each book (Oct 15): titles that were listed twice were counted as two.
update public.library_books set copies = 1 where copies > 1;

-- ===========================================================================
-- Review fixes (Oct 23, 2026). Safe to re-run on its own.
-- ===========================================================================
-- An Admin recording final grades for a course they don't teach: what the
-- grade formula needs (each student's status and score per assignment, and
-- attendance), so the form can suggest the real final grade. Only for the
-- course's teacher or an Admin; never shown as a grade book.
create or replace function public.course_grade_inputs(p_course text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.manages_course(p_course) then raise exception 'Only this course''s teacher or an Admin can do that.'; end if;
  return jsonb_build_object(
    'submissions', coalesce((select jsonb_agg(jsonb_build_object('assignment_id', s.assignment_id, 'student_id', s.student_id,
                      'status', s.status, 'score', s.score))
                    from submissions s join assignments a on a.id = s.assignment_id where a.course_id = p_course), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('class_date', d.class_date, 'held', d.held, 'teacher_taken', d.teacher_taken))
                    from attendance_days d where d.course_id = p_course), '[]'::jsonb),
    'marks', coalesce((select jsonb_agg(jsonb_build_object('class_date', m.class_date, 'student_id', m.student_id, 'status', m.status))
                    from attendance m where m.course_id = p_course), '[]'::jsonb));
end $$;

-- How much private material a course holds, as counts only (no content):
-- private messages, and turned-in work per assignment. Lets an Admin who
-- doesn't teach the course be warned before archiving or deleting.
create or replace function public.course_private_counts(p_course text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.manages_course(p_course) then raise exception 'Only this course''s teacher or an Admin can do that.'; end if;
  return jsonb_build_object(
    'messages', (select count(*) from messages where course_id = p_course),
    'turned_in', coalesce((select jsonb_object_agg(x.assignment_id, x.n) from (
        select s.assignment_id, count(*) as n from submissions s join assignments a on a.id = s.assignment_id
         where a.course_id = p_course and s.status in ('submitted','graded') group by s.assignment_id) x), '{}'::jsonb));
end $$;

-- Every lecture's class day as ONE object ({lesson id: date}). A single row,
-- so Supabase's 1,000-rows-per-request limit can't cut it short.
create or replace function public.visible_lesson_dates_json() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(x.lesson_id, x.class_date), '{}'::jsonb) from public.visible_lesson_dates() x
$$;

revoke execute on function public.course_grade_inputs(text) from public, anon;
revoke execute on function public.course_private_counts(text) from public, anon;
revoke execute on function public.visible_lesson_dates_json() from public, anon;
grant execute on function public.course_grade_inputs(text) to authenticated;
grant execute on function public.course_private_counts(text) to authenticated;
grant execute on function public.visible_lesson_dates_json() to authenticated;

-- BEGIN library covers (generated by tools/library/build_covers.py — 702 books)
update public.library_books b set cover = v.cover, cover_kind = v.kind
  from (values
  ('A Pocket Guide to ????', 'Answers in Genesis', 'library/covers/aff4c57e.jpg', 'made'),
  ('A Pocket Guide to Charles Darwin', 'Answers in Genesis', 'library/covers/fefa431b.jpg', 'found'),
  ('A Pocket Guide to Compromise', 'Answers in Genesis', 'library/covers/11421b04.jpg', 'made'),
  ('A Pocket Guide to Dinosaurs', 'Answers in Genesis', 'library/covers/832a9608.jpg', 'found'),
  ('A Pocket Guide to Global Warming', 'Answers in Genesis', 'library/covers/56b6f0fe.jpg', 'found'),
  ('A Pocket Guide to Social Issues', 'Answers in Genesis', 'library/covers/4215317d.jpg', 'found'),
  ('One Human Family - The Bible, Science, Race & Culture', 'Carl Wieland', 'library/covers/26a512ac.jpg', 'found'),
  ('Stones and Bones - Powerful Evidence against Evolution', 'Carl Wieland', 'library/covers/523975f6.jpg', 'found'),
  ('World Winding Down', 'Carl Wieland', 'library/covers/90c3ad7c.jpg', 'found'),
  ('Cosmos Creator and Human Destiny', 'Dave Hunt', 'library/covers/5b7c6377.jpg', 'found'),
  ('Scientists who Believe the Bible', 'David W. Cloud', 'library/covers/1b17e1c2.jpg', 'found'),
  ('Evolution: Another False Religion of Humanism', 'Dennis Helton', 'library/covers/49790228.jpg', 'made'),
  ('Is the Gap Theory Credible?', 'Dennis Helton', 'library/covers/1dbf0d30.jpg', 'made'),
  ('15 Reasons to Take Genesis as History', 'Don Batten and Jonathan Sarfati', 'library/covers/836b18d4.jpg', 'made'),
  ('Creation versus Evolution', 'Frank A. Godsoe', 'library/covers/e862cae0.jpg', 'made'),
  ('The Biblical Basis for Modern Science', 'Henry M. Morris', 'library/covers/1d02f63e.jpg', 'found'),
  ('The Twilight of Evolution', 'Henry M. Morris', 'library/covers/67b6e23a.jpg', 'found'),
  ('5 Reasons to Believe in Recent Creation', 'Henry Morris', 'library/covers/1e1e5f12.jpg', 'found'),
  ('Biblical Creationism - What Each Book of the Bible Teaches about Creation and the Flood', 'Henry Morris', 'library/covers/5489d572.jpg', 'found'),
  ('Evolution and the Modern Christian', 'Henry Morris', 'library/covers/a487cc7b.jpg', 'found'),
  ('Exploring the Evidence for Creation', 'Henry Morris', 'library/covers/cc59d710.jpg', 'found'),
  ('Many Evidences for the Infallible Christian Faith Proofs', 'Henry Morris', 'library/covers/cc2ffe19.jpg', 'made'),
  ('Men of Science Men of God - Great Scientists Who Believed the BIble', 'Henry Morris', 'library/covers/e0585762.jpg', 'found'),
  ('Science and the Bible', 'Henry Morris', 'library/covers/9ca92b10.jpg', 'found'),
  ('Scientific Creationism', 'Henry Morris', 'library/covers/91f047e3.jpg', 'found'),
  ('That you Might Believe', 'Henry Morris', 'library/covers/2b95045f.jpg', 'made'),
  ('The Biblical Basis for Modern Science', 'Henry Morris', 'library/covers/d2fbf659.jpg', 'found'),
  ('The Long War Against God', 'Henry Morris', 'library/covers/43950180.jpg', 'found'),
  ('The Remarkable Birth of Planet Earth', 'Henry Morris', 'library/covers/173abc5d.jpg', 'found'),
  ('The Twilight of Evolution', 'Henry Morris', 'library/covers/7683ebdd.jpg', 'found'),
  ('Buried Alive', 'Jack Cuozzo', 'library/covers/8886400d.jpg', 'found'),
  ('Discerning Truth - Exposing Errors in Evolutionary Arguments', 'Jason Lisle', 'library/covers/74bb6484.jpg', 'found'),
  ('Fractals - the Secret Code of Creation', 'Jason Lisle', 'library/covers/0f3c1253.jpg', 'made'),
  ('Inroduction to Logic', 'Jason Lisle', 'library/covers/f7981423.jpg', 'made'),
  ('Logic and Faith - Discerning truth in logical arguments -  A Poket Guide', 'Jason Lisle', 'library/covers/bf2f2f1a.jpg', 'made'),
  ('Taking Back Astronomy', 'Jason Lisle', 'library/covers/65897abd.jpg', 'found'),
  ('The Physics of Einstein - Black Holes, time travel, distant starlight', 'Jason Lisle', 'library/covers/9c428705.jpg', 'found'),
  ('The Solar System: GOd''s Heavenly Handiwork', 'Jason Lisle', 'library/covers/45a452fc.jpg', 'made'),
  ('The Ultimate Proof of Creation', 'Jason Lisle', 'library/covers/27d6885a.jpg', 'made'),
  ('Understanding Genesis - How to Analyze, Interpret and Defend Scripture', 'Jason Lisle', 'library/covers/dd08320f.jpg', 'found'),
  ('Why Genesis Matters', 'Jason Lisle', 'library/covers/4bbd7930.jpg', 'found'),
  ('The Genesis Flood', 'John Whitcomb and Henry Morris', 'library/covers/8c58a870.jpg', 'found'),
  ('Noah''s Ark: A Feasibility Study', 'John Woodmorappe', 'library/covers/3abfb157.jpg', 'found'),
  ('By Design - Evidence for nature''s Intelligent Designer - the God of the Bible', 'Jonathan Sarfati', 'library/covers/e1bc9854.jpg', 'found'),
  ('Refuting Compromise', 'Jonathan Sarfati', 'library/covers/372e5bdf.jpg', 'found'),
  ('Refuting Evolution', 'Jonathan Sarfati', 'library/covers/70da70de.jpg', 'found'),
  ('Refuting Evolution 2', 'Jonathan Sarfati', 'library/covers/69ab31cc.jpg', 'found'),
  ('The Answers Book', 'Ken Ham', 'library/covers/b968fecf.jpg', 'found'),
  ('The New Answers Book 1', 'Ken Ham & Bodie Hodge', 'library/covers/49618f94.jpg', 'found'),
  ('The New Answers Book 2', 'Ken Ham & Bodie Hodge', 'library/covers/939328d5.jpg', 'made'),
  ('The New Answers Book 3', 'Ken Ham & Bodie Hodge', 'library/covers/ddc4c216.jpg', 'found'),
  ('Creation Vs. Evolution - An evaluation of the theory of evolution in the light of Scripture', 'Thomas F. Heinze', 'library/covers/5feb9ecf.jpg', 'found'),
  ('Science According to Moses', 'Thomas Sharp', 'library/covers/085ddcb6.jpg', 'found'),
  ('Old Earth Creationism on Trial - The Verdict is in', 'Tim Chaffey and Jason Lisle', 'library/covers/0d4ace7f.jpg', 'made'),
  ('Did God Use Evolution', 'Werner Gitt', 'library/covers/71ad864c.jpg', 'found'),
  ('In the Beginning was Information', 'Werner Gitt', 'library/covers/d79b3837.jpg', 'found'),
  ('The Wonder of Man', 'Werner Gitt', 'library/covers/e076f756.jpg', 'found'),
  ('Time and Eternity', 'Werner Gitt', 'library/covers/2ab8b767.jpg', 'made'),
  ('Without Excuse', 'Werner Gitt', 'library/covers/014834fe.jpg', 'made'),
  ('On Guard', 'William Lane Craig', 'library/covers/9096ac11.jpg', 'found'),
  ('Reasonable Faith - Christian Truth and Apologetics', 'William Lane Craig', 'library/covers/6b894c07.jpg', 'found'),
  ('Charles Darwin - His Life and Impact - A Pocket Guide', '', 'library/covers/c28032ad.jpg', 'made'),
  ('Why Can''t I Understand My King James Bible', 'Bobby Adams', 'library/covers/067b9847.jpg', 'found'),
  ('Why I Believe the Old King James Bible', 'Bruce Lackey', 'library/covers/b99cf0d4.jpg', 'made'),
  ('Those So-Called Errors', 'Chelster Kulus', 'library/covers/eb8f1566.jpg', 'found'),
  ('If the Foundations be Destroyed', 'Chick Salliby', 'library/covers/57378550.jpg', 'made'),
  ('Defending the King James Bible', 'D. A. Waite', 'library/covers/5c4c5e89.jpg', 'found'),
  ('Does the Critical Text Contain Doctrinal Errors', 'D. A. Waite', 'library/covers/038e3870.jpg', 'made'),
  ('Foes of the King James Bible Refuted', 'D. A. Waite', 'library/covers/e4b77e06.jpg', 'found'),
  ('Fundamentalist Mis-Information on Bible Preservation', 'D. A. Waite', 'library/covers/619bea3b.jpg', 'made'),
  ('Gnosticism - The Doctrinal Foundation of the New Bible Preservation', 'D. A. Waite', 'library/covers/10560066.jpg', 'made'),
  ('Heresies of Westcott and Hort', 'D. A. Waite', 'library/covers/2ab62d71.jpg', 'made'),
  ('The Superior Foundation of the King James Bible', 'D. A. Waite', 'library/covers/5bb2dd31.jpg', 'made'),
  ('Westcott & Hort''s Greek Text & Theory Refuted', 'D. A. Waite', 'library/covers/8a7fcd2e.jpg', 'found'),
  ('Dean John Burgon''s Defense of The Authorized Version', 'David C. Bennett', 'library/covers/5612adb4.jpg', 'made'),
  ('Touch Not the Unclean Thing', 'David H. Sorenson', 'library/covers/c6efdc26.jpg', 'found'),
  ('Understanding the Battle over Bible Versions', 'David L. Brown', 'library/covers/6517b94a.jpg', 'made'),
  ('The "Impregnable Rock of Holy Scripture"', 'David Otis Fuller', 'library/covers/b62b1db5.jpg', 'made'),
  ('True or False?', 'David Otis Fuller', 'library/covers/4a4a02cc.jpg', 'found'),
  ('Which Bible?', 'David Otis Fuller', 'library/covers/737c8933.jpg', 'found'),
  ('Faith vs. the Modern Bible Versions', 'David W. Cloud', 'library/covers/fba21b48.jpg', 'found'),
  ('For Love of the Bible The Battle for the King James Version and the Received Text from 1800 to Present', 'David W. Cloud', 'library/covers/80545c34.jpg', 'found'),
  ('the Bible & Western Society', 'David W. Cloud', 'library/covers/0c6136af.jpg', 'found'),
  ('The Bible Version Question/Answer Database', 'David W. Cloud', 'library/covers/66cd66fd.jpg', 'found'),
  ('The Modern Bible Version Hall of Shame', 'David W. Cloud', 'library/covers/90822ff8.jpg', 'found'),
  ('Why we Hold to the King James Bible', 'David W. Cloud', 'library/covers/18a5d518.jpg', 'found'),
  ('Causes of Corruption of the New Testament Text', 'Dean John William Burgon', 'library/covers/a65ab83d.jpg', 'found'),
  ('Inspiration and Interpretation', 'Dean John William Burgon', 'library/covers/a7fdc61c.jpg', 'found'),
  ('The Last Twelve Verses of Mark', 'Dean John William Burgon', 'library/covers/6223e203.jpg', 'found'),
  ('The Revision Revised', 'Dean John William Burgon', 'library/covers/1f28de6d.jpg', 'found'),
  ('One Book Stands Alone - The Key to Believing the Bible', 'Douglas D. Stauffer', 'library/covers/56ca7d3c.jpg', 'found'),
  ('The King James Version Defended', 'Edward F. Hills', 'library/covers/90f44896.jpg', 'found'),
  ('Evaluating Versions of the New Testament', 'Everett W. Fowler', 'library/covers/658f60ef.jpg', 'found'),
  ('The JW Bible', 'Gerald Wright', 'library/covers/6cd989b4.jpg', 'found'),
  ('Logical Criticisms of Textual Criticism', 'Gordon H. Clark', 'library/covers/cb22f1c0.jpg', 'made'),
  ('The Attack on the Canon of Scripture', 'H. D. Williams', 'library/covers/77a5ba5c.jpg', 'made'),
  ('Trial by Fire', 'Harold Rawlings', 'library/covers/c9c06e60.jpg', 'found'),
  ('Trial by Fire - The Struggle to Get the Bible into English', 'Harold Rawlings', 'library/covers/e6d466af.jpg', 'found'),
  ('Early Manuscripts, Church Fathers and the Authorized Version', 'J. A. Moorman', 'library/covers/f9bebeeb.jpg', 'found'),
  ('21 Alleged Mistakes in the King James Bible', 'Jack A. Moorman', 'library/covers/8c5d5b94.jpg', 'made'),
  ('Forever Settled - A Survey of the Documents and History of the Bible', 'Jack A. Moorman', 'library/covers/df445884.jpg', 'found'),
  ('Missing in Modern Bibles - The Old Heresy Revived', 'Jack A. Moorman', 'library/covers/1286a028.jpg', 'found'),
  ('A Testimony Founded For Ever - THe King James Bible Defended in Faith and History', 'James H. Sightler', 'library/covers/04f8f19d.jpg', 'made'),
  ('Wescott''s New BIbles - Changing the Truth of God Into a Lie', 'James H. Sightler', 'library/covers/c1455f4e.jpg', 'made'),
  ('A Testimony Founded For Ever', 'James Sightler', 'library/covers/b07c1c65.jpg', 'made'),
  ('The Gnostics, The New Versions and The Deity of Christ', 'Jay P. Green', 'library/covers/11861503.jpg', 'found'),
  ('Kept Pure in All Age', 'Jeffrey Khoo', 'library/covers/df14eae3.jpg', 'made'),
  ('The Traditional Text of the Holy Gospels', 'John William Burgon', 'library/covers/62b3c085.jpg', 'found'),
  ('Thou Shalt Keep Them', 'Kent Brandenburg', 'library/covers/27e094af.jpg', 'found'),
  ('Baptists and the Bible', 'L. Russ Bush & Tom J. Nettles', 'library/covers/75183894.jpg', 'made'),
  ('Archaic Words and the Authorized Version', 'Laurance M. Vance', 'library/covers/bcd31266.jpg', 'found'),
  ('King James His Bible and It''s Translators', 'Laurence M. Vance', 'library/covers/8fe5fda5.jpg', 'found'),
  ('We Can Trust the Bible', 'Lehman Strauss', 'library/covers/b61aac51.jpg', 'made'),
  ('The Word of God in English', 'Leland Ryken', 'library/covers/8a9389d2.jpg', 'found'),
  ('Ready Answers', 'Phil Stringer', 'library/covers/538c8fdf.jpg', 'made'),
  ('Landmarks of English Bible: Manuscript Evidence', 'Robert J. Sargent', 'library/covers/517d5e39.jpg', 'made'),
  ('The Interpreter''s Bible', 'Robert L. Sumner', 'library/covers/85c630c1.jpg', 'made'),
  ('A Practical Theology of Bible Translating', 'Steve Combs', 'library/covers/7f83a942.jpg', 'made'),
  ('So Shall My Word Be', 'Steve Combs', 'library/covers/025996e6.jpg', 'made'),
  ('The Lord God Hath Spoken', 'Thomas M. Strouse', 'library/covers/8aa9343f.jpg', 'made'),
  ('From the Mind of God to the Mind of Man', 'Various', 'library/covers/3505e73e.jpg', 'found'),
  ('Inspiration of the Bible', 'B.H. Carroll', 'library/covers/c30a280d.jpg', 'made'),
  ('4,114 Definitions from the Defined King James Bible', 'D.A. Waite', 'library/covers/ac9b429c.jpg', 'made'),
  ('The Case for the King James Bible', 'D.A. Waite', 'library/covers/ef0c788d.jpg', 'found'),
  ('The Lie that changed the Modern World', 'H. D. Williams', 'library/covers/8f6242aa.jpg', 'made'),
  ('The Miracle of Biblical Inspiration', 'H. D. Williams', 'library/covers/559c673d.jpg', 'made'),
  ('Lively Oracles - The Inspired Bible in the Hearts of Believers', 'James H. Sightler', 'library/covers/15c165e1.jpg', 'made'),
  ('In Defense of the Textus Receptus', 'Jim Taylor', 'library/covers/c14dc9e2.jpg', 'found'),
  ('Majestic Legacy', 'Phil Stringer', 'library/covers/130843c6.jpg', 'made'),
  ('Melody''s Kooky Cover-Up', 'Ernie & Debby Rettino', 'library/covers/398453b2.jpg', 'made'),
  ('Psalty in Alaska', 'Ernie & Debby Rettino', 'library/covers/ee8bda97.jpg', 'made'),
  ('Psalty in Egypt', 'Ernie & Debby Rettino', 'library/covers/535fbca3.jpg', 'found'),
  ('Psalty in the South Pacific', 'Ernie & Debby Rettino', 'library/covers/00098e0f.jpg', 'found'),
  ('Psalty in the Soviet Circus', 'Ernie & Debby Rettino', 'library/covers/e58cd970.jpg', 'found'),
  ('Spotlight on Charity', 'Ernie & Debby Rettino', 'library/covers/a5f7c819.jpg', 'made'),
  ('Psalty in Australia', 'Ernie& Debby Rettino', 'library/covers/643edfa2.jpg', 'found'),
  ('Barnaby Goes Wild', 'Gary Richmond', 'library/covers/6503fb28.jpg', 'found'),
  ('Howard the Horrible Gets Even', 'Gary Richmond', 'library/covers/32af8719.jpg', 'found'),
  ('Life is a Zoo', 'Gary Richmond', 'library/covers/06731560.jpg', 'found'),
  ('The Forgotten Friend', 'Gary Richmond', 'library/covers/c201cd4a.jpg', 'made'),
  ('The Prodigal Wolf', 'Gary Richmond', 'library/covers/194eb97a.jpg', 'found'),
  ('A Christian Perspective of Halloween, Easter, Christmas in the Light of God''s Word', 'Allegra McBirney', 'library/covers/dc50efe2.jpg', 'made'),
  ('Ethics - An Early American Handbook', 'Benjamin B. Comegys', 'library/covers/22eb87b8.jpg', 'made'),
  ('What the Bible Teaches about Drinking Wine', 'Bruce Lackey', 'library/covers/d1c3b82e.jpg', 'made'),
  ('Faith is the Victory', 'Buell H. Kazee', 'library/covers/a9507169.jpg', 'found'),
  ('The Right to Live; The Right to Die', 'C. Everett Koop', 'library/covers/cb7ce7c8.jpg', 'found'),
  ('Mission: Motherhood', 'Cathy Corle', 'library/covers/50261d9b.jpg', 'made'),
  ('The Bible and its Wines', 'Charles Ewing', 'library/covers/778535c6.jpg', 'found'),
  ('Marriage, Divorce and Remarriage', 'Charles J. Kriessman', 'library/covers/53ad47e5.jpg', 'made'),
  ('The Church', 'Chester Tulga', 'library/covers/d077bbad.jpg', 'made'),
  ('Should Christians Drink', 'Curtis Hutson', 'library/covers/4c8d1cd0.jpg', 'found'),
  ('Spiritual Depression', 'D. Martyn Lloyd-Jones', 'library/covers/e81bf560.jpg', 'found'),
  ('Making Marriage Melodious', 'D.A. Waite', 'library/covers/5c0cf437.jpg', 'made'),
  ('Bible Separation: its Doctrine and Practice', 'David W. Cloud', 'library/covers/a9212eca.jpg', 'found'),
  ('Child Discipline', 'David W. Cloud', 'library/covers/2608c3a0.jpg', 'found'),
  ('Dressing for the Lord', 'David W. Cloud', 'library/covers/946f02a4.jpg', 'found'),
  ('Effectual Prayer in Perilous Times', 'David W. Cloud', 'library/covers/12a8296e.jpg', 'found'),
  ('Fantasy Dangers', 'David W. Cloud', 'library/covers/f865589e.jpg', 'found'),
  ('Holiness: Pitfalls, Struggles & Victory', 'David W. Cloud', 'library/covers/1bcaf318.jpg', 'made'),
  ('Keeping the Kids in the Social Media Age', 'David W. Cloud', 'library/covers/ce01021b.jpg', 'found'),
  ('Knowing God''s Will', 'David W. Cloud', 'library/covers/e6492621.jpg', 'found'),
  ('One Year Discipleship Course', 'David W. Cloud', 'library/covers/b44f9973.jpg', 'made'),
  ('Spiritual Safety in the Facebook Age', 'David W. Cloud', 'library/covers/276be0a2.jpg', 'found'),
  ('The Bible, Diet & Alternative Health Care', 'David W. Cloud', 'library/covers/7c06897f.jpg', 'found'),
  ('The Collapse of Separatism Among Fundamental Baptists', 'David W. Cloud', 'library/covers/eac6df8f.jpg', 'found'),
  ('The Effectual Bible Student', 'David W. Cloud', 'library/covers/bc225e45.jpg', 'found'),
  ('Woman and her Service to God', 'David W. Cloud', 'library/covers/1e1debc0.jpg', 'found'),
  ('Created to be His Help Meet', 'Debi Pearl', 'library/covers/106cafc2.jpg', 'found'),
  ('Preparing to be a Help Meet', 'Debi Pearl', 'library/covers/13611eb7.jpg', 'found'),
  ('Happily Married - Ladies BIble Study and Workbook', 'Debi Pryde', 'library/covers/379b10c0.jpg', 'made'),
  ('Secrets of a Happy Heart - Titus 2 Series Book 1', 'Debi Pryde', 'library/covers/2d9b7782.jpg', 'made'),
  ('Elements of Godly Character Vol. 2', 'Dennis Corle', 'library/covers/de420bcb.jpg', 'made'),
  ('Elements of Godly Character Volume 1', 'Dennis Corle', 'library/covers/ee5e5e6d.jpg', 'made'),
  ('The Crucified Life', 'Dennis Corle', 'library/covers/8596e5a9.jpg', 'made'),
  ('The Discipline of Prayer', 'Dennis Corle', 'library/covers/582338f7.jpg', 'made'),
  ('Weathering the Storms of Life Volume 2', 'Dennis Corle', 'library/covers/f1d6e4ea.jpg', 'made'),
  ('Christ or Therapy For Depression and Life''s Troubles', 'E.S. Williams', 'library/covers/64d20509.jpg', 'found'),
  ('The Great Divorce Controversy', 'E.S. Williams', 'library/covers/1998c99e.jpg', 'found'),
  ('"Be Ye Holy" - The Call to Christian Separation', 'Fred Moritz', 'library/covers/93e5e8d5.jpg', 'found'),
  ('The 5 Love Languages', 'Gary Chapman', 'library/covers/e32f9edc.jpg', 'made'),
  ('Holiness - The False and the True', 'Harry A. Ironside', 'library/covers/7174c0a0.jpg', 'found'),
  ('The Gospel and Mental illness', 'Heath Lambert', 'library/covers/da350d50.jpg', 'made'),
  ('How to Cope with Your Parents In the Generation Gap', 'Hugh F. Pyle', 'library/covers/e334daa0.jpg', 'made'),
  ('How to Live Happily Ever After', 'Hugh F. Pyle', 'library/covers/6dc41f88.jpg', 'found'),
  ('Keeping the Honey in the Honeymoon', 'Hugh F. Pyle', 'library/covers/79b9b4db.jpg', 'found'),
  ('Skimpy Skirts and Hippy Hair', 'Hugh F. Pyle', 'library/covers/ee1f2dcc.jpg', 'made'),
  ('Causes and Cures of Poverty', 'J. Paul Reno', 'library/covers/d6a00fbb.jpg', 'found'),
  ('Framework for Families', 'J. Paul Reno', 'library/covers/23c5aef1.jpg', 'made'),
  ('Christian Modesty and the Public Undressing of America', 'Jeff Pollard', 'library/covers/e19b62f7.jpg', 'found'),
  ('The Twenty One Tenents of Biblical Masculinity', 'Jerry Ross', 'library/covers/1a982923.jpg', 'made'),
  ('How to Win Over Worry - A Practical Formula for Successful Living', 'John Haggai', 'library/covers/a0ce5c49.jpg', 'found'),
  ('Charity and Its Fruits', 'Jonathan Edwards', 'library/covers/ec68d525.jpg', 'found'),
  ('Disciplines of a Godly Man', 'Kent Hughes', 'library/covers/ed84e218.jpg', 'found'),
  ('Christian Maturity', 'Lester Hutson', 'library/covers/fe585400.jpg', 'found'),
  ('Attitudes of a Transformed Heart', 'Martha Peace', 'library/covers/89e507b9.jpg', 'found'),
  ('Damsels in Distress - Biblical Solutions for Problems Women Face', 'Martha Peace', 'library/covers/50f29c9f.jpg', 'found'),
  ('Precious Truths in Practice', 'Martha Peace', 'library/covers/1084dfbf.jpg', 'made'),
  ('Psychologized Man - A Biblical Perspective', 'Martha Peace', 'library/covers/12b5004f.jpg', 'made'),
  ('Modesty - More than a change of Clothes', 'Martha Peace & Kent Keller', 'library/covers/09cab888.jpg', 'found'),
  ('To Train Up a Child', 'Michael & Debi Pearl', 'library/covers/ec6f41a8.jpg', 'found'),
  ('Hurting and Healing', 'Patti Williams', 'library/covers/157186d0.jpg', 'found'),
  ('A Maze of Grace - Claiming God''s grace during a season of Suffering', 'Paul Chappell', 'library/covers/7a9e1946.jpg', 'found'),
  ('Abiding in Christ', 'Paul Chappell', 'library/covers/6dec36c3.jpg', 'found'),
  ('All Things Through Christ', 'Paul Chappell', 'library/covers/b8f843d9.jpg', 'made'),
  ('Discerning Alcohol', 'Paul Chappell', 'library/covers/efb6d009.jpg', 'found'),
  ('First Steps for New Christians', 'Paul Chappell', 'library/covers/bbd032bf.jpg', 'found'),
  ('Grace for Godly Living', 'Paul Chappell', 'library/covers/c51cf024.jpg', 'found'),
  ('I''m Not Ok', 'Paul Chappell', 'library/covers/61971c1f.jpg', 'made'),
  ('Living on God''s Economy', 'Paul Chappell', 'library/covers/6dbdf541.jpg', 'found'),
  ('The Burden Bearer', 'Paul Chappell', 'library/covers/c1e11789.jpg', 'made'),
  ('When a Nation Turns its Back to God', 'Paul Chappell', 'library/covers/9c130b7f.jpg', 'made'),
  ('Your Pastor and You', 'Paul Chappell & Cary Schmidt', 'library/covers/2a344fe6.jpg', 'made'),
  ('Christian Child-Rearing and Personality Development', 'Paul D. Meier', 'library/covers/1d7fb50a.jpg', 'found'),
  ('Marriage', 'Paul David Tripp', 'library/covers/243cb559.jpg', 'found'),
  ('Parenting', 'Paul David Tripp', 'library/covers/8ef9f0eb.jpg', 'found'),
  ('Teens and Sex', 'Paul David Tripp', 'library/covers/9d91654d.jpg', 'found'),
  ('War of Words', 'Paul David Tripp', 'library/covers/2e49ba8b.jpg', 'found'),
  ('The ABCs of Christian Growth', 'Robert J. Sargent', 'library/covers/cf9bcb85.jpg', 'made'),
  ('God''s Wisdom for Marriage & the Home', 'Scott Markle', 'library/covers/72659fa3.jpg', 'made'),
  ('In the World Not of the World', 'Scott Markle', 'library/covers/e1b5f6c4.jpg', 'made'),
  ('The Twenty One Tenents of Biblical Masculinity', 'Scott Markle', 'library/covers/2ba0786b.jpg', 'made'),
  ('Thou Shalt Do These Things', 'Scott Markle', 'library/covers/6dbd1e3e.jpg', 'made'),
  ('The Exemplary Husband', 'Stuart Scott', 'library/covers/cda8a06d.jpg', 'found'),
  ('Shepherding a Child''s Heart', 'Tedd Tripp', 'library/covers/9c300156.jpg', 'found'),
  ('Teaching Obedience', 'Walt Brock', 'library/covers/360ea5e6.jpg', 'made'),
  ('Formula for Family Unity', 'Walter and Trudy Fremont', 'library/covers/d3f54815.jpg', 'found'),
  ('Bible Wines or Laws of Fermentations and Wines of the Ancients', 'William Patton', 'library/covers/304b8bdb.jpg', 'found'),
  ('The Treasury of Scripture Knowledge', 'Assorted Contributing Authors', 'library/covers/eee3e487.jpg', 'made'),
  ('Believer''s Bible Dictionary', 'David W. Cloud', 'library/covers/650f81fc.jpg', 'found'),
  ('Way of Life Commentary Series - Corinthian Epistles', 'David W. Cloud', 'library/covers/700ff101.jpg', 'found'),
  ('Way of Life Commentary Series - Daniel', 'David W. Cloud', 'library/covers/41124ae4.jpg', 'found'),
  ('Way of LIfe Commentary Series - Ezekiel', 'David W. Cloud', 'library/covers/3cf6ac30.jpg', 'found'),
  ('Way of Life Commentary Series - Galatians', 'David W. Cloud', 'library/covers/07e69443.jpg', 'found'),
  ('Way of Life Commentary Series - General Epistles', 'David W. Cloud', 'library/covers/17025d50.jpg', 'found'),
  ('Way of LIfe Commentary Series - Genesis-Deuteronomy Vol. 1 of 2', 'David W. Cloud', 'library/covers/9616be1e.jpg', 'found'),
  ('Way of LIfe Commentary Series - Genesis-Deuteronomy Vol. 2 of 2', 'David W. Cloud', 'library/covers/a2afb39f.jpg', 'found'),
  ('Way of Life Commentary Series - Hebrews', 'David W. Cloud', 'library/covers/75660651.jpg', 'found'),
  ('Way of Life Commentary Series - Isaiah', 'David W. Cloud', 'library/covers/8eda42ca.jpg', 'found'),
  ('Way of LIfe Commentary Series - Jeremiah', 'David W. Cloud', 'library/covers/93383e12.jpg', 'found'),
  ('Way of Life Commentary Series - Joshua-Chronicles', 'David W. Cloud', 'library/covers/522bce4a.jpg', 'found'),
  ('Way of Life Commentary Series - Minor Prophets', 'David W. Cloud', 'library/covers/9a03c3f9.jpg', 'found'),
  ('Way of Life Commentary Series - Pastoral Epistles', 'David W. Cloud', 'library/covers/d4db6d8a.jpg', 'found'),
  ('Way of Life Commentary Series - Paul''s Prison Epistles', 'David W. Cloud', 'library/covers/9337cbdf.jpg', 'found'),
  ('Way of Life Commentary Series - Proverbs', 'David W. Cloud', 'library/covers/dedcf71c.jpg', 'found'),
  ('Way of Life Commentary Series - Psalms Vol 1 of 2', 'David W. Cloud', 'library/covers/43869594.jpg', 'found'),
  ('Way of Life Commentary Series - Psalms Vol 2 of 2', 'David W. Cloud', 'library/covers/501f8b15.jpg', 'found'),
  ('Way of Life Commentary Series - Revelation', 'David W. Cloud', 'library/covers/248156d8.jpg', 'found'),
  ('Way of Life Commentary Series - Romans', 'David W. Cloud', 'library/covers/ab05dd8d.jpg', 'found'),
  ('Way of Life Commentary Series - The Thessalonian Epistles', 'David W. Cloud', 'library/covers/54313894.jpg', 'found'),
  ('The Bible Promise Book', 'Barbour Publishing', 'library/covers/3772c149.jpg', 'found'),
  ('Boyhood and Beyond - Practical Wisdom for Becomign a Man', 'Bob Schultz', 'library/covers/68be84c3.jpg', 'found'),
  ('Boyhood and Beyond - Practical Wisdom for Becoming a Man', 'Bob Schultz', 'library/covers/1e82b515.jpg', 'found'),
  ('Created for Work', 'Bob Schultz', 'library/covers/0fb8784e.jpg', 'found'),
  ('Practical Happiness', 'Bob Schultz', 'library/covers/72eff4ea.jpg', 'found'),
  ('To the Golden Shore', 'Courtney Anderson', 'library/covers/06191985.jpg', 'found'),
  ('William Tyndale - A Biography', 'David Daniell', 'library/covers/6b51bf88.jpg', 'found'),
  ('This Day in Baptist History II', 'David L. Cummins & E. Wayne Thompson', 'library/covers/9dd5ac77.jpg', 'found'),
  ('Forward in the Face of Fear', 'Edgar Feghaly', 'library/covers/cf8cbef0.jpg', 'found'),
  ('A New View from the Zoo', 'Gary Richmond', 'library/covers/5b009768.jpg', 'found'),
  ('A Scary Night At the Zoo', 'Gary Richmond', 'library/covers/27c7e604.jpg', 'made'),
  ('A View from the Zoo', 'Gary Richmond', 'library/covers/414d7a68.jpg', 'found'),
  ('All God''s Creatures - Spiritual Lessons from the Animals of the Bible', 'Gary Richmond', 'library/covers/100456b5.jpg', 'made'),
  ('The Heavens Declare the GLory of God', 'Henry Morris', 'library/covers/31155f12.jpg', 'made'),
  ('Character Sketches Volume 2', 'Institute in Basic Youth Conflicts', 'library/covers/bd7eccf3.jpg', 'found'),
  ('Character Sketches Volume 3', 'Institute in Basic Youth Conflicts', 'library/covers/31be0552.jpg', 'found'),
  ('The Little Baptist', 'J.M. Martin', 'library/covers/48be9126.jpg', 'found'),
  ('Missionary Patriarch - The True Story of John G. Paton', 'James Paton', 'library/covers/27bdf1e6.jpg', 'found'),
  ('Grace Abounding - The Spiritual Autobiography of John Bunyan', 'John Bunyan', 'library/covers/f901a76d.jpg', 'found'),
  ('The Narrow Gate and the Heavenly Footman', 'John Bunyan', 'library/covers/7f2cacaf.jpg', 'found'),
  ('The Pilgrim''s Progress', 'John Bunyan', 'library/covers/495dc5d2.jpg', 'found'),
  ('The Gold Mine', 'Lee Roberson', 'library/covers/574f008c.jpg', 'found'),
  ('A Daily Word', 'Paul Chappell', 'library/covers/ffb70735.jpg', 'found'),
  ('A Word to the Wise - Practical Advice from the Book of Proverbs', 'Paul Chappell', 'library/covers/aa042318.jpg', 'made'),
  ('Continue - A Biblical Journey Through Personal Discipleship', 'Paul Chappell', 'library/covers/19f950fc.jpg', 'made'),
  ('Disciple - 365 Devotional Readings for every day of the Year', 'Paul Chappell', 'library/covers/3c69733c.jpg', 'found'),
  ('Rooted in Christ - 366 Scriptural Devotions for Growing Christians', 'Paul Chappell', 'library/covers/ced7f5c8.jpg', 'made'),
  ('The Gospel In You', 'Paul Chappell', 'library/covers/d5dfe0ce.jpg', 'made'),
  ('Trust and Obey', 'Paul Chappell', 'library/covers/20d1ea9d.jpg', 'made'),
  ('Halle Takes a Stand', 'Paul David Tripp', 'library/covers/02dabe94.jpg', 'made'),
  ('Baptist Heroes of the Faith Vol. 1 - John Clarke', 'Ted Alexander', 'library/covers/8a85dbf6.jpg', 'made'),
  ('Baptist Heroes of the Faith Vol. 10 - Isaac McCoy', 'Ted Alexander', 'library/covers/7f8c6b87.jpg', 'made'),
  ('Baptist Heroes of the Faith Vol. 2 - Obadiah Holmes', 'Ted Alexander', 'library/covers/23967548.jpg', 'made'),
  ('Baptist Heroes of the Faith Vol. 3 - Shobal Stearns', 'Ted Alexander', 'library/covers/4a9f0a38.jpg', 'made'),
  ('Baptist Heroes of the Faith Vol. 4 - John Leland', 'Ted Alexander', 'library/covers/ed548f29.jpg', 'made'),
  ('Baptist Heroes of the Faith Vol. 5 - Samuel Harriss', 'Ted Alexander', 'library/covers/db536d96.jpg', 'made'),
  ('Baptist Heroes of the Faith Vol. 6 - William Carey', 'Ted Alexander', 'library/covers/c64c0e3d.jpg', 'made'),
  ('Baptist Heroes of the Faith Vol. 7 - John Gano', 'Ted Alexander', 'library/covers/8107f063.jpg', 'made'),
  ('Baptist Heroes of the Faith Vol. 8 - John Taylor', 'Ted Alexander', 'library/covers/d740002c.jpg', 'made'),
  ('Baptist Heroes of the Faith Vol. 9 - James Ireland', 'Ted Alexander', 'library/covers/ac249a00.jpg', 'made'),
  ('Songs of Glory', 'William Reynolds', 'library/covers/71a78363.jpg', 'found'),
  ('The Obedience of a Christian Man', 'William Tyndale', 'library/covers/9d6c003e.jpg', 'found'),
  ('Baptists and Their Doctrines', 'B.H. Carroll', 'library/covers/47c8c279.jpg', 'found'),
  ('The Holy Spirit', 'B.H. Carroll', 'library/covers/36e14fb1.jpg', 'made'),
  ('Prophecy in Context', 'Bob Shelton', 'library/covers/b07bcfae.jpg', 'found'),
  ('The Case for the Atonement of Christ', 'Chester E. Tulga', 'library/covers/47fc7d4c.jpg', 'made'),
  ('What the Bible Teaches about Biblical Separation', 'D.A. Waite', 'library/covers/1ed6c3ba.jpg', 'made'),
  ('The Bible''s Proof', 'David W. Cloud', 'library/covers/463b92df.jpg', 'found'),
  ('The Doctrine Which Ye have Learned', 'David W. Cloud', 'library/covers/5681925f.jpg', 'found'),
  ('Biblical Separation', 'Ernest Pickering', 'library/covers/6c0f8ca5.jpg', 'found'),
  ('Emblems of the Holy Spirit', 'F. E. Marsh', 'library/covers/660c3084.jpg', 'found'),
  ('Contending for the Faith', 'Fred Moritz', 'library/covers/d18c736d.jpg', 'found'),
  ('A Handbook of Christian Truth', 'Harold Lindsell and Charles J. Woodbridge', 'library/covers/34bb510c.jpg', 'found'),
  ('Basic Baptist Beliefs - An Exposition of Key Biblical Doctrines', 'Harold Rawlings', 'library/covers/394b9897.jpg', 'made'),
  ('The Bible Has the Answer', 'Henry M. Morris', 'library/covers/6279d075.jpg', 'found'),
  ('Old Landmarkism - What is it?', 'J. R. Graves', 'library/covers/4b78cc99.jpg', 'found'),
  ('Repentance', 'J. Thornton', 'library/covers/078a3599.jpg', 'made'),
  ('What we Believe and Why Volume 1', 'Lester Hutson', 'library/covers/463b8b56.jpg', 'found'),
  ('Baptist Doctrine in One Year', 'M. L. Moser Jr.', 'library/covers/5660da3e.jpg', 'made'),
  ('My Lord Delayeth His Coming - An Exposition of the Parable of the Unfaithful Steward in Luke 12', 'M. R. DeHann', 'library/covers/be256109.jpg', 'made'),
  ('What is a Biblical Fundamentalist?', 'Paul Chappell', 'library/covers/36635b8e.jpg', 'found'),
  ('Elder Rule in a Baptist Church?', 'Robert J. Sargent', 'library/covers/b4502f21.jpg', 'made'),
  ('Landmarks of Baptist Doctrine Book 1', 'Robert J. Sargent', 'library/covers/2ddc5781.jpg', 'made'),
  ('Landmarks of Baptist Doctrine Book 4', 'Robert J. Sargent', 'library/covers/96db7cc4.jpg', 'made'),
  ('Forever His', 'Ron Tobin', 'library/covers/50747aba.jpg', 'made'),
  ('Faith and the Faith', 'T. T. Eaton', 'library/covers/ff2d95e7.jpg', 'found'),
  ('The Virgin Birth of Jesus - Five Radio Sermons', 'M. R. DeHann', 'library/covers/6f749306.jpg', 'made'),
  ('Pilgrimage from Rome', 'Bartholomew F. Brewer', 'library/covers/d121b1e7.jpg', 'found'),
  ('Indigenous Churches', 'Bob Green', 'library/covers/9348300a.jpg', 'made'),
  ('Powerful Evangelism for the Powerless', 'C. John Miller', 'library/covers/13e3de92.jpg', 'found'),
  ('Repentance and the 20th Century Man', 'C. John Miller', 'library/covers/5f6a084a.jpg', 'made'),
  ('How to Lead a Child to Christ', 'Daniel H. Smith', 'library/covers/2654837e.jpg', 'found'),
  ('The Drift in Baptist Missions, Churches and Schools', 'David Bennett', 'library/covers/4f602fae.jpg', 'made'),
  ('Ideas for Evangelism', 'David Cloud & Linda Cloud', 'library/covers/3c143124.jpg', 'found'),
  ('Does Salvation Make a Difference', 'David W. Cloud', 'library/covers/eece2030.jpg', 'found'),
  ('Repentance & Soul-Winning', 'David W. Cloud', 'library/covers/244cab41.jpg', 'found'),
  ('Sowing and Reaping - A course in Evangelism', 'David W. Cloud', 'library/covers/d78eb837.jpg', 'made'),
  ('The Seeker''s Bible Study', 'David W. Cloud', 'library/covers/434c8757.jpg', 'found'),
  ('Salvation Bible Basics', 'Doug Hammett', 'library/covers/70407351.jpg', 'made'),
  ('Freedom''s Ring - Life, Liberty and the Pursuit of Salvation', 'Douglas D. Stauffer', 'library/covers/dcac15cd.jpg', 'found'),
  ('Sending Forth Laborers', 'Dwight Tomlinson & Paul Chappell', 'library/covers/28734434.jpg', 'made'),
  ('Asahel Nettleton Revival Preacher', 'E. A. Johnston', 'library/covers/272a16f1.jpg', 'made'),
  ('Except Ye Repent', 'Harry A. Ironside', 'library/covers/09805631.jpg', 'found'),
  ('The Great Love of God - Encountering God''s Heart for a Hostile WO=orld', 'Heath Lambert', 'library/covers/28437c4e.jpg', 'made'),
  ('Marks of Eternal Life', 'J. Paul Reno', 'library/covers/ae34771e.jpg', 'made'),
  ('Evangelism Made Simple', 'Jim Scudder & Phil Stringer', 'library/covers/c6dffc1d.jpg', 'made'),
  ('Johnathan Edwards on Revival', 'Jonathan Edwards', 'library/covers/06618602.jpg', 'made'),
  ('Religious Affections', 'Jonathon Edwards', 'library/covers/14f7383a.jpg', 'found'),
  ('Learning to Lead - Converting the Heart', 'Lance T. Ketchum', 'library/covers/835acdb8.jpg', 'found'),
  ('The Lost Art of Disciple Making', 'LeRoy Eims', 'library/covers/2bd5530c.jpg', 'found'),
  ('Basic Bible Truths', 'Lester Hutson', 'library/covers/9b093c2e.jpg', 'made'),
  ('True Evangelism - Winning Souls by Prayer', 'Lewis Sperry Chafer', 'library/covers/6207e9a4.jpg', 'found'),
  ('The Gospel and Personal Evangelism', 'Mark Dever', 'library/covers/ccad4406.jpg', 'found'),
  ('The Indigenous Church', 'Melvin L. Hodges', 'library/covers/fe9d2908.jpg', 'found'),
  ('Out of Commission', 'Paul Chappell', 'library/covers/6a687367.jpg', 'found'),
  ('Take it Personally', 'Paul Chappell', 'library/covers/de5af3ae.jpg', 'found'),
  ('To Seek and to Save - Winning and Building Committed Followers of Jesus Christ', 'Paul Chappell', 'library/covers/573a37b0.jpg', 'found'),
  ('The Church that will be Left Behind', 'R. L. Hymers, Jr', 'library/covers/d771b4e7.jpg', 'found'),
  ('Preaching to a Dying Nation', 'R. L. Hymers, Jr.', 'library/covers/6a1239af.jpg', 'found'),
  ('The Great Falling Away plus Old Time Pastoral Counselling', 'R. L. Hymers, Jr.', 'library/covers/49046e88.jpg', 'made'),
  ('Visitation in Action', 'R.O. Sanborn', 'library/covers/5ddc5185.jpg', 'made'),
  ('Hell''s Best Kept Secret', 'Ray Comfort', 'library/covers/d31bfc67.jpg', 'found'),
  ('Issues in Missiology - Volume 1A - Persecution', 'Robert D. Patton', 'library/covers/e594aeb3.jpg', 'found'),
  ('Issues in MIssiology - Volume 3 - Translation Issues', 'Robert D. Patton', 'library/covers/ee9fed5c.jpg', 'made'),
  ('Issues in Missiology - Volume 4 - Worldview and World Religions', 'Robert D. Patton', 'library/covers/a1cb2c60.jpg', 'made'),
  ('Issues in Missiology - Volume 5 - The Making of a Missionary', 'Robert D. Patton', 'library/covers/76c724c9.jpg', 'made'),
  ('Issues in Missiology - Volumes 2A & 2B - Spiritual Warfare and Spiritual Life of the Missionary', 'Robert D. Patton', 'library/covers/001d4a39.jpg', 'made'),
  ('The Masterplan of Evangelism', 'Robert E. Coleman', 'library/covers/568522f6.jpg', 'made'),
  ('Biblical Missions', 'Roy Dearmore', 'library/covers/b5560e76.jpg', 'made'),
  ('The Soul Winner', 'Spurgeon', 'library/covers/6e8d3f36.jpg', 'found'),
  ('Defense of the Faith', 'Albert Garner', 'library/covers/44872d61.jpg', 'made'),
  ('17 Reasons why I left the Tongues Movement', 'Alfred H. Pohl', 'library/covers/382317c1.jpg', 'made'),
  ('Mormonism', 'Anthony Hoekema', 'library/covers/446a5310.jpg', 'found'),
  ('Calvinism - None Dare Call it Heresy', 'Bob Kirkland', 'library/covers/74c8e93b.jpg', 'found'),
  ('Beyond Seduction - A Return to Biblical Christianity', 'Dave Hunt', 'library/covers/b9217e06.jpg', 'found'),
  ('Occult Invasion', 'Dave Hunt', 'library/covers/80eb7562.jpg', 'found'),
  ('What Love is This? - Calvanism Misrepresentation of God', 'Dave Hunt', 'library/covers/830ebca2.jpg', 'found'),
  ('America The Sorcerer''s New Apprentice - The Rise of New Age Shamanism', 'Dave Hunt & T.A. McMahon', 'library/covers/004666b6.jpg', 'found'),
  ('The Seduction of Christianity - Spiritual Discernment in the Last Days', 'Dave Hunt & T.A. McMahon', 'library/covers/17f619a5.jpg', 'found'),
  ('Avoiding the Snare of Seventh Day Adventism', 'David W. Cloud', 'library/covers/5fdd032c.jpg', 'found'),
  ('C.S. Lewis and Evangelicals Today Issues Facing the Churches', 'David W. Cloud', 'library/covers/a22a240a.jpg', 'found'),
  ('Defense of the Faith', 'David W. Cloud', 'library/covers/b3d5996a.jpg', 'found'),
  ('Evangelicals & Contemplative Prayer', 'David W. Cloud', 'library/covers/fcabae60.jpg', 'found'),
  ('New Evangelicalism It''s History, Characteristics and Fruit', 'David W. Cloud', 'library/covers/dfa0b702.jpg', 'found'),
  ('The Bible and Islam', 'David W. Cloud', 'library/covers/2303584a.jpg', 'found'),
  ('The Calvinism Debate', 'David W. Cloud', 'library/covers/ce255f8a.jpg', 'found'),
  ('The Emerging Church is Coming', 'David W. Cloud', 'library/covers/0144c5b5.jpg', 'found'),
  ('The Hyles Effect', 'David W. Cloud', 'library/covers/89c238bd.jpg', 'found'),
  ('The Judge Not Heresy Is it Legalism to Judge Sin and Error', 'David W. Cloud', 'library/covers/1729f119.jpg', 'found'),
  ('The Pentecostal-Charismatic Movements: The History & the Error', 'David W. Cloud', 'library/covers/717b1e5a.jpg', 'found'),
  ('What about Steven Anderson?', 'David W. Cloud', 'library/covers/d466d7d9.jpg', 'found'),
  ('What is the Emerging Church?', 'David W. Cloud', 'library/covers/d171e503.jpg', 'found'),
  ('The New Calvinists', 'E. S. Williams', 'library/covers/f7003955.jpg', 'found'),
  ('The God Makers', 'Ed Decker & Dave Hunt', 'library/covers/4cfbc64a.jpg', 'found'),
  ('Islam Made Easy - A Christian Guide to Understanding Islam', 'Edgar M. Feghaly', 'library/covers/18ba6063.jpg', 'made'),
  ('Charismatic Confusion', 'Ernest Pickering', 'library/covers/8a48cc55.jpg', 'found'),
  ('Christian Hedonism? A biblical examination of John Piper''s teachings', 'ES Williams', 'library/covers/aff50ffb.jpg', 'found'),
  ('Ecumenism: Another Gospel', 'ES Williams', 'library/covers/dff04a99.jpg', 'found'),
  ('Handbook of Denominations in the United States', 'Frank S. Mead', 'library/covers/cd600d5e.jpg', 'found'),
  ('The Dark Side of Calvinism', 'George Bryson', 'library/covers/12b77b49.jpg', 'found'),
  ('Is Mormonism Christian - Mormon Doctrine Compared with Biblical Christianity', 'Gordon H. Fraser', 'library/covers/ab3e3e0f.jpg', 'found'),
  ('Confronting the Cults', 'Gordon R. Lewis', 'library/covers/706e8af4.jpg', 'found'),
  ('Spirit Works - Charismatic Practices and the Bible', 'Jerry Vines', 'library/covers/4eff8359.jpg', 'made'),
  ('Fast Facts on Islam - What you Need to Know Now', 'John Ankerberg & John Weldon', 'library/covers/b1d0901a.jpg', 'found'),
  ('Contemporary Compromise', 'John Goetsch', 'library/covers/929ab53d.jpg', 'made'),
  ('Has Mormonism Changed?', 'John L. Smith', 'library/covers/8ee700e8.jpg', 'made'),
  ('Hope or Despair', 'John L. Smith', 'library/covers/7fe790f1.jpg', 'made'),
  ('I Visited the Temple', 'John L. Smith', 'library/covers/1cbad707.jpg', 'made'),
  ('Thirty-Five Mormons and 1 Baptist Preacher', 'John L. Smith', 'library/covers/2c54ab2b.jpg', 'made'),
  ('Sunday or Sabbath Which Should Christians Observe', 'John R. Rice', 'library/covers/92ae460a.jpg', 'made'),
  ('Communicating Christ in a Religious World', 'John Thomas Rogers', 'library/covers/8d0294d9.jpg', 'found'),
  ('The Foundation of Augustinian-Calvinism', 'Ken Wilson', 'library/covers/61af63f4.jpg', 'found'),
  ('The Other Side of Calvinism', 'Laurence M.  Vance', 'library/covers/175c6be4.jpg', 'found'),
  ('The Potter''s Promise - A Biblical Defense of Traditional Soteriology', 'Leighton Flowers', 'library/covers/4284a1be.jpg', 'found'),
  ('Capital Punishment - Christian or Barbarian', 'M. L. Moser Jr.', 'library/covers/8f0dab31.jpg', 'made'),
  ('Psycho Heresy', 'Martin and Deirdre Bobgan', 'library/covers/6ddb3e26.jpg', 'found'),
  ('Preparing Catholics for Eternity', 'Mike Gendron', 'library/covers/16d923aa.jpg', 'found'),
  ('Seventh Day Adventists Believe - A Biblical Exposition of Fundamental Doctrines', 'Ministerial Association', 'library/covers/bbd42aad.jpg', 'found'),
  ('Against the Protestant Gnostics', 'Philip J. Lee', 'library/covers/4452c0cc.jpg', 'found'),
  ('A Struggle to Peace', 'Richard & Cindy Benson', 'library/covers/3713be9c.jpg', 'made'),
  ('Psychobabble - The Failure of Modern Psychology - and the Biblical Alternative', 'Richard Ganz', 'library/covers/bd81a14a.jpg', 'found'),
  ('Understanding Roman Catholicism', 'Rick Jones', 'library/covers/4e05fc17.jpg', 'found'),
  ('Falsities of Seventh-Day Adventism', 'Robert L. Sumner', 'library/covers/ce8bcd04.jpg', 'made'),
  ('The Islamic Invasion - Confronting the World''s Fastest Growing Religion', 'Robert Morey', 'library/covers/a2b9fbad.jpg', 'found'),
  ('Promise Unfulfilled - The Failed Strategy of Modern Evangelicalism', 'Rolland McCune', 'library/covers/825ed950.jpg', 'found'),
  ('Salvation: Choice or Chosen', 'Ron Tobin', 'library/covers/38fb68f4.jpg', 'found'),
  ('A Solemn Caution Against The Ten Horns of Calvinism', 'Thomas Taylor', 'library/covers/7739a011.jpg', 'found'),
  ('Approaching Mormons in Love', 'Wilbur Lingle', 'library/covers/69c52c0c.jpg', 'found'),
  ('Burning Questions about Islam', 'Wilbur Lingle', 'library/covers/9a5dd8a9.jpg', 'found'),
  ('25 Important Questions for Mormons', 'Wilbur Lingle and Robert Delancy', 'library/covers/19e41359.jpg', 'made'),
  ('Common Sense Parenting - The Essentials of building a Christian Family', 'Kent & Barbara Hughes', 'library/covers/f73a48b0.jpg', 'found'),
  ('Tying the Knot Tighter - Because Marraige Lasts a Lifetime', 'Marth Peace & John Crotts', 'library/covers/b2cc5d3b.jpg', 'found'),
  ('The Excellent Wife', 'Martha Peace', 'library/covers/16f2a3cf.jpg', 'found'),
  ('Becoming a Titus 2 Woman', 'Martha Peace', 'library/covers/3528f403.jpg', 'found'),
  ('The Faithful Parent - A Biblical Guide to Raising a Family', 'Martha Peace & Stuart W. Scott', 'library/covers/7ed0d8c3.jpg', 'made'),
  ('Far Above Rubies', 'Mrs. H.W. Darst', 'library/covers/e5adf29b.jpg', 'made'),
  ('A Faith Full Marriage', 'Paul Chappell', 'library/covers/fb6abc43.jpg', 'found'),
  ('A Firm Foundation', 'Paul Chappell', 'library/covers/2bb2e0fb.jpg', 'made'),
  ('Making Home Work in a Broken Society', 'Paul Chappell', 'library/covers/a7375159.jpg', 'made'),
  ('Time Out for Parents', 'Paul Chappell', 'library/covers/e596fe32.jpg', 'made'),
  ('Before You Meet Prince Charming', 'Sarah Mally', 'library/covers/d94f7fbf.jpg', 'found'),
  ('Speak Truth in your Heart', 'Sarah Mally', 'library/covers/ef5631c5.jpg', 'made'),
  ('Making Brothers and Sisters Best Friends', 'Sarah, Stephen and Grace Mally', 'library/covers/5deed20b.jpg', 'found'),
  ('The Dissent and Nonconformity Series #3 - The Israel of the Apls - A History of the Waldenses Volume 1', 'Alexis Muston', 'library/covers/2e2e4987.jpg', 'made'),
  ('The Dissent and Nonconformity Series #4 - The Israel of the Alps - A History of the Waldenses Volume 2', 'Alexis Muston', 'library/covers/6427aadf.jpg', 'made'),
  ('Memorials of Baptist Martyrs', 'Assorted Contributing Authors', 'library/covers/2353a132.jpg', 'made'),
  ('The Dissent and Nonconformity Series #10 - The Early English Dissenters Volume 2', 'Champlin Burrage', 'library/covers/8463d007.jpg', 'made'),
  ('The Dissent and Nonconformity Series #9 - The Early English Dissenters Voume 1', 'Champlin Burrage', 'library/covers/95b687c8.jpg', 'made'),
  ('The Baptist Biography Series #5 - Memoirs of Elder Jesse Mercer', 'Charles D. Mallary', 'library/covers/93bdc4c8.jpg', 'made'),
  ('Ras Shamra and the Bible - Baker Studies in Biblical Archaeology', 'Charles F. Pfeiffer', 'library/covers/05472597.jpg', 'found'),
  ('The Jews and Israel', 'Charles Kriessman', 'library/covers/6473c8a2.jpg', 'made'),
  ('The Baptist History Series #5 - 50 Years Among the Baptists', 'David Benedict', 'library/covers/1795e256.jpg', 'made'),
  ('The Dissent and Nonconformity Series #12 - History of the Donatists', 'David Benedict', 'library/covers/62bec10a.jpg', 'made'),
  ('In Pursuit of Purity', 'David O. Beale', 'library/covers/fc6ecf95.jpg', 'found'),
  ('Bible Times & Ancient Kingdoms Treasures from History & Archaeology', 'David W. Cloud', 'library/covers/bba079fa.jpg', 'made'),
  ('Highlights in Church History', 'David W. Cloud', 'library/covers/ddcb4e9f.jpg', 'found'),
  ('History of the Churches From a Baptist Perspective Volume 1', 'David W. Cloud', 'library/covers/ffb26876.jpg', 'found'),
  ('History of the Churches From a Baptist Perspective Volume 2', 'David W. Cloud', 'library/covers/e1444655.jpg', 'found'),
  ('Jews in Fighter Jets: Israel Past, Present, and Future', 'David W. Cloud', 'library/covers/ef4e246a.jpg', 'found'),
  ('Protestant Persecution of Baptists', 'David W. Cloud', 'library/covers/7fc34602.jpg', 'found'),
  ('Rome and the Bible', 'David W. Cloud', 'library/covers/8d980303.jpg', 'found'),
  ('The History and Heritage of Fundamentalism and Fundamental Baptist Churches', 'David W. Cloud', 'library/covers/da5e964c.jpg', 'found'),
  ('The Romans - A Panoramic View of the Political, Economic, MIlitary, and Social Institutions of Rome', 'Donald R. Dudley', 'library/covers/cdd3a337.jpg', 'made'),
  ('The Dissent and Nonconformity Series #22 - The Recovery of the Anabaptist Vision', 'Edited by Guy F. Hershberger', 'library/covers/dadcebfd.jpg', 'made'),
  ('Persia and the Bible', 'Edwin M. Yamauchi', 'library/covers/e40b9a75.jpg', 'found'),
  ('Forty Stories of Famous Gospel Songs', 'Ernest K. Emurian', 'library/covers/fdb75db8.jpg', 'found'),
  ('When a Nation Forgets God', 'Erwin W. Lutzer', 'library/covers/9fb6ff06.jpg', 'found'),
  ('The Dissent and Nonconformity Series #11 - The Anabaptist View of the Church', 'Franklin H. Littell', 'library/covers/38bbddd9.jpg', 'made'),
  ('Manners and Customs of Bible Lands', 'Fred H. Wight', 'library/covers/48573408.jpg', 'found'),
  ('A Concise History of Baptists', 'G. H. Orchard', 'library/covers/ca8e4bb2.jpg', 'found'),
  ('A History of Fundamentalism in America', 'George W. Dollar', 'library/covers/bb1d3d09.jpg', 'found'),
  ('The Baptist History Series #3 - A History of New England Baptists Volume 1 of 2', 'Isaac Backus', 'library/covers/6889bab7.jpg', 'made'),
  ('The Baptist History Series #4 - A History of New England Baptists Volume 2 of 2', 'Isaac Backus', 'library/covers/b4952057.jpg', 'made'),
  ('The Trail of Blood', 'J. M. Carroll', 'library/covers/8dda498c.jpg', 'found'),
  ('The Baptist History Series #15 - Baptist History', 'J. M. Cramp', 'library/covers/1fbfaa30.jpg', 'made'),
  ('The Baptist History Series #10 - Memorials of Baptist Martyrs', 'J. Newton Brown', 'library/covers/169472fa.jpg', 'made'),
  ('Compendium of Baptist History', 'J.A. Shackelford', 'library/covers/12688ce6.jpg', 'found'),
  ('Lives of Virginia Baptist Ministers', 'James B', 'library/covers/f3664294.jpg', 'found'),
  ('The Baptist Biography Series #3 - The Diary of John Comer', 'John Comer', 'library/covers/b6dcdfee.jpg', 'made'),
  ('The Dissent and Nonconformity Series #13 - Lutheran Reformers Against Anabaptists', 'John S. Oyer', 'library/covers/d4abb642.jpg', 'made'),
  ('Mirror of the Martyrs', 'John S. Oyer and Robert S. Kreider', 'library/covers/0383b32c.jpg', 'found'),
  ('A History of the Baptists Volume I and II', 'John Tyler Christian', 'library/covers/64c0d175.jpg', 'made'),
  ('Baptist History Vindicated', 'John Tyler Christian', 'library/covers/541224ba.jpg', 'found'),
  ('The Dissent and Nonconformity Series #14 - The Reformers and Their Stepchildren', 'Leonard Verduin', 'library/covers/ac134c8b.jpg', 'made'),
  ('A History of Churches', 'Lester Hutson', 'library/covers/3985865b.jpg', 'made'),
  ('The Baptist Biography Series #1 - John Clarke', 'Louis Franklin Asher', 'library/covers/3beb082a.jpg', 'made'),
  ('Faith of Our Fathers: Scenes from American Church History', 'Mark Sidwell', 'library/covers/31fa42c5.jpg', 'found'),
  ('Outsiders - 15 Leaders who followed Christ and Changed the World', 'Paul Chappell', 'library/covers/bed20ed9.jpg', 'made'),
  ('The Tabernacle of God in the Wilderness of Sinai', 'Paul F. Kiene', 'library/covers/0e92d5a4.jpg', 'found'),
  ('The Foundations of Our World Volume 1 - From Creation to the Middle Ages', 'Phil Stringer', 'library/covers/5b762989.jpg', 'made'),
  ('The Foundations of Our World Volume 2 - From the Middle Ages Until the Return of Christ', 'Phil Stringer', 'library/covers/bcaa3929.jpg', 'made'),
  ('The Heaven Rescued Land Volume 1', 'Phil Stringer', 'library/covers/8ff0db42.jpg', 'made'),
  ('The Heaven Rescued Land Volume 2', 'Phil Stringer', 'library/covers/e9cc4583.jpg', 'made'),
  ('Tne Faithful Baptist Witness', 'Phil Stringer', 'library/covers/ba204f97.jpg', 'made'),
  ('Proving God - Financial Experiences of the China Inland Mission', 'Phyllis Thompson', 'library/covers/87779a94.jpg', 'made'),
  ('The Baptist History Series #14 - The Story of the Baptists in All Ages and Countries', 'Richard B. Cook', 'library/covers/fbe7bef8.jpg', 'made'),
  ('The Lord''s Free People in a Free Land', 'Robert A. Baker', 'library/covers/34db7ffa.jpg', 'found'),
  ('Contending for the Faith', 'Robert Ashcraft', 'library/covers/06999a41.jpg', 'made'),
  ('Landmarks of Church History Book 1', 'Robert J. Sargent', 'library/covers/6bf9e1a9.jpg', 'made'),
  ('Landmarks of Church History Book 2', 'Robert J. Sargent', 'library/covers/39a4436a.jpg', 'made'),
  ('The Origin of the Baptists', 'S. F. Ford', 'library/covers/990f27f1.jpg', 'made'),
  ('The Dissent and Nonconformity Series #1 - The History of the Evangelical Churches of the Valleys of Piemont Volume 1', 'Samuel Morland', 'library/covers/ad8370dc.jpg', 'made'),
  ('The Dissent and Nonconformity Series #2 - The History of the Evangelical Churches of the Valleys of Piemont Volume 2', 'Samuel Morland', 'library/covers/74c0ab3c.jpg', 'made'),
  ('Experiences of A Baptist Faith Missionary for 56 Years in China', 'T. L. Blalock', 'library/covers/cd4348e0.jpg', 'made'),
  ('The Waldenses of Whom the World was Not Worthy', 'Ted Alexander', 'library/covers/21aaf50a.jpg', 'made'),
  ('Martyrs Mirror', 'Thieleman J. van Braght', 'library/covers/f623278b.jpg', 'made'),
  ('History of the Baptists', 'Thomas Armitage', 'library/covers/2ec939d0.jpg', 'found'),
  ('The Baptist History Series #1 - A History of the Baptists Volume 1 of 2', 'Thomas Armitage', 'library/covers/4649795f.jpg', 'made'),
  ('The Baptist History Series #2 - A History of the Baptists Volume 2 of 2', 'Thomas Armitage', 'library/covers/dd8500bf.jpg', 'made'),
  ('The Baptist History Series #16 - The History of the English Baptists Volume 1 of 4', 'Thomas Crosby', 'library/covers/d67ad503.jpg', 'made'),
  ('The Baptist History Series #17 - The History of the English Baptists Volume 2 of 4', 'Thomas Crosby', 'library/covers/99de2723.jpg', 'made'),
  ('The Baptist History Series #18 - The History of the English Baptists Volume 3 of 4', 'Thomas Crosby', 'library/covers/5d417943.jpg', 'made'),
  ('The Baptist History Series #19 - The History of the English Baptists Volume 4 of 4', 'Thomas Crosby', 'library/covers/20a4cb63.jpg', 'made'),
  ('St. Paul the Traveller and the Roman Citizen', 'W. M. Ramsay', 'library/covers/019c2c67.jpg', 'found'),
  ('The Cities of St. Paul', 'W. M. Ramsay', 'library/covers/6af0c3e3.jpg', 'found'),
  ('The Dissent and Nonconformity Series #5 - The History and Antiquities of the Dissenting Churches Volume 1', 'Walter Wilson', 'library/covers/d77f8394.jpg', 'made'),
  ('The Dissent and Nonconformity Series #6 - The History and Antiquities of the Dissenting Churches Volume 2', 'Walter Wilson', 'library/covers/11d443d6.jpg', 'made'),
  ('The Dissent and Nonconformity Series #7 - The History and Antiquities of the Dissenting Churches Volume 3', 'Walter Wilson', 'library/covers/4c290418.jpg', 'made'),
  ('The Dissent and Nonconformity Series #8 - The History and Antiquities of the Dissenting Churches Volume 4', 'Walter Wilson', 'library/covers/867dc45a.jpg', 'made'),
  ('Rousseau and Revolution', 'Will & Ariel Durant', 'library/covers/1c1446e4.jpg', 'found'),
  ('The Age of Napoleon', 'Will & Ariel Durant', 'library/covers/8311d0b6.jpg', 'found'),
  ('The Age of Reason Begins', 'Will & Ariel Durant', 'library/covers/a34268e0.jpg', 'found'),
  ('The Age of Voltaire', 'Will & Ariel Durant', 'library/covers/307afa88.jpg', 'made'),
  ('Caesar and Christ', 'Will Durant', 'library/covers/449b2d41.jpg', 'found'),
  ('Our Oriental Heritage', 'Will Durant', 'library/covers/ee85faf3.jpg', 'made'),
  ('The Age of Faith', 'Will Durant', 'library/covers/1d3c5ca1.jpg', 'found'),
  ('The Life of Greece', 'Will Durant', 'library/covers/ef224b19.jpg', 'made'),
  ('The Reformation', 'Will Durant', 'library/covers/168eea87.jpg', 'found'),
  ('The Renaissance', 'Will Durant', 'library/covers/e751441b.jpg', 'found'),
  ('And God Gave the Increase', 'William Estep', 'library/covers/4287d3f3.jpg', 'made'),
  ('CCM is Not the Problem - It''s Only a Symptom', 'David Bennett', 'library/covers/4b9d4506.jpg', 'made'),
  ('A Plea to Sothern Gospel Music Lovers', 'David W. Cloud', 'library/covers/5482979d.jpg', 'found'),
  ('Directory of Contemporary Worship Musicians', 'David W. Cloud', 'library/covers/84636317.jpg', 'found'),
  ('Rock & Roll''s War Against God', 'David W. Cloud', 'library/covers/3cf42a71.jpg', 'found'),
  ('The Satanic Attack on Sacred Music', 'David W. Cloud', 'library/covers/3e24dd08.jpg', 'found'),
  ('Transforming Congregational Singing for the 21st Century', 'David W. Cloud', 'library/covers/38b20748.jpg', 'found'),
  ('What Every Christian Should Know about Rock Music', 'David W. Cloud', 'library/covers/4f7e0e47.jpg', 'found'),
  ('"The Pied Piper" of Rock Music', 'Dennis Corle', 'library/covers/00af217e.jpg', 'found'),
  ('The Lord''s Song', 'Erich P. McCandless', 'library/covers/9c99618f.jpg', 'made'),
  ('Confronting Contemporary Christian Music', 'H. T. Spence', 'library/covers/155ae21e.jpg', 'found'),
  ('How to Conquer the Addiction of Rock Music', 'Institute in Basic Life Principles', 'library/covers/8e825d04.jpg', 'made'),
  ('Measuring the Music', 'John Makujina', 'library/covers/4029d75a.jpg', 'found'),
  ('Doing our Own Thing', 'John McWhorter', 'library/covers/13aa9f87.jpg', 'found'),
  ('Let Those Who Have Ears to Hear', 'Kimberly Smith', 'library/covers/4b976a1e.jpg', 'found'),
  ('Music and Morals', 'Kimberly Smith', 'library/covers/d52d0b30.jpg', 'found'),
  ('Worship in the Melting Pot', 'Peter Masters', 'library/covers/a789d158.jpg', 'found'),
  ('The Battle for Christian Music', 'Tim Fisher', 'library/covers/b447b23b.jpg', 'found'),
  ('The Three Baptisms - Water! Spirit! Fire!', 'B.H. Carroll', 'library/covers/3a6f714b.jpg', 'made'),
  ('The Church and the Ordinances', 'Buell H. Kazee', 'library/covers/8f9ef874.jpg', 'made'),
  ('The Baptism of the Holy Spirit', 'I. K. Cross', 'library/covers/c629e136.jpg', 'made'),
  ('John''s Baptism', 'J. R. Graves', 'library/covers/0d3301fb.jpg', 'found'),
  ('The Lord''s Supper', 'J. R. Graves', 'library/covers/ed367db3.jpg', 'made'),
  ('Close Communion and Baptists', 'J.H. Grime', 'library/covers/d5616222.jpg', 'made'),
  ('The Act of Christian Baptism', 'J.R. Graves', 'library/covers/018a43bf.jpg', 'made'),
  ('The Lord''s Supper - A Church Ordinance', 'James R. Graves', 'library/covers/25f5f029.jpg', 'made'),
  ('Are Your Baptismal Waters Doctrinally Shallow?', 'Lance T. Ketchum', 'library/covers/90bdd36c.jpg', 'found'),
  ('The Baptism of the Holy Ghost and Tongues', 'Louis Entzminger', 'library/covers/76c8fb7f.jpg', 'made'),
  ('The Battle for Biblical Baptism', 'Luis C. Ruiz', 'library/covers/52994f52.jpg', 'made'),
  ('A Sober Discourse of Right To Church Communion', 'William Kiffin', 'library/covers/f427ac97.jpg', 'found'),
  ('Alien Baptism and the Baptists', 'William M. Nevins', 'library/covers/c5e7b192.jpg', 'made'),
  ('The Preacher and His Preaching', 'Alfred Gibbs', 'library/covers/9c123e1c.jpg', 'found'),
  ('Lectures to My Students', 'Charles H. Spurgeon', 'library/covers/015e682b.jpg', 'found'),
  ('Spiritual Leadership Volume 1', 'Dennis Corle', 'library/covers/885718d1.jpg', 'made'),
  ('Spiritual Leadership Volume 3', 'Dennis Corle', 'library/covers/4c12ac0f.jpg', 'made'),
  ('A Theology of Biblical Counseling', 'Heath Lambert', 'library/covers/ed66e4f5.jpg', 'found'),
  ('A Guide to Effective Sermon Delivery', 'Jerry Vines', 'library/covers/57dc6cd8.jpg', 'found'),
  ('A Practical Guide to Serman Preparation', 'Jerry Vines', 'library/covers/b3fbcc93.jpg', 'made'),
  ('Keep the Faith', 'Paul Chappell', 'library/covers/647e061d.jpg', 'made'),
  ('Leaders who make a Difference', 'Paul Chappell', 'library/covers/00949f3b.jpg', 'found'),
  ('Strengthen your Hands', 'Paul Chappell', 'library/covers/8c3ec792.jpg', 'found'),
  ('The Ministry of a Baptist Deacon', 'Paul Chappell', 'library/covers/d0e151f6.jpg', 'found'),
  ('The Road Ahead - 10 Steps to Authentic Ministry for Independed Baptists', 'Paul Chappell', 'library/covers/b10b35da.jpg', 'found'),
  ('Dangerous Calling', 'Paul David Tripp', 'library/covers/697ea5b5.jpg', 'found'),
  ('Instruments in the Redeemer''s Hands', 'Paul David Tripp', 'library/covers/9b68db54.jpg', 'found'),
  ('God''s Prophetic Blueprint', 'Bob Shelton', 'library/covers/88ef9b99.jpg', 'found'),
  ('An Urgent Call to a Serious Faith', 'Dave Hunt', 'library/covers/b2c59c23.jpg', 'found'),
  ('Bible Prophecy as Light on the 21st Century', 'David W. Cloud', 'library/covers/87eb3eea.jpg', 'found'),
  ('Prophecy', 'David W. Cloud', 'library/covers/cf91c83e.jpg', 'made'),
  ('The Future According to the Bible', 'David W. Cloud', 'library/covers/8cd08fe8.jpg', 'found'),
  ('Understanding Bible Prophecy', 'David W. Cloud', 'library/covers/e92b83d6.jpg', 'found'),
  ('Revelation Visualized', 'Gary G. Cohen and Salem Kirban', 'library/covers/4fabf0aa.jpg', 'found'),
  ('Revelation Visualized', 'Harry A. Ironside', 'library/covers/bdf07e9b.jpg', 'made'),
  ('The End Times', 'Herman A. Hoyt', 'library/covers/11354624.jpg', 'found'),
  ('Understanding the Times - Living Courageously in Prophetic Times', 'Paul Chappell', 'library/covers/29266d9b.jpg', 'made'),
  ('The Interpretation of Prophecy', 'Paul Lee Tan', 'library/covers/3f1eb6bb.jpg', 'found'),
  ('Kirban''s Prophecy New Testament', 'Salem Kirban', 'library/covers/2116d515.jpg', 'found'),
  ('Temporal Delusion', 'T.A. McMahon', 'library/covers/5464a1c3.jpg', 'made'),
  ('Bible Analysis', 'Albert Garner', 'library/covers/a20b323f.jpg', 'made'),
  ('The New Testament', 'American Bible Society', 'library/covers/e8db5ffa.jpg', 'made'),
  ('The Right Word III', 'American Heritage Dictionary', 'library/covers/272d2b4d.jpg', 'made'),
  ('The Word Book III', 'American Heritage Dictionary', 'library/covers/0649a5fa.jpg', 'made'),
  ('The Written Word III', 'American Heritage Dictionary', 'library/covers/59e705c8.jpg', 'made'),
  ('An Interpretation of the English Bible - The Four Gospels', 'B.H. Carroll', 'library/covers/4879b0c1.jpg', 'made'),
  ('An Interpretation of the English Bible - Volume ?? The Four Gospels', 'B.H. Carroll', 'library/covers/d153ab47.jpg', 'made'),
  ('An Interpretation of the English Bible - Volume I - Genesis', 'B.H. Carroll', 'library/covers/f7d8f8a5.jpg', 'made'),
  ('An Interpretation of the English Bible - Volume IV - The Poetical Books', 'B.H. Carroll', 'library/covers/aaa48a71.jpg', 'made'),
  ('An Interpretation of the English Bible - Volume IX - Daniel and the Inter-Biblical Period', 'B.H. Carroll', 'library/covers/87e14fbe.jpg', 'made'),
  ('An Interpretation of the English Bible - Volume VIII - The Prophets of the Chaldean Period', 'B.H. Carroll', 'library/covers/e995d95e.jpg', 'made'),
  ('An Interpretation of the English Bible - Volume XV - Colossians, Ephesians, Hebrews', 'B.H. Carroll', 'library/covers/e56bb636.jpg', 'made'),
  ('Notes on the Book of Deuteronomy', 'C. H. M.', 'library/covers/8fe35f76.jpg', 'found'),
  ('Notes on the Book of Genesis', 'C. H. M.', 'library/covers/6c18101d.jpg', 'found'),
  ('Notes on the Book of Leviticus', 'C. H. M.', 'library/covers/f6d93ec5.jpg', 'found'),
  ('Notes on the Book of Numbers', 'C. H. M.', 'library/covers/57b825bb.jpg', 'made'),
  ('Different by Design - Discovering that a Godly life is Still a Good Life', 'Cary Schmidt', 'library/covers/14c19664.jpg', 'found'),
  ('Discover your Destiny - Making Right Choices in a World Full of Wrong', 'Cary Schmidt', 'library/covers/fac114a8.jpg', 'found'),
  ('Life Quest - Braving Adulthood with Biblical Passion', 'Cary Schmidt', 'library/covers/d8b2e800.jpg', 'found'),
  ('101 Select Sermon Outlines', 'Charles H. Spurgeon', 'library/covers/b34215a8.jpg', 'made'),
  ('12 Sermons for the Troubled and Tired', 'Charles H. Spurgeon', 'library/covers/db612977.jpg', 'made'),
  ('12 Sermons on Decisions', 'Charles H. Spurgeon', 'library/covers/a78819e7.jpg', 'made'),
  ('12 Sermons on Prayer', 'Charles H. Spurgeon', 'library/covers/e5cb2069.jpg', 'made'),
  ('12 Sermons on the Holy Spirit', 'Charles H. Spurgeon', 'library/covers/3332029e.jpg', 'found'),
  ('12 Sermons on the Passion and Death of Christ', 'Charles H. Spurgeon', 'library/covers/abc0f349.jpg', 'found'),
  ('12 Sermons on the Second Coming of Christ', 'Charles H. Spurgeon', 'library/covers/9ed98194.jpg', 'found'),
  ('12 Sermons on Various Subjects', 'Charles H. Spurgeon', 'library/covers/8612181e.jpg', 'made'),
  ('12 Sermons to Young People', 'Charles H. Spurgeon', 'library/covers/1289d23d.jpg', 'made'),
  ('12 Striking Sermons', 'Charles H. Spurgeon', 'library/covers/a350ecae.jpg', 'made'),
  ('Christ''s Glorious Achievements', 'Charles H. Spurgeon', 'library/covers/2e868f3a.jpg', 'found'),
  ('Counsel for Christian Workers', 'Charles H. Spurgeon', 'library/covers/1a65a3c5.jpg', 'found'),
  ('The King''s Highway', 'Charles H. Spurgeon', 'library/covers/efeff0f8.jpg', 'found'),
  ('The Saint and his Saviour', 'Charles H. Spurgeon', 'library/covers/9c086b1f.jpg', 'found'),
  ('The First 200 Questions Answered', 'D.A. Waite', 'library/covers/18199706.jpg', 'made'),
  ('A Portrait of Christ - The Tabernacle, The Priesthood, The Offerings', 'David W. Cloud', 'library/covers/2042c431.jpg', 'found'),
  ('Mastering the English Bible - Acts', 'David W. Cloud', 'library/covers/05a8bb35.jpg', 'found'),
  ('Mastering the English Bible - Galatians to Thessalonians', 'David W. Cloud', 'library/covers/9ae7d285.jpg', 'found'),
  ('Mastering the English Bible - Galations - Thessalonians', 'David W. Cloud', 'library/covers/3235a3fd.jpg', 'found'),
  ('Mastering the English Bible - General Epistles', 'David W. Cloud', 'library/covers/e0c53223.jpg', 'found'),
  ('Mastering the English Bible - Job and Psalms', 'David W. Cloud', 'library/covers/ec6e1eb6.jpg', 'found'),
  ('Mastering the English Bible - Old Testament History Genesis to the Silent Years', 'David W. Cloud', 'library/covers/81321863.jpg', 'found'),
  ('Mastering the English Bible - Pastoral Epistles', 'David W. Cloud', 'library/covers/43733317.jpg', 'found'),
  ('Mastering the English Bible - Proverbs to Song of Solomon', 'David W. Cloud', 'library/covers/88d28d2f.jpg', 'found'),
  ('Mastering the English Bible - Proverbs, Ecclesiastes, Song of Solomon', 'David W. Cloud', 'library/covers/15f0260e.jpg', 'found'),
  ('Mastering the English Bible - Revelation', 'David W. Cloud', 'library/covers/5aed05eb.jpg', 'found'),
  ('Mastering the English Bible - Romans - Corinthians', 'David W. Cloud', 'library/covers/c3591b57.jpg', 'found'),
  ('Mastering the English Bible - The Gospels', 'David W. Cloud', 'library/covers/c13fccda.jpg', 'found'),
  ('Mastering the English Bible - The Prophetic Books', 'David W. Cloud', 'library/covers/ca935809.jpg', 'found'),
  ('Mastering the English Bible- Romans to Corinthians', 'David W. Cloud', 'library/covers/1b7d2c9b.jpg', 'found'),
  ('Things Hard to be Understood', 'David W. Cloud', 'library/covers/4321bfb7.jpg', 'found'),
  ('Understanding the Bible for Yourself', 'David W. Cloud', 'library/covers/621c4687.jpg', 'found'),
  ('Way of LIife Encyclopedia of the Bible and Christianity', 'David W. Cloud', 'library/covers/aa27fe65.jpg', 'found'),
  ('Contending for the Faith', 'Dennis Corle', 'library/covers/773e92b1.jpg', 'made'),
  ('Slaves, Citizens, Sons - Legal Metaphors in the Epistles', 'Francis Lyall', 'library/covers/5ff396ba.jpg', 'made'),
  ('The Minor Prophets - The Men and their Messages', 'G. Campbell Morgan', 'library/covers/4b86d0f5.jpg', 'made'),
  ('Addresses on Luke - Volume I', 'Harry A. Ironside', 'library/covers/4f9aa286.jpg', 'made'),
  ('The Song of Solomon', 'Harry A. Ironside', 'library/covers/ccefd136.jpg', 'made'),
  ('The Remarkable Wisdom of Solomon', 'Henry Morris', 'library/covers/0509a244.jpg', 'found'),
  ('God''s Book of Faith - Meditations from Job', 'Herbert Lockyer', 'library/covers/57dc2c26.jpg', 'made'),
  ('The Epistle to the Hebrew', 'Homer A. Kent, Jr.', 'library/covers/4466d26c.jpg', 'made'),
  ('The Pastoral Epistles', 'Homer A. Kent, Jr.', 'library/covers/b25802dc.jpg', 'found'),
  ('The Tabernacle Priesthood and Offerings', 'I. M. Haldeman', 'library/covers/68ca3d1d.jpg', 'found'),
  ('Principles of Biblical Hermeneutics', 'J. Edwin Hartill', 'library/covers/1af99deb.jpg', 'found'),
  ('God''s Laws of Learning', 'J. Paul Reno', 'library/covers/8c71513c.jpg', 'made'),
  ('Always Rejoicing - A Verse by Verse Study of the Book of Philippians', 'John Goetsch', 'library/covers/b4ef6cfa.jpg', 'found'),
  ('Walking through the Fire - A Study from First Peter on the Trial of your Faith', 'John Goetsch', 'library/covers/81662d6c.jpg', 'found'),
  ('What''s on your Mind - Discover the Power of Biblical Thinking', 'John Goetsch', 'library/covers/0f3f471b.jpg', 'found'),
  ('Chronological and Background Charts of the New Testament', 'John H. Walton', 'library/covers/ed3142a1.jpg', 'made'),
  ('Chronological and Background Charts of the Old Testament', 'John H. Walton', 'library/covers/4c1893fa.jpg', 'found'),
  ('The Pentateuch', 'L. Thomas Holdcroft', 'library/covers/77266067.jpg', 'found'),
  ('The Baptism and Filling of the Holy Spirit', 'Lance T. Ketchum', 'library/covers/85ad83f4.jpg', 'made'),
  ('The Baptist Encyclopedia Vol. 2', 'Louis H. Everts', 'library/covers/4f9a643c.jpg', 'made'),
  ('The Baptist Encyclopedia Vol.1', 'Louis H. Everts', 'library/covers/3e9206d5.jpg', 'made'),
  ('Salt & Light - A study of Biblical Metaphors for the Christian Life', 'Mark Rasmussen', 'library/covers/aa6f92d0.jpg', 'made'),
  ('The Gospel According to John Volume I', 'Oliver B. Greene', 'library/covers/f4f325f3.jpg', 'made'),
  ('The Gospel According to John Volume II', 'Oliver B. Greene', 'library/covers/9c9125d6.jpg', 'made'),
  ('The Gospel According to John Volume III', 'Oliver B. Greene', 'library/covers/e8b32253.jpg', 'made'),
  ('Build Below the Baseline - Developing the Part of Your Life that Only God Sees', 'Paul Chappell', 'library/covers/6865d0e3.jpg', 'found'),
  ('Consider Christ - Meditate on Who Jesus is and the Strength He Gives', 'Paul Chappell', 'library/covers/f3af9d4c.jpg', 'made'),
  ('Real Church - Discovering God''s Pattern for the Local Church', 'Paul Chappell', 'library/covers/62878c40.jpg', 'found'),
  ('Stand Firm in the Faith - An Exposition of II Corinthians', 'Robert G. Gromacki', 'library/covers/6692038f.jpg', 'found'),
  ('The Life and Labors of Paul the Apostle', 'Robert J. Sargent', 'library/covers/20ceb96b.jpg', 'made'),
  ('The Bible Source Book', 'Steven Swihart', 'library/covers/c815d484.jpg', 'made'),
  ('Bound for Joy - Philippians - Paul''s Letter from prison', 'Stuart Briscoe', 'library/covers/e69a3cb7.jpg', 'found'),
  ('Sound Doctrine: The Theology of I and II Timothy', 'Thomas M. Strouse', 'library/covers/190f3e04.jpg', 'made'),
  ('For the Faith - Understanding and Practicing the Faith Once Delivered to the Saints', 'Tim Christoson', 'library/covers/21b43600.jpg', 'found'),
  ('Women in Ministry', 'Vicki Sargent', 'library/covers/c3f58812.jpg', 'made'),
  ('The Land and the Book', 'W. M. Thomson', 'library/covers/bbea42b5.jpg', 'made'),
  ('The Gregg Reference Manual', 'William A. Sabin', 'library/covers/6480e7cf.jpg', 'found'),
  ('The Baptist History Series #11 - The Baptist Encyclopedia Volume 1 of 3', 'William Cathcart', 'library/covers/709d929f.jpg', 'made'),
  ('The Baptist History Series #12 - The Baptist Encyclopedia Volume 2 of 3', 'William Cathcart', 'library/covers/cb84f8a1.jpg', 'made'),
  ('The Baptist History Series #13 - The Baptist Encyclopedia Volume 3 of 3', 'William Cathcart', 'library/covers/266c5ea3.jpg', 'made'),
  ('Basics of Biblical Greek', 'William D. Mounce', 'library/covers/ca4908de.jpg', 'found'),
  ('Bible Atlas & Companion', '', 'library/covers/e225448b.jpg', 'found'),
  ('Ecclesia - the Church', 'B.H. Carroll', 'library/covers/2f1aab03.jpg', 'found'),
  ('The Disciple Making Church', 'Bill Hull', 'library/covers/63bb66aa.jpg', 'found'),
  ('The Pastor in Prayer', 'Charles H. Spurgeon', 'library/covers/7e60081f.jpg', 'found'),
  ('21 Steps to a Stronger Church for the 21st Century', 'David W. Cloud', 'library/covers/33f27b53.jpg', 'found'),
  ('Feed the Flock', 'David W. Cloud', 'library/covers/cd0200f4.jpg', 'found'),
  ('Keys to Fruitful Church Membership', 'David W. Cloud', 'library/covers/f3ea92e3.jpg', 'found'),
  ('Pastors Deacons and Church Members', 'David W. Cloud', 'library/covers/de1541ba.jpg', 'found'),
  ('The Discipling Church: The Church That Will Stand Until Christ Comes', 'David W. Cloud', 'library/covers/43be8b29.jpg', 'found'),
  ('The High Calling of God - A Look at the Bride of Christ', 'Dennis R. Wharton', 'library/covers/a1641837.jpg', 'found'),
  ('What is a Deacon?', 'Gary Jones', 'library/covers/76fb5e50.jpg', 'made'),
  ('The Church Attending God''s Business', 'Gerald D. Keller', 'library/covers/38017b44.jpg', 'made'),
  ('The Baptist Heritage', 'J. M. Holliday', 'library/covers/d2ee3892.jpg', 'made'),
  ('New Testament Church Discipline', 'James W. Crumpton', 'library/covers/98a1ca51.jpg', 'made'),
  ('Still a Baptist', 'Jerry D. Locke', 'library/covers/1bb77f92.jpg', 'made'),
  ('The Baptist Distinctive Series #8 - The Church and the Kingdom: A New Testament Study', 'Jesse B. Thomas', 'library/covers/1436bc8d.jpg', 'made'),
  ('A Pure Church', 'Kent Brandenburg', 'library/covers/f0b9c0a4.jpg', 'found'),
  ('The Mystical Invisible Universal "Church"', 'Les Potter', 'library/covers/ba9905ce.jpg', 'made'),
  ('Baptist Handbook for Church Members', 'M. L. Moser Jr.', 'library/covers/440c46ef.jpg', 'made'),
  ('The Church that Jesus Loved', 'Norman H. Wells', 'library/covers/d244c45f.jpg', 'made'),
  ('Corrective Church Discipline', 'Patrick H. Mell', 'library/covers/6dd8e82f.jpg', 'found'),
  ('Church Still Works', 'Paul Chappell & Clayton Reed', 'library/covers/9aef2384.jpg', 'made'),
  ('The Fortress of the Truth (The New Testament Church)', 'R. E. Milam', 'library/covers/571f24df.jpg', 'made'),
  ('Set Apart - Calling a Worldly Church to a Godly Life', 'R. Kent Hughes', 'library/covers/c849eb7d.jpg', 'found'),
  ('"My Church" - A Study of the New Testament Church', 'Raleigh L. Campbell', 'library/covers/0a2451ba.jpg', 'made'),
  ('The Church that Jesus Built', 'Roy Mason', 'library/covers/b13f9fc3.jpg', 'made'),
  ('The Myth of the Universal, Invisible Church Theory Exploded', 'Roy Mason', 'library/covers/8f50e4ee.jpg', 'made'),
  ('I will Build my Church', 'Thomas Strouse', 'library/covers/b1f10e17.jpg', 'made'),
  ('The Non-Protestant Baptists', 'WM. F. Bekgaard', 'library/covers/b1662b1a.jpg', 'made'),
  ('A Handbook for Minister''s Wives', 'Dorothy Kelley Patterson', 'library/covers/9305c4be.jpg', 'made'),
  ('The Pastor''s Wife and the Church', 'Dorothy Harrison Pentecost', 'library/covers/e56dbb9a.jpg', 'found'),
  ('The Private Life of the Minister''s Wife', 'Betty J. Coble', 'library/covers/842f8fb9.jpg', 'found'),
  ('Making Money from Home', 'Donna Partow', 'library/covers/c9927f81.jpg', 'found')
  ) as v(title, author, cover, kind)
 where lower(b.title) = lower(v.title) and lower(b.author) = lower(v.author)
   and (b.cover is null or (b.cover_kind = 'made' and v.kind = 'found'));
-- END library covers
