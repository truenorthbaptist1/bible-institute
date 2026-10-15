#!/usr/bin/env python3
"""Church library checkout: privacy, checkout, renew/return, reminders.

Runs against the same scratch database as rls_test.py (run_tests.sh loads
schema.sql + seed.sql first). Borrowers are signed-out visitors ("anon").
"""
import json, subprocess, sys, uuid

PSQL = ["psql", "-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-d", "t", "-At", "-v", "ON_ERROR_STOP=1", "-q"]
results = []

def sql(query, as_user=None, role=None):
    pre = ""
    if role == "anon":
        pre = "set role anon; select set_config('request.jwt.claim.sub', '', false) \\g /dev/null\n"
    elif as_user is not None:
        pre = f"set role authenticated; select set_config('request.jwt.claim.sub', '{as_user}', false) \\g /dev/null\n"
    p = subprocess.run(PSQL, input=pre + query, capture_output=True, text=True)
    return p.returncode == 0, (p.stdout.strip() if p.returncode == 0 else p.stderr.strip())

def check(name, cond, detail=""):
    results.append((bool(cond), name, detail))

def admin(query):
    ok, out = sql(query)
    if not ok:
        print("SETUP FAILED:", query, out); sys.exit(1)
    return out

def anon(query):
    return sql(query, role="anon")

def mkuser(email, name):
    uid = str(uuid.uuid4())
    admin(f"insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ('{uid}', '{email}', '{{\"full_name\": \"{name}\"}}', now())")
    admin(f"update public.profiles set status = 'active' where id = '{uid}'")
    return uid

boss = mkuser("lib-admin@example.com", "Library Admin")
admin(f"update public.profiles set role = 'faculty', super_admin = true where id = '{boss}'")
teacher = mkuser("lib-teacher@example.com", "Library Teacher")
admin(f"update public.profiles set role = 'faculty' where id = '{teacher}'")
student = mkuser("lib-student@example.com", "Library Student")

# --- the starting list -------------------------------------------------------
n = admin("select count(*) || '/' || sum(copies) from public.library_books")
check("The church's book list is loaded (702 books, one copy each)", n == "702/702", n)

# --- privacy -----------------------------------------------------------------
ok, out = anon("select count(*) from public.library_books")
check("Visitors can't read the book table directly", not ok, out)
ok, out = anon("select count(*) from public.library_borrowers")
check("Visitors can't read the borrower list", not ok, out)
ok, out = sql("select count(*) from public.library_loans", student)
check("Students see no checkouts", ok and out == "0", out)
ok, out = sql("select count(*) from public.library_books", teacher)
check("Faculty (not Admins) see no library records", ok and out == "0", out)
ok, out = sql("select count(*) from public.library_books", boss)
check("Admins see the whole list", ok and out == "702", out)

# --- search ------------------------------------------------------------------
ok, out = anon("select title from public.library_search('pocket guide darwin') limit 1")
check("Typing part of a title finds it (any word order)", ok and out == "A Pocket Guide to Charles Darwin", out)
ok, out = anon("select count(*) from public.library_search('d')")
check("One letter isn't a search yet", ok and out == "0", out)
ok, out = anon("select title from public.library_search('answers genesis') limit 1")
check("…and an author's name finds their books", ok and out != "", out)

# --- checkout ----------------------------------------------------------------
darwin = admin("select id from public.library_books where title = 'A Pocket Guide to Charles Darwin'")
ok, out = anon(f"select public.library_checkout(null, 'Jane Doe', 'not-an-email', '[{{\"book\": {darwin}}}]')")
check("An email address is required (for the reminder)", not ok and "email" in out, out)
ok, out = anon("select public.library_checkout(null, 'Jane Doe', 'jane@example.com', '[]')")
check("At least one book", not ok, out)
items = json.dumps([{"book": int(darwin), "isbn": "978-0-89051-123-4"},
                    {"title": "Knowing God", "author": "J.I. Packer", "isbn": "9780830816507", "photo": "new/abc123.jpg"}])
ok, out = anon(f"select public.library_checkout(null, 'Jane Doe', 'Jane@Example.com', '{items}')")
res = json.loads(out) if ok else {}
check("A first-time borrower checks out two books", ok and res.get("checked_out") == 2 and len(res.get("books", [])) == 2, out[:200])
token = res.get("token", "")
check("…and their phone gets its own private key", len(token) == 64)
due = admin("select (public.local_today() + 14)::text")
check("Due back in two weeks", res.get("due_on") == due, res.get("due_on"))
check("Email is stored in lower case", res.get("email") == "jane@example.com")
ok, out = anon("select title from public.library_by_isbn('9780890511234')")
check("A scanned barcode is learned for next time", ok and out == "A Pocket Guide to Charles Darwin", out)
nb = admin("select source || '/' || reviewed || '/' || coalesce(photo_path, '') from public.library_books where title = 'Knowing God'")
check("A book not on the list is added for the librarian to look over (with its photo)", nb == "borrower/false/new/abc123.jpg", nb)
ok, out = anon(f"select public.library_checkout('{token}', 'Jane Doe', 'jane@example.com', '[{{\"title\": \"knowing  god\", \"author\": \"\"}}]')")
check("Typing the same new title again uses that book (no duplicate)", ok and admin("select count(*) from public.library_books where title ilike 'knowing god'") == "1", out[:200])
ok, out = anon(f"select public.library_checkout('{token}', 'Jane Doe', 'jane@example.com', '[{{\"title\": \"x\", \"photo\": \"../../etc/passwd\"}}]')")
check("A bad photo path is ignored", ok and admin("select count(*) from public.library_books where photo_path like '%..%'") == "0", out[:200])

# --- my books, return, renew ---------------------------------------------------
ok, out = anon(f"select public.library_my_books('{token}')")
mine = json.loads(out) if ok else {}
check("The phone shows its books", ok and len(mine.get("books", [])) == 4, out[:200])
ok, out = anon("select public.library_my_books('not-the-right-key-not-the-right-key-12345678')")
check("A wrong key shows nothing", ok and out == "", out)
other = json.loads(anon("select public.library_checkout(null, 'Sam Roe', 'sam@example.com', '[{\"book\": 5}]')")[1])
sam_loan = other["books"][0]["loan"]
ok, out = anon(f"select public.library_return('{token}', {sam_loan})")
check("You can't return someone else's book", admin(f"select returned_at is null from public.library_loans where id = {sam_loan}") == "t", out[:120])
jl = mine["books"][0]["loan"]
ok, out = anon(f"select public.library_renew('{token}', {jl})")
r = json.loads(out) if ok else {}
check("Renew: two more weeks", ok and r.get("renewed") is True, out)
renew_key = admin(f"select renew_token from public.library_loans where id = {jl}")
ok, out = anon(f"select public.library_renew(null, null, '{renew_key}')")
check("The email's renew link works too", ok and json.loads(out).get("renewed") is True, out)
ok, out = anon(f"select public.library_renew(null, null, '{renew_key}')")
check("…but only twice", ok and json.loads(out).get("limit") is True, out)
ok, out = anon(f"select public.library_return('{token}', {jl})")
check("Returning a book takes it off the phone's list", ok and len(json.loads(out)["books"]) == 3, out[:200])
ok, out = anon(f"select public.library_renew(null, null, '{renew_key}')")
check("A renew link for a returned book just says it's back", ok and json.loads(out).get("returned") is True, out)

# --- one copy of each book ------------------------------------------------------
ob = admin("select id from public.library_books where title = 'Compendium of Baptist History'")
first = json.loads(anon(f"select public.library_checkout(null, 'First Reader', 'first@example.com', '[{{\"book\": {ob}}}]')")[1])
ok, out = anon(f"select title, out_now, back_on from public.library_search('compendium baptist history')")
check("A checked-out book shows when it's due back", ok and out.endswith(admin("select (public.local_today() + 14)::text")), out)
second = json.loads(anon(f"select public.library_checkout(null, 'Second Reader', 'second@example.com', '[{{\"book\": {ob}}}]')")[1])
check("If someone else takes it, the first checkout is closed (it must have been put back)",
      admin(f"select returned_by from public.library_loans l join public.library_borrowers b on b.id = l.borrower_id where b.email = 'first@example.com' and l.book_id = {ob}") == "next_borrower"
      and admin(f"select count(*) from public.library_loans where book_id = {ob} and returned_at is null") == "1")
admin(f"update public.library_loans set returned_at = now() where book_id = {ob} and returned_at is null")

# --- reminders ---------------------------------------------------------------
ok, out = anon("select * from public.claim_library_reminders()")
check("Visitors can't pull the reminder list", not ok, out)
admin("update public.library_loans set returned_at = now() where returned_at is null")
loan = json.loads(anon("select public.library_checkout(null, 'Rita Reminder', 'rita@example.com', '[{\"book\": 7}]')")[1])["books"][0]["loan"]
admin(f"update public.library_loans set due_on = date '2026-10-20' where id = {loan}")
def at(t):
    return admin(f"select coalesce(string_agg(stage::text, ','), '') from public.claim_library_reminders(timestamp '{t}' at time zone 'America/Anchorage')")
check("Nothing a week early", at("2026-10-13 10:00") == "")
check("Not before 9 AM", at("2026-10-17 08:30") == "")
check("3 days before it's due", at("2026-10-17 10:00") == "1")
check("…only once", at("2026-10-17 15:00") == "")
check("On the day it's due", at("2026-10-20 09:05") == "2")
check("The day after: overdue", at("2026-10-21 09:05") == "3")
check("…not again for a week", at("2026-10-25 09:05") == "")
check("…then weekly", at("2026-10-28 09:05") == "4" and at("2026-11-04 10:00") == "5" and at("2026-11-11 10:00") == "6")
check("…and after four overdue notes the librarian takes over", at("2026-11-18 10:00") == "" and at("2026-12-30 10:00") == "")
admin(f"update public.library_loans set returned_at = now() where id = {loan}")

# --- admins ------------------------------------------------------------------
ok, out = sql(f"update public.library_loans set returned_at = now(), returned_by = 'librarian' where id = {sam_loan}", boss)
check("Admins can mark a book returned", ok and admin(f"select returned_by from public.library_loans where id = {sam_loan}") == "librarian", out)
ok, out = sql(f"update public.library_books set reviewed = true where title = 'Knowing God'", teacher)
check("Faculty can't change the list", ok and admin("select reviewed from public.library_books where title = 'Knowing God'") == "f", out)
ok, out = sql("select count(*) from public.library_borrowers", boss)
check("Admins see borrowers", ok and int(out) >= 3, out)

# --- Admin page functions ---------------------------------------------------------
ok, out = sql("select public.library_admin_overview()", teacher)
check("Faculty can't open the Checkouts page data", not ok and "Admins" in out, out)
ok, out = anon("select public.library_admin_overview()")
check("…nor can visitors", not ok, out)
ok, out = sql("select public.library_admin_overview()", boss)
ov = json.loads(out) if ok else {}
check("Admins get the overview (counts, new books to look over)", ok and ov["counts"]["titles"] >= 703 and any(b["title"] == "Knowing God" for b in ov["new_books"]), out[:200])
ok, out = sql("select count(*) from public.library_admin_books('pocket guide')", boss)
check("Admins can search the whole list", ok and int(out) >= 5, out)
kg = admin("select id from public.library_books where title = 'Knowing God'")
ok, out = sql(f"select public.library_admin_save_book({kg}, 'Knowing God', 'J. I. Packer', 'Doctrine', 1)", boss)
check("Saving a borrower-added book marks it looked over", ok and admin(f"select reviewed || '/' || subject from public.library_books where id = {kg}") == "true/Doctrine", out)
dup = json.loads(anon("select public.library_checkout(null, 'Typo Tom', 'tom@example.com', '[{\"title\": \"Pocket Guide Darwin\", \"isbn\": \"9780890511999\"}]')")[1])
dup_id = admin("select id from public.library_books where title = 'Pocket Guide Darwin'")
ok, out = sql(f"select public.library_admin_merge_book({dup_id}, {darwin})", boss)
check("Merging a misspelled book moves its checkout and barcode onto the listed book",
      ok and admin(f"select count(*) from public.library_books where id = {dup_id}") == "0"
      and admin(f"select '9780890511999' = any(isbns) from public.library_books where id = {darwin}") == "t"
      and admin(f"select count(*) from public.library_loans l join public.library_borrowers b on b.id = l.borrower_id where b.email = 'tom@example.com' and l.book_id = {darwin}") == "1", out)
ok, out = sql(f"select public.library_admin_delete_book({darwin})", boss)
check("A book that's been borrowed can't be deleted", not ok and "stays on the list" in out, out)
ok, out = sql("select public.library_admin_save_book(null, 'Brand New Book', 'Someone', 'Devotional', 2)", boss)
nid = out
ok2, out2 = sql(f"select public.library_admin_delete_book({nid})", boss)
check("Admins can add a book, and delete one that was never borrowed", ok and ok2 and admin(f"select count(*) from public.library_books where id = {nid}") == "0", out2)
tl = admin("select l.id from public.library_loans l join public.library_borrowers b on b.id = l.borrower_id where b.email = 'tom@example.com'")
want = admin(f"select (due_on + 14)::text from public.library_loans where id = {tl}")
ok, out = sql(f"select public.library_admin_extend({tl})", boss)
check("Admins can give two more weeks (from the due date)", ok and out == want, out)
ok, out = sql(f"select public.library_admin_return({tl})", boss)
check("…and check a book back in", ok and admin(f"select returned_by from public.library_loans where id = {tl}") == "librarian", out)

for passed, name, detail in results:
    print(("PASS  " if passed else "FAIL  ") + name + ("" if passed else f"  → {detail}"))
bad = sum(1 for r in results if not r[0])
print(f"\n{len(results) - bad}/{len(results)} library checks passed")
sys.exit(1 if bad else 0)
