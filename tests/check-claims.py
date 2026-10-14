#!/usr/bin/env python3
"""Phrasings this site must not state, and personal data it must not carry.

Every tracked file is scanned. RETIRED lists patterns, each with a note on what
not to state and which source governs the figure or wording instead. Patterns
that would themselves disclose something (an employer's internal names and
figures, a private repository's name or internals) are read at run time from a
gitignored file, never written here. Personal data is checked the same way.

Run:  python3 tests/check-claims.py
Exit: 0 clean, 1 if a retired phrasing or personal data is found, or if either
private source could not be read.

To retire a phrasing, add its pattern with a note naming the governing source,
here if the pattern is safe to publish, in the private file if it is not.
"""
import fnmatch
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# (pattern, note) or (pattern, note, globs). Matched case-insensitively against every tracked file except this one,
# or, when globs are given, only against the tracked files they match: a figure retired for one project can be a right
# figure in another (freeflow's three passes take 1.05 s).
# Only patterns safe to publish live here; see PRIVATE_RETIRED for the rest.
KRONOS_FILES = ("index.html", "work/kronos*.html", "README.md")
RETIRED = [
    (r"sharpe 0\.94|0\.94.{0,24}net sharpe|net sharpe.{0,24}0\.94",
     "KRONOS: the Sharpe is README.md's shipped run, 1.07 at -17.9%. FINDINGS.md labels "
     "0.94 a baseline row."),
    (r"30 CI gates|30 gates in CI",
     "KRONOS: the gate count is README.md's (41: 39 synthetic, 2 real-market), counted "
     "from GATES in tests/run_all.py."),
    (r"22 pre-registered",
     "KRONOS: README.md governs the count of pre-registered experiments."),
    # held-out: singular and plural, with or without a following noun
    (r"seashells[^.\n]{0,30}held-out|held-out[^.\n]{0,20}days?\b|held-out\s+backtest",
     "IMC: README.md describes the figure as a run of the backtest script. Do not "
     "describe it as held-out or out of sample, in any phrasing."),
    # any citation count, with words allowed between the number and the noun
    (r"\d+\s*(\+|×|x)?\s*(IEEE\s+)?citations|cited\s+\d+\s*(×|x)|citations at 17",
     "Publications: state no citation count in any phrasing. A count depends on the "
     "index that produced it; the paper is listed as coauthored."),
    (r"building in public|dated public commit",
     "A private repository's commits are not public; do not describe them as such."),
    (r"the SAME maze|cells explored on the same maze",
     "emergence: each maze solver builds its own maze (index.html:554,612,655); do not "
     "claim a shared maze."),
    (r"~/Projects|/Users/",
     "A local path in a published file says where private material lives.\n"
     "The private repository's name is checked at run time, never written here (see main())."),
    (r"work authorization",
     "Not stated in public files. A résumé sent to one employer may carry it."),
    (r"complexity was never in the rules",
     "Copy does not explain the art's significance."),
    (r"the walk took one path",
     "The colophon is exactly 'Source: github.com/Olivesz/portfolio.'"),
    (r"live simulation",
     "The art carries no frame labels and no captions about itself."),
    (r"what you[’']re seeing",
     "Instruction lines say what to watch; they do not narrate the art."),
    (r"(?<![\d.])1\.05(?!\d)",
     "KRONOS: the page states one Sharpe, 1.07, from the run behind the results table. "
     "A second Sharpe beside it reads as two answers to one question.", KRONOS_FILES),
    (r"[−\-–]\s?16\.5\s?%",
     "KRONOS: the page states one drawdown, -17.9%, from the same run as the table.", KRONOS_FILES),
    (r"best\s+paper",
     "IARIA GREEN 2023: list the paper as a coauthored publication with no award. The "
     "conference's own page governs."),
]

# PERSONAL DATA IS CHECKED AGAINST A PRIVATE SOURCE AT RUN TIME, NEVER WRITTEN HERE.
# This file is published, so it holds no personal data in any form, hashed included:
# a ten-digit number is recovered from its hash by brute force in hours. The number
# is read from a private profile through the gitignored link .private/profile.json.
# If that link is unreadable the run FAILS rather than skipping: an unchecked
# personal-data guard is not a passing one.
PRIVATE_PROFILE = ROOT / ".private" / "profile.json"   # gitignored; points outside the repo
# Patterns that cannot be published, as {"retired": [{"pattern", "note"}], "controls": [...]}.
# Gitignored. Unreadable or malformed means the run FAILS, as with the profile.
# Each control is a string no private pattern may match: a pattern that does is
# too broad, and the run says so instead of over-reporting quietly.
PRIVATE_RETIRED = ROOT / ".private" / "retired.json"
WINDOW = 60   # the groups must sit near each other: a 300KB page has many short numbers


def private_numbers():
    """Ten-digit numbers that must never ship, or None if the source is unreadable."""
    try:
        prof = json.loads(PRIVATE_PROFILE.read_text())["profile"]
    except (OSError, KeyError, ValueError):
        return None
    d = re.sub(r"\D", "", str(prof.get("phone", "")))[-10:]
    return [d] if len(d) == 10 else []


def private_retired():
    """(pattern, note) pairs from the private file, or None if it is unusable."""
    try:
        data = json.loads(PRIVATE_RETIRED.read_text())
        pairs = [(e["pattern"], e["note"]) for e in data["retired"]]
        controls = list(data.get("controls", []))
        for pat, _ in pairs:
            re.compile(pat)
    except (OSError, KeyError, TypeError, ValueError, re.error):
        return None, None
    return (pairs or None), controls


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


# "Shipped" means TRACKED, not "on disk": local snapshots and gitignored notes are
# never published, so git is asked which files leave the machine.
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


def readable(path):
    """The text in a file that can state something. An SVG's path data and coordinates are geometry, not words
    (resume-page.svg is resume.pdf's glyphs as outlines, and '1.05' turns up in its curves), so an SVG is read as
    its text content plus its label, title, alt and link attributes. Tags become spaces, so line numbers hold."""
    t = path.read_text(encoding="utf-8", errors="ignore")
    if path.suffix.lower() != ".svg":
        return t
    said = re.findall(r'\s(?:aria-label|title|alt|href|xlink:href)\s*=\s*"([^"]*)"', t)
    return re.sub(r"<[^>]*>", " ", t) + "\n" + "\n".join(said)


def main():
    failures = []
    checked = 0
    hidden, controls = private_retired()
    if hidden is None:
        print(f"FAIL private retired patterns could not be read: {PRIVATE_RETIRED}\n"
              f"     Refusing to report clean on a check that did not execute.")
        return 1
    for c in controls:
        if any(re.search(p, c, re.I) for p, _ in hidden):
            print(f"FAIL a private pattern matches its own control string (index "
                  f"{controls.index(c)}); it is too broad.")
            return 1
    for path in shipped_files():
        try:
            text = readable(path)
        except OSError:
            continue
        checked += 1
        rel = path.relative_to(ROOT).as_posix()
        for pattern, reason, *globs in RETIRED:
            if globs and not any(fnmatch.fnmatchcase(rel, g) for g in globs[0]):
                continue
            for m in re.finditer(pattern, text, re.I):
                line = text.count("\n", 0, m.start()) + 1
                failures.append((path.relative_to(ROOT), line, m.group(0), reason))

    nums = private_numbers()
    if nums is None:
        print(f"FAIL personal-data check could not run: {PRIVATE_PROFILE} unreadable.\n"
              f"     Refusing to report clean on a check that did not execute.")
        return 1
    # This file is included here: retired-claim patterns may quote themselves in it,
    # personal data may not appear in it any more than anywhere else.
    private_repo = PRIVATE_PROFILE.resolve().parents[1].name
    for path in shipped_files(include_self=True):
        t = readable(path)
        # private patterns are matched in this file too: quoting one here is the leak
        for pattern, reason in hidden:
            for m in re.finditer(pattern, t, re.I):
                line = t.count("\n", 0, m.start()) + 1
                failures.append((path.relative_to(ROOT), line, m.group(0), reason))
        # the private repo's name, derived from where the gitignored link points, so
        # this public file never has to spell it -- spelling it is the leak it prevents
        if re.search(re.escape(private_repo), t, re.I):
            failures.append((path.relative_to(ROOT), 0, "<private repo name>",
                             "Names the private resume source. Value withheld."))
        if any(leaks(t, d) for d in nums):
            failures.append((path.relative_to(ROOT), 0, "<personal number>",
                             "Personal phone number, in some format. Value withheld."))

    print(f"claim guard: {checked} files checked, {len(RETIRED)} retired claims, "
          f"{len(hidden)} private retired claims, {len(nums)} private number(s) checked\n")
    if not failures:
        print("PASS - no retired claim or personal data found.")
        return 0
    for rel, line, hit, reason in failures:
        print(f"FAIL {rel}:{line}\n  matched: {hit!r}\n  why:     {reason}\n")
    print(f"{len(failures)} occurrence(s) of retired claims or personal data.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
