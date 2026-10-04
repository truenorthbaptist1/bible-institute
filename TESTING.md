# Testing the Bible Institute site

## Already verified (before hand-off)

_Oct 2026 updates: My Profile (photos, contact details) and course teachers (only a course's teacher sees its grades, messages, and discussion). Then (Oct 3): attendance, calendar dialogs, class reminders, the in-page document reader, Submit Work, the approval queue, and the day/night look. The database check is now 187/187; the browser run has 135 checks._

**Database privacy rules — 88 automated checks, all passing** (`tests/db/`).
The schema was loaded into a real PostgreSQL database and each rule was tested
by acting as specific people. Highlights:

- Sign-up always creates a student, even if someone tampers with the form
- Students can't see classmates' emails, grades, submissions, or messages — the database refuses, not just the screens
- Students can't grade or change graded work, back-date a turn-in, submit before a locked assignment opens, post as someone else, or forge a notification
- Only faculty manage courses, rosters, and accounts; only Super Admins grant Super Admin (max 4)
- Typing the church email into Sign Up does **not** grant Super Admin; only a Google sign-in does
- Inactive accounts see nothing; deleting an account removes everything tied to it
- Course files and submitted files are private to the right people

**The full site in a real browser — 64 checks, all passing, zero JavaScript errors** (`tests/e2e/`).
Headless Chrome played several people at once through a compressed semester:
Super Admin bootstrap → student sign-ups → roster, materials, assignments
(standalone + locked weekly series) → turn-ins by editor and by file → enrollment
request approved and denied-with-note → grading and feedback → private messages
both ways (replies appear in an open thread without reloading) → discussion
board → Study Bible reading, Strong's, highlights → calendar, grade sheet,
resource library → role changes, deactivation, archive and delete → phone-sized
screens with no sideways scrolling.

Bugs found and fixed along the way included: dates displaying a day early
anywhere west of London (including Alaska), the notification bell rendering as a
dot, a student's denial-note reply never reaching the faculty inbox, new
sign-ups not appearing in faculty lists until a reload, the Study Bible
overflowing on phones, and student-written work being displayed without being
cleaned of hidden code.

## What only the real site can test

The automated tests used a stand-in for Supabase's sign-in and storage, so
these need real people on the real test site:

1. **Emails arrive** — sign-up confirmation and password reset, to Gmail,
   Yahoo, Outlook, and a church address. Check spam folders.
2. **Google sign-in** works for the church account and a regular Gmail.
3. **Real files** — upload a large PDF, a Word document, and a phone photo
   (iPhone photos are often HEIC); open and download them on another device.
4. **Account deletion** works from Settings (it relies on a Supabase permission
   the local test couldn't fully reproduce).
5. **Phones and tablets** — iPhone Safari, Android Chrome, an older iPad.
6. **Slow internet** — try it on a weak connection.
7. **Profile photos** (added Oct 2026) — on an iPhone, tap *Add a Photo* and
   choose from the photo library *and* take a new picture; repeat on Android.
   Drag/zoom in the round frame, save, and confirm the photo shows in the top
   bar and beside discussion replies on another person's screen. Then delete
   a test account that has a photo and confirm no error.
8. **Course teachers** (added Oct 2026) — with a second faculty account: open
   a course you don't teach (read-only summary; not in your Grading, Inbox,
   or Discussion lists); have a Super Admin assign you to it and confirm the
   grade book and messages appear for you and disappear for the previous
   teacher; confirm a started course's teacher can't hand it off.
9. **Phone reminders** (added Oct 2026) — on a teacher's iPhone: add the site to
   the Home Screen, open it from there, My Profile → Class Reminders → Turn On →
   Send a Test. Repeat on Android (Chrome). Then set a test course's class time a
   few minutes ahead with attendance on, and confirm the notification arrives and
   opens that day's attendance.
10. **Documents in the page** — open a large PDF, a Word .docx, and an iPhone
   photo on a phone; try Save as PDF and Download.
11. **Approval queue** — sign up with a new email, confirm it, and check that a
   Super Admin gets the bell and can approve from Settings → Users & Roles.

The printable **Pre-Launch Test Checklist** (shared in our conversation)
walks through these with pass/fail boxes.

## Recommended pilot

Pick one course and 4–6 willing students (a mix of comfortable and
not-so-comfortable with computers) and run a few real weeks on it. Keep the
Google Drive versions available during the pilot, and give everyone one place
to report problems (an email address or a Google Form).

## Re-running the automated checks (for whoever maintains the site)

Needs PostgreSQL 15+ and Python 3 with Playwright, on Linux or macOS.
Edit the connection settings at the top of the scripts, then:

```
tests/db/run_tests.sh      # database privacy rules
tests/e2e/run_e2e.sh       # full site in headless Chrome
```

Run both after any change to `supabase/schema.sql` or the site's code.
