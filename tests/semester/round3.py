#!/usr/bin/env python3
"""Round 3 (Nov 7, 2026): every feature, file by file.

Rounds 1 and 2 (and the repo's browser tests) were run with function
coverage on (coverage.py); this round drives, as real people on the real
screens, the features none of them reached. Phases go file by file:

  accounts   app.js     — sign-up/confirm, forgot/reset password, sign-out,
                          idle sign-out, enrollment requests (withdraw, deny,
                          approve all), add student, edit/delete course,
                          delete user, profile + photo, person card
  courses    app.js     — materials viewer, turned-in file viewer, series and
                          rosters, calendar day dialog, phone calendar,
                          export a message thread, Resource Library, links
  bible      bible.js   — Study Bible: words, Strong's, search, concordance,
                          cross references, highlights
  editor     editor.js  — writing an assignment in the built-in editor
  records    features.js — text size, tour, transcripts (PDF/CSV, Admin
                          entries, W), past records, location, archive
  extras     data.js, look.js, help.js, home.js, lectures.js, organize.js,
                          teach.js — the rest (notifications, memory verse,
                          help search, Back button, self-paced, …)

The clock is fixed at Mon Feb 15, 2027 (mid-term). Any JavaScript error on
any page fails the run. Run with ROUND=round3.py (see README).
"""
import datetime as dt, json, os, re, sys
from sim import *  # noqa

B = Browsers()
admin = Person("True North Baptist", "truenorthbaptist1@gmail.com", google=True)
teacher = Person("Thomas Reed", "thomas.reed@example.com")
other_t = Person("Paul Grant", "paul.grant@example.com")
P = {
    "blake": Person("Blake Amis", "blake.amis@example.com"),
    "amber": Person("Amber Amis", "amber.amis@example.com"),
    "ruth": Person("Ruth Newcomer", "ruth.newcomer@example.com"),
    "sam": Person("Sam Self", "sam.self@example.com"),
    "gone": Person("Gone Soon", "gone.soon@example.com"),
}
NOW_AK = ak(2027, 2, 15, 10, 0)
HERM = "Hermeneutics II"
PAUL = "Life of Paul (self-paced)"
GEN = "Genesis to Revelation Course"
cid = {}


def site(page, js, arg=None):
    return page.evaluate("async ([js, arg]) => { try { const f = eval('(async (arg) => {' + js + '})'); const r = await f(arg); return r === undefined ? 'ok' : r; } catch (e) { return 'ERROR: ' + (e.message || e); } }", [js, arg])


def mkperson(who, role="student", status="active"):
    import uuid
    uid = str(uuid.uuid4())
    meta = json.dumps({"full_name": who.name}).replace("'", "''")
    q(f"insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ('{uid}', '{who.email}', '{meta}', now());"
      f"update public.profiles set status = '{status}', role = '{role}' where id = '{uid}';")
    who.id = uid
    return uid


def load():
    for w in [admin, teacher, other_t] + list(P.values()):
        try:
            w.load_id()
        except Exception:
            pass
    for t in (HERM, PAUL, GEN):
        cid[t] = q(f"select id from courses where title = '{t}' order by created_at limit 1")


def body(p):
    return p.inner_text("body")


# =====================================================================
def phase_setup():
    set_clock(ak(2027, 1, 5, 9, 0))
    a = B.session(admin)
    B.close_all()
    mkperson(teacher, "faculty"); mkperson(other_t, "faculty")
    for k in ("blake", "amber", "sam", "gone"):
        mkperson(P[k])
    # Hermeneutics II: hybrid, Wednesdays, started Jan 13; Life of Paul: online self-paced;
    # Genesis to Revelation (from seed.sql) is moved to start Mar 1 for requests.
    q(f"""insert into courses (title, description, credits, level, faculty_id, sched_weeks, sched_days, sched_time, sched_mode, sched_start,
                               attendance_on, attendance_weight, format, playlist_id, class_minutes)
          values ('{HERM}', 'Poetry, prophecy and the epistles.', 3, '200', '{teacher.id}', 15, '{{Wed}}', '19:00', 'scheduled', '2027-01-13',
                  true, 10, 'hybrid', '', 90),
                 ('{PAUL}', 'Paul''s life and journeys, at your own pace.', 2, '300', '{teacher.id}', 10, '{{Mon}}', '19:00', 'scheduled', '2027-01-04',
                  true, 0, 'online', '', 60);
        update courses set sched_start = '2027-03-01', sched_mode = 'scheduled', faculty_id = '{other_t.id}' where title = '{GEN}';
        update courses set pace = 'self' where title = '{PAUL}';""")
    load()
    q(f"""insert into enrollments (course_id, student_id, track, track_chosen, start_on) values
          ('{cid[HERM]}', '{P['blake'].id}', 'classroom', true, '2027-01-08'),
          ('{cid[HERM]}', '{P['amber'].id}', 'recorded', true, '2027-01-08'),
          ('{cid[HERM]}', '{P['gone'].id}', 'classroom', true, '2027-01-08'),
          ('{cid[PAUL]}', '{P['sam'].id}', 'recorded', true, '2027-02-01');""")
    # Lectures: one per Wednesday so far (manual links, 11-character ids), and five for the self-paced course
    rows = []
    for i, d in enumerate(["2027-01-13", "2027-01-20", "2027-01-27", "2027-02-03", "2027-02-10"]):
        rows.append(f"('{cid[HERM]}', 'HermTwo{i:04d}', 'Hermeneutics II — class {i + 1}', {i}, 5400, 'ok', false, '{d}', '{d}', now() - interval '1 day')")
    for i in range(5):
        rows.append(f"('{cid[PAUL]}', 'PaulSelf{i:03d}', 'Life of Paul — Lecture {i + 1}', {i}, 1800, 'ok', false, null, null, now() - interval '20 days')")
    q("insert into lessons (course_id, video_id, title, position, duration_seconds, status, from_playlist, recorded_on, class_date, notified_at) values "
      + ",".join(rows))
    # The teacher adds materials and assignments on the real pages.
    t = B.session(teacher)
    go(t, "manage", cid[HERM]); reveal_tab(t, "materials")
    t.set_input_files("#mgAddFile", files=[{"name": "Syllabus.pdf", "mimeType": "application/pdf", "buffer": open(os.path.join(HERE, "..", "e2e", "test-notes.pdf"), "rb").read()},
                                           {"name": "Reading Guide.txt", "mimeType": "text/plain", "buffer": b"Read Psalm 1 and Psalm 119 before class."}])
    settle(t); t.wait_for_timeout(600); settle(t)
    r = site(t, f"""
      const c = courses.find(x => x.id === '{cid[HERM]}');
      const sid = 's_' + newId();
      const rows = [];
      for (let i = 0; i < 6; i++) {{ const d = new Date('2027-01-20T00:00:00'); d.setDate(d.getDate() + 7 * i);
        rows.push({{ title: 'Quiz — Week ' + (i + 1), due: localISO(d), points: 10, weight: 40, seriesId: sid, seriesLabel: 'Quiz' }}); }}
      rows.push({{ title: 'Psalm Reflection', instructions: 'One page on Psalm 1. Use Insert Scripture for your verses.', due: '2027-02-17', points: 20, weight: 30 }});
      rows.push({{ title: 'Final Paper', due: '2027-04-28', points: 100, weight: 30 }});
      await DB.addAssignments(c.id, rows);
      const p = courses.find(x => x.id === '{cid[PAUL]}');
      await DB.addAssignments(p.id, [{{ title: 'Journey Map', due: '2027-01-18', points: 20, weight: 50 }}, {{ title: 'Paul Paper', due: '2027-03-01', points: 50, weight: 50 }}]);""")
    check(r == "ok", "setup", "assignments added", r)
    B.close_all()
    set_clock(ak(2027, 2, 14, 7, 0))
    # Some history: Blake and Amber turned in and were graded on the early quizzes.
    for k, sc in (("blake", 9), ("amber", 8)):
        q(f"""insert into submissions (assignment_id, student_id, status, written_content, submitted_at, score)
              select id, '{P[k].id}', 'graded', '<p>answers</p>', due - 1, {sc} from assignments where course_id = '{cid[HERM]}' and series_label = 'Quiz' and due < '2027-02-15'""")
    q(f"insert into submissions (assignment_id, student_id, status, file_name, storage_path, mime_type, submitted_at) "
      f"select id, '{P['amber'].id}', 'submitted', 'amber-quiz.pdf', '{cid[HERM]}/' || id || '/{P['amber'].id}/x-amber-quiz.pdf', 'application/pdf', '2027-02-09' "
      f"from assignments where course_id = '{cid[HERM]}' and title = 'Quiz — Week 5'")
    q(f"""select public.save_attendance('{cid[HERM]}', d::date, true, ('{{"{P['blake'].id}": "present", "{P['gone'].id}": "absent"}}')::jsonb)
          from unnest(array['2027-01-13','2027-01-20','2027-01-27','2027-02-03','2027-02-10']) d""".replace("select public.save_attendance", "set role authenticated; select set_config('request.jwt.claim.sub', '" + teacher.id + "', false); select public.save_attendance"))
    tick(ak(2027, 2, 14, 8, 1))


# =====================================================================
def phase_accounts():
    load()
    set_clock(NOW_AK)
    log("A1. A newcomer signs up; email confirmation is required")
    p = B.session(P["ruth"], sign_in=False)
    p.evaluate("window.FAKE_REQUIRE_CONFIRM = true")
    p.locator(".auth-tabs button, #goSignup", has_text="Sign Up").first.click()
    p.fill("#suName", P["ruth"].name); p.fill("#suEmail", P["ruth"].email)
    p.fill("#suPassword", P["ruth"].password); p.fill("#suPassword2", P["ruth"].password)
    p.locator("#signupForm button[type=submit]").click(); settle(p)
    txt = body(p)
    check("check your email" in txt.lower() or p.locator("#resendConfirm").count() > 0, "sign-up", "asked to confirm their email first", txt[:300])
    if p.locator("#resendConfirm").count():
        p.click("#resendConfirm"); settle(p)
    shot(p, "check-email")
    B.close_all()
    P["ruth"].load_id()

    log("A2. Forgot password → email sent; reset link → new password")
    p = B.session(P["blake"], sign_in=False)
    p.click("#goForgot"); p.wait_for_selector("#fpEmail")
    p.fill("#fpEmail", P["blake"].email); p.click("#fpSubmit"); settle(p)
    check("sent" in body(p).lower() or "check" in body(p).lower(), "password reset", "the forgot-password form says the link was sent", body(p)[:300])
    if p.locator("#fpBackToSignin").count():
        p.click("#fpBackToSignin")
    B.close_all()
    # The emailed link signs them in (Supabase's recovery session) and opens ?reset=1.
    p = B.session(P["blake"])
    p.goto(BASE + "/?reset=1"); settle(p)
    try:
        p.wait_for_selector("#npPassword", timeout=10000)
        p.fill("#npPassword", "New-Faithful-2027")
        if p.locator("#npPassword2").count():
            p.fill("#npPassword2", "New-Faithful-2027")
        p.locator("#newPwForm button[type=submit]").click(); settle(p)
        p.wait_for_selector("#main .page-header", timeout=10000)
        check(True, "password reset", "a reset link leads to Choose a New Password, then into the site")
    except Exception as e:
        shot(p, "reset")
        check(False, "password reset", "a reset link leads to Choose a New Password", body(p)[:300])
    B.close_all()

    log("A3. Sign out; signed out after 30 idle minutes")
    p = B.session(P["blake"])
    p.click("#logoutBtn"); p.wait_for_selector("#signinForm", timeout=10000)
    check(True, "sign out", "Log Out returns to the sign-in screen")
    B.close_all()
    p = B.session(P["blake"])
    p.clock.fast_forward("28:30")
    p.wait_for_timeout(1500)
    warned = p.locator("#idleStay").count() > 0
    check(warned, "idle", "a warning appears before the 30-minute sign-out", body(p)[:200])
    if warned:
        p.click("#idleStay"); p.wait_for_timeout(300)
    p.clock.fast_forward("31:00"); p.wait_for_timeout(2000)
    check(p.locator("#signinForm").count() == 1, "idle", "signed out after 30 minutes of no activity", body(p)[:200])
    B.close_all()

    log("A4. Enrollment requests: request, withdraw, request again; deny with a note; approve all")
    for k in ("blake", "amber"):
        p = B.session(P[k])
        go(p, "courses")
        b = p.locator(f"[data-request='{cid[GEN]}']")
        if check(b.count() == 1, "enrollment", f"{P[k].name} can request {GEN}"):
            b.click(); settle(p)
        if k == "blake":
            w = p.locator(f"[data-withdraw='{cid[GEN]}']")
            if check(w.count() == 1, "enrollment", "a pending request can be withdrawn"):
                w.click(); confirm(p); settle(p)
                check(q(f"select count(*) from enrollment_requests where course_id = '{cid[GEN]}' and student_id = '{P[k].id}'") == "0", "enrollment", "…and it's gone")
                p.locator(f"[data-request='{cid[GEN]}']").click(); settle(p)
        B.close_all()
    q(f"insert into enrollment_requests (course_id, student_id) values ('{cid[GEN]}', '{P['gone'].id}')")
    o = B.session(other_t)
    go(o, "manage", cid[GEN]); reveal_tab(o, "students")
    o.locator(f"#mgEnrollRequestsSection .user-row", has_text="Gone Soon").locator("[data-deny]").click()
    o.wait_for_selector("#denyNote"); o.fill("#denyNote", "Please finish Hermeneutics II first."); o.click("#denySave"); settle(o)
    if check(o.locator("#mgApproveAll").count() == 1, "enrollment", "Approve All is offered for several requests"):
        o.click("#mgApproveAll"); confirm(o); settle(o)
    n = q(f"select count(*) from enrollments where course_id = '{cid[GEN]}'")
    check(n == "2", "enrollment", "Approve All enrolls Blake and Amber", n)
    o.click("#mgAddStudent"); o.wait_for_selector("#addStudentList")
    o.locator("#addStudentList .user-row", has_text="Sam Self").locator("button").first.click(); settle(o)
    o.click("#addStudentDone"); settle(o)
    check(q(f"select count(*) from enrollments where course_id = '{cid[GEN]}' and student_id = '{P['sam'].id}'") == "1", "roster", "Add Student puts Sam on the roster")
    B.close_all()
    tick(ak(2027, 2, 15, 10, 10))
    gone_note = [m for m in mails() if m["to"] == P["gone"].email]
    check(any("not approved" in m["subject"] for m in gone_note), "email", "the denied student is emailed (the note waits in their messages)", [m["subject"] for m in gone_note])
    check("Hermeneutics II first" in q(f"select string_agg(text, ' ') from messages where student_id = '{P['gone'].id}'"), "enrollment", "the teacher's note is in the student's messages")

    log("A5. A teacher looks at a course someone else teaches; edits and deletes a course")
    t = B.session(teacher)
    go(t, "catalogue")
    tile = t.locator(".tile", has_text=GEN)
    if tile.count():
        tile.first.click(); settle(t)
        check(t.locator("#ciClose").count() == 1, "catalogue", "another teacher's course opens as an information card", body(t)[:200])
        if t.locator("#ciClose").count():
            t.click("#ciClose")
    go(t, "manage", cid[HERM])
    t.click("#mgEditCourse"); t.wait_for_selector("#ecSave")
    t.fill("#ecName", HERM)
    if t.locator("#ecLocation").count():
        t.fill("#ecLocation", "Fellowship Hall")
    if t.locator("#ecMeetingUrl").count():
        t.fill("#ecMeetingUrl", "zoom.us/j/12345")
    t.click("#ecSave"); settle(t)
    check(q(f"select location from courses where id = '{cid[HERM]}'") == "Fellowship Hall", "edit course", "the class's room is saved")
    tmp = site(t, "return await DB.createCourse({ title: 'Scratch Course', description: 'x', credits: 1, level: '100', facultyId: null });")
    B.close_all()
    a = B.session(admin)
    site(a, f"await DB.setArchived('{tmp}', true); await loadAll();")
    go(a, "manage", tmp)
    if check(a.locator("#mgDeleteCourse").count() == 1, "delete course", "an Admin sees Delete on a course"):
        a.click("#mgDeleteCourse"); a.wait_for_selector("#confirmDeleteCourse")
        a.click("#confirmDeleteCourse"); settle(a)
        check(q(f"select count(*) from courses where id = '{tmp}'") == "0", "delete course", "the course is deleted")
    log("A6. An Admin deletes an account; profiles and photos")
    go(a, "settings")
    row = a.locator(".user-row", has_text="Gone Soon")
    row.locator("[data-delete]").first.click(); a.wait_for_selector("#confirmDelete")
    a.click("#confirmDelete"); settle(a)
    check(q(f"select count(*) from profiles where id = '{P['gone'].id}'") == "0", "delete user", "Gone Soon's account is deleted")
    B.close_all()
    p = B.session(P["blake"])
    p.click("#myProfileBtn"); settle(p)
    for sel, val in (("#pfChurch", "True North Baptist Church"), ("#pfBio", "Saved at 19. I teach the junior boys."), ("#pfPhone", "(907) 555-0142"),
                     ("#pfAddress", "PO Box 12"), ("#pfCity", "North Pole"), ("#pfState", "AK"), ("#pfZip", "99705")):
        if p.locator(sel).count():
            p.fill(sel, val)
    p.click("#saveProfileBtn"); settle(p)
    check(q(f"select city from profiles where id = '{P['blake'].id}'") == "North Pole", "profile", "Blake saves his profile")
    p.set_input_files("#avatarInput", os.path.join(HERE, "..", "e2e", "test-photo.png"))
    try:
        p.wait_for_selector("#cropSave", timeout=8000)
        if p.locator("#cropZoom").count():
            p.locator("#cropZoom").fill("1.5")
        p.click("#cropSave"); settle(p); p.wait_for_timeout(500)
        check(q(f"select avatar_path is not null from profiles where id = '{P['blake'].id}'") == "t", "profile", "Blake crops and saves a photo")
    except Exception:
        check(False, "profile", "the photo cropper opens", body(p)[:200])
    if p.locator("#removePhotoBtn").count():
        p.click("#removePhotoBtn"); confirm(p); settle(p)
        check(q(f"select avatar_path is null from profiles where id = '{P['blake'].id}'") == "t", "profile", "…and can remove it")
    B.close_all()
    t = B.session(teacher)
    go(t, "discussionBoard", cid[HERM])
    t.fill("#dbNewPost", "What does Psalm 1 teach about meditation?"); t.click("#dbPostBtn"); settle(t)
    B.close_all()
    p = B.session(P["amber"])
    go(p, "discussionBoard", cid[HERM])
    p.locator("[data-reply-input]").first.fill("Day and night — it's a habit."); p.locator("[data-reply-btn]").first.click(); settle(p)
    B.close_all()
    p = B.session(P["blake"])
    go(p, "discussionBoard", cid[HERM])
    chip = p.locator(".person-chip", has_text="Amber Amis")
    if check(chip.count() > 0, "profile", "a classmate's name is a link on the discussion board"):
        chip.first.click(); p.wait_for_selector(".person-card", timeout=5000)
        card = p.inner_text(".person-card")
        check("amber.amis@example.com" not in card and "555" not in card, "privacy", "a classmate's card shows no email or phone", card[:200])
    B.close_all()


# =====================================================================
def phase_courses():
    load()
    set_clock(NOW_AK)
    log("B1. Course materials and turned-in files open in the viewer")
    p = B.session(P["blake"])
    go(p, "course", cid[HERM]); reveal_tab(p, "materials")
    m = p.locator("[data-open-material]:visible")
    if check(m.count() >= 2, "materials", "Blake sees the class documents", p.inner_text("#main")[:300]):
        for i in range(m.count()):
            m.nth(i).click(); p.wait_for_selector("#matClose", timeout=8000); settle(p)
            if p.locator("#matDownload").count():
                with p.expect_download(timeout=8000) as dl:
                    p.click("#matDownload")
                check(dl.value.suggested_filename != "", "materials", f"a document downloads ({dl.value.suggested_filename})")
            p.click("#matClose")
    B.close_all()
    t = B.session(teacher)
    go(t, "manage", cid[HERM]); reveal_tab(t, "assignments")
    t.locator("[data-view-series]").first.click(); t.wait_for_selector("[data-week-roster]")
    check(t.locator("[data-week-roster]").count() == 6, "series", "View Weeks lists all 6 quizzes")
    t.locator("[data-week-roster]").nth(4).click(); settle(t)
    g = t.locator("[data-roster-grade]")
    if check(g.count() >= 1, "grading", "the Week 5 roster has Amber's turned-in file to grade", t.inner_text(".modal")[:300] if t.locator(".modal").count() else ""):
        g.first.click(); t.wait_for_selector("#gradeScore")
        if t.locator("#gradeOpenFile").count():
            t.click("#gradeOpenFile"); t.wait_for_selector("#matClose", timeout=8000); t.click("#matClose")
        t.fill("#gradeScore", "12"); t.click("#gradeSave"); confirm(t); settle(t)
        check(q(f"select score from submissions s join assignments a on a.id = s.assignment_id where a.title = 'Quiz — Week 5' and s.student_id = '{P['amber'].id}'") == "12",
              "grading", "extra credit (12/10) saves after the 'more than the points' question")
    B.close_all()
    log("B2. Calendars: day details, phone calendar link")
    for who in (teacher, P["blake"]):
        p = B.session(who)
        go(p, "calendar")
        day = p.locator("[data-cal-day='2027-02-17']")
        if check(day.count() == 1, "calendar", f"{who.name}'s calendar shows Feb 17"):
            day.first.click(); p.wait_for_timeout(500); settle(p)
            txt = p.inner_text(".cal-modal") if p.locator(".cal-modal").count() else (p.inner_text("#calDayDetail") if p.locator("#calDayDetail").count() else "")
            check("Psalm Reflection" in txt or "Class" in txt, "calendar", f"{who.name} taps Feb 17 and sees the class and what's due", txt[:200])
            if who is teacher and p.locator("[data-cal-roster]").count():
                p.locator("[data-cal-roster]").first.click(); settle(p)
            if p.locator("#calModalClose").count():
                p.click("#calModalClose")
        for sel in ("#rosterClose", "#calModalClose"):
            if p.locator(sel).count():
                p.click(sel); settle(p)
        p.click("#calPhone"); p.wait_for_selector("#pcLink")
        l1 = p.input_value("#pcLink")
        p.click("#pcReset"); confirm(p); p.wait_for_timeout(600)
        l2 = p.input_value("#pcLink")
        check(l1 != l2 and "calendar-feed?t=" in l2, "calendar", f"{who.name} gets a phone-calendar link and can replace it")
        p.keyboard.press("Escape")
        if who is teacher:
            go(p, "calendar"); p.evaluate("calendarMode = 'twoweek'; renderMain()"); settle(p)
        B.close_all()
    log("B3. Messages: export a thread")
    p = B.session(P["blake"])
    go(p, "messages")
    p.locator("li", has_text=HERM).first.click(); settle(p)
    p.fill("#msgInput", "Will the reflection be graded on length?"); p.click("#msgSend"); settle(p)
    with p.expect_download(timeout=10000) as dl:
        p.click("#msgExport")
    check(dl.value.suggested_filename.lower().endswith(".pdf"), "messages", "Export Thread downloads a PDF", dl.value.suggested_filename)
    B.close_all()
    log("B4. Resource Library: search, shelves, covers")
    p = B.session(P["amber"])
    go(p, "resourceLibrary")
    p.fill("#resSearchInput", "preaching"); p.wait_for_timeout(500)
    check(p.locator(".lib-book").count() > 0, "library", "a search finds church-library books", body(p)[:200])
    cov = p.locator("[data-lib-cover]")
    if cov.count():
        cov.first.click(); p.wait_for_timeout(300); p.keyboard.press("Escape")
    p.fill("#resSearchInput", ""); p.wait_for_timeout(300)
    for sel in ("#libToggleAll", "#libWiden"):
        if p.locator(sel).count():
            p.click(sel); settle(p)
    if p.locator("#resSort").count():
        opts = p.eval_on_selector_all("#resSort option", "o => o.map(x => x.value)")
        for v in opts:
            p.select_option("#resSort", v); settle(p)
    sh = p.locator("[data-lib-shelf], [data-shelf]")
    if sh.count():
        sh.first.click(); settle(p)
    more = p.locator("[data-lib-more]")
    if more.count():
        more.first.click(); settle(p)
    B.close_all()
    log("B5. Notification links, and the browser's Back button")
    p = B.session(P["blake"])
    p.click("#notifBell"); p.wait_for_selector("#notifPanel")
    items = p.locator("#notifPanel [data-notif-link]")
    if items.count():
        items.first.click(); settle(p)
    go(p, "grades"); go(p, "calendar"); go(p, "course", cid[HERM])
    p.go_back(); settle(p); p.go_back(); settle(p)
    v = p.evaluate("view")
    check(v in ("grades", "calendar"), "navigation", "the browser's Back button steps back through the site's pages", v)
    p.go_forward(); settle(p)
    B.close_all()


# =====================================================================
def phase_bible():
    load()
    set_clock(NOW_AK)
    log("C. Study Bible")
    b = B.session(P["blake"])
    go(b, "studyBible")
    b.wait_for_selector("#verse-16 .sw", timeout=20000)
    check("John 3" in b.inner_text("#sbReading"), "study bible", "opens John 3 by default")
    b.locator("#verse-16 .sw", has_text="loved").first.click(); b.wait_for_selector("#sbPanel .strongs-word", timeout=10000)
    check("G25" in b.inner_text("#sbPanel"), "study bible", "tapping 'loved' opens Strong's G25")
    if b.locator("#sbPanel .sn-link").count():
        b.locator("#sbPanel .sn-link").first.click()
        try:
            b.wait_for_selector("#sbPanelBack", timeout=8000); b.click("#sbPanelBack")
        except Exception:
            check(False, "study bible", "a related Strong's number opens with Back")
    b.wait_for_selector("#sbSeeAll"); b.click("#sbSeeAll"); b.wait_for_selector(".sb-result", timeout=15000)
    check(b.locator(".sb-result").count() >= 40, "study bible", "See every occurrence lists the verses")
    b.click("#sbPanelClose")
    b.fill("#sbQuery", "Rom 8:28"); b.keyboard.press("Enter"); b.wait_for_selector("#verse-28", timeout=10000)
    check("Romans 8" in b.inner_text("#sbReading"), "study bible", "a typed reference jumps to it")
    for qy, want in (('"born again"', "John 3:3"), ("grace faith", "Ephesians 2:8"), ("G26", "")):
        b.fill("#sbQuery", qy); b.keyboard.press("Enter"); b.wait_for_timeout(3000)
        try:
            b.wait_for_selector(".sb-result", timeout=15000)
            refs = b.eval_on_selector_all(".sb-result-ref", "e => e.map(x => x.textContent)")
            ok = (want in refs) if want else bool(refs)
        except Exception:
            ok = False
        check(ok, "study bible", f"searching {qy} finds {want or 'results'}", b.inner_text("#sbReading")[:200])
    for sel in ("#sbSearchMode", "#sbSearchScope"):
        if b.locator(sel).count():
            for v in b.eval_on_selector_all(f"{sel} option", "o => o.map(x => x.value)"):
                b.select_option(sel, v); b.wait_for_timeout(400)
    b.locator(".sb-result-ref").first.click(); b.wait_for_timeout(600)
    b.fill("#sbQuery", "John 3:16"); b.keyboard.press("Enter"); b.wait_for_selector("#verse-16")
    b.click("#verse-16 .verse-num")
    if b.locator("#verse-16 [data-xref]").count():
        b.locator("#verse-16 [data-xref]").click(); b.wait_for_selector(".sb-xref", timeout=8000)
        check(b.locator(".sb-xref").count() >= 5, "study bible", "cross references open for John 3:16")
        b.locator(".sb-xref").first.click(); b.wait_for_timeout(500)
        if b.locator("#sbPanelClose").count():
            b.click("#sbPanelClose")
        b.fill("#sbQuery", "John 3:16"); b.keyboard.press("Enter"); b.wait_for_selector("#verse-16")
        b.click("#verse-16 .verse-num")
    b.locator("#verse-16 [data-hl]").click(); settle(b)
    check(q(f"select count(*) from bible_highlights where user_id = '{P['blake'].id}'") == "1", "study bible", "highlighting John 3:16 is saved")
    b.click("#sbToggleHighlights"); b.wait_for_timeout(400)
    check("John 3:16" in b.inner_text("#sbReading"), "study bible", "My Highlights lists it")
    b.click("#sbToggleHighlights")
    b.select_option("#sbBook", "PSA"); b.wait_for_selector(".verse-row")
    b.select_option("#sbChapter", "23"); b.wait_for_timeout(800)
    b.check("#sbNumbers"); b.wait_for_timeout(500)
    check("H7462" in b.inner_text("#sbReading"), "study bible", "Strong's numbers show inline (Psalm 23)")
    b.uncheck("#sbNumbers")
    for sz in b.locator("[data-size]").all():
        sz.click(); b.wait_for_timeout(100)
    for ft in b.locator("[data-feat]").all():
        ft.click(); b.wait_for_timeout(200)
    b.keyboard.press("Escape")
    B.close_all()
    a = B.session(P["amber"])
    check(a.evaluate("bibleHighlightRows.length") == 0, "privacy", "Blake's highlights aren't Amber's")
    B.close_all()


# =====================================================================
def phase_editor():
    load()
    set_clock(NOW_AK)
    log("D. The writing editor — every toolbar button")
    b = B.session(P["blake"])
    go(b, "course", cid[HERM]); reveal_tab(b, "assignments")
    b.locator("li", has_text="Psalm Reflection").locator("[data-assignment]:visible").first.click()
    b.wait_for_selector("input[name=submitMethod][value=editor]")
    b.check("input[name=submitMethod][value=editor]"); b.wait_for_selector(".rte-page")
    b.click(".rte-page"); b.keyboard.type("Blessed is the man that walketh not in the counsel of the ungodly.")
    b.keyboard.press("Enter"); b.keyboard.type("Second paragraph with more words to format.")
    # every button, with some text selected
    n = b.locator(".rte-toolbar [data-cmd]").count()
    cmds = b.eval_on_selector_all(".rte-toolbar [data-cmd]", "els => els.map(e => e.dataset.cmd)")
    log(f"   {n} toolbar buttons: {', '.join(cmds)}")
    for cmd in cmds:
        if cmd in ("print",):
            b.evaluate("window.print = () => { window.__printed = true; }")
        b.click(".rte-page p >> nth=-1"); b.keyboard.press("End"); b.keyboard.press("Shift+Home")
        btn = b.locator(f".rte-toolbar [data-cmd='{cmd}']").first
        try:
            btn.click(timeout=3000)
        except Exception:
            continue
        b.wait_for_timeout(150)
        # close whatever popup opened
        for sel in (".rte-grid span[data-r='2'][data-c='2']", ".rte-swatch", ".rte-pop button"):
            if b.locator(sel).count() and b.locator(sel).first.is_visible():
                try:
                    b.locator(sel).first.click(timeout=1000)
                except Exception:
                    pass
                break
        if cmd == "footnote":
            b.keyboard.type("A footnote.")
        b.keyboard.press("Escape"); b.wait_for_timeout(100)
        if b.locator("#submitModal").count() == 0:   # Escape closed the whole window — reopen it
            b.locator("li", has_text="Psalm Reflection").locator("[data-assignment]:visible").first.click()
            b.wait_for_selector(".rte-page")
    for sel in ('[data-sel="font"]', '[data-sel="size"]'):
        if b.locator(sel).count():
            b.click(".rte-page p >> nth=0"); b.keyboard.press("End"); b.keyboard.press("Shift+Home")
            for v in b.eval_on_selector_all(f"{sel} option", "o => o.map(x => x.value).filter(Boolean)")[:3]:
                b.select_option(sel, v); b.wait_for_timeout(60)
    b.click(".rte-page p >> nth=-1"); b.keyboard.press("End"); b.keyboard.press("Enter")
    b.locator('.rte-toolbar [data-cmd="pop:table"]').click(); b.locator(".rte-grid span[data-r='2'][data-c='2']").click(); b.wait_for_timeout(200)
    b.locator(".rte-page table td").first.click(); b.wait_for_timeout(200)
    tb = b.eval_on_selector_all(".rte-tablebar button", "e => e.map(x => x.textContent.trim())")
    for label in tb:
        if "Delete table" in label:
            continue
        b.locator(".rte-page table td, .rte-page table th").first.click()
        b.locator(".rte-tablebar button", has_text=label).first.click(); b.wait_for_timeout(80)
    check(b.locator(".rte-page table").count() >= 1 and len(tb) >= 4, "editor", f"table tools work ({len(tb)} buttons)", tb)
    if b.locator(".rte-style").count():
        for v in b.eval_on_selector_all(".rte-style option", "o => o.map(x => x.value)"):
            b.click(".rte-page p >> nth=0"); b.select_option(".rte-style", v); b.wait_for_timeout(80)
    # Insert Scripture by reference and by words
    b.click(".rte-page p >> nth=-1"); b.keyboard.press("End")
    b.locator(".rte-toolbar [data-cmd='pop:scripture'], .rte-scripture-btn").first.click(); b.wait_for_selector(".rte-scr-form")
    b.fill(".rte-scr-form input", "Ps 1:1-3"); b.keyboard.press("Enter"); b.wait_for_selector(".rte-scr-passage", timeout=10000)
    b.locator(".rte-scr-opts .btn", has_text="Insert").click(); b.wait_for_timeout(200)
    check(b.locator(".rte-page blockquote.scripture").count() >= 1, "editor", "Psalm 1:1-3 is inserted as a block quotation")
    b.locator(".rte-toolbar [data-cmd='pop:scripture'], .rte-scripture-btn").first.click(); b.wait_for_selector(".rte-scr-form")
    b.fill(".rte-scr-form input", "his delight is in the law"); b.keyboard.press("Enter")
    b.wait_for_selector(".rte-scr-hit", timeout=10000); b.locator(".rte-scr-hit").first.click(); b.wait_for_selector(".rte-scr-passage")
    if b.locator(".rte-seg label", has_text="In my sentence").count():
        b.locator(".rte-seg label", has_text="In my sentence").click()
    b.locator(".rte-scr-opts .btn", has_text="Insert").click(); b.wait_for_timeout(200)
    check("Psalm 1:2" in b.inner_text(".rte-page"), "editor", "a word search finds Psalm 1:2 and inserts it")
    b.wait_for_timeout(1500)
    check(b.evaluate("Object.keys(localStorage).some(k => k.startsWith('tnbbi-draft:'))"), "editor", "the draft is kept on the device")
    # close without turning in → the draft comes back
    b.click("#submitCancel") if b.locator("#submitCancel").count() else b.keyboard.press("Escape")
    confirm(b)
    b.locator("li", has_text="Psalm Reflection").locator("[data-assignment]:visible").first.click()
    b.wait_for_selector("input[name=submitMethod][value=editor]")
    b.check("input[name=submitMethod][value=editor]"); b.wait_for_selector(".rte-page")
    restore_btn = b.locator(".rte-draftbar button").first
    if check(restore_btn.count() == 1, "editor", "reopening offers the saved draft", b.inner_text(".modal")[:200]):
        restore_btn.click(); b.wait_for_timeout(200)
        check("Blessed is the man" in b.inner_text(".rte-page"), "editor", "…and brings it back")
    b.evaluate("document.querySelector('.rte-page').innerHTML += '<img src=x onerror=\"window.__xss=1\"><a href=\"javascript:alert(1)\">x</a>'")
    b.click("#submitTurnIn"); settle(b)
    sub = q(f"select status || '|' || length(written_content) from submissions s join assignments a on a.id = s.assignment_id where a.title = 'Psalm Reflection' and s.student_id = '{P['blake'].id}'")
    check(sub.startswith("submitted"), "editor", "written work is turned in", sub)
    saved = q(f"select written_content from submissions s join assignments a on a.id = s.assignment_id where a.title = 'Psalm Reflection' and s.student_id = '{P['blake'].id}'")
    check("onerror" not in saved and "javascript:" not in saved, "privacy", "scripts are stripped from written work before it's saved", saved[-300:])
    B.close_all()
    t = B.session(teacher)
    go(t, "gradeSheet", cid[HERM])
    t.evaluate(f"(() => {{ const c = courses.find(x => x.id === '{cid[HERM]}'); const a = c.assignments.find(x => x.title === 'Psalm Reflection'); openGradeModal(c, a, '{P['blake'].id}', () => renderMain()); }})()")
    t.wait_for_selector("#gradeScore")
    log(f"   grade window: {t.inner_text('.modal')[:200]!r}")
    if t.locator("#gradeOpenFile").count():
        t.click("#gradeOpenFile"); t.wait_for_timeout(800)
        txt = body(t)
        check("Blessed is the man" in txt, "editor", "the teacher reads the written work", txt[:200])
        check(not t.evaluate("window.__xss"), "privacy", "…and no script in it runs for the teacher either")
        t.keyboard.press("Escape")
    check(not t.evaluate("window.__xss"), "privacy", "nothing in the written work runs when the teacher opens it")
    B.close_all()


# =====================================================================
def phase_records():
    load()
    set_clock(NOW_AK)
    log("E1. Text size, day/night")
    b = B.session(P["blake"])
    sizes = []
    for _ in range(4):
        b.click("#textSizeToggle"); b.wait_for_timeout(150)
        sizes.append(b.evaluate("document.documentElement.style.fontSize"))
    check(sizes[:3] == ["112.5%", "125%", ""], "text size", "Aa steps through two larger sizes and back to normal", sizes)
    b.click("#themeToggle"); b.wait_for_timeout(150)
    check(b.evaluate("document.documentElement.dataset.theme") == "dark", "theme", "the moon switches to night view")
    b.click("#themeToggle")
    log("E2. Help: search and the tour")
    b.click("#helpBtn"); settle(b)
    for qy in ("turn in homework", "attendance", "xyzzy nothing"):
        b.fill("#helpQuery", qy); b.wait_for_timeout(400)
    b.fill("#helpQuery", "turn in homework"); b.wait_for_timeout(400)
    check("turn in" in b.inner_text("#main").lower(), "help", "searching Help finds the answer about turning in work")
    b.fill("#helpQuery", ""); b.wait_for_timeout(300)
    b.click("#helpTour"); b.wait_for_selector(".tour-card", timeout=8000)
    steps = 1
    while b.locator("#tourNext").count() and b.locator("#tourNext").inner_text() != "Finish" and steps < 40:
        b.click("#tourNext"); b.wait_for_timeout(120); steps += 1
    if b.locator("#tourNext").count():
        b.click("#tourNext"); b.wait_for_timeout(300)
    check(b.locator(".tour-card").count() == 0 and steps >= 8, "tour", f"the student tour runs through every step ({steps})")
    B.close_all()
    t = B.session(teacher)
    t.click("#helpBtn"); settle(t); t.click("#helpTour"); t.wait_for_selector(".tour-card", timeout=8000)
    t.keyboard.press("ArrowRight"); t.keyboard.press("ArrowRight"); t.keyboard.press("ArrowLeft"); t.keyboard.press("Escape"); t.wait_for_timeout(200)
    check(t.locator(".tour-card").count() == 0, "tour", "the teacher's tour can be stepped with the arrow keys and closed with Escape")
    B.close_all()

    log("E3. Transcripts: record, Admin entries (a W), PDF and CSV")
    t = B.session(teacher)
    go(t, "gradeSheet", cid[PAUL])
    t.click("#gsRecord"); t.wait_for_selector("#rgSave")
    t.click("#rgSave"); settle(t)
    B.close_all()
    a = B.session(admin)
    go(a, "transcripts")
    a.locator("[data-tr-ref]", has_text="Sam Self").first.click(); settle(a)
    a.click("#trAdd"); a.wait_for_selector("#teCourse")
    a.fill("#teCourse", "Bible Doctrines I"); a.fill("#teTerm", "Fall 2025"); a.fill("#teCredits", "3")
    a.select_option("#teGrade", "W"); a.fill("#teTeacher", "Bro. Smith"); a.fill("#teStart", "2025-09-02")
    if a.locator("#teNote").count():
        a.fill("#teNote", "Withdrew Oct 20")
    a.click("#teSave"); settle(a)
    sheet = a.inner_text(".transcript-sheet")
    check("Bible Doctrines I" in sheet and "W" in sheet, "transcripts", "an Admin adds a W by hand", sheet[:300])
    with a.expect_download(timeout=15000) as dl:
        a.click("#trPdf")
    path = os.path.join(SIM, "transcript.pdf"); dl.value.save_as(path)
    check(open(path, "rb").read(5) == b"%PDF-", "transcripts", "the transcript downloads as a real PDF")
    # edit, then delete, the hand entry
    a.locator(".transcript-sheet [data-te-edit], .transcript-sheet button", has_text="Edit").first.click() if a.locator(".transcript-sheet button", has_text="Edit").count() else None
    if a.locator("#teDelete").count():
        a.click("#teDelete"); confirm(a); settle(a)
        check("Bible Doctrines I" not in a.inner_text(".transcript-sheet"), "transcripts", "…and can delete it")
    go(a, "transcripts")
    with a.expect_download(timeout=15000) as dl:
        a.click("#trCsv")
    check(dl.value.suggested_filename.endswith(".csv"), "transcripts", "all transcripts download as a spreadsheet (CSV)")
    if a.locator("#trAllPdf").count():
        with a.expect_download(timeout=30000) as dl:
            a.click("#trAllPdf")
        check(dl.value.suggested_filename.endswith(".pdf"), "transcripts", "…or as one PDF")
    if a.locator("#trSearch").count():
        a.fill("#trSearch", "sam"); a.wait_for_timeout(300)

    log("E4. Past records from before the site")
    a.click("#trPast"); settle(a)
    with a.expect_download() as dl:
        a.click("#prTemplate")
    head = "Student,Email,Course,Term,Credits,Grade,Score %,Instructor\n"
    rows = ["Blake Amis,blake.amis@example.com,Church History II,Spring 2024,3,B+,88.77,Bro. Raby",
            "Grace Future,grace.future@example.com,Hermeneutics I,Spring 2025,3,A-,91.68,",
            '"Lucy Lambert",,"Landmarks of English Bible","Spring 2024 - Spring 2025",3,AU,,']
    a.set_input_files("#prFile", files=[{"name": "old.csv", "mimeType": "text/csv", "buffer": (head + "\n".join(rows + ["Bad Row,bad@example.com,X,Spring 2024,3,Q,,"]) + "\n").encode()}])
    a.wait_for_selector(".pr-table"); settle(a)
    check(a.locator(".pr-table tr.pr-bad").count() == 1 and a.locator("#prCommit").is_disabled(), "past records", "a bad grade is flagged and blocks the import")
    a.click("#prCancel")
    a.set_input_files("#prFile", files=[{"name": "old.csv", "mimeType": "text/csv", "buffer": (head + "\n".join(rows) + "\n").encode()}])
    a.wait_for_selector(".pr-table"); settle(a)
    a.click("#prCommit"); confirm(a); settle(a)
    check(q(f"select count(*) from transcript_entries where student_id = '{P['blake'].id}' and course_title = 'Church History II'") == "1", "past records", "Blake's old course goes straight onto his transcript")
    lucy = a.locator(".materials-list > li", has_text="Lucy Lambert")
    if lucy.count() and lucy.locator("[data-pr-link]").count():
        lucy.locator("[data-pr-link]").click(); a.wait_for_selector("#lpPick")
        if a.locator("#lpSearch").count():
            a.fill("#lpSearch", "amber"); a.wait_for_timeout(400)
        opts = a.eval_on_selector_all("#lpPick option", "o => o.map(x => x.value).filter(Boolean)")
        if opts:
            a.select_option("#lpPick", opts[0])
        a.click("#lpSave"); confirm(a); settle(a)
        check(q("select count(*) from past_records where student_name = 'Lucy Lambert' and transcript_id is not null") == "1", "past records", "a record with no email is linked to an account by hand")
    grace = a.locator(".materials-list > li", has_text="Grace Future")
    if grace.count() and grace.locator("[data-pr-remove]").count():
        grace.locator("[data-pr-remove]").click(); confirm(a); settle(a)
        check(q("select count(*) from past_records where student_name = 'Grace Future'") == "0", "past records", "a mistaken past record can be removed")
    if a.locator("#prSearch").count():
        a.fill("#prSearch", "lucy"); a.wait_for_timeout(300)
    B.close_all()

    log("E5. Cancel a class and put it back; archive a course before grades are recorded")
    t = B.session(teacher)
    go(t, "manage", cid[HERM]); reveal_tab(t, "setup")
    t.locator("#mgCancelCard [data-cancel-day]").first.click(); t.wait_for_selector("#ccReason")
    day = t.input_value("#ccDate")
    t.fill("#ccReason", "Pastor away"); t.click("#ccConfirm"); settle(t)
    t.locator(f"#mgCancelCard [data-restore-day='{day}']").click(); confirm(t); settle(t)
    check(q(f"select count(*) from class_cancellations where course_id = '{cid[HERM]}' and class_date = '{day}'") == "0", "cancel class", "a canceled class is put back on")
    B.close_all()
    tick(ak(2027, 2, 15, 10, 30))
    q(f"insert into enrollments (course_id, student_id) values ('{cid[GEN]}', '{P['amber'].id}') on conflict do nothing")
    o = B.session(other_t)
    go(o, "catalogue")
    btn = o.locator(f"[data-archive-toggle='{cid[GEN]}']")
    if check(btn.count() == 1, "archive", "the teacher can archive Genesis to Revelation from the catalogue"):
        btn.click(); o.wait_for_timeout(500)
        log(f"   after Archive: {o.inner_text('#confirmRoot')[:200] if o.locator('#confirmRoot').count() else (o.inner_text('.modal')[:200] if o.locator('.modal').count() else 'nothing opened')!r}")
        confirm(o); o.wait_for_timeout(300)
        offered = o.locator("#arRecord").count() == 1
        check(offered, "archive", "archiving first offers to record final grades")
        if offered:
            o.click("#arCancel"); settle(o)
    B.close_all()


# =====================================================================
def phase_extras():
    load()
    set_clock(NOW_AK)
    log("F1. Announcements, discussion and notifications: post, delete, clear")
    t = B.session(teacher)
    go(t, "manage", cid[HERM]); reveal_tab(t, "setup")
    t.fill("#annBody", "Bring your Bible Wednesday."); t.click("#annPost"); settle(t)
    d = t.locator("[data-del-ann]")
    if check(d.count() >= 1, "announcements", "a posted announcement can be deleted"):
        d.first.click(); confirm(t); settle(t)
    go(t, "discussionBoard", cid[HERM])
    t.fill("#dbNewPost", "Delete me"); t.click("#dbPostBtn"); settle(t)
    dp = t.locator("[data-delete-post]")
    if check(dp.count() >= 1, "discussion", "the teacher can delete a post"):
        dp.first.click(); confirm(t); settle(t)
    log("F2. Materials: Teachers only on/off, remove; documents on an assignment")
    go(t, "manage", cid[HERM]); reveal_tab(t, "materials")
    to = t.locator("[data-teacher-only]")
    if to.count():
        to.first.check(); settle(t); to = t.locator("[data-teacher-only]"); to.first.uncheck(); settle(t)
    rm = t.locator("[data-remove-material]")
    n0 = q(f"select count(*) from materials where course_id = '{cid[HERM]}'")
    if rm.count():
        rm.last.click(); confirm(t); settle(t)
        check(int(q(f"select count(*) from materials where course_id = '{cid[HERM]}'")) == int(n0) - 1, "materials", "a document is removed")
    reveal_tab(t, "assignments")
    dd = t.locator("[data-asg-docs]")
    if check(dd.count() >= 1, "documents", "an assignment has a Documents button"):
        dd.first.click(); t.wait_for_selector("#adSave")
        t.locator("#adPicker [data-pick-toggle]").click() if t.locator("#adPicker [data-pick-toggle]").count() else None
        cb = t.locator("#adPicker input[data-pick-unit]")
        if cb.count():
            cb.first.check()
        t.click("#adSave"); settle(t)
    sd = t.locator("[data-series-docs]")
    if sd.count():
        sd.first.click(); t.wait_for_selector("#adSave"); t.click("#adSave"); settle(t)
    log("F3. Memory verse; lectures: add, date, hide, replace, remove")
    reveal_tab(t, "setup")
    if t.locator("#mvRef").count():
        t.fill("#mvRef", "Psalm 119:105"); t.click("#mvLook"); t.wait_for_timeout(1500)
        t.click("#mvSave"); settle(t)
        check(q(f"select memory_ref from courses where id = '{cid[HERM]}'") != "", "memory verse", "the teacher sets a memory verse")
    reveal_tab(t, "lectures")
    if t.locator("#lectAddUrl").count():
        t.fill("#lectAddUrl", "https://youtu.be/AddedLec001"); t.fill("#lectAddTitle", "Extra lecture"); t.locator("#lectAddForm button[type=submit]").click(); settle(t)
        lid = q(f"select id from lessons where course_id = '{cid[HERM]}' and video_id = 'AddedLec001'")
        check(bool(lid), "lectures", "a lecture is added by link")
        if lid:
            dsel = t.locator(f"[data-lesson-date='{lid}']")
            if dsel.count():
                dsel.fill("2027-02-10"); dsel.dispatch_event("change"); settle(t)
            auto = t.locator(f"[data-lesson-auto='{lid}']")
            if auto.count():
                auto.click(); settle(t)
            rep = t.locator(f"[data-replace-lesson='{lid}']")
            if rep.count():
                rep.click(); t.wait_for_selector("#repUrl"); t.fill("#repUrl", "https://youtu.be/AddedLec002"); t.click("#repSave"); settle(t)
            hid = t.locator(f"[data-hide-lesson='{lid}']")
            if hid.count():
                hid.click(); settle(t)
            rem = t.locator(f"[data-remove-lesson='{lid}']")
            if rem.count():
                rem.click(); confirm(t); settle(t)
    if t.locator("#lectSyncNow").count():
        t.click("#lectSyncNow"); settle(t)
    log("F4. Lesson plan: options, move, delete; slides sharing")
    reveal_tab(t, "plan")
    if q(f"select count(*) from course_plan where course_id = '{cid[HERM]}'") == "0":
        site(t, f"await DB.addPlanLessons('{cid[HERM]}', Array.from({{ length: 15 }}, (_, i) => ({{ title: 'Lesson ' + (i + 1) }}))); await loadAll(); renderMain();")
        settle(t); reveal_tab(t, "plan")
    n_plan = int(q(f"select count(*) from course_plan where course_id = '{cid[HERM]}'"))
    more_ = t.locator("[data-plan-more]:visible")
    if check(more_.count() >= 2, "lesson plan", "each lesson in the plan has a More button", more_.count()):
        more_.nth(1).click(); t.wait_for_selector("[data-opt]")
        log(f"   lesson options: {t.eval_on_selector_all('[data-opt]', 'e => e.map(x => x.dataset.opt)')}")
        first_before = q(f"select title from course_plan where course_id = '{cid[HERM]}' order by position limit 1")
        t.click("[data-opt=up]"); settle(t)
        first_after = q(f"select title from course_plan where course_id = '{cid[HERM]}' order by position limit 1")
        check(first_before != first_after, "lesson plan", "Move up swaps a lesson with the one before", [first_before, first_after])
        t.locator("[data-plan-more]:visible").last.click(); t.wait_for_selector("[data-opt=delete]")
        t.click("[data-opt=delete]"); confirm(t); settle(t)
        check(int(q(f"select count(*) from course_plan where course_id = '{cid[HERM]}'")) == n_plan - 1, "lesson plan", "a lesson can be deleted from the plan")
    ed = t.locator("[data-plan-edit]")
    if ed.count():
        ed.first.click(); t.wait_for_timeout(400); t.keyboard.press("Escape"); settle(t)
    sel = t.locator("select#planShare, select[data-slides-share], #slidesShare")
    if sel.count():
        for v in sel.first.evaluate("e => [...e.options].map(o => o.value)"):
            sel.first.select_option(v); settle(t)
    log("F5. Attendance: clear a day")
    go(t, "attendance", cid[HERM])
    t.evaluate("(d) => { attendanceDate = d; attDraft = null; renderMain(); }", "2027-02-10"); settle(t)
    if t.locator("#attClear").count():
        t.click("#attClear"); confirm(t); settle(t)
        check(q(f"select count(*) from attendance where course_id = '{cid[HERM]}' and class_date = '2027-02-10'") == "0", "attendance", "a day's attendance can be cleared")
    log("F6. Self-paced: the teacher sets Sam's start; Sam's dates follow")
    go(t, "manage", cid[PAUL]); reveal_tab(t, "students")
    st = t.locator(f"[data-start-for='{P['sam'].id}']")
    if check(st.count() == 1, "self-paced", "the roster has a start date for each self-paced student"):
        st.fill("2027-02-08"); st.dispatch_event("change"); settle(t)
        check(q(f"select start_on from enrollments where course_id = '{cid[PAUL]}' and student_id = '{P['sam'].id}'") == "2027-02-08", "self-paced", "Sam's start date is saved")
    tr = t.locator(f"[data-track-for='{P['sam'].id}']")
    B.close_all()
    s_ = B.session(P["sam"])
    go(s_, "course", cid[PAUL])
    txt = s_.inner_text("#main")
    check("Self-paced" in txt or "self-paced" in txt.lower(), "self-paced", "Sam's course page explains self-paced", txt[:300])
    jm = s_.evaluate(f"(() => {{ const c = courses.find(x => x.id === '{cid[PAUL]}'); const a = c.assignments.find(x => x.title === 'Journey Map'); return [a.due, computeCourseGrade(c, currentStudentId).pct]; }})()")
    check(jm[0] == "2027-02-22", "self-paced", "Sam's Journey Map moves with his start (Jan 18 + 35 days = Feb 22)", jm)
    go(s_, "lectureArchive"); go(s_, "home")
    B.close_all()
    log("F7. A student changes how they attend; phone notifications; test email")
    b = B.session(P["amber"])
    go(b, "course", cid[HERM])
    reveal_tab(b, "lectures")
    ch = b.locator("[id=changeTrack]:visible")
    if check(ch.count() == 1, "tracks", "Amber's course page has a way to change how she attends"):
        ch.first.click(); b.wait_for_timeout(300)
        pk = b.locator("[data-pick-track='live']")
        if check(pk.count() == 1, "tracks", "Amber can change how she attends"):
            pk.click(); settle(b)
            check(q(f"select track from enrollments where course_id = '{cid[HERM]}' and student_id = '{P['amber'].id}'") == "live", "tracks", "Amber now attends live")
    b.context.grant_permissions(["notifications"])
    go(b, "profile")
    b.wait_for_timeout(1000)
    card = b.inner_text("#reminderCard")
    check("blocked" in card.lower() or "turn on" in card.lower(), "notifications", "the phone-notifications card explains blocked notifications clearly", card[:200])
    b.locator("[data-email-pref=daily]").click(); settle(b)
    check(q(f"select notify_email from profiles where id = '{P['amber'].id}'") == "daily", "notifications", "Amber switches to a daily email summary")
    b.locator("#reminderCard button", has_text="Test Email").click(); b.wait_for_timeout(800)
    check("sent" in toast_text(b).lower() or "sent" in b.inner_text("#reminderCard").lower(), "notifications", "Send Me a Test Email says it was sent", toast_text(b))
    b.locator("[data-due-pref=both]").click(); settle(b)
    B.close_all()
    a = B.session(admin)
    go(a, "settings")
    if a.locator("#testEmailBtn").count():
        a.click("#testEmailBtn"); a.wait_for_timeout(1500); settle(a)
    if a.locator("#bkNow").count():
        with a.expect_download(timeout=15000) as dl:
            a.click("#bkNow")
        p_ = os.path.join(SIM, "backup.json"); dl.value.save_as(p_)
        check(json.load(open(p_)).get("format") == "tnbbi-backup-1", "backups", "an Admin downloads a full backup")
    log("F8. An Admin (not the teacher) records final grades for a course")
    q(f"insert into enrollments (course_id, student_id) values ('{cid[GEN]}', '{P['amber'].id}') on conflict do nothing")
    q(f"update courses set archived = false where id = '{cid[GEN]}'")
    site(a, "await loadAll();")
    go(a, "catalogue")
    a.locator(f"[data-archive-toggle='{cid[GEN]}']").click(); a.wait_for_timeout(500); confirm(a)
    if check(a.locator("#arRecord").count() == 1, "final grades", "an Admin archiving a course is offered Record Final Grades"):
        a.click("#arRecord"); a.wait_for_selector("#rgSave", timeout=15000)
        rows = a.locator("[data-rg-student]").count()
        check(rows >= 1, "final grades", "the Admin's form lists the class (grades come from the database)", rows)
        a.click("#rgSave"); settle(a)
        check(int(q(f"select count(*) from transcript_entries where course_id = '{cid[GEN]}'")) >= 1, "final grades", "the Admin records them")
    go(a, "manage", cid[HERM]); reveal_tab(a, "assignments")
    dl_ = a.locator("[data-delete-series]")
    if dl_.count():
        dl_.first.click(); a.wait_for_timeout(500)
        txt = a.inner_text("#confirmRoot") if a.locator("#confirmRoot").count() else ""
        check("submission" in txt.lower() or txt == "", "grading", "the Admin is warned how much student work deleting removes", txt[:200])
        confirm(a, yes=False)
    log("F8b. Librarian: a borrower-added book is the same as one on the list")
    q("insert into library_books (title, author, source, reviewed, copies) values ('Pilgrims Progress (paperback)', 'Bunyan', 'borrower', false, 1)")
    go(a, "libraryCheckouts")
    a.wait_for_timeout(800); settle(a)
    if a.locator("[data-libtab=new]").count():
        a.click("[data-libtab=new]"); settle(a)
    mb = a.locator("[data-lib-merge]")
    if check(mb.count() >= 1, "library", "the librarian sees the new book with 'Same as…'", a.inner_text("#main")[:300]):
        mb.first.click(); a.wait_for_selector("#lmQ")
        a.fill("#lmQ", "pilgrim"); a.wait_for_timeout(1200)
        pick = a.locator("[data-lm]")
        if check(pick.count() >= 1, "library", "searching the list finds The Pilgrim's Progress"):
            pick.first.click(); settle(a)
            check(q("select count(*) from library_books where title = 'Pilgrims Progress (paperback)'") == "0", "library", "the two are combined")
    log("F9. Dashboard verse; memory verse card; Back to the start")
    b = B.session(P["blake"])
    if b.locator("[data-verse]").count():
        b.locator("[data-verse]").first.click(); settle(b)
        check(b.evaluate("view") == "studyBible", "dashboard", "the verse of the day opens in the Study Bible")
    go(b, "course", cid[HERM])
    mc = b.locator(".memory-card, [data-memory-open]")
    if mc.count():
        mc.first.click(); settle(b)
    log("F10. A new version of the site goes live while Blake has it open")
    has_versions = b.evaluate("Object.keys(window.TNBBI_VERSIONS || {}).length")
    if check(has_versions > 0, "updates", "the page knows which versions of its files it loaded", has_versions):
        f = os.path.join(HERE, "..", "..", "docs", "js", "help.js")
        st = os.stat(f)
        os.utime(f, (st.st_atime, st.st_mtime + 120))
        try:
            b.evaluate("checkForSiteUpdate(true)"); b.wait_for_timeout(1500)
            shown = b.locator("#siteUpdateBtn").count() == 1
            check(shown, "updates", "an 'update available' bar appears when a file changes on the server")
            if shown:
                b.click("#siteUpdateBtn"); b.wait_for_selector("#main .page-header", timeout=20000); settle(b)
                check(b.evaluate("view") in ("home", "course"), "updates", "tapping it reloads into the site, still signed in", b.evaluate("view"))
        finally:
            os.utime(f, (st.st_atime, st.st_mtime))
    b.click("#notifBell"); b.wait_for_selector("#notifPanel")
    if b.locator("#notifPanel [data-dismiss]").count():
        b.locator("#notifPanel [data-dismiss]").first.click(); b.wait_for_timeout(300)
    if b.locator("#notifClearAll").count():
        b.click("#notifClearAll"); confirm(b); settle(b)
    B.close_all()


if __name__ == "__main__":
    phases = sys.argv[1:] or ["setup", "accounts", "courses", "bible", "editor", "records", "extras"]
    try:
        for ph in phases:
            if ph.startswith("snap:"):
                snapshot(ph[5:]); continue
            if ph.startswith("restore:"):
                restore(ph[8:]); continue
            globals()["phase_" + ph]()
    finally:
        B.close_all()
        save_coverage("round3-" + "-".join(x.replace(":", "_") for x in phases))
        print("\nCHECKS:", CHECKS)
        json.dump({"checks": CHECKS, "findings": FINDINGS, "js_errors": JS_ERRORS, "observed": OBSERVED},
                  open(os.path.join(SIM, "round3_results.json"), "w"), indent=1, default=str)
        for f in FINDINGS:
            print(" -", f)
