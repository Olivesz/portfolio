# portfolio

One self-contained HTML file. Scrolling steps a reversible Langton's ant: down
runs it forward, up runs it backward. Its road leads from station to station,
and each station is one project: a figure in the art, with a card of text. The
page then pulls back to a map of the whole walk, followed by the résumé and an
index of other work.

`index.html` carries everything: markup, styles, script, the two webfonts as
inline woff2, and the facts block every figure is sourced from. No build step,
no external requests at load.

## Run locally

```bash
python3 -m http.server 8137
# open http://localhost:8137/
```

Opening `index.html` from disk works too.

## Scroll contract

Three drivers, no more:

1. **Scroll position** drives progress as pure functions of a smoothed scroll
   value: the ant's step, the camera's position and pitch, and each beat's
   scrubbed variable. Scrolling back plays everything back exactly.
2. **Thresholds** trigger clips: a station building or leaving, a beat added, a
   label fading. A clip reads raw scroll with hysteresis, always finishes, and
   only one runs at a time. A new trigger jumps the running clip to its end.
3. **The wall clock** drives only ants a visitor plants and a control the
   visitor is touching.

The frame loop stops when nothing moves.

Native scrolling is never taken over. The page has no wheel, touch or key
listeners. Its one scroll listener is passive: it reads `scrollY` and wakes the
frame loop. The page scrolls itself only inside a click handler. There are no inner scrollers and no
horizontal overflow. Every 100px wheel notch advances the page, and the top to
the last résumé line takes at most 105 notches on desktop and 115 on a phone.

The page exposes a read-only `window.__walk` for the tests.
[tests/HOOKS.md](tests/HOOKS.md) is that contract.

## Test

```bash
python3 -m venv .venv
.venv/bin/pip install -q playwright
.venv/bin/python -m playwright install chromium

PYTHONDONTWRITEBYTECODE=1 .venv/bin/python tests/contract.py   # scroll and design contract, headless Chromium
python3 tests/check-claims.py                                  # no retired claim or personal data in a tracked file
python3 tests/check-panels.py                                  # every figure is in the source line it cites
python3 tests/check-links.py                                   # links resolve; add --net to check them online
```

`contract.py` serves the repo on a free port, prints one `PASS`/`FAIL` line per
assertion and viewport, and exits 1 on any failure. `--list` names the
assertions; `--only` and `--viewport` narrow a run. The three guards read files
and their sources without running the page. [tests/README.md](tests/README.md)
covers what each assertion measures and how each was made to fail on purpose.

## Deploy

GitHub Pages, from `main`, at the root. `poster.jpg` is the link-preview image
named in the page head. `robots.txt` allows search indexing, opts out of
training crawlers, and points at `sitemap.xml`. `resume.pdf` is the résumé the
page links to.
