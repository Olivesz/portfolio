# one ant. two rules.

Oliver Zhang's portfolio — a life story told through working systems, scrolled through
a real cellular automaton.

**Live systems on the page** (all deterministic, all real): a reversible Langton's ant
(the scrollbar runs time in both directions), companion turmites, a Gosper glider gun,
simulation-verified Wireworld logic (clock / XOR / half-adder), an abelian sandpile,
and a 3-state 3D turmite. The market candles are the ant's own chaos walk re-read as
prices.

**Structure**: a vertical spine of eight chapters (emergence → houston → machinery →
language → markets → impact → voice → life os), ending in a finale where the ant's
own trail becomes the resume. Every chapter can be *branched into* — a side-highway
with a title card and 3–4 deep panels per project. Deep links: `#emergence`
`#computation` `#language` `#markets` `#impact` `#voice` `#life`.

**The finale runs on a clock, not on scroll.** Every other scene is a state you can
hold anywhere; a transformation frozen half-way just looks broken. Scroll decides
which way it plays, never how far along it is, and the page is held for exactly as
long as it runs. The resume you read is the same document the particles are made of —
the raster is measured from the live DOM, so the two cannot drift apart.

## Run

Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8137
```

One file, no build step. `three` is vendored in `vendor/` rather than pulled from a
CDN — it *is* the finale, and a CDN failure would have removed it silently. Webfonts
are vendored in `vendor/fonts/` as subsetted woff2 and degrade to system stacks — no
third-party request at load.

## Test

```bash
python3 -m http.server 8137 && open http://localhost:8137/tests/run.html
```

Results are also on `window.__TESTS` / `window.__DONE`
so a CI driver only needs to load the page and read two globals. Every assertion has
been falsified against a deliberately reverted fix — see [tests/README.md](tests/README.md),
which also documents the two assertions that once passed against broken code.

## Deploy

Any static host. For GitHub Pages: Settings → Pages → deploy from branch, root.
`poster.jpg` is the og:image referenced from the page head; `robots.txt` allows
ordinary search indexing while opting out of AI training crawlers.

## Dev

`window.__lab` drives the page headlessly:

| | |
|---|---|
| `jump(p)` | settle at scroll position `p` (0–1) |
| `tickTo(p, frames, dt)` | emulate the live loop for `frames` at `dt` ms |
| `finBeat(t, p)` / `finFree()` | pin the finale's clock at `t` for inspection / release it |
| `fin()` | finale clock state: `t`, `dir`, `lock`, band bounds |
| `scrollMap()` | scroll length vs the document's real scrollable height |
| `branchTo(id, q)` / `exitBranch()` | enter/leave a chapter branch |
| `roam(on)` | the free-roam mode |

`window.__GL3.inkRect()` returns where the formed resume lands on screen, which is how
registration against the DOM sheet is asserted rather than eyeballed.

The reasoning behind each version is kept out of this repository on purpose:
the build log named private sources and internal paths, so it is not published.
What ships instead is enforcement — `tests/run.html`,
`tests/check-claims.py`, `tests/check-panels.py` and `tests/check-links.py`,
each falsified against a deliberately broken build.
