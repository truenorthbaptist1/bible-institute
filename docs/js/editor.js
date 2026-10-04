// True North Baptist Church Bible Institute — the assignment word processor.
//
// A full writing tool for turning work in without a file: paragraph styles,
// fonts and sizes, colors, alignment, line spacing, lists, tables, links,
// footnotes, special characters (Greek, Hebrew, transliteration), find and
// replace, a title block, print/save as PDF, word count, a distraction-free
// full-screen mode, and an autosaved draft on this device. The 📖 Scripture
// button looks up any KJV passage (or searches by word) and inserts it as a
// block quotation, an inline quotation, or just the reference.
//
// Whatever is written is cleaned by safeHtml() (js/app.js) before it is saved
// or shown, so only plain formatting can ride along.

const RTE_FONTS = [
  ["", "Default (serif)"],
  ["Georgia, serif", "Georgia"],
  ["'Times New Roman', Times, serif", "Times New Roman"],
  ["Figtree, Arial, sans-serif", "Sans-serif"],
  ["Arial, Helvetica, sans-serif", "Arial"],
  ["'Courier New', monospace", "Courier"],
];
const RTE_SIZES = ["", "12px", "14px", "18px", "20px", "24px", "30px"];
const RTE_SIZE_LABELS = { "": "Normal", "12px": "Small", "14px": "Smaller", "18px": "Larger", "20px": "Large", "24px": "Extra large", "30px": "Huge" };
const RTE_COLORS = ["#142033", "#5b6676", "#9a1b1b", "#b4541a", "#8a6a12", "#2f6b3a", "#1d5d8f", "#3d2f7a", "#7a2f63", "#000000"];
const RTE_HILITES = ["#fff3a3", "#ffd9a8", "#c9f0c4", "#c7e3ff", "#f2d1f0", "#e6e6e6"];
const RTE_SPECIAL = {
  "Punctuation": "— – … “ ” ‘ ’ « » § ¶ † ‡ • · ° × ÷ ± ½ ¼ ¾ © ™ ✝".split(" "),
  "Greek": "α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ ς τ υ φ χ ψ ω Α Β Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω ά έ ή ί ό ύ ώ ἀ ἁ".split(" "),
  "Hebrew": "א ב ג ד ה ו ז ח ט י כ ך ל מ ם נ ן ס ע פ ף צ ץ ק ר ש ת שׁ שׂ".split(" "),
  "Transliteration": "ā ē ī ō ū â ê î ô û ḥ ṭ ṣ ś š ʼ ʽ ḇ ḡ ḏ ḵ p̄ ṯ".split(" "),
};
const RTE_BLOCKS = "p,h1,h2,h3,h4,li,blockquote,div,td,th";

function rteSvg(path) { return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`; }
const RTE_ICONS = {
  undo: rteSvg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: rteSvg('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  left: rteSvg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  center: rteSvg('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  right: rteSvg('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  justify: rteSvg('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
  ul: rteSvg('<circle cx="5" cy="7" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="17" r="1.2" fill="currentColor"/><path d="M9 7h11M9 12h11M9 17h11"/>'),
  ol: rteSvg('<path d="M10 7h10M10 12h10M10 17h10"/><path d="M4 5h1.5v4M4 9h3M4 14.5c.5-.8 2.8-.8 2.8.6 0 1-2.8 1.6-2.8 2.9h3"/>'),
  outdent: rteSvg('<path d="M20 6H9M20 12h-8M20 18H9"/><path d="m7 9-3 3 3 3"/>'),
  indent: rteSvg('<path d="M20 6H9M20 12h-8M20 18H9"/><path d="m4 9 3 3-3 3"/>'),
  link: rteSvg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  table: rteSvg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>'),
  hr: rteSvg('<path d="M3 12h18"/><path d="M7 7h10M7 17h10" opacity=".35"/>'),
  footnote: rteSvg('<path d="M4 7h9M4 11h9M4 15h6"/><path d="M17 4v6M15.5 5.5 17 4"/><path d="M4 20h16" opacity=".4"/>'),
  omega: rteSvg('<path d="M5 19h4v-2a6.5 6.5 0 1 1 6 0v2h4"/>'),
  find: rteSvg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  clear: rteSvg('<path d="M6 5h12M12 5l-3 14"/><path d="m15 15 5 5M20 15l-5 5"/>'),
  print: rteSvg('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
  full: rteSvg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  exitfull: rteSvg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  heading: rteSvg('<path d="M5 4v16M15 4v16M5 12h10"/>'),
  titleblock: rteSvg('<path d="M4 5h9M4 9h7M4 13h8"/><path d="M8 18h8" /><path d="M4 21h16" opacity=".35"/>'),
  spacing: rteSvg('<path d="M11 6h9M11 12h9M11 18h9"/><path d="m4 8 2-3 2 3M4 16l2 3 2-3M6 5v14"/>'),
  bible: rteSvg('<path d="M12 5c-2-1.2-4.6-1.5-7.5-1v14.5c2.9-.4 5.5-.1 7.5 1.1M12 5c2-1.2 4.6-1.5 7.5-1v14.5c-2.9-.4-5.5-.1-7.5 1.1M12 5v15"/><path d="M16 8v4M14.5 9.5h3"/>'),
};

let rteInstanceCount = 0;

// opts: { html, draftKey, savedAt, context: { student, teacher, course, assignment } }
function mountRichEditor(container, opts = {}) {
  const id = "rte" + (++rteInstanceCount);
  const ctx = opts.context || {};
  const btn = (cmd, label, iconHtml, extra = "") => `<button type="button" class="rte-btn" data-cmd="${cmd}" title="${label}" aria-label="${label}" ${extra}>${iconHtml}</button>`;
  container.innerHTML = `
    <div class="rte" id="${id}">
      <div class="rte-toolbar" role="toolbar" aria-label="Formatting">
        <div class="rte-group">
          ${btn("undo", "Undo (Ctrl+Z)", RTE_ICONS.undo)}
          ${btn("redo", "Redo (Ctrl+Y)", RTE_ICONS.redo)}
        </div>
        <div class="rte-group">
          <select class="rte-select rte-style" data-sel="block" aria-label="Paragraph style" title="Paragraph style">
            <option value="p">Normal text</option>
            <option value="h1">Title</option>
            <option value="h2">Heading 1</option>
            <option value="h3">Heading 2</option>
            <option value="h4">Heading 3</option>
            <option value="blockquote">Quotation</option>
          </select>
          <select class="rte-select rte-font" data-sel="font" aria-label="Font" title="Font">${RTE_FONTS.map(([v, l]) => `<option value="${esc(v)}">${l}</option>`).join("")}</select>
          <select class="rte-select rte-size" data-sel="size" aria-label="Text size" title="Text size">${RTE_SIZES.map((v) => `<option value="${v}">${RTE_SIZE_LABELS[v]}</option>`).join("")}</select>
        </div>
        <div class="rte-group">
          ${btn("bold", "Bold (Ctrl+B)", "<strong>B</strong>")}
          ${btn("italic", "Italic (Ctrl+I)", "<em style='font-family:Georgia,serif'>I</em>")}
          ${btn("underline", "Underline (Ctrl+U)", "<u>U</u>")}
          ${btn("strikeThrough", "Strikethrough", "<s>S</s>")}
          ${btn("superscript", "Superscript", "x<sup>2</sup>")}
          ${btn("subscript", "Subscript", "x<sub>2</sub>")}
          <span class="rte-color-wrap">${btn("pop:color", "Text color", `<span class="rte-a">A<i style="background:#9a1b1b"></i></span>`)}</span>
          <span class="rte-color-wrap">${btn("pop:hilite", "Highlight", `<span class="rte-a rte-hl">ab<i style="background:#fff3a3"></i></span>`)}</span>
        </div>
        <div class="rte-group">
          ${btn("justifyLeft", "Align left", RTE_ICONS.left)}
          ${btn("justifyCenter", "Center", RTE_ICONS.center)}
          ${btn("justifyRight", "Align right", RTE_ICONS.right)}
          ${btn("justifyFull", "Justify", RTE_ICONS.justify)}
          ${btn("pop:spacing", "Line spacing", RTE_ICONS.spacing)}
        </div>
        <div class="rte-group">
          ${btn("insertUnorderedList", "Bulleted list", RTE_ICONS.ul)}
          ${btn("insertOrderedList", "Numbered list", RTE_ICONS.ol)}
          ${btn("outdent", "Decrease indent", RTE_ICONS.outdent)}
          ${btn("indent", "Increase indent", RTE_ICONS.indent)}
        </div>
        <div class="rte-group">
          ${btn("pop:link", "Link (Ctrl+K)", RTE_ICONS.link)}
          ${btn("pop:table", "Table", RTE_ICONS.table)}
          ${btn("footnote", "Footnote", RTE_ICONS.footnote)}
          ${btn("hr", "Horizontal line", RTE_ICONS.hr)}
          ${btn("pop:special", "Special characters (Greek, Hebrew…)", RTE_ICONS.omega)}
          ${btn("titleblock", "Title block (name, professor, course, date)", RTE_ICONS.titleblock)}
        </div>
        <div class="rte-group">
          <button type="button" class="rte-btn rte-scripture-btn" data-cmd="pop:scripture" title="Insert Scripture (KJV)">${RTE_ICONS.bible}<span>Scripture</span></button>
        </div>
        <div class="rte-group rte-group-end">
          ${btn("pop:find", "Find & replace (Ctrl+F)", RTE_ICONS.find)}
          ${btn("clear", "Clear formatting", RTE_ICONS.clear)}
          ${btn("print", "Print or save as PDF", RTE_ICONS.print)}
          ${btn("full", "Full screen", RTE_ICONS.full)}
        </div>
      </div>
      <div class="rte-tablebar" hidden>
        <span>Table:</span>
        <button type="button" data-tbl="rowAbove">+ Row above</button>
        <button type="button" data-tbl="rowBelow">+ Row below</button>
        <button type="button" data-tbl="colLeft">+ Column left</button>
        <button type="button" data-tbl="colRight">+ Column right</button>
        <button type="button" data-tbl="header">Header row</button>
        <button type="button" data-tbl="delRow">Delete row</button>
        <button type="button" data-tbl="delCol">Delete column</button>
        <button type="button" data-tbl="delTable" class="danger">Delete table</button>
      </div>
      <div class="rte-draftbar" hidden></div>
      <div class="rte-body">
        <div class="rte-page-wrap">
          <div class="rte-page doc-content" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Your assignment" spellcheck="true" lang="en"></div>
        </div>
        <div class="rte-pop" hidden></div>
      </div>
      <div class="rte-status">
        <span class="rte-count">0 words</span>
        <span class="rte-draft-status"></span>
      </div>
    </div>`;

  const root = container.querySelector(".rte");
  const page = root.querySelector(".rte-page");
  const pop = root.querySelector(".rte-pop");
  const tablebar = root.querySelector(".rte-tablebar");
  const draftbar = root.querySelector(".rte-draftbar");
  const countEl = root.querySelector(".rte-count");
  const draftEl = root.querySelector(".rte-draft-status");
  let savedRange = null;
  let popKind = null;
  let dirty = false;

  page.innerHTML = opts.html ? safeHtml(opts.html) : "";
  ensureParagraph();
  try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) { /* older browsers */ }

  // --- selection helpers ---------------------------------------------------
  function inPage(node) { return node && (node === page || page.contains(node)); }
  function saveRange() {
    const sel = window.getSelection();
    if (sel.rangeCount && inPage(sel.getRangeAt(0).commonAncestorContainer)) savedRange = sel.getRangeAt(0).cloneRange();
  }
  function restoreRange() {
    page.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (savedRange && inPage(savedRange.commonAncestorContainer)) { sel.removeAllRanges(); sel.addRange(savedRange); }
    else if (!sel.rangeCount || !inPage(sel.getRangeAt(0).commonAncestorContainer)) {
      const r = document.createRange(); r.selectNodeContents(page); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
    }
  }
  function currentRange() {
    const sel = window.getSelection();
    return sel.rangeCount && inPage(sel.getRangeAt(0).commonAncestorContainer) ? sel.getRangeAt(0) : null;
  }
  function closestIn(node, selector) {
    let n = node && node.nodeType === 3 ? node.parentNode : node;
    while (n && n !== page) { if (n.matches && n.matches(selector)) return n; n = n.parentNode; }
    return null;
  }
  function selectedBlocks() {
    const r = currentRange();
    if (!r) return [];
    const start = closestIn(r.startContainer, RTE_BLOCKS);
    const all = [...page.querySelectorAll("p,h1,h2,h3,h4,li,blockquote > p,div")].filter((b) => !b.querySelector("p,h1,h2,h3,h4,li,div,table"));
    const hit = all.filter((b) => r.intersectsNode(b));
    if (hit.length) return hit;
    return start ? [start] : [];
  }
  function ensureParagraph() {
    if (!page.innerHTML.trim() || page.innerHTML === "<br>") page.innerHTML = "<p><br></p>";
    // Wrap stray top-level text so styles and spacing apply to real paragraphs.
    [...page.childNodes].forEach((n) => {
      if (n.nodeType === 3 && n.textContent.trim()) { const p = document.createElement("p"); n.replaceWith(p); p.appendChild(n); }
    });
  }
  function exec(cmd, val = null) {
    restoreRange();
    document.execCommand(cmd, false, val);
    changed();
  }
  function insertHtml(html) {
    restoreRange();
    document.execCommand("insertHTML", false, html);
    changed();
  }

  // Font family / size: the browser's own commands make <font> tags, which
  // are swapped for clean inline styles right away.
  function applyInlineStyle(prop, value) {
    restoreRange();
    const r = currentRange();
    if (!r || r.collapsed) { toast("Select some text first, then choose the " + (prop === "fontFamily" ? "font." : "size."), "success"); return; }
    try { document.execCommand("styleWithCSS", false, false); } catch (e) { /* fine */ }
    document.execCommand("fontName", false, "rte-mark");
    page.querySelectorAll('font[face="rte-mark"], span[style*="rte-mark"]').forEach((f) => {
      const span = document.createElement("span");
      if (value) span.style[prop] = value;
      while (f.firstChild) span.appendChild(f.firstChild);
      // Clear the same style from anything nested inside so the new one wins.
      span.querySelectorAll("span").forEach((s) => { s.style[prop] = ""; if (!s.getAttribute("style")) s.removeAttribute("style"); });
      if (span.getAttribute("style")) f.replaceWith(span); else f.replaceWith(...span.childNodes);
    });
    changed();
  }

  // Line spacing and indentation act on whole paragraphs.
  function setBlockStyle(prop, value) {
    restoreRange();
    const blocks = selectedBlocks();
    if (!blocks.length) return;
    blocks.forEach((b) => { b.style[prop] = value; if (!b.getAttribute("style")) b.removeAttribute("style"); });
    changed();
  }
  function indentBlocks(dir) {
    restoreRange();
    const r = currentRange();
    if (r && closestIn(r.startContainer, "li")) { document.execCommand(dir > 0 ? "indent" : "outdent"); changed(); return; }
    selectedBlocks().forEach((b) => {
      const cur = parseInt(b.style.marginLeft, 10) || 0;
      const next = Math.max(0, Math.min(240, cur + dir * 40));
      b.style.marginLeft = next ? next + "px" : "";
      if (!b.getAttribute("style")) b.removeAttribute("style");
    });
    changed();
  }

  // --- footnotes -------------------------------------------------------------
  function renumberFootnotes() {
    const refs = [...page.querySelectorAll("sup.fn-ref[data-fn]")];
    let list = page.querySelector("ol.footnotes");
    if (!refs.length) {
      if (list) { const sep = list.previousElementSibling; if (sep && sep.matches("hr.fn-sep")) sep.remove(); list.remove(); }
      return;
    }
    if (!list) {
      list = document.createElement("ol"); list.className = "footnotes";
      const sep = document.createElement("hr"); sep.className = "fn-sep";
      page.appendChild(sep); page.appendChild(list);
    }
    const items = {};
    [...list.children].forEach((li) => { if (li.dataset.fn) items[li.dataset.fn] = li; });
    refs.forEach((ref, i) => {
      if (ref.textContent !== String(i + 1)) ref.textContent = String(i + 1);
      let li = items[ref.dataset.fn];
      if (!li) { li = document.createElement("li"); li.dataset.fn = ref.dataset.fn; li.innerHTML = "<br>"; }
      list.appendChild(li); // re-appending puts them in reference order
      delete items[ref.dataset.fn];
    });
    Object.values(items).forEach((li) => li.remove());
  }
  function addFootnote() {
    restoreRange();
    const key = "f" + Date.now().toString(36);
    document.execCommand("insertHTML", false, `<sup class="fn-ref" data-fn="${key}">#</sup>&#8203;`);
    renumberFootnotes();
    const li = page.querySelector(`ol.footnotes li[data-fn="${key}"]`);
    if (li) {
      const r = document.createRange(); r.selectNodeContents(li); r.collapse(true);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      li.scrollIntoView({ block: "nearest" });
    }
    changed();
  }

  // --- tables --------------------------------------------------------------
  function tableCell() { const r = currentRange(); return r ? closestIn(r.startContainer, "td,th") : null; }
  function tableOp(op) {
    const cell = tableCell();
    if (!cell) return;
    const row = cell.parentNode, table = closestIn(row, "table");
    const ci = [...row.children].indexOf(cell);
    const rows = [...table.querySelectorAll("tr")];
    const newCell = (tag) => { const c = document.createElement(tag); c.innerHTML = "<br>"; return c; };
    if (op === "rowAbove" || op === "rowBelow") {
      const nr = document.createElement("tr");
      [...row.children].forEach(() => nr.appendChild(newCell("td")));
      row.parentNode.insertBefore(nr, op === "rowAbove" ? row : row.nextSibling);
    } else if (op === "colLeft" || op === "colRight") {
      rows.forEach((tr) => { const ref = tr.children[ci]; const c = newCell(ref && ref.tagName === "TH" ? "th" : "td"); tr.insertBefore(c, op === "colLeft" ? ref : ref ? ref.nextSibling : null); });
    } else if (op === "header") {
      const first = rows[0];
      const toTh = first.firstElementChild && first.firstElementChild.tagName === "TD";
      [...first.children].forEach((c) => { const n = document.createElement(toTh ? "th" : "td"); n.innerHTML = c.innerHTML; c.replaceWith(n); });
    } else if (op === "delRow") {
      if (rows.length <= 1) table.remove(); else row.remove();
    } else if (op === "delCol") {
      if (row.children.length <= 1) table.remove(); else rows.forEach((tr) => tr.children[ci] && tr.children[ci].remove());
    } else if (op === "delTable") table.remove();
    ensureParagraph();
    changed();
    updateState();
  }
  function insertTable(r, c) {
    const head = `<tr>${Array.from({ length: c }, () => "<th><br></th>").join("")}</tr>`;
    const body = Array.from({ length: r - 1 }, () => `<tr>${Array.from({ length: c }, () => "<td><br></td>").join("")}</tr>`).join("");
    insertHtml(`<table class="rte-table"><tbody>${head}${body}</tbody></table><p><br></p>`);
  }

  // --- popovers --------------------------------------------------------------
  function closePop() { pop.hidden = true; pop.innerHTML = ""; popKind = null; root.classList.remove("rte-pop-open"); root.querySelectorAll('[data-cmd^="pop:"]').forEach((b) => b.classList.remove("active")); }
  function openPop(kind, html, wide) {
    popKind = kind;
    pop.innerHTML = `<div class="rte-pop-head"><strong>${{ color: "Text color", hilite: "Highlight", spacing: "Line spacing", link: "Link", table: "Insert a table", special: "Special characters", find: "Find & replace", scripture: "Insert Scripture (KJV)" }[kind]}</strong><button type="button" class="rte-pop-close" aria-label="Close">×</button></div>${html}`;
    pop.hidden = false;
    pop.classList.toggle("rte-pop-wide", !!wide);
    root.classList.add("rte-pop-open");
    root.querySelectorAll('[data-cmd^="pop:"]').forEach((b) => b.classList.toggle("active", b.dataset.cmd === "pop:" + kind));
    pop.querySelector(".rte-pop-close").addEventListener("click", () => { closePop(); restoreRange(); });
  }
  function swatches(list, cmd) {
    return `<div class="rte-swatches">${list.map((c) => `<button type="button" class="rte-swatch" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}
      <button type="button" class="rte-swatch rte-swatch-none" data-color="" aria-label="None">✕</button></div>`;
  }
  function showPop(kind) {
    if (popKind === kind) { closePop(); return; }
    saveRange();
    if (kind === "color" || kind === "hilite") {
      openPop(kind, swatches(kind === "color" ? RTE_COLORS : RTE_HILITES));
      pop.querySelectorAll("[data-color]").forEach((s) => s.addEventListener("click", () => {
        restoreRange();
        try { document.execCommand("styleWithCSS", false, true); } catch (e) { /* fine */ }
        if (kind === "color") document.execCommand("foreColor", false, s.dataset.color || "#142033");
        else document.execCommand("hiliteColor", false, s.dataset.color || "transparent");
        try { document.execCommand("styleWithCSS", false, false); } catch (e) { /* fine */ }
        changed(); closePop();
      }));
    } else if (kind === "spacing") {
      openPop(kind, `<div class="rte-list">${[["", "Single"], ["1.15", "1.15"], ["1.5", "1.5"], ["2", "Double"]].map(([v, l]) => `<button type="button" data-lh="${v}">${l}</button>`).join("")}
        <button type="button" data-lh-all="2">Double-space the whole paper</button><button type="button" data-lh-all="">Single-space the whole paper</button></div>`);
      pop.querySelectorAll("[data-lh]").forEach((b) => b.addEventListener("click", () => { setBlockStyle("lineHeight", b.dataset.lh); closePop(); }));
      pop.querySelectorAll("[data-lh-all]").forEach((b) => b.addEventListener("click", () => {
        page.querySelectorAll("p,h1,h2,h3,h4,li").forEach((el) => { el.style.lineHeight = b.dataset.lhAll; if (!el.getAttribute("style")) el.removeAttribute("style"); });
        changed(); closePop();
      }));
    } else if (kind === "link") {
      const r = savedRange;
      const a = r ? closestIn(r.startContainer, "a") : null;
      const text = a ? a.textContent : r ? r.toString() : "";
      openPop(kind, `
        <label>Web address</label><input type="text" class="rte-in" id="${id}-url" placeholder="https://" value="${a ? esc(a.getAttribute("href")) : ""}" inputmode="url">
        ${!r || r.collapsed ? `<label>Text to show</label><input type="text" class="rte-in" id="${id}-ltext" value="${esc(text)}">` : ""}
        <div class="rte-pop-actions"><button type="button" class="btn btn-primary btn-sm" id="${id}-lok">${a ? "Update link" : "Add link"}</button>${a ? `<button type="button" class="btn btn-ghost btn-sm" id="${id}-lrm">Remove link</button>` : ""}</div>`);
      const url = pop.querySelector(`#${id}-url`); url.focus();
      const ok = () => {
        let u = url.value.trim();
        if (!u) return;
        if (!/^(https?:|mailto:)/i.test(u)) u = (/@/.test(u) && !/\//.test(u) ? "mailto:" : "https://") + u;
        const t = pop.querySelector(`#${id}-ltext`);
        closePop();
        if (a) { a.setAttribute("href", u); changed(); return; }
        if (t) insertHtml(`<a href="${esc(u)}">${esc(t.value.trim() || u)}</a>&nbsp;`);
        else exec("createLink", u);
      };
      pop.querySelector(`#${id}-lok`).addEventListener("click", ok);
      url.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } });
      const rm = pop.querySelector(`#${id}-lrm`);
      if (rm) rm.addEventListener("click", () => { const r2 = document.createRange(); r2.selectNodeContents(a); savedRange = r2; closePop(); exec("unlink"); });
    } else if (kind === "table") {
      openPop(kind, `<div class="rte-grid" id="${id}-grid">${Array.from({ length: 36 }, (_, i) => `<span data-r="${Math.floor(i / 6) + 1}" data-c="${(i % 6) + 1}"></span>`).join("")}</div><div class="field-hint" id="${id}-gl">Choose a size</div>`);
      const grid = pop.querySelector(`#${id}-grid`), gl = pop.querySelector(`#${id}-gl`);
      grid.querySelectorAll("span").forEach((s) => {
        s.addEventListener("mouseenter", () => {
          grid.querySelectorAll("span").forEach((x) => x.classList.toggle("on", +x.dataset.r <= +s.dataset.r && +x.dataset.c <= +s.dataset.c));
          gl.textContent = `${s.dataset.r} × ${s.dataset.c} (first row is a header)`;
        });
        s.addEventListener("click", () => { closePop(); insertTable(Math.max(2, +s.dataset.r), +s.dataset.c); });
      });
    } else if (kind === "special") {
      openPop(kind, Object.entries(RTE_SPECIAL).map(([g, chars]) => `<div class="rte-special-group"><div class="rte-special-label">${g}</div><div class="rte-special">${chars.map((ch) => `<button type="button" data-ch="${esc(ch)}" ${g === "Hebrew" ? 'lang="he"' : g === "Greek" ? 'lang="grc"' : ""}>${esc(ch)}</button>`).join("")}</div></div>`).join(""), true);
      pop.querySelectorAll("[data-ch]").forEach((b) => b.addEventListener("click", () => {
        restoreRange(); document.execCommand("insertText", false, b.dataset.ch); saveRange(); changed();
      }));
    } else if (kind === "find") {
      showFind();
    } else if (kind === "scripture") {
      showScripture();
    }
  }

  // --- find & replace ----------------------------------------------------------
  function textNodes() {
    const out = [];
    const w = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  }
  function showFind() {
    const sel = savedRange && !savedRange.collapsed ? savedRange.toString() : "";
    openPop("find", `
      <label>Find</label><input type="text" class="rte-in" id="${id}-f" value="${esc(sel)}">
      <label>Replace with</label><input type="text" class="rte-in" id="${id}-rp">
      <label class="rte-check"><input type="checkbox" id="${id}-mc"> Match case</label>
      <div class="rte-pop-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="${id}-fn">Find next</button>
        <button type="button" class="btn btn-ghost btn-sm" id="${id}-r1">Replace</button>
        <button type="button" class="btn btn-primary btn-sm" id="${id}-ra">Replace all</button>
      </div>
      <div class="field-hint" id="${id}-fc"></div>`);
    const f = pop.querySelector(`#${id}-f`), rp = pop.querySelector(`#${id}-rp`), mc = pop.querySelector(`#${id}-mc`), fc = pop.querySelector(`#${id}-fc`);
    f.focus(); f.select();
    let last = null;
    const matches = () => {
      const q = f.value;
      if (!q) return [];
      const flags = mc.checked ? "g" : "gi";
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
      const out = [];
      textNodes().forEach((n) => { let m; re.lastIndex = 0; while ((m = re.exec(n.data))) { out.push({ n, i: m.index, len: m[0].length }); if (!m[0].length) break; } });
      return out;
    };
    const count = () => { const n = matches().length; fc.textContent = f.value ? `${n} match${n === 1 ? "" : "es"}` : ""; return n; };
    const select = (m) => {
      const r = document.createRange(); r.setStart(m.n, m.i); r.setEnd(m.n, m.i + m.len);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); savedRange = r.cloneRange();
      const el = m.n.parentNode; if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
      last = m;
    };
    const next = () => {
      const ms = matches();
      if (!ms.length) { count(); return; }
      let idx = 0;
      if (last) {
        const pos = (m) => textNodes().indexOf(m.n) * 1e6 + m.i;
        const cur = pos(last);
        idx = ms.findIndex((m) => pos(m) > cur);
        if (idx < 0) idx = 0;
      }
      select(ms[idx]);
      fc.textContent = `${idx + 1} of ${ms.length}`;
    };
    f.addEventListener("input", () => { last = null; count(); });
    mc.addEventListener("change", () => { last = null; count(); });
    f.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); next(); } });
    pop.querySelector(`#${id}-fn`).addEventListener("click", next);
    pop.querySelector(`#${id}-r1`).addEventListener("click", () => {
      const s = window.getSelection();
      const ok = last && s.rangeCount && s.toString() && (mc.checked ? s.toString() === f.value : s.toString().toLowerCase() === f.value.toLowerCase());
      if (ok) { page.focus({ preventScroll: true }); s.removeAllRanges(); s.addRange(savedRange); document.execCommand("insertText", false, rp.value); changed(); last = null; }
      next();
    });
    pop.querySelector(`#${id}-ra`).addEventListener("click", () => {
      const ms = matches();
      if (!ms.length) { count(); return; }
      // Replace from the end so earlier positions stay valid.
      ms.reverse().forEach((m) => { m.n.data = m.n.data.slice(0, m.i) + rp.value + m.n.data.slice(m.i + m.len); });
      changed();
      fc.textContent = `Replaced ${ms.length}.`;
      last = null;
    });
    count();
  }

  // --- Scripture --------------------------------------------------------------
  let scripture = { q: "", passages: null, results: null, format: "block", numbers: true, kjv: true };
  function showScripture() {
    openPop("scripture", `
      <form class="rte-scr-form" id="${id}-sf">
        <input type="search" class="rte-in" id="${id}-sq" placeholder="John 3:16-18  ·  Rom 8:28, 31  ·  or words: born again" value="${esc(scripture.q)}" autocomplete="off" spellcheck="false" aria-label="Reference or words">
        <button class="btn btn-primary btn-sm" type="submit">Look up</button>
      </form>
      <div class="rte-scr-body" id="${id}-sb"><p class="field-hint">Type a reference to quote it, or a few words to find the verse. Any book, chapter, or verse of the King James Bible.</p></div>
      <div class="rte-scr-opts">
        <div class="rte-seg" role="radiogroup" aria-label="How to insert">
          <label><input type="radio" name="${id}-fmt" value="block" ${scripture.format === "block" ? "checked" : ""}> Block quote</label>
          <label><input type="radio" name="${id}-fmt" value="inline" ${scripture.format === "inline" ? "checked" : ""}> In my sentence</label>
          <label><input type="radio" name="${id}-fmt" value="ref" ${scripture.format === "ref" ? "checked" : ""}> Reference only</label>
        </div>
        <label class="rte-check"><input type="checkbox" id="${id}-sn" ${scripture.numbers ? "checked" : ""}> Verse numbers</label>
        <label class="rte-check"><input type="checkbox" id="${id}-sk" ${scripture.kjv ? "checked" : ""}> Add “KJV”</label>
        <button type="button" class="btn btn-gold btn-sm" id="${id}-si" disabled>Insert</button>
      </div>`, true);
    const q = pop.querySelector(`#${id}-sq`), body = pop.querySelector(`#${id}-sb`), ins = pop.querySelector(`#${id}-si`);
    q.focus();
    pop.querySelectorAll(`input[name="${id}-fmt"]`).forEach((r) => r.addEventListener("change", () => { scripture.format = r.value; }));
    pop.querySelector(`#${id}-sn`).addEventListener("change", (e) => { scripture.numbers = e.target.checked; drawPreview(); });
    pop.querySelector(`#${id}-sk`).addEventListener("change", (e) => { scripture.kjv = e.target.checked; });
    const drawPreview = () => {
      if (!scripture.passages) return;
      body.innerHTML = scripture.passages.map((p) => `
        <div class="rte-scr-passage">
          <div class="rte-scr-ref">${esc(p.label)}</div>
          <p>${p.verses.map((v) => `${scripture.numbers ? `<sup>${p.verses.length > 1 || p.verses[0].v ? (p.verses.some((x) => x.c !== p.verses[0].c) ? `${v.c}:${v.v}` : v.v) : ""}</sup>` : ""}${esc(kjvPlain(v.text))}`).join(" ")}</p>
        </div>`).join("") + (scripture.results ? `<button type="button" class="btn btn-ghost btn-sm" id="${id}-sback">&larr; Back to results</button>` : "");
      ins.disabled = false;
      const back = pop.querySelector(`#${id}-sback`);
      if (back) back.addEventListener("click", () => { scripture.passages = null; ins.disabled = true; drawResults(); });
    };
    const drawResults = () => {
      const res = scripture.results;
      body.innerHTML = res.hits.length
        ? `<div class="field-hint">${res.hits.length.toLocaleString()} verse${res.hits.length === 1 ? "" : "s"} — tap one to use it${res.hits.length > 60 ? " (first 60 shown — add a word to narrow it)" : ""}.</div>` +
          res.hits.slice(0, 60).map((o) => { const r = bibleFromOrdinal(o); return `<button type="button" class="rte-scr-hit" data-o="${o}"><strong>${esc(bibleRefLabel(r.book, r.c, r.v))}</strong> ${markMatches(BIBLE.plain[o], res.q, "all")}</button>`; }).join("")
        : `<p>No verses contain all of those words. Try fewer words, or a word ending like <strong>believ*</strong>.</p>`;
      body.querySelectorAll("[data-o]").forEach((b) => b.addEventListener("click", () => {
        const r = bibleFromOrdinal(parseInt(b.dataset.o, 10));
        biblePassages([{ book: r.book, c1: r.c, v1: r.v, c2: r.c, v2: r.v }]).then((ps) => { scripture.passages = ps; drawPreview(); });
      }));
    };
    if (scripture.passages) drawPreview(); else if (scripture.results) drawResults();
    pop.querySelector(`#${id}-sf`).addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = q.value.trim();
      if (!text) return;
      scripture.q = text;
      scripture.passages = null; scripture.results = null; ins.disabled = true;
      body.innerHTML = `<p class="sb-loading">Looking it up…</p>`;
      try {
        const ref = parseBibleReference(text);
        if (ref) {
          const ps = await biblePassages(ref);
          if (!ps.length) { body.innerHTML = `<p>That reference isn't in the Bible — check the chapter and verse.</p>`; return; }
          const total = ps.reduce((n, p) => n + p.verses.length, 0);
          if (total > 120) { body.innerHTML = `<p>That's ${total} verses — choose a shorter passage (up to 120 verses).</p>`; return; }
          scripture.passages = ps;
          drawPreview();
        } else {
          const hits = await bibleSearch(text, "all", "all");
          scripture.results = { q: text, hits };
          drawResults();
        }
      } catch (err) { body.innerHTML = `<div class="warning-box">${icon("warning")}<p>${esc(err.message)}</p></div>`; }
    });
    ins.addEventListener("click", () => {
      if (!scripture.passages) return;
      const tag = scripture.kjv ? ", KJV" : "";
      let html = "";
      scripture.passages.forEach((p) => {
        const multiCh = p.verses.some((x) => x.c !== p.verses[0].c);
        const vtext = (v) => (scripture.numbers && p.verses.length > 1 ? `<sup>${multiCh ? v.c + ":" + v.v : v.v}</sup>` : "") + esc(kjvPlain(v.text));
        if (scripture.format === "block") {
          html += `<blockquote class="scripture"><p>${p.verses.map(vtext).join(" ")}</p><p class="scripture-ref">— ${esc(p.label)}${scripture.kjv ? " (KJV)" : ""}</p></blockquote>`;
        } else if (scripture.format === "inline") {
          html += `“${p.verses.map(vtext).join(" ")}” (${esc(p.label)}${tag})&nbsp;`;
        } else {
          html += `${esc(p.label)}${scripture.kjv ? " (KJV)" : ""}&nbsp;`;
        }
      });
      if (scripture.format === "block") html += "<p><br></p>";
      closePop();
      insertHtml(html);
      toast("Scripture inserted.", "success");
    });
  }

  // --- title block ------------------------------------------------------------
  function insertTitleBlock() {
    const d = new Date();
    const date = `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "long" })} ${d.getFullYear()}`;
    const lines = [ctx.student, ctx.teacher ? (/^(pastor|dr\.?|professor|bro\.?|brother|rev\.?)\b/i.test(ctx.teacher) ? ctx.teacher : "Professor " + ctx.teacher) : "", ctx.course, date].filter(Boolean);
    const html = `<div class="title-block">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div><h1 style="text-align: center;">${esc(ctx.assignment || "Title")}</h1><p><br></p>`;
    const r = document.createRange(); r.setStart(page, 0); r.collapse(true); savedRange = r;
    if (page.textContent.trim() === "") page.innerHTML = "";
    insertHtml(html);
  }

  // --- print / save as PDF -----------------------------------------------------
  function printDoc() {
    const pa = document.getElementById("printArea");
    pa.innerHTML = `<div class="doc-content rte-print">${safeHtml(page.innerHTML)}</div>`;
    const clear = () => { pa.innerHTML = ""; window.removeEventListener("afterprint", clear); };
    window.addEventListener("afterprint", clear);
    window.print();
  }

  // --- full screen -----------------------------------------------------------
  function toggleFull(force) {
    const on = force !== undefined ? force : !root.classList.contains("rte-full");
    root.classList.toggle("rte-full", on);
    document.body.classList.toggle("rte-full-open", on);
    const b = root.querySelector('[data-cmd="full"]');
    b.innerHTML = on ? RTE_ICONS.exitfull : RTE_ICONS.full;
    b.title = on ? "Exit full screen" : "Full screen";
    page.focus({ preventScroll: true });
  }

  // --- toolbar wiring ----------------------------------------------------------
  root.querySelector(".rte-toolbar").addEventListener("mousedown", (e) => {
    // Keep the text selection when pressing toolbar buttons.
    if (e.target.closest("button")) e.preventDefault();
  });
  root.querySelectorAll(".rte-toolbar [data-cmd]").forEach((b) => b.addEventListener("click", () => {
    const cmd = b.dataset.cmd;
    if (cmd.startsWith("pop:")) return showPop(cmd.slice(4));
    closePop();
    if (cmd === "footnote") return addFootnote();
    if (cmd === "hr") return insertHtml("<hr><p><br></p>");
    if (cmd === "titleblock") return insertTitleBlock();
    if (cmd === "print") return printDoc();
    if (cmd === "full") return toggleFull();
    if (cmd === "indent") return indentBlocks(1);
    if (cmd === "outdent") return indentBlocks(-1);
    if (cmd === "clear") {
      exec("removeFormat");
      selectedBlocks().forEach((bl) => bl.removeAttribute("style"));
      exec("formatBlock", "<p>");
      return;
    }
    exec(cmd);
    updateState();
  }));
  root.querySelector('[data-sel="block"]').addEventListener("change", (e) => {
    const v = e.target.value;
    if (v === "blockquote") {
      restoreRange();
      const r = currentRange();
      const bq = r && closestIn(r.startContainer, "blockquote");
      if (bq) { [...bq.childNodes].forEach((n) => bq.parentNode.insertBefore(n, bq)); bq.remove(); changed(); }
      else exec("formatBlock", "<blockquote>");
    } else exec("formatBlock", `<${v}>`);
    updateState();
  });
  root.querySelector('[data-sel="font"]').addEventListener("change", (e) => applyInlineStyle("fontFamily", e.target.value));
  root.querySelector('[data-sel="size"]').addEventListener("change", (e) => applyInlineStyle("fontSize", e.target.value));
  root.querySelectorAll(".rte-select").forEach((s) => s.addEventListener("mousedown", saveRange));
  root.querySelectorAll(".rte-select").forEach((s) => s.addEventListener("focus", saveRange));
  root.querySelectorAll("[data-tbl]").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => tableOp(b.dataset.tbl));
  });

  // Toolbar shows what's on at the cursor.
  function updateState() {
    const r = currentRange();
    if (!r) return;
    ["bold", "italic", "underline", "strikeThrough", "superscript", "subscript", "insertUnorderedList", "insertOrderedList", "justifyLeft", "justifyCenter", "justifyRight", "justifyFull"].forEach((c) => {
      const b = root.querySelector(`[data-cmd="${c}"]`);
      let on = false;
      try { on = document.queryCommandState(c); } catch (e) { /* fine */ }
      if (b) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }
    });
    const blk = closestIn(r.startContainer, "h1,h2,h3,h4,blockquote,p,li");
    const tag = blk ? (closestIn(r.startContainer, "blockquote") ? "blockquote" : blk.tagName.toLowerCase()) : "p";
    const sel = root.querySelector('[data-sel="block"]');
    sel.value = ["h1", "h2", "h3", "h4", "blockquote"].includes(tag) ? tag : "p";
    tablebar.hidden = !closestIn(r.startContainer, "table");
  }

  // --- typing, pasting, keys ----------------------------------------------------
  let countTimer = null, draftTimer = null, fnTimer = null;
  function wordCount() {
    const t = page.innerText || "";
    const words = (t.match(/[A-Za-z0-9Ͱ-Ͽ֐-׿À-ɏ'’-]+/g) || []).length;
    const chars = t.replace(/\s/g, "").length;
    countEl.textContent = `${words.toLocaleString()} word${words === 1 ? "" : "s"} · ${chars.toLocaleString()} characters · ${Math.max(1, Math.round(words / 230))} min read`;
  }
  function changed() {
    dirty = true;
    clearTimeout(countTimer); countTimer = setTimeout(wordCount, 150);
    clearTimeout(fnTimer); fnTimer = setTimeout(() => { if (page.querySelector("sup.fn-ref, ol.footnotes")) renumberFootnotes(); }, 400);
    if (opts.draftKey) { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 1200); }
  }
  page.addEventListener("input", () => { if (!page.firstChild) ensureParagraph(); changed(); });
  page.addEventListener("keyup", () => { saveRange(); updateState(); });
  page.addEventListener("mouseup", () => { saveRange(); updateState(); });
  page.addEventListener("focus", updateState);
  document.addEventListener("selectionchange", function onSel() {
    if (!document.body.contains(root)) { document.removeEventListener("selectionchange", onSel); return; }
    if (currentRange()) { saveRange(); updateState(); }
  });
  page.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); showPop("link"); return; }
    if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); saveRange(); showPop("find"); return; }
    if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); document.execCommand("redo"); changed(); return; }
    if (e.key === "Tab") {
      const r = currentRange();
      const cell = r && closestIn(r.startContainer, "td,th");
      if (cell) {
        e.preventDefault();
        const cells = [...closestIn(cell, "table").querySelectorAll("td,th")];
        let i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
        if (i >= cells.length) { tableOp("rowBelow"); i = cells.length; }
        const all = [...closestIn(cell, "table").querySelectorAll("td,th")];
        const target = all[Math.max(0, i)];
        const nr = document.createRange(); nr.selectNodeContents(target); nr.collapse(false);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(nr);
        return;
      }
      if (r && closestIn(r.startContainer, "li")) { e.preventDefault(); document.execCommand(e.shiftKey ? "outdent" : "indent"); changed(); return; }
      e.preventDefault();
      if (!e.shiftKey) document.execCommand("insertText", false, "  ");
      return;
    }
    if (e.key === "Escape" && root.classList.contains("rte-full") && !popKind) { e.stopPropagation(); toggleFull(false); }
  });
  // Pasted text from Word, Google Docs, or a web page keeps its plain
  // formatting (bold, lists, headings…) but none of the clutter.
  page.addEventListener("paste", (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const html = cd.getData("text/html");
    const text = cd.getData("text/plain");
    e.preventDefault();
    if (html) {
      const cleaned = safeHtml(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<o:p>\s*<\/o:p>/g, ""));
      document.execCommand("insertHTML", false, cleaned);
    } else if (text) {
      const paras = text.replace(/\r/g, "").split(/\n{2,}/);
      if (paras.length > 1) document.execCommand("insertHTML", false, paras.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join(""));
      else document.execCommand("insertText", false, text);
    }
    changed();
  });
  page.addEventListener("drop", (e) => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); toast("To include a file, use “Attach a File” instead."); } });
  page.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a && (e.ctrlKey || e.metaKey)) window.open(a.href, "_blank", "noopener");
  });

  // --- the draft kept on this device ------------------------------------------
  function readDraft() {
    if (!opts.draftKey) return null;
    try { return JSON.parse(localStorage.getItem(opts.draftKey) || "null"); } catch (e) { return null; }
  }
  function saveDraft() {
    if (!opts.draftKey) return;
    try {
      localStorage.setItem(opts.draftKey, JSON.stringify({ html: page.innerHTML, at: Date.now() }));
      draftEl.textContent = `Draft kept on this device · ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    } catch (e) { draftEl.textContent = ""; }
  }
  function clearDraft() { if (opts.draftKey) try { localStorage.removeItem(opts.draftKey); } catch (e) { /* fine */ } }
  const draft = readDraft();
  const savedAt = opts.savedAt ? new Date(opts.savedAt).getTime() : 0;
  if (draft && draft.html && safeHtml(draft.html) !== safeHtml(page.innerHTML) && draft.at > savedAt && (draft.html.replace(/<[^>]+>/g, "").trim())) {
    draftbar.hidden = false;
    draftbar.innerHTML = `<span>You have unsaved writing on this device from ${new Date(draft.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.</span>
      <button type="button" class="btn btn-gold btn-sm" data-draft="restore">Restore it</button>
      <button type="button" class="btn btn-ghost btn-sm" data-draft="discard">Discard</button>`;
    draftbar.querySelector('[data-draft="restore"]').addEventListener("click", () => { page.innerHTML = safeHtml(draft.html); ensureParagraph(); draftbar.hidden = true; changed(); });
    draftbar.querySelector('[data-draft="discard"]').addEventListener("click", () => { clearDraft(); draftbar.hidden = true; });
  }
  wordCount();

  return {
    root,
    page,
    getHtml() {
      renumberFootnotes();
      const clone = page.cloneNode(true);
      clone.querySelectorAll("p").forEach((p) => { if (!p.textContent.trim() && !p.querySelector("img,br,hr")) p.remove(); });
      return safeHtml(clone.innerHTML.replace(/​/g, "").trim());
    },
    isEmpty() { return !page.textContent.replace(/​/g, "").trim(); },
    isDirty() { return dirty; },
    focus() { page.focus(); },
    clearDraft,
    exitFull() { if (root.classList.contains("rte-full")) toggleFull(false); },
  };
}
