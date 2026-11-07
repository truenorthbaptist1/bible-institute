#!/usr/bin/env python3
"""A whole simulated semester on the Bible Institute site — Spring 2027.

One hybrid course ("Hermeneutics II"), Wednesdays 7:00 PM, 15 weeks from
Jan 13, 2027. A new teacher, six students on every way of attending, the
background service running on its real schedule, and the clock moving from
the first sign-up in January to transcripts in May. See README.md.

Run with run_semester.sh (it builds the scratch database and services).
"""
import datetime as dt, json, os, random, sys
from sim import *  # noqa

random.seed(2027)
B = Browsers()
COURSE_TITLE = "Hermeneutics II"
PLAYLIST = "PLsimHermII"
START = dt.date(2027, 1, 13)            # first Wednesday
WEEKS = 15
CLASS_MIN = 90
ATT_WEIGHT = 10                        # attendance is 10% of the grade
CANCELED = dt.date(2027, 2, 10)        # week 5: snow day
MOVED_FROM = dt.date(2027, 3, 17)      # week 10: moved to Thursday (spring break conflict)
MOVED_TO = dt.date(2027, 3, 18)
MAKEUP = dt.date(2027, 4, 28)          # make-up day added after week 15 for the snow day

admin = Person("True North Baptist", "truenorthbaptist1@gmail.com", google=True)
teacher = Person("Thomas Reed", "thomas.reed@example.com")
students = {
    "ruth":   Person("Ruth Bailey", "ruth.bailey@example.com"),            # classroom, near-perfect
    "caleb":  Person("Caleb Dawson", "caleb.dawson@example.com"),          # classroom, misses 2, makes 1 up
    "lydia":  Person("Lydia Ortiz", "lydia.ortiz@example.com", google=True),  # live online
    "silas":  Person("Silas Monroe", "silas.monroe@example.com"),          # live online, leaves early once
    "hannah": Person("Hannah Pruitt", "hannah.pruitt@example.com"),        # recordings
    "jonah":  Person("Jonah Keller", "jonah.keller@example.com"),          # classroom, drops in week 6
}
TRACK = {"ruth": "classroom", "caleb": "classroom", "lydia": "live", "silas": "live", "hannah": "recorded", "jonah": "classroom"}
S = students
course_id = None
asg = {}            # name -> assignment id(s)


def class_dates():
    """The class meetings actually held, in order."""
    out = []
    for w in range(WEEKS):
        d = START + dt.timedelta(days=7 * w)
        if d == CANCELED:
            continue
        out.append(MOVED_TO if d == MOVED_FROM else d)
    return out + [MAKEUP]


def daily_ticks(day):
    """The background service at the moments it does its daily work."""
    tick(ak(day.year, day.month, day.day, 3, 5), ak(day.year, day.month, day.day, 8, 1),
         ak(day.year, day.month, day.day, 17, 0))


# =====================================================================
# Week 0 — before the term
# =====================================================================
def phase_setup():
    global course_id
    set_clock(ak(2027, 1, 4, 9, 0))
    log("Admin signs in for the first time with Google")
    a = B.session(admin)
    check(a.evaluate("isAdmin()"), "accounts", "the church Google account becomes the first Admin")

    # Teacher and students sign up with email + password; Lydia uses Google.
    for who in [teacher] + [p for p in S.values()]:
        page = B.session(who, sign_in=False)
        if who.google:
            page.click("#googleSignInBtn")
        else:
            page.locator(".auth-tabs button", has_text="Sign Up").click()
            page.fill("#suName", who.name); page.fill("#suEmail", who.email)
            page.fill("#suPassword", who.password); page.fill("#suPassword2", who.password)
            page.locator("#signupForm button[type=submit]").click()
        try:
            page.wait_for_selector("#pendingCheck", timeout=15000)
            ok = True
        except Exception:
            ok = False
            shot(page, f"signup-{who.name}")
        check(ok, "sign-up", f"{who.name} signs up and is told to wait for approval", page.inner_text("body")[:300])
        who.load_id()
    tick(ak(2027, 1, 4, 9, 20))
    m = [x for x in mails() if x["to"] == admin.email]
    check(any("waiting for approval" in (x["subject"] + x["body"]).lower() for x in m),
          "email", "the Admin is emailed about new sign-ups waiting", [x["subject"] for x in m])

    log("Admin approves everyone and makes Thomas Reed Faculty")
    go(a, "settings")
    a.click("#userTabs button[data-tab=pending]"); settle(a)
    n_pending = a.locator("[data-approve]").count()
    check(n_pending == 7, "sign-up", "all 7 sign-ups are in the Admin's waiting list", n_pending)
    for _ in range(n_pending):
        a.locator("[data-approve]").first.click(); settle(a)
    a.click("#userTabs button[data-tab=active]"); settle(a)
    row = a.locator(".user-row", has_text=teacher.name)
    row.locator("[data-level=faculty]").click(); confirm(a); settle(a)
    check(q(f"select role from profiles where id = '{teacher.id}'") == "faculty", "accounts", "Thomas Reed is now Faculty")
    statuses = q("select string_agg(distinct status, ',') from profiles")
    check(statuses == "active", "accounts", "everyone is approved", statuses)
    tick(ak(2027, 1, 4, 9, 40))
    for who in [teacher] + list(S.values()):
        got = [x for x in mails() if x["to"].lower() == who.email.lower()]
        check(any("approv" in (x["subject"] + x["body"]).lower() or "welcome" in (x["subject"] + x["body"]).lower() for x in got),
              "email", f"{who.name} is emailed that the account was approved", [x["subject"] for x in got])
    B.close_all()

    # ---- Teacher builds the course (Tue Jan 5)
    set_clock(ak(2027, 1, 5, 19, 30))
    log("Teacher creates the course")
    t = B.session(teacher)
    go(t, "catalogue")
    t.click("#catAddCourse")
    t.wait_for_selector("#cbName")
    t.fill("#cbName", COURSE_TITLE)
    t.fill("#cbDesc", "Interpreting the poetic, prophetic and epistolary books — continuing Hermeneutics I.")
    t.fill("#cbCredits", "3")
    t.click("label.fmt-choice:has(input[name=cbFormat][value=hybrid])")
    t.fill("#cbPlaylist", f"https://www.youtube.com/playlist?list={PLAYLIST}")
    t.fill("#cbClassMin", str(CLASS_MIN))
    t.uncheck("#cbAttOff"); t.fill("#cbAttWeight", str(ATT_WEIGHT))
    t.set_input_files("#cbFiles", files=[{"name": "Hermeneutics II Syllabus.pdf", "mimeType": "application/pdf",
                                          "buffer": b"%PDF-1.4 syllabus spring 2027"}])
    t.click("#cbSave"); settle(t)
    course_id = q(f"select id from courses where title = '{COURSE_TITLE}'")
    check(bool(course_id), "course setup", "the new course is saved")
    c = qj(f"select format, playlist_id, class_minutes, attendance_on, attendance_weight from courses where id = '{course_id}'")
    check(c and c[0]["format"] == "hybrid" and c[0]["playlist_id"] == PLAYLIST and c[0]["attendance_on"]
          and c[0]["attendance_weight"] == ATT_WEIGHT, "course setup", "format, playlist and attendance settings are saved", c)

    log("Teacher sets the schedule and adds materials")
    go(t, "manage", course_id)
    reveal_tab(t, "setup")
    t.fill("#mgWeeks", str(WEEKS)); t.fill("#mgTime", "19:00")
    for d in ["Wed"]:
        b = t.locator(f"#mgDays button[data-day={d}]")
        if "active" not in (b.get_attribute("class") or ""):
            b.click()
    t.check("input[name=mgMode][value=scheduled]")
    t.fill("#mgStartDate", START.isoformat())
    t.click("#mgSaveSchedule"); settle(t)
    s = qj(f"select sched_weeks, sched_days, sched_time, sched_mode, sched_start from courses where id = '{course_id}'")[0]
    check(s["sched_weeks"] == WEEKS and s["sched_days"] == ["Wed"] and s["sched_time"].startswith("19:00")
          and s["sched_start"] == START.isoformat(), "course setup", "the schedule is saved", s)

    reveal_tab(t, "materials")
    t.check("#mgAddTeacherOnly")
    t.set_input_files("#mgAddFile", files=[{"name": "Midterm Answer Key.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 KEY"}])
    settle(t)
    t.uncheck("#mgAddTeacherOnly")
    quiz_files = [{"name": f"Quiz {i:02d}.pdf", "mimeType": "application/pdf", "buffer": f"%PDF-1.4 quiz {i}".encode()} for i in range(1, 14)]
    t.set_input_files("#mgAddFile", files=quiz_files); settle(t)
    t.wait_for_timeout(500); settle(t)
    mats = qj(f"select title, teacher_only from materials where course_id = '{course_id}' order by title")
    check(len(mats) == 15, "materials", "syllabus, answer key and 13 quizzes are uploaded", [m["title"] for m in mats])
    check(any(m["teacher_only"] and "Key" in m["title"] for m in mats), "materials", "the answer key is marked Teachers only", mats)

    log("Teacher adds assignments")
    reveal_tab(t, "assignments")

    def add_asg(title, due, points, weight, recurring_weeks=0, lock_open=None, unlock_days=None, docs=None):
        t.click("#mgAddAssignment"); t.wait_for_selector("#asgTitle")
        if recurring_weeks:
            t.check("input[name=asgType][value=recurring]")
        t.fill("#asgTitle", title); t.fill("#asgDue", due.isoformat())
        t.fill("#asgPoints", str(points)); t.fill("#asgWeight", str(weight))
        if recurring_weeks:
            t.fill("#asgWeeks", str(recurring_weeks))
        if docs:
            # pick quiz documents from Course Materials, in order
            t.click("#asgDocPicker [data-pick-toggle]")
            for name in docs:
                lab = t.locator("#asgDocPicker label.doc-pick-row", has_text=name)
                if lab.count():
                    lab.first.locator("input").check()
                else:
                    check(False, "assignments", f"'{name}' isn't offered in the document picker")
        if lock_open or unlock_days is not None:
            t.check("input[name=asgAvail][value=locked]")
            if recurring_weeks:
                t.fill("#asgUnlockDays", str(unlock_days))
            else:
                t.fill("#asgOpenDate", lock_open.isoformat())
        t.click("#asgSave"); settle(t)
        err = toast_text(t)
        if t.locator("#asgSave").count():
            shot(t, "asg-" + title)
            check(False, "assignments", f"'{title}' didn't save", err)
            t.click("#asgCancel")

    add_asg("Syllabus Reflection", dt.date(2027, 1, 20), 20, 10)
    # 13 weekly quizzes, one per class (weeks 2-14), each unlocking 7 days before it's due
    add_asg("Weekly Quiz", dt.date(2027, 1, 20), 10, 30, recurring_weeks=13, unlock_days=7,
            docs=[f"Quiz {i:02d}" for i in range(1, 14)])
    add_asg("Midterm Exam", dt.date(2027, 3, 3), 100, 25, lock_open=dt.date(2027, 3, 3))
    add_asg("Final Paper", dt.date(2027, 4, 28), 100, 25)
    rows = qj(f"select id, title, due, points, weight, series_id, submit_anytime, open_date from assignments "
              f"where course_id = '{course_id}' order by due, title")
    check(len(rows) == 16, "assignments", "16 assignments exist (reflection, 13 quizzes, midterm, final)", len(rows))
    for r in rows:
        asg[r["title"]] = r
    q1 = asg.get("Weekly Quiz — Week 1")
    check(q1 and q1["open_date"] == "2027-01-13", "assignments", "Quiz 1 unlocks 7 days before it's due", q1)
    am = qj(f"select a.title, m.title as doc from assignment_materials x join assignments a on a.id = x.assignment_id "
            f"join materials m on m.id = x.material_id where a.course_id = '{course_id}' order by a.due")
    check(len(am) == 13 and am[0]["doc"].startswith("Quiz 01") and am[-1]["doc"].startswith("Quiz 13"), "assignments",
          "each weekly quiz has its own quiz document, in order", am[:3])

    log("Teacher writes the lesson plan")
    t.evaluate("""async ([cid, n]) => {
        const c = courses.find(x => x.id === cid);
        const list = Array.from({length: n}, (_, i) => ({ title: 'Lesson ' + (i + 1) + ': ' +
            ['Poetry and parallelism','Psalms','Proverbs','Job','Ecclesiastes','Song of Solomon','Prophecy: principles',
             'Isaiah','Daniel','Minor Prophets','Epistles: context','Romans','Hebrews','Revelation','Review'][i] || 'Review',
            notes: 'Notes for lesson ' + (i + 1) + '. Read the passage aloud. 2 Tim 2:15.' }));
        await DB.addPlanLessons(cid, list); await loadAll(); renderMain(); }""", [course_id, WEEKS])
    settle(t)
    plan = qj(f"select title, position from course_plan where course_id = '{course_id}' order by position")
    check(len(plan) == WEEKS, "lesson plan", "15 lessons in the plan", len(plan))
    B.close_all()

    # ---- Students find the course and ask to enroll (Wed Jan 6)
    set_clock(ak(2027, 1, 6, 20, 0))
    for k, who in S.items():
        p = B.session(who, mobile=(k in ("lydia", "hannah")))
        go(p, "courses")
        btn = p.locator(f"[data-request='{course_id}']")
        if btn.count():
            btn.first.click(); settle(p)
        else:
            shot(p, f"catalogue-{k}")
        check(q(f"select count(*) from enrollment_requests where course_id = '{course_id}' and student_id = '{who.id}'") == "1",
              "enrollment", f"{who.name} requests enrollment from the catalogue")
    B.close_all()
    tick(ak(2027, 1, 6, 20, 10))
    got = [x for x in mails() if x["to"] == teacher.email and "request" in (x["subject"] + x["body"]).lower()]
    check(len(got) >= 1, "email", "the teacher is emailed about enrollment requests", [x["subject"] for x in mails() if x["to"] == teacher.email])

    set_clock(ak(2027, 1, 7, 18, 0))
    log("Teacher approves the requests")
    t = B.session(teacher)
    go(t, "manage", course_id)
    reveal_tab(t, "students")
    for _ in range(6):
        b = t.locator("#mgEnrollRequestsSection [data-approve]")
        if not b.count():
            break
        b.first.click(); settle(t)
    n = q(f"select count(*) from enrollments where course_id = '{course_id}'")
    check(n == "6", "enrollment", "all six students are enrolled", n)
    B.close_all()
    tick(ak(2027, 1, 7, 18, 10))

    log("Students choose how they'll attend")
    set_clock(ak(2027, 1, 8, 12, 0))
    for k, who in S.items():
        p = B.session(who)
        go(p, "course", course_id)
        choice = p.locator(f"[data-track={TRACK[k]}]")
        if choice.count():
            choice.first.click(); settle(p)
        else:
            shot(p, f"track-{k}")
        got = q(f"select track from enrollments where course_id = '{course_id}' and student_id = '{who.id}'")
        check(got == TRACK[k], "tracks", f"{who.name} chooses '{TRACK[k]}'", got)
        # Before the start date, the course should say when it starts.
        txt = p.inner_text("#main")
        check("Jan" in txt and "13" in txt, "course page", f"{who.name}'s course page shows the Jan 13 start", txt[:200])
    B.close_all()
    for d in range(9, 13):
        daily_ticks(dt.date(2027, 1, d))



# =====================================================================
# The term — day by day
# =====================================================================
def load_state():
    global course_id
    for who in [admin, teacher] + list(S.values()):
        who.load_id()
    course_id = q(f"select id from courses where title = '{COURSE_TITLE}' and not archived order by created_at limit 1")
    for r in qj(f"select id, title, due, points, weight, series_id, open_date from assignments where course_id = '{course_id}'"):
        asg[r["title"]] = r


def quiz_title(k):
    return f"Weekly Quiz — Week {k}"


def quiz_due(k):
    return dt.date(2027, 1, 20) + dt.timedelta(days=7 * (k - 1))


# Planned scores (points). None = never turned in.
QUIZ = {
    "ruth":   [10, 9, 10, 10, 9, 10, 9, 10, 10, 9, 10, 10, 9],
    "caleb":  [8, 7, 9, 8, 8, 7, 9, 8, 8, 7, 8, 9, 8],
    "lydia":  [9, 9, 10, 8, 9, 10, 9, 9, 8, 10, 9, 9, 10],
    "silas":  [7, 8, 6, 7, 8, 7, 8, None, 7, 6, 8, 7, 7],
    "hannah": [9, 10, 9, 9, 8, 9, 10, 9, 9, 10, 9, 8, 9],
    "jonah":  [6, 5, 7, 6],
}
REFLECT = {"ruth": 19, "caleb": 16, "lydia": 18, "silas": 15, "hannah": 18, "jonah": 14}
MIDTERM = {"ruth": 95, "caleb": 81, "lydia": 90, "silas": 74, "hannah": 88}
FINAL = {"ruth": 96, "caleb": 84, "lydia": 92, "silas": 78, "hannah": 90}
LATE_QUIZ = {("hannah", 5)}            # turned in two days after it was due
JONAH_DROP = dt.date(2027, 2, 15)
# Attendance plans
CALEB_ABSENT = {3: "made up", 11: "not made up"}     # meeting numbers (1-based)
SILAS_SHORT = 4                                       # leaves early, never makes it up
SILAS_RECORDING = 8                                   # watches the recording instead of live
HANNAH_LATE = 6                                       # watches 9 days later (too late)
RUTH_LATE = 7                                         # comes in late


def meeting_no(d):
    return class_dates().index(d) + 1


def as_student(key, js, arg=None):
    """Runs site code in a student's signed-in browser."""
    p = B.session(S[key])
    try:
        return p.evaluate(js, arg)
    finally:
        pass


def submit(key, title, how="db"):
    a = asg[title]
    if how == "ui":
        p = B.session(S[key])
        go(p, "submit")
        item = p.locator(".submit-item", has_text=title).locator("[data-item]")
        if not item.count():
            shot(p, f"submit-{key}")
            check(False, "turn-in", f"{S[key].name} can't find '{title}' on Submit Work", p.inner_text("#main")[:400])
            return
        item.first.click()
        p.wait_for_selector("#submitFile", timeout=8000)
        p.set_input_files("#submitFile", files=[{"name": f"{key}-{title[:20]}.pdf", "mimeType": "application/pdf",
                                                 "buffer": f"%PDF-1.4 {key} {title}".encode()}])
        p.click("#submitTurnIn"); settle(p)
    else:
        p = B.session(S[key])
        r = p.evaluate("""async ([cid, aid, body]) => {
            const c = courses.find(x => x.id === cid); const a = c && c.assignments.find(x => x.id === aid);
            if (!a) return 'not visible';
            try { await DB.saveSubmission({ courseId: cid, assignment: a, studentId: currentStudentId, status: 'submitted',
                    writtenContent: body, previous: getSubmission(c, a, currentStudentId) }); return 'ok'; }
            catch (e) { return 'error: ' + e.message; } }""", [course_id, a["id"], f"<p>{S[key].name}'s answers for {title}.</p>"])
        check(r == "ok", "turn-in", f"{S[key].name} turns in '{title}'", r)
    st = q(f"select status || ' ' || coalesce(submitted_at::text,'') from submissions where assignment_id = '{a['id']}' and student_id = '{S[key].id}'")
    check(st.startswith("submitted"), "turn-in", f"{S[key].name}'s '{title}' is saved as turned in", st)
    B.close_all()


def grade_all(title, scores, ui_for=("ruth",)):
    a = asg[title]
    t = B.session(teacher)
    for key, pts in scores.items():
        if pts is None:
            continue
        sid = S[key].id
        if key in ui_for:
            t.evaluate("([cid, aid, sid]) => { const c = courses.find(x => x.id === cid); const a = c.assignments.find(x => x.id === aid); openGradeModal(c, a, sid, () => renderMain()); }",
                       [course_id, a["id"], sid])
            t.wait_for_selector("#gradeScore", timeout=8000)
            t.fill("#gradeScore", str(pts)); t.fill("#gradeFeedback", "Good work — see the notes in class.")
            t.click("#gradeSave"); settle(t)
        else:
            r = t.evaluate("""async ([aid, sid, pts]) => { try { await DB.grade({ assignmentId: aid, studentId: sid, score: pts, feedback: '' }); return 'ok'; }
                              catch (e) { return e.message; } }""", [a["id"], sid, pts])
            check(r == "ok", "grading", f"teacher grades {S[key].name}'s '{title}'", r)
        got = q(f"select status || ' ' || score from submissions where assignment_id = '{a['id']}' and student_id = '{sid}'")
        check(got.startswith("graded") and float(got.split()[1]) == pts, "grading", f"{S[key].name}'s '{title}' is graded {pts}", got)
    B.close_all()


def live_minutes(d, who_minutes):
    """Live students' players check in once a minute while they watch."""
    start = dt.datetime(d.year, d.month, d.day, 19, 0, tzinfo=AK)
    for m in range(0, max(who_minutes.values()) + 1):
        set_clock(start + dt.timedelta(minutes=m, seconds=5))
        sql = ""
        for key, mins in who_minutes.items():
            if m < mins:
                sql += (f"set role authenticated; select set_config('request.jwt.claim.sub', '{S[key].id}', false) \\g /dev/null\n"
                        f"select public.record_live_minute('{course_id}') \\g /dev/null\nreset role;\n")
        if sql:
            q(sql)


def watch_recording(key, d, when):
    """A student plays a class recording through on the site (two reports, 40 minutes apart)."""
    lid = q(f"select lesson_id from public.lesson_schedule('{course_id}') where class_date = '{d}' limit 1")
    if not check(bool(lid), "lectures", f"the recording of {d} is on the site for {S[key].name}"):
        return
    set_clock(when)
    half = "1" * 60 + "0" * 140
    q(f"select public.record_lesson_progress('{lid}', '{half}', 5400)", as_user=S[key].id)
    set_clock(when + dt.timedelta(minutes=40))
    r = q(f"select public.record_lesson_progress('{lid}', '{'1' * 200}', 5400)", as_user=S[key].id)
    check('"completed": true' in r, "lectures", f"{S[key].name}'s watching of the {d} recording counts as complete", r)


def class_night(d, w):
    """One class meeting, start to finish."""
    log(f"Class meeting {w} on {d}")
    vid = f"vidHermII{w:02d}"
    start_utc = dt.datetime(d.year, d.month, d.day, 19, 0, tzinfo=AK).astimezone(dt.timezone.utc)
    # The stream is scheduled in the playlist before class.
    yt_add(PLAYLIST, {"id": vid, "title": f"Hermeneutics II — Class {w}", "duration": "P0D", "live": "live",
                      "published": (start_utc - dt.timedelta(minutes=30)).isoformat(), "streamStart": start_utc.isoformat()})
    tick(ak(d.year, d.month, d.day, 18, 46), ak(d.year, d.month, d.day, 18, 55))
    roster = [k for k in S if q(f"select count(*) from enrollments where course_id = '{course_id}' and student_id = '{S[k].id}'") == "1"]

    # Teacher teaches (Teach mode in the browser the first night; quick start/stop after that).
    set_clock(ak(d.year, d.month, d.day, 19, 0))
    plan_row = q(f"select id from course_plan where course_id = '{course_id}' and status <> 'taught' order by position limit 1")
    t = B.session(teacher)
    if w == 1:
        go(t, "manage", course_id)
        r = t.evaluate("async ([cid, pid]) => { try { await DB.teachStart(cid, pid); return 'ok'; } catch (e) { return e.message; } }", [course_id, plan_row])
        t.evaluate("([cid]) => { view = 'teach'; activeCourseId = cid; renderNav(); renderMain(); }", [course_id]); settle(t)
        shot(t, "teach-mode")
    else:
        r = t.evaluate("async ([cid, pid]) => { try { await DB.teachStart(cid, pid); return 'ok'; } catch (e) { return e.message; } }", [course_id, plan_row])
    check(r == "ok", "teach mode", f"teacher starts class {w} in Teach mode", r)
    B.close_all()

    # Live students
    if "lydia" in roster or "silas" in roster:
        mins = {"lydia": 92}
        if w != SILAS_RECORDING:
            mins["silas"] = 40 if w == SILAS_SHORT else 88
        if w in (1, 9):
            # Lydia watches in her browser for a bit, and asks a question.
            set_clock(ak(d.year, d.month, d.day, 19, 3))
            lp = B.session(S["lydia"], mobile=True)
            go(lp, "course", course_id)
            banner = lp.locator("[data-watch-live], #watchLive, .live-banner")
            check(banner.count() > 0, "live class", f"Lydia sees the Watch Live banner on class night {w}", lp.inner_text("#main")[:300])
            go(lp, "live", course_id)
            shot(lp, f"live-{w}")
            r = lp.evaluate("async (cid) => { try { await DB.postLiveChat(cid, 'Does Psalm 1 use synonymous or antithetic parallelism?'); return 'ok'; } catch (e) { return e.message; } }", course_id)
            check(r == "ok", "live class", "Lydia asks a question from home", r)
            B.close_all()
        live_minutes(d, mins)
        # Silas also tries to check in again after leaving — no double counting.

    set_clock(ak(d.year, d.month, d.day, 20, 30))
    t = B.session(teacher)
    r = t.evaluate("async (cid) => { try { await DB.teachEnd(cid, 'finished'); return 'ok'; } catch (e) { return e.message; } }", course_id)
    check(r == "ok", "teach mode", f"teacher ends class {w}", r)
    # Classroom attendance (the teacher's own page).
    go(t, "attendance", course_id)
    t.evaluate("(d) => { attendanceDate = d; attDraft = null; renderMain(); }", d.isoformat()); settle(t)
    for key in ("ruth", "caleb", "jonah"):
        if key not in roster:
            continue
        mark = "present"
        if key == "ruth" and w == RUTH_LATE:
            mark = "late"
        if key == "caleb" and w in CALEB_ABSENT:
            mark = "absent"
        row = t.locator(f".att-row[data-student='{S[key].id}']")
        if not check(row.count() == 1, "attendance", f"{S[key].name} is on the classroom attendance list", t.inner_text("#main")[:300]):
            continue
        row.locator(f"[data-mark={mark}]").click()
    online_rows = [k for k in ("lydia", "silas", "hannah") if k in roster and t.locator(f".att-row[data-student='{S[k].id}']").count()]
    check(not online_rows, "attendance", "online students aren't on the teacher's classroom list", online_rows)
    t.click("#attSave"); settle(t)
    if w in (1, 7):
        shot(t, f"attendance-{w}")
    B.close_all()
    marks = dict((r["student_id"], r["status"]) for r in qj(f"select student_id, status from attendance where course_id = '{course_id}' and class_date = '{d}'"))
    for key in ("ruth", "caleb", "jonah"):
        if key in roster:
            want = "late" if (key == "ruth" and w == RUTH_LATE) else "absent" if (key == "caleb" and w in CALEB_ABSENT) else "present"
            check(marks.get(S[key].id) == want, "attendance", f"{S[key].name} is marked {want} for class {w}", marks.get(S[key].id))
    if "lydia" in roster:
        check(marks.get(S["lydia"].id) == "present", "attendance", f"Lydia is counted present from watching class {w} live", marks.get(S["lydia"].id))

    # The stream ends; YouTube turns it into a recording.
    db = yt_load()
    for v in db["playlists"][PLAYLIST]:
        if v["id"] == vid:
            v.update({"live": "none", "duration": "PT1H30M", "recorded": d.isoformat()})
    json.dump(db, open(os.path.join(SIM, "youtube.json"), "w"), indent=1)
    tick(ak(d.year, d.month, d.day, 21, 0), ak(d.year, d.month, d.day, 21, 31))
    l = qj(f"select l.status, s.class_date, l.duration_seconds from lessons l left join public.lesson_schedule('{course_id}') s on s.lesson_id = l.id where l.course_id = '{course_id}' and l.video_id = '{vid}'")
    check(l and l[0]["status"] == "ok" and l[0]["class_date"] == d.isoformat() and l[0]["duration_seconds"] == 5400,
          "lectures", f"class {w}'s recording is on the site, on {d}, 1h30m long", l)


def student_week_check(day, sweep=False):
    """Each student opens the site on Saturday morning: dashboard, course, grades."""
    set_clock(ak(day.year, day.month, day.day, 10, 0))
    for key, who in S.items():
        if q(f"select count(*) from enrollments where course_id = '{course_id}' and student_id = '{who.id}'") != "1":
            continue
        p = B.session(who, mobile=(key == "hannah"))
        tw = p.evaluate("(() => { try { const t = thisWeekItems(); return { missed: (t.missed || []).map(m => m.d || m.date || m), n: Object.keys(t).length }; } catch (e) { return { err: e.message }; } })()")
        STATE.setdefault("missed", {})[(key, day.isoformat())] = tw.get("missed")
        go(p, "course", course_id)
        go(p, "grades")
        g = p.evaluate("(cid) => { const c = courses.find(x => x.id === cid); const r = computeCourseGrade(c, currentStudentId); return { pct: r.pct, letter: r.letter, att: r.attendance && r.attendance.pct, asg: r.assignmentsPct }; }", course_id)
        STATE.setdefault("grades", {})[(key, day.isoformat())] = g
        if sweep:
            for v in ("calendar", "messages", "discussion", "lectureArchive", "studyBible", "library", "profile", "help", "transcript"):
                go(p, v, course_id if v in ("discussion",) else None)
            shot(p, f"grades-{key}")
        B.close_all()


STATE = {}


def phase_term():
    load_state()
    meetings = class_dates()
    day = dt.date(2027, 1, 13)
    end = dt.date(2027, 5, 8)
    while day <= end:
        daily_ticks(day)
        wd = day.weekday()  # Mon=0

        # ---- special events
        if day == dt.date(2027, 2, 8):
            set_clock(ak(2027, 2, 8, 17, 0))
            log("Snow day coming: teacher cancels Wednesday's class")
            t = B.session(teacher)
            go(t, "manage", course_id); reveal_tab(t, "setup")
            t.evaluate("([cid, d]) => openCancelClassModal(courses.find(x => x.id === cid), d, () => renderMain())", [course_id, CANCELED.isoformat()])
            t.wait_for_selector("#ccReason")
            t.fill("#ccReason", "Snow day — roads are closed. Stay home and stay warm!")
            t.click("#ccConfirm"); settle(t)
            B.close_all()
            check(q(f"select count(*) from class_cancellations where course_id = '{course_id}' and class_date = '{CANCELED}'") == "1",
                  "cancel class", "Feb 10 is canceled")
            tick(ak(2027, 2, 8, 17, 5))
            got = [m for m in mails() if "cancel" in (m["subject"] + m["body"]).lower() and m["to"] == S["ruth"].email]
            check(got, "email", "students are emailed that class is canceled", [m["subject"] for m in mails() if m["to"] == S["ruth"].email][-3:])

        if day == JONAH_DROP:
            set_clock(ak(2027, 2, 15, 18, 0))
            log("Jonah drops the course; the teacher takes him off the roster")
            t = B.session(teacher)
            go(t, "manage", course_id); reveal_tab(t, "students")
            row = t.locator("#mgRosterList .user-row, #mgRosterList li, #mgRosterList div", has_text=S["jonah"].name)
            btn = row.locator("button", has_text="Remove")
            if btn.count():
                btn.first.click(); confirm(t)
            else:
                shot(t, "roster")
                check(False, "roster", "the teacher can find Remove next to Jonah", t.inner_text("#mgRosterList")[:300])
            B.close_all()
            check(q(f"select count(*) from enrollments where course_id = '{course_id}' and student_id = '{S['jonah'].id}'") == "0",
                  "roster", "Jonah is off the roster")
            # His record stays private: other students can't see his work.
            seen = q(f"select count(*) from submissions where student_id = '{S['jonah'].id}'", as_user=S["ruth"].id)
            check(seen == "0", "privacy", "Ruth can't see Jonah's work", seen)

        if day == dt.date(2027, 2, 24):
            set_clock(ak(2027, 2, 24, 12, 0))
            t = B.session(teacher)
            r = t.evaluate("async (cid) => { try { await DB.postAnnouncement(cid, 'The midterm opens next Wednesday after class. Bring your Bible and a pen.'); await loadAll(); return 'ok'; } catch (e) { return e.message; } }", course_id)
            check(r == "ok", "announcements", "teacher posts an announcement", r)
            B.close_all()
            tick(ak(2027, 2, 24, 12, 5))
            got = [m for m in mails() if m["to"] == S["hannah"].email and "midterm" in m["body"].lower()]
            check(got, "email", "students are emailed the announcement", [m["subject"] for m in mails() if m["to"] == S["hannah"].email][-3:])

        if day == dt.date(2027, 3, 2):
            set_clock(ak(2027, 3, 2, 20, 0))
            p = B.session(S["ruth"])
            lock = p.evaluate("(aid) => { const c = courses.find(x => x.assignments.some(a => a.id === aid)); const a = c.assignments.find(x => x.id === aid); return assignmentLock(a); }", asg["Midterm Exam"]["id"])
            check(bool(lock), "assignments", "the Midterm is still locked the day before it opens", lock)
            # And the database refuses an early turn-in, too.
            r = p.evaluate("""async ([cid, aid]) => { const c = courses.find(x => x.id === cid); const a = c.assignments.find(x => x.id === aid);
                try { await DB.saveSubmission({ courseId: cid, assignment: a, studentId: currentStudentId, status: 'submitted', writtenContent: '<p>early</p>' }); return 'saved'; }
                catch (e) { return 'refused: ' + e.message; } }""", [course_id, asg["Midterm Exam"]["id"]])
            check(r.startswith("refused"), "assignments", "a locked Midterm can't be turned in early", r)
            B.close_all()

        if day == dt.date(2027, 3, 8):
            set_clock(ak(2027, 3, 8, 19, 0))
            log("Teacher moves the Mar 17 class to Thursday Mar 18")
            t = B.session(teacher)
            go(t, "manage", course_id)
            t.evaluate("([cid, d]) => openMoveClass(courses.find(x => x.id === cid), d)", [course_id, MOVED_FROM.isoformat()])
            t.wait_for_selector("#moveDate"); t.fill("#moveDate", MOVED_TO.isoformat()); t.fill("#moveNote", "Moved for the revival meetings")
            t.click("#moveSave"); settle(t)
            B.close_all()
            tick(ak(2027, 3, 8, 19, 5))
            check(q(f"select count(*) from class_extra_days where course_id = '{course_id}' and class_date = '{MOVED_TO}'") == "1",
                  "move class", "Thursday Mar 18 is added as a class day")
            check(q(f"select count(*) from class_cancellations where course_id = '{course_id}' and class_date = '{MOVED_FROM}'") == "1",
                  "move class", "Wednesday Mar 17 is canceled")
            got = [m for m in mails() if m["to"] == S["caleb"].email and ("mar" in m["body"].lower() and ("18" in m["body"]))]
            check(got, "email", "students are emailed the new day", [m["subject"] for m in mails() if m["to"] == S["caleb"].email][-3:])

        if day == dt.date(2027, 3, 10):
            set_clock(ak(2027, 3, 10, 12, 0))
            t = B.session(teacher)
            go(t, "discussionBoard", course_id)
            t.fill("#dbNewPost", "Which Psalm has helped you most this term, and why?"); t.click("#dbPostBtn"); settle(t)
            B.close_all()
            for key in ("ruth", "hannah"):
                p = B.session(S[key])
                go(p, "discussionBoard", course_id)
                inp = p.locator("[data-reply-input]")
                if check(inp.count() > 0, "discussion", f"{S[key].name} can reply on the discussion board", p.inner_text("#main")[:300]):
                    inp.first.fill(f"Psalm 119 — {S[key].name}"); p.locator("[data-reply-btn]").first.click(); settle(p)
                B.close_all()
            p = B.session(S["caleb"])
            go(p, "messages")
            p.locator("li", has_text=COURSE_TITLE).first.click(); settle(p)
            p.fill("#msgInput", "I'll miss class on the 7th of April for work — can I watch the recording?"); p.click("#msgSend"); settle(p)
            B.close_all()
            tick(ak(2027, 3, 10, 12, 5))
            check(any(m["to"] == teacher.email and "caleb" in (m["subject"] + m["body"]).lower() for m in mails()),
                  "email", "the teacher is emailed Caleb's private message")
            t = B.session(teacher)
            go(t, "messages")
            t.locator("li", has_text="Caleb Dawson").first.click(); settle(t)
            t.fill("#msgInput", "Yes — it counts if you watch it within a week."); t.press("#msgInput", "Enter"); settle(t)
            B.close_all()
            others = q(f"select count(*) from messages where course_id = '{course_id}'", as_user=S["ruth"].id)
            check(others == "0", "privacy", "Ruth can't read Caleb's private messages", others)

        if day == dt.date(2027, 4, 19):
            set_clock(ak(2027, 4, 19, 19, 0))
            log("Teacher adds a make-up day for the snow day")
            t = B.session(teacher)
            go(t, "manage", course_id)
            t.evaluate("(cid) => openAddClassDay(courses.find(x => x.id === cid))", course_id)
            t.wait_for_selector("#adDate"); t.fill("#adDate", MAKEUP.isoformat()); t.fill("#adNote", "Make-up for the snow day")
            t.click("#adSave"); settle(t)
            B.close_all()
            check(q(f"select count(*) from class_extra_days where course_id = '{course_id}' and class_date = '{MAKEUP}'") == "1",
                  "make-up day", "Apr 28 is added as a class day")

        # ---- class meetings
        if day in meetings:
            w = meeting_no(day)
            class_night(day, w)
            if "caleb" in S and w in CALEB_ABSENT and CALEB_ABSENT[w] == "made up":
                watch_recording("caleb", day, ak(*(day + dt.timedelta(days=2)).timetuple()[:3], 20, 0))
            if w == SILAS_RECORDING:
                watch_recording("silas", day, ak(*(day + dt.timedelta(days=3)).timetuple()[:3], 20, 0))
            if w == HANNAH_LATE:
                pass  # watched later, below
            else:
                watch_recording("hannah", day, ak(*(day + dt.timedelta(days=1)).timetuple()[:3], 19, 0))
        if meetings_late := [m for m in meetings if meeting_no(m) == HANNAH_LATE and m + dt.timedelta(days=9) == day]:
            watch_recording("hannah", meetings_late[0], ak(day.year, day.month, day.day, 19, 0))

        # ---- weekly quizzes: turned in the evening before they're due
        for k in range(1, 14):
            due = quiz_due(k)
            if day == due - dt.timedelta(days=1):
                set_clock(ak(day.year, day.month, day.day, 20, 0))
                for key, scores in QUIZ.items():
                    if k > len(scores) or scores[k - 1] is None or (key, k) in LATE_QUIZ:
                        continue
                    if key == "jonah" and day >= JONAH_DROP:
                        continue
                    submit(key, quiz_title(k), how="ui" if key == "ruth" and k in (1, 6, 12) else "db")
            if day == due + dt.timedelta(days=2):
                set_clock(ak(day.year, day.month, day.day, 9, 0))
                for key, kk in LATE_QUIZ:
                    if kk == k:
                        submit(key, quiz_title(k))
                        flag = q(f"select submitted_at > a.due from submissions s join assignments a on a.id = s.assignment_id where a.id = '{asg[quiz_title(k)]['id']}' and s.student_id = '{S[key].id}'")
                        check(flag == "t", "turn-in", f"{S[key].name}'s late quiz is recorded as late", flag)
            if day == due + dt.timedelta(days=2):
                set_clock(ak(day.year, day.month, day.day, 18, 0))
                grade_all(quiz_title(k), {key: (sc[k - 1] if k <= len(sc) else None) for key, sc in QUIZ.items()
                                          if not (key == "jonah" and due >= JONAH_DROP)},
                          ui_for=("ruth",) if k in (1, 7) else ())

        if day == dt.date(2027, 1, 19):
            set_clock(ak(2027, 1, 19, 21, 0))
            for key in S:
                submit(key, "Syllabus Reflection", how="ui" if key in ("caleb", "lydia") else "db")
        if day == dt.date(2027, 1, 22):
            set_clock(ak(2027, 1, 22, 18, 0))
            grade_all("Syllabus Reflection", REFLECT, ui_for=("caleb",))
        if day == dt.date(2027, 3, 3):
            set_clock(ak(2027, 3, 3, 21, 0))
            for key in MIDTERM:
                submit(key, "Midterm Exam")
        if day == dt.date(2027, 3, 6):
            set_clock(ak(2027, 3, 6, 18, 0))
            grade_all("Midterm Exam", MIDTERM)
        if day == dt.date(2027, 4, 26):
            set_clock(ak(2027, 4, 26, 21, 0))
            for key in FINAL:
                submit(key, "Final Paper", how="ui")
        if day == dt.date(2027, 5, 1):
            set_clock(ak(2027, 5, 1, 14, 0))
            grade_all("Final Paper", FINAL, ui_for=("silas",))

        # ---- Saturday: everyone looks at the site
        if wd == 5:
            wk = (day - START).days // 7 + 1
            student_week_check(day, sweep=wk in (1, 8, 16))
            set_clock(ak(day.year, day.month, day.day, 11, 0))
            t = B.session(teacher)
            go(t, "home"); go(t, "gradeSheet", course_id); go(t, "manage", course_id)
            for tb in ("setup", "plan", "lectures", "students", "materials", "assignments"):
                reveal_tab(t, tb)
            if wk in (1, 8, 16):
                go(t, "calendar"); go(t, "attendanceHome"); go(t, "messages"); go(t, "grading")
                shot(t, "teacher-gradesheet")
            B.close_all()
        day += dt.timedelta(days=1)
    json.dump({f"{k[0]}|{k[1]}": v for k, v in STATE.get("grades", {}).items()}, open(os.path.join(SIM, "grades_seen.json"), "w"), indent=1)
    json.dump({f"{k[0]}|{k[1]}": v for k, v in STATE.get("missed", {}).items()}, open(os.path.join(SIM, "missed_seen.json"), "w"), indent=1)



# =====================================================================
# End of term
# =====================================================================
def expected_grades():
    """The grade each student should have, worked out here independently."""
    meetings = class_dates()
    out = {}
    for key in ("ruth", "caleb", "lydia", "silas", "hannah"):
        cats = []
        cats.append((REFLECT[key] / 20, 10))
        qs = [(QUIZ[key][k] or 0) / 10 if QUIZ[key][k] is not None else 0 for k in range(13)]
        cats.append((sum(qs) / len(qs), 30))
        cats.append((MIDTERM[key] / 100, 25))
        cats.append((FINAL[key] / 100, 25))
        asg_pct = round(sum(a * w for a, w in cats) / sum(w for _, w in cats) * 1000) / 10
        credit = 0
        for i, d in enumerate(meetings, 1):
            if key == "ruth" and i == RUTH_LATE:
                credit += 0.5
            elif key == "caleb" and CALEB_ABSENT.get(i) == "not made up":
                pass
            elif key == "silas" and i == SILAS_SHORT:
                pass
            elif key == "hannah" and i == HANNAH_LATE:
                pass
            else:
                credit += 1
        att = round(credit / len(meetings) * 1000) / 10
        pct = round((asg_pct * (1 - ATT_WEIGHT / 100) + att * ATT_WEIGHT / 100) * 10) / 10
        out[key] = {"asg": asg_pct, "att": att, "pct": pct}
    return out


GRADE_SCALE = [[97, "A+"], [94, "A"], [90, "A-"], [87, "B+"], [84, "B"], [80, "B-"], [77, "C+"], [74, "C"], [70, "C-"]]


def letter(p):
    for m, l in GRADE_SCALE:
        if p >= m:
            return l
    return "F"


def phase_end():
    load_state()
    exp = expected_grades()
    log("Expected final grades: " + json.dumps(exp))

    # Attendance as the database has it, against the plan.
    att = qj(f"""select p.name, a.status, count(*) n from attendance a join profiles p on p.id = a.student_id
                 where a.course_id = '{course_id}' group by 1, 2 order by 1, 2""")
    log("Attendance in the database: " + json.dumps(att))
    days = q(f"select count(*) from attendance_days where course_id = '{course_id}' and held")
    check(days == str(len(class_dates())), "attendance", f"{len(class_dates())} class days are on the attendance record (14 Wednesdays + the make-up)", days)

    set_clock(ak(2027, 5, 3, 19, 0))
    log("Teacher records final grades")
    t = B.session(teacher)
    go(t, "gradeSheet", course_id)
    shot(t, "final-gradesheet")
    seen = t.evaluate("(cid) => { const c = courses.find(x => x.id === cid); return Object.fromEntries(c.studentIds.map(id => [userName(id), computeCourseGrade(c, id)]).map(([n, g]) => [n, { pct: g.pct, letter: g.letter, asg: g.assignmentsPct, att: g.attendance && g.attendance.pct }])); }", course_id)
    for key, e in exp.items():
        g = seen.get(S[key].name)
        check(g is not None and abs((g["asg"] or 0) - e["asg"]) < 0.05, "grades", f"{S[key].name}'s assignment average is {e['asg']}%", g)
        check(g is not None and abs((g["att"] or 0) - e["att"]) < 0.05, "grades", f"{S[key].name}'s attendance is {e['att']}%", g)
        check(g is not None and abs((g["pct"] or 0) - e["pct"]) < 0.05 and g["letter"] == letter(e["pct"]), "grades",
              f"{S[key].name}'s course grade is {e['pct']}% ({letter(e['pct'])})", g)
    t.click("#gsRecord")
    t.wait_for_selector("#rgSave", timeout=10000)
    shot(t, "record-final-grades")
    pre = t.evaluate("[...document.querySelectorAll('[data-rg-student]')].map(tr => [tr.dataset.rgStudent, tr.querySelector('.rg-pct').value, tr.querySelector('.rg-grade').value, tr.dataset.rgAtt])")
    for sid, pct, lg, attp in pre:
        key = next(k for k, v in S.items() if v.id == sid)
        e = exp[key]
        check(abs(float(pct or -1) - e["pct"]) < 0.05 and lg == letter(e["pct"]), "final grades",
              f"the Record Final Grades form fills in {S[key].name}: {e['pct']}% {letter(e['pct'])}", [pct, lg, attp])
    t.click("#rgSave"); settle(t)
    B.close_all()
    rows = qj(f"select student_name, percent, grade, attendance_percent, term, credits from transcript_entries where course_id = '{course_id}' order by student_name")
    check(len(rows) == 5, "transcripts", "five transcript entries are recorded (Jonah dropped)", rows)
    for r in rows:
        key = next(k for k, v in S.items() if v.name == r["student_name"])
        check(abs(float(r["percent"]) - exp[key]["pct"]) < 0.05 and r["grade"] == letter(exp[key]["pct"]), "transcripts",
              f"{r['student_name']}'s transcript shows {exp[key]['pct']}% {letter(exp[key]['pct'])}", r)
        check(r["term"] and "2027" in r["term"] and "Spring" in r["term"], "transcripts", f"the term reads 'Spring 2027' for {r['student_name']}", r["term"])
    tick(ak(2027, 5, 3, 19, 10), ak(2027, 5, 4, 8, 1))

    set_clock(ak(2027, 5, 4, 18, 0))
    for key in ("ruth", "silas"):
        p = B.session(S[key])
        go(p, "transcript")
        txt = p.inner_text("#main")
        e = exp[key]
        check(COURSE_TITLE in txt and letter(e["pct"]) in txt, "transcripts", f"{S[key].name} sees the course and grade on their transcript", txt[:400])
        shot(p, f"transcript-{key}")
        B.close_all()
    a = B.session(admin)
    go(a, "transcripts")
    txt = a.inner_text("#main")
    check(all(S[k].name.split()[-1] in txt for k in exp), "transcripts", "the Admin's Transcripts page lists all five students", txt[:400])
    B.close_all()

    # Phone calendar feed: canceled day gone, moved and make-up days there.
    tok = q("select public.my_calendar_token()", as_user=S["caleb"].id)
    feed = json.dumps(qj(f"select * from public.calendar_feed_events('{tok}')"))
    check(str(CANCELED) not in feed or "cancel" in feed.lower(), "calendar", "the snow day isn't on the phone calendar as a class", "")
    check(str(MOVED_TO) in feed and str(MAKEUP) in feed, "calendar", "the moved class and the make-up day are on the phone calendar", feed[:300])
    ev = qj(f"select kind, day::text from public.calendar_feed_events('{tok}') where day = '{MOVED_FROM}'")
    check(all(e["kind"] == "canceled" for e in ev), "calendar", "the old Mar 17 day shows only as canceled on the phone calendar", ev)

    # Copy the course for the fall term.
    set_clock(ak(2027, 5, 5, 19, 0))
    log("Teacher copies the course for Fall 2027")
    t = B.session(teacher)
    go(t, "manage", course_id)
    t.click("#mgCopyCourse"); t.wait_for_selector("#cpStart")
    fall = dt.date(2027, 9, 1)
    t.fill("#cpName", COURSE_TITLE); t.fill("#cpStart", fall.isoformat())
    t.click("#cpGo"); settle(t); t.wait_for_timeout(1500); settle(t)
    B.close_all()
    new = q(f"select id from courses where title = '{COURSE_TITLE}' and id <> '{course_id}'")
    if check(bool(new), "copy course", "the fall copy is made"):
        shift = (fall - START).days
        n_asg = q(f"select count(*) from assignments where course_id = '{new}'")
        check(n_asg == "16", "copy course", "all 16 assignments come along", n_asg)
        first = q(f"select min(due) from assignments where course_id = '{new}'")
        check(first == (dt.date(2027, 1, 20) + dt.timedelta(days=shift)).isoformat(), "copy course", "due dates move with the new start date", first)
        mats = q(f"select count(*) from materials where course_id = '{new}'")
        check(mats == "15", "copy course", "the 15 documents come along", mats)
        links = qj(f"select a.title, m.title as doc from assignment_materials x join assignments a on a.id = x.assignment_id join materials m on m.id = x.material_id where a.course_id = '{new}' order by a.due, m.title")
        check(len(links) == 13 and links[0]["doc"] == "Quiz 01.pdf", "copy course", "each weekly quiz keeps its own document", links[:3])
        plan = q(f"select count(*) from course_plan where course_id = '{new}' and status = 'planned'")
        check(plan == str(WEEKS), "copy course", "the lesson plan comes along, fresh", plan)
        for tbl in ("enrollments", "submissions s join assignments a on a.id = s.assignment_id where a.course_id = '{new}' and true or", "attendance"):
            pass
        check(q(f"select count(*) from enrollments where course_id = '{new}'") == "0", "copy course", "no students are copied")
        check(q(f"select count(*) from class_cancellations where course_id = '{new}'") == "0"
              and q(f"select count(*) from class_extra_days where course_id = '{new}'") == "0", "copy course",
              "spring's snow day, moved class and make-up day don't carry over")
        lec = qj(f"select count(*) n, count(s.class_date) dated, min(s.class_date) first from public.lesson_schedule('{new}') s")
        log("Fall copy's lectures: " + json.dumps(lec))
        STATE["fall_lectures"] = lec

    # Archive the spring course; the transcript stays.
    set_clock(ak(2027, 5, 6, 12, 0))
    t = B.session(teacher)
    r = t.evaluate("async (cid) => { try { await DB.setArchived(cid, true); return 'ok'; } catch (e) { return e.message; } }", course_id)
    check(r == "ok", "archive", "teacher archives the spring course", r)
    B.close_all()
    check(q(f"select count(*) from transcript_entries where course_id = '{course_id}'") == "5", "archive", "transcripts survive archiving")
    p = B.session(S["hannah"])
    go(p, "grades"); go(p, "transcript")
    check(COURSE_TITLE in p.inner_text("#main"), "archive", "Hannah still sees the course on her transcript after archiving")
    B.close_all()

    # Over the whole term: email and backups.
    tick(ak(2027, 5, 9, 3, 5))
    allm = mails()
    weekly = [m for m in allm if m["subject"].startswith("Weekly backup")]
    log(f"{len(allm)} emails sent this term; {len(weekly)} weekly backups")
    check(16 <= len(weekly) <= 19, "backups", "one weekly backup email each week of the term", len(weekly))
    dupes = {}
    for m in weekly:
        dupes[m["subject"]] = dupes.get(m["subject"], 0) + 1
    check(all(v == 1 for v in dupes.values()), "backups", "no weekly backup is emailed twice", {k: v for k, v in dupes.items() if v > 1})
    per = {}
    for m in allm:
        per[m["to"]] = per.get(m["to"], 0) + 1
    log("Emails per person: " + json.dumps(per))
    STATE["emails_per_person"] = per
    nb = qj("select p.name, count(*) n, count(*) filter (where not n.read) unread from notifications n join profiles p on p.id = n.user_id group by 1 order by 2 desc")
    log("Bell notifications per person: " + json.dumps(nb))
    dup = qj("select p.name, n.subject, (n.created_at at time zone 'America/Anchorage')::date d, count(*) c from notifications n join profiles p on p.id = n.user_id group by 1, 2, 3 having count(*) > 1 order by 4 desc limit 10")
    check(not dup, "notifications", "nobody gets the same notice twice", dup)
    json.dump({"emails": per, "bell": nb, "fall": STATE.get("fall_lectures")}, open(os.path.join(SIM, "summary.json"), "w"), indent=1, default=str)


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
        json.dump({"checks": CHECKS, "findings": FINDINGS, "js_errors": JS_ERRORS}, open(os.path.join(SIM, "results.json"), "w"), indent=1)
        for f in FINDINGS:
            print(" -", f)
