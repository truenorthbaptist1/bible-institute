#!/usr/bin/env python3
"""Turn a TNBBI backup into SQL that puts missing data back.

    python3 tools/backup/restore.py tnbbi-backup-2026-10-04.json.gz > restore.sql

Then paste restore.sql into Supabase → SQL Editor and click Run.

What it does: re-inserts every row in the backup that is no longer in the
database (for example a course, its assignments and grades, after it was
deleted by mistake). Rows that still exist are left exactly as they are —
nothing is overwritten or deleted. Rows that belong to an account which no
longer exists (and can't be re-created from a backup) are skipped and
counted. Notifications created by the restore itself are removed afterward,
so nobody gets a flood of old news.

Works with either a .json backup (Settings → Backups → Download) or the
.json.gz file attached to the weekly backup email.
"""
import gzip, json, sys

# Parents before children, so references line up.
ORDER = ["profiles", "courses", "enrollments", "enrollment_requests", "materials", "assignments",
         "submissions", "discussion_posts", "messages", "notifications", "bible_highlights",
         "attendance_days", "attendance", "class_cancellations", "announcements", "transcript_entries", "past_records"]


def load(path):
    raw = open(path, "rb").read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    data = json.loads(raw)
    if data.get("format") != "tnbbi-backup-1":
        sys.exit("This doesn't look like a TNBBI backup file.")
    return data


def dollar(s):
    tag = "tnbbi"
    while f"${tag}$" in s:
        tag += "x"
    return f"${tag}${s}${tag}$"


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    data = load(sys.argv[1])
    tables = data["tables"]
    out = [f"-- Restore from TNBBI backup taken {data.get('taken_at')}",
           "-- Puts back missing rows only; nothing existing is changed.",
           "create temp table if not exists _restore_log (tbl text, added int, skipped int);",
           "truncate _restore_log;",
           "create temp table _restore_start as select clock_timestamp() as t;"]
    for t in ORDER:
        rows = tables.get(t) or []
        if not rows:
            continue
        # Discussion replies need their parent posts first.
        if t == "discussion_posts":
            rows = sorted(rows, key=lambda r: r.get("parent_id") is not None)
        payload = dollar(json.dumps(rows, ensure_ascii=False))
        out.append(f"""
do $restore$
declare r public.{t}; added int := 0; skipped int := 0; n int;
begin
  for r in select * from jsonb_populate_recordset(null::public.{t}, {payload}::jsonb) loop
    begin
      insert into public.{t} select (r).* on conflict do nothing;
      get diagnostics n = row_count; added := added + n;
    exception when foreign_key_violation or check_violation or not_null_violation or raise_exception then
      skipped := skipped + 1;
    end;
  end loop;
  insert into _restore_log values ('{t}', added, skipped);
end $restore$;""")
    ids = [r["id"] for r in tables.get("notifications", []) if r.get("id")]
    keep = ", ".join(f"'{i}'" for i in ids) or "null"
    out.append(f"""
-- Notifications made by the restore itself (e.g. "new message") aren't news.
delete from public.notifications
 where created_at >= (select t from _restore_start) and id::text not in ({keep});
update public.notifications set pushed_at = coalesce(pushed_at, now()), emailed_at = coalesce(emailed_at, now());
select tbl as "table", added as "rows put back", skipped as "rows skipped" from _restore_log;""")
    print("\n".join(out))


if __name__ == "__main__":
    main()
