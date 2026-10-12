# Motion & timing audit — V15

Measured, not eyeballed: the alpha envelopes and periodic terms were sampled numerically at
4,000 points per station and converted to **scroll pixels** (desktop: `SCROLL_LEN = 17,600px`
at `vh = 800`; one wheel notch ≈ 100px). Evidence frames: `scratchpad/v15-*`.

## The measured map (before fixes)

| Beat | span |
|---|---|
| intro → first chapter | 739 px (~7 notches) |
| one chapter (station) | 1,760 px |
| one sub-phase (a/b/c), u:0→1 | 573 px |
| sub-phase at ≥0.9 alpha ("full strength") | 444 / 456 / 541 px |
| sub-phase overlap (both >0.3) | **34 px** |
| dead head of each station (before `hold` starts) | 123 px |
| station entry fade / exit fade | 194 px / **97 px** |
| one branch panel | 880 px |
| finale total | 2,112 px |
| outro | 616 px |

## D1 — BLOCKER: sub-phases double-expose, and their captions collide

`v15-x-comp-c.jpg` (chapter III at hold 0.66) shows the Wireworld half-adder **and** the CPU
front panel drawn over each other: the truth-table header runs through the assembly listing,
and both `subCaption`s print at the same y, producing literal mush —
`"replayed hemebyrum 15A the theiderintampretes of camy verifed…"`.

Cause: `phases3` windows `[0,0.37] [0.31,0.69] [0.63,1.0]` overlap by 0.06 of hold (≈93 px), and
every panel draws into the same screen region with its caption at the same fixed position
(`h*0.84`). Even a 0.15/0.85 blend is two legible texts on one line.

## D2 — BLOCKER: branch panels cross through a double-dim ghost

`v15-br-trough-e.jpg` (computation branch, q=0.50): both the junction and diode panels render
at **α ≈ 0.10** simultaneously — dim *and* superimposed. Panel titles merge into
`"theldiydef-tfoundRbyautomated search"`.

Cause: `easeC(1 - |d|/0.62)` is zero-sum-blind — at the panel boundary `|d| = 0.5` both panels
evaluate to 0.10. Measured trough: **335 px where nothing exceeds 0.5 alpha.**

## D3 — MAJOR: every "alive" element is scroll-driven, so it dies when you stop to read

Fourteen periodic animations are functions of `u` (scroll), not wall-clock. Two symptoms, both
matching the report of "too fast / too slow":

| animation | px per cycle | what it does when you stop scrolling |
|---|---|---|
| transcript cursor `sin(u*40)` | **90** | strobes ~7×/screen while scrolling; frozen when reading |
| voice waveform `sin(u*22)` | 164 | becomes a static comb — the "live mic" is dead |
| silence-guard wave `sin(u*20)` | 276 | frozen |
| title-card waveform `sin(u*18)` | 307 | frozen |
| casecraft padlock `sin(u*12)` | 461 | frozen |
| candle bid/ask inventory `sin(u*9.7)` | 371 | frozen |
| order-book skew `sin(u*6)` | 600 | frozen |
| charformer pipeline pulse `(u*2.2)%1` | 260 | pulse parks mid-tube |
| freeflow pipeline pulse `(u*2)%1` | 287 | same |
| XOR junction firing `(u*3)%1` | 293 | the logic demo stops demonstrating |
| diode electron `(u*2.4)%1` | 367 | frozen mid-wire |
| freeflow key press `(u*2)%1` | 440 | the key never presses |
| title-card attention cursor `(u*2.5)%1` | 352 | frozen |
| title-card glider gun | 293 | **the gun stops firing** — on the card that says it fires forever |

The rule the site was missing: **scroll drives progress; wall-clock drives life.**

## D4 — MAJOR: the picture arrives before the words

Panel hits α 0.9 at **188 px** into a station; the DOM card only at **279 px**. For ~91 px you
are looking at an unexplained diagram. Reading order is inverted on every chapter.

## D5 — MINOR: asymmetric chapter hand-off

Exit fade 97 px vs entry fade 194 px — the outgoing chapter vanishes in half the distance the
incoming needs, leaving a soft trough between chapters.

---

# Fixes applied (V15)

1. **Captions became exclusive** (`subCaption`, `panelTitle`, `centerCaption` ignore α < 0.55 and
   remap [0.55,1] → [0,1]). Only ever one caption on screen; no text mush anywhere. — D1, D2
2. **Sub-phase windows re-cut to three clean thirds** with a 0.13 fade, so graphic overlap is
   brief and text overlap is impossible. — D1
3. **Branch crossfade normalized**: weights `max(0, 1-|d|/0.72)²` divided by their sum, so the
   pair always sums to 1 — α is 1.0 through the body of a panel and 0.5/0.5 exactly at the
   boundary. The 335 px ghost trough is gone. — D2
4. **Wall-clock life**: `beat(hz)`/`wave(hz)` helpers on `performance.now()`; all fourteen
   animations above retimed to human rates (0.35–1.4 Hz). They now run while you read and stop
   strobing while you scroll. Frozen to a representative still under `prefers-reduced-motion`.
   — D3
5. **Card leads the panel**: card fade starts at t=0.025 over 0.09 (full at ~156 px); panels
   gate behind it. — D4
6. **Exit fade 0.055 → 0.075** for a symmetric hand-off. — D5
7. **Branch panels swap like slides, not blends.** The normalized crossfade (fix 3) still
   double-exposed each panel's *own* in-panel labels at the exact 50/50 midpoint, so branches
   now render **one panel at a time**, dipping to 0.65 alpha at the boundary and back up —
   alpha stays continuous and two panels are never on screen together. — D2
8. **The world yields to the payoff.** The background dim and scrim were driven by the
   chapter-entry envelope, which brightens again while the payoff panel is still at full
   strength — the trail crossed the halting CPU. Both now follow
   `max(entryEnvelope, renderedPanelAlpha)`, so the world stays back exactly as long as a
   panel is up.
9. **Card exits decisively** (fade-out 158 px → 88 px) instead of ghosting across a chapter's
   last third.

## After: the same measurements

| metric | before | after |
|---|---|---|
| sub-phase caption overlap | 34 px of merged text | **0 px** |
| sub-phase graphic crossfade | 93 px window, unreadable | **32 px, captions exclusive** |
| mid-station blank | — | **0 px** (no blink) |
| full-strength per beat | 444 / 456 / 541 px | **463 / 463 / 475 px** (even) |
| branch boundary | both panels at α 0.10, titles merged | **one panel, α 0.65 dip** |
| branch ghost trough | 335 px | **0 px** |
| card vs panel arrival | panel led by 91 px | **card leads by 6 px** |
| animations alive while reading | 0 of 14 | **14 of 14** (verified by pixel-diff with scroll frozen) |

Verification: two full forward+reverse eased sweeps at both viewports (0 errors), 56 branch
positions, real branch-button + Esc interaction, click-to-plant, and 1 fps throttled-tab
convergence. Evidence: `scratchpad/v15fix-*`, `v15c-*`, `v15e-*`.
