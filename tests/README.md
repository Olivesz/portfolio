# tests

One browser suite and four guards. The suite measures the page as rendered.
The guards read the files and their sources; check-panels also renders the page
once, to read the native figure layers' labels, and check-drift reads the cited
repositories as they are today.

| command | what it settles | time |
|---|---|---|
| `.venv/bin/python tests/contract.py` | the scroll and design contract, in headless Chromium | about 23 min (load-sensitive) |
| `.venv/bin/python tests/contract.py --fast` | the subset a fix most often breaks, for use between edits | 45 s to 2.5 min (load-sensitive) |
| `.venv/bin/python tests/engines.py` | the defects that show only in WebKit or Firefox, which contract.py never runs | about a minute |
| `python3 tests/check-claims.py` | no retired claim or personal data is in a tracked file | 1 s |
| `python3 tests/check-panels.py` | every figure on index.html and every work/*.html is in the source line it cites | about 45 s; the first run fetches |
| `python3 tests/check-links.py [--net]` | links on index.html and every work/*.html resolve (relative links, #fragments, self-site URLs), each case study is linked from index.html and listed in sitemap.xml, every page has its own link-preview card, repo visibility matches what the page says, and resume.pdf links its contacts | seconds |
| `python3 tests/check-drift.py [--offline]` | every repository the site cites, read at its HEAD: each pinned SHA's distance from HEAD, and every repo-cited figure on index.html and every work/*.html still in the cited file; a figure gone at HEAD fails when it is cited at the repository's main pin or newer, or is a headline (index cards, FACTS, results rows) at any pin; a moved figure, or one gone at a dated pin outside a headline, warns. Network: `gh api`, read-only | about 12 s cold, 2 to 4 s cached, under 1 s `--offline` |
| `.venv/bin/python tests/check-security.py` | no security or privacy regression in a shipped file: the policy and referrer, no off-origin load, no inline handler, `javascript:` URL, unprotected new tab, form/iframe/base, risky script API or new URL/storage read; no secret, personal data, private or retired claim or local path in any tracked file (character references decoded too), PDF text or Info, JPEG bytes or data: URI, and no secret in font or icon bytes; no image or PDF metadata; the résumé SVG draws what the PDF draws (`--history` also every blob, message and identity reachable from origin/main; `--selftest` proves every rule on planted controls) | about 5 s; `--history` 30 s; `--selftest` 100 s |
| `python3 tests/csp.py --check` | every page's Content-Security-Policy is present, first after `<meta charset>`, and exactly the policy generated from its inline scripts, with `<meta name="referrer" content="no-referrer">` right after it (`--write` regenerates it; `--browser` also loads each page and fails on any violation) | under 1 s; `--browser` about 70 s |
| `.venv/bin/python tests/poster.py` | poster.jpg is a fresh render of its three lines beside the map after a full read-through, every bloom grown (`--render` writes it) | about 15 s |

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -q --require-hashes -r tests/requirements.txt
.venv/bin/python -m playwright install chromium   # skip if ~/Library/Caches/ms-playwright has the matching build
.venv/bin/python -m playwright install webkit firefox   # for engines.py
```

`.venv/` is gitignored. Run with `PYTHONDONTWRITEBYTECODE=1`, so a stale `.pyc` never runs old code.

`tests/requirements.txt` pins Playwright and the three packages it pulls in to
exact versions, each with the sha256 of every file PyPI publishes for it, so
`--require-hashes` refuses anything else: a release pushed under the same
version, or a new dependency nobody chose. Install scripts in a package run as
you, on the machine that holds the push credentials, so upgrades are deliberate:
change the version, replace its hashes from PyPI's JSON API, and let a release
age a week or two first.

## contract.py

```bash
.venv/bin/python tests/contract.py                       # everything
.venv/bin/python tests/contract.py --fast                # quick subset, see below
.venv/bin/python tests/contract.py --only notches,pink   # some assertions
.venv/bin/python tests/contract.py --viewport phone      # one viewport
.venv/bin/python tests/contract.py --root DIR            # another copy of the site
.venv/bin/python tests/contract.py --list                # names and what each measures
.venv/bin/python tests/contract.py --json out.json       # also keep the results
```

It serves `--root` (default: the repo) over `http.server` on a free port and
prints one line per assertion and viewport: `PASS|FAIL name[viewport] measured value`.
It exits 1 on any FAIL, and also when nothing ran.

**Viewports:**

| name | size | DPR | used for |
|---|---|---|---|
| desktop | 1440×900 | 2 | most assertions |
| phone | 390×844 | 3, touch | most assertions, plus the phone checks |
| phone-small | 360×740 | 2, touch | figure clipping, text in the art band, overflow |
| phone-small-1x | 360×740 | 1, touch | the map's place rows against the last card: at DPR 1 the map pitch fits sooner in the pull-back |
| desktop-125 | 1536×864 | 1.25 | integer pitch at a fractional DPR: scrolled every 0.04 screen, `view().pp` read at each sample |
| desktop-1280, desktop-1024 | 1280×800, 1024×768 | 2 | the art's move per notch in every transit (`pan`) |
| desktop-1920, desktop-tall | 1920×1080, 1024×1366 | 1 and 2 | taller wide screens, where a short card lets go late: `pan` and `deadscroll` |
| phone-se, phone-640 | 375×667, 360×640 | 2, touch | the KRONOS card fit; the camera's move per 2px and per 100px of scroll in station-to-station transits (`camstep`, with phone) |
| land, land-small | 844×390, 740×360 | 3 and 2, touch | a phone on its side: the words in a column beside the art |
| phone-320 | 320×568 | 2, touch | the narrowest phone: no sideways scroll and no text past the edge on any page (`overflow`, `cases`); the map's labels, and its caption clear of the hidden ant's tally (`maplabels`, its map tags listed, not held) |
| zoom-400 | 360×225 | 4 | a 1440×900 window at 400% zoom: no sideways scroll on any case study or deep dive (`cases`) |
| zoom-200, zoom-200-1366, zoom-200-1280 | 720×450, 683×384, 640×400 | 2 | laptop windows at 200% zoom (fine pointer, short screens): every map place whole on screen at the map (`maplabels`) |
| zoom-250, zoom-200-1200, zoom-150 | 576×360, 600×400, 853×533 | 2, 2 and 1.5 | a 1440×900 window at 250% zoom, a 1200×800 window at 200% and a 1280×800 window at 150%: the map's places in two columns, and in one column closed up to the screen's foot (`placerows`); the map's caption drawn once (`mapcapone`, at zoom-250) |
| zoom-400-236 | 360×236 | 4 | 400% zoom on a window a little taller than 900: the places run past the foot, and the rows move up 2 px so the last row that fits ends 3 px above it, its focus ring whole (`placerows`) |
| land-se | 667×375 | 2, touch | an iPhone SE-size phone on its side, where a docked deep-dive step has the least room under the strip (`deepfit`, with phone-se and land) |

At phone-320 and zoom-400 a deep dive's dock fit (each step's change, and each field on its stage, above its docked
words) cannot hold on screens this small; `cases` lists those steps there instead of failing on them, and holds every
other part of each page's self-check.

Perf runs last, in its own contexts, at 4× CPU throttle, three times per viewport.

**The deep dives.** `deep` loads each `work/*-deep.html` and checks its steppers: every `figure.scene` became a
scene with a stepper; with motion (a fake clock) each scene, scrolled to, starts on its own and moves on a step, and a
square, next and prev move it; with reduced motion each rests and the stepper moves it; and by keyboard alone every
stepper control is a focusable native button, Space on the first square goes to step 1 and Enter on next goes to
step 2. `cases` covers their errors, requests off the origin, fonts, tokens and sizes. About two minutes for both
viewports; not in `--fast`.

**The depth pages as a function of scroll position.** `depthpath` takes every page with the depth layer (`lx-`, the
case studies and the deep dives) down, back up and down again through the same positions, on a fake clock: each
figure's top just off the screen and a 24 px sliver of it at the foot, plus eighths of the page where there are few
figures. On a phone the toolbar slides as on a real one, 900 px tall going down and 844 coming up. At every position
each deep-dive scene obeys one floor, 40% of its stage on screen or a fifth of the screen: it plays, or waits its turn,
only on it, and on it it is never left held or unarrived after two beats; a case-study figure's clock never runs under
its floor (a sixth of the screen, or half a short figure). A scene's frame is lit exactly while it is arrived, and
replay never shows on a figure still to finish. Across the passes, the docked word blocks and the layout are the same
at each position, the road is never un-laid and lies the same once laid, one ant is drawn, the same one on both
downward passes, and at the top the same one as on a page loaded and left there. The road's ant, read back from the
road canvas by colour, is drawn on the same cells at each position on every pass, up included (on a phone, whose toolbar
moves its head between passes, the same shape around its head): it never turns to face the way the reader last
scrolled. Two more paths: a reader who leaves
at once (a case figure scrolled away mid-play and left 9 s is paused there and carries on when back, and the hero's
ant lands while the reader is away), and on a phone a deep dive whose `deep.js` arrives after its fonts, as on a slow
connection, which must lay out as one that loads fast. How far a figure has played and the road laid on the first
pass are the designed history and are left out. About 100 s per viewport; run it by viewport.
**Falsified** with `--root` on a copy of the pages before the fixes it came with: desktop 6,088 failures of
6 kinds (replay shown before the end, a frame lit on a scene not arrived, a scene held on its floor, one playing under
it, the road's ant at the top where the hero's belongs, a hero finished unseen); phone 6,601 of 11 (those, and the road
un-laid and lying differently once laid, docked blocks and layout that differ by pass, and inf-mem-deep 22,253 px tall
against 22,248 when its deep.js lands after its fonts). Every one passes after them. The hero ant's layout was
falsified alone, on a copy with every other fix in: the ant at the top was the road's on every pass of kronos-deep,
against the hero's on a page left there.

**`--fast`** runs selfchecks, notch advance and planting on desktop; all the work on desktop and phone; colours, font sizes,
inner scrollers and listeners on desktop and phone; overflow and errors on
desktop, phone and phone-small. It skips the hold sweeps,
pixels, handoff, settle and perf, so a green `--fast` is not a green run.

**Hooks.** The page exposes `window.__walk`; [HOOKS.md](HOOKS.md) is the
contract the page implements. A missing hook FAILs with `hook missing: …`. It is
never skipped, and where a fallback exists the line still reports a
measurement.

### How it measures

Nothing is taken on the page's word where it can be read back:

- **Installed before the page's own script** (`add_init_script`):
  - Wrappers on `addEventListener`, on the `on*` handler properties and on every page-scroll API. These count listeners and page-initiated scrolls.
  - Wrappers on the canvas 2D context: `drawImage`, `fillRect`, `fillStyle`/`strokeStyle`, `putImageData`, gradient stops, `shadowBlur`, `filter`, `fillText`. Every blit, rectangle, colour and text box is recorded as it happens.
  - The suite's own scrolls go through saved originals, so they never count against the page.
- **Pink in the chaos:** world cells, through `cellTok`/`cellAt`, never canvas pixels, so the ant's halo is never a lit cell. A world cell counts when its drawn cell is on screen showing that cell's token; cells under the strip, the caption row or a label are not seen and not counted. At least 95% of lit cells are trail-family, or vivid cells the ant itself lit: until the lock resolves, the one ant's older chaos cells show the `--v-*` hue of the epoch that lit them. At every hold the ant's own cells carry no vivid token.
- **Pink at a hold:** a visual share. A screenshot of the whole viewport (canvas, DOM and native layers together) is read back in the page, and pixels within 16 per channel of `#ff3d81` are counted; they may be at most 1.5% of its area. The ant's head trail counts, and so does a figure's own `--trail`: nothing is exempt. The `--trail` share of the ant's lit cells is printed beside it as a diagnostic only, since it rises as figures resolve into native layers while the pink on screen does not.
- **Pixels:** the handoff finds the canvas ant as the only `#ffffff` pixels, read back with `getImageData`.
- **Phone text:** the art band is screenshotted three times: as is, with native figure text made transparent, and with all DOM and SVG text made transparent. The last two differ only by DOM text other than the native layers, and that must be zero. The first two differ by the native layers' own labels, which must lie inside their layer's box. Text under the opaque band does not count.
- **Reading zone at a hold:** the card being read is the one stuck at its sticky top, not the one with the most overlap.
- **Native figure layers** (HOOKS.md) are found by `data-native` or their module's root class. Colours, sizes, the phone text test and clipping all include them.
- **Station playback:** a station's clock may run only while its figure is in frame (the share of its box in the art region, from `figVis`, at least 0.2 once running) and its own layer is on screen. `playwalk` logs every frame of a visitor at a normal pace (110px every 120ms, top to the map) twice: stopping 1.5s at each hold's start, every station plays from p 0 to done at p 1; never stopping, p never advances on a frame when the figure was out of frame (that frame and the one before, since the suite's poll and the page's frame may run in either order) and never runs ahead of its own clock (more than its fastest key segment allows in the time since the last frame, + 50ms and 0.005), so nothing snaps to its end. `playthrough` flicks past every station, then visits each hold: a paused clock resumes where it stopped and finishes. `playreplay` also clicks each card's replay button 1, 3, 6 and 10 notches past its hold, wherever the button is still on screen and not under the strip or a phone's art band: in every frame the clock advances, the station is the scene and the current figure, at least half in frame, with its native layer on screen inside `figure().art`.
- **Path-free:** `pathfree` plays every station, then reaches each state edge, each station just past its build edge, a chapter-I frame, the pull-back, the map's edge and a phone's rests from above and from below at a reading pace, after a reading-pace oscillation, by a jump and fresh; and wherever a station is built and undimmed (just built, and at its dim edge) also by a flick (400px notches every 40ms) up from the page's foot and by an oscillation of flicks (y+1500, y−1500, y+900, y−600, y) that crosses the station's dim and build edges within a frame or two, so a dim clip is landed mid-way. Settled screenshots at one y differ by at most 24 CSS px, and at every capture each station's cells, read back from the world bitmap (`stationInk().tone`), are all in their own tokens before its dim edge and all one token down past it: a figure left part stepped down shows on no other hook.
- **Colour at a hold:** `vivid` reads a screenshot of the whole viewport at every hold sample. Pixels within 16 per channel of any `--v-*` token inside the art region may be at most half of the figure's own ink, every non-ground pixel inside `figure().cells` (its native box included).
- **Colours:**
  - Every rendered element's computed colours, including `::before`/`::after`, borders, outlines and SVG shapes, resolved to sRGB by painting them.
  - Every colour literal in the CSSOM, which catches `:hover`, `:focus` and media variants that are not on screen.
  - `:root` must define all 19 tokens: the 13 spec tokens and the six `--v-*` vivid tokens.
- **Resize:** in its own context, the viewport is resized at a transit, at two points of every hold and in the résumé (desktop to 1024×768, 1440×700 and back; a phone rotated to 844×390 and back). The scene after must be the scene before at the same fraction through it (within 0.04), and the résumé line first under the strip must stay within 24px. A resize may scroll the page once to get there; every other page-initiated scroll still needs a click.
- **On its side:** `landcards` checks each held card sits in the text column clear of the art box, and is whole when it fits the viewport. `figclip` exempts the ant only where the figure itself fills the art box (custos at 740×360), and prints it.
- **Perf:** `requestAnimationFrame` callbacks and scroll handlers are timed in-page under `Emulation.setCPUThrottlingRate {rate: 4}`, summed per frame, and the p95 is taken over one wheel run from the top to the bottom. Three runs per viewport, each in a fresh context; the verdict is the median p95, at most 2.3ms (the perf budget, which prices in the vivid colour layer; the spec's own target is 1ms, which the page does not meet). The page's own `stats()` is printed beside it as a cross-check, never used as the verdict. The frames that cost most are station build and dim clips, where a station's cells are rebuilt and its native layer redrawn every frame.
- **Self-checks:** answers known outside the page are compared with `got`, not with the page's `want`:
  - NAND `1,1,1,0`
  - EM `14,7,2,0`
  - KRONOS max drawdown −18.70%
  - LOCK, recomputed in Python from the ant's rule: 9976, offset (−2, +2) per 104 steps

### Spec conflicts the suite surfaced

1. **settle vs τ.** The motion spec's "a 600px jump settles within 1px by 600ms" cannot hold with τ = 100ms alone: the residue is 600·e^(−6) = 1.49px at 600ms. Resolved in the page: the shown position lands on the target once it is within 2 CSS px. The suite keeps the spec's numbers and measures 0.00px at 615ms.
2. **cardband vs pull-back.** "No card-free band across the whole page" cannot hold through the pull-back (7.80 to 8.50), which has no card by design. The suite checks s 0 to `PULL` and prints the exempt length.
3. **Key listeners vs the KRONOS handle.** "Zero key listeners" and "arrow keys move the handle" are only compatible if the handle is a native `<input type="range">`. HOOKS.md says so.
4. **Handoff size.** The bookend square is 8 CSS px, while the canvas ant at map fit pitch is a few device px. "Registered within 1 device px" is therefore measured centre to centre, and both sizes are printed.
5. **The pink cap at a hold.** A cap on the `--trail` share of lit cells could not hold: the ant's last 312 steps are about 48 lit `--trail` cells, which was 23% to 43% of the cells on screen at a desktop hold and up to 100% on a phone, because a figure's cells leave the census once it resolves into a native layer. Resolved: the cap is a visual share of the viewport (1.5%, everything pink counted), which measures 0.56% desktop and 0.84% phone at the worst hold, KRONOS's drawdown row.
6. **Transit length vs the card in the zone.** The spec's transit rule clears card k−1 before card k sticks, but not card k below the fold: with the longest transit 0.51 screen, card k sat in the zone for up to 68% of a hold. Lengthening every transit past the fold costs about 16 notches, against a 105-notch budget already met exactly. First resolved with a 240ms fade, which spec T11 forbids. Now resolved by length, under the 140-notch budget: transit k is at least (viewport − card top)/S + 0.05, so card k rises natively from below the fold once the figure before it has dimmed, and no card fades. `rise` checks it and `holdzone` still does; `cardband` lets two frames run per sample so it reads the page's scroll-driven state rather than the state before the scroll.
7. **Whip-pan transits.** A transit sized only by the cards moved the art 400 to 530 CSS px per 100px notch. Resolved: T = max(T_MIN, (prevH + 64)/S, 0.75·D/S, fold), D the pose-centre distance in CSS px; smootherstep peaks at 1.875× its mean speed, so the art moves at most 250 CSS px per notch. `pan` measures it on drawn frames at 1440, 1280 and 1024 wide. On a wide screen the move may start after the transit does: the card ahead lets go as early as `cardband` allows (the next card's top enters the zone as its foot leaves it), and the camera holds the station until then, but never past the point that leaves 0.8·D/S for the move (a margin under the 0.75 the bound needs), so a figure does not slide away beside a card still stuck in the zone and the per-notch bound still holds. The camera waits only when the card lets go within 90px of the hold end: on a taller screen a short card lets go hundreds of px later, and waiting for it froze the screen for several notches (1920×1080: frames 130px apart identical; 2560×1440: 4 notches) before the move ran at the cap, so there the camera sets off at the hold end. `pan` covers 1920×1080 and 1024×1366 too, and `deadscroll` checks that every 100px of a transit changes the frame.
8. **Card line order.** The spec sets the phrase line in `--ink` above the description. Each card instead leads with its plain description in `--ink` and sets the phrase under it in `--body`, so the first line a reader meets says what the project is. `phrases` reads `.card .np` wherever it sits.

### Falsification

Every assertion is made to fail on purpose against a throwaway copy of the page, one mutation per copy;
an assertion the page fails is first fixed in a copy, shown to pass, then broken again.

| assertion | mutation | expected | measured |
|---|---|---|---|
| listeners | passive `wheel` listener on window | FAIL | 1 listener (passive still counts) |
| listeners | `document.onkeydown = f` | FAIL | 1 listener, via the property |
| landing | `sceneId` returns landing on s 5.000–5.001 | FAIL | 1 of 29,972 samples, at 5.0005 |
| monotonic | `stepAt` drops 50 steps mid-hold | FAIL | rendered step decreased 4× |
| notches | `preventDefault` on wheel for y 3000–3400 | FAIL | 369 stalls, first at notch 32 |
| scrollto | `scrollTo` inside the scroll handler | FAIL | 1 call during `scroll` |
| scrollbars | `.lk{max-height:10px;overflow:auto}` | FAIL | 1 inner scroller, `p.lk` |
| overflow | hero line pushed 1300px right | FAIL | 197px horizontal scroll, 1 text box past the edge |
| cardband | freeflow card block 0.6 screen shorter | FAIL | 0.19 screen gap from s 6.25 |
| station | `built()` reports freeflow during KRONOS | FAIL | 3 of 12 samples disagree |
| figclip | phone station pitch 7 → 12 for KRONOS | FAIL | cells 81px outside the art box |
| selfchecks | NAND got `1,1,1,1` / LOCK got 9977 | FAIL | both caught against outside answers |
| pitch | `pp` left unrounded | FAIL | blits at scale 3.002, 3.011… |
| errors | a `null.x` in a timer | FAIL | 1 page error |
| perf | 1.5ms busy loop per render | FAIL | p95 2.60ms (baseline 0.90ms); single run at the old 1ms budget, since replaced by the three-run median (last table) |
| phonetext | map labels hidden (baseline) | PASS | 0 px |
| phonetext | + `#step` moved into the art band | FAIL | 18,238 px |
| fontsizes | DOM labels 12 → 11 (baseline) | PASS | sizes 11, 13, 15, 40, 72 |
| fontsizes | + titles 41px | FAIL | 41px ×20 |
| colours | tokens on `:root`, wire → copper (baseline) | PASS | 0 off-token |
| colours | + `#e8e6f1` text / pink link / off-token `:hover` | FAIL | caught as computed, DOM pink and CSSOM literal respectively |
| fills | palette recoloured onto tokens (baseline) | PASS | 7 styles, 9 bitmap values, all tokens |
| fills | + stroke `#8a87a1` / + `shadowBlur` on the ant | FAIL | 1 off-token / 568 glow uses |
| pink | recoloured palette | chaos ≥ 95% | chaos 97.8% |
| pink | + sediment `#4a1a35` | chaos FAIL | chaos 31.9% |
| pink | + road aged / + every figure cell `--trail` | (holds) | measured a cell-share hold cap since replaced by the visual share (last table) |
| settle | τ 100 → 60 | PASS | 0.03px (τ = 100 measures 1.27px) |
| handoff | synthetic page, square on the ant (baseline) | PASS | 0.00 device px (re-run on the current suite) |
| handoff | square 1px right / canvas keeps drawing the ant | FAIL | 2.00 device px / "still drawn" (re-run on the current suite) |
| length | not mutated | n/a | a threshold on the notch count; the count itself is printed with the result |

The reading-zone, census and native-layer changes were falsified against
the built page, one mutation or injected layer per copy. Every row was re-run
on the current page and suite.

| assertion | mutation | expected | measured |
|---|---|---|---|
| station | `cards()` swaps the freeflow and KRONOS ids | FAIL | 6 of 12 samples, the stuck card disagrees |
| pink | `cellTok` renamed | FAIL | `hook missing: __walk.cellTok() is absent` |
| pink | dated trails drawn in `--ink` | FAIL | chaos 81.1% |
| fills | the ant drawn `#fffffe` | FAIL | 338 uses |
| colours | native label in `--ink` and `--trail` (baseline) | PASS | 0 off-token, 3 `--trail` uses as unresolved |
| colours | + a native label in `--trail-2` | FAIL | 1 pink use in DOM |
| fontsizes | native label at 12px | FAIL | `12px x3 (native …)` |
| phonetext | native label set below its layer's box | FAIL | 485 px outside the box |
| phonetext | stray DOM text / stray SVG text in the band | FAIL | 1,130 / 1,020 px per frame |
| figclip | native label 40px above its layer | FAIL | 32px outside the art box |

The visual pink share and the three-run perf median, against the built page
(same runner and log):

| assertion | mutation | expected | measured |
|---|---|---|---|
| pink | none (baseline) | PASS | holds max 0.57%, KRONOS's drawdown row and the head trail |
| pink | a fixed 100×100 `--trail` square | PASS | 1.34%: exactly 40,000 device px more |
| pink | a fixed 200×200 `--trail` square | FAIL | 3.66%: exactly 160,000 device px more |
| pink | every ant cell `--trail` | FAIL desktop | 1.87% desktop; on a phone 1.22%, under the cap, so the phone run passes |
| pink | every figure cell `--trail` | FAIL | 3.74% (figure pink is not exempt) |
| perf | 0.6ms busy loop per render, phone | FAIL | median p95 1.90ms of 1.90, 1.90, 1.90 (baseline 1.30ms) |

The checks added after those runs, and every row above that no runner had logged, were run again on the
current suite: against the page as built with one exact replacement, or against the page as it stood before
the fix a row names.

| assertion | mutation | expected | measured |
|---|---|---|---|
| holdzone | the page before the card gate (each next card always at opacity 1) | FAIL | 13 of 30 desktop samples, worst KRONOS 392px beside freeflow; the lock showed emergence |
| cardband | the freeflow card never ungated | FAIL | 0.84 screen card-free band from s 4.32 |
| figclip | the page before phone stations framed the ant | FAIL | ant not drawn: 9 problems over 12 held frames at 390, 12 of 12 at 360 |
| landing | the old 0.12-screen landing | FAIL | 160 landing samples after s 0.04 |
| planting | the page before the bounded visitor ant (up to 6 live ants, 20,000 steps each, kept past the landing) | FAIL | ants 1, 2, 3, 4, 5 after five clicks; 5,237 visitor cells at s 0.20 desktop, 4,399 phone |
| work | `#work .k-nm{color:#e8e6f1}`, one step off `--ink` | FAIL | colour rgb(232, 230, 241) on `h3.k-nm` |
| work | `:root{--t-llm:#b77ff2}` | FAIL | --t-llm is set on :root |
| check-panels | `section#work` renamed (`--static --offline`) | ABORT | work rows came back empty |
| caption | the old custos instruction, its lines cut to two as the caption drawer used to | FAIL | 9 of 12 at 360px; custos drew 'top: what the agent said. below: what it ran. pink: the log' |
| errors | the old custos instruction, against the drawer's overflow report | FAIL | 1 console error: caption needs 3 lines at 360px |
| targets | a 20×14 link added to the hero links line | FAIL | `a r 20x14` |
| targets | `.place` without its 24px minimum | FAIL | 8 place buttons 20px tall at the map |
| tabreach | the page with the KRONOS switch inside the native layer | FAIL | `fk-in never reached` in 90 presses |
| tabreach | the index without its skip link (c6a7144) | FAIL | the first stop is `a.jump`, not the skip link; the Tab after it lands on `button.k-blob`, not in the story |
| tabreach | the map's places waiting on the dissolve for a keyboard focus as for a scroll | FAIL | `button.place` 'jump to 2023, IEEE IPCCC, …' still at opacity 0 250ms after its Tab, desktop |
| tabreach | the skip link `position:absolute` at the top of the document, and every hash outranking a saved place | FAIL | mid-story Tab and Shift+Tab from the strip each move the page 6099 → 0; a reload at 6099 after the skip link (#story) comes back at 0 |
| tabreach | a takeover that sets the KRONOS clock back without swapping a phone's view | FAIL | phone: `parked at a reader's pace: input.fk-in.park in scene kronos` |
| maplabels | the tally kept beside the caption's first line at 320 px | FAIL | the caption row's `mc-t` and `egg-tally` overlap by 8×14 at phone-320 |
| maplabels | the map's places in one column of 32 px rows on every short screen | FAIL | at zoom-200 'KRONOS' and 'custos-code' are cut by the viewport, at zoom-200-1366 and zoom-200-1280 'freeflow' and 'KRONOS' too |
| overflow | the index before its under-360 rules (c6a7144), phone-320 | FAIL | 34px horizontal scroll, 10 text boxes past the edge (the strip's jump links, a map place, the step count) |
| cases | the work pages before their under-360 rules (c6a7144), phone-320 and zoom-400 | FAIL | all 11 pages scroll sideways at 320 (325 to 354 > 320), the 5 deep dives at 360×225 (412 to 532 > 360) |
| swaps | the page with the phone views scrubbed by scroll | FAIL | 116 of 300 settled frames not one whole view, cells under the layer up to 0.238 |
| cardfit | the page before the KRONOS card turned pages | FAIL | 412px against a 323px band at 360×740, and not sticky |
| cardfit | the page before every card fit (db1a9ba) | FAIL | custos 332px against 323 at 360×740 and 275 at 360×640, emergence 296px against 288 at 375×667; custos showed its note line at all four sizes |
| cardfit | the phone card rule removed (phrase and proof at 15/24, the note line shown) | FAIL | the same heights as db1a9ba: emergence and custos over at 375×667 and 360×640 |
| cardfit | the custos short layout never chosen | FAIL | the custos layer 12px out of its art box at 375×667, 18px at 360×640 |
| zoomrest | the pull-back dissolve scrubbed by scroll again (`ch.r` from `mapMix(s) / 0.02`) | FAIL | custos rests at resolve level 0.9999 at ZOOM+0.004 and 0.9888 at ZOOM+0.020 |
| zoomrest | + the blooms no longer wait for the cells | FAIL | 1,024 vivid device px within 48px of the native layer at ZOOM+0.004 |
| trlabels | the page before the two-line phone label for the 2024 trail | FAIL | no label for Carbon Hack at s 1.34, 1.39 and 1.44 on a phone |
| resize | the resize handler without its scroll back | FAIL | desktop 12 of 30 kept, phone 9 of 20 (a rotation at emergence landed in KRONOS) |
| resize | the résumé line read at the resize event, not when idle | FAIL | phone 18 of 20; after a rotation the line was 632px off |
| figclip, landcards, caption | the page before the side-by-side layout, at 844×390 and 740×360 | FAIL | 21 and 22 clipping problems; every held card over the art; at 844×390 the caption ran into the figure's own numbers (caption at 740×360 passed) |
| quotes | the custos phrase with a straight apostrophe | FAIL | 1 straight quote |
| jumpfocus | the page before jumps moved focus (d1375a4) | FAIL | desktop and phone; on phone 16 of 18: Tab after 'résumé ↓' went 11005 → 2245, after 'jump to KRONOS' 5049 → 7730 |
| linknames | the page before the work links were named (a403e2f) | FAIL | 'repo →' shared by 9 hrefs, 'paper' by 2; 19 arrows read aloud |
| newtab | the page before every link opened a new tab (0b8d6d8) | FAIL | 398 of 398 off-page links; the résumé PDF link had `rel=noopener` only |
| newtab | the work list's built rows not copying the case-study link's `target` and `rel` | FAIL | 12 bad, every one a row the page builds (`work/kronos.html target=null`) |
| check-panels | IARIA's résumé bullet changed 2.6M+ to 9.9M+ (`--static`) | FAIL | '9.9M+' not in any line of resume.pdf; with its data-src removed too, 'undeclared figure' in the résumé region |
| stripname | the phone strip named against the strip, not the art band | FAIL | unnamed 0.03 screen after the name left view |
| pitch | at 1536×864 @1.25, `view()` reports pp + 0.5 | FAIL | non-integer at 334 of 334 samples; before pp was sampled at this viewport, the line read `0 of 0` and passed |
| poster.py | the poster before the map-frame render | FAIL | mean diff 10.09, 4.94% of pixels off by more than 48 |
| poster.py | one glyph added to the subline | FAIL | 0.0037% of pixels off by more than 48 (the limit is 0.002%) |
| poster.py | none (baseline) | PASS | mean diff 0.002, 0.001% off |
| poster.py | the grey poster (the map frame with no blooms), after the read-through render | FAIL | mean diff 13.33, 6.75% of pixels off by more than 48 |
| poster.py | none (read-through render, baseline) | PASS | mean diff 0.000, 0.000% off |

These checks are each run against a copy of the page without the fix they guard (transits sized by the
cards alone, cards fading in at the gate, the custos verdict at u 0.63), served with `--root`:

| assertion | mutation | expected | measured |
|---|---|---|---|
| pan | the page without the fix | FAIL | 530, 525 and 407 CSS px per notch at 1440, 1280 and 1024 (KRONOS); emergence 261 at 1440 |
| camstep | a head-following camera whose two caps are tested again on every frame | FAIL | 21 to 23 CSS px per 2px at 390x844, up to 33 at 375x667 and 38 at 360x640 (the page moves at most 3.9) |
| rise | the page without the fix | FAIL | 12 of 12 samples per viewport; the emergence card 533px above the fold at 1440 while the lock was held |
| firstnotch | the page without the fix | FAIL | custos 342 CSS px at 1440x900 against a 972 floor; at 390x844 it measured 326 against 247, so on a phone `custos` is the guard |
| custos | the page without the fix | FAIL | 'contradicted' 0.18 screen at 1440 and 0.16 at 390; the caption named pink 32 and 34 samples before the verdict |
| places | the page without the fix, at 360x740 DPR 1 | FAIL | 24 crossings from s 8.50: place row 1 over the custos card's meta and repo link; at DPR 2 the map pitch fits later and it passed, hence `phone-small-1x` |
| maplabels | the build before the map caption row and the station-label search | FAIL | caption row at opacity 0 on all six viewports; at 844x390 '2024 · Carbon Hack' overlaps 'emergence' by 17x3 px, at 740x360 three label pairs overlap |
| check-panels team_meta | the custos meta with 'September 2026 hackathon.' restored | FAIL | 'names the month September; cards carry no months' |

The playback checks (`play*`) each open fresh contexts, since the shared view has already scrolled through every
station. Each was run at 1440x900 against a copy with one rule of the station clock broken:

| assertion | mutation | expected | measured |
|---|---|---|---|
| playarrive | the first arrival goes straight to the end state | FAIL | all four: first frame `done` at p 1, no value inside (0, 1) |
| playbudget | the clock runs at 0.8x | FAIL | done at 7267, 6353, 8247 and 6614ms against 5936, 5200, 6700 and 5400 |
| playreverse | re-entering a hold from below restarts the clock | FAIL | all four `playing` from p 0 while wheeling up; 4978 to 20942px off the end state |
| playreplay | the replay button no longer resets the clock | FAIL | all four never playing after the click |
| playreduced | reduced motion runs the clock | FAIL | 73 of 73 frames `playing` after each arrival |

The station clock's rules (it runs only in frame, pauses instead of snapping, replays the real figure) and
the colour and work checks, each run at 1440x900 against a copy with one rule put back the way it was:

| assertion | mutation | expected | measured |
|---|---|---|---|
| playthrough | leaving mid-play snaps to the end (the old rule) | FAIL | all four `done` at p 1 after the flick, each by one frame that ran ahead of its clock (steps of 0.66 to 0.98) |
| playwalk | the same | FAIL | never stopping, all four `done`, each by one frame that ran ahead of its clock (steps of 0.14 to 0.69) |
| playreplay | replay resets the clock wherever the visitor is, with no jump back | FAIL | one notch past emergence's hold, 164 of 164 playing frames were not the station in frame as itself |
| vivid | the old bloom rule (a bloom grows on the way into its station and is whole halfway through the hold) | FAIL | 10.45x the figure's ink at custos s 8.65 (485,376 vivid against 46,448 ink device px); emergence 1.49x |
| work | every blob drawn at one size | FAIL | 338 to 343 cells for 4 to 7 projects: systems (7) no larger than verify (5) |
| work | the build before the section opened on its first theme at 1024px and wider | FAIL | at rest: pane rest, nothing pressed, no cards, no status; the picked theme pressed again went back to an empty column |
| work | the themes not picked filled in `--copper` with a rim of their hue | FAIL | at rest: verify, systems, play and data not in their own hue, and no ring on agents & LLMs |
| work | every theme wearing the ring, not only the picked one | FAIL | at rest: ring cells on all five (35 to 45 each), want only agents & LLMs |
| workland | (at 844x390) a tap keeps the scroll where it was, so the panel opens below the screen | FAIL | agents & LLMs: status at 488, first project ends 693 |
| pathfree | the old dim rule: a dim clip a later trigger lands mid-way keeps the level it reached (the page carries the `tone` hook) | FAIL | emergence just built, after the oscillation of flicks: desktop y 2753, 43 cells in full tone and 45 stepped down, 4487 px against the reading-pace arrival; phone y 2382, 35 and 37, 1869 px; no other path or position failed |
| depthpath | the road's ant drawn with its trail behind the last scroll direction (the old case.js) | FAIL | desktop 197 positions and phone 200 on 11 pages, one kind: going up the trail lies below the head on the rail, right of it on the strip |
| keyleave | the index before a focused card's exemption ended with its own figure (79be8d1) | FAIL | desktop and phone, all 4 cards: at the next station's hold the focused card had no mask, against `linear-gradient(transparent …` with nothing focused; on a phone opacity 1 against 0, so KRONOS's link row stood under custos's figure |
| placerows | the index before the second column cleared the first's widest label (79be8d1), at zoom-250 and zoom-200-1200 | FAIL | place 1 '2023, IEEE IPCCC, LLM in…' overlaps 'emergence', and a click at x 323 on its label's tail lands on emergence |
| placerows | the rows closed up to the foot without room for the focus ring (4f80167), at phone-320 and zoom-150 | FAIL | the focused last place's ring runs to y 571 on a 568 px screen and to 536 on 533 |
| placerows | the ring's room kept, but a row still hidden at the foot only once its box passes it, at zoom-400-236 | FAIL | 'order from chaos' shown with its ring running to y 238 on a 236 px screen (with the fix it is hidden: 3 of 8 places shown, not 4) |
| mapcapone | the frame loop stopping in the frame the places came in (9c46ff2), at phone-320 and zoom-250 | FAIL | under reduced motion #mapcap shows 'The whole walk.' and the canvas still draws it 16 px lower (y 302 and 169); with motion that copy passed, so the check runs both |
| slackfocus | fig 18's slider row removed and built again on every rebuild (the rest of the fix in) | FAIL | desktop (1440x900 to 360x225) and phone (390x844 to 844x390): focus on body after the rebuild, the value back to 2 from the reader's 1, ArrowRight left it at 2 |
| slackfocus | the page before the fix (1b8f0c6) | FAIL | the same on both viewports |
| deeplive | a rebuild leaving every live run (`respec` calling `leaveLive` first, the rest of the fix in) | FAIL | both viewports: sc-or, sc-sap and sc-gates live to still, sc-gates' toggles a1 b1 s1 to a0 b1 s1 |
| deeplive | the page before the fix (1b8f0c6) | FAIL | the same, and the slider -1 to 2, so the next clear ran '2 ticks late' |
| deepstep | the stepper without its focus hand-off (the rest of the fix in) | FAIL | desktop and phone: 153 of 153 walks left focus on body at the first or last step |
| deepstep | the page before the fix (1b8f0c6) | FAIL | 153 of 153, focus on body (read at once, before the engine's fix-up, it is still on the control just disabled) |
| deepcost | the page before the fix (1b8f0c6) | FAIL | the turn there and back runs 5.53x the script of four resizes that stay (6.02, 5.53, 5.22; 121.8 ms against 22.0); longest task 98 to 119 ms unthrottled, and at 4x throttle 319 to 428 ms against 164 to 202 with the fix |
| deepcost | each figure's runs and self-check redone on every rebuild (`keep` storing nothing, the rest of the fix in) | FAIL | 4.38x (4.38, 4.47, 4.16; 89.1 ms against 20.3), longest task 67 to 77 ms unthrottled |
| slackfocus, deeplive, deepstep, deepcost | none (the fix) | PASS | focus and setting kept, three runs live, 153 walks kept focus; 1.66x to 2.16x over four runs of three loads (35.0 to 39.8 ms against 17.9 to 22.4) |
| deepfit | none (the deep dives as built) | PASS | 36, 73 and 76 docked scenes at 375×667, 844×390 and 667×375; inf-mem's `s-results checks` listed for a decision (482px against 462, 302 against 281, 302 against 242), not held |
| deepfit | the deep dives before their short-screen subjects (inf-mem's s-idea and s-extract, KRONOS's sc-flow) | FAIL | land-se: `s-idea next 379>266`, `s-extract groq 413>266`, `s-extract check 277>266`, `sc-flow stages 299>242`; at 375×667 and 844×390 the only step over its band was the listed one, so those two views passed |
| deepfit | inf-mem's check rows with no padding (the listed step fits) | FAIL | all three views: `s-results checks fits now: take it out of DOCK_PENDING` |
| deepresize | none (the deep dives as built) | PASS | 79 scenes on 5 pages, 1280×800 to 640×400 and 667×375 to 375×667, from the top and mid-page: every one as a fresh load draws it; sc-gates' run and keyboard kept |
| deepresize | freeflow-deep before its rebuild | FAIL | 14 of 14 scenes at both views: every canvas 96px past its stage after 1280×800 to 640×400, 289px after 667×375 to 375×667 |
| deepresize | the rebuild keyed on `Deep.phone` (the 768px line), as emergence-deep's is | FAIL at phone-se | 14 scenes 289px past their stages after 667×375 to 375×667, which crosses no line; 1280×800 to 640×400 passed |
| deepresize | the reader's toggle not put back after the rebuild | FAIL | sc-gates `live` fresh, `still` moved, its toggle off, from the top and mid-page at both views |
| deepresize | the rebuild blurs the focused control | FAIL | `the keyboard left #sc-gates .sc-in button on the move (now on BODY)`, both views |
| deepresize | one draw after respec, not two (a label placed at its unwrapped width keeps the place it was moved to) | FAIL at phone-se | sc-agree's ladder row at x 22 against 60 on a fresh load, from the top and mid-page; 1280×800 to 640×400 passed |
| deepresize | freeflow's rebuild after `respec` stopped laying a scene out (the merge of the deep-dive lanes) | FAIL | 28 differ at both views: every freeflow canvas 96px past its stage after 1280×800 to 640×400, 289px after 667×375 to 375×667 |
| deepresize | a kept label measured at the width it was cut to (without the reset in freeflow's `lab`) | FAIL at phone | sc-loop's 'cut re-heard words' at x 13, 343 wide, against x 19, 337 on a fresh load after 844×390 to 390×844; at phone-se it fails on some runs (sc-agree and sc-loop from mid-page) |
| deepresize | custos-deep's audit rows set in its own resize listener (live24) | FAIL at phone | custos-code-deep sc-audit 80px tall against 96 on a fresh load after 844×390 to 390×844, from the top and mid-page: inside the resize event Chromium's turned phone still reports 844 and then 834 wide |
| skipmid | the skip link that only moved focus (d7392b8) | FAIL | desktop and phone: Enter left the page at mid-story, and Tab went back about three screens to NAND input A |
| skipmid | the plain #story link (live24) | FAIL | desktop and phone: the story's start, but with #story in the address, the hash a Safari reload lost the reader's place to |
| striptab | the work pages before the strip's links counted as in view (79be8d1) | FAIL | every page whose strip is sticky moved, a Tab at a time: desktop 11 of 11 (2400 → 1950 → 1500 → 1050), phone 11 of 11 (2400 → 1978 → 1556 → 1134), zoom-200 the 6 case studies (2400 → 2175 → 1950 → 1725); there the 5 deep dives, whose strip scrolls away, passed |
| docktab | the deep dives before a stuck stepper's controls dropped their foot margin (79be8d1) | FAIL | every stuck scene moved 23 to 24 px a Tab: phone 12 of 12, phone-se 27 of 27, zoom-200 45 of 45 (custos-code-deep#sc-tree 11117 → 11405 over 12 Tabs at 375×667) |
| forcedmarks | the work pages before the lx- marks and custos-code-deep's bars kept their colour or took a border in forced colours (79be8d1) | FAIL | every kind of mark lost marks, desktop 26 of 26 and phone 27 of 27 (ai-capabilities's hero key 0 of 3 painted and beat squares 0 of 4, custos-code-deep's scene bars 0 of 4); with forced colours off the probe saw every one |
| jumprest | the case studies before a jumped-to heading skipped its rise (79be8d1) | FAIL | desktop 23 of 24 rail jumps and phone 25 of 25 #link jumps rest at 40, want 56 |
| placerows | none (the index as built) | PASS | 8 of 8 places shown at phone-320, zoom-250, zoom-200-1200 and zoom-150, 4 of 8 at zoom-400-236, every ring whole on screen and none hidden that fits |
| placerows | the rows not moved up for the last whole row's focus ring (the shift line removed, the rest of the fix in) | FAIL | 7, 7 and 3 of 8 shown at phone-320, zoom-150 and zoom-400-236: custos-code hidden though its box [16,539,117,568] lies on the 320x568 screen ([16,503,121,533] on 853x533), 'order from chaos' though [16,211,248,235] lies on 360x236. Before the check listed such a row, the same removal on 6ebfc44 passed at phone-320 and zoom-150 with '7 of 8 places shown' |
| placerows | the index before a list that runs past the foot moved up for its last whole row's ring (6ebfc44) | FAIL at zoom-400-236 | 3 of 8 shown: 'order from chaos' hidden though its box [16,211,248,235] lies on the 360x236 screen (live24 shows 4); phone-320 and zoom-150 passed |
| placerows | live24 | FAIL | phone-320, zoom-150 and zoom-400-236 show every place that fits (8, 8 and 4 of 8), but the last one's ring is cut, to y 571 on 568, 536 on 533 and 238 on 236 |
| placerows | the hide rule back to a row's box alone (live24's `p.vb > VH + 0.5`, the rest of the fix in) | PASS | the rows now leave the last whole row's ring its room, so on these five views the ring term hides nothing (4 of 8 at zoom-400-236; the earlier zoom-400-236 row for this mutation measured the page before that). The term stays as a backstop |
| forcedmarks | the work pages before emergence's hero leader and clock slider, inf-mem's step mark, and custos-code-deep's judge gate and phone exit mark kept a colour or took the text colour in forced colours (6ebfc44) | FAIL | desktop 4 lost (judge gate, hero leader, hero clock slider, hero step mark: 0 of 1 painted each), phone 5 (those and custos-code-deep's question exit mark); live24 desktop lost all 30 kinds |
| forcedmarks | the same tip with no contrast floor (`FORCED_MIN` 1.0, so any changed byte counts) | FAIL, one short | desktop 3 lost: the hero leader counted as painted, because its fill, forced to Canvas over the hero canvas's own void, still changes bytes at 1.07:1 |
| forcedctl | the work pages before their range inputs, inf-mem-deep's checkbox and custos-code-deep's fig 1 marks took the text or highlight colour in forced colours (6ebfc44) | FAIL | desktop and phone 14 lost: no range drawn on emergence (1), emergence-deep (3), inf-mem-deep (9) or kronos-deep (4), in dark or light; inf-mem-deep's checkbox the same checked and unchecked; fig 1's error outline and flagged claim the same off and on (the error outlined from the first step); live24 desktop the same 14 |
| forcedctl | the fixed pages with only custos-code-deep's fig 1 block taken out | FAIL | desktop 4 lost: the error outline and the flagged claim, dark and light. The first runs read the fixed outline as lost too: a scene scrolled to sets its own step within 50 ms, so the attribute set for the off shot was already back on; the check now waits 600 ms and refuses a shot whose attribute the page changed |
| forcedctl | fig 1's forced block and its error outline's on rule both taken out, so the outline never shows | FAIL | desktop: 'fig 1 error outline, off against on: the probe sees 0 of 1 with forced colours off', with the flagged claim lost in dark and light. Before the check refused a control that sees no change, the outline's row passed silently (the control counted 0, so 0 of 0 lost) |
| labelover | none (the deep dives as built) | PASS | phone and desktop: 5 deep dives, 402 steps, none of the 2141 (phone) or 2207 (desktop) words placed lies over another |
| labelover | freeflow's lab() placing a wrapped label at its unwrapped width (afa13b4: the kept width cleared, the row placed, then wrapped) | FAIL at phone | freeflow-deep sc-agree step 6: '2.10 s' over 'The Coyote is a li' 5x16, the row moved in from 60 px to 37 px; desktop passed |
| labelover | live24 | FAIL at phone | freeflow-deep sc-agree steps 1-5: 'typed so far' over 'pass at 1.05 s' (and each later pass) 99x16 |
| deepstep | the stepper handing the keyboard to its other button at an end (6ebfc44) | FAIL | desktop: 139 of 139 walks; six more Enters at an end walk the figure to the other end and back (custos-code-deep sc-gap from the first step: 1/4 next, 2/4 next, 3/4 next, 4/4 previous, 3/4, 2/4, 1/4) |
| deepstep | none (prev and next at their ends off by aria-disabled, still focusable) | PASS | desktop: 153 walks, the keyboard on the button pressed at every end, and six more presses move neither the step nor the keyboard |
| replaykey | the deep dives before a replay pressed from the keyboard stayed drawn (6ebfc44) | FAIL | desktop and phone, 5 of 5 deep dives: Enter on replay plays the scene and leaves the keyboard on body, replay hidden |
| replaykey | replay kept drawn while focused by any means (`:focus` for `:focus-visible`) | FAIL | desktop, 5 of 5: a click leaves replay drawn while the scene plays |
| stagetab | the deep dives before the stage controls' top margin and text-field padding (6ebfc44) | PASS | phone 88, zoom-200 92 and land 92 landings, every ring whole: Chromium brings a control in whole already; the defects are WebKit's and Firefox's (engines.py `stage-tab`) |
| stagetab | the stage controls' top margin set to 0 | FAIL | phone: 21 of 88 landings rest at 56..88, their rings cut by the road bar (sc-ladder from 8 px under) |
| deepreveal | the deep dives before reveal kept the whole subject in view (6ebfc44) | FAIL | land-se: inf-mem s-extract check, whole -60..217, kept part 167..217, band 20..286: 197 of 266 px of the whole shown, the candidate chips above the screen |
| deepreveal | reveal's placement of the whole taken out, the rest of the fix in | FAIL | the same: 197 of 266 px |
| deepreveal | none (the deep dives as built) | PASS | land-se: 5 steps keep a narrower part; s-extract check whole 10..286 (266 of 266 px), groq 266 of 266, s-idea next 234 of 234 possible (its kept title sits above the whole), sc-rec wall 282 of 282; phone-se 1 step, land none |

Harness defects found by the first runs of these, and fixed: the shot a third of the way in waited for the page to
settle, which under a clock means the end, so custos read 0px apart; the done time was read by the same loop that
paused for that shot, so custos read 389ms late; and after the replay click the pointer rested on the button, whose
hover colour put every replay 140px off. Also: the frame poll and the page's own frame run in either order, so an
advance is out of frame only when two frames in a row were; a replay button under a phone's art band is not on screen,
so it is hit-tested, not just boxed; and a snap from 0.85 to the end was smaller than any fixed per-frame cap, so the
check is the clock's own fastest segment over the time since the last frame.
The first flick paths in `pathfree` landed at each station's build edge, just short of it, where the station is not
yet built, so the part-dimmed figure was never drawn there and the copy above passed (0 px); they now land just past
the build edge, and at the dim edge, where the station is drawn and undimmed.

Harness defects found this way and fixed:

- **An SVG root's default `fill`** read as an off-token colour. Only shapes and text are checked now.
- **The pink census counted pixels.** Antialiased canvas labels first read as non-trail cells (72.7% on a correctly coloured chaos). Then the halo, which tints empty cells, read as lit ones (53.2%). It now counts world cells (100.0%).
- **The colour resolver's own canvas** was recorded as page fills, so `fills` failed whenever `colours` ran first. The resolver's canvas is now ignored.
- **A cached frame was taken for the page's position.** `phonetext` and `settle` could screenshot or measure wherever the previous check had left the page. They now scroll to the sample. Native labels went unseen until this was fixed.
- **SVG text was not hidden** in the phone text diff, so SVG text in the art band passed unseen.
- **A held frame was taken before its station had finished.** `frame_at` settled for at most 2.5s, but a jump into a hold builds the station and runs its clock for up to 3.5s, so at 360×740 emergence's register tape moved between `phonetext`'s three shots and read as 7,171 to 9,355 px of DOM text. It settles for up to 4s now; 0 px.

## engines.py

contract.py drives headless Chromium only. Each check here reproduces one
defect that shows only in WebKit (Safari) or Firefox, in the engine it shows
in, and fails if it comes back. An engine that will not launch exits 2: a check
that did not run is not a pass.

### Falsification

Each row reverts its fix in a copy of the site and runs the check against it.

| check | mutation | expected | measured |
|---|---|---|---|
| rotate | the index before the landscape query was read afresh at each layout and footprint() refused an empty box (79be8d1) | FAIL | 2 page errors 'Requested length is negative'; on its side 10035 px tall with a 203 px art band against a fresh load's 9622 and 390; upright again 13408 and 844 against 10933 and 439; the art frozen at step 15577 after a scroll to freeflow |
| rotate | the landscape query kept as one MediaQueryList, with the footprint and frame-loop guards in (4385950) | FAIL | 0 page errors and the art still drawn, but on its side 10035 px tall with a 203 px art band against 9622 and 390, and upright again 13408 and 844 against 10933 and 439 |
| skipreload | the index before the skip link stopped writing #story (79be8d1) | FAIL | read on to s 6.72 with `#story` in the address, the reload came back at s 0.00 |
| blobring | the index before the Firefox-only scroll margin on the theme blobs (d3be409) | FAIL | at 1280x800 llm and verify reached at y 620..828 and systems at 720..960 on an 800 px screen; at 640x400 systems at 196..436, play and data at 330..522 on 400; `scroll-margin-block:24px` for every engine left the same cuts |
| ffresize | none (freeflow-deep as built) | PASS | 3 moves, every scene as a fresh load draws it, the toggle live and focused |
| ffresize | freeflow-deep before its rebuild | FAIL | 42 scenes differ: canvases 96px past their stages at 640×400 in WebKit and Firefox, 289px at 375×667 in WebKit |
| ffresize | the rebuild keyed on `Deep.phone` (the 768px line) | FAIL | WebKit, 667×375 to 375×667: 14 scenes 289px past their stages |
| ffresize | the reader's toggle not put back after the rebuild | FAIL | sc-gates' toggle and labels differ in all 3 moves |
| ffresize | the rebuild blurs the focused control | FAIL | the keyboard left the sc-gates toggle in all 3 moves |
| ffresize | one draw after respec, not two | PASS | not caught here, from the top in these engines; `deepresize` catches it in Chromium |
| strip-tab | the work pages before the strip's links counted as in view (79be8d1) | FAIL | Firefox 2400 → 2006 → 1612 → 1218 and WebKit 2400 → 2332 → 2264 → 2196, on kronos and kronos-deep alike |
| dock-tab | the deep dives before a stuck stepper's controls dropped their foot margin (79be8d1) | FAIL | WebKit custos-code-deep#sc-rec 5765 → 5919 over 7 Tabs; Firefox inf-mem-deep#s-idea 208 → 582 on the first |
| ff-case-foot | the case studies before the case-nav and deep-dive card margins (79be8d1, whose card margin lost to the 16 px rule every link has) | FAIL | rings cut: freeflow 390×844 previous and next 5 px; KRONOS's card 46 px at 375×667, 23 at 1280×720, 42 at 720×450; ai-capabilities 720×450 previous and next 2 px; KRONOS 1024×450 all three case-nav links 18 px |
| ff-card-back | the same | FAIL | the card's ring 25 px under the strip and road bar at 720×450 and 39 px at 1024×450, on all five case studies |
| jump-rest | the case studies before a jumped-to heading skipped its rise (79be8d1) | FAIL | WebKit click and fresh load at 40 of 56, Firefox click 40 of 56 (its fresh load already rested at 56) |
| ffresize | a kept label measured at the width it was cut to (`lab()` before 369d279) | FAIL | 4 moves, 1 bad: WebKit 844×390 to 390×844, sc-loop's labels differ; the other three moves pass |
| ffplace | none (freeflow-deep as built) | PASS | the reader's line moved +0, +0, +0 px in Firefox and +0, −5, +0 in WebKit (sc-gates, sc-agree, sc-type) |
| ffplace | freeflow-deep with the scenes above the screen built one per task after the relayout (6ebfc44) | FAIL | +71, +66, +136 px in both engines: Firefox and WebKit had stopped anchoring before those tasks ran |
| ffplace | the scenes on and above the screen built in the relayout in page order, not the largest height change first | FAIL | +39, +34, +104 px in Firefox, +34, +29, +99 in WebKit |
| replay-key | the deep dives before a replay pressed from the keyboard stayed drawn (6ebfc44) | FAIL | WebKit and Firefox, 10 of 10: Tab reaches replay, Enter plays the scene and leaves the keyboard on body, replay hidden |
| stage-tab | the deep dives before the stage controls' top margin and text-field padding (6ebfc44) | FAIL | WebKit: custos-code-deep sc-chain's field, part and wholly under the strip, rests at 49..81 under the road bar's 56; Firefox: sc-board's 10 check cards from 8 px under stay at 48..102 |
| stage-tab | the top margin from `--ctl-h` taken out | FAIL | Firefox only: the 10 sc-board cards at 48..102 |
| stage-tab | the text-field padding taken out | FAIL | WebKit only: sc-chain's field at 49..81 |

The first `ff-case-foot` run read the skip link, fixed over the strip, as cut 51 px by it; the cover now leaves out the
strip's own links and the skip link.

## csp.py

GitHub Pages sends no security headers, so each page carries its policy as a
`<meta http-equiv="Content-Security-Policy">`, the first element after
`<meta charset>` (a meta policy covers only what parses after it).
**Never edit the policy by hand.** After any edit to an inline `<script>`, run

```bash
python3 tests/csp.py --write          # regenerate every page's policy
python3 tests/csp.py --check          # exit 1 if any page's policy is missing, misplaced or not the generated one
.venv/bin/python tests/csp.py --check --browser   # also every page on a desktop and a phone, scrolled, every button clicked
```

A stale hash does not error anywhere visible: the browser just refuses to run
that script on the live site. `--check` compares each page's meta with the
policy generated from the page, character for character, so a missing hash, a
leftover one, an added `'unsafe-inline'` or a policy moved below a script all
fail. `--browser` serves the copy on 127.0.0.1, listens for
`securitypolicyviolation` and console errors, and also checks that the inline
scripts the browser ran hash to the ones the static parse found.

The policy, per page (`<hashes>` = that page's inline-script sha256s, 0 to 9):

```
default-src 'none'; script-src 'self' <hashes>; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self' data:; connect-src 'none'; media-src 'none';
object-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none';
base-uri 'none'; form-action 'none'
```

- **Scripts** run only from this origin or by hash: no `'unsafe-inline'`, no
  `'unsafe-eval'`, no inline handlers, no `javascript:` URLs. JSON data blocks
  (`application/json`, `application/ld+json`) are not run, so CSP does not
  apply to them; any other script type fails `--check` until csp.py knows it.
- **Styles stay `'unsafe-inline'`.** Hashing `<style>` blocks was measured and
  rejected: seven `<style>` elements are built at run time (index.html four,
  custos-code, freeflow, kronos one each), so their hashes need a browser to
  find; the suite's own injected styles (contract.py's text-hiding and
  `poster.py`'s `add_style_tag`) are blocked by a hash-only `style-src`, empty
  ones included, in Chromium; and the hundreds of `style=""` attributes need
  `style-src-attr 'unsafe-inline'` regardless. With `img-src` and `font-src`
  limited to `'self'` and `data:`, injected CSS cannot reach another origin
  either way.
- **What a meta policy cannot do:** `frame-ancestors`, `report-uri` and
  `sandbox` are ignored in a meta (Chromium logs `frame-ancestors` as a console
  error, which `errors` would catch), and nothing here can set `nosniff`,
  `Permissions-Policy` or HSTS. Those need a host that sends headers.
- `'self'` is all of `olivesz.github.io`, which also serves the account's other
  Pages sites; keep every one of them free of third-party script.
- **Test tools run under the policy too.** `connect-src 'none'` blocks a
  `fetch` of a `data:` URL, so contract.py decodes its screenshots through an
  `<img>` (`img-src` admits `data:`): with fetch, `pathfree` stopped on
  `TypeError: Failed to fetch`. The two decodes were compared byte for byte on
  eight index.html screenshots (1440×900 at DPR 2, 390×844 at DPR 3): 0 bytes
  differ. Injected `<style>` elements still work (`'unsafe-inline'`); a tool
  that injects a `<script>`, such as axe-core through `add_script_tag`, needs a
  context made with `bypass_csp=True`.
- **Referrer:** `<meta name="referrer" content="no-referrer">` follows the policy
  on every page; `--check` fails without it or with any other value. Nothing
  needs a Referer: every subresource is same-origin and every outbound link
  already has `rel="noreferrer"` (contract `newtab`), so this changes nothing a
  visitor sends today and holds if a link ever loses its `rel`. If GitHub's
  traffic page should one day credit visits to the portfolio, the links' `rel`
  and this value change together.

**Falsified** on throwaway copies: one space added to a kronos.html inline
script, `'unsafe-inline'` added to index.html's `script-src`, the policy moved
below `<title>`, the policy removed, and the referrer meta removed or set to
`unsafe-url` each fail `--check` (exit 1); `--write`
on the edited copy passes again. Under `--browser`, the stale hash, a planted
inline script, an `onerror` attribute and an unpkg.com script each fail with a
`securitypolicyviolation` (script-src-elem inline, script-src-attr,
script-src-elem for the URL), on desktop and phone. The tree as committed
(13 pages with 404.html): 26 loads, 0 violations, 0 errors, and the browser's
inline scripts hash to the static parse's on every page. Under the policy the
contract's `--fast`, and `cases`, `deep`, `depth` and `pathfree` on each of
their viewports, all pass.

## check-security.py

```bash
.venv/bin/python tests/check-security.py                 # the tree as tracked; exit 1 on any FAIL
.venv/bin/python tests/check-security.py --history       # also every blob, commit message and identity reachable from origin/main
.venv/bin/python tests/check-security.py --history HEAD  # the same for a branch before it is pushed
.venv/bin/python tests/check-security.py --selftest      # every rule against its planted controls, in a throwaway copy
```

Run it before every push, beside check-claims, and run `--history HEAD` before
pushing a branch whose commits are not yet public. The deployed site has no
dependencies, so there is no advisory feed to watch: the risk is a regression,
and each rule fails on one kind of it. Exit 0 is clean, 1 is a FAIL, and 2
means a rule could not look (no poppler, no Playwright, or the private profile
unreadable): a check that did not run is never a pass.

| rule | fails when |
|---|---|
| csp | a page's policy is missing, not first after `<meta charset>`, or not exactly what `csp.py` generates (it calls `csp.check_page`) |
| referrer | a page lacks exactly one `<meta name="referrer" content="no-referrer">` |
| origins | anything the browser loads (script, img/srcset, source, media, link stylesheet/preload/icon/manifest, SVG `use`/`image`, a `background` attribute, `<a ping>`, CSS `url()` and `image-set()`, `@import`, a script setting `.src` or a `src`/`href` attribute) comes from another origin, each URL read as a browser reads it (tabs and newlines dropped, `\` taken as `/`, so `\\host` and `/\host` leave); only `<a>` links may leave |
| handlers | an `on*=` attribute in markup, in HTML a script builds (quoted attributes before it included), or through `setAttribute` or `setAttributeNS` with `on…` in any case |
| jsurl | a `javascript:`, `vbscript:` or `data:text/html` URL in any attribute, script or stylesheet |
| newtab | a target that opens another browsing context (`_blank` or a named window) without `rel` noopener and noreferrer, in markup, set by a script (`.target` or `setAttribute`) or in HTML a script builds |
| tags | a form, iframe, frame, object, embed, base, portal or meta refresh, or a script that builds one or a `<script>` (`createElement` or `createElementNS`) |
| js | eval, the Function constructor, document.write, a string timer, postMessage, localStorage, indexedDB, cookies, any network request, workers, dynamic import, window.open, other HTML sinks (outerHTML, srcdoc, DOMParser), a referrer, window.name, baseURI or navigation read, a browser global read by a computed name (`window['…']`, `location['…']`); or a read of `location.hash/search/pathname`, `sessionStorage` or a performance entry (`getEntries…`) beyond the ones traced to a non-HTML use (`SOURCES_ALLOWED`) |
| secrets | an API key, token, private key, JWT, credentialed URL or password assignment (18 patterns) in any tracked file (read again with character references such as `&#64;` decoded), a PDF's text and Info values, a JPEG's bytes, a decoded `data:` URI, or a font's or icon's bytes |
| pii | the phone number (read at run time through check-claims' private profile, never printed), the private repository's name, a private retired claim (check-claims' gitignored patterns: employer-internal names and figures), an email address other than the published one and the commit identity, a street address or an SSN-shaped number, in the same places but fonts and icons |
| pdftext | a public retired claim (check-claims' unscoped `RETIRED` patterns) in a PDF's text: check-claims skips PDFs, so this replaces the manual `pdftotext` read before a push |
| paths | a local home, temp or `file:` path in the same places as pii (custos-code's fixture checkout `/home/dev/` is the figure's subject and allowed) |
| metadata | a JPEG segment other than JFIF and ICC (EXIF, XMP, comments, trailing bytes), a PNG text or time chunk, any PDF Info key set but Creator, Producer, the two dates, Trapped and pdfTeX's banner (a title, author or custom key fails; the allowed values are still read by the text rules), a PDF XMP stream, JavaScript or form, or an SVG with metadata, comments, editor data, scripts, handlers or off-origin references |
| svgpdf | `resume-page.svg` draws anything `resume.pdf` does not: both rendered at 144 dpi (Chromium, pdftoppm), every 8×8 block's mean grey within 48 of 255. The SVG is glyph outlines, unreadable as text, so this is what lets the PDF's text check stand for it |

Planted values (fake tokens, the phone number, paths) are assembled at run
time, so the file never matches itself, and personal values are reported only
by kind. `--history` defaults to `origin/main`, which is what is public: 384
blobs and 24 commits on 2026-11-01. Run it on the commit about to be pushed,
not on a branch tip that carries unpublished history.

**Falsified** by `--selftest`, which copies the tracked files to a temporary
directory, requires the clean copy to pass every rule, then plants 114
violations one at a time (each rule at least once: 3 csp, 2 referrer, 13
origins, 7 handlers, 2 jsurl, 8 newtab, 6 tags, 24 js, 22 secrets, 10 pii, 1
pdftext, 7 paths, 8 metadata, 1 svgpdf) and requires each to add a failure the clean copy
does not have, then requires the copy to pass again. It then makes the copy a
git repository and requires `--history HEAD` to report a token committed and
deleted again, the phone number in a message, a local path in a message, a
foreign identity and a private retired claim in a file deleted again. The
private patterns cannot be planted without writing one down, so the self-test
adds one made-up pattern to them for its run: that proves they reach pages, PDF
text and history; what each real pattern matches is check-claims' own controls. A copy of the gate with `newtab` emptied fails the self-test
on all six newtab controls and names the rule as uncovered (exit 1); one that
skips decoding character references fails on the four controls written as
references (exit 1), and one whose createElement pattern drops `createElementNS`
fails on the SVG script control (exit 1). With the earlier patterns for built HTML, a handler on
the line after its tag's name in a template literal and a built link whose
first target is `_blank` and second `_self` both went unreported; a browser
reads the first as a handler and keeps the first target, and both controls now
fail.

The svgpdf threshold was measured: on the tree as committed the worst block
differs by 29 (anti-aliasing), one 7pt letter added to the SVG reaches 73, and
a 9pt phone-shaped line 101, while counting single pixels instead of blocks
differed on 25,609 of 1.94M pixels with nothing planted. A line of light grey
(#c8c8c8) text at 7pt or 10pt reaches only 31 to 33, and counting only blocks
the SVG draws darker gives the same 29 clean, so no limit separates it from
anti-aliasing: the limit stays 48 and that shape is not caught. Neither is a
bare `name` (window.name through the global): no pattern tells it from a local
or a parameter called `name`, which index.html's scripts have.

## check-claims.py

`RETIRED` is a list of (pattern, note) pairs, matched case-insensitively
against every tracked file except check-claims.py itself. Each note says what
not to state and which source governs instead. A third element, a tuple of
globs, scopes a pattern to the files a claim can appear in: the retired KRONOS
Sharpe and drawdown are matched only in `index.html`, `work/kronos*.html` and
`README.md`, because freeflow's three passes rightly take 1.05 s. **Falsified**:
without the scope the freeflow deep dive and its script fail three times; with it,
"Sharpe 1.05" planted in `work/kronos-deep.html` still fails.

An SVG is read as its text content plus its `aria-label`, `title`, `alt` and link attributes, never its path data:
resume-page.svg is resume.pdf's glyphs as outlines, and the retired KRONOS Sharpe turns up 44 times in its
curves as coordinates. That Sharpe planted in a `<text>` or an `aria-label` fails.

- **To retire a phrasing,** add its pattern with a note naming the governing source.
- **Patterns that would disclose something are never written here.** An employer's internal names and figures, and a private repository's name or internals, are read at run time from the gitignored `.private/retired.json`, with control strings none of them may match. The run FAILS if that file is unreadable, malformed or empty, and those patterns are matched against check-claims.py itself.
- **Personal data is never written here.** The phone check reads the private profile through the gitignored `.private/profile.json` link at run time. The run FAILS if that link is unreadable. That check scans check-claims.py too: the patterns may quote themselves there, personal data may not.

The patterns cover, by kind (check-claims scans this file as well, so it does
not quote them):

- copy that explains the page to its reader, or narrates the art;
- a second KRONOS Sharpe or drawdown beside the table's, so one number has one version per page;
- employer-internal names, counts and spend, and private repositories' names and internals (from the private file);
- an award line for the IARIA GREEN paper, which is listed as coauthored only;
- citation counts, and descriptions that the governing README does not support.

**Falsified** in a throwaway git repo with the profile link in place:

- a clean file passes;
- the award phrase fails in title case, in capitals and split across a line break;
- the phone number, written in a planted file at run time and never printed, fails as `<personal number>`;
- the same number appended to check-claims.py itself fails;
- the private repository's name, derived at run time, fails as `<private repo name>`;
- with the link removed, the run refuses to report clean.

The private patterns were falsified the same way: an internal name planted in README.md, an internal count appended to check-claims.py and a private repository's name appended to check-links.py each fail; with the private file removed, truncated or emptied, and with a control it matches, the run refuses to report clean.

Pattern controls also check what must *not* match: "21.05" and the drawdown figure without a minus.

## check-panels.py

**The work pages.** Every `work/*.html`, the six case studies and their five deep dives, is read as text with the
same rules: each `data-src` element in `<main>` must hold the figure its line holds, and every figure in prose and in
drawn SVG labels, outside navigation and furniture (contents rail, kickers, figure numbers, stepper, sources list,
case-nav, fact labels), must sit inside a `data-src`, `data-derived` (computed in the page from cited inputs, such as
scenarios counted by tag) or `data-live` (this visitor's random draw) element. Furniture inside a drawing:

- number-only labels that line up (same x or same y) as an evenly spaced run: seat numbers 1 … 9, axis ticks
  0 5 10 15 or 100 1,000 10,000. Cited labels count toward the run, so a '7' cited as the seat count completes 1 … 6;
- a lone 0 (a zero line), and counted items numbered from 1 ('1 Merlin' … '7 Minion');
- names that carry a number: `fig 5`, `arXiv 2605.29442`, `Player 3`, `seat 3`, `day 1`, `run 38482789778`, and
  digits glued to `=` or `@` (`rf=0`, `recall@5`).

A drawing's `<title>` and `<desc>` restate it for screen readers, so each of their figures must be shown by a cited
element, or be in a line a cited element cites, within the same drawing, else its `<figure>`, else its `<section>`.
A cited element that shows no figure and cites a recorded trace or results file (`.json`, `.csv`) is not held to share
a word with it; its figures still are. A step's `.sc-keys li` carries `data-at` as its tick, so `data-at` is ignored
on an element with `data-key`. Labels a script draws as a scene steps are not read.

This part is a ratchet: `WORK_KNOWN` holds each page's (not in its line, uncovered) counts, (0, 0) on all eleven, so
a page over either FAILS, a page under is told to lower them, and a page not listed must be clean.

**Falsified** on copies of the pages, one mutation each, all FAIL and the restored copy passes: on
`work/kronos.html`, a sentence with an uncited 42% added to the prose, the fig 5 description's Japan index drawdown
changed from −32.7% to −31.7% (both drawings), a drawn label 'Japan' changed to 'Japan, 12 names', and the cited
−15.6% label changed to −16.6%; on `work/freeflow.html`, the CI-cited 55 changed to 56 (which also leaves the fig 3
description's 55 unbacked); on `work/ai-capabilities.html`, the seat header's 6 changed to 9, which breaks the run.
Earlier, on the deep dives: a cited 41 changed to 47 in `work/kronos-deep.html`, the same 41 with its `data-src`
removed, and an unlisted copy of the freeflow deep dive each fail.

**What it reads.** It reads `index.html` as text:

- the FACTS block
- every `data-src` element
- four regions: cards, work highlights and more-rows (`li.k-card`, `li.k-mrow` in `section#work`), `instruction:` strings, and the label keys (`label`, `labels`, `short`, `phoneLabel(s)`, `caption(s)`)

It then renders the page in headless Chromium, with Playwright from `.venv`, and
reads the text of every native figure layer at eight points of each station's
hold, on a desktop and a phone viewport. That is the fifth region. `--static`
skips the render and prints that the native labels went unread.

The markup it keys on is in [HOOKS.md](HOOKS.md).

**How it checks.**

- **Sources.** A repo line is fetched read-only with `gh api` at its pinned SHA and cached in `.srccache/` at the repo root, which git ignores. A publication with no repo line may cite its page on doi.org, thinkmind.org or crossref, and an award its awarding body's own post on greensoftware.foundation, fetched read-only with GET and cached. A résumé line cites `public_resume.tex#Ln` and is read against the tracked `resume.pdf` with `pdftotext`. `page:<what>` marks a figure the page computes, which contract.py's self-checks verify. A CI run, `https://github.com/Olivesz/<repo>/actions/runs/<id>`, is read as the logs of all its jobs, fetched read-only with `gh api` and cached in `.srccache/_ci/`; its element carries `data-at`, the log's own words for the figure (`Executed 55 tests`, `stream WER 0.143`). GitHub keeps run logs for a limited time, so a run that can no longer be read fails until its figure is re-cited. `--offline` reads only the cache.
- **Matching.** The figure must appear in what it cites, after normalising minus signs, ×, thousands separators and number words. Magnitude is kept: `2.6M+` matches "more than 2.6 million" and nothing smaller. On a publication page the figure must sit within 200 characters of its context word. `at`/`data-at` covers a source that spells the number differently (−0.179 for −17.9%). An element with no figure must share a content word with its source (by stem, so 'claims' matches 'claim' and 'important' matches 'importance'), a number word ('two' against '**two primitives**'), or a word of the cited file's name ('ww_cells.py'); an element with only dates must find them there; an element with no text (a canvas the page draws) has nothing to compare.
- **Coverage.** Every figure in a region must be covered: in the DOM by an enclosing `data-src`, in a script string by a FACTS entry whose `v` matches and whose `ctx` word is in the same string. Number words from three up count as figures.
- **Team and role.** The custos card's meta line must state the team size and role that the custos entry states in `resume.pdf` and in the page's résumé block ('team of 3' against '3-person', 'Led', 'designed the core engine'). A missing meta, a different size or role, or 'Coded'/'Owned' in the meta fails. Falsified with each of those, and with the PDF's lines altered.
- **What it refuses.** It reads no repo outside Olivesz, no web host outside the publication hosts, and no branch name in place of a SHA. It fails on a private source, because a reader can't check it.
- **Abort.** It exits 2 if any region is empty, including when no native figure layer showed text at any held sample.

**Falsified** against a fixture page citing real lines (run with `--static`):

- the clean fixture passes, online and offline;
- each of these fails:
  - a changed figure
  - an unwrapped figure
  - a figure citing a line without it
  - an instruction figure without a FACTS entry
  - a `ctx` word that is absent
  - a FACTS entry citing the wrong line
  - an `at` that is not in the line
  - an `Olivesz`-foreign owner, refused before any request
  - a branch ref
- each of these aborts: a renamed index section, no instruction strings, a renamed FACTS block, no cards.

And against copies of the built page, one mutation each:

- these fail:
  - the publication figure as `2.6K+` or `3.6M+`
  - its context word changed
  - a publication link on a host outside the list
  - "Nine variants" changed to "Eight"
  - the GPA changed
  - a résumé date changed
  - an index phrase citing an unrelated line
  - a figure added to a `caption:` string
  - a figure added to a `short:` string
  - the Carbon Hack figure cited on a host outside the list (`greensoftware.example`)
  - that figure changed from 18 to 17 against the awarding body's post
  - "Five test programs" unwrapped, or citing the line above the one that says five
- with a synthetic native layer:
  - unwrapped figures in its labels fail;
  - a label citing the right line passes;
  - the same label citing a line without its figure fails;
  - the page with no native layer aborts.

The first fixture run also caught a real malformed `data-src`: zsh expands `$SHA:cpu` with its `:c` modifier. Write `${SHA}` in shell.

## check-links.py

Its allow-list holds only this repository. A public repository named in the
copy but never linked is a warning; private repositories are never named in it.
The profile repository is named after the account, which every github.com/Olivesz
link spells out, so it is not counted as named. `--net` fetches each href as the
browser resolves it (`&amp;` is `&`), six at a time, and retries a 5xx once,
serially: GitHub answers a few blob-line links 503 under load.

It reads `index.html` and every `work/*.html`, skipping script text. Every
relative href or src must resolve to a file in the checkout, and every
`#fragment` to an `id` in its target. Self-site URLs (canonical, og:url,
og:image under olivesz.github.io/portfolio/) map to files and are never
fetched, because a new page's canonical 404s until it deploys. Coverage: every
`work/*.html` is linked from `index.html`, every `work/` link there has a page,
and `sitemap.xml`'s `work/` entries are exactly the pages. Every page carries one link preview: og:title, og:description, og:url equal
to its canonical, a self-site `.jpg` og:image with alt text, the same image and alt for X,
and `summary_large_image`; no two pages share a card. **Falsified** on the
heads before the cards (`og:image:alt`, `twitter:image` missing) and with two
pages pointed at one card. The
public-but-unlinked warning reads `index.html` only. **Falsified** on a copy with
a missing stylesheet, a missing `#id`, a dead canonical and an unlinked,
unlisted page: each failed, and the copy's missing poster.jpg and
resume-page.svg failed too.

The deep dives (`work/*-deep.html`) are case studies to every guard here, so
each must be linked from `index.html` and listed in `sitemap.xml`; each also
pairs with its case study, which must link it, and must link back. **Falsified**
with the KRONOS case study's two deep-dive links pointed at itself.

The case studies' and deep dives' design contract is `contract.py`'s `cases` assertion: errors,
requests off the origin, the two fonts from `work/assets`, tokens, DOM sizes,
overflow, listeners, link names, targets, the hero's end state and every
self-check a page exposes. **Falsified** on a copy with the custos-code page's
old `L1`/`L3` source links, `case.css` without its inline-link padding and a
planted `console.error`: 8 failures, each one planted.

**Falsified** with copies of the page beside a copy of the guard, by the runner and
log named under contract.py: the freeflow links
pointed elsewhere warns that freeflow is named but never linked, and a link to a
repository that does not exist fails `--net` with a 404.

**404.html** is the page GitHub Pages serves at any missing path under
`/portfolio/`, so a relative link on it would resolve against whatever path the
visitor mistyped. Every link on it must be written from the site root
(`/portfolio/...`) and resolve to a file (and `#id`) in the checkout; it must
carry `<meta name="robots" content="noindex">` and stay out of `sitemap.xml`;
a checkout without it fails. **Falsified** on copies: a relative `resume.pdf`
link, a missing stylesheet and `#id`, no `noindex`, and no 404.html each fail.
`csp.py --browser` serves the site under `/portfolio/`, as Pages does, so the
404 loads its stylesheet and fonts there.

It also reads `resume.pdf` with poppler: the text must carry github.com/Olivesz,
and `pdfinfo -url` must list a mailto, a linkedin and a github link (at least
three). Missing poppler fails. **Falsified** with `--resume-pdf` on b63a27d's PDF
(five failures: no github text, no links) and on main's (four: the text is there,
no links).

## check-drift.py

check-panels reads every figure at the SHA its `data-src` pins, so a page stays
true to the commit it cites while the repository moves on. A reader who follows
a repository link lands on the default branch, so the figures should be there
too. This guard asks GitHub for the HEAD of each cited repository
(`gh api repos/Olivesz/<repo>/commits/HEAD`, read-only) and reads every cited
file at HEAD.

```bash
python3 tests/check-drift.py                              # network: one HEAD per repository, then what changed since each pin
python3 tests/check-drift.py --offline                    # the HEADs and files the last run cached
python3 tests/check-drift.py --head kronos-quant=fcb1ed8  # read a repository at a fixed SHA instead of HEAD
python3 tests/check-drift.py --index COPY/index.html      # a copy of the site: the index and the work/ beside it
```

The network is the point here, so unlike check-links it uses it by default;
`--net` is accepted and changes nothing. Drift comes from the cited repositories
moving, not from commits here, so it runs before every push beside the other
guards, and again whenever a cited repository changes. Without `gh` auth or
network it aborts rather than passing. About 12 s with an empty cache, 2 to
4 s with a warm one, under 1 s with `--offline`.

**What it settles.**

- **Pins.** Every SHA the site pins (`data-src`, the FACTS block, and
  `github.com/Olivesz/<repo>/blob|tree|commit/<sha>` links) against HEAD:
  commits behind, and how many of the files cited at that pin changed since
  (GitHub's compare; `n/a` when its file list is capped at 300). A repository's
  most-cited SHA is its main pin; an older pin is dated, a figure from the
  repository's history such as a gate count at the time a bug was found.
- **Figures.** Each figure in a repo-cited `data-src` element, and each FACTS
  value, found with check-panels' rules (the same figure finder, normalising and
  `data-at`) in the cited file at HEAD:
  - *holds*: on the cited lines, or the file is unchanged since the pin;
  - *moved*: on another line of the file that shares a content word with the
    cited line, and the new line number is printed for the re-pin;
  - *gone*: on no such line, or the file no longer exists.

  The shared word carries weight: KRONOS's "35 experiments" (README L186 at
  c19c5ca) is 37 at fcb1ed8, and 35 still appears there on two lines about
  trading days. Without the word it would read as moved.
- **What fails.** A figure that is gone at HEAD, in any region of any page,
  when it is cited at the repository's main pin or a newer one: a reader who
  follows the link finds a different number. At a dated pin a gone figure fails
  only on a headline: the index cards (`article.card`), the FACTS block, each
  case study's result block (`section.lx-led`) and results section
  (`aria-labelledby="s-results"`), and each deep dive's results chapter
  (`section#ch-results`). A moved figure is a warning, printed by page and
  repository with its new line; drift at a dated pin is listed apart. A figure
  that is not on its cited line even at the pin is check-panels' failure; here
  it counts only when it is nowhere at HEAD either, such as an old figure
  re-pinned to HEAD unchanged.
- **Abort.** Exit 2 if the index has no cards or FACTS, no work page has a
  results region, nothing is pinned to a repository, no figure is left to read,
  or a repository's visibility, HEAD, comparison or file cannot be read: nothing
  cached with `--offline`, `gh` without auth or network, a `gh` call that times
  out (60 s), or no `gh` at all. A private or internal repository is listed and
  not read; one whose visibility cannot be read aborts, since skipping it would
  let a run that read nothing pass. Any other error prints `ABORT` and exits 2.

Files are cached at `.srccache/<repo>@<sha>/<path>`, check-panels' layout, so
the pinned files are usually there already; HEADs and comparisons go in
`.srccache/_drift/`.

**Falsified** on copies of the site, with `--head kronos-quant=fcb1ed8` so the
runs repeat after HEAD moves (exit in brackets):

- the index with FACTS `gates` re-read at fcb1ed8 (50, README L44-L46), beside
  the six work pages whose cited lines did not move, passes with nothing drifted
  [0];
- the same with the KRONOS case study and deep dive added, their headline 47
  and 35 re-read at fcb1ed8 (50; 37 at L193), fails on the six prose 47s still
  cited at c19c5ca, three on each page (README L44-L46 and L91 now say 50), with
  39 moved figures as warnings [1];
- FACTS `gates` back to 47 at c19c5ca fails on that entry alone [1]; 47 re-pinned
  to fcb1ed8 without its new value fails on that entry alone [1]; the case
  study keeping 35 experiments in its results section fails on that figure and
  its three prose 47s [1];
- a renamed FACTS block, and no work pages, each abort [2];
- an empty cache with `--offline`; `gh` with no auth (`GH_CONFIG_DIR` an empty
  directory, no `GH_TOKEN`) and an empty cache; no `gh` on the PATH, with the
  cache warm and with it empty; a HEAD call that times out; and an index that
  does not exist: each aborts [2] and names what it could not read.

On 2026-10-20 the tree as committed passed with kronos-quant read at its pin
c19c5ca [0] and failed against fcb1ed8 on ten figures: four headlines (FACTS
`gates` 47, the deep dive's 47, and 35 experiments on both KRONOS pages) and six
prose 47s [1]. With every KRONOS citation re-pinned to fcb1ed8 it passed, read
at fcb1ed8 and at HEAD 68de4e8, which changed none of the cited files, with
seven warnings, each a moved figure or a dated pin [0].
