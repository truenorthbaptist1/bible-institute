#!/usr/bin/env python3
"""Local test server for end-to-end browser tests.

- Serves the site (../../site) over http://localhost:PORT
- /api/db, /api/rpc, /api/storage/*: runs each request in Postgres AS the
  signed-in user (role "authenticated" + their id), so the real schema's
  privacy rules decide what comes back — exactly as on Supabase.
- /api/auth/*: a tiny stand-in for Supabase Auth (sign up / sign in /
  Google), creating rows in auth.users so the real triggers run.
"""
import base64, json, os, subprocess, sys, uuid
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PSQL = ["psql", "-h", "/var/tmp/pgtest", "-p", "5499", "-U", "postgres", "-d", "t", "-At", "-v", "ON_ERROR_STOP=1", "-q"]
SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "docs"))
PASSWORDS = {}
PORT = 8765
TABLES = {"profiles", "courses", "enrollments", "enrollment_requests", "materials", "assignments", "submissions",
          "discussion_posts", "messages", "notifications", "bible_highlights", "attendance_days", "attendance", "push_subscriptions"}
SETOF_FUNCS = {"visible_people"}
IDENT = lambda s: '"' + str(s).replace('"', '') + '"'


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)):
        v = json.dumps(v)
    return "'" + str(v).replace("'", "''") + "'"


def run_sql(sql, uid=None):
    pre = ""
    if uid is not None:
        pre = f"set role authenticated;\nselect set_config('request.jwt.claim.sub', {lit(uid)}, false) \\g /dev/null\n"
    p = subprocess.run(PSQL, input=pre + sql, capture_output=True, text=True)
    if p.returncode != 0:
        msg = p.stderr.strip().split("\n")[0]
        msg = msg.split("ERROR:", 1)[-1].strip()
        return None, {"message": msg}
    return p.stdout.strip(), None


def where(filters):
    parts = []
    for col, op, val in filters:
        if op == "eq":
            parts.append(f"{IDENT(col)} = {lit(val)}")
        elif op == "in":
            parts.append(f"{IDENT(col)} in ({', '.join(lit(x) for x in val) or 'NULL'})" if val else "false")
    return (" where " + " and ".join(parts)) if parts else ""


def db(req):
    t = req["table"]
    if t not in TABLES:
        return {"data": None, "error": {"message": "unknown table"}}
    T = f"public.{IDENT(t)}"
    op = req["op"]
    agg = "select coalesce(json_agg(r), '[]'::json) from r"
    if op == "select":
        cols = "*" if req.get("columns", "*") == "*" else ", ".join(IDENT(c.strip()) for c in req["columns"].split(","))
        order = (" order by " + ", ".join(f"{IDENT(c)} {'asc' if a else 'desc'}" for c, a in req["order"])) if req.get("order") else ""
        lim = ""
        if req.get("range"):
            a, b = req["range"]
            lim = f" offset {int(a)} limit {int(b) - int(a) + 1}"
        elif req.get("limit"):
            lim = f" limit {int(req['limit'])}"
        sql = f"with r as (select {cols} from {T}{where(req['filters'])}{order}{lim}) {agg}"
    elif op in ("insert", "upsert"):
        rows = req["rows"]
        cols = sorted({k for r in rows for k in r})
        cl = ", ".join(IDENT(c) for c in cols)
        sql = f"with r as (insert into {T} ({cl}) select {cl} from json_populate_recordset(null::{T}, {lit(json.dumps(rows))}::json)"
        if op == "upsert":
            oc = [c.strip() for c in req["onConflict"].split(",")]
            upd = [c for c in cols if c not in oc]
            sql += f" on conflict ({', '.join(IDENT(c) for c in oc)}) do " + (("update set " + ", ".join(f"{IDENT(c)} = excluded.{IDENT(c)}" for c in upd)) if upd else "nothing")
        sql += f" returning *) {agg}"
    elif op == "update":
        patch = req["patch"]
        rec = f"json_populate_record(null::{T}, {lit(json.dumps(patch))}::json)"
        sets = ", ".join(f"{IDENT(c)} = (select {IDENT(c)} from {rec})" for c in patch)
        sql = f"with r as (update {T} set {sets}{where(req['filters'])} returning *) {agg}"
    elif op == "delete":
        sql = f"with r as (delete from {T}{where(req['filters'])} returning *) {agg}"
    else:
        return {"data": None, "error": {"message": "bad op"}}
    out, err = run_sql(sql, req.get("uid"))
    if err:
        return {"data": None, "error": err}
    data = json.loads(out or "[]")
    if req.get("single") == "single":
        if len(data) != 1:
            return {"data": None, "error": {"message": "JSON object requested, multiple (or no) rows returned"}}
        data = data[0]
    elif req.get("single") == "maybe":
        data = data[0] if data else None
    return {"data": data, "error": None}


def rpc(req):
    fn = req["fn"]
    args = ", ".join(f"{IDENT(k)} => {lit(v)}" for k, v in req["args"].items())
    if fn in SETOF_FUNCS:
        sql = f"select coalesce(json_agg(r), '[]'::json) from public.{IDENT(fn)}({args}) r"
        out, err = run_sql(sql, req.get("uid"))
        return {"data": json.loads(out) if not err else None, "error": err}
    out, err = run_sql(f"select public.{IDENT(fn)}({args})::text", req.get("uid"))
    if err:
        return {"data": None, "error": err}
    return {"data": {"t": True, "true": True, "f": False, "false": False}.get(out, None), "error": None}


GOLD_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPY0GuPFTEMLQkAOzNfAVOXhvQAAAAASUVORK5CYII="

def storage(kind, req):
    b, uid = req["bucket"], req.get("uid")
    if kind == "upload":
        path = req["path"]
        limit = {"materials": 52428800, "submissions": 26214400, "avatars": 2097152}[b]
        if req.get("size", 0) > limit:
            return {"data": None, "error": {"message": "The object exceeded the maximum allowed size"}}
        out, err = run_sql(f"insert into storage.objects (bucket_id, name, owner) values ({lit(b)}, {lit(path)}, {lit(uid)})", uid)
        return {"data": {"path": path} if not err else None, "error": err}
    if kind == "remove":
        names = ", ".join(lit(p) for p in req["paths"]) or "NULL"
        out, err = run_sql(f"delete from storage.objects where bucket_id = {lit(b)} and name in ({names})", uid)
        return {"data": [], "error": err}
    if kind == "list":
        prefix = req["prefix"].rstrip("/") + "/"
        out, err = run_sql(f"select coalesce(json_agg(name), '[]') from storage.objects where bucket_id = {lit(b)} and name like {lit(prefix + '%')}", uid)
        if err:
            return {"data": None, "error": err}
        items, seen = [], set()
        for n in json.loads(out):
            rest = n[len(prefix):]
            head = rest.split("/")[0]
            if head in seen:
                continue
            seen.add(head)
            items.append({"name": head, "id": None if "/" in rest else str(uuid.uuid4())})
        return {"data": items, "error": None}
    if kind == "signmany":
        out = []
        for path in req["paths"]:
            n, err = run_sql(f"select count(*) from storage.objects where bucket_id = {lit(b)} and name = {lit(path)}", uid)
            ok = not err and n == "1"
            out.append({"path": path, "signedUrl": f"http://localhost:{PORT}/api/file?bucket={b}&path={path}" if ok else None,
                        "error": None if ok else "Object not found"})
        return {"data": out, "error": None}
    if kind == "sign":
        out, err = run_sql(f"select count(*) from storage.objects where bucket_id = {lit(b)} and name = {lit(req['path'])}", uid)
        if err:
            return {"data": None, "error": err}
        if out != "1":
            return {"data": None, "error": {"message": "Object not found"}}
        return {"data": {"signedUrl": f"http://localhost:{PORT}/api/file?bucket={b}&path={req['path']}"}, "error": None}


def auth(kind, req):
    email = (req.get("email") or "").lower()
    if kind == "signup":
        out, _ = run_sql(f"select id from auth.users where email = {lit(email)}")
        if out:
            return {"error": {"message": "User already registered"}}
        uid = str(uuid.uuid4())
        meta = json.dumps({"full_name": req.get("name") or ""})
        run_sql(f"insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ({lit(uid)}, {lit(email)}, {lit(meta)}::jsonb, now())")
        PASSWORDS[email] = req["password"]
        return {"user": {"id": uid, "email": email}}
    if kind == "signin":
        out, _ = run_sql(f"select id from auth.users where email = {lit(email)}")
        if not out or PASSWORDS.get(email) != req.get("password"):
            return {"error": {"message": "Invalid login credentials"}}
        return {"user": {"id": out, "email": email}}
    if kind == "google":
        out, _ = run_sql(f"select id from auth.users where email = {lit(email)}")
        uid = out
        if not uid:
            uid = str(uuid.uuid4())
            name = email.split("@")[0].replace(".", " ").title()
            run_sql(f"insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ({lit(uid)}, {lit(email)}, {lit(json.dumps({'full_name': name}))}::jsonb, now())")
        run_sql(f"insert into auth.identities (user_id, provider) select {lit(uid)}, 'google' where not exists (select 1 from auth.identities where user_id = {lit(uid)} and provider = 'google')")
        return {"user": {"id": uid, "email": email}}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=SITE, **kw)

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/api/file?bucket=avatars"):
            # A tiny gold square, so profile photos render as real images.
            body = base64.b64decode(GOLD_PNG)
            self.send_response(200)
            self.send_header("content-type", "image/png")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/file"):
            # Plain text so headless Chromium displays it instead of downloading.
            body = b"Test file contents\n"
            self.send_response(200)
            self.send_header("content-type", "text/plain")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        req = json.loads(self.rfile.read(n) or b"{}")
        p = self.path
        if p == "/api/db":
            res = db(req)
        elif p == "/api/rpc":
            res = rpc(req)
        elif p.startswith("/api/storage/"):
            res = storage(p.rsplit("/", 1)[1], req)
        elif p.startswith("/api/auth/"):
            res = auth(p.rsplit("/", 1)[1], req)
        else:
            res = {"error": {"message": "not found"}}
        body = json.dumps(res).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"Serving {SITE} on http://localhost:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
