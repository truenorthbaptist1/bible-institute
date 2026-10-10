// ============================================================================
// Features added Oct 4, 2026:
//   • Text size (A A) switch            • First-time guided tour (Help: js/help.js)
//   • Notifications by phone and email • Class cancellations
//   • Course announcements             • Class location / online link
//   • Copy a course for a new term     • Transcripts (with PDF)
//   • Backups (Settings, Admins)
//
// Loaded just before app.js. Everything here is called by app.js at run
// time (never while this file loads), so it can use app.js's helpers.
// ============================================================================

// ---------------------------------------------------------------------------
// Text size — three steps, kept on this device.
// ---------------------------------------------------------------------------
const TEXT_SIZES = [
  { key: "normal", label: "Normal text", pct: 100 },
  { key: "large", label: "Large text", pct: 112.5 },
  { key: "larger", label: "Larger text", pct: 125 },
];
function currentTextSize() {
  try { return localStorage.getItem("tnbbi-text") || "normal"; } catch (e) { return "normal"; }
}
function applyTextSize(key) {
  const t = TEXT_SIZES.find((x) => x.key === key) || TEXT_SIZES[0];
  document.documentElement.style.fontSize = t.pct === 100 ? "" : t.pct + "%";
  document.documentElement.dataset.textSize = t.key;
}
function cycleTextSize() {
  const i = TEXT_SIZES.findIndex((x) => x.key === currentTextSize());
  const next = TEXT_SIZES[(i + 1) % TEXT_SIZES.length];
  try { localStorage.setItem("tnbbi-text", next.key); } catch (e) { /* private browsing */ }
  applyTextSize(next.key);
  toast(next.label, "success");
}
function textSizeToggleHtml() {
  const t = TEXT_SIZES.find((x) => x.key === currentTextSize()) || TEXT_SIZES[0];
  return `<button id="textSizeToggle" class="icon-btn" aria-label="Text size: ${t.label}. Tap to change." title="Text size">${icon("textsize")}</button>`;
}
applyTextSize(currentTextSize());

// ---------------------------------------------------------------------------
// Links inside the site (from notifications, emails, phone calendars).
//   /?course=<id>            the course (Manage page for staff)
//   /?thread=<course>[&student=<id>]   a private message conversation
//   /?assignment=<id>        an assignment (handled in app.js)
//   /?calendar=<date>        the calendar on that day (app.js)
//   /?settings=approvals     Settings → Waiting for Approval
//   /?transcript=1           My Transcript
//   /?profile=notifications  My Profile → Notifications
//   /?notifications=1        open the bell
//   /?help=1                 Help
// ---------------------------------------------------------------------------
function openSiteLink(link) {
  let q;
  try { q = new URL(link || "/", location.origin).searchParams; } catch (e) { return false; }
  const go = (v) => { view = v; renderNav(); renderMain(); };
  if (q.get("course")) {
    const c = courses.find((x) => x.id === q.get("course"));
    if (!c) { toast("That course couldn't be found."); return true; }
    activeCourseId = c.id;
    if (role === "student") { if (!c.studentIds.includes(currentStudentId)) { activeCourseId = null; go("courses"); return true; } go("course"); }
    else if (iManage(c)) go("manage");
    else { activeCourseId = null; go("catalogue"); }
    return true;
  }
  if (q.get("thread")) {
    const c = courses.find((x) => x.id === q.get("thread"));
    if (!c) { go("messages"); return true; }
    activeCourseId = c.id;
    if (role === "student") { messageThreadStudentId = currentStudentId; go("messageThread"); }
    else if (iTeach(c) && q.get("student")) { messageThreadStudentId = q.get("student"); go("messageThread"); }
    else { activeCourseId = null; go("messages"); }
    return true;
  }
  if (q.get("settings")) { if (role === "faculty") { userTab = q.get("settings") === "approvals" ? "pending" : userTab; go("settings"); } return true; }
  if (q.get("transcript")) { transcriptStudentRef = null; go("transcript"); return true; }
  if (q.get("profile")) {
    openProfile();
    requestAnimationFrame(() => { const el = document.getElementById("notifSettings"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); });
    return true;
  }
  if (q.get("notifications")) { go("home"); notifPanelOpen = true; renderNotifBell(); return true; }
  if (q.get("help")) { go("help"); return true; }
  // Lectures (Oct 9): a new lecture, or "class is live now".
  if (q.get("lesson")) {
    const c = courses.find((x) => x.lessons.some((l) => l.id === q.get("lesson")));
    if (!c) { toast("That lecture isn't available."); go("home"); return true; }
    openLecture(c.id, q.get("lesson"), role === "student" ? "course" : "manage");
    return true;
  }
  if (q.get("live")) {
    const c = courses.find((x) => x.id === q.get("live"));
    if (!c) { toast("That course couldn't be found."); go("home"); return true; }
    openLiveClass(c.id, role === "student" ? "course" : "manage");
    return true;
  }
  return false;
}
// Read the link the page was opened with (kept through sign-in).
const EXTRA_LINK_KEY = "tnbbi-open-link";
const EXTRA_LINK_PARAMS = ["course", "thread", "student", "settings", "transcript", "profile", "notifications", "help", "lesson", "live"];
(function rememberIncomingLink() {
  try {
    const q = new URLSearchParams(location.search);
    if (EXTRA_LINK_PARAMS.some((k) => q.has(k))) {
      sessionStorage.setItem(EXTRA_LINK_KEY, "/?" + q.toString());
      const url = new URL(location.href);
      EXTRA_LINK_PARAMS.forEach((k) => url.searchParams.delete(k));
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  } catch (e) { /* ignore */ }
})();
function takeIncomingLink() {
  try {
    const v = sessionStorage.getItem(EXTRA_LINK_KEY);
    if (v) sessionStorage.removeItem(EXTRA_LINK_KEY);
    return v;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// Notifications settings (My Profile): phone + email + due-date reminders.
// ---------------------------------------------------------------------------
const EMAIL_CHOICES = [
  ["important", "Important only", "Right away for cancellations, messages, announcements, and due-date reminders"],
  ["instant", "Everything", "An email a minute or two after anything happens, grades and new lectures too"],
  ["daily", "Daily summary", "One email each morning (7 AM)"],
  ["off", "No emails", "Only the bell on the site (and your phone, if on)"],
];
function emailChooserHtml() {
  const me = users.find((u) => u.id === currentUser.id) || {};
  const cur = me.notifyEmail || "important";
  return `
    <div class="due-pref" id="emailPref">
      <div class="cal-modal-label" style="margin:18px 0 8px;">Email ${esc(currentUser.email ? `(${currentUser.email})` : "")}</div>
      <div class="due-pref-options" role="radiogroup" aria-label="Email notifications">
        ${EMAIL_CHOICES.map(([k, label, hint]) => `
          <button type="button" role="radio" aria-checked="${cur === k}" class="due-pref-opt ${cur === k ? "active" : ""}" data-email-pref="${k}">
            <strong>${label}</strong><span>${hint}</span>
          </button>`).join("")}
      </div>
      ${cur !== "off" ? `<div class="form-actions" style="margin-top:10px;"><button class="btn btn-ghost btn-sm" id="testEmailBtn">Send Me a Test Email</button></div>` : ""}
    </div>`;
}
function wireEmailChooser(wrap) {
  wrap.querySelectorAll("[data-email-pref]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.emailPref;
    run(() => DB.updateProfile(currentUser.id, { notify_email: v }), () => renderReminderCard(),
      { success: v === "important" ? "You'll get an email for the important things." : v === "instant" ? "You'll get an email when anything happens." : v === "daily" ? "You'll get one summary email each morning." : "Emails are off." });
  }));
  const t = wrap.querySelector("#testEmailBtn");
  if (t) t.addEventListener("click", () => run(async () => {
    const r = await DB.reminderFunction("testemail=1");
    if (!r.sent) throw new Error("The test email couldn't be sent.");
  }, () => renderReminderCard(), { reload: false, success: "Test email sent — check your inbox (and the spam folder, just in case)." }));
}

// ---------------------------------------------------------------------------
// Class cancellations
// ---------------------------------------------------------------------------
function isCanceled(c, ds) {
  return !!(c.cancellations && Object.prototype.hasOwnProperty.call(c.cancellations, ds));
}
// Upcoming scheduled class days (today on), including canceled ones.
function upcomingClassDays(c, limit = 12) {
  const today = todayStr();
  return scheduledDates(c).filter((d) => d >= today).slice(0, limit);
}
function openCancelClassModal(c, presetDate, after) {
  const days = upcomingClassDays(c, 16);
  const root = document.getElementById("modalRoot");
  if (!days.length) { toast("This course has no upcoming class days. Set its schedule first."); return; }
  const first = presetDate && days.includes(presetDate) ? presetDate : days.find((d) => !isCanceled(c, d)) || days[0];
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ccTitle" style="max-width:500px;">
        <h2 id="ccTitle" style="font-size:1.15rem;margin:0 0 6px;">Cancel a Class</h2>
        <p style="margin:0 0 12px;color:var(--muted-foreground);font-size:.88rem;">Everyone enrolled in <strong>${esc(c.title)}</strong> is told right away — in the site, on their phone, and by email — and the day is marked canceled on every calendar.</p>
        <label for="ccDate">Class day</label>
        <select id="ccDate">
          ${days.map((d) => `<option value="${d}" ${d === first ? "selected" : ""} ${isCanceled(c, d) ? "disabled" : ""}>${esc(parseDay(d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}${isCanceled(c, d) ? " (already canceled)" : ""}</option>`).join("")}
        </select>
        <label for="ccReason">Reason <span class="field-hint" style="display:inline;margin:0;">(shown to students)</span></label>
        <input type="text" id="ccReason" maxlength="200" placeholder="e.g. Roads are closed by snow — stay safe.">
        <div class="form-actions">
          <button class="btn btn-danger" id="ccConfirm">Cancel Class &amp; Notify Students</button>
          <button class="btn btn-ghost" id="ccClose">Never Mind</button>
        </div>
      </div>
    </div>`;
  document.getElementById("ccClose").addEventListener("click", closeModal);
  document.getElementById("ccConfirm").addEventListener("click", () => {
    const d = document.getElementById("ccDate").value;
    const reason = document.getElementById("ccReason").value.trim();
    run(async () => { await DB.cancelClass(c.id, d, reason); closeModal(); }, after || null,
      { success: `Class on ${parseDay(d).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} is canceled. Students have been notified.` });
  });
}
async function restoreClassDay(c, ds, after) {
  if (!(await askConfirm(`Put the ${parseDay(ds).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} class back on? Students will be told it's back on.`))) return;
  run(() => DB.restoreClass(c.id, ds), after || null, { success: "The class is back on. Students have been notified." });
}
// Manage page card: upcoming class days, with Cancel / Put Back On.
function renderCancellationsCard(c) {
  const wrap = document.getElementById("mgCancelCard");
  if (!wrap) return;
  const days = upcomingClassDays(c, 6);
  wrap.innerHTML = !days.length ? `<p class="field-hint" style="margin:0;">Upcoming class days appear here once the schedule is set.</p>` : `
    <ul class="materials-list">
      ${days.map((d) => `<li>
        <div><strong>${esc(parseDay(d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</strong>
          <div class="field-hint" style="margin:2px 0 0;">${isCanceled(c, d) ? `<span class="pill pill-red">Canceled</span> ${esc(c.cancellations[d] || "")}` : esc(classMeetsText(c))}</div></div>
        ${isCanceled(c, d)
          ? `<button class="btn btn-ghost btn-sm" data-restore-day="${d}">Put Back On</button>`
          : `<button class="btn btn-ghost btn-sm" data-cancel-day="${d}">Cancel Class</button>`}
      </li>`).join("")}
    </ul>`;
  wrap.querySelectorAll("[data-cancel-day]").forEach((b) => b.addEventListener("click", () => openCancelClassModal(c, b.dataset.cancelDay)));
  wrap.querySelectorAll("[data-restore-day]").forEach((b) => b.addEventListener("click", () => restoreClassDay(c, b.dataset.restoreDay)));
}

// ---------------------------------------------------------------------------
// Location and online link
// ---------------------------------------------------------------------------
function safeMeetingUrl(u) {
  return /^https:\/\/[^\s<>"]+$/i.test(u || "") ? u : "";
}
function whereHtml(c, opts = {}) {
  const url = safeMeetingUrl(c.meetingUrl);
  const parts = [];
  if (c.location) parts.push(`<span class="where-item">${icon("pin")}<span>${esc(c.location)}</span></span>`);
  if (url) parts.push(`<a class="where-item where-link" href="${esc(url)}" target="_blank" rel="noopener">${icon("video")}<span>${opts.short ? "Join online" : "Join class online"}</span></a>`);
  return parts.length ? `<div class="where-row">${parts.join("")}</div>` : "";
}
function locationFieldsHtml(prefix, c) {
  return `
    <div class="form-row">
      <div>
        <label for="${prefix}Location">Where the class meets</label>
        <input type="text" id="${prefix}Location" maxlength="200" placeholder="e.g. Fellowship Hall" value="${esc(c.location || "")}">
      </div>
      <div>
        <label for="${prefix}MeetingUrl">Online meeting link <span class="field-hint" style="display:inline;margin:0;">(optional)</span></label>
        <input type="url" id="${prefix}MeetingUrl" maxlength="500" placeholder="https://zoom.us/j/…" value="${esc(c.meetingUrl || "")}">
      </div>
    </div>
    <div class="field-hint">Shown to enrolled students on the course page and in their calendars (including phone calendars).</div>`;
}
function readLocationFields(prefix) {
  const location = document.getElementById(prefix + "Location").value.trim();
  let url = document.getElementById(prefix + "MeetingUrl").value.trim();
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  if (url && !safeMeetingUrl(url)) throw new Error("The online meeting link should start with https://");
  return { location, meeting_url: url };
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------
function announcementHtml(c, a, canDelete) {
  const who = userName(a.authorId) || "Your instructor";
  return `<div class="announcement">
      <div class="announcement-head">${icon("megaphone")}<strong>${esc(who)}</strong>
        <span class="announcement-time">${new Date(a.postedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        ${canDelete ? `<button class="notif-dismiss" data-del-ann="${a.id}" aria-label="Delete this announcement" title="Delete">×</button>` : ""}</div>
      <div class="announcement-body">${esc(a.body).replace(/\n/g, "<br>")}</div>
    </div>`;
}
// Manage page: post + list.
function renderAnnouncementsCard(c) {
  const wrap = document.getElementById("mgAnnounceCard");
  if (!wrap) return;
  wrap.innerHTML = `
    <label for="annBody" style="margin-top:0;">New announcement to the whole class</label>
    <textarea id="annBody" rows="3" maxlength="4000" placeholder="e.g. Please read Acts 2 before Thursday's class."></textarea>
    <div class="form-actions" style="margin-top:8px;"><button class="btn btn-primary btn-sm" id="annPost">Post &amp; Notify Students</button></div>
    ${c.announcements.length ? `<div style="margin-top:14px;">${c.announcements.slice(0, 10).map((a) => announcementHtml(c, a, true)).join("")}</div>` : ""}`;
  document.getElementById("annPost").addEventListener("click", () => {
    const body = document.getElementById("annBody").value.trim();
    if (!body) { document.getElementById("annBody").focus(); return; }
    run(() => DB.postAnnouncement(c.id, body), null, { success: c.studentIds.length ? `Posted. ${c.studentIds.length} student${c.studentIds.length === 1 ? " has" : "s have"} been notified.` : "Posted." });
  });
  wrap.querySelectorAll("[data-del-ann]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await askConfirm("Delete this announcement? Students will no longer see it."))) return;
    run(() => DB.deleteAnnouncement(b.dataset.delAnn), null, { success: "Announcement deleted." });
  }));
}
// Student course page.
function courseAnnouncementsHtml(c) {
  if (!c.announcements.length) return "";
  return `<div class="section-title"><h2>Announcements</h2></div>
    <div class="card">${c.announcements.slice(0, 5).map((a) => announcementHtml(c, a, false)).join("")}</div>`;
}
// Student dashboard: anything from the last two weeks.
function recentAnnouncementsHtml() {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const list = [];
  courses.filter((c) => !c.archived && c.studentIds.includes(currentStudentId)).forEach((c) => {
    c.announcements.filter((a) => a.postedAt >= since).forEach((a) => list.push({ c, a }));
  });
  const canceled = [];
  const today = todayStr();
  courses.filter((c) => !c.archived && c.studentIds.includes(currentStudentId)).forEach((c) => {
    Object.keys(c.cancellations || {}).filter((d) => d >= today).forEach((d) => canceled.push({ c, d }));
  });
  if (!list.length && !canceled.length) return "";
  list.sort((x, y) => y.a.postedAt.localeCompare(x.a.postedAt));
  canceled.sort((x, y) => x.d.localeCompare(y.d));
  return `<div class="card dash-news">
      ${canceled.map(({ c, d }) => `<div class="dash-cancel">${icon("cancel")}<div><strong>Class canceled:</strong> ${esc(c.title)} on ${esc(parseDay(d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}${c.cancellations[d] ? ` — ${esc(c.cancellations[d])}` : ""}</div></div>`).join("")}
      ${list.slice(0, 3).map(({ c, a }) => `<div class="dash-ann" data-ann-course="${c.id}" role="button" tabindex="0">
          ${icon("megaphone")}<div><div class="dash-ann-course">${esc(c.title)}</div><div>${esc(a.body.length > 220 ? a.body.slice(0, 220) + "…" : a.body)}</div></div></div>`).join("")}
    </div>`;
}
function wireRecentAnnouncements(main) {
  main.querySelectorAll("[data-ann-course]").forEach((el) => {
    const open = () => openSiteLink("/?course=" + el.dataset.annCourse);
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}

// ---------------------------------------------------------------------------
// Copy a course for a new term
// ---------------------------------------------------------------------------
function openCopyCourseModal(c) {
  const root = document.getElementById("modalRoot");
  const suggested = c.schedule.startDate ? (() => { const d = parseDay(c.schedule.startDate); d.setMonth(d.getMonth() + 6); return localISO(d); })() : "";
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cpTitle" style="max-width:540px;">
        <h2 id="cpTitle" style="font-size:1.15rem;margin:0 0 6px;">Copy for a New Term</h2>
        <p style="margin:0 0 6px;color:var(--muted-foreground);font-size:.88rem;">Makes a new course with the same description, credits, schedule pattern, attendance settings, location, files, and assignments. Due dates move along with the new start date.</p>
        <p style="margin:0 0 6px;color:var(--muted-foreground);font-size:.88rem;">Not copied: students, turned-in work, grades, attendance, messages, discussion, or announcements. You'll be its teacher.</p>
        <label for="cpName">New course name</label>
        <input type="text" id="cpName" value="${esc(c.title)}">
        <label for="cpStart">New start date</label>
        <input type="date" id="cpStart" value="${suggested}">
        <div class="field-hint">${c.schedule.startDate ? `The original started ${esc(parseDay(c.schedule.startDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }))}.` : "The original has no start date, so due dates are copied as they are."} You can change everything afterward.</div>
        <div class="form-actions">
          <button class="btn btn-primary" id="cpGo">Make the Copy</button>
          <button class="btn btn-ghost" id="cpClose">Cancel</button>
        </div>
      </div>
    </div>`;
  document.getElementById("cpClose").addEventListener("click", closeModal);
  document.getElementById("cpGo").addEventListener("click", () => {
    const title = document.getElementById("cpName").value.trim();
    const start = document.getElementById("cpStart").value;
    if (!title) { document.getElementById("cpName").focus(); return; }
    let result = null;
    run(async () => { result = await DB.copyCourse(c, title, start); closeModal(); }, () => {
      if (result) { activeCourseId = result.id; view = "manage"; renderNav(); renderMain(); }
      if (result && result.filesFailed) toast(`${result.filesFailed} file${result.filesFailed === 1 ? "" : "s"} couldn't be copied — add ${result.filesFailed === 1 ? "it" : "them"} again under Course Materials.`);
    }, { success: `"${title}" is ready. Check its schedule and due dates.` });
  });
}

// ---------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------
// Plus/minus letters (as on the Institute's grade sheets) were added Oct 8.
const GRADE_POINTS = { "A+": 4, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0 };
const GRADE_CHOICES = [
  ...Object.keys(GRADE_POINTS).map((k) => [k, k]),
  ["P", "P — Pass"], ["I", "I — Incomplete"], ["W", "W — Withdrew"], ["AU", "AU — Audit"],
];
function gradeEarnsCredit(g) { return g === "P" || (g in GRADE_POINTS && g !== "F"); }
const GRADE_MEANING = { P: "Pass", I: "Incomplete", W: "Withdrew", AU: "Audit" };
let transcriptStudentRef = null; // Admin/teacher viewing someone else's; null = mine
let transcriptsQuery = "";

function transcriptSummary(entries) {
  let attempted = 0, earned = 0, gpaCredits = 0, points = 0;
  entries.forEach((e) => {
    if (e.grade !== "AU" && e.grade !== "W") attempted += e.credits;
    if (gradeEarnsCredit(e.grade)) earned += e.credits;
    if (e.grade in GRADE_POINTS) { gpaCredits += e.credits; points += GRADE_POINTS[e.grade] * e.credits; }
  });
  return { attempted, earned, gpa: gpaCredits ? Math.round((points / gpaCredits) * 100) / 100 : null };
}
// Sort by date; for past courses without dates, by the term's name ("Spring 2024").
function termSortKey(e) {
  if (e.startDate || e.endDate) return e.startDate || e.endDate;
  const m = /(winter|spring|summer|fall|autumn)\D*(\d{4})/i.exec(e.term || "");
  if (m) return `${m[2]}-${{ winter: "01", spring: "02", summer: "06", fall: "09", autumn: "09" }[m[1].toLowerCase()]}-00`;
  const y = /(\d{4})/.exec(e.term || "");
  return y ? `${y[1]}-00-00` : "0000";
}
function groupByTerm(entries) {
  const groups = [];
  const byTerm = new Map();
  [...entries].sort((a, b) => termSortKey(a).localeCompare(termSortKey(b)) || a.courseTitle.localeCompare(b.courseTitle)).forEach((e) => {
    const k = e.term || "Courses";
    if (!byTerm.has(k)) { const g = { term: k, items: [] }; byTerm.set(k, g); groups.push(g); }
    byTerm.get(k).items.push(e);
  });
  return groups;
}
// Who this transcript is for.
function transcriptPerson(ref) {
  const entries = transcripts.filter((t) => t.studentRef === ref);
  const u = users.find((x) => x.id === ref);
  const latest = entries[entries.length - 1];
  return {
    ref, entries, user: u || null,
    name: (u && u.name) || (latest && latest.studentName) || "Student",
    email: (u && u.email) || (latest && latest.studentEmail) || "",
    since: u && u.createdAt ? u.createdAt : null,
    former: !u && !entries.some((e) => e.awaitingSignup),
    notJoined: !u && entries.some((e) => e.awaitingSignup), // courses from before the site; hasn't signed up yet
  };
}
// Courses in progress (enrolled, not yet recorded) — for the student's own view and Admins.
function coursesInProgress(ref) {
  const recorded = new Set(transcripts.filter((t) => t.studentRef === ref && t.courseId).map((t) => t.courseId));
  return courses.filter((c) => !c.archived && c.studentIds.includes(ref) && !recorded.has(c.id));
}

function renderTranscript(main) {
  const ref = transcriptStudentRef || currentUser.id;
  const viewingOther = ref !== currentUser.id;
  if (viewingOther && !(isAdmin() || role === "faculty")) { transcriptStudentRef = null; return renderTranscript(main); }
  const p = transcriptPerson(ref);
  const sum = transcriptSummary(p.entries);
  const inProgress = role === "student" || isAdmin() ? coursesInProgress(ref) : [];
  const canEdit = isAdmin();
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; ${viewingOther ? "Back to Transcripts" : role === "student" ? "Back to My Grades" : "Back to Dashboard"}</button>
    <div class="page-header">
      <div class="eyebrow">${viewingOther ? staffEyebrow() + " · Transcripts" : "My Transcript"}</div>
      <h1>${viewingOther ? esc(p.name) : "Your Transcript"}</h1>
      <p>${viewingOther ? "The permanent record of every course this student finished at the Institute." : "Your permanent record of every course you've finished at the Institute. Download it any time to keep a copy."}</p>
    </div>
    <div class="form-actions" style="margin:0 0 16px;flex-wrap:wrap;">
      <button class="btn btn-gold" id="trPdf">${icon("download")} Download PDF</button>
      ${canEdit && !p.former && !p.notJoined ? `<button class="btn btn-ghost" id="trAdd">+ Add a Past Course</button>` : ""}
    </div>
    <div class="transcript-sheet">
      <div class="ts-head">
        <img src="brand/tnbbi-logo-color-sm.png" alt="" class="ts-logo">
        <div>
          <div class="ts-inst">True North Baptist Church Bible Institute</div>
          <div class="ts-sub">Academic Transcript · Teach Others Also</div>
        </div>
      </div>
      <div class="ts-who">
        <div><span class="ts-label">Student</span><strong>${esc(p.name)}</strong>${p.former ? ` <span class="pill pill-gray">Former student</span>` : ""}${p.notJoined ? ` <span class="pill pill-gold">Not signed up yet</span>` : ""}</div>
        ${p.email ? `<div><span class="ts-label">Email</span>${esc(p.email)}</div>` : ""}
        ${p.since ? `<div><span class="ts-label">Student since</span>${esc(parseDay(p.since).toLocaleDateString(undefined, { month: "long", year: "numeric" }))}</div>` : ""}
      </div>
      <div class="ts-stats">
        <div><span>${fmtCredits(sum.earned)}</span>Credits earned</div>
        <div><span>${p.entries.length}</span>Course${p.entries.length === 1 ? "" : "s"} completed</div>
        <div><span>${sum.gpa === null ? "—" : sum.gpa.toFixed(2)}</span>Grade point average</div>
      </div>
      ${p.entries.length === 0 ? `<p class="ts-empty">No finished courses yet. When a teacher records final grades at the end of a course, it appears here.</p>` :
        groupByTerm(p.entries).map((g) => `
        <div class="ts-term">${esc(g.term)}</div>
        <table class="ts-table">
          <thead><tr><th>Course</th><th>Instructor</th><th class="num">Credits</th><th class="num">Score</th><th class="num">Grade</th>${canEdit ? "<th></th>" : ""}</tr></thead>
          <tbody>
          ${g.items.map((e) => `<tr>
            <td><strong>${esc(e.courseTitle)}</strong>${e.level ? `<div class="ts-small">${esc(e.level)} Level</div>` : ""}${e.note ? `<div class="ts-small">${esc(e.note)}</div>` : ""}</td>
            <td>${esc(e.teacherName || "—")}</td>
            <td class="num">${fmtCredits(e.credits)}</td>
            <td class="num">${e.percent === null ? "—" : Math.round(e.percent * 10) / 10 + "%"}</td>
            <td class="num"><span class="ts-grade">${esc(e.grade)}</span></td>
            ${canEdit ? `<td class="num"><button class="btn btn-ghost btn-sm" data-edit-entry="${e.id}">Edit</button></td>` : ""}
          </tr>`).join("")}
          </tbody>
        </table>`).join("")}
      ${inProgress.length ? `
        <div class="ts-term">In progress</div>
        <ul class="ts-progress">${inProgress.map((c) => `<li>${esc(c.title)} <span class="ts-small">· ${c.credits} credit${c.credits === 1 ? "" : "s"}</span></li>`).join("")}</ul>` : ""}
      <div class="ts-foot">Grading scale: A+ 97–100 · A 94–96 · A− 90–93 · B+ 87–89 · B 84–86 · B− 80–83 · C+ 77–79 · C 74–76 · C− 70–73 · F below 70 · P Pass · I Incomplete · W Withdrew · AU Audit. GPA on a 4.0 scale (A+/A 4.0, A− 3.7, B+ 3.3, B 3.0, B− 2.7, C+ 2.3, C 2.0, C− 1.7, F 0); P, I, W, and AU don't count toward it. Some earlier courses also used D grades (D+ 1.3, D 1.0, D− 0.7).</div>
    </div>`;
  document.getElementById("backLink").addEventListener("click", () => {
    if (viewingOther) { transcriptStudentRef = null; view = "transcripts"; } else view = role === "student" ? "grades" : "home";
    renderNav(); renderMain();
  });
  document.getElementById("trPdf").addEventListener("click", () => downloadTranscriptPdf([ref]));
  const add = document.getElementById("trAdd");
  if (add) add.addEventListener("click", () => openTranscriptEntryModal(null, p));
  main.querySelectorAll("[data-edit-entry]").forEach((b) => b.addEventListener("click", () => openTranscriptEntryModal(transcripts.find((t) => t.id === b.dataset.editEntry), p)));
}
function fmtCredits(n) { return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10); }

// Admins (and teachers, for their courses): everyone with a transcript.
function renderTranscripts(main) {
  const refs = new Map();
  transcripts.forEach((t) => { if (!refs.has(t.studentRef)) refs.set(t.studentRef, transcriptPerson(t.studentRef)); });
  if (isAdmin()) users.filter((u) => u.role === "student" && u.status !== "pending" && !refs.has(u.id)).forEach((u) => refs.set(u.id, transcriptPerson(u.id)));
  const q = transcriptsQuery.trim().toLowerCase();
  const people = [...refs.values()].filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
    .sort((a, b) => (a.former - b.former) || lastFirst(a.name).localeCompare(lastFirst(b.name)));
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${staffEyebrow()}</div>
      <h1>Transcripts</h1>
      <p>${isAdmin() ? "Every student's permanent record — including former students whose accounts were deleted, and past students who haven't signed up yet. Open one to review it, correct it, add courses taken before the site, or download it." : "Final grades recorded in the courses you teach, and every student's courses from before the site (including students who haven't signed up yet)."}</p>
    </div>
    <div class="card">
      <div class="card-row" style="gap:10px;flex-wrap:wrap;">
        <input type="search" id="trSearch" placeholder="Search by name or email" value="${esc(transcriptsQuery)}" style="flex:1;min-width:200px;margin:0;">
        ${isAdmin() ? `<button class="btn btn-gold btn-sm" id="trPast">Past Records${pastRecords.some((r) => !r.claimedAt) ? ` <span class="count-chip">${pastRecords.filter((r) => !r.claimedAt).length}</span>` : ""}</button><button class="btn btn-ghost btn-sm" id="trAllPdf">${icon("download")} All Transcripts (PDF)</button><button class="btn btn-ghost btn-sm" id="trCsv">${icon("download")} Spreadsheet (CSV)</button>` : ""}
      </div>
      ${people.length === 0 ? `<div class="empty-state"><p>${q ? "No one matches that search." : "No transcripts yet. They appear when a teacher records final grades (Grading → a course → Record Final Grades)."}</p></div>` : `
      <ul class="materials-list" style="margin-top:8px;">
        ${people.map((p) => { const s = transcriptSummary(p.entries); return `<li class="tr-person" data-tr-ref="${p.ref}" role="button" tabindex="0">
          <div><strong>${esc(p.name)}</strong> ${p.former ? `<span class="pill pill-gray">Former student</span>` : ""}${p.notJoined ? `<span class="pill pill-gold">Not signed up yet</span>` : ""}
            <div class="field-hint" style="margin:2px 0 0;">${p.entries.length} course${p.entries.length === 1 ? "" : "s"} · ${fmtCredits(s.earned)} credits${s.gpa === null ? "" : ` · GPA ${s.gpa.toFixed(2)}`}${p.email ? ` · ${esc(p.email)}` : ""}</div></div>
          <span class="btn btn-ghost btn-sm">Open</span>
        </li>`; }).join("")}
      </ul>`}
    </div>`;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  const s = document.getElementById("trSearch");
  s.addEventListener("input", () => { transcriptsQuery = s.value; const pos = s.selectionStart; renderTranscripts(main); const n = document.getElementById("trSearch"); n.focus(); n.setSelectionRange(pos, pos); });
  main.querySelectorAll("[data-tr-ref]").forEach((el) => {
    const open = () => { transcriptStudentRef = el.dataset.trRef; view = "transcript"; renderNav(); renderMain(); };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
  const all = document.getElementById("trAllPdf");
  if (all) all.addEventListener("click", () => {
    const withEntries = people.filter((p) => p.entries.length).map((p) => p.ref);
    if (!withEntries.length) { toast("No recorded grades yet."); return; }
    downloadTranscriptPdf(withEntries);
  });
  const csv = document.getElementById("trCsv");
  if (csv) csv.addEventListener("click", downloadTranscriptsCsv);
  const past = document.getElementById("trPast");
  if (past) past.addEventListener("click", () => { view = "pastRecords"; renderNav(); renderMain(); });
}

function openTranscriptEntryModal(entry, person) {
  const e = entry || { courseTitle: "", credits: 3, level: "", term: "", startDate: "", endDate: "", percent: null, grade: "A", teacherName: "", note: "" };
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="teTitle" style="max-width:560px;">
        <h2 id="teTitle" style="font-size:1.15rem;margin:0 0 6px;">${entry ? "Edit Transcript Entry" : "Add a Past Course"}</h2>
        <p style="margin:0 0 6px;color:var(--muted-foreground);font-size:.88rem;">${esc(person.name)}${entry ? "" : " — for a course taken before the site existed (from the paper records)."}</p>
        <label for="teCourse">Course</label>
        <input type="text" id="teCourse" maxlength="160" value="${esc(e.courseTitle)}" placeholder="e.g. Bible Doctrines I">
        <div class="form-row">
          <div><label for="teTerm">Term</label><input type="text" id="teTerm" maxlength="40" value="${esc(e.term)}" placeholder="e.g. Fall 2024"></div>
          <div><label for="teCredits">Credits</label><input type="number" id="teCredits" min="0" max="12" step="0.5" value="${e.credits}"></div>
        </div>
        <div class="form-row">
          <div><label for="teGrade">Grade</label><select id="teGrade">${GRADE_CHOICES.map(([k, l]) => `<option value="${k}" ${k === e.grade ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div><label for="tePercent">Score % <span class="field-hint" style="display:inline;margin:0;">(optional)</span></label><input type="number" id="tePercent" min="0" max="110" step="0.1" value="${e.percent === null ? "" : e.percent}"></div>
        </div>
        <div class="form-row">
          <div><label for="teStart">Started</label><input type="date" id="teStart" value="${e.startDate || ""}"></div>
          <div><label for="teEnd">Finished</label><input type="date" id="teEnd" value="${e.endDate || ""}"></div>
        </div>
        <div class="form-row">
          <div><label for="teTeacher">Instructor</label><input type="text" id="teTeacher" maxlength="120" value="${esc(e.teacherName)}"></div>
          <div><label for="teLevel">Level</label><input type="text" id="teLevel" maxlength="40" value="${esc(e.level)}" placeholder="e.g. Foundational"></div>
        </div>
        <label for="teNote">Note <span class="field-hint" style="display:inline;margin:0;">(optional, printed on the transcript)</span></label>
        <input type="text" id="teNote" maxlength="300" value="${esc(e.note)}">
        <div class="form-actions">
          <button class="btn btn-primary" id="teSave">Save</button>
          ${entry ? `<button class="btn btn-danger" id="teDelete">Remove</button>` : ""}
          <button class="btn btn-ghost" id="teClose">Cancel</button>
        </div>
      </div>
    </div>`;
  document.getElementById("teClose").addEventListener("click", closeModal);
  document.getElementById("teSave").addEventListener("click", () => {
    const val = (id) => document.getElementById(id).value.trim();
    if (!val("teCourse")) { document.getElementById("teCourse").focus(); return; }
    run(async () => {
      await DB.saveTranscriptEntry({
        id: entry ? entry.id : null, studentId: person.ref, courseTitle: val("teCourse"), credits: Number(val("teCredits")) || 0,
        level: val("teLevel"), term: val("teTerm"), startDate: val("teStart"), endDate: val("teEnd"),
        percent: val("tePercent"), grade: val("teGrade"), teacherName: val("teTeacher"), note: val("teNote"),
      });
      closeModal();
    }, null, { success: entry ? "Transcript updated." : "Course added to the transcript." });
  });
  const del = document.getElementById("teDelete");
  if (del) del.addEventListener("click", async () => {
    if (!(await askConfirm(`Remove ${entry.courseTitle} from ${person.name}'s transcript? This can't be undone.`))) return;
    run(async () => { await DB.deleteTranscriptEntry(entry.id); closeModal(); }, null, { success: "Removed from the transcript." });
  });
}

// End of a course: the teacher records each student's final grade.
function openRecordGradesModal(c, after) {
  const students = c.studentIds.map((id) => users.find((u) => u.id === id)).filter(Boolean).sort((a, b) => lastFirst(a.name).localeCompare(lastFirst(b.name)));
  if (!students.length) { toast("No students are enrolled in this course."); return; }
  const recorded = new Map(transcripts.filter((t) => t.courseId === c.id).map((t) => [t.studentRef, t]));
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop no-dismiss">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="rgTitle" style="max-width:680px;">
        <h2 id="rgTitle" style="font-size:1.15rem;margin:0 0 6px;">Record Final Grades — ${esc(c.title)}</h2>
        <p style="margin:0 0 12px;color:var(--muted-foreground);font-size:.88rem;">This writes each student's final grade to their permanent transcript (it stays even after the course is archived or deleted). Grades are filled in from the grade sheet — change any you need to, then record. You can record again later to correct one.</p>
        <div class="table-scroll">
          <table class="rg-table">
            <thead><tr><th>Student</th><th class="num">Score</th><th>Grade</th><th>Note <span class="field-hint" style="display:inline;margin:0;">(optional)</span></th></tr></thead>
            <tbody>
            ${students.map((u) => {
              const g = computeCourseGrade(c, u.id);
              const prev = recorded.get(u.id);
              const pct = prev && prev.percent !== null ? prev.percent : g.pct;
              const letter = prev ? prev.grade : g.letter || "I";
              return `<tr data-rg-student="${u.id}" data-rg-att="${g.attendance && g.attendance.pct !== null ? g.attendance.pct : ""}">
                <td><strong>${esc(lastFirst(u.name))}</strong>${prev ? `<div class="ts-small">Recorded ${esc(new Date(prev.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}</div>` : ""}</td>
                <td class="num"><input type="number" class="rg-pct" min="0" max="110" step="0.1" value="${pct === null ? "" : pct}" aria-label="Score for ${esc(u.name)}"></td>
                <td><select class="rg-grade" aria-label="Grade for ${esc(u.name)}">${GRADE_CHOICES.map(([k, l]) => `<option value="${k}" ${k === letter ? "selected" : ""}>${l}</option>`).join("")}</select></td>
                <td><input type="text" class="rg-note" maxlength="300" value="${esc(prev ? prev.note : "")}" aria-label="Note for ${esc(u.name)}"></td>
              </tr>`;
            }).join("")}
            </tbody>
          </table>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" id="rgSave">Record ${students.length} Final Grade${students.length === 1 ? "" : "s"}</button>
          <button class="btn btn-ghost" id="rgClose">Cancel</button>
        </div>
      </div>
    </div>`;
  document.getElementById("rgClose").addEventListener("click", closeModal);
  // Changing the score suggests the matching letter (A–F only).
  root.querySelectorAll("[data-rg-student]").forEach((tr) => {
    tr.querySelector(".rg-pct").addEventListener("input", (e) => {
      const sel = tr.querySelector(".rg-grade");
      if (e.target.value !== "" && /^[A-DF][+-]?$/.test(sel.value)) sel.value = pctToLetter(Number(e.target.value));
    });
  });
  document.getElementById("rgSave").addEventListener("click", () => {
    const entries = [...root.querySelectorAll("[data-rg-student]")].map((tr) => ({
      student: tr.dataset.rgStudent,
      percent: tr.querySelector(".rg-pct").value === "" ? null : Number(tr.querySelector(".rg-pct").value),
      grade: tr.querySelector(".rg-grade").value,
      attendance: tr.dataset.rgAtt === "" ? null : Number(tr.dataset.rgAtt),
      note: tr.querySelector(".rg-note").value.trim(),
    }));
    run(async () => { await DB.recordFinalGrades(c.id, entries); closeModal(); }, after || null,
      { success: `Final grades recorded for ${entries.length} student${entries.length === 1 ? "" : "s"}. They can see them on their transcripts.` });
  });
}
function courseGradesRecorded(c) {
  const done = new Set(transcripts.filter((t) => t.courseId === c.id).map((t) => t.studentRef));
  return c.studentIds.filter((id) => !done.has(id)).length === 0;
}
// Before archiving: offer to record final grades first.
function confirmArchiveWithTranscripts(c, proceed) {
  if (!c.studentIds.length || courseGradesRecorded(c) || !iManage(c)) { proceed(); return; }
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" style="max-width:500px;">
        <h2 style="font-size:1.15rem;margin:0 0 6px;">Record final grades first?</h2>
        <p style="margin:0 0 12px;">Final grades for <strong>${esc(c.title)}</strong> haven't been recorded on students' transcripts yet. Archiving keeps the grades, but the transcript is the permanent record.</p>
        <div class="form-actions" style="flex-wrap:wrap;">
          <button class="btn btn-primary" id="arRecord">Record Final Grades</button>
          <button class="btn btn-ghost" id="arAnyway">Archive Anyway</button>
          <button class="btn btn-ghost" id="arCancel">Cancel</button>
        </div>
      </div>
    </div>`;
  document.getElementById("arCancel").addEventListener("click", closeModal);
  document.getElementById("arAnyway").addEventListener("click", () => { closeModal(); proceed(); });
  document.getElementById("arRecord").addEventListener("click", () => openRecordGradesModal(c));
}

// ---- Transcript PDF (letter size, crest, navy and gold) ---------------------
let logoDataUrl = null;
async function loadLogo() {
  if (logoDataUrl) return logoDataUrl;
  try {
    const blob = await (await fetch("brand/tnbbi-logo-color-sm.png")).blob();
    logoDataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });
  } catch (e) { logoDataUrl = null; }
  return logoDataUrl;
}
function pdfText(s) {
  // The PDF's built-in fonts cover Western characters; swap the few
  // typographic ones that fall outside them.
  return String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x00-\xff]/g, "");
}
async function downloadTranscriptPdf(refs) {
  if (!(window.jspdf && window.jspdf.jsPDF)) { toast("PDF downloads aren't available right now — check your internet connection."); return; }
  const logo = await loadLogo();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 54;
  const NAVY = [26, 44, 69], GOLD = [176, 141, 63], INK = [20, 32, 51], MUTED = [104, 112, 125], RULE = [222, 214, 196];
  const issued = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  let y = 0;
  const header = (p, cont) => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 92, "F");
    doc.setFillColor(...GOLD); doc.rect(0, 92, W, 3, "F");
    if (logo) { try { doc.addImage(logo, "PNG", M, 18, 56, 56); } catch (e) { /* skip */ } }
    doc.setTextColor(255, 255, 255); doc.setFont("times", "bold"); doc.setFontSize(18);
    doc.text("True North Baptist Church Bible Institute", M + (logo ? 70 : 0), 44);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(216, 201, 163);
    doc.text(cont ? "Academic Transcript (continued)" : "Academic Transcript  ·  Teach Others Also", M + (logo ? 70 : 0), 62);
    y = 122;
    doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(pdfText(p.name), M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...MUTED);
    const meta = [p.email, p.since ? `Student since ${parseDay(p.since).toLocaleDateString(undefined, { month: "long", year: "numeric" })}` : "", p.former ? "Former student" : ""].filter(Boolean).join("   ·   ");
    if (meta) doc.text(pdfText(meta), M, y + 15);
    y += 34;
  };
  const footer = (pageNo) => {
    doc.setDrawColor(...RULE); doc.setLineWidth(0.6); doc.line(M, H - 50, W - M, H - 50);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(pdfText(`Issued ${issued} from tnbbibleinstitute.com`), M, H - 36);
    doc.text(`Page ${pageNo}`, W - M, H - 36, { align: "right" });
  };
  let pageNo = 0;
  refs.forEach((ref, i) => {
    const p = transcriptPerson(ref);
    const sum = transcriptSummary(p.entries);
    if (i > 0) doc.addPage();
    pageNo++; header(p, false);
    // Summary boxes
    const boxes = [[fmtCredits(sum.earned), "Credits earned"], [String(p.entries.length), p.entries.length === 1 ? "Course completed" : "Courses completed"], [sum.gpa === null ? "-" : sum.gpa.toFixed(2), "Grade point average"]];
    const bw = (W - 2 * M - 20) / 3;
    boxes.forEach(([v, l], k) => {
      const x = M + k * (bw + 10);
      doc.setFillColor(247, 244, 237); doc.setDrawColor(...RULE); doc.roundedRect(x, y, bw, 48, 6, 6, "FD");
      doc.setTextColor(...NAVY); doc.setFont("times", "bold"); doc.setFontSize(17); doc.text(v, x + bw / 2, y + 23, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text(l, x + bw / 2, y + 38, { align: "center" });
    });
    y += 72;
    const cols = [{ t: "Course", x: M, w: 210 }, { t: "Instructor", x: M + 214, w: 120 }, { t: "Credits", x: M + 352, a: "right" }, { t: "Score", x: M + 410, a: "right" }, { t: "Grade", x: W - M - 6, a: "right" }];
    const ensure = (need) => { if (y + need > H - 70) { footer(pageNo); doc.addPage(); pageNo++; header(p, true); } };
    if (!p.entries.length) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(10.5); doc.setTextColor(...MUTED);
      doc.text("No finished courses recorded yet.", M, y); y += 20;
    }
    groupByTerm(p.entries).forEach((g) => {
      ensure(60);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...GOLD);
      doc.text(pdfText(g.term.toUpperCase()), M, y); y += 8;
      doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.line(M, y, W - M, y); y += 14;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
      cols.forEach((c) => doc.text(c.t, c.x, y, c.a ? { align: c.a } : undefined)); y += 12;
      g.items.forEach((e) => {
        const titleLines = doc.splitTextToSize(pdfText(e.courseTitle), cols[0].w);
        const sub = [e.level ? `${e.level} Level` : "", e.note].filter(Boolean).join(" - ");
        const subLines = sub ? doc.splitTextToSize(pdfText(sub), cols[0].w) : [];
        const rowH = 12 * titleLines.length + 10 * subLines.length + 8;
        ensure(rowH + 4);
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
        doc.text(titleLines, M, y);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
        doc.text(doc.splitTextToSize(pdfText(e.teacherName || "-"), cols[1].w)[0], cols[1].x, y);
        doc.text(fmtCredits(e.credits), cols[2].x, y, { align: "right" });
        doc.text(e.percent === null ? "-" : `${Math.round(e.percent * 10) / 10}%`, cols[3].x, y, { align: "right" });
        doc.setFont("helvetica", "bold"); doc.setTextColor(...NAVY); doc.text(e.grade, cols[4].x, y, { align: "right" });
        if (subLines.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(subLines, M, y + 12 * titleLines.length - 1); }
        y += rowH;
        doc.setDrawColor(...RULE); doc.setLineWidth(0.4); doc.line(M, y - 6, W - M, y - 6);
        y += 6;
      });
      y += 10;
    });
    ensure(40);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize("Grading scale: A+ 97-100, A 94-96, A- 90-93, B+ 87-89, B 84-86, B- 80-83, C+ 77-79, C 74-76, C- 70-73, F below 70. P Pass, I Incomplete, W Withdrew, AU Audit. Grade point average on a 4.0 scale (A+/A 4.0, A- 3.7, B+ 3.3, B 3.0, B- 2.7, C+ 2.3, C 2.0, C- 1.7, F 0; earlier D grades D+ 1.3, D 1.0, D- 0.7); P, I, W, and AU are not included.", W - 2 * M), M, y + 4);
    footer(pageNo);
  });
  const one = refs.length === 1 ? transcriptPerson(refs[0]).name : "All Students";
  doc.save(`Transcript - ${one.replace(/[^\w .-]+/g, "")} - ${todayStr()}.pdf`);
}
function downloadTranscriptsCsv() {
  const head = ["Student", "Email", "Term", "Course", "Level", "Credits", "Score %", "Grade", "Instructor", "Started", "Finished", "Note", "Recorded"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [...transcripts].sort((a, b) => a.studentName.localeCompare(b.studentName) || termSortKey(a).localeCompare(termSortKey(b)))
    .map((t) => [t.studentName, t.studentEmail, t.term, t.courseTitle, t.level, t.credits, t.percent ?? "", t.grade, t.teacherName, t.startDate || "", t.endDate || "", t.note, (t.recordedAt || "").slice(0, 10)].map(q).join(","));
  const blob = new Blob(["﻿" + [head.map(q).join(","), ...rows].join("\r\n")], { type: "text/csv" });
  saveBlob(blob, `TNBBI transcripts ${todayStr()}.csv`);
}
function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------------------------------------------------------------------------
// Past Records (Admins) — grades from before the site, added Oct 8, 2026.
// Each record waits under the student's email and moves onto their
// transcript by itself once they sign up, confirm the email, and are
// approved. Admins import them from a spreadsheet (CSV) and can link a
// record to an account by hand.
// ---------------------------------------------------------------------------
let pastRecordsQuery = "";
let pastImport = null; // { fileName, rows, result } while checking a file

const PAST_COLS = {
  name: ["student", "name", "student name"],
  email: ["email", "email for the site", "e-mail"],
  course: ["course", "course title"],
  term: ["term", "semester"],
  credits: ["credits", "credit hours"],
  grade: ["grade", "transcript grade", "letter"],
  percent: ["score %", "score", "percent", "final %", "final grade %"],
  teacher: ["instructor", "teacher"],
  start: ["started", "start", "start date"],
  end: ["finished", "end", "end date"],
  level: ["level"],
  note: ["note", "notes"],
};
const PAST_TEMPLATE_HEAD = ["Student", "Email", "Course", "Term", "Credits", "Grade", "Score %", "Instructor", "Started", "Finished", "Level", "Note"];

// A small, forgiving CSV reader (quotes, commas and line breaks inside quotes).
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  text = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}
// CSV text → [{ name, email, course, ... }]. Throws a plain sentence if the
// file doesn't have the columns we need.
function pastRowsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("That file has no rows to import.");
  const head = rows[0].map((h) => String(h).trim().toLowerCase());
  const idx = {};
  Object.entries(PAST_COLS).forEach(([k, names]) => { const i = head.findIndex((h) => names.includes(h)); if (i >= 0) idx[k] = i; });
  const missing = ["name", "course", "grade"].filter((k) => idx[k] === undefined);
  if (missing.length) throw new Error(`The first row needs these column names: Student, Course, Grade (missing ${missing.map((m) => PAST_COLS[m][0]).join(", ")}). Download the template to see the layout.`);
  return rows.slice(1).map((r) => {
    const o = {};
    Object.keys(PAST_COLS).forEach((k) => { o[k] = idx[k] === undefined ? "" : String(r[idx[k]] ?? "").trim(); });
    o.percent = o.percent.replace(/%$/, "").trim();
    return o;
  });
}

function pastPeople() {
  // Waiting records grouped by student (email, or name when there's no email).
  const groups = new Map();
  pastRecords.filter((r) => !r.claimedAt).forEach((r) => {
    const k = r.email || "name:" + r.studentName.toLowerCase();
    if (!groups.has(k)) groups.set(k, { key: k, name: r.studentName, email: r.email, records: [] });
    groups.get(k).records.push(r);
  });
  return [...groups.values()].sort((a, b) => lastFirst(a.name).localeCompare(lastFirst(b.name)));
}

function renderPastRecords(main) {
  if (!isAdmin()) { view = "home"; renderNav(); return renderMain(); }
  const waiting = pastRecords.filter((r) => !r.claimedAt);
  const claimed = pastRecords.filter((r) => r.claimedAt);
  const q = pastRecordsQuery.trim().toLowerCase();
  const people = pastPeople().filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.includes(q) || p.records.some((r) => r.courseTitle.toLowerCase().includes(q)));
  const nameOf = (id) => { const u = users.find((x) => x.id === id); return u ? u.name : "a deleted account"; };
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Transcripts</button>
    <div class="page-header">
      <div class="eyebrow">Admin · Transcripts</div>
      <h1>Past Records</h1>
      <p>Grades from before the site. Each record is on a transcript right away under the student's name (marked <strong>Not signed up yet</strong>), so teachers can see it. When the student signs up, confirms their email, and is approved, that transcript becomes theirs automatically.</p>
    </div>
    <div class="ts-stats" style="margin-bottom:18px;">
      <div><span>${waiting.length}</span>Waiting for their student</div>
      <div><span>${pastPeople().length}</span>Student${pastPeople().length === 1 ? "" : "s"} still to sign up</div>
      <div><span>${claimed.length}</span>Already on transcripts</div>
    </div>
    <div class="card" id="pastImportCard">${pastImportHtml()}</div>
    <div class="card">
      <h2 class="card-title" style="margin:0 0 4px;">Waiting for their student</h2>
      <p class="field-hint" style="margin:0 0 12px;">These already show on Transcripts. If someone signs up with a different email, or there was no email on file, use <strong>Link to Account</strong> once they're approved.</p>
      ${waiting.length ? `<input type="search" id="prSearch" placeholder="Search by name, email or course" value="${esc(pastRecordsQuery)}" style="margin:0 0 6px;">` : ""}
      ${people.length === 0 ? `<div class="empty-state"><p>${q ? "No one matches that search." : waiting.length ? "" : "Nothing waiting. Import past grades above."}</p></div>` : `
      <ul class="materials-list">
        ${people.map((p) => `<li>
          <div style="flex:1;min-width:0;">
            <strong>${esc(p.name)}</strong> ${p.email ? `<span class="field-hint" style="display:inline;margin:0;">· ${esc(p.email)}</span>` : `<span class="pill pill-gold">No email: link by hand</span>`}
            <ul class="pr-courses">
              ${p.records.sort((a, b) => (a.startDate || a.term).localeCompare(b.startDate || b.term)).map((r) => `<li>
                <span>${esc(r.courseTitle)} <span class="ts-small">· ${esc(r.term || "No term")}</span></span>
                <span><span class="ts-grade">${esc(r.grade)}</span>${r.percent === null ? "" : ` <span class="ts-small">${Math.round(r.percent * 100) / 100}%</span>`}
                <button class="btn btn-ghost btn-sm" data-pr-remove="${r.id}" aria-label="Remove ${esc(r.courseTitle)} for ${esc(p.name)}">Remove</button></span>
              </li>`).join("")}
            </ul>
          </div>
          <button class="btn btn-ghost btn-sm" data-pr-link="${esc(p.key)}">Link to Account</button>
        </li>`).join("")}
      </ul>`}
    </div>
    ${claimed.length ? `
    <div class="card">
      <details>
        <summary><strong>Already on transcripts (${claimed.length})</strong></summary>
        <ul class="pr-courses" style="margin-top:10px;">
          ${[...claimed].sort((a, b) => (b.claimedAt || "").localeCompare(a.claimedAt || "")).map((r) => `<li>
            <span>${esc(r.studentName)} <span class="ts-small">· ${esc(r.courseTitle)} · ${esc(r.term)}</span></span>
            <span class="ts-small">→ ${esc(nameOf(r.claimedBy))}, ${esc(new Date(r.claimedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))}</span>
          </li>`).join("")}
        </ul>
      </details>
    </div>` : ""}`;
  document.getElementById("backLink").addEventListener("click", () => { pastImport = null; view = "transcripts"; renderNav(); renderMain(); });
  wirePastImport(main);
  const s = document.getElementById("prSearch");
  if (s) s.addEventListener("input", () => { pastRecordsQuery = s.value; const pos = s.selectionStart; renderPastRecords(main); const n = document.getElementById("prSearch"); n.focus(); n.setSelectionRange(pos, pos); });
  main.querySelectorAll("[data-pr-remove]").forEach((b) => b.addEventListener("click", async () => {
    const r = pastRecords.find((x) => x.id === b.dataset.prRemove);
    if (!r || !(await askConfirm(`Remove ${r.courseTitle} (${r.term || "no term"}) for ${r.studentName}? It won't go on anyone's transcript.`))) return;
    run(() => DB.deletePastRecord(r.id), null, { success: "Removed." });
  }));
  main.querySelectorAll("[data-pr-link]").forEach((b) => b.addEventListener("click", () => {
    const p = pastPeople().find((x) => x.key === b.dataset.prLink);
    if (p) openLinkPastModal(p);
  }));
}

function pastImportHtml() {
  if (!pastImport) return `
    <h2 class="card-title" style="margin:0 0 4px;">Import past grades</h2>
    <p class="field-hint" style="margin:0 0 12px;">Use a spreadsheet saved as CSV (in Excel or Google Sheets: File → Save As / Download → CSV), one row per student per course. Columns: <strong>Student, Course, Grade</strong> (required), plus Email, Term, Credits, Score %, Instructor, Started, Finished, Level, Note. Grades: A+ to F, P (Pass), I (Incomplete), W (Withdrew), AU (Audit). Nothing is saved until you've checked the file.</p>
    <div class="form-actions" style="margin:0;flex-wrap:wrap;">
      <label class="btn btn-gold" for="prFile" style="margin:0;">${icon("upload")} Choose a CSV File</label>
      <input type="file" id="prFile" accept=".csv,text/csv" hidden>
      <button class="btn btn-ghost" id="prTemplate">${icon("download")} Download the Template</button>
    </div>`;
  const r = pastImport.result;
  const label = { new: ["Waits for sign-up", "pill-navy"], attach: ["Goes on now", "pill-green"], same: ["Already imported", "pill-gray"], problem: ["Problem", "pill-red"] };
  return `
    <h2 class="card-title" style="margin:0 0 4px;">Check before importing: ${esc(pastImport.fileName)}</h2>
    <p class="field-hint" style="margin:0 0 10px;">${pastImport.rows.length} row${pastImport.rows.length === 1 ? "" : "s"} read. Nothing has been saved yet.</p>
    <div class="pr-summary">
      <span class="pill pill-navy">${r.new} will wait for ${r.new === 1 ? "its student" : "their students"}</span>
      <span class="pill pill-green">${r.attach} ${r.attach === 1 ? "goes" : "go"} on a transcript now</span>
      ${r.same ? `<span class="pill pill-gray">${r.same} already imported (skipped)</span>` : ""}
      ${r.problems ? `<span class="pill pill-red">${r.problems} with a problem</span>` : ""}
    </div>
    ${r.problems ? `<p class="pr-problem-note">Fix the rows marked <strong>Problem</strong> in your spreadsheet, save it as CSV again, and choose it again. Nothing is imported while any row has a problem.</p>` : ""}
    <div class="table-scroll" style="max-height:420px;">
      <table class="rg-table pr-table">
        <thead><tr><th>#</th><th>Student</th><th>Course</th><th>Term</th><th class="num">Grade</th><th>What happens</th></tr></thead>
        <tbody>
          ${r.rows.map((x) => { const row = pastImport.rows[x.row - 1] || {}; const [t, cls] = label[x.status] || ["", ""]; return `<tr class="${x.status === "problem" ? "pr-bad" : ""}">
            <td>${x.row + 1}</td>
            <td><strong>${esc(row.name)}</strong><div class="ts-small">${esc(row.email || "no email")}</div></td>
            <td>${esc(row.course)}</td><td>${esc(row.term)}</td>
            <td class="num"><span class="ts-grade">${esc((row.grade || "").toUpperCase())}</span></td>
            <td><span class="pill ${cls}">${t}</span>${x.message ? `<div class="ts-small">${esc(x.message)}</div>` : ""}</td>
          </tr>`; }).join("")}
        </tbody>
      </table>
    </div>
    <div class="form-actions" style="flex-wrap:wrap;">
      <button class="btn btn-primary" id="prCommit" ${r.problems || !(r.new + r.attach) ? "disabled" : ""}>Import ${r.new + r.attach} Record${r.new + r.attach === 1 ? "" : "s"}</button>
      <button class="btn btn-ghost" id="prCancel">Choose a Different File</button>
    </div>`;
}

function wirePastImport(main) {
  const card = document.getElementById("pastImportCard");
  const redraw = () => { card.innerHTML = pastImportHtml(); wirePastImport(main); };
  const tpl = document.getElementById("prTemplate");
  if (tpl) tpl.addEventListener("click", () => {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const example = ["Jane Doe", "jane@example.com", "Hermeneutics I", "Spring 2025", 3, "B+", 88.5, "Pastor Phil McBroom", "2025-01-24", "2025-05-30", "Foundational", ""];
    saveBlob(new Blob(["﻿" + [PAST_TEMPLATE_HEAD, example].map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv" }), "TNBBI past records template.csv");
  });
  const file = document.getElementById("prFile");
  if (file) file.addEventListener("change", async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    let rows;
    try { rows = pastRowsFromCsv(await f.text()); }
    catch (e) { toast(e.message || "That file couldn't be read. Save it as CSV and try again."); file.value = ""; return; }
    run(async () => {
      const result = await DB.importPastRecords(rows, false);
      pastImport = { fileName: f.name, rows, result };
    }, () => redraw(), { reload: false });
  });
  const cancel = document.getElementById("prCancel");
  if (cancel) cancel.addEventListener("click", () => { pastImport = null; redraw(); });
  const commit = document.getElementById("prCommit");
  if (commit) commit.addEventListener("click", async () => {
    const r = pastImport.result;
    if (!(await askConfirm(`Import ${r.new + r.attach} past record${r.new + r.attach === 1 ? "" : "s"}?${r.attach ? ` ${r.attach} go straight onto transcripts of people who already have accounts.` : ""}`))) return;
    let saved;
    run(async () => { saved = await DB.importPastRecords(pastImport.rows, true); pastImport = null; }, null,
      { success: "Past records imported." }).then((ok) => {
      if (ok && saved && saved.attached) toast(`${saved.attached} course${saved.attached === 1 ? " was" : "s were"} added to existing students' transcripts.`, "success");
    });
  });
}

function openLinkPastModal(p) {
  const accounts = users.filter((u) => u.status === "active").sort((a, b) => lastFirst(a.name).localeCompare(lastFirst(b.name)));
  const last = (n) => n.trim().split(/\s+/).pop().toLowerCase();
  const guess = accounts.find((u) => u.name.toLowerCase() === p.name.toLowerCase())
    || accounts.find((u) => last(u.name) === last(p.name) && u.name.toLowerCase()[0] === p.name.toLowerCase()[0]);
  const root = document.getElementById("modalRoot");
  const options = (filter) => accounts.filter((u) => !filter || u.name.toLowerCase().includes(filter) || (u.email || "").toLowerCase().includes(filter))
    .map((u) => `<option value="${u.id}" ${guess && guess.id === u.id ? "selected" : ""}>${esc(lastFirst(u.name))}${u.email ? ` (${esc(u.email)})` : ""}</option>`).join("");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="lpTitle" style="max-width:540px;">
        <h2 id="lpTitle" style="font-size:1.15rem;margin:0 0 6px;">Link ${esc(p.name)}'s past records</h2>
        <p style="margin:0 0 10px;color:var(--muted-foreground);font-size:.88rem;">${p.records.length === 1 ? "This course goes" : p.records.length + " courses go"} onto the transcript of the account you pick. Only approved accounts are listed.</p>
        <ul class="pr-courses" style="margin:0 0 12px;">${p.records.map((r) => `<li><span>${esc(r.courseTitle)} <span class="ts-small">· ${esc(r.term)}</span></span><span class="ts-grade">${esc(r.grade)}</span></li>`).join("")}</ul>
        <label for="lpSearch">Find the account</label>
        <input type="search" id="lpSearch" placeholder="Type a name or email">
        <select id="lpPick" size="6" style="width:100%;margin-top:6px;">${options("")}</select>
        <div class="form-actions">
          <button class="btn btn-primary" id="lpSave">Put on This Transcript</button>
          <button class="btn btn-ghost" id="lpClose">Cancel</button>
        </div>
      </div>
    </div>`;
  const pick = document.getElementById("lpPick");
  document.getElementById("lpSearch").addEventListener("input", (e) => { pick.innerHTML = options(e.target.value.trim().toLowerCase()); });
  document.getElementById("lpClose").addEventListener("click", closeModal);
  document.getElementById("lpSave").addEventListener("click", async () => {
    const u = accounts.find((x) => x.id === pick.value);
    if (!u) { toast("Pick the account first."); pick.focus(); return; }
    if (!(await askConfirm(`Put ${p.records.length} past course${p.records.length === 1 ? "" : "s"} on ${u.name}'s transcript?`))) return;
    run(async () => { await DB.linkPastRecords(p.records.map((r) => r.id), u.id); closeModal(); }, null,
      { success: `Added to ${u.name}'s transcript.` });
  });
}

// ---------------------------------------------------------------------------
// Backups & service health (Settings, Admins only)
// ---------------------------------------------------------------------------
const STATUS_LABEL_TEXT = { email: "Email notifications", backup: "Nightly backups", backup_email: "Weekly backup email" };
async function renderBackupsCard() {
  const wrap = document.getElementById("backupsCard");
  if (!wrap) return;
  wrap.innerHTML = `<p class="field-hint" style="margin:0;">Loading…</p>`;
  let list = [], status = [];
  try { [list, status] = await Promise.all([DB.listBackups(), DB.serviceStatus()]); }
  catch (e) { if (document.getElementById("backupsCard")) wrap.innerHTML = `<p class="field-hint" style="margin:0;">${esc(friendlyError(e))}</p>`; return; }
  if (!document.getElementById("backupsCard")) return;
  const nightly = list.filter((b) => b.kind === "nightly");
  const last = nightly[0];
  const when = (t) => new Date(t).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const st = (k) => status.find((s) => s.key === k);
  const emailSt = st("email");
  wrap.innerHTML = `
    <div class="health-list">
      <div class="health-row ${last ? "ok" : "wait"}"><span class="health-dot"></span><div><strong>Nightly backup</strong><div class="field-hint" style="margin:2px 0 0;">${last ? `Last taken ${esc(when(last.taken_at))} · the last ${nightly.length} night${nightly.length === 1 ? " is" : "s are"} kept here` : "The first one is taken tonight at 2 AM."}</div></div></div>
      <div class="health-row ${st("backup_email") ? (st("backup_email").ok ? "ok" : "bad") : "wait"}"><span class="health-dot"></span><div><strong>Weekly copy emailed to truenorthbaptist1@gmail.com</strong><div class="field-hint" style="margin:2px 0 0;">${st("backup_email") ? esc(st("backup_email").ok ? "Last sent " + when(st("backup_email").updated_at) : st("backup_email").detail) : "Sent Sunday mornings once email is set up."}</div></div></div>
      <div class="health-row ${emailSt ? (emailSt.ok ? "ok" : "bad") : "wait"}"><span class="health-dot"></span><div><strong>Email notifications</strong><div class="field-hint" style="margin:2px 0 0;">${emailSt ? (emailSt.ok ? "Working · " + esc(when(emailSt.updated_at)) : esc(emailSt.detail)) : "Not used yet."}</div></div></div>
    </div>
    <div class="form-actions" style="flex-wrap:wrap;">
      <button class="btn btn-gold btn-sm" id="bkNow">${icon("download")} Download a Backup Now</button>
      ${last ? `<button class="btn btn-ghost btn-sm" id="bkLast">Download Last Night's</button>` : ""}
    </div>
    <p class="field-hint" style="margin:10px 0 0;">A backup holds every account, course, assignment, grade, transcript, message, and discussion post — everything except uploaded files (course PDFs and turned-in files stay safely in storage). Keep downloaded copies somewhere safe, like the church Google Drive. To put data back from a backup, see "Restoring from a backup" in SETUP.md.</p>`;
  const dl = (id, label) => run(async () => {
    const data = await DB.downloadBackup(id);
    saveBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), `tnbbi-backup-${label}.json`);
  }, () => renderBackupsCard(), { reload: false, success: "Backup downloaded." });
  document.getElementById("bkNow").addEventListener("click", () => dl(null, todayStr()));
  const bl = document.getElementById("bkLast");
  if (bl) bl.addEventListener("click", () => dl(last.id, String(last.taken_at).slice(0, 10)));
}

// The Help page lives in js/help.js.

// ---------------------------------------------------------------------------
// First-time guided tour: one box at a time, pointing at each feature.
// ---------------------------------------------------------------------------
// Small pictures shown inside some tour boxes, to show what a feature looks
// like before you go find it.
function tourArt(kind) {
  const bar = (pct) => `<span class="ta-bar"><span style="width:${pct}%"></span></span>`;
  const rows = (list) => list.map(([a, b, c]) => `<div class="ta-row">${a}<span class="ta-grow">${b}</span>${c || ""}</div>`).join("");
  const arts = {
    tabs: `<div class="ta-tabs"><span class="on">Overview</span><span>Lectures</span><span>Materials</span><span>Assignments</span></div>`,
    manageTabs: `<div class="ta-tabs"><span class="on">Overview</span><span>Students</span><span>Lectures</span><span>Materials</span><span>Assignments</span></div>`,
    attend: `<div class="ta-choices"><span>${icon("users")}Classroom</span><span class="on">${icon("video")}Live online</span><span>${icon("video")}Recorded</span></div>`,
    lectures: rows([[icon("check"), "Lesson 1 · The Inspiration of Scripture", bar(100)], [icon("video"), "Lesson 2 · The Preservation of Scripture", `<span class="ta-pill">Up next</span>`], [icon("video"), "Lesson 3 · The Canon", bar(0)]]),
    materials: rows([[icon("note"), "Syllabus", `<span class="ta-count">1</span>`], [icon("note"), "Quizzes", `<span class="ta-count">12</span>`], [icon("note"), "Study Questions", `<span class="ta-count">10</span>`], [icon("lock"), "Quiz 1 Answer Key", `<span class="ta-pill ta-pill-gray">Teachers only</span>`]]),
    weekly: rows([[icon("calendar"), "Week 1 · Quiz 1", `<span class="ta-count">Sep 8</span>`], [icon("calendar"), "Week 2 · Quiz 2", `<span class="ta-count">Sep 15</span>`], [icon("calendar"), "Week 3 · Quiz 3", `<span class="ta-count">Sep 22</span>`]]),
    phone: `<div class="ta-choices"><span>${icon("calendar")}Phone calendar</span><span>${icon("bell")}Reminders</span><span>${icon("mail")}Email</span></div>`,
    writing: `<div class="ta-doc"><div class="ta-toolbar"><b>B</b><i>I</i><span>¶</span><span>📖 Scripture</span></div><p>For the word of God is quick, and powerful, and sharper than any twoedged sword… <em>(Hebrews 4:12)</em></p></div>`,
    search: `<div class="ta-search">${icon("search")}<span>How do I turn in my homework?</span></div>`,
  };
  return arts[kind] ? `<div class="tour-art" aria-hidden="true">${arts[kind]}</div>` : "";
}

// Steps marked isNew also make up the short "What's new" tour that people
// who already took the full tour are shown once.
const WHATS_NEW_SINCE = "2026-10-09T23:45:00Z"; // raise when adding new isNew steps
function tourSteps(mode) {
  const first = (currentUser.name || "").trim().split(/\s+/)[0];
  const tile = (k) => `.tile[data-goto="${k}"]`;
  const hi = `Welcome${first ? ", " + first : ""}!`;
  let steps;
  if (role === "student") steps = [
    { title: hi, text: "This short tour shows you around the True North Baptist Church Bible Institute. Tap <strong>Next</strong> to go step by step, or <strong>Skip</strong> any time — you can take it again from Help." },
    { el: "#thisWeek", isNew: true, title: "This Week", text: "Start here. Your next class, everything due in the next seven days (with a ✓ once it's turned in), and the next lecture to watch. Tap any item to go straight to it." },
    { el: tile("courses"), title: "My Courses", text: "Your classes live here. Classes you can join are listed too — tap <strong>Request Enrollment</strong>." },
    { isNew: true, art: "tabs", title: "Inside each course", text: "A course opens into tabs: <strong>Overview</strong> (teacher, schedule, where it meets, announcements), <strong>Lectures</strong>, <strong>Materials</strong>, and <strong>Assignments</strong>." },
    { isNew: true, art: "materials", title: "Materials, in order", text: "Handouts are grouped — Syllabus, Quizzes, Study Questions, Lessons and more — listed week by week, and searchable. Tap any one to read it right in the page." },
    { isNew: true, art: "attend", title: "Attend from anywhere", text: "In hybrid and online courses, choose how you'll attend: in the classroom, <strong>live online</strong>, or by <strong>recorded lecture</strong>. Online attendance is counted for you — and if you miss class, watching the recording within 7 days makes it up." },
    { isNew: true, art: "lectures", title: "Lectures in series order", text: "The Lectures tab lists each class first to last. A bar shows how much you've watched, and <strong>Up next</strong> marks where to pick up." },
    { el: tile("calendar"), title: "Calendar", text: "Every class day and due date in one place. Tap a day to see what's due — and tap <strong>Add to My Phone's Calendar</strong> to keep it all in your phone." },
    { isNew: true, art: "writing", title: "Turning in work", text: "Open an assignment and attach a file (or a photo of handwritten work) — or write it right here. Tap <strong>📖 Scripture</strong> to drop in any KJV passage; your draft is saved as you type." },
    { el: tile("messages"), isNew: true, title: "Messages", text: "Private conversations with your teachers, and each class's discussion board — together in one place." },
    { el: tile("grades"), isNew: true, title: "Grades", text: "Every score and your teacher's comments — and <strong>My Transcript</strong>, your permanent record, at the top." },
    { el: tile("studyBible"), title: "Study Bible", text: "The whole King James Bible with Strong's Concordance. Tap any word to study the original Hebrew or Greek; search, highlight, and follow cross references." },
    { el: tile("resourceLibrary"), isNew: true, title: "Library", text: "Books and studies from the church library and Drive — and the <strong>Lecture Archive</strong> of past courses' recorded classes, open for study." },
    { el: "#notifBell", title: "Notifications", text: "New messages, grades, announcements, and class cancellations show up here." },
    { el: "#myProfileBtn", isNew: true, art: "phone", title: "My Profile", text: "Tap your name to add your photo and details. Under <strong>Notifications</strong>, choose your emails and phone alerts, and reminders before work is due." },
    { el: "#textSizeToggle", isNew: true, title: "Easy on the eyes", text: "Tap <strong>Aa</strong> for larger text. The moon beside it switches to night view; the site always starts in day view when you sign in." },
    { el: "#helpBtn", isNew: true, art: "search", title: "Help is always here", text: "Tap <strong>?</strong> and ask in your own words — the best answers come up as you type. You can take this tour again there too. May the Lord bless your studies!" },
  ];
  else steps = [
    { title: hi, text: "This short tour shows you the teacher's side of the Institute. Tap <strong>Next</strong> to go step by step, or <strong>Skip</strong> any time — you can take it again from Help." },
    { el: "#needsAttention", isNew: true, title: "Needs Your Attention", text: "Start here. Work to grade, attendance not taken, enrollment requests, unread messages, new sign-ups, and courses still being set up — tap any item to go straight there." },
    { el: tile("catalogue"), title: "Courses", text: "Every course. Open one you teach to run it. At class time, <strong>Take Attendance</strong> appears right on this tile." },
    { isNew: true, art: "manageTabs", title: "Running a course", text: "A course opens into tabs: <strong>Overview</strong> (details, schedule, announcements, cancel a class), <strong>Students</strong> (roster and requests), <strong>Lectures</strong>, <strong>Materials</strong>, and <strong>Assignments</strong>. A new course shows a <strong>set-up checklist</strong> that ticks itself as you go. <strong>Copy for a New Term</strong> brings it all forward next time." },
    { isNew: true, art: "materials", title: "Course materials", text: "Add many documents at once; they group and sort themselves by name. Check <strong>Teachers only</strong> on answer keys — students never see them." },
    { isNew: true, art: "weekly", title: "Assignments with their documents", text: "Attach a worksheet or quiz to each assignment. Set up a weekly series and the quizzes are handed out one per week, in order." },
    { isNew: true, art: "lectures", title: "Lectures & live classes", text: "For hybrid and online courses, paste the YouTube playlist link. New recordings appear on their own, in lesson order, and online students are told. Live classes and online attendance take care of themselves." },
    { el: tile("calendar"), title: "Calendar", text: "Your class days and due dates. Tap a day to see who has turned work in, take attendance, or cancel that class. Add it to your phone's calendar too." },
    { el: tile("grading"), title: "Grading", text: "Each course's grade sheet; turned-in files open right in the page. At the end of a course, <strong>Record Final Grades</strong> puts them on students' permanent transcripts." },
    { el: tile("messages"), title: "Message Inbox", text: "Private messages from your students." },
    { el: tile("discussion"), title: "Discussion Board", text: "Lead your classes' discussions." },
    { el: tile("studyBible"), title: "Study Bible", text: "The KJV with Strong's Concordance — and the <strong>📖 Scripture</strong> button inserts any passage straight into what you write." },
    { el: tile("resourceLibrary"), isNew: true, title: "Resource Library", text: "The church library and Drive by topic or course, plus the <strong>Lecture Archive</strong> of past courses' recordings." },
    ...(isAdmin() ? [{ el: tile("transcripts"), isNew: true, title: "Transcripts", text: "Every student's permanent record — including courses from before the site, brought in under <strong>Past Records</strong>. Download any as a PDF." },
      { el: tile("settings"), title: "Settings", text: "Approve new sign-ups, set each person's level, and check the nightly backups." }]
      : [{ el: tile("transcripts"), isNew: true, title: "Transcripts", text: "Final grades from your courses, and every student's courses from before the site." },
        { el: tile("settings"), title: "Settings", text: "Approve new sign-ups waiting to join." }]),
    { el: "#notifBell", title: "Notifications", text: "Enrollment requests, messages, and new sign-ups show up here." },
    { el: "#myProfileBtn", art: "phone", title: "My Profile", text: "Your photo and details — and under <strong>Notifications</strong>, email and phone alerts, including a reminder 5 minutes before class if attendance hasn't been taken." },
    { el: "#textSizeToggle", isNew: true, title: "Easy on the eyes", text: "<strong>Aa</strong> enlarges the text. The moon switches to night view; the site always starts in day view when you sign in." },
    { el: "#helpBtn", isNew: true, art: "search", title: "Help is always here", text: "Tap <strong>?</strong> and ask in your own words — the best answers come up as you type, with a full guide for teachers. Thank you for teaching others also!" },
  ];
  if (mode !== "new") return steps;
  return [{ title: `What's new${first ? ", " + first : ""}`, text: "We've added a good deal to the Institute site. Here's a quick look — tap <strong>Next</strong>, or <strong>Skip</strong> any time. You can see it again from Help." }]
    .concat(steps.filter((st) => st.isNew).map((st) => Object.assign({}, st, { isNew: false })));
}
let tourState = null;
function maybeStartTour() {
  if (window.TNBBI_TEST_NO_TOUR || tourState || !currentUser) return;
  const me = users.find((u) => u.id === currentUser.id);
  if (!me || me.status !== "active") return;
  if (view !== "home") return;
  let doneHere = false, newHere = false;
  try {
    doneHere = !!localStorage.getItem("tnbbi-tour-done:" + currentUser.id);
    newHere = localStorage.getItem("tnbbi-whatsnew:" + currentUser.id) === WHATS_NEW_SINCE;
  } catch (e) { /* ignore */ }
  if (!me.tourSeenAt && !doneHere) { setTimeout(() => startTour(false), 500); return; }
  // Took the tour before this round of updates? Show what's new, once.
  if (me.tourSeenAt && me.tourSeenAt < WHATS_NEW_SINCE && !newHere) setTimeout(() => startTour(false, "new"), 500);
}
function startTour(replay, mode) {
  endTour(false);
  const steps = tourSteps(mode).filter((s) => !s.el || document.querySelector(s.el));
  tourState = { steps, i: 0, replay, mode };
  document.addEventListener("keydown", tourKeys);
  window.addEventListener("resize", drawTour);
  drawTour();
}
function tourKeys(e) {
  if (!tourState) return;
  if (e.key === "Escape") endTour(true);
  else if (e.key === "ArrowRight") tourGo(1);
  else if (e.key === "ArrowLeft") tourGo(-1);
}
function tourGo(d) {
  if (!tourState) return;
  const n = tourState.i + d;
  if (n >= tourState.steps.length) { endTour(true); toast("You're all set. Help is under the ? button any time.", "success"); return; }
  tourState.i = Math.max(0, n);
  drawTour();
}
function endTour(markSeen) {
  const root = document.getElementById("tourRoot");
  if (root) root.remove();
  document.removeEventListener("keydown", tourKeys);
  window.removeEventListener("resize", drawTour);
  const was = tourState;
  tourState = null;
  if (markSeen && was && currentUser) {
    try {
      localStorage.setItem("tnbbi-tour-done:" + currentUser.id, "1");
      localStorage.setItem("tnbbi-whatsnew:" + currentUser.id, WHATS_NEW_SINCE);
    } catch (e) { /* ignore */ }
    // Either tour counts as having seen everything up to now.
    const me = users.find((u) => u.id === currentUser.id);
    if (me && (!me.tourSeenAt || me.tourSeenAt < WHATS_NEW_SINCE)) { me.tourSeenAt = new Date().toISOString(); DB.markTourSeen().catch(() => {}); }
  }
}
function drawTour() {
  if (!tourState) return;
  const step = tourState.steps[tourState.i];
  let root = document.getElementById("tourRoot");
  if (!root) { root = document.createElement("div"); root.id = "tourRoot"; document.body.appendChild(root); }
  const target = step.el ? document.querySelector(step.el) : null;
  if (target) target.scrollIntoView({ block: "center", behavior: "instant" });
  const r = target ? target.getBoundingClientRect() : null;
  const pad = 8;
  const last = tourState.i === tourState.steps.length - 1;
  root.innerHTML = `
    <div class="tour-shade ${r ? "" : "tour-shade-full"}"></div>
    ${r ? `<div class="tour-spot" style="top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;"></div>` : ""}
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourText">
      <div class="tour-count">${tourState.mode === "new" ? "What's new · " : ""}${tourState.i + 1} of ${tourState.steps.length}${step.isNew ? ` <span class="tour-new">New</span>` : ""}</div>
      <h3 id="tourTitle">${esc(step.title)}</h3>
      ${step.art ? tourArt(step.art) : ""}
      <p id="tourText">${step.text}</p>
      <div class="tour-actions">
        <button class="btn btn-ghost btn-sm" id="tourSkip">${last ? "Close" : "Skip tour"}</button>
        <span style="flex:1"></span>
        ${tourState.i > 0 ? `<button class="btn btn-ghost btn-sm" id="tourBack">Back</button>` : ""}
        <button class="btn btn-gold btn-sm" id="tourNext">${last ? "Finish" : tourState.i === 0 ? (tourState.mode === "new" ? "Show Me" : "Show Me Around") : "Next"}</button>
      </div>
    </div>`;
  const card = root.querySelector(".tour-card");
  // Place the card below the highlighted item if there's room, else above;
  // centered when there's nothing to point at.
  const vw = window.innerWidth, vh = window.innerHeight;
  const cw = Math.min(step.art ? 400 : 360, vw - 24);
  card.style.width = cw + "px";
  const ch = card.offsetHeight;
  if (!r) { card.style.left = Math.round((vw - cw) / 2) + "px"; card.style.top = Math.round(Math.max(16, (vh - ch) / 2)) + "px"; }
  else {
    const below = r.bottom + pad + 12;
    const top = below + ch < vh - 8 ? below : Math.max(8, r.top - pad - 12 - ch);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
    card.style.top = Math.round(top) + "px";
    card.style.left = Math.round(left) + "px";
  }
  document.getElementById("tourNext").addEventListener("click", () => tourGo(1));
  document.getElementById("tourSkip").addEventListener("click", () => endTour(true));
  const back = document.getElementById("tourBack");
  if (back) back.addEventListener("click", () => tourGo(-1));
  document.getElementById("tourNext").focus();
}
