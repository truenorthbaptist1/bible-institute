"""Shared machinery for the simulated semester (tests/semester).

The whole site runs privately: the real website (docs/) in headless Chromium,
the real database rules in a scratch Postgres ("t"), the real background
service (attendance-reminders) via tick.mjs, a fake Gmail, a fake YouTube.

A simulated clock moves everything together:
  - the database: Postgres runs under libfaketime, reading its offset from
    /tmp/simclock (see run_semester.sh);
  - the background service: each tick is told the simulated time;
  - the browsers: each session opens with Playwright's clock set to it.
Times below are Alaska time unless they say UTC.
"""
import datetime as dt, json, os, re, subprocess, sys, time, uuid
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
E2E = os.path.join(HERE, "..", "e2e")
SIM = os.environ.get("SIM", "/tmp/sim")
os.makedirs(SIM, exist_ok=True)
SHOTS = os.path.join(SIM, "shots")
os.makedirs(SHOTS, exist_ok=True)
AK = ZoneInfo("America/Anchorage")
BASE = os.environ.get("BASE", "http://localhost:8765")

FAKE_SB = open(os.path.join(E2E, "fake-supabase.js")).read()
FAKE_PURIFY = open(os.path.join(E2E, "vendor", "purify.min.js")).read()
REAL_JSPDF = open(os.path.join(E2E, "vendor", "jspdf.umd.min.js")).read()
CONFIG = ('window.TNBBI_CONFIG = { supabaseUrl: "http://localhost/fake", supabaseAnonKey: "test-key", testMode: true, '
          'bootstrapAdminEmail: "truenorthbaptist1@gmail.com" };')
FAKE_YT = open(os.path.join(HERE, "fake_yt.js")).read()

# ---------------------------------------------------------------- results
FINDINGS = []      # (when, area, what, detail)
CHECKS = {"pass": 0, "fail": 0}
JS_ERRORS = []
NOW = [None]       # the simulated moment (aware datetime)


def log(msg):
    print(f"[{NOW[0].strftime('%a %b %d %H:%M') if NOW[0] else '--'}] {msg}", flush=True)


OBSERVED = []   # facts worth a human look (not pass/fail)


def observe(area, what, value):
    OBSERVED.append((NOW[0].isoformat() if NOW[0] else "", area, what, value))
    log(f"• {area}: {what} → {str(value)[:300]}")


def check(cond, area, what, detail=""):
    if cond:
        CHECKS["pass"] += 1
    else:
        CHECKS["fail"] += 1
        FINDINGS.append((NOW[0].isoformat() if NOW[0] else "", area, what, str(detail)[:600]))
        log(f"✗ {area}: {what} — {str(detail)[:300]}")
    return cond


# ---------------------------------------------------------------- clock
def set_clock(when):
    """when: aware datetime (or naive = Alaska)."""
    if when.tzinfo is None:
        when = when.replace(tzinfo=AK)
    NOW[0] = when
    real = dt.datetime.now(dt.timezone.utc)
    off = int((when - real).total_seconds())
    with open("/tmp/simclock", "w") as f:
        f.write(f"{off:+d}")


def ak(y, m, d, h=0, mi=0):
    return dt.datetime(y, m, d, h, mi, tzinfo=AK)


# ---------------------------------------------------------------- database
PSQL = ["psql", "-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-d", "t", "-At", "-v", "ON_ERROR_STOP=1", "-q"]


def q(sql, as_user=None):
    pre = ""
    if as_user:
        pre = f"set role authenticated; select set_config('request.jwt.claim.sub', '{as_user}', false) \\g /dev/null\n"
    p = subprocess.run(PSQL, input=pre + sql, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip())
    return p.stdout.strip()


def qj(sql, as_user=None):
    out = q(f"select coalesce(json_agg(t), '[]') from ({sql}) t", as_user)
    return json.loads(out or "[]")


# ---------------------------------------------------------------- service
def tick(*whens):
    """Run the every-minute background service at each simulated moment."""
    outs = []
    for w in whens:
        set_clock(w)
        p = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", os.path.join(HERE, "tick.mjs"),
                            w.astimezone(dt.timezone.utc).isoformat()], capture_output=True, text=True,
                           env=dict(os.environ, SIM=SIM, TESTDB="t"))
        if p.returncode != 0:
            check(False, "background service", "a run of the every-minute service crashed", p.stderr[-500:])
            continue
        warn = [l for l in p.stderr.splitlines() if l.strip()]
        for wline in warn:
            check(False, "background service", "the every-minute service reported a problem", wline)
        for line in p.stdout.splitlines():
            if line.startswith("{"):
                outs.append(json.loads(line))
    return outs


# ---------------------------------------------------------------- fake YouTube
def yt_load():
    try:
        return json.load(open(os.path.join(SIM, "youtube.json")))
    except FileNotFoundError:
        return {"playlists": {}}


def yt_add(playlist, video):
    db = yt_load()
    db["playlists"].setdefault(playlist, []).append(video)
    json.dump(db, open(os.path.join(SIM, "youtube.json"), "w"), indent=1)


# ---------------------------------------------------------------- mail
MAILDIR = os.path.join(SIM, "mail")


def mails():
    out = []
    if not os.path.isdir(MAILDIR):
        return out
    import email
    from email import policy
    files = sorted(os.path.relpath(os.path.join(dp, f), MAILDIR) for dp, _, fs in os.walk(MAILDIR) for f in fs if f.endswith(".eml"))
    for f in files:
        raw = open(os.path.join(MAILDIR, f), "rb").read()
        m = email.message_from_bytes(raw, policy=policy.default)
        to = (re.search(rb"^X-Envelope-To: (.*)$", raw, re.M) or [b"", b""])[1].decode().strip()
        body = ""
        part = m.get_body(preferencelist=("plain", "html"))
        if part:
            body = part.get_content()
        to = (to or str(m["To"])).strip("<> ")
        out.append({"file": f, "to": to, "subject": str(m["Subject"]), "body": body})
    return out


# ---------------------------------------------------------------- browsers
class Browsers:
    def __init__(self):
        self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch()
        self.open = []

    def close_all(self):
        for ctx in self.open:
            try:
                ctx.close()
            except Exception:
                pass
        self.open = []

    def session(self, who, mobile=False, sign_in=True):
        """Opens the site as `who` (a Person) at the simulated time, signed in."""
        ctx = self.browser.new_context(
            viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 900},
            is_mobile=mobile, has_touch=mobile, timezone_id=getattr(who, "tz", "America/Anchorage"), accept_downloads=True)
        self.open.append(ctx)
        ctx.clock.install(time=NOW[0].astimezone(dt.timezone.utc).timestamp())
        ctx.add_init_script("window.TNBBI_TEST_NO_TOUR = true; window.TNBBI_TEST_LIVE_BEAT = 3000;")
        if who.google:
            ctx.add_init_script(f"localStorage.setItem('fake-google-email', {json.dumps(who.email)});")
        ctx.route(re.compile(r"https://(cdn\.jsdelivr|unpkg|cdnjs).*"), lambda r: r.abort())  # first = lowest priority
        ctx.route(re.compile(r".*supabase-js.*"), lambda r: r.fulfill(body=FAKE_SB, content_type="application/javascript"))
        ctx.route(re.compile(r".*dompurify.*"), lambda r: r.fulfill(body=FAKE_PURIFY, content_type="application/javascript"))
        ctx.route(re.compile(r".*jspdf.*"), lambda r: r.fulfill(body=REAL_JSPDF, content_type="application/javascript"))
        ctx.route(re.compile(r".*fonts\.(googleapis|gstatic)\.com.*"), lambda r: r.abort())
        ctx.route(re.compile(r".*youtube\.com/iframe_api.*"), lambda r: r.fulfill(body=FAKE_YT, content_type="application/javascript"))
        ctx.route(re.compile(r".*(ytimg|youtube|youtube-nocookie)\.com.*"), lambda r: r.abort())
        ctx.route(re.compile(r".*/js/config\.js$"), lambda r: r.fulfill(body=CONFIG, content_type="application/javascript"))
        page = ctx.new_page()
        tag = who.name
        page.on("pageerror", lambda e: self._err(tag, page, str(e)))
        page.on("console", lambda m: m.type == "error" and not re.search(r"Failed to load resource|ERR_FAILED|net::", m.text)
                and self._err(tag, page, "console: " + m.text))
        page.on("dialog", lambda d: d.accept())
        page.goto(BASE + "/")
        if not sign_in:
            page.wait_for_selector("#siEmail, #googleSignInBtn", timeout=20000)
            return page
        if who.google:
            page.wait_for_selector("#googleSignInBtn", timeout=20000)
            page.click("#googleSignInBtn")
        else:
            page.wait_for_selector("#siEmail", timeout=20000)
            page.fill("#siEmail", who.email)
            page.fill("#siPassword", who.password)
            page.click("#siSubmit")
        page.wait_for_selector("#main .page-header, #pendingCheck", timeout=20000)
        settle(page)
        return page

    def _err(self, who, page, text):
        where = ""
        try:
            where = page.evaluate("view + (activeCourseId ? ' / ' + activeCourseId : '')")
        except Exception:
            pass
        JS_ERRORS.append((NOW[0].isoformat(), who, where, text))
        check(False, "page error", f"{who} hit a JavaScript error on '{where}'", text)


def settle(page):
    page.wait_for_timeout(120)
    try:
        page.wait_for_function("!document.body.classList.contains('is-busy')", timeout=20000)
    except Exception:
        pass
    page.wait_for_timeout(80)


def go(page, view, course=None):
    """Opens a page of the site the way its own links do."""
    page.evaluate("([v, c]) => { view = v; activeCourseId = c; renderNav(); renderMain(); }", [view, course])
    settle(page)


def confirm(page, yes=True):
    """Answers the site's own "Are you sure?" box, if it opens."""
    try:
        page.wait_for_selector("#confirmYes", timeout=1500)
        page.click("#confirmYes" if yes else "#confirmNo")
        settle(page)
        return True
    except Exception:
        return False


def toast_text(page):
    try:
        return page.locator(".toast").last.inner_text(timeout=500)
    except Exception:
        return ""


def shot(page, name):
    path = os.path.join(SHOTS, f"{NOW[0].strftime('%m%d-%H%M')}-{name}.png")
    try:
        page.screenshot(path=path, full_page=True)
    except Exception:
        pass
    return path


def reveal_tab(page, tab):
    b = page.locator(f'.course-tab[data-tab="{tab}"]')
    if b.count():
        b.first.click()
        settle(page)


class Person:
    def __init__(self, name, email, google=False, password="Faithful-2027", tz="America/Anchorage"):
        self.name, self.email, self.google, self.password, self.tz = name, email, google, password, tz
        self.id = None

    def load_id(self):
        self.id = q(f"select id from public.profiles where lower(email) = lower('{self.email}')")
        return self.id


# ---------------------------------------------------------------- snapshots (for re-running one phase)
def snapshot(name):
    import shutil
    subprocess.run(["psql", "-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-q", "-c", f"drop database if exists snap_{name}",
                    "-c", f"create database snap_{name} template t"], check=True, capture_output=True)
    dst = SIM + f".snap_{name}"
    shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(SIM, dst, ignore=shutil.ignore_patterns("shots"))


def restore(name):
    import shutil
    subprocess.run(["psql", "-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-q", "-c", "drop database if exists t",
                    "-c", f"create database t template snap_{name}"], check=True, capture_output=True)
    for f in ("mail", "youtube.json"):
        src = os.path.join(SIM + f".snap_{name}", f)
        dst = os.path.join(SIM, f)
        if os.path.isdir(src):
            # keep this run's own mail folder; bring back the saved mail beside it
            shutil.copytree(src, dst, dirs_exist_ok=True)
        elif os.path.exists(src):
            shutil.copy(src, dst)
