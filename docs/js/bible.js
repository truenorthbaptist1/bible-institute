// True North Baptist Church Bible Institute — the Study Bible.
//
// The whole King James Version (1769) is served from this site's own /bible
// folder, with a Strong's number on the words of all 31,102 verses — no
// outside Bible service is needed. Files (built by tools/bible-data/build.py):
//   bible/meta.json          books + verse counts
//   bible/kjv/<BOOK>.json    the tagged text, Psalm titles, epistle
//                            subscriptions, and cross references
//   bible/kjv-plain.txt      one verse per line — for searching and for
//                            inserting Scripture into assignments
//   bible/lex/<H|G><n>.json  Strong's dictionary + every KJV occurrence and
//                            how the KJV renders each word
// Verse text format: "In the beginning[H7225] God[H430] created[H1254][H853]"
// — each run of words is followed by its Strong's number(s); {braces} mark
// the words the translators printed in italics.

const BIBLE_DATA_VERSION = "2026-10-03";

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
BIBLE_BOOKS.forEach(([id, name, chapters], i) => { BOOK_INDEX[id] = { id, name, chapters, i, nt: i >= 39 }; });

// "Psalms 23" reads better as "Psalm 23" when it's one psalm.
function bibleBookLabel(id, chapterOnly) {
  const b = BOOK_INDEX[id];
  if (!b) return id;
  return id === "PSA" && chapterOnly ? "Psalm" : b.name;
}
function bibleRefLabel(id, c, v, v2) {
  const name = bibleBookLabel(id, true);
  if (!v) return `${name} ${c}`;
  return `${name} ${c}:${v}${v2 && v2 !== v ? "–" + v2 : ""}`;
}

// --- Book names people actually type -------------------------------------
const BOOK_ALIASES = {
  gn: "GEN", ge: "GEN", ex: "EXO", exod: "EXO", lv: "LEV", nm: "NUM", nb: "NUM", dt: "DEU", deut: "DEU", jsh: "JOS",
  jdgs: "JDG", jg: "JDG", judg: "JDG", rth: "RUT", ru: "RUT", "1sm": "1SA", "2sm": "2SA", "1kgs": "1KI", "2kgs": "2KI",
  "1kg": "1KI", "2kg": "2KI", "1chr": "1CH", "2chr": "2CH", "1chron": "1CH", "2chron": "2CH", nh: "NEH", es: "EST", jb: "JOB",
  ps: "PSA", psa: "PSA", pss: "PSA", psalm: "PSA", psalms: "PSA", pr: "PRO", prv: "PRO", qoh: "ECC", eccl: "ECC", ec: "ECC",
  song: "SNG", sos: "SNG", ss: "SNG", songofsongs: "SNG", canticles: "SNG", cant: "SNG", is: "ISA", jr: "JER", la: "LAM",
  ezk: "EZK", ezek: "EZK", eze: "EZK", dn: "DAN", ho: "HOS", jl: "JOL", joel: "JOL", am: "AMO", ob: "OBA", obad: "OBA",
  jnh: "JON", jon: "JON", mc: "MIC", na: "NAM", nah: "NAM", hb: "HAB", zp: "ZEP", zeph: "ZEP", hg: "HAG", zc: "ZEC",
  zech: "ZEC", ml: "MAL", mt: "MAT", matt: "MAT", mk: "MRK", mrk: "MRK", mr: "MRK", lk: "LUK", jn: "JHN", jhn: "JHN",
  joh: "JHN", ac: "ACT", rm: "ROM", ro: "ROM", "1cor": "1CO", "2cor": "2CO", ga: "GAL", ep: "EPH", php: "PHP", phil: "PHP",
  pp: "PHP", cl: "COL", "1thess": "1TH", "2thess": "2TH", "1thes": "1TH", "2thes": "2TH", "1tm": "1TI", "2tm": "2TI",
  ti: "TIT", phm: "PHM", philem: "PHM", phlm: "PHM", hb_: "HEB", jas: "JAS", jm: "JAS", "1pt": "1PE", "2pt": "2PE",
  "1jn": "1JN", "2jn": "2JN", "3jn": "3JN", "1jo": "1JN", "2jo": "2JN", "3jo": "3JN", "1john": "1JN", "2john": "2JN",
  "3john": "3JN", jud: "JDG", jude: "JUD", jd: "JUD", re: "REV", rv: "REV", rev: "REV", revelations: "REV",
};
function normBookKey(s) {
  return String(s || "").toLowerCase()
    .replace(/^(iii|third)\s*/, "3").replace(/^(ii|second)\s*/, "2").replace(/^(i|first)\s+/, "1")
    .replace(/[^a-z0-9]/g, "");
}
const BOOK_KEYS = BIBLE_BOOKS.map(([id, name]) => [id, normBookKey(name)]);
function findBook(text) {
  const k = normBookKey(text);
  if (!k) return null;
  if (BOOK_ALIASES[k]) return BOOK_ALIASES[k];
  const exactId = BIBLE_BOOKS.find(([id]) => id.toLowerCase() === k);
  if (exactId) return exactId[0];
  const exact = BOOK_KEYS.find(([, n]) => n === k);
  if (exact) return exact[0];
  if (k.length < 2 || (/^\d/.test(k) && k.length < 3)) return null;
  const pre = BOOK_KEYS.find(([, n]) => n.startsWith(k));
  return pre ? pre[0] : null;
}

// Parses "John 3:16", "Jn 3:16-18", "1 Cor 13", "Rom 8:28, 31-39",
// "Gen 1:1-2:3", "Ps 23; Isa 53:5". Returns null if it isn't a reference.
// Each range: { book, c1, v1, c2, v2 } (v1/v2 null = whole chapter).
function parseBibleReference(input) {
  const parts = String(input || "").split(/\s*;\s*/).filter(Boolean);
  if (!parts.length) return null;
  const ranges = [];
  let lastBook = null;
  for (const part of parts) {
    const m = part.match(/^\s*((?:[1-3]|i{1,3}|first|second|third)?\s*[a-z][a-z .]*?)\s*\.?\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–—]\s*(\d+)(?:\s*[:.]\s*(\d+))?)?((?:\s*,\s*\d+(?:\s*[-–—]\s*\d+)?)*))?(?:\s*[-–—]\s*(\d+))?\s*$/i);
    let book, rest;
    if (m) { book = findBook(m[1]); rest = m; }
    else if (lastBook) {
      const m2 = part.match(/^\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–—]\s*(\d+))?)?\s*$/);
      if (!m2) return null;
      book = lastBook; rest = [null, null, m2[1], m2[2], m2[3]];
    } else return null;
    if (!book) return null;
    lastBook = book;
    const maxCh = BOOK_INDEX[book].chapters;
    const c1 = parseInt(rest[2], 10);
    if (!(c1 >= 1)) return null;
    // One-chapter books: "Jude 3" means verse 3.
    if (maxCh === 1 && !rest[3] && c1 > 1) { ranges.push({ book, c1: 1, v1: c1, c2: 1, v2: c1 }); continue; }
    if (c1 > maxCh) return null;
    if (!rest[3]) {
      const cEnd = rest[7] ? Math.min(parseInt(rest[7], 10), maxCh) : c1;
      ranges.push({ book, c1, v1: null, c2: cEnd, v2: null });
      continue;
    }
    const v1 = parseInt(rest[3], 10);
    if (rest[4] && rest[5]) ranges.push({ book, c1, v1, c2: Math.min(parseInt(rest[4], 10), maxCh), v2: parseInt(rest[5], 10) });
    else ranges.push({ book, c1, v1, c2: c1, v2: rest[4] ? parseInt(rest[4], 10) : v1 });
    if (rest[6]) {
      rest[6].split(",").map((x) => x.trim()).filter(Boolean).forEach((seg) => {
        const [a, b] = seg.split(/\s*[-–—]\s*/).map((n) => parseInt(n, 10));
        ranges.push({ book, c1, v1: a, c2: c1, v2: b || a });
      });
    }
  }
  return ranges.length ? ranges : null;
}

// --- Loading the data ------------------------------------------------------
const BIBLE = { meta: null, books: {}, lex: {}, plain: null, starts: null };
const bibleLoading = {};
function bibleFetchJson(path) {
  if (!bibleLoading[path]) {
    bibleLoading[path] = fetch(`bible/${path}?v=${BIBLE_DATA_VERSION}`)
      .then((r) => { if (!r.ok) throw new Error("load"); return r.json(); })
      .catch((e) => { delete bibleLoading[path]; throw new Error("Couldn't load the Bible text. Check your internet connection and try again."); });
  }
  return bibleLoading[path];
}
async function bibleMeta() {
  if (BIBLE.meta) return BIBLE.meta;
  const meta = await bibleFetchJson("meta.json");
  // Ordinal (0 … 31101) of the first verse of every chapter.
  const starts = {};
  let n = 0;
  meta.books.forEach(([id, , counts]) => {
    starts[id] = [];
    counts.forEach((cnt) => { starts[id].push(n); n += cnt; });
  });
  BIBLE.starts = starts;
  BIBLE.total = n;
  BIBLE.meta = meta;
  return meta;
}
function verseCount(id, c) {
  const b = BIBLE.meta && BIBLE.meta.books[BOOK_INDEX[id].i];
  return b ? b[2][c - 1] || 0 : 0;
}
function bibleOrdinal(id, c, v) { return BIBLE.starts[id][c - 1] + v - 1; }
function bibleFromOrdinal(o) {
  const books = BIBLE.meta.books;
  let lo = 0, hi = books.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (BIBLE.starts[books[mid][0]][0] <= o) lo = mid; else hi = mid - 1; }
  const id = books[lo][0];
  const st = BIBLE.starts[id];
  let c = st.length - 1;
  while (c > 0 && st[c] > o) c--;
  return { book: id, c: c + 1, v: o - st[c] + 1 };
}
async function bibleBook(id) {
  if (BIBLE.books[id]) return BIBLE.books[id];
  return (BIBLE.books[id] = await bibleFetchJson(`kjv/${id}.json`));
}
async function biblePlain() {
  if (BIBLE.plain) return BIBLE.plain;
  if (!bibleLoading.plain) {
    bibleLoading.plain = Promise.all([bibleMeta(), fetch(`bible/kjv-plain.txt?v=${BIBLE_DATA_VERSION}`).then((r) => { if (!r.ok) throw new Error("load"); return r.text(); })])
      .then(([, t]) => (BIBLE.plain = t.replace(/\n$/, "").split("\n")))
      .catch(() => { delete bibleLoading.plain; throw new Error("Couldn't load the Bible text. Check your internet connection and try again."); });
  }
  return bibleLoading.plain;
}
function strongsGroup(code) { return code[0] + Math.floor(parseInt(code.slice(1), 10) / 1000); }
async function strongsEntry(code) {
  const g = strongsGroup(code);
  if (!BIBLE.lex[g]) BIBLE.lex[g] = await bibleFetchJson(`lex/${g}.json`);
  return BIBLE.lex[g][code] || null;
}
function normStrongs(s) {
  const m = String(s || "").trim().match(/^([GHgh])0*(\d{1,4})$/);
  return m ? m[1].toUpperCase() + m[2] : null;
}

// --- Turning a verse into HTML -------------------------------------------
function kjvPlain(text) { return String(text).replace(/\[[GH]\d+\]/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim(); }
function kjvItalicHtml(text) {
  return esc(text).replace(/\{/g, '<i class="kjv-it">').replace(/\}/g, "</i>");
}
// Splits a tagged verse into [{ text, codes }] runs.
function kjvSegments(text) {
  const out = [];
  const re = /([^\[]*?)((?:\[[GH]\d+\])+)/g;
  let m, last = 0;
  while ((m = re.exec(text))) {
    out.push({ text: m[1], codes: m[2].match(/[GH]\d+/g) });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last), codes: null });
  return out;
}
// opts.numbers: show the Strong's numbers after each word.
// opts.mark: a Strong's code whose words are shown in bold.
function kjvVerseHtml(text, opts = {}) {
  let html = "";
  let openItalic = false;
  kjvSegments(text).forEach(({ text: t, codes }) => {
    if (!t.trim()) { if (codes && opts.numbers) html += `<sup class="sn">${codes.join(" ")}</sup>`; return; }
    // Keep leading spaces / trailing punctuation outside the tappable word.
    const m = t.match(/^(\s*)(.*?)([\s,.;:?!)'"—-]*)$/s);
    const lead = m[1], core = m[2], trail = m[3];
    const italic = (s) => {
      let r = "";
      for (const ch of s) {
        if (ch === "{") { r += '<i class="kjv-it">'; openItalic = true; }
        else if (ch === "}") { r += "</i>"; openItalic = false; }
        else r += esc(ch);
      }
      return r;
    };
    if (!codes) { html += italic(t); return; }
    const marked = opts.mark && codes.includes(opts.mark);
    html += italic(lead);
    const wasOpen = openItalic;
    const inner = italic(core);
    const close = openItalic && !wasOpen ? "</i>" : "";
    const reopen = openItalic && !wasOpen ? '<i class="kjv-it">' : "";
    html += `<span class="sw${marked ? " sw-mark" : ""}" data-s="${codes.join(" ")}" tabindex="0" role="button">${inner}${close}</span>${reopen}`;
    if (opts.numbers) html += `<sup class="sn">${codes.join(" ")}</sup>`;
    html += italic(trail);
  });
  if (openItalic) html += "</i>";
  return html;
}

// --- Searching --------------------------------------------------------------
// mode: "all" (every word, any order), "phrase", "any". Words may end in *
// ("believ*"). scope: "all" | "ot" | "nt" | a book id.
function bibleSearchRegexes(query, mode) {
  const words = String(query).toLowerCase().replace(/[^a-z0-9'* ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const wordRe = (w) => w.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z']*");
  if (mode === "phrase") return { all: [new RegExp("\\b" + words.map(wordRe).join("[^a-z0-9]+") + "\\b", "gi")], words };
  const res = words.map((w) => new RegExp("\\b" + wordRe(w) + "\\b", "gi"));
  return mode === "any" ? { any: res, words } : { all: res, words };
}
async function bibleSearch(query, mode = "all", scope = "all") {
  const lines = await biblePlain();
  const rx = bibleSearchRegexes(query, mode);
  if (!rx) return [];
  let from = 0, to = lines.length;
  if (scope === "ot") to = BIBLE.starts.MAT[0];
  else if (scope === "nt") from = BIBLE.starts.MAT[0];
  else if (BOOK_INDEX[scope]) {
    from = BIBLE.starts[scope][0];
    const i = BOOK_INDEX[scope].i;
    to = i + 1 < BIBLE_BOOKS.length ? BIBLE.starts[BIBLE_BOOKS[i + 1][0]][0] : lines.length;
  }
  const hits = [];
  for (let o = from; o < to; o++) {
    const t = lines[o].replace(/[{}]/g, "");
    const ok = rx.all ? rx.all.every((r) => { r.lastIndex = 0; return r.test(t); }) : rx.any.some((r) => { r.lastIndex = 0; return r.test(t); });
    if (ok) hits.push(o);
  }
  return hits;
}
function markMatches(text, query, mode) {
  const rx = bibleSearchRegexes(query, mode);
  let html = kjvItalicHtml(text);
  if (!rx) return html;
  (rx.all || rx.any).forEach((r) => {
    const g = new RegExp(r.source, "gi");
    html = html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, txt) => tag || txt.replace(g, (w) => `<mark>${w}</mark>`));
  });
  return html;
}

// Text of a parsed reference, as passages: [{ label, verses: [{ v, c, text }] }].
async function biblePassages(ranges) {
  await bibleMeta();
  const lines = await biblePlain();
  return ranges.map((r) => {
    const lastCh = r.c2 || r.c1;
    const v1 = r.v1 || 1;
    const v2 = r.v2 || verseCount(r.book, lastCh);
    const verses = [];
    for (let c = r.c1; c <= lastCh; c++) {
      const max = verseCount(r.book, c);
      const s = c === r.c1 ? v1 : 1;
      const e = c === lastCh ? Math.min(v2, max) : max;
      for (let v = s; v <= e; v++) verses.push({ c, v, text: lines[bibleOrdinal(r.book, c, v)] });
    }
    let label;
    if (!r.v1) label = r.c1 === lastCh ? bibleRefLabel(r.book, r.c1) : `${BOOK_INDEX[r.book].name} ${r.c1}–${lastCh}`;
    else if (r.c1 === lastCh) label = bibleRefLabel(r.book, r.c1, v1, Math.min(v2, verseCount(r.book, lastCh)));
    else label = `${bibleBookLabel(r.book, true)} ${r.c1}:${v1}–${lastCh}:${v2}`;
    return { book: r.book, label, verses };
  }).filter((p) => p.verses.length);
}

// ===========================================================================
// The Study Bible page
// ===========================================================================
let sbBookId = "JHN";
let sbChapter = 3;
let sbMode = "read"; // read | search | highlights | concordance
let sbScrollToVerse = null;
let sbFlashVerse = null;
let sbLoadToken = 0;
let sbSearch = { q: "", mode: "all", scope: "all", hits: null, shown: 50, book: "" };
let sbConc = { code: null, book: "", shown: 40 };
let sbPanel = null; // { kind: "word", codes, i, back: [] } | { kind: "xref", key }
let sbOpenVerse = null; // verse number whose action bar is open
const SB_PREFS_KEY = "tnbbi-bible-prefs";
let sbPrefs = { numbers: false, size: 0 };
try { Object.assign(sbPrefs, JSON.parse(localStorage.getItem(SB_PREFS_KEY) || "{}")); } catch (e) { /* fine */ }
function saveSbPrefs() { try { localStorage.setItem(SB_PREFS_KEY, JSON.stringify(sbPrefs)); } catch (e) { /* fine */ } }

function highlightedKeys() {
  const set = {};
  bibleHighlightRows.forEach((r) => { set[r.verse_key] = true; });
  return set;
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
function sbGoto(main, book, c, v) {
  sbBookId = book; sbChapter = c; sbMode = "read";
  sbScrollToVerse = v || null; sbFlashVerse = v || null; sbOpenVerse = null;
  renderStudyBible(main);
  if (!v) { const r = document.getElementById("sbReading"); if (r) r.scrollIntoView({ block: "start" }); }
}

function renderStudyBible(main) {
  const book = BOOK_INDEX[sbBookId] || BOOK_INDEX.JHN;
  if (sbChapter > book.chapters) sbChapter = book.chapters;
  const hlCount = bibleHighlightRows.length;
  const sizeCls = sbPrefs.size > 0 ? " sb-size-lg" : sbPrefs.size < 0 ? " sb-size-sm" : "";

  main.innerHTML = `
    <button class="back-link" id="backLink">&larr; Back to Dashboard</button>
    <div class="page-header">
      <div class="eyebrow">${role === "student" ? "Student Dashboard" : "Faculty & Admin"}</div>
      <h1>Study Bible</h1>
      <p>The King James Version with Strong's Concordance — every word, every occurrence, with cross references.</p>
    </div>
    <form class="sb-searchbar card" id="sbSearchForm" role="search">
      <span class="sb-search-icon">${icon("search")}</span>
      <input id="sbQuery" type="search" autocomplete="off" spellcheck="false" placeholder="A reference (Rom 8:28), words (grace through faith), or a Strong's number (G26)" value="${esc(sbMode === "search" ? sbSearch.q : sbMode === "concordance" ? sbConc.code || "" : "")}" aria-label="Search the Bible">
      <select id="sbSearchMode" aria-label="How to match words">
        <option value="all" ${sbSearch.mode === "all" ? "selected" : ""}>All words</option>
        <option value="phrase" ${sbSearch.mode === "phrase" ? "selected" : ""}>Exact phrase</option>
        <option value="any" ${sbSearch.mode === "any" ? "selected" : ""}>Any word</option>
      </select>
      <select id="sbSearchScope" aria-label="Where to search">
        <option value="all" ${sbSearch.scope === "all" ? "selected" : ""}>Whole Bible</option>
        <option value="ot" ${sbSearch.scope === "ot" ? "selected" : ""}>Old Testament</option>
        <option value="nt" ${sbSearch.scope === "nt" ? "selected" : ""}>New Testament</option>
        <option value="${book.id}" ${sbSearch.scope === book.id ? "selected" : ""}>${esc(book.name)} only</option>
      </select>
      <button class="btn btn-primary btn-sm" type="submit">Search</button>
    </form>
    <div class="sb-toolbar">
      <select id="sbBook" aria-label="Book">
        <optgroup label="Old Testament">${BIBLE_BOOKS.slice(0, 39).map(([id, name]) => `<option value="${id}" ${id === book.id ? "selected" : ""}>${name}</option>`).join("")}</optgroup>
        <optgroup label="New Testament">${BIBLE_BOOKS.slice(39).map(([id, name]) => `<option value="${id}" ${id === book.id ? "selected" : ""}>${name}</option>`).join("")}</optgroup>
      </select>
      <select id="sbChapter" aria-label="Chapter">${Array.from({ length: book.chapters }, (_, i) => `<option value="${i + 1}" ${i + 1 === sbChapter ? "selected" : ""}>${book.id === "PSA" ? "Psalm" : "Chapter"} ${i + 1}</option>`).join("")}</select>
      <div class="sb-toolbar-spacer"></div>
      <label class="sb-switch" title="Show the Strong's number after each word"><input type="checkbox" id="sbNumbers" ${sbPrefs.numbers ? "checked" : ""}> Strong's numbers</label>
      <div class="sb-size" role="group" aria-label="Text size">
        <button type="button" data-size="-1" class="${sbPrefs.size < 0 ? "active" : ""}" aria-label="Smaller text">A</button>
        <button type="button" data-size="0" class="${sbPrefs.size === 0 ? "active" : ""}" aria-label="Normal text">A</button>
        <button type="button" data-size="1" class="${sbPrefs.size > 0 ? "active" : ""}" aria-label="Larger text">A</button>
      </div>
      <button class="btn btn-ghost btn-sm ${sbMode === "highlights" ? "active" : ""}" id="sbToggleHighlights" type="button">${sbMode === "highlights" ? "&larr; Back to Reading" : `★ My Highlights (${hlCount})`}</button>
    </div>
    <div class="sb-featured-row" aria-label="Featured passages">
      ${STUDY_BIBLE_FEATURED.map((f, i) => `<button type="button" class="sb-chip ${sbMode === "read" && f.book === book.id && f.chapter === sbChapter ? "active" : ""}" data-feat="${i}" title="${esc(f.blurb)}">${esc(f.label)}</button>`).join("")}
    </div>
    <div class="sb-layout ${sbPanel ? "has-panel" : ""}">
      <div class="sb-reading card${sizeCls}" id="sbReading" aria-live="polite"></div>
      <aside class="sb-panel card" id="sbPanel" ${sbPanel ? "" : "hidden"} aria-label="Word study"></aside>
    </div>
  `;
  document.getElementById("backLink").addEventListener("click", () => { view = "home"; renderNav(); renderMain(); });
  document.getElementById("sbSearchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    sbRunQuery(main, document.getElementById("sbQuery").value, document.getElementById("sbSearchMode").value, document.getElementById("sbSearchScope").value);
  });
  document.getElementById("sbToggleHighlights").addEventListener("click", () => { sbMode = sbMode === "highlights" ? "read" : "highlights"; renderStudyBible(main); });
  document.getElementById("sbBook").addEventListener("change", (e) => sbGoto(main, e.target.value, 1));
  document.getElementById("sbChapter").addEventListener("change", (e) => sbGoto(main, sbBookId, parseInt(e.target.value, 10) || 1));
  document.getElementById("sbNumbers").addEventListener("change", (e) => { sbPrefs.numbers = e.target.checked; saveSbPrefs(); const y = window.scrollY; renderStudyBible(main); window.scrollTo(0, y); });
  main.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => { sbPrefs.size = parseInt(b.dataset.size, 10); saveSbPrefs(); const y = window.scrollY; renderStudyBible(main); window.scrollTo(0, y); }));
  main.querySelectorAll("[data-feat]").forEach((b) => b.addEventListener("click", () => {
    const f = STUDY_BIBLE_FEATURED[parseInt(b.dataset.feat, 10)];
    sbGoto(main, f.book, f.chapter, f.verse > 1 ? f.verse : null);
  }));

  // The top bar is sticky; keep the study panel (and verses we scroll to)
  // clear of it, however tall it is on this screen.
  const nav = document.getElementById("topNav");
  if (nav) document.documentElement.style.setProperty("--nav-h", (getComputedStyle(nav).position === "sticky" ? nav.offsetHeight : 0) + "px");
  renderSbPanel(main);
  const wrap = document.getElementById("sbReading");
  if (sbMode === "highlights") return renderSbHighlights(main, wrap);
  if (sbMode === "search") return renderSbSearch(main, wrap);
  if (sbMode === "concordance") return renderSbConcordance(main, wrap);
  renderSbChapter(main, wrap, book);
}

function sbRunQuery(main, raw, mode, scope) {
  const q = String(raw || "").trim();
  if (!q) return;
  const code = normStrongs(q);
  if (code) { sbMode = "concordance"; sbConc = { code, book: "", shown: 40 }; openWordPanel(main, [code]); return; }
  const ref = !/^".*"$/.test(q) && parseBibleReference(q);
  if (ref) { const r = ref[0]; sbGoto(main, r.book, r.c1, r.v1); return; }
  const phrase = /^".*"$/.test(q);
  sbSearch = { q: phrase ? q.slice(1, -1) : q, mode: phrase ? "phrase" : mode, scope, hits: null, shown: 50, book: "" };
  sbMode = "search";
  renderStudyBible(main);
}

// Wires every tappable word and verse control inside `root`.
function wireSbWords(main, root) {
  root.querySelectorAll(".sw").forEach((el) => {
    const open = () => openWordPanel(main, el.dataset.s.split(" "));
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
}

function renderSbChapter(main, wrap, book) {
  const token = ++sbLoadToken;
  const heading = `${book.id === "PSA" ? "Psalm" : book.name} ${sbChapter}`;
  wrap.innerHTML = `<div class="sb-chapter-head"><h2>${esc(heading)}</h2></div><p class="sb-loading">Loading…</p>`;
  Promise.all([bibleMeta(), bibleBook(book.id)]).then(([, data]) => {
    if (token !== sbLoadToken || view !== "studyBible" || sbMode !== "read") return;
    const ch = data.chapters[sbChapter - 1];
    const hl = highlightedKeys();
    const prev = prevChapter(book.id, sbChapter);
    const next = nextChapter(book.id, sbChapter);
    wrap.innerHTML = `
      <div class="sb-chapter-head">
        <h2>${esc(heading)}</h2>
        <span class="field-hint">Tap any word for its Hebrew or Greek · tap a verse number for cross references, highlight, and copy</span>
      </div>
      ${ch.t ? `<p class="sb-psalm-title">${kjvVerseHtml(ch.t, { numbers: sbPrefs.numbers })}</p>` : ""}
      <div class="sb-verses">
      ${ch.v.map((t, i) => {
        const n = i + 1;
        const key = `${book.id}.${sbChapter}.${n}`;
        const refs = ch.x && ch.x[n] ? ch.x[n].split(" ").length : 0;
        return `
        <div class="verse-row ${hl[key] ? "verse-highlighted" : ""} ${sbFlashVerse === n ? "verse-flash" : ""}" id="verse-${n}" data-v="${n}">
          <button type="button" class="verse-num" data-vn="${n}" aria-expanded="${sbOpenVerse === n}" aria-label="Verse ${n} options">${n}</button>
          <div class="verse-text">${kjvVerseHtml(t, { numbers: sbPrefs.numbers })}${ch.p && ch.p[n] ? `<div class="sb-subscription">${esc(ch.p[n])}</div>` : ""}</div>
          <div class="verse-actions" ${sbOpenVerse === n ? "" : "hidden"}>
            <button type="button" class="verse-act-btn ${hl[key] ? "active" : ""}" data-hl="${key}" aria-pressed="${!!hl[key]}">${hl[key] ? "★ Highlighted" : "☆ Highlight"}</button>
            <button type="button" class="verse-act-btn" data-copy="${key}">⧉ Copy</button>
            <button type="button" class="verse-act-btn" data-xref="${key}" ${refs ? "" : "disabled"}>⇄ Cross references${refs ? ` (${refs})` : ""}</button>
          </div>
        </div>`;
      }).join("")}
      </div>
      <div class="sb-chapter-nav">
        ${prev ? `<button class="btn btn-ghost btn-sm" data-chapter-nav="${prev.join(".")}">&larr; ${esc(bibleRefLabel(prev[0], prev[1]))}</button>` : "<span></span>"}
        ${next ? `<button class="btn btn-ghost btn-sm" data-chapter-nav="${next.join(".")}">${esc(bibleRefLabel(next[0], next[1]))} &rarr;</button>` : "<span></span>"}
      </div>
      <p class="field-hint sb-credits">King James Version (1769), public domain. Strong's Concordance numbers and dictionaries (James Strong, 1890; Open Scriptures edition). Cross references from OpenBible.info. Words in <i class="kjv-it">italics</i> were supplied by the translators.</p>
    `;
    sbFlashVerse = null;
    wireSbWords(main, wrap);
    wrap.querySelectorAll("[data-vn]").forEach((b) => b.addEventListener("click", () => {
      const n = parseInt(b.dataset.vn, 10);
      sbOpenVerse = sbOpenVerse === n ? null : n;
      wrap.querySelectorAll(".verse-row").forEach((row) => {
        const open = parseInt(row.dataset.v, 10) === sbOpenVerse;
        row.querySelector(".verse-actions").hidden = !open;
        row.querySelector(".verse-num").setAttribute("aria-expanded", open);
      });
    }));
    wrap.querySelectorAll("[data-chapter-nav]").forEach((b) => b.addEventListener("click", () => {
      const [bk, c] = b.dataset.chapterNav.split(".");
      sbGoto(main, bk, parseInt(c, 10));
    }));
    wireVerseButtons(main, wrap, (key) => {
      const n = parseInt(key.split(".")[2], 10);
      return { reference: bibleRefLabel(book.id, sbChapter, n), text: kjvPlain(ch.v[n - 1]) };
    });
    if (sbScrollToVerse) {
      const el = document.getElementById("verse-" + sbScrollToVerse);
      sbScrollToVerse = null;
      if (el) el.scrollIntoView({ block: "center" });
    }
  }).catch((err) => {
    if (token !== sbLoadToken) return;
    wrap.innerHTML = `<div class="sb-chapter-head"><h2>${esc(heading)}</h2></div>
      <div class="warning-box">${icon("warning")}<p>${esc(err.message)}</p></div>
      <button class="btn btn-primary btn-sm" id="sbRetry">Try Again</button>`;
    document.getElementById("sbRetry").addEventListener("click", () => renderStudyBible(main));
  });
}

function wireVerseButtons(main, wrap, lookup) {
  const hl = highlightedKeys();
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
      }, () => { const y = window.scrollY; sbOpenVerse = parseInt(key.split(".")[2], 10); renderStudyBible(main); window.scrollTo(0, y); }, { reload: false });
    });
  });
  wrap.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = lookup(btn.dataset.copy);
      if (!v) return;
      const text = `"${v.text}" (${v.reference}, KJV)`;
      const label = btn.textContent;
      const done = () => { btn.textContent = "✓ Copied"; setTimeout(() => { btn.textContent = label; }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => toast("Couldn't copy — select the verse text instead."));
      else toast("Copying isn't supported in this browser — select the verse text instead.");
    });
  });
  wrap.querySelectorAll("[data-xref]").forEach((btn) => btn.addEventListener("click", () => {
    sbPanel = { kind: "xref", key: btn.dataset.xref };
    renderSbPanel(main, true);
  }));
}

function renderSbHighlights(main, wrap) {
  const rows = [...bibleHighlightRows].sort((a, b) => verseOrder(a.verse_key) - verseOrder(b.verse_key));
  wrap.innerHTML = rows.length === 0
    ? `<div class="empty-state"><div class="icon-badge" style="margin:0 auto 14px;">${icon("note")}</div><p>No highlighted verses yet — tap a verse number while reading, then ☆ Highlight.</p></div>`
    : `<div class="sb-chapter-head"><h2>My Highlights</h2><span class="field-hint">${rows.length} verse${rows.length === 1 ? "" : "s"}</span></div>` + rows.map((r) => `
        <div class="verse-row verse-highlighted">
          <div class="verse-ref"><a href="#" data-goto-verse="${r.verse_key}">${esc(r.reference)}</a></div>
          <div class="verse-text">${esc(r.verse_text)}</div>
          <div class="verse-actions">
            <button type="button" class="verse-act-btn active" data-hl="${r.verse_key}" aria-pressed="true">★ Highlighted</button>
            <button type="button" class="verse-act-btn" data-copy="${r.verse_key}">⧉ Copy</button>
          </div>
        </div>`).join("");
  wireVerseButtons(main, wrap, (key) => {
    const r = bibleHighlightRows.find((x) => x.verse_key === key);
    return r ? { reference: r.reference, text: r.verse_text } : null;
  });
  wrap.querySelectorAll("[data-goto-verse]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    const [b, c, v] = a.dataset.gotoVerse.split(".");
    sbGoto(main, b, parseInt(c, 10), parseInt(v, 10));
  }));
}

function renderSbSearch(main, wrap) {
  const s = sbSearch;
  const token = ++sbLoadToken;
  wrap.innerHTML = `<div class="sb-chapter-head"><h2>Search</h2></div><p class="sb-loading">Searching the whole Bible…</p>`;
  const go = s.hits ? Promise.resolve(s.hits) : bibleSearch(s.q, s.mode, s.scope);
  go.then((hits) => {
    if (token !== sbLoadToken || sbMode !== "search") return;
    s.hits = hits;
    const byBook = {};
    hits.forEach((o) => { const r = bibleFromOrdinal(o); byBook[r.book] = (byBook[r.book] || 0) + 1; });
    const list = s.book ? hits.filter((o) => bibleFromOrdinal(o).book === s.book) : hits;
    const shown = list.slice(0, s.shown);
    const modeLabel = { all: "all of the words", phrase: "the exact phrase", any: "any of the words" }[s.mode];
    wrap.innerHTML = `
      <div class="sb-chapter-head">
        <h2>“${esc(s.q)}”</h2>
        <span class="field-hint">${hits.length.toLocaleString()} verse${hits.length === 1 ? "" : "s"} with ${modeLabel}${s.scope === "ot" ? " · Old Testament" : s.scope === "nt" ? " · New Testament" : BOOK_INDEX[s.scope] ? " · " + esc(BOOK_INDEX[s.scope].name) : ""}</span>
      </div>
      ${hits.length ? `<div class="sb-book-filter">
        <button type="button" class="sb-chip ${!s.book ? "active" : ""}" data-sbook="">All books</button>
        ${Object.keys(byBook).map((b) => `<button type="button" class="sb-chip ${s.book === b ? "active" : ""}" data-sbook="${b}">${esc(BOOK_INDEX[b].name)} <span>${byBook[b]}</span></button>`).join("")}
      </div>` : `<p>No verses matched. Try fewer words, “Any word”, or a word ending like <strong>believ*</strong>.</p>`}
      <div class="sb-results">
        ${shown.map((o) => {
          const r = bibleFromOrdinal(o);
          return `<div class="sb-result"><a href="#" class="sb-result-ref" data-o="${o}">${esc(bibleRefLabel(r.book, r.c, r.v))}</a><div class="sb-result-text">${markMatches(BIBLE.plain[o], s.q, s.mode)}</div></div>`;
        }).join("")}
      </div>
      ${list.length > shown.length ? `<button class="btn btn-ghost btn-sm" id="sbMore" style="margin-top:12px;">Show more (${(list.length - shown.length).toLocaleString()} left)</button>` : ""}
    `;
    wrap.querySelectorAll("[data-sbook]").forEach((b) => b.addEventListener("click", () => { s.book = b.dataset.sbook; s.shown = 50; renderSbSearch(main, wrap); }));
    wrap.querySelectorAll("[data-o]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const r = bibleFromOrdinal(parseInt(a.dataset.o, 10));
      sbGoto(main, r.book, r.c, r.v);
    }));
    const more = document.getElementById("sbMore");
    if (more) more.addEventListener("click", () => { s.shown += 100; const y = window.scrollY; renderSbSearch(main, wrap); window.scrollTo(0, y); });
  }).catch((err) => {
    if (token !== sbLoadToken) return;
    wrap.innerHTML = `<div class="warning-box">${icon("warning")}<p>${esc(err.message)}</p></div>`;
  });
}

// Every verse where a Strong's word appears, with the KJV word in bold.
function renderSbConcordance(main, wrap) {
  const code = sbConc.code;
  const token = ++sbLoadToken;
  wrap.innerHTML = `<div class="sb-chapter-head"><h2>${esc(code)}</h2></div><p class="sb-loading">Loading every occurrence…</p>`;
  Promise.all([bibleMeta(), strongsEntry(code)]).then(async ([, entry]) => {
    if (!entry) throw new Error(`There's no Strong's entry ${code}.`);
    const ords = entry.o ? entry.o.split(" ").map((x) => parseInt(x, 36)) : [];
    const byBook = {};
    ords.forEach((o) => { const r = bibleFromOrdinal(o); (byBook[r.book] = byBook[r.book] || []).push(r); });
    const books = Object.keys(byBook);
    const list = sbConc.book ? byBook[sbConc.book] || [] : ords.map((o) => bibleFromOrdinal(o));
    const shown = list.slice(0, sbConc.shown);
    const need = [...new Set(shown.map((r) => r.book))];
    await Promise.all(need.map((b) => bibleBook(b)));
    if (token !== sbLoadToken || sbMode !== "concordance") return;
    wrap.innerHTML = `
      <div class="sb-chapter-head">
        <h2><span class="${code[0] === "H" ? "lang-he" : "lang-grc"}" lang="${code[0] === "H" ? "he" : "grc"}">${esc(entry.w)}</span> <span class="sb-head-code">${esc(code)}</span></h2>
        <span class="field-hint">${esc(entry.x)} · in ${ords.length.toLocaleString()} verse${ords.length === 1 ? "" : "s"} of the KJV</span>
      </div>
      ${books.length > 1 ? `<div class="sb-book-filter">
        <button type="button" class="sb-chip ${!sbConc.book ? "active" : ""}" data-cbook="">All books</button>
        ${books.map((b) => `<button type="button" class="sb-chip ${sbConc.book === b ? "active" : ""}" data-cbook="${b}">${esc(BOOK_INDEX[b].name)} <span>${byBook[b].length}</span></button>`).join("")}
      </div>` : ""}
      <div class="sb-results">
        ${shown.map((r) => `<div class="sb-result"><a href="#" class="sb-result-ref" data-goto="${r.book}.${r.c}.${r.v}">${esc(bibleRefLabel(r.book, r.c, r.v))}</a><div class="sb-result-text">${kjvVerseHtml(BIBLE.books[r.book].chapters[r.c - 1].v[r.v - 1], { mark: code, numbers: sbPrefs.numbers })}</div></div>`).join("")}
      </div>
      ${list.length > shown.length ? `<button class="btn btn-ghost btn-sm" id="sbMore" style="margin-top:12px;">Show more (${(list.length - shown.length).toLocaleString()} left)</button>` : ""}
    `;
    wireSbWords(main, wrap);
    wrap.querySelectorAll("[data-cbook]").forEach((b) => b.addEventListener("click", () => { sbConc.book = b.dataset.cbook; sbConc.shown = 40; renderSbConcordance(main, wrap); }));
    wrap.querySelectorAll("[data-goto]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const [b, c, v] = a.dataset.goto.split(".");
      sbGoto(main, b, parseInt(c, 10), parseInt(v, 10));
    }));
    const more = document.getElementById("sbMore");
    if (more) more.addEventListener("click", () => { sbConc.shown += 60; const y = window.scrollY; renderSbConcordance(main, wrap); window.scrollTo(0, y); });
  }).catch((err) => {
    if (token !== sbLoadToken) return;
    wrap.innerHTML = `<div class="warning-box">${icon("warning")}<p>${esc(err.message)}</p></div>`;
  });
}

// --- The study panel (word study / cross references) ---------------------
function openWordPanel(main, codes, keepBack) {
  const back = sbPanel && sbPanel.kind === "word" && keepBack ? [...sbPanel.back, { codes: sbPanel.codes, i: sbPanel.i }] : [];
  sbPanel = { kind: "word", codes, i: 0, back };
  if (sbMode === "concordance" && !keepBack) { renderStudyBible(main); return; }
  renderSbPanel(main, true);
}
function closeSbPanel(main) {
  sbPanel = null;
  const p = document.getElementById("sbPanel");
  if (p) { p.hidden = true; p.innerHTML = ""; }
  const l = main.querySelector(".sb-layout");
  if (l) l.classList.remove("has-panel");
  document.body.classList.remove("sb-sheet-open");
}
// Turns "from G25 (ἀγαπάω)" into tappable Strong's links.
function linkStrongs(text) {
  return esc(String(text || "").replace(/[{}]/g, "")).replace(/\b([GH])(\d{1,4})\b/g, (m, l, n) => `<a href="#" class="sn-link" data-code="${l}${parseInt(n, 10)}">${l}${n}</a>`);
}
function renderSbPanel(main, focus) {
  const p = document.getElementById("sbPanel");
  if (!p) return;
  const layout = main.querySelector(".sb-layout");
  if (!sbPanel) { p.hidden = true; if (layout) layout.classList.remove("has-panel"); return; }
  p.hidden = false;
  if (layout) layout.classList.add("has-panel");
  document.body.classList.toggle("sb-sheet-open", window.matchMedia("(max-width: 900px)").matches);
  const closeBtn = `<button type="button" class="sb-panel-close" id="sbPanelClose" aria-label="Close">×</button>`;
  p.innerHTML = `${closeBtn}<p class="sb-loading">Loading…</p>`;
  const wireClose = () => document.getElementById("sbPanelClose").addEventListener("click", () => closeSbPanel(main));
  wireClose();
  if (focus && window.matchMedia("(min-width: 901px)").matches) {
    const r = p.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight) p.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  if (sbPanel.kind === "xref") return renderXrefPanel(main, p, closeBtn, wireClose);

  const state = sbPanel;
  const code = state.codes[state.i];
  strongsEntry(code).then((e) => {
    if (sbPanel !== state) return;
    if (!e) { p.innerHTML = `${closeBtn}<p>No dictionary entry for ${esc(code)}.</p>`; wireClose(); return; }
    const heb = code[0] === "H";
    const occ = e.o ? e.o.split(" ").length : 0;
    const total = (e.r || []).reduce((n, [, c]) => n + c, 0);
    p.innerHTML = `
      ${closeBtn}
      ${state.back.length ? `<button type="button" class="sb-panel-back" id="sbPanelBack">&larr; Back</button>` : ""}
      ${state.codes.length > 1 ? `<div class="sb-code-tabs">${state.codes.map((c, i) => `<button type="button" class="${i === state.i ? "active" : ""}" data-ci="${i}">${c}</button>`).join("")}</div>` : ""}
      <div class="strongs-code">${esc(code)} · ${heb ? "Hebrew" : "Greek"}</div>
      <div class="strongs-word ${heb ? "lang-he" : "lang-grc"}" lang="${heb ? "he" : "grc"}" dir="${heb ? "rtl" : "ltr"}">${esc(e.w)}</div>
      <div class="strongs-translit">${esc(e.x)}${e.p ? ` <span class="strongs-pron">(${esc(e.p)})</span>` : ""}</div>
      ${e.d ? `<h4>Definition</h4><p class="strongs-def">${linkStrongs(e.d)}</p>` : ""}
      ${e.dv ? `<h4>Origin</h4><p>${linkStrongs(e.dv)}</p>` : ""}
      ${e.k ? `<h4>KJV renders it</h4><p>${linkStrongs(e.k)}</p>` : ""}
      ${occ ? `
        <h4>In the KJV · ${occ.toLocaleString()} verse${occ === 1 ? "" : "s"}</h4>
        <div class="strongs-renderings">${(e.r || []).slice(0, 12).map(([w, c]) => `<span class="strongs-rendering"><strong>${esc(w)}</strong> ${c}×</span>`).join("")}</div>
        ${total ? `<div class="strongs-bars">${(e.r || []).slice(0, 5).map(([w, c]) => `<div class="strongs-bar"><span>${esc(w)}</span><div><i style="width:${Math.max(3, Math.round((c / total) * 100))}%"></i></div></div>`).join("")}</div>` : ""}
        <button class="btn btn-primary btn-sm" id="sbSeeAll" type="button" style="margin-top:12px;">See every occurrence &rarr;</button>
      ` : `<p class="field-hint">Not found in the tagged KJV text.</p>`}
      <p class="field-hint" style="margin-top:14px;">Strong's Exhaustive Concordance (1890). Tap a G/H number to study a related word.</p>
    `;
    wireClose();
    const back = document.getElementById("sbPanelBack");
    if (back) back.addEventListener("click", () => { const prev = state.back[state.back.length - 1]; sbPanel = { kind: "word", codes: prev.codes, i: prev.i, back: state.back.slice(0, -1) }; renderSbPanel(main); });
    p.querySelectorAll("[data-ci]").forEach((b) => b.addEventListener("click", () => { state.i = parseInt(b.dataset.ci, 10); renderSbPanel(main); }));
    p.querySelectorAll(".sn-link").forEach((a) => a.addEventListener("click", (ev) => { ev.preventDefault(); openWordPanel(main, [a.dataset.code], true); }));
    const all = document.getElementById("sbSeeAll");
    if (all) all.addEventListener("click", () => {
      sbMode = "concordance"; sbConc = { code, book: "", shown: 40 };
      if (window.matchMedia("(max-width: 900px)").matches) sbPanel = null;
      renderStudyBible(main);
      document.getElementById("sbReading").scrollIntoView({ block: "start" });
    });
  }).catch((err) => { p.innerHTML = `${closeBtn}<div class="warning-box">${icon("warning")}<p>${esc(err.message)}</p></div>`; wireClose(); });
}

function renderXrefPanel(main, p, closeBtn, wireClose) {
  const state = sbPanel;
  const [b, c, v] = state.key.split(".");
  Promise.all([bibleBook(b), biblePlain()]).then(([data, lines]) => {
    if (sbPanel !== state) return;
    const raw = (data.chapters[parseInt(c, 10) - 1].x || {})[v] || "";
    const refs = raw.split(" ").filter(Boolean).map((s) => {
      const [a, z] = s.split("-").map((x) => parseInt(x, 36));
      const from = bibleFromOrdinal(a), to = bibleFromOrdinal(z || a);
      const label = !z || z === a ? bibleRefLabel(from.book, from.c, from.v)
        : from.c === to.c ? bibleRefLabel(from.book, from.c, from.v, to.v) : `${bibleBookLabel(from.book, true)} ${from.c}:${from.v}–${to.c}:${to.v}`;
      const texts = [];
      for (let o = a; o <= (z || a) && o < a + 4; o++) texts.push(lines[o]);
      return { from, label, text: texts.join(" ") + ((z || a) - a >= 4 ? " …" : "") };
    });
    p.innerHTML = `
      ${closeBtn}
      <div class="strongs-code">Cross references</div>
      <h3 class="sb-xref-title">${esc(bibleRefLabel(b, parseInt(c, 10), parseInt(v, 10)))}</h3>
      <p class="sb-xref-verse">${kjvItalicHtml(lines[bibleOrdinal(b, parseInt(c, 10), parseInt(v, 10))])}</p>
      ${refs.length ? refs.map((r) => `<div class="sb-xref"><a href="#" data-xgo="${r.from.book}.${r.from.c}.${r.from.v}">${esc(r.label)}</a><div>${kjvItalicHtml(r.text)}</div></div>`).join("") : "<p>No cross references for this verse.</p>"}
      <p class="field-hint" style="margin-top:14px;">Cross references from OpenBible.info, strongest first.</p>
    `;
    wireClose();
    p.querySelectorAll("[data-xgo]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const [bb, cc, vv] = a.dataset.xgo.split(".");
      if (window.matchMedia("(max-width: 900px)").matches) sbPanel = null;
      sbGoto(main, bb, parseInt(cc, 10), parseInt(vv, 10));
    }));
  }).catch((err) => { p.innerHTML = `${closeBtn}<div class="warning-box">${icon("warning")}<p>${esc(err.message)}</p></div>`; wireClose(); });
}
