#!/usr/bin/env python3
"""Runs one of the repo's browser test scripts while recording which of the
site's functions ran (round 3 coverage, Nov 7, 2026).

    COVERAGE_DIR=/tmp/cov python3 tests/semester/cov_run.py tests/e2e/e2e_test.py

Every page the script opens is watched; when a context or browser closes,
the call counts are added up and written to $COVERAGE_DIR/<script>.json.
The script itself is unchanged.
"""
import atexit, json, os, runpy, sys
from playwright.sync_api import BrowserContext, Browser

D = os.environ.get("COVERAGE_DIR", "/tmp/cov")
COVER = {}
SESS = []


def take(sessions):
    for cdp in list(sessions):
        try:
            res = cdp.send("Profiler.takePreciseCoverage")
        except Exception:
            continue
        for sc in res.get("result", []):
            url = sc.get("url", "")
            if "/js/" not in url and "/library/" not in url:
                continue
            f = url.split("/")[-1].split("?")[0]
            if "localhost" not in url:
                continue
            if "/library/" in url:
                f = "library/" + f
            ran = COVER.setdefault(f, set())
            for fn in sc.get("functions", []):
                if fn.get("functionName") and fn["ranges"] and fn["ranges"][0].get("count", 0) > 0:
                    ran.add(fn["functionName"])


_new_page = BrowserContext.new_page


def new_page(self, *a, **k):
    page = _new_page(self, *a, **k)
    try:
        cdp = self.new_cdp_session(page)
        cdp.send("Profiler.enable")
        cdp.send("Profiler.startPreciseCoverage", {"callCount": True, "detailed": False})
        SESS.append(cdp)
    except Exception:
        pass
    return page


_ctx_close = BrowserContext.close
_br_close = Browser.close
_new_ctx = Browser.new_context


def ctx_close(self, *a, **k):
    take(SESS)
    return _ctx_close(self, *a, **k)


def br_close(self, *a, **k):
    take(SESS)
    return _br_close(self, *a, **k)


def new_ctx(self, *a, **k):
    ctx = _new_ctx(self, *a, **k)
    ctx.on("page", lambda p: None)
    return ctx


BrowserContext.new_page = new_page
BrowserContext.close = ctx_close
Browser.close = br_close


@atexit.register
def save():
    os.makedirs(D, exist_ok=True)
    name = os.path.splitext(os.path.basename(sys.argv[0]))[0]
    json.dump({u: sorted(v) for u, v in COVER.items()}, open(os.path.join(D, f"e2e-{name}.json"), "w"))


if __name__ == "__main__":
    script = sys.argv[1]
    sys.argv = sys.argv[1:]
    sys.path.insert(0, os.path.dirname(os.path.abspath(script)))
    runpy.run_path(script, run_name="__main__")
