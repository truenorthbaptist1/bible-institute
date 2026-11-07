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
