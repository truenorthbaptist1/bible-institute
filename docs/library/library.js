// ============================================================================
// Church Library checkout (Oct 15, 2026)
//
// The page a QR code by the church library opens. No sign-in: the first time,
// a borrower types their name and email; the phone keeps a private key so it
// remembers them (and shows "My books" next time). Books are found by
// scanning the barcode or typing the title. Everything goes through the
// library_* database functions — this page can't read anyone else's records.
// ============================================================================
(function () {
  "use strict";
  const CFG = window.TNBBI_CONFIG || {};
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const KEY = "tnbc-library-key", ME = "tnbc-library-me";
  const BARCODE_LIB = "https://cdn.jsdelivr.net/npm/barcode-detector@3.1.3/dist/iife/ponyfill.js";
  const app = document.getElementById("app");

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
  };
  let me = (() => { try { return JSON.parse(store.get(ME) || "null"); } catch (e) { return null; } })() || { name: "", email: "" };
  let key = store.get(KEY);
  let mine = null;          // { name, email, books: [...] } from the database
  let bag = [];             // books chosen to take home
  let newBook = null;       // the "not on our list" form, when open
  let done = null;          // result of a checkout
  let notice = null;        // { kind: "ok"|"err", text }
  let renewNote = null;     // result of a renew link from an email
  let editingMe = !key || !me.name;
  let busy = false;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const ICON = {
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M16.5 8v8"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/></svg>',
  };

  // A book's cover (library/covers/… on this site), or nothing.
  function coverImg(path, cls = "lb-thumb") {
    if (!path || !/^library\/covers\/[0-9a-f]{8}\.jpg$/.test(path)) return "";
    return `<img class="${cls}" src="/${path}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`;
  }
  function dueText(d) {
    const [y, m, day] = String(d).split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
  // "Checked out · due back Thursday, Oct 29" for a book whose every copy is out.
  function availability(r) {
    if (!r || !r.back_on) return "";
    const [y, m, d] = String(r.back_on).split("-").map(Number);
    const when = new Date(y, m - 1, d);
    return r.back_on < todayIso()
      ? "Checked out · should be back any day"
      : "Checked out · due back " + when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  function todayIso() {
    const t = new Date(); const p = (n) => String(n).padStart(2, "0");
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  }
  async function call(fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(error.message || "Something went wrong. Please try again.");
    return data;
  }
  function friendly(e) {
    const m = (e && e.message) || "";
    if (/fetch|network|Failed to fetch/i.test(m)) return "No connection. Check your signal or Wi-Fi and try again.";
    return m || "Something went wrong. Please try again.";
  }

  // ---------------------------------------------------------------- render --
  function render() {
    if (renewNote) return renderRenewNote();
    if (done) return renderDone();
    const books = (mine && mine.books) || [];
    app.innerHTML = `
      ${books.length ? myBooksHtml(books) : ""}
      <section class="lb-card" id="checkoutCard">
        <h2>Library Book Checkout</h2>
        ${editingMe ? `
          <p class="lb-muted" style="margin:2px 0 4px;">Just enter your name and email, your phone will remember you.</p>
          <label class="lb-label" for="meName">Your name</label>
          <input class="lb-input" id="meName" autocomplete="name" value="${esc(me.name)}" placeholder="First and last name">
          <label class="lb-label" for="meEmail">Email <span class="lb-hint">We'll send a reminder before it's due.</span></label>
          <input class="lb-input" id="meEmail" type="email" inputmode="email" autocomplete="email" value="${esc(me.email)}" placeholder="you@example.com">
        ` : `
          <div class="lb-hello"><span>Checking out as <strong>${esc(me.name)}</strong></span>
            <button type="button" class="lb-link" id="notMe">Not you?</button></div>
        `}
        <div style="margin-top:${editingMe ? 18 : 4}px;">
          <button type="button" class="lb-btn lb-btn-primary lb-btn-block" id="scanBtn">${ICON.scan} Scan the barcode</button>
          <div class="lb-or">or type the title</div>
          <div class="lb-search">
            <input class="lb-input" id="titleQ" type="search" autocomplete="off" autocapitalize="words" placeholder="Start typing the book's title…" aria-label="Book title">
            <ul class="lb-suggest" id="suggest" role="listbox"></ul>
          </div>
        </div>
        ${newBook ? newBookHtml() : ""}
        ${bag.length ? `
          <h3 style="margin:20px 0 0;font-size:1.05rem;">Taking home (${bag.length})</h3>
          <ul class="lb-list" id="bagList">
            ${bag.map((b, i) => `<li>
              ${b.photoUrl ? `<img class="lb-thumb" src="${b.photoUrl}" alt="">` : coverImg(b.cover)}
              <div class="lb-book"><div class="t">${esc(b.title)}</div>${b.author ? `<div class="a">${esc(b.author)}</div>` : ""}
                ${b.back_on ? `<div class="a">Our records show this book checked out. If it's in your hands, it was returned, so go ahead.</div>` : ""}</div>
              <button type="button" class="lb-x" data-unbag="${i}" aria-label="Remove ${esc(b.title)}">×</button>
            </li>`).join("")}
          </ul>` : ""}
        ${notice ? `<div class="lb-msg ${notice.kind === "ok" ? "lb-msg-ok" : "lb-msg-err"}" role="${notice.kind === "ok" ? "status" : "alert"}">${esc(notice.text)}</div>` : ""}
        <button type="button" class="lb-btn lb-btn-gold lb-btn-block" id="goBtn" style="margin-top:18px;" ${bag.length && !busy ? "" : "disabled"}>
          ${busy ? "Checking out…" : bag.length ? `Check out ${bag.length === 1 ? "this book" : bag.length + " books"}` : "Add a book above"}</button>
        <p class="lb-muted" style="font-size:.85rem;margin:10px 0 0;text-align:center;">Due back in two weeks · you can renew from your email</p>
      </section>`;
    wire();
  }

  function myBooksHtml(books) {
    const today = todayIso();
    return `<section class="lb-card" id="myBooks">
      <h2>My books</h2>
      <p class="lb-muted" style="margin:2px 0 0;">Brought one back? Tap <strong>Returned</strong>.</p>
      <ul class="lb-list">
        ${books.map((b) => `<li>
          ${coverImg(b.cover)}
          <div class="lb-book"><div class="t">${esc(b.title)}</div>${b.author ? `<div class="a">${esc(b.author)}</div>` : ""}
            <div class="due ${b.due_on < today ? "over" : ""}">${b.due_on < today ? "Overdue · was due " : "Due "}${esc(dueText(b.due_on))}</div></div>
          <div class="lb-mini">
            <button type="button" class="ok" data-return="${b.loan}">Returned</button>
            ${b.can_renew ? `<button type="button" data-renew="${b.loan}">+2 weeks</button>` : ""}
          </div>
        </li>`).join("")}
      </ul>
    </section>`;
  }

  function newBookHtml() {
    const nb = newBook;
    return `<div class="lb-newbook" id="newBook">
      <h3>${nb.fromScan ? "Not on our list yet. That's fine!" : "A book that isn't on our list"}</h3>
      <p class="lb-muted" style="margin:4px 0 0;font-size:.92rem;">${nb.lookupFailed ? "We couldn't look that barcode up. Please type the title." : "Check the title and author, then add it. The librarian will add it to the list."}</p>
      ${nb.near && nb.near.length ? `<p style="margin:10px 0 4px;font-size:.92rem;"><strong>Is it one of these?</strong></p>
        <ul class="lb-suggest">${nb.near.map((r, i) => `<li><button type="button" data-near="${i}"><span class="t">${esc(r.title)}</span>${r.author ? `<span class="a">${esc(r.author)}</span>` : ""}</button></li>`).join("")}</ul>` : ""}
      <label class="lb-label" for="nbTitle">Title</label>
      <input class="lb-input" id="nbTitle" value="${esc(nb.title)}" autocapitalize="words">
      <label class="lb-label" for="nbAuthor">Author <span class="lb-hint">If you know it</span></label>
      <input class="lb-input" id="nbAuthor" value="${esc(nb.author)}" autocapitalize="words">
      <div class="lb-photo">
        ${nb.photoUrl ? `<img src="${nb.photoUrl}" alt="Your photo of the cover">` : ""}
        <label class="lb-btn lb-btn-light" style="min-height:44px;font-size:.95rem;">${ICON.camera} ${nb.photoUrl ? "Retake photo" : "Photo of the cover (optional)"}
          <input type="file" id="nbPhoto" accept="image/*" capture="environment" hidden></label>
      </div>
      <div class="lb-row">
        <button type="button" class="lb-btn lb-btn-light" id="nbCancel">Cancel</button>
        <button type="button" class="lb-btn lb-btn-primary" id="nbAdd">Add</button>
      </div>
    </div>`;
  }

  function renderDone() {
    const r = done;
    app.innerHTML = `<section class="lb-card lb-done">
      <div class="check">${ICON.check}</div>
      <h2>All set, ${esc((me.name || "").split(" ")[0])}!</h2>
      <p style="margin:6px 0 0;">${r.checked_out === 1 ? "Your book is" : `Your ${r.checked_out} books are`} due back</p>
      <div class="lb-due-big">${esc(dueText(r.due_on))}</div>
      <p class="lb-muted" style="margin:0 0 16px;">We'll email <strong>${esc(me.email)}</strong> 3 days before.<br>Need longer? Tap "Keep it 2 more weeks" in that email.</p>
      <button type="button" class="lb-btn lb-btn-primary lb-btn-block" id="doneBtn">Done</button>
    </section>`;
    document.getElementById("doneBtn").addEventListener("click", () => { done = null; render(); });
  }

  function renderRenewNote() {
    const r = renewNote;
    const ok = r.renewed;
    app.innerHTML = `<section class="lb-card lb-done">
      ${ok ? `<div class="check">${ICON.check}</div>` : ""}
      <h2>${r.error ? "That link didn't work" : r.returned ? "Already returned" : ok ? "Two more weeks!" : "Time to bring it back"}</h2>
      ${r.error ? `<p>${esc(r.error)}</p>`
        : r.returned ? `<p><strong>${esc(r.title)}</strong> is already back on the shelf. Thank you!</p>`
        : ok ? `<p><strong>${esc(r.title)}</strong> is now due</p><div class="lb-due-big">${esc(dueText(r.due_on))}</div>`
        : `<p><strong>${esc(r.title)}</strong> has been renewed twice already. Please return it by ${esc(dueText(r.due_on))}, or ask the librarian.</p>`}
      <button type="button" class="lb-btn lb-btn-primary lb-btn-block" id="doneBtn" style="margin-top:16px;">OK</button>
    </section>`;
    document.getElementById("doneBtn").addEventListener("click", () => { renewNote = null; render(); });
  }

  // ------------------------------------------------------------------ wire --
  function rememberTyping() {
    const n = document.getElementById("meName"), e = document.getElementById("meEmail");
    if (n) me.name = n.value;
    if (e) me.email = e.value;
    const t = document.getElementById("nbTitle"), a = document.getElementById("nbAuthor");
    if (newBook && t) newBook.title = t.value;
    if (newBook && a) newBook.author = a.value;
  }

  function wire() {
    const $ = (id) => document.getElementById(id);
    ["meName", "meEmail", "nbTitle", "nbAuthor"].forEach((id) => { const el = $(id); if (el) el.addEventListener("input", rememberTyping); });
    if ($("notMe")) $("notMe").addEventListener("click", () => {
      key = null; mine = null; me = { name: "", email: "" }; editingMe = true;
      store.set(KEY, null); store.set(ME, null); render();
    });
    $("scanBtn").addEventListener("click", () => { rememberTyping(); openScanner(); });
    const q = $("titleQ");
    q.addEventListener("input", () => typeahead(q.value));
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const b = $("suggest").querySelector("button"); if (b) b.click(); } });
    app.querySelectorAll("[data-unbag]").forEach((b) => b.addEventListener("click", () => { rememberTyping(); bag.splice(+b.dataset.unbag, 1); render(); }));
    app.querySelectorAll("[data-return]").forEach((b) => b.addEventListener("click", () => returned(+b.dataset.return)));
    app.querySelectorAll("[data-renew]").forEach((b) => b.addEventListener("click", () => renew(+b.dataset.renew)));
    if (newBook) {
      $("nbCancel").addEventListener("click", () => { rememberTyping(); newBook = null; render(); });
      $("nbAdd").addEventListener("click", addNewBook);
      $("nbPhoto").addEventListener("change", (e) => { rememberTyping(); takePhoto(e.target.files && e.target.files[0]); });
      app.querySelectorAll("[data-near]").forEach((b) => b.addEventListener("click", () => {
        rememberTyping();
        const r = newBook.near[+b.dataset.near];
        addToBag({ book: r.id, title: r.title, author: r.author, back_on: r.back_on, cover: r.cover, isbn: newBook.isbn });
        newBook = null; render();
      }));
    }
    $("goBtn").addEventListener("click", checkout);
  }

  function addToBag(item) {
    if (item.book && bag.some((b) => b.book === item.book)) { notice = { kind: "ok", text: `"${item.title}" is already in your list.` }; return; }
    bag.push(item);
    notice = null;
  }

  // ------------------------------------------------------------- typeahead --
  let tSeq = 0, tTimer = null;
  function typeahead(text) {
    const q = text.trim();
    const ul = document.getElementById("suggest");
    clearTimeout(tTimer);
    if (q.length < 2) { ul.innerHTML = ""; return; }
    const seq = ++tSeq;
    tTimer = setTimeout(async () => {
      let rows = [];
      try { rows = await call("library_search", { p_q: q }) || []; } catch (e) { rows = []; }
      if (seq !== tSeq) return;
      drawSuggest(q, rows);
    }, 180);
  }
  function drawSuggest(q, rows) {
    const ul = document.getElementById("suggest");
    if (!ul) return;
    ul.innerHTML = (rows.length ? `<li class="lb-sec">On our shelves</li>` : `<li class="lb-sec">No books on our list match</li>`)
      + rows.map((r, i) => `<li><button type="button" data-pick="${i}"${r.cover ? ` class="has-cover"` : ""}>${coverImg(r.cover, "lb-sthumb")}<span class="lb-stext"><span class="t">${esc(r.title)}</span>${r.author ? `<span class="a">${esc(r.author)}</span>` : ""}${r.back_on ? `<span class="avail out">${esc(availability(r))}</span>` : r.copies > 0 ? `<span class="avail in">On the shelf</span>` : ""}</span></button></li>`).join("")
      + `<li><button type="button" data-typed="1"><span class="a">Can't find it? <strong>Add this book by hand</strong></span></button></li>`;
    ul.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
      rememberTyping();
      const r = rows[+b.dataset.pick];
      addToBag({ book: r.id, title: r.title, author: r.author, back_on: r.back_on, cover: r.cover });
      render();
    }));
    ul.querySelector("[data-typed]").addEventListener("click", () => {
      rememberTyping();
      newBook = { title: q, author: "", isbn: "" };
      render();
    });
  }

  // ---------------------------------------------------- online book lookup --
  async function getJson(url, ms = 6000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.json() : null; }
    catch (e) { return null; } finally { clearTimeout(t); }
  }
  async function lookupIsbn(code) {
    const ol = await getJson(`https://openlibrary.org/search.json?isbn=${code}&fields=title,subtitle,author_name&limit=1`);
    if (ol && ol.docs && ol.docs[0] && ol.docs[0].title) return { title: ol.docs[0].title, author: (ol.docs[0].author_name || [])[0] || "" };
    const g = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${code}&maxResults=1`);
    const v = g && g.items && g.items[0] && g.items[0].volumeInfo;
    if (v && v.title) return { title: v.title, author: (v.authors || [])[0] || "" };
    return null;
  }

  // A barcode was read: our list → online lookup → "not on our list" form.
  async function handleCode(raw) {
    const code = String(raw || "").replace(/[^0-9Xx]/g, "").toUpperCase();
    if (!code) return;
    notice = { kind: "ok", text: "Looking that book up…" }; render();
    try {
      const hit = (await call("library_by_isbn", { p_isbn: code }) || [])[0];
      if (hit) { notice = null; addToBag({ book: hit.id, title: hit.title, author: hit.author, isbn: code, back_on: hit.back_on, cover: hit.cover }); return render(); }
      const info = await lookupIsbn(code);
      if (info) {
        const rows = await call("library_search", { p_q: info.title.split(/[:(]/)[0].slice(0, 60) }) || [];
        const same = rows.find((r) => norm(r.title) === norm(info.title) || norm(r.title) === norm(info.title.split(/[:(]/)[0]));
        if (same) { notice = null; addToBag({ book: same.id, title: same.title, author: same.author, isbn: code, back_on: same.back_on, cover: same.cover }); return render(); }
        newBook = { title: info.title, author: info.author, isbn: code, fromScan: true, near: rows.slice(0, 3) };
      } else {
        newBook = { title: "", author: "", isbn: code, fromScan: true, lookupFailed: true };
      }
      notice = null; render();
      const t = document.getElementById(newBook.title ? "nbAdd" : "nbTitle"); if (t) t.focus();
    } catch (e) { notice = { kind: "err", text: friendly(e) }; render(); }
  }

  function addNewBook() {
    rememberTyping();
    const title = (newBook.title || "").trim();
    if (!title) { notice = { kind: "err", text: "Please type the book's title." }; return render(); }
    addToBag({ title, author: (newBook.author || "").trim(), isbn: newBook.isbn || "", photoBlob: newBook.photoBlob || null, photoUrl: newBook.photoUrl || null, isNew: true });
    newBook = null; render();
  }

  // A cover photo, shrunk to a small JPEG before it's sent.
  async function takePhoto(file) {
    if (!file || !newBook) return;
    try {
      const url = URL.createObjectURL(file);
      const img = new Image(); img.src = url; await img.decode();
      const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.8));
      newBook.photoBlob = blob; newBook.photoUrl = URL.createObjectURL(blob);
    } catch (e) { notice = { kind: "err", text: "That photo couldn't be read. You can skip the photo." }; }
    render();
  }

  // ------------------------------------------------------------- checkout --
  async function checkout() {
    rememberTyping();
    if (busy || !bag.length) return;
    const name = (me.name || "").trim(), email = (me.email || "").trim();
    if (name.length < 2) { notice = { kind: "err", text: "Please type your name." }; render(); const n = document.getElementById("meName"); if (n) n.focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { notice = { kind: "err", text: "Please check your email address. We'll use it to remind you when it's due." }; render(); const n = document.getElementById("meEmail"); if (n) n.focus(); return; }
    busy = true; notice = null; render();
    try {
      const items = [];
      for (const b of bag) {
        if (b.book) { items.push(b.isbn ? { book: b.book, isbn: b.isbn } : { book: b.book }); continue; }
        let photo = null;
        if (b.photoBlob) {
          const path = `new/${(crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g, "")}.jpg`;
          const { error } = await sb.storage.from("library-photos").upload(path, b.photoBlob, { contentType: "image/jpeg" });
          if (!error) photo = path;
        }
        items.push({ title: b.title, author: b.author || "", isbn: b.isbn || "", ...(photo ? { photo } : {}) });
      }
      const r = await call("library_checkout", { p_token: key, p_name: name, p_email: email, p_items: items });
      key = r.token; store.set(KEY, key);
      me = { name: r.name, email: r.email }; store.set(ME, JSON.stringify(me));
      mine = { name: r.name, email: r.email, books: r.books };
      editingMe = false; bag = []; newBook = null; done = r;
    } catch (e) {
      notice = { kind: "err", text: friendly(e) };
    }
    busy = false; render();
  }

  async function returned(loan) {
    const b = mine.books.find((x) => x.loan === loan);
    if (!b || !confirm(`Mark "${b.title}" as returned to the library?`)) return;
    try { mine = await call("library_return", { p_token: key, p_loan: loan }); notice = { kind: "ok", text: `Thank you! "${b.title}" is checked back in.` }; }
    catch (e) { notice = { kind: "err", text: friendly(e) }; }
    render();
  }
  async function renew(loan) {
    try {
      const r = await call("library_renew", { p_token: key, p_loan: loan, p_renew: null });
      mine = await call("library_my_books", { p_token: key });
      notice = r.renewed ? { kind: "ok", text: `"${r.title}" is now due ${dueText(r.due_on)}.` } : { kind: "err", text: `"${r.title}" can't be renewed again. Please return it, or ask the librarian.` };
    } catch (e) { notice = { kind: "err", text: friendly(e) }; }
    render();
  }

  // --------------------------------------------------------------- camera --
  let stream = null, scanning = false, detector = null;
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("The barcode reader couldn't load.")); document.head.appendChild(s); });
  }
  async function getDetector() {
    if (detector) return detector;
    const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"];
    if ("BarcodeDetector" in window) {
      try {
        const ok = await window.BarcodeDetector.getSupportedFormats();
        if (ok.includes("ean_13")) return (detector = new window.BarcodeDetector({ formats: formats.filter((f) => ok.includes(f)) }));
      } catch (e) { /* fall through to the reader we bring along */ }
    }
    if (!window.BarcodeDetectionAPI) await loadScript(BARCODE_LIB);
    return (detector = new window.BarcodeDetectionAPI.BarcodeDetector({ formats }));
  }
  async function openScanner() {
    const box = document.getElementById("scanner"), video = document.getElementById("scanVideo"), msg = document.getElementById("scanMsg");
    msg.textContent = "Starting the camera…";
    box.hidden = false;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("This browser can't use the camera. Type the title instead.");
      const [det, s] = await Promise.all([getDetector(), navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })]);
      stream = s; video.srcObject = s; await video.play();
      msg.textContent = "";
      scanning = true;
      const tick = async () => {
        if (!scanning) return;
        try {
          const found = await det.detect(video);
          const hit = found.find((f) => /^\d{8,13}$|^\d{9}[\dX]$/.test(f.rawValue)) || found[0];
          if (hit && hit.rawValue) { if (navigator.vibrate) navigator.vibrate(60); closeScanner(); return handleCode(hit.rawValue); }
        } catch (e) { /* frame not ready; try the next one */ }
        setTimeout(tick, 200);
      };
      tick();
    } catch (e) {
      const m = (e && e.name === "NotAllowedError") ? "The camera is blocked. Allow camera access for this site in your browser settings, or type the title instead." : friendly(e);
      msg.textContent = m;
    }
  }
  function closeScanner() {
    scanning = false;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    document.getElementById("scanner").hidden = true;
  }
  document.getElementById("scanClose").addEventListener("click", closeScanner);

  // ------------------------------------------------------------------ start --
  (async function start() {
    const params = new URLSearchParams(location.search);
    const renewKey = params.get("renew");
    if (renewKey) {
      history.replaceState(null, "", location.pathname);
      try { renewNote = await call("library_renew", { p_token: null, p_loan: null, p_renew: renewKey }); }
      catch (e) { renewNote = { error: friendly(e) }; }
    }
    if (key) {
      try {
        mine = await call("library_my_books", { p_token: key });
        if (!mine) { key = null; store.set(KEY, null); editingMe = true; }
        else { me = { name: mine.name, email: mine.email }; store.set(ME, JSON.stringify(me)); }
      } catch (e) { /* offline: still let them start */ }
    }
    render();
  })();
  window.__library = { handleCode };   // for tests
})();
