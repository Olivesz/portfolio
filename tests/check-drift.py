#!/usr/bin/env python3
"""Every cited figure still stands in its repository as the repository is today.

check-panels.py reads each figure at the SHA its data-src pins, so a page stays true to the commit it cites after
the repository moves on. A reader who follows the repo link lands on the default branch, though, and should find the
same numbers there. This guard asks GitHub for the HEAD of every cited repository and reads each cited file at HEAD.

  pins      every SHA the site pins (data-src on index.html and work/*.html, the FACTS block, and
            github.com/Olivesz/<repo>/blob|tree|commit/<sha> links) against its repository's HEAD: how many commits
            behind, and how many of the files cited at that pin changed since
  figures   every figure in a repo-cited data-src element, and every FACTS value, read in the cited file at HEAD:
              holds   on the cited lines (or the file is unchanged since the pin)
              moved   on another line of the file, one that shares a content word with the cited line: still
                      true, but a re-pin needs the new line number, which is printed
              gone    on no such line, or the file is gone: the page and the repository disagree

A figure that is gone at HEAD FAILS, in any region of any page, when its pin is the repository's main pin or newer:
a reader who follows the link finds a different number. A moved figure is a warning (still true; the re-pin needs its
new line). Warnings are printed by page and repository.

A repository's main pin is the SHA most of its citations use. A pin older than the main pin (more commits behind
HEAD) is a dated citation, a figure from the repository's history ('30 gates then in CI'); its drift is listed
apart and warns, except on a headline, where a figure gone at HEAD fails whatever its pin. Headline figures are the
index cards (<article class="card">), the FACTS block, each case study's result block (<section class="lx-led">) and
results section (aria-labelledby="s-results"), and each deep dive's results chapter (<section id="ch-results">).

Figures and their matching are check-panels.py's: the same figure finder, the same normalising, the same data-at.
A figure that is not on its cited line even at the pin is check-panels.py's failure: counted here, and drift only
when it is nowhere in the file at HEAD either (a figure re-pinned to HEAD without its new value fails here too).

  python3 tests/check-drift.py                       # asks GitHub for each HEAD (network, read-only gh api)
  python3 tests/check-drift.py --offline             # the HEADs and files the last run cached; a miss is an ABORT
  python3 tests/check-drift.py --head kronos-quant=fcb1ed8   # read a repository at a given SHA instead of HEAD
  python3 tests/check-drift.py --index FILE          # a copy of the site: FILE and the work/ beside it
Cache: .srccache/<repo>@<sha>/<path> for files (shared with check-panels.py) and .srccache/_drift/ for HEADs and
comparisons. Exit: 0 clean or warnings only, 1 a figure gone at HEAD that fails (above), 2 aborted: nothing walked, or a
repository's visibility, HEAD, comparison or file could not be read (nothing cached and --offline, gh without auth or
network, a gh call that timed out, no gh at all), or any other error. A private or internal repository is listed and
not read; one whose visibility cannot be read aborts, since skipping it would let a run that read nothing pass.
"""
import argparse
import concurrent.futures
import html.parser
import importlib.util
import json
import pathlib
import re
import subprocess
import sys
import threading
import traceback

sys.dont_write_bytecode = True
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
_spec = importlib.util.spec_from_file_location("check_panels", HERE / "check-panels.py")
cp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cp)

OWNER = cp.OWNER
LINK = re.compile(r"^https://github\.com/(?P<owner>[\w.-]+)/(?P<repo>[\w.-]+)/(?:blob|tree|commit)/(?P<sha>[0-9a-f]{7,40})\b")
VOID = cp.Page.VOID
SHORT = 7


class Cites(html.parser.HTMLParser):
    """One page's repo-pinned data-src elements, each with the headline region it sits in, its FACTS block and its
    links that pin a SHA."""

    def __init__(self, name):
        super().__init__(convert_charrefs=True)
        self.name, self.stack, self.els, self.links, self.facts = name, [], [], [], None
        self.regions = {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and (m := LINK.match(a.get("href") or "")):
            self.links.append(m)
        if tag in VOID:
            return
        cls = set((a.get("class") or "").split())
        head = None
        if tag == "article" and "card" in cls:
            head = "card"
        elif tag == "section" and "lx-led" in cls:
            head = "result block"
        elif tag == "section" and a.get("aria-labelledby") == "s-results":
            head = "results section"
        elif tag == "section" and a.get("id") == "ch-results":
            head = "results chapter"
        if head:
            self.regions[head] = self.regions.get(head, 0) + 1
        # a step's data-at is its tick (deep.js), not the source's spelling of a value
        at = None if "data-key" in a else a.get("data-at")
        self.stack.append({"tag": tag, "src": a.get("data-src"), "at": at, "text": [], "line": self.getpos()[0],
                           "head": head, "id": a.get("id")})

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if not any(e["tag"] == tag for e in self.stack):
            return
        while self.stack:
            e = self.stack.pop()
            text = "".join(e["text"])
            if e["tag"] == "script" and e["id"] == "facts":
                self.facts = (text, e["line"])
            if e["tag"] in ("script", "style"):
                text = ""
            if e["src"]:
                head = next((x["head"] for x in reversed(self.stack + [e]) if x["head"]), None)
                self.els.append({"page": self.name, "where": f"{self.name}:{e['line']}", "src": e["src"],
                                 "at": e["at"], "text": " ".join(text.split()), "head": head})
            if self.stack:
                self.stack[-1]["text"].append(text)
            if e["tag"] == tag:
                break

    def handle_data(self, d):
        if self.stack:
            self.stack[-1]["text"].append(d)


def gh(args, timeout=60):
    """(exit code, stdout, error) for one read-only gh api call. A call that times out, or a gh that is missing,
    comes back as a failed call, which every caller reports as an ABORT."""
    try:
        r = subprocess.run(["gh", "api", *args], capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "", f"timed out after {timeout} s"
    except OSError as err:
        return 127, "", f"gh not found or not runnable ({err.strerror or err})"
    return r.returncode, r.stdout, (r.stderr or r.stdout).strip()


class Repo:
    """HEADs, comparisons and files at HEAD, read-only through gh api, cached under .srccache."""

    def __init__(self, cache, offline, heads):
        self.cache, self.offline, self.forced = cache, offline, heads
        self.dir = cache / "_drift"
        self.heads_p = self.dir / "heads.json"
        try:
            self.recorded = json.loads(self.heads_p.read_text())
        except (OSError, ValueError):
            self.recorded = {}
        self.fetched = self.hits = 0
        self.lock = threading.Lock()

    def head(self, repo):
        """(sha, error): the default branch's HEAD, or the SHA --head gave."""
        if repo in self.forced:
            code, out, err = (0, self.forced[repo], "") if self.offline else gh(
                [f"repos/{OWNER}/{repo}/commits/{self.forced[repo]}", "--jq", ".sha"])
            return (out.strip(), None) if code == 0 and out.strip() else (None, f"--head {repo}={self.forced[repo]}: {err[:100]}")
        if self.offline:
            sha = self.recorded.get(repo)
            return (sha, None) if sha else (None, f"{repo}: no HEAD recorded by an earlier run and --offline")
        code, out, err = gh([f"repos/{OWNER}/{repo}/commits/HEAD", "--jq", ".sha"])
        if code != 0 or not out.strip():
            return None, f"{repo}: gh api could not read HEAD ({err[:100]})"
        with self.lock:
            self.recorded[repo] = out.strip()
            self.dir.mkdir(parents=True, exist_ok=True)
            self.heads_p.write_text(json.dumps(self.recorded, indent=1))
        return out.strip(), None

    def compare(self, repo, pin, head):
        """(dict, error): commits the pin is behind HEAD, and the files changed between them (None if GitHub's list
        is capped, so it cannot be trusted to be complete)."""
        f = self.dir / "compare" / f"{repo}-{pin[:SHORT]}-{head[:SHORT]}.json"
        if f.is_file():
            self.hits += 1
            return json.loads(f.read_text()), None
        if pin[:SHORT] == head[:SHORT]:
            return {"behind": 0, "files": []}, None
        if self.offline:
            return None, f"{repo} {pin}...{head[:SHORT]}: not cached and --offline"
        code, out, err = gh([f"repos/{OWNER}/{repo}/compare/{pin}...{head}", "--jq",
                             "{status, ahead_by, behind_by, n: ((.files // []) | length), "
                             "files: [(.files // [])[] | .filename, (.previous_filename // empty)]}"])
        if code != 0:
            return None, f"{repo} {pin}...{head[:SHORT]}: gh api compare failed ({err[:100]})"
        d = json.loads(out)
        res = {"behind": d["ahead_by"], "ahead": d["behind_by"], "status": d["status"],
               "files": d["files"] if d["n"] < 300 else None}
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(res))
        self.fetched += 1
        return res, None

    def file(self, repo, sha, path):
        """(lines, error): a file at a SHA; lines is None when the file does not exist there."""
        f = self.cache / f"{repo}@{sha[:SHORT]}" / path
        gone = self.dir / "gone" / f"{repo}@{sha[:SHORT]}" / (path + ".404")
        if f.is_file():
            self.hits += 1
            return f.read_text(encoding="utf-8", errors="replace").splitlines(), None
        if gone.is_file():
            self.hits += 1
            return None, None
        if self.offline:
            return None, f"{repo}@{sha[:SHORT]}:{path}: not cached and --offline"
        code, out, err = gh(["-H", "Accept: application/vnd.github.raw", f"repos/{OWNER}/{repo}/contents/{path}?ref={sha}"])
        self.fetched += 1
        if code != 0:
            if "404" in err or "Not Found" in err:
                gone.parent.mkdir(parents=True, exist_ok=True)
                gone.write_text("")
                return None, None
            return None, f"{repo}@{sha[:SHORT]}:{path}: gh api failed ({err[:100]})"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(out, encoding="utf-8")
        return out.splitlines(), None


def stems(text):
    return {cp.stem(w) for w in cp.words(re.sub(r"\d[\d,.]*", " ", text))}


def found(fig, at, text):
    """check-panels' rule for one figure in one stretch of source text."""
    return (at in text and cp.same_value(fig, at)) if at else cp.in_line(fig, text)


def locate(fig, at, pinned, head, a, b):
    """('holds' | 'moved' | 'gone', new line or None) for one figure, read in the file at HEAD."""
    if b <= len(head) and found(fig, at, " ".join(head[a - 1:b])):
        return "holds", None
    # the cited line the figure sits on, for its words
    own = next((ln for ln in pinned if found(fig, at, ln)), " ".join(pinned))
    want = stems(own)
    hits = [i for i, ln in enumerate(head, 1) if found(fig, at, ln) and (not want or want & stems(ln))]
    if hits:
        return "moved", min(hits, key=lambda i: abs(i - a))
    return "gone", None


def collect(index):
    """The site's pages: index.html and every work/*.html beside it, parsed."""
    pages = [index] + sorted((index.parent / "work").glob("*.html"))
    out = []
    for p in pages:
        c = Cites(p.name if p == index else f"work/{p.name}")
        c.feed(p.read_text(encoding="utf-8"))
        c.close()
        out.append(c)
    return out


def main():
    ap = argparse.ArgumentParser(description="every cited figure still stands in its repository at HEAD")
    ap.add_argument("--index", default=str(ROOT / "index.html"))
    ap.add_argument("--cache", default=str(cp.CACHE))
    ap.add_argument("--net", action="store_true", help="ask GitHub for each HEAD (the default; spelled out for "
                                                       "symmetry with check-links.py --net)")
    ap.add_argument("--offline", action="store_true", help="read only what an earlier run cached")
    ap.add_argument("--head", action="append", default=[], metavar="REPO=SHA",
                    help="read REPO at SHA instead of its HEAD (repeatable)")
    ap.add_argument("--jobs", type=int, default=8)
    a = ap.parse_args()
    if a.net and a.offline:
        ap.error("--net and --offline contradict each other")
    forced = {}
    for h in a.head:
        repo, _, sha = h.partition("=")
        if not repo or not re.fullmatch(r"[0-9a-f]{7,40}", sha):
            ap.error(f"--head {h!r}: want REPO=SHA")
        forced[repo] = sha
    index = pathlib.Path(a.index).resolve()
    cache = pathlib.Path(a.cache)
    pages = collect(index)
    idx = pages[0]

    # ---- citations: data-src elements and FACTS entries that pin an Olivesz repo line ----
    cites, other = [], 0
    for pg in pages:
        for e in pg.els:
            m = cp.SRC.match(e["src"])
            if not m or (m.group("owner") or OWNER).lower() != OWNER.lower():
                other += 1
                continue
            cites.append(dict(e, m=m, figs=cp.figures(e["text"]), key=None))
    facts = {}
    if idx.facts:
        try:
            facts = json.loads(idx.facts[0])
        except ValueError as err:
            print(f"ABORT: the FACTS block at {idx.name}:{idx.facts[1]} is not JSON ({err})")
            return 2
    for key, f in facts.items():
        m = cp.SRC.match(str(f.get("src", ""))) if isinstance(f, dict) else None
        if not m or (m.group("owner") or OWNER).lower() != OWNER.lower():
            continue
        v = str(f.get("v", ""))
        cites.append({"page": idx.name, "where": f"FACTS[{key}]", "src": f["src"], "at": f.get("at"), "text": v,
                      "head": "FACTS", "m": m, "figs": cp.figures(v) or ([v] if cp.core(v) else []), "key": key})
    regions = [("index cards", idx.regions.get("card", 0)), ("FACTS entries", len(facts)),
               ("repo-pinned citations", len(cites)),
               ("work-page results regions", sum(sum(p.regions.values()) for p in pages[1:]))]
    empty = [n for n, k in regions if not k]
    if empty:
        print(f"ABORT: {', '.join(empty)} came back empty in {index}. A guard that walks nothing passes everything.")
        return 2

    srcs = cp.Sources(cache, a.offline, ROOT / "resume.pdf")
    rp = Repo(cache, a.offline, forced)

    # ---- pins: every SHA the site pins, per repository ----
    pins = {}            # repo -> {sha7: {"cited": n, "links": n}}
    for c in cites:
        repo, sha = c["m"].group("repo"), c["m"].group("sha")[:SHORT]
        pins.setdefault(repo, {}).setdefault(sha, {"cited": 0, "links": 0})["cited"] += 1
    for pg in pages:
        for m in pg.links:
            if m.group("owner").lower() == OWNER.lower():
                pins.setdefault(m.group("repo"), {}).setdefault(m.group("sha")[:SHORT], {"cited": 0, "links": 0})["links"] += 1

    # a private or internal repository is listed and not read; one whose visibility cannot be read (no cache with
    # --offline, gh without auth or network, a repository renamed or deleted) aborts, since reading none passes all
    vis_lock, failed = threading.Lock(), threading.Event()

    def reach(repo):
        """(visibility, HEAD, error) for one repository. check-panels' visibility cache is one JSON file rewritten
        on each new read, so those reads take turns; after one gh call fails, the rest are not tried."""
        with vis_lock:
            if failed.is_set():
                return None, None, None
            try:
                vis = srcs.visibility(repo)
            except subprocess.TimeoutExpired as err:
                vis, why = None, f"timed out after {err.timeout} s"
            except OSError as err:
                vis, why = None, f"gh not found or not runnable ({err.strerror or err})"
            else:
                why = ("not cached by an earlier run, and --offline" if a.offline else
                       f"gh api repos/{OWNER}/{repo} failed: no auth, no network, or no such repository")
            if not vis:
                if not a.offline:
                    failed.set()
                return None, None, f"{repo}: could not read its visibility ({why})"
        if vis in ("private", "internal"):
            return vis, None, None
        if vis != "public":
            return vis, None, f"{repo}: unexpected visibility {vis!r}"
        sha, err = rp.head(repo)
        if err:
            failed.set()
        return vis, sha, err

    problems, heads, skipped, untried = [], {}, {}, []
    with concurrent.futures.ThreadPoolExecutor(a.jobs) as ex:
        for repo, (vis, sha, err) in zip(sorted(pins), ex.map(reach, sorted(pins))):
            if err:
                problems.append(err)
            elif sha:
                heads[repo] = sha
            elif vis:
                skipped[repo] = vis
            else:
                untried.append(repo)
    if problems:
        print("ABORT: " + "; ".join(problems[:6]) + (f"; {len(problems) - 6} more" if len(problems) > 6 else "")
              + (f"; not tried after that: {', '.join(untried)}" if untried else "")
              + ". Without HEAD there is nothing to compare.")
        return 2
    if not heads:
        print(f"ABORT: {len(cites)} repo-pinned citations, and every repository they cite is "
              f"{', '.join(sorted(set(skipped.values())))}: nothing was read.")
        return 2

    cmp = {}
    jobs = [(r, s) for r in heads for s in pins[r]]
    with concurrent.futures.ThreadPoolExecutor(a.jobs) as ex:
        for (r, s), (res, err) in zip(jobs, ex.map(lambda j: rp.compare(j[0], j[1], heads[j[0]]), jobs)):
            if err:
                problems.append(err)
            cmp[(r, s)] = res
    if problems:
        print("ABORT: " + "; ".join(problems))
        return 2

    main_pin = {r: max(ps, key=lambda s: (ps[s]["cited"], -cmp[(r, s)]["behind"])) for r, ps in pins.items() if r in heads}

    # ---- the files to read: each cited file at its pin, and at HEAD unless unchanged since the pin ----
    todo = [c for c in cites if c["m"].group("repo") in heads and c["figs"]]
    want = set()
    for c in todo:
        repo, sha, path = c["m"].group("repo"), c["m"].group("sha"), c["m"].group("path")
        changed = cmp[(repo, sha[:SHORT])]["files"]
        c["unchanged"] = sha[:SHORT] == heads[repo][:SHORT] or (changed is not None and path not in changed)
        want.add((repo, sha, path))
        if not c["unchanged"]:
            want.add((repo, heads[repo], path))
    want = sorted(want)
    n_figs = sum(len(c["figs"]) for c in todo)
    if not n_figs:
        print(f"ABORT: {len(cites)} repo-pinned citations, {len(heads)} repositories read, and no figure to look for. "
              f"A guard that walks nothing passes everything.")
        return 2
    with concurrent.futures.ThreadPoolExecutor(a.jobs) as ex:
        files = dict(zip([(r, s[:SHORT], p) for r, s, p in want], ex.map(lambda t: rp.file(*t), want)))
    problems = [err for _, err in files.values() if err]
    if problems:
        print("ABORT: " + "; ".join(problems[:6]))
        return 2

    # ---- every figure, read at HEAD ----
    drift, tally, not_at_pin = [], {"holds": 0, "moved": 0, "gone": 0}, 0
    for c in todo:
        repo, sha, path = c["m"].group("repo"), c["m"].group("sha")[:SHORT], c["m"].group("path")
        A = int(c["m"].group("a"))
        B = int(c["m"].group("b") or A)
        whole, _ = files[(repo, sha, path)]
        if whole is None or B > len(whole):
            problems.append(f"{c['where']}: {c['src']} names lines past the end of the file at the pin, or no file")
            continue
        pinned = whole[A - 1:B]
        head_lines = whole if c["unchanged"] else files[(repo, heads[repo][:SHORT], path)][0]
        for fig in c["figs"]:
            at_pin = found(fig, c["at"], " ".join(pinned))
            if head_lines is None:
                state, new = "gone", None
            else:
                state, new = locate(fig, c["at"], pinned, head_lines, A, B)
            if not at_pin:
                # check-panels.py's failure; it is drift here only when the figure is nowhere at HEAD either
                not_at_pin += 1
                if state != "gone":
                    continue
            tally[state] += 1
            if state == "holds":
                continue
            behind = cmp[(repo, sha)]["behind"]
            drift.append({"page": c["page"], "repo": repo, "pin": sha, "head": heads[repo][:SHORT], "where": c["where"],
                          "fig": fig, "path": path, "a": A, "b": B, "state": state, "new": new, "at_pin": at_pin,
                          "file_gone": head_lines is None, "headline": c["head"],
                          "dated": behind > cmp[(repo, main_pin[repo])]["behind"]})
    if problems:
        print("ABORT: " + "; ".join(problems[:6]))
        return 2

    # ---- report ----
    print(f"drift guard: {len(pages)} pages ({idx.name} and {len(pages) - 1} in work/), {len(cites)} repo-pinned "
          f"citations ({sum(1 for c in cites if c['head'])} in headline regions), {n_figs} figures; "
          f"{other} other sources (page, CI run, publication, résumé, another owner's repository) not read here; "
          f"gh api {rp.fetched} fetched, {rp.hits} cached")
    print("\npins against HEAD" + (" (--head: " + ", ".join(f"{k}={v}" for k, v in forced.items()) + ")" if forced else ""))
    for repo in sorted(pins):
        if repo in skipped:
            print(f"  {repo:<16} {skipped[repo]}: not read")
            continue
        h = heads[repo][:SHORT]
        for i, (s, n) in enumerate(sorted(pins[repo].items(), key=lambda kv: cmp[(repo, kv[0])]["behind"])):
            d = cmp[(repo, s)]
            cited_files = {c["m"].group("path") for c in cites if c["m"].group("repo") == repo and c["m"].group("sha")[:SHORT] == s}
            ch = ("n/a" if d["files"] is None else str(len(cited_files & set(d["files"])))) if d["behind"] else "0"
            role = "main pin" if s == main_pin[repo] else ("dated" if d["behind"] > cmp[(repo, main_pin[repo])]["behind"] else "newer than main")
            state = "at HEAD" if not d["behind"] and not d.get("ahead") else (
                f"{d['behind']} commit{'s' * (d['behind'] != 1)} behind" + (f", {d['ahead']} not on HEAD" if d.get("ahead") else ""))
            print(f"  {repo if i == 0 else '':<16} {('HEAD ' + h) if i == 0 else '':<13} {s}  {n['cited']:>4} cited "
                  f"{n['links']:>4} links  {state:<20} {ch:>3} of {len(cited_files):<3} cited files changed  {role}")

    def failing(d):
        return d["state"] == "gone" and (d["headline"] or not d["dated"])

    fails = [d for d in drift if failing(d)]
    live = [d for d in drift if not d["dated"] or d["headline"]]
    dated = [d for d in drift if d["dated"] and not d["headline"]]

    def show(rows, title):
        if not rows:
            return
        print(f"\n{title}")
        for page in sorted({d["page"] for d in rows}, key=lambda p: (p != idx.name, p)):
            print(f"  {page}")
            for repo in sorted({d["repo"] for d in rows if d["page"] == page}):
                sel = [d for d in rows if d["page"] == page and d["repo"] == repo]
                print(f"    {repo} ({', '.join(sorted({d['pin'] for d in sel}))} -> {sel[0]['head']})")
                for d in sel:
                    rng = f"#L{d['a']}" + (f"-L{d['b']}" if d["b"] != d["a"] else "")
                    if d["state"] == "moved":
                        what = f"moved: now {d['path']}#L{d['new']}"
                    elif d["file_gone"]:
                        what = f"gone: {d['path']} does not exist at HEAD"
                    elif not d["at_pin"]:
                        what = f"gone: not on the cited line even at the pin, and not in {d['path']} at HEAD"
                    else:
                        what = f"gone: not in {d['path']} at HEAD"
                    tag = ("FAIL " if failing(d) else "warn ") + (f"[{d['headline']}] " if d["headline"] else "")
                    print(f"      {tag}{d['where']}  {d['fig']!r}  {d['path']}{rng}  {what}")

    show(live, "drifted figures, by page and repository")
    show(dated, "dated citations whose figures are not at HEAD (history by design, or a pin left behind: read them)")
    print(f"\nfigures at HEAD: {tally['holds']} hold, {tally['moved']} moved, {tally['gone']} gone"
          + (f"; {not_at_pin} not on their cited line even at the pin (check-panels.py's failure; listed above only "
                 f"when gone at HEAD too)" if not_at_pin else ""))
    if fails:
        nh = sum(1 for d in fails if d["headline"])
        print(f"FAIL - {len(fails)} figure(s) no longer appear in their repository at HEAD ({nh} headline, "
              f"{len(fails) - nh} elsewhere at a current pin).")
        return 1
    warn = len(live) + len(dated)
    print("PASS - every figure at a current pin, and every headline figure, still appears in its repository at HEAD"
          + (f"; {warn} other figure(s) drifted (warnings above)." if warn else "; nothing drifted."))
    return 0


if __name__ == "__main__":
    try:
        code = main()
    except Exception as err:
        traceback.print_exc()
        print(f"ABORT: {type(err).__name__}: {err}")
        code = 2
    sys.exit(code)
