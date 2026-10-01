-- ============================================================================
-- Starter course catalogue — the Institute's real courses, taken from the
-- church Google Drive (TNBC Bible Institute > Past Classes).
--
-- Run this ONCE, after schema.sql. It only adds courses; it never changes or
-- removes anything already there. No students, assignments, or files are
-- seeded — those come from real people signing up and faculty using the
-- site, which is exactly what testing should exercise.
--
-- Schedules: adjust them on each course's Manage page. "Genesis to
-- Revelation" is set to start in the future on purpose, so students can
-- try the "Request Enrollment" flow during testing.
-- ============================================================================

insert into public.courses (id, title, description, credits, level, sched_weeks, sched_days, sched_time, sched_mode, sched_start)
values
  ('c1', 'Hermeneutics I',
   'Principles of biblical interpretation — how to rightly divide the Word of Truth using literary, historical, and cultural context.',
   3, '100', 15, '{Wed}', '19:00', 'now', '2026-08-26'),
  ('c2', 'Homiletics and Bible Preaching',
   'Sermon structure, delivery, and expository preparation for the pulpit ministry.',
   3, '300', 14, '{Tue}', '18:30', 'now', '2026-08-25'),
  ('c3', 'Landmarks of Baptist Doctrine (Bibliology 101)',
   'A thorough examination of the doctrine of the Bible — inspiration, inerrancy, preservation, and canon — from a historic Baptist perspective.',
   3, '100', 15, '{Mon}', '19:00', 'now', '2026-08-24'),
  ('c4', 'Creation, Evolution and The Bible',
   'A biblical case for six-day creation and a critical look at evolutionary theory in light of Scripture.',
   2, '200', 10, '{Thu}', '19:00', 'now', '2026-08-27'),
  ('c5', 'Landmarks of English Bible (Manuscript Evidence)',
   'The transmission and preservation of the New Testament text, from the apostles to the Textus Receptus.',
   3, '400', 15, '{Fri}', '18:00', 'now', '2026-08-28'),
  ('c6', 'Landmarks of Church History (Church History I & II)',
   'Church history from the apostolic era through the modern age, tracing the Baptist distinctives along the way.',
   3, '200', 15, '{Mon}', '19:00', 'now', '2026-08-24'),
  ('c7', 'Landmarks of Baptist Doctrine (The Life of Paul)',
   'A biographical survey of the Apostle Paul''s ministry, epistles, and missionary journeys.',
   2, '300', null, '{}', null, null, null),
  ('c8', 'Genesis to Revelation Course',
   'A chronological, book-by-book overview of the entire Bible from Genesis to Revelation.',
   4, '100', 20, '{Tue}', '18:00', 'scheduled', '2026-11-03')
on conflict (id) do nothing;
