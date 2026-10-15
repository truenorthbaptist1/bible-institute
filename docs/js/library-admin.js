// ============================================================================
// Library → Checkouts (Admins only, Oct 15, 2026)
//
// The librarian's side of the church library checkout (docs/library/): who
// has which book, what's overdue, books borrowers added that aren't on the
// list yet, and the list itself. Everything comes from library_admin_*
// database functions, which refuse anyone who isn't an Admin.
// ============================================================================
let libAdmin = null;          // the overview from the database
let libAdminQuery = "";
let libAdminFound = null;     // search results on the Books card
let libAdminTab = "out";      // out | new | books | returned
const LIBRARY_PAGE_URL = "https://institute.truenorthbaptist.com/library/";

async function libRpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args || {});
  if (error) throw error;
  return data;
}
function libDay(iso) {
  if (!iso) return "";
  const s = String(iso);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T12:00:00") : new Date(s);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

async function openLibraryCheckouts() {
  view = "libraryCheckouts"; renderNav();
  const main = document.getElementById("main");
  main.innerHTML = `<p class="field-hint" style="padding:24px 0;">Loading the library…</p>`;
  try { libAdmin = await libRpc("library_admin_overview"); }
  catch (e) { toast(friendlyError(e)); view = "resourceLibrary"; return renderMain(); }
  renderMain();
}
async function libReload(msg) {
  try { libAdmin = await libRpc("library_admin_overview"); if (libAdminQuery) libAdminFound = await libRpc("library_admin_books", { p_q: libAdminQuery }); }
  catch (e) { toast(friendlyError(e)); }
  renderLibraryCheckouts(document.getElementById("main"));
  if (msg) toast(msg, "success");
}
async function libDo(work, msg) {
  setBusy(true);
  try { await work(); setBusy(false); await libReload(msg); }
  catch (e) { setBusy(false); toast(friendlyError(e)); }
}

function renderLibraryCheckouts(main) {
  if (!isAdmin()) { view = "home"; renderNav(); return renderMain(); }
  if (!libAdmin) { return openLibraryCheckouts(); }
  const L = libAdmin, c = L.counts;
  const overdue = L.out.filter((x) => x.overdue);
  const tabs = [
    ["out", `Checked out (${c.out})`],
    ["new", `New books to look over${L.new_books.length ? ` (${L.new_books.length})` : ""}`],
    ["books", "The book list"],
    ["returned", "Recently returned"],
  ];
  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Resource Library</button>
    <div class="page-header">
      <div class="eyebrow">Admin · Church Library</div>
      <h1>Checkouts</h1>
      <p>Books borrowed with the QR code by the church library. Borrowers get an email 3 days before a book is due, on the day, and weekly if it's overdue (four times at most).</p>
    </div>
    <div class="ts-stats" style="margin-bottom:18px;">
      <div><span>${c.out}</span>Checked out now</div>
      <div${c.overdue ? ` style="color:var(--destructive);"` : ""}><span>${c.overdue}</span>Overdue</div>
      <div><span>${c.this_year}</span>Borrowed this year</div>
      <div><span>${c.copies}</span>Books on the list</div>
    </div>
    <div class="subtabs" id="libTabs" style="margin-bottom:14px;flex-wrap:wrap;">
      ${tabs.map(([k, t]) => `<button data-libtab="${k}" class="${libAdminTab === k ? "active" : ""}">${t}</button>`).join("")}
    </div>
    <div id="libTabBody">${libTabHtml(overdue)}</div>
    <div class="card" style="margin-top:18px;">
      <h2 class="card-title" style="margin:0 0 4px;">The QR code</h2>
      <p class="field-hint" style="margin:0;">It opens <a href="${LIBRARY_PAGE_URL}" target="_blank" rel="noopener">${LIBRARY_PAGE_URL.replace("https://", "")}</a>. The page isn't linked from either website; people reach it from the sign by the library.</p>
    </div>`;
  document.getElementById("backLink").addEventListener("click", () => { libAdmin = null; view = "resourceLibrary"; renderNav(); renderMain(); });
  main.querySelectorAll("[data-libtab]").forEach((b) => b.addEventListener("click", () => { libAdminTab = b.dataset.libtab; renderLibraryCheckouts(main); }));
  wireLibTab(main);
}

function libTabHtml(overdue) {
  const L = libAdmin;
  if (libAdminTab === "out") {
    if (!L.out.length) return `<div class="card"><div class="empty-state"><p>No books are checked out right now.</p></div></div>`;
    return `<div class="card">
      ${overdue.length ? `<p class="field-hint" style="margin:0 0 8px;color:var(--destructive);font-weight:600;">${overdue.length} overdue · listed first</p>` : ""}
      <ul class="materials-list">
        ${L.out.map((x) => `<li>
          <div style="flex:1;min-width:0;">
            <strong>${esc(x.title)}</strong>${x.author ? ` <span class="field-hint" style="display:inline;margin:0;">· ${esc(x.author)}</span>` : ""}
            <div class="field-hint" style="margin:2px 0 0;">${esc(x.name)} · <a href="mailto:${esc(x.email)}">${esc(x.email)}</a></div>
            <div class="field-hint" style="margin:2px 0 0;${x.overdue ? "color:var(--destructive);font-weight:600;" : ""}">Out ${libDay(x.out_at)} · ${x.overdue ? "was due" : "due"} ${libDay(x.due_on)}${x.renewals ? ` · renewed ${x.renewals}×` : ""}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="btn btn-ghost btn-sm" data-lib-extend="${x.loan}">+2 weeks</button>
            <button class="btn btn-primary btn-sm" data-lib-return="${x.loan}">Returned</button>
          </div>
        </li>`).join("")}
      </ul></div>`;
  }
  if (libAdminTab === "new") {
    if (!L.new_books.length) return `<div class="card"><div class="empty-state"><p>Nothing to look over. When someone checks out a book that isn't on the list, it shows up here.</p></div></div>`;
    return `<div class="card">
      <p class="field-hint" style="margin:0 0 10px;">Borrowers added these. If one is already on the list under a different spelling, use <strong>Same as…</strong> to combine them. Otherwise check the details and <strong>Save</strong>.</p>
      <ul class="materials-list">
        ${L.new_books.map((b) => `<li>
          ${b.photo ? `<button class="lib-adm-thumb" data-lib-photo="${esc(b.photo)}" aria-label="See the cover photo" style="border:0;padding:0;background:none;cursor:pointer;"><img data-photo-path="${esc(b.photo)}" alt="" width="44" height="58" style="object-fit:cover;border-radius:4px;border:1px solid var(--border);background:var(--muted);"></button>` : ""}
          <div style="flex:1;min-width:0;">
            <strong>${esc(b.title)}</strong>${b.author ? ` <span class="field-hint" style="display:inline;margin:0;">· ${esc(b.author)}</span>` : ""}
            <div class="field-hint" style="margin:2px 0 0;">Added ${libDay(b.added)} · borrowed ${b.loans}×${b.isbns && b.isbns.length ? ` · barcode ${esc(b.isbns[0])}` : ""}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="btn btn-ghost btn-sm" data-lib-merge="${b.id}">Same as…</button>
            <button class="btn btn-primary btn-sm" data-lib-edit="${b.id}">Check &amp; save</button>
          </div>
        </li>`).join("")}
      </ul></div>`;
  }
  if (libAdminTab === "books") {
    const found = libAdminFound;
    return `<div class="card">
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div style="flex:1;min-width:220px;"><label for="libQ">Find a book</label>
          <input type="search" id="libQ" placeholder="Title, author or shelf" value="${esc(libAdminQuery)}" autocomplete="off" style="margin:0;"></div>
        <button class="btn btn-gold" id="libAdd">Add a book</button>
      </div>
      ${found === null ? `<p class="field-hint" style="margin:12px 0 0;">${libAdmin.counts.titles} titles (${libAdmin.counts.copies} books). Search to change one.</p>`
        : !found.length ? `<div class="empty-state"><p>No books match that.</p></div>`
        : `<ul class="materials-list" style="margin-top:10px;">${found.map((b) => `<li>
            <div style="flex:1;min-width:0;"><strong>${esc(b.title)}</strong>${b.author ? ` <span class="field-hint" style="display:inline;margin:0;">· ${esc(b.author)}</span>` : ""}
              <div class="field-hint" style="margin:2px 0 0;">${esc(b.subject || "No shelf")} · ${b.copies} cop${b.copies === 1 ? "y" : "ies"}${b.out_now ? ` · <strong>${b.out_now} out</strong>` : ""} · borrowed ${b.times}×</div></div>
            <button class="btn btn-ghost btn-sm" data-lib-editfound="${b.id}">Edit</button>
          </li>`).join("")}</ul>`}
    </div>`;
  }
  const R = L.returned;
  if (!R.length) return `<div class="card"><div class="empty-state"><p>No returns yet.</p></div></div>`;
  return `<div class="card"><ul class="pr-courses">
    ${R.map((x) => `<li><span>${esc(x.title)} <span class="ts-small">· ${esc(x.name)}</span></span>
      <span class="ts-small">${libDay(x.out_at)} → ${libDay(x.returned_at)}${x.returned_by === "librarian" ? " (librarian)" : ""}</span></li>`).join("")}
  </ul></div>`;
}

function wireLibTab(main) {
  main.querySelectorAll("[data-lib-return]").forEach((b) => b.addEventListener("click", async () => {
    const x = libAdmin.out.find((o) => o.loan === +b.dataset.libReturn);
    if (!(await askConfirm({ title: `Check in "${x.title}"?`, text: `Borrowed by ${x.name}.`, ok: "Returned" }))) return;
    libDo(() => libRpc("library_admin_return", { p_loan: x.loan }), `"${x.title}" is checked back in.`);
  }));
  main.querySelectorAll("[data-lib-extend]").forEach((b) => b.addEventListener("click", () => {
    const x = libAdmin.out.find((o) => o.loan === +b.dataset.libExtend);
    libDo(async () => { const d = await libRpc("library_admin_extend", { p_loan: x.loan }); x.newDue = d; }, `"${x.title}" now has two more weeks.`);
  }));
  main.querySelectorAll("[data-lib-edit]").forEach((b) => b.addEventListener("click", () => {
    const nb = libAdmin.new_books.find((x) => x.id === +b.dataset.libEdit);
    openLibBookModal({ id: nb.id, title: nb.title, author: nb.author, subject: nb.subject, copies: 1 });
  }));
  main.querySelectorAll("[data-lib-editfound]").forEach((b) => b.addEventListener("click", () => {
    openLibBookModal(libAdminFound.find((x) => x.id === +b.dataset.libEditfound));
  }));
  main.querySelectorAll("[data-lib-merge]").forEach((b) => b.addEventListener("click", () => {
    openLibMergeModal(libAdmin.new_books.find((x) => x.id === +b.dataset.libMerge));
  }));
  // Cover photos: private, so each gets a short-lived link.
  main.querySelectorAll("img[data-photo-path]").forEach(async (img) => {
    try { const { data } = await sb.storage.from("library-photos").createSignedUrl(img.dataset.photoPath, 600); if (data && data.signedUrl) img.src = data.signedUrl; } catch (e) { /* no photo */ }
  });
  main.querySelectorAll("[data-lib-photo]").forEach((b) => b.addEventListener("click", () => {
    const src = b.querySelector("img").src;
    if (src) window.open(src, "_blank", "noopener");
  }));
  const q = document.getElementById("libQ");
  if (q) {
    let t = null;
    q.addEventListener("input", () => {
      libAdminQuery = q.value; clearTimeout(t);
      t = setTimeout(async () => {
        try { libAdminFound = libAdminQuery.trim() ? await libRpc("library_admin_books", { p_q: libAdminQuery }) : null; } catch (e) { toast(friendlyError(e)); }
        const pos = q.selectionStart;
        renderLibraryCheckouts(document.getElementById("main"));
        const n = document.getElementById("libQ"); n.focus(); n.setSelectionRange(pos, pos);
      }, 250);
    });
  }
  const add = document.getElementById("libAdd");
  if (add) add.addEventListener("click", () => openLibBookModal({ id: null, title: "", author: "", subject: "", copies: 1 }));
}

function openLibBookModal(b) {
  const subjects = (libAdmin.subjects || []).slice();
  document.getElementById("modalRoot").innerHTML = `
    <div class="modal-backdrop"><div class="modal" style="max-width:520px;">
      <h2 style="font-size:1.15rem;">${b.id ? "Book details" : "Add a book"}</h2>
      <label for="lbTitle">Title</label><input id="lbTitle" value="${esc(b.title)}" autocomplete="off">
      <label for="lbAuthor">Author</label><input id="lbAuthor" value="${esc(b.author || "")}" autocomplete="off">
      <label for="lbSubject">Shelf</label><input id="lbSubject" list="lbSubjects" value="${esc(b.subject || "")}" autocomplete="off" placeholder="e.g. Doctrine, Biography">
      <datalist id="lbSubjects">${subjects.map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
      <label for="lbCopies">Copies</label><input id="lbCopies" type="number" min="0" max="50" value="${b.copies == null ? 1 : b.copies}" style="max-width:120px;">
      <p class="field-hint">Set copies to 0 for a book that's gone, so it stops showing as available.</p>
      <div class="form-actions">
        <button class="btn btn-primary" id="lbSave">Save</button>
        <button class="btn btn-ghost" id="lbCancel">Cancel</button>
        ${b.id ? `<button class="btn btn-ghost" id="lbDelete" style="margin-left:auto;color:var(--destructive);">Delete</button>` : ""}
      </div>
    </div></div>`;
  document.getElementById("lbCancel").addEventListener("click", closeModal);
  document.getElementById("lbSave").addEventListener("click", () => {
    const v = (id) => document.getElementById(id).value;
    if (!v("lbTitle").trim()) { toast("A book needs a title."); return; }
    libDo(async () => {
      await libRpc("library_admin_save_book", { p_id: b.id, p_title: v("lbTitle"), p_author: v("lbAuthor"), p_subject: v("lbSubject"), p_copies: parseInt(v("lbCopies"), 10) || 0 });
      closeModal();
    }, b.id ? "Book saved." : "Book added to the list.");
  });
  const del = document.getElementById("lbDelete");
  if (del) del.addEventListener("click", async () => {
    if (!(await askConfirm(`Delete "${b.title}" from the list?`))) return;
    libDo(async () => { await libRpc("library_admin_delete_book", { p_id: b.id }); closeModal(); }, "Book removed from the list.");
  });
}

function openLibMergeModal(nb) {
  document.getElementById("modalRoot").innerHTML = `
    <div class="modal-backdrop"><div class="modal" style="max-width:560px;">
      <h2 style="font-size:1.15rem;">"${esc(nb.title)}" is the same as…</h2>
      <p class="field-hint">Find the book on the list. Its checkouts and barcode move there, and this extra entry goes away.</p>
      <input type="search" id="lmQ" value="${esc(nb.title.split(/[:(]/)[0].slice(0, 40))}" autocomplete="off">
      <ul class="materials-list" id="lmList" style="margin-top:8px;max-height:46vh;overflow:auto;"></ul>
      <div class="form-actions"><button class="btn btn-ghost" id="lmCancel">Cancel</button></div>
    </div></div>`;
  document.getElementById("lmCancel").addEventListener("click", closeModal);
  const q = document.getElementById("lmQ"), list = document.getElementById("lmList");
  const search = async () => {
    let rows = [];
    try { rows = q.value.trim() ? await libRpc("library_admin_books", { p_q: q.value }) : []; } catch (e) { toast(friendlyError(e)); }
    rows = rows.filter((r) => r.id !== nb.id);
    list.innerHTML = rows.length ? rows.map((r) => `<li><div style="flex:1;min-width:0;"><strong>${esc(r.title)}</strong>${r.author ? ` <span class="field-hint" style="display:inline;margin:0;">· ${esc(r.author)}</span>` : ""}</div>
      <button class="btn btn-primary btn-sm" data-lm="${r.id}">This one</button></li>`).join("") : `<li class="field-hint">No match. Try fewer words.</li>`;
    list.querySelectorAll("[data-lm]").forEach((b) => b.addEventListener("click", () => {
      libDo(async () => { await libRpc("library_admin_merge_book", { p_from: nb.id, p_into: +b.dataset.lm }); closeModal(); }, "Combined with the book on the list.");
    }));
  };
  let t = null;
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(search, 250); });
  search();
}
