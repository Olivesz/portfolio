#!/usr/bin/env python3
"""Lock the figure surface of the site: every number that makes a claim must
carry a source, and must be used for the thing it was sourced FOR.

`check-claims.py` pins claims that have ALREADY been retired. It is a memory,
and memories only cover what has gone wrong once. This guard covers what has
not gone wrong yet.

TWO FAILURES THIS FILE EXISTS BECAUSE OF, both found by falsifying it rather
than by reading it:

1. IT SCANNED THE WRONG SURFACE. The first version only read canvas draw calls
   (panelTitle / centerCaption / fitText / ctx.fillText). But when the KRONOS
   gate overclaim shipped, only 4 of its 7 occurrences were canvas -- the other
   three were a `.facts` chip, card prose and a bento string, which is the copy
   a reader meets FIRST. A fabricated "9,999 tests green" in a chip passed
   clean. So the scan now covers three regions: canvas strings, the chapter
   cards, and the bento. The card region is derived from its markers at runtime
   (never hardcoded line numbers, which rot on the next edit) and the run
   ABORTS if a region comes back empty -- a scan that silently walks nothing is
   the failure mode this whole file is about.

2. IT KEYED ON THE NUMBER, NOT THE CLAIM. FIGURES used to map "40" -> a source.
   But 40 is legitimately USIT's "40+ orgs by hand", so a declaration made for
   USIT silently blessed KRONOS's retired "40 gates in CI" -- re-injected into
   a canvas panel, the guard's own home turf, and it PASSED. A number is not a
   claim; a number plus what it counts is. Every declaration now carries a
   context pattern that the surrounding text must match, so 39 may be KRONOS's
   CI gates AND SAP-2's instruction count, and neither one launders the other.

Run:  python3 tests/check-panels.py

Statuses:
  a repo path  -- verified against that file; re-check when the repo moves on
  ILLUSTRATIVE -- deliberately not a measurement; the panel must SAY so
  INHERENT     -- a property of the thing itself (a rule, a form number, a
                  count of items drawn on screen), not a claim about the world
  UNVERIFIED   -- in scope, context-checked, but nobody has opened the source.
                  Allowed so the guard could ship over an existing page instead
                  of being blocked on a full audit; counted and printed every
                  run so it stays a debt, not a hiding place. Do not add new
                  ones -- a figure you are shipping today you can source today.
"""
import html
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

# figure -> [(context regex, source)]. The context is matched against a window
# of surrounding text; at least one alternative must hit. Writing the context
# is the moment you check what the number actually counts.
FIGURES = {
    # --- KRONOS -----------------------------------------------------------
    "1.07":     [(r"sharpe", "PUBLIC kronos-quant README.md:134 shipped row")],
    "17.9%":    [(r"max ?dd|drawdown|dd\b", "PUBLIC kronos-quant README.md:134 shipped row")],
    # The equity-curve panel PLOTS research/trade.json (KRONOS-TRADE), not the shipped
    # row above. Its legend used to borrow the shipped row's -17.9% plus an 11.2% vol
    # that matched neither file -- three numbers from two series on one curve. Each
    # figure in that panel now describes the series actually drawn.
    "1.05":     [(r"sharpe", "PUBLIC kronos-quant research/trade.json KRONOS-TRADE sharpe 1.0502")],
    "16.5%":    [(r"max ?dd|drawdown", "PUBLIC kronos-quant research/trade.json KRONOS-TRADE max_dd -0.1647")],
    "8.8%":     [(r"vol", "PUBLIC kronos-quant research/trade.json KRONOS-TRADE vol 0.0880")],
    "33.7%":    [(r"SPY|buy ?& ?hold", "PUBLIC kronos-quant README.md:138")],
    "0.45":     [(r"PBO", "PUBLIC kronos-quant: PBO reported, not buried")],
    "185":      [(r"trials?", "PUBLIC kronos-quant README.md:143 \"N=185 logged trials\" (verified 2026-09-10)")],
    # THE GATE COUNT IS THE PUBLIC ARTIFACT'S len(GATES), RE-DERIVED, NEVER CARRIED.
    # kronos-quant enforces it on its own surfaces (run_all.py fails if its README
    # badge disagrees with len(GATES)); nothing ties THIS site to that check except
    # this line. It read 39 here for five weeks while the repo moved 39 -> 40 -> 41,
    # and the declaration kept blessing 39 -- the guard did not miss the stale figure,
    # it PROTECTED it. A declared source cannot notice its source moving. Re-derive
    # by AST from the public repo whenever kronos-quant ships, then update both lines.
    "41":       [(r"gates?|CI", "PUBLIC kronos-quant tests/run_all.py len(GATES)=41 by AST; README badge gates-41 (verified 2026-10-11)")],
    "25":       [(r"end-to-end", "PUBLIC kronos-quant README.md:27,68 \"runs end-to-end in ~25s\"")],
    "34":       [(r"pre-?registered|experiments?", "PUBLIC kronos-quant README.md:148; run_research.py len(EXPERIMENTS)=34 by AST (verified 2026-10-11)")],
    "48":       [(r"US names|tickers|universe", "Kronos/README.md:174")],
    "2013":     [(r"2026|window|names", "backtest window start")],
    "2026":     [(r"2013|window|names", "backtest window end"),
             (r"intern|IBM|summer|austin", "hero identity line: SWE intern @ IBM, summer 2026")],
    "6.5":      [(r"gross|multiple|SPY", "cumulative gross multiple of the plotted SPY series")],
    "3.3":      [(r"KRONOS|net", "PUBLIC kronos-quant research/trade.json nav ends 3.2642")],
    "7bps":     [(r"cost|commission|spread", "cost model: 1bp commission + 2bp spread + impact")],
    "1.0":      [(r"benchmark|cap-weighted|below", "INHERENT: benchmark normalised to 1.0")],
    "0.75":     [(r"\bp\b|diversity|DW", "dw-backtester: DW diversity parameter p")],
    "1.18":     [(r"net|ends", "dw-backtester: ends x1.18 net")],
    "0.00e+00": [(r"p=1|reproduces|benchmark", "INHERENT: p=1 reproduces the benchmark exactly")],
    "120":      [(r"names|synthetic|market", "dw-backtester synthetic market, names")],
    "2005":     [(r"2018|synthetic|window", "dw-backtester synthetic window start")],
    "2018":     [(r"2005|synthetic|window", "dw-backtester synthetic window end")],
    "13":       [(r"safety envelope|point|13/13|audit", "copytrader safety envelope, 13 points")],

    # --- charformer -------------------------------------------------------
    "1.4611":   [(r"val", "charformer/README.md:66 (main run best val, step 2000)")],
    "2000":     [(r"step", "charformer/README.md:66 (step of the minimum)")],
    "4,225":    [(r"bigram|param", "charformer/README.md:65 (bigram baseline params)")],
    "2.49":     [(r"bigram|val", "charformer/README.md:65 (bigram baseline val loss)")],
    "4.17":     [(r"floor|untrained|ln", "charformer/README.md:64 (ln(vocab), vocab 65 at README.md:45)")],
    "49":       [(r"tests?|passed|green", "charformer: `pytest -q` -> 49 passed, 2 deselected (2026-09-06)")],
    "51":       [(r"of 51|collected|shown", "charformer: 51 collected (49 + 2 deselected)")],
    "16":       [(r"shown", "INHERENT: 16 of the collected test rows drawn on screen")],
    "1.19":     [(r"in 1\.19|s\b", "charformer pytest wall time")],

    # --- emergence --------------------------------------------------------
    "1,446":    [(r"NAND|gates?", "emergence/cpu/README.md:31 (1446 NAND gates)")],
    "175":      [(r"flip-?flop|DFF", "emergence/cpu/README.md:31 (175 flip-flops)")],
    "10%":      [(r"explor|A\*", "emergence/README.md:26 (bidirectional A* explores ~10%)")],
    "145×":     [(r"bench|lift|barbell", "ILLUSTRATIVE: a barbell lift in the life-os panel")],


    # --- impact / life os -------------------------------------------------
    "150,000":  [(r"deploy|USIT|fund", "USIT deployed capital, $150k+")],
    # 40 is USIT's, and ONLY USIT's. This entry is why the KRONOS overclaim
    # cannot come back through a number that happens to be declared.
    "40":       [(r"orgs?|organi[sz]ation|by hand", "USIT organisations evaluated by hand, 40+")],
    "990":      [(r"IRS|Form|full-text|filing", "INHERENT: IRS Form 990, a form number not a quantity")],
    "60":       [(r"day|auto-disable|failsafe", "lifeos-scheduler: 60-day auto-disable")],
}

CANVAS = re.compile(r"(?:panelTitle|centerCaption|fitText|ctx\.fillText)\s*\(")
# `var stats = [` lives inside canvas panel functions and matched no region at all,
# which is how a stale gate count sat in one unguarded. Scan it with the bento.
BENTO = re.compile(r'stats:\s*\[|var stats\s*=\s*\[|^\s*s:"')
STR = re.compile(r'"((?:[^"\\]|\\.)*)"')
# a figure: digits, optional thousands/decimals, optional exponent, optional
# unit. NB no trailing \b -- "%" and "×" are not word characters, so a trailing
# \b made the engine backtrack and match "10" out of "10%", silently splitting
# one figure into a different, wrong one. Word-suffixed units keep their own \b.
# The exponent sign accepts U+2212 MINUS because the page writes &minus;.
NUM = re.compile(
    r"\d[\d,]*(?:\.\d+)?(?:e[+\-−]?\d+)?"
    r"(?:\s?(?:%|×)|(?:k|m|bps|gflops|fps|hz)\b)?", re.I)
# colour literals share lines with draw calls and are not claims. Strip the
# WHOLE call, not just its name -- the first version left "255,209,102,0.9)"
# behind and reported it as an undeclared figure.
NOISE = re.compile(r"(?:rgba?|hsla?)\([^)]*\)|#[0-9a-f]{3,8}", re.I)
# \uXXXX escapes live in the JS source. Left alone they read as the digits
# 2019/201 -- the guard inventing claims nobody sees. DECODE them, never
# substitute a placeholder: an earlier version replaced every escape with an
# apostrophe, which turned "\\u221217.9%" into "'17.9%", which the
# apostrophe-year rule below then ate down to ".9%". Same mistake as stripping
# &times; instead of decoding it, one layer down.
UNICODE_ESC = re.compile(r"\\u([0-9a-fA-F]{4})")
def _dec(t): return UNICODE_ESC.sub(lambda m: chr(int(m.group(1), 16)), t)
TAG = re.compile(r"<[^>]+>")
# Not claims, and a guard that flags them is a guard that gets ignored:
# clock times in the life-os copy, the "86"/"64" inside x86-64, and the
# apostrophe-year in "turing scholars '28" -- which the context check caught
# trying to borrow KRONOS's "28 pre-registered experiments" as its source.
NOT_A_CLAIM = re.compile(r"\d{1,2}:\d{2}|x86-64|’\d{2}\b|'\d{2}\b")


def norm(v):
    """One figure, one spelling. Trailing punctuation and the space before a
    unit are typography, not data: '2018,' '145 ×' and '145×' are one number."""
    return re.sub(r"\s+", "", v.strip().rstrip(".,;:"))


def clean(t, is_html):
    t = _dec(NOISE.sub(" ", t))
    if is_html:
        # DECODE entities, never strip them. Replacing &times;/&minus; with a
        # space turned "60×" into a bare "60" and split "1.2e&minus;07" into
        # "1.2" and "07" -- mangling two real claims into four fake ones.
        t = html.unescape(TAG.sub(" ", t))
    return NOT_A_CLAIM.sub(" ", t)


def regions(lines):
    """Derive the card region from its markers. Hardcoded line numbers rot on
    the next edit and fail silently -- which is this file's whole subject."""
    lo = hi = None
    for i, l in enumerate(lines, 1):
        if lo is None and '<section class="card"' in l:
            lo = i
        if '<div class="sheet"' in l:
            hi = i
            break
    if not (lo and hi and hi > lo):
        sys.exit(f"ABORT: card-region markers moved (lo={lo}, hi={hi}). Fix the "
                 f"markers in this guard before trusting another green run.")
    return lo, hi


def figures():
    lines = INDEX.read_text().splitlines()
    lo, hi = regions(lines)
    found, seen = [], {"canvas": 0, "card": 0, "bento": 0}
    for n, line in enumerate(lines, 1):
        if CANVAS.search(line):
            kind, blobs = "canvas", [clean(s, False) for s in STR.findall(_dec(NOISE.sub(" ", line)))]
        elif lo <= n < hi:
            kind, blobs = "card", [clean(line, True)]
        elif BENTO.search(line):
            kind, blobs = "bento", [clean(line, True)]
        else:
            continue
        for t in blobs:
            for m in NUM.finditer(t):
                v = norm(m.group(0))
                if not v or re.fullmatch(r"\d", v):
                    continue      # bare single digits read as words, not claims
                seen[kind] += 1
                w = t[max(0, m.start() - 55):m.end() + 55]
                # EVERY occurrence, not the first. setdefault() here meant a
                # figure used correctly once was never checked again -- the
                # bento's present-tense "29 tests green" rode in behind the
                # card's correct historical "29 executable tests".
                found.append((v, n, kind, re.sub(r"\s+", " ", w).strip()))
    empty = [k for k, c in seen.items() if not c]
    if empty:
        sys.exit(f"ABORT: scanned {empty} and found no figures at all. A guard "
                 f"that walks nothing passes everything.")
    return found, seen


def main():
    found, seen = figures()
    bad = []
    for v, line, kind, ctx in found:
        rules = FIGURES.get(v)
        if not rules:
            bad.append((line, kind, v, ctx, None))
        elif not any(re.search(rx, ctx, re.I) for rx, _ in rules):
            bad.append((line, kind, v, ctx, [rx for rx, _ in rules]))

    on_screen = {v for v, _, _, _ in found}
    unverified = sorted(v for v, rs in FIGURES.items()
                        if v in on_screen and any("UNVERIFIED" in s for _, s in rs))
    unused = sorted(v for v in FIGURES if v not in on_screen)

    print(f"panel guard: {len(on_screen)} distinct figures, {len(found)} uses "
          f"({seen['canvas']} canvas / {seen['card']} card / {seen['bento']} bento), "
          f"{len(FIGURES)} declared\n")
    if unused:
        print("declared but no longer on screen (safe to delete):")
        print("  " + ", ".join(unused) + "\n")
    if unverified:
        print(f"{len(unverified)} figure(s) shipping UNVERIFIED -- context-checked, "
              f"source never opened:\n  " + ", ".join(unverified) + "\n")
    if not bad:
        print("PASS - every figure carries a source AND is used for what it counts.")
        return 0
    bad = sorted(dict.fromkeys(
        (l, k, v, c, tuple(r) if r else None) for l, k, v, c, r in bad))
    for line, kind, v, ctx, rules in bad:
        if rules is None:
            print(f"FAIL index.html:{line} [{kind}]  undeclared figure {v!r}")
            print(f'  in: "{ctx}"')
            print(f"  fix: verify it, then add to FIGURES:")
            print(f'       "{v}": [(r"<what it counts>", "<repo/path:line>")]\n')
        else:
            print(f"FAIL index.html:{line} [{kind}]  {v!r} used OUTSIDE its declared context")
            print(f'  in:       "{ctx}"')
            print(f"  declared: {rules}")
            print(f"  fix: this number is sourced for something else. Either it is the "
                  f"wrong number here, or it is a\n       second real claim that needs "
                  f"its own (context, source) entry.\n")
    print(f"{len(bad)} problem(s). A number nobody can source, or one borrowing "
          f"another claim's source, is how the last 32 got there.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
