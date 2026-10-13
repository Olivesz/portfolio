#!/usr/bin/env python3
"""Every outbound link resolves, and every linked repo is public.

Repo visibility can change after a link is written. A link to a repo that has
gone private 404s for every visitor while looking fine to the owner, who is
logged in, so visibility is read from GitHub on every run.

Checks, in order of how much they cost when wrong:
  1. every https link in index.html returns < 400
  2. every Olivesz repo LINKED here is actually public
  3. no repo named in the copy is public-but-unlinked (a soft warning: a named
     project a reader cannot reach is a wasted mention)
  4. resume.pdf names github.com/Olivesz, and its contacts are links (mailto,
     linkedin, github): a PDF read on screen should open what it names, and the
     printed sheet on the page carries the same three

  python3 tests/check-links.py            # skips network unless --net
  python3 tests/check-links.py --net      # also fetches every link
  python3 tests/check-links.py --resume-pdf other.pdf   # check another PDF build
"""
import json
import pathlib
from html import unescape
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
OWNER = "Olivesz"

# Public repos named in the copy on purpose but deliberately not linked, with the
# reason. Only public repos are ever checked against this list.
ALLOW_UNLINKED = {
    "portfolio": "this repo",
}


def gh_visibility(name):
    try:
        out = subprocess.run(
            ["gh", "repo", "view", f"{OWNER}/{name}", "--json", "visibility"],
            capture_output=True, text=True, timeout=25)
        if out.returncode != 0:
            return None            # not found, or gh unavailable
        return json.loads(out.stdout)["visibility"]
    except Exception:
        return None


def resume_pdf_problems(pdf):
    """The tracked PDF's header: github.com/Olivesz in its text, and a link
    under each contact. Needs poppler (pdftotext, pdfinfo); a missing tool fails."""
    import shutil
    if not pdf.is_file():
        return [f"{pdf} is missing"]
    tools = {t: shutil.which(t) for t in ("pdftotext", "pdfinfo")}
    if not all(tools.values()):
        return ["pdftotext/pdfinfo not installed, so the résumé PDF cannot be read"]
    text = subprocess.run([tools["pdftotext"], str(pdf), "-"], capture_output=True,
                          text=True, timeout=60).stdout
    rows = subprocess.run([tools["pdfinfo"], "-url", str(pdf)], capture_output=True,
                          text=True, timeout=60).stdout.splitlines()
    uris = [r.split()[-1] for r in rows[1:] if r.split()[1:2] == ["Annotation"]]
    bad = []
    if f"github.com/{OWNER}" not in text:
        bad.append(f"{pdf.name} text has no github.com/{OWNER}")
    want = {"mailto": lambda u: u.startswith("mailto:"),
            "linkedin": lambda u: "linkedin.com/in/" in u,
            "github": lambda u: u.rstrip("/") == f"https://github.com/{OWNER}"}
    for name, ok in want.items():
        if not any(ok(u) for u in uris):
            bad.append(f"{pdf.name} has no {name} link")
    if len(uris) < 3:
        bad.append(f"{pdf.name} has {len(uris)} link(s), needs at least 3")
    return bad


def main():
    net = "--net" in sys.argv
    html = INDEX.read_text()
    fail = warn = 0

    # an href is fetched as the browser resolves it: &amp; is &
    links = sorted({unescape(u) for u in re.findall(r'href="(https://[^"]+)"', html)})
    repo_links = sorted({m for m in re.findall(
        rf'https://github\.com/{OWNER}/([a-z0-9._-]+)', html)})
    print(f"link guard: {len(links)} outbound links, {len(repo_links)} repos linked\n")

    if net:
        import urllib.request
        for u in links:
            try:
                req = urllib.request.Request(u, method="HEAD",
                                             headers={"User-Agent": "link-guard"})
                code = urllib.request.urlopen(req, timeout=20).status
            except Exception as e:
                code = getattr(e, "code", 0)
            # 405 means the server ANSWERED and refused the METHOD, not that the
            # URL is dead -- LinkedIn rejects HEAD from non-browsers. Treating it
            # as a failure trains people to ignore a red link guard, which is
            # worse than the one link it mis-reports. 403 likewise: bot-blocked,
            # not missing.
            # A server that ANSWERS with a refusal is not a dead link. 405 = method
            # refused (LinkedIn rejects HEAD), 403 = bot-blocked, 999 = LinkedIn's
            # own non-standard "request denied" for automated clients. Only a
            # genuine 4xx/5xx-not-in-this-set means the URL is actually broken.
            # Counting bot-blocks as failures trains people to ignore a red link
            # guard, which costs more than the one link it mis-reports.
            ok = 0 < code < 400 or code in (403, 405, 999)
            print(f"  {'ok  ' if ok else 'FAIL'} {code or '---'}  {u}")
            if not ok:
                fail += 1
        print()
    else:
        print("  (network checks skipped; pass --net to fetch every link)\n")

    for name in repo_links:
        vis = gh_visibility(name)
        if vis is None:
            print(f"  warn  {name}: could not read visibility (gh missing or repo gone)")
            warn += 1
        elif vis != "PUBLIC":
            print(f"  FAIL  {name} is LINKED but is {vis} — that link 404s for visitors")
            fail += 1
        else:
            print(f"  ok    {name} linked, public")

    try:
        listing = subprocess.run(
            ["gh", "repo", "list", OWNER, "--limit", "80", "--json", "name,visibility"],
            capture_output=True, text=True, timeout=30)
        pub = [r["name"] for r in json.loads(listing.stdout)
               if r["visibility"] == "PUBLIC"]
    except Exception:
        pub = []
    for name in pub:
        # the profile repo is named after the account, which every github.com/Olivesz link spells out
        if name in repo_links or name in ALLOW_UNLINKED or name.lower() == OWNER.lower():
            continue
        if re.search(rf'\b{re.escape(name)}\b', html, re.I):
            print(f"  warn  {name} is public and named in the copy but never linked")
            warn += 1

    pdf = ROOT / "resume.pdf"
    if "--resume-pdf" in sys.argv:
        pdf = pathlib.Path(sys.argv[sys.argv.index("--resume-pdf") + 1])
    probs = resume_pdf_problems(pdf)
    for b in probs:
        print(f"  FAIL  {b}")
    if not probs:
        print(f"  ok    {pdf.name} names github.com/{OWNER} and links its three contacts")
    fail += len(probs)

    print()
    if fail:
        print(f"FAIL — {fail} problem(s), {warn} warning(s).")
        return 1
    print(f"PASS — links resolve and every linked repo is public. {warn} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
