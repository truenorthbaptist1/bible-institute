#!/usr/bin/env python3
"""The repo's test server (tests/e2e/server.py), unchanged, except that the
simulated people's passwords are known from the start — so a run can resume
from a saved snapshot after the server restarts."""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import server  # noqa: E402

class AnyPassword(dict):
    def get(self, k, d=None):
        return dict.get(self, k, "Faithful-2027")
server.PASSWORDS = AnyPassword()
PEOPLE = ["thomas.reed@example.com", "ruth.bailey@example.com", "caleb.dawson@example.com", "silas.monroe@example.com",
          "hannah.pruitt@example.com", "jonah.keller@example.com"]
for e in PEOPLE:
    server.PASSWORDS[e] = "Faithful-2027"

# Like Supabase: a signed link made with { download: name } downloads the file
# (Content-Disposition: attachment) instead of opening it.
import urllib.parse
_storage = server.storage
def storage(kind, req):
    res = _storage(kind, req)
    if kind == "sign" and req.get("download") and isinstance(res, dict) and res.get("data") and res["data"].get("signedUrl"):
        res["data"]["signedUrl"] += "&download=" + urllib.parse.quote(str(req["download"]))
    return res
server.storage = storage
_get = server.Handler.do_GET
def do_GET(self):
    if self.path.startswith("/api/file") and "&download=" in self.path:
        name = urllib.parse.unquote(self.path.split("&download=", 1)[1])
        body = b"Test file contents\n"
        self.send_response(200)
        self.send_header("content-type", "application/octet-stream")
        self.send_header("content-disposition", f'attachment; filename="{name}"')
        self.send_header("content-length", str(len(body)))
        self.end_headers(); self.wfile.write(body)
        return
    return _get(self)
server.Handler.do_GET = do_GET

if __name__ == "__main__":
    server.PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server.ThreadingHTTPServer(("127.0.0.1", server.PORT), server.Handler).serve_forever()
