#!/usr/bin/env python3
"""Which of the site's functions ran in any simulation (round 3, Nov 7, 2026).

Reads $COVERAGE_DIR/*.json (browser) and *.sql.json (database) written by
the semester runs, and lists, file by file, the named functions that never
ran. Usage: COVERAGE_DIR=/tmp/cov python3 tests/semester/coverage.py [--all]
"""
import glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
D = os.environ.get("COVERAGE_DIR", "/tmp/cov")
ran, sql = {}, {}
for f in glob.glob(os.path.join(D, "*.json")):
    data = json.load(open(f))
    if f.endswith(".sql.json"):
        for k, v in data.items():
            sql[k] = sql.get(k, 0) + v
    else:
        for k, v in data.items():
            ran.setdefault(k, set()).update(v)
SKIP = {"library-data.js", "bible-data.js", "config.js"}
total_n = total_r = 0
for path in sorted(glob.glob(os.path.join(ROOT, "docs", "js", "*.js"))):
    name = os.path.basename(path)
    if name in SKIP:
        continue
    src = open(path).read()
    names = set(re.findall(r"^\s*(?:async\s+)?function\s+(\w+)", src, re.M))
    if name == "data.js":
        names |= set(re.findall(r"^  (?:async\s+)?(\w+)\([^)]*\)\s*\{", src, re.M))
    got = ran.get(name, set())
    miss = sorted(names - got)
    total_n += len(names); total_r += len(names) - len(miss)
    print(f"\n{name}: {len(names) - len(miss)}/{len(names)} functions ran")
    if miss:
        print("   never ran: " + ", ".join(miss))
schema = open(os.path.join(ROOT, "supabase", "schema.sql")).read()
fns = sorted(set(re.findall(r"create or replace function public\.(\w+)", schema)))
miss = [f for f in fns if not sql.get(f)]
print(f"\nschema.sql: {len(fns) - len(miss)}/{len(fns)} database functions called")
print("   never called: " + ", ".join(miss))
print(f"\nSITE TOTAL: {total_r}/{total_n} named functions ran")
