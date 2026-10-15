/* deep.js: the Scene component for the deep dives, plus the contents rail's "you are here".

   A scene is a timeline of whole ticks with named steps on it. It plays once on a clock when it arrives in the top 65%
   of the screen, one figure at a time, holding each step until its words can be read (see holdAt); a stepper (prev, step n of m, next, one square per step) walks it at
   the reader's pace; replay plays it again. Optional inputs switch it to a live mode. With reduced motion it shows its
   key frame and keeps the stepper. Native buttons only: no wheel, touch or key listeners.

   Usage, from a page script that runs after this file:
     Deep.scene("sc-wire", { grid: { cols: 40, rows: 7, pitch: 8 }, ticks: 48, tps: 8,
                              draw: function (api, tick, frac) { ... } });
   The figure's <ol class="sc-keys"> lists the steps: <li data-key="name" data-at="tick">words</li>. */
(function (root) {
  "use strict";
  var mm = function (q) { return !!(root.matchMedia && root.matchMedia(q).matches); };
  var REDUCE = mm("(prefers-reduced-motion: reduce)"), COARSE = mm("(pointer: coarse)");
  var READ_MS = 261, LOOK_MS = 300, PROSE_WPM = 230;                  // reading pace: 230 words a minute, and a look
  var TOKENS = ["void", "ant", "trail", "trail-2", "trail-3", "signal", "signal-2", "ink", "copper", "residue", "body",
                "muted", "rule", "v-red", "v-amber", "v-green", "v-cyan", "v-blue", "v-violet", "accent"];

  /* every colour comes from :root, resolved once (the accent follows the page's theme class on <html>) */
  var K = null;
  function tokens() {
    if (K) return K;
    var cs = getComputedStyle(document.documentElement); K = {};
    TOKENS.forEach(function (n) { K[n] = cs.getPropertyValue("--" + n).trim(); });
    return K;
  }
  function dprInt() { return Math.max(1, Math.round(root.devicePixelRatio || 1)); }
  function mk(tag, cls, parent, text) {
    var e = document.createElement(tag); if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  var scenes = [];

  function Scene(fig, spec) {
    var S = this;
    S.fig = fig; S.spec = spec; S.id = fig.id;
    S.stage = fig.querySelector(".sc-stage");
    S.art = fig.querySelector(".sc-art") || mk("div", "sc-art", S.stage);
    fig.classList.add("js");

    /* steps from the markup */
    var list = fig.querySelector(".sc-keys");
    S.keys = [].slice.call(list ? list.querySelectorAll("li") : []).map(function (li, i) {
      return { li: li, name: li.getAttribute("data-key") || ("k" + i), at: +(li.getAttribute("data-at") || 0), text: li.textContent.trim(), words: li.textContent.trim().split(/\s+/).length };
    });
    if (!S.keys.length) S.keys = [{ li: null, name: "k0", at: 0, text: "" }];
    S.keys.sort(function (a, b) { return a.at - b.at; });
    S.T = Math.max(spec.ticks || 0, S.keys[S.keys.length - 1].at);
    S.tps = spec.tps || 8;
    S.pause = spec.pause !== undefined ? spec.pause : 1400;           // the least a step is held during the autoplay, in ms
    /* every step is held until its words can be read at 230 a minute (261 ms a word, plus 300 ms to look from the
       frame to the words), less the time the frames take to reach the next step, so no step leaves the screen before
       it can be read. One rule for every deep dive; an ambient loop (a hero) keeps its own pause. */
    S.holdAt = function (i) {
      var k = S.keys[i];
      return S.ambient ? S.pause : Math.max(S.pause, (k.words ? LOOK_MS + k.words * READ_MS : 0) - S.travelMs(i));
    };
    S.restKey = spec.rest !== undefined ? S.idx(spec.rest) : S.keys.length - 1;

    /* keyed DOM parts: data-from / data-until / data-only name a step */
    S.keyed = [].slice.call(fig.querySelectorAll("[data-from],[data-until],[data-only]")).map(function (e) {
      var f = e.getAttribute("data-from"), u = e.getAttribute("data-until"), a = e.getAttribute("data-only");
      return { e: e, lo: a ? S.idx(a) : f ? S.idx(f) : 0, hi: a ? S.idx(a) : u ? S.idx(u) : 1e9 };
    });

    S.canvas = null; S.labels = {}; S.hits = []; S.inputs = {}; S.inputBtns = {};
    if (spec.grid) { S.canvas = S.art.querySelector("canvas") || mk("canvas", "", S.art); S.canvas.setAttribute("aria-hidden", "true"); }
    S.buildControls();

    S.t = 0; S.k = 0; S.mode = "idle"; S.target = 0; S.holdLeft = 0; S.raf = 0; S.last = 0; S.visible = false; S.arrived = false;
    S.queued = false; S.paused = false; S.played = false;
    S.live = null; S.liveAcc = 0; S.drawnTick = -1;
    S.api = S.makeApi();
    if (spec.init) spec.init(S.api);
    S.layout();
    S.show(REDUCE ? S.keys[S.restKey].at : 0);
    S.observe();
  }
  var SP = Scene.prototype;

  /* the clock's time from tick a to tick b during the autoplay; a scene marked quick runs stretches with no step within
     4 ticks at 3x (its page supplies that advance) */
  SP.span = function (a, b) {
    var g = b - a, S = this;
    return S.quick && g > 4 ? ((g - 4) / (3 * S.tps) + 4 / S.tps) * 1000 : g / S.tps * 1000;
  };
  SP.travelMs = function (i) { var nx = this.keys[i + 1]; return nx ? this.span(this.keys[i].at, nx.at) : 0; };
  /* one whole autoplay, in ms: the frames' travel, each step's hold, and the last step's words */
  SP.playMs = function () {
    var S = this, n = S.keys.length, last = S.keys[n - 1];
    var ms = S.span(0, S.keys[0].at) + S.span(last.at, S.T) + (last.words ? LOOK_MS + last.words * READ_MS : 0);
    for (var i = 0; i < n - 1; i++) ms += S.holdAt(i) + S.travelMs(i);
    return ms;
  };

  SP.idx = function (name) {
    if (typeof name === "number") return name;
    for (var i = 0; i < this.keys.length; i++) if (this.keys[i].name === name) return i;
    return 0;
  };
  SP.keyAt = function (tick) { var k = 0; for (var i = 0; i < this.keys.length; i++) if (this.keys[i].at <= tick + 1e-9) k = i; return k; };

  /* ---------- controls ---------- */
  SP.buildControls = function () {
    var S = this, fig = S.fig, spec = S.spec, cap = fig.querySelector(".sc-cap") || fig.querySelector("figcaption");
    var keysEl = fig.querySelector(".sc-keys");
    if (keysEl) keysEl.setAttribute("aria-live", "polite");
    // inputs: one toggle per input, in a row that says what you can do
    if (spec.inputs && spec.inputs.length) {
      var row = mk("div", "sc-in"); fig.insertBefore(row, cap);
      mk("span", "k", row, spec.inputsLabel || (COARSE ? "tap to try" : "click to try"));
      spec.inputs.forEach(function (inp) {
        var b = mk("button", inp.momentary ? "sc-btn" : "sc-tg", row); b.type = "button";
        mk("span", "", b, inp.label || inp.id); var v = inp.momentary ? null : mk("span", "v", b);
        S.inputs[inp.id] = !!inp.on; S.inputBtns[inp.id] = { b: b, v: v, inp: inp };
        b.addEventListener("click", function () { S.toggle(inp.id); });
        if (inp.cell) {                                              // also a hit target over the input's cells on the art
          var h = mk("button", "sc-hit", S.art); h.type = "button"; h.setAttribute("aria-label", (inp.label || inp.id) + " (on the drawing)");
          h.tabIndex = -1; h.addEventListener("click", function () { S.toggle(inp.id); });
          S.hits.push({ e: h, cell: inp.cell });
        }
      });
      S.syncInputs();
    }
    // the stepper
    var bar = mk("div", "sc-bar"); fig.insertBefore(bar, cap);
    S.prevB = mk("button", "sc-btn", bar); S.prevB.type = "button";
    S.prevB.innerHTML = '<span class="back" aria-hidden="true">→</span>&nbsp;prev'; S.prevB.setAttribute("aria-label", "previous step");
    S.nEl = mk("span", "sc-n", bar);
    S.nextB = mk("button", "sc-btn", bar); S.nextB.type = "button";
    S.nextB.innerHTML = 'next&nbsp;<span aria-hidden="true">→</span>'; S.nextB.setAttribute("aria-label", "next step");
    S.pips = [];
    if (S.keys.length > 1) {
      var ol = mk("ol", "sc-pips", bar);
      S.keys.forEach(function (k, i) {
        var li = mk("li", "", ol), p = mk("button", "sc-pip", li); p.type = "button";
        p.setAttribute("aria-label", "step " + (i + 1) + (k.text ? ": " + k.text : ""));
        p.addEventListener("click", function () { S.go(i, true); });
        S.pips.push(p);
      });
    }
    S.replayB = mk("button", "replay idle", bar, "replay"); S.replayB.type = "button";
    S.prevB.addEventListener("click", function () { S.go(S.k - 1, true); });
    S.nextB.addEventListener("click", function () { S.go(S.k + 1, false); });
    S.replayB.addEventListener("click", function () { S.play(); });
  };

  SP.syncInputs = function () {
    for (var id in this.inputBtns) {
      var o = this.inputBtns[id], on = !!this.inputs[id];
      if (o.inp.momentary) continue;                                  // a press, not a switch: no state to show
      o.b.setAttribute("aria-pressed", on ? "true" : "false");
      o.v.textContent = o.inp.states ? o.inp.states[on ? 1 : 0] : on ? "1" : "0";   // states: optional words for off / on
    }
  };

  /* ---------- the drawing api a scene's draw() receives ---------- */
  SP.makeApi = function () {
    var S = this;
    var api = {
      scene: S, fig: S.fig, k: tokens(), inputs: S.inputs, reduce: REDUCE, coarse: COARSE,
      tok: function (n) { return tokens()[n] || n; },
      clear: function (n) { var g = S.ctx; if (!g) return; g.fillStyle = api.tok(n || "void"); g.fillRect(0, 0, S.canvas.width, S.canvas.height); },
      cell: function (x, y, n) { var g = S.ctx, p = S.dp; g.fillStyle = api.tok(n); g.fillRect(x * p, y * p, p, p); },
      rect: function (x, y, w, h, n) { var g = S.ctx, p = S.dp; g.fillStyle = api.tok(n); g.fillRect(x * p, y * p, w * p, h * p); },
      /* a 1-device-pixel-inset cell, so neighbouring cells read as separate squares at large pitches */
      dot: function (x, y, n) { var g = S.ctx, p = S.dp, i = p >= 8 ? S.dpr : 0; g.fillStyle = api.tok(n); g.fillRect(x * p + i, y * p + i, p - i, p - i); },
      ww: function (grid, w, h, o) { root.WW.draw(o && o.inset ? api.dot : api.cell, grid, w, h, o); },
      /* a DOM label at cell (x, y): o.align left|center|right, o.dy/o.dx in px, o.cls "" | "i" | "a" | "r" (13 px readout) */
      label: function (id, text, x, y, o) {
        o = o || {};
        var L = S.labels[id];
        if (!L) { L = S.labels[id] = { e: mk("span", o.cls === "r" ? "sc-r" : "sc-l" + (o.cls ? " " + o.cls : ""), S.art) }; L.e.setAttribute("aria-hidden", "true"); }
        L.x = x; L.y = y; L.o = o;
        if (text !== undefined && text !== null) { if (o.html) { if (L.e.innerHTML !== text) L.e.innerHTML = text; } else if (L.e.textContent !== String(text)) L.e.textContent = text; }
        S.placeLabel(L);
        return L.e;
      },
      /* a 1 px vertical leader from cell (x, y) down or up to a label row at py px */
      lead: function (id, x, y, py) {
        var L = S.labels[id];
        if (!L) { L = S.labels[id] = { e: mk("span", "sc-lead", S.art), lead: true }; }
        L.x = x; L.y = y; L.py = py; S.placeLabel(L);
      },
      get pitch() { return S.pitch; }, get cols() { return S.spec.grid ? S.spec.grid.cols : 0; }, get rows() { return S.spec.grid ? S.spec.grid.rows : 0; },
      get phone() { return root.innerWidth < 768; },
      get key() { return S.keys[S.k].name; }, get keyIndex() { return S.k; }, get tick() { return Math.floor(S.t); }, get mode() { return S.mode; }
    };
    return api;
  };

  SP.placeLabel = function (L) {
    var p = this.pitch || 1, ox = this.padL || 0, oy = this.padT || 0;
    if (L.lead) {
      var x = ox + Math.round(L.x * p + p / 2), y0 = oy + Math.round(L.y * p), y1 = oy + L.py;
      L.e.style.left = x + "px"; L.e.style.top = Math.min(y0, y1) + "px"; L.e.style.height = Math.abs(y1 - y0) + "px";
      return;
    }
    var o = L.o || {}, w = L.e.offsetWidth, cx = ox + L.x * p + (o.align === "center" ? p / 2 : o.align === "right" ? p : 0);
    var left = o.align === "center" ? cx - w / 2 : o.align === "right" ? cx - w : cx;
    L.e.style.left = Math.round(left + (o.dx || 0)) + "px";
    L.e.style.top = Math.round(oy + L.y * p + (o.dy || 0)) + "px";
  };

  /* ---------- layout: the largest whole pitch that fits, a canvas of whole device pixels, snapped to the pixel grid ---------- */
  SP.layout = function () {
    var S = this, spec = S.spec, g = spec.grid;
    var avail = Math.floor(S.stage.clientWidth);
    S.padT = (spec.space && spec.space.top) || 0; S.padB = (spec.space && spec.space.bottom) || 0;
    S.padL = (spec.space && spec.space.left) || 0; S.padR = (spec.space && spec.space.right) || 0;
    if (g) {
      var phone = root.innerWidth < 768, want = phone && g.pitchPhone ? g.pitchPhone : g.pitch || 8;
      var fit = Math.floor((avail - S.padL - S.padR) / g.cols);
      S.pitch = Math.max(g.min || 2, Math.min(want, fit));
      S.dpr = dprInt(); S.dp = S.pitch * S.dpr;
      var cw = g.cols * S.pitch, ch = g.rows * S.pitch;
      S.canvas.width = g.cols * S.dp; S.canvas.height = g.rows * S.dp;
      S.canvas.style.width = cw + "px"; S.canvas.style.height = ch + "px";
      S.canvas.style.position = "absolute"; S.canvas.style.left = S.padL + "px"; S.canvas.style.top = S.padT + "px";
      S.ctx = S.canvas.getContext("2d"); S.ctx.imageSmoothingEnabled = false;
      var aw = cw + S.padL + S.padR, ah = ch + S.padT + S.padB;
      S.art.style.width = aw + "px"; S.art.style.height = ah + "px";
      var align = spec.align || "center";
      var ml = align === "left" ? 0 : Math.floor((avail - aw) / 2);
      S.art.style.marginLeft = Math.max(0, ml) + "px";
      // snap: the canvas's left and top edges land on whole CSS pixels
      S.art.style.transform = "";
      var r = S.canvas.getBoundingClientRect(), fx = r.left - Math.round(r.left), fy = r.top - Math.round(r.top);
      if (Math.abs(fx) > 0.01 || Math.abs(fy) > 0.01) S.art.style.transform = "translate(" + (-fx) + "px," + (-fy) + "px)";
    } else {
      S.pitch = 1;
    }
    if (spec.layout) spec.layout(S.api, avail);
    for (var id in S.labels) S.placeLabel(S.labels[id]);
    S.hits.forEach(function (h) {
      var c = h.cell, p = S.pitch, min = COARSE ? 32 : 24, w = (c[2] || 1) * p, hh = (c[3] || 1) * p;
      var W = Math.max(min, w), H = Math.max(min, hh);
      h.e.style.left = Math.round(S.padL + c[0] * p + w / 2 - W / 2) + "px"; h.e.style.top = Math.round(S.padT + c[1] * p + hh / 2 - H / 2) + "px";
      h.e.style.width = W + "px"; h.e.style.height = H + "px";
    });
    S.drawnTick = -1;
  };

  /* ---------- rendering one moment ---------- */
  SP.render = function (force) {
    var S = this, tick = Math.floor(S.t + 1e-9), frac = S.t - tick;
    var k = S.mode === "live" ? S.k : S.keyAt(tick);
    if (k !== S.k || force) S.setKey(k);
    if (S.mode === "live") { if (S.spec.live && S.spec.live.draw) S.spec.live.draw(S.api, S.live); }
    else if (S.spec.draw && (force || tick !== S.drawnTick || S.spec.smooth)) { S.spec.draw(S.api, tick, S.spec.smooth ? frac : 0); S.drawnTick = tick; }
    S.syncBar();
  };
  SP.setKey = function (k) {
    var S = this; S.k = k;
    S.keys.forEach(function (key, i) { if (key.li) key.li.classList.toggle("on", i === k); });
    // keyed parts wait for the arrival, so the first step's parts also animate in front of the reader
    var live = S.arrived || REDUCE;
    S.keyed.forEach(function (o) { o.e.classList.toggle("on", live && k >= o.lo && k <= o.hi); });
    S.fig.setAttribute("data-key", S.keys[k].name);
    if (S.spec.onKey) S.spec.onKey(S.api, k, S.keys[k].name);
  };
  SP.syncBar = function () {
    var S = this, m = S.keys.length, live = S.mode === "live";
    var txt = live ? "live" : "step " + (S.k + 1) + " of " + m;
    if (S.nEl.textContent !== txt) S.nEl.textContent = txt;
    S.prevB.disabled = !live && S.k <= 0 && S.t <= S.keys[0].at;
    S.nextB.disabled = !live && S.k >= m - 1;
    S.pips.forEach(function (p, i) {
      var cur = !live && i === S.k;
      if (cur) p.setAttribute("aria-current", "step"); else p.removeAttribute("aria-current");
      p.classList.toggle("done", !live && i < S.k);
    });
    // replay appears once the scene has played (or been stepped), never on a first frame that is still waiting its turn
    S.replayB.classList.toggle("idle", S.mode === "auto" || !S.played || REDUCE);
  };
  /* show one tick, still */
  SP.show = function (tick) { this.stop(); this.mode = "still"; this.live = null; this.t = tick; this.render(true); };

  /* ---------- the clock ---------- */
  SP.stop = function () { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; };
  SP.run = function () {
    var S = this; if (S.raf || !S.visible) return;
    S.last = 0;
    S.raf = requestAnimationFrame(function f(now) {
      S.raf = 0;
      var dt = S.last ? Math.min(100, now - S.last) : 0; S.last = now;
      var more = S.mode === "live" ? S.tickLive(dt) : S.advance(dt);
      S.render(false);
      if (more && S.visible) S.raf = requestAnimationFrame(f);
      else if (!more) S.finish();
    });
  };
  /* timeline time: move toward the target, holding at each step on the way during the autoplay */
  SP.advance = function (dt) {
    var S = this;
    if (S.holdLeft > 0) { S.holdLeft -= dt; return true; }
    var nt = S.t + dt * S.tps / 1000;
    if (S.mode === "auto") {
      for (var i = 0; i < S.keys.length; i++) {
        var a = S.keys[i].at;
        if (a > S.t + 1e-9 && a <= nt && a < S.target) { nt = a; S.holdLeft = S.holdAt(i); break; }
      }
    }
    if (nt >= S.target) { S.t = S.target; return false; }
    S.t = nt; return true;
  };
  SP.finish = function () {
    var S = this, was = S.mode;
    if (was === "auto" || was === "seg") { S.mode = "still"; S.render(true); }
    if (was === "auto") { S.fig.dispatchEvent(new CustomEvent("scene:done", { bubbles: true })); kick(); }
  };
  /* play the whole timeline from the start */
  SP.play = function () {
    var S = this; S.queued = false; S.paused = false; S.played = true; S.stop(); S.leaveLive();
    if (REDUCE) { S.show(S.keys[S.restKey].at); return; }
    S.mode = "auto"; S.t = 0; S.target = S.T; S.holdLeft = S.keys[0].at === 0 ? S.holdAt(0) : 0; S.render(true); S.run();
  };
  /* go to step i: forward plays the segment to it; back (or a square) snaps */
  SP.go = function (i, snap) {
    var S = this;
    i = Math.max(0, Math.min(S.keys.length - 1, i));
    var wasLive = S.mode === "live"; S.leaveLive(); S.stop(); S.arrived = true; S.queued = false; S.paused = false; S.played = true;
    var at = S.keys[i].at;
    if (snap || REDUCE || wasLive || at <= S.t) { S.show(at); return; }
    S.mode = "seg"; S.target = at; S.holdLeft = 0; S.run();
  };

  /* ---------- live inputs ---------- */
  SP.toggle = function (id) {
    var S = this, L = S.spec.live; S.arrived = true; S.queued = false; S.paused = false; S.played = true;
    var mom = S.inputBtns[id] && S.inputBtns[id].inp.momentary;
    if (!mom) { S.inputs[id] = !S.inputs[id]; S.syncInputs(); }
    if (!L) { if (S.spec.onInput) S.spec.onInput(S.api, id, mom ? true : S.inputs[id], null); S.render(true); return; }
    if (S.mode !== "live") { S.stop(); S.live = L.start(S.api, Math.floor(S.t)); S.mode = "live"; S.liveAcc = 0; S.setKey(S.k); }
    if (S.spec.onInput) S.spec.onInput(S.api, id, mom ? true : S.inputs[id], S.live);
    S.liveBudget = L.budget || 400;
    if (REDUCE) { while (S.liveBudget-- > 0 && L.step(S.api, S.live) !== false) {} S.render(true); return; }
    S.render(true); S.run();
  };
  SP.tickLive = function (dt) {
    var S = this, L = S.spec.live;
    S.liveAcc += dt * S.tps / 1000;
    while (S.liveAcc >= 1) {
      S.liveAcc -= 1;
      if (L.step(S.api, S.live) === false || --S.liveBudget <= 0) return false;   // settled: stop the clock
    }
    return true;
  };
  SP.leaveLive = function () {
    var S = this; if (S.mode !== "live") return;
    S.live = null; S.mode = "still";
    if (S.spec.inputs) { S.spec.inputs.forEach(function (inp) { S.inputs[inp.id] = !!inp.on; }); S.syncInputs(); }
  };

  /* ---------- arrival: one figure at a time ----------
     A figure arrives when half of it (or 60% of that band's height) sits in the top 65% of the screen, so it starts where
     the reader is looking, not while its top edge is still under the prose above it. If another figure on screen is
     still playing, the newcomer shows its first frame and waits, then starts a beat after that one ends or leaves the
     screen; the highest waiting figure goes first. A figure that has left the reading band while it plays does not hold
     up one that is in it: it pauses where it is and carries on when it comes back into the band. A figure with a hidden
     stepper (an ambient loop, like a hero) never makes another wait. Off screen a figure pauses (see away): it carries on
     when it is back in the band and its turn comes, or, if it never got past its first step, it starts over. */
  var BEAT = 600, kickT = 0;
  function blocking(S) { return S.mode === "auto" && S.visible && !S.ambient; }
  // where a stage sits against the reading band (the top 65% of the screen), measured now rather than at the last
  // observer crossing, which can be a whole notch stale while the reader rests
  function band(S) {
    var r = S.stage.getBoundingClientRect(), bh = root.innerHeight * 0.65;
    var vis = Math.max(0, Math.min(r.bottom, bh) - Math.max(r.top, 0));
    return { top: r.top, share: r.height > 0 ? vis / r.height : 0, vis: vis, bh: bh };
  }
  function inBand(S) { var b = band(S); return b.share >= 0.5 || b.vis >= b.bh * 0.6; }
  // a playing figure keeps the floor only while at least half of it is in the band and its top is still on screen
  function holds(S) { var b = band(S); return b.share >= 0.5 && b.top >= 0; }
  function kick() {
    if (kickT) return;
    kickT = setTimeout(function () {
      kickT = 0;
      var c = scenes.filter(function (S) { return S.queued && inBand(S); });
      if (!c.length) return;
      var b = scenes.filter(blocking);
      if (b.some(holds)) { kick(); return; }   // look again a beat later while one waits in the band
      // the figures still playing are out of the reading band: hold each where it is, to carry on when it returns
      b.forEach(function (o) { o.stop(); o.mode = "still"; o.paused = true; o.queued = true; o.render(true); });
      c.sort(function (a, b) { return a.stage.getBoundingClientRect().top - b.stage.getBoundingClientRect().top; });
      var S = c[0]; S.queued = false;
      if (S.paused) { S.paused = false; S.mode = "auto"; S.target = S.T; S.render(true); S.run(); } else S.play();
    }, BEAT);
  }
  /* a figure that leaves the screen while it plays. Left on its clock, it would carry on at its first pixel back, below
     the reading band and beside whatever else is playing, so a reader coming back from the bottom of the page met every
     figure part-way through. Instead: seen no further than its first step (the reader skimmed past), it forgets that it
     arrived and plays from the start at its next arrival; further along, it pauses where it is and waits its turn in the
     reading band to carry on. A hero loop (ambient) never holds the floor, so it keeps its clock. */
  SP.away = function () {
    var S = this; if (S.ambient) return;
    S.mode = "still";
    if (S.k === 0) { S.t = 0; S.arrived = false; S.played = false; S.queued = false; S.paused = false; S.holdLeft = 0; }
    else { S.paused = true; S.queued = true; }
    S.render(true);
  };
  SP.arrive = function () {
    var S = this; S.arrived = true;
    if (REDUCE) { S.render(true); return; }
    if (scenes.some(function (o) { return o !== S && blocking(o); })) { S.queued = true; S.render(true); kick(); return; }
    S.play();
  };
  SP.observe = function () {
    var S = this, bar = S.fig.querySelector(".sc-bar");
    S.ambient = !!S.spec.ambient || !bar || getComputedStyle(bar).display === "none";
    if (!("IntersectionObserver" in root)) { S.visible = S.inZone = true; if (!REDUCE) { S.arrived = true; S.play(); } return; }
    // on screen at all: the clock runs, or pauses
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var was = S.visible; S.visible = e.isIntersecting;
        if (S.visible && (S.mode === "auto" || S.mode === "seg" || (S.mode === "live" && S.liveBudget > 0))) S.run();
        else if (!S.visible) { S.stop(); if (was && S.mode === "auto") { S.away(); kick(); } }
      });
    }, { threshold: [0] }).observe(S.stage);
    // in the reading band, the top 65% of the screen: the figure arrives, or starts if it is waiting
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var h = e.rootBounds ? e.rootBounds.height : root.innerHeight * 0.65;
        S.inZone = e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= h * 0.6);
        if (S.inZone && !S.arrived) S.arrive();
        else if (S.inZone && S.queued) kick();
        else if (!S.inZone && S.mode === "auto" && scenes.some(function (o) { return o.queued; })) kick();
      });
    }, { rootMargin: "0px 0px -35% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }).observe(S.stage);
  };

  /* ---------- the contents rail: the chapter (and step) you are reading ---------- */
  function spy() {
    var links = [].slice.call(document.querySelectorAll(".dd-toc a[href^='#']"));
    if (!links.length || !("IntersectionObserver" in root)) return;
    var map = [], inBand = {};
    links.forEach(function (a) { var t = document.getElementById(a.getAttribute("href").slice(1)); if (t) map.push({ a: a, t: t }); });
    function pick() {
      var cur = null;
      // the last section (in page order) that reaches the reading line, a third of the way down
      map.forEach(function (m) { if (inBand[m.t.id]) cur = m; });
      if (!cur) return;
      var chap = cur.a.closest(".dd-toc > ol > li");
      map.forEach(function (m) {
        var on = m === cur || (m.a.parentNode === chap && chap.contains(cur.a));
        m.a.classList.toggle("on", on);
        if (m === cur) m.a.setAttribute("aria-current", "location"); else m.a.removeAttribute("aria-current");
      });
      [].forEach.call(document.querySelectorAll(".dd-toc > ol > li"), function (li) { li.classList.toggle("open", li === chap); });
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { inBand[e.target.id] = e.isIntersecting; });
      pick();
    }, { rootMargin: "0px 0px -66% 0px", threshold: 0 });
    map.forEach(function (m) { io.observe(m.t); });
  }

  /* resize: lay every scene out again once the size settles */
  var rz = 0;
  root.addEventListener("resize", function () {
    clearTimeout(rz);
    rz = setTimeout(function () { scenes.forEach(function (s) { s.layout(); s.render(true); }); }, 120);
  });
  /* text labels measure their own width, so place them again once the fonts are in */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { scenes.forEach(function (s) { for (var id in s.labels) s.placeLabel(s.labels[id]); }); });

  if (COARSE) [].forEach.call(document.querySelectorAll(".verb"), function (v) { v.textContent = "tap"; });

  /* the read time in the head (dd[data-read]): the prose at 230 words a minute, plus each figure's autoplay, whose
     steps are paced to be read (their words are counted there, not twice). Same rule on every deep dive. */
  var SKIP = ".dd-rail, .sc-keys, .sc-bar, .sc-in, .sc-art, .srcs-d, .case-nav, .colo, .strip, .skip, .facts, .sr-only, title";
  function readTime() {
    var figMs = 0, words = 0, main = document.getElementById("main") || document.querySelector("main");
    scenes.forEach(function (S) { if (!S.ambient) figMs += S.playMs(); });
    if (main) (function walk(e) {
      for (var c = e.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) words += (c.nodeValue.match(/\S+/g) || []).length;
        else if (c.nodeType === 1 && !c.matches(SKIP)) walk(c);
      }
    })(main);
    var min = Math.round(words / PROSE_WPM + figMs / 60000), dd = document.querySelector("[data-read]");
    if (dd && min > 0) dd.textContent = "about " + min + " minutes";
    return { min: min, words: words, figMs: Math.round(figMs) };
  }

  var Deep = {
    tokens: tokens, reduce: REDUCE, coarse: COARSE, scenes: scenes, readTime: readTime,
    scene: function (id, spec) {
      var fig = typeof id === "string" ? document.getElementById(id) : id;
      if (!fig) return null;
      if (spec.check && !spec.check()) {                               // a failed self-check shows nothing rather than a faked run
        var st = fig.querySelector(".sc-stage"); if (st) st.hidden = true;
        fig.setAttribute("data-check", "fail");
        return null;
      }
      var s = new Scene(fig, spec); scenes.push(s); return s;
    }
  };
  root.Deep = Deep;
  /* read-only hook for checks */
  root.__deep = {
    scenes: function () { return scenes.map(function (s) { return { id: s.id, mode: s.mode, tick: Math.floor(s.t), key: s.keys[s.k].name, step: s.k + 1, of: s.keys.length, pitch: s.pitch, arrived: s.arrived, queued: !!s.queued, paused: !!s.paused, played: !!s.played, inZone: !!s.inZone }; }); },
    toc: function () { var a = document.querySelector(".dd-toc a.on[aria-current]"); return a ? a.getAttribute("href") : null; },
    readTime: readTime,
    /* ok only when every figure.scene on the page passed its own check() and became a Scene with a stepper, so the
       site's case-study contract (which runs every selfCheck it finds) fails a deep dive that hides a figure */
    selfCheck: function () {
      var figs = [].slice.call(document.querySelectorAll("figure.scene")), built = {};
      scenes.forEach(function (s) { built[s.id] = s; });
      var failed = figs.filter(function (f) { return f.getAttribute("data-check") === "fail"; }).map(function (f) { return f.id; });
      var unbuilt = figs.filter(function (f) { return f.getAttribute("data-check") !== "fail" && !built[f.id]; }).map(function (f) { return f.id || "?"; });
      var nobar = scenes.filter(function (s) { return !s.fig.querySelector(".sc-bar"); }).map(function (s) { return s.id; });
      return { ok: figs.length > 0 && !failed.length && !unbuilt.length && !nobar.length, figures: figs.length, scenes: scenes.length,
               failed: failed, unbuilt: unbuilt, nobar: nobar };
    }
  };
  /* the page scripts that build the scenes run before DOMContentLoaded */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { spy(); readTime(); });
  else { spy(); readTime(); }
})(window);
