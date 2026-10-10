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
