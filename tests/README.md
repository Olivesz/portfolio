# Regression suite

Open `tests/run.html` from the same origin as `index.html`:

```bash
python3 -m http.server 8137 --directory . && open http://localhost:8137/tests/run.html
```

38 assertions, all green in ~12s. Results are also on `window.__TESTS`
(`{total, failed, results}`) with `window.__DONE` as the completion flag, so a CI
driver only has to load the page and read two globals.

## How it works

It loads the real `index.html` in a **same-origin iframe** and drives it through
the `__lab` handle. Sizing the *iframe* is what gives 375 / 768 / 1280 without
touching the browser window — `innerWidth` inside the frame is the frame's own
width, so all three widths run in one pass.

Two harness facts worth knowing, both learned the hard way:

- **The GL page build is gated on a sane `#sheet` layout and retries via rAF.**
  A hidden or background frame parks rAF almost completely, so the suite
  dispatches a `resize` event at the frame, which drives the retry synchronously.
- **`inkRect()` is only meaningful while the finale owns the frame.** At exactly
  `FIN.t === 1` the finale hands back to the outro by design, `draw()` stops
  running, and the camera goes unpositioned — `inkRect` then reads ±Infinity.
  Registration is measured at `t = 0.99`, where the pose is already fully landed
  (it settles by t ≈ 0.763).

## Every assertion has been falsified

A test that has never failed proves nothing. Each fix below was reverted and the
suite re-run to confirm the guard actually fires:

| mutation | tests that went red |
|---|---|
| `unzipLo` → hardcoded `0.84` | unzip start band, all 3 widths (`0.840` vs visible min `0.875 / 0.887 / 0.938`) |
| `finOwns` → drop the `FIN.t < 1` guard | outro backdrop (`1 distinct colour` = blank frame) |
| `sheetPose` distance × 1.4 | resume registration x + width, all 3 widths |
| finale `FIN.t` → scroll-scrubbed | clock completes, lock releases ×2, landed past band, reverse completes |
| `finSetLock(false)` always | page held for the transformation (`0/312` frames), wheel swallowed, **touchmove swallowed** |
| `#outro` padding back inside the media query | nav clearance at 1280×800 and 812×375 |
| `#idbar` width cap back to a frozen `172px` | width cap tracks the skip label (`203 → 203px`) |
| drop the `max()` floor on that cap | nav never collapses (`0px of 375`) |
| `SCROLL_LEN` frozen at boot again | scroll length recomputed, scroll map matches document (`ratio 1.0216`) |

The first version of the unzip assertion (`0.5 < uReveal < 1`) **passed against
the broken code** — 0.84 satisfies it. It was replaced with one that recomputes
the genuinely-visible age band from `__TRAIL` and the live camera, deriving the
grid centre rather than assuming it. That is the whole reason to falsify.

## Verified on real iOS Safari

The whole suite runs inside the iOS Simulator's Safari, which is how the
platform-specific risks were actually cleared rather than assumed:

```bash
xcrun simctl boot "iPhone 17"
xcrun simctl openurl booted "http://localhost:8137/tests/run.html"
xcrun simctl io booted screenshot ios-suite.png
```

**28/28 pass on iOS 26.5 Safari.** That covers the three.js importmap, WebGL,
`ctx.letterSpacing` (Safari 16.4+, used by the resume raster — registration came
back identical to desktop at `285.9 / 708.2`), `body:has(#skip.off)`, and the
finale clock.

The wheel assertions prove nothing about a phone, since iOS never fires a wheel
event — so there is a separate `touchmove` assertion. If that listener were ever
registered `passive`, `preventDefault` would silently no-op and the page would
scroll straight through the climax. It is verified honoured, on device.

Note the particle counts differ from desktop (14,956 vs 18,298 at 1280) because
Safari's glyph rasterisation yields fewer inked pixels. Registration is
unaffected, which is the point of measuring geometry rather than counts.

## Not covered

Pixel-level cross-browser rendering, Firefox, WebGL absence, and CDN failure of
three.js or Google Fonts.
