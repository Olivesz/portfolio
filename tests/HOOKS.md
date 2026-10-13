# Page hooks for `tests/contract.py`

The page exposes one read-only object, `window.__walk`, created synchronously
by the page script. Calling a hook never changes state and never draws. A
missing hook fails its assertion; it is never skipped.

Units: `s` is scroll position in screens (`scrollY / S()`). Pixel boxes are
CSS px in viewport coordinates, `[x0, y0, x1, y1]`, with `x1`/`y1` exclusive.

## Kept from the earlier build (same names, same meaning)

| hook | type | contract |
|---|---|---|
| `sceneId(s)` | fn → string | `'landing'` if and only if `s < 0.03`. `'chaos'` for the chaos beat, `'lock'` for the lock beat. During chapter k's hold `[A_k, E_k)` it returns that chapter's id, the same id used in `stations` and `cards()`. `'pull-back'` on `[PULL, MAPS)`, `'map'` on `[MAPS, DOCS)`, `'document'` after that. Other values, such as transits, are free. |
| `stepAt(s)` | fn → int | The ant's step at `s`. Non-decreasing in `s`; 0 on the landing. |
| `S()` | fn → px | One screen: the height of the fixed `100lvh` probe the page itself uses. |
| `stations` | array | `[[id, A, E], ...]` in page order. `A` is the hold start (the card reaches its sticky top) and `E` the hold end, in screens. An optional 4th element lists beat start positions: `[id, A, E, [b0, b1, ...]]`. |
| `view()` | fn → object | `{pp, k, half, dpr, step, Ox, Oy}` for the last drawn frame. `pp` is device px per drawn cell (an integer), `k` is world cells per drawn cell (1, or 2 when decimated), `step` is the step actually drawn, and `Ox`/`Oy` are the world origin in device px. |
| `mapFit()` | fn → object | `{p, half, bb}` |
| `shown()` | fn → number | The smoothed `s` the canvas last drew. |
| `camAt(s)` | fn → array | `[cx, cy, pf]` |
| `reduced` | bool | `prefers-reduced-motion` at boot. |
| `drawn()` | fn → array | Canvas text drawn in the last frame, as `[text, x, y, alpha]`. |
| `instrAt(s)` | fn → string | The caption row's instruction for scroll position `s` (screens). The caption lines drawn below `figure().art`, joined with spaces, must equal it at every hold. |
| `running()` | fn → bool | True while the rAF loop is alive. It must turn false once nothing moves, because the suite uses it to know a frame has settled. |
| `plants()` | fn → array | Visitor ants, `[{n, x, y}]`. At most one; it runs 500 steps and stops. Planting works only on the landing (s < 0.03). |
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
| `built()` | fn → string or null | The id of the station whose build clip has finished and which is current (not dimmed). Null in transits, chaos, pull-back and map. |
| `figure()` | fn → object or null | Null when no station is current. Otherwise `{id, cells, art}`; `cells` is null while the current figure has drawn nothing yet (the suite then requires cells at another sample of the same hold). `cells` is the union box of every figure cell drawn in this frame, across all beats on screen, with labels excluded. `art` is the region where a cell draws at full density: inside the canvas clip, below the strip, above the caption row, and on desktop right of the dithered edge. |
| `selfChecks()` | fn → array | `[{id, ok, got, want}]`, computed at boot and stable after it. These ids are required, and their `got` is compared with answers the suite knows independently: `'nand'` → `[1,1,1,0]` (outputs for 00, 01, 10, 11, each read from the output cell); `'em'` → `[14,7,2,0]` (mismatched blocks after EM passes 1 to 4); `'kronos-dd'` → `-17.9` (max drawdown recomputed from the 54-quarter series, in percent, which must round to −17.90); `'lock'` → the LOCK computed in the page, which the suite recomputes from the rule itself (9976 for stepF as it stands). Other ids are allowed and must be `ok`. Any control owned by a check carries `data-check="<id>"`; when that check fails, no element with that attribute may remain. |
| `handoff()` | fn → object or null | `{el, s}`. `el` is the 8px DOM square that leads the bookend line. `s` is the scroll position, in screens, at which the canvas stops drawing the ant and the square carries it. `s` is null for the static fallback on narrow screens. |
| `resumeLast()` | fn → Element | The element holding the last line of the résumé. It sets the end of the notch count. |

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

These are fixed by the spec, not by a hook. Builders should know the suite
reads them directly:

- **Reading zone:** desktop y 96 to h−40; phone from 52svh to h. A card or the hero must overlap it by at least 24px (one line) at every scroll position from 0 to `PULL`. The pull-back and the map hold are exempt.
- **The card being read during a hold** is the one stuck at its sticky top (its computed `top`: 96 on desktop, the phone band's top + 16 on a phone), not the one with the most overlap. A card that scrolls natively, because it is too tall for the phone text band, is never stuck; for it the overlap rule decides.
- **Pink:** in the chaos, world cells through `cellTok`/`cellAt`, counted where the drawn cell is on screen showing its own token; at least 95% of lit cells are trail-family. At a hold, pink is a visual share: bright `--trail` pixels in a screenshot of the whole viewport (canvas, DOM and native layers together, the ant's head trail included) are at most 1.5% of its area. Nothing is exempt: a figure's own `--trail` counts as much as the road's.
- **Phone art band** for the text-pixel test: y 40 to 52svh−44. The caption row below it may hold the instruction line and the step counter. The test makes DOM and SVG text transparent and diffs screenshots, so text rendered under the opaque band does not count. A native layer's own labels are allowed inside that layer's box.
- **The canvas ant is the only `#ffffff` pixel** on the art canvas. The handoff test finds it by colour.
- **Tokens and sizes:** the colour table, `{72, 40, 15, 13, 11, 44, 30}` for DOM text and 11 or 13 for art-canvas text. `:root` must define all 13 tokens by their spec names (`--void` … `--rule`). Pink (`--trail` and the other two trail steps) may not appear in DOM colours, with two exceptions: the handoff square's halo `box-shadow`, which may use `--trail` at alpha, and `--trail` inside a native figure layer.
- **Canvas:** every `drawImage` onto an on-screen canvas lands at an integer device offset and an integer scale ≥ 1, with smoothing off when it scales. Every `fillRect` uses whole device pixels, whatever the transform. Every `fillStyle`/`strokeStyle` is an opaque token. Every `putImageData` value is a packed opaque token or `0`. Gradient stops may only be `--trail` (the halo). Any `shadowBlur > 0` or canvas `filter` fails.
- **Input:** no `wheel`, `touch*` or `key*` listener on any target, including `on*` properties and inline attributes. Keyboard control of the KRONOS handle therefore has to come from a native element (`<input type="range">`), never a `keydown` listener. Planting uses a passive `pointerdown` or a `click`.
- **Scrolling:** the page may call `scrollTo`, `scrollBy`, `scrollIntoView` or set `scrollTop` only inside a click handler.

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
   - work rows: `<li class="row">` inside `<section id="work">` (all the work: one row per project)
   - instruction lines: string literals that are the value of an `instruction:` key in the script
   - map, trail and figure labels: string literals that are the value of a `label:`, `labels:`, `short:`, `phoneLabel(s):` or `caption(s):` key (a string or an array of strings)
   - native figure labels: the text inside every native layer, read at eight points of each station's hold on a desktop and a phone viewport. `--static` skips the render and says so.

   Years, month-year dates, `’28`, and digits inside names (SAP-1, x86-64, IMC Prosperity 4) are not figures. Number words from three up are figures. One and two are not, since they usually describe a mechanism ('two passes agree').

## All the work (markup the suite reads)

`contract.py work` drives the section through its own buttons and reads only this markup, so it is a contract too:

| element | contract |
|---|---|
| `section#work[data-map]` | `data-map` is `wide` or `narrow`, the layout drawn now. |
| `#work .w-all`, `#work .w-t[data-k]`, `#work .w-p[data-p]` | native `<button aria-pressed>`: all, one per theme (`llm verify systems data play`), one per project marker. Each is in the tab order. |
| `#work .w-list .row#w-<id>[data-k]` | one row per project; `data-k` lists its themes; its `.c.on` cells are exactly those themes. A filtered-out row has no client rects. |
| `#work .w-msg` | the status line; a picked theme reads `N of 16 in …`. |
| `#work .w-cv` | the map canvas, drawn in whole cells of `:root` tokens at full alpha. |
| `script#w-data` | `{order, layouts: {wide, narrow: {cols, rows, masks, at}}}`: run-length theme masks and each marker's cell, as the page draws them. |
