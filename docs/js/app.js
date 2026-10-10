// ============================================================================
// True North Baptist Church Bible Institute — the site's screens.
//
// Ported from the approved preview. The screens are the same; what changed
// is that every change is now saved to the real database (see js/data.js),
// sign-in is real (Supabase Auth: email/password, Google, password reset),
// files are really stored, and the Study Bible reads all 66 books.
// ============================================================================
let role = "student";

function icon(name) {
  const icons = {
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H12v18H5.5A1.5 1.5 0 0 1 4 19.5v-15Z"/><path d="M20 4.5A1.5 1.5 0 0 0 18.5 3H12v18h6.5a1.5 1.5 0 0 0 1.5-1.5v-15Z"/>',
    library: '<path d="M4 4h4v17H4z"/><path d="M10 4h4v17h-4z"/><path d="m16.5 4.3 3.9.9-3.6 16.6-3.9-.9z"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 13.2c2.7.3 4.9 2.6 4.9 5.4"/>',
    note: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4"/><path d="M8 12h8M8 16h5"/>',
    cap: '<path d="M12 3 1 8l11 5 9-4.09V17h2V8L12 3Z"/><path d="M5 10.5V16c0 1.5 3 3 7 3s7-1.5 7-3v-5.5l-7 3.18-7-3.18Z"/>',
    mail: '<path d="M4 5h16v14H4z"/><path d="m4 6 8 7 8-7"/>',
    upload: '<path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M5 21h14"/>',
    chat: '<path d="M4 5h16v10H9l-5 4z"/><circle cx="9" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".9" fill="currentColor" stroke="none"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.97 7.97 0 0 0 0-2l2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15 3h-4l-.3 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.97 7.97 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.8 1.7 1L11 21h4l.3-2.6c.6-.2 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6Z"/>',
    warning: '<path d="M12 2.7 1.5 21h21L12 2.7Z"/><path d="M12 9.5v5"/><circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    check: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M8 3v3M16 3v3"/><path d="m8.5 13.5 2.5 2.5 4.5-5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9v.5"/><path d="M12 17.2h.01"/>',
    scroll: '<path d="M7 3h11v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2h11v2a3 3 0 0 0 3 3"/><path d="M7 3a2 2 0 0 0-2 2v11"/><path d="M9 8h6M9 12h6"/>',
    megaphone: '<path d="M3 10v4h3l9 5V5L6 10H3Z"/><path d="M18 9a4 4 0 0 1 0 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    textsize: '<path d="M3 19 8.5 5h1L15 19"/><path d="M5 14h8"/><path d="M15 19l3.2-8h.6L22 19"/><path d="M16.2 16h4.6"/>',
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    cancel: '<circle cx="12" cy="12" r="9"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7"/>',
    shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 8 7.5 9 4.3-1 7.5-4.5 7.5-9V6L12 3Z"/><path d="m9 12 2 2 4-4"/>',
    bible: '<path d="M12 4.5c-2.2-1.2-5-1.6-8-1v15c3 0 5.8.4 8 1.6M12 4.5c2.2-1.2 5-1.6 8-1v15c-3 0-5.8.4-8 1.6M12 4.5v16"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.note}</svg>`;
}

// Filled from the database by loadAll() in js/data.js.
let courses = [];
let users = [];
let userTab = "active";
let userSort = "name";

const STATUS_LABEL = {
  not_started: ["Not started", "pill-gray"],
  in_progress: ["In progress", "pill-navy"],
  submitted: ["Submitted", "pill-gold"],
  graded: ["Graded", "pill-green"],
};
const TYPE_LABEL = { reading: "Reading", video: "Video", link: "Link", note: "Note", syllabus: "Syllabus", textbook: "Textbook", material: "Material" };

const LEVELS = ["100", "200", "300", "400", "500", "600"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// --- Dates -----------------------------------------------------------------
// Due dates and start dates are calendar days ("2026-09-16"), not moments in
// time. Parsing them as local days (not UTC midnight) keeps them from
// showing a day early anywhere west of London — Alaska included.
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDay(s) {
  if (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00");
  return new Date(s);
}
function todayStr() {
  return localISO(new Date());
}

// An archived course is never live, whatever its schedule says — archiving
// takes it out of circulation for everyone until a faculty member
// reactivates it from the Courses page's Archived tab.
function isLive(c) {
  if (c.archived) return false;
  return !!(c.schedule && c.schedule.mode && c.schedule.startDate && c.schedule.startDate <= todayStr());
}

function courseStatusLabel(c) {
  if (c.archived) {
    return { text: "Archived", cls: "pill-gray" };
  }
  if (!c.schedule || !c.schedule.mode || !c.schedule.startDate) {
    return { text: "Needs scheduling", cls: "pill-gray" };
  }
  if (isLive(c)) {
    return { text: "Live", cls: "pill-green" };
  }
  const d = new Date(c.schedule.startDate + "T00:00:00");
  return { text: `Starts ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, cls: "pill-navy" };
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function scheduleLine(c) {
  if (!c.schedule || !c.schedule.days || !c.schedule.days.length) return "";
  const days = c.schedule.days.join("/");
  const weeks = c.schedule.weeks ? `${c.schedule.weeks} weeks · ` : "";
  return `${weeks}${days} ${fmtTime(c.schedule.time)}`;
}

// Every assignment tracks one submission per enrolled student (status, an
// attached file, and a score/feedback once graded) — this backfills a
// default row for anyone on the roster who doesn't have one yet, so adding
// a student to a course after an assignment exists still works.
function ensureSubmissions(course, assignment) {
  if (!assignment.submissions) assignment.submissions = [];
  course.studentIds.forEach((sid) => {
    if (!assignment.submissions.some((s) => s.studentId === sid)) {
      assignment.submissions.push({ studentId: sid, status: "not_started", fileName: null, writtenContent: null, submittedAt: null, score: null, feedback: "" });
    }
  });
  // Only students currently on the roster count toward a course's numbers.
  return assignment.submissions.filter((s) => course.studentIds.includes(s.studentId));
}

function getSubmission(course, assignment, studentId) {
  ensureSubmissions(course, assignment);
  return assignment.submissions.find((s) => s.studentId === studentId);
}

// Late is only ever a flag for a faculty member to weigh, never an
// automatic penalty — grading stays fully case-by-case (the Score field
// already accepts any value 0..points, on-time or not). This just surfaces
// the fact so it's not missed while grading.
function isLateSubmission(assignment, sub) {
  const c = sub && courses.find((x) => x.id === assignment.courseId);
  const due = c ? dueFor(c, assignment, sub.studentId) : assignment.due;
  return !!(sub && sub.submittedAt && due && sub.submittedAt > due);
}

function userName(id) {
  const u = users.find((x) => x.id === id);
  return u ? u.name : "Unknown";
}

// Attributes faculty-authored content (discussion posts, PDF export
// "exported by" lines) to whoever is actually signed in. Falls back to the
// first faculty account only if something calls this before sign-in.
function currentFacultyId() {
  if (currentUser && currentUser.role === "faculty") return currentUser.id;
  const f = users.find((u) => u.role === "faculty");
  return f ? f.id : null;
}

// ---------------------------------------------------------------------------
// Course teachers. Mirrors the database's rules exactly (the database is
// what actually enforces them — these only decide what the page shows):
//   - a course's teacher is its assigned instructor while they're active
//     faculty; with no teacher, the Admins cover it
//   - teaching a course = seeing its grades, private messages, discussion
//   - managing a course (schedule, roster, requests, assignments,
//     materials) = its teacher, or any Admin
//   - before the start date the teacher can hand the course to another
//     faculty member; after it, only an Admin can change the teacher
// ---------------------------------------------------------------------------
function courseTeacher(c) {
  return users.find((u) => u.id === c.facultyId && u.role === "faculty" && u.status !== "inactive") || null;
}
function iTeach(c) {
  if (!currentUser || !c) return false;
  const t = courseTeacher(c);
  return t ? t.id === currentUser.id : !!currentUser.superAdmin;
}
function iManage(c) {
  return !!(currentUser && c && (currentUser.superAdmin || iTeach(c)));
}
function courseStarted(c) {
  return !!(c.schedule && c.schedule.startDate && c.schedule.startDate <= todayStr());
}
function canChangeTeacher(c) {
  if (!currentUser) return false;
  if (currentUser.superAdmin) return true;
  return role === "faculty" && c.facultyId === currentUser.id && !courseStarted(c);
}
function teacherLabel(c) {
  const t = courseTeacher(c);
  return t ? t.name : "No teacher yet";
}

function roleTag(id) {
  const u = users.find((x) => x.id === id);
  return u && u.role === "faculty" ? `<span class="pill pill-gold" style="margin-left:6px;">Faculty</span>` : "";
}

let view = "home";
let activeCourseId = null;
let flashMessage = "";
let builderFiles = [];
let currentStudentId = null; // set to the signed-in student's id at sign-in
let catalogueTab = "active";

// --- Calendar ---------------------------------------------------------
// The grid calendar keeps its own "which month/fortnight am I looking at"
// cursor, independent of today's date, so Prev/Next can browse freely and
// a click on Today always snaps back.
let calendarMode = "month"; // "month" | "twoweek"
let calendarCursor = todayStr();

// --- Submit Work / assignment locks ------------------------------------
// "Submit anytime" (the default) is always open — the due date is a target,
// never a hard block. A locked assignment opens on its Opens On date. The
// database enforces the same rule, so it can't be bypassed.
function assignmentLock(a) {
  if (!a || a.submitAnytime !== false || !a.openDate) return { locked: false };
  const locked = todayStr() < a.openDate;
  return { locked, opensOn: a.openDate };
}
let submitPickCourseId = "";
let submitPickAssignmentId = "";

// --- Admins ------------------------------------------------------
// A small, separate tier on top of the student/faculty role (max 4). The
// church's own Google account is the bootstrap: the first time it signs in
// WITH GOOGLE while no active Admin exists, it becomes one (and
// Faculty). After that, only Admins can add or remove others. If
// every Admin is ever removed, the church account's next Google
// sign-in restores the role — the Institute can never lock itself out.
// The database enforces all of this (see supabase/schema.sql).
const BOOTSTRAP_ADMIN_EMAIL = (TNBBI_CONFIG.bootstrapAdminEmail || "").toLowerCase();
const MAX_SUPER_ADMINS = 4;
function countSuperAdmins() { return users.filter((u) => u.superAdmin).length; }

// Three levels, shown as one badge: Student, Faculty, Admin. (In the
// database an Admin is a Faculty account with the super_admin flag.)
//   Faculty — create and edit courses, schedules, rosters, assignments,
//             materials; approve sign-ups and enrollment requests; archive.
//   Admin   — everything Faculty can do, plus change anyone's level,
//             deactivate/reactivate or delete accounts, and delete courses.
function userLevel(u) { return !u ? "student" : u.superAdmin ? "admin" : u.role === "faculty" ? "faculty" : "student"; }
const LEVEL_LABEL = { student: "Student", faculty: "Faculty", admin: "Admin" };
function isAdmin() { return !!(currentUser && currentUser.superAdmin); }
function levelPill(u) {
  const l = userLevel(u);
  return `<span class="pill ${l === "admin" ? "pill-gold" : l === "faculty" ? "pill-navy" : "pill-gray"}">${l === "admin" ? "★ " : ""}${LEVEL_LABEL[l]}</span>`;
}
function staffEyebrow() { return isAdmin() ? "Admin" : "Faculty"; }

// --- Sign in / Sign up -----------------------------------------------------
// Real accounts (Supabase Auth). Every new account starts as a student —
// only faculty can promote someone, from Settings → Users & Roles, and the
// database refuses any other route to it.
let currentUser = null;
let authMode = "signin"; // signin | signup | forgot | forgotSent | checkEmail | newPassword
let authError = "";
let authInfo = "";
let pendingEmail = "";
let recoveringPassword = new URLSearchParams(location.search).get("reset") === "1";

// A reminder notification's link: ?attendance=<course>&date=<YYYY-MM-DD>.
// Kept through sign-in (including a Google sign-in, which leaves and comes
// back to the page) and opened once the teacher is signed in.
const ATT_LINK_KEY = "tnbbi-open-attendance";
let pendingAttendanceLink = readAttendanceLink(location.href);
// Also: ?assignment=<id> (a student's due-date reminder, or an item in their
// phone's calendar) and ?calendar=<YYYY-MM-DD> (several things due that day).
function readAttendanceLink(href) {
  try {
    const q = new URL(href, location.origin).searchParams;
    if (q.get("attendance") || q.get("assignment") || q.get("calendar")) {
      const v = q.get("attendance") ? { course: q.get("attendance"), date: q.get("date") || "" }
        : q.get("assignment") ? { assignment: q.get("assignment") }
        : { calendar: q.get("calendar") };
      try { sessionStorage.setItem(ATT_LINK_KEY, JSON.stringify(v)); } catch (e) { /* private mode */ }
      return v;
    }
    const saved = sessionStorage.getItem(ATT_LINK_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) { return null; }
}
function handlePendingAttendanceLink() {
  if (!pendingAttendanceLink || !currentUser) return;
  const link = pendingAttendanceLink;
  pendingAttendanceLink = null;
  try { sessionStorage.removeItem(ATT_LINK_KEY); } catch (e) { /* ignore */ }
  const url = new URL(location.href);
  ["attendance", "date", "assignment", "calendar"].forEach((k) => url.searchParams.delete(k));
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  if (link.calendar) {
    calendarCursor = /^\d{4}-\d{2}-\d{2}$/.test(link.calendar) ? link.calendar : todayStr();
    view = "calendar"; activeCourseId = null; renderNav(); renderMain();
    return;
  }
  if (link.assignment) {
    const c = courses.find((x) => x.assignments.some((a) => a.id === link.assignment));
    const a = c && c.assignments.find((x) => x.id === link.assignment);
    if (!a) { toast("That assignment couldn't be found."); return; }
    if (role === "student" && c.studentIds.includes(currentStudentId)) {
      calendarCursor = a.due;
      view = "calendar"; activeCourseId = null; renderNav(); renderMain();
      openSubmitModal(c, a, currentStudentId, () => renderMain());
    } else {
      calendarCursor = a.due;
      view = "calendar"; activeCourseId = null; renderNav(); renderMain();
      const rows = calendarRowsByDate()[a.due] || [];
      openCalendarDayModal(a.due, rows, calendarClassesByDate()[a.due] || [], () => renderMain());
    }
    return;
  }
  const c = courses.find((x) => x.id === link.course);
  if (!c) { toast("That course couldn't be found."); return; }
  if (role !== "faculty" || !iTeach(c)) { toast("That attendance link is for the course's teacher."); return; }
  openAttendance(c.id, /^\d{4}-\d{2}-\d{2}$/.test(link.date) ? link.date : null, "home");
}
// Any link inside the site: an assignment/calendar/attendance link (above),
// or a course, message, transcript… link (features.js).
function followLink(href) {
  try {
    const q = new URL(href, location.origin).searchParams;
    if (q.get("attendance") || q.get("assignment") || q.get("calendar")) {
      pendingAttendanceLink = readAttendanceLink(href);
      handlePendingAttendanceLink();
      return;
    }
  } catch (e) { return; }
  openSiteLink(href);
}
// The site already open when a notification is tapped: the phone hands us
// the link instead of opening a second copy.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "tnbbi-open" && e.data.url) followLink(e.data.url);
  });
}
let sessionUserId = null;
let pollTimer = null;
let viewTimers = [];

function siteUrl() {
  return location.origin + location.pathname;
}

// --- Saving: busy state, error messages, reload-and-redraw -------------
let busyCount = 0;
function setBusy(on) {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  document.body.classList.toggle("is-busy", busyCount > 0);
}

function toast(message, kind = "error") {
  let wrap = document.getElementById("toastWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toastWrap";
    wrap.className = "toast-wrap";
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => { el.classList.add("toast-out"); setTimeout(() => el.remove(), 300); }, kind === "error" ? 6500 : 3200);
}

// Runs a change against the database, then reloads everything and redraws.
// `after` redraws a specific spot (default: the whole current page). If the
// save fails, nothing on screen changes and the person sees why.
async function run(work, after, opts = {}) {
  if (busyCount > 0 && !opts.allowConcurrent) return false;
  const y = window.scrollY;
  setBusy(true);
  try {
    await work();
    if (opts.reload !== false) await loadAll();
    setBusy(false);
    if (after) after(); else renderMain();
    renderNotifBell();
    requestAnimationFrame(() => window.scrollTo(0, y));
    if (opts.success) toast(opts.success, "success");
    return true;
  } catch (e) {
    console.warn(e);
    setBusy(false);
    toast(friendlyError(e));
    return false;
  }
}

function closeModal() {
  document.getElementById("modalRoot").innerHTML = "";
  document.body.classList.remove("rte-full-open");
}

// Every modal closes on Escape or a click on the dimmed backdrop — unless
// it's mid-save.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && busyCount === 0 && !document.querySelector(".doc-viewer") && document.querySelector("#modalRoot .modal-backdrop") && !document.querySelector("#modalRoot .no-dismiss")) closeModal();
});
document.addEventListener("mousedown", (e) => {
  if (busyCount === 0 && e.target.classList && e.target.classList.contains("modal-backdrop") && !e.target.classList.contains("no-dismiss")) closeModal();
});

// --- Notifications (the bell) ------------------------------------------
// Created by the database itself when something happens — a new message,
// a grade posted, an enrollment request, approval, or denial.
let notifPanelOpen = false;

function myNotifications() {
  if (!currentUser) return [];
  return notifications.filter((n) => n.toUserId === currentUser.id);
}

function renderNotifBell() {
  const el = document.getElementById("notifBellWrap");
  if (!el) return;
  const mine = myNotifications();
  const unread = mine.filter((n) => !n.read).length;
  el.innerHTML = `
    <button id="notifBell" class="icon-btn" aria-label="Notifications${unread ? ` (${unread} unread)` : ""}" aria-expanded="${notifPanelOpen}">${icon("bell")}${unread ? `<span class="notif-badge">${unread > 9 ? "9+" : unread}</span>` : ""}</button>
    ${notifPanelOpen ? `
    <div class="notif-panel" id="notifPanel" role="dialog" aria-label="Notifications">
      <div class="notif-panel-head"><span>Notifications</span>${mine.length ? `<button type="button" class="notif-clear-all" id="notifClearAll">Clear all</button>` : ""}</div>
      ${mine.length === 0 ? `<div class="notif-empty">You're all caught up.</div>` : mine
        .map(
          (n) => `
        <div class="notif-item ${n.read ? "" : "notif-item-unread"} ${n.link && n.link !== "/" ? "notif-item-link" : ""}" ${n.link && n.link !== "/" ? `data-notif-link="${esc(n.link)}" role="button" tabindex="0"` : ""}>
          <div class="notif-item-body">
            <div class="notif-item-subject">${esc(n.subject)}</div>
            <div class="notif-item-time">${new Date(n.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
          </div>
          <button type="button" class="notif-dismiss" data-dismiss="${n.id}" aria-label="Clear this notification" title="Clear">×</button>
        </div>`
        )
        .join("")}
    </div>` : ""}
  `;
  const panel = document.getElementById("notifPanel");
  if (panel) {
    // On phones the panel spans the screen just under the bell, so it can
    // never hang off either edge.
    if (window.matchMedia("(max-width: 780px)").matches) {
      const b = el.getBoundingClientRect();
      panel.style.top = Math.round(b.bottom + 8) + "px";
    }
    const clear = (ids) => {
      notifications = notifications.filter((n) => !ids.includes(n.id));
      renderNotifBell();
      DB.deleteNotifications(ids).catch((err) => { toast(friendlyError(err)); });
    };
    panel.querySelectorAll("[data-dismiss]").forEach((btn) => btn.addEventListener("click", (e) => { e.stopPropagation(); clear([btn.dataset.dismiss]); }));
    panel.querySelectorAll("[data-notif-link]").forEach((item) => {
      const open = (e) => {
        if (e.target.closest("[data-dismiss]")) return;
        e.stopPropagation();
        notifPanelOpen = false;
        myNotifications().forEach((n) => (n.read = true));
        renderNotifBell();
        followLink(item.dataset.notifLink);
      };
      item.addEventListener("click", open);
      item.addEventListener("keydown", (e) => { if (e.key === "Enter") open(e); });
    });
    const all = document.getElementById("notifClearAll");
    if (all) all.addEventListener("click", (e) => { e.stopPropagation(); clear(mine.map((n) => n.id)); });
  }
  document.getElementById("notifBell").addEventListener("click", (e) => {
    e.stopPropagation();
    notifPanelOpen = !notifPanelOpen;
    renderNotifBell();
    if (notifPanelOpen) {
      const ids = mine.filter((n) => !n.read).map((n) => n.id);
      if (ids.length) {
        DB.markNotificationsRead(ids)
          .then(() => { mine.forEach((n) => (n.read = true)); })
          .catch(() => {});
      }
    } else {
      mine.forEach((n) => (n.read = true));
      renderNotifBell();
    }
  });
}
document.addEventListener("click", (e) => {
  if (notifPanelOpen && !e.target.closest("#notifBellWrap")) {
    notifPanelOpen = false;
    myNotifications().forEach((n) => (n.read = true));
    renderNotifBell();
  }
});

// --- Sign-in screens -----------------------------------------------------
function renderAuthScreen() {
  document.getElementById("topNav").style.display = "none";
  document.getElementById("main").style.display = "none";
  const wrap = document.getElementById("authScreen");
  wrap.style.display = "";
  const tabs = authMode === "signin" || authMode === "signup";
  wrap.innerHTML = `
    <div class="auth-wrap auth-photo">
      ${photoLayerHtml("mountain-path")}
      <div class="auth-verse">
        <p>“Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.”</p>
        <span>2 Timothy 2:15</span>
      </div>
      <div class="auth-card">
        <div class="auth-logo">
          <img src="brand/tnbbi-logo-color.png" alt="True North Baptist Church Bible Institute crest" width="150" height="149">
          <div>
            <div class="auth-logo-title">True North Baptist Church</div>
            <div class="auth-logo-sub">Bible Institute</div>
          </div>
        </div>
        ${tabs ? `
        <button class="btn btn-google" id="googleSignInBtn" type="button">${googleLogoSvg()} <span>Continue with Google</span></button>
        ${isHomeScreenApp() ? `<p class="field-hint auth-standalone-hint">On the home-screen app, Google may ask you to sign in once here, even if you're signed in to Google elsewhere on this phone. After that, this app keeps you signed in.</p>` : ""}
        <div class="auth-divider"><span>or</span></div>
        <div class="auth-tabs">
          <button data-mode="signin" class="${authMode === "signin" ? "active" : ""}">Sign In</button>
          <button data-mode="signup" class="${authMode === "signup" ? "active" : ""}">Sign Up</button>
        </div>` : ""}
        ${authMode === "signin" ? renderSignInForm()
          : authMode === "signup" ? renderSignUpForm()
          : authMode === "forgot" ? renderForgotForm()
          : authMode === "checkEmail" ? renderCheckEmail()
          : authMode === "newPassword" ? renderNewPasswordForm()
          : authMode === "loading" ? `<p style="text-align:center;color:var(--muted-foreground);">Signing you in…</p>`
          : authMode === "pending" ? renderPendingApproval()
          : renderForgotSentForm()}
      </div>
      <p class="auth-foot" style="text-align:center;margin-top:14px;"><a href="privacy.html">Privacy Policy</a></p>
    </div>`;
  wrap.querySelectorAll("[data-mode]").forEach((b) => {
    b.addEventListener("click", () => { authMode = b.dataset.mode; authError = ""; authInfo = ""; renderAuthScreen(); });
  });
  wireAuthFormHandlers();
}

// Signed up (and verified), but not yet approved by an administrator.
let pendingProfile = null;
let pendingTimer = null;
function renderPendingApproval() {
  const first = ((pendingProfile && pendingProfile.name) || "").trim().split(/\s+/)[0];
  return `
    <div class="pending-box">
      <div class="pending-icon">${icon("lock")}</div>
      <h2 style="font-size:1.2rem;margin:0 0 8px;">Thanks for signing up${first ? `, ${esc(first)}` : ""}!</h2>
      <p>Your account is waiting for approval by an Institute administrator. This keeps the site safe for our students.</p>
      <p>You'll be let in as soon as it's approved — this page checks on its own, or you can check now. You'll then be able to set up your profile.</p>
      ${authInfo ? `<p class="auth-info">${esc(authInfo)}</p>` : ""}
      <button class="btn btn-primary" id="pendingCheck" style="width:100%;justify-content:center;margin-top:6px;">Check Again</button>
      <button class="btn btn-ghost" id="pendingSignOut" style="width:100%;justify-content:center;margin-top:10px;">Sign Out</button>
      <p class="field-hint" style="margin-top:14px;text-align:center;">Signed in as ${esc((pendingProfile && pendingProfile.email) || "")}</p>
    </div>`;
}
async function checkPendingApproval(fromButton) {
  if (!pendingProfile) return;
  try {
    const me = await fetchOwnProfile(pendingProfile.id);
    if (me.status === "active") {
      clearInterval(pendingTimer);
      const { data } = await sb.auth.getSession();
      if (data && data.session) startSession(data.session, { force: true });
      return;
    }
    if (me.status === "inactive") { clearInterval(pendingTimer); signOut("This account isn't active. Contact the church office."); return; }
    if (fromButton) { authInfo = "Not approved yet — we'll keep checking."; renderAuthScreen(); }
  } catch (e) { if (fromButton) { authInfo = friendlyError(e); renderAuthScreen(); } }
}

function authMessages() {
  return `${authError ? `<p class="auth-error" role="alert">${esc(authError)}</p>` : ""}${authInfo ? `<p class="auth-info">${esc(authInfo)}</p>` : ""}`;
}

function renderSignInForm() {
  return `
    <form id="signinForm" novalidate>
      <label for="siEmail">Email</label>
      <input type="email" id="siEmail" placeholder="you@example.com" autocomplete="username" value="${esc(pendingEmail)}">
      <label for="siPassword">Password</label>
      <input type="password" id="siPassword" placeholder="••••••••" autocomplete="current-password">
      ${authMessages()}
      <p style="text-align:right;margin:6px 0 4px;"><a id="goForgot" href="#" style="font-size:.8rem;color:var(--accent);font-weight:600;">Forgot password?</a></p>
      <div class="form-actions"><button class="btn btn-primary" id="siSubmit" type="submit" style="width:100%;justify-content:center;">Sign In</button></div>
      <p class="auth-foot">Don't have an account? <a id="goSignup" href="#">Sign up</a></p>
    </form>`;
}

function renderForgotForm() {
  return `
    <form id="forgotForm" novalidate>
      <div style="margin-bottom:16px;">
        <div style="font-weight:700;">Reset your password</div>
        <div style="font-size:.8rem;color:var(--muted-foreground);">We'll email you a link to choose a new one.</div>
      </div>
      <label for="fpEmail">Email</label>
      <input type="email" id="fpEmail" placeholder="you@example.com" autocomplete="username" value="${esc(pendingEmail)}">
      ${authMessages()}
      <div class="form-actions"><button class="btn btn-primary" id="fpSubmit" type="submit" style="width:100%;justify-content:center;">Send Reset Link</button></div>
      <p class="auth-foot"><a id="goSignin3" href="#">Back to sign in</a></p>
    </form>`;
}

function renderForgotSentForm() {
  return `
    <div style="text-align:center;">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("mail")}</div>
      <p style="font-size:.9rem;">If an account exists for that email, we've sent a link to reset the password. Check your inbox (and spam folder) in a few minutes.</p>
      <div class="form-actions" style="justify-content:center;"><button class="btn btn-primary" id="fpBackToSignin">Back to Sign In</button></div>
    </div>`;
}

function renderCheckEmail() {
  return `
    <div style="text-align:center;">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("mail")}</div>
      <p style="font-size:.95rem;font-weight:600;">Check your email to finish signing up</p>
      <p style="font-size:.88rem;color:var(--muted-foreground);">We sent a confirmation link to <strong>${esc(pendingEmail)}</strong>. Open it on this device to sign in. If you already have an account with that email, just sign in instead.</p>
      ${authMessages()}
      <div class="form-actions" style="justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-ghost" id="resendConfirm">Resend Email</button>
        <button class="btn btn-primary" id="fpBackToSignin">Back to Sign In</button>
      </div>
    </div>`;
}

function renderNewPasswordForm() {
  return `
    <form id="newPwForm" novalidate>
      <div style="margin-bottom:16px;">
        <div style="font-weight:700;">Choose a new password</div>
        <div style="font-size:.8rem;color:var(--muted-foreground);">At least 8 characters.</div>
      </div>
      <label for="npPassword">New password</label>
      <input type="password" id="npPassword" autocomplete="new-password">
      <label for="npPassword2">Confirm new password</label>
      <input type="password" id="npPassword2" autocomplete="new-password">
      ${authMessages()}
      <div class="form-actions"><button class="btn btn-primary" type="submit" style="width:100%;justify-content:center;">Save New Password</button></div>
    </form>`;
}

function renderSignUpForm() {
  return `
    <form id="signupForm" novalidate>
      <label for="suName">Full name</label>
      <input type="text" id="suName" placeholder="Jane Doe" autocomplete="name">
      <label for="suEmail">Email</label>
      <input type="email" id="suEmail" placeholder="you@example.com" autocomplete="username">
      <label for="suPassword">Password</label>
      <input type="password" id="suPassword" placeholder="At least 8 characters" autocomplete="new-password">
      <label for="suPassword2">Confirm password</label>
      <input type="password" id="suPassword2" placeholder="••••••••" autocomplete="new-password">
      ${authMessages()}
      <p class="field-hint" style="margin-top:8px;">New accounts start as a <strong>student</strong>. A faculty member can change that afterward.</p>
      <div class="form-actions"><button class="btn btn-primary" type="submit" style="width:100%;justify-content:center;">Create Account</button></div>
      <p class="auth-foot">Already have an account? <a id="goSignin" href="#">Sign in</a></p>
    </form>`;
}

function authBusy(form, on) {
  if (!form) return;
  form.querySelectorAll("button, input").forEach((el) => (el.disabled = on));
}

function wireAuthFormHandlers() {
  const pc = document.getElementById("pendingCheck");
  if (pc) pc.addEventListener("click", () => checkPendingApproval(true));
  const po = document.getElementById("pendingSignOut");
  if (po) po.addEventListener("click", () => { clearInterval(pendingTimer); pendingProfile = null; signOut(); });
  const wrap = document.getElementById("authScreen");
  const go = (id, mode) => {
    const el = wrap.querySelector("#" + id);
    if (el) el.addEventListener("click", (e) => { e.preventDefault(); authMode = mode; authError = ""; authInfo = ""; renderAuthScreen(); });
  };
  go("goSignup", "signup");
  go("goSignin", "signin");
  go("goForgot", "forgot");
  go("goSignin3", "signin");
  go("fpBackToSignin", "signin");

  const gBtn = wrap.querySelector("#googleSignInBtn");
  if (gBtn) gBtn.addEventListener("click", async () => {
    authError = "";
    // Show it's working without greying the button out: on phones (and the
    // home-screen app) Google opens over the page, and if the person comes
    // back without finishing, the button must still be ready to tap again.
    markActive(true);
    gBtn.classList.add("is-busy");
    gBtn.querySelector("span").textContent = "Opening Google…";
    const reset = () => { gBtn.classList.remove("is-busy"); const t = gBtn.querySelector("span"); if (t) t.textContent = "Continue with Google"; };
    setTimeout(reset, 6000);
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: siteUrl(), queryParams: { prompt: "select_account" } } });
    if (error) { reset(); authError = friendlyError(error); renderAuthScreen(); }
  });

  const signin = wrap.querySelector("#signinForm");
  if (signin) signin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = wrap.querySelector("#siEmail").value.trim().toLowerCase();
    const password = wrap.querySelector("#siPassword").value;
    pendingEmail = email;
    if (!email || !password) { authError = "Enter your email and password."; renderAuthScreen(); return; }
    authBusy(signin, true);
    markActive(true);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      authError = /invalid login credentials/i.test(error.message)
        ? "That email and password don't match. Try again, or use \"Forgot password?\"."
        : /not confirmed/i.test(error.message)
          ? "Please confirm your email first — look for the link we sent when you signed up."
          : friendlyError(error);
      renderAuthScreen();
    }
    // On success, the sign-in listener below takes it from here.
  });

  const forgot = wrap.querySelector("#forgotForm");
  if (forgot) forgot.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = wrap.querySelector("#fpEmail").value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authError = "Enter the email address you signed up with."; renderAuthScreen(); return; }
    authBusy(forgot, true);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() + "?reset=1" });
    // Deliberately the same confirmation whether or not the email has an
    // account — a reset form should never reveal who's signed up. Only a
    // rate limit or network problem is reported.
    if (error && /rate limit|network|fetch/i.test(error.message)) {
      authError = /rate limit/i.test(error.message) ? "Too many reset emails were requested. Please wait a few minutes and try again." : friendlyError(error);
      renderAuthScreen();
      return;
    }
    authMode = "forgotSent";
    renderAuthScreen();
  });

  const signup = wrap.querySelector("#signupForm");
  if (signup) signup.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = wrap.querySelector("#suName").value.trim();
    const email = wrap.querySelector("#suEmail").value.trim().toLowerCase();
    const pw = wrap.querySelector("#suPassword").value;
    const pw2 = wrap.querySelector("#suPassword2").value;
    if (!name || !email) { authError = "Enter your name and email."; renderAuthScreen(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authError = "Enter a valid email address."; renderAuthScreen(); return; }
    if (!pw || pw.length < 8) { authError = "Password must be at least 8 characters."; renderAuthScreen(); return; }
    if (pw !== pw2) { authError = "Passwords don't match."; renderAuthScreen(); return; }
    authBusy(signup, true);
    pendingEmail = email;
    const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { full_name: name }, emailRedirectTo: siteUrl() } });
    if (error) {
      authError = /already registered/i.test(error.message) ? "An account with that email already exists — sign in instead." : friendlyError(error);
      renderAuthScreen();
      return;
    }
    if (!data.session) { authMode = "checkEmail"; authError = ""; renderAuthScreen(); }
    // With email confirmation turned off, the sign-in listener starts the session.
  });

  const resend = wrap.querySelector("#resendConfirm");
  if (resend) resend.addEventListener("click", async () => {
    resend.disabled = true;
    const { error } = await sb.auth.resend({ type: "signup", email: pendingEmail, options: { emailRedirectTo: siteUrl() } });
    authError = error ? friendlyError(error) : "";
    authInfo = error ? "" : "Sent again — give it a few minutes.";
    renderAuthScreen();
  });

  const newPw = wrap.querySelector("#newPwForm");
  if (newPw) newPw.addEventListener("submit", async (e) => {
    e.preventDefault();
    const p1 = wrap.querySelector("#npPassword").value;
    const p2 = wrap.querySelector("#npPassword2").value;
    if (p1.length < 8) { authError = "Password must be at least 8 characters."; renderAuthScreen(); return; }
    if (p1 !== p2) { authError = "Passwords don't match."; renderAuthScreen(); return; }
    authBusy(newPw, true);
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) { authError = friendlyError(error); renderAuthScreen(); return; }
    recoveringPassword = false;
    authError = "";
    const { data } = await sb.auth.getSession();
    if (data.session) startSession(data.session, { force: true });
    toast("Password updated.", "success");
  });
}

// True when the site was opened from its home-screen icon (installed app).
function isHomeScreenApp() {
  try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch (e) { return false; }
}
// Coming back to the page (e.g. closing Google's sign-in sheet) restores it
// from memory — make sure the Google button isn't left in its busy state.
window.addEventListener("pageshow", () => {
  const b = document.getElementById("googleSignInBtn");
  if (b) { b.classList.remove("is-busy"); b.disabled = false; const t = b.querySelector("span"); if (t) t.textContent = "Continue with Google"; }
});

function googleLogoSvg() {
  return `<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18A11.94 11.94 0 0 1 11.03 24c0-1.45.25-2.86.66-4.18v-5.7H4.34A21.98 21.98 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>`;
}

// --- Session ---------------------------------------------------------------
function cleanAuthParamsFromUrl() {
  const url = new URL(location.href);
  ["code", "reset", "error", "error_code", "error_description"].forEach((k) => url.searchParams.delete(k));
  if (url.hash && /access_token|error/.test(url.hash)) url.hash = "";
  history.replaceState(null, "", url.pathname + url.search + url.hash);
}

let sessionStarting = null;
async function startSession(session, { force = false, restored = false } = {}) {
  if (!session || !session.user) return;
  // Reopening the site (or the home-screen app) after 30 minutes or more
  // without activity starts at the sign-in screen, not the dashboard.
  if (restored && idleTooLong()) {
    try { await sb.auth.signOut(); } catch (e) { /* already out */ }
    authMode = "signin";
    authError = IDLE_MESSAGE;
    renderAuthScreen();
    return;
  }
  markActive(true);
  if (!force && sessionUserId === session.user.id && (currentUser || sessionStarting === session.user.id)) return;
  sessionUserId = session.user.id;
  sessionStarting = session.user.id;
  try {
    await startSessionInner(session);
  } finally {
    sessionStarting = null;
  }
}

async function startSessionInner(session) {
  if (recoveringPassword) {
    authMode = "newPassword";
    authError = "";
    renderAuthScreen();
    return;
  }

  authMode = "loading";
  renderAuthScreen();
  try {
    let profile = await fetchOwnProfile(session.user.id);
    if (BOOTSTRAP_ADMIN_EMAIL && profile.email === BOOTSTRAP_ADMIN_EMAIL) {
      const { data: claimed } = await sb.rpc("claim_bootstrap_super_admin");
      if (claimed) profile = await fetchOwnProfile(session.user.id);
    }
    if (profile.status === "pending") {
      pendingProfile = profile;
      currentUser = null;
      authMode = "pending";
      authError = "";
      authInfo = "";
      renderAuthScreen();
      clearInterval(pendingTimer);
      pendingTimer = setInterval(() => { if (document.visibilityState === "visible") checkPendingApproval(false); }, 30000);
      return;
    }
    if (profile.status !== "active") {
      await sb.auth.signOut();
      currentUser = null;
      sessionUserId = null;
      authMode = "signin";
      authError = "This account is inactive. Contact the church office to reactivate it.";
      renderAuthScreen();
      return;
    }
    currentUser = profile;
    role = profile.role;
    currentStudentId = profile.id;
    await loadAll();
    cleanAuthParamsFromUrl();
    authError = "";
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("authScreen").innerHTML = "";
    document.getElementById("topNav").style.display = "";
    document.getElementById("main").style.display = "";
    view = "home";
    activeCourseId = null;
    renderAccountPill();
    renderNav();
    renderMain();
    startPolling();
    handlePendingAttendanceLink();
    const incoming = takeIncomingLink();
    if (incoming) openSiteLink(incoming);
    if (pushSupported()) registerServiceWorker();
  } catch (e) {
    console.error(e);
    authMode = "signin";
    authError = friendlyError(e);
    renderAuthScreen();
  }
}

// Every minute (while the tab is open): refresh the bell, and make sure
// this account is still active and still has the same role.
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!currentUser || document.visibilityState !== "visible") return;
    try {
      await refreshNotifications();
      renderNotifBell();
      const me = await fetchOwnProfile(currentUser.id);
      if (me.status !== "active") {
        await signOut("Your account was made inactive. Contact the church office to reactivate it.");
      } else if (me.role !== currentUser.role || me.superAdmin !== currentUser.superAdmin) {
        Object.assign(currentUser, me);
        role = me.role;
        await loadAll();
        view = "home";
        renderAccountPill();
        renderNav();
        renderMain();
        toast("Your account's role was updated.", "success");
      }
    } catch (e) { /* offline for a moment — try again next minute */ }
  }, 60000);
}

// --- Privacy: sign out after 30 minutes without activity ------------------
// Any tap, click, key, or scroll counts as activity, in any open tab (the
// time is shared through this browser's storage). Two minutes before the
// limit a notice offers "Stay signed in". Reopening the site after the
// limit has passed lands on the sign-in screen.
const IDLE_LIMIT_MS = 30 * 60 * 1000;
const IDLE_WARN_MS = 2 * 60 * 1000;
const IDLE_KEY = "tnbbi-last-active";
const IDLE_MESSAGE = "For your privacy, you were signed out after 30 minutes without activity. Sign in again to continue.";
let idleLastMark = 0;
function markActive(force) {
  const now = Date.now();
  if (!force && now - idleLastMark < 10000) return;
  idleLastMark = now;
  try { localStorage.setItem(IDLE_KEY, String(now)); } catch (e) { /* private mode — in-memory only */ }
  hideIdleWarning();
}
function lastActiveAt() {
  let v = 0;
  try { v = parseInt(localStorage.getItem(IDLE_KEY), 10) || 0; } catch (e) { /* fine */ }
  return Math.max(v, idleLastMark);
}
function idleTooLong() {
  const t = lastActiveAt();
  return t > 0 && Date.now() - t >= IDLE_LIMIT_MS;
}
function signedInForIdle() { return !!currentUser || authMode === "pending"; }
function checkIdle() {
  if (!signedInForIdle()) return;
  const idle = Date.now() - lastActiveAt();
  if (idle >= IDLE_LIMIT_MS) { hideIdleWarning(); signOut(IDLE_MESSAGE); return; }
  if (idle >= IDLE_LIMIT_MS - IDLE_WARN_MS) showIdleWarning(IDLE_LIMIT_MS - idle);
}
function showIdleWarning(msLeft) {
  let el = document.getElementById("idleWarning");
  if (!el) {
    el = document.createElement("div");
    el.id = "idleWarning";
    el.className = "idle-warning";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-live", "assertive");
    document.body.appendChild(el);
  }
  const mins = Math.max(1, Math.ceil(msLeft / 60000));
  el.innerHTML = `<p><strong>Still there?</strong> For your privacy you'll be signed out in about ${mins} minute${mins === 1 ? "" : "s"}.</p><button type="button" class="btn btn-gold btn-sm" id="idleStay">Stay signed in</button>`;
  document.getElementById("idleStay").addEventListener("click", () => markActive(true));
}
function hideIdleWarning() {
  const el = document.getElementById("idleWarning");
  if (el) el.remove();
}
["pointerdown", "keydown", "wheel", "touchstart", "scroll", "input"].forEach((ev) =>
  window.addEventListener(ev, (e) => {
    if (e.target && e.target.closest && e.target.closest("#idleWarning")) return; // its own button handles it
    if (signedInForIdle()) markActive(false);
  }, { passive: true, capture: true }));
setInterval(checkIdle, 15000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkIdle(); });
window.addEventListener("pageshow", checkIdle);
window.addEventListener("storage", (e) => { if (e.key === IDLE_KEY) hideIdleWarning(); });

async function signOut(message) {
  if (typeof navReset === "function") navReset();
  hideIdleWarning();
  clearInterval(pollTimer);
  clearInterval(pendingTimer);
  pendingProfile = null;
  clearViewTimers();
  closeModal();
  try { await sb.auth.signOut(); } catch (e) { /* already signed out */ }
  setTheme("light"); // the next sign-in starts in day view
  currentUser = null;
  sessionUserId = null;
  courses = [];
  users = [];
  notifications = [];
  authMode = "signin";
  authError = message || "";
  authInfo = "";
  notifPanelOpen = false;
  view = "home";
  renderAuthScreen();
}

function renderAccountPill() {
  const el = document.getElementById("accountPills");
  if (!el) return;
  if (!currentUser) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <button id="helpBtn" class="icon-btn" aria-label="Help and tour" title="Help">${icon("help")}</button>
    ${textSizeToggleHtml()}
    ${themeToggleHtml()}
    <div class="notif-wrap" id="notifBellWrap"></div>
    <button class="account-me" id="myProfileBtn" title="My Profile" aria-label="My Profile — ${esc(currentUser.name)}">
      ${avatarHtml(users.find((u) => u.id === currentUser.id) || currentUser, 32)}
      <span class="account-name">${esc(currentUser.name)}</span>
    </button>
    <span class="pill level-badge level-${userLevel(currentUser)}">${userLevel(currentUser) === "admin" ? "★ " : ""}${LEVEL_LABEL[userLevel(currentUser)]}</span>
    <button id="logoutBtn">Log Out</button>
  `;
  document.getElementById("logoutBtn").addEventListener("click", () => signOut());
  document.getElementById("myProfileBtn").addEventListener("click", () => openProfile());
  document.getElementById("helpBtn").addEventListener("click", () => { view = "help"; activeCourseId = null; renderNav(); renderMain(); });
  document.getElementById("textSizeToggle").addEventListener("click", () => { cycleTextSize(); renderAccountPill(); });
  document.getElementById("themeToggle").addEventListener("click", () => {
    setTheme(currentTheme() === "dark" ? "light" : "dark");
    renderAccountPill();
  });
  renderNotifBell();
}

function clearViewTimers() {
  viewTimers.forEach((t) => clearInterval(t));
  viewTimers = [];
}

function renderNav() {
  const nav = document.getElementById("navPills");
  // Every page is on the dashboard menu, so the header holds no page
  // buttons; the crest at the top left is the way home from anywhere.
  const items = [];
  nav.hidden = true;
  const homeViews =
    role === "student"
      ? ["home", "courses", "course", "grades", "messages", "messageThread", "submit", "discussion", "discussionBoard", "profile"]
      : ["home", "catalogue", "manage", "grading", "gradeSheet", "discussion", "discussionBoard", "messages", "messageThread", "settings", "profile", "attendance", "attendanceHome"];
  nav.innerHTML = items
    .map((i) => {
      const active = i.key === "home" ? homeViews.includes(view) : view === i.key;
      return `<button data-view="${i.key}" class="${active ? "active" : ""}">${i.label}</button>`;
    })
    .join("");
  nav.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { view = "home"; activeCourseId = null; profileUserId = null; if (b.dataset.view !== "home") view = b.dataset.view; renderNav(); renderMain(); }));
  const brand = document.getElementById("brandHome");
  if (brand && !brand.dataset.wired) {
    brand.dataset.wired = "1";
    brand.addEventListener("click", () => { view = "home"; activeCourseId = null; profileUserId = null; renderNav(); renderMain(); window.scrollTo(0, 0); });
  }
}

function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }

// Student-written work (from the in-tool editor) is stored as HTML. Before
// it's ever shown — to the student or to faculty — it's cleaned down to
// ordinary document formatting (headings, lists, tables, links, colors,
// footnotes…), so nothing harmful can ride along inside it.
const SAFE_TAGS = ["b", "strong", "i", "em", "u", "s", "strike", "del", "sup", "sub", "ul", "ol", "li", "p", "br", "div", "span",
  "h1", "h2", "h3", "h4", "blockquote", "a", "hr", "table", "thead", "tbody", "tr", "th", "td"];
const SAFE_ATTRS = ["style", "href", "class", "data-fn", "colspan", "rowspan", "title"];
const SAFE_CLASSES = new Set(["scripture", "scripture-ref", "fn-ref", "footnotes", "fn-sep", "title-block", "rte-table", "kjv-it"]);
const SAFE_STYLES = new Set(["color", "background-color", "font-family", "font-size", "font-weight", "font-style", "text-decoration",
  "text-decoration-line", "text-align", "margin-left", "padding-left", "line-height", "text-indent", "vertical-align"]);
let sanitizingWritten = false;
function cleanStyle(css) {
  const out = [];
  String(css || "").split(";").forEach((decl) => {
    const i = decl.indexOf(":");
    if (i < 0) return;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (!SAFE_STYLES.has(prop) || !val || /url\(|expression|javascript:|[<>\\]|@import/i.test(val) || val.length > 120) return;
    out.push(`${prop}: ${val}`);
  });
  return out.join("; ");
}
let sanitizerHooked = false;
function hookSanitizer() {
  if (sanitizerHooked || !window.DOMPurify || !DOMPurify.addHook) return;
  sanitizerHooked = true;
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (!sanitizingWritten) return;
    if (data.attrName === "style") {
      data.attrValue = cleanStyle(data.attrValue);
      if (!data.attrValue) data.keepAttr = false;
    } else if (data.attrName === "class") {
      data.attrValue = data.attrValue.split(/\s+/).filter((c) => SAFE_CLASSES.has(c)).join(" ");
      if (!data.attrValue) data.keepAttr = false;
    } else if (data.attrName === "href") {
      if (!/^(https?:|mailto:|#)/i.test(data.attrValue.trim())) data.keepAttr = false;
    }
  });
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (sanitizingWritten && node.tagName === "A" && node.getAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}
function safeHtml(html) {
  if (!html) return "";
  if (!window.DOMPurify) return esc(html);
  hookSanitizer();
  sanitizingWritten = true;
  try {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: SAFE_TAGS, ALLOWED_ATTR: SAFE_ATTRS.concat(["target", "rel"]), ALLOW_DATA_ATTR: false });
  } finally { sanitizingWritten = false; }
}

// Moving to another page re-checks the database (unless it was just
// loaded), so what one person changes — a new enrollment, a grade, a
// reply — shows up for everyone else without reloading the browser.
const STALE_MS = 3000;
const COURSE_VIEWS = ["course", "manage", "gradeSheet", "discussionBoard", "messageThread", "attendance", "lecture", "live"];
const FACULTY_ONLY_VIEWS = ["transcripts", "pastRecords", "catalogue", "manage", "grading", "gradeSheet", "settings", "attendance", "attendanceHome"];
const STUDENT_ONLY_VIEWS = ["courses", "course", "grades", "submit"];

function renderMain() {
  clearViewTimers();
  if (currentUser && Date.now() - dataLoadedAt > STALE_MS && busyCount === 0 && !document.querySelector("#modalRoot .modal-backdrop")) {
    setBusy(true);
    loadAll()
      .catch((e) => toast(friendlyError(e)))
      .finally(() => { setBusy(false); renderView(); renderNotifBell(); });
    return;
  }
  renderView();
}

// Draws the current page, then records it so the browser's Back button
// steps back through the site (navRecord, in home.js).
function renderView() {
  const r = drawView();
  if (typeof navRecord === "function") navRecord();
  return r;
}
function drawView() {
  const main = document.getElementById("main");
  if (!currentUser) return;
  // Leaving a lecture or the live class stops its player (and saves progress).
  if (view !== "lecture" && typeof stopLecture === "function") stopLecture();
  if (view !== "live" && typeof stopLive === "function") stopLive();
  // A page whose course was deleted or archived elsewhere, or a page this
  // role can't use, falls back to the dashboard instead of breaking.
  if ((COURSE_VIEWS.includes(view) && !courses.some((c) => c.id === activeCourseId))
      || (role !== "faculty" && FACULTY_ONLY_VIEWS.includes(view))
      || (role === "faculty" && STUDENT_ONLY_VIEWS.includes(view))) {
    view = "home";
    activeCourseId = null;
    renderNav();
  }
  // Faculty only reach the course pages they're allowed to use.
  if (role !== "student" && activeCourseId) {
    const ac = courses.find((x) => x.id === activeCourseId);
    const needsTeach = ["gradeSheet", "discussionBoard", "messageThread", "attendance"].includes(view);
    if ((view === "manage" && !iManage(ac)) || (needsTeach && !iTeach(ac))) {
      view = view === "manage" ? "catalogue" : "home";
      activeCourseId = null;
      renderNav();
    }
  }
  if (view === "home") return role === "student" ? renderDashboard(main) : renderFacultyHome(main);
  if (view === "courses") return renderCourses(main);
  if (view === "course") return renderCourse(main);
  if (view === "lecture") return renderLecture(main);
  if (view === "live") return renderLiveClass(main);
  if (view === "lectureArchive") return renderLectureArchive(main);
  if (view === "manage") return renderManage(main);
  if (view === "library" || view === "resourceLibrary") return renderResourceLibrary(main);
  if (view === "calendar") return renderCalendar(main);
  if (view === "studyBible") return renderStudyBible(main);
  if (view === "grades") return renderMyGrades(main);
  if (view === "submit") return renderSubmitWork(main);
  if (view === "messages") return renderMessages(main);
  if (view === "messageThread") return renderMessageThread(main);
  if (view === "discussion") return renderDiscussion(main);
  if (view === "discussionBoard") return renderDiscussionBoard(main);
  if (view === "catalogue") return renderCatalogue(main);
  if (view === "grading") return renderGrading(main);
  if (view === "gradeSheet") return renderGradeSheet(main);
  if (view === "profile") return renderProfile(main);
  if (view === "attendance") return renderAttendance(main);
  if (view === "attendanceHome") return renderAttendanceHome(main);
  if (view === "transcript") return Date.now() - dataLoadedAt < 1500 ? renderTranscript(main) : withFreshData(() => renderTranscript(main));
  if (view === "transcripts") return Date.now() - dataLoadedAt < 1500 ? renderTranscripts(main) : withFreshData(() => renderTranscripts(main));
  if (view === "pastRecords") return Date.now() - dataLoadedAt < 1500 ? renderPastRecords(main) : withFreshData(() => renderPastRecords(main));
  if (view === "help") return renderHelp(main);
  if (view === "settings") return Date.now() - dataLoadedAt < 1500 ? renderSettings(main) : withFreshData(() => renderSettings(main));
}

function renderDashboard(main) {
  // Kept short on purpose: everything else is one tap from these, from This
  // Week above them, or from the buttons at the top (profile, help).
  const tiles = [
    { key: "courses", i: "book", label: "My Courses", desc: "Your classes — lectures, materials, and assignments" },
    { key: "calendar", i: "calendar", label: "Calendar", desc: "Class days and due dates" },
    { key: "messages", i: "mail", label: "Messages", desc: "Your teachers and class discussion" },
    { key: "grades", i: "cap", label: "Grades", desc: "Scores, comments, and your transcript" },
    { key: "studyBible", i: "bible", label: "Study Bible", desc: "The KJV with Strong's Concordance" },
    { key: "resourceLibrary", i: "search", label: "Library", desc: "Books, studies, and past lectures" },
  ];
  const unread = unreadMessageCount();
  main.innerHTML = `
    ${heroHtml("student")}
    ${courseCompleteHtml(14)}
    ${thisWeekCardHtml()}
    ${recentAnnouncementsHtml()}
    ${profileNudge()}
    <div class="grid grid-six menu-grid">
      ${tiles.map((t) => menuTileHtml(t, t.key === "messages" && unread ? `<span class="tile-badge">${unread}</span>` : "")).join("")}
    </div>
  `;
  main.querySelectorAll("[data-goto]").forEach((el) => {
    const open = () => { if (el.dataset.goto === "profile") return openProfile(); view = el.dataset.goto; renderNav(); renderMain(); };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } });
  });
  wireHero(main);
  wireThisWeek(main);
  wireRecentAnnouncements(main);
  maybeStartTour();
  wireProfileNudge();
}

// Classes I'm the assigned teacher of that meet today and record attendance,
// from an hour before class time through the end of the day (all day if the
// course has no class time set). Shown as Take Attendance on the Courses tile.
function attendanceDueNow() {
  if (!currentUser) return [];
  const today = todayStr();
  const now = new Date();
  return courses.filter((c) => {
    if (c.archived || !takesClassroomAttendance(c) || !classDates(c).includes(today)) return false;
    const t = courseTeacher(c);
    if (!t || t.id !== currentUser.id) return false;
    const m = /^(\d{1,2}):(\d{2})/.exec(c.schedule.time || "");
    if (!m) return true;
    const start = new Date(); start.setHours(+m[1], +m[2], 0, 0);
    return now.getTime() >= start.getTime() - 60 * 60000;
  });
}

// Dashboard tile colors: one reverent jewel tone per kind of tile.
const TILE_HUE = {
  courses: "blue", catalogue: "blue", calendar: "teal", studyBible: "wine", grades: "plum", grading: "plum",
  messages: "amber", submit: "olive", discussion: "clay", resourceLibrary: "slate", profile: "gold",
  settings: "gray", attendanceHome: "green", transcript: "wine", transcripts: "wine", help: "teal",
};

// Day / night: every sign-in starts in day view. Someone can switch to night
// view once signed in; that choice lasts for this visit (this tab, even across
// a refresh) and is cleared when they sign out or sign in again.
const THEME_KEY = "tnbbi-theme";
function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function setTheme(t) {
  t = t === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = t;
  try {
    if (t === "dark") sessionStorage.setItem(THEME_KEY, t); else sessionStorage.removeItem(THEME_KEY);
  } catch (e) { /* private browsing */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "dark" ? "#101b2c" : "#1f3a5f");
}
function themeToggleHtml() {
  const dark = currentTheme() === "dark";
  return `<button class="icon-btn theme-toggle" id="themeToggle" aria-label="${dark ? "Switch to day mode" : "Switch to night mode"}" title="${dark ? "Day mode" : "Night mode"}">${icon(dark ? "sun" : "moon")}</button>`;
}

function renderPlaceholder(main, title, iconName, message) {
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${role === "student" ? "Student Dashboard" : staffEyebrow()}</div>
      <h1>${esc(title)}</h1>
    </div>
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon(iconName)}</div>
      <p>${esc(message)}</p>
    </div>
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
}

// --- Course enrollment requests --------------------------------------
// Self-serve enrollment: a course a student isn't in yet, that has a
// real schedule and hasn't started, shows as "Available" with a Request
// Enrollment button instead of requiring the professor to add every
// student by hand. The professor approves or denies each request (one at
// a time, or all at once); denying requires a short note, which lands as
// a message in the student's inbox with the usual unread bubble. A
// course nobody requested simply stops showing once it goes live — the
// professor can still add that student manually from the roster at any
// point afterward, which brings the course right back into their list.
function isUpcoming(c) {
  return !!(c.schedule && c.schedule.mode && c.schedule.startDate && c.schedule.startDate > todayStr());
}
function pendingRequestsFor(course) {
  return (course.enrollmentRequests || []).filter((r) => r.status === "pending");
}
function myEnrollmentRequest(course, studentId) {
  return pendingRequestsFor(course).find((r) => r.studentId === studentId);
}
function pendingEnrollmentCount() {
  return courses.filter((c) => !c.archived && iTeach(c)).reduce((n, c) => n + pendingRequestsFor(c).length, 0);
}
// Each of these saves to the database (which also sends the matching
// notifications), then reloads and redraws via run().
function requestEnrollment(course, after) {
  return run(async () => {
    await DB.requestEnrollment(course.id);
    flashMessage = `Your request to enroll in "${course.title}" was sent to the instructor.`;
  }, after);
}
function withdrawEnrollmentRequest(course, after) {
  return run(async () => {
    await DB.withdrawRequest(course.id);
    flashMessage = `Your request for "${course.title}" was withdrawn.`;
  }, after);
}
function approveEnrollment(course, studentId, after) {
  return run(() => DB.approveEnrollment(course.id, studentId), after);
}
function approveAllEnrollments(course, after) {
  const ids = pendingRequestsFor(course).map((r) => r.studentId);
  return run(async () => { for (const sid of ids) await DB.approveEnrollment(course.id, sid); }, after);
}
function denyEnrollment(course, studentId, note, after) {
  return run(() => DB.denyEnrollment(course.id, studentId, note), after);
}

function renderCourses(main) {
  const msg = flashMessage;
  flashMessage = "";
  const enrolled = courses.filter((c) => !c.archived && c.studentIds.includes(currentStudentId)).sort((a, b) => a.title.localeCompare(b.title));
  const pending = courses.filter((c) => !c.archived && !c.studentIds.includes(currentStudentId) && myEnrollmentRequest(c, currentStudentId)).sort((a, b) => a.title.localeCompare(b.title));
  const available = courses.filter((c) => !c.archived && !c.studentIds.includes(currentStudentId) && !myEnrollmentRequest(c, currentStudentId) && isUpcoming(c)).sort((a, b) => a.title.localeCompare(b.title));

  function courseTile(c) {
    const live = isLive(c);
    return `
        <div class="tile" data-course="${c.id}" tabindex="0" role="button">
          <div class="icon-badge">${icon("book")}</div>
          <span class="pill pill-navy">${esc(c.level)} Level</span>
          ${!live && c.schedule.startDate ? `<span class="pill pill-gold" style="margin-left:4px;">Starts ${parseDay(c.schedule.startDate).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>` : ""}
          <h3 style="margin-top:10px;">${esc(c.title)}</h3>
          <p>${esc(c.description)}</p>
          ${scheduleLine(c) ? `<p style="margin-top:8px;font-size:.78rem;color:var(--muted-foreground);">${esc(scheduleLine(c))}</p>` : ""}
        </div>`;
  }
  function requestRow(c, mode) {
    return `
        <li>
          <div>
            <div><strong>${esc(c.title)}</strong> <span class="pill pill-navy" style="margin-left:4px;">${esc(c.level)} Level</span></div>
            <p style="font-size:.85rem;color:var(--muted-foreground);margin:4px 0 0;">${esc(c.description)}</p>
            <div style="font-size:.78rem;color:var(--muted-foreground);margin-top:6px;">${esc(scheduleLine(c))} · Starts ${parseDay(c.schedule.startDate).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</div>
          </div>
          ${mode === "available" ? `<button class="btn btn-gold btn-sm" data-request="${c.id}">Request Enrollment</button>` : `<div style="text-align:right;flex-shrink:0;"><span class="pill pill-gray">Pending Approval</span><br><button class="btn btn-ghost btn-sm" style="margin-top:8px;" data-withdraw="${c.id}">Withdraw</button></div>`}
        </li>`;
  }

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">Student Dashboard</div>
      <h1>My Courses</h1>
      <p>Your enrolled classes at the Institute, plus anything open for enrollment.</p>
    </div>
    ${msg ? `<div class="flash-banner">${esc(msg)}</div>` : ""}
    ${enrolled.length === 0 && pending.length === 0 && available.length === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("book")}</div>
      <p>Nothing to show yet — a course appears here once it's scheduled, so you can request a seat.</p>
    </div>` : `
    ${enrolled.length ? `
    <div class="section-title"><h2>Enrolled</h2></div>
    <div class="grid ccard-grid">${enrolled.map(studentCourseCardHtml).join("")}</div>` : ""}
    ${pending.length ? `
    <div class="section-title"><h2>Pending Approval</h2></div>
    <div class="card"><ul class="assignments-list">${pending.map((c) => requestRow(c, "pending")).join("")}</ul></div>` : ""}
    ${available.length ? `
    <div class="section-title"><h2>Available</h2></div>
    <div class="card"><ul class="assignments-list">${available.map((c) => requestRow(c, "available")).join("")}</ul></div>` : ""}
    `}
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  main.querySelectorAll("[data-course]").forEach((el) => {
    const open = () => {
      activeCourseId = el.dataset.course;
      view = "course";
      renderNav();
      renderMain();
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
  main.querySelectorAll("[data-request]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = courses.find((x) => x.id === btn.dataset.request);
      requestEnrollment(c);
    });
  });
  main.querySelectorAll("[data-withdraw]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = courses.find((x) => x.id === btn.dataset.withdraw);
      withdrawEnrollmentRequest(c);
    });
  });
}

function renderFacultyHome(main) {
  const tiles = [
    { key: "catalogue", i: "book", label: "Courses", desc: "Browse everything offered, or add a new course" },
    { key: "calendar", i: "calendar", label: "Calendar", desc: "Class days and due dates in the courses you teach" },
    { key: "studyBible", i: "bible", label: "Study Bible", desc: "Read the KJV with Strong's Concordance" },
    { key: "grading", i: "cap", label: "Grading", desc: "Review and grade work in your courses" },
    { key: "discussion", i: "chat", label: "Discussion Board", desc: "Lead your classes' discussions" },
    { key: "messages", i: "mail", label: "Message Inbox", desc: "Messages from your students" },
    { key: "resourceLibrary", i: "search", label: "Resource Library", desc: "Search the Drive and church library by topic or course" },
    { key: "profile", i: "user", label: "My Profile", desc: "Your photo, contact details, and About me" },
    { key: "transcripts", i: "scroll", label: "Transcripts", desc: isAdmin() ? "Every student's permanent record" : "Final grades, and courses from before the site" },
    { key: "settings", i: "gear", label: "Settings", desc: isAdmin() ? "Users, levels, and backups" : "Users and new sign-ups" },
    { key: "help", i: "help", label: "Help & Tour", desc: "How everything works" },
  ];
  const unread = unreadMessageCount();
  const pendingEnroll = pendingEnrollmentCount();
  const attNow = attendanceDueNow();
  main.innerHTML = `
    ${heroHtml("teacher")}
    ${attentionCardHtml()}
    ${profileNudge()}
    <div class="grid menu-grid">
      ${tiles.map((t) => {
        const waiting = pendingSignups().filter((u) => u.emailVerified).length;
        const badge = t.key === "messages" && unread ? `<span class="tile-badge">${unread}</span>`
          : t.key === "catalogue" && pendingEnroll ? `<span class="tile-badge" title="${pendingEnroll} enrollment request${pendingEnroll === 1 ? "" : "s"}">${pendingEnroll}</span>`
          : t.key === "settings" && waiting ? `<span class="tile-badge" title="Sign-ups waiting for approval">${waiting}</span>` : "";
        const extra = t.key === "catalogue" && attNow.length ? `<div class="tile-att">${attNow.map((c) => {
            const taken = !!c.attDays[todayStr()];
            return `<button type="button" class="tile-att-btn ${taken ? "taken" : ""}" data-take-att="${c.id}">${icon("check")}<span>${taken ? "Attendance taken" : "Take Attendance"} · ${esc(c.title)}${c.schedule.time ? ` · ${esc(fmtTime(c.schedule.time))}` : ""}</span></button>`;
          }).join("")}</div>` : "";
        return menuTileHtml(t, badge, extra);
      }).join("")}
    </div>
  `;
  main.querySelectorAll("[data-goto]").forEach((el) => {
    const open = () => { if (el.dataset.goto === "profile") return openProfile(); view = el.dataset.goto; renderNav(); renderMain(); };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } });
  });
  main.querySelectorAll("[data-take-att]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    openAttendance(b.dataset.takeAtt, todayStr(), "home");
  }));
  wireAttention(main);
  wireHero(main);
  // The Take Attendance button appears on its own as class time nears.
  const sig = attNow.map((c) => c.id).join(",");
  viewTimers.push(setInterval(() => {
    if (view === "home" && !document.querySelector("#modalRoot .modal-backdrop") && attendanceDueNow().map((c) => c.id).join(",") !== sig) renderMain();
  }, 60000));
  maybeStartTour();
  wireProfileNudge();
}

// Course Builder now lives inside the Catalogue as a modal — "+ Add
// Course" there opens this exact form. Saving drops the new course
// straight into the Catalogue as an active course.
function openAddCourseModal() {
  builderFiles = [];
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width:560px;">
        <h2 style="font-size:1.15rem;">Add a Course</h2>
        <p style="color:var(--muted-foreground);font-size:.85rem;">Once saved, it's active in Courses right away — open it there to set its schedule, roster, and assignments.</p>

        <label for="cbName">Course Name</label>
        <input type="text" id="cbName" placeholder="e.g. Hermeneutics II" />

        <label for="cbDesc">Description</label>
        <textarea id="cbDesc" rows="3" placeholder="A short summary of what this course covers."></textarea>

        <div class="form-row">
          <div>
            <label for="cbCredits">Credits</label>
            <input type="number" id="cbCredits" min="1" max="6" value="3" />
          </div>
          <div>
            <label for="cbLevel">Academic Level</label>
            <select id="cbLevel">
              ${LEVELS.map((l) => `<option value="${l}">${l} Level</option>`).join("")}
            </select>
          </div>
        </div>

        <label for="cbFiles">Syllabus &amp; Reference Materials</label>
        <input type="file" id="cbFiles" multiple accept="${UPLOAD_ACCEPT}" />
        <div class="field-hint">Attach a syllabus, PDF textbook, or other reference materials (up to 50 MB each). You can add or remove these later from the course's Manage page.</div>
        <div id="builderFileChips" class="chip-row"></div>

        ${formatSettingsHtml("cb", null)}
        ${attSettingsHtml("cb", null)}
        ${role === "faculty" ? `<p class="field-hint" style="margin-top:14px;">You'll be this course's teacher. ${currentUser.superAdmin ? "You can assign someone else from its Manage page." : "You can hand it to another faculty member from its Manage page until it starts."}</p>` : ""}
        <div class="form-actions">
          <button class="btn btn-primary" id="cbSave">Save Course</button>
          <button class="btn btn-ghost" id="cbCancel">Cancel</button>
        </div>
      </div>
    </div>`;
  document.getElementById("cbCancel").addEventListener("click", closeModal);
  document.getElementById("cbFiles").addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    for (const f of files) {
      try { checkUpload(f, MATERIAL_MAX_BYTES); builderFiles.push(f); } catch (err) { toast(err.message); }
    }
    renderBuilderFileChips();
  });
  wireAttSettings("cb");
  wireFormatSettings("cb");
  document.getElementById("cbSave").addEventListener("click", () => {
    const nameInput = document.getElementById("cbName");
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    const desc = document.getElementById("cbDesc").value.trim();
    const credits = parseInt(document.getElementById("cbCredits").value, 10) || 1;
    const level = document.getElementById("cbLevel").value;
    const files = builderFiles.slice();
    const att = readAttSettings("cb");
    let fmt;
    try { fmt = readFormatSettings("cb"); } catch (e) { toast(e.message); if (e.field) document.getElementById(e.field).focus(); return; }
    let uploadError = null;
    run(async () => {
      const id = await DB.createCourse({ title: name, description: desc || "No description yet.", credits, level, facultyId: currentFacultyId(), att });
      if (fmt.format !== "in_person" || fmt.playlist_id) {
        await DB.updateCourse(id, fmt);
        if (fmt.playlist_id) await DB.requestPlaylistSync(id).catch(() => {});
      }
      if (files.length) {
        try { await DB.addMaterials(id, files); } catch (err) { uploadError = err; }
      }
      flashMessage = `"${name}" was added to Courses.`;
      closeModal();
    }).then((ok) => {
      if (ok && uploadError) toast(`The course was saved, but a file didn't upload: ${friendlyError(uploadError)} Add it from the course's Manage page.`);
    });
  });
  renderBuilderFileChips();
}

function renderBuilderFileChips() {
  const wrap = document.getElementById("builderFileChips");
  if (!wrap) return;
  wrap.innerHTML = builderFiles
    .map((f, i) => `<span class="chip">${esc(f.name)} <button type="button" data-remove-file="${i}" aria-label="Remove">&times;</button></span>`)
    .join("");
  wrap.querySelectorAll("[data-remove-file]").forEach((btn) => {
    btn.addEventListener("click", () => {
      builderFiles.splice(Number(btn.dataset.removeFile), 1);
      renderBuilderFileChips();
    });
  });
}

// Archiving takes a course out of circulation — it stops appearing as
// "live" anywhere on the site (My Courses, Submit Work, My Grades,
// Grading) — but a faculty member can still open and edit it from the
// Archived tab here, right up until they toggle it back to Active.
function renderCatalogue(main) {
  const msg = flashMessage;
  flashMessage = "";
  const activeCourses = courses.filter((c) => !c.archived);
  const archivedCourses = courses.filter((c) => c.archived);
  // Courses you teach first, then the rest alphabetically.
  const list = (catalogueTab === "archived" ? archivedCourses : activeCourses)
    .slice().sort((a, b) => (iTeach(b) - iTeach(a)) || a.title.localeCompare(b.title));
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${staffEyebrow()}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <h1 style="margin:0;">Courses</h1>
        <button class="btn btn-primary btn-sm" id="catAddCourse">+ Add Course</button>
      </div>
      <p>Everything the Institute offers. Open a course you teach to set its schedule, roster, and materials.${currentUser && currentUser.superAdmin ? " As an Admin you can open any course and change its teacher." : ""}</p>
    </div>
    ${msg ? `<div class="flash-banner">${esc(msg)}</div>` : ""}
    <div class="subtabs" id="catalogueTabs" style="margin-bottom:16px;">
      <button data-tab="active">Active (${activeCourses.length})</button>
      <button data-tab="archived">Archived (${archivedCourses.length})</button>
    </div>
    ${list.length === 0 ? `
    <div class="card empty-state"><p>${catalogueTab === "archived" ? "No archived courses." : "No active courses."}</p></div>` : `
    <div class="grid grid-compact">
      ${list
        .map((c) => {
          const status = courseStatusLabel(c);
          const pendingCount = pendingRequestsFor(c).length;
          const mine = iTeach(c) && courseTeacher(c);
          return `
        <div class="tile tile-compact tile-covered ${iManage(c) ? "" : "tile-readonly"}" data-course="${c.id}" tabindex="0" role="button">
          ${courseCoverHtml(c)}
          ${pendingCount && iManage(c) ? `<span class="tile-badge" title="${pendingCount} enrollment request${pendingCount === 1 ? "" : "s"}">${pendingCount}</span>` : ""}
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <span class="pill pill-navy">${esc(c.level)} Level</span>
            <span class="pill ${status.cls}">${esc(status.text)}</span>
            ${mine ? `<span class="pill pill-gold">You teach this</span>` : ""}
          </div>
          <h3>${esc(c.title)}</h3>
          <p class="tile-meta">${c.credits} cr · ${c.studentIds.length} enrolled</p>
          <p class="tile-teacher ${courseTeacher(c) ? "" : "tile-teacher-none"}">${icon("user")}<span>${esc(teacherLabel(c))}</span></p>
          ${iManage(c) ? `<button class="btn ${c.archived ? "btn-success" : "btn-outline-gold"} btn-sm tile-archive-btn" data-archive-toggle="${c.id}">${c.archived ? "Reactivate" : "Archive"}</button>` : ""}
        </div>`;
        })
        .join("")}
    </div>`}
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  document.getElementById("catAddCourse").addEventListener("click", () => openAddCourseModal());
  document.getElementById("catalogueTabs").querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === catalogueTab);
    b.addEventListener("click", () => { catalogueTab = b.dataset.tab; renderCatalogue(main); });
  });
  main.querySelectorAll("[data-course]").forEach((el) => {
    const open = () => {
      const c = courses.find((x) => x.id === el.dataset.course);
      if (!iManage(c)) { openCourseInfoModal(c); return; }
      activeCourseId = el.dataset.course;
      view = "manage";
      renderNav();
      renderMain();
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.target !== el) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
  main.querySelectorAll("[data-archive-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const c = courses.find((x) => x.id === btn.dataset.archiveToggle);
      const archiving = !c.archived;
      const hadMessages = c.messages && c.messages.length > 0;
      const go = async () => {
      if (archiving && hadMessages && !(await askConfirm(`Archive "${c.title}"?\n\nThis permanently deletes the course's private student–teacher messages (export any you want to keep first). Materials, grades, and the discussion board are kept.`))) return;
      run(async () => {
        await DB.setArchived(c.id, archiving);
        flashMessage = archiving
          ? `"${c.title}" was archived.${hadMessages ? " Its private messages have been deleted." : ""}`
          : `"${c.title}" is active again.`;
      });
      };
      if (archiving) confirmArchiveWithTranscripts(c, go); else go();
    });
    btn.addEventListener("keydown", (e) => e.stopPropagation());
  });
}

function renderCourse(main) {
  const c = courses.find((x) => x.id === activeCourseId);
  const key = `course:${c.id}`;
  const hasLectures = courseHasLectures(c);
  const playable = c.lessons.filter((l) => playableLesson(l)).length;
  const mine = c.assignments.map((a) => ({ a, sub: getSubmission(c, a, currentStudentId) }));
  const open = mine.filter((x) => x.sub.status !== "graded" && x.sub.status !== "submitted");
  const tabs = [
    { id: "overview", label: "Overview" },
    ...(hasLectures ? [{ id: "lectures", label: "Lectures", count: playable || "" }] : []),
    ...(c.materials.length ? [{ id: "materials", label: "Materials", count: docUnits(c.materials).length || "" }] : []),
    ...(c.assignments.length ? [{ id: "assignments", label: "Assignments", count: open.length || "", alert: open.some((x) => x.a.due < todayStr()) }] : []),
  ];
  const upcoming = open.slice().sort((x, y) => x.a.due.localeCompare(y.a.due)).slice(0, 3);
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to My Courses</button>
    <div class="page-header">
      <span class="pill pill-navy">${esc(c.level)} Level</span>
      <h1 style="margin-top:10px;">${esc(c.title)}</h1>
      <p>${esc(c.description)}</p>
      ${scheduleLine(c) ? `<p style="color:var(--muted-foreground);font-size:.85rem;margin-top:6px;">${esc(scheduleLine(c))}</p>` : ""}
      ${whereHtml(c)}
    </div>
    ${courseAttendHtml(c, "top")}
    ${tabsHtml(key, tabs)}
    <section ${panelAttrs(key, "overview")}>
      ${memoryCardHtml(c)}
      ${courseAnnouncementsHtml(c)}
      <div class="overview-grid">
        ${nextLectureHtml(c)}
        ${c.assignments.length ? `<div class="card overview-card">
          <div class="overview-head"><h3>${icon("note")} Assignments</h3><a href="#" data-goto-tab="assignments">All ${c.assignments.length}</a></div>
          ${upcoming.length ? `<ul class="assignments-list compact">${upcoming.map(({ a, sub }) => studentAssignmentRow(c, a, sub, { compact: true })).join("")}</ul>`
            : `<p class="field-hint" style="margin:0;">✓ Nothing waiting on you right now.</p>`}
        </div>` : ""}
        ${c.materials.length ? `<div class="card overview-card">
          <div class="overview-head"><h3>${icon("book")} Course Materials</h3><a href="#" data-goto-tab="materials">All ${docUnits(c.materials).length}</a></div>
          ${(() => {
            const syl = docGroups(c.materials).find((g) => g.id === "syllabus");
            return syl ? `<ul class="docs-list">${syl.units.slice(0, 2).map((u) => `<li class="doc-row"><div class="doc-main"><strong class="doc-name">${esc(u.base)}</strong></div><div class="doc-open">${u.files.map((f) => `<button type="button" class="btn btn-ghost btn-sm" data-open-material="${f.id}">${u.files.length === 1 ? "Open" : docKind(f)}</button>`).join("")}</div></li>`).join("")}</ul>`
              : `<p class="field-hint" style="margin:0;">${docUnits(c.materials).length} documents — syllabus, lessons, readings and more.</p>`;
          })()}
        </div>` : ""}
        ${!c.assignments.length && !c.materials.length && !hasLectures ? `<p class="field-hint" style="margin:0;">Your teacher hasn't posted anything for this course yet. Check back soon.</p>` : ""}
      </div>
    </section>
    ${hasLectures ? `<section ${panelAttrs(key, "lectures")}>${courseAttendHtml(c, "list")}</section>` : ""}
    ${c.materials.length ? `<section ${panelAttrs(key, "materials")}>
      <div class="section-title"><h2>Course Materials</h2></div>
      <div class="card">${materialsBrowserHtml(c)}</div>
    </section>` : ""}
    ${c.assignments.length ? `<section ${panelAttrs(key, "assignments")}>
      <div class="section-title"><h2>Assignments</h2></div>
      <div class="card">
        <ul class="assignments-list">
          ${c.assignments.length === 0 ? `<li style="border:none;color:var(--muted-foreground);">No assignments yet.</li>` : groupAssignments(c.assignments).map((g) => {
            if (g.items.length === 1) return studentAssignmentRow(c, g.items[0], getSubmission(c, g.items[0], currentStudentId));
            const today = todayStr();
            const next = g.items.find((a) => { const st = getSubmission(c, a, currentStudentId).status; return st !== "graded" && st !== "submitted"; }) || g.items[g.items.length - 1];
            const doneN = g.items.filter((a) => ["graded", "submitted"].includes(getSubmission(c, a, currentStudentId).status)).length;
            return `<li class="series-row">
              <details class="series-details">
                <summary>
                  <div><strong>🔁 ${esc(g.seriesLabel)}</strong> <span class="pill pill-navy">${doneN}/${g.items.length} done</span>
                    <div class="asg-meta">${g.items.length} weeks · ${g.items[0].points} pts each · next: ${esc(next.title)}, due ${parseDay(next.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</div></div>
                  <span class="series-more">Show weeks</span>
                </summary>
                <ul class="assignments-list">${g.items.map((a) => studentAssignmentRow(c, a, getSubmission(c, a, currentStudentId))).join("")}</ul>
              </details>
              <div class="series-next">${studentAssignmentRow(c, next, getSubmission(c, next, currentStudentId), { bare: true })}</div>
            </li>`;
          }).join("")}
        </ul>
      </div>
    </section>` : ""}
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "courses"; renderNav(); renderMain(); });
  main.querySelectorAll(".overview-card [data-open-material]").forEach((btn) => {
    btn.addEventListener("click", () => openMaterialViewer(c, c.materials.find((m) => m.id === btn.dataset.openMaterial)));
  });
  wireMaterialsBrowser(c, main);
  wireDocChips(c, main);
  main.querySelectorAll("[data-assignment]").forEach((btn) => {
    btn.addEventListener("click", () => openSubmitModal(c, c.assignments.find((a) => a.id === btn.dataset.assignment), currentStudentId));
  });
  wireTabs(key, main);
  wireCourseAttend(c, main);
  wireMemoryOpen(main);
}
function studentAssignmentRow(c, a, sub, opts = {}) {
  const [label, pillClass] = STATUS_LABEL[sub.status];
  const late = sub.status !== "graded" && sub.status !== "submitted" && a.due < todayStr();
  const body = `
    <div>
      <div><strong>${esc(a.title)}</strong></div>
      <div class="asg-meta ${late ? "asg-late" : ""}">Due ${parseDay(a.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})}${late ? " (past due)" : ""} · ${a.points} pts</div>
      ${opts.compact ? "" : assignmentDocsHtml(c, a)}
    </div>
    <div style="text-align:right;flex-shrink:0;">
      <span class="pill ${pillClass}">${label}${sub.status === "graded" ? ` · ${sub.score}/${a.points}` : ""}</span><br>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px;" data-assignment="${a.id}">${sub.status === "graded" ? "View" : "Turn In"}</button>
    </div>`;
  return opts.bare ? `<div class="asg-row">${body}</div>` : `<li>${body}</li>`;
}

// Student-side "turn in an assignment" modal — attach a file, write it
// right in the tool, save progress without either, or (once graded) just
// view the score and feedback. A locked assignment (see assignmentLock())
// shows why and when it opens instead of the submission form.
function openSubmitModal(course, assignment, studentId, onSaved) {
  const sub = getSubmission(course, assignment, studentId);
  const root = document.getElementById("modalRoot");
  const graded = sub.status === "graded";
  const lock = assignmentLock(assignment);
  root.innerHTML = `
    <div class="modal-backdrop ${graded || lock.locked ? "" : "no-dismiss"}">
      <div class="modal submit-modal" id="submitModal" style="max-width:600px;">
        <h2 style="font-size:1.15rem;">${esc(assignment.title)}</h2>
        <p style="color:var(--muted-foreground);font-size:.85rem;margin-top:4px;">Due ${parseDay(assignment.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${assignment.points} points</p>
        ${assignment.instructions ? `<p style="margin-top:10px;">${esc(assignment.instructions)}</p>` : ""}
        ${assignmentDocsHtml(course, assignment, { kinds: true })}
        ${graded ? `
          <div class="warning-box" style="border-color:var(--success);background:color-mix(in srgb, var(--success) 12%, transparent);">
            <div style="color:var(--success);"><strong>Graded: ${sub.score}/${assignment.points}</strong></div>
          </div>
          ${sub.feedback ? `<p style="font-size:.88rem;"><strong>Feedback:</strong> ${esc(sub.feedback)}</p>` : ""}
          ${sub.fileName ? `<p style="font-size:.82rem;color:var(--muted-foreground);">You submitted: ${esc(sub.fileName)} ${sub.storagePath ? `<button class="btn btn-ghost btn-sm" id="openMyFile" style="margin-left:6px;">Open</button>` : ""}</p>` : ""}
          ${sub.writtenContent ? `<div class="written-view">${safeHtml(sub.writtenContent)}</div>` : ""}
          <div class="form-actions"><button class="btn btn-ghost" id="submitClose">Close</button></div>
        ` : lock.locked ? `
          <div class="warning-box">
            ${icon("lock")}
            <p><strong>Not open yet.</strong> This assignment can be submitted starting ${parseDay(lock.opensOn).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}.</p>
          </div>
          <div class="form-actions"><button class="btn btn-ghost" id="submitClose">Close</button></div>
        ` : `
          ${sub.status === "submitted" ? `<p style="font-size:.85rem;color:var(--muted-foreground);margin-top:10px;">Turned in ${sub.fileName ? esc(sub.fileName) : sub.writtenContent ? "(written in editor)" : ""}${sub.submittedAt ? " on " + parseDay(sub.submittedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ""}. Awaiting a grade — you can still replace it below.${sub.fileName && sub.storagePath ? ` <button class="btn btn-ghost btn-sm" id="openMyFile" style="margin-left:6px;">Open</button>` : ""}</p>` : ""}

          <label>How would you like to submit?</label>
          <div class="radio-row">
            <label class="radio-option"><input type="radio" name="submitMethod" value="file" ${sub.writtenContent ? "" : "checked"} /> Attach a File</label>
            <label class="radio-option"><input type="radio" name="submitMethod" value="editor" ${sub.writtenContent ? "checked" : ""} /> Write In Editor</label>
          </div>

          <div id="submitFileWrap">
            <label for="submitFile">Attach Your Work</label>
            <input type="file" id="submitFile" accept="${UPLOAD_ACCEPT}" />
            <div class="field-hint">PDF, Word, a text file, or a photo of handwritten work — up to 25 MB.</div>
          </div>
          <div id="submitEditorWrap" style="display:none;">
            <label>Write Your Assignment</label>
            <div id="submitEditorMount"></div>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" id="submitTurnIn">Turn In</button>
            <button class="btn btn-ghost" id="submitProgress">Save as In Progress</button>
            <button class="btn btn-ghost" id="submitCancel">Cancel</button>
          </div>
        `}
      </div>
    </div>`;
  wireDocChips(course, root);
  if (graded || lock.locked) {
    document.getElementById("submitClose").addEventListener("click", closeModal);
    wireOpenMyFile();
    return;
  }
  wireOpenMyFile();
  function wireOpenMyFile() {
    const b = document.getElementById("openMyFile");
    if (b) b.addEventListener("click", () => openFileViewer({ bucket: "submissions", path: sub.storagePath, title: sub.fileName, subtitle: `${course.title} · ${assignment.title}`, mimeType: sub.mimeType, returnFocus: b }));
  }
  function method() { return document.querySelector('input[name="submitMethod"]:checked').value; }
  const teacher = courseTeacher(course);
  const editor = mountRichEditor(document.getElementById("submitEditorMount"), {
    html: sub.writtenContent || "",
    draftKey: `tnbbi-draft:${studentId}:${assignment.id}`,
    savedAt: sub.submittedAt || null,
    context: { student: currentUser ? currentUser.name : "", teacher: teacher ? teacher.name : "", course: course.title, assignment: assignment.title },
  });
  function syncMethodUI() {
    const editorMode = method() === "editor";
    document.getElementById("submitFileWrap").style.display = editorMode ? "none" : "";
    document.getElementById("submitEditorWrap").style.display = editorMode ? "" : "none";
    document.getElementById("submitModal").classList.toggle("modal-writer", editorMode);
    document.getElementById("submitModal").style.maxWidth = editorMode ? "" : "600px";
  }
  syncMethodUI();
  document.querySelectorAll('input[name="submitMethod"]').forEach((r) => r.addEventListener("change", syncMethodUI));
  document.getElementById("submitCancel").addEventListener("click", async () => {
    if (method() === "editor" && editor.isDirty() && !(await askConfirm("Close without saving?\n\nYour writing is kept as a draft on this device, and you'll be offered it the next time you open this assignment here."))) return;
    closeModal();
  });
  const afterSave = onSaved || (() => renderMain());
  document.getElementById("submitProgress").addEventListener("click", () => {
    const html = method() === "editor" && !editor.isEmpty() ? editor.getHtml() : undefined;
    run(async () => {
      await DB.saveSubmission({ courseId: course.id, assignment, studentId, status: "in_progress", writtenContent: html, previous: sub });
      if (html !== undefined) editor.clearDraft();
      closeModal();
    }, afterSave, { success: "Progress saved." });
  });
  document.getElementById("submitTurnIn").addEventListener("click", () => {
    let file = null;
    let html;
    if (method() === "editor") {
      if (editor.isEmpty()) { editor.focus(); toast("Write your assignment first."); return; }
      html = editor.getHtml();
      editor.exitFull();
    } else {
      const fileInput = document.getElementById("submitFile");
      file = fileInput.files[0];
      if (!file) { fileInput.focus(); return; }
      try { checkUpload(file, SUBMISSION_MAX_BYTES); } catch (err) { toast(err.message); return; }
    }
    run(async () => {
      await DB.saveSubmission({ courseId: course.id, assignment, studentId, status: "submitted", file, writtenContent: html, previous: sub });
      if (html) editor.clearDraft();
      closeModal();
    }, () => { if (afterSave) afterSave(); else renderMain(); celebrateTurnIn(assignment.title); });
  });
}

// Student: everything due across every live, enrolled course, in one inbox
// — plus a quick-pick at the top so you can jump straight to a specific
// assignment (from the list the professor entered for that course) rather
// than scanning the whole inbox first.
function renderSubmitWork(main) {
  // Every assignment in every course you're enrolled in (including courses
  // that haven't started yet), grouped by course, in due-date order. "Submit
  // any time" assignments can be turned in now; locked ones show the day they
  // open and unlock on their own that morning.
  const today = todayStr();
  const myCourses = courses
    .filter((c) => !c.archived && c.studentIds.includes(currentStudentId))
    .sort((a, b) => (isLive(b) - isLive(a)) || a.title.localeCompare(b.title));
  let toDo = 0;
  const groups = myCourses.map((c) => {
    const items = [...c.assignments].sort((x, y) => x.due.localeCompare(y.due) || x.title.localeCompare(y.title)).map((a) => {
      const sub = getSubmission(c, a, currentStudentId);
      const lock = assignmentLock(a);
      const done = sub.status === "submitted" || sub.status === "graded";
      if (!done && !lock.locked) toDo++;
      return { c, a, sub, lock, done };
    });
    return { c, items };
  });

  const itemHtml = ({ c, a, sub, lock, done }) => {
    const overdue = !done && a.due < today;
    let pill, btn;
    if (sub.status === "graded") {
      pill = `<span class="pill pill-green">${sub.score}/${a.points}</span>`;
      btn = `<button class="btn btn-ghost btn-sm" data-item="${c.id}|${a.id}">View Grade</button>`;
    } else if (sub.status === "submitted") {
      pill = `<span class="pill pill-gold">Turned In</span>`;
      btn = `<button class="btn btn-ghost btn-sm" data-item="${c.id}|${a.id}">View or Replace</button>`;
    } else if (lock.locked) {
      pill = `<span class="pill pill-gray">${icon("lock")} Locked</span>`;
      btn = `<button class="btn btn-ghost btn-sm" disabled>Opens ${fmtDay(lock.opensOn, { month: "short", day: "numeric" })}</button>`;
    } else {
      pill = overdue ? `<span class="pill pill-red">Overdue</span>` : sub.status === "in_progress" ? `<span class="pill pill-navy">In Progress</span>` : `<span class="pill pill-navy">Open</span>`;
      btn = `<button class="btn btn-gold btn-sm" data-item="${c.id}|${a.id}">${sub.status === "in_progress" ? "Continue" : "Start"}</button>`;
    }
    return `<li class="submit-item ${lock.locked && !done ? "submit-item-locked" : ""}">
      <div style="min-width:0;">
        <div><strong>${esc(a.title)}</strong></div>
        <div style="font-size:.82rem;color:var(--muted-foreground);margin-top:4px;">Due ${fmtDay(a.due, { weekday: "short", month: "short", day: "numeric" })} · ${a.points} pts${
          lock.locked && !done ? ` · <strong>Opens ${fmtDay(lock.opensOn, { weekday: "long", month: "short", day: "numeric" })}</strong>`
          : a.submitAnytime === false && a.openDate ? ` · Opened ${fmtDay(a.openDate, { month: "short", day: "numeric" })}` : " · Submit any time"}</div>
      </div>
      <div class="submit-item-actions">${pill}${btn}</div>
    </li>`;
  };

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">Student Dashboard</div>
      <h1>Submit Work</h1>
      <p>Every assignment in your courses. Open ones can be turned in now; locked ones open on the date shown.</p>
    </div>
    ${myCourses.length === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("upload")}</div>
      <p>Once you're enrolled in a course, its assignments will appear here.</p>
    </div>` : `
    <div class="submit-summary">${toDo ? `<strong>${toDo}</strong> assignment${toDo === 1 ? "" : "s"} open to turn in` : "You're all caught up on everything that's open."}</div>
    ${groups.map(({ c, items }) => `
      <div class="section-title"><h2>${esc(c.title)}</h2>${isLive(c) ? "" : `<span class="pill pill-navy">${c.schedule.startDate ? `Starts ${fmtDay(c.schedule.startDate, { month: "short", day: "numeric" })}` : "Not started"}</span>`}</div>
      <div class="card">
        ${items.length === 0 ? `<p style="margin:0;color:var(--muted-foreground);">No assignments posted yet.</p>` : `<ul class="assignments-list">${items.map(itemHtml).join("")}</ul>`}
      </div>`).join("")}`}
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  main.querySelectorAll("[data-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [cid, aid] = btn.dataset.item.split("|");
      const c = courses.find((x) => x.id === cid);
      const a = c.assignments.find((x) => x.id === aid);
      openSubmitModal(c, a, currentStudentId, () => renderMain());
    });
  });
}

// A real grid calendar — day blocks in a Month or 2-Week view — rather
// than a flat list. Every assignment due date across every course you're
// part of shows up as a marker on its day; click a day to see what's due
// then, with the same status vocabulary used everywhere else in the app
// (Turned In / Missing / graded score for students, "N to grade" for
// faculty). calendarCursor/calendarMode persist across visits to the tab
// so browsing forward and coming back doesn't reset you to today.
function calendarRowsByDate() {
  const myCourses = role === "student"
    ? courses.filter((c) => !c.archived && c.studentIds.includes(currentStudentId))
    : courses.filter((c) => !c.archived && iTeach(c));
  const byDate = {};
  myCourses.forEach((c) => {
    c.assignments.forEach((a) => {
      const row = role === "student"
        ? { c, a, sub: getSubmission(c, a, currentStudentId) }
        : (() => {
            ensureSubmissions(c, a);
            const total = c.studentIds.length;
            const gradedCount = a.submissions.filter((s) => s.status === "graded").length;
            const needsCount = a.submissions.filter((s) => s.status === "submitted").length;
            return { c, a, gradedCount, needsCount, total };
          })();
      (byDate[a.due] = byDate[a.due] || []).push(row);
    });
  });
  return byDate;
}

// The days each of your classes meets: the courses you teach, or (for a
// student) the courses you're enrolled in. A day the teacher marked "no
// class" is left off.
function calendarClassesByDate() {
  const out = {};
  const mine = role === "student"
    ? courses.filter((c) => !c.archived && c.pace !== "self" && c.studentIds.includes(currentStudentId))
    : courses.filter((c) => !c.archived && iTeach(c));
  mine.forEach((c) => {
    classDates(c).forEach((d) => {
      const day = (c.attDays || {})[d];
      if (day && day.held === false) return;
      (out[d] = out[d] || []).push(c);
    });
  });
  return out;
}
// Canceled class days in my courses: date → [course].
function calendarCanceledByDate() {
  const out = {};
  const mine = role === "student"
    ? courses.filter((c) => !c.archived && c.studentIds.includes(currentStudentId))
    : courses.filter((c) => !c.archived && iTeach(c));
  mine.forEach((c) => Object.keys(c.cancellations || {}).forEach((d) => (out[d] = out[d] || []).push(c)));
  return out;
}
function classMeetsText(c) {
  return c.schedule && c.schedule.time ? `Class meets ${fmtTime(c.schedule.time)}` : "Class day (time not set yet)";
}

// Tapping a calendar day: what's due (and, for teachers, which classes meet).
function openCalendarDayModal(ds, rows, classes, after) {
  const today = todayStr();
  const heading = parseDay(ds).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + (ds === today ? " — Today" : "");
  const root = document.getElementById("modalRoot");
  const due = (a) => `Due ${fmtDay(a.due, { month: "short", day: "numeric" })} · ${a.points} pts`;

  const canceledHere = calendarCanceledByDate()[ds] || [];
  const canceledHtml = canceledHere.map((c) => `<div class="cal-modal-class cal-modal-canceled">
        <div class="cal-class-icon">${icon("cancel")}</div>
        <div style="flex:1;min-width:0;"><strong>${esc(c.title)}</strong> <span class="pill pill-red">Canceled</span><div class="field-hint" style="margin:2px 0 0;">${esc(c.cancellations[ds] || "No class this day.")}</div></div>
        ${role !== "student" && iManage(c) && ds >= today ? `<button class="btn btn-ghost btn-sm" data-cal-restore="${c.id}">Put Back On</button>` : ""}
      </div>`).join("");
  const classHtml = classes.map((c) => {
    const day = (c.attDays || {})[ds];
    const action = role === "student" ? ""
      : !c.att.on ? `<span class="field-hint" style="margin:0;">Not recording attendance</span>`
      : ds > today ? `<span class="pill pill-navy">Upcoming</span>`
      : `<button class="btn ${day ? "btn-ghost" : "btn-primary"} btn-sm" data-cal-att="${c.id}">${day ? (day.held ? "✓ View Attendance" : "No class — Edit") : "Take Attendance"}</button>`;
    return `<div class="cal-modal-class">
        <div class="cal-class-icon">${icon("calendar")}</div>
        <div style="flex:1;min-width:0;"><strong>${esc(c.title)}</strong><div class="field-hint" style="margin:2px 0 0;">${esc(classMeetsText(c))}</div>${whereHtml(c, { short: true })}</div>
        <div class="cal-class-actions">${action}${role !== "student" && iManage(c) && ds >= today ? `<button class="btn btn-ghost btn-sm" data-cal-cancel="${c.id}">Cancel Class</button>` : ""}</div>
      </div>`;
  }).join("");

  const asgHtml = rows.map((row) => {
    const { c, a } = row;
    const head = `
      <div class="cal-asg-head">
        <div><strong>${esc(a.title)}</strong><div class="field-hint" style="margin:2px 0 0;">${esc(c.title)} · ${due(a)}</div></div>
      </div>
      ${a.instructions ? `<p class="cal-asg-instructions">${esc(a.instructions)}</p>` : ""}`;
    if (role === "student") {
      const sub = getSubmission(c, a, currentStudentId);
      const lock = assignmentLock(a);
      const missing = a.due < today && sub.status !== "submitted" && sub.status !== "graded";
      const [label, cls] = missing ? ["Missing", "pill-red"] : STATUS_LABEL[sub.status];
      const btn = lock.locked && sub.status !== "graded"
        ? `<button class="btn btn-ghost btn-sm" disabled>Opens ${fmtDay(lock.opensOn, { month: "short", day: "numeric" })}</button>`
        : `<button class="btn ${sub.status === "graded" || sub.status === "submitted" ? "btn-ghost" : "btn-gold"} btn-sm" data-cal-submit="${c.id}|${a.id}">${
            sub.status === "graded" ? "View Grade & Feedback" : sub.status === "submitted" ? "View or Replace Submission" : sub.status === "in_progress" ? "Continue Assignment" : "Start Assignment"}</button>`;
      return `<div class="cal-modal-asg">${head}
        <div class="cal-asg-foot"><span class="pill ${cls}">${sub.status === "graded" ? `${sub.score}/${a.points}` : label}</span>${btn}</div></div>`;
    }
    const roster = rosterByLastName(c);
    const subs = ensureSubmissions(c, a);
    const done = (sid) => { const st = (subs.find((x) => x.studentId === sid) || {}).status; return st === "submitted" || st === "graded"; };
    const doneCount = roster.filter((u) => done(u.id)).length;
    return `<div class="cal-modal-asg">${head}
      <div class="cal-asg-count"><strong>${doneCount} of ${roster.length}</strong> turned in</div>
      ${roster.length ? `<ul class="orb-list">${roster.map((u) => {
        const ok = done(u.id);
        return `<li><span class="orb ${ok ? "orb-green" : "orb-red"}" aria-hidden="true"></span><span>${esc(lastFirst(u.name))}</span><span class="sr-only">${ok ? "turned in" : "not turned in"}</span></li>`;
      }).join("")}</ul>` : `<p class="field-hint">No students enrolled.</p>`}
      <div class="cal-asg-foot"><span></span><button class="btn btn-ghost btn-sm" data-cal-roster="${c.id}|${a.id}">Open Submissions</button></div>
    </div>`;
  }).join("");

  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal cal-modal" role="dialog" aria-modal="true" aria-labelledby="calModalTitle" style="max-width:560px;">
        <h2 id="calModalTitle" style="font-size:1.15rem;margin:0 0 14px;">${heading}</h2>
        ${classes.length || canceledHere.length ? `<div class="cal-modal-section"><div class="cal-modal-label">Class</div>${canceledHtml}${classHtml}</div>` : ""}
        ${rows.length ? `<div class="cal-modal-section"><div class="cal-modal-label">${rows.length === 1 ? "Assignment due" : `${rows.length} assignments due`}</div>${asgHtml}</div>` : ""}
        <div class="form-actions"><button class="btn btn-ghost" id="calModalClose">Close</button></div>
      </div>
    </div>`;
  document.getElementById("calModalClose").addEventListener("click", closeModal);
  root.querySelectorAll("[data-cal-att]").forEach((b) => b.addEventListener("click", () => openAttendance(b.dataset.calAtt, ds, "calendar")));
  root.querySelectorAll("[data-cal-cancel]").forEach((b) => b.addEventListener("click", () => openCancelClassModal(courses.find((x) => x.id === b.dataset.calCancel), ds, after)));
  root.querySelectorAll("[data-cal-restore]").forEach((b) => b.addEventListener("click", () => { closeModal(); restoreClassDay(courses.find((x) => x.id === b.dataset.calRestore), ds, after); }));
  root.querySelectorAll("[data-cal-submit]").forEach((b) => b.addEventListener("click", () => {
    const [cid, aid] = b.dataset.calSubmit.split("|");
    const c = courses.find((x) => x.id === cid);
    openSubmitModal(c, c.assignments.find((x) => x.id === aid), currentStudentId, after);
  }));
  root.querySelectorAll("[data-cal-roster]").forEach((b) => b.addEventListener("click", () => {
    const [cid, aid] = b.dataset.calRoster.split("|");
    const c = courses.find((x) => x.id === cid);
    openAssignmentRoster(c, c.assignments.find((x) => x.id === aid));
  }));
}

function calendarStatusPill(row, today) {
  const { a } = row;
  if (role === "student") {
    const { sub } = row;
    if (sub.status === "graded") return `<span class="pill pill-green">${sub.score}/${a.points}</span>`;
    if (sub.status === "submitted") return `<span class="pill pill-gold">Turned In</span>`;
    if (a.due < today) return `<span class="pill pill-red">Missing</span>`;
    return `<span class="pill pill-navy">Not due yet</span>`;
  }
  const { gradedCount, needsCount, total } = row;
  if (needsCount > 0) return `<span class="pill pill-gold">${needsCount} to grade</span>`;
  if (total > 0 && gradedCount === total) return `<span class="pill pill-green">All graded</span>`;
  if (a.due < today) return `<span class="pill pill-red">${Math.max(total - gradedCount - needsCount, 0)} missing</span>`;
  return `<span class="pill pill-navy">Not due yet</span>`;
}

function calendarDotClass(rows, today) {
  // One dot color per day, worst-status-wins, so a day reads at a glance.
  if (role === "student") {
    if (rows.some((r) => r.sub.status !== "graded" && r.sub.status !== "submitted" && r.a.due < today)) return "cal-dot-red";
    if (rows.some((r) => r.sub.status === "submitted")) return "cal-dot-gold";
    if (rows.every((r) => r.sub.status === "graded")) return "cal-dot-green";
    return "cal-dot-navy";
  }
  if (rows.some((r) => r.needsCount > 0)) return "cal-dot-gold";
  if (rows.some((r) => r.a.due < today && r.gradedCount < r.total)) return "cal-dot-red";
  if (rows.every((r) => r.gradedCount === r.total)) return "cal-dot-green";
  return "cal-dot-navy";
}

// "Add to My Phone's Calendar": a private link the phone's own calendar app
// subscribes to (served by the calendar-feed function at Supabase), so class
// days and due dates appear there and keep themselves up to date.
function calendarFeedUrl(token) {
  return `${TNBBI_CONFIG.supabaseUrl.replace(/\/$/, "")}/functions/v1/calendar-feed?t=${encodeURIComponent(token)}`;
}
async function openPhoneCalendarModal() {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal phone-cal-modal" role="dialog" aria-modal="true" aria-labelledby="pcTitle" style="max-width:540px;">
        <h2 id="pcTitle" style="font-size:1.15rem;margin:0 0 6px;">Add to My Phone's Calendar</h2>
        <div id="pcBody"><p class="field-hint">Getting your calendar link…</p></div>
        <div class="form-actions"><button class="btn btn-ghost" id="pcClose">Close</button></div>
      </div>
    </div>`;
  document.getElementById("pcClose").addEventListener("click", closeModal);
  let token;
  try { token = await DB.myCalendarToken(); }
  catch (e) { const b = document.getElementById("pcBody"); if (b) b.innerHTML = `<p class="field-hint" style="color:var(--destructive);">${esc(friendlyError(e))}</p>`; return; }
  renderPhoneCalendarBody(token);
}
function renderPhoneCalendarBody(token) {
  const body = document.getElementById("pcBody");
  if (!body) return;
  const https = calendarFeedUrl(token);
  const webcal = https.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  const apple = isIOS() || /Macintosh/.test(navigator.userAgent);
  const android = /Android/.test(navigator.userAgent);
  const appleBlock = `
    <div class="pc-option">
      <div class="pc-head"><strong>iPhone, iPad, or Mac</strong></div>
      <a class="btn ${apple || !android ? "btn-gold" : "btn-ghost"} btn-sm" id="pcApple" href="${esc(webcal)}">Add to Apple Calendar</a>
      <p class="field-hint">Tap it, then tap <strong>Subscribe</strong> (on a Mac: <strong>Subscribe</strong>, then <strong>OK</strong>). On iPhone you can choose how often it checks for updates in Settings → Calendar → Accounts → Subscribed Calendars.</p>
    </div>`;
  const googleBlock = `
    <div class="pc-option">
      <div class="pc-head"><strong>Android or Google Calendar</strong></div>
      <a class="btn ${android ? "btn-gold" : "btn-ghost"} btn-sm" id="pcGoogle" href="${esc(google)}" target="_blank" rel="noopener">Add to Google Calendar</a>
      <p class="field-hint">Sign in with the Google account your phone uses, then tap <strong>Add</strong>. If it doesn't show on your phone, open the Google Calendar app → Settings → <strong>TNBBI Classes</strong> → turn on <strong>Sync</strong>. Google checks for changes a few times a day.</p>
    </div>`;
  body.innerHTML = `
    <p style="margin:0 0 14px;">Your class days and due dates will show up in your phone's own calendar app, right next to everything else — and they keep themselves up to date. When a teacher adds an assignment or changes a class, your phone picks it up on its own.</p>
    ${android ? googleBlock + appleBlock : appleBlock + googleBlock}
    <div class="pc-option">
      <div class="pc-head"><strong>Outlook or another calendar app</strong></div>
      <div class="pc-copy">
        <input type="text" id="pcLink" readonly value="${esc(https)}" aria-label="Your calendar link">
        <button class="btn btn-ghost btn-sm" id="pcCopy">Copy Link</button>
      </div>
      <p class="field-hint">Choose "Add calendar → From the internet" (or "Subscribe") and paste this link.</p>
    </div>
    <div class="privacy-note" style="margin-top:6px;">${icon("lock")}<span>This link is yours alone — anyone who has it can see your class schedule and assignment names, so please don't share it. Class times are Alaska time, shown as 1½ hours each. <button type="button" class="link-btn" id="pcReset">Get a new link</button> (the old one stops working).</span></div>`;
  document.getElementById("pcLink").addEventListener("focus", (e) => e.target.select());
  document.getElementById("pcCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(https); toast("Link copied.", "success"); }
    catch (e) { const i = document.getElementById("pcLink"); i.focus(); i.select(); toast("Press and hold (or Ctrl+C) to copy the selected link."); }
  });
  document.getElementById("pcReset").addEventListener("click", async () => {
    if (!(await askConfirm("Make a new calendar link? The old link will stop working — any phone or computer that added it will need the new one."))) return;
    try { renderPhoneCalendarBody(await DB.resetCalendarToken()); toast("New link ready. Add it to your calendar again.", "success"); }
    catch (e) { toast(friendlyError(e)); }
  });
}

function renderCalendar(main) {
  const today = todayStr();
  const byDate = calendarRowsByDate();
  const cursor = new Date(calendarCursor + "T00:00:00");

  let days = [];
  let rangeLabel = "";
  if (calendarMode === "month") {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = first.getDay();
    const gridStart = new Date(first);
    gridStart.setDate(gridStart.getDate() - startOffset);
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    rangeLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } else {
    const startOffset = cursor.getDay();
    const gridStart = new Date(cursor);
    gridStart.setDate(gridStart.getDate() - startOffset);
    for (let i = 0; i < 14; i++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    const last = days[days.length - 1];
    rangeLabel = `${gridStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${last.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }

  const classesByDate = calendarClassesByDate();
  const canceledByDate = calendarCanceledByDate();
  const totalAssignments = Object.values(byDate).reduce((n, rows) => n + rows.length, 0) + Object.keys(classesByDate).length;
  const selectedDate = days.find((d) => localISO(d) === calendarCursor) ? calendarCursor : today;

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${role === "student" ? "Student Dashboard" : staffEyebrow()}</div>
      <h1>Calendar</h1>
      <p>${role === "student" ? "Your class days and every assignment due date. Tap a day to see what's due and start it." : "Your class days and every assignment due date in the courses you teach. Tap a day for details."}</p>
    </div>
    ${totalAssignments === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("calendar")}</div>
      <p>${role === "student" ? "Once you're enrolled in a course, its class days and assignments will show up here." : "Once a course you teach has a schedule or assignments, they'll show up here."}</p>
    </div>` : `
    <div class="cal-toolbar">
      <div class="cal-nav">
        <button class="btn btn-ghost btn-sm" id="calPrev" aria-label="Previous">&larr;</button>
        <div class="cal-range">${rangeLabel}</div>
        <button class="btn btn-ghost btn-sm" id="calNext" aria-label="Next">&rarr;</button>
        <button class="btn btn-ghost btn-sm" id="calToday">Today</button>
      </div>
      <div class="cal-view-toggle">
        <button class="${calendarMode === "twoweek" ? "active" : ""}" data-cal-mode="twoweek">2 Weeks</button>
        <button class="${calendarMode === "month" ? "active" : ""}" data-cal-mode="month">Month</button>
      </div>
    </div>
    <div class="cal-grid ${calendarMode === "twoweek" ? "cal-grid-twoweek" : ""}">
      ${DAY_NAMES.map((d) => `<div class="cal-weekday">${d}</div>`).join("")}
      ${days.map((d) => {
        const ds = localISO(d);
        const rows = byDate[ds] || [];
        const classes = classesByDate[ds] || [];
        const inRangeMonth = calendarMode === "month" ? d.getMonth() === cursor.getMonth() : true;
        const isToday = ds === today;
        const isSelected = ds === selectedDate;
        return `<button type="button" class="cal-day ${inRangeMonth ? "" : "cal-day-outside"} ${isToday ? "cal-day-today" : ""} ${isSelected ? "cal-day-selected" : ""}" data-cal-day="${ds}">
          <span class="cal-day-num">${d.getDate()}</span>
          ${rows.length ? `<span class="cal-dot ${calendarDotClass(rows, today)}" title="${rows.length} due"></span>` : ""}
          ${(canceledByDate[ds] || []).length ? `<span class="cal-class cal-class-canceled" title="${esc(canceledByDate[ds].map((c) => `${c.title} canceled`).join(", "))}"><span class="cal-class-text">Canceled</span></span>` : ""}
          ${classes.length ? `<span class="cal-class ${role !== "student" && classes.some((c) => takesClassroomAttendance(c) && ds <= today && !c.attDays[ds]) ? "cal-class-todo" : ""}" title="${esc(classes.map((c) => `${c.title} ${fmtTime(c.schedule.time) || ""}`).join(", "))}"><span class="cal-class-text">${classes.length > 1 ? `${classes.length} classes` : esc(fmtTime(classes[0].schedule.time) || "Class")}</span></span>` : ""}
        </button>`;
      }).join("")}
    </div>
    <div class="cal-legend">
      <span><span class="cal-dot cal-dot-navy"></span> Assignment due</span>
      <span><span class="cal-class cal-class-legend"></span> Class meets</span>
      <span><span class="cal-class cal-class-canceled cal-class-legend"></span> Canceled</span>
      ${role === "student" ? "" : `<span><span class="cal-class cal-class-todo cal-class-legend"></span> Attendance not taken</span>`}
    </div>
    <div class="cal-takeaway">
      <button class="btn btn-gold btn-sm" id="calPhone">${icon("calendar")} Add to My Phone's Calendar</button>
      <button class="btn btn-ghost btn-sm" id="calReminders">${icon("bell")} ${role === "student" ? "Due-Date Reminders" : "Class Reminders"}</button>
    </div>
    <div class="card" id="calDayDetail" style="margin-top:14px;"></div>
    `}
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  if (totalAssignments === 0) return;

  function renderDayDetail(ds) {
    const wrap = document.getElementById("calDayDetail");
    const rows = byDate[ds] || [];
    const d = new Date(ds + "T00:00:00");
    const heading = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + (ds === today ? " — Today" : "");
    wrap.innerHTML = `
      <div class="section-title" style="margin:0 0 6px;"><h2 style="font-size:1rem;">${heading}</h2></div>
      ${(canceledByDate[ds] || []).map((c) => `<p style="margin:0 0 8px;font-size:.88rem;"><span class="cal-class cal-class-canceled cal-class-legend"></span> <strong>${esc(c.title)}</strong> · Canceled${c.cancellations[ds] ? ` — ${esc(c.cancellations[ds])}` : ""}</p>`).join("")}
      ${(classesByDate[ds] || []).map((c) => `<p style="margin:0 0 8px;font-size:.88rem;"><span class="cal-class cal-class-legend"></span> <strong>${esc(c.title)}</strong> · ${esc(classMeetsText(c))}</p>`).join("")}
      ${rows.length === 0 ? `<p style="color:var(--muted-foreground);font-size:.88rem;">Nothing due this day.</p>` : `
      <ul class="assignments-list">
        ${rows.map((row) => `
        <li>
          <div>
            <div><strong>${esc(row.a.title)}</strong></div>
            <div style="font-size:.82rem;color:var(--muted-foreground);margin-top:4px;">${esc(row.c.title)}${row.a.seriesLabel ? " · " + esc(row.a.seriesLabel) : ""}</div>
          </div>
          ${calendarStatusPill(row, today)}
        </li>`).join("")}
      </ul>`}
    `;
  }
  renderDayDetail(selectedDate);

  document.getElementById("calPrev").addEventListener("click", () => {
    const c = new Date(calendarCursor + "T00:00:00");
    if (calendarMode === "month") c.setMonth(c.getMonth() - 1); else c.setDate(c.getDate() - 14);
    calendarCursor = localISO(c);
    renderCalendar(main);
  });
  document.getElementById("calNext").addEventListener("click", () => {
    const c = new Date(calendarCursor + "T00:00:00");
    if (calendarMode === "month") c.setMonth(c.getMonth() + 1); else c.setDate(c.getDate() + 14);
    calendarCursor = localISO(c);
    renderCalendar(main);
  });
  document.getElementById("calToday").addEventListener("click", () => { calendarCursor = today; renderCalendar(main); });
  document.getElementById("calPhone").addEventListener("click", openPhoneCalendarModal);
  document.getElementById("calReminders").addEventListener("click", () => {
    openProfile();
    requestAnimationFrame(() => { const el = document.getElementById("reminderCard"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); });
  });
  main.querySelectorAll("[data-cal-mode]").forEach((btn) => {
    btn.addEventListener("click", () => { calendarMode = btn.dataset.calMode; renderCalendar(main); });
  });
  main.querySelectorAll("[data-cal-day]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ds = btn.dataset.calDay;
      calendarCursor = ds;
      main.querySelectorAll("[data-cal-day]").forEach((b) => b.classList.remove("cal-day-selected"));
      btn.classList.add("cal-day-selected");
      renderDayDetail(ds);
      const rows = byDate[ds] || [];
      const classes = classesByDate[ds] || [];
      if (rows.length || classes.length || (canceledByDate[ds] || []).length) openCalendarDayModal(ds, rows, classes, () => renderMain());
    });
  });
}

// Student: a running, per-course grade — visible only to that student —
// plus every assignment's status and score as it's given, so the
// cumulative grade is easy to watch move through the semester.
function renderMyGrades(main) {
  const myCourses = courses.filter((c) => isLive(c) && c.studentIds.includes(currentStudentId));
  const feedbackRows = [];
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">Student Dashboard</div>
      <h1>My Grades</h1>
      <p>Your grades only — as each one is posted, and a running grade for each course.</p>
    </div>
    ${courseCompleteHtml(120)}
    <button type="button" class="card transcript-link" id="openTranscript">
      <span class="icon-badge hue-wine">${icon("scroll")}</span>
      <span><strong>My Transcript</strong><small>Your permanent record of finished courses — download it as a PDF.</small></span>
      <span class="week-go">Open</span>
    </button>
    ${myCourses.length === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("cap")}</div>
      <p>No courses yet.</p>
    </div>` : myCourses.map((c) => {
      const grade = computeCourseGrade(c, currentStudentId);
      const rows = [...c.assignments].sort((a, b) => a.due.localeCompare(b.due));
      const letterCls = letterPillClass(grade.letter);
      rows.forEach((a) => {
        const sub = getSubmission(c, a, currentStudentId);
        if (sub.status === "graded" && sub.feedback) feedbackRows.push({ c, a, sub });
      });
      return `
    <div class="section-title">
      <h2>${esc(c.title)}</h2>
      ${grade.pct === null ? `<span class="pill pill-gray">No grade yet</span>` : `<span><strong>${grade.pct}%</strong> <span class="pill ${letterCls}" style="margin-left:4px;">${grade.letter}</span></span>`}
    </div>
    ${c.att.on && grade.attendance ? `
    <div class="card att-mine">
      <div class="att-mine-head">
        <div><strong>Attendance${grade.attendance.pct !== null ? `: ${grade.attendance.pct}%` : ""}</strong>
          <span class="field-hint" style="margin:0 0 0 6px;">${c.att.weight ? `${c.att.weight}% of your grade` : "not part of your grade"}</span></div>
        <div class="att-summary att-summary-sm">${ATT_STATUSES.map((s) => `<span class="att-count att-count-${s}"><strong>${grade.attendance.counts[s]}</strong> ${ATT_LABEL[s]}</span>`).join("")}</div>
      </div>
      ${grade.attendance.rows.length ? `<details><summary>See each class day</summary>
        <ul class="att-days">${grade.attendance.rows.slice().reverse().map((r) => `<li><span>${fmtDay(r.date, { weekday: "short", month: "short", day: "numeric" })}</span><span class="att-pill att-pill-${r.status}">${ATT_LABEL[r.status]}</span></li>`).join("")}</ul>
      </details>` : `<p class="field-hint" style="margin:8px 0 0;">No attendance taken yet.</p>`}
    </div>` : ""}
    <div class="card">
      <table>
        <thead><tr><th>Assignment</th><th>Due</th><th>Status</th><th style="text-align:right;">Grade</th></tr></thead>
        <tbody>
          ${rows.length === 0 ? `<tr><td colspan="4" style="color:var(--muted-foreground);">No assignments yet.</td></tr>` : rows.map((a) => {
            const sub = getSubmission(c, a, currentStudentId);
            const missing = a.due < todayStr() && sub.status !== "submitted" && sub.status !== "graded";
            const [label, pillClass] = missing ? ["Missing", "pill-gray"] : STATUS_LABEL[sub.status];
            return `<tr>
              <td>${esc(a.title)}</td>
              <td>${parseDay(a.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</td>
              <td><span class="pill ${pillClass}">${label}</span></td>
              <td style="text-align:right;">${sub.status === "graded" ? `<strong>${sub.score}/${a.points}</strong>` : missing ? `<strong style="color:var(--destructive);">0/${a.points}</strong>` : "—"}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
    }).join("")}
    ${feedbackRows.length ? `
    <div class="section-title"><h2>Feedback</h2></div>
    ${feedbackRows.map((r) => `
      <div class="card">
        <div style="font-size:.78rem;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.04em;">${esc(r.c.title)} · ${esc(r.a.title)}</div>
        <p style="margin-top:6px;margin-bottom:0;">${esc(r.sub.feedback)}</p>
      </div>`).join("")}
    ` : ""}
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  document.getElementById("openTranscript").addEventListener("click", () => { view = "transcript"; renderNav(); renderMain(); });
}

// Faculty: everything turned in across every course, waiting on a grade,
// plus a quick look at what's already been graded.
function renderGrading(main) {
  const activeCourses = courses.filter((c) => !c.archived && iTeach(c));
  const needsGrading = [];
  const graded = [];
  activeCourses.forEach((c) => {
    c.assignments.forEach((a) => {
      ensureSubmissions(c, a).forEach((sub) => {
        if (sub.status === "submitted") needsGrading.push({ c, a, sub });
        else if (sub.status === "graded") graded.push({ c, a, sub });
      });
    });
  });
  needsGrading.sort((x, y) => (x.sub.submittedAt || "").localeCompare(y.sub.submittedAt || ""));
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${staffEyebrow()}</div>
      <h1>Grading</h1>
      <p>Work turned in across the courses you teach, waiting on a grade.</p>
    </div>
    <div class="section-title"><h2>Grade Sheets</h2></div>
    ${activeCourses.length === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("cap")}</div>
      <p>You aren't teaching any active courses. Add one from the Courses page, or ask an Admin to assign you as a course's teacher.</p>
    </div>` : `
    <div class="grid grid-compact">
      ${activeCourses.map((c) => {
        const withGrade = c.studentIds.filter((sid) => computeCourseGrade(c, sid).pct !== null).length;
        return `
      <div class="tile tile-compact" data-sheet="${c.id}" tabindex="0" role="button">
        <span class="pill pill-navy">${esc(c.level)} Level</span>
        <h3>${esc(c.title)}</h3>
        <p class="tile-meta">${c.studentIds.length} student${c.studentIds.length === 1 ? "" : "s"} · ${withGrade} with a grade so far</p>
      </div>`;
      }).join("")}
    </div>`}
    <div class="section-title"><h2>Needs Grading (${needsGrading.length})</h2></div>
    <div class="card">
      ${needsGrading.length === 0 ? `<div class="empty-state"><p>Nothing waiting on you right now.</p></div>` : `
      <ul class="assignments-list">
        ${needsGrading.map(({ c, a, sub }) => `
        <li>
          <div>
            <div><strong>${esc(userName(sub.studentId))}</strong> — ${esc(a.title)}${isLateSubmission(a, sub) ? ` <span class="pill pill-red">Late</span>` : ""}</div>
            <div style="font-size:.82rem;color:var(--muted-foreground);margin-top:4px;">${esc(c.title)} · Turned in ${sub.submittedAt ? parseDay(sub.submittedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ''}${sub.fileName ? ' · ' + esc(sub.fileName) : sub.writtenContent ? ' · Written in editor' : ''}${isLateSubmission(a, sub) ? ` · due ${parseDay(a.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})}` : ''}</div>
          </div>
          <button class="btn btn-primary btn-sm" data-grade="${c.id}|${a.id}|${sub.studentId}">Grade</button>
        </li>`).join("")}
      </ul>`}
    </div>
    ${graded.length ? `
    <div class="section-title"><h2>Recently Graded</h2></div>
    <div class="card">
      <ul class="assignments-list">
        ${graded.map(({ c, a, sub }) => `
        <li>
          <div>
            <div><strong>${esc(userName(sub.studentId))}</strong> — ${esc(a.title)}${isLateSubmission(a, sub) ? ` <span class="pill pill-red">Late</span>` : ""}</div>
            <div style="font-size:.82rem;color:var(--muted-foreground);margin-top:4px;">${esc(c.title)}</div>
          </div>
          <div style="text-align:right;">
            <span class="pill pill-green">${sub.score}/${a.points}</span><br>
            <button class="btn btn-ghost btn-sm" style="margin-top:8px;" data-grade="${c.id}|${a.id}|${sub.studentId}">Edit</button>
          </div>
        </li>`).join("")}
      </ul>
    </div>` : ""}
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  main.querySelectorAll("[data-sheet]").forEach((el) => {
    const open = () => { activeCourseId = el.dataset.sheet; view = "gradeSheet"; renderNav(); renderMain(); };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.target !== el) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
  main.querySelectorAll("[data-grade]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [cid, aid, sid] = btn.dataset.grade.split("|");
      const c = courses.find((x) => x.id === cid);
      const a = c.assignments.find((x) => x.id === aid);
      openGradeModal(c, a, sid);
    });
  });
}

// Faculty: one course's full gradebook — every enrolled student down the
// side (the sheet grows or shrinks with the roster), every assignment
// across the top grouped under its weighted category, and a running
// Final Grade on the right that updates as work gets graded.
function renderGradeSheet(main) {
  const c = courses.find((x) => x.id === activeCourseId);
  const status = courseStatusLabel(c);
  const categories = assignmentCategories(c).filter((cat) => cat.items.length);
  const students = c.studentIds.map((id) => users.find((u) => u.id === id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Grading</button>
    <div class="page-header">
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <span class="pill pill-navy">${esc(c.level)} Level</span>
        <span class="pill ${status.cls}">${esc(status.text)}</span>
      </div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <h1 style="margin-top:10px;">${esc(c.title)}</h1>
        ${iManage(c) && students.length ? `<button class="btn btn-gold btn-sm" id="gsRecord" style="margin-top:10px;">${icon("scroll")} Record Final Grades</button>` : ""}
      </div>
      <p>Grade Sheet · ${students.length} student${students.length === 1 ? "" : "s"}${courseGradesRecorded(c) && students.length ? ` · <span class="pill pill-green">Final grades recorded</span>` : ""}</p>
    </div>
    <div class="card">
      ${categories.length === 0 || students.length === 0 ? `
      <div class="empty-state">
        <p>${students.length === 0 ? "Enroll students from this course's Manage page to start a grade sheet." : "Add an assignment with a grade weight from this course's Manage page to start a grade sheet."}</p>
      </div>` : `
      <div class="table-scroll">
        <table class="gradesheet-table">
          <thead>
            <tr>
              <th rowspan="2" class="gs-sticky">Student</th>
              ${categories.map((cat) => `<th colspan="${cat.items.length}">${esc(cat.seriesLabel || cat.items[0].title)}${cat.weight ? ` <span class="pill pill-gold">${cat.weight}%</span>` : ""}</th>`).join("")}
              ${c.att.on ? `<th rowspan="2">Attendance${c.att.weight ? ` <span class="pill pill-gold">${c.att.weight}%</span>` : ""}</th>` : ""}
              <th rowspan="2" style="text-align:right;">Final Grade</th>
            </tr>
            <tr>
              ${categories.map((cat) => cat.items.map((a) => `<th title="${esc(a.title)}">${parseDay(a.due).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</th>`).join("")).join("")}
            </tr>
          </thead>
          <tbody>
            ${students
              .map((u) => {
                const grade = computeCourseGrade(c, u.id);
                const cells = categories
                  .map((cat) =>
                    cat.items
                      .map((a) => {
                        const sub = getSubmission(c, a, u.id);
                        const lateDot = isLateSubmission(a, sub) ? `<span class="late-dot" title="Turned in after the due date">●</span>` : "";
                        if (sub.status === "graded") {
                          return `<td><button class="cell-grade cell-graded" data-cell="${c.id}|${a.id}|${u.id}">${sub.score}/${a.points}${lateDot}</button></td>`;
                        }
                        if (sub.status === "submitted") {
                          return `<td><button class="cell-grade cell-turnedin" data-cell="${c.id}|${a.id}|${u.id}">Needs grading${lateDot}</button></td>`;
                        }
                        if (dueFor(c, a, u.id) < todayStr()) {
                          return `<td><span class="cell-status cell-missing">Missing</span></td>`;
                        }
                        return `<td><span class="cell-status cell-notdue">—</span></td>`;
                      })
                      .join("")
                  )
                  .join("");
                const letterCls = letterPillClass(grade.letter);
                return `<tr>
                <td class="gs-sticky"><strong>${esc(u.name)}</strong></td>
                ${cells}
                ${c.att.on ? `<td title="${grade.attendance ? `${grade.attendance.counts.present} present · ${grade.attendance.counts.late} late · ${grade.attendance.counts.absent} absent · ${grade.attendance.counts.excused} excused` : ""}">${grade.attendance && grade.attendance.pct !== null ? `${grade.attendance.pct}%` : `<span class="cell-status cell-notdue">—</span>`}</td>` : ""}
                <td style="text-align:right;">${grade.pct === null ? `<span style="color:var(--muted-foreground);">Not yet</span>` : `<strong>${grade.pct}%</strong> <span class="pill ${letterCls}">${grade.letter}</span>`}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <p style="color:var(--muted-foreground);font-size:.8rem;margin:14px 0 0;">Final Grade is a running average of everything graded so far, weighted the way each assignment (or weekly series) was set up in Manage. An assignment past its due date with nothing turned in counts as a zero; work still awaiting a grade doesn't count yet.${c.att.on ? (c.att.weight ? ` Attendance is ${c.att.weight}% of the Final Grade (assignments ${100 - c.att.weight}%); a Late counts ${c.att.lateCredit}%, and Excused days don't count.` : " Attendance is shown for reference and isn't part of the Final Grade.") : ""} A <span class="late-dot">●</span> marks a submission that came in after its due date — grading is still entirely up to you, case by case.</p>`}
    </div>
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "grading"; renderNav(); renderMain(); });
  const gsRec = document.getElementById("gsRecord");
  if (gsRec) gsRec.addEventListener("click", () => openRecordGradesModal(c));
  main.querySelectorAll("[data-cell]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [cid, aid, sid] = btn.dataset.cell.split("|");
      const course = courses.find((x) => x.id === cid);
      const a = course.assignments.find((x) => x.id === aid);
      openGradeModal(course, a, sid, () => renderMain());
    });
  });
}

// Faculty: score + written feedback for one student's submission. Pass
// onSaved to refresh a different view (e.g. the roster modal) instead of
// the default full-page re-render.
function openGradeModal(course, assignment, studentId, onSaved) {
  const sub = getSubmission(course, assignment, studentId);
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2 style="font-size:1.15rem;">${esc(userName(studentId))}</h2>
        <p style="color:var(--muted-foreground);font-size:.85rem;margin-top:2px;">${esc(assignment.title)} · ${esc(course.title)}</p>
        ${sub.fileName ? `<p style="font-size:.85rem;margin-top:10px;">Submitted: <strong>${esc(sub.fileName)}</strong>${sub.submittedAt ? " on " + parseDay(sub.submittedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ""} ${sub.storagePath ? `<button class="btn btn-primary btn-sm" id="gradeOpenFile" style="margin-left:6px;">Read It Here</button>` : ""}</p>` : sub.writtenContent ? `<p style="font-size:.85rem;margin-top:10px;">Written in editor${sub.submittedAt ? " on " + parseDay(sub.submittedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ""}:</p><div class="written-view">${safeHtml(sub.writtenContent)}</div>` : `<p style="font-size:.85rem;color:var(--muted-foreground);margin-top:10px;">No file was attached.</p>`}
        ${isLateSubmission(assignment, sub) ? `<p style="font-size:.85rem;margin-top:6px;color:var(--destructive);"><strong>⚠ Turned in late</strong> — ${Math.round((new Date(sub.submittedAt) - new Date(assignment.due)) / 86400000)} day${Math.round((new Date(sub.submittedAt) - new Date(assignment.due)) / 86400000) === 1 ? "" : "s"} after the ${parseDay(assignment.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})} due date. The score below is entirely your call.</p>` : ""}
        <label for="gradeScore">Score (out of ${assignment.points})</label>
        <input type="number" id="gradeScore" min="0" max="${assignment.points}" value="${sub.score ?? ""}" />
        <label for="gradeFeedback">Feedback</label>
        <textarea id="gradeFeedback" rows="3" placeholder="A short note back to the student.">${esc(sub.feedback || "")}</textarea>
        <div class="form-actions">
          <button class="btn btn-primary" id="gradeSave">Save Grade</button>
          <button class="btn btn-ghost" id="gradeCancel">Cancel</button>
        </div>
      </div>
    </div>`;
  document.getElementById("gradeCancel").addEventListener("click", closeModal);
  const openBtn = document.getElementById("gradeOpenFile");
  if (openBtn) openBtn.addEventListener("click", () => openFileViewer({ bucket: "submissions", path: sub.storagePath, title: sub.fileName, subtitle: `${userName(studentId)} · ${assignment.title}`, mimeType: sub.mimeType, returnFocus: openBtn }));
  document.getElementById("gradeSave").addEventListener("click", async () => {
    const scoreInput = document.getElementById("gradeScore");
    const score = parseFloat(scoreInput.value);
    if (isNaN(score) || score < 0) { toast("Enter a score of 0 or more."); scoreInput.focus(); return; }
    if (score > assignment.points && !(await askConfirm(`${score} is more than the ${assignment.points} points possible. Save it anyway (e.g. extra credit)?`))) return;
    const feedback = document.getElementById("gradeFeedback").value.trim();
    run(async () => {
      await DB.grade({ assignmentId: assignment.id, studentId, score, feedback });
      closeModal();
    }, onSaved, { success: "Grade saved." });
  });
}

// Discussion Board is per-course, so the top-level tile is really a list
// of boards — one per course you're enrolled in (students) or every
// non-archived course (faculty, since every faculty account is a full
// admin). Picking one opens that course's wall.
function renderDiscussion(main) {
  const list =
    role === "student"
      ? courses.filter((c) => isLive(c) && c.studentIds.includes(currentStudentId))
      : courses.filter((c) => !c.archived && iTeach(c));
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${role === "student" ? "Student Dashboard" : staffEyebrow()}</div>
      <h1>Discussion Board</h1>
      <p>Each course has its own board — pick a class to join the conversation.</p>
    </div>
    ${list.length === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("chat")}</div>
      <p>${role === "student" ? "Once a course you're enrolled in goes live, its board will appear here." : "Boards for the courses you teach appear here."}</p>
    </div>` : `
    <div class="grid grid-compact">
      ${list
        .map((c) => {
          const count = (c.discussion || []).reduce((n, p) => n + 1 + p.replies.length, 0);
          return `
        <div class="tile tile-compact" data-course="${c.id}" tabindex="0" role="button">
          <span class="pill pill-navy">${esc(c.level)} Level</span>
          <h3>${esc(c.title)}</h3>
          <p class="tile-meta">${count} post${count === 1 ? "" : "s"}</p>
        </div>`;
        })
        .join("")}
    </div>`}
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  main.querySelectorAll("[data-course]").forEach((el) => {
    const open = () => { activeCourseId = el.dataset.course; view = "discussionBoard"; renderNav(); renderMain(); };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.target !== el) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
}

// The board itself: faculty can post a new message to the whole class;
// anyone on the roster (or teaching it) can reply underneath. Faculty can
// delete anything; a student can only delete their own reply.
function renderDiscussionBoard(main) {
  const c = courses.find((x) => x.id === activeCourseId);
  if (!c.discussion) c.discussion = [];
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; ${role === "student" ? "Back to Messages" : "Back to Discussion Board"}</button>
    <div class="page-header">
      <span class="pill pill-navy">${esc(c.level)} Level</span>
      <h1 style="margin-top:10px;">${esc(c.title)}</h1>
      <p>Discussion Board</p>
    </div>
    ${role === "faculty" ? `
    <div class="card">
      <label for="dbNewPost">Post to the Class</label>
      <textarea id="dbNewPost" rows="3" placeholder="Share a discussion prompt, question, or announcement…"></textarea>
      <div class="form-actions"><button class="btn btn-primary" id="dbPostBtn">Post</button></div>
    </div>` : ""}
    <div id="dbPosts"></div>
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = role === "student" ? "messages" : "discussion"; renderNav(); renderMain(); });
  if (role === "faculty") {
    document.getElementById("dbPostBtn").addEventListener("click", () => {
      const ta = document.getElementById("dbNewPost");
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      run(() => DB.post(c.id, text));
    });
  }
  renderDiscussionPosts(c);
}

function renderDiscussionPosts(c) {
  const wrap = document.getElementById("dbPosts");
  if (!wrap) return;
  const posts = [...c.discussion].sort((a, b) => a.postedAt.localeCompare(b.postedAt) || a.id.localeCompare(b.id));
  if (posts.length === 0) {
    wrap.innerHTML = `
      <div class="card empty-state">
        <div class="icon-badge" style="margin:0 auto 14px;">${icon("chat")}</div>
        <p>${role === "faculty" ? "Post the first message to start the conversation." : "Nothing posted yet — check back soon."}</p>
      </div>`;
    return;
  }
  wrap.innerHTML = posts
    .map(
      (p) => `
    <div class="card discussion-post">
      <div class="discussion-post-head">
        <div class="post-author">${personChip(p.authorId, 34)}${roleTag(p.authorId)}</div>
        <div>
          <span style="font-size:.78rem;color:var(--muted-foreground);">${parseDay(p.postedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>
          ${role === "faculty" ? `<button class="btn btn-ghost btn-sm" data-delete-post="${p.id}" style="margin-left:8px;">Delete</button>` : ""}
        </div>
      </div>
      <p style="margin-top:8px;white-space:pre-wrap;">${esc(p.text)}</p>
      ${p.replies.length ? `
      <div class="discussion-replies">
        ${p.replies
          .map(
            (r) => `
          <div class="discussion-reply">
            <div class="discussion-post-head">
              <div class="post-author">${personChip(r.authorId, 28)}${roleTag(r.authorId)}</div>
              <div>
                <span style="font-size:.76rem;color:var(--muted-foreground);">${parseDay(r.postedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>
                ${role === "faculty" || r.authorId === currentStudentId ? `<button class="btn btn-ghost btn-sm" data-delete-reply="${p.id}|${r.id}" style="margin-left:8px;">Delete</button>` : ""}
              </div>
            </div>
            <p style="margin-top:4px;white-space:pre-wrap;">${esc(r.text)}</p>
          </div>`
          )
          .join("")}
      </div>` : ""}
      <div class="discussion-reply-form">
        <input type="text" placeholder="Write a reply…" data-reply-input="${p.id}" aria-label="Write a reply" maxlength="4000" />
        <button class="btn btn-ghost btn-sm" data-reply-btn="${p.id}">Reply</button>
      </div>
    </div>`
    )
    .join("");

  wirePersonLinks(wrap);
  wrap.querySelectorAll("[data-reply-btn]").forEach((btn) => {
    const pid = btn.dataset.replyBtn;
    const input = wrap.querySelector(`[data-reply-input="${pid}"]`);
    const send = () => {
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      run(() => DB.post(c.id, text, pid));
    };
    btn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
  });
  wrap.querySelectorAll("[data-delete-post]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await askConfirm("Delete this post and all of its replies?"))) return;
      run(() => DB.deletePost(btn.dataset.deletePost));
    });
  });
  wrap.querySelectorAll("[data-delete-reply]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const [, rid] = btn.dataset.deleteReply.split("|");
      if (!(await askConfirm("Delete this reply?"))) return;
      run(() => DB.deletePost(rid));
    });
  });
}

// ---------------------------------------------------------------------
// Messages: one private thread per (course, student) pair, strictly
// between that student and the course's own instructor — nothing lets a
// student reach another student, and nothing lets a student reach a
// course they aren't enrolled in. The thread lives on the course record
// itself, so archiving a course ("the class closes") clears it.
// ---------------------------------------------------------------------
function courseInstructor(c) {
  // With no teacher assigned, the Institute's Admins receive the
  // messages until one is.
  return users.find((u) => u.id === c.facultyId && u.role === "faculty") || { id: null, name: "Institute administrators" };
}

// Faculty see a thread for every enrolled student, plus anyone who has a
// conversation on the course without being enrolled (e.g. replying to an
// enrollment-denial note).
function threadStudentIds(c) {
  const ids = new Set(c.studentIds);
  (c.messages || []).forEach((m) => ids.add(m.studentId));
  return [...ids];
}

function courseMessageThread(c, studentId) {
  if (!c.messages) c.messages = [];
  return c.messages.filter((m) => m.studentId === studentId).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

// "Unread" is from the current viewer's side of the conversation — a
// message the other party sent that this viewer hasn't opened the
// thread to see yet. A message never counts as unread to its own sender.
function unreadInThread(c, studentId) {
  return courseMessageThread(c, studentId).filter((m) => m.from !== role && !m.read).length;
}

function markThreadRead(c, studentId) {
  const unread = courseMessageThread(c, studentId).filter((m) => m.from !== role && !m.read);
  if (!unread.length) return;
  unread.forEach((m) => { m.read = true; });
  DB.markThreadRead(c.id, studentId).catch((e) => console.warn("mark read:", e));
}

// Powers the unread bubble on the Send Message / Message Inbox tile —
// every course-and-student thread this viewer has a stake in, summed.
function unreadMessageCount() {
  let n = 0;
  if (role === "student") {
    // Includes a course you're not (or not yet) enrolled in as long as
    // there's a thread on it — e.g. a denied enrollment request's note
    // still needs to reach you even though you never joined the roster.
    courses.filter((c) => !c.archived && (c.studentIds.includes(currentStudentId) || (c.messages || []).some((m) => m.studentId === currentStudentId))).forEach((c) => {
      n += unreadInThread(c, currentStudentId);
    });
  } else {
    // A course's private messages reach only its teacher.
    courses.filter((c) => !c.archived && iTeach(c)).forEach((c) => {
      threadStudentIds(c).forEach((sid) => { n += unreadInThread(c, sid); });
    });
  }
  return n;
}

let messageThreadStudentId = null;

function renderMessages(main) {
  const rows =
    role === "student"
      ? courses
          .filter((c) => !c.archived && (c.studentIds.includes(currentStudentId) || (c.messages || []).some((m) => m.studentId === currentStudentId)))
          .map((c) => {
            const thread = courseMessageThread(c, currentStudentId);
            return { c, studentId: currentStudentId, last: thread[thread.length - 1] };
          })
      : (() => {
          const mine = courses.filter((c) => !c.archived && iTeach(c));
          const list = [];
          mine.forEach((c) => {
            threadStudentIds(c).forEach((sid) => {
              const thread = courseMessageThread(c, sid);
              list.push({ c, studentId: sid, last: thread[thread.length - 1] });
            });
          });
          return list;
        })();
  rows.sort((a, b) => {
    if (a.last && b.last) return b.last.sentAt.localeCompare(a.last.sentAt);
    if (a.last) return -1;
    if (b.last) return 1;
    return role === "student" ? a.c.title.localeCompare(b.c.title) : userName(a.studentId).localeCompare(userName(b.studentId));
  });

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${role === "student" ? "Student Dashboard" : staffEyebrow()}</div>
      <h1>${role === "student" ? "Messages" : "Message Inbox"}</h1>
      <p>${role === "student" ? "Private conversations with your teachers, and each class's discussion." : "One private conversation per student, per class you teach."}</p>
    </div>
    ${role === "student" ? `<div class="section-title"><h2>Your teachers</h2><span class="field-hint" style="margin:0;">Private — only you and the teacher see these</span></div>` : ""}
    ${rows.length === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("mail")}</div>
      <p>${role === "student" ? "Once you're enrolled in a course, you can message its instructor here." : "No students to message yet — enroll someone in one of your courses first."}</p>
    </div>` : `
    <div class="card">
      <ul class="assignments-list">
        ${rows
          .map((r) => {
            const name = role === "student" ? esc(courseInstructor(r.c).name) : esc(userName(r.studentId));
            const preview = r.last ? esc(r.last.text.slice(0, 70)) + (r.last.text.length > 70 ? "…" : "") : "No messages yet — say hello.";
            const unread = unreadInThread(r.c, r.studentId);
            return `<li data-thread="${r.c.id}|${r.studentId}" style="cursor:pointer;">
            <div>
              <div>${unread ? `<span class="unread-dot"></span>` : ""}<strong>${name}</strong> <span style="color:var(--muted-foreground);font-weight:400;">· ${esc(r.c.title)}</span></div>
              <div style="font-size:.82rem;color:${unread ? "var(--foreground);font-weight:600;" : "var(--muted-foreground);"}margin-top:4px;">${preview}</div>
            </div>
            <div style="text-align:right;white-space:nowrap;">
              ${unread ? `<span class="pill pill-gold">${unread} new</span><br>` : ""}
              ${r.last ? `<span style="font-size:.76rem;color:var(--muted-foreground);">${parseDay(r.last.sentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>` : ""}
            </div>
          </li>`;
          })
          .join("")}
      </ul>
    </div>`}
    ${role === "student" ? studentDiscussionSectionHtml() : ""}
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  main.querySelectorAll("[data-thread]").forEach((el) => {
    el.addEventListener("click", () => {
      const [cid, sid] = el.dataset.thread.split("|");
      activeCourseId = cid;
      messageThreadStudentId = sid;
      view = "messageThread";
      renderNav();
      renderMain();
    });
  });
  main.querySelectorAll("[data-board]").forEach((el) => {
    const open = () => { activeCourseId = el.dataset.board; view = "discussionBoard"; renderNav(); renderMain(); };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } });
  });
}
// Students' Messages page also lists each class's discussion board.
function studentDiscussionSectionHtml() {
  const list = courses.filter((c) => isLive(c) && c.studentIds.includes(currentStudentId));
  if (!list.length) return "";
  return `
    <div class="section-title"><h2>Class discussion</h2><span class="field-hint" style="margin:0;">Everyone in the class can read and reply</span></div>
    <div class="grid grid-compact">
      ${list.map((c) => {
        const count = (c.discussion || []).reduce((n, p) => n + 1 + p.replies.length, 0);
        return `<div class="tile tile-compact" data-board="${c.id}" tabindex="0" role="button">
          ${icon("chat")}
          <h3>${esc(c.title)}</h3>
          <p class="tile-meta">${count} post${count === 1 ? "" : "s"}</p>
        </div>`;
      }).join("")}
    </div>`;
}

function renderMessageThread(main) {
  const c = courses.find((x) => x.id === activeCourseId);
  const studentId = role === "student" ? currentStudentId : messageThreadStudentId;
  const instructor = courseInstructor(c);
  const otherName = role === "student" ? instructor.name : userName(studentId);
  markThreadRead(c, studentId);
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to ${role === "student" ? "Send Message" : "Message Inbox"}</button>
    <div class="page-header">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <span class="pill pill-navy">${esc(c.level)} Level</span>
          <h1 style="margin-top:10px;">${esc(otherName)}</h1>
          <p>${esc(c.title)}</p>
        </div>
        <div style="text-align:right;margin-top:10px;">
          <button class="btn btn-outline-gold btn-sm" id="msgExport">Export Thread</button>
          <div id="msgExportStatus" style="font-size:.76rem;color:var(--muted-foreground);margin-top:6px;min-height:1.1em;"></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div id="msgThreadList" class="msg-thread"></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <input type="text" id="msgInput" placeholder="Write a private message…" style="flex:1;" maxlength="4000" aria-label="Write a private message" />
        <button class="btn btn-primary" id="msgSend">Send</button>
      </div>
      <p style="font-size:.78rem;color:var(--muted-foreground);margin:10px 0 0;">Messages can't be edited or deleted once sent.</p>
    </div>
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "messages"; renderNav(); renderMain(); });
  renderMessageThreadList(c, studentId);
  const send = () => {
    const input = document.getElementById("msgInput");
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    // The database notifies the other side (the bell) when this lands.
    run(() => DB.sendMessage(c.id, studentId, role, text), () => {
      renderMain();
      const i = document.getElementById("msgInput");
      if (i) i.focus();
    });
  };
  // While this conversation is open, check for replies every 20 seconds.
  viewTimers.push(setInterval(async () => {
    if (document.visibilityState !== "visible" || busyCount > 0) return;
    try {
      const fresh = await fetchThread(c.id, studentId);
      const before = courseMessageThread(c, studentId);
      if (fresh.length !== before.length) {
        c.messages = (c.messages || []).filter((m) => m.studentId !== studentId).concat(fresh);
        renderMessageThreadList(c, studentId);
        markThreadRead(c, studentId);
      }
    } catch (e) { /* try again next time */ }
  }, 20000));
  document.getElementById("msgSend").addEventListener("click", send);
  document.getElementById("msgInput").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
  document.getElementById("msgExport").addEventListener("click", () => exportMessageThread(c, studentId));
}

function renderMessageThreadList(c, studentId) {
  const wrap = document.getElementById("msgThreadList");
  if (!wrap) return;
  const thread = courseMessageThread(c, studentId);
  if (thread.length === 0) {
    wrap.innerHTML = `<p style="color:var(--muted-foreground);font-size:.88rem;">No messages yet — say hello.</p>`;
    return;
  }
  wrap.innerHTML = thread
    .map((m) => {
      const mine = m.from === role;
      return `<div class="msg-bubble ${mine ? "msg-mine" : "msg-theirs"}">
        ${esc(m.text)}
        <span class="msg-time">${new Date(m.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
      </div>`;
    })
    .join("");
  wrap.scrollTop = wrap.scrollHeight;
}

// Exports one thread as a plain, dated PDF transcript — since messages
// can't be edited or deleted here, this is the record either the
// student or the instructor can keep for themselves.
async function exportMessageThread(course, studentId) {
  const statusEl = document.getElementById("msgExportStatus");
  const instructor = courseInstructor(course);
  const student = users.find((u) => u.id === studentId);
  const thread = courseMessageThread(course, studentId);

  if (!(window.jspdf && window.jspdf.jsPDF)) {
    if (statusEl) statusEl.textContent = "PDF export isn't available right now.";
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 56;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  let y = 64;
  const ensureRoom = (needed) => {
    if (y + needed > pageHeight - 56) { doc.addPage(); y = 64; }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 32, 51);
  doc.text("True North Baptist Church Bible Institute", marginX, y);
  y += 22;
  doc.setFontSize(13);
  doc.text("Private Message Thread", marginX, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 100, 115);
  doc.text(`${course.title} · ${course.level} Level`, marginX, y);
  y += 14;
  doc.text(`Between ${student ? student.name : "Student"} (Student) and ${instructor ? instructor.name : "Instructor"} (Instructor)`, marginX, y);
  y += 14;
  const exportedBy = userName(role === "student" ? currentStudentId : currentFacultyId());
  doc.text(`Exported ${new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} by ${exportedBy}`, marginX, y);
  y += 26;
  doc.setDrawColor(210, 214, 224);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 20;

  if (thread.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(20, 32, 51);
    doc.text("No messages were exchanged in this conversation.", marginX, y);
  }

  thread.forEach((m) => {
    const senderName = m.from === "student" ? (student ? student.name : "Student") : (instructor ? instructor.name : "Instructor");
    const when = new Date(m.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    ensureRoom(34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(20, 32, 51);
    doc.text(senderName, marginX, y);
    const nameWidth = doc.getTextWidth(senderName);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 128, 140);
    doc.text(`   —   ${when}`, marginX + nameWidth, y);
    y += 15;
    doc.setFontSize(11);
    doc.setTextColor(30, 40, 55);
    const lines = doc.splitTextToSize(m.text, maxWidth);
    lines.forEach((line) => {
      ensureRoom(16);
      doc.text(line, marginX, y);
      y += 16;
    });
    y += 12;
  });

  const safe = (s) => s.replace(/[^\w -]/g, "").trim();
  const filename = `${safe(student ? student.name : "Student")} - ${safe(course.title)} - Messages.pdf`;
  try {
    doc.save(filename);
    if (statusEl) statusEl.textContent = "Exported — check your downloads.";
  } catch (err) {
    if (statusEl) statusEl.textContent = "Couldn't export that thread.";
  }
}

function renderManage(main) {
  const c = courses.find((x) => x.id === activeCourseId);
  const status = courseStatusLabel(c);
  const mkey = `manage:${c.id}`;
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Courses</button>
    <div class="page-header">
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <span class="pill pill-navy">${esc(c.level)} Level</span>
        <span class="pill ${status.cls}">${esc(status.text)}</span>
      </div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <h1 style="margin-top:10px;">${esc(c.title)}</h1>
        <div style="display:flex;gap:8px;margin-top:10px;flex-shrink:0;">
          <button class="btn btn-outline-gold btn-sm" id="mgEditCourse">Edit Course Details</button>
          ${role === "faculty" ? `<button class="btn btn-ghost btn-sm" id="mgCopyCourse">${icon("copy")} Copy for a New Term</button>` : ""}
          ${c.archived && isAdmin() ? `<button class="btn btn-danger btn-sm" id="mgDeleteCourse">Delete Course</button>` : ""}
        </div>
      </div>
      <p>${esc(c.description)} · ${c.credits} credit${c.credits === 1 ? "" : "s"}</p>
      ${whereHtml(c)}
    </div>

    ${tabsHtml(mkey, [
      { id: "setup", label: "Overview" },
      { id: "students", label: "Students", count: c.studentIds.length + c.enrollmentRequests.length || "", alert: c.enrollmentRequests.length > 0 },
      ...(courseHasLectures(c) ? [{ id: "lectures", label: "Lectures", count: c.lessons.filter((l) => l.status !== "removed").length || "" }] : []),
      { id: "materials", label: "Materials", count: docUnits(c.materials).length || "" },
      { id: "assignments", label: "Assignments", count: groupAssignments(c.assignments).length || "" },
    ])}

    <section ${panelAttrs(mkey, "setup")}>
    ${setupChecklistHtml(c)}
    <div class="section-title"><h2>Teacher</h2></div>
    <div class="card" id="mgTeacherCard"></div>

    <div class="section-title"><h2>Schedule</h2></div>
    <div class="card">
      <div class="form-row">
        <div>
          <label for="mgWeeks">Total Weeks</label>
          <input type="number" id="mgWeeks" min="1" max="52" value="${c.schedule.weeks ?? ""}" />
        </div>
        <div>
          <label for="mgTime">Class Time</label>
          <input type="time" id="mgTime" value="${c.schedule.time ?? ""}" />
        </div>
      </div>

      <label>Day(s) of the Week</label>
      <div class="day-toggle" id="mgDays">
        ${DAY_NAMES.map((d) => `<button type="button" data-day="${d}" class="${c.schedule.days.includes(d) ? "active" : ""}">${d}</button>`).join("")}
      </div>

      <label>When does this course start?</label>
      <div class="radio-row">
        <label class="radio-option"><input type="radio" name="mgMode" value="now" ${c.schedule.mode === "now" ? "checked" : ""} /> Start now</label>
        <label class="radio-option"><input type="radio" name="mgMode" value="scheduled" ${c.schedule.mode === "scheduled" ? "checked" : ""} /> Schedule a start date</label>
      </div>
      <div id="mgStartDateWrap" style="${c.schedule.mode === "scheduled" ? "" : "display:none;"}">
        <label for="mgStartDate">Start Date</label>
        <input type="date" id="mgStartDate" value="${c.schedule.mode === "scheduled" ? (c.schedule.startDate ?? "") : ""}" />
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" id="mgSaveSchedule">Save Schedule</button>
      </div>
      <p style="color:var(--muted-foreground);font-size:.85rem;margin-top:12px;margin-bottom:0;">
        ${isLive(c) ? "This course is live — it already appears in enrolled students’ My Courses." : c.schedule.mode === "scheduled" ? "Students will see this course automatically once the start date arrives." : "Choose when this course starts so enrolled students can see it."}
      </p>
    </div>

    <div class="section-title"><h2>Class Days</h2></div>
    <div class="card" id="mgCancelCard"></div>

    <div class="section-title"><h2>Announcements</h2></div>
    <div class="card" id="mgAnnounceCard"></div>

    <div class="section-title"><h2>Memory Verse of the Week</h2></div>
    <div class="card" id="mgMemoryCard"></div>
    </section>

    ${courseHasLectures(c) ? `<section ${panelAttrs(mkey, "lectures")}>
    <div class="section-title"><h2>Lectures &amp; Live Class</h2></div>
    <div class="card" id="mgLecturesCard"></div>
    </section>` : ""}

    <section ${panelAttrs(mkey, "students")}>
    ${classGlanceHtml(c)}
    <div id="mgEnrollRequestsSection"></div>

    <div class="section-title"><h2>Roster</h2></div>
    <div class="card">
      <p style="color:var(--muted-foreground);font-size:.85rem;margin-top:0;">${c.studentIds.length} student${c.studentIds.length === 1 ? "" : "s"} enrolled.</p>
      <div id="mgRosterList"></div>
    </div>

    <div class="section-title"><h2>Attendance</h2></div>
    <div class="card" id="mgAttendanceCard"></div>
    </section>

    <section ${panelAttrs(mkey, "materials")}>
    <div class="section-title"><h2>Course Materials</h2></div>
    <div class="card">
      <p class="field-hint" style="margin-top:0;">Everything here is for the whole class unless you check <strong>Teachers only</strong> — use that for answer keys and teaching notes. Teachers-only documents are seen by faculty and Admins, never by students.</p>
      <div id="mgMaterialsList"></div>
      <label for="mgAddFile" style="margin-top:16px;">Add a Document</label>
      <label class="check-row" for="mgAddTeacherOnly"><input type="checkbox" id="mgAddTeacherOnly" /> Teachers only — students won't see the documents I add</label>
      <input type="file" id="mgAddFile" multiple accept="${UPLOAD_ACCEPT}" />
      <div class="field-hint">PDF, Word, PowerPoint, text, images, or audio — up to 50 MB each. You can select many at once. Only students enrolled in this course can open the class documents.</div>
    </div>
    </section>

    <section ${panelAttrs(mkey, "assignments")}>
    <div class="section-title"><h2>Assignments</h2><button class="btn btn-gold btn-sm" id="mgAddAssignment">+ Add Assignment</button></div>
    <div class="card">
      <ul class="assignments-list" id="mgAssignmentsList"></ul>
    </div>
    </section>
  `;
  wireTabs(mkey, main);
  wireSetupChecklist(c, main);

  document.getElementById("backLink").addEventListener("click", () => { view = "catalogue"; renderNav(); renderMain(); });
  document.getElementById("mgAddAssignment").addEventListener("click", () => openAddAssignmentModal(c));
  document.getElementById("mgEditCourse").addEventListener("click", () => openEditCourseModal(c));
  const mgDeleteBtn = document.getElementById("mgDeleteCourse");
  if (mgDeleteBtn) mgDeleteBtn.addEventListener("click", () => openDeleteCourseModal(c));

  document.querySelectorAll("#mgDays button").forEach((btn) => {
    btn.addEventListener("click", () => btn.classList.toggle("active"));
  });

  document.querySelectorAll('input[name="mgMode"]').forEach((r) => {
    r.addEventListener("change", () => {
      document.getElementById("mgStartDateWrap").style.display = r.value === "scheduled" ? "" : "none";
    });
  });

  document.getElementById("mgSaveSchedule").addEventListener("click", () => {
    const weeks = parseInt(document.getElementById("mgWeeks").value, 10) || null;
    const time = document.getElementById("mgTime").value || null;
    const days = Array.from(document.querySelectorAll("#mgDays button.active")).map((b) => b.dataset.day);
    const modeEl = document.querySelector('input[name="mgMode"]:checked');
    const mode = modeEl ? modeEl.value : null;
    let startDate = null;
    if (mode === "now") startDate = c.schedule.mode === "now" && c.schedule.startDate ? c.schedule.startDate : todayStr();
    else if (mode === "scheduled") startDate = document.getElementById("mgStartDate").value || null;
    if (mode === "scheduled" && !startDate) { toast("Pick a start date, or choose \"Start now\"."); document.getElementById("mgStartDate").focus(); return; }
    run(() => DB.saveSchedule(c.id, { weeks, time, days, mode, startDate }), null, { success: "Schedule saved." });
  });

  renderTeacherCard(c);
  renderCancellationsCard(c);
  renderAnnouncementsCard(c);
  renderMemoryManageCard(c);
  wireClassGlance(c, main);
  const cp = document.getElementById("mgCopyCourse");
  if (cp) cp.addEventListener("click", () => openCopyCourseModal(c));
  renderAttendanceCard(c);
  renderEnrollmentRequests(c);
  renderRosterList(c);
  if (courseHasLectures(c)) renderLecturesCard(c);
  renderMaterialsList(c);
  renderAssignmentsList(c);

  document.getElementById("mgAddFile").addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    if (!files.length) return;
    const teacherOnly = document.getElementById("mgAddTeacherOnly").checked;
    const who = teacherOnly ? " (teachers only)" : "";
    run(() => DB.addMaterials(c.id, files, teacherOnly), null, { success: files.length === 1 ? `"${files[0].name}" was added${who}.` : `${files.length} documents were added${who}.` });
  });
}

// Faculty: edit the course's own text fields — always available,
// active or archived — separate from the Schedule/Roster/Materials
// sections below, which have their own dedicated forms.
function openEditCourseModal(course) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2 style="font-size:1.15rem;">Edit Course Details</h2>
        <label for="ecName">Course Name</label>
        <input type="text" id="ecName" value="${esc(course.title)}" />
        <label for="ecDesc">Description</label>
        <textarea id="ecDesc" rows="3">${esc(course.description)}</textarea>
        <div class="form-row">
          <div>
            <label for="ecCredits">Credits</label>
            <input type="number" id="ecCredits" min="1" max="6" value="${course.credits}" />
          </div>
          <div>
            <label for="ecLevel">Academic Level</label>
            <select id="ecLevel">
              ${LEVELS.map((l) => `<option value="${l}" ${l === course.level ? "selected" : ""}>${l} Level</option>`).join("")}
            </select>
          </div>
        </div>
        ${locationFieldsHtml("ec", course)}
        ${formatSettingsHtml("ec", course)}
        ${attSettingsHtml("ec", course.att)}
        <div class="form-actions">
          <button class="btn btn-primary" id="ecSave">Save Changes</button>
          <button class="btn btn-ghost" id="ecCancel">Cancel</button>
        </div>
      </div>
    </div>`;
  document.getElementById("ecCancel").addEventListener("click", closeModal);
  wireAttSettings("ec");
  wireFormatSettings("ec");
  document.getElementById("ecSave").addEventListener("click", async () => {
    const nameInput = document.getElementById("ecName");
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const patch = {
      title: name,
      description: document.getElementById("ecDesc").value.trim() || "No description yet.",
      credits: parseInt(document.getElementById("ecCredits").value, 10) || 1,
      level: document.getElementById("ecLevel").value,
    };
    const att = readAttSettings("ec");
    Object.assign(patch, { attendance_on: att.on, attendance_weight: att.weight, attendance_late_credit: att.lateCredit });
    try { Object.assign(patch, readLocationFields("ec")); }
    catch (e) { toast(e.message); document.getElementById("ecMeetingUrl").focus(); return; }
    try { Object.assign(patch, readFormatSettings("ec")); }
    catch (e) { toast(e.message); if (e.field) document.getElementById(e.field).focus(); return; }
    const playlistChanged = patch.playlist_id !== course.playlistId;
    if (playlistChanged && course.playlistId && course.lessons.some((l) => l.fromPlaylist && l.status !== "removed")
        && !(await askConfirm(patch.playlist_id ? "Switch this course to the new playlist? Lectures from the old playlist will be taken off the course (students' progress on them is kept)." : "Remove the playlist? Its lectures will be taken off the course."))) return;
    run(async () => {
      await DB.updateCourse(course.id, patch);
      if (playlistChanged || patch.live_video_id !== course.liveVideoId) await DB.requestPlaylistSync(course.id).catch(() => {});
      closeModal();
    }, null, { success: "Course details saved." });
  });
}

// Faculty: permanently delete an archived course. Only reachable once a
// course is archived, mirroring how user deletion works in Settings —
// a plain warning box, no soft-delete, no undo.
function openDeleteCourseModal(course) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2 style="font-size:1.15rem;">Delete ${esc(course.title)}?</h2>
        <div class="warning-box">
          ${icon("warning")}
          <p><strong>This cannot be undone.</strong> Deleting this course permanently removes it and everything attached to it — materials, assignments, every student's submissions and grades, its discussion board, and any private messages.</p>
        </div>
        <div class="form-actions">
          <button class="btn btn-danger" id="confirmDeleteCourse">Delete Permanently</button>
          <button class="btn btn-ghost" id="cancelDeleteCourse">Cancel</button>
        </div>
      </div>
    </div>`;
  document.getElementById("cancelDeleteCourse").addEventListener("click", closeModal);
  document.getElementById("confirmDeleteCourse").addEventListener("click", () => {
    run(async () => {
      await DB.deleteCourse(course.id);
      flashMessage = `"${course.title}" was permanently deleted.`;
      activeCourseId = null;
      view = "catalogue";
      closeModal();
    }, () => { renderNav(); renderMain(); });
  });
}

// Groups assignments that share a seriesId (created by the recurring
// option below) into one entry each; a standalone assignment is its own
// one-item group. Sorted by each group's earliest due date.
function groupAssignments(assignments) {
  const groups = [];
  const bySeries = new Map();
  assignments.forEach((a) => {
    if (a.seriesId) {
      if (!bySeries.has(a.seriesId)) {
        const g = { seriesId: a.seriesId, seriesLabel: a.seriesLabel, items: [] };
        bySeries.set(a.seriesId, g);
        groups.push(g);
      }
      bySeries.get(a.seriesId).items.push(a);
    } else {
      groups.push({ seriesId: null, seriesLabel: null, items: [a] });
    }
  });
  groups.forEach((g) => g.items.sort((x, y) => x.due.localeCompare(y.due)));
  groups.sort((x, y) => x.items[0].due.localeCompare(y.items[0].due));
  return groups;
}

// ---------------------------------------------------------------------
// Weighted grading. A grade "category" is one weight-bearing unit: a
// standalone assignment is its own category, and a whole recurring
// series (weekly readings, etc.) is ONE category — the teacher enters
// its weight once and every occurrence shares it, rather than the
// weight being multiplied by however many weeks exist.
// ---------------------------------------------------------------------
function assignmentCategories(course) {
  return groupAssignments(course.assignments).map((g) => ({ ...g, weight: g.items[0] ? g.items[0].weight || 0 : 0 }));
}

// One assignment's contribution to a student's grade, as a 0–1 fraction:
// - graded work always counts, using the score given
// - work still awaiting a grade (turned in, or not yet due) doesn't
//   count yet — it simply isn't part of the average until it is graded
// - once the due date passes with nothing turned in, it counts as a
//   zero, same as any other missed assignment
// Returns null when the item isn't counted yet.
function assignmentOutcome(course, a, studentId) {
  const sub = getSubmission(course, a, studentId);
  if (sub.status === "graded") return (sub.score ?? 0) / (a.points || 1);
  if (dueFor(course, a, studentId) < todayStr() && sub.status !== "submitted") return 0;
  return null;
}

// The Institute's grading scale, as printed on its paper grade sheets
// (adopted on the site Oct 8, 2026). Below 70 is failing.
const GRADE_SCALE = [[97, "A+"], [94, "A"], [90, "A-"], [87, "B+"], [84, "B"], [80, "B-"], [77, "C+"], [74, "C"], [70, "C-"]];
function pctToLetter(pct) {
  const hit = GRADE_SCALE.find(([min]) => pct >= min);
  return hit ? hit[1] : "F";
}
function letterPillClass(letter) {
  return letter === "F" ? "pill-gray" : /^[AB]/.test(letter || "") ? "pill-green" : "pill-navy";
}

// A student's current course grade: each category's average (of only
// what's counted so far) is weighted by the % the teacher gave it, and
// categories renormalize against each other so the grade reflects only
// what's actually happened — it fills in and can move as the semester
// progresses rather than starting at zero on day one.
function computeCourseGrade(course, studentId) {
  let weightedSum = 0, weightUsed = 0;
  const categories = assignmentCategories(course).map((cat) => {
    const outcomes = cat.items.map((a) => assignmentOutcome(course, a, studentId)).filter((o) => o !== null);
    const avg = outcomes.length ? outcomes.reduce((s, o) => s + o, 0) / outcomes.length : null;
    if (avg !== null && cat.weight) { weightedSum += avg * cat.weight; weightUsed += cat.weight; }
    return { ...cat, avg, countedOf: outcomes.length, totalOf: cat.items.length };
  });
  const asgPct = weightUsed > 0 ? Math.round((weightedSum / weightUsed) * 1000) / 10 : null;
  // Attendance, when it's part of the grade, takes its share; assignments
  // make up the rest. If only one side has anything counted yet, that side
  // stands alone until the other fills in.
  const attendance = course.att && course.att.on ? studentAttendance(course, studentId) : null;
  let pct = asgPct;
  if (attendance && course.att.weight > 0 && attendance.pct !== null) {
    const w = course.att.weight / 100;
    pct = asgPct === null ? attendance.pct : Math.round((asgPct * (1 - w) + attendance.pct * w) * 10) / 10;
  }
  return { pct, letter: pct === null ? null : pctToLetter(pct), categories, assignmentsPct: asgPct, attendance };
}

function renderAssignmentsList(c) {
  const wrap = document.getElementById("mgAssignmentsList");
  if (!wrap) return;
  if (c.assignments.length === 0) {
    wrap.innerHTML = `<li style="border:none;color:var(--muted-foreground);">No assignments yet.</li>`;
    return;
  }
  // Running total of grade weights, so it's easy to see they add up to 100%.
  const totalWeight = assignmentCategories(c).reduce((n, cat) => n + (Number(cat.weight) || 0), 0);
  const weightOk = Math.abs(totalWeight - 100) < 0.01;
  const teach = iTeach(c); // grades and turned-in work are for the teacher only
  wrap.innerHTML = (teach ? "" : `<li class="privacy-note" style="border:none;margin-bottom:8px;">${icon("lock")}<span>Turned-in work and grades for this course are visible only to its teacher.</span></li>`) + `<li class="weight-total ${weightOk ? "weight-ok" : "weight-off"}" style="border:none;padding-top:0;">
      <div><strong>Grade weights assigned: ${Math.round(totalWeight * 10) / 10}%</strong> <span style="color:var(--muted-foreground);font-weight:400;">of 100%</span></div>
      <div style="font-size:.8rem;">${weightOk ? "✓ Adds up to 100%." : totalWeight < 100 ? `${Math.round((100 - totalWeight) * 10) / 10}% not yet assigned — running grades still work, they just scale to what's assigned.` : `${Math.round((totalWeight - 100) * 10) / 10}% over — check each assignment's weight.`}</div>
    </li>` + groupAssignments(c.assignments)
    .map((g) => {
      if (g.items.length === 1) {
        const a = g.items[0];
        const subs = ensureSubmissions(c, a);
        const turnedIn = subs.filter((s) => s.status === "submitted" || s.status === "graded").length;
        const gradedCount = subs.filter((s) => s.status === "graded").length;
        const lock = assignmentLock(a);
        return `<li>
          <div>
            <div><strong>${esc(a.title)}</strong>${lock.locked ? ` <span class="pill pill-gray" style="margin-left:4px;">Locked until ${parseDay(lock.opensOn).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>` : ""}</div>
            <div style="font-size:.82rem;color:var(--muted-foreground);margin-top:4px;">Due ${parseDay(a.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${a.points} pts${a.weight ? ` · ${a.weight}% of grade` : ""}${teach ? ` · ${turnedIn}/${c.studentIds.length} turned in · ${gradedCount} graded` : ""}</div>
            ${assignmentDocsHtml(c, a)}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
            ${teach ? `<button class="btn btn-ghost btn-sm" data-view-roster="${a.id}">View Submissions</button>` : ""}
            ${iManage(c) ? `<button class="btn btn-ghost btn-sm" data-asg-docs="${a.id}">Documents</button>` : ""}
            <button class="btn btn-ghost btn-sm" data-delete-assignment="${a.id}" aria-label="Delete ${esc(a.title)}">Delete</button>
          </div>
        </li>`;
      }
      const totalTurned = g.items.reduce((n, a) => n + ensureSubmissions(c, a).filter((s) => s.status === "submitted" || s.status === "graded").length, 0);
      const totalGraded = g.items.reduce((n, a) => n + ensureSubmissions(c, a).filter((s) => s.status === "graded").length, 0);
      const possible = g.items.length * c.studentIds.length;
      const next = g.items.find((a) => a.due >= todayStr()) || g.items[g.items.length - 1];
      const withDocs = g.items.filter((a) => (a.materialIds || []).length).length;
      return `<li>
        <div>
          <div><strong>🔁 ${esc(g.seriesLabel)}</strong> <span class="pill pill-navy" style="margin-left:6px;">${g.items.length} weeks</span></div>
          <div style="font-size:.82rem;color:var(--muted-foreground);margin-top:4px;">Next due ${parseDay(next.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${g.items[0].points} pts each${g.items[0].weight ? ` · ${g.items[0].weight}% of grade (whole series)` : ""}${teach ? ` · ${totalTurned}/${possible} turned in · ${totalGraded} graded` : ""}</div>
          <div style="font-size:.82rem;color:var(--muted-foreground);margin-top:2px;">${withDocs ? `${icon("book")} Documents on ${withDocs === g.items.length ? "every week" : `${withDocs} of ${g.items.length} weeks`}` : "No documents attached"}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-ghost btn-sm" data-view-series="${g.seriesId}">View Weeks</button>
          ${iManage(c) ? `<button class="btn btn-ghost btn-sm" data-series-docs="${g.seriesId}">Documents</button>` : ""}
          <button class="btn btn-ghost btn-sm" data-delete-series="${g.seriesId}" aria-label="Delete series ${esc(g.seriesLabel)}">Delete</button>
        </div>
      </li>`;
    })
    .join("");
  wrap.querySelectorAll("[data-view-roster]").forEach((btn) => {
    btn.addEventListener("click", () => openAssignmentRoster(c, c.assignments.find((a) => a.id === btn.dataset.viewRoster)));
  });
  wrap.querySelectorAll("[data-view-series]").forEach((btn) => {
    btn.addEventListener("click", () => openSeriesModal(c, btn.dataset.viewSeries));
  });
  wrap.querySelectorAll("[data-asg-docs]").forEach((btn) => {
    btn.addEventListener("click", () => openAssignmentDocsModal(c, [c.assignments.find((a) => a.id === btn.dataset.asgDocs)]));
  });
  wrap.querySelectorAll("[data-series-docs]").forEach((btn) => {
    btn.addEventListener("click", () => openAssignmentDocsModal(c, c.assignments.filter((a) => a.seriesId === btn.dataset.seriesDocs)));
  });
  wireDocChips(c, wrap);
  const deleteAssignments = async (items, label) => {
    const turnedIn = items.reduce((n, a) => n + (a.submissions || []).filter((s) => s.status === "submitted" || s.status === "graded").length, 0);
    const warn = turnedIn ? `\n\n${turnedIn} submission${turnedIn === 1 ? "" : "s"} and any grades on ${items.length === 1 ? "it" : "them"} will be permanently deleted.` : "";
    if (!(await askConfirm(`Delete ${label}?${warn}`))) return;
    run(() => DB.deleteAssignments(items.map((a) => a.id)), null, { success: "Deleted." });
  };
  wrap.querySelectorAll("[data-delete-assignment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = c.assignments.find((x) => x.id === btn.dataset.deleteAssignment);
      deleteAssignments([a], `"${a.title}"`);
    });
  });
  wrap.querySelectorAll("[data-delete-series]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const items = c.assignments.filter((x) => x.seriesId === btn.dataset.deleteSeries);
      deleteAssignments(items, `all ${items.length} weeks of "${items[0].seriesLabel}"`);
    });
  });
}

function openAddAssignmentModal(course) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2 style="font-size:1.15rem;">Add Assignment</h2>

        <label>Assignment Type</label>
        <div class="radio-row">
          <label class="radio-option"><input type="radio" name="asgType" value="standalone" checked /> Standalone (one due date)</label>
          <label class="radio-option"><input type="radio" name="asgType" value="recurring" /> Recurring (repeats weekly)</label>
        </div>

        <label for="asgTitle">Title</label>
        <input type="text" id="asgTitle" placeholder="e.g. Reading Assignment" />
        <label for="asgInstructions">Instructions (optional)</label>
        <textarea id="asgInstructions" rows="3" placeholder="What should students turn in?"></textarea>

        <div class="form-row">
          <div>
            <label id="asgDueLabel" for="asgDue">Due Date</label>
            <input type="date" id="asgDue" />
          </div>
          <div>
            <label for="asgPoints">Points Possible</label>
            <input type="number" id="asgPoints" min="1" max="200" value="20" />
          </div>
        </div>

        <label id="asgWeightLabel" for="asgWeight">Grade Weight (% of final course grade)</label>
        <input type="number" id="asgWeight" min="0" max="100" value="10" />
        <div class="field-hint" id="asgWeightHint">How much this assignment counts toward the student's final grade in this course.</div>

        <div id="asgRecurringFields" style="display:none;">
          <div class="form-row">
            <div>
              <label for="asgWeeks">Repeat for how many weeks?</label>
              <input type="number" id="asgWeeks" min="1" max="30" value="${course.schedule.weeks || 10}" />
            </div>
            <div>
              <label for="asgEvery">Frequency</label>
              <select id="asgEvery">
                <option value="7">Weekly</option>
                <option value="14">Every 2 weeks</option>
              </select>
            </div>
          </div>
          <div class="field-hint">Creates one assignment per week, each due a week after the last — starting on the due date above. Every week is tracked and graded separately.</div>
        </div>

        <label>Documents <span class="field-optional">(optional)</span></label>
        <div class="field-hint" style="margin-top:0;">Quizzes, worksheets or readings students open right from the assignment. Pick them from Course Materials or upload them (many at once) — uploads are added to Course Materials too.</div>
        <div id="asgDocPicker"></div>
        <div id="asgWeekPlan"></div>

        <label>Availability</label>
        <div class="radio-row">
          <label class="radio-option"><input type="radio" name="asgAvail" value="anytime" checked /> Submit anytime</label>
          <label class="radio-option"><input type="radio" name="asgAvail" value="locked" /> Locked until a date</label>
        </div>
        <div class="field-hint" id="asgAvailHint">Students can turn this in whenever they're ready — the due date above is still shown as the target, and a late turn-in is simply flagged for you, never blocked.</div>
        <div id="asgLockFields" style="display:none;">
          <label for="asgOpenDate" id="asgOpenDateLabel">Opens On</label>
          <input type="date" id="asgOpenDate" />
          <div class="field-hint" id="asgLockHint">Submit Work stays locked for students until this date, then works as normal (the due date above still applies for lateness).</div>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" id="asgSave">Save Assignment</button>
          <button class="btn btn-ghost" id="asgCancel">Cancel</button>
        </div>
      </div>
    </div>`;

  function isRecurring() { return document.querySelector('input[name="asgType"]:checked').value === "recurring"; }
  function isLocked() { return document.querySelector('input[name="asgAvail"]:checked').value === "locked"; }
  // Documents, and (weekly) which week gets which.
  let plan = null, planKeys = "";
  function dueDates() {
    const first = document.getElementById("asgDue").value;
    const weeks = Math.max(1, Math.min(30, parseInt(document.getElementById("asgWeeks").value, 10) || 1));
    const every = parseInt(document.getElementById("asgEvery").value, 10) || 7;
    return Array.from({ length: weeks }, (_, i) => (first ? addDaysISO(first, every * i) : null));
  }
  function drawPlan() {
    const mount = document.getElementById("asgWeekPlan");
    const units = picker.units();
    if (!isRecurring() || !units.length) { mount.innerHTML = ""; return; }
    const dues = dueDates();
    const keys = units.map((u) => u.key).join("|");
    if (keys !== planKeys || !plan) { plan = defaultWeekPlan(units, dues.length, plan); planKeys = keys; }
    while (plan.weeks.length < dues.length) plan.weeks.push(units[plan.weeks.length] ? units[plan.weeks.length].key : "");
    plan.weeks.length = dues.length;
    mount.innerHTML = weekPlanHtml(units, dues, plan, { canFit: true });
    wireWeekPlan(mount, plan, drawPlan);
    mount.querySelectorAll("[data-wp-fit]").forEach((b) => b.addEventListener("click", () => { document.getElementById("asgWeeks").value = b.dataset.wpFit; drawPlan(); }));
  }
  const picker = makeDocPicker(course, document.getElementById("asgDocPicker"), { onChange: drawPlan });
  ["asgDue", "asgWeeks", "asgEvery"].forEach((id) => document.getElementById(id).addEventListener("change", drawPlan));
  document.getElementById("asgWeeks").addEventListener("input", drawPlan);
  function syncLockFieldsUI() {
    const wrap = document.getElementById("asgLockFields");
    if (!isLocked()) { wrap.style.display = "none"; return; }
    wrap.style.display = "";
    wrap.innerHTML = isRecurring()
      ? `<label for="asgUnlockDays">Unlocks How Many Days Before Each Due Date?</label>
         <input type="number" id="asgUnlockDays" min="0" max="60" value="7" />
         <div class="field-hint">Each week's Submit Work opens this many days before that week's own due date.</div>`
      : `<label for="asgOpenDate">Opens On</label>
         <input type="date" id="asgOpenDate" />
         <div class="field-hint">Submit Work stays locked for students until this date, then works as normal (the due date above still applies for lateness).</div>`;
  }
  document.querySelectorAll('input[name="asgType"]').forEach((r) => {
    r.addEventListener("change", () => {
      const recurring = isRecurring();
      document.getElementById("asgRecurringFields").style.display = recurring ? "" : "none";
      document.getElementById("asgDueLabel").textContent = recurring ? "First Due Date" : "Due Date";
      document.getElementById("asgWeightHint").textContent = recurring
        ? "Entered once for the whole series — every week shares this weight as one grading category, rather than each week counting separately."
        : "How much this assignment counts toward the student's final grade in this course.";
      syncLockFieldsUI();
      drawPlan();
    });
  });
  document.querySelectorAll('input[name="asgAvail"]').forEach((r) => r.addEventListener("change", syncLockFieldsUI));

  document.getElementById("asgCancel").addEventListener("click", closeModal);
  document.getElementById("asgSave").addEventListener("click", async () => {
    const titleInput = document.getElementById("asgTitle");
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    const dueInput = document.getElementById("asgDue");
    const firstDue = dueInput.value;
    if (!firstDue) { toast("Choose a due date."); dueInput.focus(); return; }
    const points = parseInt(document.getElementById("asgPoints").value, 10) || 10;
    const weight = parseFloat(document.getElementById("asgWeight").value) || 0;
    const rows = [];
    const instructions = document.getElementById("asgInstructions").value.trim();
    const type = document.querySelector('input[name="asgType"]:checked').value;
    const locked = document.querySelector('input[name="asgAvail"]:checked').value === "locked";

    if (type === "standalone") {
      const openDate = locked ? (document.getElementById("asgOpenDate").value || null) : null;
      if (locked && !openDate) { toast("Choose the date this assignment opens, or pick \"Submit anytime\"."); document.getElementById("asgOpenDate").focus(); return; }
      rows.push({ title, instructions, due: firstDue, points, weight, submitAnytime: !locked, openDate });
    } else {
      const weeks = parseInt(document.getElementById("asgWeeks").value, 10) || 1;
      const every = parseInt(document.getElementById("asgEvery").value, 10) || 7;
      const unlockDays = locked ? (parseInt(document.getElementById("asgUnlockDays")?.value, 10) || 0) : 0;
      const seriesId = "s_" + newId();
      for (let i = 0; i < weeks; i++) {
        const d = new Date(firstDue + "T00:00:00");
        d.setDate(d.getDate() + every * i);
        const due = localISO(d);
        let openDate = null;
        if (locked) {
          const od = new Date(due + "T00:00:00");
          od.setDate(od.getDate() - unlockDays);
          openDate = localISO(od);
        }
        rows.push({ title: `${title} — Week ${i + 1}`, instructions, due, points, weight, seriesId, seriesLabel: title, submitAnytime: !locked, openDate });
      }
    }
    const units = picker.units();
    if (type !== "standalone" && units.length && plan && plan.mode === "order" && units.length > rows.length
        && !(await askConfirm(`${units.length - rows.length} of the documents won't be attached — there are only ${rows.length} weeks.\n\nSave anyway?`))) return;
    run(async () => {
      if (units.length) {
        const ids = await picker.commit();
        const per = type === "standalone" ? planMaterialIds(null, units, ids, 1) : planMaterialIds(plan, units, ids, rows.length);
        rows.forEach((r, i) => { r.materialIds = per[i] || []; });
      }
      await DB.addAssignments(course.id, rows);
      closeModal();
    }, null,
      { success: rows.length === 1 ? "Assignment added." : `${rows.length} weekly assignments added.` });
  });
}

// Every week of a recurring series, listed together so faculty can jump
// into any one week's submissions without hunting through the full list.
function openSeriesModal(course, seriesId) {
  const items = course.assignments.filter((a) => a.seriesId === seriesId).sort((a, b) => a.due.localeCompare(b.due));
  const label = items.length ? items[0].seriesLabel : "Recurring Assignment";
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width:560px;">
        <h2 style="font-size:1.15rem;">${esc(label)}</h2>
        <p style="color:var(--muted-foreground);font-size:.85rem;">${items.length} occurrences · ${items.length ? items[0].points : 0} pts each</p>
        <ul class="assignments-list" style="margin-top:14px;">
          ${items
            .map((a) => {
              const subs = ensureSubmissions(course, a);
              const turnedIn = subs.filter((s) => s.status === "submitted" || s.status === "graded").length;
              const gradedCount = subs.filter((s) => s.status === "graded").length;
              return `<li>
                <div>
                  <div><strong>${esc(a.title)}</strong></div>
                  <div style="font-size:.8rem;color:var(--muted-foreground);">Due ${parseDay(a.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})}${iTeach(course) ? ` · ${turnedIn}/${course.studentIds.length} turned in · ${gradedCount} graded` : ""}</div>
                  ${assignmentDocsHtml(course, a)}
                </div>
                ${iTeach(course) ? `<button class="btn btn-ghost btn-sm" data-week-roster="${a.id}">View Submissions</button>` : ""}
              </li>`;
            })
            .join("")}
        </ul>
        <div class="form-actions"><button class="btn btn-ghost" id="seriesClose">Close</button></div>
      </div>
    </div>`;
  document.getElementById("seriesClose").addEventListener("click", closeModal);
  wireDocChips(course, root);
  root.querySelectorAll("[data-week-roster]").forEach((btn) => {
    btn.addEventListener("click", () => openAssignmentRoster(course, course.assignments.find((a) => a.id === btn.dataset.weekRoster)));
  });
}

// Faculty: the full class roster for one assignment, with a Grade button
// per student who has actually turned something in.
function openAssignmentRoster(course, assignment) {
  const root = document.getElementById("modalRoot");
  const rows = () =>
    ensureSubmissions(course, assignment)
      .map((sub) => {
        const [label, pillClass] = STATUS_LABEL[sub.status];
        const canGrade = sub.status === "submitted" || sub.status === "graded";
        return `<li>
          <div>
            <div><strong>${esc(userName(sub.studentId))}</strong></div>
            <div style="font-size:.8rem;color:var(--muted-foreground);">${sub.fileName ? esc(sub.fileName) : sub.writtenContent ? "Written in editor" : "No file yet"}</div>
          </div>
          <div style="text-align:right;">
            <span class="pill ${pillClass}">${label}${sub.status === "graded" ? ` · ${sub.score}/${assignment.points}` : ""}</span><br>
            <button class="btn btn-ghost btn-sm" style="margin-top:8px;" data-roster-grade="${sub.studentId}" ${canGrade ? "" : "disabled"}>${sub.status === "graded" ? "Edit Grade" : "Grade"}</button>
          </div>
        </li>`;
      })
      .join("");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width:560px;">
        <h2 style="font-size:1.15rem;">${esc(assignment.title)}</h2>
        <p style="color:var(--muted-foreground);font-size:.85rem;">${esc(course.title)} · Due ${parseDay(assignment.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${assignment.points} pts</p>
        <ul class="assignments-list" id="rosterSubList" style="margin-top:14px;">${rows()}</ul>
        <div class="form-actions"><button class="btn btn-ghost" id="rosterClose">Close</button></div>
      </div>
    </div>`;
  document.getElementById("rosterClose").addEventListener("click", closeModal);
  root.querySelectorAll("[data-roster-grade]:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => {
      openGradeModal(course, assignment, btn.dataset.rosterGrade, () => {
        // Data was just reloaded — redraw the page, then reopen this roster
        // with the fresh copy of the course.
        renderMain();
        const fc = courses.find((x) => x.id === course.id);
        const fa = fc && fc.assignments.find((x) => x.id === assignment.id);
        if (fa) openAssignmentRoster(fc, fa);
      });
    });
  });
}

// Roster only ever shows who's actually enrolled. Everyone else stays
// tucked inside the "+ Add Student" picker until the faculty member adds
// them.
// Faculty: pending enrollment requests for this course — only rendered
// (as its own section) when there's at least one waiting, so the Manage
// page stays quiet otherwise. Approve adds the student to the roster
// immediately; Deny requires a short note, which is delivered as a
// message to the student's inbox (see denyEnrollment).
// ---------------------------------------------------------------------------
// Attendance
//
// Each course can record attendance (Edit Course Details → Attendance):
//   - "% of final grade": attendance's share; assignments make up the rest.
//     0% = taken and shown to students, but not part of the grade.
//   - "Not recording attendance" (only when 0%) turns it off entirely.
//   - "Late counts as __%": the teacher's choice of credit for a Late.
// Marks: Present (full credit), Late (the course's late credit), Absent
// (none), Excused (not counted either way). Only the course's teacher takes
// and sees it; each student sees their own in My Grades.
// ---------------------------------------------------------------------------
const ATT_STATUSES = ["present", "late", "absent", "excused"];
const ATT_LABEL = { present: "Present", late: "Late", absent: "Absent", excused: "Excused" };
let attendanceDate = null;
let attendanceBackView = "home";
let attDraft = null; // { courseId, date, held, marks: { studentId: status } }

// Every day a course actually meets (YYYY-MM-DD): its scheduled days,
// minus any the teacher canceled.
function classDates(c) {
  return scheduledDates(c).filter((d) => !isCanceled(c, d));
}
// Every scheduled class day, canceled or not, from the schedule.
function scheduledDates(c) {
  const s = c.schedule;
  if (!s || !s.startDate || !s.days || !s.days.length) return [];
  const start = parseDay(s.startDate);
  const out = [];
  for (let i = 0; i < (s.weeks || 52) * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (s.days.includes(DAY_NAMES[d.getDay()])) out.push(localISO(d));
  }
  return out;
}
// Scheduled days plus any extra day attendance was taken (a make-up class).
function attendanceDates(c) {
  return [...new Set([...classDates(c), ...Object.keys(c.attDays || {})])].sort();
}
function lastFirst(name) {
  const parts = (name || "").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}` : (name || "");
}
function lastNameKey(name) {
  const parts = (name || "").trim().split(/\s+/);
  return (parts[parts.length - 1] + " " + parts.slice(0, -1).join(" ")).toLowerCase();
}
function rosterByLastName(c) {
  return c.studentIds.map((id) => users.find((u) => u.id === id)).filter(Boolean)
    .sort((a, b) => lastNameKey(a.name).localeCompare(lastNameKey(b.name)));
}
function fmtDay(ds, opts = { weekday: "short", month: "short", day: "numeric" }) {
  return parseDay(ds).toLocaleDateString(undefined, opts);
}

// One student's attendance in one course: counts, a 0–1 rate, and each day.
function studentAttendance(c, studentId) {
  const counts = { present: 0, late: 0, absent: 0, excused: 0 };
  const rows = [];
  let credit = 0, counted = 0;
  // Days the teacher took, plus days the site filled in for online students.
  const allDays = Object.assign({}, c.autoDays || {}, c.attDays || {});
  Object.keys(allDays).sort().forEach((ds) => {
    const day = allDays[ds];
    if (!day.held) return;
    const st = (c.attMarks[ds] || {})[studentId];
    if (!st) return; // wasn't on the roster that day
    counts[st]++;
    rows.push({ date: ds, status: st });
    if (st === "excused") return;
    counted++;
    credit += st === "present" ? 1 : st === "late" ? (c.att.lateCredit / 100) : 0;
  });
  return { rate: counted ? credit / counted : null, pct: counted ? Math.round((credit / counted) * 1000) / 10 : null, counts, rows };
}

// Class days up to today that haven't been taken (or marked "no class").
function untakenDays(c) {
  const today = todayStr();
  return classDates(c).filter((d) => d <= today && !(c.attDays || {})[d]);
}
function myAttendanceCourses() {
  return courses.filter((c) => !c.archived && takesClassroomAttendance(c) && iTeach(c));
}
function attendanceTodayCount() {
  const today = todayStr();
  return myAttendanceCourses().filter((c) => classDates(c).includes(today) && !c.attDays[today]).length;
}

function openAttendance(courseId, date, back) {
  closeModal();
  activeCourseId = courseId;
  attendanceDate = date || null;
  attendanceBackView = back || (view === "attendance" ? attendanceBackView : view) || "home";
  attDraft = null;
  view = "attendance";
  renderNav();
  renderMain();
}

// --- Course settings: the Attendance block in Add/Edit Course ------------
function attSettingsHtml(p, att) {
  const a = att || { on: false, weight: 0, lateCredit: 50 };
  return `
    <fieldset class="att-settings">
      <legend>Attendance</legend>
      <label for="${p}AttWeight">Attendance % of final grade</label>
      <div class="att-inline">
        <div class="pct-input"><input type="number" id="${p}AttWeight" min="0" max="100" step="1" value="${a.on ? a.weight : 0}" ${a.on ? "" : "disabled"} inputmode="numeric" /><span>%</span></div>
        <label class="check-inline"><input type="checkbox" id="${p}AttOff" ${a.on ? "" : "checked"} ${a.on && a.weight > 0 ? "disabled" : ""} /> Not recording attendance</label>
      </div>
      <div class="field-hint" id="${p}AttHint"></div>
      <div id="${p}AttLateWrap">
        <label for="${p}AttLate">A "Late" counts as</label>
        <div class="pct-input"><input type="number" id="${p}AttLate" min="0" max="100" step="5" value="${a.lateCredit}" inputmode="numeric" /><span>% of Present</span></div>
      </div>
    </fieldset>`;
}
function wireAttSettings(p) {
  const w = document.getElementById(`${p}AttWeight`);
  const off = document.getElementById(`${p}AttOff`);
  const hint = document.getElementById(`${p}AttHint`);
  const late = document.getElementById(`${p}AttLateWrap`);
  const sync = () => {
    const val = Math.max(0, Math.min(100, Number(w.value) || 0));
    off.disabled = val > 0;
    w.disabled = off.checked;
    late.style.display = off.checked ? "none" : "";
    hint.textContent = off.checked
      ? "Attendance won't be taken for this course."
      : val > 0 ? `Attendance is ${val}% of the final grade; assignments make up the other ${100 - val}%.`
        : "Attendance will be taken and shown to students, but won't affect the grade. Check the box to stop recording it.";
  };
  off.addEventListener("change", () => { if (off.checked) w.value = 0; sync(); });
  w.addEventListener("input", sync);
  sync();
}
function readAttSettings(p) {
  const on = !document.getElementById(`${p}AttOff`).checked;
  const weight = Math.max(0, Math.min(100, Math.round(Number(document.getElementById(`${p}AttWeight`).value) || 0)));
  const lateCredit = Math.max(0, Math.min(100, Math.round(Number(document.getElementById(`${p}AttLate`).value) || 0)));
  return { on, weight: on ? weight : 0, lateCredit };
}

// --- The attendance page ----------------------------------------------------
function renderAttendance(main) {
  const c = courses.find((x) => x.id === activeCourseId);
  const today = todayStr();
  const backLabel = { calendar: "Calendar", manage: "Course", attendanceHome: "Attendance", home: "Dashboard" }[attendanceBackView] || "Dashboard";
  const header = `
    <button class="back-link" id="backLink">&larr; Back to ${backLabel}</button>
    <div class="page-header">
      <div class="eyebrow">Attendance</div>
      <h1>${esc(c.title)}</h1>
      <p>${esc(scheduleLine(c) || "No class schedule set yet")}${c.att.on ? ` · ${c.att.weight ? `${c.att.weight}% of the final grade` : "recorded, not graded"} · Late = ${c.att.lateCredit}%` : ""}</p>
    </div>`;
  const goBack = () => { view = attendanceBackView || "home"; if (view !== "manage") activeCourseId = null; renderNav(); renderMain(); };

  if (!c.att.on) {
    main.innerHTML = `${header}
      <div class="card empty-state">
        <div class="icon-badge" style="margin:0 auto 14px;">${icon("check")}</div>
        <p>This course isn't recording attendance. Turn it on in <strong>Edit Course Details</strong> on the course's page.</p>
        ${iManage(c) ? `<button class="btn btn-primary btn-sm" id="attGoManage" style="margin-top:12px;">Open the Course</button>` : ""}
      </div>`;
    document.getElementById("backLink").addEventListener("click", goBack);
    const gm = document.getElementById("attGoManage");
    if (gm) gm.addEventListener("click", () => { view = "manage"; renderNav(); renderMain(); });
    return;
  }

  const dates = attendanceDates(c).filter((d) => d <= today);
  if (!attendanceDate || attendanceDate > today) {
    const wanted = attendanceDate;
    attendanceDate = dates.length ? dates[dates.length - 1] : today;
    if (wanted && wanted > today) toast(`${fmtDay(wanted)} hasn't happened yet — showing the most recent class.`, "success");
  }
  if (!dates.includes(attendanceDate)) dates.push(attendanceDate), dates.sort();
  const date = attendanceDate;
  const day = c.attDays[date];
  // Online students are counted from what they watched (listed below, read-only).
  const fullRoster = rosterByLastName(c);
  const roster = fullRoster.filter((u) => !isOnlineStudent(c, u.id));
  const onlineRoster = fullRoster.filter((u) => isOnlineStudent(c, u.id));
  if (!attDraft || attDraft.courseId !== c.id || attDraft.date !== date) {
    const saved = c.attMarks[date] || {};
    attDraft = { courseId: c.id, date, held: day ? day.held : true, marks: {} };
    roster.forEach((u) => { attDraft.marks[u.id] = saved[u.id] || "present"; });
  }
  const idx = dates.indexOf(date);
  const scheduled = classDates(c).includes(date);
  const counts = { present: 0, late: 0, absent: 0, excused: 0 };
  roster.forEach((u) => counts[attDraft.marks[u.id]]++);
  const takenBy = day && day.takenBy ? userName(day.takenBy) : "";

  main.innerHTML = `${header}
    <div class="card att-daybar">
      <button class="btn btn-ghost btn-sm" id="attPrev" ${idx <= 0 ? "disabled" : ""} aria-label="Previous class">&larr;</button>
      <select id="attDateSel" aria-label="Class day">
        ${dates.slice().reverse().map((d) => `<option value="${d}" ${d === date ? "selected" : ""}>${fmtDay(d, { weekday: "long", month: "short", day: "numeric" })}${d === today ? " (today)" : ""}${c.attDays[d] ? (c.attDays[d].held ? " ✓" : " — no class") : ""}</option>`).join("")}
      </select>
      <button class="btn btn-ghost btn-sm" id="attNext" ${idx >= dates.length - 1 ? "disabled" : ""} aria-label="Next class">&rarr;</button>
      <span class="pill ${day ? "pill-green" : "pill-gold"} att-status">${day ? (day.held ? "Taken" : "No class") : "Not taken yet"}</span>
    </div>
    ${day ? `<p class="field-hint" style="margin:-6px 0 14px;">Saved${takenBy ? ` by ${esc(takenBy)}` : ""} ${new Date(day.takenAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. You can change it and save again.</p>` : !scheduled ? `<p class="field-hint" style="margin:-6px 0 14px;">This isn't one of the course's scheduled days — saving it adds a make-up class day.</p>` : ""}

    <div class="subtabs att-held" id="attHeld">
      <button data-held="1" class="${attDraft.held ? "active" : ""}">Class held</button>
      <button data-held="0" class="${attDraft.held ? "" : "active"}">No class this day</button>
    </div>

    ${!attDraft.held ? `
    <div class="card empty-state"><p>No class was held on ${fmtDay(date, { weekday: "long", month: "long", day: "numeric" })}. It won't count for or against anyone.</p></div>` :
    roster.length === 0 ? (onlineRoster.length ? onlineAttendanceHtml(c, date, onlineRoster) : `<div class="card empty-state"><p>No students are enrolled yet.</p></div>`) : `
    <div class="att-summary">
      ${ATT_STATUSES.map((s) => `<span class="att-count att-count-${s}"><strong>${counts[s]}</strong> ${ATT_LABEL[s]}</span>`).join("")}
      <button class="btn btn-ghost btn-sm" id="attAllPresent" style="margin-left:auto;">Mark everyone present</button>
    </div>
    <div class="card att-roster">
      ${roster.map((u) => `
        <div class="att-row" data-student="${u.id}">
          <div class="att-who">${avatarHtml(u, 34)}<span>${esc(lastFirst(u.name))}${((c.attNotes[date] || {})[u.id] || {}).auto ? `<small class="att-madeup">${esc(c.attNotes[date][u.id].note)}</small>` : ""}</span></div>
          <div class="att-marks" role="radiogroup" aria-label="Attendance for ${esc(u.name)}">
            ${ATT_STATUSES.map((s) => `<button type="button" role="radio" aria-checked="${attDraft.marks[u.id] === s}" class="att-mark att-mark-${s} ${attDraft.marks[u.id] === s ? "on" : ""}" data-mark="${s}" title="${ATT_LABEL[s]}"><span class="att-full">${ATT_LABEL[s]}</span><span class="att-short">${ATT_LABEL[s][0]}</span></button>`).join("")}
          </div>
        </div>`).join("")}
    </div>
    ${onlineAttendanceHtml(c, date, onlineRoster)}`}
    <div class="att-savebar">
      <button class="btn btn-primary" id="attSave">${day ? "Save Changes" : "Save Attendance"}</button>
      ${day ? `<button class="btn btn-ghost btn-sm" id="attClear">Clear this day</button>` : ""}
    </div>
  `;

  document.getElementById("backLink").addEventListener("click", goBack);
  const go = (d) => { attendanceDate = d; attDraft = null; renderAttendance(main); };
  document.getElementById("attPrev").addEventListener("click", () => idx > 0 && go(dates[idx - 1]));
  document.getElementById("attNext").addEventListener("click", () => idx < dates.length - 1 && go(dates[idx + 1]));
  document.getElementById("attDateSel").addEventListener("change", (e) => go(e.target.value));
  document.querySelectorAll("#attHeld [data-held]").forEach((b) => b.addEventListener("click", () => { attDraft.held = b.dataset.held === "1"; renderAttendance(main); }));
  main.querySelectorAll(".att-row").forEach((row) => {
    row.querySelectorAll("[data-mark]").forEach((b) => b.addEventListener("click", () => {
      attDraft.marks[row.dataset.student] = b.dataset.mark;
      const y = window.scrollY;
      renderAttendance(main);
      window.scrollTo(0, y);
    }));
  });
  const allP = document.getElementById("attAllPresent");
  if (allP) allP.addEventListener("click", () => { Object.keys(attDraft.marks).forEach((k) => { attDraft.marks[k] = "present"; }); renderAttendance(main); });
  document.getElementById("attSave").addEventListener("click", () => {
    const marks = {};
    Object.entries(attDraft.marks).forEach(([sid, st]) => { if (st !== "present") marks[sid] = st; });
    run(() => DB.saveAttendance(c.id, date, attDraft.held, marks), () => { attDraft = null; renderMain(); },
      { success: `Attendance saved for ${fmtDay(date, { weekday: "long", month: "short", day: "numeric" })}.` });
  });
  const clr = document.getElementById("attClear");
  if (clr) clr.addEventListener("click", async () => {
    if (!(await askConfirm(`Clear attendance for ${fmtDay(date, { weekday: "long", month: "short", day: "numeric" })}? This day will go back to "Not taken yet".`))) return;
    run(() => DB.clearAttendance(c.id, date), () => { attDraft = null; renderMain(); }, { success: "That day's attendance was cleared." });
  });
}

// --- Faculty: the Attendance tile — every course you teach that records it.
function renderAttendanceHome(main) {
  const today = todayStr();
  const list = myAttendanceCourses();
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${staffEyebrow()}</div>
      <h1>Attendance</h1>
      <p>Your courses that record attendance. Tap a course to take or review it.</p>
    </div>
    ${list.length === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("check")}</div>
      <p>None of the courses you teach record attendance yet. Turn it on from a course's <strong>Edit Course Details</strong>.</p>
    </div>` : `
    <div class="grid grid-compact">
      ${list.map((c) => {
        const meetsToday = classDates(c).includes(today);
        const missed = untakenDays(c).filter((d) => d < today);
        return `
        <div class="tile tile-compact" data-att-course="${c.id}" tabindex="0" role="button">
          ${meetsToday && !c.attDays[today] ? `<span class="tile-badge" title="Class today — attendance not taken">!</span>` : ""}
          <span class="pill pill-navy">${esc(c.level)} Level</span>
          <h3>${esc(c.title)}</h3>
          <p class="tile-meta">${esc(scheduleLine(c) || "No schedule set")}</p>
          <p class="tile-meta" style="margin-top:8px;font-size:.78rem;">
            ${meetsToday ? (c.attDays[today] ? `<span class="pill pill-green">Today: taken</span>` : `<span class="pill pill-gold">Class today</span>`) : ""}
            ${missed.length ? `<span class="pill pill-red">${missed.length} earlier day${missed.length === 1 ? "" : "s"} not taken</span>` : ""}
          </p>
        </div>`;
      }).join("")}
    </div>`}
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  main.querySelectorAll("[data-att-course]").forEach((el) => {
    const open = () => {
      const c = courses.find((x) => x.id === el.dataset.attCourse);
      const missed = untakenDays(c);
      openAttendance(c.id, classDates(c).includes(today) ? today : (missed[missed.length - 1] || null), "attendanceHome");
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}

// --- The Attendance card on a course's Manage page ------------------------
function renderAttendanceCard(c) {
  const wrap = document.getElementById("mgAttendanceCard");
  if (!wrap) return;
  if (!c.att.on) {
    wrap.innerHTML = `<p style="margin:0;color:var(--muted-foreground);">Not recording attendance. To turn it on, use <strong>Edit Course Details</strong> above.</p>`;
    return;
  }
  const summary = `<p style="margin:0 0 12px;">${c.att.weight ? `Attendance is <strong>${c.att.weight}%</strong> of the final grade` : "Attendance is recorded but <strong>not graded</strong>"} · a Late counts as <strong>${c.att.lateCredit}%</strong>.</p>`;
  if (!iTeach(c)) {
    wrap.innerHTML = `${summary}<div class="privacy-note">${icon("lock")}<span>Attendance records are visible only to this course's teacher.</span></div>`;
    return;
  }
  if (!takesClassroomAttendance(c)) {
    const rows = rosterByLastName(c).map((u) => ({ u, a: studentAttendance(c, u.id) }));
    wrap.innerHTML = `${summary}
      <p class="field-hint" style="margin:0 0 10px;">Everyone in this course attends online, so attendance fills itself in: ${c.pace === "self" ? `each lecture watched ${WATCH_SHARE}% before the student's semester ends` : `${Math.round(LIVE_SHARE * 100)}% of the class watched live, or ${WATCH_SHARE}% of the recording within ${WATCH_DAYS} days`}.</p>
      ${rows.length ? `<ul class="materials-list">${rows.map(({ u, a }) => `<li><div><strong>${esc(u.name)}</strong><div class="field-hint" style="margin:2px 0 0;">${a.counts.present} present · ${a.counts.absent} absent${a.counts.excused ? ` · ${a.counts.excused} excused` : ""}</div></div><span class="pill ${a.pct === null ? "pill-gray" : a.pct >= 80 ? "pill-green" : "pill-gold"}">${a.pct === null ? "—" : a.pct + "%"}</span></li>`).join("")}</ul>` : `<p class="field-hint">No students yet.</p>`}`;
    return;
  }
  const today = todayStr();
  const past = classDates(c).filter((d) => d <= today).slice(-8).reverse();
  wrap.innerHTML = `${summary}
    <div class="att-chips">
      ${past.length === 0 ? `<span class="field-hint">No class days yet — they'll appear here once the course starts.</span>` : past.map((d) => {
        const day = c.attDays[d];
        return `<button class="att-chip ${day ? (day.held ? "att-chip-done" : "att-chip-none") : "att-chip-todo"}" data-att-date="${d}">${fmtDay(d)}${d === today ? " · today" : ""}<span>${day ? (day.held ? "✓" : "no class") : "not taken"}</span></button>`;
      }).join("")}
    </div>
    <div class="form-actions"><button class="btn btn-primary btn-sm" id="mgTakeAttendance">${classDates(c).includes(today) ? (c.attDays[today] ? "Review Today's Attendance" : "Take Today's Attendance") : "Open Attendance"}</button></div>`;
  wrap.querySelectorAll("[data-att-date]").forEach((b) => b.addEventListener("click", () => openAttendance(c.id, b.dataset.attDate, "manage")));
  document.getElementById("mgTakeAttendance").addEventListener("click", () => openAttendance(c.id, classDates(c).includes(today) ? today : null, "manage"));
}

// ---------------------------------------------------------------------------
// Class reminders (phone notifications) — the card on a teacher's My Profile.
// 5 minutes before a class that records attendance starts, its teacher gets a
// notification that opens that day's attendance. Each phone (or computer)
// is turned on separately. iPhones need the site added to the Home Screen
// first (an Apple rule for web notifications, iOS 16.4 or newer).
// ---------------------------------------------------------------------------
function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isInstalledApp() {
  return window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}
function deviceLabel() {
  const ua = navigator.userAgent;
  const dev = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || isIOS() ? "iPad" : /Android/.test(ua) ? "Android phone" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows computer" : "This device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) && !/Edg\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return br ? `${dev} · ${br}` : dev;
}
function b64urlToBytes(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
}
function bytesToB64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register("sw.js").catch((e) => { console.warn("service worker:", e); return null; });
}

const DUE_REMINDER_CHOICES = [
  ["evening", "The evening before", "6 PM"],
  ["morning", "The morning it's due", "8 AM"],
  ["both", "Both", "6 PM & 8 AM"],
  ["off", "No due-date reminders", ""],
];
// Students: when to be reminded about work that isn't turned in yet.
function dueReminderChooser() {
  if (role !== "student") return "";
  const me = users.find((u) => u.id === currentUser.id) || {};
  const cur = me.dueReminders || "evening";
  return `
    <div class="due-pref">
      <div class="cal-modal-label" style="margin:16px 0 8px;">Remind me about assignments not turned in yet</div>
      <div class="due-pref-options" role="radiogroup" aria-label="When to remind me">
        ${DUE_REMINDER_CHOICES.map(([k, label, when]) => `
          <button type="button" role="radio" aria-checked="${cur === k}" class="due-pref-opt ${cur === k ? "active" : ""}" data-due-pref="${k}">
            <strong>${label}</strong>${when ? `<span>${when}</span>` : ""}
          </button>`).join("")}
      </div>
      <p class="field-hint" style="margin:8px 0 0;">Alaska time. Several assignments due the same day arrive as one note.</p>
    </div>`;
}
function wireDueReminderChooser(wrap) {
  wrap.querySelectorAll("[data-due-pref]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.duePref;
    run(() => DB.updateProfile(currentUser.id, { due_reminders: v }), () => renderReminderCard(),
      { success: v === "off" ? "Due-date reminders are off." : "Saved — you'll be reminded " + (v === "evening" ? "the evening before." : v === "morning" ? "the morning it's due." : "the evening before and the morning it's due.") });
  }));
}

async function renderReminderCard() {
  const wrap = document.getElementById("reminderCard");
  if (!wrap) return;
  const intro = `<p style="margin:0 0 12px;">Hear about new messages, grades, announcements, class cancellations, and more without having to sign in — on your phone, by email, or both.${role === "student" ? "" : " On your phone you'll also get a reminder 5 minutes before each of your classes starts, until attendance is taken."}</p>
    <div class="cal-modal-label" style="margin:0 0 8px;">On this phone or computer</div>`;

  if (!pushSupported()) {
    wrap.innerHTML = intro + (isIOS() && !isInstalledApp() ? `
      <div class="install-steps">
        <strong>On iPhone or iPad, add the Institute to your Home Screen first:</strong>
        <ol>
          <li>In Safari, tap the <strong>Share</strong> button <span aria-hidden="true">(the square with an arrow)</span>.</li>
          <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          <li>Open the <strong>TNBBI</strong> icon from your Home Screen, sign in, and come back to <strong>My Profile</strong> to turn reminders on.</li>
        </ol>
        <p class="field-hint" style="margin:6px 0 0;">Needs iOS 16.4 or newer (Settings → General → About → iOS Version).</p>
      </div>` : `<p class="field-hint" style="margin:0;">This browser can't receive notifications. On a phone, use Safari (iPhone) or Chrome (Android).</p>`) + emailChooserHtml() + dueReminderChooser();
    wireDueReminderChooser(wrap);
    wireEmailChooser(wrap);
    return;
  }
  wrap.innerHTML = intro + `<p class="field-hint" style="margin:0;">Checking this device…</p>`;
  let sub = null, devices = [];
  try {
    sub = await currentPushSubscription();
    devices = await DB.myPushDevices();
  } catch (e) { console.warn(e); }
  if (!document.getElementById("reminderCard")) return;
  const onHere = sub && devices.some((d) => d.endpoint === sub.endpoint);
  const others = devices.filter((d) => !sub || d.endpoint !== sub.endpoint);
  const blocked = Notification.permission === "denied";
  wrap.innerHTML = intro + `
    <div class="reminder-state ${onHere ? "reminder-on" : ""}">
      <span class="reminder-dot"></span>
      <div><strong>${onHere ? "On for this device" : "Off for this device"}</strong>
        <div class="field-hint" style="margin:2px 0 0;">${esc(deviceLabel())}${others.length ? ` · also on for ${others.length} other device${others.length === 1 ? "" : "s"}` : ""}</div></div>
    </div>
    ${blocked ? `<p class="field-hint" style="margin:10px 0 0;color:var(--destructive);">Notifications are blocked for this site. Allow them in your browser's (or phone's) settings for tnbbibleinstitute.com, then reload this page.</p>` : ""}
    <div class="form-actions" style="flex-wrap:wrap;">
      ${onHere
        ? `<button class="btn btn-primary btn-sm" id="pushTest">Send a Test</button><button class="btn btn-ghost btn-sm" id="pushOff">Turn Off on This Device</button>`
        : `<button class="btn btn-gold btn-sm" id="pushOn" ${blocked ? "disabled" : ""}>Turn On Phone Notifications</button>`}
    </div>` + emailChooserHtml() + dueReminderChooser();
  wireDueReminderChooser(wrap);
  wireEmailChooser(wrap);

  const on = document.getElementById("pushOn");
  if (on) on.addEventListener("click", async () => {
    // Ask for permission first, straight from the tap (iPhones require that).
    let perm;
    try { perm = await Notification.requestPermission(); } catch (e) { perm = "denied"; }
    if (perm !== "granted") { toast("Notifications weren't allowed, so reminders can't be turned on for this device."); renderReminderCard(); return; }
    run(async () => {
      let key = await DB.pushPublicKey();
      if (!key) key = (await DB.reminderFunction("setup=1")).publicKey;
      if (!key) throw new Error("The reminder service isn't set up yet. Please try again later.");
      const reg = (await registerServiceWorker()) || (await navigator.serviceWorker.ready);
      await navigator.serviceWorker.ready;
      let s = await reg.pushManager.getSubscription();
      if (s && s.options && s.options.applicationServerKey && bytesToB64url(s.options.applicationServerKey) !== key) { await s.unsubscribe(); s = null; }
      if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(key) });
      await DB.registerPush(s, deviceLabel());
    }, () => renderReminderCard(), { reload: false, success: "Phone notifications are on for this device. Tap \"Send a Test\" to try one." });
  });
  const test = document.getElementById("pushTest");
  if (test) test.addEventListener("click", () => run(async () => {
    const r = await DB.reminderFunction("test=1");
    if (!r.delivered) throw new Error("The test couldn't be delivered. Try turning reminders off and on again.");
  }, () => renderReminderCard(), { reload: false, success: "Test sent — it should arrive in a few seconds." }));
  const off = document.getElementById("pushOff");
  if (off) off.addEventListener("click", () => run(async () => {
    const s = await currentPushSubscription();
    if (s) { await DB.unregisterPush(s.endpoint); await s.unsubscribe().catch(() => {}); }
  }, () => renderReminderCard(), { reload: false, success: "Reminders are off for this device." }));
}

// The Teacher card at the top of a course's Manage page.
function renderTeacherCard(c) {
  const wrap = document.getElementById("mgTeacherCard");
  if (!wrap) return;
  const t = courseTeacher(c);
  const sa = !!currentUser.superAdmin;
  const started = courseStarted(c);
  const startTxt = c.schedule.startDate ? parseDay(c.schedule.startDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "";
  const faculty = users.filter((u) => u.role === "faculty" && u.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  const formerNote = c.facultyId && !t ? `<p class="field-hint" style="margin:8px 0 0;">The previously assigned teacher is no longer active faculty, so the Admins are covering this course until a new teacher is chosen.</p>` : "";
  const current = `
    <div class="teacher-current">
      ${t ? avatarHtml(t, 44) : `<span class="avatar avatar-initials" style="width:44px;height:44px;font-size:16px;">?</span>`}
      <div>
        <div class="teacher-name">${t ? esc(t.name) : "No teacher yet"}${t && t.id === currentUser.id ? ` <span class="pill pill-gold" style="margin-left:6px;">You</span>` : ""}</div>
        <div class="field-hint" style="margin:2px 0 0;">${t ? "Sees this course's grades, private messages, and discussion board." : "Until one is assigned, the Admins receive this course's messages and enrollment requests."}</div>
      </div>
    </div>`;

  if (!canChangeTeacher(c)) {
    wrap.innerHTML = `${current}${formerNote}
      <div class="privacy-note" style="margin-top:14px;">${icon("lock")}<span>${started
        ? `This course started ${esc(startTxt)}, so only an Admin can change its teacher — for example, if a teacher is unable to finish the course.`
        : "Only this course's teacher or an Admin can change who teaches it."}</span></div>`;
    return;
  }

  const hint = sa
    ? `As an Admin you can change the teacher at any time — for example, if a teacher is unable to finish the course. The new teacher sees the course's full grade book, messages, and discussion; the previous teacher no longer does.`
    : started ? "" : `You can hand this course to another faculty member${startTxt ? ` until it starts on ${esc(startTxt)}` : " until it starts"}. After that, only an Admin can change its teacher.`;
  wrap.innerHTML = `${current}${formerNote}
    <label for="mgTeacher" style="margin-top:16px;">Change teacher</label>
    <div class="teacher-change-row">
      <select id="mgTeacher">
        ${sa ? `<option value="" ${t ? "" : "selected"}>No teacher (Admins cover it)</option>` : ""}
        ${faculty.map((u) => `<option value="${u.id}" ${t && u.id === t.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}
      </select>
      <button class="btn btn-primary btn-sm" id="mgSaveTeacher">Assign</button>
    </div>
    <p class="field-hint" style="margin-top:8px;">${hint}</p>`;

  document.getElementById("mgSaveTeacher").addEventListener("click", async () => {
    const newId = document.getElementById("mgTeacher").value || null;
    if ((newId || null) === (t ? t.id : null)) { toast("That's already this course's teacher.", "success"); return; }
    const newName = newId ? userName(newId) : "no teacher";
    const handingOff = t && t.id === currentUser.id;
    const msg = handingOff
      ? `Hand "${c.title}" to ${newName}?\n\nYou'll no longer see this course's grades, private messages, or discussion board.${sa ? "" : " You won't be able to manage the course either, and once it starts only an Admin can change its teacher."}`
      : `Make ${newName === "no teacher" ? "this course unassigned" : newName + " the teacher of \"" + c.title + "\""}?\n\n${newId ? "They'll see the course's full grade book, messages, and discussion board" + (t ? `, and ${t.name} no longer will.` : ".") : "The Admins will receive its messages and enrollment requests until a teacher is chosen."}`;
    if (!(await askConfirm(msg))) return;
    run(() => DB.updateCourse(c.id, { faculty_id: newId }), () => {
      // Handing your own course away may mean you can no longer manage it.
      if (!iManage(courses.find((x) => x.id === c.id))) { view = "catalogue"; activeCourseId = null; renderNav(); }
      renderMain();
    }, { success: newId ? `${newName} is now teaching ${c.title}.` : `${c.title} has no teacher for now.` });
  });
}

// A read-only summary for faculty looking at a course they don't teach.
function openCourseInfoModal(c) {
  const t = courseTeacher(c);
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ciTitle" style="max-width:460px;">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
          <span class="pill pill-navy">${esc(c.level)} Level</span>
          <span class="pill ${courseStatusLabel(c).cls}">${esc(courseStatusLabel(c).text)}</span>
        </div>
        <h2 id="ciTitle" style="font-size:1.25rem;margin:0 0 8px;">${esc(c.title)}</h2>
        <p style="margin:0 0 14px;color:var(--muted-foreground);">${esc(c.description)}</p>
        <div class="person-line"><span class="person-label">Teacher</span>
          ${t ? `<button class="person-chip" data-person="${t.id}">${avatarHtml(t, 28)}<strong>${esc(t.name)}</strong></button>` : "No teacher yet"}</div>
        <div class="person-line"><span class="person-label">Schedule</span>${esc(scheduleLine(c) || "Not scheduled yet")}</div>
        <div class="person-line"><span class="person-label">Enrollment</span>${c.studentIds.length} student${c.studentIds.length === 1 ? "" : "s"} · ${c.credits} credit${c.credits === 1 ? "" : "s"}</div>
        <div class="privacy-note" style="margin-top:14px;">${icon("lock")}<span>Only this course's teacher or an Admin can change it. Its grades, messages, and discussion board are visible only to its teacher.</span></div>
        <div class="form-actions"><button class="btn btn-ghost" id="ciClose">Close</button></div>
      </div>
    </div>`;
  document.getElementById("ciClose").addEventListener("click", closeModal);
  wirePersonLinks(root);
}

function renderEnrollmentRequests(c) {
  const section = document.getElementById("mgEnrollRequestsSection");
  if (!section) return;
  const pending = pendingRequestsFor(c);
  if (c.archived || pending.length === 0) { section.innerHTML = ""; return; }
  section.innerHTML = `
    <div class="section-title">
      <h2>Enrollment Requests <span class="pill pill-gold" style="margin-left:6px;">${pending.length}</span></h2>
      ${pending.length > 1 ? `<button class="btn btn-gold btn-sm" id="mgApproveAll">Approve All</button>` : ""}
    </div>
    <div class="card">
      <div id="mgEnrollRequestsList"></div>
    </div>
  `;
  function renderList() {
    const wrap = document.getElementById("mgEnrollRequestsList");
    if (!wrap) return;
    const rows = pendingRequestsFor(c);
    if (rows.length === 0) { renderEnrollmentRequests(c); return; }
    wrap.innerHTML = rows
      .map((r) => {
        const u = users.find((x) => x.id === r.studentId);
        return `
      <div class="user-row">
        <div class="user-info">
          <div class="u-name">${esc(u ? u.name : "Unknown")}</div>
          <div class="u-email">${esc(u ? u.email : "")} · Requested ${parseDay(r.requestedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-primary btn-sm" data-approve="${r.studentId}">Approve</button>
          <button class="btn btn-ghost btn-sm" data-deny="${r.studentId}">Deny</button>
        </div>
      </div>`;
      })
      .join("");
    wrap.querySelectorAll("[data-approve]").forEach((btn) => {
      btn.addEventListener("click", () => approveEnrollment(c, btn.dataset.approve));
    });
    wrap.querySelectorAll("[data-deny]").forEach((btn) => {
      btn.addEventListener("click", () => openDenyEnrollmentModal(c, btn.dataset.deny));
    });
  }
  renderList();
  const approveAllBtn = document.getElementById("mgApproveAll");
  if (approveAllBtn) {
    approveAllBtn.addEventListener("click", () => approveAllEnrollments(c));
  }
}

function openDenyEnrollmentModal(course, studentId) {
  const root = document.getElementById("modalRoot");
  const u = users.find((x) => x.id === studentId);
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2 style="font-size:1.15rem;">Deny ${esc(u ? u.name : "this")}'s Request?</h2>
        <p style="color:var(--muted-foreground);font-size:.85rem;">${esc(course.title)}</p>
        <label for="denyNote">Note to the student (required)</label>
        <textarea id="denyNote" rows="3" placeholder="Let them know why — e.g. prerequisite not yet completed, course is full, wrong level."></textarea>
        <div class="field-hint">This is sent to their Message Inbox as a note from you.</div>
        <div class="form-actions">
          <button class="btn btn-danger" id="denySave">Deny &amp; Send Note</button>
          <button class="btn btn-ghost" id="denyCancel">Cancel</button>
        </div>
      </div>
    </div>`;
  document.getElementById("denyCancel").addEventListener("click", closeModal);
  document.getElementById("denySave").addEventListener("click", () => {
    const noteInput = document.getElementById("denyNote");
    const note = noteInput.value.trim();
    if (!note) { noteInput.focus(); return; }
    run(async () => { await DB.denyEnrollment(course.id, studentId, note); closeModal(); });
  });
}

function renderRosterList(c) {
  const wrap = document.getElementById("mgRosterList");
  if (!wrap) return;
  const enrolled = c.studentIds
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  wrap.innerHTML = `
    ${enrolled.length === 0 ? `<div class="empty-state"><p>No students enrolled yet.</p></div>` : enrolled
      .map(
        (u) => `
      <div class="user-row">
        <div class="user-info">
          <div class="u-name">${esc(u.name)}</div>
          <div class="u-email">${esc(u.email)}</div>
        </div>
        ${rosterAttendHtml(c, u)}
        <button class="btn btn-ghost btn-sm" data-remove-student="${u.id}">Remove</button>
      </div>`
      )
      .join("")}
    <button class="btn btn-gold btn-sm" id="mgAddStudent" style="margin-top:14px;">+ Add Student</button>
  `;
  wrap.querySelectorAll("[data-remove-student]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const removedId = btn.dataset.removeStudent;
      // A student's private messages with this course's instructor go
      // with their enrollment — once they're off the roster, there's no
      // relationship left for the thread to belong to. Their submitted
      // work and grades are kept (and return if they're re-added).
      if (!(await askConfirm(`Remove ${userName(removedId)} from ${c.title}?\n\nTheir private messages for this course will be deleted. Their submitted work and grades are kept.`))) return;
      run(() => DB.unenroll(c.id, removedId));
    });
  });
  document.getElementById("mgAddStudent").addEventListener("click", () => openAddStudentModal(c));
  wireRosterAttend(c, wrap);
}

// The "+ Add Student" picker — only lists active students not already on
// the roster. Adding one removes them from this list immediately and
// they show up on the roster behind it.
// Pickers that list people refresh first, so someone who signed up a
// minute ago is already there.
function withFreshData(then) {
  if (Date.now() - dataLoadedAt < 1500) return then();
  setBusy(true);
  loadAll()
    .then(() => { setBusy(false); then(); })
    .catch((e) => { setBusy(false); toast(friendlyError(e)); });
}

function openAddStudentModal(course) {
  if (Date.now() - dataLoadedAt >= 1500) {
    return withFreshData(() => {
      renderMain();
      const fresh = courses.find((x) => x.id === course.id);
      if (fresh) openAddStudentModal(fresh);
    });
  }
  const root = document.getElementById("modalRoot");
  const renderList = () => {
    const listEl = document.getElementById("addStudentList");
    if (!listEl) return;
    const available = users
      .filter((u) => u.role === "student" && u.status === "active" && !course.studentIds.includes(u.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (available.length === 0) {
      listEl.innerHTML = `<div class="empty-state"><p>Everyone active is already enrolled.</p></div>`;
      return;
    }
    listEl.innerHTML = available
      .map(
        (u) => `
      <div class="user-row">
        <div class="user-info">
          <div class="u-name">${esc(u.name)}</div>
          <div class="u-email">${esc(u.email)}</div>
        </div>
        <button class="btn btn-primary btn-sm" data-add-student="${u.id}">Add</button>
      </div>`
      )
      .join("");
    listEl.querySelectorAll("[data-add-student]").forEach((btn) => {
      btn.addEventListener("click", () => {
        // A manual add also settles any outstanding request from this same
        // student (the database clears it) — nothing left to approve or deny.
        run(() => DB.enroll(course.id, btn.dataset.addStudent), () => {
          renderMain();
          const fresh = courses.find((x) => x.id === course.id);
          if (fresh) openAddStudentModal(fresh);
        });
      });
    });
  };
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width:480px;">
        <h2 style="font-size:1.15rem;">Add Students</h2>
        <p style="color:var(--muted-foreground);font-size:.85rem;">Everyone active who isn't already enrolled in ${esc(course.title)}.</p>
        <div id="addStudentList" style="margin-top:10px;max-height:360px;overflow-y:auto;"></div>
        <div class="form-actions"><button class="btn btn-ghost" id="addStudentDone">Done</button></div>
      </div>
    </div>`;
  document.getElementById("addStudentDone").addEventListener("click", closeModal);
  renderList();
}

// Open a stored file (course material or a submission) in a new tab.
// Files are private, so each open uses a short-lived signed link that only
// works for someone the database already allows to see the file.
async function openStoredFile(bucket, path, name, btn) {
  if (!path) { toast("There's no file attached."); return; }
  const tab = window.open("", "_blank");
  if (btn) btn.disabled = true;
  try {
    const url = await DB.fileUrl(bucket, path);
    if (tab) tab.location.href = url;
    else location.href = url;
  } catch (e) {
    if (tab) tab.close();
    toast(friendlyError(e));
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Course documents: open right in the page — full screen, phone-friendly —
// with Download and Save as PDF. Used by both students and faculty.
//   PDF        → every page drawn with PDF.js (works on iPhone and Android,
//                where a PDF inside a page often shows only page one or
//                nothing at all)
//   Word .docx → shown as formatted text (Mammoth)
//   images, plain text, audio, video → shown natively
//   older .doc, PowerPoint, .rtf → can't be shown in a browser; Download
// The two reader libraries load only the first time someone needs them.
// ---------------------------------------------------------------------------
const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const MAMMOTH_URL = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js";
const scriptLoads = {};
function loadScriptOnce(src) {
  if (!scriptLoads[src]) {
    scriptLoads[src] = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src; el.async = true;
      el.onload = resolve;
      el.onerror = () => { delete scriptLoads[src]; reject(new Error("The document reader couldn't load. Check your internet connection, or use Download.")); };
      document.head.appendChild(el);
    });
  }
  return scriptLoads[src];
}

function materialKind(m) {
  const mime = (m.mimeType || "").toLowerCase();
  const ext = ((m.storagePath || m.title || "").split(".").pop() || "").toLowerCase();
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "docx" || mime.includes("wordprocessingml")) return "docx";
  if (/heic|heif/.test(mime) || ext === "heic" || ext === "heif") return "heic";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (mime === "text/plain" || ext === "txt") return "text";
  if (mime.startsWith("audio/") || ["mp3", "m4a"].includes(ext)) return "audio";
  if (mime.startsWith("video/") || ext === "mp4") return "video";
  return "other";
}
function pdfFileName(title) {
  return (title || "document").replace(/\.[a-z0-9]{2,5}$/i, "") + ".pdf";
}

function openMaterialViewer(course, material) {
  openFileViewer({ bucket: "materials", path: material.storagePath, title: material.title, subtitle: course.title, mimeType: material.mimeType, size: material.size });
}

// The reader itself, for any stored file: course materials, or a student's
// turned-in work (opened over the grading window, which stays underneath).
function openFileViewer(file) {
  let root = document.getElementById("docViewerRoot");
  if (!root) { root = document.createElement("div"); root.id = "docViewerRoot"; document.body.appendChild(root); }
  const material = { title: file.title || "Document", storagePath: file.path, mimeType: file.mimeType, size: file.size };
  const bucket = file.bucket;
  const hasFile = !!material.storagePath;
  const kind = hasFile ? materialKind(material) : "none";
  const canPdf = ["pdf", "docx", "image", "text"].includes(kind);
  root.innerHTML = `
    <div class="doc-viewer" role="dialog" aria-modal="true" aria-label="${esc(material.title)}">
      <div class="doc-bar">
        <button class="doc-close" id="matClose" aria-label="Close">&larr;</button>
        <div class="doc-title">
          <strong>${esc(material.title)}</strong>
          <span>${esc(file.subtitle || "")}${material.size ? ` · ${(material.size / 1048576).toFixed(1)} MB` : ""}</span>
        </div>
        <div class="doc-actions">
          ${canPdf ? `<button class="btn btn-gold btn-sm" id="matPdf">${kind === "pdf" ? "Download PDF" : "Save as PDF"}</button>` : ""}
          ${kind !== "pdf" ? `<button class="btn btn-ghost btn-sm doc-btn-light" id="matDownload" ${hasFile ? "" : "disabled"}>Download</button>` : ""}
        </div>
      </div>
      <div class="doc-body" id="matPreview">
        ${!hasFile ? `<div class="doc-message"><p>No file is attached to this item.</p></div>` : `<div class="doc-message"><div class="doc-spinner"></div><p>Opening…</p></div>`}
      </div>
      <p id="matStatus" class="doc-status" aria-live="polite"></p>
    </div>`;
  document.body.classList.add("doc-open");
  let closed = false;
  const close = () => { closed = true; document.body.classList.remove("doc-open"); root.innerHTML = ""; const opener = file.returnFocus; if (opener && opener.focus) opener.focus(); };
  document.getElementById("matClose").addEventListener("click", close);
  const onKey = (e) => { if (e.key === "Escape" && document.querySelector(".doc-viewer")) { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
  if (!hasFile) return;

  const box = document.getElementById("matPreview");
  const statusEl = document.getElementById("matStatus");
  const say = (t) => { if (statusEl) statusEl.textContent = t; };
  const fail = (msg) => {
    if (closed || !document.getElementById("matPreview")) return;
    box.innerHTML = `<div class="doc-message">${icon("note")}<p>${esc(msg)}</p>
      <button class="btn btn-primary btn-sm" id="matFailDownload">Download the File</button></div>`;
    document.getElementById("matFailDownload").addEventListener("click", () => downloadOriginal());
  };
  let rendered = null; // what's on screen, for Save as PDF: { kind, text, html, imgEl }

  async function downloadOriginal() {
    say("Preparing download…");
    try {
      const url = await DB.fileUrl(bucket, material.storagePath, material.title);
      const a = document.createElement("a");
      a.href = url; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
      say("Downloading — check your downloads.");
    } catch (e) { say(friendlyError(e)); }
  }

  (async () => {
    let url;
    try { url = await DB.fileUrl(bucket, material.storagePath); }
    catch (e) { fail(friendlyError(e)); return; }
    if (closed) return;
    try {
      if (kind === "pdf") {
        await loadScriptOnce(PDFJS_URL);
        const pdfjs = window.pdfjsLib;
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        const doc = await pdfjs.getDocument({ url }).promise;
        if (closed) return;
        box.innerHTML = `<div class="doc-pages" id="docPages"></div>`;
        const pagesEl = document.getElementById("docPages");
        say(`${doc.numPages} page${doc.numPages === 1 ? "" : "s"}`);
        for (let n = 1; n <= doc.numPages; n++) {
          if (closed) return;
          const page = await doc.getPage(n);
          const width = Math.min(pagesEl.clientWidth || 800, 900);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const vp = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.width = `${width}px`;
          canvas.className = "doc-page";
          canvas.setAttribute("aria-label", `Page ${n}`);
          pagesEl.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
        }
        rendered = { kind };
      } else if (kind === "docx") {
        const [buf] = await Promise.all([fetch(url).then((r) => { if (!r.ok) throw new Error("The file couldn't be opened."); return r.arrayBuffer(); }), loadScriptOnce(MAMMOTH_URL)]);
        const out = await window.mammoth.convertToHtml({ arrayBuffer: buf });
        if (closed) return;
        const html = window.DOMPurify ? DOMPurify.sanitize(out.value) : esc(out.value);
        box.innerHTML = `<article class="doc-paper doc-word">${html || "<p><em>This document is empty.</em></p>"}</article>`;
        rendered = { kind, html };
        say("Shown as text — some layout (columns, text boxes) may look simpler than in Word.");
      } else if (kind === "image" || kind === "heic") {
        box.innerHTML = `<div class="doc-image"><img id="docImg" src="${esc(url)}" alt="${esc(material.title)}" crossorigin="anonymous"></div>`;
        const img = document.getElementById("docImg");
        img.addEventListener("error", () => fail(kind === "heic" ? "This iPhone photo format (HEIC) can't be shown in this browser. Download it to view." : "This image couldn't be shown."));
        rendered = { kind: "image", imgEl: img };
      } else if (kind === "text") {
        const text = await fetch(url).then((r) => { if (!r.ok) throw new Error("The file couldn't be opened."); return r.text(); });
        if (closed) return;
        box.innerHTML = `<article class="doc-paper"><pre class="doc-text">${esc(text)}</pre></article>`;
        rendered = { kind, text };
      } else if (kind === "audio") {
        box.innerHTML = `<div class="doc-message"><audio controls src="${esc(url)}" style="width:100%;max-width:520px;"></audio></div>`;
      } else if (kind === "video") {
        box.innerHTML = `<div class="doc-image"><video controls playsinline src="${esc(url)}" style="max-width:100%;max-height:78vh;"></video></div>`;
      } else {
        fail("This kind of file (older Word, PowerPoint, or rich text) can't be shown in the page. Download it to open it on your device.");
      }
    } catch (e) {
      console.warn("viewer:", e);
      if (kind === "pdf" && !closed) {
        // Last resort: the browser's own PDF viewer.
        box.innerHTML = `<iframe class="doc-frame" src="${esc(url)}" title="${esc(material.title)}"></iframe>`;
        say("If the document doesn't appear, use Download PDF.");
        rendered = { kind };
      } else {
        fail(friendlyError(e));
      }
    }
  })();

  const dl = document.getElementById("matDownload");
  if (dl) dl.addEventListener("click", downloadOriginal);
  const pdfBtn = document.getElementById("matPdf");
  if (pdfBtn) pdfBtn.addEventListener("click", async () => {
    if (kind === "pdf") { downloadOriginal(); return; }
    if (!rendered) { say("One moment — the document is still opening."); return; }
    try {
      if (rendered.kind === "docx") {
        // Word documents: the browser's own "Save as PDF" keeps the formatting.
        const pa = document.getElementById("printArea");
        pa.innerHTML = `<article class="doc-paper doc-word doc-print">${rendered.html}</article>`;
        say("In the print window, choose \"Save as PDF\" as the printer.");
        setTimeout(() => { window.print(); pa.innerHTML = ""; }, 50);
        return;
      }
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "pt", format: "letter" });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 48;
      if (rendered.kind === "image") {
        const img = rendered.imgEl;
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0);
        const r = Math.min((pw - 2 * m) / c.width, (ph - 2 * m) / c.height);
        pdf.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", (pw - c.width * r) / 2, m, c.width * r, c.height * r);
      } else {
        pdf.setFont("helvetica"); pdf.setFontSize(11);
        const lines = pdf.splitTextToSize(rendered.text || "", pw - 2 * m);
        let y = m;
        lines.forEach((line) => { if (y > ph - m) { pdf.addPage(); y = m; } pdf.text(line, m, y); y += 15; });
      }
      pdf.save(pdfFileName(material.title));
      say("Saved as PDF — check your downloads.");
    } catch (e) { console.warn(e); say("Couldn't make a PDF of this file. Use Download instead."); }
  });
}

function renderMaterialsList(c) {
  const wrap = document.getElementById("mgMaterialsList");
  if (!wrap) return;
  wrap.innerHTML = materialsBrowserHtml(c, { manage: true });
  wireMaterialsBrowser(c, wrap, { manage: true });
}

let resourceLibraryQuery = "";
let resourceLibraryCourse = "";
let resourceLibraryShelf = "";        // one shelf (subject) picked, or "" for all
let resourceLibrarySort = "title";    // "title" | "author"
const libOpenShelves = new Set();     // shelves the reader opened
const libShowAll = new Set();         // shelves showing every book, not the first few
const LIB_SHELF_PREVIEW = 8;          // books shown per shelf before "Show all"
const LIB_OPEN_UNDER = 30;            // results this small open every shelf

// Resource Library: the church's Google Drive documents and the physical
// church library, searched together. The 700-odd books are arranged on
// their shelves (subjects): browse a shelf, or search and see the matches
// grouped shelf by shelf, each shelf short until "Show all". For students,
// the course list is just their own classes; faculty see every active course.
const DRIVE_ACCESS_NOTE = "These open in Google Drive in a new tab — anyone with the link can read them, no sign-in needed.";
const LIB_SHELF_BLURB = {
  "Study & Reference": "Bible study helps, handbooks, concordances",
  "Commentaries & Dictionaries": "Verse-by-verse commentaries and Bible dictionaries",
  "Doctrine": "What the Bible teaches, topic by topic",
  "The Church": "The New Testament church and Baptist distinctives",
  "Ordinances": "Baptism and the Lord's Supper",
  "Bible Preservation": "The preserved Word and the Received Text",
  "Bible Versions": "The King James Bible and the modern versions",
  "History": "Church and Baptist history, biographies",
  "Apologetics": "Creation, evolution and defending the faith",
  "False Doctrine": "Cults, false religions and errors to avoid",
  "Evangelism": "Soul winning and missions",
  "Pastoral": "Preaching and the pastor's work",
  "Christian Living": "Growing in grace and walking with God",
  "Devotional": "Daily reading and prayer",
  "Prophecy": "Things to come",
  "Family": "The Christian home, marriage and children",
  "Music": "Hymns and church music",
  "Children's Books": "For young readers",
  "General": "Everything else",
};
// Sort key: titles without a leading "A", "An" or "The"; numbers in order.
function libTitleKey(t) { return String(t || "").replace(/^(the|an|a)\s+/i, "").replace(/^["“'(]+/, "").toLowerCase(); }
function libAuthorKey(a) {
  if (!a) return "~";
  const name = String(a).split(/\s*(?:&|,| and )\s*/)[0].trim();
  // People sort by last name; ministries and publishers by their full name.
  if (/\b(ministr|church|press|genesis|publication|society|institute|baptist|books|bible)\w*/i.test(name)) return name.toLowerCase();
  return lastFirst(name).toLowerCase();
}
const libCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
function libSort(list) {
  const out = list.slice();
  if (resourceLibrarySort === "author") out.sort((x, y) => libCollator.compare(libAuthorKey(x[1]), libAuthorKey(y[1])) || libCollator.compare(libTitleKey(x[0]), libTitleKey(y[0])));
  else out.sort((x, y) => libCollator.compare(libTitleKey(x[0]), libTitleKey(y[0])));
  return out;
}
function libMark(text, q) {
  const t = esc(text || "");
  if (!q) return t;
  const i = String(text || "").toLowerCase().indexOf(q);
  if (i < 0) return t;
  const raw = String(text);
  return `${esc(raw.slice(0, i))}<mark>${esc(raw.slice(i, i + q.length))}</mark>${esc(raw.slice(i + q.length))}`;
}
// The catalog with two copies of one book on one shelf folded into a
// single line, "2 copies": [title, author, shelf, copies].
let libTitlesCache = null;
function libTitles() {
  if (libTitlesCache) return libTitlesCache;
  const copies = new Map();
  physicalLibrary.forEach((b) => {
    const k = `${b[0].trim().toLowerCase()}|${(b[1] || "").trim().toLowerCase()}|${b[2]}`;
    if (copies.has(k)) copies.get(k)[3]++; else copies.set(k, [b[0], b[1], b[2], 1]);
  });
  return (libTitlesCache = [...copies.values()]);
}
// Every shelf name, in the order shown: a course's own shelves first (most
// relevant first), otherwise A–Z.
function libShelfOrder(courseId) {
  const all = [...new Set(physicalLibrary.map((b) => b[2]))];
  const own = courseId ? (COURSE_SUBJECTS[courseId] || []) : [];
  const rest = all.filter((s) => !own.includes(s)).sort((a, b) => libCollator.compare(a, b));
  return [...own.filter((s) => all.includes(s)), ...rest];
}

function renderResourceLibrary(main) {
  const q = resourceLibraryQuery.trim().toLowerCase();
  const courseId = resourceLibraryCourse;
  const shelf = resourceLibraryShelf;
  const hasSearch = q.length > 0 || courseId !== "" || shelf !== "";

  // --- what matches -------------------------------------------------------
  const DRIVE = "__drive";
  const onDrive = shelf === DRIVE;
  const digitalMatches = digitalLibrary.filter((d) => {
    const courseOk = !courseId || d.courseIds.includes(courseId);
    const kwOk = !q || [d.title, d.author, d.topic].some((t) => t && t.toLowerCase().includes(q));
    return courseOk && kwOk;
  });
  const digitalResults = !hasSearch || (shelf && !onDrive) ? [] : digitalMatches;
  // Church Drive folders: a keyword matches a topic folder's name or the
  // big folder it sits in; a class brings up the folders tagged for it.
  const folderMatches = [];
  driveFolders.forEach((f) => f.topics.forEach((t) => {
    const courseOk = !courseId || (t.courseIds || []).includes(courseId);
    const kwOk = !q || t.name.toLowerCase().includes(q) || f.name.toLowerCase().includes(q) || (f.blurb || "").toLowerCase().includes(q);
    if (courseOk && kwOk) folderMatches.push({ folder: f, topic: t });
  }));
  // A keyword that names a whole big folder ("audio", "powerpoint") lists the folder itself too.
  const bigFolderMatches = q && !courseId ? driveFolders.filter((f) => f.name.toLowerCase().includes(q)) : [];
  const folderResults = !hasSearch || (shelf && !onDrive) ? [] : folderMatches;
  const driveCount = digitalMatches.length + folderMatches.length;
  let pool = libTitles();
  if (courseId) {
    const subs = COURSE_SUBJECTS[courseId] || [];
    pool = pool.filter((b) => subs.includes(b[2]));
  }
  // A keyword matches a title, an author, or a whole shelf by name.
  if (q) pool = pool.filter(([t, a, s]) => t.toLowerCase().includes(q) || (a && a.toLowerCase().includes(q)) || s.toLowerCase().includes(q));
  const beforeShelf = pool;
  if (shelf) pool = onDrive ? [] : pool.filter((b) => b[2] === shelf);
  const physicalTotal = hasSearch ? pool.length : 0;

  // Shelves among the matches (before a shelf is picked, so the chips stay).
  const shelfCounts = {};
  beforeShelf.forEach((b) => { shelfCounts[b[2]] = (shelfCounts[b[2]] || 0) + 1; });
  const order = libShelfOrder(courseId);
  const chipShelves = order.filter((s) => shelfCounts[s]);
  const groups = order.filter((s) => pool.some((b) => b[2] === s))
    .map((s) => ({ name: s, books: libSort(pool.filter((b) => b[2] === s)) }));
  const openAllByDefault = physicalTotal <= LIB_OPEN_UNDER || groups.length === 1;

  const eligibleCourses = courses
    .filter((c) => !c.archived && (role !== "student" || c.studentIds.includes(currentStudentId)))
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title));
  const courseOptions = eligibleCourses
    .map((c) => `<option value="${c.id}" ${c.id === courseId ? "selected" : ""}>${esc(c.title)}</option>`)
    .join("");
  const courseLabel = role === "student" ? "One of your classes" : "Course";
  const courseEmptyOption = role === "student" ? "All my classes" : "All courses";

  // --- pieces -------------------------------------------------------------
  const copiesTag = (n) => n > 1 ? ` <span class="lib-copies">${n} copies</span>` : "";
  const bookRow = ([t, a, , n]) => `<li class="lib-book">
      <span class="lib-title">${libMark(t, q)}${copiesTag(n)}</span>
      ${a ? `<span class="lib-author">${libMark(a, q)}</span>` : ""}
    </li>`;
  const shelfBody = (g) => {
    const all = libShowAll.has(g.name) || g.books.length <= LIB_SHELF_PREVIEW + 2;
    const shown = all ? g.books : g.books.slice(0, LIB_SHELF_PREVIEW);
    let html;
    if (resourceLibrarySort === "author") {
      // Under each author's name, that author's books.
      const byAuthor = [];
      shown.forEach((b) => {
        const last = byAuthor[byAuthor.length - 1];
        if (last && last.author === (b[1] || "")) last.books.push(b);
        else byAuthor.push({ author: b[1] || "", books: [b] });
      });
      html = byAuthor.map((x) => `<li class="lib-author-head">${x.author ? libMark(x.author, q) : "Author not listed"}</li>
        ${x.books.map(([t, , , n]) => `<li class="lib-book"><span class="lib-title">${libMark(t, q)}${copiesTag(n)}</span></li>`).join("")}`).join("");
    } else {
      html = shown.map(bookRow).join("");
    }
    return `<ul class="lib-books">${html}</ul>
      ${all ? "" : `<button type="button" class="link-btn lib-more" data-lib-more="${esc(g.name)}">Show all ${g.books.length} on this shelf</button>`}`;
  };
  const folderRow = (f, t) => `<li>
      <a class="lib-folder" href="${DRIVE_ROOT(t ? t.id : f.id)}" target="_blank" rel="noopener">
        <span class="lib-folder-icon" aria-hidden="true">${icon("library")}</span>
        <span class="lib-folder-text"><strong>${libMark(t ? t.name : f.name, q)}</strong><small>${t ? `in ${libMark(f.name, q)}` : esc(f.blurb)}</small></span>
        <span class="lib-open">Open ↗</span>
      </a>
    </li>`;
  const browseHtml = () => {
    const counts = {};
    libTitles().forEach((b) => { counts[b[2]] = (counts[b[2]] || 0) + 1; });
    return `
    <div class="section-title"><h2>Browse the shelves</h2><span class="pill pill-navy">${libTitles().length} books</span></div>
    <div class="lib-shelves">
      ${libShelfOrder("").map((s) => `<button type="button" class="lib-shelf-card" data-lib-shelf="${esc(s)}">
        <strong>${esc(s)}</strong>
        <small>${esc(LIB_SHELF_BLURB[s] || "")}</small>
        <span class="lib-shelf-count">${counts[s]} book${counts[s] === 1 ? "" : "s"}</span>
      </button>`).join("")}
    </div>
    <p class="lib-policy">${esc(LIBRARY_CHECKOUT_POLICY)}</p>
    <div class="section-title"><h2>On the church Drive</h2><span class="pill pill-navy">${driveFolders.length} folders</span></div>
    <p class="lib-policy">${esc(DRIVE_ACCESS_NOTE)}</p>
    <div class="lib-drive-groups">
      ${driveFolders.map((f) => `<div class="lib-drive-group">
        <a class="lib-drive-head" href="${DRIVE_ROOT(f.id)}" target="_blank" rel="noopener">
          <strong>${esc(f.name.replace(/^TNBC /, ""))}</strong>
          <small>${esc(f.blurb)}</small>
          <span class="lib-open">Open in Drive ↗</span>
        </a>
        <div class="lib-topic-links">${f.topics.map((t) => `<a href="${DRIVE_ROOT(t.id)}" target="_blank" rel="noopener">${esc(t.name)}</a>`).join("")}</div>
      </div>`).join("")}
      <button type="button" class="lib-drive-group lib-drive-picked" data-lib-shelf="__drive">
        <strong>Selected documents</strong>
        <small>Class notes, lessons and textbooks picked for the Institute's courses</small>
        <span class="lib-open">${digitalLibrary.length} documents →</span>
      </button>
    </div>`;
  };

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">Resources</div>
      <h1>Resource Library</h1>
      <p>Browse the church library shelf by shelf, search by title, author or topic, or pick a class to see the books and Drive documents that go with it.</p>
    </div>
    ${lectureArchiveEntryHtml()}
    <div class="card lib-search">
      <div class="lib-search-row">
        <div class="lib-field lib-field-grow">
          <label for="resSearchInput">Title, author or topic</label>
          <input type="text" id="resSearchInput" enterkeyhint="search" autocomplete="off" placeholder="e.g. Westcott and Hort, Spurgeon, preaching…" value="${esc(resourceLibraryQuery)}">
        </div>
        <div class="lib-field">
          <label for="resCourseSelect">${esc(courseLabel)}</label>
          <select id="resCourseSelect">
            <option value="">${esc(courseEmptyOption)}</option>
            ${courseOptions}
          </select>
        </div>
      </div>
      ${eligibleCourses.length === 0 && role === "student" ? `<p class="field-hint">You're not enrolled in any active classes yet, so the class list is empty — searching still works.</p>` : ""}
      ${hasSearch ? `<div class="lib-chips" role="group" aria-label="Shelves">
        <button type="button" class="lib-chip ${shelf ? "" : "active"}" data-lib-chip="">All <span>${beforeShelf.length + driveCount}</span></button>
        ${driveCount ? `<button type="button" class="lib-chip lib-chip-drive ${onDrive ? "active" : ""}" data-lib-chip="${DRIVE}">Church Drive <span>${driveCount}</span></button>` : ""}
        ${chipShelves.map((s) => `<button type="button" class="lib-chip ${s === shelf ? "active" : ""}" data-lib-chip="${esc(s)}">${esc(s)} <span>${shelfCounts[s]}</span></button>`).join("")}
        ${shelf && !onDrive && !chipShelves.includes(shelf) ? `<button type="button" class="lib-chip active" data-lib-chip="${esc(shelf)}">${esc(shelf)} <span>0</span></button>` : ""}
      </div>
      <div class="lib-tools">
        <span class="lib-sum">${onDrive ? "" : `${physicalTotal} book${physicalTotal === 1 ? "" : "s"}`}${onDrive ? `${folderResults.length} Drive folder${folderResults.length === 1 ? "" : "s"} · ${digitalResults.length} document${digitalResults.length === 1 ? "" : "s"}` : driveCount ? ` · ${driveCount} on the church Drive` : ""}</span>
        <label class="lib-sort">Sort by
          <select id="resSort"><option value="title" ${resourceLibrarySort === "title" ? "selected" : ""}>Title</option><option value="author" ${resourceLibrarySort === "author" ? "selected" : ""}>Author</option></select>
        </label>
        ${groups.length > 1 ? `<button type="button" class="link-btn" id="libToggleAll">${groups.every((g) => libOpenShelves.has(g.name)) || openAllByDefault ? "Close all shelves" : "Open all shelves"}</button>` : ""}
        <button type="button" class="link-btn" id="libClear">Start over</button>
      </div>` : ""}
    </div>
    ${!hasSearch ? browseHtml() : `
    ${folderResults.length || (bigFolderMatches.length && (!shelf || onDrive)) ? `
    <div class="section-title"><h2>Church Drive folders</h2><span class="pill pill-navy">${folderResults.length + bigFolderMatches.length}</span></div>
    <ul class="lib-folders">
      ${bigFolderMatches.map((f) => folderRow(f, null)).join("")}
      ${folderResults.map(({ folder, topic }) => folderRow(folder, topic)).join("")}
    </ul>
    <p class="lib-policy">${esc(DRIVE_ACCESS_NOTE)}</p>` : ""}
    ${digitalResults.length ? `
    <div class="section-title"><h2>${folderResults.length ? "Selected Drive documents" : "Google Drive documents"}</h2><span class="pill pill-navy">${digitalResults.length}</span></div>
    <ul class="materials-list lib-drive">
      ${digitalResults.slice().sort((a, b) => libCollator.compare(libTitleKey(a.title), libTitleKey(b.title))).map((d) => `
        <li>
          <div>
            <div style="font-weight:600;">${libMark(d.title, q)}</div>
            <p style="margin:2px 0 0;color:var(--muted-foreground);font-size:.85rem;">${d.author ? libMark(d.author, q) + " — " : ""}${esc(d.topic)}</p>
          </div>
          <a class="btn btn-ghost btn-sm" href="${esc(d.url)}" target="_blank" rel="noopener">Open</a>
        </li>`).join("")}
    </ul>` : ""}
    ${onDrive ? (digitalResults.length || folderResults.length ? "" : `<p class="lib-none">Nothing on the church Drive matches “${esc(resourceLibraryQuery.trim())}”.</p>`) : `
    <div class="section-title"><h2>${shelf ? esc(shelf) : "Church library"}</h2><span class="pill pill-navy">${physicalTotal} book${physicalTotal === 1 ? "" : "s"}</span></div>
    <p class="lib-policy">${esc(LIBRARY_CHECKOUT_POLICY)}</p>
    ${physicalTotal === 0
      ? `<p class="lib-none">No books match${q ? ` “${esc(resourceLibraryQuery.trim())}”` : ""}${shelf ? ` on the ${esc(shelf)} shelf` : ""}.${shelf || courseId ? ` <a href="#" id="libWiden">Search every shelf</a>` : ""}</p>`
      : groups.map((g) => `
      <details class="docs-group lib-shelf" data-shelf="${esc(g.name)}" ${openAllByDefault || libOpenShelves.has(g.name) ? "open" : ""}>
        <summary><span class="docs-group-name">${esc(g.name)}${LIB_SHELF_BLURB[g.name] ? `<small>${esc(LIB_SHELF_BLURB[g.name])}</small>` : ""}</span><span class="docs-count">${g.books.length}</span></summary>
        ${shelfBody(g)}
      </details>`).join("")}`}
    `}
  `;

  // --- wiring -------------------------------------------------------------
  const redraw = () => renderResourceLibrary(main);
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  wireLectureArchiveEntry();
  const searchInput = document.getElementById("resSearchInput");
  searchInput.addEventListener("input", (e) => { resourceLibraryQuery = e.target.value; libShowAll.clear(); redraw(); });
  // Phones: don't pop the keyboard up on its own.
  if ((q || !hasSearch) && !(window.matchMedia && matchMedia("(pointer: coarse)").matches && !q)) {
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }
  document.getElementById("resCourseSelect").addEventListener("change", (e) => {
    resourceLibraryCourse = e.target.value; resourceLibraryShelf = ""; libOpenShelves.clear(); libShowAll.clear(); redraw();
  });
  main.querySelectorAll("[data-lib-shelf]").forEach((b) => b.addEventListener("click", () => {
    resourceLibraryShelf = b.dataset.libShelf; libShowAll.clear(); redraw(); window.scrollTo(0, 0);
  }));
  main.querySelectorAll("[data-lib-chip]").forEach((b) => b.addEventListener("click", () => {
    resourceLibraryShelf = b.dataset.libChip; libShowAll.clear(); redraw();
  }));
  const sortSel = document.getElementById("resSort");
  if (sortSel) sortSel.addEventListener("change", () => { resourceLibrarySort = sortSel.value; redraw(); });
  main.querySelectorAll(".lib-shelf").forEach((d) => d.addEventListener("toggle", () => {
    if (d.open) libOpenShelves.add(d.dataset.shelf); else libOpenShelves.delete(d.dataset.shelf);
    const t = document.getElementById("libToggleAll");
    if (t) t.textContent = [...main.querySelectorAll(".lib-shelf")].every((x) => x.open) ? "Close all shelves" : "Open all shelves";
  }));
  const tog = document.getElementById("libToggleAll");
  if (tog) tog.addEventListener("click", () => {
    const shelves = [...main.querySelectorAll(".lib-shelf")];
    const openAll = !shelves.every((x) => x.open);
    shelves.forEach((d) => { d.open = openAll; });
  });
  main.querySelectorAll("[data-lib-more]").forEach((b) => b.addEventListener("click", () => {
    libShowAll.add(b.dataset.libMore); libOpenShelves.add(b.dataset.libMore); redraw();
  }));
  const clear = document.getElementById("libClear");
  if (clear) clear.addEventListener("click", () => {
    resourceLibraryQuery = ""; resourceLibraryCourse = ""; resourceLibraryShelf = ""; libOpenShelves.clear(); libShowAll.clear(); redraw();
  });
  const widen = document.getElementById("libWiden");
  if (widen) widen.addEventListener("click", (e) => { e.preventDefault(); resourceLibraryShelf = ""; resourceLibraryCourse = ""; redraw(); });
}

function renderSettings(main) {
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${staffEyebrow()}</div>
      <h1>Settings</h1>
    </div>
    <div class="section-title"><h2>${isAdmin() ? "Users &amp; Levels" : "Users"}</h2>${isAdmin() ? `<span class="pill pill-navy" title="Admins">${countSuperAdmins()}/${MAX_SUPER_ADMINS} Admins</span>` : ""}</div>
    <div class="card">
      <div class="card-row">
        <div class="subtabs" id="userTabs">
          <button data-tab="pending">Waiting for Approval${pendingSignups().length ? ` (${pendingSignups().length})` : ""}</button>
          <button data-tab="active">Active</button>
          <button data-tab="inactive">Inactive</button>
        </div>
        <select id="sortSelect" style="width:auto;">
          <option value="name">Sort: Name (A–Z)</option>
          <option value="recent">Sort: Recently added</option>
          <option value="role">Sort: Role</option>
        </select>
      </div>
      <div id="userListWrap" style="margin-top:6px;"></div>
    </div>
    <p style="color:var(--muted-foreground);font-size:.85rem;">New sign-ups wait under <strong>Waiting for Approval</strong> until Faculty or an Admin approves them (Admins get a bell notification). Approved accounts start as students.
      <strong>Faculty</strong> create and run courses — schedules, rosters, assignments, materials, grading. <strong>Admins</strong> can also change anyone's level, turn accounts off or delete them, and permanently delete courses (up to ${MAX_SUPER_ADMINS} Admins).${isAdmin() ? "" : " Ask an Admin to change someone's level."}</p>
    ${isAdmin() ? `
    <div class="section-title"><h2>Backups &amp; Behind the Scenes</h2></div>
    <div class="card" id="backupsCard"></div>` : ""}
  `;
  renderBackupsCard();
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });

  document.getElementById("userTabs").querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => { userTab = b.dataset.tab; renderUserList(); });
  });
  document.getElementById("sortSelect").value = userSort;
  document.getElementById("sortSelect").addEventListener("change", (e) => { userSort = e.target.value; renderUserList(); });

  renderUserList();
}

// Sign-ups waiting for approval: verified ones first, newest first.
function pendingSignups() {
  return users.filter((u) => u.status === "pending")
    .sort((a, b) => (b.emailVerified - a.emailVerified) || b.createdAt.localeCompare(a.createdAt));
}

function sortedUsers(list) {
  const copy = [...list];
  if (userSort === "name") copy.sort((a, b) => a.name.localeCompare(b.name));
  else if (userSort === "recent") copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (userSort === "role") copy.sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  return copy;
}

function renderUserList() {
  document.getElementById("userTabs").querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === userTab);
  });

  const wrap = document.getElementById("userListWrap");
  if (userTab === "pending") {
    const waiting = pendingSignups();
    wrap.innerHTML = waiting.length === 0 ? `<div class="empty-state"><p>No sign-ups are waiting.</p></div>` : waiting.map((u) => `
      <div class="user-row" data-user="${u.id}">
        <div class="user-info user-info-avatar">
          ${avatarHtml(u, 40)}
          <div>
            <div class="u-name">${esc(u.name)}</div>
            <div class="u-email">${esc(u.email)}</div>
            <div class="field-hint" style="margin:2px 0 0;">Signed up ${fmtDay(u.createdAt, { month: "short", day: "numeric", year: "numeric" })} · ${u.emailVerified ? `<span style="color:var(--success);font-weight:600;">Email confirmed</span>` : "Hasn't confirmed their email yet"}</div>
          </div>
        </div>
        <div class="user-actions">
          <button class="btn btn-gold btn-sm" data-approve="${u.id}">Approve</button>
          <button class="btn btn-danger btn-sm" data-delete="${u.id}">Decline</button>
        </div>
      </div>`).join("");
    wrap.querySelectorAll("[data-approve]").forEach((btn) => btn.addEventListener("click", () => {
      const u = users.find((x) => x.id === btn.dataset.approve);
      run(() => DB.updateProfile(u.id, { status: "active" }), () => renderSettings(document.getElementById("main")), { success: `${u.name} is approved and can now sign in.` });
    }));
    wrap.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => openDeleteUserModal(btn.dataset.delete)));
    return;
  }
  const list = sortedUsers(users.filter((u) => u.status === userTab));

  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><p>No ${userTab} users.</p></div>`;
    return;
  }

  wrap.innerHTML = list
    .map(
      (u) => `
    <div class="user-row" data-user="${u.id}">
      <div class="user-info user-info-avatar">
        <button class="avatar-btn" data-person="${u.id}" aria-label="View ${esc(u.name)}'s profile">${avatarHtml(u, 40)}</button>
        <div>
        <div class="u-name"><button class="name-link" data-person="${u.id}">${esc(u.name)}</button></div>
        <div class="u-email">${esc(u.email)}</div>
        </div>
      </div>
      <div class="user-actions">
        ${
          !isAdmin()
            ? levelPill(u)
            : userTab === "active"
            ? `<div class="role-toggle" data-role-toggle="${u.id}" role="group" aria-label="Level for ${esc(u.name)}">
                <button data-level="student" class="${userLevel(u) === "student" ? "active" : ""}">Student</button>
                <button data-level="faculty" class="${userLevel(u) === "faculty" ? "active" : ""}">Faculty</button>
                <button data-level="admin" class="${userLevel(u) === "admin" ? "active" : ""}" ${userLevel(u) !== "admin" && countSuperAdmins() >= MAX_SUPER_ADMINS ? `disabled title="There are already ${MAX_SUPER_ADMINS} Admins"` : ""}>Admin</button>
              </div>
              <button class="btn btn-ghost btn-sm" data-inactive="${u.id}">Make Inactive</button>`
            : `${levelPill(u)}
              <button class="btn btn-ghost btn-sm" data-reactivate="${u.id}">Reactivate</button>`
        }
        ${isAdmin() ? `<button class="btn btn-danger btn-sm" data-delete="${u.id}">Delete</button>` : ""}
      </div>
    </div>`
    )
    .join("");

  wrap.querySelectorAll("[data-role-toggle]").forEach((toggle) => {
    toggle.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const u = users.find((x) => x.id === toggle.dataset.roleToggle);
        const level = btn.dataset.level;
        if (userLevel(u) === level) return;
        const self = currentUser && u.id === currentUser.id;
        if (self && !(await askConfirm(`Change your own level to ${LEVEL_LABEL[level]}? You'll lose Admin access${level === "student" ? ", including faculty pages" : ""} and can't undo this yourself.`))) return;
        if (!self && level === "admin" && !(await askConfirm(`Make ${u.name} an Admin? Admins can change anyone's level, turn off or delete accounts, and delete courses.`))) return;
        if (!self && level === "faculty" && userLevel(u) === "student" && !(await askConfirm(`Make ${u.name} Faculty? Faculty can create and run courses, see the student list, and approve new sign-ups.`))) return;
        const patch = level === "admin" ? { role: "faculty", super_admin: true } : { role: level, super_admin: false };
        run(() => DB.updateProfile(u.id, patch), () => {
          // Changing your own level takes effect right away.
          if (self) {
            currentUser.role = patch.role;
            currentUser.superAdmin = patch.super_admin;
            role = patch.role;
            currentStudentId = u.id;
            if (patch.role === "student") view = "home";
            renderAccountPill();
            renderNav();
            renderMain();
          } else {
            renderUserList();
          }
        }, { success: `${u.name} is now ${level === "admin" ? "an Admin" : level === "faculty" ? "Faculty" : "a Student"}.` });
      });
    });
  });

  wrap.querySelectorAll("[data-inactive]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = users.find((x) => x.id === btn.dataset.inactive);
      const self = currentUser && u.id === currentUser.id;
      if (self && !(await askConfirm("Make your own account inactive? You'll be signed out and won't be able to sign back in until another Admin reactivates you."))) return;
      run(() => DB.updateProfile(u.id, { status: "inactive" }), () => {
        // Deactivating your own account signs you out immediately.
        if (self) { signOut("Your account is now inactive."); return; }
        renderUserList();
      }, { success: self ? undefined : `${u.name} is now inactive.` });
    });
  });

  wrap.querySelectorAll("[data-reactivate]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = users.find((x) => x.id === btn.dataset.reactivate);
      run(() => DB.updateProfile(u.id, { status: "active" }), () => renderUserList(), { success: `${u.name} is active again.` });
    });
  });

  wrap.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => openDeleteUserModal(btn.dataset.delete));
  });
  wirePersonLinks(wrap);
}

function openDeleteUserModal(userId) {
  const u = users.find((x) => x.id === userId);
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2 style="font-size:1.15rem;">Delete ${esc(u.name)}?</h2>
        <div class="warning-box">
          ${icon("warning")}
          <p><strong>This cannot be undone.</strong> Deleting this user permanently removes their account and everything associated with it — enrollments, submissions, progress, and messages.</p>
        </div>
        <div class="form-actions">
          <button class="btn btn-danger" id="confirmDelete">Delete Permanently</button>
          <button class="btn btn-ghost" id="cancelDelete">Cancel</button>
        </div>
      </div>
    </div>`;
  document.getElementById("cancelDelete").addEventListener("click", closeModal);
  document.getElementById("confirmDelete").addEventListener("click", () => {
    const deletingSelf = currentUser && userId === currentUser.id;
    // The database removes the account and everything tied to it —
    // enrollments, submissions, grades, messages, requests, highlights.
    run(async () => { await DB.deleteUser(userId); closeModal(); }, () => {
      if (deletingSelf) { signOut("Your account was deleted."); return; }
      renderUserList();
    }, { success: deletingSelf ? undefined : `${u.name}'s account was deleted.` });
  });
}

// ---------------------------------------------------------------------------
// Profiles: every person's own details and photo.
//
// Who sees what (enforced by the database, not just this page):
//   - You, and Institute faculty: everything on your profile.
//   - Classmates and other students: your name, photo, home church, and
//     "About me" — never your phone, address, or email.
// Faculty can also open anyone's profile from Settings → Users & Roles and
// fill it in for them (handy for someone who'd rather not do it online).
// ---------------------------------------------------------------------------
let profileUserId = null; // null = my own profile

// Photo + bold name, clickable to open the person's card.
function personChip(userId, size = 32) {
  const u = users.find((x) => x.id === userId);
  const name = userName(userId);
  if (!u) return `${avatarHtml({ name }, size)}<strong>${esc(name)}</strong>`;
  return `<button class="person-chip" data-person="${u.id}" aria-label="View ${esc(name)}'s profile">${avatarHtml(u, size)}<strong>${esc(name)}</strong></button>`;
}

// A gentle one-line invitation on the dashboard until someone has added
// anything to their profile.
function profileNudge() {
  const me = users.find((u) => u.id === currentUser.id);
  if (!profileIsSparse(me)) return "";
  return `
    <div class="profile-nudge">
      ${avatarHtml(me, 40)}
      <div><strong>Finish setting up your profile.</strong> Add a photo and a few details so your instructors and classmates know who you are.</div>
      <button class="btn btn-gold btn-sm" id="profileNudgeBtn">Set Up Profile</button>
    </div>`;
}
function wireProfileNudge() {
  const b = document.getElementById("profileNudgeBtn");
  if (b) b.addEventListener("click", () => openProfile());
}

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// A round photo, or the person's initials on navy when there's no photo.
function avatarHtml(u, size = 36, extraClass = "") {
  const name = (u && u.name) || "";
  const style = `width:${size}px;height:${size}px;font-size:${Math.max(11, Math.round(size * 0.38))}px;`;
  if (u && u.avatarUrl) {
    return `<span class="avatar ${extraClass}" style="${style}"><img src="${esc(u.avatarUrl)}" alt="" loading="lazy" decoding="async"></span>`;
  }
  return `<span class="avatar avatar-initials ${extraClass}" style="${style}" aria-hidden="true">${esc(initials(name))}</span>`;
}

function profileIsSparse(u) {
  return !!u && !u.avatarPath && !u.phone && !u.homeChurch && !u.bio;
}

function openProfile(userId = null) {
  closeModal();
  profileUserId = userId && userId !== currentUser.id ? userId : null;
  view = "profile";
  activeCourseId = null;
  renderNav();
  renderMain();
}

function renderProfile(main) {
  const editingOther = !!profileUserId && role === "faculty";
  const u = users.find((x) => x.id === (editingOther ? profileUserId : currentUser.id));
  if (!u) { profileUserId = null; view = "home"; renderNav(); renderMain(); return; }
  const isSelf = u.id === currentUser.id;
  const backLabel = editingOther ? "Back to Settings" : "Back to Dashboard";

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; ${backLabel}</button>
    <div class="page-header">
      <div class="eyebrow">${editingOther ? staffEyebrow() + " · Editing a profile" : "My Profile"}</div>
      <h1>${editingOther ? esc(u.name) : "Your Profile"}</h1>
    </div>

    <div class="card profile-hero">
      <div class="profile-photo-col">
        ${avatarHtml(u, 132, "avatar-xl")}
        <input type="file" id="avatarInput" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*" hidden>
        <div class="profile-photo-actions">
          <button class="btn btn-gold btn-sm" id="choosePhotoBtn">${u.avatarPath ? "Change Photo" : "Add a Photo"}</button>
          ${u.avatarPath ? `<button class="btn btn-ghost btn-sm" id="removePhotoBtn">Remove</button>` : ""}
        </div>
      </div>
      <div class="profile-id-col">
        <div class="profile-name">${esc(u.name)}</div>
        <div class="profile-pills">
          ${levelPill(u)}
        </div>
        <div class="profile-email">${icon("mail")}<span>${esc(u.email)}</span></div>
        <p class="field-hint" style="margin:6px 0 0;">${isSelf ? "Your email is how you sign in, so it can't be changed here." : "Their email is how they sign in, so it can't be changed here."}</p>
        ${u.homeChurch || u.bio ? "" : `<p class="profile-verse">“Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.” <span>— 2 Timothy 2:15</span></p>`}
      </div>
    </div>

    <form id="profileForm" novalidate>
      <div class="section-title"><h2>About ${isSelf ? "You" : esc(u.name.split(" ")[0] || "Them")}</h2></div>
      <div class="card">
        <label for="pfName">Full name</label>
        <input type="text" id="pfName" maxlength="120" autocomplete="name" value="${esc(u.name)}" required>
        <label for="pfChurch">Home church</label>
        <input type="text" id="pfChurch" maxlength="120" placeholder="e.g. True North Baptist Church, Moose Creek" value="${esc(u.homeChurch)}">
        <label for="pfBio">About me</label>
        <p class="field-hint">A few words for your classmates and instructors — your testimony, your family, how you serve in your church, or what you hope to learn.</p>
        <textarea id="pfBio" maxlength="1000" rows="5">${esc(u.bio)}</textarea>
        <div class="char-count"><span id="pfBioCount">${u.bio.length}</span>/1000</div>
      </div>

      <div class="section-title"><h2>Contact Information</h2></div>
      <div class="card">
        <div class="privacy-note">${icon("lock")}<span>Only ${isSelf ? "you" : "this person"} and Institute faculty can see the phone number and address. Classmates see the name, photo, home church, and About me.</span></div>
        <label for="pfPhone">Phone</label>
        <input type="tel" id="pfPhone" maxlength="40" autocomplete="tel" placeholder="(907) 555-0123" value="${esc(u.phone)}">
        <label for="pfAddress">Mailing address</label>
        <input type="text" id="pfAddress" maxlength="200" autocomplete="street-address" placeholder="Street or PO Box" value="${esc(u.addressLine)}">
        <div class="form-row form-row-3">
          <div><label for="pfCity">City</label><input type="text" id="pfCity" maxlength="80" autocomplete="address-level2" value="${esc(u.city)}"></div>
          <div><label for="pfState">State</label><input type="text" id="pfState" maxlength="40" autocomplete="address-level1" placeholder="AK" value="${esc(u.state)}"></div>
          <div><label for="pfZip">ZIP</label><input type="text" id="pfZip" maxlength="20" autocomplete="postal-code" inputmode="numeric" value="${esc(u.postalCode)}"></div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="saveProfileBtn">Save Profile</button>
        </div>
      </div>
    </form>
    ${isSelf ? `
    <div class="section-title" id="notifSettings"><h2>Notifications</h2></div>
    <div class="card" id="reminderCard"></div>` : ""}
  `;
  renderReminderCard();

  document.getElementById("backLink").addEventListener("click", () => {
    const back = editingOther ? "settings" : "home";
    profileUserId = null;
    view = back;
    renderNav();
    renderMain();
  });

  const bio = document.getElementById("pfBio");
  bio.addEventListener("input", () => { document.getElementById("pfBioCount").textContent = bio.value.length; });

  document.getElementById("profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = (id) => document.getElementById(id).value.trim();
    const fields = {
      name: val("pfName"), homeChurch: val("pfChurch"), bio: document.getElementById("pfBio").value.trim(),
      phone: val("pfPhone"), addressLine: val("pfAddress"), city: val("pfCity"), state: val("pfState"), postalCode: val("pfZip"),
    };
    if (!fields.name) { toast("Please enter a name."); document.getElementById("pfName").focus(); return; }
    run(() => DB.saveProfile(u.id, fields), () => { renderAccountPill(); renderMain(); }, { success: "Profile saved." });
  });

  const input = document.getElementById("avatarInput");
  document.getElementById("choosePhotoBtn").addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    input.value = "";
    if (file) openPhotoCropper(u, file);
  });
  const removeBtn = document.getElementById("removePhotoBtn");
  if (removeBtn) {
    removeBtn.addEventListener("click", async () => {
      if (!(await askConfirm(isSelf ? "Remove your profile photo?" : `Remove ${u.name}'s profile photo?`))) return;
      run(() => DB.removeAvatar(u.id, u.avatarPath), () => { renderAccountPill(); renderMain(); }, { success: "Photo removed." });
    });
  }
}

// Phone photos are rarely square, so before saving, the person drags and
// zooms the photo inside a round frame. What's inside the frame is saved as
// a small 480×480 JPEG — sharp on any screen, and quick on slow internet.
const AVATAR_OUTPUT_PX = 480;
const CROP_FRAME_PX = 260;

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}

async function openPhotoCropper(u, file) {
  if (!/^image\//.test(file.type || "") && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) {
    toast("Please choose a photo (JPEG or PNG).");
    return;
  }
  if (file.size > 30 * 1024 * 1024) { toast("That photo is over 30 MB. Please choose a smaller one."); return; }
  let loaded;
  try {
    loaded = await loadImageFile(file);
  } catch (e) {
    toast("This browser can't open that photo format. Please choose a JPEG or PNG photo instead.");
    return;
  }
  const { img, url } = loaded;
  const W = img.naturalWidth, H = img.naturalHeight;
  const minScale = CROP_FRAME_PX / Math.min(W, H); // the photo always fills the frame
  let scale = minScale, zoom = 1;
  let x = (CROP_FRAME_PX - W * scale) / 2, y = (CROP_FRAME_PX - H * scale) / 2;

  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cropTitle" style="max-width:420px;">
        <h2 id="cropTitle" style="font-size:1.15rem;">Position Your Photo</h2>
        <p class="field-hint" style="margin:0 0 14px;">Drag to move it, and use the slider to zoom in.</p>
        <div class="crop-frame" id="cropFrame" style="width:${CROP_FRAME_PX}px;height:${CROP_FRAME_PX}px;">
          <img id="cropImg" src="${url}" alt="Your photo" draggable="false">
          <div class="crop-ring" aria-hidden="true"></div>
        </div>
        <label for="cropZoom" style="margin-top:16px;">Zoom</label>
        <input type="range" id="cropZoom" min="1" max="4" step="0.01" value="1" class="crop-zoom">
        <div class="form-actions">
          <button class="btn btn-gold" id="cropSave">Save Photo</button>
          <button class="btn btn-ghost" id="cropCancel">Cancel</button>
        </div>
      </div>
    </div>`;

  const frame = document.getElementById("cropFrame");
  const el = document.getElementById("cropImg");
  const clamp = () => {
    const w = W * scale, h = H * scale;
    x = Math.min(0, Math.max(CROP_FRAME_PX - w, x));
    y = Math.min(0, Math.max(CROP_FRAME_PX - h, y));
  };
  const paint = () => {
    clamp();
    el.style.width = `${W * scale}px`;
    el.style.height = `${H * scale}px`;
    el.style.transform = `translate(${x}px, ${y}px)`;
  };
  paint();

  let drag = null;
  frame.addEventListener("pointerdown", (e) => {
    drag = { px: e.clientX, py: e.clientY, x, y };
    frame.setPointerCapture(e.pointerId);
    frame.classList.add("dragging");
  });
  frame.addEventListener("pointermove", (e) => {
    if (!drag) return;
    x = drag.x + (e.clientX - drag.px);
    y = drag.y + (e.clientY - drag.py);
    paint();
  });
  const endDrag = () => { drag = null; frame.classList.remove("dragging"); };
  frame.addEventListener("pointerup", endDrag);
  frame.addEventListener("pointercancel", endDrag);

  // Zoom around the centre of the frame, so what you're looking at stays put.
  const setZoom = (z) => {
    const c = CROP_FRAME_PX / 2;
    const imgCx = (c - x) / scale, imgCy = (c - y) / scale;
    zoom = z;
    scale = minScale * zoom;
    x = c - imgCx * scale;
    y = c - imgCy * scale;
    paint();
  };
  const slider = document.getElementById("cropZoom");
  slider.addEventListener("input", () => setZoom(parseFloat(slider.value)));
  frame.addEventListener("wheel", (e) => {
    e.preventDefault();
    const z = Math.min(4, Math.max(1, zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    slider.value = z;
    setZoom(z);
  }, { passive: false });

  const cleanup = () => URL.revokeObjectURL(url);
  document.getElementById("cropCancel").addEventListener("click", () => { cleanup(); closeModal(); });
  document.getElementById("cropSave").addEventListener("click", () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = AVATAR_OUTPUT_PX;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // transparent PNGs get a white background, not black
    ctx.fillRect(0, 0, AVATAR_OUTPUT_PX, AVATAR_OUTPUT_PX);
    ctx.imageSmoothingQuality = "high";
    const sx = -x / scale, sy = -y / scale, side = CROP_FRAME_PX / scale;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_OUTPUT_PX, AVATAR_OUTPUT_PX);
    canvas.toBlob((blob) => {
      if (!blob) { toast("Couldn't prepare that photo. Please try a different one."); return; }
      run(async () => { await DB.setAvatar(u.id, blob, u.avatarPath); cleanup(); closeModal(); },
        () => { renderAccountPill(); renderMain(); },
        { success: "Photo saved." });
    }, "image/jpeg", 0.86);
  });
}

// A small read-only card about someone — opened by clicking a name or
// photo. Students see only the public part; faculty also see contact
// details and can jump to edit the profile.
function openPersonCard(userId) {
  const u = users.find((x) => x.id === userId);
  if (!u) return;
  if (u.id === currentUser.id) { openProfile(); return; }
  const fac = role === "faculty";
  const addr = [u.addressLine, [u.city, u.state].filter(Boolean).join(", "), u.postalCode].filter(Boolean).join(" · ");
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal person-card" role="dialog" aria-modal="true" aria-labelledby="personName" style="max-width:440px;">
        <div class="person-card-head">
          ${avatarHtml(u, 88)}
          <div>
            <h2 id="personName" style="font-size:1.25rem;margin:0 0 6px;">${esc(u.name)}</h2>
            ${levelPill(u)}
          </div>
        </div>
        ${u.homeChurch ? `<div class="person-line"><span class="person-label">Home church</span>${esc(u.homeChurch)}</div>` : ""}
        ${u.bio ? `<div class="person-line"><span class="person-label">About</span><p style="margin:0;white-space:pre-wrap;">${esc(u.bio)}</p></div>` : ""}
        ${fac ? `
          <div class="person-line"><span class="person-label">Email</span><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></div>
          ${u.phone ? `<div class="person-line"><span class="person-label">Phone</span><a href="tel:${esc(u.phone.replace(/[^\d+]/g, ""))}">${esc(u.phone)}</a></div>` : ""}
          ${addr ? `<div class="person-line"><span class="person-label">Address</span>${esc(addr)}</div>` : ""}
        ` : ""}
        ${!u.homeChurch && !u.bio && !(fac && (u.phone || addr)) ? `<p class="field-hint" style="margin:16px 0 0;">${esc(u.name.split(" ")[0] || "They")} hasn't filled in a profile yet.</p>` : ""}
        <div class="form-actions">
          ${fac ? `<button class="btn btn-primary" id="editPersonBtn">Edit Profile</button>` : ""}
          <button class="btn btn-ghost" id="closePersonBtn">Close</button>
        </div>
      </div>
    </div>`;
  document.getElementById("closePersonBtn").addEventListener("click", closeModal);
  const edit = document.getElementById("editPersonBtn");
  if (edit) edit.addEventListener("click", () => openProfile(u.id));
}

// Any element with data-person="<id>" opens that person's card.
function wirePersonLinks(scope) {
  (scope || document).querySelectorAll("[data-person]").forEach((el) => {
    el.addEventListener("click", (e) => { e.preventDefault(); openPersonCard(el.dataset.person); });
  });
}

// ---------------------------------------------------------------------------
// Site updates. When a new version of the site is published while someone
// already has it open, offer a one-click refresh (never a forced reload —
// they might be halfway through writing an assignment). Checks every five
// minutes and whenever the tab comes back into view. Each check is a tiny
// "has this file changed?" request; nothing is downloaded unless it did.
// ---------------------------------------------------------------------------
const SITE_UPDATE_CHECK_MS = 5 * 60 * 1000;
let lastSiteUpdateCheck = Date.now();
let siteUpdateShown = false;

async function checkForSiteUpdate(force = false) {
  const known = window.TNBBI_VERSIONS || {};
  if (siteUpdateShown || !Object.keys(known).length) return;
  if (!force && Date.now() - lastSiteUpdateCheck < SITE_UPDATE_CHECK_MS) return;
  lastSiteUpdateCheck = Date.now();
  try {
    const changed = await Promise.all(Object.keys(known).map(async (url) => {
      if (!known[url]) return false;
      const r = await fetch(url, { method: "HEAD", cache: "no-cache" });
      const v = r.headers.get("etag") || r.headers.get("last-modified") || "";
      return r.ok && v && v !== known[url];
    }));
    if (changed.some(Boolean)) showSiteUpdateBar();
  } catch (e) { /* offline for a moment — try again later */ }
}

function showSiteUpdateBar() {
  if (siteUpdateShown) return;
  siteUpdateShown = true;
  const bar = document.createElement("div");
  bar.className = "site-update-bar";
  bar.setAttribute("role", "status");
  bar.innerHTML = `<span>The Institute site has been updated.</span><button class="btn btn-gold btn-sm" id="siteUpdateBtn">Refresh Now</button><button class="site-update-later" id="siteUpdateLater" aria-label="Remind me later">Later</button>`;
  document.body.appendChild(bar);
  document.getElementById("siteUpdateBtn").addEventListener("click", () => location.reload());
  document.getElementById("siteUpdateLater").addEventListener("click", () => {
    bar.remove();
    // Ask again in half an hour.
    setTimeout(() => { siteUpdateShown = false; checkForSiteUpdate(true); }, 30 * 60 * 1000);
  });
}

setInterval(() => { if (document.visibilityState === "visible") checkForSiteUpdate(); }, 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastSiteUpdateCheck > 60 * 1000) checkForSiteUpdate(true);
});

// ---------------------------------------------------------------------------
// Start-up: wait for Supabase to tell us whether someone is signed in
// (including returning from Google, an email confirmation link, or a
// password-reset link), then show the right screen.
// ---------------------------------------------------------------------------
function configMissing() {
  const u = TNBBI_CONFIG.supabaseUrl || "";
  return !u || u.includes("YOUR-PROJECT-ID") || !TNBBI_CONFIG.supabaseAnonKey || TNBBI_CONFIG.supabaseAnonKey.includes("YOUR-ANON");
}

function boot() {
  if (TNBBI_CONFIG.testMode) document.getElementById("testBanner").hidden = false;
  if (configMissing()) {
    const wrap = document.getElementById("authScreen");
    wrap.innerHTML = `<div class="auth-wrap"><div class="auth-card"><h2 style="font-size:1.1rem;">Almost there</h2><p>This site isn't connected to its database yet. Open <code>js/config.js</code> and paste in the Supabase Project URL and anon key (see SETUP.md, step 3).</p></div></div>`;
    return;
  }
  const urlError = new URLSearchParams(location.search).get("error_description") || new URLSearchParams(location.hash.slice(1)).get("error_description");
  authMode = "loading";
  renderAuthScreen();
  let settled = false;
  sb.auth.onAuthStateChange((event, session) => {
    // Supabase asks that no other Supabase calls run inside this callback,
    // so hand the work off to the next tick.
    setTimeout(() => {
      if (event === "PASSWORD_RECOVERY") recoveringPassword = true;
      if (event === "SIGNED_OUT") {
        if (currentUser) signOut();
        return;
      }
      if (session && (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "PASSWORD_RECOVERY")) {
        // A real sign-in (not a restored visit or a token refresh) starts in day view.
        if (!currentUser && event !== "INITIAL_SESSION") { setTheme("light"); bumpPhoto(); }
        settled = true;
        startSession(session, { force: event === "PASSWORD_RECOVERY", restored: event === "INITIAL_SESSION" && !/access_token|[?&]code=|type=recovery/.test(location.href) });
        return;
      }
      if (event === "INITIAL_SESSION" && !session) {
        settled = true;
        authMode = "signin";
        if (urlError) authError = urlError.replace(/\+/g, " ");
        if (recoveringPassword) authError = "That password-reset link has expired or was already used. Request a new one below.";
        recoveringPassword = false;
        cleanAuthParamsFromUrl();
        renderAuthScreen();
      }
    }, 0);
  });
  // Safety net in case the sign-in check never reports back.
  setTimeout(() => { if (!settled && !currentUser) { authMode = "signin"; renderAuthScreen(); } }, 8000);
}

boot();
