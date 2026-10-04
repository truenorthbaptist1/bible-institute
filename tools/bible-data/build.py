#!/usr/bin/env python3
"""Builds the Study Bible's static data files in docs/bible/.

Run once (re-run only if the sources change). Everything it produces is
plain JSON/text served by GitHub Pages, so the Study Bible needs no outside
service at all.

Sources (all public domain or openly licensed):
  * KJV text with Strong's numbers and italics — github.com/kaiserlik/kjv
    (the KJV of 1769 is public domain). ~3,500 verses in that copy lost a
    few words at the very end; those endings are restored from the plain
    KJV in github.com/scrollmapper/bible_databases (checked word-for-word:
    every other verse matches apart from Caesar/Cesar-type spellings).
  * Strong's Hebrew & Greek dictionaries (1890, public domain) in the
    Open Scriptures edition — github.com/openscriptures/strongs (CC BY-SA).
  * Cross references — OpenBible.info (CC BY), via scrollmapper; the best
    15 per verse are stored inside each book file.

Usage:
  python3 tools/bible-data/build.py <kaiserlik-kjv dir> <scrollmapper dir> <openscriptures-strongs dir> docs/bible
"""
import csv, glob, json, os, re, sys, collections

KJV_DIR, SM_DIR, STRONGS_DIR, OUT = sys.argv[1:5]

BOOKS = [  # id, name, kaiserlik abbreviation
    ("GEN", "Genesis", "Gen"), ("EXO", "Exodus", "Exo"), ("LEV", "Leviticus", "Lev"), ("NUM", "Numbers", "Num"),
    ("DEU", "Deuteronomy", "Deu"), ("JOS", "Joshua", "Jos"), ("JDG", "Judges", "Jdg"), ("RUT", "Ruth", "Rth"),
    ("1SA", "1 Samuel", "1Sa"), ("2SA", "2 Samuel", "2Sa"), ("1KI", "1 Kings", "1Ki"), ("2KI", "2 Kings", "2Ki"),
    ("1CH", "1 Chronicles", "1Ch"), ("2CH", "2 Chronicles", "2Ch"), ("EZR", "Ezra", "Ezr"), ("NEH", "Nehemiah", "Neh"),
    ("EST", "Esther", "Est"), ("JOB", "Job", "Job"), ("PSA", "Psalms", "Psa"), ("PRO", "Proverbs", "Pro"),
    ("ECC", "Ecclesiastes", "Ecc"), ("SNG", "Song of Solomon", "Sng"), ("ISA", "Isaiah", "Isa"), ("JER", "Jeremiah", "Jer"),
    ("LAM", "Lamentations", "Lam"), ("EZK", "Ezekiel", "Eze"), ("DAN", "Daniel", "Dan"), ("HOS", "Hosea", "Hos"),
    ("JOL", "Joel", "Joe"), ("AMO", "Amos", "Amo"), ("OBA", "Obadiah", "Oba"), ("JON", "Jonah", "Jon"),
    ("MIC", "Micah", "Mic"), ("NAM", "Nahum", "Nah"), ("HAB", "Habakkuk", "Hab"), ("ZEP", "Zephaniah", "Zep"),
    ("HAG", "Haggai", "Hag"), ("ZEC", "Zechariah", "Zec"), ("MAL", "Malachi", "Mal"),
    ("MAT", "Matthew", "Mat"), ("MRK", "Mark", "Mar"), ("LUK", "Luke", "Luk"), ("JHN", "John", "Jhn"),
    ("ACT", "Acts", "Act"), ("ROM", "Romans", "Rom"), ("1CO", "1 Corinthians", "1Co"), ("2CO", "2 Corinthians", "2Co"),
    ("GAL", "Galatians", "Gal"), ("EPH", "Ephesians", "Eph"), ("PHP", "Philippians", "Phl"), ("COL", "Colossians", "Col"),
    ("1TH", "1 Thessalonians", "1Th"), ("2TH", "2 Thessalonians", "2Th"), ("1TI", "1 Timothy", "1Ti"), ("2TI", "2 Timothy", "2Ti"),
    ("TIT", "Titus", "Tit"), ("PHM", "Philemon", "Phm"), ("HEB", "Hebrews", "Heb"), ("JAS", "James", "Jas"),
    ("1PE", "1 Peter", "1Pe"), ("2PE", "2 Peter", "2Pe"), ("1JN", "1 John", "1Jo"), ("2JN", "2 John", "2Jo"),
    ("3JN", "3 John", "3Jo"), ("JUD", "Jude", "Jde"), ("REV", "Revelation", "Rev"),
]
ABBR_INDEX = {b[2]: i for i, b in enumerate(BOOKS)}
NAME_INDEX = {b[1]: i for i, b in enumerate(BOOKS)}
EPISTLES = set(range(44, 58))  # Romans .. Hebrews: subscriptions after the last verse

# ---- 1. Tagged KJV (parsed verse-by-verse: some files have broken JSON in
# their non-English fields, so only the "en" strings are read) ------------
pat = re.compile(r'"([1-3]?[A-Za-z]{2,3}\|\d+\|\d+)"\s*:\s*\{\s*"en"\s*:\s*"((?:[^"\\]|\\.)*)"')
raw = {}
for f in glob.glob(os.path.join(KJV_DIR, "*.json")):
    if os.path.basename(f) in ("books.json", "lexicon.json", "chapter_count.json"):
        continue
    for k, t in pat.findall(open(f, encoding="utf-8").read()):
        ab, c, v = k.split("|")
        raw[(ABBR_INDEX[ab], int(c), int(v))] = json.loads('"' + t + '"')
assert len(raw) == 31102, len(raw)

# ---- 2. Plain KJV for restoring lost verse endings -----------------------
ref = {}
order = []
for row in csv.DictReader(open(os.path.join(SM_DIR, "formats/csv/KJV.csv"), encoding="utf-8")):
    if row["Book"] not in order:
        order.append(row["Book"])
    ref[(order.index(row["Book"]), int(row["Chapter"]), int(row["Verse"]))] = row["Text"]


def plain(t):
    t = re.sub(r"\[[GH]\d+\]", "", t).replace("[fn]", "")
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"\s+", " ", t).strip()


def letters(s):
    return re.sub(r"[^a-z]", "", s.lower().replace("ae", "e"))


def clean_markup(t):
    t = t.replace("\xa0➔", "").replace("➔", "")
    t = t.replace("&#8212;", "—").replace("&#8212", "—").replace("&amp;", "&")
    t = re.sub(r"(\[[GH]\d+\])\1+", r"\1", t)          # "had[G2192][G2192]"
    t = t.replace("<em>", "{").replace("</em>", "}")    # italics (supplied words)
    t = t.replace("’", "'").replace("‘", "'")
    return re.sub(r"[ \t]+", " ", t).strip()


verses = {}   # key -> tagged string
titles = {}   # (book, chapter) -> Psalm title (tagged string)
posts = {}    # (book, chapter, verse) -> epistle subscription
restored = 0
for key, t in raw.items():
    t = clean_markup(t)
    had_fn = "[fn]" in t
    t = t.replace("[fn]", "")
    r = ref[key]
    a, b = letters(plain(t)), letters(r)
    if a != b and a and b.startswith(a):
        a_raw = re.sub(r"[^a-z]", "", plain(t).lower())
        r_raw = re.sub(r"[^a-z]", "", r.lower())
        pos = len(r)
        if r_raw.startswith(a_raw):
            n = 0
            for i, ch in enumerate(r):
                if ch.isascii() and ch.isalpha():
                    n += 1
                    if n == len(a_raw):
                        pos = i + 1
                        break
        else:  # spelling differs (Caesarea / Cesarea): align on the normalised form
            for i in range(1, len(r) + 1):
                if len(letters(r[:i])) == len(a) and r[i - 1].isalpha():
                    pos = i
                    break
        tail = r[pos:].replace("’", "'").replace("‘", "'")
        p = plain(t)
        while tail and not tail[0].isalnum() and not tail[0].isspace() and p.endswith(tail[0]):
            tail = tail[1:]
            p = p[:-1]
        if key[0] in EPISTLES and (had_fn or re.search(r"written|unto the|to the", tail, re.I)) and \
                key[1] == max(k[1] for k in raw if k[0] == key[0]) and \
                key[2] == max(k[2] for k in raw if k[0] == key[0] and k[1] == key[1]):
            posts[key] = tail.lstrip(". ").strip()
        else:
            t = t + tail
            restored += 1
    # Psalm titles: "[[A Psalm[H4210] of David.]][H1732] The LORD..."
    m = re.match(r"^\[\[(.*?)\]\]((?:\[[GH]\d+\])*)\s*", t)
    if m:
        titles[(key[0], key[1])] = (m.group(1) + m.group(2)).strip()
        t = t[m.end():]
    verses[key] = t.strip()
print("restored endings:", restored, "| subscriptions:", len(posts), "| psalm titles:", len(titles))

def b36(n):
    s = ""
    while True:
        n, r = divmod(n, 36)
        s = "0123456789abcdefghijklmnopqrstuvwxyz"[r] + s
        if n == 0:
            return s

# Verse ordinals (0..31101 in canonical order) used by every index.
ordinal = {}
for _k in sorted(verses):
    ordinal[_k] = len(ordinal)

# ---- 5. Cross references (OpenBible.info), best 15 per verse ------------
xr = collections.defaultdict(list)
row_re = re.compile(r"VALUES \('([^']+)', (\d+), (\d+), '([^']+)', (\d+), (\d+), (\d+), (-?\d+)\)")
for f in sorted(glob.glob(os.path.join(SM_DIR, "formats/sql/extras/cross_references_*.sql"))):
    for fb, fc, fv, tb, tc, ts, te, votes in row_re.findall(open(f, encoding="utf-8").read()):
        votes = int(votes)
        if votes < 1:
            continue
        a = (NAME_INDEX[fb], int(fc), int(fv))
        s = (NAME_INDEX[tb], int(tc), int(ts))
        e = (NAME_INDEX[tb], int(tc), int(te))
        if a not in ordinal or s not in ordinal or e not in ordinal:
            continue
        xr[a].append((votes, ordinal[s], ordinal[e]))
# ---- 3. Write one file per book + meta + plain text ----------------------
os.makedirs(os.path.join(OUT, "kjv"), exist_ok=True)
meta = {"books": []}
plain_lines = []
for bi, (bid, name, _) in enumerate(BOOKS):
    chapters = sorted({k[1] for k in verses if k[0] == bi})
    counts = []
    out = {"id": bid, "name": name, "chapters": []}
    for c in chapters:
        vs = sorted(k[2] for k in verses if k[0] == bi and k[1] == c)
        assert vs == list(range(1, len(vs) + 1)), (bid, c)
        counts.append(len(vs))
        ch = {"v": [verses[(bi, c, v)] for v in vs]}
        if (bi, c) in titles:
            ch["t"] = titles[(bi, c)]
        p = {str(v): posts[(bi, c, v)] for v in vs if (bi, c, v) in posts}
        if p:
            ch["p"] = p
        x = {}
        for v in vs:
            lst = sorted(xr.get((bi, c, v), []), key=lambda r: -r[0])[:15]
            if lst:
                x[str(v)] = " ".join(b36(s_) if s_ == e_ else f"{b36(s_)}-{b36(e_)}" for _, s_, e_ in lst)
        if x:
            ch["x"] = x
        out["chapters"].append(ch)
        for v in vs:
            assert ordinal[(bi, c, v)] == len(plain_lines)
            plain_lines.append(re.sub(r"\[[GH]\d+\]", "", verses[(bi, c, v)]).strip())
    meta["books"].append([bid, name, counts])
    with open(os.path.join(OUT, "kjv", bid + ".json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
with open(os.path.join(OUT, "kjv-plain.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(plain_lines) + "\n")

# ---- 4. Lexicon + concordance (every occurrence, every KJV rendering) ----
def load_js_dict(path):
    s = open(path, encoding="utf-8").read()
    return json.loads(s[s.index("{"): s.rindex("}") + 1])

heb = load_js_dict(os.path.join(STRONGS_DIR, "hebrew/strongs-hebrew-dictionary.js"))
grk = load_js_dict(os.path.join(STRONGS_DIR, "greek/strongs-greek-dictionary.js"))

occ = collections.defaultdict(list)          # strongs -> [ordinal]
renders = collections.defaultdict(collections.Counter)
seg_re = re.compile(r"([^\[]*?)((?:\[[GH]\d+\])+)")
# Little words the KJV prints before a tagged word but which aren't part of
# its rendering ("of God", "thy God", "shall come") — dropped for the
# "how the KJV translates it" counts only (never from the text itself).
LEAD_WORDS = set("""the a an of and unto to in into thy thine my mine his her our your their its o
let is are was were be been am art put after for with by from that which shall will hath have had
doth did do not no upon on at as so but or nor ye he she it we they i thou all me thee us him them
whom who therefore now when because against there than though more through then also even yea""".split())


def rendering(word):
    ws = word.split()
    while len(ws) > 1 and ws[0].lower() in LEAD_WORDS:
        ws = ws[1:]
    return " ".join(ws)
for key, t in verses.items():
    o = ordinal[key]
    seen = set()
    for text, tags in seg_re.findall(t):
        word = re.sub(r"[{}]", "", text)
        word = re.sub(r"[^\w\s'-]", "", word).strip()
        word = rendering(word)
        for code in re.findall(r"[GH]\d+", tags):
            code = code[0] + str(int(code[1:]))
            if code not in seen:
                occ[code].append(o)
                seen.add(code)
            if word and len(word.split()) <= 3:
                w = " ".join(x if (x.isupper() and len(x) > 1) or x in ("I",) else x.lower() for x in word.split())
                renders[code][w] += 1

os.makedirs(os.path.join(OUT, "lex"), exist_ok=True)
groups = collections.defaultdict(dict)
for src, prefix in ((heb, "H"), (grk, "G")):
    for code, e in src.items():
        n = int(code[1:])
        entry = {
            "w": e.get("lemma", ""),
            "x": e.get("xlit") or e.get("translit") or "",
            "p": e.get("pron", ""),
            "d": (e.get("strongs_def") or "").strip(),
            "dv": (e.get("derivation") or "").strip(),
            "k": (e.get("kjv_def") or "").strip(),
        }
        if prefix == "G":
            # The Greek dictionary sometimes writes "compare G5689" for a
            # Hebrew word — Greek numbers stop at 5624, so those are H.
            for f in ("d", "dv", "k"):
                entry[f] = re.sub(r"\bG(\d+)\b", lambda m: ("H" if int(m.group(1)) > 5624 else "G") + m.group(1), entry[f])
        key = prefix + str(n)
        if occ.get(key):
            entry["o"] = " ".join(b36(x) for x in occ[key])
            # Drop "renderings" that are only a helper word ("let", "doth").
            entry["r"] = [(w, c) for w, c in renders[key].most_common(40) if w.lower() not in LEAD_WORDS][:30]
        groups[f"{prefix}{n // 1000}"][key] = entry
missing = [k for k in occ if k not in {kk for g in groups.values() for kk in g}]
print("tag codes without a dictionary entry:", len(missing), missing[:10])
for g, entries in groups.items():
    with open(os.path.join(OUT, "lex", g + ".json"), "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, separators=(",", ":"))

meta["sources"] = {
    "text": "King James Version (1769), public domain",
    "strongs": "Strong's Exhaustive Concordance dictionaries (1890), public domain; Open Scriptures edition (CC BY-SA)",
    "xref": "Cross references: OpenBible.info (CC BY)",
}
with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
print("done")
