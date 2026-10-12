// ===========================================================================
// Class replays (added Oct 11, 2026)
// ===========================================================================
// A recording of a class that was taught in Teach mode plays with the slides
// beside it, changing at the moments they changed in class, and with the
// class's questions appearing as they were asked and answered.
//
// Timing: every slide change was saved with its time (teach_events). The
// video's second 0 is when the YouTube live stream began (lessons.
// stream_started_at, from YouTube), or the teacher's own lining-up
// (replay_zero_at). So: moment in class = zero + video seconds.
// ===========================================================================

let replayState = null;

function stopReplay() {
  if (replayState) { clearInterval(replayState.timer); replayState = null; }
}

// Placeholders that renderLecture puts on the page; filled in by startReplay.
function replaySlotHtml() {
  return `<aside class="replay-side" id="replaySide" hidden>
      <div id="rpSlideBlock">
        <div class="replay-slide" id="rpSlide"><img id="rpImg" alt=""><p class="rp-msg" id="rpMsg"></p></div>
        <div class="replay-slide-foot"><span id="rpCount"></span><span id="rpDeck"></span></div>
      </div>
      <div class="card replay-questions">
        <div class="replay-q-head"><strong>${icon("chat")} Questions from class</strong><small id="rpQCount"></small></div>
        <div id="rpQList"><p class="field-hint" style="margin:0;">Questions asked during class appear here as the video reaches them.</p></div>
      </div>
    </aside>`;
}
function replayBelowHtml() {
  return `<div id="replayBelow" hidden>
      <div class="replay-strip-wrap"><div class="replay-strip-head"><strong>${icon("video")} Slides from class</strong><small>Tap a slide to jump to it in the video</small></div><div class="replay-strip" id="rpStrip"></div></div>
      <div id="rpTools"></div>
    </div>`;
}

function videoClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function classClock(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { timeZone: "America/Anchorage", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

// The slide on screen at a moment of class (last change at or before it).
function replayStateAt(events, wall) {
  let lo = 0, hi = events.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].at <= wall) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found < 0 ? null : events[found];
}
// Each stretch of class one slide was on the TV, in order.
function replaySegments(events) {
  const segs = [];
  events.forEach((e) => {
    if (!e.active || e.blanked || !e.deckId) return;
    const last = segs[segs.length - 1];
    if (last && last.deckId === e.deckId && last.slide === e.slide) return;
    segs.push({ deckId: e.deckId, slide: e.slide, at: e.at });
  });
  // drop a slide that flashed past for under two seconds (paging quickly)
  return segs.filter((s, i) => i === segs.length - 1 || segs[i + 1].at - s.at >= 2000);
}

async function startReplay(c, l, player) {
  stopReplay();
  let data = null;
  try { data = await DB.classReplay(l.id); } catch (e) { return; }
  if (!data || view !== "lecture" || activeLessonId !== l.id) return;
  const decks = data.decks.filter((d) => d.status === "ready" && d.count);
  const segs = replaySegments(data.events.filter((e) => !e.deckId || decks.some((d) => d.id === e.deckId)));
  const teacher = iManage(c);
  const hasSlides = segs.length > 0;
  const hasQuestions = data.questions.length > 0;
  if (!hasSlides && !(hasQuestions && data.zero)) return;
  const st = replayState = {
    timer: null, zero: data.zero ? Date.parse(data.zero) : null, data, decks, segs, urls: {}, thumbs: {},
    key: "", qKey: "", seg: -1, player, pick: null,
  };
  const page = document.querySelector(".lecture-page");
  if (page) page.classList.add("has-replay");
  const side = document.getElementById("replaySide");
  if (side) side.hidden = false;
  const slideBlock = document.getElementById("rpSlideBlock");
  if (slideBlock) slideBlock.hidden = !hasSlides;
  const below = document.getElementById("replayBelow");
  if (below) below.hidden = false;
  const strip = document.querySelector(".replay-strip-wrap");
  if (strip) strip.hidden = !hasSlides;

  // slide pictures (large beside the video, small in the strip)
  const big = window.matchMedia("(max-width: 760px)").matches ? "s" : "";
  await Promise.all(decks.map(async (d) => {
    try { st.urls[d.id] = await deckImages(d, big); } catch (e) { st.urls[d.id] = []; }
    try { st.thumbs[d.id] = big === "s" ? st.urls[d.id] : await deckImages(d, "s"); } catch (e) { st.thumbs[d.id] = []; }
  }));
  if (replayState !== st) return;

  const vt = (at) => (at - st.zero) / 1000;  // moment of class → video seconds
  const seek = (at) => {
    if (st.zero === null) return;
    try { player.seekTo(Math.max(0, vt(at) + 0.5), true); player.playVideo && player.playVideo(); } catch (e) { /* not ready */ }
    tick(true);
  };

  // --- the strip of slides ---
  const drawStrip = () => {
    const box = document.getElementById("rpStrip");
    if (!box) return;
    box.innerHTML = segs.map((s, i) => {
      const u = (st.thumbs[s.deckId] || [])[s.slide - 1];
      const when = st.zero !== null && vt(s.at) >= 0 ? videoClock(vt(s.at)) : classClock(s.at);
      return `<button type="button" class="rp-thumb" data-seg="${i}" aria-label="Slide ${s.slide}, ${esc(when)}">
        ${u ? `<img src="${esc(u)}" alt="" loading="lazy">` : `<span class="rp-thumb-blank">${s.slide}</span>`}
        <small>Slide ${s.slide} · ${esc(when)}</small></button>`;
    }).join("");
    box.querySelectorAll("[data-seg]").forEach((b) => b.addEventListener("click", () => {
      const s = segs[+b.dataset.seg];
      if (st.zero !== null) seek(s.at + 300);
      else { st.pick = s; tick(true); }
    }));
  };
  drawStrip();

  // --- the slide beside the video, and the questions so far ---
  const img = document.getElementById("rpImg"), msg = document.getElementById("rpMsg");
  const setSlide = (key, url, text, dim) => {
    if (key === st.key) return;
    st.key = key;
    if (img) { if (url) { img.src = url; img.hidden = false; } else img.hidden = true; img.classList.toggle("rp-dim", !!dim); }
    if (msg) { msg.textContent = text || ""; msg.hidden = !text; }
  };
  const showSeg = (s, dim, text) => {
    const d = decks.find((x) => x.id === s.deckId);
    const u = (st.urls[s.deckId] || [])[s.slide - 1];
    setSlide(`${s.deckId}:${s.slide}:${dim ? 1 : 0}:${text || ""}`, u, text, dim);
    const cnt = document.getElementById("rpCount"), dk = document.getElementById("rpDeck");
    if (cnt) cnt.textContent = `Slide ${s.slide}${d ? ` of ${d.count}` : ""}`;
    if (dk) dk.textContent = d ? d.title : "";
  };
  const markStrip = (i) => {
    if (i === st.seg) return;
    st.seg = i;
    document.querySelectorAll(".rp-thumb").forEach((b) => b.classList.toggle("on", +b.dataset.seg === i));
    const on = document.querySelector(`.rp-thumb[data-seg="${i}"]`);
    const box = document.getElementById("rpStrip");
    if (on && box) box.scrollTo({ left: on.offsetLeft - box.clientWidth / 2 + on.clientWidth / 2, behavior: "smooth" });
  };
  const drawQuestions = (wall) => {
    const box = document.getElementById("rpQList");
    if (!box) return;
    const qs = data.questions;
    const shown = st.zero === null ? qs : qs.filter((q) => q.at <= wall);
    const pinnedEver = new Set(data.events.filter((e) => e.pinned && e.at <= wall).map((e) => e.pinned));
    const ev = replayStateAt(data.events, wall);
    const pinnedNow = ev && ev.active ? ev.pinned : null;
    const key = shown.map((q) => `${q.id}${q.answeredAt && q.answeredAt <= wall ? "a" : ""}${pinnedEver.has(q.id) ? "p" : ""}${pinnedNow === q.id ? "n" : ""}`).join(",");
    const later = qs.length - shown.length;
    const cnt = document.getElementById("rpQCount");
    if (cnt) cnt.textContent = qs.length ? (later ? `${later} more later in the class` : `${qs.length} in all`) : "None were asked";
    if (key === st.qKey) return;
    st.qKey = key;
    box.innerHTML = shown.length ? shown.map((q) => {
      const answered = q.answeredAt && (st.zero === null || q.answeredAt <= wall);
      const when = st.zero !== null && vt(q.at) >= 0 ? videoClock(vt(q.at)) : classClock(q.at);
      return `<div class="rq ${q.teacher ? "rq-teacher" : ""} ${pinnedNow === q.id ? "rq-now" : ""}">
        <div class="rq-who"><strong>${esc(q.name || "A student")}</strong>${q.teacher ? ` <span class="pill pill-gold">Teacher</span>` : ""}
          <button type="button" class="rq-time" data-q-at="${q.at}" ${st.zero === null ? "disabled" : ""}>${esc(when)}</button>
          ${answered ? `<span class="pill pill-green">Answered</span>` : ""}
          ${pinnedEver.has(q.id) ? `<span class="pill pill-navy">On the screen</span>` : ""}</div>
        <div class="rq-body">${esc(q.body)}</div></div>`;
    }).join("") : `<p class="field-hint" style="margin:0;">${qs.length ? "Questions asked during class appear here as the video reaches them." : "No questions were asked in this class."}</p>`;
    box.querySelectorAll("[data-q-at]").forEach((b) => b.addEventListener("click", () => seek(+b.dataset.qAt - 3000)));
    const last = box.lastElementChild;
    if (last && shown.length && box.dataset.n !== String(shown.length)) { box.dataset.n = String(shown.length); box.scrollTop = box.scrollHeight; }
  };

  const tick = (force) => {
    if (replayState !== st) return;
    if (force) { st.key = ""; st.qKey = ""; }
    if (st.zero === null) {
      const s = st.pick || segs[0];
      if (s) { showSeg(s, false, st.pick ? "" : teacher ? "Line the slides up with the video below to make them follow along." : "The slides aren't lined up with the video yet — tap any slide below to look at it."); markStrip(segs.indexOf(s)); }
      drawQuestions(Infinity);
      return;
    }
    let t = 0;
    try { t = player.getCurrentTime() || 0; } catch (e) { return; }
    const wall = st.zero + t * 1000;
    if (hasSlides) {
      const ev = replayStateAt(data.events, wall);
      const first = data.events.find((e) => e.active);
      if (!ev || !ev.active) {
        if (!ev && first) {
          const s0 = segs[0];
          showSeg(s0, true, vt(first.at) > 1 ? `The slides begin at ${videoClock(vt(first.at))} in the video.` : "");
          markStrip(-1);
        } else {
          const lastSeg = segs[segs.length - 1];
          if (lastSeg) showSeg(lastSeg, true, "Class has ended.");
          markStrip(-1);
        }
      } else if (ev.blanked || !ev.deckId) {
        setSlide("blank", null, "The teacher blanked the screen here.", false);
        const cnt = document.getElementById("rpCount"); if (cnt) cnt.textContent = "";
      } else {
        const i = (() => { let k = -1; segs.forEach((s, j) => { if (s.at <= wall) k = j; }); return k; })();
        showSeg({ deckId: ev.deckId, slide: ev.slide }, false, "");
        markStrip(i);
      }
    }
    drawQuestions(wall);
  };
  tick(true);
  st.timer = setInterval(() => tick(false), 300);

  if (teacher && hasSlides) drawReplayTools(c, l, st, () => { drawStrip(); tick(true); });
}

// The teacher's "Slide timing" card: shows where the timing came from, and
// lets him line the slides up by hand (once) or nudge them.
function drawReplayTools(c, l, st, redraw) {
  const box = document.getElementById("rpTools");
  if (!box) return;
  const auto = st.data.autoZero ? Date.parse(st.data.autoZero) : null;
  const manual = st.zero !== null && (auto === null || st.zero !== auto);
  const from = st.zero === null ? `<strong class="rp-warn">Not lined up yet.</strong> The slides can't follow the video until they're lined up — it only takes a moment, once.`
    : manual ? "Lined up by hand." : "Lined up automatically from the YouTube stream.";
  box.innerHTML = `<div class="card replay-tools">
    <div class="replay-q-head"><strong>${icon("gear")} Slide timing</strong><small>Only teachers see this</small></div>
    <p class="field-hint" style="margin:0 0 8px;">${from}</p>
    ${st.zero !== null ? `<div class="rp-nudge"><span>Slides change</span>
      <button type="button" class="btn btn-ghost btn-sm" data-nudge="-2000">2 s sooner</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nudge="2000">2 s later</button>
      ${manual && auto !== null ? `<button type="button" class="btn btn-ghost btn-sm" id="rpAuto">Use YouTube's timing</button>` : ""}</div>` : ""}
    <div class="rp-line"><label for="rpLineSeg">Line up by a slide change:</label>
      <select id="rpLineSeg">${st.segs.map((s, i) => `<option value="${i}">Slide ${s.slide} — went up at ${esc(classClock(s.at))}</option>`).join("")}</select>
      <button type="button" class="btn btn-primary btn-sm" id="rpLineNow">It goes up at this point in the video</button></div>
    <p class="field-hint" style="margin:6px 0 0;">Play the video to the moment that slide appears on the TV behind the teacher (or he says "next slide"), pause, then tap the button.</p>
    <p class="field-hint" id="rpToolMsg" aria-live="polite"></p>
  </div>`;
  const say = (t) => { const e = document.getElementById("rpToolMsg"); if (e) e.textContent = t; };
  const save = async (zero, note) => {
    try {
      await DB.setReplayZero(l.id, zero === null ? null : new Date(zero).toISOString());
      st.zero = zero === null ? auto : zero;
      l.replayZeroAt = zero === null ? null : new Date(zero).toISOString();
      redraw();
      drawReplayTools(c, l, st, redraw);
      say(note);
    } catch (e) { toast(friendlyError(e)); }
  };
  box.querySelectorAll("[data-nudge]").forEach((b) => b.addEventListener("click", () => {
    // A slide that went up at moment `at` shows at video second (at − zero)/1000,
    // so "2 s sooner" (−2000) moves zero forward 2 s, and "later" moves it back.
    save(st.zero - +b.dataset.nudge, +b.dataset.nudge < 0 ? "Slides now change 2 seconds sooner." : "Slides now change 2 seconds later.");
  }));
  const autoBtn = document.getElementById("rpAuto");
  if (autoBtn) autoBtn.addEventListener("click", () => save(null, "Back to YouTube's timing."));
  document.getElementById("rpLineNow").addEventListener("click", () => {
    const s = st.segs[+document.getElementById("rpLineSeg").value];
    let t = 0;
    try { t = st.player.getCurrentTime() || 0; } catch (e) { /* not ready */ }
    save(s.at - t * 1000, `Lined up: slide ${s.slide} now appears at ${videoClock(t)}.`);
  });
}
