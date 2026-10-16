/* one column (under 1024 px): the facts (year, stack, code, themes) follow the opening figure, so a phone opens on
   the figure rather than a table. The page places them at load with a small script right after its hero; this keeps
   them placed when the width changes later. The page reads whole without script. */
(function () {
  "use strict";
  var head = document.querySelector(".head"), grid = head && head.querySelector(".head-grid"), fig = head && head.nextElementSibling;
  if (!grid || !fig || !fig.classList.contains("hero-fig") || !window.matchMedia) return;
  var box = document.querySelector(".facts-after"), facts = box ? box.querySelector(".facts") : grid.querySelector(".facts");
  if (!facts) return;
  if (!box) { box = document.createElement("div"); box.className = "blk facts-after"; }
  var mq = matchMedia("(max-width:1023px)");
  function place() {
    if (mq.matches) { if (facts.parentNode !== box) { box.appendChild(facts); fig.parentNode.insertBefore(box, fig.nextSibling); } }
    else if (facts.parentNode === box) { grid.appendChild(facts); if (box.parentNode) box.parentNode.removeChild(box); }
  }
  place();
  if (mq.addEventListener) mq.addEventListener("change", place); else if (mq.addListener) mq.addListener(place);
})();

/* case studies: a figure marked [data-play] plays once when half of it is on screen (40% of the screen for a tall
   one; on the first screen, before any scroll, a sixth of the screen will do, so a phone opens on it playing rather
   than on a still frame), keeps its final state and then offers replay. Figures listen for case:play and case:rest
   on their stage and dispatch case:done when finished. No wheel, touch or key listeners: replay is a native button. */
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function fire(el, type) { el.dispatchEvent(new CustomEvent(type, { bubbles: true })); }
  var steps = [];
  for (var k = 0; k <= 20; k++) steps.push(k / 20);
  function setup(stage) {
    var fig = stage.closest("figure"), btn = fig ? fig.querySelector(".replay") : null;
    if (btn) btn.hidden = true;
    stage.addEventListener("case:done", function () { stage.dataset.state = "done"; if (btn && !reduce) btn.hidden = false; });
    function play() { stage.dataset.state = "playing"; if (btn) btn.hidden = true; fire(stage, "case:play"); }
    if (btn) btn.addEventListener("click", play);
    if (reduce || !("IntersectionObserver" in window)) { stage.dataset.state = "rest"; fire(stage, "case:rest"); return; }
    var io = new IntersectionObserver(function (es) {
      // on the first screen at load, the figure holds its first frame until the heading has risen in (0.6 s)
      for (var i = 0; i < es.length; i++) {
        var e = es[i], need = Math.min(e.boundingClientRect.height * 0.5, innerHeight * (window.scrollY < 1 ? 1 / 6 : 0.4));
        if (!e.isIntersecting || e.intersectionRect.height < need - 1) continue;
        io.disconnect();
        var wait = 600 - (window.performance && performance.now ? performance.now() : 600);
        if (wait > 0) setTimeout(play, wait); else play();
        return;
      }
    }, { threshold: steps });
    io.observe(stage);
  }
  // figure scripts register their listeners first, so this runs after them (deferred, last in the body)
  var stages = document.querySelectorAll("[data-play]");
  for (var i = 0; i < stages.length; i++) setup(stages[i]);
})();

/* arrival builds: a figure marked [data-build] draws its marks (.bld grow from their start, .bld-o fade in, staggered
   by --i) the first time a sixth of it is on screen. A figure seen approaching faster than 2 px/ms, within half a
   screen below the fold (a skim or a flick), is marked .quick and starts drawing before it arrives, its marks almost
   together, so a skimming reader is not shown it half built. Without IntersectionObserver, under reduced motion or
   with no script it is simply drawn whole. */
(function () {
  "use strict";
  var figs = document.querySelectorAll("[data-build]");
  if (!figs.length || !("IntersectionObserver" in window) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  var seen = typeof WeakMap === "function" ? new WeakMap() : null, near, io, steps = [];
  for (var k = 0; k <= 20; k++) steps.push(k / 20);
  // fast: more than 200 px travelled since first seen, above 2 px/ms, so one eased wheel notch never counts
  function fast(e) {
    var f = seen && seen.get(e.target), dt = f ? e.time - f.t : 0, dy = f ? Math.abs(f.y - e.boundingClientRect.top) : 0;
    return dt > 0 && dy > 200 && dy / dt > 2;
  }
  function go(el, quick) {
    near.unobserve(el); io.unobserve(el);
    if (el.getAttribute("data-build") !== "pre") return;
    if (quick) el.classList.add("quick");
    el.setAttribute("data-build", "go");
  }
  near = new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      var e = es[i];
      if (!e.isIntersecting || !seen) continue;
      if (!seen.has(e.target)) seen.set(e.target, { t: e.time, y: e.boundingClientRect.top });
      else if (fast(e)) go(e.target, true);
    }
  }, { rootMargin: "0px 0px 50% 0px", threshold: steps });
  io = new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      var e = es[i], r = e.intersectionRect;
      if (!e.isIntersecting || (e.intersectionRatio < 0.15 && r.height < innerHeight * 0.15)) continue;
      // met this far in on its first sighting, it came faster than a reading notch
      go(e.target, seen && seen.has(e.target) ? fast(e) : r.height > 140);
    }
  }, { threshold: [0, 0.05, 0.1, 0.15] });
  for (var i = 0; i < figs.length; i++) { figs[i].setAttribute("data-build", "pre"); near.observe(figs[i]); io.observe(figs[i]); }
})();

/* inline figures marked data-reveal: armed while still below the fold, drawn once when 40% of the figure is on screen,
   or a fifth of the viewport for a figure taller than that, so a reader never pauses over a screen of empty space.
   A figure that comes into view faster than 2 px/ms (a skim, a flick or a jump; reading runs near 1) is marked .quick
   and draws its parts almost together, so a skimming reader is not shown the empty half still waiting its turn; one
   seen approaching that fast within half a screen below the fold starts drawing before it arrives.
   Reduced motion or no IntersectionObserver: nothing is armed, so every part rests in its final state. */
(function () {
  "use strict";
  var figs = document.querySelectorAll(".ig[data-reveal]");
  if (!figs.length || !("IntersectionObserver" in window) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  var first = typeof WeakMap === "function" ? new WeakMap() : null, ahead = typeof WeakMap === "function" ? new WeakMap() : null, near, steps = [];
  for (var k = 0; k <= 20; k++) steps.push(k / 20);
  // the approach zone: more than 200 px travelled since first seen there, above 2 px/ms, so one eased wheel notch never counts
  if (ahead) near = new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      var e = es[i], f = ahead.get(e.target);
      if (!e.isIntersecting) continue;
      if (!f) { ahead.set(e.target, { t: e.time, y: e.boundingClientRect.top }); continue; }
      var dt = e.time - f.t, dy = Math.abs(f.y - e.boundingClientRect.top);
      if (dt > 0 && dy > 200 && dy / dt > 2) { e.target.classList.add("quick", "on"); near.unobserve(e.target); io.unobserve(e.target); }
    }
  }, { rootMargin: "0px 0px 50% 0px", threshold: steps });
  var io = new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      var e = es[i], r = e.intersectionRect;
      if (!e.isIntersecting) continue;
      if (first && !first.has(e.target)) first.set(e.target, { t: e.time, y: e.boundingClientRect.top });
      if (e.intersectionRatio >= 0.4 || r.height >= innerHeight * 0.2) {
        // speed from how far the figure moved since it first showed, or else since it entered the approach zone; met
        // already this far in with neither, it came faster than a notch
        var f = first && first.get(e.target), a = ahead && ahead.get(e.target), y = e.boundingClientRect.top, dt = f ? e.time - f.t : 0;
        if (!(dt > 0) && a && e.time > a.t) { f = a; dt = e.time - a.t; }
        if (f && (dt > 0 ? Math.abs(f.y - y) / dt > 2 : r.height > 140)) e.target.classList.add("quick");
        e.target.classList.add("on"); io.unobserve(e.target); if (near) near.unobserve(e.target);
      }
    }
  }, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4] });
  for (var i = 0; i < figs.length; i++) {
    if (figs[i].getBoundingClientRect().top < innerHeight) continue;   // already in view at load: leave it whole
    figs[i].classList.add("armed"); io.observe(figs[i]); if (near) near.observe(figs[i]);
  }
})();

/* the depth pages' layer (lx-): a page opts in with its markup, and a deep dive loads this file after deep.js. Five parts:
   1. arrival: the one ant walks a real Langton highway into the hero figure's corner, then rests there, and the
      highway it laid cools to copper in the order it was walked, so the ant is the only pink on the hero;
   2. the road: a rail of cells beside the story (1280 and up) or a strip under the top strip (below), walked by the
      same ant once the hero's ant has left the screen, so exactly one ant is ever drawn. Stations are pluses that
      bloom in the hue when reached; the road laid stays laid when you scroll back;
   3. arrival builds: .lx-arrive blocks rise once when they come into view (armed only if below the fold at load),
      bars lay one cell per step, tiles light in turn; frames' corners turn the hue clockwise;
   4. the reading cue: the paragraph at the reading line turns ink with a 2 px rule in the hue;
   5. a read-only hook, window.__lx, for the checks.
   Passive scroll and resize listeners, IntersectionObserver and ResizeObserver only: no wheel, touch or key listener,
   and the page never scrolls itself (the rail's labels are plain #links). Reduced motion: the ant is drawn where it
   rests, every build is whole, the road still tracks the reader (it is information) and no paragraph is marked. */
(function () {
  "use strict";
  var W = window, D = document, R = D.documentElement;
  var REDUCE = !!(W.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var IO = "IntersectionObserver" in W;
  var CS = getComputedStyle(R);
  function tok(n) { return CS.getPropertyValue("--" + n).trim(); }
  var C = { void: tok("void"), ant: tok("ant"), trail: tok("trail"), t2: tok("trail-2"), t3: tok("trail-3"),
            copper: tok("copper"), rule: tok("rule"), hue: tok("accent") || tok("v-amber") };
  function dpr() { return Math.max(1, W.devicePixelRatio || 1); }
  function wide() { return W.innerWidth >= 1280; }
  function stripB() { return 40 + (wide() ? 0 : 16); }                  // the strip, plus the road strip under it
  // a canvas sized in device pixels, cells at a whole device pitch: p device px = c CSS px
  function pitch(css) { return Math.max(1, Math.round(css * dpr())); }
  function fit(cv, wDev, hDev) {
    if (cv.width !== wDev || cv.height !== hDev) { cv.width = wDev; cv.height = hDev; }
    cv.style.width = wDev / dpr() + "px"; cv.style.height = hDev / dpr() + "px";
    return cv.getContext("2d");
  }

  /* ---------------- 1. arrival: Langton's ant, the real rule, from a blank grid ---------------- */
  // turn right on an empty cell, left on a lit one, flip it, step. Near step 10,000 it builds the highway: 104 steps
  // per period, two cells along a diagonal. That is the index's road.
  var N = 12600, HW0 = 10200, G = 512;
  var LA = null;
  function langton() {
    if (LA) return LA;
    var g = new Uint8Array(G * G), x = G >> 1, y = G >> 1, d = 0, DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    var px = new Int16Array(N), py = new Int16Array(N), on = new Uint8Array(N);
    for (var t = 0; t < N; t++) {
      var k = y * G + x, c = g[k];
      d = c ? (d + 3) & 3 : (d + 1) & 3;
      g[k] = c ^ 1; px[t] = x; py[t] = y; on[t] = c ^ 1;
      x += DX[d]; y += DY[d];
    }
    return (LA = { px: px, py: py, on: on, hx: x, hy: y });
  }
  var hero = null;                                                       // the arrival's state, read by the road
  function arrival(fig) {
    var host = fig.closest(".lx-hero"), cv = D.createElement("canvas");
    if (!host) return;
    cv.className = "lx-arrive-cv"; cv.setAttribute("aria-hidden", "true"); host.appendChild(cv);
    var L = langton(), A = { fig: fig, done: false, started: false, on: false, headY: -1, cv: cv, box: null };
    hero = A;
    // the highway's own heading over the window, and the one of the grid's 8 symmetries that sends it where we want
    var dx = L.px[N - 1] - L.px[HW0], dy = L.py[N - 1] - L.py[HW0];
    function sym(want) {
      for (var f = 0; f < 2; f++) for (var r = 0; r < 4; r++) {
        var v = map(dx, dy, f, r);
        if (Math.sign(v[0]) === want[0] && Math.sign(v[1]) === want[1]) return [f, r];
      }
      return [0, 0];
    }
    function map(x, y, f, r) { if (f) x = -x; for (var i = 0; i < r; i++) { var t = x; x = -y; y = t; } return [x, y]; }
    var T = null, s0 = HW0, t0 = 0, raf = 0, last = -1, grid = null, at = 0;
    // the retire: once the ant rests (or the road takes it), the highway's cells turn copper over RET ms, oldest first
    var RET = 600, RET_WAIT = 400, retU = 0, ret0 = 0, rraf = 0, rtm = 0;
    function layout() {
      var hb = host.getBoundingClientRect(), fb = fig.getBoundingClientRect(), wd = wide(), c = wd ? 4 : 3, p = pitch(c), cc = p / dpr();
      // desktop: into the top-left corner, heading down and to the left as on the index; below 1280 the figure spans
      // the column, so into the top-right corner, heading down and to the right, through the room beside the title
      var dir = wd ? [-1, 1] : [1, 1], cx = wd ? fb.left : fb.right, cy = fb.top;
      var H = cy - (stripB() + 4), Wd;
      // the band is the largest square on the corner kept 12 px clear of the title's words: each line of the kicker, the
      // title and the one-liner is an obstacle, and a line ends the band's height unless it ends short of the band's
      // width on the side away from the corner
      var obs = [];
      [].forEach.call(host.querySelectorAll(".lx-hero-t > *"), function (el) {
        var rg = D.createRange(); rg.selectNodeContents(el);
        [].forEach.call(rg.getClientRects(), function (r) { if (r.width > 0) obs.push(r); });
      });
      obs.forEach(function (r) {
        if (r.bottom >= cy) return;
        var side = wd ? (r.right <= cx ? Infinity : r.left - cx - 12) : (r.left >= cx ? Infinity : cx - r.right - 12);
        H = Math.min(H, Math.max(side, cy - r.bottom - 12));
      });
      Wd = Math.max(0, H);
      if (H < 48) { A.box = null; cv.style.display = "none"; return; }
      cv.style.display = "";
      var rows = Math.floor(H / cc), cols = Math.floor((Wd + 8) / cc);
      var bx = wd ? cx - 2 * cc : cx - (cols - 2) * cc, by = cy - rows * cc;   // two cells of slack on the corner's side
      A.box = { c: cc, p: p, rows: rows, cols: cols, wd: wd, x: bx - hb.left, y: by - hb.top,
                // the head's cell: just above the frame, touching its corner
                hc: wd ? 2 : cols - 3, hr: rows - 1 };
      cv.style.left = Math.round((bx - hb.left) * dpr()) / dpr() + "px"; cv.style.top = Math.round((by - hb.top) * dpr()) / dpr() + "px";
      T = sym(dir);
      // enough of the road to enter from beyond the band's far edge: the band's diagonal plus the highway's width
      s0 = Math.max(HW0, N - Math.ceil((Math.min(rows, cols) + 14) / 2 * 104));
      A.headY = by + (rows - 1) * cc + W.scrollY; A.headC = cc;
      fit(cv, cols * p, rows * p);
    }
    function reset() { grid = new Map(); at = s0; }
    function to(s) { for (; at < s; at++) { grid.set(L.px[at] * G + L.py[at], { on: L.on[at], t: at }); } }
    function draw(s) {
      var b = A.box; if (!b) return;
      var g = cv.getContext("2d"), p = b.p, ex = L.hx, ey = L.hy;
      g.clearRect(0, 0, cv.width, cv.height);
      to(s);
      // where the head is now, in the head's final frame of reference (the head at s may sit a few cells back)
      var cut = retU > 0 ? s0 + (N - s0) * retU : -1;                  // cells walked before this step are retired
      grid.forEach(function (v, k) {
        if (!v.on) return;
        var q = map(Math.floor(k / G) - ex, (k % G) - ey, T[0], T[1]), col = b.hc + q[0], row = b.hr + q[1];
        if (col < 0 || row < 0 || col >= b.cols || row >= b.rows) return;
        var age = s - v.t;
        g.fillStyle = v.t <= cut ? C.copper : age < 312 ? C.trail : age < 4000 ? C.t2 : C.t3;
        g.fillRect(col * p, row * p, p, p);
      });
      var hq = s >= N ? [0, 0] : map(L.px[s] - ex, L.py[s] - ey, T[0], T[1]);
      var hcol = b.hc + hq[0], hrow = b.hr + hq[1];
      A.on = hcol >= 0 && hrow >= 0 && hcol < b.cols && hrow < b.rows;
      if (A.on) { g.fillStyle = C.ant; g.fillRect(hcol * p, hrow * p, p, p); }
    }
    var DUR = 2200, DELAY = 80;
    function frame(t) {
      raf = 0;
      if (!A.box) return;
      if (!t0) t0 = t;
      var u = Math.max(0, Math.min(1, (t - t0 - DELAY) / DUR)), e = 1 - Math.pow(1 - u, 2.2);   // walks in, slows to a stop
      var s = Math.round(s0 + (N - s0) * e);
      // a reader who scrolls the corner away mid-walk is not kept waiting: the ant lands where it rests and the road
      // takes it at once
      if (!headInView()) { draw(N); last = N; finish(); return; }
      if (s !== last) { draw(s); last = s; }
      if (u < 1) { raf = requestAnimationFrame(frame); return; }
      finish();
    }
    function retire(now) {
      if (retU >= 1 || rraf) return;
      if (rtm) { clearTimeout(rtm); rtm = 0; }
      if (REDUCE || now) { retU = 1; if (A.box) { draw(N); last = N; } return; }
      ret0 = 0;
      rraf = requestAnimationFrame(function f(t) {
        rraf = 0; if (!ret0) ret0 = t;
        retU = Math.min(1, (t - ret0) / RET);
        if (A.box) { draw(N); last = N; }
        if (retU < 1) rraf = requestAnimationFrame(f);
      });
    }
    A.retire = function () { if (A.done) retire(!headInView()); };       // the road's ant has taken over
    function finish() {
      A.done = true; A.started = true;
      if (!rtm && retU < 1) rtm = setTimeout(function () { rtm = 0; retire(false); }, REDUCE ? 0 : RET_WAIT);
      if (!fig.classList.contains("lit")) fig.classList.add("lit");          // the ant is in: the corners take the hue
      fig.dispatchEvent(new CustomEvent("lx:arrived", { bubbles: true }));
      road.paint(true);
    }
    function start() {
      // a resize before the walk began has already landed the ant: lay out again and keep it where it rests
      if (A.done) { layout(); reset(); if (A.box) { draw(N); last = N; } road.paint(true); return; }
      layout(); reset();
      if (!A.box) { finish(); return; }
      // reduced motion, or a page opened below its hero: the ant is simply where it rests
      var fb = fig.getBoundingClientRect();
      if (REDUCE || fb.top > W.innerHeight || fb.bottom < 0) { draw(N); last = N; finish(); return; }
      A.started = true; draw(s0); road.paint(true);
      raf = requestAnimationFrame(frame);
    }
    W.addEventListener("resize", function () {
      // before the walk starts there is nothing to land: start() lays out on its own. Once it has started, a resize
      // lands the ant where it rests: the walk is not replayed
      if (!A.started) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      layout(); reset(); if (A.box) { draw(N); last = N; } if (!A.done) finish(); else road.paint(true);
    }, { passive: true });
    // lay out once the fonts are in and the title has finished rising (its lines are the band's obstacles)
    var waits = [D.fonts && D.fonts.ready ? D.fonts.ready : Promise.resolve()];
    [].forEach.call(host.querySelectorAll(".lx-hero-t > *"), function (el) {
      if (el.getAnimations) el.getAnimations().forEach(function (a) { waits.push(a.finished.catch(function () {})); });
    });
    Promise.all(waits).then(function () { requestAnimationFrame(start); });
  }
  // the hero's ant owns the screen while its corner, where the head comes to rest, is on screen (below the strip, above
  // the bottom edge), on its way in or resting; otherwise the road's ant is drawn. Never both, never neither once laid out.
  function headInView() {
    var y = hero.headY - W.scrollY;                                      // any part of the head's cell in view counts
    return y + hero.headC > stripB() && y < W.innerHeight;
  }
  function heroAntShown() {
    if (!hero) return false;
    if (!hero.box) return !hero.done && hero.fig.getBoundingClientRect().top > stripB();   // not laid out yet
    return headInView();
  }

  /* ---------------- 2. the road: rail (1280 and up) or strip (below) ---------------- */
  var road = (function () {
    var rail = D.querySelector(".lx-rail"), bar = D.querySelector(".lx-bar");
    var links = rail ? [].slice.call(rail.querySelectorAll("a[href*='#']")) : [];
    var ids = links.map(function (a) { return a.getAttribute("href").split("#")[1]; });
    var targets = ids.map(function (id) { return D.getElementById(id); });
    var local = targets.map(function (t, i) { return !!t && links[i].getAttribute("href").charAt(0) === "#"; });
    var rcv = rail ? D.createElement("canvas") : null, bcv = bar ? D.createElement("canvas") : null;
    if (rcv) { rcv.className = "lx-road"; rcv.setAttribute("aria-hidden", "true"); rail.insertBefore(rcv, rail.firstChild); }
    if (bcv) { bcv.className = "lx-road"; bcv.setAttribute("aria-hidden", "true"); bar.appendChild(bcv); }
    var tops = [], M = null, maxR = -1, maxB = -1, lastY = -1, dirR = 1, dirB = 1, raf = 0, key = "", bloom = [], timer = 0;
    function measure() {
      var y = W.scrollY;
      tops = targets.map(function (t, i) { return local[i] ? Math.round(t.getBoundingClientRect().top + y) : -1; });
      var docH = R.scrollHeight, vh = W.innerHeight, wd = wide();
      M = { wd: wd, vh: vh, max: Math.max(1, docH - vh), docH: docH };
      if (wd && rcv) {
        var p = pitch(4), c = p / dpr();
        var ticks = links.map(function (a) { var li = a.parentNode; return li.offsetTop + 16; });
        var rows = Math.ceil((ticks[ticks.length - 1] + 8) / c);
        M.c = c; M.p = p; M.rows = rows; M.tick = ticks.map(function (t) { return Math.round((t - c / 2) / c); });
        fit(rcv, 3 * p, rows * p);
        rcv.style.top = "0px"; rcv.style.left = "0px";
      } else if (bcv) {
        var p2 = pitch(4), c2 = p2 / dpr(), Lc = Math.floor((W.innerWidth - 2 * (W.innerWidth < 1024 ? 16 : 64)) / c2);
        M.c = c2; M.p = p2; M.L = Lc;
        // a station sits where its section meets the reading line (35% down the screen); the strip is too short for a
        // chapter's sub-entries, so only the chapters are stations there
        M.st = tops.map(function (t, i) { return i === 0 ? 0 : t < 0 || links[i].parentNode.classList.contains("sub") ? -1 : Math.round(Math.max(0, Math.min(1, (t - vh * 0.35) / M.max)) * (Lc - 1)); });
        fit(bcv, Lc * p2, 3 * p2);
      }
      lastY = -1; key = ""; paint(true);
    }
    // the rail: the ant's row, proportional through the section it is in, so it meets each station as its section does
    function railRow(y) {
      var read = y + M.vh * 0.35, n = tops.length, i = -1, k;
      for (k = 0; k < n; k++) if (tops[k] >= 0 && tops[k] <= read) i = k;
      if (i < 0) { for (k = 0; k < n && tops[k] < 0; k++); i = Math.min(k, n - 1); }   // above the first station here
      var j = i + 1; while (j < n && tops[j] < 0) j++;
      var end = j < n ? tops[j] : M.docH - M.vh * 0.65, f = Math.max(0, Math.min(1, (read - tops[i]) / Math.max(1, end - tops[i])));
      if (tops[i] > read) f = 0;
      var a = M.tick[i], b = j < n ? M.tick[j] : M.tick[i];
      var r = Math.round(a + f * (b - a));
      if (y >= M.max - 2) r = M.tick[n - 1];
      return { r: r, i: i };
    }
    function drawRail(r, antOn) {
      var g = rcv.getContext("2d"), p = M.p, first = M.tick[0], lastT = M.tick[M.tick.length - 1], now = performance.now();
      g.clearRect(0, 0, rcv.width, rcv.height);
      function cell(col, row, c) { g.fillStyle = c; g.fillRect(col * p, row * p, p, p); }
      for (var row = first; row <= lastT; row++) {
        if (row <= maxR) cell(1, row, C.hue);
        else if ((row - first) % 2 === 0) cell(1, row, C.rule);
      }
      M.tick.forEach(function (s, k) {
        var reached = s <= maxR, armsLit = reached && (REDUCE || (bloom[k] && now - bloom[k] >= 160));
        cell(1, s, reached ? C.hue : C.copper);
        var arm = armsLit ? C.hue : C.copper;
        if (!links[k].parentNode.classList.contains("sub")) { cell(0, s, arm); cell(2, s, arm); }
        cell(1, s - 1, arm); cell(1, s + 1, arm);
      });
      if (antOn) { cell(1, r - dirR, C.trail); cell(1, r - 2 * dirR, C.t2); cell(1, r, C.ant); }
    }
    function drawBar(x, antOn) {
      var g = bcv.getContext("2d"), p = M.p, now = performance.now();
      g.clearRect(0, 0, bcv.width, bcv.height);
      function cell(col, row, c) { if (col < 0 || col >= M.L) return; g.fillStyle = c; g.fillRect(col * p, row * p, p, p); }
      for (var col = 0; col < M.L; col++) {
        if (col <= maxB) cell(col, 1, C.hue);
        else if (col % 2 === 0) cell(col, 1, C.rule);
      }
      M.st.forEach(function (s, k) {
        if (s < 0) return;
        var reached = s <= maxB, armsLit = reached && (REDUCE || (bloom[k] && now - bloom[k] >= 160)), arm = armsLit ? C.hue : C.copper;
        cell(s, 1, reached ? C.hue : C.copper); cell(s - 1, 1, arm); cell(s + 1, 1, arm); cell(s, 0, arm); cell(s, 2, arm);
      });
      if (antOn) { cell(x - dirB, 1, C.trail); cell(x - 2 * dirB, 1, C.t2); cell(x, 1, C.ant); }
    }
    function paint(force) {
      raf = 0;
      if (!M) return;
      var y = W.scrollY, dir = lastY < 0 ? 0 : y > lastY ? 1 : y < lastY ? -1 : 0; lastY = y;
      var antOn = !heroAntShown(), now = performance.now(), k2;
      if (antOn && hero && hero.done && hero.retire) hero.retire();
      if (M.wd && rcv) {
        var rr = railRow(y);
        if (dir) dirR = dir;
        if (rr.r > maxR) maxR = rr.r;
        M.tick.forEach(function (s, k) { if (s <= maxR && !bloom[k]) bloom[k] = now; });
        k2 = [rr.r, maxR, antOn, dirR, rr.i].join();
        if (force || k2 !== key) {
          key = k2; drawRail(rr.r, antOn);
          for (var k = 0; k < links.length; k++) {
            var li = links[k].parentNode, past = k < rr.i, here = k === rr.i;
            if (li.classList.contains("past") !== past && local[k]) li.classList.toggle("past", past);
            if (li.classList.contains("here") !== here) li.classList.toggle("here", here);
            if (here) links[k].setAttribute("aria-current", "location"); else links[k].removeAttribute("aria-current");
          }
          // the first marking is simply there; later ones ease (the colours transition only once the rail is on)
          if (!rail.classList.contains("lx-on")) requestAnimationFrame(function () { requestAnimationFrame(function () { rail.classList.add("lx-on"); }); });
        }
      } else if (bcv) {
        var x = Math.round(Math.max(0, Math.min(1, y / M.max)) * (M.L - 1));
        if (dir) dirB = dir;
        if (x > maxB) maxB = x;
        M.st.forEach(function (s, k) { if (s >= 0 && s <= maxB && !bloom[k]) bloom[k] = now; });
        k2 = [x, maxB, antOn, dirB].join();
        if (force || k2 !== key) { key = k2; drawBar(x, antOn); }
      }
      // a station that bloomed in the last 160 ms opens its arms one step later: one more paint, then nothing
      if (!REDUCE && !timer && bloom.some(function (b) { return b && now - b < 160; })) timer = setTimeout(function () { timer = 0; key = ""; paint(true); }, 170);
    }
    if (rail || bar) {
      W.addEventListener("scroll", function () { if (!raf) raf = requestAnimationFrame(function () { paint(false); }); }, { passive: true });
      W.addEventListener("resize", function () { maxR = -1; maxB = -1; bloom = []; measure(); }, { passive: true });
      if (W.ResizeObserver) { var rq = 0; new ResizeObserver(function () { if (!rq) rq = requestAnimationFrame(function () { rq = 0; measure(); }); }).observe(D.body); }
      if (D.fonts && D.fonts.ready) D.fonts.ready.then(measure);
      measure();
    }
    return { paint: function (f) { paint(!!f); }, state: function () { return { maxR: maxR, maxB: maxB, wide: !!(M && M.wd) }; } };
  })();

  /* ---------------- 3. arrival builds ---------------- */
  // bars in whole 4 px cells: read every width, then write every width (no layout thrash); --n is the bar's cells
  function cells() {
    var bars = [].slice.call(D.querySelectorAll(".lx-cmp i"));
    bars.forEach(function (b) { b.style.width = ""; });
    var w = bars.map(function (b) { return b.offsetWidth; });
    bars.forEach(function (b, i) { var n = Math.max(1, Math.round(w[i] / 4)); b.style.width = n * 4 + "px"; b.style.setProperty("--n", n); });
  }
  cells();
  W.addEventListener("resize", cells, { passive: true });
  if (D.fonts && D.fonts.ready) D.fonts.ready.then(cells);
  [].forEach.call(D.querySelectorAll(".lx-tiles li, .ck li"), function (el) {
    if (!el.style.getPropertyValue("--i")) el.style.setProperty("--i", [].indexOf.call(el.parentNode.children, el));
  });

  // the page's own speed over the last 200 ms: a short block can come whole into view in one skim step, where its own
  // first sighting gives no speed to read
  var sv = [];
  W.addEventListener("scroll", function () {
    var t = performance.now(); sv.push([t, W.scrollY]);
    while (sv.length > 2 && t - sv[0][0] > 200) sv.shift();
  }, { passive: true });
  function skimming() {
    if (sv.length < 2) return false;
    var a = sv[0], b = sv[sv.length - 1];
    return performance.now() - b[0] < 200 && Math.abs(b[1] - a[1]) / Math.max(16, b[0] - a[0]) > 2;
  }
  function speedy(first, e) {
    var f = first && first.get(e.target), dt = f ? e.time - f.t : 0;
    return skimming() || (f && (dt > 0 ? Math.abs(f.y - e.boundingClientRect.top) / dt > 2 : e.intersectionRect.height > 240));
  }
  var blocks = [].slice.call(D.querySelectorAll(".lx-arrive"));
  if (!REDUCE && IO && blocks.length) {
    var first = typeof WeakMap === "function" ? new WeakMap() : null;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        if (first && !first.has(e.target)) first.set(e.target, { t: e.time, y: e.boundingClientRect.top });
        if (e.intersectionRatio >= 0.25 || e.intersectionRect.height >= W.innerHeight * 0.25) {
          if (speedy(first, e)) e.target.classList.add("quick");
          e.target.classList.add("on"); io.unobserve(e.target);
        }
      });
    }, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25] });
    blocks.forEach(function (b) {
      var shown = b.getBoundingClientRect().top < W.innerHeight;
      // on screen at load: left whole, except a block marked data-lx-load (the hero's result), whose words are never
      // hidden and whose bars lay once the hero's words are in
      if (shown && !b.hasAttribute("data-lx-load")) return;
      b.classList.add("lx-armed");
      if (shown) setTimeout(function () { b.classList.add("on"); }, 640); else io.observe(b);
    });
  }
  // frames: the corners turn the hue the moment the figure arrives: an inline figure when 40% of it is on screen, or a
  // fifth of the screen; a scene when deep.js starts it. The hero's frame waits for the ant instead.
  var frames = [].slice.call(D.querySelectorAll(".lx-fr")).filter(function (f) { return !f.hasAttribute("data-lx-arrive"); });
  if (REDUCE || !IO) frames.forEach(function (f) { f.classList.add("lit"); });
  else {
    var fio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var h = e.rootBounds ? e.rootBounds.height : W.innerHeight;
        if (e.isIntersecting && (e.intersectionRatio >= 0.4 || e.intersectionRect.height >= h * 0.2)) {
          var f = e.target.closest(".lx-fr"); if (f) f.classList.add("lit"); fio.unobserve(e.target);
        }
      });
    }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5] });
    var arrivedScenes = {};
    if (W.__deep) W.__deep.scenes().forEach(function (s) { if (s.arrived) arrivedScenes[s.id] = true; });
    frames.forEach(function (f) {
      if (f.classList.contains("scene") && W.__deep) {
        // a scene: deep.js fires deep:arrive when it starts the figure (or a reader steps it first)
        if (arrivedScenes[f.id]) f.classList.add("lit");
        else f.addEventListener("deep:arrive", function () { f.classList.add("lit"); }, { once: true });
      } else fio.observe(f);
    });
  }

  /* ---------------- 4. the reading cue ---------------- */
  if (!REDUCE && IO) {
    var paras = [].slice.call(D.querySelectorAll(".lx-body > p:not(.lx-pull):not(.lx-state), .lx-txt > p:not(.lx-pull)")), cur = null;
    var rio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { if (cur && cur !== e.target) cur.classList.remove("rd"); cur = e.target; cur.classList.add("rd"); }
        else if (e.target === cur) { cur.classList.remove("rd"); cur = null; }
      });
    }, { rootMargin: "-45% 0px -54% 0px" });
    paras.forEach(function (p) { rio.observe(p); });
  }

  /* ---------------- 3b. beat tabs: .lx-beats li follow the station's case:beat {i, n} ---------------- */
  [].forEach.call(D.querySelectorAll(".lx-beats"), function (list) {
    var fig = list.closest("figure"), stage = fig && fig.querySelector("[data-play]");
    if (!stage) return;
    var tabs = list.querySelectorAll("li");
    stage.addEventListener("case:beat", function (ev) {
      var d = ev.detail || {}, n = Math.max(1, d.n || tabs.length), i = Math.round((d.i || 0) * (tabs.length - 1) / Math.max(1, n - 1));
      for (var j = 0; j < tabs.length; j++) { tabs[j].classList.toggle("on", j === i); tabs[j].classList.toggle("past", j < i); }
    });
  });

  /* ---------------- 1b. boot the arrival ---------------- */
  var af = D.querySelector("[data-lx-arrive]");
  if (af) arrival(af); else road.paint(true);

  /* ---------------- 5. read-only hook ---------------- */
  W.__lx = {
    reduce: REDUCE,
    arrived: function () { return !!(hero && hero.done); },
    // which ant is drawn now: 'hero' (resting in the figure's corner) or 'road' (the rail or strip); never both
    ant: function () { return heroAntShown() ? "hero" : "road"; },
    road: function () { return road.state(); },
    head: function () { return hero && hero.box ? { y: hero.headY, on: hero.on } : null; }
  };
})();
