// ===========================================================================
// Hybrid & online courses — lectures, the live class, and how students attend
// (added Oct 9, 2026)
// ===========================================================================
// A course can be attended three ways at once:
//   • in the classroom,
//   • live online — watching the YouTube Live stream INSIDE this site (that's
//     how live attendance is counted), with a class chat for questions,
//   • by watching the recording afterward.
// Lectures come from the course's YouTube playlist: the church's recording
// person uploads each class there (Unlisted), and the site picks it up.
// Attendance for online students is filled in by the database:
//   live: watched 75% of the class live inside the site;
//   recording: watched 95% within a week of it being posted.
// A classroom student who missed a class can make it up the same way.
// Self-paced courses: every lecture open at once; each student has one
// semester (the course's length) from the day they start.
// ===========================================================================

const FORMAT_LABEL = { in_person: "In person", hybrid: "Hybrid", online: "Online" };
const TRACK_LABEL = { classroom: "In the classroom", live: "Live online", recorded: "Recorded lectures" };
const TRACK_SHORT = { classroom: "Classroom", live: "Live online", recorded: "Recordings" };
const LIVE_SHARE = 0.75;   // of the class, watched live
const WATCH_SHARE = 95;    // % of a recording
const WATCH_DAYS = 7;      // days to watch a recording
const LIVE_BEAT_MS = window.TNBBI_TEST_LIVE_BEAT || 60000;  // live check-in (the database counts at most one a minute)

// --- small helpers -----------------------------------------------------------
function addDaysISO(s, n) {
  if (!s || !n) return s;
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return localISO(d);
}
function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }

// How a student actually attends (mirrors the database's student_track()).
function effTrack(c, sid) {
  if (!c) return "classroom";
  if (c.format === "in_person") return "classroom";
  if (c.pace === "self") return "recorded";
  const t = (c.enrollment[sid] || {}).track || "classroom";
  if (c.format === "online" && t === "classroom") return "live";
  return t;
}
function isOnlineStudent(c, sid) { return effTrack(c, sid) !== "classroom"; }
// Does this course have a classroom where the teacher takes attendance?
function takesClassroomAttendance(c) { return c.att.on && c.format !== "online" && c.pace !== "self"; }
function courseHasLectures(c) { return c.format !== "in_person" || !!c.playlistId || c.lessons.length > 0; }
// Self-paced: how many days later than the course calendar this student's dates fall.
function selfPacedShift(c, sid) {
  if (!c || c.pace !== "self" || !c.schedule || !c.schedule.startDate) return 0;
  const e = c.enrollment[sid];
  if (!e || !e.startOn) return 0;
  return daysBetween(c.schedule.startDate, e.startOn);
}
// An assignment's due date for one student (teachers' screens; a student's
// own screens already have their dates).
function dueFor(c, a, sid) {
  if (role === "student") return a.due;
  return addDaysISO(a.due, selfPacedShift(c, sid));
}
function selfPacedEnd(c, sid) {
  const e = c.enrollment[sid] || {};
  return addDaysISO(e.startOn || todayStr(), (c.schedule.weeks || 16) * 7 - 1);
}

// "PLxxxx" from a playlist link (or the ID itself).
function parsePlaylistId(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s.includes("://") ? s : "https://" + s);
    const list = u.searchParams.get("list");
    if (list && /^[A-Za-z0-9_-]{10,64}$/.test(list)) return list;
  } catch (e) { /* not a link */ }
  return /^[A-Za-z0-9_-]{10,64}$/.test(s) && !/[/.]/.test(s) ? s : null;
}
// A video's 11-character ID from any YouTube link (watch, youtu.be, live, shorts, embed).
function parseVideoId(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.includes("://") ? s : "https://" + s);
    if (/youtu\.be$/.test(u.hostname)) return (u.pathname.split("/")[1] || "").slice(0, 11) || null;
    const v = u.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const m = /\/(?:live|embed|shorts|v)\/([A-Za-z0-9_-]{11})/.exec(u.pathname);
    if (m) return m[1];
  } catch (e) { /* not a link */ }
  return null;
}
function fmtDuration(sec) {
  if (!sec) return "";
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} hr ${m} min` : m ? `${m} min` : "under a minute";
}

// --- Alaska time (the class schedule is in Alaska time; students may be
// anywhere in the world) ------------------------------------------------------
function alaskaParts(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Anchorage", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return { date: `${p.year}-${p.month}-${p.day}`, mins: (+p.hour % 24) * 60 + (+p.minute) };
}
function alaskaToday() { return alaskaParts().date; }
function timeMins(t) { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; }
// The moment a class starts (Alaska date + time) as a real Date, so it can be
// shown in the viewer's own time.
function alaskaMoment(dateStr, timeStr) {
  const mins = timeMins(timeStr) || 0;
  const [y, mo, d] = dateStr.split("-").map(Number);
  let guess = Date.UTC(y, mo - 1, d, Math.floor(mins / 60), mins % 60) + 9 * 3600000;
  for (let i = 0; i < 2; i++) {
    const p = alaskaParts(new Date(guess));
    const diff = (daysBetween(dateStr, p.date) * 1440 + p.mins) - mins;
    guess -= diff * 60000;
  }
  return new Date(guess);
}
function classInSession(c) {
  if (!c || c.archived || c.pace === "self") return false;
  const start = timeMins(c.schedule.time);
  if (start === null) return false;
  const now = alaskaParts();
  if (!classDates(c).includes(now.date)) return false;
  return now.mins >= start - 15 && now.mins < start + (c.classMinutes || 90) + 30;
}
function classIsOver(c) {
  const start = timeMins(c.schedule.time);
  const now = alaskaParts();
  return start !== null && classDates(c).includes(now.date) && now.mins >= start + (c.classMinutes || 90) + 30;
}
function nextClassMoment(c) {
  const start = timeMins(c.schedule.time);
  if (start === null || c.pace === "self") return null;
  const now = alaskaParts();
  const d = classDates(c).find((x) => x > now.date || (x === now.date && now.mins < start + (c.classMinutes || 90) + 30));
  return d ? { date: d, at: alaskaMoment(d, c.schedule.time) } : null;
}
function classTimeText(at) {
  const local = at.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const ak = at.toLocaleString(undefined, { timeZone: "America/Anchorage", hour: "numeric", minute: "2-digit" });
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return here === "America/Anchorage" || /Juneau|Sitka|Nome|Yakutat|Metlakatla/.test(here) ? local : `${local} your time (${ak} in Alaska)`;
}

// --- lectures: when each opens and when it must be watched by -------------------
function addedDay(l) { return l.addedAt ? alaskaParts(new Date(l.addedAt)).date : todayStr(); }
function lessonOpensOn(c, l, sid) {
  if (c.pace === "self") return (c.enrollment[sid] || {}).startOn || todayStr();
  const added = addedDay(l);
  return l.classDate && l.classDate > added ? l.classDate : added;
}
function lessonWatchBy(c, l, sid) {
  if (c.pace === "self") return selfPacedEnd(c, sid);
  return addDaysISO(lessonOpensOn(c, l, sid), WATCH_DAYS);
}
function playableLesson(l) { return l.status === "ok" && !l.hidden; }
function liveLesson(c) {
  if (c.liveVideoId) return { videoId: c.liveVideoId, title: "Live class", status: "live", manual: true };
  const live = c.lessons.filter((l) => !l.hidden && (l.status === "live" || l.status === "upcoming"));
  live.sort((a, b) => (a.status === "live" ? 0 : 1) - (b.status === "live" ? 0 : 1) || String(b.addedAt).localeCompare(String(a.addedAt)));
  return live[0] || null;
}
function myView(l) { return (l.views || {})[currentUser.id] || null; }
function watchedPct(l, sid) {
  const v = (l.views || {})[sid];
  const local = sid === currentUser.id ? localWatchPct(l.id) : 0;
  return Math.max(v ? v.pct : 0, local);
}
// Does attendance depend on watching for this student?
function lectureCountsForMe(c) {
  return c.att.on && role === "student";
}

// ---------------------------------------------------------------------------
// Course setup: format, pace, playlist (Add Course / Edit Course Details)
// ---------------------------------------------------------------------------
function formatSettingsHtml(p, c) {
  const f = c ? c.format : "in_person";
  const pace = c ? c.pace : "calendar";
  const pl = c && c.playlistId ? `https://www.youtube.com/playlist?list=${c.playlistId}` : "";
  return `
    <div class="fmt-block">
      <label>How students attend</label>
      <div class="fmt-choices" role="radiogroup">
        ${[["in_person", "In person", "Everyone in the classroom"], ["hybrid", "Hybrid", "Classroom + live online + recordings"], ["online", "Online", "Live online + recordings only"]].map(([k, t, d]) => `
          <label class="fmt-choice"><input type="radio" name="${p}Format" value="${k}" ${f === k ? "checked" : ""} /><span><strong>${t}</strong><small>${d}</small></span></label>`).join("")}
      </div>
      <div id="${p}PaceWrap" ${f === "online" ? "" : "hidden"}>
        <label>Pace</label>
        <div class="fmt-choices fmt-choices-2" role="radiogroup">
          <label class="fmt-choice"><input type="radio" name="${p}Pace" value="calendar" ${pace !== "self" ? "checked" : ""} /><span><strong>Follow the class calendar</strong><small>Lectures open as the class goes; due dates as scheduled</small></span></label>
          <label class="fmt-choice"><input type="radio" name="${p}Pace" value="self" ${pace === "self" ? "checked" : ""} /><span><strong>Self-paced</strong><small>All lectures open; each student has one semester (the course's length) from the day they start</small></span></label>
        </div>
      </div>
      <label for="${p}Playlist">Lecture videos — YouTube playlist link <span class="field-optional">${f === "in_person" ? "(optional — for make-ups)" : ""}</span></label>
      <input type="url" id="${p}Playlist" placeholder="https://www.youtube.com/playlist?list=…" value="${esc(pl)}" inputmode="url" autocomplete="off" />
      <div class="field-hint">Make the playlist first, then paste its link here. Each class recording uploaded to it appears in the course within about half an hour. Set videos to <strong>Unlisted</strong> (not Private) with embedding allowed. Setting a video's <em>Recording date</em> in YouTube Studio puts it on the right class day.</div>
      <div id="${p}LiveWrap" ${f === "in_person" ? "hidden" : ""}>
        <div class="form-row">
          <div>
            <label for="${p}ClassMin">Class length (minutes)</label>
            <input type="number" id="${p}ClassMin" min="15" max="480" step="5" value="${c ? c.classMinutes : 90}" inputmode="numeric" />
          </div>
          <div>
            <label for="${p}LiveLink">Live stream link <span class="field-optional">(optional)</span></label>
            <input type="url" id="${p}LiveLink" placeholder="Found automatically from the playlist" value="${c && c.liveVideoId ? `https://youtu.be/${c.liveVideoId}` : ""}" autocomplete="off" />
          </div>
        </div>
        <div class="field-hint">Live students watch the stream inside the site; watching ${Math.round(LIVE_SHARE * 100)}% of the class counts them present. A scheduled YouTube Live stream added to the playlist is found by itself — fill in the link only if it isn't in the playlist.</div>
      </div>
    </div>`;
}
function wireFormatSettings(p) {
  const sync = () => {
    const f = (document.querySelector(`input[name=${p}Format]:checked`) || {}).value || "in_person";
    document.getElementById(`${p}PaceWrap`).hidden = f !== "online";
    document.getElementById(`${p}LiveWrap`).hidden = f === "in_person";
  };
  document.querySelectorAll(`input[name=${p}Format]`).forEach((r) => r.addEventListener("change", sync));
}
// → the course columns to save; throws a friendly message if a link is wrong.
function readFormatSettings(p) {
  const format = (document.querySelector(`input[name=${p}Format]:checked`) || {}).value || "in_person";
  const pace = format === "online" ? ((document.querySelector(`input[name=${p}Pace]:checked`) || {}).value || "calendar") : "calendar";
  const playlist = parsePlaylistId(document.getElementById(`${p}Playlist`).value);
  if (playlist === null) { const e = new Error("That playlist link doesn't look right. Open the playlist on YouTube and copy the link from the address bar (it contains “list=”)."); e.field = `${p}Playlist`; throw e; }
  const liveRaw = format === "in_person" ? "" : document.getElementById(`${p}LiveLink`).value;
  const live = parseVideoId(liveRaw);
  if (live === null) { const e = new Error("That live stream link doesn't look right. Copy the stream's link from YouTube."); e.field = `${p}LiveLink`; throw e; }
  const mins = Math.max(15, Math.min(480, Math.round(Number((document.getElementById(`${p}ClassMin`) || {}).value) || 90)));
  return { format, pace, playlist_id: playlist, live_video_id: live || "", class_minutes: mins };
}

// ---------------------------------------------------------------------------
// Student course page: how I attend, the live class, the lectures
// ---------------------------------------------------------------------------
// part: "top" → the attend choice and Watch Live banner (Overview tab);
// "list" → the Lectures card (Lectures tab); default both.
function courseAttendHtml(c, part = "all") {
  if (!courseHasLectures(c)) return "";
  const sid = currentStudentId;
  const trk = effTrack(c, sid);
  const e = c.enrollment[sid] || {};
  const choose = c.format !== "in_person" && c.pace === "calendar" && !e.trackChosen;
  const choices = c.format === "hybrid" ? ["classroom", "live", "recorded"] : ["live", "recorded"];
  const live = classInSession(c);
  const next = nextClassMoment(c);
  const lessons = c.lessons.filter((l) => playableLesson(l));
  const today = todayStr();
  const open = lessons.filter((l) => lessonOpensOn(c, l, sid) <= today);
  const later = lessons.filter((l) => lessonOpensOn(c, l, sid) > today);
  const done = open.filter((l) => watchedPct(l, sid) >= WATCH_SHARE).length;
  const counts = lectureCountsForMe(c);
  const howText = c.pace === "self"
    ? `Self-paced: every lecture is open. Finish by <strong>${fmtDay(selfPacedEnd(c, sid), { month: "long", day: "numeric", year: "numeric" })}</strong>${counts ? ` — each lecture watched ${WATCH_SHARE}% counts as attending that class` : ""}.`
    : trk === "classroom"
      ? `You attend in the classroom.${lessons.length ? ` Missed a class? Watch its recording within ${WATCH_DAYS} days and it counts as a make-up.` : ""}`
      : trk === "live"
        ? `You attend live online: watch the class here as it happens${counts ? ` (${Math.round(LIVE_SHARE * 100)}% of the class counts you present)` : ""}. If you miss it, watch the recording within ${WATCH_DAYS} days.`
        : `You watch the recorded lectures${counts ? ` — ${WATCH_SHARE}% of each lecture within ${WATCH_DAYS} days of it being posted counts you present` : ""}. You're welcome to join live too.`;
  const upNext = open.find((l) => watchedPct(l, sid) < WATCH_SHARE);
  const top = `
    ${choose ? `
    <div class="card attend-choose" id="attendChoose">
      <h2 class="card-title" style="margin:0 0 6px;">How will you attend this course?</h2>
      <p class="field-hint" style="margin:0 0 12px;">Assignments, discussion and messages are the same either way. You can change this later.</p>
      <div class="track-choices">
        ${choices.map((k) => `<button type="button" class="track-choice" data-track="${k}">${icon(k === "classroom" ? "users" : k === "live" ? "video" : "book")}<strong>${TRACK_LABEL[k]}</strong><span>${k === "classroom" ? "Come to class in person" : k === "live" ? "Watch the class live, here on the site" : "Watch each lecture after it's posted"}</span></button>`).join("")}
      </div>
    </div>` : ""}
    ${live ? `
    <button type="button" class="card live-banner" id="watchLive">
      <span class="live-dot" aria-hidden="true"></span>
      <span><strong>Class is in session — Watch Live</strong><small>Stay on this page while you watch; leaving for the YouTube app doesn't count for attendance.</small></span>
      <span class="live-go">${icon("video")}</span>
    </button>` : ""}`;
  if (part === "top") return top;
  const list = `
    <div class="section-title"><h2>Lectures</h2>${open.length ? `<span class="field-hint" style="margin:0;">${done} of ${open.length} watched</span>` : ""}</div>
    <div class="card">
      ${choose ? "" : `<div class="attend-how">
        ${c.format !== "in_person" ? `<span class="pill pill-navy">${esc(TRACK_SHORT[trk])}</span>` : ""}
        <p>${howText}</p>`}
        ${c.format === "hybrid" && c.pace === "calendar" && !choose ? `<button type="button" class="btn btn-ghost btn-sm" id="changeTrack">Change</button>` : ""}
        ${c.format === "online" && c.pace === "calendar" && !choose ? `<button type="button" class="btn btn-ghost btn-sm" id="changeTrack">Change</button>` : ""}
      ${choose ? "" : "</div>"}
      ${!live && next && trk !== "recorded" && c.format !== "in_person" ? `<p class="field-hint" style="margin:10px 0 0;">${icon("calendar")} Next live class: <strong>${esc(classTimeText(next.at))}</strong>. <a href="#" id="openLivePage">Open the live class page</a></p>` : ""}
      <ul class="lecture-list">
        ${open.length === 0 ? `<li class="lecture-empty">${lessons.length ? "The first lecture opens soon." : c.playlistId ? "No lectures have been posted yet. They'll appear here as each class is uploaded." : "No lectures yet."}</li>` : ""}
        ${open.map((l) => lectureRowHtml(c, l, sid, l === upNext)).join("")}
        ${later.length ? `<li class="lecture-later">${icon("lock")} ${later.length} more lecture${later.length === 1 ? "" : "s"} open as the class reaches ${later.length === 1 ? "it" : "them"} (next: ${esc(fmtDay(lessonOpensOn(c, later[0], sid), { month: "short", day: "numeric" }))}).</li>` : ""}
      </ul>
    </div>`;
  return part === "list" ? list : top + list;
}
// The next lecture to watch, for the course Overview.
function nextLectureHtml(c) {
  if (!courseHasLectures(c)) return "";
  const sid = currentStudentId;
  const today = todayStr();
  const open = c.lessons.filter((l) => playableLesson(l) && lessonOpensOn(c, l, sid) <= today);
  if (!open.length) return "";
  const next = open.find((l) => watchedPct(l, sid) < WATCH_SHARE);
  const done = open.length - open.filter((l) => watchedPct(l, sid) < WATCH_SHARE).length;
  return `<div class="card overview-card">
    <div class="overview-head"><h3>${icon("video")} Lectures</h3><a href="#" data-goto-tab="lectures">All ${open.length}</a></div>
    ${next ? `<ul class="lecture-list">${lectureRowHtml(c, next, sid, true)}</ul>` : `<p class="field-hint" style="margin:0;">✓ You've watched every lecture posted so far.</p>`}
    <p class="field-hint" style="margin:8px 0 0;">${done} of ${open.length} watched</p>
  </div>`;
}
function lectureRowHtml(c, l, sid, isNext = false) {
  const pct = watchedPct(l, sid);
  const doneNow = pct >= WATCH_SHARE;
  const by = lessonWatchBy(c, l, sid);
  const late = !doneNow && by < todayStr();
  const counts = lectureCountsForMe(c) && (isOnlineStudent(c, sid) || (c.attMarks[l.classDate] || {})[sid] === "absent");
  return `<li class="lecture-row ${isNext ? "lecture-next" : ""}">
    <button type="button" class="lecture-open" data-lesson="${l.id}">
      <span class="lecture-thumb"><img src="https://i.ytimg.com/vi/${esc(l.videoId)}/mqdefault.jpg" alt="" loading="lazy" width="120" height="68"><span class="lecture-play">▶</span></span>
      <span class="lecture-text">
        ${isNext ? `<span class="up-next">Up next</span>` : ""}<strong>${esc(l.title || "Lecture")}</strong>
        <small>${l.classDate ? `Class of ${esc(fmtDay(l.classDate, { month: "short", day: "numeric" }))}` : ""}${l.duration ? ` · ${fmtDuration(l.duration)}` : ""}</small>
        <span class="watch-bar" aria-label="${Math.round(pct)}% watched"><span style="width:${Math.min(100, pct)}%"></span></span>
        <small class="${doneNow ? "watch-done" : late ? "watch-late" : ""}">${doneNow ? "✓ Watched" : `${Math.round(pct)}% watched`}${!doneNow && counts ? (late ? ` · was due ${esc(fmtDay(by, { month: "short", day: "numeric" }))}` : ` · watch by ${esc(fmtDay(by, { month: "short", day: "numeric" }))} for attendance`) : ""}</small>
      </span>
    </button>
  </li>`;
}
function wireCourseAttend(c, main) {
  main.querySelectorAll("[data-track]").forEach((b) => b.addEventListener("click", () =>
    run(() => DB.setMyTrack(c.id, b.dataset.track), null, { success: `You're set to attend: ${TRACK_LABEL[b.dataset.track]}.` })));
  const ch = document.getElementById("changeTrack");
  if (ch) ch.addEventListener("click", () => openTrackModal(c));
  const wl = document.getElementById("watchLive");
  if (wl) wl.addEventListener("click", () => openLiveClass(c.id, "course"));
  const lp = document.getElementById("openLivePage");
  if (lp) lp.addEventListener("click", (e) => { e.preventDefault(); openLiveClass(c.id, "course"); });
  main.querySelectorAll("[data-lesson]").forEach((b) => b.addEventListener("click", () => openLecture(c.id, b.dataset.lesson, "course")));
  // The Watch Live banner appears by itself when class time comes.
  if (courseHasLectures(c) && c.format !== "in_person") {
    const was = classInSession(c);
    viewTimers.push(setInterval(() => {
      if (view === "course" && !document.querySelector("#modalRoot .modal-backdrop") && classInSession(c) !== was) renderMain();
    }, 30000));
  }
}
function openTrackModal(c) {
  const sid = currentStudentId;
  const cur = effTrack(c, sid);
  const choices = c.format === "hybrid" ? ["classroom", "live", "recorded"] : ["live", "recorded"];
  document.getElementById("modalRoot").innerHTML = `
    <div class="modal-backdrop"><div class="modal" style="max-width:520px;">
      <h2 style="font-size:1.15rem;">How will you attend?</h2>
      <p class="field-hint">Only how you attend changes — assignments, discussion and messages stay the same.</p>
      <div class="track-choices">
        ${choices.map((k) => `<button type="button" class="track-choice ${k === cur ? "active" : ""}" data-pick-track="${k}">${icon(k === "classroom" ? "users" : k === "live" ? "video" : "book")}<strong>${TRACK_LABEL[k]}</strong></button>`).join("")}
      </div>
      <div class="form-actions"><button class="btn btn-ghost" id="trackCancel">Cancel</button></div>
    </div></div>`;
  document.getElementById("trackCancel").addEventListener("click", closeModal);
  document.querySelectorAll("[data-pick-track]").forEach((b) => b.addEventListener("click", () =>
    run(async () => { await DB.setMyTrack(c.id, b.dataset.pickTrack); closeModal(); }, null, { success: `You're set to attend: ${TRACK_LABEL[b.dataset.pickTrack]}.` })));
}

// ---------------------------------------------------------------------------
// The YouTube player (shared by lectures and the live class)
// ---------------------------------------------------------------------------
let ytApiPromise = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { try { if (prev) prev(); } catch (e) { /* ignore */ } resolve(window.YT); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = () => { ytApiPromise = null; reject(new Error("YouTube couldn't be reached. Check your internet connection and try again.")); };
      document.head.appendChild(s);
      setTimeout(() => { if (!(window.YT && window.YT.Player)) { ytApiPromise = null; reject(new Error("YouTube is taking too long to load. Check your connection and try again.")); } }, 20000);
    });
  }
  return ytApiPromise;
}
let activePlayer = null;
function destroyPlayer() {
  if (activePlayer) { try { activePlayer.destroy(); } catch (e) { /* ignore */ } activePlayer = null; }
}
// Puts a responsive player in #<elId>. Returns a promise of the player.
function makePlayer(elId, videoId, events = {}) {
  destroyPlayer();
  return loadYouTubeApi().then((YT) => new Promise((resolve) => {
    const el = document.getElementById(elId);
    if (!el) return resolve(null);
    const p = new YT.Player(elId, {
      videoId,
      host: "https://www.youtube-nocookie.com",
      width: "100%", height: "100%",
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
      events: {
        onReady: () => resolve(p),
        onStateChange: (e) => events.onState && events.onState(e.data),
        onError: (e) => events.onError && events.onError(e.data),
      },
    });
    activePlayer = p;
  }));
}
function playerErrorText(code) {
  return code === 101 || code === 150 ? "This video can't be played inside the site — its owner needs to allow embedding (YouTube Studio → the video → Show more → Allow embedding)."
    : code === 100 ? "This video was removed or set to Private. Ask the teacher to check it in YouTube Studio."
      : "The video couldn't be played. Check your connection and try again.";
}

// --- watching progress: 200 slices of the video, each marked as it plays ----
function watchKey(lessonId) { return `tnbbi-watch:${currentUser.id}:${lessonId}`; }
function localWatchBits(lessonId) {
  try { const v = localStorage.getItem(watchKey(lessonId)); if (v && /^[01]{200}$/.test(v)) return v.split(""); } catch (e) { /* private mode */ }
  return Array(200).fill("0");
}
function localWatchPct(lessonId) {
  try { const v = localStorage.getItem(watchKey(lessonId)); return v ? (v.split("1").length - 1) / 2 : 0; } catch (e) { return 0; }
}
function startWatchTracker(c, l, player, onChange) {
  const bits = localWatchBits(l.id);
  let lastT = null, dirty = bits.includes("1"), sending = false, stopped = false, lastSent = 0;
  let server = myView(l) ? myView(l).pct : 0;
  let completed = !!(myView(l) && myView(l).completedAt);
  const pct = () => Math.max(server, (bits.filter((b) => b === "1").length) / 2);
  const save = () => { try { localStorage.setItem(watchKey(l.id), bits.join("")); } catch (e) { /* ignore */ } };
  const send = async (force) => {
    if (sending || !dirty || role !== "student") return;
    if (!force && Date.now() - lastSent < 15000) return;
    sending = true; lastSent = Date.now();
    const sent = bits.join("");
    try {
      const r = await DB.recordLessonProgress(l.id, sent, Math.round(player.getDuration() || l.duration || 0));
      if (r && r.counted) {
        server = Math.max(server, Number(r.pct) || 0);
        if (r.completed && !completed) { completed = true; onChange && onChange({ pct: pct(), completed, justCompleted: true }); }
        if (bits.join("") === sent && server >= pct()) dirty = false;
      } else dirty = false; // not counted here (e.g. Lecture Archive)
    } catch (e) { /* offline: kept on this device, sent next time */ }
    sending = false;
    onChange && onChange({ pct: pct(), completed });
  };
  const tick = () => {
    if (stopped) return;
    let state, t, d;
    try { state = player.getPlayerState(); t = player.getCurrentTime(); d = player.getDuration() || l.duration || 0; } catch (e) { return; }
    if (state === 1 && d > 0) {
      if (lastT !== null && t >= lastT && t - lastT <= 3.5) {
        const a = Math.floor((lastT / d) * 200), b = Math.min(199, Math.floor((t / d) * 200));
        for (let i = a; i <= b; i++) if (bits[i] !== "1") { bits[i] = "1"; dirty = true; }
        save();
      }
      lastT = t;
      onChange && onChange({ pct: pct(), completed });
    } else if (state === 0) { // ended: the last slice
      if (lastT !== null && d - lastT < 4) { bits[199] = "1"; dirty = true; save(); }
      lastT = null;
      send(true);
    } else {
      lastT = null;
    }
    send(false);
  };
  const iv = setInterval(tick, 1000);
  const flush = () => send(true);
  const onHide = () => { if (document.visibilityState === "hidden") flush(); };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", flush);
  if (dirty) send(true);
  return {
    pct, stop() { stopped = true; clearInterval(iv); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", flush); flush(); },
    onPause() { lastT = null; flush(); },
  };
}

// ---------------------------------------------------------------------------
// The lecture page
// ---------------------------------------------------------------------------
let activeLessonId = null;
let lectureBackView = "course";
let lectureTracker = null;
function openLecture(courseId, lessonId, back) {
  activeCourseId = courseId;
  activeLessonId = lessonId;
  lectureBackView = back || (role === "student" ? "course" : "manage");
  view = "lecture";
  renderNav(); renderMain();
  window.scrollTo(0, 0);
}
function stopLecture() {
  if (lectureTracker) { lectureTracker.stop(); lectureTracker = null; }
  destroyPlayer();
}
function renderLecture(main) {
  stopLecture();
  const c = courses.find((x) => x.id === activeCourseId);
  const l = c && c.lessons.find((x) => x.id === activeLessonId);
  const back = () => { stopLecture(); view = lectureBackView; if (view === "lectureArchive") activeCourseId = archiveCourseId || null; renderNav(); renderMain(); };
  const backLabel = { course: "Course", manage: "Course", lectureArchive: "Lecture Archive", live: "Live Class" }[lectureBackView] || "Course";
  if (!l) {
    main.innerHTML = `<button class="back-link" id="backLink">&larr; Back to ${backLabel}</button><div class="card empty-state"><p>That lecture isn't available.</p></div>`;
    document.getElementById("backLink").addEventListener("click", back);
    return;
  }
  const sid = currentUser.id;
  const enrolled = role === "student" && c.studentIds.includes(sid) && !c.archived;
  const list = c.lessons.filter((x) => playableLesson(x) && (role !== "student" || !enrolled || lessonOpensOn(c, x, sid) <= todayStr()));
  const i = list.findIndex((x) => x.id === l.id);
  const prev = i > 0 ? list[i - 1] : null, next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  const counts = enrolled && c.att.on;
  const by = enrolled ? lessonWatchBy(c, l, sid) : null;
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to ${backLabel}</button>
    <div class="lecture-page">
      <div class="video-shell"><div id="lecturePlayer"></div><div class="video-msg" id="videoMsg">Loading the video…</div></div>
      <div class="lecture-head">
        <div class="eyebrow">${esc(c.title)}${l.classDate ? ` · Class of ${esc(fmtDay(l.classDate, { weekday: "short", month: "short", day: "numeric" }))}` : ""}</div>
        <h1>${esc(l.title || "Lecture")}</h1>
      </div>
      ${enrolled ? `
      <div class="card watch-card">
        <div class="watch-bar watch-bar-lg"><span id="watchFill" style="width:0%"></span></div>
        <p id="watchText" class="watch-text"></p>
        <p class="field-hint" style="margin:6px 0 0;">Only the parts you actually play count — skipping ahead doesn't. ${counts ? `Watching ${WATCH_SHARE}% ${c.pace === "self" ? `before ${esc(fmtDay(by, { month: "long", day: "numeric" }))}` : `by ${esc(fmtDay(by, { weekday: "short", month: "long", day: "numeric" }))}`} counts as attending this class.` : ""} Your progress is saved as you go, even if your connection drops.</p>
      </div>` : role === "student" ? `
      <div class="privacy-note">${icon("book")}<span>From the Lecture Archive — watching here is for your own study and doesn't count toward any course.</span></div>` : `
      <div class="privacy-note">${icon("lock")}<span>Teacher's preview — watching here isn't recorded.</span></div>`}
      <p class="field-hint lecture-tip">Slow connection? Tap ⚙ in the player and choose a lower quality.</p>
      <div class="lecture-nav">
        ${prev ? `<button class="btn btn-ghost btn-sm" data-lesson-nav="${prev.id}">&larr; ${esc(prev.title || "Previous")}</button>` : "<span></span>"}
        ${next ? `<button class="btn btn-ghost btn-sm" data-lesson-nav="${next.id}">${esc(next.title || "Next")} &rarr;</button>` : ""}
      </div>
    </div>`;
  document.getElementById("backLink").addEventListener("click", back);
  main.querySelectorAll("[data-lesson-nav]").forEach((b) => b.addEventListener("click", () => { stopLecture(); activeLessonId = b.dataset.lessonNav; renderLecture(main); window.scrollTo(0, 0); }));
  const show = ({ pct, completed, justCompleted }) => {
    const f = document.getElementById("watchFill"), t = document.getElementById("watchText");
    if (!f || !t) return;
    f.style.width = Math.min(100, pct) + "%";
    t.innerHTML = completed || pct >= WATCH_SHARE ? `<strong class="watch-done">✓ Watched</strong> — ${Math.round(pct)}% of this lecture${counts ? ". It counts toward your attendance." : "."}`
      : `<strong>${Math.round(pct)}% watched</strong>${counts ? ` · ${WATCH_SHARE}% needed` : ""}`;
    if (justCompleted) toast("Lecture complete — it counts toward your attendance.", "success");
  };
  if (enrolled) show({ pct: watchedPct(l, sid), completed: !!(myView(l) && myView(l).completedAt) });
  const myLesson = l.id;
  makePlayer("lecturePlayer", l.videoId, {
    onState: (s) => { if (s === 2 && lectureTracker) lectureTracker.onPause(); },
    onError: (code) => { const m = document.getElementById("videoMsg"); if (m) { m.textContent = playerErrorText(code); m.classList.add("show"); } },
  }).then((p) => {
    if (!p || view !== "lecture" || activeLessonId !== myLesson) return;
    const m = document.getElementById("videoMsg"); if (m) m.classList.remove("show");
    if (enrolled) lectureTracker = startWatchTracker(c, l, p, show);
  }).catch((e) => { const m = document.getElementById("videoMsg"); if (m) { m.textContent = e.message; m.classList.add("show"); } });
}

// ---------------------------------------------------------------------------
// The live class: the stream (counted while it plays here) and the class chat
// ---------------------------------------------------------------------------
let liveBackView = "course";
let liveState = null;
function openLiveClass(courseId, back) {
  activeCourseId = courseId;
  liveBackView = back || (role === "student" ? "course" : "manage");
  view = "live";
  renderNav(); renderMain();
  window.scrollTo(0, 0);
}
function stopLive() {
  if (liveState) { liveState.timers.forEach(clearInterval); if (liveState.stopFollow) liveState.stopFollow(); liveState = null; }
  destroyPlayer();
}
function renderLiveClass(main) {
  stopLive();
  stopLecture();
  const c = courses.find((x) => x.id === activeCourseId);
  const teacher = role !== "student";
  const back = () => { stopLive(); view = liveBackView; renderNav(); renderMain(); };
  const st = liveState = { timers: [], lastChat: null, seen: new Set(), videoId: null, minutes: null, needed: Math.ceil((c.classMinutes || 90) * LIVE_SHARE), showVideo: !teacher, player: null };
  const next = nextClassMoment(c);
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to ${{ course: "Course", manage: "Course", home: "Dashboard" }[liveBackView] || "Course"}</button>
    <div class="live-page">
      <div class="live-head">
        <div><div class="eyebrow">Live Class</div><h1>${esc(c.title)}</h1></div>
        <span class="pill" id="liveStatus"></span>
      </div>
      <div class="live-grid">
        <div class="live-main">
          ${teacher ? `<button class="btn btn-ghost btn-sm" id="toggleVideo" style="margin-bottom:10px;">${icon("video")} Show the stream</button>` : ""}
          <div class="video-shell" id="liveShell" ${teacher ? "hidden" : ""}><div id="livePlayer"></div><div class="video-msg show" id="liveMsg">Waiting for the stream…</div></div>
          ${teacher ? "" : followCardHtml()}
          ${teacher ? `<div class="card" id="liveWatchers"><p class="field-hint" style="margin:0;">Who's watching appears here during class.</p></div>` : `
          <div class="card watch-card" id="liveCount">
            <p class="watch-text" id="liveCountText">${c.att.on ? `Watch here for at least <strong>${st.needed} minutes</strong> of the class to be counted present.` : "Enjoy the class!"}</p>
            <p class="field-hint" style="margin:6px 0 0;">Keep this page open and playing — attendance is only counted while the stream plays here, not in the YouTube app. Missed part of it? The recording counts too (${WATCH_SHARE}% within ${WATCH_DAYS} days).</p>
          </div>`}
        </div>
        <div class="live-chat card">
          <div class="live-chat-head"><strong>${icon("chat")} ${teacher ? "Class questions" : "Ask the teacher a question"}</strong><small>${teacher ? "Students' questions during class — each student sees only their own" : "Only the teacher sees your question, unless he shows it on the screen."}</small></div>
          <div class="live-chat-list" id="chatList" aria-live="polite"><p class="field-hint chat-empty">No messages yet.</p></div>
          <form class="live-chat-form" id="chatForm">
            <input type="text" id="chatInput" maxlength="500" placeholder="${teacher ? "Reply to the class…" : "Type a question…"}" autocomplete="off" enterkeyhint="send" aria-label="Message" />
            <button class="btn btn-primary btn-sm" type="submit">Send</button>
          </form>
        </div>
      </div>
      ${!classInSession(c) ? `<p class="field-hint" style="margin-top:14px;">${next ? `Next class: <strong>${esc(classTimeText(next.at))}</strong>. The stream starts here at class time.` : "No upcoming class is scheduled."}</p>` : ""}
    </div>`;
  document.getElementById("backLink").addEventListener("click", back);
  const status = () => {
    const el = document.getElementById("liveStatus");
    if (!el) return;
    const on = classInSession(c);
    el.className = `pill ${on ? "pill-live" : "pill-gray"}`;
    el.textContent = on ? "In session" : classIsOver(c) ? "Class has ended" : "Not in session";
  };
  status();
  const tg = document.getElementById("toggleVideo");
  if (tg) tg.addEventListener("click", () => {
    st.showVideo = !st.showVideo;
    document.getElementById("liveShell").hidden = !st.showVideo;
    tg.innerHTML = `${icon("video")} ${st.showVideo ? "Hide the stream" : "Show the stream"}`;
    if (st.showVideo) { st.videoId = null; findStream(); } else { destroyPlayer(); st.player = null; }
  });

  // --- the stream ---
  const findStream = async () => {
    if (!st.showVideo || liveState !== st) return;
    try { await DB.refreshCourseLessons(c); } catch (e) { /* keep what we have */ }
    if (liveState !== st) return;
    const v = liveLesson(c);
    const msg = document.getElementById("liveMsg");
    if (!v) {
      if (msg) { msg.textContent = classInSession(c) ? "Waiting for the stream to start… this page checks every 30 seconds." : "The stream will appear here at class time."; msg.classList.add("show"); }
      return;
    }
    if (st.videoId === v.videoId) return;
    st.videoId = v.videoId;
    try {
      st.player = await makePlayer("livePlayer", v.videoId, {
        onError: (code) => { if (msg) { msg.textContent = playerErrorText(code); msg.classList.add("show"); } },
        onState: (s) => { if (s === 1 && msg) msg.classList.remove("show"); },
      });
      if (msg && st.player) msg.classList.remove("show");
    } catch (e) { st.videoId = null; if (msg) { msg.textContent = e.message; msg.classList.add("show"); } }
  };
  findStream();
  st.timers.push(setInterval(findStream, 30000));
  st.timers.push(setInterval(status, 30000));

  // --- the slides, following the teacher (Teach mode) ---
  if (!teacher) startFollowAlong(c, st);

  // --- live attendance: once a minute while the stream plays here ---
  if (!teacher && c.studentIds.includes(currentUser.id)) {
    st.timers.push(setInterval(async () => {
      if (liveState !== st || !st.player || !classInSession(c)) return;
      let playing = false;
      try { playing = st.player.getPlayerState() === 1; } catch (e) { /* ignore */ }
      if (!playing || document.visibilityState === "hidden") return;
      try {
        const r = await DB.recordLiveMinute(c.id);
        if (r && r.counted) {
          st.minutes = r.minutes; st.needed = r.needed;
          const t = document.getElementById("liveCountText");
          if (t && c.att.on) t.innerHTML = r.minutes >= r.needed ? `<strong class="watch-done">✓ You're counted present</strong> for today's class (${r.minutes} minutes watched).`
            : `<strong>${r.minutes} of ${r.needed} minutes</strong> watched — keep watching to be counted present.`;
        }
      } catch (e) { /* offline — try again next minute */ }
    }, LIVE_BEAT_MS));
  }

  // --- teacher: who's watching right now ---
  if (teacher) {
    const watchers = async () => {
      const box = document.getElementById("liveWatchers");
      if (!box || liveState !== st) return;
      let rows = [];
      try { rows = await DB.liveWatchers(c.id); } catch (e) { return; }
      const now = rows.filter((r) => Date.now() - new Date(r.last_beat).getTime() < 150000);
      box.innerHTML = rows.length ? `<p style="margin:0 0 6px;"><strong>${now.length}</strong> watching now online</p>
        <div class="chip-row">${rows.map((r) => `<span class="chip ${now.includes(r) ? "chip-on" : ""}">${esc(userName(r.student_id))} · ${r.minutes} min</span>`).join("")}</div>`
        : `<p class="field-hint" style="margin:0;">No one is watching online yet.</p>`;
    };
    watchers();
    st.timers.push(setInterval(watchers, 30000));
  }

  // --- chat ---
  const list = document.getElementById("chatList");
  const draw = (rows) => {
    if (!list || !rows.length) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    const empty = list.querySelector(".chat-empty"); if (empty) empty.remove();
    rows.forEach((m) => {
      if (st.seen.has(m.id)) return;
      st.seen.add(m.id);
      const u = users.find((x) => x.id === m.author_id);
      const isTeacher = u && u.role === "faculty";
      const div = document.createElement("div");
      div.className = `chat-msg ${m.author_id === currentUser.id ? "chat-mine" : ""} ${isTeacher ? "chat-teacher" : ""}`;
      div.dataset.id = m.id;
      div.innerHTML = `<div class="chat-who">${esc(u ? u.name : "Classmate")}${isTeacher ? ` <span class="pill pill-gold">Teacher</span>` : ""} <time>${new Date(m.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time>${teacher || m.author_id === currentUser.id ? `<button type="button" class="chat-del" aria-label="Delete" title="Delete">×</button>` : ""}</div><div class="chat-body">${esc(m.body)}</div>`;
      const del = div.querySelector(".chat-del");
      if (del) del.addEventListener("click", async () => { try { await DB.deleteLiveChat(m.id); div.remove(); } catch (e) { toast(friendlyError(e)); } });
      list.appendChild(div);
      st.lastChat = m.created_at;
    });
    if (nearBottom || rows.some((m) => m.author_id === currentUser.id)) list.scrollTop = list.scrollHeight;
  };
  const poll = async () => {
    if (liveState !== st) return;
    try { draw(await DB.liveChat(c.id, st.lastChat)); } catch (e) { /* try again */ }
  };
  // A student's own questions: show which ones the teacher has answered.
  if (!teacher) st.timers.push(setInterval(async () => {
    if (liveState !== st || !list) return;
    try {
      const rows = await DB.questions(c.id, null);
      rows.forEach((q) => {
        const el = list.querySelector(`.chat-msg[data-id="${q.id}"]`);
        if (!el || q.author_id !== currentUser.id) return;
        const tag = el.querySelector(".chat-answered");
        if (q.answered_at && !tag) el.querySelector(".chat-who").insertAdjacentHTML("beforeend", ` <span class="pill pill-green chat-answered">Answered</span>`);
        else if (!q.answered_at && tag) tag.remove();
      });
    } catch (e) { /* next time */ }
  }, 15000));
  poll();
  st.timers.push(setInterval(poll, 4000));
  document.getElementById("chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    const body = input.value.trim();
    if (!body) return;
    input.value = "";
    try { await DB.postLiveChat(c.id, body); await poll(); } catch (err) { input.value = body; toast(friendlyError(err)); }
  });
}

// ---------------------------------------------------------------------------
// Teacher: the Lectures & Live Class card on the course's Manage page
// ---------------------------------------------------------------------------
function renderLecturesCard(c) {
  const wrap = document.getElementById("mgLecturesCard");
  if (!wrap) return;
  const teach = iManage(c);
  const sync = c.sync;
  const online = c.studentIds.filter((sid) => isOnlineStudent(c, sid));
  const statusPill = (l) => ({
    live: `<span class="pill pill-live">Live now</span>`, upcoming: `<span class="pill pill-navy">Scheduled stream</span>`,
    private: `<span class="pill pill-red" title="Set it to Unlisted in YouTube Studio">Private — students can't see it</span>`,
    no_embed: `<span class="pill pill-red" title="YouTube Studio → the video → Allow embedding">Embedding off</span>`,
    removed: `<span class="pill pill-gray">Removed from playlist</span>`,
  }[l.status] || "") + (l.hidden ? ` <span class="pill pill-gray">Hidden</span>` : "");
  const lessons = c.lessons.filter((l) => l.status !== "removed");
  wrap.innerHTML = `
    <div class="lect-summary">
      <p style="margin:0;"><strong>${FORMAT_LABEL[c.format]}</strong>${c.format === "online" ? ` · ${c.pace === "self" ? "Self-paced" : "Follows the class calendar"}` : ""}${c.format !== "in_person" && c.pace === "calendar" ? ` · class ${c.classMinutes} min` : ""}
        ${c.studentIds.length ? ` · ${c.studentIds.length - online.length} in the classroom, ${online.length} online` : ""}</p>
      <p class="field-hint" style="margin:4px 0 0;">Change how the course is attended, its playlist and class length in <strong>Edit Course Details</strong>.</p>
    </div>
    ${c.playlistId ? `
    <div class="lect-sync ${sync && sync.ok === false ? "lect-sync-bad" : ""}">
      <div>${icon("video")} <a href="https://www.youtube.com/playlist?list=${esc(c.playlistId)}" target="_blank" rel="noopener">YouTube playlist</a>
        <span class="field-hint" style="margin:0;">${sync && sync.syncedAt ? `· checked ${esc(timeAgo(sync.syncedAt))}${sync.ok ? ` · ${sync.count} video${sync.count === 1 ? "" : "s"}` : ""}` : "· not checked yet"}</span></div>
      ${sync && sync.ok === false && sync.error ? `<p class="lect-error">${icon("warning")} ${esc(sync.error)}</p>` : ""}
      ${teach ? `<button class="btn btn-ghost btn-sm" id="lectSyncNow">Check Now</button>` : ""}
    </div>` : `<p class="field-hint">No playlist yet. Add one in Edit Course Details, or add videos one at a time below.</p>`}
    ${c.format !== "in_person" || c.playlistId ? `<div class="form-actions" style="margin-top:10px;"><button class="btn btn-gold btn-sm" id="lectOpenLive">${icon("video")} Open the Live Class</button><span class="field-hint" style="margin:0;align-self:center;">Read students' questions on your phone or laptop during class.</span></div>` : ""}
    <ul class="lect-admin-list">
      ${lessons.length === 0 ? `<li class="field-hint">No lectures yet.</li>` : lessons.map((l) => {
        const done = online.filter((sid) => (l.views[sid] || {}).completedAt).length;
        return `<li class="lect-admin-row ${l.hidden ? "is-hidden" : ""}">
          <img src="https://i.ytimg.com/vi/${esc(l.videoId)}/default.jpg" alt="" width="64" height="48" loading="lazy">
          <div class="lect-admin-main">
            <strong>${esc(l.title || l.videoId)}</strong> ${statusPill(l)}
            <div class="field-hint" style="margin:2px 0 0;">${l.duration ? fmtDuration(l.duration) + " · " : ""}${l.fromPlaylist ? "From the playlist" : "Added by link"}${online.length && l.status === "ok" ? ` · ${done}/${online.length} online students finished` : ""}</div>
            ${teach ? `<label class="lect-date">Class day
              <input type="date" value="${esc(l.classDate || "")}" data-lesson-date="${l.id}" ${c.pace === "self" ? 'title="Sets its order for self-paced students"' : ""}>
              ${l.fixedDate ? `<button type="button" class="link-btn" data-lesson-auto="${l.id}">automatic</button>` : `<small>(automatic)</small>`}</label>` : ""}
          </div>
          <div class="lect-admin-actions">
            ${l.status === "ok" ? `<button class="btn btn-ghost btn-sm" data-preview-lesson="${l.id}">Watch</button>` : ""}
            ${teach ? `<button class="btn btn-ghost btn-sm" data-hide-lesson="${l.id}">${l.hidden ? "Show" : "Hide"}</button>
            <button class="btn btn-ghost btn-sm" data-replace-lesson="${l.id}">Replace</button>
            ${!l.fromPlaylist ? `<button class="btn btn-ghost btn-sm" data-remove-lesson="${l.id}">Remove</button>` : ""}` : ""}
          </div>
        </li>`;
      }).join("")}
    </ul>
    ${teach ? `
    <form class="lect-add" id="lectAddForm">
      <label for="lectAddUrl">Add a video by link</label>
      <div class="lect-add-row">
        <input type="url" id="lectAddUrl" placeholder="https://youtu.be/…" autocomplete="off" />
        <input type="text" id="lectAddTitle" placeholder="Title (optional)" maxlength="300" />
        <button class="btn btn-primary btn-sm" type="submit">Add</button>
      </div>
      <div class="field-hint">For a video that isn't in the playlist. To use a better recording of a lecture, use <strong>Replace</strong> on it instead.</div>
    </form>` : ""}`;
  const q = (sel) => wrap.querySelectorAll(sel);
  const find = (id) => c.lessons.find((x) => x.id === id);
  const sn = document.getElementById("lectSyncNow");
  if (sn) sn.addEventListener("click", () => run(() => DB.requestPlaylistSync(c.id), null, { success: "The playlist will be checked within a minute." }));
  const ol = document.getElementById("lectOpenLive");
  if (ol) ol.addEventListener("click", () => openLiveClass(c.id, "manage"));
  q("[data-preview-lesson]").forEach((b) => b.addEventListener("click", () => openLecture(c.id, b.dataset.previewLesson, "manage")));
  q("[data-hide-lesson]").forEach((b) => b.addEventListener("click", () => {
    const l = find(b.dataset.hideLesson);
    run(() => DB.updateLesson(l.id, { hidden: !l.hidden }), null, { success: l.hidden ? "Students can see it again." : "Hidden from students." });
  }));
  q("[data-lesson-date]").forEach((inp) => inp.addEventListener("change", () =>
    run(() => DB.updateLesson(inp.dataset.lessonDate, { class_date: inp.value || null }), null, { success: "Class day saved." })));
  q("[data-lesson-auto]").forEach((b) => b.addEventListener("click", () =>
    run(() => DB.updateLesson(b.dataset.lessonAuto, { class_date: null }), null, { success: "Back to the automatic class day." })));
  q("[data-remove-lesson]").forEach((b) => b.addEventListener("click", async () => {
    const l = find(b.dataset.removeLesson);
    if (!(await askConfirm(`Remove "${l.title || "this video"}" from the course? Students' progress on it goes too.`))) return;
    run(() => DB.deleteLesson(l.id), null, { success: "Removed." });
  }));
  q("[data-replace-lesson]").forEach((b) => b.addEventListener("click", () => openReplaceLessonModal(c, find(b.dataset.replaceLesson))));
  const af = document.getElementById("lectAddForm");
  if (af) af.addEventListener("submit", (e) => {
    e.preventDefault();
    const vid = parseVideoId(document.getElementById("lectAddUrl").value);
    if (!vid) { toast("That doesn't look like a YouTube video link."); document.getElementById("lectAddUrl").focus(); return; }
    if (c.lessons.some((l) => l.videoId === vid)) { toast("That video is already in this course."); return; }
    const title = document.getElementById("lectAddTitle").value.trim();
    run(async () => { await DB.addLesson(c, vid, title); await DB.requestPlaylistSync(c.id).catch(() => {}); }, null, { success: "Video added. Its length and title are filled in within a minute." });
  });
}
function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function openReplaceLessonModal(c, l) {
  document.getElementById("modalRoot").innerHTML = `
    <div class="modal-backdrop"><div class="modal" style="max-width:520px;">
      <h2 style="font-size:1.15rem;">Replace "${esc(l.title || "this lecture")}"</h2>
      <p class="field-hint">Use a better recording of this lecture. It keeps its place and class day${l.fromPlaylist ? ", and the old video won't come back from the playlist" : ""}. Students start the new video fresh.</p>
      <label for="repUrl">New video link</label>
      <input type="url" id="repUrl" placeholder="https://youtu.be/…" autocomplete="off" />
      <div class="form-actions"><button class="btn btn-primary" id="repSave">Replace</button><button class="btn btn-ghost" id="repCancel">Cancel</button></div>
    </div></div>`;
  document.getElementById("repCancel").addEventListener("click", closeModal);
  document.getElementById("repSave").addEventListener("click", () => {
    const vid = parseVideoId(document.getElementById("repUrl").value);
    if (!vid) { toast("That doesn't look like a YouTube video link."); return; }
    run(async () => {
      await DB.updateLesson(l.id, { video_id: vid, replaces: l.fromPlaylist ? l.videoId : l.replaces, from_playlist: false, duration_seconds: null, status: "ok", title: l.title, class_date: l.fixedDate || l.classDate || null });
      await DB.requestPlaylistSync(c.id).catch(() => {});
      closeModal();
    }, null, { success: "Lecture replaced." });
  });
}

// Roster: each student's track (hybrid) or start date (self-paced).
function rosterAttendHtml(c, u) {
  if (c.format === "in_person") return "";
  if (c.pace === "self") {
    const e = c.enrollment[u.id] || {};
    return `<div class="roster-attend"><label>Started <input type="date" value="${esc(e.startOn || "")}" data-start-for="${u.id}" ${iManage(c) ? "" : "disabled"}></label><small>finishes by ${esc(fmtDay(selfPacedEnd(c, u.id), { month: "short", day: "numeric", year: "numeric" }))}</small></div>`;
  }
  const t = effTrack(c, u.id);
  const opts = c.format === "hybrid" ? ["classroom", "live", "recorded"] : ["live", "recorded"];
  return `<div class="roster-attend"><select data-track-for="${u.id}" aria-label="How ${esc(u.name)} attends" ${iManage(c) ? "" : "disabled"}>${opts.map((k) => `<option value="${k}" ${k === t ? "selected" : ""}>${TRACK_SHORT[k]}</option>`).join("")}</select>${(c.enrollment[u.id] || {}).trackChosen ? "" : `<small>not chosen yet</small>`}</div>`;
}
function wireRosterAttend(c, wrap) {
  wrap.querySelectorAll("[data-track-for]").forEach((s) => s.addEventListener("change", () =>
    run(() => DB.setStudentTrack(c.id, s.dataset.trackFor, s.value), null, { success: `${userName(s.dataset.trackFor)}: ${TRACK_LABEL[s.value]}.` })));
  wrap.querySelectorAll("[data-start-for]").forEach((s) => s.addEventListener("change", () => {
    if (!s.value) return;
    run(() => DB.setStudentStart(c.id, s.dataset.startFor, s.value), null, { success: "Start date saved — their due dates moved with it." });
  }));
}

// Attendance screen: online students, counted automatically.
function onlineAttendanceHtml(c, date, list) {
  if (!list.length) return "";
  const marks = c.attMarks[date] || {}, notes = c.attNotes[date] || {};
  const lessons = c.lessons.filter((l) => l.classDate === date && !l.hidden && l.status !== "removed");
  return `
    <div class="section-title"><h2>Online — counted automatically</h2></div>
    <div class="card att-online">
      <p class="field-hint" style="margin:0 0 10px;">Live: ${Math.round(LIVE_SHARE * 100)}% of the class watched on the site. Recording: ${WATCH_SHARE}% within ${WATCH_DAYS} days.${lessons.length ? "" : " No recording has been posted for this class yet."}</p>
      ${list.map((u) => {
        const st = marks[u.id];
        const best = Math.max(0, ...lessons.map((l) => (l.views[u.id] || {}).pct || 0));
        return `<div class="att-row att-row-auto">
          <div class="att-who">${avatarHtml(u, 34)}<span>${esc(lastFirst(u.name))}<small>${TRACK_SHORT[effTrack(c, u.id)]}</small></span></div>
          <div class="att-auto">${st ? `<span class="pill ${st === "present" ? "pill-green" : st === "absent" ? "pill-red" : "pill-gray"}">${ATT_LABEL[st]}</span>` : `<span class="pill pill-gold">Waiting</span>`}
            <small>${esc((notes[u.id] || {}).note || (st ? "" : lessons.length ? `${Math.round(best)}% of the recording watched` : "has until a week after the recording is posted"))}</small></div>
        </div>`;
      }).join("")}
    </div>`;
}

// ---------------------------------------------------------------------------
// Lecture Archive (Resource Library): past courses' lectures, for study only
// ---------------------------------------------------------------------------
let archiveCourseId = null;
function archiveCourses() {
  return courses.filter((c) => c.archived && c.lessons.some((l) => playableLesson(l))).sort((a, b) => a.title.localeCompare(b.title));
}
function lectureArchiveEntryHtml() {
  const list = archiveCourses();
  if (!list.length) return "";
  const n = list.reduce((s, c) => s + c.lessons.filter(playableLesson).length, 0);
  return `<button type="button" class="card archive-entry" id="openLectureArchive">
    <span class="icon-badge">${icon("video")}</span>
    <span><strong>Lecture Archive</strong><small>${n} recorded lecture${n === 1 ? "" : "s"} from ${list.length} past course${list.length === 1 ? "" : "s"} — for your own study (no course credit)</small></span>
    <span aria-hidden="true">&rarr;</span>
  </button>`;
}
function wireLectureArchiveEntry() {
  const b = document.getElementById("openLectureArchive");
  if (b) b.addEventListener("click", () => { archiveCourseId = null; view = "lectureArchive"; renderNav(); renderMain(); });
}
function renderLectureArchive(main) {
  stopLecture();
  const list = archiveCourses();
  const c = archiveCourseId ? list.find((x) => x.id === archiveCourseId) : null;
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to ${c ? "Lecture Archive" : "Resource Library"}</button>
    <div class="page-header">
      <div class="eyebrow">Resource Library</div>
      <h1>${c ? esc(c.title) : "Lecture Archive"}</h1>
      <p>${c ? "Recorded lectures from this past course." : "Recorded lectures from past courses, open to every student for study. Watching here doesn't count toward any course."}</p>
    </div>
    ${c ? `<div class="card"><ul class="lecture-list">${c.lessons.filter(playableLesson).map((l) => `
      <li class="lecture-row"><button type="button" class="lecture-open" data-arch-lesson="${l.id}">
        <span class="lecture-thumb"><img src="https://i.ytimg.com/vi/${esc(l.videoId)}/mqdefault.jpg" alt="" loading="lazy" width="120" height="68"><span class="lecture-play">▶</span></span>
        <span class="lecture-text"><strong>${esc(l.title || "Lecture")}</strong><small>${l.duration ? fmtDuration(l.duration) : ""}</small></span>
      </button></li>`).join("")}</ul></div>`
    : list.length ? `<div class="archive-grid">${list.map((x) => `
      <button type="button" class="card archive-course" data-arch-course="${x.id}">
        <img src="https://i.ytimg.com/vi/${esc(x.lessons.find(playableLesson).videoId)}/mqdefault.jpg" alt="" loading="lazy">
        <strong>${esc(x.title)}</strong><small>${x.lessons.filter(playableLesson).length} lectures</small>
      </button>`).join("")}</div>`
    : `<div class="card empty-state"><p>No past lectures yet.</p></div>`}`;
  document.getElementById("backLink").addEventListener("click", () => {
    if (c) { archiveCourseId = null; renderLectureArchive(main); } else { view = "resourceLibrary"; renderNav(); renderMain(); }
  });
  main.querySelectorAll("[data-arch-course]").forEach((b) => b.addEventListener("click", () => { archiveCourseId = b.dataset.archCourse; renderLectureArchive(main); window.scrollTo(0, 0); }));
  main.querySelectorAll("[data-arch-lesson]").forEach((b) => b.addEventListener("click", () => openLecture(c.id, b.dataset.archLesson, "lectureArchive")));
}
