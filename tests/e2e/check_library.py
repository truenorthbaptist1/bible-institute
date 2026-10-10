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
    browser = p.chromium.launch()
    admin = new_page(browser, "admin", google_email="truenorthbaptist1@gmail.com")
    admin.wait_for_selector("#googleSignInBtn"); admin.click("#googleSignInBtn")
    admin.wait_for_selector("#main .page-header", timeout=15000); settle(admin)
    S = "/tmp/claude-0/lib"; os.makedirs(S, exist_ok=True)
    nav(admin, "Resource Library")
    check(admin.locator(".lib-shelf-card").count() == 19, "browse view shows the 19 shelves")
    check(admin.locator(".lib-drive-group").count() == 5, "browse view shows the 4 church Drive folders + selected documents")
    check(admin.locator(".lib-topic-links a").count() == 35, f"every topic folder is linked ({admin.locator('.lib-topic-links a').count()})")
    check(admin.locator(".lib-drive-head").first.get_attribute("target") == "_blank", "Drive links open in a new tab")
    admin.screenshot(path=f"{S}/1-browse.png", full_page=True)
    # Pick a course: grouped by shelf, course shelves first, collapsed
    admin.select_option("#resCourseSelect", "c3"); settle(admin)
    names = [d.get_attribute("data-shelf") for d in admin.locator(".lib-shelf").all()]
    check(names[:4] == ["Doctrine", "Bible Preservation", "Bible Versions", "The Church"], f"course shelves in course order ({names})")
    check(admin.locator(".lib-shelf[open]").count() == 0, "many results: shelves start closed")
    check(admin.locator(".lib-chip").count() >= 5, "shelf chips with counts")
    admin.screenshot(path=f"{S}/2-course.png", full_page=True)
    admin.locator(".lib-shelf summary").nth(1).click(); admin.wait_for_timeout(200)
    shown = admin.locator(".lib-shelf[open] .lib-book").count()
    check(shown == 8 and admin.locator(".lib-shelf[open] [data-lib-more]").count() == 1, f"an opened shelf shows 8 books then 'Show all' ({shown})")
    admin.locator(".lib-shelf[open] [data-lib-more]").click(); settle(admin)
    n = admin.locator(".lib-shelf[open] .lib-book").count(); check(n >= 58, f"Show all lists the whole shelf ({n})")
    check(admin.locator(".lib-copies").count() >= 1, "a book the church owns twice shows as one line, 2 copies")
    admin.screenshot(path=f"{S}/3-shelf-open.png", full_page=True)
    # chip narrows
    admin.locator(".lib-chip", has_text="Bible Versions").click(); settle(admin)
    check(admin.locator(".lib-shelf").count() == 1 and admin.locator(".lib-shelf[open]").count() == 1, "a chip shows just that shelf, open")
    # search + sort by author
    admin.click("#libClear"); settle(admin)
    admin.fill("#resSearchInput", "cloud"); admin.wait_for_timeout(300); settle(admin)
    check(admin.locator("mark").count() > 0, "matches are highlighted")
    admin.select_option("#resSort", "author"); settle(admin)
    check(admin.locator(".lib-author-head").count() > 0, "author sort groups books under author names")
    admin.locator(".lib-shelf summary").first.click(); admin.wait_for_timeout(200)
    admin.screenshot(path=f"{S}/4-search-author.png", full_page=True)
    # shelf name search
    admin.fill("#resSearchInput", "apologetics"); admin.wait_for_timeout(300); settle(admin)
    check(admin.locator(".lib-shelf[data-shelf=Apologetics]").count() == 1, "typing a shelf name finds the shelf")
    # Drive shelf from browse
    admin.click("#libClear"); settle(admin)
    admin.locator(".lib-drive-picked").click(); settle(admin)
    check(admin.locator(".lib-drive li").count() == 24, "Selected documents lists the 24 Drive documents")
    check(admin.locator(".lib-folders li").count() == 35, "...and every Drive topic folder")
    admin.click("#libClear"); settle(admin)
    admin.fill("#resSearchInput", "preservation"); admin.wait_for_timeout(300); settle(admin)
    check(admin.locator(".lib-folder", has_text="Bible Preservation").count() == 1, "a keyword finds the matching Drive folder")
    admin.screenshot(path=f"{S}/7-search-folders.png", full_page=True)
    admin.fill("#resSearchInput", "audio"); admin.wait_for_timeout(300); settle(admin)
    check(admin.locator(".lib-folder strong").first.inner_text() == "TNBC Audio Library", "naming a big folder lists that folder first")
    admin.click("#libClear"); settle(admin)
    admin.select_option("#resCourseSelect", "c6"); settle(admin)
    t = admin.inner_text(".lib-folders")
    check("Baptist Distinctives" in t and "Bible Preservation" not in t, "a class brings up its own Drive folders")
    admin.click("#libClear"); settle(admin)
    admin.fill("#resSearchInput", "powerpoint"); admin.wait_for_timeout(300); settle(admin)
    check(admin.locator(".lib-folder").count() == 0, "PowerPoint and Discipleship folders are not in the library")
    # no results
    admin.fill("#resSearchInput", "zzzqqq"); admin.wait_for_timeout(300); settle(admin)
    check("No" in admin.inner_text("#main"), "no-match message")
    # phone
    ph = new_page(browser, "ph", google_email="truenorthbaptist1@gmail.com", mobile=True)
    ph.wait_for_selector("#googleSignInBtn"); ph.click("#googleSignInBtn"); ph.wait_for_selector("#main .page-header", timeout=15000); settle(ph)
    nav(ph, "Resource Library"); ph.screenshot(path=f"{S}/5-phone-browse.png")
    ph.select_option("#resCourseSelect", "c6"); settle(ph)
    ph.locator(".lib-shelf summary").first.click(); ph.wait_for_timeout(200)
    ph.screenshot(path=f"{S}/6-phone-course.png", full_page=False)
    print("JS errors:", errors); print("FAILURES:", failures)
