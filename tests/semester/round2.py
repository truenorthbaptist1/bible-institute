#!/usr/bin/env python3
"""Round 2 (Nov 7, 2026): a messy fall term, looking for blind spots.

"Romans", hybrid, Tue/Thu 8:30 PM, 120 minutes, attendance 15% of the
grade, Oct 5, 2027 → Jan 13, 2028 — across the end of daylight saving
time (Nov 7), Thanksgiving, Christmas break and New Year. On top of that,
unusual events: late joiners, track switches, a student abroad, deleted
accounts, a substitute teacher, late/split/deleted recordings, YouTube's
quota running out, Gmail failing for days, mid-term schedule changes,
grading oddities, and the end-of-term paperwork.

`check` = something the site must get right. `observe` = what the site
did in a situation the code may not have planned for (read in the report).
Run:  sh tests/semester/run_semester.sh  →  with ROUND=round2.py (see run_round2.sh)
"""
import datetime as dt, json, os, sys
from sim import *  # noqa

B = Browsers()
TITLE = "Romans"
PL = "PLsimRomans"
START = dt.date(2027, 10, 5)          # a Tuesday
WEEKS = 15
admin = Person("True North Baptist", "truenorthbaptist1@gmail.com", google=True)
teacher = Person("Andrew Hale", "andrew.hale@example.com")
sub = Person("Mark Benson", "mark.benson@example.com")
P = {
    "sean":   Person("Seán O'Brien", "sean.obrien@example.com"),                    # classroom
    "jose":   Person("José Núñez", "jose.nunez@example.com", tz="America/Panama"),  # live, in Panama
    "mary1":  Person("Mary Smith", "mary.smith@example.com"),                       # recordings
    "mary2":  Person("Mary Smith", "mary.e.smith@example.com"),                     # classroom, same name
    "abby":   Person("Abigail Fox", "abigail.fox@example.com"),                     # classroom → recordings (week 4)
    "daniel": Person("Daniel Kim", "daniel.kim@example.com"),                       # joins week 4, live
    "grace":  Person("Grace Lee", "grace.lee@example.com"),                         # joins week 4, classroom
    "peter":  Person("Peter Walsh", "peter.walsh@example.com"),                     # account deleted week 6
    "naomi":  Person("Naomi Reyes", "naomi.reyes@example.com"),                     # drops week 3, back week 5
    "ruthann": Person("Ruth Ann Cole", "ruthann.cole@example.com"),                 # drops week 7 for good
}
TRACK = {"sean": "classroom", "jose": "live", "mary1": "recorded", "mary2": "classroom", "abby": "classroom",
         "daniel": "live", "grace": "classroom", "peter": "recorded", "naomi": "classroom", "ruthann": "classroom"}
LATE = ("daniel", "grace")
FILLERS = 25                           # → a class of 35
fillers = []
cid = None


def site(page, js, arg=None):
    """Runs the site's own code in a signed-in page; returns 'ok' or the error."""
    return page.evaluate("async ([js, arg]) => { try { const f = eval('(async (arg) => {' + js + '})'); const r = await f(arg); return r === undefined ? 'ok' : r; } catch (e) { return 'ERROR: ' + (e.message || e); } }", [js, arg])


def enrolled(key):
    return q(f"select count(*) from enrollments where course_id = '{cid}' and student_id = '{P[key].id}'") == "1"


def mkperson(name, email):
    import uuid
    uid = str(uuid.uuid4())
    q(f"insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ('{uid}', '{email}', "
      f"'{json.dumps({'full_name': name}).replace(chr(39), chr(39)*2)}', now());"
      f"update public.profiles set status = 'active' where id = '{uid}';")
    return uid


def meetings():
    """Every scheduled Tue/Thu (before cancellations)."""
    out = []
    for i in range(WEEKS * 7):
        d = START + dt.timedelta(days=i)
        if d.weekday() in (1, 3):
            out.append(d)
    return out


def held_dates():
    """Class days the database thinks happen (after cancels/moves/additions)."""
    return [r["d"] for r in qj(f"select d::text from public.course_class_dates('{cid}') d order by 1")]


# =====================================================================
def phase_setup():
    global cid
    set_clock(ak(2027, 9, 20, 10, 0))
    a = B.session(admin)
    for who in [teacher, sub] + list(P.values()):
        who.id = mkperson(who.name, who.email)
    for i in range(FILLERS):
        fillers.append(mkperson(f"Student {i + 1:02d} Filler", f"filler{i + 1:02d}@example.com"))
    q(f"update profiles set role = 'faculty' where id in ('{teacher.id}', '{sub.id}')")
    B.close_all()

    log("Teacher sets up Romans")
    t = B.session(teacher)
    r = site(t, f"""
      const id = await DB.createCourse({{ title: 'Romans', description: 'Verse by verse through Romans.', credits: 3, level: '200',
                   facultyId: currentUser.id, att: {{ on: true, weight: 15, lateCredit: 50 }} }});
      await DB.updateCourse(id, {{ format: 'hybrid', playlist_id: '{PL}', class_minutes: 120 }});
      await DB.saveSchedule(id, {{ weeks: {WEEKS}, days: ['Tue', 'Thu'], time: '20:30', mode: 'scheduled', startDate: '{START}' }});
      const rows = [];
      const sid = 's_' + newId();
      for (let i = 0; i < 14; i++) {{ const d = new Date('{START}T00:00:00'); d.setDate(d.getDate() + 7 + 7 * i);
        rows.push({{ title: 'Reading — Week ' + (i + 1), due: localISO(d), points: 10, weight: 40, seriesId: sid, seriesLabel: 'Reading' }}); }}
      rows.push({{ title: 'Paper 1', due: '2027-10-28', points: 50, weight: 20 }});
      rows.push({{ title: 'Exam', due: '2028-01-11', points: 100, weight: 30 }});
      await DB.addAssignments(id, rows);
      await DB.addPlanLessons(id, Array.from({{ length: 30 }}, (_, i) => ({{ title: 'Romans ' + (Math.floor(i / 2) + 1) + (i % 2 ? 'b' : 'a') }})));
      return id;""")
    cid = r
    check(r and not str(r).startswith("ERROR"), "setup", "Romans is created", r)
    observe("assignments", "weights add up to", q(f"select sum(w) from (select distinct coalesce(series_id, id::text), weight w from assignments where course_id = '{cid}') x"))
    # Everyone but the late joiners is on the roster from the start.
    for k, who in P.items():
        if k in LATE:
            continue
        q(f"insert into enrollments (course_id, student_id, track, track_chosen) values ('{cid}', '{who.id}', '{TRACK[k]}', true)")
    q("insert into enrollments (course_id, student_id) select '" + cid + "', unnest(array[" + ",".join(f"'{f}'::uuid" for f in fillers) + "])")
    B.close_all()
    for d in range(21, 32):
        if d <= 30:
            tick(ak(2027, 9, d, 8, 1))
    for d in range(1, 5):
        tick(ak(2027, 10, d, 8, 1))


# ---------------------------------------------------------------- helpers
def add_video(vid, title, start_utc, minutes, live=False, recorded=None):
    yt_add(PL, {"id": vid, "title": title, "duration": "P0D" if live else f"PT{minutes // 60}H{minutes % 60}M",
                "live": "live" if live else "none", "published": start_utc.isoformat(),
                "streamStart": start_utc.isoformat(), **({"recorded": recorded} if recorded else {})})


def end_video(vid, minutes, recorded=None):
    db = yt_load()
    for v in db["playlists"][PL]:
        if v["id"] == vid:
            v.update({"live": "none", "duration": f"PT{minutes // 60}H{minutes % 60}M"})
            if recorded:
                v["recorded"] = recorded
    json.dump(db, open(os.path.join(SIM, "youtube.json"), "w"), indent=1)


def remove_video(vid):
    db = yt_load()
    db["playlists"][PL] = [v for v in db["playlists"][PL] if v["id"] != vid]
    json.dump(db, open(os.path.join(SIM, "youtube.json"), "w"), indent=1)


def live_watch(d, who, start_local, minutes):
    sql_by_min = {}
    for m in range(minutes):
        set_clock(start_local + dt.timedelta(minutes=m, seconds=5))
        s = ""
        for key in who:
            s += (f"set role authenticated; select set_config('request.jwt.claim.sub', '{P[key].id}', false) \\g /dev/null\n"
                  f"select public.record_live_minute('{cid}') \\g /dev/null\nreset role;\n")
        q(s)


def watch(key, lesson_id, when, minutes_apart=50):
    set_clock(when)
    q(f"select public.record_lesson_progress('{lesson_id}', '{'1' * 50 + '0' * 150}', 7200)", as_user=P[key].id)
    set_clock(when + dt.timedelta(minutes=minutes_apart))
    return q(f"select public.record_lesson_progress('{lesson_id}', '{'1' * 200}', 7200)", as_user=P[key].id)


def lessons_on(d):
    return [r["lesson_id"] for r in qj(f"select lesson_id from public.lesson_schedule('{cid}') where class_date = '{d}'")]


def att(key, d):
    return q(f"select coalesce(status, '-') || coalesce(' (' || nullif(note, '') || ')', '') from attendance where course_id = '{cid}' and class_date = '{d}' and student_id = '{P[key].id}'") or "—"


def class_time():
    return q(f"select sched_time from courses where id = '{cid}'")


def take_attendance(d, marks):
    """Teacher (or whoever teaches now) takes classroom attendance on the real page."""
    who = sub if q(f"select faculty_id from courses where id = '{cid}'") == sub.id else teacher
    t = B.session(who)
    go(t, "attendance", cid)
    t.evaluate("(d) => { attendanceDate = d; attDraft = null; renderMain(); }", d.isoformat()); settle(t)
    if t.locator("#attAllPresent").count():
        t.click("#attAllPresent")
    for key, m in marks.items():
        row = t.locator(f".att-row[data-student='{P[key].id}']")
        if row.count():
            row.locator(f"[data-mark={m}]").click()
    btn = t.locator("#attSave")
    if btn.count():
        btn.click(); settle(t)
    else:
        observe("attendance", f"no Save button on the attendance page for {d}", t.inner_text("#main")[:200])
    B.close_all()


# =====================================================================
def run_class(d, n, *, stream_late=0, crash=False, post_late_days=0, extra=None):
    """One class night: stream, live viewers, attendance, recording."""
    hh, mm = map(int, class_time().split(":")[:2])
    mins = int(q(f"select class_minutes from courses where id = '{cid}'"))
    start = dt.datetime(d.year, d.month, d.day, hh, mm, tzinfo=AK)
    real_start = start + dt.timedelta(minutes=stream_late)
    vid = f"RomansCls{n:02d}"
    tick(start - dt.timedelta(minutes=14), start - dt.timedelta(minutes=5))
    add_video(vid, f"Romans — class {n}", real_start.astimezone(dt.timezone.utc), mins, live=True)
    tick(start - dt.timedelta(minutes=2))
    live = [k for k in ("jose", "daniel") if enrolled(k) and q(f"select track from enrollments where course_id='{cid}' and student_id='{P[k].id}'") == "live"]
    if live:
        live_watch(d, live, real_start, mins)  # they watch the whole stream, from when it really starts
    end_m = mins if not crash else 50
    marks = {"sean": "present", "mary2": "present", "abby": "present", "grace": "present", "naomi": "present", "ruthann": "present"}
    if extra:
        marks.update(extra)
    marks = {k: v for k, v in marks.items() if enrolled(k) and q(f"select track from enrollments where course_id='{cid}' and student_id='{P[k].id}'") == "classroom"}
    set_clock(start + dt.timedelta(minutes=mins + 10))
    take_attendance(d, marks)
    if post_late_days:
        remove_video(vid)        # the stream was never put in the playlist; posted later by hand
    elif crash:
        end_video(vid, 50)
        add_video(vid + "b", f"Romans — class {n} (part 2)", (real_start + dt.timedelta(minutes=55)).astimezone(dt.timezone.utc), mins - 55)
    else:
        end_video(vid, mins)
    tick(start + dt.timedelta(minutes=mins + 35), start + dt.timedelta(minutes=mins + 70))
    return vid


# =====================================================================
def phase_term():
    global cid
    cid = q(f"select id from courses where title = '{TITLE}' order by created_at limit 1")
    for who in [admin, teacher, sub] + list(P.values()):
        who.load_id()
    mt = meetings()
    n = 0
    day = START - dt.timedelta(days=1)
    last = dt.date(2028, 1, 20)
    while day <= last:
        tick(ak(day.year, day.month, day.day, 3, 5), ak(day.year, day.month, day.day, 8, 1), ak(day.year, day.month, day.day, 18, 0))

        # ---------------- events before class
        if day == dt.date(2027, 10, 14):
            open(os.path.join(SIM, "yt_quota"), "w").close()
            log("YouTube's daily limit runs out (Oct 14–16)")
        if day == dt.date(2027, 10, 17):
            os.remove(os.path.join(SIM, "yt_quota"))
            ps = qj(f"select ok, error from playlist_sync where course_id = '{cid}'")
            observe("youtube", "what the site recorded while YouTube's limit was out (before it recovered)", ps)
        if day == dt.date(2027, 10, 18):
            set_clock(ak(2027, 10, 18, 19, 0))
            log("Naomi drops (week 3)")
            t = B.session(teacher)
            check(site(t, f"await DB.unenroll('{cid}', '{P['naomi'].id}')") == "ok", "roster", "teacher removes Naomi")
            B.close_all()
        if day == dt.date(2027, 10, 22):
            # The Oct 12 recording finally goes up (10 days late, no recording date set).
            add_video("RomansLate03", "Romans — class 3", ak(2027, 10, 22, 12, 0).astimezone(dt.timezone.utc), 120)
            tick(ak(2027, 10, 22, 12, 40))
            ls = qj(f"select l.title, s.class_date from lessons l left join public.lesson_schedule('{cid}') s on s.lesson_id = l.id where l.course_id = '{cid}' order by l.added_at")
            observe("lectures", "where a recording posted 10 days late (no recording date) lands", [x for x in ls if "class 3" in x["title"]])
        if day == dt.date(2027, 10, 25):
            set_clock(ak(2027, 10, 25, 18, 0))
            log("Daniel (live) and Grace (classroom) join in week 4")
            t = B.session(teacher)
            for k in LATE:
                check(site(t, f"await DB.enroll('{cid}', '{P[k].id}')") == "ok", "roster", f"teacher adds {P[k].name} in week 4")
            site(t, f"await DB.setStudentTrack('{cid}', '{P['daniel'].id}', 'live')")
            B.close_all()
            tick(ak(2027, 10, 25, 18, 5))
            for k in LATE:
                p = B.session(P[k])
                g = p.evaluate("(cid) => { const c = courses.find(x => x.id === cid); const r = computeCourseGrade(c, currentStudentId); return { pct: r.pct, letter: r.letter, asg: r.assignmentsPct, att: r.attendance && r.attendance.pct, zeros: c.assignments.filter(a => assignmentOutcome(c, a, currentStudentId) === 0).map(a => a.title) }; }", cid)
                observe("late joiner", f"{P[k].name}'s grade the day they join", g)
                check(not g.get("zeros"), "late joiner", f"{P[k].name} isn't given zeros for work due before joining", g)
                go(p, "home")
                tw = p.evaluate("(() => { try { const t = thisWeekItems(); return { missed: (t.missed || []).length, overdue: JSON.stringify(t).match(/overdue|late/gi) ? 'mentions overdue' : '' }; } catch (e) { return e.message; } })()")
                observe("late joiner", f"{P[k].name}'s This Week on joining", tw)
                shot(p, f"late-joiner-{k}")
                B.close_all()
        if day == dt.date(2027, 10, 28):
            set_clock(ak(2027, 10, 28, 12, 0))
            p = B.session(P["abby"])
            r = site(p, f"await DB.setMyTrack('{cid}', 'recorded')")
            observe("track switch", "Abigail switches herself from classroom to recordings in week 4", r)
            B.close_all()
        if day == dt.date(2027, 11, 18):
            set_clock(ak(2027, 11, 18, 12, 0))
            log("Ruth Ann drops for good")
            s_ = B.session(sub)
            site(s_, f"await DB.unenroll('{cid}', '{P['ruthann'].id}')")
            B.close_all()
        if day == dt.date(2027, 11, 3):
            set_clock(ak(2027, 11, 3, 12, 0))
            log("Naomi re-enrolls")
            t = B.session(teacher)
            site(t, f"await DB.enroll('{cid}', '{P['naomi'].id}')")
            B.close_all()
            subs = q(f"select count(*) from submissions s join assignments a on a.id = s.assignment_id where a.course_id = '{cid}' and s.student_id = '{P['naomi'].id}'")
            observe("re-enroll", "Naomi's earlier turned-in work after she comes back", subs + " submissions still there")
            observe("re-enroll", "Naomi's attendance rows from before she dropped", qj(f"select class_date, status from attendance where course_id = '{cid}' and student_id = '{P['naomi'].id}' order by 1"))
        if day == dt.date(2027, 11, 4):
            set_clock(ak(2027, 11, 4, 10, 0))
            log("Teacher moves class to 7:00 PM, 90 minutes, from now on")
            t = B.session(teacher)
            r = site(t, f"await DB.saveSchedule('{cid}', {{ weeks: {WEEKS}, days: ['Tue','Thu'], time: '19:00', mode: 'scheduled', startDate: '{START}' }}); await DB.updateCourse('{cid}', {{ class_minutes: 90 }});")
            check(r == "ok", "schedule", "teacher changes the class time mid-term", r)
            B.close_all()
            observe("schedule", "earlier attendance after the time change (Oct dates kept?)", q(f"select count(*) from attendance_days where course_id = '{cid}'"))
        if day == dt.date(2027, 11, 10):
            log("The first half of Oct 7's split recording is deleted from YouTube")
            before = {k: att(k, dt.date(2027, 10, 7)) for k in ("mary1", "peter")}
            remove_video("RomansCls02")
            q(f"update playlist_sync set synced_at = now() - interval '1 hour' where course_id = '{cid}'")
            tick(ak(2027, 11, 10, 12, 0))
            after = {k: att(k, dt.date(2027, 10, 7)) for k in ("mary1", "peter")}
            observe("deleted video", "Oct 7 attendance of recorded students before → after the video was deleted", {"before": before, "after": after})
        if day == dt.date(2027, 11, 11):
            set_clock(ak(2027, 11, 11, 9, 0))
            log("Admin deletes Peter's account (he asked)")
            a = B.session(admin)
            r = site(a, f"await DB.deleteUser('{P['peter'].id}')")
            check(r == "ok", "accounts", "Admin deletes Peter's account mid-term", r)
            B.close_all()
            t = B.session(teacher)
            for v in ("gradeSheet", "attendance", "manage", "messages", "grading"):
                go(t, v, cid)
            B.close_all()
        if day == dt.date(2027, 11, 15):
            open(os.path.join(SIM, "gmail_off"), "w").close()
            log("Gmail stops accepting the password (Nov 15–18)")
        if day == dt.date(2027, 11, 16):
            set_clock(ak(2027, 11, 16, 9, 0))
            log("The teacher has to step away; the Admin makes him inactive and hands the course to Mark Benson")
            a = B.session(admin)
            go(a, "settings")
            row = a.locator(".user-row", has_text="Andrew Hale")
            b = row.locator("[data-inactive]")
            if b.count():
                b.click(); confirm(a)
            check(q(f"select status from profiles where id = '{teacher.id}'") == "inactive", "accounts", "Andrew Hale is inactive")
            go(a, "manage", cid)
            reveal_tab(a, "setup")
            sel = a.locator("#mgTeacher")
            if sel.count():
                sel.select_option(sub.id); a.click("#mgSaveTeacher"); confirm(a); settle(a)
            else:
                observe("substitute", "Admin's Teacher card", a.inner_text("#mgTeacherCard")[:300])
            check(q(f"select faculty_id from courses where id = '{cid}'") == sub.id, "substitute", "Mark Benson is now the teacher")
            B.close_all()
            p = B.session(P["sean"])
            go(p, "messages")
            p.locator("li", has_text=TITLE).first.click(); settle(p)
            p.fill("#msgInput", "Is class still on Thursday with Bro. Hale gone?"); p.click("#msgSend"); settle(p)
            B.close_all()
            tick(ak(2027, 11, 16, 9, 10))
            to = qj(f"select p.name from notifications n join profiles p on p.id = n.user_id where n.subject ilike '%message%' and n.created_at > now() - interval '15 minutes'")
            observe("substitute", "who is notified of Seán's message after the switch", to)
        if day == dt.date(2027, 11, 19):
            os.remove(os.path.join(SIM, "gmail_off"))
            before = len(mails())
            tick(ak(2027, 11, 19, 19, 0), ak(2027, 11, 19, 19, 20), ak(2027, 11, 19, 20, 0))
            observe("email", "emails sent the morning Gmail works again", len(mails()) - before)
            lost = q("select count(*) from notifications where kind in ('message','teacher') and emailed_at is null")
            got_mark = [m for m in mails() if m["to"] == sub.email]
            check(got_mark, "email", "notices from the outage reach the substitute once Gmail works", [m["subject"] for m in got_mark])
            st = qj("select key, ok, detail from service_status where key in ('email','backup_email')")
            observe("email", "what Settings → Backups/Email showed", st)
        if day == dt.date(2027, 11, 22):
            set_clock(ak(2027, 11, 22, 12, 0))
            s = B.session(sub)
            site(s, f"await DB.cancelClass('{cid}', '2027-11-25', 'Thanksgiving')")
            for d in ("2027-12-21", "2027-12-23", "2027-12-28", "2027-12-30"):
                site(s, f"await DB.cancelClass('{cid}', '{d}', 'Christmas break')")
            log("Substitute tries to move Thu Dec 2's class onto Tue Dec 7, which already has class")
            go(s, "manage", cid)
            s.evaluate("([c, d]) => openMoveClass(courses.find(x => x.id === c), d)", [cid, "2027-12-02"])
            s.wait_for_selector("#moveDate"); s.fill("#moveDate", "2027-12-07"); s.click("#moveSave"); settle(s)
            observe("move class", "moving a class onto a day that already has class", {"toast": toast_text(s), "Dec 2 canceled": q(f"select count(*) from class_cancellations where course_id='{cid}' and class_date='2027-12-02'"), "class days in Dec 1–8": [d for d in held_dates() if "2027-12-01" <= d <= "2027-12-08"]})
            B.close_all()
            tick(ak(2027, 11, 22, 12, 5))
            # due dates that now fall on canceled days
            due = qj(f"select a.title, a.due from assignments a join class_cancellations x on x.course_id = a.course_id and x.class_date = a.due where a.course_id = '{cid}'")
            observe("cancel class", "assignments still due on a canceled day", due)
        if day == dt.date(2027, 12, 13):
            set_clock(ak(2027, 12, 13, 12, 0))
            s = B.session(sub)
            r1 = site(s, f"await DB.addClassDay('{cid}', '2028-01-18', 'Make-up for Thanksgiving')")
            B.close_all()
            tick(ak(2027, 12, 13, 12, 5))
            s = B.session(sub)
            r2 = site(s, f"await DB.cancelClass('{cid}', '2028-01-18', 'Never mind — no make-up needed')")
            B.close_all()
            tick(ak(2027, 12, 13, 12, 10))
            observe("make-up", "add a make-up day, then cancel it", {"add": r1, "cancel": r2, "still a class day": "2028-01-18" in held_dates(),
                     "notices to Seán": [x["subject"] for x in qj(f"select subject from notifications where user_id = '{P['sean'].id}' and created_at > now() - interval '20 minutes'")]})

        # ---------------- class nights
        if day in mt and day.isoformat() in held_dates():
            n += 1
            log(f"Class {n} on {day}")
            kw = {}
            if n == 1:
                kw["stream_late"] = 25
            if n == 2:
                kw["crash"] = True
            if n == 3:
                kw["post_late_days"] = 10
            run_class(day, n, **kw)
            # recorded students watch next evening
            for k in ("mary1", "peter", "abby"):
                if not enrolled(k) or q(f"select track from enrollments where course_id='{cid}' and student_id='{P[k].id}'") != "recorded":
                    continue
                for lid in lessons_on(day):
                    if k == "mary1" and n == 2 and lid != lessons_on(day)[0]:
                        continue  # Mary watches only part 1 of the split class
                    watch(k, lid, ak(*(day + dt.timedelta(days=1)).timetuple()[:3], 19, 0))
            if n == 1:
                observe("late stream", "José watched the whole stream that started 25 min late", att("jose", day))
            if n == 2:
                observe("split stream", "Oct 7 (two videos): Mary watched part 1 only; Peter watched both", {"mary1": att("mary1", day), "peter": att("peter", day)})
        if day == dt.date(2027, 10, 23):
            for k in ("mary1", "peter"):
                for lid in lessons_on(dt.date(2027, 10, 12)):
                    watch(k, lid, ak(2027, 10, 23, 19, 0))
            observe("late recording", "Oct 12 class (posted Oct 22, watched Oct 23)", {k: att(k, dt.date(2027, 10, 12)) for k in ("mary1", "peter", "jose")})
        if day == dt.date(2027, 12, 9):
            set_clock(ak(2027, 12, 9, 22, 0))
            log("After taking attendance, the substitute marks Dec 9 canceled (power went out half way)")
            before = q(f"select count(*) from attendance where course_id = '{cid}' and class_date = '2027-12-09'")
            s = B.session(sub)
            r = site(s, f"await DB.cancelClass('{cid}', '2027-12-09', 'Power outage')")
            B.close_all()
            observe("cancel after", "canceling a class after attendance was taken", {"result": r, "attendance rows before": before,
                     "after": q(f"select count(*) from attendance where course_id = '{cid}' and class_date = '2027-12-09'"),
                     "day still counted": q(f"select held from attendance_days where course_id = '{cid}' and class_date = '2027-12-09'")})

        # ---------------- weekly reading: due Tuesdays, turned in Monday night
        if day.weekday() == 0:
            set_clock(ak(day.year, day.month, day.day, 21, 0))
            due = (day + dt.timedelta(days=1)).isoformat()
            a = qj(f"select id, title from assignments where course_id = '{cid}' and due = '{due}'")
            for asg in a:
                sql = ""
                for k in P:
                    if enrolled(k) and k not in ("naomi",) and q(f"select status from profiles where id='{P[k].id}'") == "active":
                        sql += (f"set role authenticated; select set_config('request.jwt.claim.sub', '{P[k].id}', false) \\g /dev/null\n"
                                f"insert into submissions (assignment_id, student_id, status, written_content) values ('{asg['id']}', '{P[k].id}', 'submitted', '<p>done</p>') on conflict do nothing;\nreset role;\n")
                for f in fillers[:20]:
                    sql += (f"set role authenticated; select set_config('request.jwt.claim.sub', '{f}', false) \\g /dev/null\n"
                            f"insert into submissions (assignment_id, student_id, status, written_content) values ('{asg['id']}', '{f}', 'submitted', '<p>done</p>') on conflict do nothing;\nreset role;\n")
                try:
                    q(sql)
                except Exception as e:
                    check(False, "turn-in", f"turning in {asg['title']}", e)
        if day.weekday() == 3:   # Thursday: grade what's in
            set_clock(ak(day.year, day.month, day.day, 12, 0))
            q(f"update submissions s set status = 'graded', score = 8 + (abs(hashtext(s.student_id::text)) % 3) from assignments a where a.id = s.assignment_id and a.course_id = '{cid}' and s.status = 'submitted'")

        # ---------------- grading oddities (Paper 1)
        if day == dt.date(2027, 10, 27):
            set_clock(ak(2027, 10, 27, 20, 0))
            pid = q(f"select id from assignments where course_id = '{cid}' and title = 'Paper 1'")
            for k in ("sean", "mary1", "mary2", "jose", "abby"):
                q(f"insert into submissions (assignment_id, student_id, status, written_content) values ('{pid}', '{P[k].id}', 'submitted', '<p>paper</p>')", as_user=P[k].id)
        if day == dt.date(2027, 10, 30):
            set_clock(ak(2027, 10, 30, 12, 0))
            t = B.session(teacher)
            pid = q(f"select id from assignments where course_id = '{cid}' and title = 'Paper 1'")
            for k, sc in (("sean", 45), ("mary1", 55), ("mary2", 38), ("jose", 47), ("abby", 41)):
                site(t, f"await DB.grade({{ assignmentId: '{pid}', studentId: '{P[k].id}', score: {sc}, feedback: '' }})")
            go(t, "gradeSheet", cid)
            names = t.evaluate("[...document.querySelectorAll('#main')].map(m => (m.innerText.match(/Smith, Mary/g) || []).length)[0]")
            observe("same name", "how the grade sheet tells the two Mary Smiths apart", f"'Smith, Mary' appears {names} times; emails shown: {'mary.e.smith' in t.inner_text('#main')}")
            shot(t, "gradesheet-two-marys")
            B.close_all()
            observe("extra credit", "Mary Smith (1) got 55/50 on Paper 1", q(f"select score from submissions where assignment_id = '{pid}' and student_id = '{P['mary1'].id}'"))
        if day == dt.date(2027, 11, 29):
            set_clock(ak(2027, 11, 29, 12, 0))
            log("Substitute moves Reading weeks 11–12 out of Christmas break (Edit assignment)")
            s_ = B.session(sub)
            go(s_, "manage", cid); reveal_tab(s_, "assignments")
            b = s_.locator("[data-edit-series]")
            if check(b.count() > 0, "edit assignment", "weekly series has an Edit button"):
                b.first.click(); s_.wait_for_selector("#eaSave")
                for wk, new_due in ((11, "2028-01-04"), (12, "2028-01-06")):
                    aid = q(f"select id from assignments where course_id = '{cid}' and title = 'Reading — Week {wk}'")
                    s_.fill(f"[data-ea-due='{aid}']", new_due)
                s_.fill("#eaWeight", "45")
                s_.click("#eaSave"); settle(s_)
            B.close_all()
            got = qj(f"select title, due, weight from assignments where course_id = '{cid}' and title in ('Reading — Week 11','Reading — Week 12','Reading — Week 1') order by title")
            check([g["due"] for g in got if g["title"] != "Reading — Week 1"] == ["2028-01-04", "2028-01-06"], "edit assignment", "weeks 11 and 12 move to January", got)
            check(all(float(g["weight"]) == 45 for g in got), "edit assignment", "the series weight changes for every week", got)
            tick(ak(2027, 11, 29, 12, 5))
            n_ = q(f"select count(*) from notifications where user_id = '{P['sean'].id}' and subject like 'Due date changed%'")
            check(n_ == "2", "edit assignment", "students are told the due dates changed", n_)
            s_ = B.session(sub)
            go(s_, "manage", cid); reveal_tab(s_, "assignments")
            pid = q(f"select id from assignments where course_id = '{cid}' and title = 'Paper 1'")
            s_.click(f"[data-edit-assignment='{pid}']"); s_.wait_for_selector("#eaSave")
            s_.fill("#eaPoints", "60"); s_.click("#eaSave"); confirm(s_); settle(s_)
            B.close_all()
            check(q(f"select points from assignments where id = '{pid}'") == "60", "edit assignment", "Paper 1 points change from 50 to 60 (after grading, with a warning)")
        if day == dt.date(2027, 11, 2):
            set_clock(ak(2027, 11, 2, 12, 0))
            t = B.session(teacher)
            w3 = q(f"select id from assignments where course_id = '{cid}' and title = 'Reading — Week 3'")
            r = site(t, f"await DB.deleteAssignments(['{w3}'])")
            observe("delete graded", "teacher deletes a graded week (Reading — Week 3)", {"result": r, "work left": q(f"select count(*) from submissions where assignment_id = '{w3}'")})
            B.close_all()

        # ---------------- Saturday: everyone looks (catches page errors)
        if day.weekday() == 5 and day >= START:
            set_clock(ak(day.year, day.month, day.day, 10, 0))
            for k in ("sean", "jose", "mary1", "daniel", "abby"):
                if enrolled(k):
                    p = B.session(P[k])
                    for v in ("home", "course", "grades", "calendar"):
                        go(p, v, cid if v == "course" else None)
                    B.close_all()
            who = sub if q(f"select faculty_id from courses where id = '{cid}'") == sub.id else teacher
            t = B.session(who)
            for v in ("home", "gradeSheet", "attendance", "manage", "calendar"):
                go(t, v, cid)
            B.close_all()
        day += dt.timedelta(days=1)


# =====================================================================
def phase_end():
    global cid
    cid = q(f"select id from courses where title = '{TITLE}' order by created_at limit 1")
    for who in [admin, teacher, sub] + list(P.values()):
        who.load_id()
    set_clock(ak(2028, 1, 17, 12, 0))
    log("End of term")
    # the late joiners
    for k in LATE:
        p = B.session(P[k])
        g = p.evaluate("(cid) => { const c = courses.find(x => x.id === cid); const r = computeCourseGrade(c, currentStudentId); return { pct: r.pct, letter: r.letter, asg: r.assignmentsPct, att: r.attendance && r.attendance.pct, counts: r.attendance && r.attendance.counts, zeros: c.assignments.filter(a => assignmentOutcome(c, a, currentStudentId) === 0).map(a => a.title) }; }", cid)
        observe("late joiner", f"{P[k].name}'s final grade (joined Oct 25)", g)
        B.close_all()
    pre_join = qj(f"select p.name, a.class_date, a.status, a.note from attendance a join profiles p on p.id = a.student_id where a.course_id = '{cid}' and a.student_id in ('{P['daniel'].id}', '{P['grace'].id}') and a.class_date < '2027-10-25' order by 1, 2")
    observe("late joiner", "attendance recorded for classes BEFORE they joined", pre_join)
    check(not [r for r in pre_join if r["status"] == "absent"], "late joiner", "no Absent for classes before they joined", pre_join)
    observe("track switch", "Abigail's attendance by status", qj(f"select status, count(*) from attendance where course_id = '{cid}' and student_id = '{P['abby'].id}' group by 1"))
    observe("Panama", "José's attendance by status (live, in Panama)", qj(f"select status, count(*) from attendance where course_id = '{cid}' and student_id = '{P['jose'].id}' group by 1"))
    p = B.session(P["jose"])
    go(p, "home")
    tz = p.evaluate("(() => ({ today: todayStr(), browser: Intl.DateTimeFormat().resolvedOptions().timeZone }))()")
    observe("Panama", "José's browser", tz)
    B.close_all()
    observe("DST", "attendance reminders sent to the teacher around the Nov 7 time change", qj(f"select class_date, sent_at at time zone 'America/Anchorage' as sent_ak from attendance_reminders where course_id = '{cid}' and class_date between '2027-11-02' and '2027-11-11' order by 1") if q("select to_regclass('public.attendance_reminders')") else "n/a")

    # final grades: record, correct, Incomplete, and the students who left
    s = B.session(sub)
    go(s, "gradeSheet", cid)
    s.click("#gsRecord"); s.wait_for_selector("#rgSave", timeout=15000)
    rows = s.locator("[data-rg-student]").count()
    observe("final grades", "students listed on Record Final Grades", rows)
    jrow = s.locator(f"[data-rg-student='{P['jose'].id}'] .rg-grade")
    if jrow.count():
        jrow.select_option("I")
    s.click("#rgSave"); settle(s)
    B.close_all()
    check(q(f"select grade from transcript_entries where course_id = '{cid}' and student_id = '{P['jose'].id}'") == "I", "final grades", "José gets an Incomplete")
    observe("final grades", "transcript entries recorded", q(f"select count(*) from transcript_entries where course_id = '{cid}'"))
    s = B.session(sub)
    r = site(s, f"await DB.recordFinalGrades('{cid}', [{{ student: '{P['ruthann'].id}', grade: 'W', percent: null, attendance: null, note: 'Withdrew Nov 9' }}])")
    observe("withdrawn", "recording a W for Ruth Ann (dropped, no longer on the roster)", r)
    B.close_all()
    # Admin route for a W
    a = B.session(admin)
    go(a, "transcripts")
    observe("withdrawn", "Admin Transcripts page offers a way to add an entry", "Add" in a.inner_text("#main"))
    B.close_all()
    tr = qj(f"select student_name, grade, term, start_date, end_date from transcript_entries where course_id = '{cid}' order by student_name limit 4")
    observe("year boundary", "term label and dates on transcripts (Oct 2027 → Jan 2028)", tr)
    # The deleted student
    observe("deleted account", "Peter's transcript entry / work after his account was deleted", {
        "transcript": q(f"select count(*) from transcript_entries where student_name = 'Peter Walsh'"),
        "profile left": q(f"select count(*) from profiles where email = 'peter.walsh@example.com'")})
    # Email over the term
    allm = mails()
    per_day = {}
    for m in allm:
        per_day[m["file"]] = 1
    observe("email", "total emails this term", len(allm))
    json.dump({"observed": OBSERVED}, open(os.path.join(SIM, "round2_observed.json"), "w"), indent=1, default=str)


if __name__ == "__main__":
    phases = sys.argv[1:] or ["setup", "term", "end"]
    try:
        for ph in phases:
            if ph.startswith("snap:"):
                snapshot(ph[5:]); continue
            if ph.startswith("restore:"):
                restore(ph[8:]); continue
            globals()["phase_" + ph]()
    finally:
        B.close_all()
        save_coverage(os.path.splitext(os.path.basename(__file__))[0] + "-" + "-".join(x.replace(":", "_") for x in phases))
        print("\nCHECKS:", CHECKS)
        json.dump({"checks": CHECKS, "findings": FINDINGS, "js_errors": JS_ERRORS, "observed": OBSERVED},
                  open(os.path.join(SIM, "round2_results.json"), "w"), indent=1, default=str)
        for f in FINDINGS:
            print(" -", f)
