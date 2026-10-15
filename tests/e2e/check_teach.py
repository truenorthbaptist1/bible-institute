#!/usr/bin/env python3
"""End-to-end test for teaching with slides (Oct 10, 2026):
lesson plan → Teach mode on an iPad-sized screen → the classroom TV follows →
an online student follows the slides and asks a question → the teacher shows
it on the TV → End class, pick up next time → a canceled day shifts the plan.

Runs against tests/e2e/server.py (real schema, real privacy rules) with the
real PDF.js turning a real PDF into slide pictures. Needs run_e2e.sh's
database + server already up (or run it through run_teach.sh).
"""
import json, os, re, sys, time, datetime, subprocess
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8765")
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.environ.get("SHOTS", os.path.join(HERE, "screenshots", "teach"))
os.makedirs(SHOTS, exist_ok=True)
FAKE_SB = open(os.path.join(HERE, "fake-supabase.js")).read()
FAKE_PURIFY = open(os.path.join(HERE, "vendor", "purify.min.js")).read()
PDFJS = open(os.path.join(HERE, "vendor", "pdf.js")).read()
PDFJS_WORKER = open(os.path.join(HERE, "vendor", "pdf.worker.js")).read()
JSZIP = open(os.path.join(HERE, "vendor", "jszip.min.js")).read()
PPTX = os.path.join(HERE, "test-deck.pptx")
CONFIG = """window.TNBBI_CONFIG = { supabaseUrl: "http://localhost/fake", supabaseAnonKey: "test-key", testMode: true, bootstrapAdminEmail: "truenorthbaptist1@gmail.com" };"""
SLIDES_PDF = os.path.join(HERE, "test-slides.pdf")
NOTES_PDF = os.path.join(HERE, "test-notes.pdf")
FAKE_YT = """
(function () {
  function Player(id, opts) { var el = document.getElementById(id); if (el) { el.className = 'fake-yt'; el.textContent = 'YouTube ' + opts.videoId; }
    this.getPlayerState = function () { return 1; }; this.destroy = function () {}; var self = this;
    this.getCurrentTime = function () { return window.__ytTime || 0; }; this.seekTo = function (t) { window.__ytTime = t; };
    this.getDuration = function () { return 5400; }; this.playVideo = function () {}; this.pauseVideo = function () {};
    setTimeout(function () { opts.events && opts.events.onReady && opts.events.onReady({ target: self }); }, 50); }
  window.YT = { Player: Player, PlayerState: { PLAYING: 1 } };
  setTimeout(function () { if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady(); }, 0);
})();
"""
import base64 as _b64
_PNG = _b64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPY0GuPFTEMLQkAOzNfAVOXhvQAAAAASUVORK5CYII=")

failures, errors = [], []
def check(cond, what):
    print(("  ✓ " if cond else "  ✗ ") + what, flush=True)
    if not cond:
        failures.append(what)

def psql(q):
    return subprocess.run(["psql", "-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-d", "t", "-At", "-v", "ON_ERROR_STOP=1", "-q"],
                          input=q, capture_output=True, text=True, check=True).stdout.strip()

def setup_ctx(browser, name, google_email=None, viewport=(1280, 900), mobile=False, converter=False):
    ctx = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, device_scale_factor=2 if mobile else 1,
                              is_mobile=mobile, has_touch=mobile)
    ctx.add_init_script("window.TNBBI_TEST_NO_TOUR = true; window.TNBBI_TEST_TEACH_POLL = 1000; window.TNBBI_TEST_LIVE_BEAT = 3000;")
    if google_email:
        ctx.add_init_script(f"localStorage.setItem('fake-google-email', {json.dumps(google_email)});")
    ctx.route(re.compile(r".*supabase-js.*"), lambda r: r.fulfill(body=FAKE_SB, content_type="application/javascript"))
    ctx.route(re.compile(r".*dompurify.*"), lambda r: r.fulfill(body=FAKE_PURIFY, content_type="application/javascript"))
    ctx.route(re.compile(r".*jspdf.*"), lambda r: r.fulfill(body="window.jspdf={};", content_type="application/javascript"))
    ctx.route(re.compile(r".*pdf\.worker\.min\.js$"), lambda r: r.fulfill(body=PDFJS_WORKER, content_type="application/javascript"))
    ctx.route(re.compile(r".*pdf\.js/3\.11\.174/pdf\.min\.js$"), lambda r: r.fulfill(body=PDFJS, content_type="application/javascript"))
    ctx.route(re.compile(r".*fonts\.(googleapis|gstatic)\.com.*"), lambda r: r.abort())
    ctx.route(re.compile(r".*youtube\.com/iframe_api.*"), lambda r: r.fulfill(body=FAKE_YT, content_type="application/javascript"))
    cfg = CONFIG.replace("testMode: true", 'testMode: true, slideConverter: "convert-slides"') if converter else CONFIG
    ctx.route(re.compile(r".*/js/config\.js$"), lambda r: r.fulfill(body=cfg, content_type="application/javascript"))
    ctx.route(re.compile(r".*jszip.*"), lambda r: r.fulfill(body=JSZIP, content_type="application/javascript"))
    # The conversion service (Google Drive) stands in as: any PowerPoint → the 5-page test PDF.
    ctx.route(re.compile(r".*/functions/v1/convert-slides.*"), lambda r: r.fulfill(body=open(SLIDES_PDF, "rb").read(), content_type="application/pdf"))
    # The test server doesn't keep uploaded bytes; lesson notes open as this PDF.
    # (A stored PowerPoint opens as the test PowerPoint.)
    ctx.route(re.compile(r".*/api/file\?bucket=materials.*"), lambda r: r.fulfill(body=open(PPTX, "rb").read(), content_type="application/vnd.openxmlformats-officedocument.presentationml.presentation")
              if re.search(r"\.pptx($|&)", r.request.url) else r.fulfill(body=open(NOTES_PDF, "rb").read(), content_type="application/pdf"))
    return ctx

def watch(page, name):
    page.on("pageerror", lambda e: errors.append(f"[{name}] {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and "ERR_FAILED" not in m.text and errors.append(f"[{name}] console: {m.text}"))
    page.on("dialog", lambda dlg: dlg.accept())
    return page

def settle(page):
    page.wait_for_timeout(150)
    page.wait_for_function("!document.body.classList.contains('is-busy')", timeout=60000)
    page.wait_for_timeout(100)

def wait_until(fn, timeout=8.0, step=0.1):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if fn():
                return time.time() - t0
        except Exception:
            pass
        time.sleep(step)
    return None

ALL = "{Sun,Mon,Tue,Wed,Thu,Fri,Sat}"
with sync_playwright() as p:
    browser = p.chromium.launch()
    print("A. The teacher builds a lesson plan")
    tctx = setup_ctx(browser, "teacher", google_email="truenorthbaptist1@gmail.com")
    admin = watch(tctx.new_page(), "teacher")
    admin.goto(BASE + "/")
    admin.wait_for_selector("#googleSignInBtn")
    admin.click("#googleSignInBtn"); admin.wait_for_selector("#main .page-header", timeout=15000); settle(admin)
    aid = psql("select id from profiles where email='truenorthbaptist1@gmail.com'")
    psql(f"""update profiles set name='Jedediah Smith' where id='{aid}';
      update courses set faculty_id='{aid}', sched_days='{ALL}', sched_time='19:00', sched_start=current_date-7, sched_weeks=6, sched_mode='now',
        format='hybrid', attendance_on=true, title='Hermeneutics' where id='c1';
      update courses set sched_days='{{}}', sched_time=null, sched_start=null, sched_mode=null where id <> 'c1';""")
    admin.reload(); admin.wait_for_selector("#main .page-header", timeout=15000); settle(admin)
    admin.evaluate("activeCourseId = 'c1'; courseTabs.set('manage:c1', 'plan'); view = 'manage'; renderNav(); renderMain();"); settle(admin)
    check(admin.locator('.course-tab[data-tab="plan"]').count() == 1, "Manage has a Lesson plan tab")
    check("No lessons yet" in admin.inner_text("#planPanel"), "an empty plan explains how to start")
    # one lesson with notes + slides
    admin.click("#planAdd"); admin.wait_for_selector("#peName")
    admin.fill("#peName", "Scripture Interprets Scripture")
    admin.set_input_files("#peNotesFile", NOTES_PDF)
    admin.set_input_files("#peDeckFile", SLIDES_PDF)
    admin.click("#peSave"); settle(admin)
    admin.wait_for_selector("#planPanel .plan-row", timeout=60000)
    row = admin.inner_text("#planPanel .plan-row")
    check("Slides · 5" in row, f"the PDF became 5 slides ({row!r})")
    check("Up next" in row and "Teach this class" in row, "the first lesson is up next with a Teach button")
    check(psql("select count(*) from storage.objects where bucket_id='slides'") == "10", "a large and a small picture were stored for each slide")
    check(psql("select teacher_only from materials where title='test-notes.pdf'") == "t", "lesson notes are saved Teachers-only")
    # title-only lesson
    admin.click("#planAdd"); admin.wait_for_selector("#peName")
    admin.fill("#peName", "Context, Context, Context"); admin.click("#peSave"); settle(admin)
    # from files: notes + slides with the same lesson number become one lesson
    admin.click("#planFromFiles"); admin.wait_for_selector(".pf-tabs")
    check(admin.is_visible("#pfMats") and "test-notes.pdf" in admin.inner_text("#pfMats"), "Add lessons from files opens on the course's materials")
    admin.click('[data-pf-tab="device"]'); admin.wait_for_selector("#pfFiles")
    pdf = open(SLIDES_PDF, "rb").read(); notes = open(NOTES_PDF, "rb").read()
    admin.set_input_files("#pfFiles", [
        {"name": "Lesson 3 Types and Shadows slides.pdf", "mimeType": "application/pdf", "buffer": pdf},
        {"name": "Lesson 3 Types and Shadows.pdf", "mimeType": "application/pdf", "buffer": notes},
        {"name": "Lesson 4 Figures of Speech.pdf", "mimeType": "application/pdf", "buffer": notes}])
    summary = admin.inner_text("#pfList")
    check("2 lessons" in summary and "Types and Shadows" in summary, f"three files make two lessons ({summary.splitlines()[-1]!r})")
    admin.click("#pfSave"); settle(admin)
    admin.wait_for_function("document.querySelectorAll('#planPanel .plan-row:not(.plan-cancel)').length === 4", timeout=60000)
    titles = [t.strip() for t in admin.locator("#planPanel .plan-title").all_inner_texts()]
    check(titles == ["Scripture Interprets Scripture", "Context, Context, Context", "Types and Shadows", "Figures of Speech"], f"plan order {titles}")
    dates = admin.locator("#planPanel .plan-date strong").all_inner_texts()
    today_label = admin.evaluate("shortDay(todayStr())")
    check(dates[0] == today_label and len(set(dates)) == 4, f"lessons take today and the next class days ({dates})")
    admin.screenshot(path=f"{SHOTS}/01-lesson-plan.png", full_page=True)

    print("B. Teach mode on the iPad")
    admin.set_viewport_size({"width": 1194, "height": 834})
    admin.locator("[data-plan-teach]").first.click(); settle(admin)
    admin.wait_for_selector(".teach", timeout=15000)
    check(admin.evaluate("view") == "teach", "Teach this class opens Teach mode")
    check(not admin.is_visible(".top-nav"), "Teach mode uses the whole screen")
    admin.wait_for_function("document.querySelectorAll('.tn-page').length === 2", timeout=30000)
    check(True, "the lesson notes PDF shows (2 pages)")
    nw = admin.evaluate("document.querySelector('.teach-notes').getBoundingClientRect().width")
    sw = admin.evaluate("document.querySelector('.teach-side').getBoundingClientRect().width")
    check(nw > sw * 2, f"notes are the big part of the screen ({nw:.0f}px vs {sw:.0f}px)")
    admin.wait_for_function("(document.getElementById('tsImg').getAttribute('src') || '').includes('/1-s.jpg')", timeout=15000)
    check(admin.inner_text("#tsCount") == "Slide 1 of 5", "slide 1 of 5 showing")
    admin.wait_for_timeout(1200)
    admin.screenshot(path=f"{SHOTS}/02-teach-ipad.png")

    print("C. The classroom TV follows the iPad")
    tv = watch(tctx.new_page(), "tv")
    tv.set_viewport_size({"width": 1280, "height": 720})
    tv.goto(BASE + "/?present=c1")
    tv.wait_for_selector(".tv", timeout=20000)
    tv.wait_for_function("(document.getElementById('tvImg').getAttribute('src') || '').includes('/1.jpg')", timeout=15000)
    check(True, "the TV link opens the presentation screen on slide 1 (large picture)")
    check(not tv.is_visible(".top-nav"), "the TV screen is full screen (no site header)")
    admin.wait_for_function("document.getElementById('tTv').classList.contains('tb-chip-on')", timeout=15000)
    check("TV connected" in admin.inner_text("#tTv"), "the iPad shows the TV is connected")
    admin.click("#tsNext")
    t0 = time.time()
    tv.wait_for_function("(document.getElementById('tvImg').getAttribute('src') || '').includes('/2.jpg')", timeout=5000)
    lag = time.time() - t0
    check(lag < 1.5, f"Next on the iPad turns the TV's slide almost at once ({lag:.2f}s)")
    admin.click("#tsNext"); tv.wait_for_function("(document.getElementById('tvImg').getAttribute('src') || '').includes('/3.jpg')", timeout=5000)
    check(admin.inner_text("#tsCount") == "Slide 3 of 5", "iPad on slide 3")
    admin.click("#tBlank")
    tv.wait_for_function("!document.getElementById('tvBlack').hidden", timeout=5000)
    check(True, "Blank screen blacks out the TV")
    admin.click("#tBlank")
    tv.wait_for_function("document.getElementById('tvBlack').hidden", timeout=5000)
    tv.keyboard.press("ArrowLeft")
    admin.wait_for_function("document.getElementById('tsCount').textContent === 'Slide 2 of 5'", timeout=5000)
    check(True, "the TV's arrow keys move the iPad too")
    tv.keyboard.press("ArrowRight")
    admin.wait_for_function("document.getElementById('tsCount').textContent === 'Slide 3 of 5'", timeout=5000)
    check(wait_until(lambda: psql("select slide from teach_live where course_id='c1'") == "3", timeout=4) is not None, "the database keeps up (slide 3)")
    tv.screenshot(path=f"{SHOTS}/03-tv.png")

    print("D. An online student follows along and asks a question")
    sctx = setup_ctx(browser, "student")
    stu = watch(sctx.new_page(), "student")
    stu.goto(BASE + "/")
    stu.wait_for_selector(".auth-tabs")
    stu.locator(".auth-tabs button", has_text="Sign Up").click()
    stu.fill("#suName", "Daniel Dotson"); stu.fill("#suEmail", "daniel@example.com"); stu.fill("#suPassword", "faithful123"); stu.fill("#suPassword2", "faithful123")
    stu.locator("#signupForm button[type=submit]").click()
    stu.wait_for_selector("#pendingCheck", timeout=15000)
    sid = psql("select id from profiles where email='daniel@example.com'")
    psql(f"update profiles set status='active' where id='{sid}'; insert into enrollments(course_id, student_id, track, track_chosen) values ('c1','{sid}','live',true);")
    stu.click("#pendingCheck"); stu.wait_for_selector("#main .page-header", timeout=15000); settle(stu)
    stu.evaluate("openLiveClass('c1')"); settle(stu)
    stu.wait_for_function("!document.getElementById('followCard').hidden && (document.getElementById('fImg').getAttribute('src') || '').includes('/3-s.jpg')", timeout=10000)
    check("Following the teacher" in stu.inner_text("#followCard"), "the student sees slide 3, following the teacher")
    admin.click("#tsNext")
    lag = wait_until(lambda: "/4-s.jpg" in (stu.get_attribute("#fImg", "src") or ""), timeout=6)
    check(lag is not None and lag < 3.5, f"the student's slide changes too (within {lag if lag is None else round(lag, 1)}s, even without the instant link)")
    stu.click("#fPrev"); stu.wait_for_timeout(200)
    check("Looking back" in stu.inner_text("#fState") and "/3-s.jpg" in stu.get_attribute("#fImg", "src"), "Earlier slide lets the student look back")
    stu.click("#fLive"); stu.wait_for_timeout(200)
    check("/4-s.jpg" in stu.get_attribute("#fImg", "src"), "Back to live rejoins the class")
    check("only the teacher sees your question" in stu.inner_text(".live-chat") and "replay" in stu.inner_text(".live-chat"), "the student is told questions are private in class (and seen in the replay)")
    stu.fill("#chatInput", "In Isaiah 28:10, is precept upon precept a good method, or a rebuke?")
    stu.click("#chatForm button[type=submit]")
    admin.wait_for_function("document.getElementById('tqList').innerText.includes('precept upon precept')", timeout=10000)
    check("1 open" in admin.inner_text("#tqCount"), "the question arrives in Teach mode")
    stu.screenshot(path=f"{SHOTS}/04-student-live.png", full_page=True)
    admin.locator("[data-q-pin]").first.click()
    tv.wait_for_function("!document.getElementById('tvQ').hidden && document.getElementById('tvQ').innerText.includes('precept')", timeout=8000)
    check("Daniel Dotson" in tv.inner_text("#tvQ"), "Show on screen puts the question (and who asked) on the TV")
    tv.screenshot(path=f"{SHOTS}/05-tv-question.png")
    admin.locator("[data-q-done]").first.click()
    tv.wait_for_function("document.getElementById('tvQ').hidden", timeout=8000)
    check("0 open" in admin.inner_text("#tqCount"), "Answered clears it from the TV and the open count")
    admin.screenshot(path=f"{SHOTS}/06-teach-question.png")
    # portrait iPad
    admin.set_viewport_size({"width": 834, "height": 1194}); admin.wait_for_timeout(400)
    admin.screenshot(path=f"{SHOTS}/07-teach-ipad-portrait.png")
    admin.set_viewport_size({"width": 1194, "height": 834})

    print("E. Attendance from Teach mode, then End class → pick up next time")
    if admin.locator("#tAttend").count():
        admin.click("#tAttend"); settle(admin)
        check(admin.evaluate("view") == "attendance" and "Teach mode" in admin.inner_text("#backLink"), "Attendance opens, with a way back to Teach mode")
        admin.click("#backLink"); settle(admin)
        admin.wait_for_selector(".teach", timeout=10000)
        check(admin.inner_text("#tsCount") == "Slide 4 of 5", "back in Teach mode on the same slide")
    admin.click("#tEnd"); admin.wait_for_selector("[data-ec=continue]")
    admin.click("[data-ec=continue]"); settle(admin)
    check(psql("select active from teach_live where course_id='c1'") == "f", "class has ended")
    tv.wait_for_function("!document.getElementById('tvWait').hidden", timeout=8000)
    check(True, "the TV goes back to waiting")
    admin.set_viewport_size({"width": 1280, "height": 900})
    admin.evaluate("activeCourseId = 'c1'; courseTabs.set('manage:c1', 'plan'); view = 'manage'; renderNav(); renderMain();"); settle(admin)
    txt = admin.inner_text("#planPanel")
    check("Stopped at slide 4" in txt, "the lesson shows where class stopped")
    check("Scripture Interprets Scripture (continued)" in txt and "picks up at slide 4" in txt.lower(), "the rest becomes the next lesson, opening at slide 4")
    titles = [t.strip() for t in admin.locator("#planPanel .plan-title").all_inner_texts()]
    check(titles[2] == "Context, Context, Context", "the later lessons moved back one class")
    before = admin.locator("#planPanel .plan-row:not(.plan-cancel)").nth(1).locator(".plan-date strong").inner_text()

    print("F. A canceled class shifts the plan")
    admin.locator("[data-plan-more]").nth(1).click(); admin.wait_for_selector("[data-opt=cancel]")
    admin.click("[data-opt=cancel]"); admin.wait_for_selector("#ccConfirm")
    admin.fill("#ccReason", "Snow day"); admin.click("#ccConfirm"); settle(admin)
    after = admin.locator("#planPanel .plan-row:not(.plan-cancel)").nth(1).locator(".plan-date strong").inner_text()
    check(after != before, f"the continuation moved off the canceled day ({before} → {after})")
    check(admin.locator("#planPanel .plan-cancel").count() == 1 and "Snow day" in admin.inner_text("#planPanel .plan-cancel"), "the canceled day shows in the plan")
    # add an extra class day
    psql("update courses set sched_days='{Mon}' where id='c1'")
    admin.evaluate("loadAll().then(() => renderMain())"); settle(admin)
    admin.click("#planAddDay"); admin.wait_for_selector("#adDate")
    extra = admin.evaluate("(() => { const d = new Date(); d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7)); return localISO(d); })()")
    admin.fill("#adDate", extra); admin.click("#adSave"); settle(admin)
    check(psql(f"select count(*) from class_extra_days where course_id='c1' and class_date='{extra}'") == "1", "a make-up class day can be added")
    dates = admin.locator("#planPanel .plan-row:not(.plan-cancel) .plan-date strong").all_inner_texts()
    check(admin.evaluate(f"shortDay('{extra}')") in dates, "a lesson lands on the added day")
    admin.screenshot(path=f"{SHOTS}/08-plan-after.png", full_page=True)
    psql(f"update courses set sched_days='{ALL}' where id='c1'")
    admin.evaluate("loadAll()"); settle(admin)

    print("G. Students see lessons and (after class) the slides")
    stu.evaluate("loadAll().then(() => { activeCourseId = 'c1'; view = 'course'; renderNav(); renderMain(); })"); settle(stu)
    card = stu.inner_text(".plan-student")
    check("Lessons" in card and "Context, Context, Context" in card, "the course page lists upcoming lessons")
    check(stu.locator("[data-student-deck]").count() >= 1, "the taught lesson's slides are open to the class")
    stu.locator("[data-student-deck]").first.click(); stu.wait_for_selector("#svImg[src*='/1.jpg']", timeout=8000)
    check("Slide 1 of 5" in stu.inner_text("#svCount"), "the slide viewer opens")
    stu.click("#svClose")
    check(psql(f"select count(*) from slide_notes") == "0", "(no speaker notes on a PDF)")

    print("H. Dashboard → Teach")
    admin.evaluate("view = 'home'; renderNav(); renderMain();"); settle(admin)
    row = admin.locator("[data-attn-class]").first.inner_text()
    check("Teach" in row, f"today's class on the dashboard offers Teach ({row.splitlines()[-1]!r})")
    admin.locator("[data-attn-class]").first.click(); settle(admin)
    admin.wait_for_selector(".teach", timeout=10000)
    check(admin.inner_text(".tb-title small").endswith("Scripture Interprets Scripture (continued)"), "it opens the next lesson (the continuation)")
    admin.wait_for_function("document.getElementById('tsCount').textContent === 'Slide 4 of 5'", timeout=10000)
    check(True, "…at slide 4, where class stopped")
    admin.click("#tEnd"); admin.wait_for_selector("[data-ec=finished]"); admin.click("[data-ec=finished]"); settle(admin)
    check(psql("select status from course_plan where title like '%(continued)'") == "taught", "Finished marks it taught")

    print("I. Phone: an online student")
    pctx = setup_ctx(browser, "phone", viewport=(390, 844), mobile=True)
    ph = watch(pctx.new_page(), "phone")
    ph.goto(BASE + "/")
    ph.locator(".auth-tabs button", has_text="Sign In").click()
    ph.fill("#siEmail", "daniel@example.com"); ph.fill("#siPassword", "faithful123"); ph.click("#siSubmit")
    ph.wait_for_selector("#main .page-header", timeout=15000); settle(ph)
    psql("select 1")
    tid = psql("select id from course_plan where title='Types and Shadows'")
    admin.evaluate(f"openTeach('c1', '{tid}', 'home')"); settle(admin)
    ph.evaluate("openLiveClass('c1')"); settle(ph)
    ph.wait_for_function("!document.getElementById('followCard').hidden", timeout=10000)
    ph.screenshot(path=f"{SHOTS}/09-phone-follow.png", full_page=True)
    w = ph.evaluate("document.documentElement.scrollWidth")
    check(w <= 390, f"no sideways scrolling on a phone ({w}px)")
    admin.click("#tEnd"); admin.wait_for_selector("[data-ec=pause]"); admin.click("[data-ec=pause]"); settle(admin)

    print("J. PowerPoint files")
    admin.evaluate("view = 'home'; renderNav(); renderMain();"); settle(admin)
    admin.evaluate("activeCourseId = 'c1'; courseTabs.set('manage:c1', 'plan'); view = 'manage'; renderNav(); renderMain();"); settle(admin)
    fig = psql("select id from course_plan where title='Figures of Speech'")
    admin.locator(f'[data-plan-edit="{fig}"]').click(); admin.wait_for_selector("#peDeckFile")
    admin.set_input_files("#peDeckFile", PPTX); admin.click("#peSave"); settle(admin)
    check(admin.locator("#modalRoot .modal").count() == 1 and "PowerPoint" in admin.inner_text("body"), "without conversion switched on, a PowerPoint gets a clear 'save as PDF' message")
    admin.click("#peClose")
    c2 = setup_ctx(browser, "teacher2", google_email="truenorthbaptist1@gmail.com", converter=True)
    a2 = watch(c2.new_page(), "teacher2")
    a2.goto(BASE + "/"); a2.wait_for_selector("#googleSignInBtn"); a2.click("#googleSignInBtn"); a2.wait_for_selector("#main .page-header", timeout=15000); settle(a2)
    a2.evaluate("activeCourseId = 'c1'; courseTabs.set('manage:c1', 'plan'); view = 'manage'; renderNav(); renderMain();"); settle(a2)
    a2.locator(f'[data-plan-edit="{fig}"]').click(); a2.wait_for_selector("#peDeckFile")
    a2.set_input_files("#peDeckFile", PPTX); a2.click("#peSave"); settle(a2)
    a2.wait_for_function(f"document.querySelector('[data-plan-row=\"{fig}\"]') && document.querySelector('[data-plan-row=\"{fig}\"]').innerText.includes('Slides · 5')", timeout=60000)
    check(True, "with conversion on, the PowerPoint becomes slides")
    notes = psql(f"select notes::text from slide_notes n join course_plan p on p.deck_id = n.deck_id where p.id='{fig}'")
    check("Hebrews 10:1" in notes and "1 Corinthians 5:7" in notes, f"its speaker notes were read from the file ({notes[:60]}…)")
    a2.set_viewport_size({"width": 1194, "height": 834})
    a2.evaluate(f"openTeach('c1', '{fig}', 'manage')"); settle(a2)
    a2.wait_for_selector(".teach", timeout=10000)
    a2.click('.tn-tabs [data-tn="speaker"]')
    check(wait_until(lambda: "Open with Hebrews 10:1" in a2.inner_text("#tnView"), 6) is not None, "Notes for this slide shows slide 1's speaker notes")
    a2.click("#tsNext")
    check(wait_until(lambda: "Exodus 12:3-7" in a2.inner_text("#tnView"), 3) is not None, "…and follows the slides")
    a2.screenshot(path=f"{SHOTS}/10-speaker-notes.png")
    a2.click("#tEnd"); a2.wait_for_selector("[data-ec=pause]"); a2.click("[data-ec=pause]"); settle(a2)

    print("K. Lessons from files already in the course materials")
    a2.evaluate("view = 'home'; renderNav(); renderMain();"); settle(a2)
    pptx = open(PPTX, "rb").read(); notes = open(NOTES_PDF, "rb").read()
    a2.evaluate("""async ([p, n]) => {
      const f = (b64, name, type) => new File([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], name, { type });
      await DB.addMaterials('c1', [f(p, 'Lesson 7 The Parables.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
                                   f(n, 'Lesson 7 The Parables.pdf', 'application/pdf')], false);
      await loadAll();
    }""", [_b64.b64encode(pptx).decode(), _b64.b64encode(notes).decode()]); settle(a2)
    mats_before = psql("select count(*) from materials where course_id='c1'")
    lessons_before = int(psql("select count(*) from course_plan where course_id='c1'"))
    a2.evaluate("activeCourseId = 'c1'; courseTabs.set('manage:c1', 'plan'); view = 'manage'; renderNav(); renderMain();"); settle(a2)
    a2.click("#planFromFiles"); a2.wait_for_selector("#pfMats")
    check(a2.locator("#pfMats .pf-tag-used").count() >= 1, "files already used in the plan are marked")
    a2.fill("#pfFilter", "parables")
    check(a2.locator("#pfMats li:not([hidden])").count() == 2, "the find box narrows the list")
    a2.click("#pfAll")
    summary = a2.inner_text("#pfList")
    check("1 lesson" in summary and "The Parables" in summary and summary.count("Materials") == 2, f"the two picked materials make one lesson ({summary.splitlines()[-1]!r})")
    kinds = a2.evaluate("[...document.querySelectorAll('#pfList select')].map((s) => s.value)")
    check(sorted(kinds) == ["notes", "slides"], f"the PowerPoint is taken as slides, the PDF as notes ({kinds})")
    a2.fill("#pfFilter", ""); a2.dispatch_event("#pfFilter", "input")
    a2.screenshot(path=f"{SHOTS}/11a-pick-from-materials.png")
    a2.click("#pfSave"); settle(a2)
    a2.wait_for_function(f"document.querySelectorAll('#planPanel .plan-row:not(.plan-cancel)').length >= {lessons_before + 1}", timeout=60000)
    row = psql("select p.title || '|' || coalesce(m.title,'') || '|' || coalesce(d.slide_count::text,'') from course_plan p left join materials m on m.id = p.notes_material_id left join slide_decks d on d.id = p.deck_id where p.title='The Parables'")
    check(row == "The Parables|Lesson 7 The Parables.pdf|5", f"the lesson links the existing notes and the slides made from the material ({row})")
    check(psql("select count(*) from materials where course_id='c1'") == mats_before, "no duplicate copies were added to the materials")
    check(psql("select count(*) from slide_notes n join course_plan p on p.deck_id = n.deck_id where p.title='The Parables'") == "1", "speaker notes came along from the PowerPoint material")
    a2.screenshot(path=f"{SHOTS}/11-plan-from-materials.png", full_page=True)

    print("L. One lesson's slides from a PowerPoint already in the materials")
    a2.evaluate("""async (p) => {
      await DB.addMaterials('c1', [new File([Uint8Array.from(atob(p), (ch) => ch.charCodeAt(0))], 'Lesson 8 The Miracles.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })], false);
      await loadAll(); renderMain();
    }""", _b64.b64encode(pptx).decode()); settle(a2)
    a2.click("#planAdd"); a2.wait_for_selector("#peDeck")
    opts = a2.evaluate("[...document.querySelectorAll('#peDeck optgroup')].map((g) => g.label + ': ' + [...g.children].map((o) => o.textContent).join(' | '))")
    check(any(o.startswith("From the course materials") and "Lesson 8 The Miracles.pptx" in o for o in opts), f"the Slides list offers PowerPoints from the course materials ({opts})")
    check(not any("The Parables.pptx" in o for o in opts if o.startswith("From the course materials")), "a presentation already made into slides isn't offered twice")
    mid = psql("select id from materials where title='Lesson 8 The Miracles.pptx'")
    a2.select_option("#peDeck", f"mat:{mid}")
    check(a2.input_value("#peName") == "The Miracles", f"picking it fills in the lesson title ({a2.input_value('#peName')!r})")
    a2.click("#peSave"); settle(a2)
    a2.wait_for_function("[...document.querySelectorAll('#planPanel .plan-title')].some((t) => t.textContent.includes('The Miracles'))", timeout=60000)
    row = psql("select coalesce(d.slide_count::text,'none') || '|' || d.source from course_plan p join slide_decks d on d.id = p.deck_id where p.title='The Miracles'")
    check(row == "5|pptx", f"the PowerPoint from the materials became the lesson's slides ({row})")
    check(psql("select count(*) from slide_notes n join course_plan p on p.deck_id = n.deck_id where p.title='The Miracles'") == "1", "with its speaker notes")
    # Teach mode's "Slides for this class" offers materials too
    mira = psql("select id from course_plan where title='The Miracles'")
    a2.evaluate("""async (p) => {
      await DB.addMaterials('c1', [new File([Uint8Array.from(atob(p), (ch) => ch.charCodeAt(0))], 'Extra Slides.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })], false);
      await loadAll();
    }""", _b64.b64encode(pptx).decode()); settle(a2)
    a2.set_viewport_size({"width": 1194, "height": 834})
    a2.evaluate(f"openTeach('c1', '{mira}', 'manage')"); settle(a2)
    a2.wait_for_selector(".teach", timeout=10000)
    swap = a2.locator("#tsSwap")
    if swap.count():
        swap.click(); a2.wait_for_selector("#swDeck")
        xid = psql("select id from materials where title='Extra Slides.pptx'")
        a2.select_option("#swDeck", f"mat:{xid}"); a2.click("#swSave")
        a2.wait_for_selector("#swDeck", state="detached", timeout=60000)
        check(wait_until(lambda: psql("select count(*) from slide_decks where title='Extra' and status='ready'") == "1", 40) is not None
              and psql("select d.title from teach_live l join slide_decks d on d.id = l.deck_id where l.course_id='c1'") == "Extra",
              "in Teach mode, slides can be switched to a PowerPoint from the materials")
    else:
        check(False, "Teach mode has a button to change the slides (#tsSwap)")
    a2.click("#tEnd"); a2.wait_for_selector("[data-ec=pause]"); a2.click("[data-ec=pause]"); settle(a2)

    print("M. A student who missed class watches the replay")
    # Everything taught today becomes yesterday's class, with its live-stream recording.
    psql("""update teach_events set class_date = class_date - 1, at = at - interval '1 day' where course_id='c1';
      update live_chat set class_date = class_date - 1, created_at = created_at - interval '1 day', answered_at = answered_at - interval '1 day' where course_id='c1';
      update course_plan set taught_on = taught_on - 1 where course_id='c1' and taught_on is not null;""")
    yday = psql("select current_date - 1")
    lid = psql(f"""insert into lessons (course_id, video_id, title, class_date, stream_started_at, status)
      select 'c1', 'replayVid01', 'Hermeneutics — class stream', '{yday}', min(at) - interval '60 seconds', 'ok' from teach_events where course_id='c1' returning id""")
    zero = float(psql("select extract(epoch from stream_started_at) from lessons where id='%s'" % lid))
    ev = psql("select deck_id || '|' || extract(epoch from at) from teach_events where course_id='c1' and active and not blanked and slide = 4 and deck_id is not null order by at limit 1").split("|")
    q = psql("select extract(epoch from created_at) || '|' || extract(epoch from answered_at) from live_chat where course_id='c1' and body like '%precept upon precept%'").split("|")
    stu.evaluate("loadAll().then(() => { view = 'home'; renderNav(); renderMain(); })"); settle(stu)
    stu.wait_for_selector(".week-missed-wrap", timeout=10000)
    wk = stu.inner_text(".week-missed-wrap")
    check("classes to watch" in wk.lower() and "missed class of" in wk, f"the dashboard lists the missed class to watch ({wk.splitlines()[1] if len(wk.splitlines()) > 1 else wk!r})")
    stu.click(".week-missed"); settle(stu)
    stu.wait_for_selector(".lecture-page.has-replay", timeout=10000)
    stu.wait_for_selector(".rp-thumb", timeout=20000)
    check(not stu.is_hidden("#rpSlideBlock"), "the recording opens with the slides beside the video")
    stu.evaluate("window.__ytTime = 2"); stu.wait_for_timeout(700)
    check("slides begin at 1:00" in stu.inner_text("#rpMsg"), f"before class starts in the video, it says when the slides begin ({stu.inner_text('#rpMsg')!r})")
    check("precept" not in stu.inner_text("#rpQList"), "questions don't show before they were asked")
    stu.evaluate(f"window.__ytTime = {float(ev[1]) - zero + 0.8}"); stu.wait_for_timeout(700)
    src = stu.get_attribute("#rpImg", "src") or ""
    check(f"/{ev[0]}/4" in src, f"at that point in the video, slide 4 is showing — as it was in class ({src[-60:]})")
    stu.evaluate(f"window.__ytTime = {float(q[0]) - zero + 1}"); stu.wait_for_timeout(700)
    qtxt = stu.inner_text("#rpQList")
    check("precept upon precept" in qtxt and "Daniel Dotson" in qtxt, "the question appears when the video reaches it, with who asked")
    check("answered" not in qtxt.lower(), "…not yet answered at that point")
    stu.evaluate(f"window.__ytTime = {float(q[1]) - zero + 1}"); stu.wait_for_timeout(700)
    qtxt = stu.inner_text("#rpQList")
    check("answered" in qtxt.lower() and "on the screen" in qtxt.lower(), "…then marked On the screen and Answered as the video passes those moments")
    n = stu.locator(".rp-thumb").count()
    check(n >= 2, f"a row of the class's slides is under the video ({n})")
    stu.locator(".rp-thumb").nth(1).click(); stu.wait_for_timeout(500)
    t = stu.evaluate("window.__ytTime")
    check(t > 0, f"tapping a slide jumps the video there ({t:.1f}s)")
    check(stu.locator("#rpTools .replay-tools").count() == 0, "students don't see the timing tools")
    stu.evaluate(f"window.__ytTime = {float(q[1]) - zero + 1}"); stu.wait_for_timeout(700)
    stu.screenshot(path=f"{SHOTS}/12-replay-desktop.png", full_page=True)
    # phone
    ph.evaluate(f"loadAll().then(() => openLecture('c1', '{lid}', 'home'))"); settle(ph)
    ph.wait_for_selector(".rp-thumb", timeout=20000)
    ph.evaluate(f"window.__ytTime = {float(q[1]) - zero + 1}"); ph.wait_for_timeout(900)
    w = ph.evaluate("document.documentElement.scrollWidth")
    check(w <= 390, f"the replay fits a phone with no sideways scrolling ({w}px)")
    ph.screenshot(path=f"{SHOTS}/13-replay-phone.png", full_page=True)
    # the teacher's timing tools
    a2.evaluate(f"loadAll().then(() => openLecture('c1', '{lid}', 'manage'))"); settle(a2)
    a2.wait_for_selector("#rpTools .replay-tools", timeout=20000)
    check("Lined up automatically" in a2.inner_text("#rpTools"), "the teacher sees the slides were lined up automatically from the stream")
    a2.click('[data-nudge="2000"]'); a2.wait_for_timeout(600)
    d = psql(f"select round(extract(epoch from stream_started_at - replay_zero_at)) from lessons where id='{lid}'")
    check(d == "2", f"'2 s later' re-times the slides ({d})")
    a2.evaluate("window.__ytTime = 100"); a2.select_option("#rpLineSeg", "0"); a2.click("#rpLineNow"); a2.wait_for_timeout(600)
    first = float(psql("select extract(epoch from min(at)) from teach_events where course_id='c1' and active and deck_id is not null and not blanked"))
    z2 = float(psql(f"select extract(epoch from replay_zero_at) from lessons where id='{lid}'"))
    check(abs((first - z2) - 100) < 1.5, f"'It goes up at this point in the video' lines the slides up by hand ({first - z2:.1f}s)")
    a2.click("#rpAuto"); a2.wait_for_timeout(600)
    check(psql(f"select replay_zero_at is null from lessons where id='{lid}'") == "t", "…and Use YouTube's timing undoes it")
    a2.screenshot(path=f"{SHOTS}/14-replay-teacher.png", full_page=True)
    # once watched, it leaves the dashboard
    psql(f"insert into lesson_views (lesson_id, student_id, pct, completed_at) values ('{lid}', '{sid}', 100, now()) on conflict (lesson_id, student_id) do update set pct = 100, completed_at = now()")
    stu.evaluate("stopLecture(); loadAll().then(() => { view = 'home'; renderNav(); renderMain(); })"); settle(stu)
    check(stu.locator(".week-missed").count() == 0, "once watched, the class leaves Classes to watch")

    print("JS errors:", errors)
    print("FAILURES:", failures)
    browser.close()
    sys.exit(1 if failures or errors else 0)
