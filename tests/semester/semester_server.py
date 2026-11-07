#!/usr/bin/env python3
"""The repo's test server (tests/e2e/server.py), unchanged, except that the
simulated people's passwords are known from the start — so a run can resume
from a saved snapshot after the server restarts."""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "e2e"))
import server  # noqa: E402

PEOPLE = ["thomas.reed@example.com", "ruth.bailey@example.com", "caleb.dawson@example.com", "silas.monroe@example.com",
          "hannah.pruitt@example.com", "jonah.keller@example.com"]
for e in PEOPLE:
    server.PASSWORDS[e] = "Faithful-2027"

if __name__ == "__main__":
    server.PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server.ThreadingHTTPServer(("127.0.0.1", server.PORT), server.Handler).serve_forever()
