# Testing the Bible Institute site

## Already verified (before hand-off)

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
