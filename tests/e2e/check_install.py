#!/usr/bin/env python3
"""Checks the "Add the Bible Institute to your phone" banner (Oct 15, 2026).

Run with the test server up (see run_e2e.sh):  python3 tests/e2e/check_install.py
"""
import json, os, re, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8765")
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.environ.get("SHOTS", os.path.join(HERE, "screenshots"))
os.makedirs(SHOTS, exist_ok=True)
FAKE_SB = open(os.path.join(HERE, "fake-supabase.js")).read()
FAKE_PURIFY = open(os.path.join(HERE, "vendor", "purify.min.js")).read()
CONFIG = """window.TNBBI_CONFIG = { supabaseUrl: "http://localhost/fake", supabaseAnonKey: "test-key", testMode: true, bootstrapAdminEmail: "truenorthbaptist1@gmail.com" };"""

IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"
IPHONE_FB = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 [FBAN/FBIOS;FBAV/500.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5]"
ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"
DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"

# A stand-in for Chrome's install offer: records that the site asked for it.
FAKE_BIP = """
window.__fireInstall = function (outcome) {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; return Promise.resolve(); };
  e.userChoice = Promise.resolve({ outcome: outcome || 'accepted' });
  window.dispatchEvent(e);
};
"""

passed = failed = 0
def check(ok, label, detail=""):
    global passed, failed
    if ok: passed += 1; print("  ✓", label)
    else: failed += 1; print("  ✗", label, detail)

def page_for(browser, ua, mobile=True, standalone=False, early_bip=None):
    ctx = browser.new_context(user_agent=ua, viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 800},
                              is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    ctx.add_init_script("window.TNBBI_TEST_NO_TOUR = true;")
    ctx.add_init_script(FAKE_BIP)
    if standalone:
        ctx.add_init_script("Object.defineProperty(navigator, 'standalone', { get: () => true });")
    if early_bip:
        # Chrome's offer arriving before the site's own scripts have loaded.
        ctx.add_init_script("document.addEventListener('DOMContentLoaded', () => window.__fireInstall(%s));" % json.dumps(early_bip))
    ctx.route(re.compile(r".*supabase-js.*"), lambda r: r.fulfill(body=FAKE_SB, content_type="application/javascript"))
    ctx.route(re.compile(r".*dompurify.*"), lambda r: r.fulfill(body=FAKE_PURIFY, content_type="application/javascript"))
    ctx.route(re.compile(r".*jspdf.*"), lambda r: r.fulfill(body="window.jspdf={};", content_type="application/javascript"))
    ctx.route(re.compile(r".*fonts\.(googleapis|gstatic)\.com.*"), lambda r: r.abort())
    ctx.route(re.compile(r".*/js/config\.js$"), lambda r: r.fulfill(body=CONFIG, content_type="application/javascript"))
    p = ctx.new_page()
    p.errors = []
    p.on("pageerror", lambda e: p.errors.append(str(e)))
    p.goto(BASE + "/")
    p.wait_for_selector("#authScreen .auth-card", timeout=15000)
    p.wait_for_timeout(400)
    return ctx, p

def kind(p):
    return p.evaluate("(() => { const b = document.getElementById('installBanner'); return b ? b.dataset.kind : ''; })()")

with sync_playwright() as pw:
    br = pw.chromium.launch()

    print("iPhone, Safari")
    ctx, p = page_for(br, IPHONE)
    check(kind(p) == "ios", "the sign-in page offers to add it to the Home Screen", kind(p))
    t = p.inner_text("#installBanner")
    check("Add the Bible Institute to your phone" in t and "Share" in t and "Add to Home Screen" in t, "…with the two taps in Safari", t)
    check("class reminders" in t, "…and says it's how reminders reach an iPhone")
    p.screenshot(path=os.path.join(SHOTS, "install-iphone.png"))
    box = p.eval_on_selector("#installBanner", "e => { const r = e.getBoundingClientRect(); return [r.left, r.right, innerWidth, document.documentElement.scrollWidth]; }")
    check(box[0] >= 0 and box[1] <= box[2] and box[3] <= box[2], "…fits the phone screen", box)
    check("True North Baptist Church" in p.inner_text(".auth-photo > .auth-foot"), "the sign-in page links back to the church site")
    p.click("#installBanner .ib-later")
    check(kind(p) == "", "“Not now” closes it")
    p.reload(); p.wait_for_selector("#authScreen .auth-card"); p.wait_for_timeout(400)
    check(kind(p) == "", "…and it stays away after reloading")
    snooze = p.evaluate("Number(localStorage.getItem('tnbbi-install-snooze')) - Date.now()")
    check(13 * 864e5 < snooze <= 14 * 864e5 + 5000, "…for two weeks", snooze)
    check(not p.errors, "no page errors", p.errors)
    ctx.close()

    print("iPhone, opened inside Facebook")
    ctx, p = page_for(br, IPHONE_FB)
    check(kind(p) == "ios-inapp", "says to open it in Safari first", kind(p))
    p.screenshot(path=os.path.join(SHOTS, "install-iphone-facebook.png"))
    ctx.close()

    print("iPhone, already on the Home Screen")
    ctx, p = page_for(br, IPHONE, standalone=True)
    check(kind(p) == "", "no banner inside the installed app", kind(p))
    ctx.close()

    print("Android, Chrome")
    ctx, p = page_for(br, ANDROID)
    check(kind(p) == "android-steps", "before Chrome's offer: shows the menu steps", kind(p))
    p.evaluate("window.__fireInstall('accepted')")
    p.wait_for_timeout(200)
    check(kind(p) == "android", "when Chrome's offer arrives: one “Add to my phone” button", kind(p))
    p.screenshot(path=os.path.join(SHOTS, "install-android.png"))
    p.click("#installBanner .ib-install")
    p.wait_for_timeout(300)
    check(p.evaluate("window.__prompted") == 1, "tapping it opens the phone's Install box")
    check(kind(p) == "", "…and the banner goes away once installed")
    check(not p.errors, "no page errors", p.errors)
    ctx.close()

    print("Android, Chrome's offer arrives before the site's scripts")
    ctx, p = page_for(br, ANDROID, early_bip="dismissed")
    check(kind(p) == "android", "the button is still offered", kind(p))
    p.click("#installBanner .ib-install")
    p.wait_for_timeout(300)
    check(p.evaluate("window.__prompted") == 1 and kind(p) == "", "declining in the Install box closes it (snoozed)")
    ctx.close()

    print("Computer")
    ctx, p = page_for(br, DESKTOP, mobile=False)
    check(kind(p) == "", "never shown on a computer", kind(p))
    ctx.close()

    print("iPhone, signed in")
    ctx, p = page_for(br, IPHONE)
    p.evaluate("localStorage.setItem('fake-google-email', 'truenorthbaptist1@gmail.com')")
    p.click("#googleSignInBtn")
    p.wait_for_selector("#main .dash-tiles, #main .dashboard, #main", timeout=15000)
    p.wait_for_function("() => document.getElementById('main').style.display !== 'none' && document.getElementById('main').innerText.length > 50", timeout=15000)
    p.wait_for_timeout(500)
    check(kind(p) == "ios", "the Dashboard offers it too", kind(p))
    p.screenshot(path=os.path.join(SHOTS, "install-iphone-dashboard.png"))
    p.evaluate("view = 'calendar'; renderView();")
    p.wait_for_timeout(300)
    check(kind(p) == "", "other pages don't show it")
    p.evaluate("view = 'home'; renderView();")
    p.wait_for_timeout(300)
    check(kind(p) == "ios", "back on the Dashboard it returns until answered")
    check(not p.errors, "no page errors", p.errors)
    ctx.close()
    br.close()

print(f"\n{passed}/{passed + failed} install-banner checks passed")
sys.exit(1 if failed else 0)
