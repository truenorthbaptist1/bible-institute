#!/usr/bin/env python3
"""Review tests for supabase/schema.sql (Oct 23, 2026).

Run:  sh tests/review/build_db.sh && python3 tests/review/test_schema.py
"""
import json
from dbhelp import sql, admin, mkuser, run


def lib_checkout(token, book_id):
    tok = "null" if token is None else f"'{token}'"
    ok, out = sql(f"select public.library_checkout({tok}, 'Ruth Reader', 'ruth@example.com', "
                  f"'[{{\"book\": {book_id}}}]'::jsonb)", role="anon")
    assert ok, out
    return json.loads(out)


def test_library_same_person_borrows_same_book_again():
    """A borrower checks a book out, puts it back on the shelf without tapping
    "Returned", and later checks the same book out again. They hold ONE copy,
    so they should have one open checkout — not two (the old one would go on
    to send them overdue notices for a book they legitimately have)."""
    book = admin("select id from public.library_books where title = 'The Genesis Flood' limit 1")
    first = lib_checkout(None, book)
    lib_checkout(first["token"], book)
    got = admin(f"select count(*) from public.library_loans l join public.library_borrowers b on b.id = l.borrower_id "
                f"where b.token = '{first['token']}' and l.book_id = {book} and l.returned_at is null")
    return got == "1", f"{got} open checkouts of the same single-copy book", "1 open checkout"


if __name__ == "__main__":
    run([
        ("library: re-borrowing the same book leaves only one open checkout",
         test_library_same_person_borrows_same_book_again),
    ])
