# tests

One browser suite and three guards. The suite measures the page as rendered.
The guards read the files and their sources; check-panels also renders the page
once, to read the native figure layers' labels.

| command | what it settles | time |
|---|---|---|
| `.venv/bin/python tests/contract.py` | the scroll and design contract, in headless Chromium | about 23 min (load-sensitive) |
| `.venv/bin/python tests/contract.py --fast` | the subset a fix most often breaks, for use between edits | 45 s to 2.5 min (load-sensitive) |
| `python3 tests/check-claims.py` | no retired claim or personal data is in a tracked file | 1 s |
| `python3 tests/check-panels.py` | every figure on index.html and every work/*.html is in the source line it cites | about 45 s; the first run fetches |
| `python3 tests/check-links.py [--net]` | links on index.html and every work/*.html resolve (relative links, #fragments, self-site URLs), each case study is linked from index.html and listed in sitemap.xml, every page has its own link-preview card, repo visibility matches what the page says, and resume.pdf links its contacts | seconds |
| `.venv/bin/python tests/poster.py` | poster.jpg is a fresh render of its three lines beside the map after a full read-through, every bloom grown (`--render` writes it) | about 15 s |

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -q playwright
.venv/bin/python -m playwright install chromium   # skip if ~/Library/Caches/ms-playwright has the matching build
```

`.venv/` is gitignored. Run with `PYTHONDONTWRITEBYTECODE=1`, so a stale `.pyc` never runs old code.

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
| phone-se, phone-640 | 375×667, 360×640 | 2, touch | the KRONOS card fit |
| land, land-small | 844×390, 740×360 | 3 and 2, touch | a phone on its side: the words in a column beside the art |

Perf runs last, in its own contexts, at 4× CPU throttle, three times per viewport.

**The deep dives.** `deep` loads each `work/*-deep.html` and checks its steppers: every `figure.scene` became a
scene with a stepper; with motion (a fake clock) each scene, scrolled to, starts on its own and moves on a step, and a
square, next and prev move it; with reduced motion each rests and the stepper moves it; and by keyboard alone every
stepper control is a focusable native button, Space on the first square goes to step 1 and Enter on next goes to
step 2. `cases` covers their errors, requests off the origin, fonts, tokens and sizes. About two minutes for both
viewports; not in `--fast`.

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
  - KRONOS max drawdown −17.90%
  - LOCK, recomputed in Python from the ant's rule: 9976, offset (−2, +2) per 104 steps

### Spec conflicts the suite surfaced

1. **settle vs τ.** The motion spec's "a 600px jump settles within 1px by 600ms" cannot hold with τ = 100ms alone: the residue is 600·e^(−6) = 1.49px at 600ms. Resolved in the page: the shown position lands on the target once it is within 2 CSS px. The suite keeps the spec's numbers and measures 0.00px at 615ms.
2. **cardband vs pull-back.** "No card-free band across the whole page" cannot hold through the pull-back (7.80 to 8.50), which has no card by design. The suite checks s 0 to `PULL` and prints the exempt length.
3. **Key listeners vs the KRONOS handle.** "Zero key listeners" and "arrow keys move the handle" are only compatible if the handle is a native `<input type="range">`. HOOKS.md says so.
4. **Handoff size.** The bookend square is 8 CSS px, while the canvas ant at map fit pitch is a few device px. "Registered within 1 device px" is therefore measured centre to centre, and both sizes are printed.
5. **The pink cap at a hold.** A cap on the `--trail` share of lit cells could not hold: the ant's last 312 steps are about 48 lit `--trail` cells, which was 23% to 43% of the cells on screen at a desktop hold and up to 100% on a phone, because a figure's cells leave the census once it resolves into a native layer. Resolved: the cap is a visual share of the viewport (1.5%, everything pink counted), which measures 0.56% desktop and 0.84% phone at the worst hold, KRONOS's drawdown row.
6. **Transit length vs the card in the zone.** The spec's transit rule clears card k−1 before card k sticks, but not card k below the fold: with the longest transit 0.51 screen, card k sat in the zone for up to 68% of a hold. Lengthening every transit past the fold costs about 16 notches, against a 105-notch budget already met exactly. First resolved with a 240ms fade, which spec T11 forbids. Now resolved by length, under the 140-notch budget: transit k is at least (viewport − card top)/S + 0.05, so card k rises natively from below the fold once the figure before it has dimmed, and no card fades. `rise` checks it and `holdzone` still does; `cardband` lets two frames run per sample so it reads the page's scroll-driven state rather than the state before the scroll.
7. **Whip-pan transits.** A transit sized only by the cards moved the art 400 to 530 CSS px per 100px notch. Resolved: T = max(T_MIN, (prevH + 64)/S, 0.75·D/S, fold), D the pose-centre distance in CSS px; smootherstep peaks at 1.875× its mean speed, so the art moves at most 250 CSS px per notch. `pan` measures it on drawn frames at 1440, 1280 and 1024 wide.

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

Harness defects found by the first runs of these, and fixed: the shot a third of the way in waited for the page to
settle, which under a clock means the end, so custos read 0px apart; the done time was read by the same loop that
paused for that shot, so custos read 389ms late; and after the replay click the pointer rested on the button, whose
hover colour put every replay 140px off. Also: the frame poll and the page's own frame run in either order, so an
advance is out of frame only when two frames in a row were; a replay button under a phone's art band is not on screen,
so it is hit-tested, not just boxed; and a snap from 0.85 to the end was smaller than any fixed per-frame cap, so the
check is the clock's own fastest segment over the time since the last frame.

Harness defects found this way and fixed:

- **An SVG root's default `fill`** read as an off-token colour. Only shapes and text are checked now.
- **The pink census counted pixels.** Antialiased canvas labels first read as non-trail cells (72.7% on a correctly coloured chaos). Then the halo, which tints empty cells, read as lit ones (53.2%). It now counts world cells (100.0%).
- **The colour resolver's own canvas** was recorded as page fills, so `fills` failed whenever `colours` ran first. The resolver's canvas is now ignored.
- **A cached frame was taken for the page's position.** `phonetext` and `settle` could screenshot or measure wherever the previous check had left the page. They now scroll to the sample. Native labels went unseen until this was fixed.
- **SVG text was not hidden** in the phone text diff, so SVG text in the art band passed unseen.
- **A held frame was taken before its station had finished.** `frame_at` settled for at most 2.5s, but a jump into a hold builds the station and runs its clock for up to 3.5s, so at 360×740 emergence's register tape moved between `phonetext`'s three shots and read as 7,171 to 9,355 px of DOM text. It settles for up to 4s now; 0 px.

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

It also reads `resume.pdf` with poppler: the text must carry github.com/Olivesz,
and `pdfinfo -url` must list a mailto, a linkedin and a github link (at least
three). Missing poppler fails. **Falsified** with `--resume-pdf` on b63a27d's PDF
(five failures: no github text, no links) and on main's (four: the text is there,
no links).
