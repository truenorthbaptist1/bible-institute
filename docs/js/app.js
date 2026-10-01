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
  return !!(sub && sub.submittedAt && assignment.due && sub.submittedAt > assignment.due);
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

// --- Study Bible ---------------------------------------------------------
let sbBookId = "JHN";
let sbChapter = 3;
let studyBibleShowHighlightsOnly = false;

// --- Super Admins ------------------------------------------------------
// A small, separate tier on top of the student/faculty role (max 4). The
// church's own Google account is the bootstrap: the first time it signs in
// WITH GOOGLE while no active Super Admin exists, it becomes one (and
// Faculty). After that, only Super Admins can add or remove others. If
// every Super Admin is ever removed, the church account's next Google
// sign-in restores the role — the Institute can never lock itself out.
// The database enforces all of this (see supabase/schema.sql).
const BOOTSTRAP_ADMIN_EMAIL = (TNBBI_CONFIG.bootstrapAdminEmail || "").toLowerCase();
const MAX_SUPER_ADMINS = 4;
function countSuperAdmins() { return users.filter((u) => u.superAdmin).length; }

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
}

// Every modal closes on Escape or a click on the dimmed backdrop — unless
// it's mid-save.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && busyCount === 0 && document.querySelector("#modalRoot .modal-backdrop")) closeModal();
});
document.addEventListener("mousedown", (e) => {
  if (busyCount === 0 && e.target.classList && e.target.classList.contains("modal-backdrop")) closeModal();
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
    <div class="notif-panel" id="notifPanel">
      <div class="notif-panel-head">Notifications</div>
      ${mine.length === 0 ? `<div class="notif-empty">No notifications yet.</div>` : mine
        .map(
          (n) => `
        <div class="notif-item ${n.read ? "" : "notif-item-unread"}">
          <div class="notif-item-subject">${esc(n.subject)}</div>
          <div class="notif-item-time">${new Date(n.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
        </div>`
        )
        .join("")}
    </div>` : ""}
  `;
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
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">
          <img src="brand/tnbbi-logo-color.png" alt="True North Baptist Church Bible Institute crest">
          <div>
            <div class="auth-logo-title">True North Baptist Church</div>
            <div class="auth-logo-sub">Bible Institute</div>
          </div>
        </div>
        ${tabs ? `
        <button class="btn btn-google" id="googleSignInBtn" type="button">${googleLogoSvg()} Continue with Google</button>
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
          : renderForgotSentForm()}
      </div>
      <p class="auth-foot" style="text-align:center;margin-top:14px;"><a href="privacy.html">Privacy Policy</a></p>
    </div>`;
  wrap.querySelectorAll("[data-mode]").forEach((b) => {
    b.addEventListener("click", () => { authMode = b.dataset.mode; authError = ""; authInfo = ""; renderAuthScreen(); });
  });
  wireAuthFormHandlers();
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
    gBtn.disabled = true;
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: siteUrl() } });
    if (error) { gBtn.disabled = false; authError = friendlyError(error); renderAuthScreen(); }
  });

  const signin = wrap.querySelector("#signinForm");
  if (signin) signin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = wrap.querySelector("#siEmail").value.trim().toLowerCase();
    const password = wrap.querySelector("#siPassword").value;
    pendingEmail = email;
    if (!email || !password) { authError = "Enter your email and password."; renderAuthScreen(); return; }
    authBusy(signin, true);
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
async function startSession(session, { force = false } = {}) {
  if (!session || !session.user) return;
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

async function signOut(message) {
  clearInterval(pollTimer);
  clearViewTimers();
  closeModal();
  try { await sb.auth.signOut(); } catch (e) { /* already signed out */ }
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
    <div class="notif-wrap" id="notifBellWrap"></div>
    <span class="account-name">${esc(currentUser.name)}</span>
    <span class="pill ${currentUser.role === "faculty" ? "pill-gold" : "pill-navy"}" style="background:transparent;border:1px solid rgba(255,255,255,0.35);color:#dbe2ee;">${currentUser.role === "faculty" ? "Faculty/Admin" : "Student"}</span>
    ${currentUser.superAdmin ? `<span class="pill pill-gold" title="Super Admin">★ Super Admin</span>` : ""}
    <button id="logoutBtn">Log Out</button>
  `;
  document.getElementById("logoutBtn").addEventListener("click", () => signOut());
  renderNotifBell();
}

function clearViewTimers() {
  viewTimers.forEach((t) => clearInterval(t));
  viewTimers = [];
}

function renderNav() {
  const nav = document.getElementById("navPills");
  const items = [{ key: "home", label: "Dashboard" }, { key: "calendar", label: "Calendar" }, { key: "studyBible", label: "Study Bible" }, { key: "resourceLibrary", label: "Resource Library" }];
  const homeViews =
    role === "student"
      ? ["home", "courses", "course", "grades", "messages", "messageThread", "submit", "discussion", "discussionBoard"]
      : ["home", "catalogue", "manage", "grading", "gradeSheet", "discussion", "discussionBoard", "messages", "messageThread", "settings"];
  nav.innerHTML = items
    .map((i) => {
      const active = i.key === "home" ? homeViews.includes(view) : view === i.key;
      return `<button data-view="${i.key}" class="${active ? "active" : ""}">${i.label}</button>`;
    })
    .join("");
  nav.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { view = "home"; activeCourseId = null; if (b.dataset.view !== "home") view = b.dataset.view; renderNav(); renderMain(); }));
}

function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }

// Student-written work (from the in-tool editor) is stored as HTML. Before
// it's ever shown — to the student or to faculty — it's cleaned down to
// simple formatting, so nothing harmful can ride along inside it.
const SAFE_TAGS = ["b", "strong", "i", "em", "u", "ul", "ol", "li", "p", "br", "div", "span", "h1", "h2", "h3", "blockquote"];
function safeHtml(html) {
  if (!html) return "";
  if (window.DOMPurify) return DOMPurify.sanitize(html, { ALLOWED_TAGS: SAFE_TAGS, ALLOWED_ATTR: [] });
  return esc(html);
}

// Moving to another page re-checks the database (unless it was just
// loaded), so what one person changes — a new enrollment, a grade, a
// reply — shows up for everyone else without reloading the browser.
const STALE_MS = 3000;
const COURSE_VIEWS = ["course", "manage", "gradeSheet", "discussionBoard", "messageThread"];
const FACULTY_ONLY_VIEWS = ["catalogue", "manage", "grading", "gradeSheet", "settings"];
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

function renderView() {
  const main = document.getElementById("main");
  if (!currentUser) return;
  // A page whose course was deleted or archived elsewhere, or a page this
  // role can't use, falls back to the dashboard instead of breaking.
  if ((COURSE_VIEWS.includes(view) && !courses.some((c) => c.id === activeCourseId))
      || (role !== "faculty" && FACULTY_ONLY_VIEWS.includes(view))
      || (role === "faculty" && STUDENT_ONLY_VIEWS.includes(view))) {
    view = "home";
    activeCourseId = null;
    renderNav();
  }
  if (view === "home") return role === "student" ? renderDashboard(main) : renderFacultyHome(main);
  if (view === "courses") return renderCourses(main);
  if (view === "course") return renderCourse(main);
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
  if (view === "settings") return Date.now() - dataLoadedAt < 1500 ? renderSettings(main) : withFreshData(() => renderSettings(main));
}

function renderDashboard(main) {
  const tiles = [
    { key: "courses", i: "book", label: "My Courses", desc: "Open your enrolled classes" },
    { key: "calendar", i: "calendar", label: "Calendar", desc: "Every due date, across all your classes" },
    { key: "studyBible", i: "bible", label: "Study Bible", desc: "Read the KJV with Strong's Concordance" },
    { key: "grades", i: "cap", label: "My Grades", desc: "Scores and progress" },
    { key: "messages", i: "mail", label: "Send Message", desc: "Reach a faculty member" },
    { key: "submit", i: "upload", label: "Submit Work", desc: "Turn in worksheets and papers" },
    { key: "discussion", i: "chat", label: "Discussion Board", desc: "Talk with your classmates" },
    { key: "resourceLibrary", i: "search", label: "Resource Library", desc: "Search the Drive and church library by topic or course" },
  ];
  const unread = unreadMessageCount();
  main.innerHTML = `
    <div class="page-header">
      <div class="eyebrow">Student Dashboard</div>
      <h1>Welcome to the Institute</h1>
    </div>
    <div class="grid">
      ${tiles
        .map(
          (t) => `
        <div class="tile" data-goto="${t.key}" tabindex="0" role="button">
          ${t.key === "messages" && unread ? `<span class="tile-badge">${unread}</span>` : ""}
          <div class="icon-badge">${icon(t.i)}</div>
          <h3>${esc(t.label)}</h3>
          <p>${esc(t.desc)}</p>
        </div>`
        )
        .join("")}
    </div>
  `;
  main.querySelectorAll("[data-goto]").forEach((el) => {
    const open = () => { view = el.dataset.goto; renderNav(); renderMain(); };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}

function renderPlaceholder(main, title, iconName, message) {
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${role === "student" ? "Student Dashboard" : "Faculty & Admin"}</div>
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
  return courses.filter((c) => !c.archived).reduce((n, c) => n + pendingRequestsFor(c).length, 0);
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
    <div class="grid">${enrolled.map(courseTile).join("")}</div>` : ""}
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
    { key: "calendar", i: "calendar", label: "Calendar", desc: "Every due date, across every active course" },
    { key: "studyBible", i: "bible", label: "Study Bible", desc: "Read the KJV with Strong's Concordance" },
    { key: "grading", i: "cap", label: "Grading", desc: "Review and grade student work" },
    { key: "discussion", i: "chat", label: "Discussion Board", desc: "Moderate class discussions" },
    { key: "messages", i: "mail", label: "Message Inbox", desc: "Messages from students" },
    { key: "resourceLibrary", i: "search", label: "Resource Library", desc: "Search the Drive and church library by topic or course" },
    { key: "settings", i: "gear", label: "Settings", desc: "Account and preferences" },
  ];
  const unread = unreadMessageCount();
  const pendingEnroll = pendingEnrollmentCount();
  main.innerHTML = `
    <div class="page-header">
      <div class="eyebrow">Faculty &amp; Admin</div>
      <h1>Welcome Professor</h1>
    </div>
    <div class="grid">
      ${tiles
        .map(
          (t) => `
        <div class="tile" data-goto="${t.key}" tabindex="0" role="button">
          ${t.key === "messages" && unread ? `<span class="tile-badge">${unread}</span>` : ""}
          ${t.key === "catalogue" && pendingEnroll ? `<span class="tile-badge" title="${pendingEnroll} enrollment request${pendingEnroll === 1 ? "" : "s"}">${pendingEnroll}</span>` : ""}
          <div class="icon-badge">${icon(t.i)}</div>
          <h3>${esc(t.label)}</h3>
          <p>${esc(t.desc)}</p>
        </div>`
        )
        .join("")}
    </div>
  `;
  main.querySelectorAll("[data-goto]").forEach((el) => {
    const open = () => { view = el.dataset.goto; renderNav(); renderMain(); };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
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
    let uploadError = null;
    run(async () => {
      const id = await DB.createCourse({ title: name, description: desc || "No description yet.", credits, level, facultyId: currentFacultyId() });
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
  const list = catalogueTab === "archived" ? archivedCourses : activeCourses;
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">Faculty &amp; Admin</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <h1 style="margin:0;">Courses</h1>
        <button class="btn btn-primary btn-sm" id="catAddCourse">+ Add Course</button>
      </div>
      <p>Everything the Institute currently offers. Open a course to set its schedule, roster, and materials.</p>
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
          return `
        <div class="tile tile-compact" data-course="${c.id}" tabindex="0" role="button">
          ${pendingCount ? `<span class="tile-badge" title="${pendingCount} enrollment request${pendingCount === 1 ? "" : "s"}">${pendingCount}</span>` : ""}
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <span class="pill pill-navy">${esc(c.level)} Level</span>
            <span class="pill ${status.cls}">${esc(status.text)}</span>
          </div>
          <h3>${esc(c.title)}</h3>
          <p class="tile-meta">${c.credits} cr · ${c.studentIds.length} enrolled</p>
          <button class="btn ${c.archived ? "btn-success" : "btn-outline-gold"} btn-sm tile-archive-btn" data-archive-toggle="${c.id}">${c.archived ? "Reactivate" : "Archive"}</button>
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
      if (archiving && hadMessages && !confirm(`Archive "${c.title}"?\n\nThis permanently deletes the course's private student–instructor messages (export any you want to keep first). Materials, grades, and the discussion board are kept.`)) return;
      run(async () => {
        await DB.setArchived(c.id, archiving);
        flashMessage = archiving
          ? `"${c.title}" was archived.${hadMessages ? " Its private messages have been deleted." : ""}`
          : `"${c.title}" is active again.`;
      });
    });
    btn.addEventListener("keydown", (e) => e.stopPropagation());
  });
}

function renderCourse(main) {
  const c = courses.find((x) => x.id === activeCourseId);
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to My Courses</button>
    <div class="page-header">
      <span class="pill pill-navy">${esc(c.level)} Level</span>
      <h1 style="margin-top:10px;">${esc(c.title)}</h1>
      <p>${esc(c.description)}</p>
      ${scheduleLine(c) ? `<p style="color:var(--muted-foreground);font-size:.85rem;margin-top:6px;">${esc(scheduleLine(c))}</p>` : ""}
    </div>
    <div class="section-title"><h2>Course Materials</h2></div>
    <div class="card">
      <ul class="materials-list">
        ${c.materials.length === 0 ? `<li style="border:none;color:var(--muted-foreground);">No documents attached yet.</li>` : c.materials.map((m) => `<li>
          <div>
            <span class="type-badge">${TYPE_LABEL[m.type]}</span>
            <div><strong>${esc(m.title)}</strong></div>
            ${m.content ? `<div style="color:var(--muted-foreground);font-size:.9rem;margin-top:4px;">${esc(m.content)}</div>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm" data-open-material="${m.id}">Open</button>
        </li>`).join("")}
      </ul>
    </div>
    <div class="section-title"><h2>Assignments</h2></div>
    <div class="card">
      <ul class="assignments-list">
        ${c.assignments.length === 0 ? `<li style="border:none;color:var(--muted-foreground);">No assignments yet.</li>` : c.assignments.map((a) => {
          const sub = getSubmission(c, a, currentStudentId);
          const [label, pillClass] = STATUS_LABEL[sub.status];
          return `<li>
            <div>
              <div><strong>${esc(a.title)}</strong></div>
              <div style="font-size:.82rem;color:var(--muted-foreground);margin-top:4px;">Due ${parseDay(a.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${a.points} pts</div>
            </div>
            <div style="text-align:right;">
              <span class="pill ${pillClass}">${label}${sub.status === "graded" ? ` · ${sub.score}/${a.points}` : ""}</span><br>
              <button class="btn btn-ghost btn-sm" style="margin-top:8px;" data-assignment="${a.id}">${sub.status === "graded" ? "View" : "Turn In"}</button>
            </div>
          </li>`;
        }).join("")}
      </ul>
    </div>
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "courses"; renderNav(); renderMain(); });
  main.querySelectorAll("[data-open-material]").forEach((btn) => {
    btn.addEventListener("click", () => openMaterialViewer(c, c.materials.find((m) => m.id === btn.dataset.openMaterial)));
  });
  main.querySelectorAll("[data-assignment]").forEach((btn) => {
    btn.addEventListener("click", () => openSubmitModal(c, c.assignments.find((a) => a.id === btn.dataset.assignment), currentStudentId));
  });
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
    <div class="modal-backdrop">
      <div class="modal" style="max-width:600px;">
        <h2 style="font-size:1.15rem;">${esc(assignment.title)}</h2>
        <p style="color:var(--muted-foreground);font-size:.85rem;margin-top:4px;">Due ${parseDay(assignment.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${assignment.points} points</p>
        ${assignment.instructions ? `<p style="margin-top:10px;">${esc(assignment.instructions)}</p>` : ""}
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
            <div class="editor-toolbar">
              <button type="button" data-cmd="bold"><strong>B</strong></button>
              <button type="button" data-cmd="italic"><em>I</em></button>
              <button type="button" data-cmd="underline"><u>U</u></button>
              <button type="button" data-cmd="insertUnorderedList">• List</button>
              <button type="button" data-cmd="insertOrderedList">1. List</button>
            </div>
            <div id="submitEditor" class="editor-box" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Your assignment">${safeHtml(sub.writtenContent || "")}</div>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" id="submitTurnIn">Turn In</button>
            <button class="btn btn-ghost" id="submitProgress">Save as In Progress</button>
            <button class="btn btn-ghost" id="submitCancel">Cancel</button>
          </div>
        `}
      </div>
    </div>`;
  if (graded || lock.locked) {
    document.getElementById("submitClose").addEventListener("click", closeModal);
    wireOpenMyFile();
    return;
  }
  wireOpenMyFile();
  function wireOpenMyFile() {
    const b = document.getElementById("openMyFile");
    if (b) b.addEventListener("click", () => openStoredFile("submissions", sub.storagePath, sub.fileName, b));
  }
  function method() { return document.querySelector('input[name="submitMethod"]:checked').value; }
  function syncMethodUI() {
    const editorMode = method() === "editor";
    document.getElementById("submitFileWrap").style.display = editorMode ? "none" : "";
    document.getElementById("submitEditorWrap").style.display = editorMode ? "" : "none";
  }
  syncMethodUI();
  document.querySelectorAll('input[name="submitMethod"]').forEach((r) => r.addEventListener("change", syncMethodUI));
  document.querySelectorAll("#submitEditorWrap [data-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => { document.execCommand(btn.dataset.cmd, false, null); document.getElementById("submitEditor").focus(); });
  });
  document.getElementById("submitCancel").addEventListener("click", closeModal);
  const afterSave = onSaved || (() => renderMain());
  document.getElementById("submitProgress").addEventListener("click", () => {
    const editor = document.getElementById("submitEditor");
    const html = method() === "editor" && editor.textContent.trim() ? safeHtml(editor.innerHTML.trim()) : undefined;
    run(async () => {
      await DB.saveSubmission({ courseId: course.id, assignment, studentId, status: "in_progress", writtenContent: html, previous: sub });
      closeModal();
    }, afterSave, { success: "Progress saved." });
  });
  document.getElementById("submitTurnIn").addEventListener("click", () => {
    let file = null;
    let html;
    if (method() === "editor") {
      const editor = document.getElementById("submitEditor");
      if (!editor.textContent.trim()) { editor.focus(); return; }
      html = safeHtml(editor.innerHTML.trim());
    } else {
      const fileInput = document.getElementById("submitFile");
      file = fileInput.files[0];
      if (!file) { fileInput.focus(); return; }
      try { checkUpload(file, SUBMISSION_MAX_BYTES); } catch (err) { toast(err.message); return; }
    }
    run(async () => {
      await DB.saveSubmission({ courseId: course.id, assignment, studentId, status: "submitted", file, writtenContent: html, previous: sub });
      closeModal();
    }, afterSave, { success: "Turned in — it's now waiting in your instructor's grading queue." });
  });
}

// Student: everything due across every live, enrolled course, in one inbox
// — plus a quick-pick at the top so you can jump straight to a specific
// assignment (from the list the professor entered for that course) rather
// than scanning the whole inbox first.
function renderSubmitWork(main) {
  const items = [];
  const myCourses = courses.filter((c) => isLive(c) && c.studentIds.includes(currentStudentId));
  myCourses.forEach((c) => {
    c.assignments.forEach((a) => {
      const sub = getSubmission(c, a, currentStudentId);
      if (sub.status !== "graded") items.push({ c, a, sub });
    });
  });
  items.sort((x, y) => x.a.due.localeCompare(y.a.due));

  if (!submitPickCourseId || !myCourses.some((c) => c.id === submitPickCourseId)) {
    submitPickCourseId = myCourses[0] ? myCourses[0].id : "";
  }
  const pickCourse = myCourses.find((c) => c.id === submitPickCourseId);
  const pickAssignments = pickCourse ? [...pickCourse.assignments].sort((a, b) => a.due.localeCompare(b.due)) : [];
  if (!pickAssignments.some((a) => a.id === submitPickAssignmentId)) {
    submitPickAssignmentId = pickAssignments[0] ? pickAssignments[0].id : "";
  }

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">Student Dashboard</div>
      <h1>Submit Work</h1>
      <p>Everything due across your courses.</p>
    </div>
    ${myCourses.length === 0 ? "" : `
    <div class="card">
      <div class="section-title" style="margin:0 0 4px;"><h2 style="font-size:1rem;">Quick Submit</h2></div>
      <p style="color:var(--muted-foreground);font-size:.85rem;margin-bottom:14px;">Pick a course and assignment your professor has posted, then continue to submit it.</p>
      <div class="form-row">
        <div>
          <label for="pickCourse">Course</label>
          <select id="pickCourse">${myCourses.map((c) => `<option value="${c.id}" ${c.id === submitPickCourseId ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select>
        </div>
        <div>
          <label for="pickAssignment">Assignment</label>
          <select id="pickAssignment" ${pickAssignments.length === 0 ? "disabled" : ""}>
            ${pickAssignments.length === 0 ? `<option>No assignments yet</option>` : pickAssignments.map((a) => `<option value="${a.id}" ${a.id === submitPickAssignmentId ? "selected" : ""}>${esc(a.title)} — Due ${parseDay(a.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="pickContinue" ${pickAssignments.length === 0 ? "disabled" : ""}>Continue</button>
      </div>
    </div>`}
    ${items.length === 0 ? `
    <div class="card empty-state" style="margin-top:20px;">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("upload")}</div>
      <p>Nothing outstanding — you're all caught up.</p>
    </div>` : `
    <div class="section-title"><h2>Everything Due</h2></div>
    <div class="card">
      <ul class="assignments-list">
        ${items.map(({ c, a, sub }) => {
          const [label, pillClass] = STATUS_LABEL[sub.status];
          const overdue = a.due < todayStr() && sub.status !== "submitted";
          const lock = assignmentLock(a);
          return `<li>
            <div>
              <div><strong>${esc(a.title)}</strong>${lock.locked ? ` <span class="pill pill-gray" style="margin-left:4px;">Locked</span>` : ""}</div>
              <div style="font-size:.82rem;color:var(--muted-foreground);margin-top:4px;">${esc(c.title)} · Due ${parseDay(a.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})}${overdue ? ' · <span style="color:var(--destructive);font-weight:600;">Overdue</span>' : ''}${lock.locked ? ` · Opens ${parseDay(lock.opensOn).toLocaleDateString(undefined,{month:'short',day:'numeric'})}` : ""}</div>
            </div>
            <div style="text-align:right;">
              <span class="pill ${pillClass}">${label}</span><br>
              <button class="btn btn-ghost btn-sm" style="margin-top:8px;" data-item="${c.id}|${a.id}">${lock.locked ? "View" : "Turn In"}</button>
            </div>
          </li>`;
        }).join("")}
      </ul>
    </div>`}
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  const pickCourseSel = document.getElementById("pickCourse");
  if (pickCourseSel) pickCourseSel.addEventListener("change", () => { submitPickCourseId = pickCourseSel.value; submitPickAssignmentId = ""; renderSubmitWork(main); });
  const pickAssignmentSel = document.getElementById("pickAssignment");
  if (pickAssignmentSel) pickAssignmentSel.addEventListener("change", () => { submitPickAssignmentId = pickAssignmentSel.value; });
  const pickContinueBtn = document.getElementById("pickContinue");
  if (pickContinueBtn) pickContinueBtn.addEventListener("click", () => {
    const c = courses.find((x) => x.id === submitPickCourseId);
    const a = c && c.assignments.find((x) => x.id === submitPickAssignmentId);
    if (c && a) openSubmitModal(c, a, currentStudentId, () => renderSubmitWork(main));
  });
  main.querySelectorAll("[data-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [cid, aid] = btn.dataset.item.split("|");
      const c = courses.find((x) => x.id === cid);
      const a = c.assignments.find((x) => x.id === aid);
      openSubmitModal(c, a, currentStudentId, () => renderSubmitWork(main));
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
    : courses.filter((c) => !c.archived);
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

  const totalAssignments = Object.values(byDate).reduce((n, rows) => n + rows.length, 0);
  const selectedDate = days.find((d) => localISO(d) === calendarCursor) ? calendarCursor : today;

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${role === "student" ? "Student Dashboard" : "Faculty & Admin"}</div>
      <h1>Calendar</h1>
      <p>Every assignment due date across ${role === "student" ? "your classes" : "every active course"}.</p>
    </div>
    ${totalAssignments === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("calendar")}</div>
      <p>${role === "student" ? "Once you're enrolled in a course with assignments, they'll show up here." : "No assignments have been added to a course yet."}</p>
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
        const inRangeMonth = calendarMode === "month" ? d.getMonth() === cursor.getMonth() : true;
        const isToday = ds === today;
        const isSelected = ds === selectedDate;
        return `<button type="button" class="cal-day ${inRangeMonth ? "" : "cal-day-outside"} ${isToday ? "cal-day-today" : ""} ${isSelected ? "cal-day-selected" : ""}" data-cal-day="${ds}">
          <span class="cal-day-num">${d.getDate()}</span>
          ${rows.length ? `<span class="cal-dot ${calendarDotClass(rows, today)}" title="${rows.length} due"></span>` : ""}
        </button>`;
      }).join("")}
    </div>
    <div class="card" id="calDayDetail" style="margin-top:20px;"></div>
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
  main.querySelectorAll("[data-cal-mode]").forEach((btn) => {
    btn.addEventListener("click", () => { calendarMode = btn.dataset.calMode; renderCalendar(main); });
  });
  main.querySelectorAll("[data-cal-day]").forEach((btn) => {
    btn.addEventListener("click", () => {
      calendarCursor = btn.dataset.calDay;
      main.querySelectorAll("[data-cal-day]").forEach((b) => b.classList.remove("cal-day-selected"));
      btn.classList.add("cal-day-selected");
      renderDayDetail(btn.dataset.calDay);
    });
  });
}

// Study Bible — the full King James Version (all 66 books), read live from
// bible-api.com (public-domain KJV text, free, no key). Chapters are cached
// in this browser after the first read. Words with a dotted gold underline
// open their Strong's Concordance entry — tagged for now in the Featured
// Passages (hand-checked); full-Bible Strong's tagging is a later, one-time
// import of the STEPBible dataset. Highlights are saved to each person's
// account, so they follow them to any device.
const BIBLE_BOOKS = [
  ["GEN", "Genesis", 50], ["EXO", "Exodus", 40], ["LEV", "Leviticus", 27], ["NUM", "Numbers", 36], ["DEU", "Deuteronomy", 34],
  ["JOS", "Joshua", 24], ["JDG", "Judges", 21], ["RUT", "Ruth", 4], ["1SA", "1 Samuel", 31], ["2SA", "2 Samuel", 24],
  ["1KI", "1 Kings", 22], ["2KI", "2 Kings", 25], ["1CH", "1 Chronicles", 29], ["2CH", "2 Chronicles", 36], ["EZR", "Ezra", 10],
  ["NEH", "Nehemiah", 13], ["EST", "Esther", 10], ["JOB", "Job", 42], ["PSA", "Psalms", 150], ["PRO", "Proverbs", 31],
  ["ECC", "Ecclesiastes", 12], ["SNG", "Song of Solomon", 8], ["ISA", "Isaiah", 66], ["JER", "Jeremiah", 52], ["LAM", "Lamentations", 5],
  ["EZK", "Ezekiel", 48], ["DAN", "Daniel", 12], ["HOS", "Hosea", 14], ["JOL", "Joel", 3], ["AMO", "Amos", 9],
  ["OBA", "Obadiah", 1], ["JON", "Jonah", 4], ["MIC", "Micah", 7], ["NAM", "Nahum", 3], ["HAB", "Habakkuk", 3],
  ["ZEP", "Zephaniah", 3], ["HAG", "Haggai", 2], ["ZEC", "Zechariah", 14], ["MAL", "Malachi", 4],
  ["MAT", "Matthew", 28], ["MRK", "Mark", 16], ["LUK", "Luke", 24], ["JHN", "John", 21], ["ACT", "Acts", 28],
  ["ROM", "Romans", 16], ["1CO", "1 Corinthians", 16], ["2CO", "2 Corinthians", 13], ["GAL", "Galatians", 6], ["EPH", "Ephesians", 6],
  ["PHP", "Philippians", 4], ["COL", "Colossians", 4], ["1TH", "1 Thessalonians", 5], ["2TH", "2 Thessalonians", 3], ["1TI", "1 Timothy", 6],
  ["2TI", "2 Timothy", 4], ["TIT", "Titus", 3], ["PHM", "Philemon", 1], ["HEB", "Hebrews", 13], ["JAS", "James", 5],
  ["1PE", "1 Peter", 5], ["2PE", "2 Peter", 3], ["1JN", "1 John", 5], ["2JN", "2 John", 1], ["3JN", "3 John", 1],
  ["JUD", "Jude", 1], ["REV", "Revelation", 22],
];
const BOOK_INDEX = {};
BIBLE_BOOKS.forEach(([id, name, chapters], i) => { BOOK_INDEX[id] = { id, name, chapters, i }; });
const BOOK_ID_BY_NAME = {};
BIBLE_BOOKS.forEach(([id, name]) => { BOOK_ID_BY_NAME[name] = id; });

// Strong's word tags for the featured passages, keyed "JHN.3.16".
const STRONGS_TAGS = {};
STUDY_BIBLE_PASSAGES.forEach((p) => {
  p.bookId = BOOK_ID_BY_NAME[p.book];
  p.verses.forEach((v) => { if (v.tags && v.tags.length) STRONGS_TAGS[`${p.bookId}.${p.chapter}.${v.n}`] = v.tags; });
});
function studyBibleRef(p) {
  const first = p.verses[0].n, last = p.verses[p.verses.length - 1].n;
  return `${p.book} ${p.chapter}:${first}${last !== first ? "–" + last : ""}`;
}

const chapterCache = {};
async function fetchChapter(bookId, chapter) {
  const key = `${bookId}.${chapter}`;
  if (chapterCache[key]) return chapterCache[key];
  try {
    const cached = localStorage.getItem("kjv:" + key);
    if (cached) return (chapterCache[key] = JSON.parse(cached));
  } catch (e) { /* storage unavailable — just fetch */ }
  let res;
  try {
    res = await fetch(`https://bible-api.com/data/kjv/${bookId}/${chapter}`);
  } catch (e) {
    throw new Error("Couldn't reach the Bible text service. Check your internet connection and try again.");
  }
  if (res.status === 429) throw new Error("The Bible text service is busy right now — wait a few seconds and try again.");
  if (!res.ok) throw new Error("Couldn't load that chapter right now. Please try again.");
  const data = await res.json();
  const verses = (data.verses || []).map((v) => ({ n: v.verse, text: String(v.text || "").replace(/\s+/g, " ").trim() }));
  if (!verses.length) throw new Error("That chapter came back empty. Please try again.");
  chapterCache[key] = verses;
  try { localStorage.setItem("kjv:" + key, JSON.stringify(verses)); } catch (e) { /* full or private — fine */ }
  return verses;
}

function renderVerseHtml(text, tags) {
  let html = esc(text);
  (tags || []).forEach((tag) => {
    const escaped = tag.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("\\b(" + escaped + ")\\b");
    html = html.replace(re, (m) => `<span class="sw" data-strongs="${tag.s}" tabindex="0" role="button" aria-label="${esc(m)} — Strong's ${tag.s}">${m}</span>`);
  });
  return html;
}

function openStrongsModal(code) {
  const entry = STRONGS_LEXICON[code];
  if (!entry) return;
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width:420px;" role="dialog" aria-modal="true" aria-label="Strong's ${code}">
        <div class="strongs-code">${code}</div>
        <div class="strongs-word" lang="${entry.lang === "Hebrew" ? "he" : "grc"}">${entry.word}</div>
        <div class="strongs-translit">${esc(entry.translit)} <span class="pill pill-navy" style="margin-left:6px;">${entry.lang}</span></div>
        <p style="margin-top:14px;">${esc(entry.def)}</p>
        <div class="form-actions"><button class="btn btn-ghost" id="strongsClose">Close</button></div>
      </div>
    </div>`;
  document.getElementById("strongsClose").addEventListener("click", closeModal);
}

function highlightedKeys() {
  const set = {};
  bibleHighlightRows.forEach((r) => { set[r.verse_key] = true; });
  return set;
}

let sbScrollToVerse = null;
let sbLoadToken = 0;

function renderStudyBible(main) {
  const book = BOOK_INDEX[sbBookId] || BOOK_INDEX.JHN;
  if (sbChapter > book.chapters) sbChapter = book.chapters;
  const hlCount = bibleHighlightRows.length;

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${role === "student" ? "Student Dashboard" : "Faculty & Admin"}</div>
      <h1>Study Bible</h1>
      <p>The King James Version, with an inline Strong's Concordance &amp; Lexicon.</p>
    </div>
    <div class="study-bible-layout">
      <div class="sb-sidebar">
        <div class="sb-picker">
          <label for="sbBook">Book</label>
          <select id="sbBook">
            <optgroup label="Old Testament">${BIBLE_BOOKS.slice(0, 39).map(([id, name]) => `<option value="${id}" ${id === book.id ? "selected" : ""}>${name}</option>`).join("")}</optgroup>
            <optgroup label="New Testament">${BIBLE_BOOKS.slice(39).map(([id, name]) => `<option value="${id}" ${id === book.id ? "selected" : ""}>${name}</option>`).join("")}</optgroup>
          </select>
          <label for="sbChapter">Chapter</label>
          <select id="sbChapter">${Array.from({ length: book.chapters }, (_, i) => `<option value="${i + 1}" ${i + 1 === sbChapter ? "selected" : ""}>${i + 1}</option>`).join("")}</select>
        </div>
        <button class="btn btn-ghost btn-sm" id="sbToggleHighlights" style="width:100%;margin:12px 0 10px;justify-content:center;">${studyBibleShowHighlightsOnly ? "&larr; Back to Reading" : `★ My Highlights (${hlCount})`}</button>
        <div class="sb-featured-title">Featured passages · Strong's tagged</div>
        <div class="sb-featured">
        ${STUDY_BIBLE_PASSAGES.map((p) => `
          <div class="sb-passage-item ${!studyBibleShowHighlightsOnly && p.bookId === book.id && p.chapter === sbChapter ? "active" : ""}" data-passage="${p.id}" tabindex="0" role="button">
            <div class="sb-passage-ref">${studyBibleRef(p)}</div>
            <div class="sb-passage-blurb">${esc(p.blurb)}</div>
          </div>`).join("")}
        </div>
      </div>
      <div class="sb-reading card" id="sbReading" aria-live="polite"></div>
    </div>
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  document.getElementById("sbToggleHighlights").addEventListener("click", () => { studyBibleShowHighlightsOnly = !studyBibleShowHighlightsOnly; renderStudyBible(main); });
  document.getElementById("sbBook").addEventListener("change", (e) => { sbBookId = e.target.value; sbChapter = 1; studyBibleShowHighlightsOnly = false; renderStudyBible(main); });
  document.getElementById("sbChapter").addEventListener("change", (e) => { sbChapter = parseInt(e.target.value, 10) || 1; studyBibleShowHighlightsOnly = false; renderStudyBible(main); });
  main.querySelectorAll("[data-passage]").forEach((el) => {
    const open = () => {
      const p = STUDY_BIBLE_PASSAGES.find((x) => x.id === el.dataset.passage);
      sbBookId = p.bookId;
      sbChapter = p.chapter;
      sbScrollToVerse = p.verses[0].n > 1 ? p.verses[0].n : null;
      studyBibleShowHighlightsOnly = false;
      renderStudyBible(main);
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });

  const wrap = document.getElementById("sbReading");
  const hl = highlightedKeys();

  function verseActionsHtml(key) {
    const on = !!hl[key];
    return `
      <div class="verse-actions">
        <button type="button" class="verse-act-btn ${on ? "active" : ""}" data-hl="${key}" aria-pressed="${on}">${on ? "★ Highlighted" : "☆ Highlight"}</button>
        <button type="button" class="verse-act-btn" data-copy="${key}">⧉ Copy</button>
      </div>`;
  }

  function wireVerseActions(lookup) {
    wrap.querySelectorAll(".sw").forEach((el) => {
      el.addEventListener("click", () => openStrongsModal(el.dataset.strongs));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openStrongsModal(el.dataset.strongs); } });
    });
    wrap.querySelectorAll("[data-hl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.hl;
        const v = lookup(key);
        if (!v) return;
        const turnOn = !hl[key];
        run(async () => {
          await DB.setHighlight(key, v.reference, v.text, turnOn);
          if (turnOn) bibleHighlightRows.push({ verse_key: key, reference: v.reference, verse_text: v.text });
          else bibleHighlightRows = bibleHighlightRows.filter((r) => r.verse_key !== key);
        }, () => { const y = window.scrollY; renderStudyBible(main); window.scrollTo(0, y); }, { reload: false });
      });
    });
    wrap.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = lookup(btn.dataset.copy);
        if (!v) return;
        const text = `${v.reference} — ${v.text} (KJV)`;
        const done = () => { btn.textContent = "✓ Copied"; setTimeout(() => { btn.textContent = "⧉ Copy"; }, 1400); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => toast("Couldn't copy — select the verse text instead."));
        else toast("Copying isn't supported in this browser — select the verse text instead.");
      });
    });
  }

  if (studyBibleShowHighlightsOnly) {
    const rows = [...bibleHighlightRows].sort((a, b) => verseOrder(a.verse_key) - verseOrder(b.verse_key));
    wrap.innerHTML = rows.length === 0
      ? `<div class="empty-state"><div class="icon-badge" style="margin:0 auto 14px;">${icon("note")}</div><p>No highlighted verses yet — read a chapter and tap ☆ Highlight on any verse to save it here.</p></div>`
      : `<div class="section-title" style="margin:0 0 10px;"><h2>My Highlights</h2></div>` + rows.map((r) => `
          <div class="verse-row verse-highlighted">
            <div class="verse-ref"><a href="#" data-goto-verse="${r.verse_key}">${esc(r.reference)}</a></div>
            <div class="verse-text">${renderVerseHtml(r.verse_text, STRONGS_TAGS[r.verse_key])}</div>
            ${verseActionsHtml(r.verse_key)}
          </div>`).join("");
    wireVerseActions((key) => {
      const r = bibleHighlightRows.find((x) => x.verse_key === key);
      return r ? { reference: r.reference, text: r.verse_text } : null;
    });
    wrap.querySelectorAll("[data-goto-verse]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const [b, c, v] = a.dataset.gotoVerse.split(".");
        sbBookId = b; sbChapter = parseInt(c, 10); sbScrollToVerse = parseInt(v, 10);
        studyBibleShowHighlightsOnly = false;
        renderStudyBible(main);
      });
    });
    return;
  }

  const token = ++sbLoadToken;
  const heading = `${book.name} ${sbChapter}`;
  const navHtml = () => {
    const prev = prevChapter(book.id, sbChapter);
    const next = nextChapter(book.id, sbChapter);
    return `<div class="sb-chapter-nav">
      ${prev ? `<button class="btn btn-ghost btn-sm" data-chapter-nav="${prev.join(".")}">&larr; ${esc(BOOK_INDEX[prev[0]].name)} ${prev[1]}</button>` : "<span></span>"}
      ${next ? `<button class="btn btn-ghost btn-sm" data-chapter-nav="${next.join(".")}">${esc(BOOK_INDEX[next[0]].name)} ${next[1]} &rarr;</button>` : "<span></span>"}
    </div>`;
  };
  const wireChapterNav = () => {
    wrap.querySelectorAll("[data-chapter-nav]").forEach((b) => {
      b.addEventListener("click", () => {
        const [bk, ch] = b.dataset.chapterNav.split(".");
        sbBookId = bk; sbChapter = parseInt(ch, 10);
        renderStudyBible(main);
        document.getElementById("sbReading").scrollIntoView({ block: "start", behavior: "smooth" });
      });
    });
  };

  wrap.innerHTML = `<div class="section-title" style="margin:0 0 10px;"><h2>${esc(heading)}</h2></div><p style="color:var(--muted-foreground);">Loading…</p>`;
  fetchChapter(book.id, sbChapter)
    .then((verses) => {
      if (token !== sbLoadToken || view !== "studyBible") return;
      const anyTags = verses.some((v) => STRONGS_TAGS[`${book.id}.${sbChapter}.${v.n}`]);
      wrap.innerHTML = `
        <div class="section-title" style="margin:0 0 6px;"><h2>${esc(heading)}</h2>${anyTags ? `<span class="pill pill-gold">Strong's tagged</span>` : ""}</div>
        ${anyTags ? `<p class="field-hint" style="margin:0 0 8px;">Tap a word with a dotted gold underline for its Hebrew or Greek meaning.</p>` : ""}
        ${verses.map((v) => {
          const key = `${book.id}.${sbChapter}.${v.n}`;
          return `
          <div class="verse-row ${hl[key] ? "verse-highlighted" : ""}" id="verse-${v.n}">
            <div class="verse-num">${v.n}</div>
            <div class="verse-text">${renderVerseHtml(v.text, STRONGS_TAGS[key])}</div>
            ${verseActionsHtml(key)}
          </div>`;
        }).join("")}
        ${navHtml()}
        <p class="field-hint" style="margin-top:14px;">King James Version (public domain) via bible-api.com.</p>
      `;
      wireVerseActions((key) => {
        const n = parseInt(key.split(".")[2], 10);
        const v = verses.find((x) => x.n === n);
        return v ? { reference: `${book.name} ${sbChapter}:${n}`, text: v.text } : null;
      });
      wireChapterNav();
      if (sbScrollToVerse) {
        const el = document.getElementById("verse-" + sbScrollToVerse);
        sbScrollToVerse = null;
        if (el) el.scrollIntoView({ block: "center" });
      }
    })
    .catch((err) => {
      if (token !== sbLoadToken) return;
      wrap.innerHTML = `
        <div class="section-title" style="margin:0 0 10px;"><h2>${esc(heading)}</h2></div>
        <div class="warning-box">${icon("warning")}<p>${esc(err.message)}</p></div>
        <button class="btn btn-primary btn-sm" id="sbRetry">Try Again</button>`;
      document.getElementById("sbRetry").addEventListener("click", () => renderStudyBible(main));
    });
}

function verseOrder(key) {
  const [b, c, v] = key.split(".");
  const bi = BOOK_INDEX[b] ? BOOK_INDEX[b].i : 99;
  return bi * 1e6 + (parseInt(c, 10) || 0) * 1e3 + (parseInt(v, 10) || 0);
}
function prevChapter(bookId, ch) {
  if (ch > 1) return [bookId, ch - 1];
  const i = BOOK_INDEX[bookId].i;
  if (i === 0) return null;
  const [pid, , pch] = BIBLE_BOOKS[i - 1];
  return [pid, pch];
}
function nextChapter(bookId, ch) {
  if (ch < BOOK_INDEX[bookId].chapters) return [bookId, ch + 1];
  const i = BOOK_INDEX[bookId].i;
  if (i === BIBLE_BOOKS.length - 1) return null;
  return [BIBLE_BOOKS[i + 1][0], 1];
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
    ${myCourses.length === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("cap")}</div>
      <p>No courses yet.</p>
    </div>` : myCourses.map((c) => {
      const grade = computeCourseGrade(c, currentStudentId);
      const rows = [...c.assignments].sort((a, b) => a.due.localeCompare(b.due));
      const letterCls = grade.letter === "F" ? "pill-gray" : grade.letter === "A" || grade.letter === "B" ? "pill-green" : "pill-navy";
      rows.forEach((a) => {
        const sub = getSubmission(c, a, currentStudentId);
        if (sub.status === "graded" && sub.feedback) feedbackRows.push({ c, a, sub });
      });
      return `
    <div class="section-title">
      <h2>${esc(c.title)}</h2>
      ${grade.pct === null ? `<span class="pill pill-gray">No grade yet</span>` : `<span><strong>${grade.pct}%</strong> <span class="pill ${letterCls}" style="margin-left:4px;">${grade.letter}</span></span>`}
    </div>
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
}

// Faculty: everything turned in across every course, waiting on a grade,
// plus a quick look at what's already been graded.
function renderGrading(main) {
  const activeCourses = courses.filter((c) => !c.archived);
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
      <div class="eyebrow">Faculty &amp; Admin</div>
      <h1>Grading</h1>
      <p>Work turned in across every course, waiting on a grade.</p>
    </div>
    <div class="section-title"><h2>Grade Sheets</h2></div>
    ${activeCourses.length === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("cap")}</div>
      <p>No active courses yet — add one from the Courses page first.</p>
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
      <h1 style="margin-top:10px;">${esc(c.title)}</h1>
      <p>Grade Sheet · ${students.length} student${students.length === 1 ? "" : "s"}</p>
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
                        if (a.due < todayStr()) {
                          return `<td><span class="cell-status cell-missing">Missing</span></td>`;
                        }
                        return `<td><span class="cell-status cell-notdue">—</span></td>`;
                      })
                      .join("")
                  )
                  .join("");
                const letterCls = grade.letter === "F" ? "pill-gray" : grade.letter === "A" || grade.letter === "B" ? "pill-green" : "pill-navy";
                return `<tr>
                <td class="gs-sticky"><strong>${esc(u.name)}</strong></td>
                ${cells}
                <td style="text-align:right;">${grade.pct === null ? `<span style="color:var(--muted-foreground);">Not yet</span>` : `<strong>${grade.pct}%</strong> <span class="pill ${letterCls}">${grade.letter}</span>`}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <p style="color:var(--muted-foreground);font-size:.8rem;margin:14px 0 0;">Final Grade is a running average of everything graded so far, weighted the way each assignment (or weekly series) was set up in Manage. An assignment past its due date with nothing turned in counts as a zero; work still awaiting a grade doesn't count yet. A <span class="late-dot">●</span> marks a submission that came in after its due date — grading is still entirely up to you, case by case.</p>`}
    </div>
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "grading"; renderNav(); renderMain(); });
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
        ${sub.fileName ? `<p style="font-size:.85rem;margin-top:10px;">Submitted: <strong>${esc(sub.fileName)}</strong>${sub.submittedAt ? " on " + parseDay(sub.submittedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ""} ${sub.storagePath ? `<button class="btn btn-ghost btn-sm" id="gradeOpenFile" style="margin-left:6px;">Open File</button>` : ""}</p>` : sub.writtenContent ? `<p style="font-size:.85rem;margin-top:10px;">Written in editor${sub.submittedAt ? " on " + parseDay(sub.submittedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ""}:</p><div class="written-view">${safeHtml(sub.writtenContent)}</div>` : `<p style="font-size:.85rem;color:var(--muted-foreground);margin-top:10px;">No file was attached.</p>`}
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
  if (openBtn) openBtn.addEventListener("click", () => openStoredFile("submissions", sub.storagePath, sub.fileName, openBtn));
  document.getElementById("gradeSave").addEventListener("click", () => {
    const scoreInput = document.getElementById("gradeScore");
    const score = parseFloat(scoreInput.value);
    if (isNaN(score) || score < 0) { toast("Enter a score of 0 or more."); scoreInput.focus(); return; }
    if (score > assignment.points && !confirm(`${score} is more than the ${assignment.points} points possible. Save it anyway (e.g. extra credit)?`)) return;
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
      : courses.filter((c) => !c.archived);
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${role === "student" ? "Student Dashboard" : "Faculty & Admin"}</div>
      <h1>Discussion Board</h1>
      <p>Each course has its own board — pick a class to join the conversation.</p>
    </div>
    ${list.length === 0 ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("chat")}</div>
      <p>${role === "student" ? "Once a course you're enrolled in goes live, its board will appear here." : "No courses to show yet."}</p>
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
    <button class="back-link" id="backLink">&larr; Back to Discussion Board</button>
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
  document.getElementById("backLink").addEventListener("click", () => { view = "discussion"; renderNav(); renderMain(); });
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
        <div><strong>${esc(userName(p.authorId))}</strong>${roleTag(p.authorId)}</div>
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
              <div><strong>${esc(userName(r.authorId))}</strong>${roleTag(r.authorId)}</div>
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
    btn.addEventListener("click", () => {
      if (!confirm("Delete this post and all of its replies?")) return;
      run(() => DB.deletePost(btn.dataset.deletePost));
    });
  });
  wrap.querySelectorAll("[data-delete-reply]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [, rid] = btn.dataset.deleteReply.split("|");
      if (!confirm("Delete this reply?")) return;
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
  return users.find((u) => u.id === c.facultyId && u.role === "faculty") || users.find((u) => u.role === "faculty") || { id: null, name: "Your instructor" };
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
    // Every faculty account has full admin access (see Settings), so the
    // inbox spans every active course, not just ones they're assigned to.
    courses.filter((c) => !c.archived).forEach((c) => {
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
          const mine = courses.filter((c) => !c.archived);
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
      <div class="eyebrow">${role === "student" ? "Student Dashboard" : "Faculty & Admin"}</div>
      <h1>${role === "student" ? "Send Message" : "Message Inbox"}</h1>
      <p>${role === "student" ? "A private conversation with each of your instructors — classmates can't see it, and you can't message other students." : "One private conversation per student, per class you teach."}</p>
    </div>
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
          ${c.archived ? `<button class="btn btn-danger btn-sm" id="mgDeleteCourse">Delete Course</button>` : ""}
        </div>
      </div>
      <p>${esc(c.description)} · ${c.credits} credit${c.credits === 1 ? "" : "s"}</p>
    </div>

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

    <div id="mgEnrollRequestsSection"></div>

    <div class="section-title"><h2>Roster</h2></div>
    <div class="card">
      <p style="color:var(--muted-foreground);font-size:.85rem;margin-top:0;">${c.studentIds.length} student${c.studentIds.length === 1 ? "" : "s"} enrolled.</p>
      <div id="mgRosterList"></div>
    </div>

    <div class="section-title"><h2>Course Materials</h2></div>
    <div class="card">
      <ul class="materials-list" id="mgMaterialsList"></ul>
      <label for="mgAddFile" style="margin-top:16px;">Add a Document</label>
      <input type="file" id="mgAddFile" multiple accept="${UPLOAD_ACCEPT}" />
      <div class="field-hint">PDF, Word, PowerPoint, text, images, or audio — up to 50 MB each. Only students enrolled in this course can open them.</div>
    </div>

    <div class="section-title"><h2>Assignments</h2><button class="btn btn-gold btn-sm" id="mgAddAssignment">+ Add Assignment</button></div>
    <div class="card">
      <ul class="assignments-list" id="mgAssignmentsList"></ul>
    </div>
  `;

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

  renderEnrollmentRequests(c);
  renderRosterList(c);
  renderMaterialsList(c);
  renderAssignmentsList(c);

  document.getElementById("mgAddFile").addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    if (!files.length) return;
    run(() => DB.addMaterials(c.id, files), null, { success: files.length === 1 ? `"${files[0].name}" was added.` : `${files.length} documents were added.` });
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
        <label for="ecInstructor">Instructor</label>
        <select id="ecInstructor">
          <option value="" ${course.facultyId ? "" : "selected"}>Not assigned</option>
          ${users.filter((u) => u.role === "faculty" && u.status === "active").map((u) => `<option value="${u.id}" ${u.id === course.facultyId ? "selected" : ""}>${esc(u.name)}</option>`).join("")}
        </select>
        <div class="field-hint">Students in this course message this instructor privately from Send Message.</div>
        <div class="form-actions">
          <button class="btn btn-primary" id="ecSave">Save Changes</button>
          <button class="btn btn-ghost" id="ecCancel">Cancel</button>
        </div>
      </div>
    </div>`;
  document.getElementById("ecCancel").addEventListener("click", closeModal);
  document.getElementById("ecSave").addEventListener("click", () => {
    const nameInput = document.getElementById("ecName");
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    const patch = {
      title: name,
      description: document.getElementById("ecDesc").value.trim() || "No description yet.",
      credits: parseInt(document.getElementById("ecCredits").value, 10) || 1,
      level: document.getElementById("ecLevel").value,
      faculty_id: document.getElementById("ecInstructor").value || null,
    };
    run(async () => { await DB.updateCourse(course.id, patch); closeModal(); }, null, { success: "Course details saved." });
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
  if (a.due < todayStr() && sub.status !== "submitted") return 0;
  return null;
}

function pctToLetter(pct) {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
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
  const pct = weightUsed > 0 ? Math.round((weightedSum / weightUsed) * 1000) / 10 : null;
  return { pct, letter: pct === null ? null : pctToLetter(pct), categories };
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
  wrap.innerHTML = `<li class="weight-total ${weightOk ? "weight-ok" : "weight-off"}" style="border:none;padding-top:0;">
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
            <div style="font-size:.82rem;color:var(--muted-foreground);margin-top:4px;">Due ${parseDay(a.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${a.points} pts${a.weight ? ` · ${a.weight}% of grade` : ""} · ${turnedIn}/${c.studentIds.length} turned in · ${gradedCount} graded</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
            <button class="btn btn-ghost btn-sm" data-view-roster="${a.id}">View Submissions</button>
            <button class="btn btn-ghost btn-sm" data-delete-assignment="${a.id}" aria-label="Delete ${esc(a.title)}">Delete</button>
          </div>
        </li>`;
      }
      const totalTurned = g.items.reduce((n, a) => n + ensureSubmissions(c, a).filter((s) => s.status === "submitted" || s.status === "graded").length, 0);
      const totalGraded = g.items.reduce((n, a) => n + ensureSubmissions(c, a).filter((s) => s.status === "graded").length, 0);
      const possible = g.items.length * c.studentIds.length;
      const next = g.items.find((a) => a.due >= todayStr()) || g.items[g.items.length - 1];
      return `<li>
        <div>
          <div><strong>🔁 ${esc(g.seriesLabel)}</strong> <span class="pill pill-navy" style="margin-left:6px;">${g.items.length} weeks</span></div>
          <div style="font-size:.82rem;color:var(--muted-foreground);margin-top:4px;">Next due ${parseDay(next.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${g.items[0].points} pts each${g.items[0].weight ? ` · ${g.items[0].weight}% of grade (whole series)` : ""} · ${totalTurned}/${possible} turned in · ${totalGraded} graded</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-ghost btn-sm" data-view-series="${g.seriesId}">View Weeks</button>
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
  const deleteAssignments = (items, label) => {
    const turnedIn = items.reduce((n, a) => n + (a.submissions || []).filter((s) => s.status === "submitted" || s.status === "graded").length, 0);
    const warn = turnedIn ? `\n\n${turnedIn} submission${turnedIn === 1 ? "" : "s"} and any grades on ${items.length === 1 ? "it" : "them"} will be permanently deleted.` : "";
    if (!confirm(`Delete ${label}?${warn}`)) return;
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
    });
  });
  document.querySelectorAll('input[name="asgAvail"]').forEach((r) => r.addEventListener("change", syncLockFieldsUI));

  document.getElementById("asgCancel").addEventListener("click", closeModal);
  document.getElementById("asgSave").addEventListener("click", () => {
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
    run(async () => { await DB.addAssignments(course.id, rows); closeModal(); }, null,
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
                  <div style="font-size:.8rem;color:var(--muted-foreground);">Due ${parseDay(a.due).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · ${turnedIn}/${course.studentIds.length} turned in · ${gradedCount} graded</div>
                </div>
                <button class="btn btn-ghost btn-sm" data-week-roster="${a.id}">View Submissions</button>
              </li>`;
            })
            .join("")}
        </ul>
        <div class="form-actions"><button class="btn btn-ghost" id="seriesClose">Close</button></div>
      </div>
    </div>`;
  document.getElementById("seriesClose").addEventListener("click", closeModal);
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
        <button class="btn btn-ghost btn-sm" data-remove-student="${u.id}">Remove</button>
      </div>`
      )
      .join("")}
    <button class="btn btn-gold btn-sm" id="mgAddStudent" style="margin-top:14px;">+ Add Student</button>
  `;
  wrap.querySelectorAll("[data-remove-student]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const removedId = btn.dataset.removeStudent;
      // A student's private messages with this course's instructor go
      // with their enrollment — once they're off the roster, there's no
      // relationship left for the thread to belong to. Their submitted
      // work and grades are kept (and return if they're re-added).
      if (!confirm(`Remove ${userName(removedId)} from ${c.title}?\n\nTheir private messages for this course will be deleted. Their submitted work and grades are kept.`)) return;
      run(() => DB.unenroll(c.id, removedId));
    });
  });
  document.getElementById("mgAddStudent").addEventListener("click", () => openAddStudentModal(c));
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

// Open, download, or print one course material — used by both the faculty
// Manage page and the student course page.
function openMaterialViewer(course, material) {
  const root = document.getElementById("modalRoot");
  const hasFile = !!material.storagePath;
  const mime = material.mimeType || "";
  const isImage = hasFile && mime.startsWith("image/") && !/heic|heif/.test(mime);
  const isPdf = hasFile && mime === "application/pdf";
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width:720px;" role="dialog" aria-modal="true" aria-label="${esc(material.title)}">
        <span class="type-badge">${TYPE_LABEL[material.type] || "Material"}</span>
        <h2 style="font-size:1.15rem;margin-top:4px;">${esc(material.title)}</h2>
        <p style="color:var(--muted-foreground);font-size:.85rem;">${esc(course.title)}${material.size ? ` · ${(material.size / 1048576).toFixed(1)} MB` : ""}</p>
        <div id="matPreview" style="margin-top:14px;">
          ${!hasFile ? `<div class="card empty-state" style="padding:24px;"><p>No file is attached to this item.</p></div>`
            : isImage || isPdf ? `<p style="color:var(--muted-foreground);">Loading preview…</p>`
            : `<div class="card empty-state" style="padding:24px;"><p>This file type can't preview here — use Download to save it, or Open in New Tab.</p></div>`}
        </div>
        <p id="matStatus" style="font-size:.82rem;color:var(--muted-foreground);min-height:1.2em;margin:10px 0 0;"></p>
        <div class="form-actions" style="flex-wrap:wrap;">
          <button class="btn btn-primary" id="matDownload" ${hasFile ? "" : "disabled"}>Download</button>
          <button class="btn btn-outline-gold" id="matNewTab" ${hasFile ? "" : "disabled"}>Open in New Tab${isPdf || isImage ? " (to Print)" : ""}</button>
          <button class="btn btn-ghost" id="matClose">Close</button>
        </div>
      </div>
    </div>`;
  document.getElementById("matClose").addEventListener("click", closeModal);
  if (!hasFile) return;
  const statusEl = document.getElementById("matStatus");
  if (isImage || isPdf) {
    DB.fileUrl("materials", material.storagePath)
      .then((url) => {
        const box = document.getElementById("matPreview");
        if (!box) return;
        box.innerHTML = isImage
          ? `<img src="${url}" alt="${esc(material.title)}" style="width:100%;border-radius:8px;border:1px solid var(--border);" />`
          : `<iframe src="${url}" title="${esc(material.title)}" style="width:100%;height:58vh;border:1px solid var(--border);border-radius:8px;"></iframe>`;
      })
      .catch((e) => { const box = document.getElementById("matPreview"); if (box) box.innerHTML = `<div class="warning-box">${icon("warning")}<p>${esc(friendlyError(e))}</p></div>`; });
  }
  document.getElementById("matDownload").addEventListener("click", async () => {
    statusEl.textContent = "Preparing download…";
    try {
      const url = await DB.fileUrl("materials", material.storagePath, material.title);
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      statusEl.textContent = "Downloading — check your downloads.";
    } catch (e) {
      statusEl.textContent = friendlyError(e);
    }
  });
  document.getElementById("matNewTab").addEventListener("click", (e) => openStoredFile("materials", material.storagePath, material.title, e.currentTarget));
}

function renderMaterialsList(c) {
  const wrap = document.getElementById("mgMaterialsList");
  if (!wrap) return;
  if (c.materials.length === 0) {
    wrap.innerHTML = `<li style="border:none;color:var(--muted-foreground);">No documents attached yet.</li>`;
    return;
  }
  wrap.innerHTML = c.materials
    .map(
      (m) => `
    <li>
      <div><span class="type-badge">${TYPE_LABEL[m.type] || "Material"}</span><div><strong>${esc(m.title)}</strong></div></div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-ghost btn-sm" data-open-material="${m.id}">Open</button>
        <button class="btn btn-ghost btn-sm" data-remove-material="${m.id}">Remove</button>
      </div>
    </li>`
    )
    .join("");
  wrap.querySelectorAll("[data-open-material]").forEach((btn) => {
    btn.addEventListener("click", () => openMaterialViewer(c, c.materials.find((m) => m.id === btn.dataset.openMaterial)));
  });
  wrap.querySelectorAll("[data-remove-material]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = c.materials.find((x) => x.id === btn.dataset.removeMaterial);
      if (!confirm(`Remove "${m.title}" from ${c.title}? Students will no longer be able to open it.`)) return;
      run(() => DB.removeMaterial(m), null, { success: "Removed." });
    });
  });
}

let resourceLibraryQuery = "";
let resourceLibraryCourse = "";
const PHYSICAL_RESULT_CAP = 60;

// Resource Library: a single search across the church's Google Drive
// documents and the physical church library book list, by keyword/topic
// or by course. For students, the course dropdown is curated down to the
// classes they're actually enrolled in; faculty see every active course.
function renderResourceLibrary(main) {
  const q = resourceLibraryQuery.trim().toLowerCase();
  const courseId = resourceLibraryCourse;
  const hasSearch = q.length > 0 || courseId !== "";

  let digitalResults = [];
  let physicalResults = [];
  let physicalTotal = 0;

  if (hasSearch) {
    digitalResults = digitalLibrary.filter((d) => {
      const courseOk = !courseId || d.courseIds.includes(courseId);
      const kwOk = !q || [d.title, d.author, d.topic].some((t) => t && t.toLowerCase().includes(q));
      return courseOk && kwOk;
    });

    let pool = physicalLibrary;
    if (courseId) {
      const subs = COURSE_SUBJECTS[courseId] || [];
      pool = pool.filter(([t, a, s]) => subs.includes(s));
    }
    if (q) {
      pool = pool.filter(([t, a, s]) => t.toLowerCase().includes(q) || (a && a.toLowerCase().includes(q)));
    }
    physicalTotal = pool.length;
    physicalResults = pool.slice(0, PHYSICAL_RESULT_CAP);
  }

  const eligibleCourses = courses
    .filter((c) => !c.archived && (role !== "student" || c.studentIds.includes(currentStudentId)))
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title));
  const courseOptions = eligibleCourses
    .map((c) => `<option value="${c.id}" ${c.id === courseId ? "selected" : ""}>${esc(c.title)}</option>`)
    .join("");
  const courseLabel = role === "student" ? "One of your classes" : "Course";
  const courseEmptyOption = role === "student" ? "All my classes" : "All courses";

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">Resources</div>
      <h1>Resource Library</h1>
      <p>Search course reading by keyword or topic, or pick a class to see the books and documents that match it — pulled from the church's Google Drive and the physical church library at once.</p>
    </div>
    <div class="card">
      <label for="resSearchInput">Keyword or topic</label>
      <input type="text" id="resSearchInput" placeholder="e.g. Westcott and Hort, preaching, Genesis…" value="${esc(resourceLibraryQuery)}">
      <label for="resCourseSelect">${esc(courseLabel)}</label>
      <select id="resCourseSelect">
        <option value="">${esc(courseEmptyOption)}</option>
        ${courseOptions}
      </select>
      ${eligibleCourses.length === 0 && role === "student" ? `<p class="field-hint">You're not enrolled in any active classes yet, so course curation isn't available — keyword search still works.</p>` : ""}
    </div>
    ${
      !hasSearch
        ? `
    <div class="card empty-state">
      <div class="icon-badge" style="margin:0 auto 14px;">${icon("search")}</div>
      <p>Type a keyword or choose a class above to search both libraries at once.</p>
    </div>`
        : `
    <div class="section-title"><h2>From the Google Drive Library</h2><span class="pill pill-navy">${digitalResults.length} found</span></div>
    ${
      digitalResults.length === 0
        ? `<p style="color:var(--muted-foreground);">No matching documents on the Drive.</p>`
        : `<ul class="materials-list">
      ${digitalResults
        .map(
          (d) => `
        <li>
          <div>
            <span class="type-badge">Digital</span>
            <div style="font-weight:600;">${esc(d.title)}</div>
            <p style="margin:2px 0 0;color:var(--muted-foreground);font-size:.85rem;">${d.author ? esc(d.author) + " — " : ""}${esc(d.topic)}</p>
            <div class="chip-row" style="margin-top:6px;">
              ${d.courseIds.map((cid) => { const c = courses.find((x) => x.id === cid); return c ? `<span class="pill pill-gray">${esc(c.title)}</span>` : ""; }).join("")}
            </div>
          </div>
          <a class="btn btn-ghost btn-sm" href="${esc(d.url)}" target="_blank" rel="noopener">Open</a>
        </li>`
        )
        .join("")}
      </ul>`
    }

    <div class="section-title"><h2>From the Church Library</h2><span class="pill pill-navy">${physicalTotal} found</span></div>
    <p style="color:var(--muted-foreground);font-size:.85rem;margin-top:-8px;">${esc(LIBRARY_CHECKOUT_POLICY)}</p>
    ${
      physicalTotal === 0
        ? `<p style="color:var(--muted-foreground);">No matching titles in the church library.</p>`
        : `<ul class="materials-list">
      ${physicalResults
        .map(
          ([t, a, s]) => `
        <li>
          <div>
            <span class="type-badge">Physical</span>
            <div style="font-weight:600;">${esc(t)}</div>
            <p style="margin:2px 0 0;color:var(--muted-foreground);font-size:.85rem;">${a ? esc(a) + " — " : ""}${esc(s)}</p>
          </div>
        </li>`
        )
        .join("")}
      </ul>
      ${physicalTotal > PHYSICAL_RESULT_CAP ? `<p style="color:var(--muted-foreground);font-size:.85rem;">+${physicalTotal - PHYSICAL_RESULT_CAP} more — narrow your search, or ask the librarian at the church office to see the full shelf list.</p>` : ""}`
    }
    `
    }
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  const searchInput = document.getElementById("resSearchInput");
  searchInput.addEventListener("input", (e) => { resourceLibraryQuery = e.target.value; renderResourceLibrary(main); });
  searchInput.focus();
  searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  document.getElementById("resCourseSelect").addEventListener("change", (e) => { resourceLibraryCourse = e.target.value; renderResourceLibrary(main); });
}

function renderSettings(main) {
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">Faculty &amp; Admin</div>
      <h1>Settings</h1>
    </div>
    ${currentUser && currentUser.superAdmin ? `
    <div class="section-title"><h2>Super Admins</h2><span class="pill pill-navy">${countSuperAdmins()}/${MAX_SUPER_ADMINS}</span></div>
    <div class="card">
      <div id="superAdminWrap"></div>
    </div>
    <p style="color:var(--muted-foreground);font-size:.85rem;">Super Admins can add or remove other Super Admins, up to ${MAX_SUPER_ADMINS} at a time. It's a separate tier from Faculty/Admin below — someone can hold both, either one, or neither.</p>
    ` : ""}
    <div class="section-title"><h2>Users &amp; Roles</h2></div>
    <div class="card">
      <div class="card-row">
        <div class="subtabs" id="userTabs">
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
    <p style="color:var(--muted-foreground);font-size:.85rem;">New accounts appear here automatically as students, active by default. Every faculty account has full admin access over courses and grading — there's no separate tier for that. Super Admin (above, visible only to current Super Admins) is the one exception: a small, separately-managed permission for who can grant it to others.</p>
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });

  document.getElementById("userTabs").querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => { userTab = b.dataset.tab; renderUserList(); });
  });
  document.getElementById("sortSelect").value = userSort;
  document.getElementById("sortSelect").addEventListener("change", (e) => { userSort = e.target.value; renderUserList(); });

  if (currentUser && currentUser.superAdmin) renderSuperAdminList();
  renderUserList();
}

function renderSuperAdminList() {
  const wrap = document.getElementById("superAdminWrap");
  if (!wrap) return;
  const admins = users.filter((u) => u.superAdmin && u.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  const eligible = users.filter((u) => !u.superAdmin && u.status === "active").sort((a, b) => a.name.localeCompare(b.name));
  const atMax = admins.length >= MAX_SUPER_ADMINS;
  wrap.innerHTML = `
    ${admins.length === 0 ? `<div class="empty-state"><p>No Super Admins right now.</p></div>` : admins
      .map(
        (u) => `
      <div class="user-row">
        <div class="user-info">
          <div class="u-name">${esc(u.name)} <span class="pill ${u.role === "faculty" ? "pill-gold" : "pill-navy"}" style="margin-left:6px;">${u.role}</span></div>
          <div class="u-email">${esc(u.email)}</div>
        </div>
        <button class="btn btn-danger btn-sm" data-remove-admin="${u.id}">Remove</button>
      </div>`
      )
      .join("")}
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
      ${
        atMax
          ? `<p class="field-hint">Maximum of ${MAX_SUPER_ADMINS} Super Admins reached — remove one before adding another.</p>`
          : eligible.length === 0
            ? `<p class="field-hint">No other active accounts to promote.</p>`
            : `<label for="superAdminSelect">Add a Super Admin</label>
             <select id="superAdminSelect">${eligible.map((u) => `<option value="${u.id}">${esc(u.name)} — ${esc(u.email)}</option>`).join("")}</select>
             <div class="form-actions"><button class="btn btn-gold btn-sm" id="addSuperAdminBtn">Make Super Admin</button></div>`
      }
    </div>
  `;
  wrap.querySelectorAll("[data-remove-admin]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = users.find((x) => x.id === btn.dataset.removeAdmin);
      const self = currentUser && u.id === currentUser.id;
      if (self && !confirm("Remove your own Super Admin access? You won't be able to undo this yourself.")) return;
      run(() => DB.updateProfile(u.id, { super_admin: false }), () => { renderAccountPill(); renderMain(); });
    });
  });
  const addBtn = wrap.querySelector("#addSuperAdminBtn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const sel = document.getElementById("superAdminSelect");
      const u = users.find((x) => x.id === sel.value);
      if (u && countSuperAdmins() < MAX_SUPER_ADMINS) run(() => DB.updateProfile(u.id, { super_admin: true }), null, { success: `${u.name} is now a Super Admin.` });
    });
  }
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
  const list = sortedUsers(users.filter((u) => u.status === userTab));

  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><p>No ${userTab} users.</p></div>`;
    return;
  }

  wrap.innerHTML = list
    .map(
      (u) => `
    <div class="user-row" data-user="${u.id}">
      <div class="user-info">
        <div class="u-name">${esc(u.name)}${u.superAdmin ? ` <span class="pill pill-gold" title="Super Admin">★ Super Admin</span>` : ""}</div>
        <div class="u-email">${esc(u.email)}</div>
      </div>
      <div class="user-actions">
        ${
          userTab === "active"
            ? `<div class="role-toggle" data-role-toggle="${u.id}">
                <button data-role="student" class="${u.role === "student" ? "active" : ""}">Student</button>
                <button data-role="faculty" class="${u.role === "faculty" ? "active" : ""}">Faculty</button>
              </div>
              <button class="btn btn-ghost btn-sm" data-inactive="${u.id}">Make Inactive</button>`
            : `<span class="pill ${u.role === "faculty" ? "pill-gold" : "pill-navy"}">${u.role}</span>
              <button class="btn btn-ghost btn-sm" data-reactivate="${u.id}">Reactivate</button>`
        }
        <button class="btn btn-danger btn-sm" data-delete="${u.id}">Delete</button>
      </div>
    </div>`
    )
    .join("");

  wrap.querySelectorAll("[data-role-toggle]").forEach((toggle) => {
    toggle.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const u = users.find((x) => x.id === toggle.dataset.roleToggle);
        const newRole = btn.dataset.role;
        if (u.role === newRole) return;
        const self = currentUser && u.id === currentUser.id;
        if (self && newRole === "student" && !confirm("Change your own account to Student? You'll lose access to faculty pages, including this one.")) return;
        if (!self && newRole === "faculty" && !confirm(`Make ${u.name} Faculty? Faculty have full admin access to every course, grade, and account.`)) return;
        run(() => DB.updateProfile(u.id, { role: newRole }), () => {
          // Changing your own role takes effect right away.
          if (self) {
            currentUser.role = newRole;
            role = newRole;
            currentStudentId = u.id;
            if (newRole === "student") view = "home";
            renderAccountPill();
            renderNav();
            renderMain();
          } else {
            renderUserList();
          }
        }, { success: `${u.name} is now ${newRole === "faculty" ? "Faculty" : "a Student"}.` });
      });
    });
  });

  wrap.querySelectorAll("[data-inactive]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const u = users.find((x) => x.id === btn.dataset.inactive);
      const self = currentUser && u.id === currentUser.id;
      if (self && !confirm("Make your own account inactive? You'll be signed out and won't be able to sign back in until another faculty member reactivates you.")) return;
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
        settled = true;
        startSession(session, { force: event === "PASSWORD_RECOVERY" });
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
