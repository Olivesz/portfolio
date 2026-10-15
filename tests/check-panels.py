#!/usr/bin/env python3
"""Every figure on the page is the figure in its source line.

check-claims.py lists phrasings that must not be stated. This guard covers the
rest: each figure names the line it came from, and that line is fetched and
read.

What it reads from index.html, as text:
  FACTS     <script type="application/json" id="facts"> {"key": {"v", "src", "at"?, "ctx"?}}
  data-src  every element carrying data-src (and data-at)
  regions   cards (<article class="card">), work highlights and more-rows (<li class="k-card">, <li class="k-mrow">) in <section id="work">,
            the résumé block (<section id="resume">, counted by its <div class="cv-ent"> entries),
            instruction lines (script strings under `instruction:`), and labels
            (script strings under `label:` / `labels:` / `short:` / `phoneLabel(s):` /
            `caption(s):`, which carry the map, trail and figure labels)
and from every work/*-deep.html beside it, as text: each data-src element in <main> and
every figure in its prose (furniture skipped), held to a per-page ratchet, DEEP_KNOWN
and, by rendering the page in headless Chromium:
  native    the labels of the native figure layers (tests/HOOKS.md), collected at
            several points of every station's hold on a desktop and a phone viewport

A source is one of:
  repo@sha:path#Ln[-Lm]   an Olivesz repo line at a pinned SHA, fetched read-only
                          with `gh api` and cached
  https://...             a publication page on doi.org, thinkmind.org or crossref, or
                          an award post on greensoftware.foundation (the awarding body),
                          fetched read-only and cached; the figure must sit within
                          200 characters of its context word
  public_resume.tex#Ln    the résumé's upstream line; checked against the text of the
                          tracked resume.pdf, which is that source's public build
  page:<what>             a figure the page computes (LOCK, END); listed every run and
                          verified by contract.py's self-checks, not here

A figure matches after normalising minus signs, ×, thousands separators and
number words (five = 5), and with its magnitude kept: '2.6M+' matches
'more than 2.6 million' and '2.6M+', not '2.6 thousand'. A data-src element
that shows no figure must share a content word with what it cites.

Every figure found in a region must be covered: in the DOM by an enclosing
data-src element, in a script string by a FACTS entry whose `v` matches and
whose `ctx` word appears in the same string. A number is not a claim; a number
plus what it counts is, so `ctx` is what stops one figure's source from
blessing another figure that happens to share its digits.

If any region comes back empty the run ABORTS: a guard that walks nothing
passes everything, and this one has to notice when the markup it keys on moves.

  python3 tests/check-panels.py                  # check index.html
  python3 tests/check-panels.py --index FILE     # check another file
  python3 tests/check-panels.py --offline        # cache only; a miss is a FAIL
  python3 tests/check-panels.py --static         # skip rendering: native labels NOT scanned
Rendering uses Playwright from the project venv (.venv), so plain python3 works.
Exit: 0 clean, 1 problems, 2 aborted.
"""
import argparse
import functools
import hashlib
import html
import html.parser
import http.server
import json
import os
import pathlib
import re
import shutil
import socket
import subprocess
import sys
import threading
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OWNER = "Olivesz"
CACHE = ROOT / ".srccache"   # gitignored
VENV_PY = ROOT / ".venv" / "bin" / "python"

SRC = re.compile(r"^(?:(?P<owner>[\w.-]+)/)?(?P<repo>[\w.-]+)@(?P<sha>[0-9a-f]{7,40}):(?P<path>[^#\s]+)#L(?P<a>\d+)(?:-L?(?P<b>\d+))?$")
RESUME_SRC = re.compile(r"^public_resume\.tex#L(?P<a>\d+)(?:-L?(?P<b>\d+))?$")
# publication pages with no repo line: only these hosts, read with GET
WEB_HOSTS = {"doi.org", "dx.doi.org", "www.doi.org", "thinkmind.org", "www.thinkmind.org",
             "crossref.org", "www.crossref.org", "api.crossref.org", "search.crossref.org", "data.crossref.org",
             # an award with no paper: the awarding organisation's own winners post is the primary source
             "greensoftware.foundation", "www.greensoftware.foundation"}
WEB_WINDOW = 200
# native figure layer roots (tests/HOOKS.md)
NATIVE_SEL = "[data-native], .ff, .fk, .cx-fig"

NUMWORDS = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen "
                                       "fourteen fifteen sixteen seventeen eighteen nineteen twenty".split())}
NUMWORDS.update({"thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90})
WORD_RE = re.compile(r"\b(" + "|".join(sorted(NUMWORDS, key=len, reverse=True)) + r")\b", re.I)
# Number words that count as figures in prose. 'one' and 'two' describe mechanisms ('two passes agree',
# 'one column per quarter') far more often than they count anything, so they are left out.
WORD_FIG = r"\b(?:" + "|".join(w for w, n in NUMWORDS.items() if n >= 3) + r")\b"
SCALE = {"k": r"k|thousand", "m": r"m|mn|mio|million", "b": r"b|bn|billion"}

# a figure: optional sign (only after space or bracket), digits with separators,
# decimals, an optional unit or magnitude, an optional '+'. Digits glued to a letter,
# '+' or '-' (SAP-1, x86-64, n+1, L134) are part of a name, not a figure.
NUM = re.compile(r"(?:(?<![^\s(\[])[\u2212\u2013-]|(?<![\w+\-.\u2212\u2013]))\d[\d,]*(?:\.\d+)?"
                 r"(?:\s?(?:%|\u00d7|x\b)|(?:k|m|bn|b|bps|ms|s|gflops|fps)\b)?\+?"
                 r"|" + WORD_FIG, re.I)
MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?"
NOT_A_CLAIM = re.compile(
    rf"\b{MONTH}\s+\d{{4}}(?:\s*[\u2013-]\s*(?:{MONTH}\s+\d{{4}}|now|present))?"   # aug 2026, jul 2026 – now
    r"|\b(?:19|20)\d{2}(?:\s*[\u2013-]\s*(?:(?:19|20)?\d{2}|now|present))?\b"      # 2023, 2025–26
    r"|[\u2019']\d{2}\b"                                                            # ’28
    r"|SAP-\d+|x86-64|IEEE \w+|Llama [\d.]+ \d+B", re.I)
STOP = set("with from that this into their there which when what each only over about than then them they your "
           "have been were also more most such very just like onto upon course project page line lines "
           "the and for its per not but are was all any can has had how out own via yet you".split())


def norm(t):
    """Typography is not data: one minus, one times sign, no thousands commas, number words as digits."""
    t = t.replace("\u2212", "-").replace("\u2013", "-").replace("\u00d7", "x").replace("\u202f", " ").replace("\u00a0", " ")
    t = WORD_RE.sub(lambda m: str(NUMWORDS[m.group(1).lower()]), t)
    return re.sub(r"(?<=\d),(?=\d{3}(?!\d))", "", t)


def core(fig):
    """The number itself: what must appear in the source line."""
    m = re.search(r"\d(?:[\d,]*\d)?(?:\.\d+)?", norm(fig))      # a comma after the number is punctuation
    return m.group(0) if m else None


def scale(fig):
    m = re.search(r"\d\s?(k|m|bn|b)\+?$", norm(fig).strip(), re.I)
    return m.group(1).lower()[0] if m else None


def figures(text):
    t = NOT_A_CLAIM.sub(" ", text)
    return [m.group(0).strip() for m in NUM.finditer(t)]


def in_line(fig, line):
    """The figure's number is in the line with the same magnitude, and a '+' on the page is a '+' or a
    'more than' in the source."""
    c = core(fig)
    if not c:
        return False
    nl, sc, plus = norm(line), scale(fig), norm(fig).strip().endswith("+")
    for m in re.finditer(r"(?<![\d.])" + re.escape(c) + r"(?!\d)", nl):
        after = nl[m.end():m.end() + 24]
        if sc:
            ms = re.match(r"\s?(?:" + SCALE[sc] + r")\b", after, re.I)
            if not ms:
                continue
            after = after[ms.end():]
        if plus and not (after.startswith("+") or re.search(r"(?:more than|over|at least|upwards of|>|\u2265)\s*$",
                                                           nl[max(0, m.start() - 24):m.start()], re.I)):
            continue
        return True
    return False


def in_text(fig, text, ctx):
    """For a whole page of text: the figure, and one of the context words within WEB_WINDOW characters."""
    nt = norm(text)
    c = core(fig)
    if not c:
        return False
    for m in re.finditer(r"(?<![\d.])" + re.escape(c) + r"(?!\d)", nt):
        w = nt[max(0, m.start() - WEB_WINDOW):m.end() + WEB_WINDOW]
        if in_line(fig, w) and (not ctx or any(x.lower() in w.lower() for x in ctx)):
            return True
    return False


def words(text):
    """Content words: what a phrase is about, for phrase-to-source checks. A hyphenated word also counts as
    its parts (gate-level -> gate, level)."""
    out = set()
    for w in re.findall(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*", norm(text).lower()):
        out.update(x for x in [w] + w.split("-") if len(x) >= 3 and not x.isdigit() and x not in STOP)
    return sorted(out)


DATE = re.compile(rf"(?:\b({MONTH})\s+)?\b((?:19|20)\d{{2}})\b", re.I)


def dates_ok(text, lines):
    """For an element that shows only dates: each (month, year) is in one source line, the month spelled out
    or abbreviated. Returns None when the text holds no date."""
    ds = DATE.findall(text)
    if not ds:
        return None
    for mon, yr in ds:
        pat = (r"\b" + re.escape(mon[:3]) + r"[a-z]*\.?\s+" if mon else r"") + yr + r"\b"
        if not any(re.search(pat, ln, re.I) for ln in lines):
            return False
    return True


def same_value(v, at):
    """`at` is the source's own spelling (-0.179); `v` is the page's (-17.9%)."""
    cv, ca = core(v), core(at)
    if not cv or not ca:
        return False
    d = len(cv.split(".")[1]) if "." in cv else 0
    sv = -1 if norm(v).strip().startswith("-") else 1
    sa = -1 if norm(at).strip().startswith("-") else 1
    return any(round(sa * float(ca) * k, d) == round(sv * float(cv), d) for k in (1, 100, 0.01))


class Page(html.parser.HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.srcs, self.chunks, self.scripts = [], [], [], []
        self.facts_raw, self.cards, self.rows, self.cv, self.hero = None, 0, 0, 0, 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = (a.get("class") or "").split()
        region = None
        if tag == "article" and "card" in cls:
            region = "card"
            self.cards += 1
        elif tag == "section" and a.get("id") == "work":
            region = "work"
        elif tag == "section" and a.get("id") == "resume":
            region = "resume"
        elif tag == "p" and "rec" in cls:
            region = "hero"
            self.hero += 1
        if tag == "div" and "cv-ent" in cls and any(e["region"] == "resume" for e in self.stack):
            self.cv += 1
        if tag == "li" and ({"row", "k-card", "k-mrow"} & set(cls)) and any(e["region"] == "work" for e in self.stack):
            self.rows += 1
        e = {"tag": tag, "attrs": a, "text": [], "line": self.getpos()[0], "region": region}
        if tag not in self.VOID:
            self.stack.append(e)

    def handle_endtag(self, tag):
        while self.stack:
            e = self.stack.pop()
            if e["tag"] in ("script", "style"):
                body = "".join(e["text"])
                e["text"] = []                    # code is not prose: keep it out of the parent's text
                typ = (e["attrs"].get("type") or "text/javascript").lower()
                if e["tag"] == "script" and e["attrs"].get("id") == "facts":
                    self.facts_raw = (body, e["line"])
                elif e["tag"] == "script" and typ in ("text/javascript", "module", "application/javascript"):
                    self.scripts.append((body, e["line"]))
            if e["attrs"].get("data-src"):
                self.srcs.append({"src": e["attrs"]["data-src"], "at": e["attrs"].get("data-at"),
                                  "text": " ".join("".join(e["text"]).split()), "line": e["line"]})
            if self.stack:
                self.stack[-1]["text"].extend(e["text"])
            if e["tag"] == tag:
                break

    def handle_data(self, d):
        if not self.stack:
            return
        self.stack[-1]["text"].append(d)
        if self.stack[-1]["tag"] in ("script", "style"):
            return
        region = next((e["region"] for e in reversed(self.stack) if e["region"]), None)
        if region and d.strip():
            covered = next((e["attrs"]["data-src"] for e in reversed(self.stack) if e["attrs"].get("data-src")), None)
            self.chunks.append({"region": region, "text": d, "covered": covered, "line": self.getpos()[0]})


def js_unescape(s):
    s = re.sub(r"\\u\{([0-9a-fA-F]+)\}", lambda m: chr(int(m.group(1), 16)), s)
    s = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), s)
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t"}.get(m.group(1), m.group(1)), s)


STR = r"\"((?:[^\"\\\n]|\\.)*)\"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\$]|\\.)*)`"
LABEL_KEYS = r"instruction|labels?|short|phoneLabels?|captions?"


def script_strings(scripts):
    """Values of `instruction:` and of the label keys: one string or an array of them."""
    out = {"instruction": [], "label": []}
    for body, base in scripts:
        for m in re.finditer(r"\b(" + LABEL_KEYS + r")\s*:\s*(\[[^\]]*\]|" + STR + ")", body):
            key = "instruction" if m.group(1) == "instruction" else "label"
            line = base + body.count("\n", 0, m.start())
            for s in re.finditer(STR, m.group(2)):
                val = js_unescape(next(g for g in s.groups() if g is not None))
                out[key].append((val, line))
    return out


def web_text(raw, ctype):
    """A fetched publication page as plain text: JSON values flattened, HTML tags stripped."""
    if "json" in ctype:
        try:
            vals = []

            def walk(o):
                if isinstance(o, dict):
                    for v in o.values():
                        walk(v)
                elif isinstance(o, list):
                    for v in o:
                        walk(v)
                elif isinstance(o, str):
                    vals.append(o)
            walk(json.loads(raw))
            raw = " ".join(vals)
        except ValueError:
            pass
    raw = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw)
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", raw)).split())


class Sources:
    def __init__(self, cache, offline, resume_pdf):
        self.cache, self.offline, self.fetched, self.hits = cache, offline, 0, 0
        self.resume_pdf, self._resume = resume_pdf, None
        self.vis_p = cache / "_visibility.json"
        try:
            self.vis = json.loads(self.vis_p.read_text())
        except (OSError, ValueError):
            self.vis = {}

    def kind(self, src):
        s = src or ""
        if s.startswith("page:"):
            return "page"
        if RESUME_SRC.match(s):
            return "resume"
        if s.startswith("https://"):
            return "web"
        return "repo"

    def lines(self, src):
        """(lines, error). Reads only Olivesz repos, only at a pinned SHA."""
        m = SRC.match(src or "")
        if not m:
            return None, (f"malformed data-src {src!r} (want repo@sha:path#Ln[-Lm] with a pinned sha, an https "
                          f"publication page, public_resume.tex#Ln or page:<what>)")
        owner = m.group("owner") or OWNER
        if owner.lower() != OWNER.lower():
            return None, f"{owner}/{m.group('repo')} is not an {OWNER} repo; not read"
        repo, sha, path = m.group("repo"), m.group("sha"), m.group("path")
        a = int(m.group("a"))
        b = int(m.group("b") or a)
        vis = self.visibility(repo)
        if vis != "public":
            return None, f"{repo} is {vis or 'unreachable'}: a reader cannot check a figure sourced there"
        f = self.cache / f"{repo}@{sha}" / path
        if f.is_file():
            self.hits += 1
            text = f.read_text(encoding="utf-8", errors="replace")
        elif self.offline:
            return None, f"{src}: not cached and --offline"
        else:
            r = subprocess.run(["gh", "api", "-H", "Accept: application/vnd.github.raw",
                                f"repos/{OWNER}/{repo}/contents/{path}?ref={sha}"],
                               capture_output=True, text=True, timeout=60)
            if r.returncode != 0:
                return None, f"{src}: gh api failed ({(r.stderr or r.stdout).strip()[:100]})"
            text = r.stdout
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(text, encoding="utf-8")
            self.fetched += 1
        L = text.splitlines()
        if not (1 <= a <= b <= len(L)):
            return None, f"{src}: lines {a}-{b} outside the file ({len(L)} lines)"
        return L[a - 1:b], None

    def web(self, url):
        """(text, error). A publication page, fetched with GET only, from the allowed hosts only."""
        u = urllib.parse.urlsplit(url)
        if u.scheme != "https" or (u.hostname or "").lower() not in WEB_HOSTS:
            return None, f"{u.hostname or url!r} is not a publication host this guard reads ({', '.join(sorted(h for h in WEB_HOSTS if not h.startswith(('www.', 'dx.', 'api.', 'search.', 'data.'))))})"
        f = self.cache / "_web" / (hashlib.sha256(url.encode()).hexdigest()[:20] + ".json")
        if f.is_file():
            self.hits += 1
            return json.loads(f.read_text())["text"], None
        if self.offline:
            return None, f"{url}: not cached and --offline"
        doi = (u.hostname or "").lower().endswith("doi.org")
        req = urllib.request.Request(url, method="GET", headers={
            "User-Agent": "portfolio-check-panels/1 (read-only source check)",
            "Accept": "application/vnd.citationstyles.csl+json" if doi else "text/html,application/json;q=0.9"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                final = (urllib.parse.urlsplit(r.geturl()).hostname or "").lower()
                if final not in WEB_HOSTS:
                    return None, f"{url}: redirected to {final}, which is not a publication host this guard reads"
                ctype = r.headers.get("Content-Type", "")
                raw = r.read(4_000_000).decode(r.headers.get_content_charset() or "utf-8", errors="replace")
        except Exception as e:                       # network, HTTP status, TLS: all a failed read
            return None, f"{url}: fetch failed ({type(e).__name__}: {str(e)[:80]})"
        text = web_text(raw, ctype)
        if not text:
            return None, f"{url}: fetched, but no text in it"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps({"url": url, "text": text}))
        self.fetched += 1
        return text, None

    def resume(self):
        """(lines, error): the tracked résumé PDF as text, one entry per line."""
        if self._resume is None:
            exe = shutil.which("pdftotext")
            if not exe:
                self._resume = (None, "pdftotext is not installed, so the résumé PDF cannot be read")
            elif not self.resume_pdf.is_file():
                self._resume = (None, f"{self.resume_pdf} is missing")
            else:
                r = subprocess.run([exe, "-layout", str(self.resume_pdf), "-"], capture_output=True, text=True, timeout=60)
                L = [" ".join(x.split()) for x in r.stdout.splitlines() if x.strip()]
                self._resume = (L, None) if r.returncode == 0 and L else (None, f"pdftotext read nothing from {self.resume_pdf}")
        return self._resume

    def visibility(self, repo):
        if repo in self.vis:
            return self.vis[repo]
        if self.offline:
            return None
        r = subprocess.run(["gh", "api", f"repos/{OWNER}/{repo}", "--jq", ".visibility"],
                           capture_output=True, text=True, timeout=60)
        v = r.stdout.strip() if r.returncode == 0 else None
        if v:
            self.vis[repo] = v
            self.cache.mkdir(parents=True, exist_ok=True)
            self.vis_p.write_text(json.dumps(self.vis, indent=1))
        return v


def check_element(srcs, e, where):
    """Problems with one data-src element: its figures are in what it cites, or, with no figure, it shares
    a content word with it. Returns (problems, kind)."""
    kind, bad, figs = srcs.kind(e["src"]), [], figures(e["text"])
    if kind == "page":
        return [], kind
    if kind == "resume":
        L, err = srcs.resume()
        if err:
            return [f"{where} data-src {e['src']}: {err}"], kind
        own = set(words(re.sub(r"\d[\d,.]*", " ", e["text"])))
        for f in figs:
            if not any(in_line(f, ln) and (not own or own & set(words(ln))) for ln in L):
                bad.append(f"{where} {f!r} ({e['src']}) is not in any line of {srcs.resume_pdf.name} that shares a word "
                           f"with {e['text'][:50]!r}")
        if not figs:
            d = dates_ok(e["text"], L)
            if d is False:
                bad.append(f"{where} date {e['text'][:30]!r} ({e['src']}) is not in any line of {srcs.resume_pdf.name}")
            elif d is None and not set(words(e["text"])) & set(words(" ".join(L))):
                bad.append(f"{where} data-src {e['src']} on {e['text'][:40]!r}: no word of it is in {srcs.resume_pdf.name}")
        return bad, kind
    if kind == "web":
        text, err = srcs.web(e["src"])
        if err:
            return [f"{where} data-src: {err}"], kind
        ctx = words(re.sub(r"\d[\d,.]*\w*\+?", " ", e["text"]))
        for f in figs:
            if not in_text(f, text, ctx):
                bad.append(f"{where} {f!r} not within {WEB_WINDOW} characters of {', '.join(ctx[:3]) or 'its words'} in {e['src']}")
        if not figs and not set(words(e["text"])) & set(words(text)):
            bad.append(f"{where} data-src on {e['text'][:40]!r}: no word of it is in {e['src']}")
        return bad, kind
    L, err = srcs.lines(e["src"])
    if err:
        return [f"{where} data-src: {err}"], kind
    line = " ".join(L)
    if not figs and dates_ok(e["text"], L) is False:
        bad.append(f"{where} date {e['text'][:30]!r} not in {e['src']}: {line.strip()[:80]!r}")
    elif not figs and dates_ok(e["text"], L) is None:
        share = set(words(e["text"])) & set(words(line))
        if not share:
            bad.append(f"{where} data-src on {e['text'][:40]!r} shows no figure and shares no word with "
                       f"{e['src']}: {line.strip()[:80]!r}")
    for f in figs:
        ok = (e["at"] in line and same_value(f, e["at"])) if e.get("at") else in_line(f, line)
        if not ok:
            bad.append(f"{where} {f!r} not in {e['src']}: {line.strip()[:100]!r}")
    return bad, kind


# ---------------------------------------------------------------- native figure labels, rendered

NATIVE_JS = r"""
(SEL) => {
  const out = { roots: 0, chunks: [], srcs: [] };
  for (const r of document.querySelectorAll(SEL)) {
    if (r.parentElement && r.parentElement.closest(SEL)) continue;
    if (!r.getClientRects().length || getComputedStyle(r).visibility !== 'visible') continue;
    out.roots++;
    const id = r.getAttribute('data-native') || r.className.baseVal || r.className || r.tagName;
    const tw = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const p = n.parentElement; if (!n.nodeValue.trim() || !p || p.closest('style, script')) continue;
      const c = p.closest('[data-src]');
      out.chunks.push({ id: String(id), text: n.nodeValue, covered: c && r.contains(c) ? c.getAttribute('data-src') : null });
    }
    for (const e of r.querySelectorAll('[data-src]'))
      out.srcs.push({ id: String(id), src: e.getAttribute('data-src'), at: e.getAttribute('data-at'), text: e.textContent.replace(/\s+/g, ' ').trim() });
  }
  return out;
}
"""
VIEWS = {"desktop": dict(viewport={"width": 1440, "height": 900}, device_scale_factor=2),
         "phone": dict(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)}
FRACS = (0.03, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.99)


def collect_native(index):
    """Serve the index's directory, walk every station's hold on two viewports, and return the native layers'
    text chunks and data-src elements. Runs in an interpreter that has Playwright."""
    from playwright.sync_api import sync_playwright
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Quiet, directory=str(index.parent)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    res = {"samples": 0, "roots": 0, "chunks": [], "srcs": [], "errors": []}
    seen_c, seen_s = set(), set()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for name, opts in VIEWS.items():
                ctx = b.new_context(**opts)
                pg = ctx.new_page()
                pg.on("pageerror", lambda e, n=name: res["errors"].append(f"{n}: {str(e)[:120]}"))
                pg.goto(f"http://127.0.0.1:{port}/{index.name}", wait_until="load")
                pg.wait_for_timeout(800)
                st = pg.evaluate("() => window.__walk && Array.isArray(__walk.stations) && typeof __walk.S === 'function'"
                                 " ? { st: __walk.stations, S: __walk.S() } : null")
                if not st:
                    res["errors"].append(f"{name}: window.__walk.stations / S() absent, so no hold could be found")
                    ctx.close()
                    continue
                for row in st["st"]:
                    A, E = row[1], row[2]
                    for f in FRACS:
                        pg.evaluate("y => window.scrollTo(0, y)", round((A + f * (E - A)) * st["S"]))
                        pg.evaluate("""async () => { const t0 = performance.now(); const raf = () => new Promise(r => requestAnimationFrame(r));
                            await raf(); await raf();
                            while (performance.now() - t0 < 1500) { let b = null; try { b = __walk.running(); } catch (e) {}
                              if (b === false) break; await raf(); } }""")
                        r = pg.evaluate(NATIVE_JS, NATIVE_SEL)
                        res["samples"] += 1
                        res["roots"] += r["roots"]
                        for c in r["chunks"]:
                            k = (c["text"].strip(), c["covered"])
                            if k not in seen_c:
                                seen_c.add(k)
                                res["chunks"].append(dict(c, where=f"native {c['id']} ({name}, {row[0]} hold)"))
                        for e in r["srcs"]:
                            k = (e["src"], e["at"], e["text"])
                            if k not in seen_s:
                                seen_s.add(k)
                                res["srcs"].append(dict(e, where=f"native {e['id']} ({name}, {row[0]} hold)"))
                ctx.close()
            b.close()
    finally:
        srv.shutdown()
    return res


def render_native(index):
    """(result, error). Uses this interpreter's Playwright, else the project venv's."""
    try:
        import playwright  # noqa: F401
        return collect_native(index), None
    except ImportError:
        pass
    if not VENV_PY.exists():
        return None, f"no Playwright here and no project venv at {VENV_PY} (see tests/README.md)"
    r = subprocess.run([str(VENV_PY), __file__, "--collect-native", str(index)], capture_output=True, text=True,
                       timeout=600, env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"))
    if r.returncode != 0:
        return None, f"rendering failed: {(r.stderr or r.stdout).strip().splitlines()[-1][:200] if (r.stderr or r.stdout).strip() else r.returncode}"
    return json.loads(r.stdout), None


MONTHS = (r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|"
          r"Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b")
TEAM_CARD = "custos"      # the card whose meta line states a team size and a role (the résumé governs both)


def team_meta(html, resume_lines):
    """Problems if the custos card's meta line is missing or disagrees with the résumé.

    The meta states the team size and the role. Both must match the custos entry in
    the résumé PDF and in the page's own résumé block: 'team of N' against 'N-person',
    'Led' against 'Led', and 'designed the core engine' against 'Designed the core
    engine'. A meta that ships without the matching sheet line is the failure."""
    out = []
    # cards carry no month dates
    for cid, body in re.findall(r'<article\b[^>]*\bclass="[^"]*\bcard\b[^"]*"[^>]*\bid="([^"]+)"[^>]*>(.*?)</article>', html, re.S):
        for mm in re.findall(r'<p\b[^>]*class="[^"]*\bmeta\b[^"]*"[^>]*>(.*?)</p>', body, re.S):
            line = " ".join(re.sub(r"<[^>]+>", "", mm).split())
            mon = re.search(MONTHS, line)
            if mon:
                out.append(f"dates: the {cid} card meta {line!r} names the month {mon.group(0)!r}; cards carry no months")
    card = re.search(r'<article\b[^>]*\bid="%s"[^>]*>(.*?)</article>' % TEAM_CARD, html, re.S)
    if not card:
        return [f"team/role: no <article id=\"{TEAM_CARD}\"> card"]
    m = re.search(r'<p\b[^>]*class="[^"]*\bmeta\b[^"]*"[^>]*>(.*?)</p>', card.group(1), re.S)
    if not m:
        return [f"team/role: the {TEAM_CARD} card carries no meta line (it must state team size and role)"]
    meta = " ".join(re.sub(r"<[^>]+>", "", m.group(1)).split())
    n = re.search(r"\bteam of (\d+)\b", meta)
    if not n:
        return [f"team/role: the {TEAM_CARD} meta {meta!r} states no 'team of N'"]
    claims = [("team size", rf"\b{n.group(1)}-person\b")]
    if re.search(r"\bLed\b", meta):
        claims.append(("role 'Led'", r"^(?:• )?Led\b"))
    if re.search(r"\bdesigned the core engine\b", meta, re.I):
        claims.append(("role 'designed the core engine'", r"^(?:• )?Designed the core engine\b"))
    for bad_word in ("Coded", "Owned"):
        if re.search(rf"\b{bad_word}\b", meta):
            out.append(f"team/role: the {TEAM_CARD} meta says {bad_word!r}, which the résumé does not support")
    sheet = None
    if resume_lines is not None:
        # the custos entry: from its title line to the next entry's title (a line with no bullet)
        i = next((k for k, x in enumerate(resume_lines) if x.lower().startswith("custos code")), None)
        if i is None:
            out.append("team/role: no 'Custos Code' entry in the résumé PDF")
        else:
            j = next((k for k in range(i + 1, len(resume_lines)) if not resume_lines[k].startswith("•")), len(resume_lines))
            sheet = resume_lines[i + 1:j]
    page = [" ".join(re.sub(r"<[^>]+>", "", x).split()) for x in re.findall(
        r'<li\b[^>]*data-src="public_resume\.tex#L(?:81|82)"[^>]*>(.*?)</li>', html, re.S)]
    for name, lines in (("résumé PDF", sheet), ("page résumé block", page)):
        if lines is None:
            continue
        for what, rx in claims:
            if not any(re.search(rx, x) for x in lines):
                out.append(f"team/role: the {TEAM_CARD} meta {meta!r} claims {what}, but the {name}'s "
                           f"custos lines do not: {' | '.join(x[:60] for x in lines) or 'none found'}")
    return out


# ---------------------------------------------------------------- the deep dives, work/*-deep.html
# The same rules over each deep dive's <main>, minus its navigation and furniture (contents rail, kickers and figure
# numbers, the stepper, the sources list, the case-nav, the facts' labels). Two differences from the index: a step's
# `.sc-keys li` carries data-at as the step's tick (deep.js), not as the source's spelling of a value, so data-at is
# ignored on any element that also has data-key; and a figure is covered by an enclosing data-src, data-derived (a
# value the page computes from cited inputs) or data-live (this visitor's random draw) element.
# Read as text only: labels a scene draws as it steps are not scanned here.
DEEP_SKIP_CLS = {"dd-toc", "dd-rail", "ch-k", "st-k", "kick", "n", "sc-bar", "sc-in", "srcs-d", "srcs", "dd-src", "case-nav",
                 "strip", "colo", "skip", "sr-only", "back-to", "sc-n"}
DEEP_SKIP_IDS = {"ch-sources"}
DEEP_COVER = ("data-src", "data-derived", "data-live")
# A ratchet held at zero: per page, (figures not in their cited line, uncovered prose figures). Every deep dive is clean,
# so any figure that points near its line instead of at it, or a prose figure with no data-src, data-derived or data-live,
# FAILS. A deep dive missing here must be clean too.
DEEP_KNOWN = {
    "emergence-deep.html": (0, 0),
    "freeflow-deep.html": (0, 0),
    "kronos-deep.html": (0, 0),
    "custos-code-deep.html": (0, 0),
    "inf-mem-deep.html": (0, 0),
}


class DeepPage(Page):
    def __init__(self):
        super().__init__()
        self.uncovered = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "data-key" in a and "data-at" in a:
            attrs = [(k, v) for k, v in attrs if k != "data-at"]
        super().handle_starttag(tag, attrs)
        if tag not in self.VOID and self.stack:
            e = self.stack[-1]
            e["skip"] = bool(set((a.get("class") or "").split()) & DEEP_SKIP_CLS) or a.get("id") in DEEP_SKIP_IDS
            if tag == "main":
                e["region"] = "deep"
            e["cover"] = next((a[k] for k in DEEP_COVER if a.get(k)), None)

    def handle_data(self, d):
        super().handle_data(d)
        if not self.stack or self.stack[-1]["tag"] in ("script", "style") or not d.strip():
            return
        if not any(e.get("region") == "deep" for e in self.stack):
            return
        if any(e.get("skip") or e.get("cover") or e["tag"] == "dt" for e in self.stack):
            return
        for f in figures(d):
            self.uncovered.append((self.getpos()[0], f, " ".join(d.split())[:60]))


def deep_dives(srcs, work):
    """(problems, one summary line per page). Problems are a page with nothing cited, or a count over its DEEP_KNOWN."""
    bad, lines = [], []
    for path in sorted(work.glob("*-deep.html")):
        p = DeepPage()
        p.feed(path.read_text(encoding="utf-8"))
        p.close()
        miss, seen = [], set()
        for e in p.srcs:
            if (e["src"], e["text"]) in seen:
                continue
            seen.add((e["src"], e["text"]))
            miss += check_element(srcs, e, f"{path.name}:{e['line']}")[0]
        known = DEEP_KNOWN.get(path.name, (0, 0))
        lines.append(f"  {path.name}: {len(seen)} cited elements, {len(miss)} not in their line (known {known[0]}), "
                     f"{len(p.uncovered)} uncovered prose figures (known {known[1]})")
        if not seen:
            bad.append(f"{path.name}: no data-src element in <main>; the deep-dive scan walked nothing")
        if len(miss) > known[0]:
            bad += [f"{path.name}: {len(miss)} figures not in their cited line, over the {known[0]} it shipped with"] + miss[:8]
        if len(p.uncovered) > known[1]:
            bad += [f"{path.name}: {len(p.uncovered)} uncovered prose figures, over the {known[1]} it shipped with"] + \
                   [f"{path.name}:{ln} undeclared figure {f!r} in {t!r}" for ln, f, t in p.uncovered[:8]]
        if (len(miss), len(p.uncovered)) < known and len(miss) <= known[0] and len(p.uncovered) <= known[1]:
            lines.append(f"    fewer than known: lower DEEP_KNOWN[{path.name!r}] to ({len(miss)}, {len(p.uncovered)})")
    return bad, lines


def main():
    ap = argparse.ArgumentParser(description="every figure is the figure in its source line")
    ap.add_argument("--index", default=str(ROOT / "index.html"))
    ap.add_argument("--cache", default=str(CACHE))
    ap.add_argument("--resume-pdf", default="", help="the résumé PDF that public_resume.tex citations are read against "
                                                    "(default: resume.pdf beside the index, else the repo's)")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--static", action="store_true", help="do not render the page: native figure labels are NOT scanned")
    ap.add_argument("--collect-native", default="", help=argparse.SUPPRESS)
    a = ap.parse_args()
    if a.collect_native:
        print(json.dumps(collect_native(pathlib.Path(a.collect_native).resolve())))
        return 0
    index = pathlib.Path(a.index).resolve()
    resume_pdf = pathlib.Path(a.resume_pdf) if a.resume_pdf else (
        index.parent / "resume.pdf" if (index.parent / "resume.pdf").is_file() else ROOT / "resume.pdf")
    p = Page()
    p.feed(index.read_text(encoding="utf-8"))
    p.close()

    # ---- regions must exist before anything is trusted ----
    strs = script_strings(p.scripts)
    facts = {}
    if p.facts_raw:
        try:
            facts = json.loads(p.facts_raw[0])
        except ValueError as e:
            print(f"ABORT: the FACTS block at {index.name}:{p.facts_raw[1]} is not JSON ({e})")
            return 2
    native = {"samples": 0, "roots": 0, "chunks": [], "srcs": [], "errors": []}
    if not a.static:
        native, err = render_native(index)
        if err:
            print(f"ABORT: native figure labels could not be collected: {err}. Pass --static to check everything "
                  f"else, knowing the native labels went unread.")
            return 2
    regions = [("FACTS block", len(facts)), ("cards", p.cards), ("work rows", p.rows), ("résumé entries", p.cv),
               ("hero line", p.hero),
               ("instruction lines", len(strs["instruction"])), ("labels", len(strs["label"]))]
    if not a.static:
        regions.append(("native figure labels", len(native["chunks"])))
    empty = [name for name, n in regions if not n]
    if empty:
        more = ""
        if "native figure labels" in empty:
            more = (f" No native figure layer ({NATIVE_SEL}) showed text at any of {native['samples']} held samples"
                    + (f"; page errors: {'; '.join(native['errors'][:2])}" if native["errors"] else "") + ".")
        print(f"ABORT: {', '.join(empty)} came back empty in {index}.{more} A guard that walks nothing "
              f"passes everything; fix the markers (tests/HOOKS.md) before trusting a green run.")
        return 2

    srcs = Sources(pathlib.Path(a.cache), a.offline, resume_pdf)
    bad, computed, kinds = [], [], {}

    # ---- FACTS: each value is in what it cites ----
    for key, e in facts.items():
        if not isinstance(e, dict) or "v" not in e or "src" not in e:
            bad.append(f"FACTS[{key}]: needs v and src")
            continue
        kind = srcs.kind(str(e["src"]))
        kinds[kind] = kinds.get(kind, 0) + 1
        if kind == "page":
            computed.append(key)              # computed in the page; contract.py self-checks verify these
            continue
        if kind == "web":
            text, err = srcs.web(e["src"])
            if err:
                bad.append(f"FACTS[{key}]: {err}")
            elif not in_text(e["v"], text, [e["ctx"]] if e.get("ctx") else []):
                bad.append(f"FACTS[{key}]: {e['v']!r} not within {WEB_WINDOW} characters of {e.get('ctx')!r} in {e['src']}")
            continue
        if kind == "resume":
            eb, _ = check_element(srcs, {"src": e["src"], "at": None, "text": str(e["v"]) + " " + str(e.get("ctx", ""))}, f"FACTS[{key}]")
            bad += eb
            continue
        L, err = srcs.lines(e["src"])
        if err:
            bad.append(f"FACTS[{key}]: {err}")
            continue
        line = " ".join(L)
        if e.get("at"):
            if e["at"] not in line:
                bad.append(f"FACTS[{key}]: at {e['at']!r} not in {e['src']}: {line.strip()[:100]!r}")
            elif not same_value(e["v"], e["at"]):
                bad.append(f"FACTS[{key}]: v {e['v']!r} is not at {e['at']!r} at the shown precision")
        elif not in_line(e["v"], line):
            bad.append(f"FACTS[{key}]: {e['v']!r} not in {e['src']}: {line.strip()[:100]!r}")

    # ---- data-src elements, in the file and in the rendered native layers ----
    elements = [dict(e, where=f"{index.name}:{e['line']}") for e in p.srcs] + native["srcs"]
    for e in elements:
        eb, kind = check_element(srcs, e, e["where"])
        kinds[kind] = kinds.get(kind, 0) + 1
        if kind == "page":
            computed.append(e["src"][5:])
        bad += eb

    # ---- the custos meta's team size and role agree with the résumé ----
    rl, rerr = srcs.resume()
    if rerr:
        bad.append(f"team/role: {rerr}")
    bad += team_meta(index.read_text(encoding="utf-8"), rl)

    # ---- regions: nothing uncovered ----
    seen = {"hero": 0, "card": 0, "work": 0, "resume": 0, "instruction": 0, "label": 0, "native": 0}
    chunks = p.chunks + [dict(c, region="native") for c in native["chunks"]]
    for c in chunks:
        for f in figures(c["text"]):
            seen[c["region"]] += 1
            if not c["covered"]:
                where = c.get("where") or f"{index.name}:{c['line']}"
                bad.append(f"{where} [{c['region']}] undeclared figure {f!r} in "
                           f"{' '.join(c['text'].split())[:60]!r}: wrap it in an element with data-src")
    for kind, items in strs.items():
        for s, line in items:
            for f in figures(s):
                seen[kind] += 1
                ok = any(isinstance(e, dict) and core(e.get("v", "")) == core(f) and e.get("ctx")
                         and e["ctx"].lower() in s.lower() for e in facts.values())
                if not ok:
                    bad.append(f"{index.name}:{line} [{kind}] figure {f!r} in {s[:60]!r} has no FACTS entry "
                               f"with that v and a ctx word found in the string")

    deep_bad, deep_lines = deep_dives(srcs, index.parent / "work")
    bad += deep_bad

    nat = (f"{len(native['chunks'])} native label texts and {len(native['srcs'])} native data-src elements from "
           f"{native['samples']} held samples" if not a.static else "native figure labels NOT scanned (--static)")
    print(f"panel guard: {len(facts)} FACTS, {len(p.srcs)} data-src elements, {p.cards} cards, {p.rows} work rows, "
          f"{len(strs['instruction'])} instruction lines, {len(strs['label'])} labels, {nat}; figures seen "
          f"{seen['hero']} hero / {seen['card']} card / {seen['work']} work / {seen['resume']} résumé / {seen['instruction']} instruction / {seen['label']} label / "
          f"{seen['native']} native; citations {', '.join(f'{n} {k}' for k, n in sorted(kinds.items()))}; "
          f"sources {srcs.fetched} fetched, {srcs.hits} cached; computed in the page: {', '.join(sorted(set(computed))) or 'none'}")
    print(f"deep dives ({len(deep_lines)} lines, read as text):\n" + "\n".join(deep_lines) + "\n")
    if not bad:
        debt = [sum(DEEP_KNOWN.get(q.name, (0, 0))[i] for q in (index.parent / "work").glob("*-deep.html")) for i in (0, 1)]
        print("PASS - every figure on the index is in the line it cites" + (" (static: native labels not scanned)" if a.static else "")
              + (f"; the deep dives are within their known counts, still {debt[0]} figures not in their cited line "
                 f"and {debt[1]} uncovered prose figures to fix." if any(debt) else "; so is every figure in the deep dives."))
        return 0
    for b in bad:
        print("FAIL " + b)
    print(f"\n{len(bad)} problem(s).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
