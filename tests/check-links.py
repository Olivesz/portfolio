#!/usr/bin/env python3
"""Every outbound link resolves, and every repo chip matches reality.

Repo visibility DRIFTS. casecraft was public in the morning and private by the
afternoon of the same day. Two failure modes follow, and both are silent:

  - a link to a repo that has gone private 404s for every visitor while looking
    fine to the owner, who is logged in;
  - a "private" chip on a repo that has since been made public hides real work
    behind a dead end. That happened to `emergence` -- a Wireworld CPU, public,
    advertised on this site as private, for days.

Checks, in order of how much they cost when wrong:
  1. every https link in index.html returns < 400
  2. every Olivesz repo LINKED here is actually public
  3. every repo named in a "private" chip is actually private
  4. no repo named in the copy is public-but-unlinked (a soft warning: a named
     project a reader cannot reach is a wasted mention)

  python3 tests/check-links.py            # skips network unless --net
  python3 tests/check-links.py --net      # also fetches every link
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
OWNER = "Olivesz"

# Named in the copy on purpose but deliberately not linked, with the reason.
ALLOW_UNLINKED = {
    "casecraft": "private repo; named in prose as a sibling project",
    "vitals": "private repo",
    "claudio": "private repo",
    "copytrader": "private repo",
    "lifeos-scheduler": "private; represented by the life os private chip",
    "usit-diligence-pipeline": "private; represented by the impact private chip",
    "charformer": "private; represented by its own named chip",
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


def main():
    net = "--net" in sys.argv
    html = INDEX.read_text()
    fail = warn = 0

    links = sorted(set(re.findall(r'href="(https://[^"]+)"', html)))
    repo_links = sorted({m for m in re.findall(
        rf'https://github\.com/{OWNER}/([a-z0-9._-]+)', html)})
    # a chip reads like: <span class="privrepo" ...>NAME · private</span>
    # data-repo, not the visible label. The label is for a reader ("usit
    # pipeline"); the guard needs the repo name. Guessing one from the other is
    # how a chip becomes unverifiable, which is the state emergence hid in.
    chips = re.findall(r'class="privrepo"\s+data-repo="([^"]+)"', html)
    unnamed = len(re.findall(r'class="privrepo"(?![^>]*data-repo=)', html))

    print(f"link guard: {len(links)} outbound links, {len(repo_links)} repos linked, "
          f"{len(chips)} private chips\n")

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

    if unnamed:
        print(f"  FAIL  {unnamed} private chip(s) carry no data-repo — unverifiable")
        fail += unnamed
    for name in chips:
        vis = gh_visibility(name)
        if vis == "PUBLIC":
            print(f"  FAIL  chip says {name!r} is private, but that repo is PUBLIC — "
                  f"real work hidden behind a dead end")
            fail += 1
        elif vis is None:
            print(f"  FAIL  chip claims {name!r} but no such repo exists")
            fail += 1
        else:
            print(f"  ok    chip {name!r} genuinely {vis}")

    try:
        listing = subprocess.run(
            ["gh", "repo", "list", OWNER, "--limit", "80", "--json", "name,visibility"],
            capture_output=True, text=True, timeout=30)
        pub = [r["name"] for r in json.loads(listing.stdout)
               if r["visibility"] == "PUBLIC"]
    except Exception:
        pub = []
    for name in pub:
        if name in repo_links or name in ALLOW_UNLINKED:
            continue
        if re.search(rf'\b{re.escape(name)}\b', html, re.I):
            print(f"  warn  {name} is public and named in the copy but never linked")
            warn += 1

    print()
    if fail:
        print(f"FAIL — {fail} problem(s), {warn} warning(s).")
        return 1
    print(f"PASS — links and repo chips all match reality. {warn} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
