// ===========================================================================
// Teaching with slides (added Oct 10, 2026)
// ===========================================================================
// • Lesson plan (Manage → Lesson plan): an ordered list of lessons, one per
//   class meeting. The teacher never types a date — lessons are paired with
//   the course's class days in order, so a canceled or moved class shifts
//   everything after it, and "pick up here next time" splits a lesson in two.
// • Slide decks: a PDF (or a PowerPoint, once conversion is switched on) is
//   turned into one picture per slide when it's uploaded — a large one for
//   the TV and a small one for phones and the iPad.
// • Teach mode (iPad): lesson notes big on the left; a small view of the
//   slide, Back / Next, and online students' questions on the right.
// • TV screen (?present=<course>): the classroom laptop shows the slides
//   full screen and follows the iPad.
// • Online students follow the slides on the Live Class page.
// Every screen hears a slide change instantly (Supabase Realtime broadcast)
// and also checks the database every few seconds, so a dropped message
// never leaves anyone on the wrong slide for long.
// ===========================================================================

const SLIDE_W_LARGE = 1600;
const SLIDE_W_SMALL = 640;
const SLIDE_MAX = 400;
const TEACH_POLL_MS = window.TNBBI_TEST_TEACH_POLL || 3000;
const TV_HELLO_MS = 10000;
const SHARE_LABEL = { after: "After that lesson is taught", before: "Any time (before class too)", never: "Only while I'm presenting" };

// --- small helpers -------------------------------------------------------------
// Someone asked a question who wasn't known when this page loaded (a new
// student): load the site's people again, at most once a minute.
let namesReloadAt = 0;
async function ensureNames(ids) {
  const missing = ids.filter((id) => id && !users.some((u) => u.id === id));
  if (!missing.length || Date.now() - namesReloadAt < 60000) return false;
  namesReloadAt = Date.now();
  try { await loadAll(); return true; } catch (e) { return false; }
}
function planDeck(c, r) { return r && r.deckId ? (c.decks || []).find((d) => d.id === r.deckId) || null : null; }
function planNotes(c, r) { return r && r.notesId ? c.materials.find((m) => m.id === r.notesId) || null : null; }
function shortDay(d) { return parseDay(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
function longDay(d) { return parseDay(d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }); }
function fileExt(name) { return ((name || "").split(".").pop() || "").toLowerCase(); }
function isSlideFile(name) { return ["ppt", "pptx", "pdf", "key"].includes(fileExt(name)); }
function baseTitle(name) {
  return (name || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ")
    .replace(/^\s*(lesson|week|class|session|lecture|part)?\s*#?\d{1,3}\s*[:.\-–—)]?\s+/i, "")
    .replace(/\b(slides?|power ?point|pptx?|presentation|lesson notes|handout)\b/ig, " ").replace(/\s+notes\s*$/i, "")
    .replace(/\s*[-–—·]+\s*$/, "").replace(/^\s*[-–—·]+\s*/, "").replace(/\s{2,}/g, " ").trim();
}

// Which class day each lesson falls on. Taught lessons keep the day they were
// taught; the rest take the class days after the last one taught, in order.
// Returns [{ r, date, n, next, overdue }]; n = lesson number (a continuation
// shares its lesson's number).
function planSchedule(c) {
  const rows = (c.plan || []).slice().sort((a, b) => a.position - b.position);
  const used = new Set(rows.filter((r) => r.taughtOn).map((r) => r.taughtOn));
  const last = rows.reduce((m, r) => (r.taughtOn && r.taughtOn > m ? r.taughtOn : m), "");
  const today = todayStr();
  // Nothing taught yet: the plan starts at today's (or the next) class.
  const free = classDates(c).filter((d) => (last ? d > last : d >= today) && !used.has(d));
  let n = 0, nextFound = false;
  return rows.map((r) => {
    if (!r.continuedFrom) n++;
    const done = r.status === "taught" || r.status === "partial";
    const date = done ? r.taughtOn : (free.shift() || null);
    const next = !done && !nextFound;
    if (next) nextFound = true;
    return { r, date, n, next, done, overdue: !done && !!date && date < today };
  });
}
function nextPlanRow(c) {
  const x = planSchedule(c).find((s) => s.next);
  return x ? x.r : null;
}
// The lesson to open in Teach mode today: the next untaught one.
function teachTarget(c) {
  if (c.live && c.live.active && c.live.planId) return c.plan.find((r) => r.id === c.live.planId) || nextPlanRow(c);
  return nextPlanRow(c);
}

// ===========================================================================
// Slide decks: a file → one picture per slide
// ===========================================================================
async function pdfToSlides(c, deckId, data, onProgress) {
  await loadScriptOnce(PDFJS_URL);
  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  const doc = await pdfjs.getDocument({ data }).promise;
  const count = Math.min(doc.numPages, SLIDE_MAX);
  const toBlob = (canvas, q) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("A slide couldn't be saved."))), "image/jpeg", q));
  for (let n = 1; n <= count; n++) {
    onProgress && onProgress(n, count);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    for (const [w, suffix, q] of [[SLIDE_W_LARGE, "", 0.82], [SLIDE_W_SMALL, "-s", 0.74]]) {
      const vp = page.getViewport({ scale: w / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      await DB.uploadSlide(c.id, deckId, `${n}${suffix}.jpg`, await toBlob(canvas, q));
    }
  }
  return count;
}

// PowerPoint speaker notes, read straight from the .pptx (it's a zip of XML).
const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
async function pptxSpeakerNotes(file) {
  try {
    await loadScriptOnce(JSZIP_URL);
    const zip = await window.JSZip.loadAsync(file);
    const pres = await zip.file("ppt/presentation.xml").async("string");
    const presRels = await zip.file("ppt/_rels/presentation.xml.rels").async("string");
    const relTarget = {};
    for (const m of presRels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relTarget[m[1]] = m[2];
    const slides = [...pres.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map((m) => relTarget[m[1]]);
    const out = [];
    for (const target of slides) {
      let text = "";
      try {
        const name = target.split("/").pop();
        const rels = zip.file(`ppt/slides/_rels/${name}.rels`);
        const relXml = rels ? await rels.async("string") : "";
        const nm = /Target="\.\.\/notesSlides\/([^"]+)"/.exec(relXml);
        if (nm) {
          const xml = await zip.file(`ppt/notesSlides/${nm[1]}`).async("string");
          text = [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)]
            .filter((sp) => /type="body"/.test(sp[0]))
            .map((sp) => [...sp[0].matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
              .map((p) => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join("")).join("\n"))
            .join("\n").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
        }
      } catch (e) { /* one slide's notes unreadable — skip it */ }
      out.push(text);
    }
    return out;
  } catch (e) { console.warn("speaker notes:", e); return []; }
}

// PowerPoint / Google Slides → PDF, done by the site's conversion service
// (switched on in config.js once it's set up). Returns the PDF's bytes.
function slideConverterOn() { return !!(window.TNBBI_CONFIG && TNBBI_CONFIG.slideConverter); }
async function convertToPdf(c, input) {
  if (!slideConverterOn()) throw new Error("PowerPoint files can't be turned into slides yet — that part is still being switched on. For now, in PowerPoint choose File → Save As → PDF, and add the PDF.");
  const { data: { session } } = await sb.auth.getSession();
  const url = `${TNBBI_CONFIG.supabaseUrl}/functions/v1/${TNBBI_CONFIG.slideConverter}`;
  const headers = { authorization: `Bearer ${session ? session.access_token : ""}`, apikey: TNBBI_CONFIG.supabaseAnonKey };
  let res;
  if (typeof input === "string") {
    res = await fetch(url, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ course: c.id, link: input }) });
  } else {
    res = await fetch(`${url}?course=${encodeURIComponent(c.id)}&name=${encodeURIComponent(input.name)}`, { method: "POST", headers: { ...headers, "content-type": input.type || "application/octet-stream" }, body: input });
  }
  if (!res.ok) {
    let msg = "";
    try { msg = (await res.json()).error || ""; } catch (e) { /* not JSON */ }
    throw new Error(msg || "The presentation couldn't be converted. Try saving it as a PDF and adding that instead.");
  }
  return new Uint8Array(await res.arrayBuffer());
}
function googleSlidesId(link) {
  const m = /docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]{20,})/.exec(link || "");
  return m ? m[1] : null;
}

// Make a deck from a file (PDF or PowerPoint) or a Google Slides link.
// onProgress(text) reports what's happening. Returns the deck id.
async function createDeckFromSource(c, source, onProgress) {
  const isLink = typeof source === "string";
  const name = isLink ? "Google Slides" : source.name;
  const ext = isLink ? "gslides" : fileExt(name);
  if (!isLink && !["pdf", "ppt", "pptx"].includes(ext)) throw new Error(`"${name}" isn't a PowerPoint or PDF file.`);
  if (!isLink && source.size > 150 * 1024 * 1024) throw new Error(`"${name}" is too large (over 150 MB).`);
  if (!isLink && ext !== "pdf" && !slideConverterOn()) await convertToPdf(c, source); // throws the friendly message
  const title = isLink ? "Google Slides" : (baseTitle(name) || name.replace(/\.[a-z0-9]+$/i, ""));
  const deckId = await DB.createDeck(c.id, title, ext === "pdf" ? "pdf" : isLink ? "gslides" : "pptx", 0);
  try {
    let data;
    if (ext === "pdf") data = new Uint8Array(await source.arrayBuffer());
    else { onProgress && onProgress("Converting the presentation…"); data = await convertToPdf(c, source); }
    const count = await pdfToSlides(c, deckId, data, (n, t) => onProgress && onProgress(`Preparing slide ${n} of ${t}…`));
    if (!isLink && ext === "pptx") {
      const notes = await pptxSpeakerNotes(source);
      if (notes.some((t) => t)) await DB.saveSlideNotes(deckId, notes.slice(0, count)).catch(() => {});
    }
    await DB.finishDeck(deckId, count, "ready");
    return deckId;
  } catch (e) {
    await DB.finishDeck(deckId, 0, "failed").catch(() => {});
    throw e;
  }
}

// Pictures of a deck, loaded ahead so every slide change is instant.
const slideImageCache = {}; // url → Image
async function deckImages(deck, size) {
  if (!deck || deck.status !== "ready" || !deck.count) return [];
  const urls = await DB.deckUrls(deck, size);
  urls.forEach((u) => { if (u && !slideImageCache[u]) { const im = new Image(); im.decoding = "async"; im.src = u; slideImageCache[u] = im; } });
  return urls;
}

// A simple full-screen slide viewer (teachers anywhere; students after class).
function openSlideViewer(c, deck, start = 1) {
  let root = document.getElementById("docViewerRoot");
  if (!root) { root = document.createElement("div"); root.id = "docViewerRoot"; document.body.appendChild(root); }
  let n = Math.min(Math.max(1, start), Math.max(1, deck.count));
  root.innerHTML = `
    <div class="doc-viewer slide-viewer" role="dialog" aria-modal="true" aria-label="${esc(deck.title)}">
      <div class="doc-bar">
        <button class="doc-close" id="svClose" aria-label="Close">&larr;</button>
        <div class="doc-title"><strong>${esc(deck.title)}</strong><span>${esc(c.title)} · <span id="svCount"></span></span></div>
      </div>
      <div class="sv-stage"><img id="svImg" alt=""><p class="doc-message" id="svMsg">Opening…</p></div>
      <div class="sv-nav">
        <button type="button" class="btn btn-ghost" id="svPrev">&lsaquo; Back</button>
        <button type="button" class="btn btn-gold" id="svNext">Next &rsaquo;</button>
      </div>
    </div>`;
  document.body.classList.add("doc-open");
  let urls = [];
  const draw = () => {
    const img = document.getElementById("svImg");
    if (!img) return;
    document.getElementById("svCount").textContent = `Slide ${n} of ${deck.count}`;
    if (urls[n - 1]) { img.src = urls[n - 1]; img.alt = `Slide ${n}`; document.getElementById("svMsg").hidden = true; }
    document.getElementById("svPrev").disabled = n <= 1;
    document.getElementById("svNext").disabled = n >= deck.count;
  };
  const go = (d) => { n = Math.min(Math.max(1, n + d), deck.count); draw(); };
  const keys = (e) => {
    if (!document.querySelector(".slide-viewer")) { document.removeEventListener("keydown", keys); return; }
    if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
    else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
    else if (e.key === "Escape") close();
  };
  const close = () => { document.removeEventListener("keydown", keys); document.body.classList.remove("doc-open"); root.innerHTML = ""; };
  document.getElementById("svClose").addEventListener("click", close);
  document.getElementById("svPrev").addEventListener("click", () => go(-1));
  document.getElementById("svNext").addEventListener("click", () => go(1));
  document.addEventListener("keydown", keys);
  swipe(document.querySelector(".sv-stage"), go);
  draw();
  deckImages(deck, "l").then((u) => { urls = u; draw(); })
    .catch((e) => { const m = document.getElementById("svMsg"); if (m) m.textContent = friendlyError(e); });
}
// Left/right swipe on touch screens.
function swipe(el, go) {
  if (!el) return;
  let x0 = null, y0 = null;
  el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// ===========================================================================
// Manage → Lesson plan
// ===========================================================================
function renderPlanPanel(c) {
  const el = document.getElementById("planPanel");
  if (!el) return;
  const sched = planSchedule(c);
  const today = todayStr();
  const canceled = Object.keys(c.cancellations || {}).sort();
  const firstDate = sched.length && sched[0].date ? sched[0].date : (c.schedule.startDate || today);
  const lastDate = sched.reduce((m, s) => (s.date && s.date > m ? s.date : m), "");
  let ci = 0;
  const rowsHtml = [];
  sched.forEach((s, i) => {
    // Canceled class days fall between the lessons around them.
    while (ci < canceled.length && s.date && canceled[ci] < s.date) {
      if (canceled[ci] >= firstDate) rowsHtml.push(planCancelRow(c, canceled[ci]));
      ci++;
    }
    rowsHtml.push(planRowHtml(c, s, i, sched.length));
  });
  while (ci < canceled.length && lastDate && canceled[ci] <= lastDate) { rowsHtml.push(planCancelRow(c, canceled[ci])); ci++; }
  const noSchedule = !classDates(c).length;
  el.innerHTML = `
    <div class="section-title"><h2>Lesson Plan</h2>
      <div class="plan-actions">
        <button class="btn btn-ghost btn-sm" id="planFromFiles">${icon("upload")} Add lessons from files</button>
        <button class="btn btn-primary btn-sm" id="planAdd">+ Add a lesson</button>
      </div>
    </div>
    <div class="card plan-card">
      <p class="field-hint" style="margin-top:0;">One lesson for each class meeting. You never type a date — lessons line up with the class days in order, so if a class is canceled or moved, everything after it shifts on its own. Lesson notes are for you; slides go on the TV and to online students.</p>
      <div class="plan-settings">
        <label for="planShare">Students can page through the slides</label>
        <select id="planShare">${Object.entries(SHARE_LABEL).map(([k, v]) => `<option value="${k}" ${c.slidesShare === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
        <span class="plan-settings-gap"></span>
        <button class="btn btn-ghost btn-sm" id="planAddDay">${icon("calendar")} Add a class day</button>
        <button class="btn btn-ghost btn-sm" id="planTv">${icon("video")} Open the TV screen</button>
      </div>
      ${noSchedule && sched.length ? `<p class="plan-warn">${icon("warning")} Set the class days on the Overview tab and the lessons will get their dates.</p>` : ""}
      ${sched.length ? `<ol class="plan-list">${rowsHtml.join("")}</ol>` : `
        <div class="plan-empty">
          <p><strong>No lessons yet.</strong> Add them one at a time, or pick a stack of files — one lesson is made for each lesson-notes document or slide deck, in order of their names (Week 1, Week 2…).</p>
          <p class="field-hint">You can also just tap <strong>Teach</strong> on class day and pick your notes and slides then.</p>
        </div>`}
    </div>`;
  el.querySelector("#planAdd").addEventListener("click", () => openPlanEditor(c, null));
  el.querySelector("#planFromFiles").addEventListener("click", () => openPlanFromFiles(c));
  el.querySelector("#planAddDay").addEventListener("click", () => openAddClassDay(c));
  el.querySelector("#planTv").addEventListener("click", () => openPresent(c.id));
  el.querySelector("#planShare").addEventListener("change", (e) =>
    run(() => DB.setSlidesShare(c.id, e.target.value), () => renderPlanPanel(courses.find((x) => x.id === c.id)), { success: "Saved." }));
  el.querySelectorAll("[data-plan-teach]").forEach((b) => b.addEventListener("click", () => openTeach(c.id, b.dataset.planTeach)));
  el.querySelectorAll("[data-plan-more]").forEach((b) => b.addEventListener("click", () => openPlanOptions(c, b.dataset.planMore)));
  el.querySelectorAll("[data-plan-edit]").forEach((b) => b.addEventListener("click", () => openPlanEditor(c, c.plan.find((r) => r.id === b.dataset.planEdit))));
  el.querySelectorAll("[data-plan-notes]").forEach((b) => b.addEventListener("click", () => {
    const m = c.materials.find((x) => x.id === b.dataset.planNotes);
    if (m) openMaterialViewer(c, m);
  }));
  el.querySelectorAll("[data-plan-deck]").forEach((b) => b.addEventListener("click", () => {
    const d = c.decks.find((x) => x.id === b.dataset.planDeck);
    if (d && d.status === "ready") openSlideViewer(c, d);
  }));
  el.querySelectorAll("[data-restore-day]").forEach((b) => b.addEventListener("click", () => restoreClassDay(c, b.dataset.restoreDay, () => renderMain())));
}
function planCancelRow(c, d) {
  return `<li class="plan-row plan-cancel">
    <div class="plan-date"><strong>${esc(shortDay(d))}</strong></div>
    <div class="plan-main"><span>No class — canceled${c.cancellations[d] ? `: ${esc(c.cancellations[d])}` : ""}. The lessons after it moved forward one meeting.</span></div>
    ${d >= todayStr() ? `<button class="btn btn-ghost btn-sm" data-restore-day="${d}">Put it back</button>` : ""}
  </li>`;
}
function planRowHtml(c, s) {
  const { r, date, n, next, overdue } = s;
  const deck = planDeck(c, r);
  const notes = planNotes(c, r);
  const chips = [];
  if (notes) chips.push(`<button type="button" class="plan-chip" data-plan-notes="${notes.id}">${icon("note")} ${esc(notes.title.replace(/\.[a-z0-9]{2,5}$/i, ""))}</button>`);
  if (deck) chips.push(deck.status === "ready" ? `<button type="button" class="plan-chip" data-plan-deck="${deck.id}">${icon("video")} Slides · ${deck.count}</button>`
    : `<span class="plan-chip plan-chip-warn">${deck.status === "failed" ? "Slides didn't convert" : "Slides · preparing…"}</span>`);
  if (!notes || !deck) chips.push(`<button type="button" class="plan-chip plan-chip-add" data-plan-edit="${r.id}">+ ${!notes && !deck ? "Add notes or slides" : !notes ? "Add notes" : "Add slides"}</button>`);
  let status = "", cls = "";
  if (r.status === "taught") { status = r.continuedFrom ? `Picked up at slide ${r.resumeSlide} · Taught` : "Taught"; cls = "st-done"; }
  else if (r.status === "partial") { status = `Stopped at slide ${r.stoppedSlide || 1}`; cls = "st-part"; }
  else if (next) { status = r.continuedFrom ? `Up next · picks up at slide ${r.resumeSlide}` : "Up next"; cls = "st-next"; }
  else if (overdue) { status = "Not marked taught"; cls = "st-warn"; }
  else if (r.continuedFrom) { status = `Picks up at slide ${r.resumeSlide}`; }
  else if (!date) { status = "After the last class day"; cls = "st-warn"; }
  return `<li class="plan-row ${next ? "plan-next" : ""} ${r.status !== "planned" ? "plan-done" : ""}" data-plan-row="${r.id}">
    <div class="plan-date"><strong>${date ? esc(shortDay(date)) : "—"}</strong><small>Lesson ${n}</small></div>
    <div class="plan-main">
      <div class="plan-title">${esc(r.title)}</div>
      <div class="plan-chips">${chips.join("")}</div>
    </div>
    ${status ? `<div class="plan-status ${cls}">${esc(status)}</div>` : ""}
    ${next ? `<button class="btn btn-gold plan-teach" data-plan-teach="${r.id}">Teach this class</button>` : ""}
    <button type="button" class="plan-more" data-plan-more="${r.id}" aria-label="More for lesson ${n}: ${esc(r.title)}" title="More">${moreDots()}</button>
  </li>`;
}
function moreDots() { return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>`; }

// The ⋯ options for one lesson.
function openPlanOptions(c, id) {
  const sched = planSchedule(c);
  const i = sched.findIndex((s) => s.r.id === id);
  if (i < 0) return;
  const { r, date } = sched[i];
  const today = todayStr();
  const after = () => renderMain();
  const root = document.getElementById("modalRoot");
  const btn = (key, label, extra = "") => `<button type="button" class="plan-opt ${extra}" data-opt="${key}">${label}</button>`;
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal plan-opts" role="dialog" aria-modal="true" aria-labelledby="poTitle" style="max-width:440px;">
        <h2 id="poTitle">${esc(r.title)}</h2>
        <p class="field-hint" style="margin:-4px 0 10px;">${date ? esc(longDay(date)) : "No class day yet"}</p>
        ${btn("edit", "Edit — title, notes, slides")}
        ${btn("teach", "Teach this lesson now")}
        ${i > 0 ? btn("up", "Move up (one class earlier)") : ""}
        ${i < sched.length - 1 ? btn("down", "Move down (one class later)") : ""}
        ${r.status === "planned" ? btn("taught", "Mark as taught") : btn("untaught", "Mark as not taught yet")}
        ${date && date >= today && r.status === "planned" ? btn("move", "Move this class to another day…") + btn("cancel", "Cancel this class…") : ""}
        ${btn("delete", "Delete this lesson", "plan-opt-danger")}
        <div class="form-actions"><button class="btn btn-ghost" id="poClose">Close</button></div>
      </div>
    </div>`;
  document.getElementById("poClose").addEventListener("click", closeModal);
  root.querySelectorAll("[data-opt]").forEach((b) => b.addEventListener("click", async () => {
    const o = b.dataset.opt;
    if (o === "edit") return openPlanEditor(c, r);
    if (o === "teach") { closeModal(); return openTeach(c.id, r.id); }
    if (o === "up" || o === "down") {
      const ids = sched.map((s) => s.r.id);
      const j = o === "up" ? i - 1 : i + 1;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      closeModal();
      return run(() => DB.reorderPlan(c.id, ids), after);
    }
    if (o === "taught") { closeModal(); return run(() => DB.updatePlanLesson(r.id, { status: "taught", taughtOn: date && date <= today ? date : today }), after, { success: "Marked as taught." }); }
    if (o === "untaught") { closeModal(); return run(() => DB.updatePlanLesson(r.id, { status: "planned", taughtOn: null }), after); }
    if (o === "cancel") { closeModal(); return openCancelClassModal(c, date, after); }
    if (o === "move") return openMoveClass(c, date);
    if (o === "delete") {
      closeModal();
      if (!(await askConfirm({ title: "Delete this lesson?", text: `"${r.title}" comes off the lesson plan, and the lessons after it move up one class. Its notes and slides stay in the course.`, ok: "Delete", danger: true }))) return;
      return run(() => DB.deletePlanLesson(r.id), after, { success: "Lesson deleted." });
    }
  }));
}

// Move one class to another day: the old day is canceled, the new day added.
function openMoveClass(c, fromDate) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="mvTitle" style="max-width:460px;">
        <h2 id="mvTitle" style="font-size:1.15rem;margin:0 0 6px;">Move a Class</h2>
        <p class="field-hint" style="margin:0 0 12px;">The class on <strong>${esc(longDay(fromDate))}</strong> moves to the day you pick. Students are told, and the lesson goes with it.</p>
        <label for="mvDate">New day</label>
        <input type="date" id="mvDate" min="${todayStr()}">
        <label for="mvNote">Note for students <span class="field-hint" style="display:inline;margin:0;">(optional)</span></label>
        <input type="text" id="mvNote" maxlength="200" placeholder="e.g. Moved for the revival meetings">
        <div class="form-actions">
          <button class="btn btn-primary" id="mvSave">Move the Class</button>
          <button class="btn btn-ghost" id="mvClose">Never Mind</button>
        </div>
      </div>
    </div>`;
  document.getElementById("mvClose").addEventListener("click", closeModal);
  document.getElementById("mvSave").addEventListener("click", () => {
    const d = document.getElementById("mvDate").value;
    const note = document.getElementById("mvNote").value.trim();
    if (!d) { toast("Pick the new day."); return; }
    if (d === fromDate) { toast("That's the same day."); return; }
    run(async () => {
      await DB.addClassDay(c.id, d, note || `Moved from ${shortDay(fromDate)}`);
      await DB.cancelClass(c.id, fromDate, note || `Moved to ${shortDay(d)}`);
      closeModal();
    }, () => renderMain(), { success: `The class moved to ${longDay(d)}. Students have been told.` });
  });
}
function openAddClassDay(c) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="adTitle" style="max-width:460px;">
        <h2 id="adTitle" style="font-size:1.15rem;margin:0 0 6px;">Add a Class Day</h2>
        <p class="field-hint" style="margin:0 0 12px;">A make-up or extra class at the usual time. It shows on everyone's calendar, students are told, and the next lesson in the plan lands on it.</p>
        <label for="adDate">Day</label>
        <input type="date" id="adDate" min="${todayStr()}">
        <label for="adNote">Note for students <span class="field-hint" style="display:inline;margin:0;">(optional)</span></label>
        <input type="text" id="adNote" maxlength="200" placeholder="e.g. Make-up for the snow day">
        <div class="form-actions">
          <button class="btn btn-primary" id="adSave">Add the Day</button>
          <button class="btn btn-ghost" id="adClose">Never Mind</button>
        </div>
      </div>
    </div>`;
  document.getElementById("adClose").addEventListener("click", closeModal);
  document.getElementById("adSave").addEventListener("click", () => {
    const d = document.getElementById("adDate").value;
    if (!d) { toast("Pick the day."); return; }
    run(async () => { await DB.addClassDay(c.id, d, document.getElementById("adNote").value.trim()); closeModal(); },
      () => renderMain(), { success: `Class added on ${longDay(d)}. Students have been told.` });
  });
}

// Pick a document / deck, or upload a new one (used by the lesson editor and
// by Teach mode when a lesson has nothing attached yet).
function notesOptionsHtml(c, selected) {
  const docs = c.materials.filter((m) => (m.storagePath && !["ppt", "pptx"].includes(fileExt(m.title))) || m.id === selected)
    .slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  return `<option value="">— None —</option>${docs.map((m) => `<option value="${m.id}" ${m.id === selected ? "selected" : ""}>${esc(m.title)}${m.teacherOnly ? " (teachers only)" : ""}</option>`).join("")}`;
}
// Slides to choose from: decks already made, then presentations sitting in
// the course materials (made into slides when picked — value "mat:<id>").
function deckOptionsHtml(c, selected) {
  const decks = (c.decks || []).filter((d) => d.status === "ready" || d.id === selected)
    .slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const made = new Set(decks.map((d) => d.title));
  const mats = c.materials.filter((m) => m.storagePath && ["pptx", "ppt", "pdf"].includes(fileExt(materialFileName(m)))
    && !made.has(baseTitle(materialFileName(m)) || materialFileName(m).replace(/\.[a-z0-9]+$/i, "")))
    .slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const deckOpts = decks.map((d) => `<option value="${d.id}" ${d.id === selected ? "selected" : ""}>${esc(d.title)} · ${d.count} slides</option>`).join("");
  const matOpts = mats.map((m) => `<option value="mat:${m.id}">${esc(m.title)}</option>`).join("");
  return `<option value="">— None —</option>`
    + (deckOpts ? (matOpts ? `<optgroup label="Slides ready to show">${deckOpts}</optgroup>` : deckOpts) : "")
    + (matOpts ? `<optgroup label="From the course materials">${matOpts}</optgroup>` : "");
}
// The deck for a choice from deckOptionsHtml — making slides from a course
// material the first time it's picked.
async function deckFromChoice(c, value, say) {
  if (!value || !value.startsWith("mat:")) return value || null;
  const m = c.materials.find((x) => x.id === value.slice(4));
  if (!m) throw new Error("That file is no longer in the course materials.");
  const name = materialFileName(m);
  const title = baseTitle(name) || name.replace(/\.[a-z0-9]+$/i, "");
  const same = (c.decks || []).find((d) => d.status === "ready" && d.title === title);
  if (same) return same.id;
  say && say(`Opening ${m.title}…`);
  return createDeckFromSource(c, await materialAsFile(m), say);
}

function openPlanEditor(c, r) {
  const root = document.getElementById("modalRoot");
  const isNew = !r;
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="peTitle" style="max-width:560px;">
        <h2 id="peTitle" style="font-size:1.15rem;margin:0 0 10px;">${isNew ? "Add a Lesson" : "Edit Lesson"}</h2>
        <label for="peName">Lesson title</label>
        <input type="text" id="peName" maxlength="300" value="${esc(r ? r.title : "")}" placeholder="e.g. Scripture Interprets Scripture">
        <label for="peNotes">My lesson notes <span class="field-hint" style="display:inline;margin:0;">(shown big in Teach mode — for you, not students)</span></label>
        <select id="peNotes">${notesOptionsHtml(c, r ? r.notesId : null)}</select>
        <div class="pe-or">or add a new document: <input type="file" id="peNotesFile" accept=".pdf,.docx,.doc,.txt,.rtf,.odt" aria-label="Upload lesson notes"></div>
        <label for="peDeck">Slides <span class="field-hint" style="display:inline;margin:0;">(on the TV and for online students)</span></label>
        <select id="peDeck">${deckOptionsHtml(c, r ? r.deckId : null)}</select>
        <div class="pe-or">or upload one from your device: <input type="file" id="peDeckFile" accept=".pptx,.ppt,.pdf" aria-label="Upload slides"></div>
        <div class="pe-or">or paste a Google Slides link: <input type="url" id="peDeckLink" placeholder="https://docs.google.com/presentation/d/…" aria-label="Google Slides link"></div>
        <p class="field-hint" id="peStatus" aria-live="polite"></p>
        <div class="form-actions">
          <button class="btn btn-primary" id="peSave">${isNew ? "Add Lesson" : "Save"}</button>
          <button class="btn btn-ghost" id="peClose">Cancel</button>
        </div>
      </div>
    </div>`;
  const say = (t) => { const e = document.getElementById("peStatus"); if (e) e.textContent = t; };
  document.getElementById("peClose").addEventListener("click", closeModal);
  document.getElementById("peDeck").addEventListener("change", (e) => {
    const o = e.target.selectedOptions[0];
    if (e.target.value && !document.getElementById("peName").value.trim()) document.getElementById("peName").value = baseTitle(o.textContent.replace(/ · \d+ slides$/, "")) || o.textContent;
  });
  document.getElementById("peDeckFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f && !document.getElementById("peName").value.trim()) document.getElementById("peName").value = baseTitle(f.name);
  });
  document.getElementById("peNotesFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f && !document.getElementById("peName").value.trim()) document.getElementById("peName").value = baseTitle(f.name);
  });
  document.getElementById("peSave").addEventListener("click", async () => {
    const title = document.getElementById("peName").value.trim();
    if (!title) { toast("Give the lesson a title."); document.getElementById("peName").focus(); return; }
    const notesFile = document.getElementById("peNotesFile").files[0];
    const deckFile = document.getElementById("peDeckFile").files[0];
    const link = document.getElementById("peDeckLink").value.trim();
    if (link && !googleSlidesId(link)) { toast("That doesn't look like a Google Slides link."); return; }
    let notesId = document.getElementById("peNotes").value || null;
    let deckId = document.getElementById("peDeck").value || null;
    const btn = document.getElementById("peSave");
    btn.disabled = true;
    await run(async () => {
      if (notesFile) { say("Uploading the lesson notes…"); const made = await DB.addMaterials(c.id, [notesFile], true); notesId = made[0] && made[0].id; }
      if (deckFile || link) deckId = await createDeckFromSource(c, deckFile || link, say);
      else deckId = await deckFromChoice(c, deckId, say);
      if (isNew) await DB.addPlanLessons(c.id, [{ title, notesId, deckId }]);
      else await DB.updatePlanLesson(r.id, { title, notesId, deckId });
      closeModal();
    }, () => renderMain(), { success: isNew ? "Lesson added." : "Lesson saved." });
    const b = document.getElementById("peSave");
    if (b) { b.disabled = false; say(""); }
  });
}

// "Add lessons from files": one lesson per lesson number (Week 3 / Lesson 3 /
// a leading 3), notes and slides with the same number going together. Files
// can come from this course's materials (already on the site) or be uploaded
// from the device — or both at once.
const PLAN_FILE_EXTS = ["pdf", "docx", "doc", "pptx", "ppt", "txt", "rtf", "odt"];
function materialFileName(m) {
  // The title is usually the original file name; if it lost its ending, borrow it from the stored file.
  const ext = fileExt(m.title);
  if (PLAN_FILE_EXTS.includes(ext)) return m.title;
  const stored = fileExt(m.storagePath || "");
  return PLAN_FILE_EXTS.includes(stored) ? `${m.title}.${stored}` : m.title;
}
function guessPlanKind(name) {
  const ext = fileExt(name);
  return ["ppt", "pptx"].includes(ext) || (ext === "pdf" && /slide|power ?point|presentation|ppt/i.test(name)) ? "slides" : "notes";
}
// A course material's file, fetched so it can be turned into slides.
async function materialAsFile(m) {
  const { data, error } = await sb.storage.from("materials").download(m.storagePath);
  if (error || !data) throw new Error(`"${m.title}" couldn't be opened from the course materials.`);
  const name = materialFileName(m);
  const ext = fileExt(name);
  const type = ext === "pdf" ? "application/pdf" : ext === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    : ext === "ppt" ? "application/vnd.ms-powerpoint" : (data.type || m.mimeType || "application/octet-stream");
  return new File([data], name, { type });
}
function openPlanFromFiles(c) {
  const root = document.getElementById("modalRoot");
  const mats = c.materials.filter((m) => m.storagePath && PLAN_FILE_EXTS.includes(fileExt(materialFileName(m))))
    .slice().sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  const used = new Set((c.plan || []).map((r) => r.notesId).filter(Boolean));
  let fromDevice = []; // { file, kind }
  const fromMats = new Map(); // material id → kind
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="pfTitle" style="max-width:660px;">
        <h2 id="pfTitle" style="font-size:1.15rem;margin:0 0 6px;">Add Lessons from Files</h2>
        <p class="field-hint" style="margin:0 0 10px;">Pick lesson notes and slide files — from this course's materials, from your device, or both. They're put in order by the number in their names (Week 1, Lesson 2…), and notes and slides with the same number become one lesson.</p>
        <div class="pf-tabs" role="tablist">
          <button type="button" class="pf-tab active" role="tab" aria-selected="true" data-pf-tab="mats">${icon("book")} Course materials${mats.length ? ` (${mats.length})` : ""}</button>
          <button type="button" class="pf-tab" role="tab" aria-selected="false" data-pf-tab="device">${icon("upload")} Upload from device</button>
        </div>
        <div class="pf-pane" id="pfPaneMats">
          ${mats.length ? `
            <div class="pf-mat-tools">
              <input type="search" id="pfFilter" placeholder="Find a file…" aria-label="Find a file">
              <button type="button" class="btn btn-ghost btn-sm" id="pfAll">Select all shown</button>
              <button type="button" class="btn btn-ghost btn-sm" id="pfNone">Clear</button>
            </div>
            <ul class="pf-mats" id="pfMats">
              ${mats.map((m) => `<li data-name="${esc(m.title.toLowerCase())}"><label>
                <input type="checkbox" data-pf-mat="${m.id}">
                <span class="pf-mat-name">${esc(m.title)}</span>
                ${m.teacherOnly ? `<span class="pf-tag">Teachers only</span>` : ""}
                ${used.has(m.id) ? `<span class="pf-tag pf-tag-used">In the plan</span>` : ""}
              </label></li>`).join("")}
            </ul>` : `<p class="field-hint">This course has no documents or presentations in its materials yet. Use <strong>Upload from device</strong> instead.</p>`}
        </div>
        <div class="pf-pane" id="pfPaneDevice" hidden>
          <input type="file" id="pfFiles" multiple accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.rtf,.odt" aria-label="Choose files">
          <p class="field-hint" style="margin:6px 0 0;">New lesson notes are saved to the course materials as Teachers-only documents.</p>
        </div>
        <div id="pfList"></div>
        <p class="field-hint" id="pfStatus" aria-live="polite"></p>
        <div class="form-actions">
          <button class="btn btn-primary" id="pfSave" disabled>Add Lessons</button>
          <button class="btn btn-ghost" id="pfClose">Cancel</button>
        </div>
      </div>
    </div>`;
  const say = (t) => { const e = document.getElementById("pfStatus"); if (e) e.textContent = t; };
  // Everything picked, materials first, as { name, kind, file?, mat? }.
  const picked = () => [
    ...mats.filter((m) => fromMats.has(m.id)).map((m) => ({ name: materialFileName(m), kind: fromMats.get(m.id), mat: m })),
    ...fromDevice.map((p) => ({ name: p.file.name, kind: p.kind, file: p.file })),
  ];
  const group = () => {
    const by = new Map();
    let loose = 0;
    picked().forEach((p) => {
      const num = lessonNumber(p.name);
      const key = num === null ? `x${loose++}` : `n${num}`;
      if (!by.has(key)) by.set(key, { num, notes: null, slides: null, title: "" });
      const g = by.get(key);
      if (p.kind === "slides" && !g.slides) g.slides = p;
      else if (p.kind === "notes" && !g.notes) g.notes = p;
      else by.set(`${key}-${p.name}-${loose++}`, { num, notes: p.kind === "notes" ? p : null, slides: p.kind === "slides" ? p : null, title: "" });
    });
    const list = [...by.values()];
    const nm = (g) => (g.notes || g.slides).name;
    list.sort((a, b) => (a.num === null) - (b.num === null) || (a.num || 0) - (b.num || 0) || nm(a).localeCompare(nm(b), undefined, { numeric: true }));
    list.forEach((g) => { g.title = baseTitle(nm(g)) || nm(g); });
    return list;
  };
  const draw = () => {
    const box = document.getElementById("pfList");
    const all = picked();
    const lessons = group();
    box.innerHTML = all.length ? `
      <table class="pf-table"><thead><tr><th>File</th><th>From</th><th>It's…</th></tr></thead><tbody>
      ${all.map((p, i) => `<tr><td>${esc(p.mat ? p.mat.title : p.name)}</td><td class="pf-from">${p.mat ? "Materials" : "Device"}</td><td><select data-pf="${i}" aria-label="What ${esc(p.name)} is">
        <option value="notes" ${p.kind === "notes" ? "selected" : ""}>Lesson notes</option>
        <option value="slides" ${p.kind === "slides" ? "selected" : ""}>Slides</option></select></td></tr>`).join("")}
      </tbody></table>
      <p class="pf-sum"><strong>${lessons.length} lesson${lessons.length === 1 ? "" : "s"}:</strong> ${lessons.map((g) => esc(g.title)).join(" · ")}</p>` : "";
    box.querySelectorAll("[data-pf]").forEach((s) => s.addEventListener("change", () => {
      const p = all[+s.dataset.pf];
      if (p.mat) fromMats.set(p.mat.id, s.value);
      else { const d = fromDevice.find((x) => x.file === p.file); if (d) d.kind = s.value; }
      draw();
    }));
    document.getElementById("pfSave").disabled = !all.length;
  };
  root.querySelectorAll("[data-pf-tab]").forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll("[data-pf-tab]").forEach((x) => { const on = x === b; x.classList.toggle("active", on); x.setAttribute("aria-selected", on ? "true" : "false"); });
    document.getElementById("pfPaneMats").hidden = b.dataset.pfTab !== "mats";
    document.getElementById("pfPaneDevice").hidden = b.dataset.pfTab !== "device";
  }));
  root.querySelectorAll("[data-pf-mat]").forEach((cb) => cb.addEventListener("change", () => {
    const m = mats.find((x) => x.id === cb.dataset.pfMat);
    if (cb.checked) fromMats.set(m.id, guessPlanKind(materialFileName(m)));
    else fromMats.delete(m.id);
    draw();
  }));
  const filter = document.getElementById("pfFilter");
  if (filter) {
    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      root.querySelectorAll("#pfMats li").forEach((li) => { li.hidden = !!q && !li.dataset.name.includes(q); });
    });
    const setShown = (on) => {
      root.querySelectorAll("#pfMats li").forEach((li) => {
        if (li.hidden) return;
        const cb = li.querySelector("[data-pf-mat]");
        if (cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event("change")); }
      });
    };
    document.getElementById("pfAll").addEventListener("click", () => setShown(true));
    document.getElementById("pfNone").addEventListener("click", () => setShown(false));
  }
  if (!mats.length) root.querySelector('[data-pf-tab="device"]').click();
  document.getElementById("pfClose").addEventListener("click", closeModal);
  document.getElementById("pfFiles").addEventListener("change", (e) => {
    fromDevice = [...e.target.files].map((file) => ({ file, kind: guessPlanKind(file.name) }));
    draw();
  });
  document.getElementById("pfSave").addEventListener("click", async () => {
    const lessons = group();
    document.getElementById("pfSave").disabled = true;
    await run(async () => {
      const rows = [];
      let i = 0;
      for (const g of lessons) {
        i++;
        let notesId = null, deckId = null;
        if (g.notes && g.notes.mat) notesId = g.notes.mat.id; // already on the site — just link it
        else if (g.notes) { say(`Lesson ${i} of ${lessons.length}: uploading notes…`); const made = await DB.addMaterials(c.id, [g.notes.file], true); notesId = made[0] && made[0].id; }
        if (g.slides) {
          let src = g.slides.file;
          if (g.slides.mat) {
            const same = (c.decks || []).find((d) => d.status === "ready" && d.title === (baseTitle(g.slides.name) || g.slides.name.replace(/\.[a-z0-9]+$/i, "")));
            if (same) deckId = same.id; // these slides were already made from this file
            else { say(`Lesson ${i} of ${lessons.length}: opening ${g.slides.mat.title}…`); src = await materialAsFile(g.slides.mat); }
          }
          if (!deckId) deckId = await createDeckFromSource(c, src, (t) => say(`Lesson ${i} of ${lessons.length}: ${t}`));
        }
        rows.push({ title: g.title, notesId, deckId });
      }
      await DB.addPlanLessons(c.id, rows);
      closeModal();
    }, () => renderMain(), { success: `${lessons.length} lesson${lessons.length === 1 ? "" : "s"} added.` });
    const b = document.getElementById("pfSave");
    if (b) b.disabled = false;
  });
}

// Students: the lesson schedule on the course's Overview, with slides once
// they're open to the class.
function planStudentCardHtml(c) {
  const sched = planSchedule(c);
  if (!sched.length) return "";
  const today = todayStr();
  const upcoming = sched.filter((s) => !s.done && s.date && s.date >= today).slice(0, 3);
  const withSlides = sched.filter((s) => { const d = planDeck(c, s.r); return d && d.status === "ready"; });
  if (!upcoming.length && !withSlides.length) return "";
  const live = c.live && c.live.active;
  return `<div class="card overview-card plan-student">
    <div class="overview-head"><h3>${icon("calendar")} Lessons</h3>${live ? `<span class="pill pill-live">Class is on now</span>` : ""}</div>
    ${upcoming.length ? `<ul class="plan-mini">${upcoming.map((s) => `<li><span>${esc(shortDay(s.date))}</span><strong>${esc(s.r.title)}</strong></li>`).join("")}</ul>` : ""}
    ${withSlides.length ? `<div class="plan-mini-slides"><small>Slides:</small> ${withSlides.slice(-6).reverse().map((s) => `<button type="button" class="btn btn-ghost btn-sm" data-student-deck="${s.r.deckId}">${esc(s.r.title)}</button>`).join("")}</div>` : ""}
  </div>`;
}
function wirePlanStudentCard(c, main) {
  main.querySelectorAll("[data-student-deck]").forEach((b) => b.addEventListener("click", () => {
    const d = c.decks.find((x) => x.id === b.dataset.studentDeck);
    if (d) openSlideViewer(c, d);
  }));
}

// ===========================================================================
// Instant updates between the iPad, the TV and online students
// ===========================================================================
// Payload: { slide, blanked, pinned, deckId, active, planId, at }
function teachChannel(live, handlers) {
  if (!live || !live.key || typeof sb.channel !== "function") return null;
  try {
    const ch = sb.channel(`teach-${live.key}`, { config: { broadcast: { self: false } } });
    if (handlers.state) ch.on("broadcast", { event: "state" }, (m) => handlers.state((m && m.payload) || {}));
    if (handlers.hello) ch.on("broadcast", { event: "hello" }, (m) => handlers.hello((m && m.payload) || {}));
    if (handlers.row) ch.on("postgres_changes", { event: "*", schema: "public", table: "teach_live", filter: `course_id=eq.${live.courseId}` },
      (p) => { if (p && p.new && p.new.course_id) handlers.row(liveFromRow(p.new)); });
    ch.subscribe((status) => { if (handlers.status) handlers.status(status); });
    return ch;
  } catch (e) { console.warn("live channel:", e); return null; }
}
function sendOnChannel(ch, event, payload) {
  if (!ch) return;
  try { ch.send({ type: "broadcast", event, payload }); } catch (e) { /* the database copy still gets there */ }
}
function closeChannel(ch) {
  if (!ch) return;
  try { sb.removeChannel ? sb.removeChannel(ch) : ch.unsubscribe(); } catch (e) { /* already gone */ }
}

// ===========================================================================
// Teach mode (the teacher's iPad)
// ===========================================================================
let teachState = null;
let teachBackView = "home";

async function openTeach(courseId, planId, back) {
  const c = courses.find((x) => x.id === courseId);
  if (!c) return;
  if (!iManage(c)) { toast("Only this course's teacher can teach it."); return; }
  const target = planId ? c.plan.find((r) => r.id === planId) : teachTarget(c);
  teachBackView = back || (view === "manage" ? "manage" : "home");
  setBusy(true);
  try {
    const live = await DB.teachStart(c.id, target ? target.id : null);
    c.live = live;
  } catch (e) { setBusy(false); toast(friendlyError(e)); return; }
  setBusy(false);
  activeCourseId = c.id;
  view = "teach";
  renderNav(); renderMain();
}
function stopTeach() {
  if (!teachState) return;
  teachState.timers.forEach(clearInterval);
  if (teachState.saveTimer) clearTimeout(teachState.saveTimer);
  document.removeEventListener("keydown", teachState.onKey);
  closeChannel(teachState.ch);
  teachState = null;
  document.body.classList.remove("teach-open");
}

function renderTeach(main) {
  stopTeach();
  stopLive(); stopLecture();
  const c = courses.find((x) => x.id === activeCourseId);
  const live = c.live;
  if (!live || !live.active) {
    // Came back (or Back button) after class ended.
    main.innerHTML = `<button class="back-link" id="backLink">&larr; Back</button>
      <div class="card" style="max-width:560px;margin:30px auto;text-align:center;">
        <h2 style="margin-top:0;">${esc(c.title)}</h2>
        <p>Teach mode isn't running for this course.</p>
        <button class="btn btn-gold" id="tStart">Start Teach Mode</button>
      </div>`;
    document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
    document.getElementById("tStart").addEventListener("click", () => openTeach(c.id, null));
    return;
  }
  document.body.classList.add("teach-open");
  const r = live.planId ? c.plan.find((x) => x.id === live.planId) : null;
  const st = teachState = {
    c, live, plan: r, deck: (c.decks || []).find((d) => d.id === live.deckId) || null, urls: [], notesTab: "notes",
    zoom: +(sessionStorage.getItem("tnbbi-notes-zoom") || 1), speaker: [], timers: [], ch: null, tvSeen: 0,
    seenQ: new Map(), qSince: null, saveTimer: null, onKey: null,
  };
  const remoteOn = c.format !== "in_person";
  main.innerHTML = `
    <div class="teach" id="teachRoot">
      <header class="teach-bar">
        <button type="button" class="tb-btn" id="tExit">${chev("left")} Dashboard</button>
        <div class="tb-title"><strong>${esc(c.title)}</strong><small>Teaching now${r ? ` · ${esc(r.title)}` : ""}</small></div>
        <span class="tb-gap"></span>
        <span class="tb-chip" id="tTv" title="The classroom TV screen"><i class="tb-dot"></i><span>TV</span></span>
        ${remoteOn ? `<span class="tb-chip" id="tRemote"><i class="tb-dot tb-dot-on"></i><span>Online…</span></span>` : ""}
        <span class="tb-clock" id="tClock" title="Class time">0 min</span>
        ${takesClassroomAttendance(c) ? `<button type="button" class="tb-btn" id="tAttend">Attendance</button>` : ""}
        <button type="button" class="tb-btn tb-blank" id="tBlank" aria-pressed="false">Blank screen</button>
        <button type="button" class="tb-btn tb-end" id="tEnd">End class</button>
      </header>
      <div class="teach-body">
        <section class="teach-notes" aria-label="Lesson notes">
          <div class="tn-tabs" role="tablist">
            <button type="button" role="tab" data-tn="notes" aria-selected="true">My lesson notes</button>
            <button type="button" role="tab" data-tn="speaker" aria-selected="false">Notes for this slide</button>
          </div>
          <div class="tn-view" id="tnView" tabindex="0"></div>
          <div class="tn-foot">
            <button type="button" class="tn-zoom" id="tnOut" aria-label="Smaller text">A&minus;</button>
            <span id="tnInfo"></span>
            <button type="button" class="tn-zoom" id="tnIn" aria-label="Larger text">A+</button>
          </div>
        </section>
        <section class="teach-side" aria-label="Slides and questions">
          <div class="ts-slide" id="tsSlide">
            <img id="tsImg" alt="">
            <div class="ts-empty" id="tsEmpty" hidden></div>
            <div class="ts-blanked" id="tsBlanked" hidden><strong>Screen blanked</strong><span>The TV and online students see a blank screen</span></div>
            <span class="ts-live"><i></i>LIVE</span>
          </div>
          <div class="ts-nav">
            <button type="button" class="ts-prev" id="tsPrev">${chev("left")} Back</button>
            <button type="button" class="ts-next" id="tsNext">Next ${chev("right")}</button>
          </div>
          <div class="ts-count"><strong id="tsCount"></strong><button type="button" class="ts-link" id="tsAll">All slides</button><button type="button" class="ts-link" id="tsSwap">Change slides</button></div>
          <div class="ts-q">
            <div class="ts-q-head"><strong>${remoteOn ? "Online students' questions" : "Questions"}</strong><span class="ts-q-count" id="tqCount">0 open</span></div>
            <div class="ts-q-list" id="tqList" aria-live="polite"><p class="ts-q-empty">${remoteOn ? "Questions from students watching online show up here." : "This is an in-person course — online questions appear here if it ever has online students."}</p></div>
          </div>
        </section>
      </div>
    </div>`;

  // --- slides ---
  const drawSlide = () => {
    if (teachState !== st) return;
    const d = st.deck, n = st.live.slide;
    const img = document.getElementById("tsImg"), empty = document.getElementById("tsEmpty");
    document.getElementById("tsBlanked").hidden = !st.live.blanked;
    const blank = document.getElementById("tBlank");
    blank.setAttribute("aria-pressed", String(!!st.live.blanked));
    blank.textContent = st.live.blanked ? "Show slide" : "Blank screen";
    blank.classList.toggle("tb-on", !!st.live.blanked);
    if (!d || d.status !== "ready" || !d.count) {
      img.hidden = true; empty.hidden = false;
      empty.innerHTML = `<p>${d ? (d.status === "failed" ? "These slides didn't convert." : "The slides are still being prepared…") : "No slides for this lesson."}</p><button type="button" class="btn btn-ghost btn-sm" id="tsPick">Choose slides</button>`;
      document.getElementById("tsPick").addEventListener("click", openSwap);
      document.getElementById("tsCount").textContent = "";
      document.getElementById("tsPrev").disabled = document.getElementById("tsNext").disabled = true;
      document.getElementById("tsAll").hidden = true;
      return;
    }
    empty.hidden = true; img.hidden = false;
    if (st.urls[n - 1]) { img.src = st.urls[n - 1]; img.alt = `Slide ${n}`; }
    document.getElementById("tsCount").textContent = `Slide ${n} of ${d.count}`;
    document.getElementById("tsPrev").disabled = n <= 1;
    document.getElementById("tsNext").disabled = n >= d.count;
    document.getElementById("tsAll").hidden = false;
    if (st.notesTab === "speaker") drawNotes();
  };
  const loadDeck = async () => {
    st.urls = []; st.speaker = []; st.speakerLoaded = false;
    drawSlide();
    if (!st.deck) return;
    try { st.urls = await deckImages(st.deck, "s"); } catch (e) { toast(friendlyError(e)); }
    try { st.speaker = await DB.slideNotes(st.deck.id); } catch (e) { /* none */ }
    st.speakerLoaded = true;
    // the TV wants the large pictures; get them ready in this browser too in
    // case this iPad is ever the one plugged into the TV
    drawSlide();
  };
  // Every change: on screen at once, sent to the TV and students instantly,
  // and saved (a moment later, so quick taps don't each wait on the network).
  const push = (patch) => {
    st.lastLocal = Date.now();
    Object.assign(st.live, patch);
    drawSlide();
    sendOnChannel(st.ch, "state", { slide: st.live.slide, blanked: st.live.blanked, pinned: st.live.pinned, deckId: st.live.deckId, active: true, planId: st.live.planId, at: Date.now() });
    if (st.saveTimer) clearTimeout(st.saveTimer);
    st.pending = Object.assign(st.pending || {}, patch);
    st.saveTimer = setTimeout(async () => {
      const p = st.pending; st.pending = null; st.saveTimer = null;
      try { await DB.teachUpdate(c.id, p); setTeachWarning(false); }
      catch (e) { setTeachWarning(true); st.pending = Object.assign(p, st.pending || {}); }
    }, 180);
    markActive(true);
  };
  const go = (dir) => {
    if (!st.deck || st.deck.status !== "ready") return;
    const n = Math.min(Math.max(1, st.live.slide + dir), st.deck.count);
    if (n !== st.live.slide) push({ slide: n });
  };
  const goTo = (n) => push({ slide: Math.min(Math.max(1, n), st.deck ? st.deck.count : 1) });
  document.getElementById("tsPrev").addEventListener("click", () => go(-1));
  document.getElementById("tsNext").addEventListener("click", () => go(1));
  swipe(document.getElementById("tsSlide"), go);
  document.getElementById("tBlank").addEventListener("click", () => push({ blanked: !st.live.blanked }));
  document.getElementById("tsAll").addEventListener("click", () => openSlideGrid(st, goTo));
  document.getElementById("tsSwap").addEventListener("click", () => openSwap());
  st.onKey = (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (document.querySelector("#modalRoot .modal-backdrop, .doc-viewer, #confirmRoot")) return;
    if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(1); }
    else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(-1); }
    else if (e.key === "b" || e.key === "B" || e.key === ".") push({ blanked: !st.live.blanked });
  };
  document.addEventListener("keydown", st.onKey);

  // Switch to other slides mid-class (or add some).
  const openSwap = () => {
    const root = document.getElementById("modalRoot");
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="swTitle" style="max-width:480px;">
          <h2 id="swTitle" style="font-size:1.1rem;margin:0 0 8px;">Slides for This Class</h2>
          <label for="swDeck">Show these slides</label>
          <select id="swDeck">${deckOptionsHtml(c, st.deck ? st.deck.id : null)}</select>
          <div class="pe-or">or upload one from your device: <input type="file" id="swFile" accept=".pptx,.ppt,.pdf" aria-label="Upload slides"></div>
          <p class="field-hint" id="swStatus" aria-live="polite"></p>
          <div class="form-actions"><button class="btn btn-primary" id="swSave">Show Them</button><button class="btn btn-ghost" id="swClose">Cancel</button></div>
        </div>
      </div>`;
    document.getElementById("swClose").addEventListener("click", closeModal);
    document.getElementById("swSave").addEventListener("click", async () => {
      const file = document.getElementById("swFile").files[0];
      let deckId = document.getElementById("swDeck").value || null;
      const b = document.getElementById("swSave"); b.disabled = true;
      try {
        const say = (t) => { const e = document.getElementById("swStatus"); if (e) e.textContent = t; };
        const fromMat = !file && deckId && deckId.startsWith("mat:");
        if (file) deckId = await createDeckFromSource(c, file, say);
        else deckId = await deckFromChoice(c, deckId, say);
        if (file || fromMat) { await loadAll(); }
        const fresh = courses.find((x) => x.id === c.id);
        st.c = fresh; st.deck = (fresh.decks || []).find((d) => d.id === deckId) || null;
        if (st.plan) await DB.updatePlanLesson(st.plan.id, { deckId }).catch(() => {});
        closeModal();
        push({ deckId, slide: 1 });
        loadDeck();
      } catch (e) { toast(friendlyError(e)); b.disabled = false; }
    });
  };

  // --- lesson notes ---
  const drawNotes = async () => {
    const box = document.getElementById("tnView");
    const info = document.getElementById("tnInfo");
    if (!box || teachState !== st) return;
    document.querySelectorAll(".tn-tabs [data-tn]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tn === st.notesTab)));
    box.style.setProperty("--tn-zoom", st.zoom);
    if (st.notesTab === "speaker") {
      const t = (st.speaker || [])[st.live.slide - 1];
      box.innerHTML = `<div class="tn-speaker"><div class="tn-eyebrow">Slide ${st.live.slide}${st.deck ? ` · ${esc(st.deck.title)}` : ""}</div>
        ${t ? `<div class="tn-speaker-text">${esc(t)}</div>` : st.deck && !st.speakerLoaded ? `<p class="tn-none">Loading…</p>` : `<p class="tn-none">${st.deck && st.deck.source === "pptx" ? "No speaker notes on this slide." : "Speaker notes come from a PowerPoint file's notes. This lesson's slides don't have any."}</p>`}</div>`;
      info.textContent = "";
      return;
    }
    const m = st.plan ? planNotes(st.c, st.plan) : null;
    if (!m) {
      box.innerHTML = `<div class="tn-pick"><p>${st.plan ? "No lesson notes are attached to this lesson." : "Pick the notes to teach from."}</p>
        <label for="tnPick">Open a document from this course</label>
        <select id="tnPick">${notesOptionsHtml(st.c, null)}</select>
        <div class="pe-or">or add one: <input type="file" id="tnFile" accept=".pdf,.docx,.doc,.txt" aria-label="Upload lesson notes"></div></div>`;
      info.textContent = "";
      const use = async (id) => {
        if (st.plan && id) await DB.updatePlanLesson(st.plan.id, { notesId: id }).catch(() => {});
        await loadAll();
        st.c = courses.find((x) => x.id === c.id);
        if (st.plan) st.plan = st.c.plan.find((x) => x.id === st.plan.id) || st.plan;
        st.manualNotes = id;
        if (!st.plan) st.plan = { id: null, notesId: id, title: "" };
        drawNotes();
      };
      document.getElementById("tnPick").addEventListener("change", (e) => e.target.value && use(e.target.value));
      document.getElementById("tnFile").addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        box.querySelector(".tn-pick").insertAdjacentHTML("beforeend", `<p class="field-hint">Uploading…</p>`);
        try { const made = await DB.addMaterials(c.id, [f], true); await use(made[0].id); } catch (err) { toast(friendlyError(err)); }
      });
      return;
    }
    await showNotesDoc(st, m, box, info);
  };
  document.querySelectorAll(".tn-tabs [data-tn]").forEach((b) => b.addEventListener("click", () => { st.notesTab = b.dataset.tn; drawNotes(); }));
  const zoom = (f) => {
    st.zoom = Math.min(2.2, Math.max(0.7, Math.round(st.zoom * f * 100) / 100));
    try { sessionStorage.setItem("tnbbi-notes-zoom", String(st.zoom)); } catch (e) { /* fine */ }
    st.notesDoc = null; // re-render at the new size
    drawNotes();
  };
  document.getElementById("tnIn").addEventListener("click", () => zoom(1.15));
  document.getElementById("tnOut").addEventListener("click", () => zoom(1 / 1.15));

  // --- top bar ---
  document.getElementById("tExit").addEventListener("click", async () => {
    const ok = await askConfirm({ title: "Leave Teach mode?", text: "Class keeps going — the TV and online students stay on this slide. Come back any time from the dashboard (Teach) or the Lesson plan.", ok: "Leave", danger: false });
    if (!ok) return;
    stopTeach(); view = teachBackView || "home"; renderNav(); renderMain();
  });
  const att = document.getElementById("tAttend");
  if (att) att.addEventListener("click", () => openTeachAttendance(c));
  document.getElementById("tEnd").addEventListener("click", () => openEndClass(st));
  const clock = () => {
    const el = document.getElementById("tClock");
    if (!el || !st.live.startedAt) return;
    const m = Math.max(0, Math.floor((Date.now() - new Date(st.live.startedAt).getTime()) / 60000));
    el.textContent = m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  };
  clock();
  st.timers.push(setInterval(clock, 15000));
  const tvLight = () => {
    const el = document.getElementById("tTv");
    if (!el) return;
    const on = Date.now() - st.tvSeen < TV_HELLO_MS * 2.5;
    el.classList.toggle("tb-chip-on", on);
    el.querySelector("span").textContent = on ? "TV connected" : "TV not open";
    el.title = on ? "The classroom TV is following along." : "Open the TV screen on the classroom computer: Lesson plan → Open the TV screen.";
  };
  tvLight();
  st.timers.push(setInterval(tvLight, 5000));
  if (remoteOn) {
    const watchers = async () => {
      try {
        const rows = await DB.liveWatchers(c.id);
        const now = rows.filter((x) => Date.now() - new Date(x.last_beat).getTime() < 150000).length;
        const el = document.getElementById("tRemote");
        if (el) el.querySelector("span").textContent = `${now} watching online`;
      } catch (e) { /* try again */ }
    };
    watchers();
    st.timers.push(setInterval(watchers, 30000));
  }

  // --- questions ---
  const drawQuestions = () => {
    const list = document.getElementById("tqList");
    if (!list || teachState !== st) return;
    const qs = [...st.seenQ.values()].filter((q) => !q.mine);
    if (!qs.length) return;
    const open = qs.filter((q) => !q.answered_at), done = qs.filter((q) => q.answered_at);
    document.getElementById("tqCount").textContent = `${open.length} open`;
    list.innerHTML = [...open.reverse(), ...done.reverse()].map((q) => {
      const pinned = st.live.pinned === q.id;
      return `<div class="tq ${q.answered_at ? "tq-done" : ""} ${pinned ? "tq-pinned" : ""}" data-q="${q.id}">
        <div class="tq-who"><strong>${esc(userName(q.author_id) || "Student")}</strong> · ${esc(new Date(q.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))}${q.answered_at ? " · Answered" : pinned ? " · On the screen" : ""}</div>
        <div class="tq-text">${esc(q.body)}</div>
        <div class="tq-acts">
          <button type="button" class="tq-btn ${pinned ? "tq-btn-on" : ""}" data-q-pin="${q.id}">${pinned ? "Take off screen" : "Show on screen"}</button>
          <button type="button" class="tq-btn tq-btn-soft" data-q-done="${q.id}">${q.answered_at ? "Reopen" : "Answered"}</button>
        </div>
      </div>`;
    }).join("");
    list.querySelectorAll("[data-q-pin]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.qPin;
      push({ pinned: st.live.pinned === id ? null : id });
      drawQuestions();
    }));
    list.querySelectorAll("[data-q-done]").forEach((b) => b.addEventListener("click", async () => {
      const q = st.seenQ.get(b.dataset.qDone);
      const answered = !q.answered_at;
      q.answered_at = answered ? new Date().toISOString() : null;
      if (answered && st.live.pinned === q.id) push({ pinned: null });
      drawQuestions();
      try { await DB.markQuestion(q.id, answered); } catch (e) { toast(friendlyError(e)); }
    }));
  };
  const pollQuestions = async () => {
    if (teachState !== st) return;
    try {
      const rows = await DB.questions(c.id, st.live.startedAt ? new Date(new Date(st.live.startedAt).getTime() - 30 * 60000).toISOString() : null);
      let changed = false;
      rows.forEach((q) => {
        const prev = st.seenQ.get(q.id);
        q.mine = q.author_id === currentUser.id || (users.find((u) => u.id === q.author_id) || {}).role === "faculty";
        if (!prev || prev.answered_at !== q.answered_at) { st.seenQ.set(q.id, q); changed = true; }
      });
      if (changed) {
        drawQuestions();
        if (await ensureNames(rows.map((q) => q.author_id))) drawQuestions();
      }
    } catch (e) { /* offline — next time */ }
  };
  pollQuestions();
  st.timers.push(setInterval(pollQuestions, 4000));

  // --- live link ---
  st.ch = teachChannel(live, {
    hello: () => { st.tvSeen = Date.now(); tvLight(); },
    // Another screen (the TV's arrow keys, or a second iPad) moved the slides.
    state: (p) => {
      if (p.deckId !== undefined && p.deckId !== st.live.deckId) return; // a different deck — the next save sorts it out
      Object.assign(st.live, { slide: p.slide || st.live.slide, blanked: !!p.blanked, pinned: p.pinned || null });
      drawSlide(); drawQuestions();
    },
  });
  // Ask the TV to say hello right away (it answers every 10 s anyway).
  setTimeout(() => sendOnChannel(st.ch, "state", { slide: st.live.slide, blanked: st.live.blanked, pinned: st.live.pinned, deckId: st.live.deckId, active: true, planId: st.live.planId, at: Date.now() }), 800);
  // The database copy, for anything that changed elsewhere.
  st.timers.push(setInterval(async () => {
    if (teachState !== st || st.saveTimer) return;
    markActive(true); // a class is being taught — don't sign the teacher out mid-lesson
    try {
      const fresh = await DB.teachLive(c.id);
      if (!fresh || !fresh.active) return;
      if (fresh.slide !== st.live.slide || fresh.blanked !== st.live.blanked || fresh.pinned !== st.live.pinned) {
        if (Date.now() - (st.lastLocal || 0) > 5000) { Object.assign(st.live, { slide: fresh.slide, blanked: fresh.blanked, pinned: fresh.pinned }); drawSlide(); }
      }
    } catch (e) { /* offline */ }
  }, Math.max(TEACH_POLL_MS * 2, 5000)));

  drawNotes();
  loadDeck();
}
function chev(dir) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}"/></svg>`;
}
function setTeachWarning(on) {
  const bar = document.querySelector(".teach-bar");
  if (!bar) return;
  let w = document.getElementById("tWarn");
  if (on && !w) { bar.insertAdjacentHTML("afterend", `<div class="teach-warn" id="tWarn" role="status">${icon("warning")} Can't reach the internet — slides change here, and catch up everywhere once it's back.</div>`); }
  else if (!on && w) w.remove();
}
// Lesson notes in the notes pane: PDF pages, a Word document, text or a photo.
async function showNotesDoc(st, m, box, info) {
  const key = `${m.id}:${st.zoom}`;
  if (st.notesDoc === key && box.querySelector(".tn-doc")) return;
  st.notesDoc = key;
  const posKey = `tnbbi-notes-pos:${m.id}`;
  box.innerHTML = `<div class="tn-doc"><div class="doc-message"><div class="doc-spinner"></div><p>Opening ${esc(m.title)}…</p></div></div>`;
  const kind = materialKind(m);
  try {
    const url = await DB.fileUrl("materials", m.storagePath);
    const doc = box.querySelector(".tn-doc");
    if (kind === "pdf") {
      await loadScriptOnce(PDFJS_URL);
      const pdfjs = window.pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      const pdf = await pdfjs.getDocument({ url }).promise;
      if (st.notesDoc !== key) return;
      doc.innerHTML = `<div class="tn-pages"></div>`;
      const pages = doc.querySelector(".tn-pages");
      const width = Math.max(300, (box.clientWidth - 28) * st.zoom);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let n = 1; n <= pdf.numPages; n++) {
        if (st.notesDoc !== key) return;
        const page = await pdf.getPage(n);
        const vp1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (width / vp1.width) * dpr });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.width = `${width}px`;
        canvas.className = "tn-page"; canvas.dataset.page = n;
        canvas.setAttribute("aria-label", `Page ${n}`);
        pages.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
        if (n === 1) restorePos();
      }
      const pageInfo = () => {
        const top = box.scrollTop + 40;
        let cur = 1;
        pages.querySelectorAll(".tn-page").forEach((cv) => { if (cv.offsetTop <= top) cur = +cv.dataset.page; });
        info.textContent = `Page ${cur} of ${pdf.numPages}`;
      };
      pageInfo();
      box.onscroll = () => { pageInfo(); savePos(); };
    } else if (kind === "docx") {
      const [buf] = await Promise.all([fetch(url).then((r) => { if (!r.ok) throw new Error("The notes couldn't be opened."); return r.arrayBuffer(); }), loadScriptOnce(MAMMOTH_URL)]);
      const out = await window.mammoth.convertToHtml({ arrayBuffer: buf });
      if (st.notesDoc !== key) return;
      const html = window.DOMPurify ? DOMPurify.sanitize(out.value) : esc(out.value);
      doc.innerHTML = `<article class="doc-paper doc-word tn-word">${html || "<p><em>This document is empty.</em></p>"}</article>`;
      info.textContent = m.title.replace(/\.[a-z0-9]{2,5}$/i, "");
      box.onscroll = savePos;
      restorePos();
    } else if (kind === "text") {
      const text = await fetch(url).then((r) => r.text());
      doc.innerHTML = `<article class="doc-paper tn-word"><pre class="doc-text">${esc(text)}</pre></article>`;
      box.onscroll = savePos; restorePos();
    } else if (kind === "image") {
      doc.innerHTML = `<div class="doc-image"><img src="${esc(url)}" alt="${esc(m.title)}" style="width:${Math.round(st.zoom * 100)}%"></div>`;
    } else {
      doc.innerHTML = `<div class="doc-message"><p>This kind of file can't be shown here. Save your notes as a PDF or a Word (.docx) file.</p></div>`;
    }
  } catch (e) {
    console.warn("notes:", e);
    box.innerHTML = `<div class="doc-message"><p>${esc(friendlyError(e))}</p></div>`;
  }
  function savePos() { try { sessionStorage.setItem(posKey, String(box.scrollTop / Math.max(1, box.scrollHeight))); } catch (e) { /* fine */ } }
  function restorePos() {
    try { const f = parseFloat(sessionStorage.getItem(posKey)); if (f > 0) box.scrollTop = f * box.scrollHeight; } catch (e) { /* fine */ }
  }
}
// Every slide as a small picture: tap one to jump there.
function openSlideGrid(st, goTo) {
  const d = st.deck;
  if (!d) return;
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal slide-grid-modal" role="dialog" aria-modal="true" aria-labelledby="sgTitle">
        <div class="sg-head"><h2 id="sgTitle">${esc(d.title)}</h2><button class="btn btn-ghost btn-sm" id="sgClose">Close</button></div>
        <div class="slide-grid">${Array.from({ length: d.count }, (_, i) => `<button type="button" class="sg-item ${i + 1 === st.live.slide ? "sg-on" : ""}" data-sg="${i + 1}" aria-label="Slide ${i + 1}">
          ${st.urls[i] ? `<img src="${esc(st.urls[i])}" alt="" loading="lazy">` : ""}<span>${i + 1}</span></button>`).join("")}</div>
      </div>
    </div>`;
  document.getElementById("sgClose").addEventListener("click", closeModal);
  root.querySelectorAll("[data-sg]").forEach((b) => b.addEventListener("click", () => { closeModal(); goTo(+b.dataset.sg); }));
  const on = root.querySelector(".sg-on");
  if (on) on.scrollIntoView({ block: "center" });
}
function openTeachAttendance(c) {
  const st = teachState;
  // Attendance opens over Teach mode's place; its Back comes here.
  stopTeach();
  openAttendance(c.id, todayStr(), "teach");
}
function openEndClass(st) {
  const c = st.c;
  const r = st.plan && st.plan.id ? st.plan : null;
  const n = st.live.slide;
  const d = st.deck;
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal end-class" role="dialog" aria-modal="true" aria-labelledby="ecTitle" style="max-width:520px;">
        <h2 id="ecTitle">End class</h2>
        ${r ? `<p class="field-hint" style="margin:0 0 12px;">${esc(r.title)}</p>
        <button type="button" class="ec-opt" data-ec="finished"><strong>Finished this lesson</strong><span>The next class starts the next lesson.</span></button>
        ${d && d.status === "ready" && n < d.count ? `<button type="button" class="ec-opt" data-ec="continue"><strong>Pick up here next time</strong><span>Next class opens at slide ${n}, and the lessons after this one move back one class.</span></button>` : ""}
        <button type="button" class="ec-opt ec-soft" data-ec="pause"><strong>Just stop presenting</strong><span>Nothing is marked — the lesson stays where it is.</span></button>`
        : `<button type="button" class="ec-opt" data-ec="pause"><strong>Stop presenting</strong><span>The TV and online students go back to waiting.</span></button>`}
        <div class="form-actions"><button class="btn btn-ghost" id="ecKeep">Keep teaching</button></div>
      </div>
    </div>`;
  document.getElementById("ecKeep").addEventListener("click", closeModal);
  root.querySelectorAll("[data-ec]").forEach((b) => b.addEventListener("click", async () => {
    const outcome = b.dataset.ec;
    closeModal();
    sendOnChannel(st.ch, "state", { active: false, slide: n, blanked: false, pinned: null, deckId: st.live.deckId, at: Date.now() });
    const back = teachBackView || "home";
    stopTeach();
    await run(() => DB.teachEnd(c.id, outcome, n), () => {
      if (back === "manage") { activeCourseId = c.id; courseTabs.set(`manage:${c.id}`, "plan"); }
      view = back; renderNav(); renderMain();
    }, { success: outcome === "finished" ? "Lesson marked as taught. Class dismissed!" : outcome === "continue" ? `Next class picks up at slide ${n}.` : "Stopped presenting." });
  }));
}

// ===========================================================================
// The TV screen (the classroom laptop, signed in as the teacher)
// ===========================================================================
let presentState = null;
function openPresent(courseId) {
  activeCourseId = courseId;
  view = "present";
  renderNav(); renderMain();
}
function stopPresent() {
  if (!presentState) return;
  presentState.timers.forEach(clearInterval);
  document.removeEventListener("keydown", presentState.onKey);
  document.removeEventListener("mousemove", presentState.onMove);
  closeChannel(presentState.ch);
  if (presentState.wake) presentState.wake.release().catch(() => {});
  presentState = null;
  document.body.classList.remove("present-open");
}
function renderPresent(main) {
  stopPresent();
  stopLive(); stopLecture();
  const c = courses.find((x) => x.id === activeCourseId);
  document.body.classList.add("present-open");
  const st = presentState = { c, live: c.live || null, deck: null, urls: [], timers: [], ch: null, onKey: null, onMove: null, lastPush: 0, wake: null, qText: {} };
  main.innerHTML = `
    <div class="tv" id="tv">
      <img class="tv-img" id="tvImg" alt="">
      <div class="tv-black" id="tvBlack" hidden></div>
      <div class="tv-wait" id="tvWait">
        <img src="brand/tnbbi-logo-color.png" alt="" class="tv-crest">
        <h1>${esc(c.title)}</h1>
        <p id="tvWaitText">Waiting for class to begin…</p>
      </div>
      <div class="tv-q" id="tvQ" hidden></div>
      <div class="tv-corner" id="tvCorner">
        <span class="tv-dot" id="tvDot" title="Connection"></span>
        <span id="tvCount"></span>
        <button type="button" class="tv-btn" id="tvFull">Full screen</button>
        <button type="button" class="tv-btn" id="tvExit">Exit</button>
      </div>
    </div>`;
  const apply = () => {
    if (presentState !== st) return;
    const L = st.live;
    const active = L && L.active;
    const ready = active && st.deck && st.deck.status === "ready" && st.deck.count;
    document.getElementById("tvWait").hidden = !!ready;
    document.getElementById("tvWaitText").textContent = active ? (st.deck ? "Getting the slides ready…" : "Class has begun.") : "Waiting for class to begin…";
    document.getElementById("tvBlack").hidden = !(active && L.blanked);
    const img = document.getElementById("tvImg");
    img.hidden = !ready;
    if (ready && st.urls[L.slide - 1]) { img.src = st.urls[L.slide - 1]; img.alt = `Slide ${L.slide}`; }
    document.getElementById("tvCount").textContent = ready ? `${L.slide} / ${st.deck.count}` : "";
    const q = document.getElementById("tvQ");
    const qt = active && L.pinned ? st.qText[L.pinned] : null;
    q.hidden = !qt;
    if (qt) q.innerHTML = `<span class="tv-q-who">Question from ${esc(qt.who)}</span><span class="tv-q-text">${esc(qt.body)}</span>`;
    else if (active && L.pinned && !st.qText[L.pinned]) loadQuestion(L.pinned);
  };
  const loadQuestion = async (id) => {
    st.qText[id] = null;
    try {
      const rows = await DB.questions(c.id, null);
      const q = rows.find((x) => x.id === id);
      if (q) await ensureNames([q.author_id]);
      if (q) { st.qText[id] = { who: (userName(q.author_id) || "a student") + (c.format !== "in_person" ? " · online" : ""), body: q.body }; apply(); }
    } catch (e) { delete st.qText[id]; }
  };
  const setDeck = async (deckId) => {
    const fresh = courses.find((x) => x.id === c.id) || c;
    let d = (fresh.decks || []).find((x) => x.id === deckId) || null;
    if (deckId && !d) { try { await loadAll(); } catch (e) { /* offline */ } d = (courses.find((x) => x.id === c.id).decks || []).find((x) => x.id === deckId) || null; }
    st.deck = d; st.urls = [];
    apply();
    if (d) { try { st.urls = await deckImages(d, "l"); } catch (e) { /* retried next poll */ } apply(); }
  };
  const take = (L) => {
    const deckChanged = !st.live || L.deckId !== (st.live && st.live.deckId) || (L.deckId && !st.deck);
    st.live = Object.assign(st.live || {}, L);
    if (st.live.key && st.live.key !== st.chKey) connect();
    if (deckChanged) setDeck(L.deckId); else apply();
  };
  const connect = () => {
    closeChannel(st.ch);
    st.chKey = st.live.key;
    st.ch = teachChannel(st.live, {
      state: (p) => {
        st.lastPush = Date.now();
        dot(true);
        const L = Object.assign({}, st.live, { slide: p.slide || st.live.slide, blanked: !!p.blanked, pinned: p.pinned || null, active: p.active !== false });
        if (p.deckId !== undefined) L.deckId = p.deckId;
        if (p.planId !== undefined) L.planId = p.planId;
        take(L);
        sendOnChannel(st.ch, "hello", { at: Date.now() });
      },
      row: (L) => { if (Date.now() - st.lastPush > 2000) take(L); },
    });
    sendOnChannel(st.ch, "hello", { at: Date.now() });
  };
  const dot = (ok) => { const d = document.getElementById("tvDot"); if (d) d.classList.toggle("tv-dot-bad", !ok); };
  const poll = async () => {
    if (presentState !== st) return;
    try {
      const L = await DB.teachLive(c.id);
      dot(true);
      if (L && Date.now() - st.lastPush > 4000) take(L);
      else if (!L) take({ active: false, key: "", courseId: c.id });
      if (L && L.active) markActive(true); // class is on — keep this screen signed in
    } catch (e) { dot(false); }
  };
  poll();
  st.timers.push(setInterval(poll, TEACH_POLL_MS));
  st.timers.push(setInterval(() => sendOnChannel(st.ch, "hello", { at: Date.now() }), TV_HELLO_MS));
  // This screen can move the slides too (arrow keys / a clicker).
  const move = (patch) => {
    if (!st.live || !st.live.active) return;
    Object.assign(st.live, patch);
    st.lastPush = Date.now();
    apply();
    sendOnChannel(st.ch, "state", { slide: st.live.slide, blanked: st.live.blanked, pinned: st.live.pinned, deckId: st.live.deckId, active: true, planId: st.live.planId, at: Date.now() });
    DB.teachUpdate(c.id, patch).catch(() => {});
  };
  st.onKey = (e) => {
    if (!st.live || !st.live.active || !st.deck) return;
    if (["ArrowRight", "PageDown", " ", "ArrowDown"].includes(e.key)) { e.preventDefault(); if (st.live.slide < st.deck.count) move({ slide: st.live.slide + 1 }); }
    else if (["ArrowLeft", "PageUp", "ArrowUp"].includes(e.key)) { e.preventDefault(); if (st.live.slide > 1) move({ slide: st.live.slide - 1 }); }
    else if (e.key === "b" || e.key === "B" || e.key === ".") move({ blanked: !st.live.blanked });
  };
  document.addEventListener("keydown", st.onKey);
  // The corner controls fade out until the mouse moves.
  let hideT = null;
  st.onMove = () => {
    const el = document.getElementById("tvCorner");
    if (!el) return;
    el.classList.remove("tv-corner-hide");
    clearTimeout(hideT);
    hideT = setTimeout(() => { const e2 = document.getElementById("tvCorner"); if (e2) e2.classList.add("tv-corner-hide"); }, 4000);
  };
  document.addEventListener("mousemove", st.onMove);
  st.onMove();
  document.getElementById("tvFull").addEventListener("click", () => {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  });
  document.getElementById("tvExit").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    stopPresent(); view = "home"; renderNav(); renderMain();
  });
  // Keep the screen from going to sleep during class.
  if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request("screen").then((w) => { if (presentState === st) st.wake = w; else w.release(); }).catch(() => {});
  if (st.live) take(st.live);
}

// ===========================================================================
// Online students: the slides on the Live Class page
// ===========================================================================
// Shown under the stream while the teacher is presenting. Follows the
// teacher, unless the student flips back to copy something down — then
// "Back to live" rejoins.
function startFollowAlong(c, st) {
  const card = document.getElementById("followCard");
  if (!card) return;
  const f = st.follow = { live: c.live || null, deck: null, urls: [], mine: null, ch: null, lastPush: 0 };
  const draw = () => {
    if (st.follow !== f) return;
    const L = f.live;
    const on = L && L.active && f.deck && f.deck.status === "ready" && f.deck.count;
    card.hidden = !on;
    if (!on) return;
    const n = f.mine || L.slide;
    const img = card.querySelector("#fImg");
    const black = L.blanked && !f.mine;
    card.querySelector("#fBlank").hidden = !black;
    img.hidden = black;
    if (!black && f.urls[n - 1]) { img.src = f.urls[n - 1]; img.alt = `Slide ${n}`; }
    card.querySelector("#fCount").textContent = `Slide ${n} of ${f.deck.count}`;
    const follow = card.querySelector("#fState");
    follow.textContent = f.mine ? "Looking back — the class is on slide " + L.slide : "Following the teacher";
    follow.classList.toggle("f-away", !!f.mine);
    card.querySelector("#fLive").disabled = !f.mine;
    card.querySelector("#fPrev").disabled = n <= 1;
    card.querySelector("#fNext").disabled = n >= Math.max(L.slide, 1) && !f.mine ? true : n >= f.deck.count;
  };
  const setDeck = async (deckId) => {
    f.deck = (c.decks || []).find((d) => d.id === deckId) || null;
    if (deckId && !f.deck) {
      try { await loadAll(); } catch (e) { /* later */ }
      const fresh = courses.find((x) => x.id === c.id);
      f.deck = fresh ? (fresh.decks || []).find((d) => d.id === deckId) || null : null;
    }
    f.urls = []; f.mine = null;
    draw();
    if (f.deck) { try { f.urls = await deckImages(f.deck, "s"); } catch (e) { /* retried */ } draw(); }
  };
  const take = (L) => {
    const deckChanged = !f.live || L.deckId !== f.live.deckId || (L.deckId && !f.deck);
    f.live = Object.assign(f.live || {}, L);
    if (f.live.key && f.live.key !== f.chKey) connect();
    if (deckChanged) setDeck(L.deckId); else draw();
  };
  const connect = () => {
    closeChannel(f.ch);
    f.chKey = f.live.key;
    f.ch = teachChannel(f.live, {
      state: (p) => {
        f.lastPush = Date.now();
        const L = Object.assign({}, f.live, { slide: p.slide || f.live.slide, blanked: !!p.blanked, pinned: p.pinned || null, active: p.active !== false });
        if (p.deckId !== undefined) L.deckId = p.deckId;
        take(L);
      },
    });
  };
  card.querySelector("#fPrev").addEventListener("click", () => { f.mine = Math.max(1, (f.mine || f.live.slide) - 1); draw(); });
  card.querySelector("#fNext").addEventListener("click", () => {
    const n = (f.mine || f.live.slide) + 1;
    f.mine = n >= f.live.slide ? null : n;
    draw();
  });
  card.querySelector("#fLive").addEventListener("click", () => { f.mine = null; draw(); });
  swipe(card.querySelector(".f-stage"), (d) => card.querySelector(d > 0 ? "#fNext" : "#fPrev").click());
  const poll = async () => {
    if (st.follow !== f || liveState !== st) return;
    try {
      const L = await DB.teachLive(c.id);
      if (L && Date.now() - f.lastPush > 4000) take(L);
    } catch (e) { /* offline */ }
  };
  poll();
  st.timers.push(setInterval(poll, TEACH_POLL_MS));
  st.stopFollow = () => closeChannel(f.ch);
  if (f.live) take(f.live);
}
function followCardHtml() {
  return `<div class="card follow-card" id="followCard" hidden>
    <div class="f-head"><strong id="fCount"></strong><span class="f-state" id="fState">Following the teacher</span></div>
    <div class="f-stage"><img id="fImg" alt=""><div class="f-blank" id="fBlank" hidden>The teacher has paused the slides.</div></div>
    <div class="f-nav">
      <button type="button" class="btn btn-ghost btn-sm" id="fPrev">&lsaquo; Earlier slide</button>
      <button type="button" class="btn btn-ghost btn-sm" id="fNext">Later &rsaquo;</button>
      <button type="button" class="btn btn-primary btn-sm" id="fLive" disabled>Back to live</button>
    </div>
  </div>`;
}
