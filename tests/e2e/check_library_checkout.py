#!/usr/bin/env python3
"""Church library checkout page (docs/library/) and the Admin "Checkouts" page.

    CHECK=check_library_checkout.py sh tests/e2e/run_check.sh

The barcode camera can't run headless, so scans are fed in directly
(window.__library.handleCode). Open Library / Google Books are faked.
"""
import json, os, re, subprocess, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8765")
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.environ.get("SHOTS", os.path.join(HERE, "screenshots"))
os.makedirs(SHOTS, exist_ok=True)
FAKE_SB = open(os.path.join(HERE, "fake-supabase.js")).read()
FAKE_PURIFY = open(os.path.join(HERE, "vendor", "purify.min.js")).read()
CONFIG = """window.TNBBI_CONFIG = { supabaseUrl: "http://localhost/fake", supabaseAnonKey: "test-key", testMode: true, bootstrapAdminEmail: "truenorthbaptist1@gmail.com" };"""
PSQL = ["psql", "-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-d", "t", "-At", "-q"]
PNG = open(os.path.join(HERE, "test-photo.png"), "rb").read()

passed = failed = 0
def check(ok, label, detail=""):
    global passed, failed
    if ok: passed += 1; print("  ✓", label)
    else: failed += 1; print("  ✗", label, detail)
def db(q):
    return subprocess.run(PSQL, input=q, capture_output=True, text=True).stdout.strip()

OL = {  # Open Library answers, by ISBN
    "9780830816507": {"docs": [{"title": "Knowing God", "author_name": ["J. I. Packer"]}]},
    "9780890511234": {"docs": [{"title": "A Pocket Guide to Charles Darwin: His Life and Impact", "author_name": ["Answers in Genesis"]}]},
}
def fake_ol(route):
    url = route.request.url
    m = re.search(r"isbn=(\d+)", url)
    if m:
        return route.fulfill(body=json.dumps(OL.get(m.group(1), {"docs": []})), content_type="application/json")
    if "title=" in url or "q=title" in url:
        return route.fulfill(body=json.dumps({"docs": [{"title": "Knowledge of the Holy", "author_name": ["A. W. Tozer"]}]}), content_type="application/json")
    route.fulfill(body='{"docs": []}', content_type="application/json")

def context(browser, mobile=True):
    ctx = browser.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 900},
                              is_mobile=mobile, has_touch=mobile, device_scale_factor=2)
    ctx.add_init_script("window.TNBBI_TEST_NO_TOUR = true;")
    ctx.route(re.compile(r".*supabase-js.*"), lambda r: r.fulfill(body=FAKE_SB, content_type="application/javascript"))
    ctx.route(re.compile(r".*dompurify.*"), lambda r: r.fulfill(body=FAKE_PURIFY, content_type="application/javascript"))
    ctx.route(re.compile(r".*jspdf.*"), lambda r: r.fulfill(body="window.jspdf={};", content_type="application/javascript"))
    ctx.route(re.compile(r".*fonts\.(googleapis|gstatic)\.com.*"), lambda r: r.abort())
    ctx.route(re.compile(r".*truenorthbaptist\.com/images/.*"), lambda r: r.fulfill(body=PNG, content_type="image/png"))
    ctx.route(re.compile(r".*openlibrary\.org.*"), fake_ol)
    ctx.route(re.compile(r".*googleapis\.com/books.*"), lambda r: r.fulfill(body='{"totalItems":0}', content_type="application/json"))
    ctx.route(re.compile(r".*/js/config\.js$"), lambda r: r.fulfill(body=CONFIG, content_type="application/javascript"))
    return ctx

def page(ctx, path="/library/"):
    p = ctx.new_page()
    p.errors = []
    p.on("pageerror", lambda e: p.errors.append(str(e)))
    p.on("dialog", lambda d: d.accept())
    p.goto(BASE + path)
    p.wait_for_selector("#checkoutCard, .lb-done", timeout=15000)
    return p

def no_sideways(p):
    return p.evaluate("document.documentElement.scrollWidth <= innerWidth")

with sync_playwright() as pw:
    br = pw.chromium.launch()
    ctx = context(br)

    print("First visit")
    p = page(ctx)
    check(p.is_visible("#meName") and p.is_visible("#meEmail"), "asks for name and email the first time")
    check(not p.is_visible("#myBooks"), "no My books yet")
    p.fill("#titleQ", "pocket guide darwin")
    p.wait_for_selector("#suggest [data-pick]")
    check("A Pocket Guide to Charles Darwin" in p.inner_text("#suggest"), "typing part of a title finds it on our shelves")
    p.click("#suggest [data-pick]")
    check("Taking home (1)" in p.inner_text("#checkoutCard"), "tapping it puts it in Taking home")
    p.fill("#titleQ", "knowledge of the ho")
    p.wait_for_selector("#suggest [data-typed]", timeout=5000)
    p.wait_for_timeout(800)
    check("Knowledge of the Holy" not in p.inner_text("#suggest") and not p.query_selector("#suggest [data-web]"),
          "typing only suggests books that are on the church's list")
    p.fill("#titleQ", "zzqx nothing like this")
    p.wait_for_function("document.querySelector('#suggest').innerText.includes('No books on our list match')", timeout=5000)
    check(True, "…and says so when nothing matches")
    p.fill("#titleQ", "")
    print("Scanning")
    p.evaluate("window.__library.handleCode('9780830816507')")
    p.wait_for_selector("#newBook")
    check(p.input_value("#nbTitle") == "Knowing God" and p.input_value("#nbAuthor") == "J. I. Packer", "a barcode not on our list fills in title and author")
    p.set_input_files("#nbPhoto", files=[{"name": "cover.png", "mimeType": "image/png", "buffer": PNG}])
    p.wait_for_selector("#newBook img")
    check(True, "a cover photo can be added")
    p.click("#nbAdd")
    check("Taking home (2)" in p.inner_text("#checkoutCard"), "…and it goes in the list")
    p.screenshot(path=os.path.join(SHOTS, "library-checkout.png"), full_page=True)
    check(no_sideways(p), "fits a phone with no sideways scrolling")
    p.fill("#meName", "Jane Doe")
    p.click("#goBtn")
    check("email" in p.inner_text("#checkoutCard").lower() and p.is_visible(".lb-msg-err"), "won't check out without an email")
    p.fill("#meEmail", "jane@example.com")
    p.click("#goBtn")
    p.wait_for_selector(".lb-done", timeout=10000)
    t = p.inner_text(".lb-done")
    check("All set, Jane!" in t and "due back" in t and "jane@example.com" in t, "done: shows the due date and where the reminder goes")
    p.screenshot(path=os.path.join(SHOTS, "library-done.png"))
    check(db("select count(*) from library_loans l join library_borrowers b on b.id = l.borrower_id where b.email = 'jane@example.com' and returned_at is null") == "2", "two checkouts recorded")
    check(db("select photo_path like 'new/%.jpg' from library_books where title = 'Knowing God'") == "t", "the cover photo was saved with the new book")
    check(db("select '9780830816507' = any(isbns) from library_books where title = 'Knowing God'") == "t", "…and its barcode")

    print("Coming back")
    p.click("#doneBtn")
    p.reload(); p.wait_for_selector("#myBooks")
    check(not p.is_visible("#meName") and "Jane Doe" in p.inner_text("#checkoutCard"), "the phone remembers who they are")
    check(p.inner_text("#myBooks").count("Due ") == 2, "My books lists both, with due dates")
    p.click("[data-renew]")
    p.wait_for_selector(".lb-msg-ok")
    check("now due" in p.inner_text(".lb-msg-ok"), "+2 weeks renews a book")
    p.click("[data-return]")
    p.wait_for_function("document.querySelectorAll('[data-return]').length === 1")
    check("checked back in" in p.inner_text(".lb-msg-ok"), "Returned checks a book back in")
    p.evaluate("window.__library.handleCode('9780830816507')")
    p.wait_for_function("document.querySelector('#bagList') && document.querySelector('#bagList').innerText.includes('Knowing God')")
    check(not p.is_visible("#newBook"), "scanning that barcode again finds the book straight away")
    p.click("[data-unbag='0']")
    p.evaluate("window.__library.handleCode('9780890511234')")
    p.wait_for_function("document.querySelector('#bagList') && document.querySelector('#bagList').innerText.includes('Charles Darwin')")
    check(not p.is_visible("#newBook"), "a barcode whose online title matches a book on our list is matched (and learned)")
    check(db("select '9780890511234' = any(isbns) from library_books where title = 'A Pocket Guide to Charles Darwin'") == "f", "…learned only once it's actually checked out")
    check(not p.errors, "no page errors", p.errors)

    print("Renew link from the email")
    key = db("select l.renew_token from library_loans l join library_books b on b.id = l.book_id where b.title = 'Knowing God' and returned_at is null")
    if not key:
        key = db("select renew_token from library_loans where returned_at is null order by id desc limit 1")
    p2 = page(ctx, "/library/?renew=" + key)
    t = p2.inner_text(".lb-done")
    check("Two more weeks" in t or "Time to bring it back" in t or "Already returned" in t, "the email link renews (or explains why not)", t)
    check("renew=" not in p2.url, "…and the key is taken out of the address bar")
    p2.screenshot(path=os.path.join(SHOTS, "library-renewed.png"))

    print("Not you?")
    p3 = page(ctx)
    p3.click("#notMe")
    check(p3.is_visible("#meName") and p3.input_value("#meName") == "" and not p3.is_visible("#myBooks"), "“Not you?” lets someone else use the phone")
    check(not p3.errors, "no page errors", p3.errors)
    ctx.close()

    print("Admin: Library → Checkouts")
    actx = context(br, mobile=False)
    actx.add_init_script("localStorage.setItem('fake-google-email', 'truenorthbaptist1@gmail.com'); window.TNBBI_AUTO_CONFIRM = 'yes';")
    a = actx.new_page(); a.errors = []
    a.on("pageerror", lambda e: a.errors.append(str(e)))
    a.goto(BASE + "/")
    a.wait_for_selector("#googleSignInBtn")
    a.click("#googleSignInBtn")
    a.wait_for_function("document.getElementById('main').style.display !== 'none' && document.getElementById('main').innerText.length > 50", timeout=20000)
    a.evaluate("view = 'resourceLibrary'; renderNav(); renderMain();")
    a.wait_for_selector("#libCheckoutsBtn")
    check(True, "Admins see a Checkouts button on the Resource Library")
    a.click("#libCheckoutsBtn")
    a.wait_for_selector("#libTabBody")
    body = a.inner_text("main")
    check("Jane Doe" in body and "jane@example.com" in body, "Checked out shows who has which book", body[:300])
    a.screenshot(path=os.path.join(SHOTS, "library-admin.png"), full_page=True)
    n_out = a.evaluate("libAdmin.out.length")
    a.click("[data-lib-return]")
    a.wait_for_function(f"libAdmin.out.length === {n_out - 1}")
    check(True, "Returned checks a book in")
    a.click("[data-libtab='new']")
    check("Knowing God" in a.inner_text("#libTabBody"), "New books to look over lists the borrower-added book")
    a.click("[data-lib-edit]")
    a.fill("#lbSubject", "Doctrine")
    a.click("#lbSave")
    a.wait_for_function("!document.querySelector('#lbSave')")
    check(db("select reviewed || '/' || subject from library_books where title = 'Knowing God'") == "true/Doctrine", "Check & save puts it on the list")
    a.click("[data-libtab='books']")
    a.fill("#libQ", "pocket guide")
    a.wait_for_selector("[data-lib-editfound]")
    check("A Pocket Guide to Charles Darwin" in a.inner_text("#libTabBody"), "the whole list can be searched")
    check(not a.errors, "no page errors", a.errors)
    actx.close()

    print("Students don't see it")
    sctx = context(br, mobile=False)
    sp = sctx.new_page()
    sp.goto(BASE + "/")
    sp.wait_for_selector("#authScreen .auth-card")
    check(sp.evaluate("typeof renderLibraryCheckouts") == "function" and not sp.query_selector("#libCheckoutsBtn"), "signed-out visitors get no Checkouts button")
    sctx.close()
    br.close()

print(f"\n{passed}/{passed + failed} library checkout checks passed")
sys.exit(1 if failed else 0)
