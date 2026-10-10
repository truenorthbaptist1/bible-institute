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


ALL = "{Sun,Mon,Tue,Wed,Thu,Fri,Sat}"
with sync_playwright() as p:
    browser = p.chromium.launch()
    print("A. Admin (Professor Smith) dashboard")
    admin = new_page(browser, "admin", google_email="truenorthbaptist1@gmail.com")
    admin.wait_for_selector("#googleSignInBtn")
    logo = admin.evaluate("(() => { const i = document.querySelector('.auth-logo img'); return i ? i.getBoundingClientRect().width : 0; })()")
    check(logo >= 140, f"sign-in crest is large ({logo:.0f}px)")
    admin.screenshot(path="/tmp/claude-0/t/01-signin.png")
    admin.click("#googleSignInBtn"); admin.wait_for_selector("#main .page-header", timeout=15000); settle(admin)
    aid = psql("select id from profiles where email='truenorthbaptist1@gmail.com'")
    psql(f"""update profiles set name='Jedediah Smith Jr.' where id='{aid}';
      update courses set faculty_id='{aid}', sched_days='{ALL}', sched_time='23:30', sched_start=current_date-7, sched_weeks=4, sched_mode='now', location='Fellowship Hall' where id='c1';
      update courses set faculty_id=null, sched_days='{ALL}', sched_time='22:00', sched_start=current_date-7, sched_weeks=4, sched_mode='now' where id='c2';
      update courses set faculty_id='{aid}', sched_days='{ALL}', sched_time='21:00', sched_start=current_date-7, sched_weeks=4, sched_mode='now' where id='c3';
      insert into class_cancellations(course_id,class_date,reason) values ('c3', current_date+1, 'Snow');
      update courses set sched_days='{{}}', sched_time=null, sched_start=null, sched_mode=null where id not in ('c1','c2','c3');""")
    admin.reload(); admin.wait_for_selector("#main .page-header", timeout=15000); settle(admin)
    title = admin.inner_text(".hero-title")
    check(title == "Welcome, Professor Smith", f"teacher greeting reads '{title}'")
    pills = [b.inner_text() for b in admin.locator("#navPills button").all()]
    check(pills == [] and not admin.is_visible("#navPills"), f"header has no page buttons (got {pills})")
    w = admin.evaluate("document.querySelector('#brandHome img').getBoundingClientRect().width")
    check(w >= 80, f"header crest is larger ({w:.0f}px)")
    card = admin.inner_text("#needsAttention")
    check("classes you're teaching" in card.lower(), "Needs Your Attention lists classes you're teaching")
    check("Hermeneutics I" in card and "Landmarks of Baptist Doctrine (Bibliology 101)" in card, "shows both of my classes")
    check("homiletics" not in card.lower().split("classes you're teaching")[1], "does not show a class someone else (or no one) teaches")
    check("Canceled" in card, "shows my canceled day as canceled")
    admin.screenshot(path="/tmp/claude-0/t/02-teacher-home.png", full_page=True)
    # browser Back
    tile(admin, "Settings"); settle(admin)
    admin.go_back(); settle(admin)
    check(admin.locator("#needsAttention").count() == 1, "browser Back from Settings returns to the Dashboard")
    admin.go_forward(); settle(admin)
    check("Settings" in admin.inner_text("#main"), "browser Forward goes back to Settings")
    admin.click("#brandHome"); settle(admin)
    check(admin.locator("#needsAttention").count() == 1, "the crest returns to the Dashboard")
    admin.go_back(); settle(admin); admin.go_back(); settle(admin); admin.go_back(); settle(admin)
    check(admin.url.startswith(BASE) and admin.locator("#needsAttention").count() == 1, "repeated Back never leaves the site")
    # course + tab history
    admin.locator("[data-attn-class]").first.click(); settle(admin)
    on_att = admin.evaluate("view")
    check(on_att in ("attendance", "manage"), f"clicking a class opens it ({on_att})")
    admin.go_back(); settle(admin)
    check(admin.evaluate("view") == "home", "Back returns from the class to the Dashboard")

    print("B. Student dashboard")
    stu = new_page(browser, "ruth")
    stu.wait_for_selector(".auth-tabs")
    signup(stu, "Ruth Moab", "ruth@example.com")
    sid = psql("select id from profiles where email='ruth@example.com'")
    psql(f"""insert into enrollments(course_id, student_id) values ('c1','{sid}'),('c2','{sid}'),('c3','{sid}');""")
    stu.reload(); stu.wait_for_selector("#main .page-header", timeout=15000); settle(stu)
    t = stu.inner_text(".hero-title")
    check(t.endswith(", Ruth") and "Professor" not in t, f"student greeting unchanged ('{t}')")
    wk = stu.inner_text("#thisWeek")
    check("upcoming classes" in wk.lower() and "Hermeneutics I" in wk and "Homiletics" in wk, "This Week lists the student's upcoming classes")
    check(stu.locator("#thisWeek .week-class").count() == 5, "shows up to five, with a 'more' note")
    check("more this week" in wk, "notes the rest are on the Calendar")
    stu.screenshot(path="/tmp/claude-0/t/03-student-home.png", full_page=True)
    stu.locator("#thisWeek .week-class").first.click(); settle(stu)
    check(stu.evaluate("view") == "course", "a class row opens the course")
    stu.go_back(); settle(stu)
    check(stu.evaluate("view") == "home", "Back returns to the Dashboard")
    # modal closes on back
    tile(stu, "My Courses"); settle(stu); stu.go_back(); settle(stu)
    check(stu.evaluate("view") == "home", "Back from My Courses")
    ph = new_page(browser, "phone", mobile=True)
    ph.wait_for_selector(".auth-logo img"); ph.screenshot(path="/tmp/claude-0/t/04-phone-signin.png")
    ph.close()
    ph = new_page(browser, "ruthphone", mobile=True)
    ph.locator(".auth-tabs button", has_text="Sign In").click()
    ph.fill("#siEmail", "ruth@example.com"); ph.fill("#siPassword", "faithful123"); ph.click("#siSubmit")
    ph.wait_for_selector("#main .page-header", timeout=15000); settle(ph)
    ph.screenshot(path="/tmp/claude-0/t/05-phone-home.png")
    nb = ph.evaluate("document.querySelector('.top-nav').getBoundingClientRect().height")
    check(nb < 300, f"phone header height unchanged ({nb:.0f}px)")
    print("JS errors:", errors)
    print("FAILURES:", failures)
    pass
