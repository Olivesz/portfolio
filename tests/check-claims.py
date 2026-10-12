#!/usr/bin/env python3
"""Guard against claim rot.

Why this exists: every factual number on this site is COPIED from another repo,
and nothing checked the copies. Over eleven days that produced, simultaneously:
a capability claim the source project documents as not achieved; a headline
Sharpe that the source labels `baseline (bug, cap 1.0)`; a gate count three
revisions old; a citation figure the curation doc had already retired as wrong;
and an authorship credit the source README explicitly contradicts.

The resume source has its own truth check, but it guards the resume
and does not know this site exists. This is the missing half.

Run:  python3 tests/check-claims.py
Exit: 0 clean, 1 if any retired claim has come back.

Adding a rule is cheap. When a claim is corrected, add the OLD string here so it
cannot silently return.
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# (pattern, human reason). Matched case-insensitively against every shipped file.
RETIRED = [
    (r"safe abstention",
     "IBM: the source project's FAQ documents abstention as NOT achieved -- "
     "answer accuracy unmeasured, no confidence score emitted."),
    (r"written by hand|hand-written transformer",
     "charformer: its own README says the implementation was not written by him. "
     "The spec was; the code was not."),
    (r"sharpe 0\.94|0\.94.{0,24}net sharpe|net sharpe.{0,24}0\.94",
     "KRONOS: 0.94/-14% is the row FINDINGS.md labels `baseline (bug, cap 1.0)`. "
     "The shipped figure is 1.07 at -17.9%."),
    (r"30 CI gates|30 gates in CI",
     "KRONOS: GATES in tests/run_all.py has 39 entries. Count the AST, not the lines."),
    (r"22 pre-registered",
     "KRONOS: the README says 28 pre-registered experiments."),
    # NB: the first version of this pattern was literally "40\+ citations" and
    # sailed straight past "40+ IEEE citations" in a bento stat -- a screenshot
    # caught it, not the guard. Allow words between the number and the noun.
    # No citation COUNT at all, in any phrasing. OpenAlex reads 32 for the IEEE
    # IPCCC paper; 58 is a Google Scholar figure nobody has reproduced, and he is
    # 5th of 6 authors -- a number invites the reader to open the paper, where what
    # they notice is the author list. "Published coauthor" survives being checked.
    # The plural was load-bearing and should not have been. This pattern read
    # `held-out[^.\n]{0,20}days` and therefore MISSED "held-out backtest day",
    # which is live in the resume upstream right now. A control string caught it;
    # without one, a clean scan of that file would have proved nothing. Match the
    # singular too, and do not require a noun to follow at all.
    (r"seashells[^.\n]{0,30}held-out|held-out[^.\n]{0,20}days?\b|held-out\s+backtest",
     "IMC: the README says the figure is a fresh run of the BACKTEST script. "
     "'held-out days' reads as live out-of-sample. Fixed in two panels first and "
     "missed in the card prose -- pin all phrasings, not the ones you happened to see."),
    (r"\d+\s*(\+|×|x)?\s*(IEEE\s+)?citations|cited\s+\d+\s*(×|x)|citations at 17",
     "IPCCC: CURATION.md retired the unqualified '40+' -- false against Semantic "
     "Scholar's 38, understates Google Scholar's 58. A count needs its index named. "
     "'at 17' also composes a 2023 paper with a 2026 count."),
    # --- branch-panel claims, retired 2026-08-19 after a 28-panel audit ---
    (r"architecturally impossible for the candidate to read|cannot read what you are supposed to hear",
     "casecraft: server.py says the case is 'spoken in voice mode, PRINTED IN TEXT MODE', so "
     "the candidate can read it. The real guarantee is that the case never crosses MCP to Claude."),
    (r"building in public|dated public commit",
     "charformer's repo is PRIVATE (gh: visibility PRIVATE; README: 'The repo is private for "
     "that reason'). The checkpoints are dated commits, not public ones."),
    (r"of my own messages",
     "The persona corpus is a CONVERSATION history: both sides are in the 262k. "
     "'my own chat history' is accurate; 'my own messages' is not."),
    (r"the SAME maze|cells explored on the same maze",
     "The five maze solvers each build their own maze -- different size, braid factor and "
     "random endpoints (emergence/index.html:554,612,655). There is no shared control."),
    (r"~/Projects|/Users/",
     "A local path, in a file a scraper can read: it says where private material lives.\n"
     "The private repo's NAME is checked at runtime, never written here -- see main()."),
    (r"work authorization",
     "EEO-adjacent. Fine on a resume sent to one employer, not on a scrapeable file."),
]

# PERSONAL DATA IS CHECKED AGAINST A PRIVATE SOURCE AT RUNTIME, NEVER WRITTEN HERE.
# This file is served publicly by GitHub Pages. For seven weeks it held the phone
# number's digit groups as a regex -- the guard meant to keep the number off the site
# was publishing it, in every commit since this repo's first. A hash would not have
# fixed that: a ten-digit number brute-forces in hours. So the number lives only in
# a private profile, reached through the gitignored link .private/profile.json and
# read when this runs. If that link is missing
# the run FAILS rather than skipping -- an unchecked PII guard is not a passing one.
PRIVATE_PROFILE = ROOT / ".private" / "profile.json"   # gitignored; points outside the repo
WINDOW = 60   # the groups must sit near each other: a 300KB page has many short numbers


def private_numbers():
    """Ten-digit numbers that must never ship, or None if the source is unreadable."""
    try:
        prof = json.loads(PRIVATE_PROFILE.read_text())["profile"]
    except (OSError, KeyError, ValueError):
        return None
    d = re.sub(r"\D", "", str(prof.get("phone", "")))[-10:]
    return [d] if len(d) == 10 else []


def leaks(text, d):
    """True if `d` appears assembled in any format, or as its 3-3-4 groups listed
    near one another. Groups are bounded by NON-DIGITS, not by \\b: written as a
    regex the digits sit right after a letter b, and a word boundary never fires."""
    if d in re.sub(r"[\s.()`+\-]", "", text):
        return True
    a, b, c = d[:3], d[3:6], d[6:]
    for m in re.finditer(r"(?<!\d)" + a + r"(?!\d)", text):
        w = text[max(0, m.start() - WINDOW):m.end() + WINDOW]
        if all(re.search(r"(?<!\d)" + g + r"(?!\d)", w) for g in (b, c)):
            return True
    return False


# "Shipped" means TRACKED, not "on disk". The first version of this script walked
# the working tree and drowned in .bak-* snapshots and gitignored internal docs --
# 132 hits, none of them published. Ask git what actually leaves the machine.
SKIP_SUFFIX = {".pdf", ".jpg", ".png", ".woff2", ".ico"}
SKIP_PARTS = {"vendor"}


def shipped_files(include_self=False):
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files"],
                         capture_output=True, text=True, check=True)
    for rel in out.stdout.splitlines():
        p = ROOT / rel
        if not p.is_file():
            continue
        if p.suffix.lower() in SKIP_SUFFIX:
            continue
        if SKIP_PARTS & set(pathlib.Path(rel).parts):
            continue
        if p.name == pathlib.Path(__file__).name and not include_self:
            continue          # this file quotes every retired claim by design
        yield p


def main():
    failures = []
    checked = 0
    for path in shipped_files():
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        checked += 1
        for pattern, reason in RETIRED:
            for m in re.finditer(pattern, text, re.I):
                line = text.count("\n", 0, m.start()) + 1
                failures.append((path.relative_to(ROOT), line, m.group(0), reason))

    nums = private_numbers()
    if nums is None:
        print(f"FAIL personal-data check could not run: {PRIVATE_PROFILE} unreadable.\n"
              f"     Refusing to report clean on a check that did not execute.")
        return 1
    # NOT shipped_files(): that skips THIS file, and this file is exactly where the
    # number leaked. Retired-claim patterns may quote themselves; personal data may not.
    private_repo = PRIVATE_PROFILE.resolve().parents[1].name
    for path in shipped_files(include_self=True):
        t = path.read_text(encoding="utf-8", errors="ignore")
        # the private repo's name, derived from where the gitignored link points, so
        # this public file never has to spell it -- spelling it is the leak it prevents
        if re.search(re.escape(private_repo), t, re.I):
            failures.append((path.relative_to(ROOT), 0, "<private repo name>",
                             "Names the private resume source. Value withheld."))
        if any(leaks(t, d) for d in nums):
            failures.append((path.relative_to(ROOT), 0, "<personal number>",
                             "Personal phone number, in some format. Value withheld."))

    print(f"claim guard: {checked} files checked, {len(RETIRED)} retired claims, "
          f"{len(nums)} private number(s) checked\n")
    if not failures:
        print("PASS - no retired claim has returned.")
        return 0
    for rel, line, hit, reason in failures:
        print(f"FAIL {rel}:{line}\n  matched: {hit!r}\n  why:     {reason}\n")
    print(f"{len(failures)} occurrence(s) of retired claims.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
