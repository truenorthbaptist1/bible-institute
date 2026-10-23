# Resource Library — Drive items on the shelves

`docs/js/drive-library.js` is generated. It lists every document, recording and
album in the four church Drive folders the library links to (TNBC Doctrinal
Resources, TNBC Bible Study Resources, TNBC Evangelism Resources, TNBC Audio
Library) plus the Institute's hand-picked course documents, each placed on one
of the library's shelves.

- `catalog/*.json` — a read-only walk of those folders (Oct 10, 2026): every
  file's id, title, type, size and folder path.
- `catalog/collections.json`, `catalog/folder_ids.json` — folders whose audio or
  video is shown as ONE entry (an album or a numbered recorded series) and
  their Drive folder ids.
- `build_drive_shelves.py` — the shelf rules (folder → shelf, plus title
  keywords for mixed folders like the Devotional Archive). Run
  `python3 tools/library/build_drive_shelves.py` to regenerate
  `docs/js/drive-library.js` after refreshing the catalog.

Left out on purpose: images (Facebook ad graphics etc.), Google Forms quizzes,
exact duplicates (same title and type), and the Discipleship Classes and
PowerPoint Library folders (the user's call, Oct 10).

# Book covers (Oct 23, 2026)

Every book on the church library list has a cover picture at
`docs/library/covers/<key>.jpg` (300 px wide), shown on the Resource Library
shelves, the checkout page (/library/) and the librarian's Checkouts screen.
`<key>` is an 8-hex checksum of "title|author" (`libCoverKey` in app.js).

- **Real covers** (about 300) come from Open Library, matched by title and
  author, then checked by eye; wrong matches (another volume, another author,
  a blank scan) were dropped.
- **Stand-ins** for the rest: one design in the church's colors, a shade per
  shelf, with the title, author and shelf (`make_covers.py`, using the site's
  fonts Source Serif 4 and Figtree).
- `docs/js/library-covers.js` lists which books have a cover (for the shelves).
- `supabase/schema.sql`, block "library covers": attaches each cover to its
  book in `library_books` (`cover`, `cover_kind` = found / made). Re-running it
  never replaces a cover, except a stand-in when a real cover turns up.
- Full-size copies are in the church Drive: TNBC Library › Library Book Covers
  (stand-ins are named "… (stand-in).jpg").

To change covers: put the search results in a work folder (`results.json` +
`found/<i>.jpg`) and run
`python3 tools/library/build_covers.py <work dir> <fonts dir>`.
