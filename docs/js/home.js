// True North Baptist Church Bible Institute — what to do next.
//
//   • This Week (students): the next class, what's due in the next seven days
//     (and whether it's turned in), and the next lecture to watch — each one
//     tap away.
//   • Needs Your Attention (faculty): work to grade, attendance not taken,
//     enrollment requests, unread messages, sign-ups waiting, and courses
//     whose set-up isn't finished.
//   • Course set-up checklist (Manage → Overview): ticks itself as the
//     teacher goes, and disappears once everything is done.
//   • askConfirm(): an "Are you sure?" box drawn inside the page, in place of
//     the browser's own pop-up (which looks out of place on phones and is
//     blocked in some app browsers).

// ---------------------------------------------------------------------------
// In-page confirm
// ---------------------------------------------------------------------------
// askConfirm("Delete this reply?") or
// askConfirm({ title, text, ok: "Delete", danger: true }) → Promise<boolean>
function askConfirm(opts) {
  if (typeof opts === "string") {
    // "Question?\n\nDetails" → a short title and the details beneath it.
    let parts = opts.split(/\n\n/);
    if (parts.length === 1) {
      const m = /^(.+?\?)\s+(\S[\s\S]*)$/.exec(opts);
      if (m) parts = [m[1], m[2]];
    }
    opts = { title: parts[0], text: parts.slice(1).join("\n\n") };
  }
  const verb = (/^(Delete|Remove|Archive|Clear|Import|Close|Switch)\b/.exec(opts.title || "") || [])[1];
  const { title = "Are you sure?", text = "", ok = verb || "Yes", cancel = "Cancel", danger = /delete|remove|clear|inactive|archive/i.test(opts.title || "") } = opts;
  if (window.TNBBI_AUTO_CONFIRM) return Promise.resolve(window.TNBBI_AUTO_CONFIRM !== "no");
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const root = document.createElement("div");
    root.id = "confirmRoot";
    root.innerHTML = `
      <div class="confirm-backdrop">
        <div class="confirm-box" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle" ${text ? `aria-describedby="confirmText"` : ""}>
          <h3 id="confirmTitle">${esc(title)}</h3>
          ${text ? `<p id="confirmText">${esc(text).replace(/\n/g, "<br>")}</p>` : ""}
          <div class="confirm-actions">
            <button type="button" class="btn btn-ghost" id="confirmNo">${esc(cancel)}</button>
            <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirmYes">${esc(ok)}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    const done = (v) => {
      document.removeEventListener("keydown", keys, true);
      root.remove();
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* gone */ }
      resolve(v);
    };
    const keys = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === "Tab") { // keep focus inside the box
        const b = [root.querySelector("#confirmNo"), root.querySelector("#confirmYes")];
        e.preventDefault();
        (document.activeElement === b[0] ? b[1] : b[0]).focus();
      }
    };
    document.addEventListener("keydown", keys, true);
    root.querySelector("#confirmNo").addEventListener("click", () => done(false));
    root.querySelector("#confirmYes").addEventListener("click", () => done(true));
    root.querySelector(".confirm-backdrop").addEventListener("click", (e) => { if (e.target === e.currentTarget) done(false); });
    root.querySelector(danger ? "#confirmNo" : "#confirmYes").focus();
  });
}

// ---------------------------------------------------------------------------
// Students: This Week
// ---------------------------------------------------------------------------
function myActiveCourses() {
  return courses.filter((c) => !c.archived && c.studentIds.includes(currentStudentId));
}
function thisWeekItems() {
  const sid = currentStudentId;
  const today = todayStr();
  const weekOut = addDaysISO(today, 7);
  const mine = myActiveCourses();
  // The next class (the soonest across courses that meet on a schedule).
  let next = null;
  mine.forEach((c) => {
    if (!isLive(c) && !(c.schedule.startDate && c.schedule.startDate <= weekOut)) return;
    const m = nextClassMoment(c);
    if (m && (!next || m.at < next.at)) next = { c, ...m };
  });
  const live = mine.filter((c) => classInSession(c) && courseHasLectures(c) && effTrack(c, sid) !== "classroom");
  // Work due within a week (or overdue), plus what was turned in for it.
  const due = [];
  mine.forEach((c) => c.assignments.forEach((a) => {
    const d = dueFor(c, a, sid);
    if (!d || d > weekOut) return;
    const sub = getSubmission(c, a, sid);
    const done = sub.status === "submitted" || sub.status === "graded";
    const lock = assignmentLock(a);
    if (done && d < today) return;          // finished and past: nothing to show
    if (!done && d < addDaysISO(today, -21)) return; // long-forgotten: leave to My Grades
    due.push({ c, a, d, sub, done, lock, overdue: !done && d < today });
  }));
  due.sort((x, y) => (x.done - y.done) || x.d.localeCompare(y.d) || x.a.title.localeCompare(y.a.title));
  // The next lecture to watch, for students who attend by watching.
  const lectures = [];
  mine.forEach((c) => {
    if (!courseHasLectures(c)) return;
    if (c.pace !== "self" && effTrack(c, sid) === "classroom") return;
    const open = c.lessons.filter((l) => playableLesson(l) && lessonOpensOn(c, l, sid) <= today);
    const l = open.find((x) => watchedPct(x, sid) < WATCH_SHARE);
    if (l) lectures.push({ c, l, by: lessonWatchBy(c, l, sid) });
  });
  lectures.sort((x, y) => x.by.localeCompare(y.by));
  return { mine, next, live, due, lectures };
}

function thisWeekCardHtml() {
  const { mine, next, live, due, lectures } = thisWeekItems();
  if (!mine.length) {
    return `<div class="card week-card">
      <div class="week-head"><h2>${icon("calendar")} This Week</h2></div>
      <p class="week-empty">You're not in a class yet. Open <a href="#" data-week-go="courses">My Courses</a> to request a seat.</p>
    </div>`;
  }
  const open = due.filter((x) => !x.done);
  const shown = due.slice(0, 6);
  const dayText = (d) => {
    const today = todayStr();
    if (d === today) return "today";
    if (d === addDaysISO(today, 1)) return "tomorrow";
    return fmtDay(d, { weekday: "short", month: "short", day: "numeric" });
  };
  const row = ({ c, a, d, sub, done, lock, overdue }) => `
    <li><button type="button" class="week-row ${done ? "week-done" : ""} ${overdue ? "week-overdue" : ""}" data-week-asg="${c.id}|${a.id}">
      <span class="week-mark" aria-hidden="true">${done ? icon("check") : overdue ? "!" : lock.locked ? icon("lock") : ""}</span>
      <span class="week-text"><strong>${esc(a.title)}</strong><small>${esc(c.title)} · ${done ? (sub.status === "graded" ? `Graded ${sub.score}/${a.points}` : "Turned in") : overdue ? `Was due ${esc(dayText(d))}` : lock.locked ? `Opens ${esc(fmtDay(lock.opensOn, { month: "short", day: "numeric" }))} · due ${esc(dayText(d))}` : `Due ${esc(dayText(d))}`}</small></span>
      <span class="week-go">${done ? "View" : lock.locked ? "" : sub.status === "in_progress" ? "Continue" : "Open"}</span>
    </button></li>`;
  return `<div class="card week-card" id="thisWeek">
    <div class="week-head">
      <h2>${icon("calendar")} This Week</h2>
      <span class="week-sum">${open.length ? `${open.length} to do` : "✓ All caught up"}</span>
    </div>
    ${live.map((c) => `<button type="button" class="week-live" data-week-live="${c.id}"><span class="live-dot" aria-hidden="true"></span><span><strong>${esc(c.title)} is live now</strong><small>Tap to watch the class</small></span>${icon("video")}</button>`).join("")}
    ${next && !live.some((c) => c.id === next.c.id) ? `
    <button type="button" class="week-next" data-week-course="${next.c.id}">
      <span class="week-next-label">Next class</span>
      <strong>${esc(next.c.title)}</strong>
      <small>${esc(classTimeText(next.at))}${next.c.location ? ` · ${esc(next.c.location)}` : ""}</small>
    </button>` : ""}
    ${shown.length ? `<ul class="week-list">${shown.map(row).join("")}</ul>` : `<p class="week-empty">Nothing is due in the next seven days.</p>`}
    ${lectures.slice(0, 2).map(({ c, l }) => `
    <button type="button" class="week-row week-lecture" data-week-lesson="${c.id}|${l.id}">
      <span class="week-mark" aria-hidden="true">${icon("video")}</span>
      <span class="week-text"><strong>${esc(l.title || "Lecture")}</strong><small>${esc(c.title)} · next lecture to watch</small></span>
      <span class="week-go">Watch</span>
    </button>`).join("")}
    <div class="week-foot"><a href="#" id="thisWeekAll">See all assignments</a></div>
  </div>`;
}
function wireThisWeek(main) {
  const card = main.querySelector(".week-card");
  if (!card) return;
  card.querySelectorAll("[data-week-asg]").forEach((b) => b.addEventListener("click", () => {
    const [cid, aid] = b.dataset.weekAsg.split("|");
    const c = courses.find((x) => x.id === cid);
    const a = c && c.assignments.find((x) => x.id === aid);
    if (c && a) openSubmitModal(c, a, currentStudentId, () => renderMain());
  }));
  card.querySelectorAll("[data-week-lesson]").forEach((b) => b.addEventListener("click", () => {
    const [cid, lid] = b.dataset.weekLesson.split("|");
    openLecture(cid, lid, "home");
  }));
  card.querySelectorAll("[data-week-live]").forEach((b) => b.addEventListener("click", () => openLiveClass(b.dataset.weekLive, "home")));
  card.querySelectorAll("[data-week-course]").forEach((b) => b.addEventListener("click", () => {
    activeCourseId = b.dataset.weekCourse; view = "course"; renderNav(); renderMain();
  }));
  card.querySelectorAll("[data-week-go]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault(); view = a.dataset.weekGo; renderNav(); renderMain();
  }));
  const all = card.querySelector("#thisWeekAll");
  if (all) all.addEventListener("click", (e) => { e.preventDefault(); view = "submit"; renderNav(); renderMain(); });
}

// ---------------------------------------------------------------------------
// Course set-up checklist (faculty)
// ---------------------------------------------------------------------------
function courseSetupSteps(c) {
  const steps = [
    { id: "teacher", label: "Choose the teacher", done: !!c.facultyId, go: "setup", target: "#mgTeacherCard" },
    c.pace === "self"
      ? { id: "schedule", label: "Set the number of weeks", done: !!c.schedule.weeks, go: "setup", target: "#mgWeeks" }
      : { id: "schedule", label: "Set the schedule (days and start date)", done: !!(c.schedule.startDate && c.schedule.days.length), go: "setup", target: "#mgWeeks" },
  ];
  if (c.format !== "online") steps.push({ id: "where", label: "Say where the class meets", done: !!(c.location || c.meetingUrl), go: "edit" });
  if (c.format !== "in_person") steps.push({ id: "playlist", label: "Link the YouTube playlist", done: !!c.playlistId, go: "edit" });
  steps.push(
    { id: "syllabus", label: "Add the syllabus", done: docGroups(c.materials).some((g) => g.id === "syllabus"), go: "materials" },
    { id: "assignments", label: "Add assignments", done: c.assignments.length > 0, go: "assignments" },
    { id: "students", label: "Enroll students (or approve requests)", done: c.studentIds.length > 0, go: "students" },
  );
  return steps;
}
function courseSetupDone(c) { return courseSetupSteps(c).every((s) => s.done); }
function setupChecklistHtml(c) {
  if (c.archived) return "";
  const steps = courseSetupSteps(c);
  const n = steps.filter((s) => s.done).length;
  if (n === steps.length) return "";
  return `<div class="card setup-card" id="setupChecklist">
    <div class="setup-head">
      <h2>Course set-up</h2>
      <span class="setup-count">${n} of ${steps.length} done</span>
    </div>
    <div class="setup-bar" aria-hidden="true"><span style="width:${Math.round((n / steps.length) * 100)}%"></span></div>
    <ul class="setup-list">
      ${steps.map((s) => `<li class="${s.done ? "done" : ""}">
        <span class="setup-tick" aria-hidden="true">${s.done ? icon("check") : ""}</span>
        <span class="setup-label">${esc(s.label)}${s.done ? `<span class="sr-only"> — done</span>` : ""}</span>
        ${s.done ? "" : `<button type="button" class="btn btn-ghost btn-sm" data-setup-go="${s.id}">${s.go === "edit" ? "Edit Details" : "Go"}</button>`}
      </li>`).join("")}
    </ul>
  </div>`;
}
function wireSetupChecklist(c, main) {
  const card = main.querySelector("#setupChecklist");
  if (!card) return;
  const steps = courseSetupSteps(c);
  card.querySelectorAll("[data-setup-go]").forEach((b) => b.addEventListener("click", () => {
    const s = steps.find((x) => x.id === b.dataset.setupGo);
    if (!s) return;
    if (s.go === "edit") return openEditCourseModal(c);
    const tab = main.querySelector(`.course-tab[data-tab="${s.go}"]`);
    if (tab) tab.click();
    const el = s.target && main.querySelector(s.target);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); if (el.focus) setTimeout(() => el.focus({ preventScroll: true }), 300); }
  }));
}

// ---------------------------------------------------------------------------
// Faculty: Needs Your Attention
// ---------------------------------------------------------------------------
function attentionItems() {
  const items = [];
  const taught = courses.filter((c) => !c.archived && iTeach(c));
  // Work turned in and waiting for a grade.
  taught.forEach((c) => {
    let n = 0;
    c.assignments.forEach((a) => ensureSubmissions(c, a).forEach((s) => { if (s.status === "submitted") n++; }));
    if (n) items.push({ kind: "grade", course: c, n, text: `${n} paper${n === 1 ? "" : "s"} to grade`, sub: c.title, act: "Grade" });
  });
  // Class days gone by without attendance.
  taught.filter((c) => takesClassroomAttendance(c)).forEach((c) => {
    const recent = addDaysISO(todayStr(), -14);
    const days = untakenDays(c).filter((d) => d >= recent); // the last two weeks only
    if (!days.length) return;
    const last = days[days.length - 1];
    items.push({ kind: "attendance", course: c, date: last, n: days.length,
      text: days.length === 1 ? `Attendance not taken for ${fmtDay(last)}` : `Attendance not taken for ${days.length} class days`,
      sub: c.title, act: "Take Attendance" });
  });
  // Enrollment requests for the classes I teach (Admins also see classes with no teacher yet).
  courses.filter((c) => !c.archived && (iTeach(c) || (isAdmin() && !c.facultyId)) && c.enrollmentRequests.length).forEach((c) => {
    const n = c.enrollmentRequests.length;
    items.push({ kind: "requests", course: c, n, text: `${n} enrollment request${n === 1 ? "" : "s"}`, sub: c.title, act: "Review" });
  });
  const unread = unreadMessageCount();
  if (unread) items.push({ kind: "messages", n: unread, text: `${unread} unread message${unread === 1 ? "" : "s"}`, sub: "From your students", act: "Read" });
  const waiting = pendingSignups().filter((u) => u.emailVerified).length;
  if (waiting) items.push({ kind: "signups", n: waiting, text: `${waiting} new sign-up${waiting === 1 ? "" : "s"} waiting for approval`, sub: "Settings", act: "Review" });
  // Classes I teach that are actually being offered (scheduled, or with
  // students) but aren't fully set up. Courses not on the schedule stay quiet.
  taught.filter((c) => (c.schedule.startDate || c.studentIds.length) && !courseSetupDone(c)).forEach((c) => {
    const left = courseSetupSteps(c).filter((s) => !s.done).length;
    items.push({ kind: "setup", course: c, n: left, text: `Finish setting up ${c.title}`, sub: `${left} step${left === 1 ? "" : "s"} left`, act: "Continue" });
  });
  return items;
}
function attentionCardHtml() {
  const items = attentionItems();
  const ico = { grade: "cap", attendance: "check", requests: "users", messages: "mail", signups: "user", setup: "gear" };
  return `<div class="card week-card attention-card" id="needsAttention">
    <div class="week-head">
      <h2>${icon("bell")} Needs Your Attention</h2>
      <span class="week-sum">${items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : ""}</span>
    </div>
    ${items.length ? `<ul class="week-list">${items.map((it, i) => `
      <li><button type="button" class="week-row" data-attn="${i}">
        <span class="week-mark" aria-hidden="true">${icon(ico[it.kind])}</span>
        <span class="week-text"><strong>${esc(it.text)}</strong><small>${esc(it.sub)}</small></span>
        <span class="week-go">${esc(it.act)}</span>
      </button></li>`).join("")}</ul>`
      : `<p class="week-empty">✓ You're all caught up — nothing is waiting on you.</p>`}
  </div>`;
}
function wireAttention(main) {
  const card = main.querySelector("#needsAttention");
  if (!card) return;
  const items = attentionItems();
  const go = (v, cid, tab) => {
    if (cid) activeCourseId = cid;
    if (tab && cid) courseTabs.set(`manage:${cid}`, tab);
    view = v; renderNav(); renderMain();
  };
  card.querySelectorAll("[data-attn]").forEach((b) => b.addEventListener("click", () => {
    const it = items[+b.dataset.attn];
    if (!it) return;
    if (it.kind === "grade") return go("gradeSheet", it.course.id);
    if (it.kind === "attendance") return openAttendance(it.course.id, it.date, "home");
    if (it.kind === "requests") return go("manage", it.course.id, "students");
    if (it.kind === "messages") return go("messages");
    if (it.kind === "signups") return go("settings");
    if (it.kind === "setup") return go("manage", it.course.id, "setup");
  }));
}
