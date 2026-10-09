// ===========================================================================
// Keeping long courses tidy (Oct 9, 2026)
//
//  • Lectures in series order — Lesson 1 first — read from the numbers in
//    their titles ("Lesson 3", "Lecture #12", "Week 4", "03 – …").
//  • Course pages split into tabs (Overview · Lectures · Materials ·
//    Assignments …) instead of one very long page.
//  • Course Materials grouped by kind (Syllabus, Lessons, Quizzes …), sorted
//    1, 2, 3 … 10 (not 1, 10, 2), with the Word and PDF copies of the same
//    document shown as one entry, and a search box.
//  • Assignments that use those documents: pick them from Course Materials
//    or upload new ones; a weekly assignment hands them out in order
//    (Quiz 1 → week 1, Quiz 2 → week 2 …).
// ===========================================================================

const NAT = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
function naturalCompare(a, b) { return NAT.compare(String(a || ""), String(b || "")); }

// --- lectures ----------------------------------------------------------------
const LESSON_NUM_RE = /(?:lesson|lecture|session|week|part|class|chapter|study|unit|day|no\.?|#)\s*#?\s*(\d{1,3})(?!\d)/i;
function lessonNumber(title) {
  const t = String(title || "");
  const m = LESSON_NUM_RE.exec(t) || /^\s*(\d{1,3})(?!\d)/.exec(t);
  return m ? parseInt(m[1], 10) : null;
}
// Lectures without a class day: lesson number, then recording date, then
// playlist order. (Ones with a class day are ordered by that day.)
function lessonSeriesCompare(a, b) {
  const na = lessonNumber(a.title), nb = lessonNumber(b.title);
  if (na !== null || nb !== null) {
    if (na === null) return 1;
    if (nb === null) return -1;
    if (na !== nb) return na - nb;
  }
  const da = a.recordedOn || (a.publishedAt || "").slice(0, 10), db = b.recordedOn || (b.publishedAt || "").slice(0, 10);
  if (da !== db) return da ? (db ? da.localeCompare(db) : -1) : 1;
  return (a.position - b.position) || String(a.addedAt).localeCompare(String(b.addedAt));
}
function sortLessons(list) {
  return list.sort((a, b) =>
    (a.classDate || "9999").localeCompare(b.classDate || "9999") || lessonSeriesCompare(a, b));
}

// --- documents -----------------------------------------------------------------
const DOC_EXT_RE = /(\.(docx?|pdf|pptx?|odt|rtf|txt|jpe?g|png|gif|webp|heic|heif|mp3|m4a|mp4))+\s*$/i;
function docBase(title) { return String(title || "Document").replace(DOC_EXT_RE, "").replace(/\s+/g, " ").trim() || "Document"; }
function docExt(m) {
  const fromName = /\.([a-z0-9]{2,5})\s*$/i.exec(m.title || "") || /\.([a-z0-9]{2,5})$/i.exec(m.storagePath || "");
  return fromName ? fromName[1].toLowerCase() : "";
}
function docKind(m) {
  const e = docExt(m);
  const mt = m.mimeType || "";
  if (e === "pdf" || mt === "application/pdf") return "PDF";
  if (/^docx?$|^odt$|^rtf$/.test(e) || /word/.test(mt)) return "Word";
  if (/^pptx?$/.test(e) || /presentation/.test(mt)) return "PowerPoint";
  if (/^(jpe?g|png|gif|webp|heic|heif)$/.test(e) || /^image\//.test(mt)) return "Image";
  if (/^(mp3|m4a)$/.test(e) || /^audio\//.test(mt)) return "Audio";
  if (e === "mp4" || /^video\//.test(mt)) return "Video";
  if (e === "txt") return "Text";
  return m.storagePath ? "File" : "Note";
}
const DOC_GROUPS = [
  ["syllabus", "Syllabus & Course Info", /syllab|course outline|course info/],
  ["quiz", "Quizzes", /\bquiz/],
  ["exam", "Exams", /\bexam|\bfinal\b|midterm|answer key/],
  ["study", "Study Questions & Worksheets", /study question|worksheet|questions|\breview\b|homework/],
  ["slides", "Presentations", /powerpoint|\bslides?\b/],
  ["lesson", "Lessons & Lectures", /lesson|lecture|class notes|\bnotes\b|outline/],
  ["reading", "Textbooks & Reading", /textbook|\bbook|chapter|edition|reading|digital|\btext\b/],
  ["guide", "Guides & Forms", /\bform\b|checklist|standard|guide|rubric|evaluation|axiom|instruction|handbook/],
  ["other", "Other Documents", /.*/],
];
function docGroupOf(unit) {
  const t = unit.base.toLowerCase();
  if (unit.files.some((f) => docKind(f) === "PowerPoint") && !/syllab|quiz|exam/.test(t)) return DOC_GROUPS.find((g) => g[0] === "slides");
  return DOC_GROUPS.find((g) => g[2].test(t));
}
// The course's documents as "units": the Word and PDF copies of one
// document together, in natural order.
function docUnits(materials) {
  const byKey = new Map();
  materials.forEach((m) => {
    const base = docBase(m.title);
    const key = base.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { key, base, files: [] });
    byKey.get(key).files.push(m);
  });
  const order = { PDF: 0, Word: 1, PowerPoint: 2 };
  const units = [...byKey.values()];
  units.forEach((u) => u.files.sort((a, b) => (order[docKind(a)] ?? 9) - (order[docKind(b)] ?? 9)));
  return units.sort((a, b) => naturalCompare(a.base, b.base));
}
function docGroups(materials) {
  const groups = DOC_GROUPS.map(([id, label]) => ({ id, label, units: [] }));
  docUnits(materials).forEach((u) => groups.find((g) => g.id === docGroupOf(u)[0]).units.push(u));
  return groups.filter((g) => g.units.length);
}

// Which groups are open, remembered across redraws of the page.
const docsOpen = new Map(); // `${courseId}:${scope}` → Set of group ids
function docsOpenSet(courseId, scope, groups) {
  const k = `${courseId}:${scope}`;
  if (!docsOpen.has(k)) {
    const total = groups.reduce((n, g) => n + g.units.length, 0);
    docsOpen.set(k, new Set(total <= 10 || groups.length === 1 ? groups.map((g) => g.id) : groups.slice(0, 1).map((g) => g.id)));
  }
  return docsOpen.get(k);
}

// The Course Materials browser: grouped, sorted, searchable.
// opts.manage → each file's Teachers-only box and Remove.
function materialsBrowserHtml(c, opts = {}) {
  const scope = opts.manage ? "manage" : "course";
  if (!c.materials.length) return `<p class="docs-empty">No documents yet.</p>`;
  const groups = docGroups(c.materials);
  const open = docsOpenSet(c.id, scope, groups);
  const total = groups.reduce((n, g) => n + g.units.length, 0);
  const fileBtns = (u) => u.files.map((f) =>
    `<button type="button" class="btn btn-ghost btn-sm" data-open-material="${f.id}" aria-label="Open ${esc(u.base)} (${docKind(f)})">${u.files.length === 1 ? "Open" : docKind(f)}</button>`).join("");
  const row = (u) => {
    const teacherOnly = u.files.every((f) => f.teacherOnly);
    const someTeacher = !teacherOnly && u.files.some((f) => f.teacherOnly);
    return `<li class="doc-row" data-doc-search="${esc(u.base.toLowerCase())}">
      <div class="doc-main">
        <strong class="doc-name">${esc(u.base)}</strong>
        ${teacherOnly ? `<span class="pill pill-teacher">Teachers only</span>` : someTeacher ? `<span class="pill pill-teacher">Part teachers only</span>` : ""}
        ${u.files.length === 1 && !opts.manage ? `<span class="doc-kind">${docKind(u.files[0])}</span>` : ""}
        ${opts.manage ? `<div class="doc-files">${u.files.map((f) => `
          <span class="doc-file">
            <span class="doc-kind">${docKind(f)}</span>
            <label class="check-row check-row-sm"><input type="checkbox" data-teacher-only="${f.id}" ${f.teacherOnly ? "checked" : ""} /> Teachers only</label>
            <button type="button" class="link-btn" data-remove-material="${f.id}">Remove</button>
          </span>`).join("")}</div>` : ""}
      </div>
      <div class="doc-open">${fileBtns(u)}</div>
    </li>`;
  };
  return `
    <div class="docs-browser" data-docs-scope="${scope}">
      ${total > 6 ? `<div class="docs-tools"><input type="search" class="docs-search" placeholder="Search ${total} documents…" aria-label="Search documents" autocomplete="off" />
        <button type="button" class="link-btn docs-toggle-all">${open.size === groups.length ? "Collapse all" : "Expand all"}</button></div>` : ""}
      ${groups.map((g) => `
        <details class="docs-group" data-group="${g.id}" ${open.has(g.id) ? "open" : ""}>
          <summary><span class="docs-group-name">${esc(g.label)}</span><span class="docs-count">${g.units.length}</span></summary>
          <ul class="docs-list">${g.units.map(row).join("")}</ul>
        </details>`).join("")}
      <p class="docs-none" hidden>No documents match your search.</p>
    </div>`;
}
function wireMaterialsBrowser(c, root, opts = {}) {
  const scope = opts.manage ? "manage" : "course";
  const box = root.querySelector(`.docs-browser[data-docs-scope="${scope}"]`);
  if (!box) return;
  const groups = docGroups(c.materials);
  const open = docsOpenSet(c.id, scope, groups);
  let searching = false;
  box.querySelectorAll(".docs-group").forEach((d) => d.addEventListener("toggle", () => {
    if (searching) return;
    if (d.open) open.add(d.dataset.group); else open.delete(d.dataset.group);
    const t = box.querySelector(".docs-toggle-all");
    if (t) t.textContent = open.size === groups.length ? "Collapse all" : "Expand all";
  }));
  const tog = box.querySelector(".docs-toggle-all");
  if (tog) tog.addEventListener("click", () => {
    const openAll = open.size !== groups.length;
    box.querySelectorAll(".docs-group").forEach((d) => { d.open = openAll; });
  });
  const search = box.querySelector(".docs-search");
  if (search) search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    searching = !!q;
    let any = false;
    box.querySelectorAll(".docs-group").forEach((d) => {
      let hits = 0;
      d.querySelectorAll(".doc-row").forEach((r) => {
        const show = !q || q.split(/\s+/).every((w) => r.dataset.docSearch.includes(w));
        r.hidden = !show;
        if (show) hits++;
      });
      d.hidden = hits === 0;
      d.open = q ? hits > 0 : open.has(d.dataset.group);
      if (hits) any = true;
    });
    box.querySelector(".docs-none").hidden = any;
  });
  const find = (id) => c.materials.find((m) => m.id === id);
  box.querySelectorAll("[data-open-material]").forEach((b) => b.addEventListener("click", () => openMaterialViewer(c, find(b.dataset.openMaterial))));
  if (!opts.manage) return;
  box.querySelectorAll("[data-teacher-only]").forEach((cb) => cb.addEventListener("change", () => {
    const m = find(cb.dataset.teacherOnly);
    run(() => DB.setMaterialTeacherOnly(m, cb.checked), null, { success: cb.checked ? `"${m.title}" is now for teachers only.` : `"${m.title}" is now visible to the whole class.` });
  }));
  box.querySelectorAll("[data-remove-material]").forEach((b) => b.addEventListener("click", () => {
    const m = find(b.dataset.removeMaterial);
    const used = c.assignments.filter((a) => (a.materialIds || []).includes(m.id)).length;
    if (!confirm(`Remove "${m.title}" from ${c.title}? ${m.teacherOnly ? "Teachers" : "Students"} will no longer be able to open it.${used ? `\n\nIt's attached to ${used} assignment${used === 1 ? "" : "s"}; it will be taken off ${used === 1 ? "it" : "them"} too.` : ""}`)) return;
    run(() => DB.removeMaterial(m), null, { success: "Removed." });
  }));
}

// --- tabs ---------------------------------------------------------------------------
const courseTabs = new Map(); // `${view}:${courseId}` → tab id
function tabsHtml(key, tabs) {
  const ids = tabs.map((t) => t.id);
  let active = courseTabs.get(key);
  if (!ids.includes(active)) active = ids[0];
  courseTabs.set(key, active);
  return `<div class="course-tabs" role="tablist" aria-label="Course sections">
    ${tabs.map((t) => `<button type="button" role="tab" class="course-tab ${t.id === active ? "active" : ""}" id="tab-${t.id}" data-tab="${t.id}" aria-selected="${t.id === active}" aria-controls="panel-${t.id}">${esc(t.label)}${t.count ? ` <span class="tab-count ${t.alert ? "tab-alert" : ""}">${t.count}</span>` : ""}</button>`).join("")}
  </div>`;
}
function panelAttrs(key, id) {
  const active = courseTabs.get(key);
  return `class="tab-panel" id="panel-${id}" role="tabpanel" aria-labelledby="tab-${id}" data-panel="${id}" ${active === id ? "" : "hidden"}`;
}
function wireTabs(key, root) {
  const bar = root.querySelector(".course-tabs");
  if (!bar) return;
  // Stays in view under the site's top bar while scrolling.
  const nav = document.querySelector(".top-nav");
  const navH = nav && getComputedStyle(nav).position === "sticky" ? nav.offsetHeight : 0;
  bar.style.top = navH + "px";
  const select = (id, focus) => {
    courseTabs.set(key, id);
    bar.querySelectorAll(".course-tab").forEach((b) => {
      const on = b.dataset.tab === id;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on);
      if (on && focus) b.focus();
    });
    root.querySelectorAll(".tab-panel").forEach((p) => { p.hidden = p.dataset.panel !== id; });
  };
  bar.querySelectorAll(".course-tab").forEach((b) => {
    b.addEventListener("click", () => {
      select(b.dataset.tab);
      const panel = root.querySelector(".tab-panel:not([hidden])");
      if (!panel) return;
      const top = panel.getBoundingClientRect().top + window.scrollY - navH - bar.offsetHeight - 8;
      if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
    });
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const all = [...bar.querySelectorAll(".course-tab")];
      const i = all.indexOf(b) + (e.key === "ArrowRight" ? 1 : -1);
      const next = all[(i + all.length) % all.length];
      select(next.dataset.tab, true);
    });
  });
  // Other pages can send someone straight to a tab ("go to Materials").
  root.querySelectorAll("[data-goto-tab]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    select(a.dataset.gotoTab);
    bar.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

// --- documents on assignments ----------------------------------------------------------
function assignmentDocs(c, a) {
  return (a.materialIds || []).map((id) => c.materials.find((m) => m.id === id)).filter(Boolean);
}
function assignmentDocsHtml(c, a, opts = {}) {
  const docs = assignmentDocs(c, a);
  if (!docs.length) return "";
  return `<div class="asg-docs">${docUnits(docs).map((u) => u.files.map((f) =>
    `<button type="button" class="doc-chip" data-open-material="${f.id}">${icon("book")}<span>${esc(u.base)}${u.files.length > 1 || opts.kinds ? ` <small>${docKind(f)}</small>` : ""}</span>${f.teacherOnly ? ` <span class="pill pill-teacher">Teachers only</span>` : ""}</button>`).join("")).join("")}</div>`;
}
function wireDocChips(c, root) {
  root.querySelectorAll(".asg-docs [data-open-material]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const m = c.materials.find((x) => x.id === b.dataset.openMaterial);
    if (m) openMaterialViewer(c, m);
  }));
}

// A document picker used inside the assignment windows. Holds the chosen
// document units (existing ones and files waiting to be uploaded) and
// tells its owner when the choice changes.
function makeDocPicker(c, mount, { selectedIds = [], onChange }) {
  const chosen = new Map();   // unit key → { key, base, files: [material], pending: [File] }
  const units = docUnits(c.materials);
  units.forEach((u) => { if (u.files.some((f) => selectedIds.includes(f.id))) chosen.set(u.key, { key: u.key, base: u.base, files: u.files.filter((f) => selectedIds.includes(f.id)), pending: [] }); });
  let listOpen = false;
  function draw() {
    const groups = docGroups(c.materials);
    mount.innerHTML = `
      <div class="asg-docs-actions">
        ${c.materials.length ? `<button type="button" class="btn btn-ghost btn-sm" data-pick-toggle>${icon("book")} ${listOpen ? "Done choosing" : "Choose from Course Materials"}</button>` : ""}
        <label class="btn btn-ghost btn-sm file-btn">${icon("upload")} Upload from computer<input type="file" multiple accept="${UPLOAD_ACCEPT}" data-pick-upload hidden /></label>
      </div>
      ${listOpen ? `
      <div class="doc-picker">
        <input type="search" class="docs-search" data-pick-search placeholder="Search documents… (e.g. quiz)" autocomplete="off" aria-label="Search documents" />
        <div class="doc-picker-quick" data-pick-quick></div>
        ${groups.map((g) => `
          <fieldset class="doc-pick-group" data-pick-group="${g.id}">
            <legend>${esc(g.label)} <button type="button" class="link-btn" data-pick-all="${g.id}">Select all</button></legend>
            ${g.units.map((u) => `
              <label class="check-row doc-pick-row" data-doc-search="${esc(u.base.toLowerCase())}">
                <input type="checkbox" data-pick-unit="${esc(u.key)}" ${chosen.has(u.key) ? "checked" : ""} />
                <span>${esc(u.base)} <small class="doc-kind">${u.files.map(docKind).join(" + ")}</small>${u.files.every((f) => f.teacherOnly) ? ` <span class="pill pill-teacher">Teachers only</span>` : ""}</span>
              </label>`).join("")}
          </fieldset>`).join("")}
      </div>` : ""}
      ${chosen.size ? `<ul class="doc-chosen">${[...chosen.values()].sort((a, b) => naturalCompare(a.base, b.base)).map((u) => `
        <li><span>${esc(u.base)} <small class="doc-kind">${[...u.files.map(docKind), ...u.pending.map((f) => docKind({ title: f.name, mimeType: f.type, storagePath: f.name }))].join(" + ")}${u.pending.length ? " · uploads when you save" : ""}</small>${u.files.length && u.files.every((f) => f.teacherOnly) ? ` <span class="pill pill-teacher">Teachers only — students won't see it</span>` : ""}</span>
        <button type="button" class="link-btn" data-unpick="${esc(u.key)}">Remove</button></li>`).join("")}</ul>` : ""}`;
    const up = mount.querySelector("[data-pick-upload]");
    up.addEventListener("change", () => {
      const files = [...up.files];
      up.value = "";
      try { files.forEach((f) => checkUpload(f, MATERIAL_MAX_BYTES)); } catch (e) { toast(e.message); return; }
      files.forEach((f) => {
        const base = docBase(f.name), key = base.toLowerCase();
        if (!chosen.has(key)) chosen.set(key, { key, base, files: [], pending: [] });
        chosen.get(key).pending.push(f);
      });
      changed();
    });
    const tog = mount.querySelector("[data-pick-toggle]");
    if (tog) tog.addEventListener("click", () => { listOpen = !listOpen; draw(); if (listOpen) { const s = mount.querySelector("[data-pick-search]"); if (s) s.focus(); } });
    mount.querySelectorAll("[data-pick-unit]").forEach((cb) => cb.addEventListener("change", () => {
      const u = units.find((x) => x.key === cb.dataset.pickUnit);
      if (cb.checked) chosen.set(u.key, { key: u.key, base: u.base, files: u.files.slice(), pending: (chosen.get(u.key) || {}).pending || [] });
      else chosen.delete(u.key);
      changed(true);
    }));
    mount.querySelectorAll("[data-pick-all]").forEach((b) => b.addEventListener("click", () => {
      const g = docGroups(c.materials).find((x) => x.id === b.dataset.pickAll);
      const rows = [...mount.querySelectorAll(`[data-pick-group="${g.id}"] .doc-pick-row:not([hidden]) input`)];
      const all = rows.every((r) => r.checked);
      rows.forEach((r) => {
        const u = units.find((x) => x.key === r.dataset.pickUnit);
        if (all) chosen.delete(u.key); else chosen.set(u.key, { key: u.key, base: u.base, files: u.files.slice(), pending: [] });
      });
      changed();
    }));
    mount.querySelectorAll("[data-unpick]").forEach((b) => b.addEventListener("click", () => { chosen.delete(b.dataset.unpick); changed(); }));
    const s = mount.querySelector("[data-pick-search]");
    if (s) {
      s.value = mount._q || "";
      const filter = () => {
        mount._q = s.value;
        const q = s.value.trim().toLowerCase();
        mount.querySelectorAll(".doc-pick-group").forEach((g) => {
          let hits = 0;
          g.querySelectorAll(".doc-pick-row").forEach((r) => {
            const show = !q || q.split(/\s+/).every((w) => r.dataset.docSearch.includes(w));
            r.hidden = !show; if (show) hits++;
          });
          g.hidden = !hits;
        });
      };
      s.addEventListener("input", filter);
      filter();
    }
  }
  function changed(keepFocus) {
    const active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.pickUnit : null;
    draw();
    if (keepFocus && active) { const el = mount.querySelector(`[data-pick-unit="${CSS.escape(active)}"]`); if (el) el.focus(); }
    onChange && onChange();
  }
  draw();
  return {
    units: () => [...chosen.values()].sort((a, b) => naturalCompare(a.base, b.base)),
    hasPending: () => [...chosen.values()].some((u) => u.pending.length),
    // Uploads any new files to Course Materials; returns unit key → material ids.
    async commit(teacherOnly = false) {
      const ids = new Map();
      for (const u of chosen.values()) {
        const made = u.pending.length ? await DB.addMaterials(c.id, u.pending, teacherOnly) : [];
        ids.set(u.key, [...u.files.map((f) => f.id), ...made.map((m) => m.id)]);
      }
      return ids;
    },
  };
}

// Week-by-week plan for a weekly assignment: which documents go with which
// week. "order" = one document per week, in order; "same" = every week
// gets all of them.
function weekPlanHtml(units, dues, plan, opts = {}) {
  if (!units.length) return "";
  const extra = plan.mode === "order" && units.length > dues.length ? units.length - dues.length : 0;
  const missing = plan.mode === "order" ? dues.map((d, i) => (plan.weeks[i] ? null : i + 1)).filter(Boolean) : [];
  return `
    <div class="week-plan">
      <div class="radio-row">
        <label class="radio-option"><input type="radio" name="wpMode" value="order" ${plan.mode === "order" ? "checked" : ""} /> One per week, in order</label>
        <label class="radio-option"><input type="radio" name="wpMode" value="same" ${plan.mode === "same" ? "checked" : ""} /> The same ${units.length === 1 ? "document" : "documents"} every week</label>
      </div>
      ${plan.mode === "order" ? `
      <ol class="week-plan-list">
        ${dues.map((d, i) => `<li>
          <span class="wp-week"><strong>Week ${i + 1}</strong>${d ? `<small>Due ${esc(fmtDay(d, { month: "short", day: "numeric" }))}</small>` : ""}</span>
          <select data-wp-week="${i}" aria-label="Document for week ${i + 1}">
            <option value="">— none —</option>
            ${units.map((u) => `<option value="${esc(u.key)}" ${plan.weeks[i] === u.key ? "selected" : ""}>${esc(u.base)}</option>`).join("")}
          </select>
        </li>`).join("")}
      </ol>
      ${extra ? `<p class="field-hint wp-warn">${icon("warning")} ${extra} document${extra === 1 ? " doesn't" : "s don't"} have a week (${esc(units.slice(dues.length).map((u) => u.base).join(", "))}). Add weeks${opts.canFit ? "" : " above"}, or remove ${extra === 1 ? "it" : "them"}.${opts.canFit ? ` <button type="button" class="link-btn" data-wp-fit="${units.length}">Make it ${units.length} weeks</button>` : ""}</p>` : ""}
      ${missing.length && !extra ? `<p class="field-hint">Week${missing.length === 1 ? "" : "s"} ${esc(missing.join(", "))} ha${missing.length === 1 ? "s" : "ve"} no document.${opts.canFit && units.length < dues.length ? ` <button type="button" class="link-btn" data-wp-fit="${units.length}">Make it ${units.length} weeks</button>` : ""}</p>` : ""}
      ` : `<p class="field-hint">Every week will include: ${esc(units.map((u) => u.base).join(", "))}.</p>`}
    </div>`;
}
function defaultWeekPlan(units, weeks, prev) {
  const mode = prev && prev.mode ? prev.mode : units.length > 1 ? "order" : "same";
  return { mode, weeks: Array.from({ length: weeks }, (_, i) => (units[i] ? units[i].key : "")) };
}
function wireWeekPlan(mount, plan, redraw) {
  mount.querySelectorAll('input[name="wpMode"]').forEach((r) => r.addEventListener("change", () => { plan.mode = r.value; redraw(); }));
  mount.querySelectorAll("[data-wp-week]").forEach((s) => s.addEventListener("change", () => { plan.weeks[+s.dataset.wpWeek] = s.value; redraw(); }));
}
// The material ids for each week (or the one assignment), from a plan.
function planMaterialIds(plan, units, idsByUnit, count) {
  const all = units.flatMap((u) => idsByUnit.get(u.key) || []);
  if (count === 1 && plan === null) return [all];
  return Array.from({ length: count }, (_, i) =>
    plan.mode === "same" ? all : (plan.weeks[i] ? idsByUnit.get(plan.weeks[i]) || [] : []));
}

// Change the documents on an assignment already made — one assignment, or
// every week of a weekly one.
function openAssignmentDocsModal(course, items) {
  items = items.slice().sort((a, b) => a.due.localeCompare(b.due));
  const series = items.length > 1;
  const label = series ? items[0].seriesLabel : items[0].title;
  const current = [...new Set(items.flatMap((a) => a.materialIds || []))];
  const root = document.getElementById("modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width:640px;">
        <h2 style="font-size:1.15rem;">Documents — ${esc(label)}</h2>
        <p class="field-hint" style="margin-top:4px;">${series ? `Students see each week's documents on that week's assignment.` : "Students open these from the assignment."} Uploaded files are also added to Course Materials.</p>
        <div id="adPicker"></div>
        <div id="adPlan"></div>
        <div class="form-actions">
          <button class="btn btn-primary" id="adSave">Save Documents</button>
          <button class="btn btn-ghost" id="adCancel">Cancel</button>
        </div>
      </div>
    </div>`;
  let plan = null;
  const unitOf = (id) => docUnits(course.materials).find((u) => u.files.some((f) => f.id === id));
  if (series) {
    const sets = items.map((a) => (a.materialIds || []).slice().sort().join(","));
    const same = sets.every((s) => s === sets[0]) && sets[0] !== "";
    plan = { mode: same ? "same" : "order", weeks: items.map((a) => { const u = (a.materialIds || []).length ? unitOf(a.materialIds[0]) : null; return u ? u.key : ""; }) };
  }
  const picker = makeDocPicker(course, document.getElementById("adPicker"), { selectedIds: current, onChange: drawPlan });
  let lastKeys = picker.units().map((u) => u.key).join("|");
  function drawPlan() {
    const mount = document.getElementById("adPlan");
    if (!series) { mount.innerHTML = ""; return; }
    const units = picker.units();
    const keys = units.map((u) => u.key).join("|");
    if (keys !== lastKeys) { plan = defaultWeekPlan(units, items.length, plan); lastKeys = keys; }
    mount.innerHTML = weekPlanHtml(units, items.map((a) => a.due), plan);
    wireWeekPlan(mount, plan, drawPlan);
  }
  drawPlan();
  document.getElementById("adCancel").addEventListener("click", closeModal);
  document.getElementById("adSave").addEventListener("click", () => {
    const units = picker.units();
    run(async () => {
      const ids = await picker.commit();
      const perItem = series ? planMaterialIds(plan, units, ids, items.length) : planMaterialIds(null, units, ids, 1);
      for (let i = 0; i < items.length; i++) await DB.setAssignmentMaterials(items[i].id, perItem[i] || []);
      closeModal();
    }, null, { success: "Documents saved." });
  });
}
