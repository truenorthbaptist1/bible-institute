#!/usr/bin/env python3
"""The repo's own browser-test server (tests/e2e/server.py), unchanged,
plus one optional switch copying a Supabase hosting limit:

  REVIEW_MAX_ROWS=<n>  — a database function that returns a list returns at
                         most n rows per request, as Supabase's API does
                         (Settings → API → "Max rows", 1,000 by default).
Unset = no limit (exactly the repo's server).
"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import server  # noqa: E402

MAX_ROWS = int(os.environ.get("REVIEW_MAX_ROWS", "0") or 0)
if MAX_ROWS:
    _rpc = server.rpc

    def capped_rpc(req):
        res = _rpc(req)
        if req.get("fn") in server.SETOF_FUNCS and isinstance(res.get("data"), list):
            res["data"] = res["data"][:MAX_ROWS]
        return res
    server.rpc = capped_rpc

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    server.PORT = port
    server.ThreadingHTTPServer(("127.0.0.1", port), server.Handler).serve_forever()
