"""Shared helpers for the Oct 23, 2026 review tests (database side).

Each test runs against the scratch database "t" built by build_db.sh
(schema.sql + seed.sql). Tests describe what SHOULD happen; a failing test
means the bug is real on today's code.
"""
import subprocess, sys, uuid

PSQL = ["psql", "-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-d", "t",
        "-At", "-v", "ON_ERROR_STOP=1", "-q"]


def sql(query, as_user=None, role=None):
    pre = ""
    if role == "anon":
        pre = "set role anon; select set_config('request.jwt.claim.sub', '', false) \\g /dev/null\n"
    elif as_user is not None:
        pre = (f"set role authenticated; select set_config('request.jwt.claim.sub', '{as_user}', false)"
               " \\g /dev/null\n")
    p = subprocess.run(PSQL, input=pre + query, capture_output=True, text=True)
    return p.returncode == 0, (p.stdout.strip() if p.returncode == 0 else p.stderr.strip())


def admin(query):
    ok, out = sql(query)
    if not ok:
        print("SETUP FAILED:", query, out)
        sys.exit(2)
    return out


def mkuser(name, role="student", super_admin=False):
    uid = str(uuid.uuid4())
    email = f"{uid[:8]}@example.com"
    admin(f"insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values "
          f"('{uid}', '{email}', '{{\"full_name\": \"{name}\"}}', now())")
    admin(f"update public.profiles set status = 'active', role = '{role}', super_admin = {str(super_admin).lower()} "
          f"where id = '{uid}'")
    return uid


def run(tests):
    """tests: list of (name, fn). fn returns (passed, got, expected)."""
    failed = 0
    for name, fn in tests:
        passed, got, want = fn()
        print(("PASS " if passed else "FAIL ") + name)
        if not passed:
            failed += 1
            print(f"     got:      {got}")
            print(f"     expected: {want}")
    sys.exit(1 if failed else 0)
