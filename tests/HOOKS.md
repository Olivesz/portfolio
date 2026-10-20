# Page hooks for `tests/contract.py`

The page exposes one read-only object, `window.__walk`, created synchronously
by the page script. Calling a hook never changes state and never draws. A
missing hook fails its assertion; it is never skipped.

Units: `s` is scroll position in screens (`scrollY / S()`). Pixel boxes are
CSS px in viewport coordinates, `[x0, y0, x1, y1]`, with `x1`/`y1` exclusive.

## Stable hooks (same names, same meaning)

| hook | type | contract |
|---|---|---|
| `sceneId(s)` | fn → string | `'landing'` if and only if `s < 0.03`. `'chaos'` for the chaos beat, `'lock'` for the lock beat. During chapter k's hold `[A_k, E_k)` it returns that chapter's id, the same id used in `stations` and `cards()`. `'pull-back'` on `[PULL, MAPS)`, `'map'` on `[MAPS, DOCS)`, `'document'` after that. Other values, such as transits, are free. |
| `stepAt(s)` | fn → int | The ant's step at `s`. Non-decreasing in `s`. On the landing it is the intro clock: 0 to 1,100 over 2.5 s after load, then on at a slowing walk to 1,380 by about 17 s (1,380 at once under reduced motion); the scroll walk goes on from wherever the clock stood at the first scroll, and from then on is a pure function of `s`. |
| `S()` | fn → px | One screen: the height of the fixed `100lvh` probe the page itself uses. |
| `stations` | array | `[[id, A, E], ...]` in page order. `A` is the hold start (the card reaches its sticky top) and `E` the hold end, in screens. An optional 4th element lists beat start positions: `[id, A, E, [b0, b1, ...]]`. |
| `view()` | fn → object | `{pp, k, half, dpr, step, Ox, Oy}` for the last drawn frame. `pp` is device px per drawn cell (an integer), `k` is world cells per drawn cell (1, or 2 when decimated), `step` is the step actually drawn, and `Ox`/`Oy` are the world origin in device px. |
| `mapFit()` | fn → object | `{p, half, bb}` |
| `marks()` | fn → array | The upright phone map's numbered tags in the last frame, each `{id, n, place, mark, tag}` with CSS-px boxes; empty when the map carries none. |
| `shown()` | fn → number | The smoothed `s` the canvas last drew. |
| `camAt(s)` | fn → array | `[cx, cy, pf]` |
| `reduced` | bool | `prefers-reduced-motion` at boot. |
| `drawn()` | fn → array | Canvas text drawn in the last frame, as `[text, x, y, alpha]`. |
| `instrAt(s)` | fn → string | The caption row's instruction for scroll position `s` (screens). The caption lines drawn below `figure().art`, joined with spaces, must equal it at every hold. |
| `caption()` | fn → object | The caption row as last drawn: `{text, who, kick}`. `text` is the instruction, `who` the station whose line it is (null for any other line or none), and `kick` the lead an upright phone draws ahead of the line (in the chapter's accent) while that chapter's card title is not on screen: the kicker and title, the title alone or the kicker alone, whichever first keeps the line to two rows; null when none fits or none is drawn. |
| `running()` | fn → bool | True while the rAF loop is alive. It must turn false once nothing moves, because the suite uses it to know a frame has settled. |
| `plants()` | fn → array | Visitor ants, `[{n, x, y, tok}]`; `tok` is the token name its cells draw in, one of the vivid hues other than red. At most one; it runs 500 steps and stops. Planting works only on the landing (s < 0.03). |
| `plantCells()` | fn → int | Visitor cells currently lit on the visitor layer. 0 once the visitor has left the landing. |
| `fading()` | fn → int | Retired visitor trails still dissolving (Bayer dropout over 240 ms). |
| `landing()` | fn → object | `{cue, left, pEnd, pOn}`: whether the scroll cue still runs, whether the visitor has left the landing, the step bound and the s where planting stops. |
| `stats()` | fn → array | Recent per-frame render times in ms. Informational: perf is measured independently. |
| `MAPS` | number | The map hold's start: the fit pitch is reached. |
| `DOCS` | number | The résumé block's top enters at the viewport bottom. |

## New

| hook | type | contract |
|---|---|---|
| `PULL` | number | The pull-back start, which is the last hold's end. |
| `canvas` | Element | The art canvas. Optional; it defaults to `canvas#world`. |
| `cards()` | fn → array | `[{id, el}]`: the hero as `'hero'`, then one entry per chapter with the station's id, in page order. `el` is the sticky element the reader sees. |
| `built()` | fn → string or null | The id of the station whose build clip has finished and which is current (not dimmed). Null in chaos and map, in a transit until its station builds (`on0`), and in the pull-back once its zoom starts (`ZOOM`); the last station stays built through the rest before it. |
| `figure()` | fn → object or null | Null when no station is current. Otherwise `{id, cells, art}`; `cells` is null while the current figure has drawn nothing yet (the suite then requires cells at another sample of the same hold). `cells` is the union box of every figure cell drawn in this frame, across all beats on screen, with labels excluded. `art` is the region where a cell draws at full density: inside the canvas clip, below the strip, above the caption row, and on desktop right of the dithered edge. |
| `selfChecks()` | fn → array | `[{id, ok, got, want}]`, computed at boot and stable after it. These ids are required, and their `got` is compared with answers the suite knows independently: `'nand'` → `[1,1,1,0]` (outputs for 00, 01, 10, 11, each read from the output cell); `'em'` → `[14,7,2,0]` (mismatched blocks after EM passes 1 to 4); `'kronos-dd'` → `-18.7` (max drawdown recomputed from the 54-quarter series, in percent, which must round to −18.70); `'lock'` → the LOCK computed in the page, which the suite recomputes from the rule itself (9976 for stepF as it stands). Other ids are allowed and must be `ok`. Any control owned by a check carries `data-check="<id>"`; when that check fails, no element with that attribute may remain. |
| `handoff()` | fn → object or null | `{el, s}`. `el` is the 8px DOM square that leads the bookend line. `s` is the scroll position, in screens, at which the canvas stops drawing the ant and the square carries it. `s` is null for the static fallback on narrow screens. |
| `resumeLast()` | fn → Element | The résumé page box (`#resume .rv-page`), whose bottom is the last line of the résumé. It sets the end of the notch count. The text copy beside it is 1px sr-only and is never the answer. |

## Station playback

Station beats play on a clock; scrolling never scrubs them. The `stations` hook's 4th element lists the arrival for
every beat, since beats no longer have scroll positions.

| hook | type | contract |
|---|---|---|
| `playback(id)` | fn → object or null | `{state, p, bi, t, ms, lead, seen, replay, live, vis}`. `state` is `'idle'` (never yet seen), `'playing'`, `'paused'` (it left the frame unfinished), `'done'` or `'held'` (an input took over). `p` is 0..1 across the station's beats; `bi` the beat shown; `t` ms on the clock (negative during the lead; the elapsed ms while paused; null otherwise); `ms` the clock's length and `lead` the build clip it waits for, so a playback finishes within `lead + ms` of the arrival. `seen` turns true once it has finished or been taken over; `replay` is whether the replay button shows. `live` is whether the clock may run this frame, `vis` the share of the figure's box inside the art region at the shown scroll position. |
| `replay(id)` | fn → bool | The one hook that acts: what the station's replay button does. False under reduced motion. Away from the station it scrolls (it is a click), so call it only where a click could. |
| `play()` | fn → object | The per-station table, `{id: {keys, ms, lead, hold, live, on0, vis}}`. `keys` are `[ms, p]` pairs, piecewise linear; `hold` is the hold's length in screens; `live` the `p` window per layout (`desk`, `phone`) in which the station's input is live; `on0` the scroll position, in screens, where the station builds; `vis` the in-frame share that starts its clock. |
| `figVis(id, s)` | fn → number | The share of station `id`'s figure box inside the art region at scroll position `s`, by the projection the frame draws with; 0 unless the camera is at the station pitch. |
| `ZOOM` | number | Where the pull-back's zoom starts: from `PULL` to here the camera rests on the last station while its card leaves. |
| `stationInk(id)` | fn → object or null | `{cells, labels, tone}` for the last drawn frame: `cells` is whether any of a cell figure's cells are drawn in the art region at the station pitch (always false for a native station), `labels` how many of its canvas labels were painted at alpha 0.5 or more. `tone` is `[full, down]`, read back from the world bitmap over the station's cells whose token has a step down (the road's own cells left out): how many are drawn in their own token and how many one token down. At rest it is all `full` before the station's dim edge and all `down` past it, never both. |
| `resolveLevel(id)` | fn → number or null | A native station's resolve level as last drawn: 1 its native layer, 0 its cells; between only while a clip runs (build, unbuild, or the 300ms pull-back dissolve that starts as the camera crosses `ZOOM` and reverses on the way back). Null for a cell figure. |

Rules the page keeps:

- A station builds once half of its figure box is inside the art region on the way in (`on0`, at most its arrival `A`, never
  before the station ahead of it has dimmed), so a visitor who stops just short of the card's sticky top already has it.
- Its clock runs only while the visitor can see it play: at least half of the figure's box in the art region to start or
  resume, a fifth to keep running, at the station pitch, and in its own medium (a native station's layer on screen; it
  shows from 416 ms into the build clip, so a native station's `lead` is 420 ms).
- The first time that holds, the clock starts from `p` 0. When it stops holding (the camera moves on, a later station
  takes the native layer, the pull-back shrinks it) the clock pauses; it resumes where it stopped on the way back.
  Nothing snaps to the end: a station is never shown finished unless its clock ran its full length in frame. A finished
  station shows its end state on any later visit.
- Replay always plays the real figure: clicked away from the station, the page first brings it back to where its card
  sits at its sticky top (one instant scroll inside the click), then the clock starts.
- Touching or focusing an input stops the clock at the end of its `live` window (`held`). Reduced motion shows the end
  state at once and hides replay. The loop stops once no clock runs.
- The last station stays current (built, undimmed and native) through the pull-back's rest, until `ZOOM`; there its
  layer dissolves into its cells on a 300ms clock (never scrubbed by scroll, reversed on the way back), and the map's
  blooms wait until it is all cells and the pitch has begun to drop.

## Cells

The chaos census counts world cells through these, never canvas pixels.

| hook | type | contract |
|---|---|---|
| `cellTok(x, y)` | fn → int | The token a world cell is drawn in this frame, as a 1-based index in the spec's order (`void`, `ant`, `trail`, `trail-2`, `trail-3`, `signal`, `signal-2`, `ink`, `copper`, `residue`, `body`, `muted`, `rule`); 0 for an empty cell; −1 outside the world. The suite finds the world's origin from where it starts returning −1. |
| `cellAt(x, y)` | fn → object or null | The main ant's own grid at a world cell: `{lit, stamp, tok}`. `lit` marks the ant's output; its `--trail` share at a hold is printed as a diagnostic. |
| `walkPos(t)` | fn → array | `[x, y]`, the ant's world cell at step `t`. |
| `cellRect(id, b, x, y)` | fn → array or null | The CSS-px box of beat-local cell `(x, y)` of chapter `id`, beat `b`, in the last drawn frame. Native layers are placed with it. |

## Native figure layers

A station's figure may resolve from cells into a layer in its own medium: DOM,
SVG or a second canvas over the station's cell box, placed with `cellRect`.

- **Marker:** the layer's root element carries `data-native="<station id>"`. The roots `.ff`, `.fk` and `.cx-fig` of the three figure modules are recognised as freeflow, KRONOS and custos too.
- **On screen** means the root has a layout box, `visibility: visible` and non-zero opacity. A layer hides itself outside its station's hold.
- **What the suite applies to it:**
  - colours: the token table, no alpha. `--trail` is allowed inside a layer, as 'unresolved'; `--trail-2` and `--trail-3` are not.
  - text sizes: `{72, 40, 15, 13, 11, 44, 30}` for DOM text, SVG text (as shown, through its screen transform) and text drawn on the layer's own canvas.
  - canvas: the same rules as the art canvas (whole device pixels, opaque tokens, no glow).
  - phone: the layer's labels may draw only inside the layer's own box; any other DOM text in the art band fails as before.
  - clipping: the layer and everything it draws stay inside `figure().art`. A layer on screen counts as its station's drawn figure, so `figure().cells` may be null once the cells have resolved into it. A layer from another station on screen during a hold fails.
  - sources: every figure in a layer's text sits inside an element with `data-src`. check-panels renders the page to read them.

## What the suite measures without asking

These are fixed by the spec, not by a hook. The suite reads them directly:

- **Reading zone:** desktop y 96 to h−40; phone from 52svh to h. A card or the hero must overlap it by at least 24px (one line) at every scroll position from 0 to `PULL`. The pull-back and the map hold are exempt.
- **The card being read during a hold** is the one stuck at its sticky top (its computed `top`: 96 on desktop, the phone band's top + 16 on a phone), not the one with the most overlap. A card that scrolls natively, because it is too tall for the phone text band, is never stuck; for it the overlap rule decides.
- **Pink:** in the chaos, world cells through `cellTok`/`cellAt`, counted where the drawn cell is on screen showing its own token; at least 95% of lit cells are trail-family, or vivid cells the ant itself lit (`cellAt().lit`) before the lock resolves. At a hold the ant's own cells carry no vivid token, and pink is a visual share: bright `--trail` pixels in a screenshot of the whole viewport (canvas, DOM and native layers together, the ant's head trail included) are at most 1.5% of its area. Nothing is exempt: a figure's own `--trail` counts as much as the road's.
- **Phone art band** for the text-pixel test: y 40 to 52svh−44. The caption row below it may hold the instruction line and the step counter. The test makes DOM and SVG text transparent and diffs screenshots, so text rendered under the opaque band does not count. A native layer's own labels are allowed inside that layer's box.
- **The canvas ant is the only `#ffffff` pixel** on the art canvas. The handoff test finds it by colour.
- **Tokens and sizes:** the colour table, `{72, 40, 15, 13, 11, 44, 30}` for DOM text and 11 or 13 for art-canvas text. `:root` must define all 19 tokens by their names (`--void` … `--rule`, then `--v-red` … `--v-violet`). Pink (`--trail` and the other two trail steps) may not appear in DOM colours, with two exceptions: the handoff square's halo `box-shadow`, which may use `--trail` at alpha, and `--trail` inside a native figure layer.
- **Canvas:** every `drawImage` onto an on-screen canvas lands at an integer device offset and an integer scale ≥ 1, with smoothing off when it scales. Every `fillRect` uses whole device pixels, whatever the transform. Every `fillStyle`/`strokeStyle` is an opaque token. Every `putImageData` value is a packed opaque token or `0`. Gradient stops may only be `--trail` (the halo). Any `shadowBlur > 0` or canvas `filter` fails.
- **Input:** no `wheel`, `touch*` or `key*` listener on any target, including `on*` properties and inline attributes. Keyboard control of the KRONOS handle therefore has to come from a native element (`<input type="range">`), never a `keydown` listener. Planting uses a passive `pointerdown` or a `click`.
- **Scrolling:** the page may call `scrollTo`, `scrollBy`, `scrollIntoView` or set `scrollTop` only inside a click handler,
  with two exceptions that put the visitor back where they were: once per resize or rotation (inside the `resize` event),
  and after a reload or a restored tab, once the page is laid out (and once more at load if a part laid out late),
  unless the visitor has scrolled since.

## Path-free (`pathfree`)

What a settled frame shows is a function of the scroll position. The suite reaches each state edge (a station's build
and dim, the lock, the map's pitch step), a chapter-I frame, the pull-back, the map's edge and a phone's rests between
stations, and each station just past its build edge, from above, from below, after a wheel oscillation, by a jump from
the top and fresh; and wherever a station is built and undimmed (just built, and at its dim edge) also by a flick (400px
notches every 40ms) up from the page's foot and by an oscillation of flicks that crosses the station's dim and build
edges within a frame or two. It compares settled screenshots (canvas, native layers and DOM together), and at every
capture each station's `stationInk().tone`. The page keeps it so:

- one threshold per state, never a band that remembers the direction: a station is built from `on0`, dimmed from its
  hold end + 0.05 (the last from `ZOOM`), the lock beat is `[2.00, 2.40)`, and the map's places, tags and caption show
  exactly where the camera's pitch is the fit pitch (and, upright, the last card is clear). The clips answer a wobble
  across a threshold.
- a clip that a later trigger lands, or that ends between two frames, leaves its state at the end it was going to:
  only one clip runs, so a dim level, a ring or a resolve level is never left part-way once no clip of that station
  runs. A station's cells at rest are all in their own tokens before its dim edge and all one token down past it.
- a label at rest takes the first side in its order that fits; it keeps its side only while the camera glides.
- a phone's rest frame is the next station's first frame as a fresh visitor meets it, whole in the band or not drawn.
- `running()` turns false at rest everywhere, the document included.
- a reload or a restored tab comes back to the same place (`placeAt`), as a resize does.

The designed history effects are excluded by name, never by tolerance: station playback (a finished station shows its end
state, a held input its state), the blooms a played station earns on the map, the visitor's planted ant, the hidden
ants, and the intro clock (the chaos runs on from wherever the landing's clock stood at the first scroll, so a fresh
load's chaos may run a few steps apart). The suite plays every station before it compares, and skips a fresh frame
only where a station it has not played is drawn.

## Contract read by `tests/check-panels.py`

check-panels reads `index.html` as text, and renders it once in headless
Chromium to read the native figure layers' labels.

1. **FACTS block:**

   ```html
   <script type="application/json" id="facts">{ "key": {"v": "1.07", "src": "kronos-quant@<sha>:README.md#L134", "ctx": "Sharpe"}, ... }</script>
   ```

   - `v` is the figure exactly as shown. `ctx` is the word that says what it counts.
   - `src` is one of:
     - `repo@sha:path#Ln` or `#Ln-Lm`. `repo` is an Olivesz repo, or `Olivesz/repo`. `sha` is a pinned hex SHA of at least 7 characters, never a branch name.
     - an `https://` publication page on doi.org, thinkmind.org or crossref, for a publication with no repo line. It is fetched read-only; the figure must sit within 200 characters of the `ctx` word.
     - `public_resume.tex#Ln`, the résumé's upstream line. It is checked against the text of the tracked `resume.pdf`, which is that source's public build: the figure must be in a PDF line that shares a word with the element.
     - `page:<what>` for a figure the page computes; contract.py's self-checks verify it.
   - When the source writes the number in another form (`-0.179` for −17.9%), add `"at": "-0.179"`. check-panels then checks that `at` is in the line and that it equals `v` at `v`'s precision.
2. **DOM figures:** any element with `data-src`, in the file or in a native layer. Every number in its text must appear in what it cites. Before comparing, minus signs, `×`/`x`, thousands separators and number words (five = 5) are normalised. Magnitude is kept: `2.6M+` matches `more than 2.6 million`, but not `2.6 thousand`. `data-at` works like `at` above. An element that shows no figure must share a content word with what it cites, and an element that shows only dates must find them there.
3. **Regions:** check-panels aborts if any of these is empty. Every figure found in them must be covered, either by an enclosing `data-src` element (DOM) or by a FACTS `v` whose `ctx` word is in the same string (script strings).
   - hero line: `<p class="rec">`, the record line under the name
   - cards: `<article … class="… card …">` elements
   - work highlights and more-rows: `<li class="k-card">` and `<li class="k-mrow">` inside `<section id="work">` (all the work: a project's line repeats in each theme it belongs to and in its own pane, each copy with the same `data-src`)
   - instruction lines: string literals that are the value of an `instruction:` key in the script
   - map, trail and figure labels: string literals that are the value of a `label:`, `labels:`, `short:`, `phoneLabel(s):` or `caption(s):` key (a string or an array of strings)
   - native figure labels: the text inside every native layer, read at eight points of each station's hold on a desktop and a phone viewport. `--static` skips the render and says so.

   Years, month-year dates, `’28`, and digits inside names (SAP-1, x86-64) are not figures. Number words from three up are figures. One and two are not, since they usually describe a mechanism ('two passes agree').

## All the work (markup the suite reads)

`contract.py work` drives the section through its own buttons and reads only this markup, so it is a contract too. The
known answers (taxonomy B, the tiers, each chapter's primary theme, the signature rule) are
restated in the suite, never read from the page:

| element | contract |
|---|---|
| `#work .k-field .k-blob[data-k]` | one native `<button aria-pressed aria-controls="k-panel">` per theme (`llm verify systems data play`), in the tab order. Its `.k-bs` SVG holds the blob's cells as `<path>` stages (`.k-hid` while hidden), its `.k-bn` lines name the theme's signature projects, and `.k-bm b` counts the rest. Only the cells take the pointer. Every blob's cells fill in its own hue (`--h`). A picked theme's blob is `aria-pressed="true"` and shows its `.k-rs` SVG, a ring of ink cells that never takes the pointer; the others carry `.off` and keep `.k-rs` hidden. |
| `#work .k-pane[data-pane]` | `rest` (a key, no projects), and one per theme key; the shown pane has `.cur`. At rest the shown pane is the first theme's (picked) where `.k-panel` sits beside `.k-field` (1024 px and wider), and `rest` where it sits under it. A theme pane holds `.k-hi .k-card[data-p]` (its signatures) and `.k-rest .k-mrow[data-p]` (every other member, shown). |
| `#work .k-msg`, `#work .k-ask` | the status line (hidden while no theme is picked), and the prompt (`.k-a1` pointer, `.k-a2` touch). |
| `window.__workGrow.state()` | `{picked, grown, growing, mode}`: read-only; the blobs grow once, the first time the field is in view. |

## Résumé viewer (markup the suite reads)

The résumé is `resume.pdf` shown as one page (`resume-page.svg`) in `#resume .rv-page`, with the PDF's text as an
sr-only copy in `#resume .rv-text`, derived from `pdftotext` and holding the `.cv-ent` entries check-panels counts.

| element | contract |
|---|---|
| `window.__resumeViewer` | read-only. `state()` → `'idle'`, `'play'` or `'done'`; `plays()` → how many times the intro has started (at most 1 per load); `ready()` → the page image has decoded; `reduced` → reduced motion is on (the page shows at once); `timeline()`; `box()` → the page box rect; `grid()`; `hues()` → the theme hue of each block; `zoom()` → `[zoomed, originX, originY]`; `size()` → the page box size in CSS px. |
| `#resume .rv-ctl` | `download pdf` and `open pdf →` links to `resume.pdf`, a native `<button class="rv-zbtn" aria-pressed>` for zoom, and `replay` (hidden under reduced motion). |
| `#resume .rv-hot` | the PDF's own links (email, LinkedIn, GitHub) as focusable hotspots over the page image. |


## Depth pages (work/*.html that opt into the lx- layer)

A work page opts in with `.lx-rail` / `.lx-bar` or a hero marked `[data-lx-arrive]`; `work/assets/case.js` then
exposes `window.__lx`, read-only. `depth` reads it on every page that opts in.

| hook | contract |
|---|---|
| `window.__lx` | `arrived()` → the hero ant has reached its corner (true at load under reduced motion); `ant()` → `'hero'` or `'road'`, whichever draws the one ant now; `road()` → `{maxR, maxB, wide}`, the furthest rail row or strip cell laid, never decreasing; `head()` → `{y, on}` of the hero ant's head cell; `reduce`. |
| `canvas.lx-arrive-cv`, `canvas.lx-road` | the only canvases that draw the ant: exactly one `--ant` cell between them on screen. The road's ant is a function of the reading position: its `--trail` and `--trail-2` cells lie behind its head along the road (above it on the rail, left of it on the strip) whichever way the reader came; `depthpath` reads them back from the road canvas on every pass. |
| `[data-lx-arrive].lit` | the hero frame's corners have taken the hue (the ant is in). |
| `[data-read]` | a deep dive's read time, written by deep.js; its case study quotes the same minutes. |
