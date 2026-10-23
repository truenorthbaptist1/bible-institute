"""Shared helpers for the Oct 23, 2026 review tests (browser side).

Drives the real site (docs/) in headless Chromium against the scratch
database "t", through the repo's own test server (tests/e2e/server.py) and
fake Supabase client — so the real privacy rules decide what each person
sees. People are created straight in the database and sign in through the
fake "Continue with Google" button.

Optional switch (copies a hosting limit): REVIEW_MAX_ROWS=1000 makes the
test server cut every list a database function returns at that many rows,
the way Supabase's API does (its "max rows" setting, 1,000 by default).
Off by default.
"""
import json, os, re, subprocess, sys, time, uuid
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
E2E = os.path.join(HERE, "..", "e2e")
PORT = int(os.environ.get("REVIEW_PORT", "8766"))
BASE = f"http://localhost:{PORT}"
FAKE_SB = open(os.path.join(E2E, "fake-supabase.js")).read()
FAKE_PURIFY = open(os.path.join(E2E, "vendor", "purify.min.js")).read()
FAKE_JSPDF = "window.jspdf = { jsPDF: function () { return { save(){} }; } };"
CONFIG = ('window.TNBBI_CONFIG = { supabaseUrl: "http://localhost/fake", supabaseAnonKey: "test-key", testMode: true, '
          'bootstrapAdminEmail: "truenorthbaptist1@gmail.com" };')


def psql(q):
    p = subprocess.run(["psql", "-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-d", "t", "-At",
                        "-v", "ON_ERROR_STOP=1", "-q"], input=q, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr)
    return p.stdout.strip()


def mkperson(name, email, role="student", super_admin=False, google=True):
    uid = str(uuid.uuid4())
    psql(f"insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values "
         f"('{uid}', '{email}', '{json.dumps({'full_name': name})}', now());"
         + (f"insert into auth.identities (user_id, provider) values ('{uid}', 'google');" if google else "")
         + f"update public.profiles set status = 'active', role = '{role}', super_admin = {str(super_admin).lower()} "
           f"where id = '{uid}';")
    return uid


def start_server():
    env = dict(os.environ)
    srv = subprocess.Popen([sys.executable, os.path.join(HERE, "review_server.py"), str(PORT)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    for _ in range(50):
        try:
            import urllib.request
            urllib.request.urlopen(BASE + "/", timeout=1)
            return srv
        except Exception:
            time.sleep(0.1)
    raise RuntimeError("test server didn't start")


def open_as(browser, email, timezone="America/Anchorage"):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, timezone_id=timezone)
    ctx.add_init_script("window.TNBBI_TEST_NO_TOUR = true;")
    ctx.add_init_script(f"localStorage.setItem('fake-google-email', {json.dumps(email)});")
    ctx.route(re.compile(r".*supabase-js.*"), lambda r: r.fulfill(body=FAKE_SB, content_type="application/javascript"))
    ctx.route(re.compile(r".*dompurify.*"), lambda r: r.fulfill(body=FAKE_PURIFY, content_type="application/javascript"))
    ctx.route(re.compile(r".*jspdf.*"), lambda r: r.fulfill(body=FAKE_JSPDF, content_type="application/javascript"))
    ctx.route(re.compile(r".*fonts\.(googleapis|gstatic)\.com.*"), lambda r: r.abort())
    ctx.route(re.compile(r".*youtube\.com.*"), lambda r: r.abort())
    ctx.route(re.compile(r".*/js/config\.js$"), lambda r: r.fulfill(body=CONFIG, content_type="application/javascript"))
    page = ctx.new_page()
    page.on("dialog", lambda dlg: dlg.accept())
    page.goto(BASE + "/")
    page.wait_for_selector("#googleSignInBtn", timeout=20000)
    page.click("#googleSignInBtn")
    page.wait_for_selector("#main .page-header", timeout=20000)
    settle(page)
    return page


def settle(page):
    page.wait_for_timeout(150)
    page.wait_for_function("!document.body.classList.contains('is-busy')", timeout=15000)
    page.wait_for_timeout(100)


def report(name, passed, got, want):
    print(("PASS " if passed else "FAIL ") + name, flush=True)
    if not passed:
        print(f"     got:      {got}", flush=True)
        print(f"     expected: {want}", flush=True)
    return passed
