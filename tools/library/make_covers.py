"""Stand-in covers for church-library books that have no real cover picture.

One matching design for every book: the title large, the author beneath, the
shelf name at the top and the church's mark at the bottom, in the church's
navy/gold colors with one shade per shelf.

    python3 tools/library/make_covers.py <fonts dir> <out dir> <books.json>

books.json: [{"key": "<hash>", "t": title, "a": author, "s": shelf}, ...]
Fonts: SourceSerif4.ttf and Figtree.ttf (the site's own fonts, from Google Fonts).
Writes <out dir>/<key>.jpg at 600x900.
"""
import json
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 600, 900
HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "..", "..", "docs", "library", "church-logo-white.png")

# One deep shade per shelf (all from the navy / slate / evergreen / wine family
# so the shelves look organized, not loud).
SHELF = {
    "Study & Reference": "#1f3a5f",
    "Commentaries & Dictionaries": "#22405e",
    "Doctrine": "#2a3550",
    "The Church": "#2b4a5c",
    "Ordinances": "#284f5e",
    "Bible Preservation": "#3b2f4a",
    "Bible Versions": "#40334f",
    "History": "#4a3426",
    "Apologetics": "#24493d",
    "False Doctrine": "#4a2a30",
    "Evangelism": "#5a2f24",
    "Pastoral": "#2f3d4f",
    "Christian Living": "#2d4a3a",
    "Devotional": "#4b3a22",
    "Prophecy": "#352a45",
    "Family": "#3f4a2c",
    "Music": "#3a2e45",
    "Children's Books": "#2f5a6b",
    "General": "#34404d",
}
GOLD = (214, 173, 98)
GOLD_LIGHT = (236, 213, 159)
CREAM = (250, 245, 234)


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def font(path, size, weight):
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def wrap(draw, text, f, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= width or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit(draw, text, path, weight, width, max_h, start, smallest, spacing=1.12, max_lines=7):
    """Largest size (start → smallest) at which text wraps into max_h."""
    size = start
    while True:
        f = font(path, size, weight)
        lines = wrap(draw, text, f, width)
        lh = int(size * spacing)
        fits = (len(lines) * lh <= max_h and len(lines) <= max_lines
                and all(draw.textlength(l, font=f) <= width for l in lines))
        if fits or size <= smallest:
            return f, lines, lh
        size -= 2


def split_title(t):
    t = re.sub(r"\s+", " ", t).strip()
    for sep in (" - ", " – ", ": "):
        if sep in t:
            a, b = t.split(sep, 1)
            if len(a) >= 3 and len(b) >= 3:
                return a.strip(), b.strip()
    return t, ""


def make(book, fonts_dir, out_path, logo):
    serif = os.path.join(fonts_dir, "SourceSerif4.ttf")
    sans = os.path.join(fonts_dir, "Figtree.ttf")
    base = hex2rgb(SHELF.get(book.get("s") or "", SHELF["General"]))

    # Background: the shelf color, lighter toward the top, gently vignetted.
    img = Image.new("RGB", (W, H), base)
    top = tuple(min(255, int(c * 1.28 + 8)) for c in base)
    grad = Image.new("RGB", (1, H))
    for y in range(H):
        k = (y / H) ** 1.3
        grad.putpixel((0, y), tuple(int(top[i] * (1 - k) + base[i] * k) for i in range(3)))
    img = grad.resize((W, H))
    vign = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vign).rectangle((40, 40, W - 40, H - 40), fill=255)
    vign = vign.filter(ImageFilter.GaussianBlur(70))
    dark = Image.new("RGB", (W, H), tuple(int(c * 0.6) for c in base))
    img = Image.composite(img, dark, vign)
    d = ImageDraw.Draw(img)

    # Frame: a fine gold line inset, and a solid band at the bottom.
    d.rectangle((22, 22, W - 23, H - 23), outline=GOLD, width=2)
    d.rectangle((30, 30, W - 31, H - 31), outline=(*GOLD, ), width=1)

    # Shelf name at the top.
    shelf = (book.get("s") or "").upper()
    if shelf:
        f = font(sans, 19, "Bold")
        spaced = " ".join(shelf)  # letterspacing
        tw = d.textlength(spaced, font=f)
        if tw > W - 120:
            spaced = shelf
            tw = d.textlength(spaced, font=f)
        d.text(((W - tw) / 2, 78), spaced, font=f, fill=GOLD)
        d.line(((W / 2 - 30, 116), (W / 2 + 30, 116)), fill=GOLD, width=2)

    # Title (and subtitle) in the middle.
    main, sub = split_title(book["t"])
    box_w = W - 130
    tf, tlines, tlh = fit(d, main, serif, "SemiBold", box_w, 330 if sub else 400, 62, 30)
    sf, slines, slh = (None, [], 0)
    if sub:
        sf, slines, slh = fit(d, sub, serif, "Regular", box_w, 150, 27, 19, spacing=1.2, max_lines=5)
    author = (book.get("a") or "").strip()
    if author.lower() in ("unknown", "various", "n/a", "-"):
        author = ""
    af, alines, alh = (None, [], 0)
    if author:
        af, alines, alh = fit(d, author, sans, "Medium", box_w, 80, 28, 20, spacing=1.2, max_lines=2)

    block = len(tlines) * tlh + (22 + len(slines) * slh if sub else 0) + (64 + len(alines) * alh if author else 0)
    y = max(150, (H - 120 - block) / 2 + 40)
    for l in tlines:
        tw = d.textlength(l, font=tf)
        d.text(((W - tw) / 2, y), l, font=tf, fill=CREAM)
        y += tlh
    if sub:
        y += 22
        for l in slines:
            tw = d.textlength(l, font=sf)
            d.text(((W - tw) / 2, y), l, font=sf, fill=(226, 220, 205))
            y += slh
    if author:
        y += 26
        d.line(((W / 2 - 24, y), (W / 2 + 24, y)), fill=GOLD, width=2)
        y += 38
        for l in alines:
            tw = d.textlength(l, font=af)
            d.text(((W - tw) / 2, y), l, font=af, fill=GOLD_LIGHT)
            y += alh

    # The church's mark at the bottom.
    if logo is not None:
        lg = logo.copy()
        lg.thumbnail((150, 60))
        img.paste(lg, (int((W - lg.width) / 2), H - 150), lg)
    f = font(sans, 15, "SemiBold")
    label = "C H U R C H   L I B R A R Y"
    tw = d.textlength(label, font=f)
    d.text(((W - tw) / 2, H - 76), label, font=f, fill=(*GOLD_LIGHT,))

    img.save(out_path, "JPEG", quality=88, optimize=True, progressive=True)


def main():
    fonts_dir, out_dir, books_json = sys.argv[1:4]
    os.makedirs(out_dir, exist_ok=True)
    logo = Image.open(LOGO).convert("RGBA") if os.path.exists(LOGO) else None
    books = json.load(open(books_json))
    for b in books:
        make(b, fonts_dir, os.path.join(out_dir, b["key"] + ".jpg"), logo)
    print(f"{len(books)} stand-in covers written to {out_dir}")


if __name__ == "__main__":
    main()
