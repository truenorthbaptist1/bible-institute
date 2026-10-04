#!/usr/bin/env python3
"""End-to-end test: drives the real site in headless Chromium, as several
different people at once, against the real database schema and privacy
rules (via tests/e2e/server.py). Walks a compressed semester:

  church Google account → founding Super Admin
  students sign up → faculty enroll them, add materials + assignments
  student requests a future course → faculty approve / deny with a note
  student turns in work (editor + file) → faculty grade → student sees it
  private messages both ways, discussion board, Study Bible highlights
  calendar, grade sheet, Settings (role change, deactivate), archive/delete
  phone-sized screens for layout

Any uncaught JavaScript error on any page fails the run.
"""
import json, os, re, sys, time, datetime
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8765")
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.environ.get("SHOTS", os.path.join(HERE, "screenshots"))
os.makedirs(SHOTS, exist_ok=True)
FAKE_SB = open(os.path.join(HERE, "fake-supabase.js")).read()

FAKE_PURIFY = """
window.DOMPurify = { sanitize(html, cfg) {
  const allowed = new Set((cfg && cfg.ALLOWED_TAGS) || []);
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const walk = (node) => { [...node.childNodes].forEach((ch) => {
    if (ch.nodeType === 1) {
      if (!allowed.has(ch.tagName.toLowerCase())) { if (['SCRIPT','STYLE','IFRAME'].includes(ch.tagName)) ch.remove(); else { walk(ch); ch.replaceWith(...ch.childNodes); } return; }
      [...ch.attributes].forEach((a) => ch.removeAttribute(a.name)); walk(ch);
    } }); };
  const root = doc.body.firstChild; walk(root); return root.innerHTML; } };
"""
FAKE_JSPDF = """
window.jspdf = { jsPDF: function () { return {
  internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } },
  setFont(){}, setFontSize(){}, setTextColor(){}, text(){}, setDrawColor(){}, line(){}, addPage(){},
  getTextWidth: (t) => t.length * 5, splitTextToSize: (t) => [t],
  save(name) { window.__pdfSaved = name; } }; } };
"""
CONFIG = """window.TNBBI_CONFIG = { supabaseUrl: "http://localhost/fake", supabaseAnonKey: "test-key", testMode: true, bootstrapAdminEmail: "truenorthbaptist1@gmail.com" };"""

JOHN3 = {"verses": [{"verse": n, "text": f"Verse {n} of the chapter.\n"} for n in range(1, 16)] + [
    {"verse": 16, "text": "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.\n"},
    {"verse": 17, "text": "For God sent not his Son into the world to condemn the world; but that the world through him might be saved.\n"},
]}

failures, errors = [], []
TODAY = datetime.date.today()
def d(days): return (TODAY + datetime.timedelta(days=days)).isoformat()

def check(cond, what):
    print(("  ✓ " if cond else "  ✗ ") + what, flush=True)
    if not cond:
        failures.append(what)

def new_page(browser, name, google_email=None, mobile=False):
    ctx = browser.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 900},
                              device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    if google_email:
        ctx.add_init_script(f"localStorage.setItem('fake-google-email', {json.dumps(google_email)});")
    ctx.route(re.compile(r".*supabase-js.*"), lambda r: r.fulfill(body=FAKE_SB, content_type="application/javascript"))
    ctx.route(re.compile(r".*dompurify.*"), lambda r: r.fulfill(body=FAKE_PURIFY, content_type="application/javascript"))
    ctx.route(re.compile(r".*jspdf.*"), lambda r: r.fulfill(body=FAKE_JSPDF, content_type="application/javascript"))
    ctx.route(re.compile(r".*fonts\.(googleapis|gstatic)\.com.*"), lambda r: r.abort())
    ctx.route(re.compile(r".*/js/config\.js$"), lambda r: r.fulfill(body=CONFIG, content_type="application/javascript"))
    ctx.route(re.compile(r"https://bible-api\.com/.*"), lambda r: r.fulfill(body=json.dumps(JOHN3), content_type="application/json"))
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"[{name}] {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and "ERR_FAILED" not in m.text and errors.append(f"[{name}] console: {m.text}"))
    page.on("dialog", lambda dlg: dlg.accept())
    page.goto(BASE + "/")
    return page

def settle(page):
    page.wait_for_timeout(150)
    page.wait_for_function("!document.body.classList.contains('is-busy')", timeout=15000)
    page.wait_for_timeout(100)

def nav(page, label):
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

# A Super Admin approves a waiting sign-up; the person then gets in.
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

    print("1. Church Google account becomes the founding Super Admin")
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
    check("★ super admin" in admin.inner_text("#accountPills").lower(), "shows the ★ Super Admin badge")
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
    check("Hermeneutics Syllabus.pdf" in admin.inner_text("#mgMaterialsList"), "syllabus uploaded to course materials")
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
    check("Hermeneutics Syllabus.pdf" in body(blake), "Blake sees the uploaded syllabus")
    blake.locator("[data-open-material]").first.click()
    blake.wait_for_selector(".doc-viewer")
    blake.wait_for_selector(".doc-pages, .doc-frame", timeout=15000)
    check(blake.locator("#matPdf", has_text="Download PDF").count() == 1, "a course PDF opens full-screen in the page, with Download PDF")
    blake.screenshot(path=f"{SHOTS}/05b-document-reader.png")
    blake.click("#matClose")
    check(blake.locator(".doc-viewer").count() == 0, "closing the reader returns to the course")
    blake.locator("li", has_text="Reading Reflection").locator("button").click()
    blake.wait_for_selector("input[name=submitMethod][value=editor]")
    blake.check("input[name=submitMethod][value=editor]")
    blake.click("#submitEditor"); blake.keyboard.type("Ezra read distinctly and gave the sense.")
    blake.evaluate("document.getElementById('submitEditor').innerHTML += '<img src=x onerror=\"window.__xss=1\"><script>window.__xss=2</script>'")
    blake.click("#submitTurnIn"); settle(blake)
    check("submitted" in blake.inner_text("#main").lower(), "written work turned in → Submitted")
    # locked quiz
    blake.locator("li", has_text="Weekly Quiz — Week 1").locator("button").click()
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
    check("Users & Roles" in body(admin), "Back returns to Settings")
    blake.reload(); blake.wait_for_selector("#main .page-header"); settle(blake)
    blake.click("#myProfileBtn"); settle(blake)
    check(blake.input_value("#pfCity") == "Moose Creek", "Blake sees the change faculty made")
    blake.click("#removePhotoBtn"); settle(blake)
    check(blake.locator("#myProfileBtn img").count() == 0 and blake.locator("#myProfileBtn .avatar-initials").count() == 1, "removing the photo falls back to initials")
    nav(admin, "Dashboard"); tile(admin, "My Profile")
    check("Your Profile" in body(admin), "faculty have a My Profile tile too")

    print("11. Study Bible: read, Strong's, highlight")
    nav(blake, "Study Bible")
    blake.wait_for_selector(".verse-row")
    check("John 3" in blake.inner_text("#sbReading"), "opens John 3 by default")
    blake.locator("#verse-16 .sw").first.click(); blake.wait_for_selector(".strongs-code")
    check("G" in blake.inner_text(".strongs-code"), "Strong's entry opens from a tagged word")
    blake.click("#strongsClose")
    blake.locator("#verse-16 [data-hl]").click(); settle(blake)
    blake.wait_for_selector("#verse-16.verse-highlighted")
    blake.click("#sbToggleHighlights"); blake.wait_for_timeout(300)
    check("John 3:16" in blake.inner_text("#sbReading"), "My Highlights lists John 3:16")
    blake.screenshot(path=f"{SHOTS}/07-study-bible.png", full_page=True)
    amber_hl = amber.evaluate("bibleHighlightRows.length")
    check(amber_hl == 0, "highlights are private to each person")
    blake.select_option("#sbBook", "GEN"); blake.wait_for_selector(".verse-row")
    check("Genesis 1" in blake.inner_text("#sbReading"), "switching books loads another chapter")

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
    check(blake.locator(".cal-class").count() == 0, "students' calendars don't show class markers")
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

    print("13. Settings: promote, deactivate, Super Admins")
    nav(admin, "Dashboard"); tile(admin, "Settings")
    check("Super Admins" in body(admin), "Super Admin card visible to the Super Admin")
    admin.locator(".user-row", has_text="Amber Amis").locator("[data-inactive]").click(); settle(admin)
    amber.reload(); amber.wait_for_selector(".auth-error", timeout=15000)
    check("inactive" in amber.inner_text(".auth-error"), "deactivated student is signed out with an explanation")
    admin.click("#userTabs button[data-tab=inactive]")
    admin.locator(".user-row", has_text="Amber Amis").locator("[data-reactivate]").click(); settle(admin)
    admin.click("#userTabs button[data-tab=active]")
    admin.locator(".user-row", has_text="Blake Amis").locator("button[data-role=faculty]").click(); settle(admin)
    blake.reload(); blake.wait_for_selector("#main .page-header"); settle(blake)
    check("Welcome Professor" in body(blake), "promoted user gets the Faculty dashboard")
    tile(blake, "Settings")
    check(blake.locator("#superAdminWrap").count() == 0, "a plain faculty member does not see the Super Admin card")
    admin.locator(".user-row", has_text="Blake Amis").locator("button[data-role=student]").click(); settle(admin)

    print("13b. Course teachers: who sees what, hand-offs, and reassignment")
    ruth = new_page(browser, "ruth")
    ruth.wait_for_selector("#signinForm")
    signup(ruth, "Ruth Faculty", "ruth@example.com")
    nav(admin, "Dashboard"); tile(admin, "Settings")
    admin.locator(".user-row", has_text="Ruth Faculty").locator("button[data-role=faculty]").click(); settle(admin)
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
    check("Only this course's teacher or a Super Admin can change it" in ruth.inner_text(".modal"), "opening someone else's course shows a read-only summary")
    check(ruth.locator(".tile", has_text="Hermeneutics I").locator("[data-archive-toggle]").count() == 0, "…with no Archive button")
    ruth.keyboard.press("Escape")
    ruth.click("#catAddCourse"); ruth.wait_for_selector("#cbName")
    check("You'll be this course's teacher" in ruth.inner_text(".modal"), "the Add Course form says you'll be the teacher")
    ruth.fill("#cbName", "Pastoral Epistles"); ruth.click("#cbSave"); settle(ruth)
    check(ruth.locator(".tile", has_text="Pastoral Epistles").locator(".pill", has_text="You teach this").count() == 1, "the new course is assigned to its creator")
    ruth.locator(".tile h3", has_text="Pastoral Epistles").click(); settle(ruth)
    check(ruth.locator("#mgTeacher").count() == 1, "before it starts, the teacher can hand the course to someone else")
    ruth.screenshot(path=f"{SHOTS}/13b-teacher-card-handoff.png", full_page=False)
    # The Super Admin reassigns a course that's already under way.
    nav(admin, "Dashboard"); tile(admin, "Courses")
    admin.locator(".tile h3", has_text="Hermeneutics I").click(); settle(admin)
    check("No teacher yet" in admin.inner_text("#mgTeacherCard"), "an unassigned course says the Super Admins are covering it")
    admin.select_option("#mgTeacher", label="Ruth Faculty"); admin.click("#mgSaveTeacher"); settle(admin)
    check("Ruth Faculty" in admin.inner_text("#mgTeacherCard"), "a Super Admin reassigns a course that has already started")
    check("visible only to its teacher" in admin.inner_text("#mgAssignmentsList") and admin.locator("[data-view-roster]").count() == 0,
          "the Super Admin can still manage it, but no longer sees its turned-in work")
    admin.screenshot(path=f"{SHOTS}/13c-super-admin-reassigned.png", full_page=False)
    nav(admin, "Dashboard"); tile(admin, "Grading")
    check("Hermeneutics I" not in admin.inner_text("#main"), "…or its grades")
    ruth.reload(); ruth.wait_for_selector("#main .page-header"); settle(ruth)
    check(ruth.locator(".notif-badge").count() == 1, "the new teacher gets a notification")
    tile(ruth, "Grading")
    ruth.locator("[data-sheet]", has_text="Hermeneutics I").first.click(); settle(ruth)
    check("Blake Amis" in body(ruth) and "18/20" in body(ruth), "the substitute sees the full grade book")
    nav(ruth, "Dashboard"); tile(ruth, "Message Inbox")
    check("Blake Amis" in body(ruth), "…and the students' message history")
    nav(ruth, "Dashboard"); tile(ruth, "Courses")
    ruth.locator(".tile h3", has_text="Hermeneutics I").click(); settle(ruth)
    check(ruth.locator("#mgTeacher").count() == 0 and "only a Super Admin can change its teacher" in ruth.inner_text("#mgTeacherCard"),
          "once a course has started, its teacher can't hand it off")
    ruth.screenshot(path=f"{SHOTS}/13d-teacher-card-locked.png", full_page=False)
    nav(blake, "Dashboard"); tile(blake, "Send Message")
    check("Ruth Faculty" in body(blake), "students' messages now go to the new teacher")
    check("student" in blake.inner_text("#accountPills").lower() and "faculty" not in blake.inner_text("#accountPills").lower(),
          "a role changed while someone has the site open is picked up on their next page change")
    ruth.context.close()

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
    check(len(admin.evaluate("Object.keys(window.TNBBI_VERSIONS || {})")) == 6, "every site file was version-checked on load")
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
