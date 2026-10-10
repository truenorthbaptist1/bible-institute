#!/usr/bin/env python3
"""End-to-end test: drives the real site in headless Chromium, as several
different people at once, against the real database schema and privacy
rules (via tests/e2e/server.py). Walks a compressed semester:

  church Google account → founding Admin
  students sign up → faculty enroll them, add materials + assignments
  student requests a future course → faculty approve / deny with a note
  student turns in work (editor + file) → faculty grade → student sees it
  private messages both ways, discussion board, Study Bible highlights
  calendar, grade sheet, Settings (role change, deactivate), archive/delete
  phone-sized screens for layout

Any uncaught JavaScript error on any page fails the run.
"""
import json, os, re, sys, time, datetime, subprocess
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8765")
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.environ.get("SHOTS", os.path.join(HERE, "screenshots"))
os.makedirs(SHOTS, exist_ok=True)
FAKE_SB = open(os.path.join(HERE, "fake-supabase.js")).read()

# The real DOMPurify (the CDN isn't reachable from the test machine).
FAKE_PURIFY = open(os.path.join(HERE, "vendor", "purify.min.js")).read()
FAKE_JSPDF = """
window.jspdf = { jsPDF: function () { return {
  internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } },
  setFont(){}, setFontSize(){}, setTextColor(){}, text(){}, setDrawColor(){}, line(){}, addPage(){},
  setFillColor(){}, rect(){}, roundedRect(){}, addImage(){}, setLineWidth(){},
  getTextWidth: (t) => t.length * 5, splitTextToSize: (t) => [t],
  save(name) { window.__pdfSaved = name; } }; } };
"""
CONFIG = """window.TNBBI_CONFIG = { supabaseUrl: "http://localhost/fake", supabaseAnonKey: "test-key", testMode: true, bootstrapAdminEmail: "truenorthbaptist1@gmail.com" };"""


# Course pages are split into tabs (Oct 9). When a step works on something
# inside a tab that isn't showing, open that tab first — the way a person
# would — so each step doesn't have to.
from playwright.sync_api import Page as _Page
_REVEAL = """(sel) => { let el; try { el = document.querySelector(sel); } catch (e) { return false; }
  if (!el) return false; const p = el.closest('.tab-panel'); if (!p || !p.hidden) return false;
  const b = document.querySelector('.course-tab[data-tab="' + p.dataset.panel + '"]'); if (b) b.click(); return !!b; }"""
def _reveal(page, selector):
    try: page.evaluate(_REVEAL, selector)
    except Exception: pass
def _wrap(name):
    orig = getattr(_Page, name)
    def f(self, selector, *a, **k):
        _reveal(self, selector)
        if name == "wait_for_selector":
            try: return orig(self, selector, *a, **{**k, "timeout": 2500})
            except Exception:
                _reveal(self, selector)
        return orig(self, selector, *a, **k)
    setattr(_Page, name, f)
for _n in ("click", "fill", "check", "uncheck", "set_input_files", "select_option", "dblclick", "wait_for_selector", "is_checked", "inner_text", "text_content"):
    _wrap(_n)

from playwright.sync_api import Locator as _Locator
_REVEAL_EL = """(el) => { const p = el.closest('.tab-panel'); if (!p || !p.hidden) return false;
  const b = document.querySelector('.course-tab[data-tab="' + p.dataset.panel + '"]'); if (b) b.click(); return !!b; }"""
def _wrap_loc(name):
    orig = getattr(_Locator, name)
    def f(self, *a, **k):
        try: self.first.evaluate(_REVEAL_EL, timeout=3000)
        except Exception: pass
        return orig(self, *a, **k)
    setattr(_Locator, name, f)
for _n in ("click", "fill", "check", "uncheck", "set_input_files", "select_option", "is_checked", "inner_text"):
    _wrap_loc(_n)

def tab(page, name):
    page.click(f'.course-tab[data-tab="{name}"]')

failures, errors = [], []
TODAY = datetime.date.today()
def d(days): return (TODAY + datetime.timedelta(days=days)).isoformat()

def check(cond, what):
    print(("  ✓ " if cond else "  ✗ ") + what, flush=True)
    if not cond:
        failures.append(what)

REAL_JSPDF = open(os.path.join(HERE, "vendor", "jspdf.umd.min.js")).read()

import base64 as _b64
_PNG = _b64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPY0GuPFTEMLQkAOzNfAVOXhvQAAAAASUVORK5CYII=")
def base64_png(): return _PNG

def new_page(browser, name, google_email=None, mobile=False, tour=False, real_pdf=False):
    ctx = browser.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 900},
                              device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
    if not tour:
        # The first-time tour is tested on its own page; elsewhere it's skipped.
        ctx.add_init_script("window.TNBBI_TEST_NO_TOUR = true;")
    if google_email:
        ctx.add_init_script(f"localStorage.setItem('fake-google-email', {json.dumps(google_email)});")
    ctx.route(re.compile(r".*supabase-js.*"), lambda r: r.fulfill(body=FAKE_SB, content_type="application/javascript"))
    ctx.route(re.compile(r".*dompurify.*"), lambda r: r.fulfill(body=FAKE_PURIFY, content_type="application/javascript"))
    ctx.route(re.compile(r".*jspdf.*"), lambda r: r.fulfill(body=REAL_JSPDF if real_pdf else FAKE_JSPDF, content_type="application/javascript"))
    ctx.route(re.compile(r".*fonts\.(googleapis|gstatic)\.com.*"), lambda r: r.abort())
    ctx.route(re.compile(r".*youtube\.com/iframe_api.*"), lambda r: r.fulfill(body=FAKE_YT, content_type="application/javascript"))
    ctx.route(re.compile(r".*i\.ytimg\.com.*"), lambda r: r.fulfill(body=base64_png(), content_type="image/png"))
    ctx.add_init_script("window.TNBBI_TEST_LIVE_BEAT = 3000;")
    ctx.route(re.compile(r".*/js/config\.js$"), lambda r: r.fulfill(body=CONFIG, content_type="application/javascript"))
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[{name}] {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and "ERR_FAILED" not in m.text and errors.append(f"[{name}] console: {m.text}"))
    page.on("dialog", lambda dlg: dlg.accept())
    page.goto(BASE + "/")
    return page

# The fake YouTube player (youtube.com isn't reachable from the test machine):
# plays in real time, reports state/time like the real IFrame API.
FAKE_YT = """
(function () {
  window.__yt = { players: [] };
  function Player(id, opts) {
    var el = document.getElementById(id), self = this, state = 5, t = 0, last = null, timer = null;
    var dur = (window.__ytDur && window.__ytDur[opts.videoId]) || 20;
    if (el) { el.className = 'fake-yt'; el.textContent = 'YouTube ' + opts.videoId; el.setAttribute('data-video', opts.videoId); }
    function fire(s) { state = s; if (opts.events && opts.events.onStateChange) opts.events.onStateChange({ data: s }); }
    this.videoId = opts.videoId;
    this.playVideo = function () { if (timer) return; fire(1); last = Date.now(); timer = setInterval(function () {
      var now = Date.now(); t = Math.min(dur, t + (now - last) / 1000); last = now;
      if (t >= dur) { clearInterval(timer); timer = null; fire(0); } }, 200); };
    this.pauseVideo = function () { if (timer) { clearInterval(timer); timer = null; } fire(2); };
    this.getPlayerState = function () { return state; };
    this.getCurrentTime = function () { return t; };
    this.getDuration = function () { return dur; };
    this.destroy = function () { if (timer) clearInterval(timer); };
    window.__yt.players.push(this); window.__yt.last = this;
    setTimeout(function () { if (opts.events && opts.events.onReady) opts.events.onReady({ target: self }); }, 50);
  }
  window.YT = { Player: Player, PlayerState: { PLAYING: 1 } };
  setTimeout(function () { if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady(); }, 0);
})();
"""

# Straight to the test database — standing in for the behind-the-scenes
# service (which reads YouTube playlists) and for setting a scene quickly.
def psql(q):
    return subprocess.run(["psql", "-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-d", "t", "-At", "-v", "ON_ERROR_STOP=1", "-q"],
                          input=q, capture_output=True, text=True, check=True).stdout.strip()

def settle(page):
    page.wait_for_timeout(150)
    page.wait_for_function("!document.body.classList.contains('is-busy')", timeout=15000)
    page.wait_for_timeout(100)

# The header has no page buttons (Oct 10); the crest goes home, and the
# other pages are reached from the dashboard menu tiles.
NAV_TILES = {"Calendar": "Calendar", "Resource Library": "Library", "Study Bible": "Study Bible"}
def nav(page, label):
    if label == "Dashboard":
        page.click("#brandHome"); settle(page); return
    if label in NAV_TILES:
        page.click("#brandHome"); settle(page)
        page.locator(".tile h3", has_text=NAV_TILES[label]).first.click(); settle(page); return
    page.locator("#navPills button", has_text=label).click(); settle(page)

def tile(page, label):
    page.locator(".tile h3", has_text=label).first.click(); settle(page)

def back_home(page):
    nav(page, "Dashboard")

def signup(page, name, email, pw="faithful123", approve=True):
    page.locator(".auth-tabs button", has_text="Sign Up").click()
    page.fill("#suName", name); page.fill("#suEmail", email); page.fill("#suPassword", pw); page.fill("#suPassword2", pw)
    page.locator("#signupForm button[type=submit]").click()
    page.wait_for_selector("#pendingCheck", timeout=15000)
    if approve:
        approve_signup(page, name)

# A Admin approves a waiting sign-up; the person then gets in.
def approve_signup(page, name):
    admin.wait_for_timeout(3200)  # let the admin's page notice the new sign-up
    nav(admin, "Dashboard"); tile(admin, "Settings")
    admin.click("#userTabs button[data-tab=pending]")
    admin.locator(".user-row", has_text=name).locator("[data-approve]").click(); settle(admin)
    admin.click("#userTabs button[data-tab=active]")
    nav(admin, "Dashboard")
    page.click("#pendingCheck")
    page.wait_for_selector("#main .page-header", timeout=15000); settle(page)

def body(page):
    return page.inner_text("body")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=None)

    print("1. Church Google account becomes the founding Admin")
    admin = new_page(browser, "admin", google_email="truenorthbaptist1@gmail.com")
    admin.wait_for_selector("#googleSignInBtn")
    admin.screenshot(path=f"{SHOTS}/01-sign-in.png")
    admin.click("#googleSignInBtn")
    try:
        admin.wait_for_selector("#main .page-header", timeout=15000)
    except Exception:
        print("DEBUG body:", body(admin)[:800]); print("DEBUG errors:", errors); raise
    settle(admin)
    check("Welcome Professor" in body(admin), "lands on the Faculty dashboard")
    pills = admin.inner_text("#accountPills").lower()
    check("★ admin" in pills and "faculty" not in pills and "super" not in pills, "shows a single ★ Admin badge (its highest level only)")
    admin.screenshot(path=f"{SHOTS}/02-faculty-dashboard.png")

    print("2. Students sign up (always as students)")
    blake = new_page(browser, "blake")
    blake.wait_for_selector("#signinForm")
    signup(blake, "Blake Amis", "blake@example.com", approve=False)
    check("waiting for approval" in body(blake), "a new sign-up waits for approval instead of entering the site")
    blake.screenshot(path=f"{SHOTS}/02b-waiting-for-approval.png")
    blake.click("#pendingCheck"); blake.wait_for_timeout(600)
    check("Not approved yet" in body(blake), "'Check Again' says it's still waiting")
    admin.wait_for_timeout(3200)  # the site re-checks the database when data is >3s old
    nav(admin, "Dashboard")
    check(admin.locator(".tile", has_text="Settings").locator(".tile-badge").count() == 1, "admins see a badge on Settings for waiting sign-ups")
    check(admin.locator(".notif-badge").count() == 1, "…and a bell notification")
    approve_signup(blake, "Blake Amis")
    check("Welcome, Blake" in body(blake), "Blake lands on the Student dashboard, welcomed by first name")
    check("student" in blake.inner_text("#accountPills").lower(), "Blake's role pill says Student")
    amber = new_page(browser, "amber")
    amber.wait_for_selector("#signinForm")
    signup(amber, "Amber Amis", "amber@example.com")
    check("Welcome, " in body(amber), "Amber lands on the Student dashboard")

    print("3. Sign-in errors are clear")
    tmp = new_page(browser, "tmp")
    tmp.wait_for_selector("#signinForm")
    tmp.fill("#siEmail", "blake@example.com"); tmp.fill("#siPassword", "wrong-password")
    tmp.locator("#signinForm button[type=submit]").click(); tmp.wait_for_selector(".auth-error")
    check("don't match" in tmp.inner_text(".auth-error"), "wrong password → friendly message")
    tmp.context.close()

    print("4. Faculty: catalogue, schedule, roster, materials, assignments")
    tile(admin, "Courses")
    check("Hermeneutics I" in body(admin), "seeded courses appear in the catalogue")
    admin.screenshot(path=f"{SHOTS}/03-catalogue.png")
    admin.locator(".tile h3", has_text="Hermeneutics I").click(); settle(admin)
    check(admin.locator("h1", has_text="Hermeneutics I").count() == 1, "opens the Manage page")
    admin.click("#mgAddStudent"); admin.wait_for_selector("#addStudentList")
    admin.locator(".user-row", has_text="Blake Amis").locator("button").click(); settle(admin)
    admin.locator(".user-row", has_text="Amber Amis").locator("button").click(); settle(admin)
    admin.click("#addStudentDone")
    check("2 students enrolled" in body(admin), "two students added to the roster")
    admin.set_input_files("#mgAddFile", files=[{"name": "Hermeneutics Syllabus.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 syllabus"}])
    settle(admin)
    check("Hermeneutics Syllabus" in admin.inner_text("#mgMaterialsList"), "syllabus uploaded to course materials")
    admin.check("#mgAddTeacherOnly")
    admin.set_input_files("#mgAddFile", files=[{"name": "Final Exam Answer Key.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 key"}])
    settle(admin)
    key_row = admin.locator("#mgMaterialsList li", has_text="Final Exam Answer Key")
    check(key_row.locator(".pill-teacher").count() == 1 and key_row.locator("[data-teacher-only]").is_checked(), "answer key added as Teachers only")
    syl_row = admin.locator("#mgMaterialsList li", has_text="Hermeneutics Syllabus")
    check(not syl_row.locator("[data-teacher-only]").is_checked(), "the syllabus stays visible to the class")
    syl_row.locator("[data-teacher-only]").check(); settle(admin)
    check(admin.locator("#mgMaterialsList li", has_text="Hermeneutics Syllabus").locator(".pill-teacher").count() == 1, "checking the box makes a document teachers-only")
    admin.locator("#mgMaterialsList li", has_text="Hermeneutics Syllabus").locator("[data-teacher-only]").uncheck(); settle(admin)
    check(admin.locator("#mgMaterialsList li", has_text="Hermeneutics Syllabus").locator(".pill-teacher").count() == 0, "unchecking shares it with the class again")
    admin.uncheck("#mgAddTeacherOnly")
    admin.set_input_files("#mgAddFile", files=[{"name": "virus.exe", "mimeType": "application/octet-stream", "buffer": b"MZ"}])
    admin.wait_for_selector(".toast-error");
    check("isn't an allowed file type" in admin.inner_text(".toast-wrap"), "a disallowed file type is refused with a clear message")
    # standalone assignment
    admin.click("#mgAddAssignment"); admin.wait_for_selector("#asgTitle")
    admin.fill("#asgTitle", "Reading Reflection"); admin.fill("#asgDue", d(-1)); admin.fill("#asgPoints", "20"); admin.fill("#asgWeight", "60")
    admin.fill("#asgInstructions", "One page on Nehemiah 8:8.")
    admin.click("#asgSave"); settle(admin)
    # locked recurring series
    admin.click("#mgAddAssignment"); admin.wait_for_selector("#asgTitle")
    admin.check("input[name=asgType][value=recurring]")
    admin.fill("#asgTitle", "Weekly Quiz"); admin.fill("#asgDue", d(10)); admin.fill("#asgWeeks", "3"); admin.fill("#asgWeight", "40")
    admin.check("input[name=asgAvail][value=locked]"); admin.fill("#asgUnlockDays", "2")
    admin.click("#asgSave"); settle(admin)
    lst = admin.inner_text("#mgAssignmentsList").replace("WEEKS", "weeks")
    check("Reading Reflection" in lst and "Weekly Quiz" in lst and "3 weeks" in lst, "standalone + 3-week series created")
    check("Grade weights assigned: 100%" in lst, "running weight total shows 100%")
    check("Locked" not in lst.split("Weekly Quiz")[0], "standalone assignment isn't locked")
    admin.screenshot(path=f"{SHOTS}/04-manage-course.png", full_page=True)

    print("5. Student: course page, materials, turn in work")
    tile(blake, "My Courses")
    check("Hermeneutics I" in body(blake), "Blake sees Hermeneutics I under Enrolled")
    blake.locator(".tile h3", has_text="Hermeneutics I").click(); settle(blake)
    check("Hermeneutics Syllabus" in body(blake), "Blake sees the uploaded syllabus")
    check("Answer Key" not in body(blake), "Blake does NOT see the teachers-only answer key")
    blake.locator("[data-open-material]").first.click()
    blake.wait_for_selector(".doc-viewer")
    blake.wait_for_selector(".doc-pages, .doc-frame", timeout=15000)
    check(blake.locator("#matPdf", has_text="Download PDF").count() == 1, "a course PDF opens full-screen in the page, with Download PDF")
    blake.screenshot(path=f"{SHOTS}/05b-document-reader.png")
    blake.click("#matClose")
    check(blake.locator(".doc-viewer").count() == 0, "closing the reader returns to the course")
    blake.locator("li", has_text="Reading Reflection").locator("[data-assignment]").first.click()
    blake.wait_for_selector("input[name=submitMethod][value=editor]")
    blake.check("input[name=submitMethod][value=editor]")
    blake.wait_for_selector(".rte-page")
    check(blake.locator(".rte-toolbar .rte-btn").count() >= 25, "the word processor has a full toolbar")
    blake.click(".rte-page"); blake.keyboard.type("Ezra read distinctly and gave the sense.")
    blake.keyboard.press("Enter")
    blake.select_option(".rte-style", "h2"); blake.keyboard.type("Scripture")
    blake.keyboard.press("Enter")
    # Insert Scripture: by reference, as a block quotation.
    blake.click(".rte-scripture-btn"); blake.wait_for_selector(".rte-scr-form")
    blake.fill(".rte-scr-form input", "Neh 8:8"); blake.keyboard.press("Enter")
    blake.wait_for_selector(".rte-scr-passage")
    check("distinctly" in blake.inner_text(".rte-scr-passage"), "Scripture lookup shows Nehemiah 8:8 from the KJV")
    blake.locator(".rte-scr-opts .btn", has_text="Insert").click(); blake.wait_for_timeout(200)
    check(blake.locator(".rte-page blockquote.scripture").count() == 1 and "Nehemiah 8:8 (KJV)" in blake.inner_text(".rte-page"), "it's inserted as a block quotation with its reference")
    # …and by words, inline.
    blake.click(".rte-scripture-btn"); blake.wait_for_selector(".rte-scr-form")
    blake.fill(".rte-scr-form input", "study to shew thyself approved"); blake.keyboard.press("Enter")
    blake.wait_for_selector(".rte-scr-hit"); blake.locator(".rte-scr-hit").first.click()
    blake.wait_for_selector(".rte-scr-passage")
    blake.locator(".rte-seg label", has_text="In my sentence").click()
    blake.locator(".rte-scr-opts .btn", has_text="Insert").click(); blake.wait_for_timeout(200)
    check("(2 Timothy 2:15, KJV)" in blake.inner_text(".rte-page"), "a word search finds 2 Timothy 2:15 and inserts it inline")
    # Footnote + table
    blake.locator('.rte-btn[data-cmd="footnote"]').click(); blake.keyboard.type("Strong's H995."); blake.wait_for_timeout(500)
    check(blake.locator(".rte-page ol.footnotes li").count() == 1 and blake.locator(".rte-page sup.fn-ref").inner_text() == "1", "footnotes are numbered and listed at the end")
    blake.click(".rte-page h2"); blake.keyboard.press("End"); blake.keyboard.press("Enter")
    blake.locator('.rte-btn[data-cmd="pop:table"]').click(); blake.locator(".rte-grid span[data-r='2'][data-c='3']").click(); blake.wait_for_timeout(200)
    check(blake.locator(".rte-page table th").count() == 3 and blake.locator(".rte-page table td").count() == 3, "a 2×3 table with a header row is inserted")
    blake.locator(".rte-page table td").first.click()
    check(not blake.locator(".rte-tablebar").is_hidden(), "table tools appear when the cursor is in a table")
    blake.locator(".rte-tablebar button", has_text="+ Row below").click()
    check(blake.locator(".rte-page table td").count() == 6, "…and add a row")
    blake.wait_for_timeout(1500)
    check(blake.evaluate("Object.keys(localStorage).some(k => k.startsWith('tnbbi-draft:'))"), "the draft is kept on this device while writing")
    words = blake.inner_text(".rte-count")
    check("words" in words, f"word count shows ({words})")
    blake.screenshot(path=f"{SHOTS}/05c-word-processor.png", full_page=False)
    blake.evaluate("document.querySelector('.rte-page').innerHTML += '<img src=x onerror=\"window.__xss=1\"><script>window.__xss=2</script><a href=\"javascript:alert(1)\">x</a><p style=\"color:red;position:fixed\" onclick=\"x()\">styled</p>'")
    blake.click("#submitTurnIn"); settle(blake)
    check("submitted" in blake.text_content("#main").lower(), "written work turned in → Submitted")
    # locked quiz
    blake.locator("li", has_text="Weekly Quiz — Week 1").locator("[data-assignment]").first.click()
    blake.wait_for_selector(".modal")
    check("Not open yet" in blake.inner_text(".modal"), "locked quiz shows 'Not open yet'")
    blake.keyboard.press("Escape")
    check(blake.locator(".modal").count() == 0, "Escape closes a window")
    blake.screenshot(path=f"{SHOTS}/05-student-course.png", full_page=True)

    print("6. Amber turns in a file; can't see Blake's work")
    tile(amber, "Submit Work")
    sw = body(amber)
    check("Reading Reflection" in sw and "Weekly Quiz — Week 3" in sw, "Submit Work lists every assignment in the course")
    check(amber.locator(".submit-item", has_text="Weekly Quiz — Week 1").locator("button[disabled]", has_text="Opens").count() == 1,
          "a locked assignment shows the day it opens and can't be started yet")
    amber.screenshot(path=f"{SHOTS}/06a-submit-work.png", full_page=True)
    amber.locator(".submit-item", has_text="Reading Reflection").locator("[data-item]").click(); amber.wait_for_selector("#submitFile")
    amber.set_input_files("#submitFile", files=[{"name": "amber-reflection.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 amber"}])
    amber.click("#submitTurnIn"); settle(amber)
    nav(amber, "Dashboard"); tile(amber, "My Grades")
    check("Blake" not in body(amber), "Amber's grades page shows nothing of Blake's")

    print("7. Enrollment requests: request, approve, deny with a note")
    nav(blake, "Dashboard"); tile(blake, "My Courses")
    check("Genesis to Revelation" in body(blake), "future course is listed as Available")
    blake.locator("li", has_text="Genesis to Revelation").locator("[data-request]").click(); settle(blake)
    check("Pending Approval" in body(blake), "request shows as Pending Approval")
    nav(amber, "Dashboard"); tile(amber, "My Courses")
    amber.locator("li", has_text="Genesis to Revelation").locator("[data-request]").click(); settle(amber)
    admin.reload(); admin.wait_for_selector("#main .page-header"); settle(admin)
    check(admin.locator(".tile", has_text="Courses").locator(".tile-badge").inner_text().strip() == "2", "faculty Courses tile shows 2 pending requests")
    admin.click("#notifBell"); admin.wait_for_selector("#notifPanel")
    check("requested to enroll" in admin.inner_text("#notifPanel"), "faculty bell shows the enrollment requests")
    admin.mouse.click(30, 700)
    tile(admin, "Courses"); admin.locator(".tile h3", has_text="Genesis to Revelation").click(); settle(admin)
    admin.locator(".user-row", has_text="Blake Amis").locator("[data-approve]").click(); settle(admin)
    admin.locator(".user-row", has_text="Amber Amis").locator("[data-deny]").click(); admin.wait_for_selector("#denyNote")
    admin.click("#denySave")
    check(admin.locator(".modal").count() == 1, "deny refuses an empty note")
    admin.fill("#denyNote", "Please finish Hermeneutics I first."); admin.click("#denySave"); settle(admin)
    check("Enrollment Requests" not in body(admin), "requests card disappears once settled")
    check("1 student enrolled" in body(admin), "Blake is on the Genesis to Revelation roster")
    blake.reload(); blake.wait_for_selector("#main .page-header"); settle(blake)
    tile(blake, "My Courses")
    check(blake.locator(".tile h3", has_text="Genesis to Revelation").count() == 1, "approved course shows under Enrolled for Blake")
    amber.reload(); amber.wait_for_selector("#main .page-header"); settle(amber)
    check(amber.locator(".tile", has_text="Send Message").locator(".tile-badge").count() == 1, "Amber gets an unread-message bubble")
    tile(amber, "Send Message")
    amber.locator("li", has_text="Genesis to Revelation").click(); settle(amber)
    check("finish Hermeneutics I first" in body(amber), "denial note is in Amber's inbox")
    amber.fill("#msgInput", "Thank you — I'll take it next term."); amber.press("#msgInput", "Enter"); settle(amber)
    check("next term" in amber.inner_text("#msgThreadList"), "Amber can reply to the note")

    print("8. Grading → student sees grade, feedback, notification")
    nav(admin, "Dashboard"); tile(admin, "Grading")
    check("Needs Grading (2)" in body(admin), "both turn-ins wait in Needs Grading")
    row = admin.locator("li", has_text="Blake Amis")
    row.locator("[data-grade]").click(); admin.wait_for_selector("#gradeScore")
    modal = admin.inner_text(".modal")
    check("Ezra read distinctly" in modal, "faculty read the written work in the grade window")
    check(admin.evaluate("window.__xss") is None, "script hidden in student writing never runs")
    wv = admin.locator(".modal .written-view")
    check(wv.locator("blockquote.scripture").count() == 1 and wv.locator("table").count() == 1 and wv.locator("ol.footnotes").count() == 1 and wv.locator("h2").count() == 1,
          "faculty see the formatting: heading, Scripture quotation, table, footnotes")
    check(wv.locator("a[href^='javascript']").count() == 0 and wv.locator("[onclick]").count() == 0 and "position" not in (wv.locator("p", has_text="styled").get_attribute("style") or "") and "color" in (wv.locator("p", has_text="styled").get_attribute("style") or ""),
          "unsafe links, handlers and styles are stripped; plain colors are kept")
    admin.screenshot(path=f"{SHOTS}/08a-grading-written-work.png", full_page=False)
    admin.fill("#gradeScore", "18"); admin.fill("#gradeFeedback", "Well said — tie it back to v.8."); admin.click("#gradeSave"); settle(admin)
    admin.locator("li", has_text="Amber Amis").locator("[data-grade]").click(); admin.wait_for_selector("#gradeScore")
    check(admin.locator("#gradeOpenFile").count() == 1, "faculty can open Amber's uploaded file")
    admin.click("#gradeOpenFile"); admin.wait_for_selector(".doc-viewer")
    check(admin.locator(".doc-title", has_text="amber-reflection.pdf").count() == 1, "…it opens right in the page, over the grading window")
    admin.click("#matClose")
    check(admin.locator("#gradeScore").count() == 1, "…and closing it goes back to grading")
    admin.fill("#gradeScore", "17"); admin.click("#gradeSave"); settle(admin)
    check("Needs Grading (0)" in body(admin), "grading queue is empty")
    blake.reload(); blake.wait_for_selector("#main .page-header"); settle(blake)
    check(blake.locator(".notif-badge").count() == 1, "Blake's bell shows new notifications")
    tile(blake, "My Grades")
    g = body(blake)
    check("18/20" in g and "tie it back" in g, "Blake sees 18/20 and the feedback")
    blake.screenshot(path=f"{SHOTS}/06-my-grades.png", full_page=True)

    print("9. Messages: student → faculty → student")
    nav(blake, "Dashboard"); tile(blake, "Send Message")
    blake.locator("li", has_text="Hermeneutics I").click(); settle(blake)
    blake.fill("#msgInput", "Is the quiz open-book?"); blake.click("#msgSend"); settle(blake)
    blake.click("#msgExport"); blake.wait_for_timeout(200)
    check(blake.evaluate("window.__pdfSaved") is not None, "Export Thread produces a PDF download")
    nav(admin, "Dashboard")
    admin.reload(); admin.wait_for_selector("#main .page-header"); settle(admin)
    check(admin.locator(".tile", has_text="Message Inbox").locator(".tile-badge").count() == 1, "faculty Inbox shows unread")
    tile(admin, "Message Inbox")
    check("Amber Amis" in body(admin), "faculty inbox includes Amber's reply on a course she isn't enrolled in")
    admin.locator("li", has_text="Blake Amis").filter(has_text="Hermeneutics").click(); settle(admin)
    admin.fill("#msgInput", "Closed book — but you'll do fine."); admin.press("#msgInput", "Enter"); settle(admin)
    blake.wait_for_timeout(21000)  # the open thread checks for replies every 20s
    check("Closed book" in blake.inner_text("#msgThreadList"), "reply appears in Blake's open thread without reloading")

    print("10. Discussion board")
    nav(admin, "Dashboard"); tile(admin, "Discussion Board")
    admin.locator(".tile h3", has_text="Hermeneutics I").click(); settle(admin)
    admin.fill("#dbNewPost", "Where have you seen Nehemiah 8:8 modeled well?"); admin.click("#dbPostBtn"); settle(admin)
    nav(amber, "Dashboard"); tile(amber, "Discussion Board")
    amber.locator(".tile h3", has_text="Hermeneutics I").click(); settle(amber)
    check("Nehemiah 8:8" in body(amber), "Amber sees the instructor's post")
    check(amber.locator("#dbNewPost").count() == 0, "students can't start top-level posts")
    amber.locator("[data-reply-input]").fill("Our Wednesday study!"); amber.locator("[data-reply-btn]").click(); settle(amber)
    check("Our Wednesday study!" in body(amber), "Amber's reply posts")

    print("10b. Profiles: details, photo, and who can see what")
    nav(blake, "Dashboard")
    check(blake.locator(".profile-nudge").count() == 1, "dashboard invites Blake to set up his profile")
    blake.click("#myProfileBtn"); settle(blake)
    check("Your Profile" in body(blake), "clicking your name in the top bar opens My Profile")
    blake.fill("#pfChurch", "True North Baptist Church, Moose Creek")
    blake.fill("#pfBio", "Saved at 19. I teach the junior boys' Sunday school class.")
    blake.fill("#pfPhone", "(907) 555-0142")
    blake.fill("#pfAddress", "PO Box 12"); blake.fill("#pfCity", "North Pole"); blake.fill("#pfState", "AK"); blake.fill("#pfZip", "99705")
    blake.click("#saveProfileBtn"); settle(blake)
    check("Profile saved" in blake.inner_text(".toast-wrap"), "profile saves")
    blake.set_input_files("#avatarInput", os.path.join(HERE, "test-photo.png"))
    blake.wait_for_selector("#cropFrame")
    blake.screenshot(path=f"{SHOTS}/06b-photo-cropper.png")
    box = blake.locator("#cropFrame").bounding_box()
    blake.mouse.move(box["x"] + 130, box["y"] + 130); blake.mouse.down(); blake.mouse.move(box["x"] + 60, box["y"] + 120, steps=5); blake.mouse.up()
    blake.locator("#cropZoom").fill("1.6")
    blake.click("#cropSave"); settle(blake)
    check(blake.locator("#myProfileBtn img").count() == 1, "the new photo shows in the top bar")
    check(blake.locator(".profile-hero img").count() == 1, "…and on the profile page")
    up = blake.evaluate("currentUser.avatarPath || ''")
    check(up.startswith(blake.evaluate("currentUser.id") + "/") and up.endswith(".jpg"), "photo is stored as a JPEG in Blake's own folder")
    blake.reload(); blake.wait_for_selector("#main .page-header"); settle(blake)
    blake.click("#myProfileBtn"); settle(blake)
    check(blake.input_value("#pfCity") == "North Pole" and blake.input_value("#pfPhone") == "(907) 555-0142", "details are still there after reloading")
    blake.screenshot(path=f"{SHOTS}/06c-my-profile.png", full_page=True)
    nav(blake, "Dashboard")
    check(blake.locator(".profile-nudge").count() == 0, "the set-up invitation goes away once the profile is filled in")
    # Blake replies on the discussion board; Amber (a classmate) opens his card.
    tile(blake, "Discussion Board"); blake.locator(".tile h3", has_text="Hermeneutics I").click(); settle(blake)
    blake.locator("[data-reply-input]").fill("Our pastor's verse-by-verse in Nehemiah."); blake.locator("[data-reply-btn]").click(); settle(blake)
    nav(amber, "Dashboard"); tile(amber, "Discussion Board"); amber.locator(".tile h3", has_text="Hermeneutics I").click(); settle(amber)
    check(amber.locator(".person-chip", has_text="Blake Amis").first.locator("img").count() == 1, "Blake's photo shows beside his reply")
    amber.locator(".person-chip", has_text="Blake Amis").first.click(); amber.wait_for_selector(".person-card")
    card = amber.inner_text(".person-card")
    check("junior boys" in card and "Moose Creek" in card, "a classmate sees Blake's home church and About me")
    check("555-0142" not in card and "North Pole" not in card and "blake@example.com" not in card, "…but never his phone, address, or email")
    check(amber.evaluate("users.find(u => u.name === 'Blake Amis').phone") == "", "Blake's phone never even reaches Amber's browser")
    amber.screenshot(path=f"{SHOTS}/06d-person-card.png")
    amber.keyboard.press("Escape")
    # Faculty see everything and can help fill in a profile.
    nav(admin, "Dashboard"); tile(admin, "Settings")
    admin.locator(".user-row", has_text="Blake Amis").locator(".name-link").click(); admin.wait_for_selector(".person-card")
    check("555-0142" in admin.inner_text(".person-card"), "faculty see a student's phone on their card")
    admin.click("#editPersonBtn"); settle(admin)
    check("editing a profile" in body(admin).lower(), "faculty can open a student's profile to edit it")
    admin.fill("#pfCity", "Moose Creek"); admin.click("#saveProfileBtn"); settle(admin)
    admin.click("#backLink"); settle(admin)
    check("Users & Levels" in body(admin), "Back returns to Settings")
    blake.reload(); blake.wait_for_selector("#main .page-header"); settle(blake)
    blake.click("#myProfileBtn"); settle(blake)
    check(blake.input_value("#pfCity") == "Moose Creek", "Blake sees the change faculty made")
    blake.click("#removePhotoBtn"); settle(blake)
    check(blake.locator("#myProfileBtn img").count() == 0 and blake.locator("#myProfileBtn .avatar-initials").count() == 1, "removing the photo falls back to initials")
    nav(admin, "Dashboard"); tile(admin, "My Profile")
    check("Your Profile" in body(admin), "faculty have a My Profile tile too")

    print("11. Study Bible: read, Strong's concordance, search, cross references, highlight")
    nav(blake, "Study Bible")
    blake.wait_for_selector("#verse-16 .sw")
    check("John 3" in blake.inner_text("#sbReading"), "opens John 3 by default")
    check("everlasting life" in blake.inner_text("#verse-16"), "the full KJV text is served by the site itself")
    blake.locator("#verse-16 .sw", has_text="loved").first.click(); blake.wait_for_selector("#sbPanel .strongs-word")
    panel = blake.inner_text("#sbPanel")
    check("G25" in panel and "love" in panel.lower() and "every occurrence" in panel.lower(), "tapping a word opens its Strong's entry (G25) with KJV usage")
    blake.screenshot(path=f"{SHOTS}/07a-word-study.png", full_page=False)
    blake.locator("#sbPanel .sn-link").first.click()
    try: blake.wait_for_selector("#sbPanelBack", timeout=8000); ok = True
    except Exception: ok = False
    check(ok, "related Strong's numbers are linked, with Back")
    if ok: blake.click("#sbPanelBack")
    blake.wait_for_selector("#sbSeeAll")
    blake.click("#sbSeeAll"); blake.wait_for_selector(".sb-result")
    check(blake.locator(".sb-result").count() >= 40 and blake.locator(".sw-mark").count() >= 40, "See every occurrence lists verses with the word in bold")
    blake.click("#sbPanelClose")
    blake.fill("#sbQuery", "Rom 8:28"); blake.keyboard.press("Enter"); blake.wait_for_selector("#verse-28")
    check("Romans 8" in blake.inner_text("#sbReading"), "typing a reference jumps straight to it")
    blake.fill("#sbQuery", "\"born again\""); blake.keyboard.press("Enter"); blake.wait_for_selector(".sb-result")
    res = blake.inner_text("#sbReading")
    check("John 3:3" in res and "1 Peter 1:23" in res, f"phrase search finds every verse ({blake.locator('.sb-result').count()} results)")
    blake.screenshot(path=f"{SHOTS}/07b-search.png", full_page=False)
    blake.locator(".sb-result-ref", has_text="John 3:3").click(); blake.wait_for_selector("#verse-3")
    blake.click("#verse-16 .verse-num")
    blake.locator("#verse-16 [data-xref]").click(); blake.wait_for_selector(".sb-xref")
    check(blake.locator(".sb-xref").count() >= 5, "cross references open for a verse")
    blake.click("#sbPanelClose")
    check(blake.locator("#verse-16 .verse-actions").is_visible(), "the verse's buttons stay open after closing cross references")
    blake.locator("#verse-16 [data-hl]").click(); settle(blake)
    blake.wait_for_selector("#verse-16.verse-highlighted")
    blake.click("#sbToggleHighlights"); blake.wait_for_timeout(300)
    check("John 3:16" in blake.inner_text("#sbReading"), "My Highlights lists John 3:16")
    blake.screenshot(path=f"{SHOTS}/07-study-bible.png", full_page=True)
    amber_hl = amber.evaluate("bibleHighlightRows.length")
    check(amber_hl == 0, "highlights are private to each person")
    blake.click("#sbToggleHighlights")
    blake.select_option("#sbBook", "PSA"); blake.wait_for_selector(".verse-row")
    check("Psalm 1" in blake.inner_text("#sbReading"), "switching books loads another chapter")
    blake.select_option("#sbChapter", "23"); blake.wait_for_selector(".sb-psalm-title")
    check("A Psalm of David" in blake.inner_text(".sb-psalm-title"), "Psalm titles are shown above the psalm")
    blake.check("#sbNumbers"); blake.wait_for_selector("sup.sn")
    check("H7462" in blake.inner_text("#sbReading"), "Strong's numbers can be shown inline")
    blake.uncheck("#sbNumbers")
    blake.screenshot(path=f"{SHOTS}/07c-psalm-23.png", full_page=False)

    print("12. Calendar, grade sheet, resource library")
    nav(blake, "Calendar")
    check(blake.locator(".cal-day").count() == 42, "month grid renders 42 days")
    nav(admin, "Dashboard"); tile(admin, "Grading")
    admin.locator(".tile h3", has_text="Hermeneutics I").click(); settle(admin)
    gs = body(admin)
    check("Blake Amis" in gs and "18/20" in gs and "90%" in gs, "grade sheet shows Blake at 90%")
    admin.screenshot(path=f"{SHOTS}/08-grade-sheet.png", full_page=True)
    nav(amber, "Resource Library"); amber.fill("#resSearchInput", "preaching"); amber.wait_for_timeout(300)
    check("found" in body(amber).lower() and amber.locator(".materials-list li").count() > 0, "resource library search returns results")

    print("12b. Attendance and the calendar dialogs")
    nav(admin, "Dashboard"); tile(admin, "Courses")
    admin.locator(".tile h3", has_text="Hermeneutics I").click(); settle(admin)
    check("Not recording attendance" in admin.inner_text("#mgAttendanceCard"), "attendance starts off for existing courses")
    admin.click("#mgEditCourse"); admin.wait_for_selector("#ecAttOff")
    check(admin.locator("#ecAttWeight").is_disabled(), "with 'Not recording' checked, the % box is off")
    admin.uncheck("#ecAttOff"); admin.fill("#ecAttWeight", "10"); admin.fill("#ecAttLate", "50")
    check(admin.locator("#ecAttOff").is_disabled(), "the 'Not recording' box can only be checked at 0%")
    admin.screenshot(path=f"{SHOTS}/12a-attendance-settings.png")
    admin.click("#ecSave"); settle(admin)
    check("10%" in admin.inner_text("#mgAttendanceCard"), "attendance is now 10% of the grade")
    admin.click("#mgTakeAttendance"); settle(admin)
    check(admin.locator(".att-row").count() == 2, "the attendance page lists the roster")
    check(admin.locator(".att-row .att-who > span:last-child").first.inner_text() == "Amis, Amber", "…by last name")
    admin.locator(".att-row", has_text="Amis, Blake").locator("[data-mark=late]").click()
    admin.locator(".att-row", has_text="Amis, Amber").locator("[data-mark=absent]").click()
    admin.screenshot(path=f"{SHOTS}/12b-take-attendance.png", full_page=True)
    admin.click("#attSave"); settle(admin)
    check("taken" in admin.inner_text(".att-status").lower(), "attendance saves")
    nav(admin, "Dashboard"); tile(admin, "Grading")
    admin.locator(".tile h3", has_text="Hermeneutics I").click(); settle(admin)
    gs = body(admin)
    check("Attendance" in gs and "50%" in gs, "the grade sheet shows attendance (Late = 50%)")
    check("86%" in gs, "Blake's final grade blends 90% assignments with 50% attendance at 10% → 86%")
    nav(blake, "Dashboard"); tile(blake, "My Grades")
    check("Attendance: 50%" in body(blake), "Blake sees his own attendance in My Grades")
    # Teacher's calendar: class-day markers and the due-date dialog with orbs
    nav(admin, "Calendar")
    check(admin.locator(".cal-class").count() >= 4, "class days appear on the teacher's calendar")
    admin.locator(f"[data-cal-day='{d(10)}']").click(); admin.wait_for_selector(".cal-modal")
    m = admin.inner_text(".cal-modal")
    check("Weekly Quiz" in m and "Amis, Blake" in m and admin.locator(".cal-modal .orb-red").count() == 2,
          "tapping a due date shows the assignment and a red dot for each student who hasn't turned it in")
    admin.click("#calModalClose")
    admin.locator(f"[data-cal-day='{d(-1)}']").click(); admin.wait_for_selector(".cal-modal")
    check(admin.locator(".cal-modal .orb-green").count() == 2, "…and green for those who have")
    admin.screenshot(path=f"{SHOTS}/12c-teacher-calendar-dialog.png")
    admin.click("#calModalClose")
    admin.screenshot(path=f"{SHOTS}/12d-teacher-calendar.png", full_page=True)
    # Student's calendar: open the assignment straight into the usual submit tool
    nav(blake, "Calendar")
    check(blake.locator(".cal-class:not(.cal-class-legend)").count() >= 4, "a student's calendar shows the days their class meets")
    check(blake.locator(".cal-class-todo:not(.cal-class-legend)").count() == 0, "…without the teacher's attendance markers")
    blake.screenshot(path=f"{SHOTS}/12e0-student-calendar.png", full_page=True)
    cls_day = blake.locator(".cal-day:has(.cal-class)").first.get_attribute("data-cal-day")
    blake.locator(f"[data-cal-day='{cls_day}']").click(); blake.wait_for_selector(".cal-modal")
    check("Class meets" in blake.inner_text(".cal-modal") and blake.locator(".cal-modal [data-cal-att]").count() == 0,
          "tapping a class day shows the class time (no attendance buttons for students)")
    blake.click("#calModalClose")
    # Phone calendar subscription
    blake.click("#calPhone"); blake.wait_for_selector("#pcLink")
    link1 = blake.input_value("#pcLink")
    check("/functions/v1/calendar-feed?t=" in link1 and len(link1.split("t=")[1]) == 48, "a student gets a private phone-calendar link")
    check(blake.get_attribute("#pcApple", "href").startswith("webcal://") and "calendar.google.com" in blake.get_attribute("#pcGoogle", "href"),
          "…with Apple Calendar (webcal) and Google Calendar buttons")
    blake.screenshot(path=f"{SHOTS}/12e1-phone-calendar.png")
    blake.click("#pcReset"); blake.wait_for_timeout(600)
    link2 = blake.input_value("#pcLink")
    check(link2 != link1 and "calendar-feed?t=" in link2, "…and can replace it with a new link")
    blake.click("#pcClose")
    blake.click("#calReminders"); blake.wait_for_selector("#reminderCard [data-due-pref]")
    check("notifications" in body(blake).lower() and "remind me about assignments" in body(blake).lower(), "students have a Notifications card with due-date reminders on My Profile")
    check(blake.locator("[data-due-pref=evening].active").count() == 1, "…set to the evening before by default")
    blake.click("[data-due-pref=both]"); settle(blake); blake.wait_for_selector("[data-due-pref=both].active")
    blake.reload(); blake.wait_for_selector("#main .page-header"); settle(blake)
    tile(blake, "My Profile"); blake.wait_for_selector("[data-due-pref=both].active")
    check(True, "…and the choice (both) is saved")
    blake.locator("#reminderCard").scroll_into_view_if_needed()
    blake.screenshot(path=f"{SHOTS}/12e2-student-reminders.png")
    # A reminder notification's link opens the assignment
    aid = blake.evaluate("courses.flatMap(c => c.assignments).find(a => a.instructions && a.instructions.includes('Nehemiah 8:8')).id")
    blake.goto(BASE + "/?assignment=" + aid); blake.wait_for_selector("#submitClose", timeout=20000)
    check("Graded: 18/20" in blake.inner_text(".modal") and "assignment=" not in blake.url, "a reminder's link opens that assignment")
    blake.keyboard.press("Escape")
    nav(blake, "Calendar")
    blake.locator(f"[data-cal-day='{d(-1)}']").click(); blake.wait_for_selector(".cal-modal")
    check("One page on Nehemiah 8:8." in blake.inner_text(".cal-modal"), "a student taps a due date and sees the assignment")
    blake.screenshot(path=f"{SHOTS}/12e-student-calendar-dialog.png")
    blake.locator("[data-cal-submit]").click(); blake.wait_for_selector("#submitClose")
    check("Graded: 18/20" in blake.inner_text(".modal"), "…and opens it in the usual submission tool")
    blake.keyboard.press("Escape")
    # Day / night
    admin.click("#themeToggle"); admin.wait_for_timeout(200)
    check(admin.evaluate("document.documentElement.dataset.theme") == "dark", "the day/night switch turns on night mode")
    nav(admin, "Dashboard"); admin.screenshot(path=f"{SHOTS}/12f-night-mode.png")
    admin.click("#themeToggle"); admin.wait_for_timeout(200)
    check(admin.evaluate("document.documentElement.dataset.theme") == "light", "…and back to day")
    tile(admin, "My Profile")
    check(admin.locator("#reminderCard").count() == 1, "teachers have a Class Reminders card on My Profile")
    nav(admin, "Dashboard")


    print("12g. Oct 4: text size, help, location, announcements, cancellations")
    blake.click("#textSizeToggle"); blake.wait_for_timeout(200)
    check(blake.evaluate("document.documentElement.style.fontSize") == "112.5%", "the Aa button makes the text larger")
    blake.click("#textSizeToggle"); blake.click("#textSizeToggle"); blake.wait_for_timeout(200)
    check(blake.evaluate("document.documentElement.style.fontSize") == "", "…and cycles back to normal")
    blake.click("#helpBtn"); settle(blake)
    check("How to Use the Institute" in body(blake) and blake.locator("details.help-item").count() >= 8, "the ? button opens Help with answers for students")
    blake.locator("details.help-item summary", has_text="turn in an assignment").click()
    check("Turn In" in blake.inner_text("details.help-item[open]"), "…each question opens to its answer")
    blake.screenshot(path=f"{SHOTS}/13a-help.png", full_page=True)
    nav(admin, "Dashboard"); tile(admin, "Courses")
    admin.locator(".tile h3", has_text="Hermeneutics I").click(); settle(admin)
    admin.click("#mgEditCourse"); admin.wait_for_selector("#ecLocation")
    admin.fill("#ecLocation", "Fellowship Hall"); admin.fill("#ecMeetingUrl", "zoom.us/j/12345")
    admin.click("#ecSave"); settle(admin)
    check("Fellowship Hall" in admin.inner_text(".page-header"), "the teacher sets where the class meets")
    # Announcement
    admin.fill("#annBody", "Please read Nehemiah 8 before Wednesday.")
    admin.click("#annPost"); settle(admin)
    check("Please read Nehemiah 8" in admin.inner_text("#mgAnnounceCard"), "the teacher posts an announcement")
    # Cancel a class
    admin.locator("#mgCancelCard [data-cancel-day]").first.click(); admin.wait_for_selector("#ccReason")
    cancel_day = admin.input_value("#ccDate")
    admin.fill("#ccReason", "Roads closed by snow.")
    admin.screenshot(path=f"{SHOTS}/13b-cancel-class.png")
    admin.click("#ccConfirm"); settle(admin)
    check(admin.locator("#mgCancelCard [data-restore-day]").count() == 1 and "Roads closed by snow." in admin.inner_text("#mgCancelCard"), "the teacher cancels a class with a reason")
    admin.screenshot(path=f"{SHOTS}/13c-manage-new-cards.png", full_page=True)
    blake.wait_for_timeout(3200); nav(blake, "Dashboard")
    blake.reload(); blake.wait_for_selector("#main .page-header"); settle(blake)
    news = blake.inner_text(".dash-news")
    check("Class canceled" in news and "Roads closed by snow." in news and "Nehemiah 8" in news, "the student's dashboard shows the cancellation and the announcement")
    blake.screenshot(path=f"{SHOTS}/13d-student-dashboard-news.png", full_page=True)
    blake.click("#notifBell"); blake.wait_for_selector("#notifPanel")
    check(blake.locator("#notifPanel [data-notif-link]").count() >= 2, "…and the bell has both, each a link")
    blake.locator("#notifPanel .notif-item", has_text="Announcement").first.click(); settle(blake)
    check("Hermeneutics I" in blake.inner_text(".page-header") and "Please read Nehemiah 8" in body(blake), "tapping the announcement opens the course page")
    where = blake.locator(".where-link")
    check("Fellowship Hall" in blake.inner_text(".page-header") and where.count() == 1 and where.get_attribute("href") == "https://zoom.us/j/12345", "…which shows the room and a Join online link")
    nav(blake, "Calendar")
    calendar_has_cancel = blake.locator(f"[data-cal-day='{cancel_day}'] .cal-class-canceled").count()
    if calendar_has_cancel == 0:
        blake.click("#calNext"); settle(blake)
        calendar_has_cancel = blake.locator(f"[data-cal-day='{cancel_day}'] .cal-class-canceled").count()
    check(calendar_has_cancel == 1, "the canceled day is marked on the student's calendar")
    blake.locator(f"[data-cal-day='{cancel_day}']").first.click(); blake.wait_for_selector(".cal-modal")
    check("canceled" in blake.inner_text(".cal-modal").lower() and "Roads closed by snow." in blake.inner_text(".cal-modal"), "…tapping it explains why")
    blake.screenshot(path=f"{SHOTS}/13e-student-canceled-day.png")
    blake.click("#calModalClose")
    admin.locator("#mgCancelCard [data-restore-day]").click(); settle(admin)
    check(admin.locator("#mgCancelCard [data-restore-day]").count() == 0, "the teacher puts the class back on")

    print("12h. Oct 4: notifications, transcripts, copying, backups")
    tile_profile = lambda pg: (nav(pg, "Dashboard"), tile(pg, "My Profile"))
    tile_profile(blake)
    blake.wait_for_selector("[data-email-pref]")
    check(blake.locator("[data-email-pref=instant].active").count() == 1, "email notifications are on (right away) by default")
    blake.click("[data-email-pref=daily]"); settle(blake); blake.wait_for_selector("[data-email-pref=daily].active")
    check(True, "a student switches to a daily email summary")
    blake.locator("#reminderCard").scroll_into_view_if_needed()
    blake.screenshot(path=f"{SHOTS}/13f-notification-settings.png")
    # Record final grades → transcript
    nav(admin, "Dashboard"); tile(admin, "Grading")
    admin.locator(".tile h3", has_text="Hermeneutics I").click(); settle(admin)
    admin.click("#gsRecord"); admin.wait_for_selector(".rg-table")
    check(admin.locator(".rg-table [data-rg-student]").count() == 2, "Record Final Grades lists each enrolled student")
    check(admin.locator(".rg-table [data-rg-student]", has_text="Amis, Blake").locator(".rg-grade").input_value() == "B", "…with the grade filled in from the grade sheet (Blake 86% → B)")
    admin.screenshot(path=f"{SHOTS}/13g-record-final-grades.png")
    admin.click("#rgSave"); settle(admin)
    check("final grades recorded" in admin.inner_text(".page-header").lower(), "final grades are recorded")
    nav(blake, "Dashboard"); tile(blake, "My Transcript")
    t = blake.inner_text(".transcript-sheet")
    check("Hermeneutics I" in t and "Blake Amis" in t and "86%" in t, "the student's transcript shows the course, score, and grade")
    blake.screenshot(path=f"{SHOTS}/13h-my-transcript.png", full_page=True)
    nav(admin, "Dashboard"); tile(admin, "Transcripts")
    admin.locator("[data-tr-ref]", has_text="Blake Amis").click(); settle(admin)
    admin.click("#trAdd"); admin.wait_for_selector("#teCourse")
    admin.fill("#teCourse", "Bible Doctrines I"); admin.fill("#teTerm", "Fall 2024"); admin.fill("#teCredits", "2")
    admin.select_option("#teGrade", "A"); admin.fill("#teTeacher", "Bro. Smith"); admin.fill("#teStart", "2024-09-01")
    admin.click("#teSave"); settle(admin)
    t = admin.inner_text(".transcript-sheet")
    check("Bible Doctrines I" in t and "Fall 2024" in t.title() and "Bro. Smith" in t, "an Admin adds a course taken before the site existed")
    admin.click("#trPdf"); admin.wait_for_timeout(800)
    check((admin.evaluate("window.__pdfSaved") or "").startswith("Transcript - Blake Amis"), "…and downloads the transcript as a PDF")
    # The real PDF, made with the real PDF library
    pdfp = new_page(browser, "pdf", real_pdf=True)
    pdfp.wait_for_selector("#signinForm")
    pdfp.fill("#siEmail", "blake@example.com"); pdfp.fill("#siPassword", "faithful123")
    pdfp.locator("#signinForm button[type=submit]").click(); pdfp.wait_for_selector("#main .page-header"); settle(pdfp)
    pdfp.goto(BASE + "/?transcript=1"); pdfp.wait_for_selector(".transcript-sheet", timeout=15000); settle(pdfp)
    check("Bible Doctrines I" in pdfp.inner_text(".transcript-sheet"), "a /?transcript=1 link opens My Transcript")
    with pdfp.expect_download() as dl2:
        pdfp.click("#trPdf")
    pdf_path = os.path.join(SHOTS, "13i-transcript.pdf")
    dl2.value.save_as(pdf_path)
    check(open(pdf_path, "rb").read(5) == b"%PDF-", "the downloaded transcript is a real PDF")
    pdfp.context.close()
    # Copy for a new term
    nav(admin, "Dashboard"); tile(admin, "Courses")
    admin.locator(".tile h3", has_text="Hermeneutics I").click(); settle(admin)
    n_asg = admin.locator("#mgAssignmentsList > li:not(.weight-total):not(.privacy-note)").count()
    admin.click("#mgCopyCourse"); admin.wait_for_selector("#cpName")
    admin.fill("#cpName", "Interpretation Copy (Spring)"); admin.fill("#cpStart", d(150))
    admin.click("#cpGo"); settle(admin)
    check("Interpretation Copy (Spring)" in admin.inner_text(".page-header"), "Copy for a New Term makes the new course and opens it")
    check(admin.locator("#mgAssignmentsList > li:not(.weight-total):not(.privacy-note)").count() == n_asg and "0 students enrolled" in admin.text_content("body"), "…with the same assignments and no students")
    check(admin.locator("#mgMaterialsList li", has_text="Open").count() >= 1 or admin.locator("#mgMaterialsList [data-open-material]").count() >= 1, "…and its files copied")
    admin.screenshot(path=f"{SHOTS}/13j-copied-course.png", full_page=True)
    # Backups
    nav(admin, "Dashboard"); tile(admin, "Settings")
    admin.wait_for_selector("#bkNow")
    with admin.expect_download() as dl3:
        admin.click("#bkNow")
    bpath = os.path.join(SHOTS, "backup.json")
    dl3.value.save_as(bpath)
    bk = json.load(open(bpath))
    check(bk.get("format") == "tnbbi-backup-1" and any(c["title"] == "Hermeneutics I" for c in bk["tables"]["courses"]) and len(bk["tables"]["transcript_entries"]) >= 2,
          "an Admin downloads a backup holding courses and transcripts")
    admin.locator("#backupsCard").scroll_into_view_if_needed()
    admin.screenshot(path=f"{SHOTS}/13k-backups.png")
    # First-time tour (a brand-new student)
    newbie = new_page(browser, "newbie", tour=True)
    newbie.wait_for_selector("#signinForm")
    signup(newbie, "Ruth Newcomer", "ruthn@example.com")
    newbie.wait_for_selector(".tour-card", timeout=10000)
    check("Welcome, Ruth" in newbie.inner_text(".tour-card"), "a newly approved student is greeted by the tour")
    newbie.screenshot(path=f"{SHOTS}/13l-tour-welcome.png")
    newbie.click("#tourNext"); newbie.wait_for_timeout(300)
    check("My Courses" in newbie.inner_text(".tour-card") and newbie.locator(".tour-spot").count() == 1, "…which points to each feature in turn")
    newbie.screenshot(path=f"{SHOTS}/13m-tour-step.png")
    steps = 2
    while newbie.locator("#tourNext").inner_text() != "Finish" and steps < 30:
        newbie.click("#tourNext"); newbie.wait_for_timeout(150); steps += 1
    newbie.screenshot(path=f"{SHOTS}/13n-tour-last.png")
    newbie.click("#tourNext"); newbie.wait_for_timeout(500)
    check(newbie.locator("#tourRoot").count() == 0 and steps >= 10, f"…through every step ({steps}) to the end")
    newbie.evaluate("Object.keys(localStorage).filter(k => k.startsWith('tnbbi-tour-done')).forEach(k => localStorage.removeItem(k))")
    newbie.reload(); newbie.wait_for_selector("#main .page-header"); settle(newbie); newbie.wait_for_timeout(1200)
    check(newbie.locator(".tour-card").count() == 0, "…and doesn't come back after that (remembered on the account)")
    newbie.click("#helpBtn"); settle(newbie); newbie.click("#helpTour"); newbie.wait_for_selector(".tour-card")
    check(True, "the tour can be taken again from Help")
    newbie.keyboard.press("Escape"); newbie.wait_for_timeout(200)
    newbie.context.close()

    print("12i. Oct 8: past records from before the site")
    def past_csv(rows):
        head = "Student,Email,Course,Term,Credits,Grade,Score %,Instructor\n"
        return (head + "\n".join(rows) + "\n").encode()
    good = [
        "Blake Amis,blake@example.com,Church History II,Spring 2024,3,B+,88.77,Bro. Raby",
        "Grace Future,grace.future@example.com,Hermeneutics I (2025),Spring 2025,3,A-,91.68,",
        "Grace Future,grace.future@example.com,Church History II,Spring 2024,3,AU,,",
        '"Lucy Lambert",,"Landmarks of English Bible (Manuscript Evidence)","Spring 2024 - Spring 2025",3,AU,,',
    ]
    nav(admin, "Dashboard"); tile(admin, "Transcripts")
    admin.click("#trPast"); settle(admin)
    check("Past Records" in admin.inner_text(".page-header"), "an Admin opens Transcripts → Past Records")
    with admin.expect_download() as dlt:
        admin.click("#prTemplate")
    check(dlt.value.suggested_filename.endswith(".csv"), "…and can download a blank template")
    admin.set_input_files("#prFile", files=[{"name": "old grades.csv", "mimeType": "text/csv", "buffer": past_csv(good + ["Bad Row,bad@example.com,Church History II,Spring 2024,3,Q,,"])}])
    admin.wait_for_selector(".pr-table"); settle(admin)
    check(admin.locator(".pr-table tr.pr-bad").count() == 1 and admin.locator("#prCommit").is_disabled(), "the check flags a bad grade and won't import until it's fixed")
    admin.screenshot(path=f"{SHOTS}/13o-past-records-problem.png", full_page=True)
    admin.click("#prCancel")
    admin.set_input_files("#prFile", files=[{"name": "old grades.csv", "mimeType": "text/csv", "buffer": past_csv(good)}])
    admin.wait_for_selector(".pr-table"); settle(admin)
    pv = admin.inner_text("#pastImportCard").lower()
    check("3 will wait" in pv and "1 goes on a transcript now" in pv, "the corrected file: 3 wait for sign-up, 1 goes onto an existing student's transcript")
    admin.screenshot(path=f"{SHOTS}/13p-past-records-check.png", full_page=True)
    admin.click("#prCommit"); settle(admin)
    t = admin.inner_text("#main")
    check("Grace Future" in t and "Lucy Lambert" in t and "no email" in t.lower(), "after importing, the waiting list shows each student (Lucy flagged: no email)")
    admin.screenshot(path=f"{SHOTS}/13q-past-records-waiting.png", full_page=True)
    nav(blake, "Dashboard"); tile(blake, "My Transcript")
    t = blake.inner_text(".transcript-sheet")
    check("Church History II" in t and "B+" in t and "spring 2024" in t.lower(), "Blake (already signed up) has the past course on his transcript right away, with its B+")
    blake.screenshot(path=f"{SHOTS}/13r-transcript-with-past.png", full_page=True)
    admin.set_input_files("#prFile", files=[{"name": "old grades.csv", "mimeType": "text/csv", "buffer": past_csv(good)}])
    admin.wait_for_selector(".pr-table"); settle(admin)
    check("4 already imported" in admin.inner_text("#pastImportCard").lower() and admin.locator("#prCommit").is_disabled(), "importing the same file again adds nothing")
    admin.click("#prCancel")
    nav(admin, "Dashboard"); tile(admin, "Transcripts")
    t = admin.inner_text("#main")
    check("Grace Future" in t and "not signed up yet" in t.lower(), "before signing up, a past student already shows on Transcripts (Not signed up yet)")
    admin.locator("[data-tr-ref]", has_text="Grace Future").click(); settle(admin)
    t = admin.inner_text(".transcript-sheet")
    check("Hermeneutics I (2025)" in t and "A-" in t, "…with their past courses and grades on the transcript")
    admin.screenshot(path=f"{SHOTS}/13r2-transcript-not-joined.png", full_page=True)
    nav(admin, "Dashboard"); tile(admin, "Transcripts"); admin.click("#trPast"); settle(admin)
    # A student from the old sheets signs up with the same email
    grace = new_page(browser, "grace")
    grace.wait_for_selector("#signinForm")
    signup(grace, "Grace Future", "grace.future@example.com")
    nav(grace, "Dashboard"); tile(grace, "My Transcript")
    t = grace.inner_text(".transcript-sheet")
    check("Hermeneutics I (2025)" in t and "A-" in t and "AU" in t, "a past student who signs up and is approved finds their old courses already on their transcript")
    grace.screenshot(path=f"{SHOTS}/13s-new-signup-transcript.png", full_page=True)
    grace.click("#notifBell"); grace.wait_for_timeout(300)
    check("added to your transcript" in grace.inner_text("body"), "…and is told about it in the bell")
    grace.context.close()
    # No email on file → an Admin links by hand
    lucy = new_page(browser, "lucy")
    lucy.wait_for_selector("#signinForm")
    signup(lucy, "Lucy Lambert", "lucy.l@example.com")
    nav(admin, "Dashboard"); tile(admin, "Transcripts"); admin.click("#trPast"); settle(admin)
    admin.locator(".materials-list > li", has_text="Lucy Lambert").locator("[data-pr-link]").click()
    admin.wait_for_selector("#lpPick")
    check(admin.locator("#lpPick").input_value() != "", "Link to Account suggests the matching account")
    admin.screenshot(path=f"{SHOTS}/13t-link-past-records.png")
    admin.click("#lpSave"); settle(admin)
    check("Lucy Lambert" not in admin.inner_text(".materials-list") if admin.locator(".materials-list").count() else True, "…linking moves the record off the waiting list")
    nav(lucy, "Dashboard"); tile(lucy, "My Transcript")
    check("Manuscript Evidence" in lucy.inner_text(".transcript-sheet"), "…and onto Lucy's transcript")
    lucy.context.close()
    admin.set_viewport_size({"width": 390, "height": 844}); admin.wait_for_timeout(300)
    admin.screenshot(path=f"{SHOTS}/13u-past-records-phone.png", full_page=True)
    check(admin.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Past Records fits a phone screen (no sideways scrolling)")
    admin.set_viewport_size({"width": 1280, "height": 900}); admin.wait_for_timeout(200)

    print("12j. Oct 9: hybrid & online courses — lectures, live class, tracks")
    nav(admin, "Dashboard"); tile(admin, "Courses")
    admin.click("#catAddCourse"); admin.wait_for_selector("#cbName")
    admin.fill("#cbName", "Romans (Hybrid)")
    admin.locator("label.fmt-choice", has_text="Hybrid").click()
    check(admin.locator("#cbLiveWrap").is_visible() and not admin.locator("#cbPaceWrap").is_visible(), "Hybrid shows the live settings (self-paced is for Online courses)")
    admin.fill("#cbPlaylist", "not a link")
    admin.click("#cbSave"); admin.wait_for_selector(".toast-error")
    check("playlist link" in admin.inner_text(".toast-wrap"), "a bad playlist link is caught with a clear message")
    admin.fill("#cbPlaylist", "https://www.youtube.com/playlist?list=PLromans12345")
    admin.screenshot(path=f"{SHOTS}/12j-add-hybrid-course.png", full_page=True)
    admin.click("#cbSave"); settle(admin)
    cid = psql("select id from public.courses where title = 'Romans (Hybrid)'")
    check(psql(f"select format || ',' || playlist_id || ',' || (select count(*) from public.playlist_sync where course_id = '{cid}') from public.courses where id = '{cid}'") == "hybrid,PLromans12345,1",
          "the course is saved as Hybrid with its playlist, and a playlist check is requested")
    blake_id = psql("select id from public.profiles where email = 'blake@example.com'")
    amber_id = psql("select id from public.profiles where email = 'amber@example.com'")
    psql(f"""update public.courses set sched_mode = 'scheduled', sched_start = public.local_today() - 14, sched_weeks = 8,
               sched_days = array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
               sched_time = to_char((now() at time zone 'America/Anchorage') - interval '5 minutes', 'HH24:MI'),
               attendance_on = true, attendance_weight = 10 where id = '{cid}';
             insert into public.enrollments (course_id, student_id) values ('{cid}', '{blake_id}'), ('{cid}', '{amber_id}');""")
    # The service reads the playlist from YouTube (simulated):
    items = [
        {"video_id": "ROMvid00001", "title": "Romans 1 — The Gospel of God", "position": 0, "duration": 20, "status": "ok", "in_playlist": True, "recorded_on": d(-7)},
        {"video_id": "ROMvid00002", "title": "Romans 3 — Justified Freely", "position": 1, "duration": 20, "status": "ok", "in_playlist": True, "recorded_on": d(-1)},
        {"video_id": "ROMlive0003", "title": "Romans 5 — Live", "position": 2, "status": "live", "in_playlist": True, "recorded_on": d(0)},
    ]
    psql(f"select public.sync_course_lessons('{cid}', 'PLromans12345', '{json.dumps(items)}'::jsonb)")
    admin.reload(); admin.wait_for_selector("#main .page-header"); settle(admin)
    nav(admin, "Dashboard"); tile(admin, "Courses")
    admin.locator(".tile h3", has_text="Romans (Hybrid)").click(); settle(admin)
    lc = admin.inner_text("#mgLecturesCard")
    check("Hybrid" in lc and "Romans 3" in lc and "LIVE NOW" in lc.upper() and "3 videos" in lc, "Lectures card: format, the playlist's lectures, and the live stream")
    admin.screenshot(path=f"{SHOTS}/12j-lectures-card.png", full_page=True)

    # Blake chooses recordings and watches a lecture
    nav(blake, "Dashboard"); tile(blake, "My Courses")
    blake.locator(".tile h3", has_text="Romans (Hybrid)").click(); settle(blake)
    check(blake.locator("#attendChoose").count() == 1, "a new student is asked how they'll attend")
    check(blake.locator("#watchLive").count() == 1, "class is in session: a Watch Live button appears")
    blake.screenshot(path=f"{SHOTS}/12j-student-course.png", full_page=True)
    blake.locator("[data-track=recorded]").click(); settle(blake)
    check(blake.locator(".course-tab[data-tab=lectures]").count() == 1, "the course has a Lectures tab")
    check(blake.locator(".overview-card .lecture-next").count() == 1, "the Overview shows the next lecture to watch")
    tab(blake, "lectures")
    check("You watch the recorded lectures" in body(blake) and blake.locator("#attendChoose").count() == 0, "Blake picks recorded lectures")
    check(blake.locator("#panel-lectures .lecture-row").count() == 2, "both posted lectures are listed (the live one is under Watch Live)")
    titles = blake.locator("#panel-lectures .lecture-row strong").all_inner_texts()
    check(titles == sorted(titles, key=lambda t: int(re.search(r"\d+", t).group()) if re.search(r"\d+", t) else 0), f"lectures are listed first-to-last ({titles})")
    blake.locator("#panel-lectures .lecture-row", has_text="Romans 3").locator("button").click(); settle(blake)
    blake.wait_for_selector(".fake-yt")
    check(blake.locator("[data-video=ROMvid00002]").count() == 1 and "0% watched" in blake.inner_text("#watchText"), "the lecture opens in the site's player")
    blake.evaluate("window.__yt.last.playVideo()")
    blake.wait_for_function("document.getElementById('watchText') && document.getElementById('watchText').innerText.includes('Watched')", timeout=60000)
    check(True, "watching the whole lecture marks it watched")
    blake.wait_for_timeout(1500)
    check(psql(f"select status || ',' || auto from public.attendance where course_id = '{cid}' and student_id = '{blake_id}' and class_date = public.local_today() - 1") == "present,true",
          "…and counts Blake present for that class day, automatically")
    blake.screenshot(path=f"{SHOTS}/12j-lecture.png", full_page=True)
    blake.click("#backLink"); settle(blake)
    tab(blake, "lectures")
    check("✓ Watched" in blake.locator("#panel-lectures .lecture-row", has_text="Romans 3").inner_text(), "back on the course, the lecture shows ✓ Watched")

    # Amber, on a phone, attends live and asks a question
    amberp = new_page(browser, "amber-phone", mobile=True)
    amberp.wait_for_selector("#signinForm")
    amberp.fill("#siEmail", "amber@example.com"); amberp.fill("#siPassword", "faithful123")
    amberp.locator("#signinForm button[type=submit]").click(); amberp.wait_for_selector("#main .page-header", timeout=15000); settle(amberp)
    tile(amberp, "My Courses")
    amberp.locator(".tile h3", has_text="Romans (Hybrid)").click(); settle(amberp)
    amberp.locator("[data-track=live]").click(); settle(amberp)
    amberp.click("#watchLive"); settle(amberp)
    amberp.wait_for_selector("[data-video=ROMlive0003]", timeout=15000)
    check(True, "Watch Live opens the live stream inside the site")
    amberp.evaluate("window.__yt.last.playVideo()")
    amberp.wait_for_function("document.getElementById('liveCountText') && /1 of \\d+ minutes/.test(document.getElementById('liveCountText').innerText)", timeout=20000)
    check(True, "watching live is counted, minute by minute")
    amberp.fill("#chatInput", "Does verse 8 mean God's love came first?")
    amberp.locator("#chatForm button").click()
    amberp.wait_for_selector(".chat-msg.chat-mine", timeout=10000)
    check("verse 8" in amberp.inner_text("#chatList"), "Amber's question appears in the class chat")
    amberp.screenshot(path=f"{SHOTS}/12j-live-phone.png", full_page=True)
    w = amberp.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
    check(w[0] <= w[1] + 1, "the live class fits a phone screen (no sideways scrolling)")

    # The teacher reads and answers it from the Live Class page
    admin.click("#lectOpenLive"); settle(admin)
    admin.wait_for_selector(".chat-msg", timeout=10000)
    check("verse 8" in admin.inner_text("#chatList"), "the teacher sees the question")
    admin.wait_for_function("document.getElementById('liveWatchers') && document.getElementById('liveWatchers').innerText.includes('Amber')", timeout=35000)
    check("1" in admin.inner_text("#liveWatchers"), "…and who's watching online right now")
    admin.fill("#chatInput", "Yes — while we were yet sinners.")
    admin.locator("#chatForm button").click()
    amberp.wait_for_selector(".chat-msg.chat-teacher", timeout=10000)
    check("yet sinners" in amberp.inner_text("#chatList"), "Amber gets the teacher's answer, marked Teacher")
    admin.screenshot(path=f"{SHOTS}/12j-live-teacher.png", full_page=True)
    admin.click("#backLink"); settle(admin)

    # Online students on the attendance screen
    admin.click("#mgTakeAttendance"); settle(admin)
    oa = admin.inner_text("#main")
    check("Online — counted automatically" in oa and "Amis, Blake" in oa and "Amis, Amber" in oa, "online students are listed separately, counted automatically")
    admin.screenshot(path=f"{SHOTS}/12j-attendance-online.png", full_page=True)
    admin.click("#backLink"); settle(admin)
    check(admin.locator("[data-track-for]").count() == 2, "the roster shows how each student attends")

    # Teacher tools: add a video by link, hide one
    admin.fill("#lectAddUrl", "https://youtu.be/ABCDEFGHIJK"); admin.fill("#lectAddTitle", "Romans 8 (guest)")
    admin.locator("#lectAddForm button").click(); settle(admin)
    check("Romans 8 (guest)" in admin.inner_text("#mgLecturesCard") and "Added by link" in admin.inner_text("#mgLecturesCard"), "a video can be added by link")
    admin.locator(".lect-admin-row", has_text="Romans 1").locator("[data-hide-lesson]").click(); settle(admin)
    check(admin.locator(".lect-admin-row", has_text="Romans 1").locator(".pill", has_text="Hidden").count() == 1, "…and a lecture hidden from students")
    nav(blake, "Dashboard"); tile(blake, "My Courses")
    blake.locator(".tile h3", has_text="Romans (Hybrid)").click(); settle(blake)
    check("Romans 1" not in blake.inner_text(".lecture-list"), "the hidden lecture disappears for students")

    # Lecture Archive
    psql(f"""insert into public.courses (id, title, archived) values ('arch1', 'Church History I (2023)', true);
             insert into public.lessons (course_id, video_id, title, duration_seconds) values ('arch1', 'CHvideo0001', 'The Apostolic Age', 20);""")
    blake.reload(); blake.wait_for_selector("#main .page-header"); settle(blake)
    nav(blake, "Resource Library")
    blake.click("#openLectureArchive"); settle(blake)
    blake.locator("[data-arch-course=arch1]").click(); settle(blake)
    blake.locator("[data-arch-lesson]").first.click(); settle(blake)
    blake.wait_for_selector(".fake-yt")
    check("doesn't count toward any course" in body(blake), "past lectures play from the Lecture Archive, clearly for study only")
    blake.click("#backLink"); settle(blake)
    amberp.context.close()
    # (Done with Romans: it goes to the archive so it doesn't meet "today" in later checks.)
    psql(f"update public.courses set archived = true where id = '{cid}'")
    admin.reload(); admin.wait_for_selector("#main .page-header"); settle(admin)

    print("13. Settings: levels (Student / Faculty / Admin), deactivate")
    nav(admin, "Dashboard"); tile(admin, "Settings")
    check(admin.locator(".user-row", has_text="Blake Amis").locator("button[data-level=admin]").count() == 1, "an Admin sets each person's level: Student / Faculty / Admin")
    admin.locator(".user-row", has_text="Amber Amis").locator("[data-inactive]").click(); settle(admin)
    amber.reload(); amber.wait_for_selector(".auth-error", timeout=15000)
    check("inactive" in amber.inner_text(".auth-error"), "deactivated student is signed out with an explanation")
    admin.click("#userTabs button[data-tab=inactive]")
    admin.locator(".user-row", has_text="Amber Amis").locator("[data-reactivate]").click(); settle(admin)
    admin.click("#userTabs button[data-tab=active]")
    admin.locator(".user-row", has_text="Blake Amis").locator("button[data-level=faculty]").click(); settle(admin)
    blake.reload(); blake.wait_for_selector("#main .page-header"); settle(blake)
    check("Welcome Professor" in body(blake), "promoted user gets the Faculty dashboard")
    bp = blake.inner_text("#accountPills").lower()
    check("faculty" in bp and "admin" not in bp, "Faculty see a single Faculty badge")
    tile(blake, "Settings")
    check(blake.locator("[data-role-toggle]").count() == 0 and blake.locator("[data-inactive]").count() == 0 and blake.locator("[data-delete]").count() == 0,
          "Faculty can't change levels, deactivate, or delete accounts")
    check(blake.locator(".user-row", has_text="Amber Amis").locator(".pill", has_text="Student").count() == 1, "…they see each person's level instead")
    blake.screenshot(path=f"{SHOTS}/13a-faculty-settings.png", full_page=False)
    nav(blake, "Dashboard"); tile(blake, "Transcripts")
    t = blake.inner_text("#main")
    check("Lucy Lambert" in t and "Grace Future" in t and blake.locator("#trPast").count() == 0, "Faculty (not Admins) see past students' courses on Transcripts, without the Admin-only import")
    admin.locator(".user-row", has_text="Blake Amis").locator("button[data-level=student]").click(); settle(admin)

    print("13b. Course teachers: who sees what, hand-offs, and reassignment")
    ruth = new_page(browser, "ruth")
    ruth.wait_for_selector("#signinForm")
    signup(ruth, "Ruth Faculty", "ruth@example.com")
    nav(admin, "Dashboard"); tile(admin, "Settings")
    admin.locator(".user-row", has_text="Ruth Faculty").locator("button[data-level=faculty]").click(); settle(admin)
    ruth.reload(); ruth.wait_for_selector("#main .page-header"); settle(ruth)
    check("Welcome Professor" in body(ruth), "Ruth is now faculty")
    tile(ruth, "Grading")
    check("Hermeneutics I" not in body(ruth) and "aren't teaching" in body(ruth), "a faculty member who doesn't teach a course doesn't see its grades")
    nav(ruth, "Dashboard"); tile(ruth, "Message Inbox")
    check("Blake Amis" not in body(ruth) and "Amber Amis" not in body(ruth), "…or its private messages")
    nav(ruth, "Dashboard"); tile(ruth, "Discussion Board")
    check("Hermeneutics I" not in body(ruth), "…or its discussion board")
    nav(ruth, "Dashboard"); tile(ruth, "Courses")
    ruth.locator(".tile h3", has_text="Hermeneutics I").click(); ruth.wait_for_selector("#ciTitle")
    check("Only this course's teacher or an Admin can change it" in ruth.inner_text(".modal"), "opening someone else's course shows a read-only summary")
    check(ruth.locator(".tile", has_text="Hermeneutics I").locator("[data-archive-toggle]").count() == 0, "…with no Archive button")
    ruth.keyboard.press("Escape")
    ruth.click("#catAddCourse"); ruth.wait_for_selector("#cbName")
    check("You'll be this course's teacher" in ruth.inner_text(".modal"), "the Add Course form says you'll be the teacher")
    ruth.fill("#cbName", "Pastoral Epistles"); ruth.click("#cbSave"); settle(ruth)
    check(ruth.locator(".tile", has_text="Pastoral Epistles").locator(".pill", has_text="You teach this").count() == 1, "the new course is assigned to its creator")
    ruth.locator(".tile h3", has_text="Pastoral Epistles").click(); settle(ruth)
    check(ruth.locator("#mgTeacher").count() == 1, "before it starts, the teacher can hand the course to someone else")
    check(ruth.locator("#mgDeleteCourse").count() == 0, "faculty never get a Delete Course button (Admins only)")
    ruth.screenshot(path=f"{SHOTS}/13b-teacher-card-handoff.png", full_page=False)
    # The Admin reassigns a course that's already under way.
    nav(admin, "Dashboard"); tile(admin, "Courses")
    admin.locator(".tile h3", has_text="Hermeneutics I").click(); settle(admin)
    check("No teacher yet" in admin.inner_text("#mgTeacherCard"), "an unassigned course says the Admins are covering it")
    admin.select_option("#mgTeacher", label="Ruth Faculty"); admin.click("#mgSaveTeacher"); settle(admin)
    check("Ruth Faculty" in admin.inner_text("#mgTeacherCard"), "an Admin reassigns a course that has already started")
    check("visible only to its teacher" in admin.inner_text("#mgAssignmentsList") and admin.locator("[data-view-roster]").count() == 0,
          "the Admin can still manage it, but no longer sees its turned-in work")
    admin.screenshot(path=f"{SHOTS}/13c-super-admin-reassigned.png", full_page=False)
    nav(admin, "Dashboard"); tile(admin, "Grading")
    check("Hermeneutics I" not in admin.inner_text("#main"), "…or its grades")
    ruth.reload(); ruth.wait_for_selector("#main .page-header"); settle(ruth)
    check(ruth.locator(".notif-badge").count() == 1, "the new teacher gets a notification")
    make_class_now = """(() => { const c = courses.find(x => x.title === 'Hermeneutics I'); const d = new Date(); c.att.on = true;
      c.schedule.days = [DAY_NAMES[d.getDay()]]; c.schedule.startDate = todayStr(); c.schedule.weeks = 2;
      c.schedule.time = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); view = 'home'; renderMain(); })()"""
    check(ruth.locator(".tile h3", has_text="Attendance").count() == 0, "there's no separate Attendance tile")
    ruth.evaluate(make_class_now)
    att_btn = ruth.locator(".tile", has_text="Courses").locator("[data-take-att]")
    check(att_btn.count() == 1 and "Take Attendance" in att_btn.inner_text(), "on class day the teacher's Courses tile shows Take Attendance")
    ruth.screenshot(path=f"{SHOTS}/13e-take-attendance-on-courses.png", full_page=False)
    admin.evaluate(make_class_now)
    check(admin.locator("[data-take-att]").count() == 0, "…but only for the course's assigned teacher")
    att_btn.click(); settle(ruth)
    check(ruth.evaluate("view") == "attendance", "…and it opens today's attendance")
    nav(ruth, "Dashboard"); nav(admin, "Dashboard")
    tile(ruth, "Grading")
    ruth.locator("[data-sheet]", has_text="Hermeneutics I").first.click(); settle(ruth)
    check("Blake Amis" in body(ruth) and "18/20" in body(ruth), "the substitute sees the full grade book")
    nav(ruth, "Dashboard"); tile(ruth, "Message Inbox")
    check("Blake Amis" in body(ruth), "…and the students' message history")
    nav(ruth, "Dashboard"); tile(ruth, "Courses")
    ruth.locator(".tile h3", has_text="Hermeneutics I").click(); settle(ruth)
    check(ruth.locator("#mgTeacher").count() == 0 and "only an Admin can change its teacher" in ruth.inner_text("#mgTeacherCard"),
          "once a course has started, its teacher can't hand it off")
    ruth.screenshot(path=f"{SHOTS}/13d-teacher-card-locked.png", full_page=False)
    nav(blake, "Dashboard"); tile(blake, "Send Message")
    check("Ruth Faculty" in body(blake), "students' messages now go to the new teacher")
    check("student" in blake.inner_text("#accountPills").lower() and "faculty" not in blake.inner_text("#accountPills").lower(),
          "a role changed while someone has the site open is picked up on their next page change")
    ruth.context.close()

    print("13b. Course documents: grouped, sorted, searchable, and handed out week by week")
    psql(f"insert into public.enrollments (course_id, student_id) values ('c6', '{blake_id}') on conflict do nothing")
    nav(admin, "Dashboard"); tile(admin, "Courses")
    admin.locator(".tile h3", has_text="Church History").first.click(); settle(admin)
    check(admin.locator(".course-tab").count() == 5, "the Manage page is split into tabs")
    tab(admin, "materials")
    pdf = lambda name: {"name": name, "mimeType": "application/pdf", "buffer": b"%PDF-1.4 " + name.encode()}
    files = [pdf(f"Church History Quiz {n}.pdf") for n in (10, 2, 1, 3, 11, 12)]
    files += [{"name": "Church History Quiz 1.docx", "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "buffer": b"PK fake"},
              pdf("Church History 1 Syllabus.pdf"), pdf("Week 1 Study Questions.pdf"), pdf("Writing Evaluation Form.pdf")]
    admin.set_input_files("#mgAddFile", files=files); settle(admin)
    groups = admin.locator("#mgMaterialsList .docs-group .docs-group-name").all_inner_texts()
    check(groups[:1] == ["Syllabus & Course Info"] and "Quizzes" in groups and "Study Questions & Worksheets" in groups and "Guides & Forms" in groups,
          f"documents are grouped by kind ({groups})")
    for g in admin.locator("#mgMaterialsList .docs-group:not([open]) summary").all(): g.click()
    quiz_names = admin.locator("#mgMaterialsList .docs-group[data-group=quiz] .doc-name").all_inner_texts()
    check(quiz_names == [f"Church History Quiz {n}" for n in (1, 2, 3, 10, 11, 12)], f"…sorted 1, 2, 3, 10 — not 1, 10, 2 ({quiz_names})")
    q1 = admin.locator("#mgMaterialsList .doc-row", has_text="Church History Quiz 1").filter(has_not_text="Quiz 10").first
    check(q1.locator(".doc-open button").all_inner_texts() == ["PDF", "Word"], "the Word and PDF copies of one document share a row")
    admin.fill("#mgMaterialsList .docs-search", "quiz 1")
    check(admin.locator("#mgMaterialsList .doc-row:not([hidden])").count() == 4, "searching 'quiz 1' finds Quiz 1, 10, 11 and 12")
    admin.fill("#mgMaterialsList .docs-search", "")
    admin.screenshot(path=f"{SHOTS}/13b-materials-grouped.png", full_page=True)

    tab(admin, "assignments"); admin.click("#mgAddAssignment"); admin.wait_for_selector("#asgTitle")
    admin.check("input[name=asgType][value=recurring]")
    admin.fill("#asgTitle", "Church History Quiz"); admin.fill("#asgDue", d(3)); admin.fill("#asgWeight", "0")
    admin.fill("#asgWeeks", "4"); admin.dispatch_event("#asgWeeks", "change")
    admin.click("[data-pick-toggle]"); admin.fill("[data-pick-search]", "quiz")
    admin.click('[data-pick-all="quiz"]')
    weeks = [admin.locator(f'[data-wp-week="{i}"] option:checked').inner_text() for i in range(4)]
    check(weeks == ["Church History Quiz 1", "Church History Quiz 2", "Church History Quiz 3", "Church History Quiz 10"], f"a weekly quiz hands out the quizzes in order ({weeks})")
    check("2 documents don't have a week" in admin.inner_text("#asgWeekPlan"), "…and says which quizzes don't fit")
    admin.set_input_files("[data-pick-upload]", files=[pdf("Church History Quiz 13.pdf")])
    admin.click("[data-wp-fit]")
    check(admin.input_value("#asgWeeks") == "7" and admin.locator('[data-wp-week="6"] option:checked').inner_text() == "Church History Quiz 13",
          "a quiz uploaded from the computer joins in order; 'Make it 7 weeks' fits them all")
    admin.screenshot(path=f"{SHOTS}/13b-weekly-quiz-documents.png", full_page=False)
    admin.click("#asgSave"); settle(admin)
    plan = psql("""select string_agg(t, ';' order by due) from (select a.due, string_agg(m.title, ',' order by m.title) t
                   from public.assignments a left join public.assignment_materials am on am.assignment_id = a.id
                   left join public.materials m on m.id = am.material_id
                   where a.course_id = 'c6' and a.series_label = 'Church History Quiz' group by a.id, a.due) x""")
    check(plan == ";".join(["Church History Quiz 1.docx,Church History Quiz 1.pdf"] + [f"Church History Quiz {n}.pdf" for n in (2, 3, 10, 11, 12, 13)]),
          "saved: week 1 → Quiz 1 (PDF and Word), week 2 → Quiz 2 … week 7 → Quiz 13")
    check(psql("select count(*) from public.materials where course_id = 'c6' and title = 'Church History Quiz 13.pdf'") == "1", "…and the uploaded quiz is in Course Materials too")
    check("Documents on every week" in admin.inner_text("#mgAssignmentsList"), "the assignment list shows every week has its document")
    admin.locator("#mgAssignmentsList [data-series-docs]").click(); admin.wait_for_selector("#adPlan .week-plan")
    check(admin.locator('#adPlan [data-wp-week="6"] option:checked').inner_text() == "Church History Quiz 13", "Documents reopens with each week's quiz")
    admin.click("#adCancel")

    blake.reload(); blake.wait_for_selector("#main .page-header", timeout=20000); settle(blake)
    nav(blake, "Dashboard"); tile(blake, "My Courses")
    blake.locator(".tile h3", has_text="Church History").first.click(); settle(blake)
    check([t.split()[0] for t in blake.locator(".course-tab").all_inner_texts()] == ["Overview", "Materials", "Assignments"], "a student's course page has Overview · Materials · Assignments tabs")
    tab(blake, "assignments")
    chips = blake.locator("#panel-assignments .series-next .doc-chip").all_inner_texts()
    check(len(chips) == 2 and all("Church History Quiz 1" in c for c in chips), f"the week's quiz is right on the assignment, as PDF and Word ({chips})")
    blake.locator("#panel-assignments .series-next [data-assignment]").click(); blake.wait_for_selector(".modal")
    check(blake.locator(".modal .doc-chip").count() == 2, "…and in the turn-in window")
    blake.click("#submitCancel" if blake.locator("#submitCancel").count() else "#submitClose")
    tab(blake, "materials")
    check(blake.locator("#panel-materials .docs-search").count() == 1 and blake.locator("#panel-materials .docs-group").count() >= 3, "students get the same grouped, searchable materials")
    blake.screenshot(path=f"{SHOTS}/13b-student-assignments.png", full_page=True)

    print("14. Archive and delete a course")
    nav(admin, "Dashboard"); tile(admin, "Courses")
    admin.click("#catAddCourse"); admin.wait_for_selector("#cbName")
    admin.fill("#cbName", "Test Course To Delete"); admin.click("#cbSave"); settle(admin)
    check("Test Course To Delete" in body(admin), "new course appears in the catalogue")
    admin.locator(".tile", has_text="Test Course To Delete").locator("[data-archive-toggle]").click(); settle(admin)
    admin.click("#catalogueTabs button[data-tab=archived]")
    admin.locator(".tile h3", has_text="Test Course To Delete").click(); settle(admin)
    admin.click("#mgDeleteCourse"); admin.click("#confirmDeleteCourse"); settle(admin)
    check("permanently deleted" in body(admin), "archived course is deleted")

    print("15. Phone-sized screens")
    phone = new_page(browser, "phone", mobile=True)
    phone.wait_for_selector("#signinForm")
    phone.screenshot(path=f"{SHOTS}/09-phone-sign-in.png")
    phone.fill("#siEmail", "amber@example.com"); phone.fill("#siPassword", "faithful123")
    phone.locator("#signinForm button[type=submit]").click()
    phone.wait_for_selector("#main .page-header"); settle(phone)
    overflow = phone.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(overflow <= 1, f"no sideways scrolling on a phone (overflow {overflow}px)")
    phone.screenshot(path=f"{SHOTS}/10-phone-dashboard.png", full_page=True)
    phone.click("#notifBell"); phone.wait_for_selector("#notifPanel")
    box = phone.locator("#notifPanel").bounding_box()
    check(box["x"] >= 0 and box["x"] + box["width"] <= 390, f"the notification panel stays on a phone screen (x={box['x']:.0f}, w={box['width']:.0f})")
    phone.screenshot(path=f"{SHOTS}/10b-phone-notifications.png")
    had = phone.locator(".notif-item").count()
    if had:
        phone.locator(".notif-dismiss").first.click(); phone.wait_for_timeout(300)
        check(phone.locator(".notif-item").count() == had - 1, "one notification can be cleared")
        if had > 1:
            phone.click("#notifClearAll"); phone.wait_for_timeout(300)
            check(phone.locator(".notif-item").count() == 0 and "caught up" in phone.inner_text("#notifPanel"), "Clear all empties the list")
        phone.reload(); phone.wait_for_selector("#main .page-header"); settle(phone)
        check(phone.locator(".notif-badge").count() == 0 and phone.evaluate("myNotifications().length") == 0, "cleared notifications stay cleared")
    else:
        check(False, "the phone account has notifications to clear")
    phone.click("body", position={"x": 5, "y": 600})
    nav(phone, "Study Bible"); phone.wait_for_selector(".verse-row")
    overflow = phone.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(overflow <= 1, f"Study Bible fits a phone (overflow {overflow}px)")
    phone.screenshot(path=f"{SHOTS}/11-phone-bible.png")
    nav(phone, "Dashboard"); tile(phone, "Send Message")
    overflow = phone.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(overflow <= 1, f"Messages fit a phone (overflow {overflow}px)")
    nav(phone, "Dashboard"); tile(phone, "My Profile")
    overflow = phone.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(overflow <= 1, f"My Profile fits a phone (overflow {overflow}px)")
    phone.screenshot(path=f"{SHOTS}/12-phone-profile.png", full_page=True)

    print("15b. Updates reach people without a hard refresh")
    check(len(admin.evaluate("Object.keys(window.TNBBI_VERSIONS || {})")) == 11, "every site file was version-checked on load")
    check(admin.locator(".site-update-bar").count() == 0, "no update notice when nothing changed")
    admin.evaluate("checkForSiteUpdate(true)"); admin.wait_for_timeout(500)
    check(admin.locator(".site-update-bar").count() == 0, "…still none after a check")
    t = time.time() + 120
    os.utime(os.path.join(HERE, "..", "..", "docs", "js", "app.js"), (t, t))
    admin.evaluate("checkForSiteUpdate(true)"); admin.wait_for_selector(".site-update-bar", timeout=5000)
    check("has been updated" in admin.inner_text(".site-update-bar"), "an open tab is told when a new version is published")
    admin.screenshot(path=f"{SHOTS}/13-update-bar.png")
    admin.click("#siteUpdateBtn"); admin.wait_for_selector("#main .page-header", timeout=15000); settle(admin)
    check(admin.locator(".site-update-bar").count() == 0 and "Welcome Professor" in body(admin), "Refresh Now reloads into the new version, still signed in")

    print("15c. Privacy: signed out after 30 minutes without activity")
    blake.evaluate("localStorage.setItem('tnbbi-last-active', String(Date.now() - 29 * 60 * 1000)); idleLastMark = 0; checkIdle()")
    blake.wait_for_selector("#idleWarning")
    check("signed out" in blake.inner_text("#idleWarning"), "a 'Still there?' notice appears 2 minutes before")
    blake.click("#idleStay")
    check(blake.locator("#idleWarning").count() == 0 and blake.locator("#main .page-header").is_visible(), "Stay signed in keeps them in")
    blake.evaluate("localStorage.setItem('tnbbi-last-active', String(Date.now() - 31 * 60 * 1000)); idleLastMark = 0; checkIdle()")
    blake.wait_for_selector("#signinForm")
    check("30 minutes" in blake.inner_text(".auth-error"), "after 30 minutes idle they're signed out, with a reason")

    print("16. Sign out")
    admin.click("#logoutBtn"); admin.wait_for_selector("#signinForm")
    check(admin.locator("#signinForm").count() == 1, "Log Out returns to the sign-in screen")

    browser.close()

print()
if errors:
    print("JavaScript errors:")
    for e in errors:
        print("  -", e)
real_failures = [f for f in failures if f]
print(f"{'PASSED' if not real_failures and not errors else 'FAILED'}: {len(real_failures)} failed checks, {len(errors)} JS errors")
sys.exit(1 if real_failures or errors else 0)
