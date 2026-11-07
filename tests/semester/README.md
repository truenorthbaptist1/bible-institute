# Simulated semester (Nov 7, 2026)

A whole term of one course, run privately with the clock moving from the
first sign-up to transcripts: Spring 2027, "Hermeneutics II", hybrid,
Wednesdays 7 PM, 15 weeks from Jan 13, attendance 10% of the grade.

- People: the church Google account (Admin), a new teacher, six students —
  two in the classroom, two live online, one on recordings, one who drops.
- Every day: the real background service (`attendance-reminders`) runs at
  3 AM, 8 AM and 5 PM, plus around each class (reminders, YouTube playlist
  sync, online attendance, email, backups).
- Each class: the stream appears in a fake YouTube playlist, the teacher
  starts and ends Teach mode, live students check in minute by minute, the
  teacher takes classroom attendance on the real page, the recording posts,
  recorded students watch it.
- Along the way: weekly quizzes (turned in, one late, one missed), a
  midterm locked until its day, a snow day canceled, a class moved to
  Thursday, a make-up day, a student dropped, an announcement, discussion
  posts, private messages.
- At the end: grades checked against an independent calculation, Record
  Final Grades, transcripts, phone calendar, Copy for a New Term, archive,
  and the term's email and backup totals.

Any JavaScript error on any page counts as a failure.

## Run

    sh tests/semester/start_db.sh            # once; needs: apt-get install faketime
    sh tests/semester/run_semester.sh        # setup, term, end (about 30 minutes)

Phases can be saved and resumed: `run_semester.sh setup snap:setup`, then
`KEEP_SIM=1 run_semester.sh restore:setup term snap:term`, then
`KEEP_SIM=1 run_semester.sh restore:term end`. Results, screenshots and the
emails sent are in /tmp/sim. Set /tmp/simclock back to `+0` before running
the other tests.

## First run — Nov 7, 2026

About 620 checks. Three bugs found and fixed (commit with this file):
1. Move a Class did nothing on the Manage page (its button shared the id
   `mvSave` with the Memory Verse card's Save button).
2. Picking a weekly series' documents one at a time put every document on
   every week (the "same each week" mode stuck from the first pick).
3. People whose sign-up was approved weren't emailed (the "welcome" notice
   wasn't one of the always-emailed kinds).

## Round 2 — a messy term (Nov 7, 2026)

`ROUND=round2.py sh tests/semester/run_semester.sh` (set `SIM=/tmp/sim2` to keep
round 1's results). "Romans", hybrid, Tue/Thu 8:30 PM, Oct 2027 → Jan 2028
(daylight saving ends, Thanksgiving, Christmas, New Year), 35 students, with:
a student joining in week 4, a track switch, a student in Panama, accented and
duplicate names, a deleted account, a drop and re-enroll, a substitute teacher,
a stream that starts late, a stream that splits in two, a recording posted 10
days late, a deleted video, YouTube's daily limit running out, Gmail refusing
the password for 4 days, a mid-term time change, a move onto a day that
already has class, a make-up added then canceled, a cancel after attendance,
points changed after grading, extra credit, a graded assignment deleted,
weights that add to 90, an Incomplete, and final grades.
`check` lines must pass; `observe` lines are written to round2_observed.json
for a person to read.

Found and fixed:
1. Notices created while Gmail was refusing were marked sent and lost. They
   now go back in the queue, and retries wait 15 minutes (an hour for the
   sending limit) instead of every minute.
2. A student added mid-term got zeros for work due before they joined, and
   online students were marked Absent for classes before they joined.
3. Assignments couldn't be edited after they were made (due date, points,
   weight, name, instructions, opening date). Now there's an Edit button; for a
   weekly series each week's due date can be moved, and students are told.
4. Two students with the same name looked identical on staff screens; their
   emails now show under the name.
5. A recording uploaded late lands on the latest class day; the teacher now
   sees "No recording for <day>" under Needs Your Attention.
