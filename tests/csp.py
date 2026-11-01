#!/usr/bin/env python3
"""Content-Security-Policy and referrer policy for every page, generated from the page itself.

GitHub Pages cannot send headers, so each page carries its policy as the first
element after <meta charset>. Inline scripts are allowed by their sha256 only,
so the hashes must match the scripts byte for byte: an edit to an inline script
without a rewrite makes that script silently not run on the live site, and a
hand-edited policy can quietly loosen. This file is the only writer.

  python3 tests/csp.py --check        exit 1 if any page's policy is missing, misplaced or not exactly the generated one
  python3 tests/csp.py --write        rewrite every page's policy from its current inline scripts
  python3 tests/csp.py --root DIR     another copy of the site
  .venv/bin/python tests/csp.py --check --browser   also load each page, desktop and phone, and fail on any violation
"""
import argparse
import base64
import hashlib
import html.parser
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Script types the browser runs, so CSP governs them. JSON data blocks are not run.
EXEC_TYPES = {"", "module", "text/javascript", "application/javascript", "text/ecmascript",
              "application/ecmascript", "application/x-javascript", "application/x-ecmascript",
              "text/x-javascript", "text/x-ecmascript", "text/jscript", "text/livescript",
              "text/javascript1.0", "text/javascript1.1", "text/javascript1.2", "text/javascript1.3",
              "text/javascript1.4", "text/javascript1.5"}
DATA_TYPES = {"application/json", "application/ld+json"}

# Styles stay 'unsafe-inline': pages carry hundreds of style attributes and seven
# <style> elements built at run time, and every off-origin load is refused anyway
# (img-src, font-src and style-src admit only 'self' and data:). tests/README.md says why.
REST = ("style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; "
        "connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; "
        "worker-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'")
CSP_RE = re.compile(r'<meta http-equiv="Content-Security-Policy" content="[^"]*">\n'
                    r'(<meta name="referrer" content="[^"]*">\n)?')
# Nothing on the site needs a Referer: every subresource is same-origin and every
# outbound link already carries rel=noreferrer. This pins that if a link loses its rel.
REFERRER = "no-referrer"
CHARSET_RE = re.compile(r'<meta charset="?utf-8"?\s*/?>\n', re.I)


def pages(root):
    return sorted(root.glob("*.html")) + sorted((root / "work").glob("*.html"))


def sha256(text):
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode() + "'"


class Parse(html.parser.HTMLParser):
    """Start tags in order, and the text of every inline script, exactly as the browser hashes it."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.tags, self.scripts, self.unknown = [], [], []
        self._script, self._buf = None, []

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        self.tags.append((tag, a, self.getpos()[0]))
        if tag == "script":
            self._script, self._buf = a, []

    def handle_startendtag(self, tag, attrs):
        self.tags.append((tag, {k: (v or "") for k, v in attrs}, self.getpos()[0]))

    def handle_data(self, d):
        if self._script is not None:
            self._buf.append(d)

    def handle_endtag(self, tag):
        if tag == "script" and self._script is not None:
            a, body = self._script, "".join(self._buf)
            kind = a.get("type", "").strip().lower()
            if "src" in a:
                pass                                     # external: 'self' governs it
            elif kind in EXEC_TYPES:
                self.scripts.append(body)
            elif kind not in DATA_TYPES:
                self.unknown.append(kind)                # e.g. importmap: refuse to guess
            self._script = None


def parse(text):
    p = Parse()
    p.feed(text)
    p.close()
    return p


def policy(text):
    p = parse(text)
    hashes = sorted({sha256(s) for s in p.scripts})
    return "default-src 'none'; script-src 'self'" + "".join(" " + h for h in hashes) + "; " + REST, len(hashes), p


def meta(pol):
    return ('<meta http-equiv="Content-Security-Policy" content="' + pol + '">\n'
            '<meta name="referrer" content="' + REFERRER + '">\n')


def check_page(text):
    """Problems with one page's policy, [] if it is the generated one in its place."""
    pol, _, p = policy(text)
    out = ["script type %r is neither run nor data; csp.py does not know how CSP treats it" % k for k in p.unknown]
    tags = p.tags
    i = next((n for n, (t, a, _) in enumerate(tags) if t == "meta" and "charset" in a), None)
    if i is None:
        return out + ["no <meta charset>"]
    csps = [(n, a) for n, (t, a, _) in enumerate(tags)
            if t == "meta" and a.get("http-equiv", "").lower() == "content-security-policy"]
    if not csps:
        return out + ["no Content-Security-Policy meta"]
    if len(csps) > 1:
        out.append("%d Content-Security-Policy metas; one is generated" % len(csps))
    n, a = csps[0]
    if n != i + 1:
        out.append("the policy is not the first element after <meta charset> (element %d, charset %d)" % (n, i))
    if a.get("content") != pol:
        have = set(re.findall(r"'sha256-[^']+'", a.get("content", "")))
        want = set(re.findall(r"'sha256-[^']+'", pol))
        if have != want:
            out.append("stale script hashes: %d missing, %d no longer used" % (len(want - have), len(have - want)))
        else:
            out.append("policy differs from the generated one")
    refs = [(n, a) for n, (t, a, _) in enumerate(tags) if t == "meta" and a.get("name", "").lower() == "referrer"]
    if [(n, a.get("content")) for n, a in refs] != [(csps[0][0] + 1, REFERRER)]:
        out.append("want one <meta name=referrer content=%s> right after the policy, found %s"
                   % (REFERRER, [a.get("content") for _, a in refs] or "none"))
    return out


def write_page(text):
    pol, n, _ = policy(text)
    if CSP_RE.search(text):
        new = CSP_RE.sub(lambda m: meta(pol), text, count=1)
    else:
        new, k = CHARSET_RE.subn(lambda m: m.group(0) + meta(pol), text, count=1)
        if k != 1:
            raise SystemExit("no <meta charset> line to put the policy after")
    return new, n


INIT = """
window.__csp = [];
document.addEventListener('securitypolicyviolation', function (e) {
  window.__csp.push(e.effectiveDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sample || '').slice(0, 60));
});
"""
RUN_SCRIPTS = """() => [...document.scripts].filter(s => !s.src &&
  !['application/json', 'application/ld+json'].includes((s.type || '').trim().toLowerCase())).map(s => s.textContent)"""
VIEWPORTS = {"desktop": dict(viewport={"width": 1440, "height": 900}, device_scale_factor=2),
             "phone": dict(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)}


def browser_pass(root, pgs):
    """Each page on a desktop and a phone, scrolled end to end with every button clicked:
    no CSP violation, no console or page error, and the scripts the browser ran hash to the policy's."""
    import functools, http.server, threading
    from playwright.sync_api import sync_playwright
    class H(http.server.SimpleHTTPRequestHandler):            # the site under /portfolio/, as Pages serves it
        def translate_path(self, path):
            return super().translate_path(path[len("/portfolio"):] if path.startswith("/portfolio/") else path)

        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(H, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d/portfolio/" % srv.server_address[1]
    bad = 0
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vp, opts in VIEWPORTS.items():
            for f in pgs:
                rel = f.relative_to(root).as_posix()
                ctx = br.new_context(**opts)
                ctx.add_init_script(INIT)
                pg = ctx.new_page()
                errs = []
                pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text[:120]))
                pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:120]))
                pg.goto(base + rel, wait_until="load")
                pg.wait_for_timeout(500)
                y, n = 0, 0
                while y < pg.evaluate("document.documentElement.scrollHeight") and n < 400:
                    y += int(opts["viewport"]["height"] * 0.7)
                    pg.evaluate("y => scrollTo(0, y)", y)
                    pg.wait_for_timeout(50)
                    n += 1
                pg.wait_for_timeout(600)
                clicked = pg.evaluate("() => { let n = 0; document.querySelectorAll('button').forEach(b => { try { b.click(); n++; } catch (e) {} }); return n; }")
                pg.wait_for_timeout(400)
                viol = pg.evaluate("window.__csp")
                ran = {sha256(s) for s in pg.evaluate(RUN_SCRIPTS)}
                want = set(re.findall(r"'sha256-[^']+'", policy(f.read_text(encoding="utf-8"))[0]))
                probs = ["CSP violation: " + v for v in viol] + errs
                if ran != want:
                    probs.append("the browser ran %d inline script(s) the policy does not list" % len(ran - want))
                print("%s %s[%s] %d violations, %d errors, %d scrolls, %d buttons, %d inline scripts ran"
                      % ("FAIL" if probs else "PASS", rel, vp, len(viol), len(errs), n, clicked, len(ran)))
                for pr in probs[:6]:
                    print("    " + pr)
                bad += bool(probs)
                ctx.close()
        br.close()
    srv.shutdown()
    return bad


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--write", action="store_true")
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--browser", action="store_true",
                    help="also load every page in headless Chromium (.venv) and fail on any CSP violation or error")
    a = ap.parse_args()
    root = pathlib.Path(a.root).resolve()
    pgs = pages(root)
    if not pgs:
        print("FAIL no pages under", root)
        return 1
    bad = 0
    for f in pgs:
        rel = f.relative_to(root).as_posix()
        text = f.read_text(encoding="utf-8")
        if a.write:
            new, n = write_page(text)
            if new != text:
                f.write_text(new, encoding="utf-8")
            print("%-8s %s  %d inline script hash%s" % ("WROTE" if new != text else "SAME", rel, n, "" if n == 1 else "es"))
            text = new
        probs = check_page(text)
        if probs:
            bad += 1
            for pr in probs:
                print("FAIL", rel, pr)
        elif a.check:
            print("PASS", rel, "%d inline script hash%s" % (policy(text)[1], "" if policy(text)[1] == 1 else "es"))
    print("\n%d page(s), %d with a missing, misplaced or stale policy" % (len(pgs), bad))
    if a.browser:
        loads = browser_pass(root, pgs)
        print("%d page load(s) with a CSP violation or an error" % loads)
        bad += loads
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
