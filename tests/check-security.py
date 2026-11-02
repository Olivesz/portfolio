#!/usr/bin/env python3
"""Security and privacy gate for the site, run before every push beside check-claims.

The deployed site has no dependencies, so there are no advisories to track: the
risk is a regression. Each rule below fails on one kind of it, and --selftest
plants a violation of every rule in a throwaway copy and requires each to fail.

  .venv/bin/python tests/check-security.py              the tree as tracked
  .venv/bin/python tests/check-security.py --history [REF]   also every blob, message and identity reachable from REF
                                                             (default origin/main: what is public; HEAD before pushing it)
  .venv/bin/python tests/check-security.py --selftest   every rule against its planted controls, then the clean copy
  .venv/bin/python tests/check-security.py --root DIR   another copy of the site (every file under it is "shipped")

Exit 0 clean, 1 on any FAIL, 2 when a rule could not look (a missing tool or an
unreadable private source): a check that did not run is not a pass.

Rules: csp, referrer, origins, handlers, jsurl, newtab, tags, js, secrets, pii, pdftext, paths, metadata, svgpdf.
Personal values are read at run time through check-claims' private sources and
never printed: a hit names its file and kind only.
"""
import argparse
import base64
import html.parser
import importlib.util
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
SITE = "https://olivesz.github.io/portfolio/"


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


csp = _load("csp", "csp.py")
claims = _load("check_claims", "check-claims.py")


class Unknown(Exception):
    """A rule could not look: exit 2, never a pass."""


# ---------------------------------------------------------------- the site as files

SKIP_WALK = {".git", ".venv", ".private", ".srccache", "scratchpad", "__pycache__", "node_modules"}


class Site:
    def __init__(self, root):
        self.root = pathlib.Path(root).resolve()
        if (self.root / ".git").exists():
            out = subprocess.run(["git", "-C", str(self.root), "ls-files"], capture_output=True, text=True, check=True)
            rels = out.stdout.splitlines()
        else:
            rels = [p.relative_to(self.root).as_posix() for p in self.root.rglob("*")
                    if p.is_file() and not SKIP_WALK & set(p.relative_to(self.root).parts)]
        self.files = sorted(r for r in rels if (self.root / r).is_file())
        self.pages = [p.relative_to(self.root).as_posix() for p in csp.pages(self.root)]
        self._parsed = {}

    def read(self, rel):
        return (self.root / rel).read_bytes()

    def text(self, rel):
        return (self.root / rel).read_text(encoding="utf-8", errors="replace")

    def parsed(self, rel):
        if rel not in self._parsed:
            p = Page()
            p.feed(self.text(rel))
            p.close()
            self._parsed[rel] = p
        return self._parsed[rel]

    def js(self):
        """(where, text) for every inline script that runs and every .js file."""
        for rel in self.pages:
            for i, s in enumerate(self.parsed(rel).scripts):
                yield f"{rel} <script> {i + 1}", s
        for rel in self.files:
            if rel.endswith(".js"):
                yield rel, self.text(rel)

    def css(self):
        for rel in self.pages:
            p = self.parsed(rel)
            for s in p.styles:
                yield f"{rel} <style>", s
            for line, s in p.style_attrs:
                yield f"{rel}:{line} style=", s
        for rel in self.files:
            if rel.endswith(".css"):
                yield rel, self.text(rel)


def first_attrs(attrs):
    """A browser keeps the first of a repeated attribute and drops the rest, so the rules see only that one."""
    seen, out = set(), []
    for k, v in attrs:
        if k not in seen:
            seen.add(k); out.append((k, v or ""))
    return out


class Page(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.tags, self.scripts, self.styles, self.style_attrs = [], [], [], []
        self._in, self._buf = None, []

    def handle_starttag(self, tag, attrs):
        a = first_attrs(attrs)
        line = self.getpos()[0]
        self.tags.append((tag, a, line))
        self.style_attrs += [(line, v) for k, v in a if k == "style"]
        if tag in ("script", "style"):
            d = dict(a)
            run = tag == "style" or ("src" not in d and d.get("type", "").strip().lower() in csp.EXEC_TYPES)
            self._in, self._buf = (tag if run else "skip"), []

    def handle_startendtag(self, tag, attrs):
        self.tags.append((tag, first_attrs(attrs), self.getpos()[0]))

    def handle_data(self, d):
        if self._in:
            self._buf.append(d)

    def handle_endtag(self, tag):
        if self._in and tag in ("script", "style"):
            if self._in == "script":
                self.scripts.append("".join(self._buf))
            elif self._in == "style":
                self.styles.append("".join(self._buf))
            self._in = None


def pdf_text(path):
    try:
        return subprocess.run(["pdftotext", "-q", str(path), "-"], capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        raise Unknown(f"pdftotext could not read {path.name} ({e.__class__.__name__}); install poppler")


def pdf_info(path):
    """Every key of a PDF's Info dictionary, standard and custom, as {key: value}."""
    try:
        out = subprocess.run(["pdfinfo", "-custom", str(path)], capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        raise Unknown(f"pdfinfo -custom could not read {path.name} ({e.__class__.__name__}); install poppler")
    return dict((k.strip(), v.strip()) for k, _, v in (ln.partition(":") for ln in out.splitlines()) if _)


DATA_URI = re.compile(r"data:([a-z]+/[a-z0-9.+-]+)?(;[a-z0-9=-]+)*;base64,([A-Za-z0-9+/=]{16,})", re.I)
FONTS = (".woff2", ".woff", ".ttf", ".otf", ".ico")
DECODED = " (references decoded)"


def once(out):
    """A finding in a file's decoded text that its raw text already reports is reported once."""
    return [p for p in out if DECODED + ": " not in p or p.replace(DECODED + ": ", ": ", 1) not in out]


def texts(site, rels=None):
    """(where, text) for every shipped file a person could read words in: text files whole (an SVG as its words,
    as check-claims reads it), a PDF through pdftotext and its Info values, a JPEG's bytes, and every base64 data:
    URI decoded. A text file with character references is read again decoded, since a browser shows &#64; as @."""
    for rel in rels or site.files:
        path = site.root / rel
        suf = path.suffix.lower()
        if suf == ".pdf":
            yield rel + " (text)", pdf_text(path)
            yield rel + " (info)", "\n".join(f"{k}: {v}" for k, v in pdf_info(path).items())
        elif suf in (".jpg", ".jpeg", ".png"):
            yield rel + " (bytes)", site.read(rel).decode("latin-1")
        elif suf in FONTS:
            continue
        else:
            t = claims.readable(path) if suf == ".svg" else site.text(rel)
            yield rel, t
            decoded = html.unescape(t)
            if decoded != t:
                yield rel + DECODED, decoded
            for m in DATA_URI.finditer(t):
                try:
                    yield rel + " (data: URI)", base64.b64decode(m.group(3)).decode("latin-1")
                except ValueError:
                    pass


def font_bytes(site, rels=None):
    """(where, bytes) for fonts and icons, which carry no words a reader sees: scanned for secrets only."""
    return [(rel + " (bytes)", site.read(rel).decode("latin-1")) for rel in rels or site.files
            if pathlib.Path(rel).suffix.lower() in FONTS]


# ---------------------------------------------------------------- rules

def rule_csp(site):
    out = []
    for rel in site.pages:
        out += [f"{rel}: {p}" for p in csp.check_page(site.text(rel)) if "name=referrer" not in p]
    return out


def rule_referrer(site):
    out = []
    for rel in site.pages:
        vals = [dict(a).get("content") for t, a, _ in site.parsed(rel).tags
                if t == "meta" and dict(a).get("name", "").lower() == "referrer"]
        if vals != [csp.REFERRER]:
            out.append(f"{rel}: referrer policy {vals or 'missing'}, want [{csp.REFERRER!r}]")
    return out


def offsite(u):
    """Read as a browser reads it: tabs and newlines dropped anywhere, controls and spaces at the ends, and a
    backslash taken as a slash, so \\\\host, /\\host and ht<tab>tps://host all reach another origin."""
    u = re.sub(r"^[\x00-\x20]+|[\x00-\x20]+$", "", re.sub(r"[\t\n\r]", "", u)).replace("\\", "/").lower()
    return u.startswith(("http:", "https:", "//", "ftp:")) and not u.startswith(SITE)


RESOURCE = {("script", "src"), ("img", "src"), ("img", "srcset"), ("source", "src"), ("source", "srcset"),
            ("video", "src"), ("video", "poster"), ("audio", "src"), ("track", "src"), ("input", "src"),
            ("object", "data"), ("embed", "src"), ("iframe", "src"), ("frame", "src"), ("image", "href"),
            ("image", "xlink:href"), ("use", "href"), ("use", "xlink:href"), ("feimage", "href"),
            ("a", "ping"), ("area", "ping")}          # ping: a request to each listed URL when the link is followed
LOADING_REL = {"stylesheet", "preload", "modulepreload", "prefetch", "preconnect", "dns-prefetch", "icon",
               "apple-touch-icon", "manifest", "mask-icon", "prerender"}


def rule_origins(site):
    """Nothing the browser loads comes from another origin; only <a> links may leave."""
    out = []
    for rel in site.pages:
        for tag, attrs, line in site.parsed(rel).tags:
            d = dict(attrs)
            for k, v in attrs:
                urls = ([c.strip().split()[0] for c in v.split(",") if c.strip()] if k == "srcset" else
                        v.split() if k == "ping" else [v])
                # the legacy background attribute loads an image on body, table and its cells
                loads = ((tag, k) in RESOURCE or k == "background" or
                         (tag == "link" and k == "href" and LOADING_REL & set(d.get("rel", "").lower().split())))
                if loads and any(offsite(u) for u in urls):
                    out.append(f"{rel}:{line} <{tag} {k}> loads from another origin: {v[:80]}")
    for where, t in site.css():
        for u in re.findall(r"url\(\s*['\"]?([^'\")\s]+)", t):
            if offsite(u):
                out.append(f"{where}: CSS url() from another origin: {u[:80]}")
        for m in re.finditer(r"image-set\(([^;{}]*)", t, re.I):          # image-set() takes bare strings as URLs
            for u in re.findall(r"['\"]([^'\"]*)['\"]", m.group(1)):
                if offsite(u):
                    out.append(f"{where}: CSS image-set() from another origin: {u[:80]}")
        if re.search(r"@import\b", t):
            out.append(f"{where}: CSS @import")
    for where, t in site.js():
        for m in re.finditer(r"\.(src|href|data|srcset)\s*=\s*['\"`]([^'\"`\n]*)", t):
            if offsite(m.group(2)):
                out.append(f"{where}: script sets .{m.group(1)} to another origin")
        for m in re.finditer(r"setAttribute(?:\(|NS\(\s*[^,()]*,)\s*['\"`]((?:xlink:)?href|src|srcset|data|poster|ping|background)"
                             r"['\"`]\s*,\s*['\"`]([^'\"`\n]*)", t, re.I):
            if offsite(m.group(2)):
                out.append(f"{where}: script sets the {m.group(1)} attribute to another origin")
    return out


# A tag in a string a script builds: its name, attributes whose values are quoted ("x", 'x', \"x\") or bare, then an
# on* attribute, which whitespace (a newline in a template literal too), a slash or the quote closing the value before
# it separates.
BUILT_HANDLER = re.compile(r"<[a-z][\w:-]*"
                           r"(?:[\s/]+[^\s<>'\"=/\\(){};]+(?:\s*=\s*(?:\\?\"[^\"<>]*\"|\\?'[^'<>]*'|[^\s<>'\"\\/]*))?)*"
                           r"[\s/]*(?<=[\s/'\"])on[a-z]+\s*=", re.I)


def rule_handlers(site):
    """No inline event handler, in markup or in HTML a script builds (CSP blocks them; this says where)."""
    out = []
    for rel in site.pages:
        for tag, attrs, line in site.parsed(rel).tags:
            out += [f"{rel}:{line} <{tag} {k}=...>" for k, _ in attrs if k.lower().startswith("on")]
    for where, t in site.js():
        for m in BUILT_HANDLER.finditer(t):
            out.append(f"{where}: HTML built with an inline handler: {m.group(0)[:60]}")
        if re.search(r"setAttribute(?:\(|NS\(\s*[^,()]*,)\s*['\"`]on", t, re.I):     # attribute names ignore case
            out.append(f"{where}: setAttribute('on…')")
    return out


def rule_jsurl(site):
    out = []
    bad = re.compile(r"^(javascript|vbscript):|^data:text/html", re.I)
    for rel in site.pages:
        for tag, attrs, line in site.parsed(rel).tags:
            for k, v in attrs:
                if bad.search(re.sub(r"[\x00-\x20]", "", v)):
                    out.append(f"{rel}:{line} <{tag} {k}> is a script URL")
    for where, t in list(site.js()) + list(site.css()):
        if re.search(r"(javascript|vbscript)\s*:", t, re.I):
            out.append(f"{where}: a script URL in code")
    return out


def opens(target):
    """A target that opens another browsing context: _blank, or a named window, which gets a handle on this page
    like _blank (and without _blank's implicit noopener)."""
    return target.strip().lower() not in ("", "_self", "_parent", "_top")


def rule_newtab(site):
    """A new tab gets no handle on this page: every target that opens one carries rel noopener noreferrer."""
    out = []
    for rel in site.pages:
        for tag, attrs, line in site.parsed(rel).tags:
            d = dict(attrs)
            if opens(d.get("target", "")) and not {"noopener", "noreferrer"} <= set(d.get("rel", "").lower().split()):
                out.append(f"{rel}:{line} <{tag} target={d['target'][:20]}> rel={d.get('rel', '')!r}")
    for where, t in site.js():
        for m in re.finditer(r"\.target\s*=\s*['\"`]([^'\"`]*)['\"`]|setAttribute\(\s*['\"`]target['\"`]\s*,\s*['\"`]([^'\"`]*)['\"`]", t):
            if not opens(m.group(1) if m.group(1) is not None else m.group(2)):
                continue
            near = t[m.end():m.end() + 160]
            if not any({"noopener", "noreferrer"} <= set(r.lower().split()) for r in re.findall(
                    r"(?:\.rel\s*=\s*|setAttribute\(\s*['\"`]rel['\"`]\s*,\s*)['\"`]([^'\"`]*)['\"`]", near)):
                out.append(f"{where}: {m.group(0)[:40]} without rel noopener noreferrer right after it")
        for m in re.finditer(r"<a\b[^<>]*>", t):
            # a browser keeps the first of a repeated attribute, so the first target decides
            tg = re.findall(r"(?<![\w-])target\s*=\s*\\?['\"]?([^\s'\"\\<>]*)", m.group(0), re.I)
            if tg and opens(tg[0]) and not ("noopener" in m.group(0) and "noreferrer" in m.group(0)):
                out.append(f"{where}: built <a target={tg[0][:20]}> without rel noopener noreferrer")
    return out


FORBIDDEN_TAGS = {"form", "iframe", "frame", "frameset", "object", "embed", "base", "applet", "portal", "fencedframe"}


def rule_tags(site):
    out = []
    for rel in site.pages:
        for tag, attrs, line in site.parsed(rel).tags:
            if tag in FORBIDDEN_TAGS:
                out.append(f"{rel}:{line} <{tag}>")
            if tag == "meta" and dict(attrs).get("http-equiv", "").lower() == "refresh":
                out.append(f"{rel}:{line} <meta http-equiv=refresh>")
    for where, t in site.js():
        # createElementNS too: an SVG <script> runs like an HTML one
        for m in re.finditer(r"createElement(?:\(|NS\(\s*[^,()]*,)\s*['\"]([\w:.-]+)['\"]|<(\w+)\b", t):
            name = (m.group(1) or m.group(2) or "").lower().split(":")[-1]
            if name in FORBIDDEN_TAGS or (m.group(1) and name == "script"):
                out.append(f"{where}: builds <{name}>")
    return out


JS_FORBIDDEN = [
    (r"\beval\s*\(", "eval"), (r"\bnew\s+Function\b|(?<![\w.])Function\s*\(", "Function constructor"),
    (r"document\.write", "document.write"), (r"\bset(Timeout|Interval)\(\s*['\"`]", "a timer given a string"),
    (r"\bpostMessage\b|['\"]message['\"]\s*,", "postMessage / message listener"),
    (r"\blocalStorage\b", "localStorage"), (r"\bindexedDB\b", "indexedDB"), (r"document\.cookie", "document.cookie"),
    (r"\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bEventSource\b|sendBeacon", "a network request"),
    (r"\bnew\s+(Shared)?Worker\b|serviceWorker|importScripts", "a worker"), (r"(?<![\w.])import\s*\(", "dynamic import"),
    (r"window\.open\b|\bopener\b", "window.open / opener"), (r"document\.domain", "document.domain"),
    (r"\.outerHTML\s*=|\bsrcdoc\b|createContextualFragment|\bDOMParser\b", "another HTML sink"),
    (r"document\.referrer|window\.name\b|document\.URL\b|documentURI|\bbaseURI\b|location\.href|\blocation\s*=|"
     r"location\.(assign|replace)\b", "a URL read or navigation the page does not use"),
    # window['local' + 'Storage'] or location['hash'] hides which property it reaches from every pattern here
    (r"(?<![\w$.])(window|self|globalThis|document|navigator|location)\s*\[", "a browser global read by a computed name"),
]
# Every read of the URL or of storage, per file: each one was traced to a non-HTML use. A new read fails until
# someone traces it the same way and raises its count here. A performance entry's name is a URL (the navigation
# entry's is the page's own); index.html reads only the navigation entry's type, to restore the place on reload.
SOURCES = r"location\.(hash|search|pathname)|sessionStorage|getEntries\w*"
SOURCES_ALLOWED = {"index.html": {"location.hash": 2, "location.search": 1, "location.pathname": 1, "sessionStorage": 3,
                                  "getEntriesByType": 2}}


def rule_js(site):
    out, seen = [], {}
    for where, t in site.js():
        for pat, what in JS_FORBIDDEN:
            if re.search(pat, t):
                out.append(f"{where}: {what}")
        f = where.split(" ")[0]
        for m in re.finditer(SOURCES, t):
            seen.setdefault(f, {}).setdefault(m.group(0), 0)
            seen[f][m.group(0)] += 1
    for f, got in seen.items():
        for k, n in got.items():
            if n > SOURCES_ALLOWED.get(f, {}).get(k, 0):
                out.append(f"{f}: {n} read(s) of {k}, {SOURCES_ALLOWED.get(f, {}).get(k, 0)} traced; trace the new one to "
                           "a non-HTML use, then raise SOURCES_ALLOWED")
    return out


SECRETS = [
    ("aws_key", r"\b(AKIA|ASIA)[0-9A-Z]{16}\b"),
    ("aws_secret", r"(?i)aws.{0,20}(secret|private).{0,20}['\"][A-Za-z0-9/+=]{40}['\"]"),
    ("github_token", r"\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})"),
    ("api_key_sk", r"\bsk-(ant-|proj-)?[A-Za-z0-9_\-]{20,}"),
    ("slack_token", r"\bxox[abposr]-[A-Za-z0-9\-]{10,}"),
    ("slack_webhook", r"hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+"),
    ("google_api_key", r"\bAIza[0-9A-Za-z_\-]{35}"),
    ("google_oauth_secret", r"GOCSPX-[A-Za-z0-9_\-]{20,}"),
    ("stripe_key", r"\b[rsp]k_(live|test)_[0-9A-Za-z]{16,}"),
    ("hf_token", r"\bhf_[A-Za-z0-9]{30,}"),
    ("notion_token", r"\b(secret_[A-Za-z0-9]{40,}|ntn_[A-Za-z0-9]{40,})"),
    ("sendgrid_key", r"\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}"),
    ("twilio_sid", r"\b(AC|SK)[0-9a-f]{32}\b"),
    ("private_key", r"-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY( BLOCK)?-----"),
    ("jwt", r"\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"),
    ("url_credentials", r"\b[a-z][a-z0-9+.\-]{1,15}://[^/\s:@'\"<>]{1,64}:[^/\s:@'\"<>]{1,128}@[A-Za-z0-9.\-]+"),
    ("password_assign", r"(?i)\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b"
                        r"\s*[:=]\s*['\"][^'\"\s]{6,}['\"]"),
    ("bearer_header", r"(?i)authorization['\"]?\s*[:=]\s*['\"]?(bearer|token|basic)\s+[A-Za-z0-9._\-+/=]{16,}"),
]


def scan_secrets(items):
    out = []
    for where, t in items:
        for name, pat in SECRETS:
            if re.search(pat, t):
                out.append(f"{where}: looks like a secret ({name}); value withheld")
    return once(out)


def rule_secrets(site):
    return scan_secrets(list(texts(site)) + font_bytes(site))


# The one identity commits carry; it is public in every commit already.
COMMIT_IDENTITIES = {"oliver.zhang0712@gmail.com"}
# The addresses the site publishes on purpose, and the commit identity. Any other address in a shipped file fails,
# so a private one is caught without being written here.
ALLOWED_EMAILS = {"oliver.zhang@utexas.edu"} | COMMIT_IDENTITIES
EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")
STREET = re.compile(r"\b\d{2,6}\s+([A-Z][a-z]+\s){1,3}(?i:street|st\.|avenue|ave\.?|road|rd\.|boulevard|blvd|lane|ln\.|drive|dr\.|"
                    r"court|ct\.|parkway|pkwy|circle|cir\.|trail|trl)\b(?!-)")
SSN = re.compile(r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)")


def private():
    """(phone numbers, private repository name, private retired patterns), all read at run time, never printed."""
    nums = claims.private_numbers()
    if not nums:
        raise Unknown(f"the private profile behind {claims.PRIVATE_PROFILE} is unreadable or has no phone; "
                      "the personal-data rule cannot look")
    hidden, _ = claims.private_retired()
    if not hidden:
        raise Unknown(f"the private retired patterns in {claims.PRIVATE_RETIRED} are unreadable; the rule cannot look")
    return nums, claims.PRIVATE_PROFILE.resolve().parents[1].name, [p for p, _ in hidden]


def scan_pii(items, priv):
    nums, repo, hidden = priv
    out = []
    for where, t in items:
        if any(re.search(p, t, re.I) for p in hidden):
            out.append(f"{where}: <private retired claim> (an employer-internal or private-repository detail)")
        if any(claims.leaks(t, d) for d in nums):
            out.append(f"{where}: <personal number>")
        if re.search(re.escape(repo), t, re.I):
            out.append(f"{where}: <private repo name>")
        for m in EMAIL.finditer(t):
            e = m.group(0)
            if e.lower() not in ALLOWED_EMAILS and not re.search(r"\.(png|jpe?g|svg|js|css|woff2?|html)$", e, re.I):
                out.append(f"{where}: an address not on the published list: {e[:2]}…@…{e[-4:]}")
        if STREET.search(t):
            out.append(f"{where}: a street address")
        if SSN.search(t):
            out.append(f"{where}: an SSN-shaped number")
    return once(out)


def rule_pii(site):
    return scan_pii(texts(site), private())


def rule_pdftext(site):
    """check-claims skips PDFs, so the public retired claims are matched against each PDF's text here (the
    unscoped ones: a scoped claim belongs to its own pages). Private ones are in pii, which reads PDFs too."""
    out = []
    for rel in site.files:
        if rel.lower().endswith(".pdf"):
            text = pdf_text(site.root / rel)
            for pattern, reason, *globs in claims.RETIRED:
                if not globs and re.search(pattern, text, re.I):
                    out.append(f"{rel}: a retired claim ({reason.splitlines()[0][:70]})")
    return out


# Written so that this file does not match itself.
LOCAL_PATH = re.compile(r"(/User[s]/[A-Za-z0-9._\-]+/|/home/[a-z][a-z0-9_\-]+/|[A-Za-z]:\\\\?Users\\\\?|/private/(tmp|var)/|"
                        r"/var/folder[s]/|file:/{2}|~/Project[s]/|/Volumes/[A-Za-z])")
# custos-code's fixtures show an agent working in a made-up checkout; that path is the figure's subject, not ours
EXAMPLE_PATHS = ("/home/dev/",)


def scan_paths(items):
    out = []
    for where, t in items:
        m = next((m for m in LOCAL_PATH.finditer(t) if not m.group(0).startswith(EXAMPLE_PATHS)), None)
        if m:
            out.append(f"{where}: a local path ({m.group(0)[:12]}…)")
    return once(out)


def rule_paths(site):
    return scan_paths(texts(site))


def jpeg_problems(b):
    if b[:2] != b"\xff\xd8":
        return ["not a JPEG"]
    out, i = [], 2
    while i + 4 <= len(b):
        if b[i] != 0xFF:
            return out + ["bytes outside a segment"]
        m = b[i + 1]
        if m == 0xD9:
            break
        n = int.from_bytes(b[i + 2:i + 4], "big")
        body = b[i + 4:i + 2 + n]
        if m == 0xFE:
            out.append("a comment (COM) segment")
        elif 0xE0 <= m <= 0xEF and not ((m == 0xE0 and body.startswith(b"JFIF\0")) or (m == 0xE2 and body.startswith(b"ICC_PROFILE\0"))):
            out.append(f"an APP{m - 0xE0} segment ({body[:12]!r}): EXIF, XMP and maker data are personal metadata")
        if m == 0xDA:                                     # entropy-coded data runs to EOI
            j = b.find(b"\xff\xd9", i)
            if j < 0:
                return out + ["no end of image"]
            if b[j + 2:].strip(b"\0"):
                out.append(f"{len(b) - j - 2} bytes after the end of the image")
            return out
        i += 2 + n
    return out


def png_problems(b):
    out, i = [], 8
    while i + 8 <= len(b):
        n, kind = int.from_bytes(b[i:i + 4], "big"), b[i + 4:i + 8]
        if kind in (b"tEXt", b"zTXt", b"iTXt", b"eXIf", b"tIME"):
            out.append(f"a {kind.decode()} chunk")
        i += 12 + n
    return out


# The Info keys a PDF may carry: the tools that made it and when. Their values are still read for secrets, personal
# data and paths (texts() yields them); every other key, standard (Title, Author...) or custom, fails when set.
PDF_INFO_ALLOWED = {"Creator", "Producer", "CreationDate", "ModDate", "Trapped", "PTEX.Fullbanner"}


def pdf_problems(path):
    try:
        info = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        raise Unknown(f"pdfinfo could not read {path.name} ({e.__class__.__name__}); install poppler")
    f = dict((k.strip(), v.strip()) for k, _, v in (ln.partition(":") for ln in info.splitlines()) if _)
    out = [f"PDF {k} is set" if k in ("Title", "Author", "Subject", "Keywords") else "PDF has a custom Info key set"
           for k, v in pdf_info(path).items() if v and k not in PDF_INFO_ALLOWED]   # a custom key's name is not printed
    out += ["PDF has an XMP metadata stream" for _ in [0] if f.get("Metadata Stream") == "yes"]
    out += ["PDF has JavaScript" for _ in [0] if f.get("JavaScript") not in ("no", None)]
    out += ["PDF has a form" for _ in [0] if f.get("Form") not in ("none", None)]
    return out


def svg_problems(t):
    out = []
    for pat, what in ((r"<metadata\b", "a <metadata> block"), (r"<!--", "a comment"), (r"\b(inkscape|sodipodi|sketch|figma):", "editor data"),
                      (r"<script\b", "a script"), (r"<foreignObject\b", "a foreignObject"), (r"\son[a-z]+\s*=", "an event handler"),
                      (r"(?:href|src)\s*=\s*['\"](https?:|//)", "a reference to another origin")):
        if re.search(pat, t, re.I):
            out.append(what)
    return out


def rule_metadata(site, rels=None):
    out = []
    for rel in rels or site.files:
        suf = pathlib.Path(rel).suffix.lower()
        if suf in (".jpg", ".jpeg"):
            out += [f"{rel}: {p}" for p in jpeg_problems(site.read(rel))]
        elif suf == ".png":
            out += [f"{rel}: {p}" for p in png_problems(site.read(rel))]
        elif suf == ".pdf":
            out += [f"{rel}: {p}" for p in pdf_problems(site.root / rel)]
        elif suf == ".svg":
            out += [f"{rel}: {p}" for p in svg_problems(site.text(rel))]
    return out


def rule_svgpdf(site):
    """resume-page.svg is the résumé's glyphs as outlines, unreadable as text, so it must draw what resume.pdf draws:
    then the PDF's text check covers it. Both are rendered at 144 dpi and compared pixel by pixel."""
    svg, pdf = site.root / "resume-page.svg", site.root / "resume.pdf"
    if not svg.is_file() and not pdf.is_file():
        return []
    if not (svg.is_file() and pdf.is_file()):
        return ["one of resume-page.svg and resume.pdf is missing"]
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise Unknown("svgpdf needs Playwright: run with .venv/bin/python")
    with tempfile.TemporaryDirectory() as d:
        try:
            subprocess.run(["pdftoppm", "-r", "144", "-f", "1", "-l", "1", "-singlefile", "-png", str(pdf), d + "/pdf"],
                           check=True, capture_output=True)
        except (OSError, subprocess.CalledProcessError) as e:
            raise Unknown(f"pdftoppm could not render resume.pdf ({e.__class__.__name__}); install poppler")
        with sync_playwright() as p:
            br = p.chromium.launch()
            pg = br.new_page(viewport={"width": 1224, "height": 1584})
            pg.set_content('<body style="margin:0"><img id="i" style="display:block;width:1224px;height:1584px"></body>')
            pg.evaluate("s => new Promise(r => { const i = document.getElementById('i'); i.onload = r; i.src = s; })",
                        "data:image/svg+xml;base64," + base64.b64encode(svg.read_bytes()).decode())
            pg.screenshot(path=d + "/svg.png")
            pdf_png = base64.b64encode(pathlib.Path(d + "/pdf.png").read_bytes()).decode()
            n, worst = pg.evaluate("""async ([a, b]) => {
              const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
              const [x, y] = await Promise.all([load(a), load(b)]);
              if (x.width !== y.width || x.height !== y.height) return [-1, 0];
              const px = im => { const c = new OffscreenCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0);
                                 return g.getImageData(0, 0, im.width, im.height).data; };
              const p = px(x), q = px(y), W = x.width, H = x.height, K = 8; let n = 0, worst = 0;
              for (let by = 0; by + K <= H; by += K) for (let bx = 0; bx + K <= W; bx += K) {
                let s = 0;
                for (let yy = by; yy < by + K; yy++) for (let xx = bx; xx < bx + K; xx++) {
                  const i = (yy * W + xx) * 4; s += p[i] + p[i + 1] + p[i + 2] - q[i] - q[i + 1] - q[i + 2]; }
                const d = Math.abs(s) / (3 * K * K); worst = Math.max(worst, d); if (d > %d) n++; }
              return [n, Math.round(worst)]; }""" % SVGPDF_LEVELS,
                                   [base64.b64encode(pathlib.Path(d + "/svg.png").read_bytes()).decode(), pdf_png])
            br.close()
    if n < 0:
        return ["resume-page.svg and resume.pdf render at different sizes"]
    return [] if n == 0 else [f"resume-page.svg draws something resume.pdf does not: {n} 8x8 block(s) differ by more than "
                              f"{SVGPDF_LEVELS} of 255 (worst {worst})"]


# Each 8x8 pixel block's mean grey, SVG against PDF. Anti-aliasing alone reaches 29 on the tree as committed; one 7pt
# letter drawn into the SVG reaches 73, a 9pt phone-shaped line 101.
SVGPDF_LEVELS = 48

RULES = [("csp", rule_csp), ("referrer", rule_referrer), ("origins", rule_origins), ("handlers", rule_handlers),
         ("jsurl", rule_jsurl), ("newtab", rule_newtab), ("tags", rule_tags), ("js", rule_js), ("secrets", rule_secrets),
         ("pii", rule_pii), ("pdftext", rule_pdftext), ("paths", rule_paths), ("metadata", rule_metadata), ("svgpdf", rule_svgpdf)]


def run_rules(site, only=None, quiet=False):
    """{rule: problems or Unknown}."""
    res = {}
    for name, fn in RULES:
        if only and name not in only:
            continue
        try:
            res[name] = fn(site)
        except Unknown as e:
            res[name] = e
        if not quiet:
            r = res[name]
            if isinstance(r, Unknown):
                print(f"UNKNOWN {name}: {r}")
            else:
                print(f"{'FAIL' if r else 'PASS'} {name}" + (f" ({len(r)})" if r else ""))
                for p in r[:12]:
                    print("    " + p)
                if len(r) > 12:
                    print(f"    … {len(r) - 12} more")
    return res


# ---------------------------------------------------------------- history

def git(root, *args, binary=False):
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, check=True, text=not binary).stdout


def history(root, ref):
    """Every blob reachable from ref (deleted and overwritten versions included), every commit message and identity."""
    priv = private()
    objs = {}
    for line in git(root, "rev-list", "--objects", ref).splitlines():
        sha, _, path = line.partition(" ")
        if path:
            objs.setdefault(sha, path)
    kinds = dict(ln.split(" ", 1) for ln in git(root, "cat-file", "--batch-check=%(objectname) %(objecttype)", "--batch-all-objects").splitlines())
    blobs = {s: p for s, p in objs.items() if kinds.get(s) == "blob"}
    out = []
    with tempfile.TemporaryDirectory() as d:
        dd = pathlib.Path(d)
        for sha, path in blobs.items():
            b = git(root, "cat-file", "blob", sha, binary=True)
            f = dd / (sha + pathlib.Path(path).suffix)
            f.write_bytes(b)
            fake = Site.__new__(Site)
            fake.root, fake.files, fake.pages, fake._parsed = dd, [f.name], [], {}
            where = f"{path}@{sha[:8]}"
            items = [(where + w[len(f.name):], t) for w, t in texts(fake)]
            raw = [(where + w[len(f.name):], t) for w, t in font_bytes(fake)]
            out += scan_secrets(items + raw) + scan_pii(items, priv) + scan_paths(items)
            out += [f"{where}: {p.split(': ', 1)[1]}" for p in rule_metadata(fake)]
    log = git(root, "log", "--format=%H%x00%an <%ae>%x00%cn <%ce>%x00%B%x01", ref)
    for rec in log.split("\x01"):
        if not rec.strip():
            continue
        h, a, c, msg = (rec.strip("\n").split("\x00") + ["", "", "", ""])[:4]
        items = [(f"commit {h[:8]} message", msg)]
        out += scan_secrets(items) + scan_pii(items, priv) + scan_paths(items)
        for who in (a, c):
            e = who[who.rfind("<") + 1:-1]
            if e not in COMMIT_IDENTITIES:
                out.append(f"commit {h[:8]}: an identity outside the published one ({e[:2]}…@…{e[-4:]})")
    return out, len(blobs)



# ---------------------------------------------------------------- self-test

def _tok(*parts):
    """A planted value assembled at run time, so this file never holds one whole."""
    return "".join(parts)


def plants():
    """(rule, label, {file: transform}) — each transform takes the file's bytes and returns the planted bytes."""
    def add(text, where="</body>"):
        return lambda b: b.decode().replace(where, text + where, 1).encode()

    def append(text):
        return lambda b: b + ("\n" + text + "\n").encode()

    def first_script_space(b):
        t = b.decode()
        i = t.index("<script>") + len("<script>")
        return (t[:i] + " " + t[i:]).encode()

    def jpeg_insert(seg):
        return lambda b: b[:2] + seg + b[2:]

    nums, repo, _ = private()
    exif = b"\xff\xe1" + (2 + 14).to_bytes(2, "big") + b"Exif\0\0" + b"MM\0*\0\0\0\x08"
    com = b"\xff\xfe" + (2 + 7).to_bytes(2, "big") + b"planted"
    png = (b"\x89PNG\r\n\x1a\n" + (13).to_bytes(4, "big") + b"IHDR" + b"\0\0\0\x01\0\0\0\x01\x08\x02\0\0\0" + b"\0" * 4 +
           (7).to_bytes(4, "big") + b"tEXt" + b"Author\0x" + b"\0" * 4 + (0).to_bytes(4, "big") + b"IEND" + b"\0" * 4)
    def info_pdf(entries):
        return (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
                b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n4 0 obj<<" + entries + b">>endobj\n"
                b"trailer<</Root 1 0 R/Info 4 0 R/Size 5>>\n%%EOF\n")

    def refs(s):
        return "".join(f"&#{ord(c)};" for c in s)

    pdf = info_pdf(b"/Author(planted person)")
    secret = {
        "aws_key": _tok("AKIA", "IOSFODNN7EXAMPLE"),
        "aws_secret": _tok("aws_secret_access_key = '", "wJalrXUtnFEMI/K7MDENG", "/bPxRfiCYEXAMPLEKEY", "'"),
        "github_token": _tok("gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"),
        "api_key_sk": _tok("sk", "-proj-", "PLANTEDplantedPLANTED0123456789ab"),
        "slack_token": _tok("xo", "xb-", "123456789012-PLANTEDtoken"),
        "slack_webhook": _tok("https://hooks.slack.com/services/", "T0PLANT00/B0PLANT00/PLANTEDplanted"),
        "google_api_key": _tok("AI", "za", "SyPLANTEDplantedPLANTEDplanted01234"),
        "google_oauth_secret": _tok("GOC", "SPX-", "PLANTEDplantedPLANTED0123"),
        "stripe_key": _tok("sk", "_live_", "PLANTEDplanted0123456789"),
        "hf_token": _tok("hf", "_", "PLANTEDplantedPLANTEDplanted012345"),
        "notion_token": _tok("ntn", "_", "PLANTEDplantedPLANTEDplantedPLANTEDplanted0123"),
        "sendgrid_key": _tok("SG", ".", "PLANTEDplantedPLANTED0", ".", "PLANTEDplantedPLANTEDplantedPLANTEDplanted0"),
        "twilio_sid": _tok("A", "C", "0123456789abcdef0123456789abcdef"),
        "private_key": _tok("-----BEGIN OPENSSH ", "PRIVATE KEY-----"),
        "jwt": _tok("ey", "JhbGciOiJIUzI1NiJ9.", "ey", "JzdWIiOiJwbGFudGVkIn0.c2lnbmF0dXJlLXBsYW50ZWQ"),
        "url_credentials": _tok("https://planteduser", ":plantedpass@", "example.com/repo.git"),
        "password_assign": _tok("pass", "word = \"", "Planted-Pass-123\""),
        "bearer_header": _tok("Authorization: ", "Bearer ", "PLANTEDplantedPLANTED0123456789"),
    }
    p = [
        ("csp", "an inline script edited without --write", {"work/kronos.html": first_script_space}),
        ("csp", "'unsafe-inline' added to script-src", {"index.html": lambda b: b.replace(b"script-src 'self'", b"script-src 'self' 'unsafe-inline'", 1)}),
        ("csp", "the policy removed", {"work/emergence-deep.html": lambda b: re.sub(rb'<meta http-equiv="Content-Security-Policy"[^\n]*\n', b"", b)}),
        ("referrer", "the referrer meta removed", {"work/freeflow.html": lambda b: re.sub(rb'<meta name="referrer"[^\n]*\n', b"", b)}),
        ("referrer", "the referrer set to unsafe-url", {"404.html": lambda b: b.replace(b'content="no-referrer"', b'content="unsafe-url"')}),
        ("origins", "a CDN script", {"work/inf-mem.html": add('<script src="https://cdn.example.com/lib.js"></script>')}),
        ("origins", "a protocol-relative image", {"work/kronos.html": add('<img src="//img.example.com/x.png" alt="">')}),
        ("origins", "a stylesheet from another origin", {"404.html": add('<link rel="stylesheet" href="https://fonts.example.com/a.css">', "</head>")}),
        ("origins", "a CSS url() from another origin", {"work/assets/case.css": append(".x{background:url(https://img.example.com/t.png)}")}),
        ("origins", "a script setting src to another origin", {"work/assets/deep.js": append('img.src = "https://track.example.com/p.gif";')}),
        ("origins", "a \\\\host image (a browser reads \\ as /)", {"work/freeflow.html": add(r'<img src="\\img.example.com/x.png" alt="">')}),
        ("origins", "a /\\host image", {"work/custos-code.html": add(r'<img src="/\img.example.com/x.png" alt="">')}),
        ("origins", "a tab inside the scheme", {"work/inf-mem.html": add('<img src="ht&#9;tps://img.example.com/x.png" alt="">')}),
        ("origins", "a body background attribute", {"work/emergence.html": lambda b: b.replace(b"<body", b'<body background="https://img.example.com/b.png"', 1)}),
        ("origins", "an <a ping> beacon", {"work/ai-capabilities.html": add('<a href="/" ping="https://track.example.com/p">x</a>')}),
        ("origins", "a CSS image-set() string", {"work/assets/deep.css": append('.zz{background-image:image-set("https://img.example.com/a.png" 1x)}')}),
        ("origins", "a script setting the src attribute to another origin", {"work/assets/custos-deep.js": append("img.setAttribute('src', 'https://track.example.com/p.gif');")}),
        ("origins", "a script setting src to a \\\\host URL", {"work/assets/wwcpu.js": append(r"img.src = '\\\\track.example.com/p.gif';")}),
        ("handlers", "an onclick attribute", {"work/custos-code.html": add('<button type="button" onclick="go()">x</button>')}),
        ("handlers", "an onerror attribute in an SVG", {"work/emergence.html": add('<svg><image href="x.png" onerror="go()"/></svg>')}),
        ("handlers", "HTML with a handler built in a script", {"work/assets/emergence-deep.js": append("el.innerHTML = '<img src=x onerror=go()>';")}),
        ("handlers", "built HTML with a quoted attribute before the handler", {"work/assets/case.js": append("el.innerHTML = '<img src=\"x.png\" onerror=\"go()\">';")}),
        ("handlers", "built HTML with the handler on the next line", {"work/assets/deep.js": append("el.innerHTML = `<img src=x\nonerror=go()>`;")}),
        ("handlers", "setAttribute('ONCLICK') in upper case", {"work/assets/ww.js": append("el.setAttribute('ONCLICK', 'go()');")}),
        ("handlers", "setAttributeNS(null, 'onclick')", {"work/assets/deep-freeflow.js": append("el.setAttributeNS(null, 'onclick', 'go()');")}),
        ("jsurl", "a javascript: link", {"work/ai-capabilities.html": add('<a href=" JavaScript:go()">x</a>')}),
        ("jsurl", "a javascript: URL in a script", {"work/assets/ww.js": append('a.href = "javascript:void 0";')}),
        ("newtab", "target=_blank without rel", {"work/inf-mem-deep.html": add('<a href="https://example.com/" target="_blank">x</a>')}),
        ("newtab", "a built link with target but no rel", {"work/assets/custos-deep.js": append('a.target = "_blank"; a.href = u;')}),
        ("newtab", "a named target without rel", {"work/kronos-deep.html": add('<a href="https://example.com/" target="other">x</a>')}),
        ("newtab", "a repeated target, where the browser keeps the first", {"work/emergence-deep.html": add('<a href="https://example.com/" target="other" target="_self">x</a>')}),
        ("newtab", "setAttribute('target', '_blank') without rel", {"work/assets/case.js": append("a.setAttribute('target', '_blank'); a.href = u;")}),
        ("newtab", "a script setting a named target without rel", {"work/assets/ww.js": append('a.target = "other"; a.href = u;')}),
        ("newtab", "built HTML with a named target and no rel", {"work/assets/deep.js": append("el.innerHTML = '<a href=\"/\" target=\"other\">x</a>';")}),
        ("newtab", "built HTML with a repeated target, where the browser keeps the first", {"work/assets/case.js": append(
            "el.innerHTML = '<a href=\"/\" target=\"_blank\" target=\"_self\">x</a>';")}),
        ("tags", "a form", {"index.html": add('<form action="/x"></form>')}),
        ("tags", "an iframe", {"work/freeflow-deep.html": add('<iframe src="about:blank"></iframe>')}),
        ("tags", "a base element", {"work/kronos-deep.html": add('<base href="/">', "</head>")}),
        ("tags", "a meta refresh", {"work/emergence.html": add('<meta http-equiv="refresh" content="0;url=/">', "</head>")}),
        ("tags", "a script that builds a script element", {"work/assets/deep.js": append('document.head.appendChild(document.createElement("script"));')}),
        ("tags", "a script that builds an SVG script element", {"work/assets/emergence-deep.js": append(
            "document.body.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'script'));")}),
    ]
    for api in ("eval(code)", "new Function(code)", "document.write(x)", 'setTimeout("go()", 9)', "parent.postMessage(x, '*')",
                "localStorage.setItem('k', 1)", "document.cookie = 'a=1'", "fetch('/x')", "new XMLHttpRequest()", "new WebSocket(u)",
                "navigator.sendBeacon(u)", "new Worker('w.js')", "import('./m.js')", "window.open(u)", "el.outerHTML = s",
                "var r = document.referrer", "location.href = u", "var u = document.baseURI", "indexedDB.open('x')",
                "var h = location['hash']", "var s = window['local' + 'Storage']"):
        p.append(("js", api, {"work/assets/sap1_fib.js": append(api + ";")}))
    p.append(("js", "a new read of location.hash", {"work/assets/deep.js": append("var h = location.hash;")}))
    p.append(("js", "a fourth sessionStorage read on index.html",
              {"index.html": lambda b: b.replace(b"var PLACE_KEY", b"sessionStorage.length; var PLACE_KEY", 1)}))
    p.append(("js", "the URL through a performance entry", {"work/assets/deep.js": append("var u = performance.getEntriesByType('navigation')[0].name;")}))
    for name, v in secret.items():
        p.append(("secrets", name, {"README.md": append(v)}))
    p.append(("secrets", "a token inside a data: URI", {"work/assets/case.css": append(
        ".y{background:url(data:text/plain;base64," + base64.b64encode(secret["github_token"].encode()).decode() + ")}")}))
    p += [
        ("secrets", "a token written as character references", {"work/emergence-deep.html": add("<p>" + refs(secret["github_token"]) + "</p>")}),
        ("secrets", "a token in a font's bytes", {"work/assets/jetbrains-mono.woff2": lambda b: b + secret["github_token"].encode()}),
        ("secrets", "a token in an icon's bytes", {"work/og/planted.ico": lambda b: secret["github_token"].encode()}),
        ("pii", "the phone number (never printed)", {"tests/HOOKS.md": append(f"({nums[0][:3]}) {nums[0][3:6]}-{nums[0][6:]}")}),
        ("pii", "the phone number as character references", {"work/kronos.html": add("<p>" + refs(nums[0]) + "</p>")}),
        ("pii", "an address as character references", {"work/freeflow-deep.html": add("<p>" + refs(_tok("someone.else", "@", "example.org")) + "</p>")}),
        ("pii", "the phone number in a JPEG's bytes", {"work/og/kronos.jpg": jpeg_insert(b"\xff\xfe" + (2 + 10).to_bytes(2, "big") + nums[0].encode())}),
        ("pii", "the private repository's name", {"robots.txt": append(repo)}),
        ("pii", "an address not on the published list", {"sitemap.xml": append("<!-- " + _tok("someone.else", "@", "example.org") + " -->")}),
        ("pii", "a street address", {"work/kronos.html": add("<p>" + _tok("1234 Planted", " Oak Street") + "</p>")}),
        ("pii", "an SSN-shaped number", {"README.md": append(_tok("078-", "05-1120"))}),
        ("paths", "a macOS home path", {"README.md": append(_tok("/Us", "ers/plantedname/Projects/x"))}),
        ("paths", "a Linux home path", {"tests/HOOKS.md": append(_tok("/ho", "me/planted/x"))}),
        ("paths", "a Windows home path", {"work/assets/deep.css": append("/* " + _tok("C:", "\\Users\\planted") + " */")}),
        ("paths", "a temp path", {"work/assets/case.js": append("// " + _tok("/priv", "ate/tmp/x"))}),
        ("paths", "a file URL", {"index.html": add("<!-- " + _tok("fi", "le://", "x") + " -->")}),
        ("paths", "a home path as character references", {"404.html": add("<p>" + refs(_tok("/Us", "ers/planted/x")) + "</p>")}),
        ("paths", "a home path in a PDF's Creator", {"work/planted.pdf": lambda b: info_pdf(b"/Creator(" + _tok("/Us", "ers/planted/x").encode() + b")")}),
        ("metadata", "an EXIF segment in a JPEG", {"poster.jpg": jpeg_insert(exif)}),
        ("metadata", "a comment segment in a JPEG", {"work/og/emergence.jpg": jpeg_insert(com)}),
        ("metadata", "bytes after a JPEG's end", {"work/og/freeflow.jpg": lambda b: b + b"planted trailer"}),
        ("metadata", "a PNG text chunk", {"work/og/planted.png": lambda b: png}),
        ("metadata", "a PDF author", {"work/planted.pdf": lambda b: pdf}),
        ("metadata", "a PDF title", {"work/planted.pdf": lambda b: info_pdf(b"/Title(planted title)")}),
        ("metadata", "a custom PDF Info key", {"work/planted.pdf": lambda b: info_pdf(b"/PlantedKey(planted)")}),
        ("metadata", "an SVG metadata block", {"resume-page.svg": lambda b: b.replace(b"<defs>", b"<metadata>planted</metadata><defs>", 1)}),
        ("pdftext", "a retired claim in a PDF's text", {"work/planted.pdf": lambda b: text_pdf(_tok("building in", " public"))}),
        ("pii", "a private retired claim in a PDF's text (a planted private pattern)", {"work/planted.pdf": lambda b: text_pdf(PLANTED_PRIVATE)}),
        ("pii", "a private retired claim in a page (a planted private pattern)", {"work/emergence.html": add("<p>" + PLANTED_PRIVATE + "</p>")}),
        ("svgpdf", "a black bar the size of a line of text drawn into the résumé SVG",
         {"resume-page.svg": lambda b: b.replace(b"</svg>", b'<rect x="300" y="740" width="200" height="12" fill="#000"/></svg>')}),
    ]
    return p


def text_pdf(words):
    s = b"BT /F1 12 Tf 72 700 Td (" + words.encode() + b") Tj ET"
    return (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
            b"4 0 obj<</Length " + str(len(s)).encode() + b">>stream\n" + s + b"\nendstream endobj\n"
            b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R/Size 6>>\n%%EOF\n")


# The private patterns cannot be planted without writing one here, so the self-test adds this one to them: it proves
# the private patterns reach every surface (pages, PDF text, history), not what each private pattern matches;
# check-claims' own controls cover that.
PLANTED_PRIVATE = _tok("Planted", "Internal", "Codename")


def selftest(src):
    real = claims.private_retired
    claims.private_retired = lambda: ((real()[0] or []) + [(PLANTED_PRIVATE, "planted")], real()[1]) if real()[0] else real()
    try:
        return _selftest(src)
    finally:
        claims.private_retired = real


def _selftest(src):
    src_site = Site(src)
    plan = plants()
    with tempfile.TemporaryDirectory() as d:
        root = pathlib.Path(d)
        for rel in src_site.files:
            (root / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_site.root / rel, root / rel)
        clean = run_rules(Site(root), quiet=True)
        bad = {k: v for k, v in clean.items() if v}
        for k, v in bad.items():
            print(f"    {k}: {v if isinstance(v, Unknown) else v[:3]}")
        print(("FAIL" if bad else "PASS") + " the clean copy passes every rule" + (f": {sorted(bad)}" if bad else ""))
        ok, total, fired = not bad, 0, {}
        for rule, label, edits in plan:
            total += 1
            saved = {}
            for rel, fn in edits.items():
                f = root / rel
                saved[rel] = f.read_bytes() if f.exists() else None
                f.write_bytes(fn(saved[rel] or b""))
            res = run_rules(Site(root), only={rule}, quiet=True)[rule]
            base = clean[rule] if isinstance(clean[rule], list) else []
            hit = isinstance(res, list) and bool(set(res) - set(base))     # a problem the clean copy does not have
            fired[rule] = fired.get(rule, 0) + hit
            print(f"{'PASS' if hit else 'FAIL'} {rule}: {label} -> " + ("fails" if hit else f"NOT caught ({res})"))
            ok &= hit
            for rel, b in saved.items():
                if b is None:
                    (root / rel).unlink()
                else:
                    (root / rel).write_bytes(b)
        again = {k: v for k, v in run_rules(Site(root), quiet=True).items() if v}
        print(("FAIL" if again else "PASS") + " the copy passes again with every plant removed")
        ok &= not again
        ok &= history_selftest(root)
    missing = [n for n, _ in RULES if not fired.get(n)]
    if missing:
        print("FAIL rules with no planted control:", missing)
        ok = False
    print(f"\n{total} planted controls over {len(RULES)} rules: " + ("every one caught" if ok else "NOT all caught"))
    return 0 if ok else 1


def history_selftest(root):
    """--history on a throwaway repository of the copy: clean, then a secret added and deleted again, the phone
    number in a message, a local path in a message and a foreign identity. Each must be reported."""
    me = list(COMMIT_IDENTITIES)[0]
    env = ["-c", "user.name=Planted", "-c", f"user.email={me}", "-c", "commit.gpgsign=false"]
    nums = private()[0]

    def commit(msg, ident=None):
        e = env if not ident else ["-c", "user.name=Planted", "-c", f"user.email={ident}", "-c", "commit.gpgsign=false"]
        subprocess.run(["git", "-C", str(root), *e, "add", "-A"], check=True, capture_output=True)
        subprocess.run(["git", "-C", str(root), *e, "commit", "-q", "--allow-empty", "-m", msg], check=True, capture_output=True)

    subprocess.run(["git", "-C", str(root), "init", "-q"], check=True, capture_output=True)
    commit("clean")
    probs, _ = history(root, "HEAD")
    ok = not probs
    print(("PASS" if ok else "FAIL") + " history: the copy as one clean commit passes" + (f": {probs[:3]}" if probs else ""))
    tok = _tok("gh", "p_", "Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2")
    for label, act, want in (
            ("a token committed, then deleted", lambda: ((root / "planted.txt").write_text(tok), commit("add"),
                                                          (root / "planted.txt").unlink(), commit("remove")), "secret"),
            ("the phone number in a message", lambda: commit(f"call ({nums[0][:3]}) {nums[0][3:6]}-{nums[0][6:]}"), "<personal number>"),
            ("a local path in a message", lambda: commit("built in " + _tok("/Us", "ers/planted/x")), "local path"),
            ("a foreign identity", lambda: commit("x", ident=_tok("planted", "@", "example.org")), "identity"),
            ("a private retired claim in a deleted file", lambda: ((root / "p.md").write_text(PLANTED_PRIVATE), commit("a"),
                                                                    (root / "p.md").unlink(), commit("b")), "private retired")):
        act()
        got = [p for p in history(root, "HEAD")[0] if want in p]
        print(("PASS" if got else "FAIL") + f" history: {label} -> " + ("reported" if got else "NOT reported"))
        ok &= bool(got)
    shutil.rmtree(root / ".git")
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=str(REPO))
    ap.add_argument("--history", nargs="?", const="origin/main", default=None, metavar="REF",
                    help="also scan every blob, message and identity reachable from REF (default origin/main, what is public)")
    ap.add_argument("--selftest", action="store_true", help="plant a violation of every rule in a throwaway copy; each must fail")
    ap.add_argument("--only", default="", help="comma-separated rules")
    a = ap.parse_args()
    if a.selftest:
        return selftest(a.root)
    site = Site(a.root)
    res = run_rules(site, only=set(filter(None, a.only.split(","))) or None)
    fails = sum(1 for r in res.values() if r and not isinstance(r, Unknown))
    unknown = sum(1 for r in res.values() if isinstance(r, Unknown))
    if a.history:
        try:
            hist, n = history(site.root, a.history)
            print(f"{'FAIL' if hist else 'PASS'} history: {n} blobs and every commit reachable from {a.history}")
            for p in hist[:30]:
                print("    " + p)
            fails += bool(hist)
        except Unknown as e:
            print(f"UNKNOWN history: {e}")
            unknown += 1
    print(f"\n{len(site.pages)} pages, {len(site.files)} files: {fails} rule(s) failed, {unknown} could not look")
    return 1 if fails else (2 if unknown else 0)


if __name__ == "__main__":
    sys.exit(main())
