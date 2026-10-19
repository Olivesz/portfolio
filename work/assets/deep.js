/* deep.js: the Scene component for the deep dives, plus the contents rail's "you are here".

   A scene is a timeline of whole ticks with named steps on it. It plays once on a clock when it arrives on screen
   (see onScreen), a beat after any figure that started before it, holding each step until its words can be read (see
   holdAt); a stepper (prev,
   step n of m, next, one square per step) walks it at the reader's pace; replay plays it again. Optional inputs switch it to a live mode. With reduced motion it shows its
   key frame and keeps the stepper. Native buttons only: no wheel, touch or key listeners.

   Usage, from a page script that runs after this file:
     Deep.scene("sc-wire", { grid: { cols: 40, rows: 7, pitch: 8 }, ticks: 48, tps: 8,
                              draw: function (api, tick, frac) { ... } });
   The figure's <ol class="sc-keys"> lists the steps: <li data-key="name" data-at="tick">words</li>. A step keyed to the
   end of the action it describes may also say where that action starts, data-lead="tick": its words then come up as
   the action begins (on the clock or a next click), not after it has played under the previous step's words. */
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
  /* trade the classes `from` named for the ones `to` names, keeping any other class on the element */
  function swapClass(e, from, to) {
    var a = from.split(" "), b = to.split(" ");
    a.forEach(function (c) { if (c && b.indexOf(c) < 0) e.classList.remove(c); });
    b.forEach(function (c) { if (c) e.classList.add(c); });
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
      var ld = li.getAttribute("data-lead");
      return { li: li, name: li.getAttribute("data-key") || ("k" + i), at: +(li.getAttribute("data-at") || 0), lead: ld === null ? null : +ld, text: li.textContent.trim(), words: li.textContent.trim().split(/\s+/).length };
    });
    if (!S.keys.length) S.keys = [{ li: null, name: "k0", at: 0, lead: null, text: "" }];
    S.keys.sort(function (a, b) { return a.at - b.at; });
    // a lead sits after the step before it and before its own tick; anything else is dropped
    S.keys.forEach(function (k, i) {
      if (k.lead === null || isNaN(k.lead) || !i) { k.lead = null; return; }
      k.lead = Math.max(S.keys[i - 1].at + 1, Math.round(k.lead));
      if (k.lead >= k.at) k.lead = null;
    });
    S.T = Math.max(spec.ticks || 0, S.keys[S.keys.length - 1].at);
    S.tps = spec.tps || 8;
    S.pause = spec.pause !== undefined ? spec.pause : 1400;           // the least a step is held during the autoplay, in ms
    /* every step is held until its words can be read at 230 a minute (261 ms a word, plus 300 ms to look from the
       frame to the words), less the time the frames take to reach the next step, so no step leaves the screen before
       it can be read. One rule for every deep dive; an ambient loop (a hero) keeps its own pause. */
    S.holdAt = function (i) {
      var k = S.keys[i], pre = i && i === S.startKey ? S.span(S.wordsAt(i), k.at) : 0;   // a start step's lead never plays
      return S.ambient ? S.pause : Math.max(S.pause, (k.words ? LOOK_MS + k.words * READ_MS : 0) - (S.wordsMs(i) - pre));
    };
    S.restKey = spec.rest !== undefined ? S.idx(spec.rest) : S.keys.length - 1;
    /* spec.start names the step the autoplay starts on (default the first): a hero whose opening steps are an empty
       stage starts where its subject is on screen, and prev still reaches the steps before it */
    S.startKey = spec.start !== undefined ? S.idx(spec.start) : 0;
    S.startAt = S.startKey ? S.keys[S.startKey].at : 0;

    /* keyed DOM parts: data-from / data-until / data-only name a step. A part that also carries data-ghost stands as a
       faint preview in the tokens (deep.css) until its step, and before the figure arrives, so a figure never opens on
       an empty stage; give it only to parts in a region of their own, so no preview prints under another part's words */
    S.keyed = [].slice.call(fig.querySelectorAll("[data-from],[data-until],[data-only]")).map(function (e) {
      var f = e.getAttribute("data-from"), u = e.getAttribute("data-until"), a = e.getAttribute("data-only");
      return { e: e, lo: a ? S.idx(a) : f ? S.idx(f) : 0, hi: a ? S.idx(a) : u ? S.idx(u) : 1e9, ghost: e.hasAttribute("data-ghost") };
    });

    S.canvas = null; S.labels = {}; S.hits = []; S.inputs = {}; S.inputBtns = {};
    if (spec.grid) { S.canvas = S.art.querySelector("canvas") || mk("canvas", "", S.art); S.canvas.setAttribute("aria-hidden", "true"); }
    S.buildControls();

    S.t = 0; S.k = 0; S.wk = 0; S.mode = "idle"; S.target = 0; S.holdLeft = 0; S.raf = 0; S.last = 0; S.visible = false; S.arrived = false;
    S.queued = false; S.paused = false; S.played = false;
    S.live = null; S.liveAcc = 0; S.drawnTick = -1;
    S.api = S.makeApi();
    if (spec.init) spec.init(S.api);
    S.layout();
    S.show(REDUCE ? S.keys[S.restKey].at : S.startAt);
    S.observe();
  }
  var SP = Scene.prototype;

  /* the clock's time from tick a to tick b during the autoplay; a scene marked quick runs stretches with no step within
     4 ticks at 3x (its page supplies that advance) */
  SP.span = function (a, b) {
    var g = b - a, S = this;
    return S.quick && g > 4 ? ((g - 4) / (3 * S.tps) + 4 / S.tps) * 1000 : g / S.tps * 1000;
  };
  // the frames after step i: to the next step, or for the last step to the end of the timeline
  SP.travelMs = function (i) { var nx = this.keys[i + 1]; return this.span(this.keys[i].at, nx ? nx.at : this.T); };
  // where step i's words come up: its lead, or its own tick
  SP.wordsAt = function (i) { var k = this.keys[i]; return k.lead !== null ? k.lead : k.at; };
  // the step whose words show at time t
  SP.wordKey = function (t) { var w = 0; for (var i = 0; i < this.keys.length; i++) if (this.wordsAt(i) <= t + 1e-9) w = i; return w; };
  // the frames that play under step i's words, besides its hold: from its lead to its tick, then on to the next lead
  SP.wordsMs = function (i) {
    var nx = this.keys[i + 1];
    return this.span(this.wordsAt(i), this.keys[i].at) + this.span(this.keys[i].at, nx ? this.wordsAt(i + 1) : this.T);
  };
  /* one whole autoplay, in ms: the frames' travel, each step's hold, and the last step's words */
  SP.playMs = function () {
    var S = this, n = S.keys.length, last = S.keys[n - 1];
    var ms = S.span(S.startAt, S.keys[S.startKey].at) + S.span(last.at, S.T) + (last.words ? LOOK_MS + last.words * READ_MS : 0);
    for (var i = S.startKey; i < n - 1; i++) ms += S.holdAt(i) + S.travelMs(i);
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
    // a 1 px rule over the stage's bottom edge that fills as the scene plays, so a long scene shows how far along it is
    S.prog = mk("div", "sc-prog"); S.prog.setAttribute("aria-hidden", "true"); S.progI = mk("i", "", S.prog);
    S.stage.parentNode.insertBefore(S.prog, S.stage.nextSibling); S.progPx = -1; S.progOn = false;
    // prev and next count from the words on screen, which may already be the next step's while its action plays
    S.prevB.addEventListener("click", function () { var i = Math.max(0, S.wk - 1); S.go(i, true); S.reveal(i); });
    S.nextB.addEventListener("click", function () { var i = Math.min(S.keys.length - 1, Math.max(S.k, S.wk) + 1); S.go(i, false); S.reveal(i); });
    S.replayB.addEventListener("click", function () { S.play(); });
    S.pips.forEach(function (p, i) { p.addEventListener("click", function () { S.reveal(i); }); });
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
      /* a DOM label at cell (x, y): o.align left|center|right, o.dy/o.dx in px, o.cls "" | "i" | "a" | "r" (13 px readout).
         The class follows o.cls on every call, so a label drawn muted lights when its step asks for ink; a class the page
         adds to the element itself is left alone. */
      label: function (id, text, x, y, o) {
        o = o || {};
        var L = S.labels[id], want = o.cls === "r" ? "sc-r" : "sc-l" + (o.cls ? " " + o.cls : "");
        if (!L) { L = S.labels[id] = { e: mk("span", want, S.art), cls: want }; L.e.setAttribute("aria-hidden", "true"); }
        else if (L.cls !== want) { swapClass(L.e, L.cls, want); L.cls = want; }
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
      get key() { return S.keys[S.k].name; }, get keyIndex() { return S.k; }, get words() { return S.keys[S.wk].name; }, get tick() { return Math.floor(S.t); }, get mode() { return S.mode; }
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
    var left = (o.align === "center" ? cx - w / 2 : o.align === "right" ? cx - w : cx) + (o.dx || 0);
    if (this.inset) left = Math.max(this.inset[0], Math.min(left, this.inset[2] - this.inset[1] - w));   // a bled grid's words stay off the screen's edge
    L.e.style.left = Math.round(left) + "px";
    L.e.style.top = Math.round(oy + L.y * p + (o.dy || 0)) + "px";
  };

  /* ---------- layout: the largest whole pitch that fits, a canvas of whole device pixels, snapped to the pixel grid ---------- */
  SP.layout = function () {
    var S = this, spec = S.spec, g = spec.grid;
    S.padT = (spec.space && spec.space.top) || 0; S.padB = (spec.space && spec.space.bottom) || 0;
    S.padL = (spec.space && spec.space.left) || 0; S.padR = (spec.space && spec.space.right) || 0;
    /* a phone narrower than the one a grid was drawn for (360 to 383 px): a grid a few pixels wider than the text column
       at its phone pitch overhangs it by at most 4 px a side (the stage takes the gutters, its rules stay at the
       column), which keeps it inside its frame's corners; a wider one keeps to the column and draws at the largest
       pitch of whole device pixels that fits (3.5 CSS px for 4 on a 2x screen), so no grid runs into its corners or
       toward the screen's edge. Only a 1x screen, where that pitch would lose a quarter, still takes the gutters, and
       there its labels keep 12 px from the screen's edges (S.inset, placeLabel). A grid whose rows depend on its pitch
       reads it as grid.at. */
    S.fig.classList.remove("bleed");
    var phone = root.innerWidth < 768, devPitch = 0;
    S.dpr = dprInt();
    if (g && g.pitchPhone && phone) {
      var col = Math.floor(S.stage.clientWidth), need = g.cols * g.pitchPhone + S.padL + S.padR;
      var dev = Math.floor((col - S.padL - S.padR) * S.dpr / g.cols) / S.dpr;
      if (col < need && need > col + 8 && dev >= g.pitchPhone * 0.875) devPitch = dev;
      else if (col < need && root.innerWidth - 8 >= need) S.fig.classList.add("bleed");
    }
    var avail = Math.floor(S.stage.clientWidth);
    if (g) {
      var want = phone && g.pitchPhone ? g.pitchPhone : g.pitch || 8;
      var fit = Math.floor((avail - S.padL - S.padR) / g.cols);
      S.pitch = Math.max(g.min || 2, Math.min(want, devPitch || fit));
      S.dp = Math.round(S.pitch * S.dpr); g.at = S.pitch;
      var cw = g.cols * S.pitch, ch = g.rows * S.pitch;
      S.canvas.width = g.cols * S.dp; S.canvas.height = g.rows * S.dp;
      S.canvas.style.width = cw + "px"; S.canvas.style.height = ch + "px";
      S.canvas.style.position = "absolute"; S.canvas.style.left = S.padL + "px"; S.canvas.style.top = S.padT + "px";
      S.ctx = S.canvas.getContext("2d"); S.ctx.imageSmoothingEnabled = false;
      if (spec.rows === inkRows || spec.ink) inkTrack(S);
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
    S.inset = null;
    if (S.fig.classList.contains("bleed")) {
      var ar = S.art.getBoundingClientRect();
      S.inset = [Math.max(0, Math.ceil(12 - ar.left)), Math.max(0, Math.ceil(ar.right - (root.innerWidth - 12))), ar.width];
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
    S.progW = S.prog.clientWidth; S.progPx = -1;              // the column's width, bleed or not
    S.fitPips();
    S.dock();
  };
  /* phone: the step squares keep one row. Each keeps its full tap target (24 px, 32 on touch); when n of them are wider
     than the row, neighbouring targets overlap a little, so the squares sit closer but never wrap a lone one onto a
     second row. The row starts half a target left of the column (deep.css), so the first square lines up with it. */
  SP.fitPips = function () {
    var S = this, n = S.pips.length;
    S.fig.style.removeProperty("--pip-ov");
    if (n < 2 || root.innerWidth >= 768) return;
    var bar = S.fig.querySelector(".sc-bar"), base = COARSE ? 32 : 24, row = bar.clientWidth + (base - 8) / 2;
    // a short screen keeps the squares on the stepper's one row: they get what prev, the count, next and replay leave
    if (getComputedStyle(bar).display !== "grid") {
      row = bar.clientWidth;
      [].forEach.call(bar.children, function (c) { if (!c.classList.contains("sc-pips")) row -= c.offsetWidth + 8; });
    }
    if (n * base <= row) return;
    var step = Math.floor((row - base) / (n - 1));
    if (step >= 24) S.fig.style.setProperty("--pip-ov", (step - base) + "px");
  };

  /* phone: a scene whose art, words and stepper do not fit one screen under the strip docks its words and stepper to
     the bottom of the screen while it is on screen, so the step being described and its words are always in view
     together, and the try-it inputs move under the stepper */
  // the strip's height while it stays at the top of the screen (on a phone held sideways it scrolls away, see deep.css,
  // and only the road bar, where a page has one, stays there)
  function stripH() {
    var s = document.querySelector(".strip"), b = document.querySelector(".lx-bar");
    if (s && getComputedStyle(s).position === "sticky") return s.offsetHeight;
    return b && getComputedStyle(b).display !== "none" ? b.offsetHeight : 0;
  }
  // a screen that docks: a phone, or any screen under 500 px tall (a phone held sideways), as deep.css's docked rules
  function dockable() { return root.innerWidth < 768 || root.innerHeight < 500; }
  /* the screen a scene must fit to stay in the flow: the shortest this width has shown, with a phone's toolbar out
     (100svh, where the browser knows it). The toolbar slides away and back as the reader turns, which changes the
     height and fires resize; deciding against the shortest screen means it never re-docks a scene under the reader.
     A new width (a rotation, a window dragged) starts again. */
  var shortW = -1, shortH = Infinity;
  function shortest() {
    var w = root.innerWidth, h = root.innerHeight;
    if (root.CSS && CSS.supports && CSS.supports("height", "100svh")) {
      var p = mk("div", "", document.body);
      p.style.cssText = "position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none";
      h = Math.min(h, p.getBoundingClientRect().height || h);
      document.body.removeChild(p);
    }
    if (w !== shortW) { shortW = w; shortH = h; } else shortH = Math.min(shortH, h);
    return shortH;
  }
  // the screen under the strip, less 16 px for a stage parked a little below the strip and 8 px under the stepper
  function room() { return shortest() - stripH() - 24; }
  // from the top of the stage (its rule) to the bottom of the stepper
  SP.reach = function () {
    var a = this.stage.getBoundingClientRect(), b = this.fig.querySelector(".sc-bar").getBoundingClientRect();
    return b.bottom - a.top;
  };
  /* what a step changes, for a docked scene to keep in view: spec.focus(api, i, name) or spec.focus[name] gives an
     element, a list of them or a selector inside the figure (false: nothing); by default, the keyed parts in the stage
     that turn on at that step. A selector may list narrower choices after "|": the first that fits between the strip
     and the dock is kept (a short screen keeps the part the words name, not the whole block). Parts drawn at no size
     (an empty label) are left out. */
  function shown(list) {
    return [].slice.call(list || []).filter(function (e) { if (!e || !e.getClientRects().length) return false; var r = e.getBoundingClientRect(); return r.width > 0 || r.height > 0; });
  }
  SP.subject = function (i) {
    var S = this, f = S.spec.focus, name = S.keys[i].name, got = null;
    if (typeof f === "function") got = f(S.api, i, name);
    else if (f && typeof f === "object") got = f[name];
    if (got === false) return [];
    if (got === undefined || got === null) got = S.keyed.filter(function (o) { return o.lo === i && S.stage.contains(o.e); }).map(function (o) { return o.e; });
    if (typeof got === "string") {
      var alts = got.split("|");
      for (var j = 0; j < alts.length; j++) { var els = shown(S.fig.querySelectorAll(alts[j])); if (j === alts.length - 1 || (els.length && S.fits(els, i))) return els; }
    }
    if (got && got.nodeType === 1) got = [got];
    return shown(got);
  };
  // these parts fit between the strip and the docked words of step i
  SP.fits = function (els, i) { var b = this.bounds(els, i); return b.bot - b.top <= b.hi - b.lo; };
  /* the docked words' own height at step i: that step's words and the rule over them (deep.css draws the backing to
     this height, so a short step leaves no empty band above the stepper and covers no more of the art than it needs) */
  SP.wordsH = function (i) {
    var k = this.keys[i], keys = this.fig.querySelector(".sc-keys");
    if (!keys) return 0;
    return k && k.li ? k.li.offsetHeight + 1 : keys.getBoundingClientRect().height;
  };
  /* the words and stepper docked at the bottom of the screen at step i (default: the current one): their top edge, in
     px from the top of the screen */
  SP.dockTop = function (i) {
    var bar = this.fig.querySelector(".sc-bar");
    return root.innerHeight - this.wordsH(i === undefined ? this.wk : i) - bar.getBoundingClientRect().height;
  };
  /* the band a step's subject must sit in, between the strip and the dock, and the subject's own extent there */
  SP.bounds = function (els, i) {
    var top = Infinity, bot = -Infinity;
    els.forEach(function (e) { var r = e.getBoundingClientRect(); top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); });
    var m = root.innerHeight < 500 ? 4 : 8;                           // a short screen spares 4 px each side, not 8
    return { top: top, bot: bot, lo: stripH() + m, hi: this.dockTop(i) - m };
  };
  /* a stepper click on a docked phone scene: scroll the least that brings the step's subject between the strip and
     the docked words (a subject taller than that shows its top). A click is the reader's, so the page may move. */
  SP.reveal = function (i, els) {
    var S = this;
    if (!S.fig.classList.contains("docked") || !dockable()) return;
    els = els || S.subject(i); if (!els.length) return;
    var b = S.bounds(els, i), dy = 0;
    if (b.bot > b.hi) dy = b.bot - b.hi;
    if (b.top - dy < b.lo) dy = b.top - b.lo;
    if (Math.abs(dy) < 2) return;
    root.scrollBy({ top: Math.round(dy), left: 0, behavior: REDUCE ? "auto" : "smooth" });
  };
  SP.dock = function () {
    var S = this, fig = S.fig, bar = fig.querySelector(".sc-bar");
    if (!bar || S.spec.ambient) return;
    fig.classList.remove("docked");
    if (!dockable() || getComputedStyle(bar).display === "none") return;
    if (S.reach() <= room()) return;
    fig.classList.add("docked");                                      // the words sit right on top of the docked stepper
    fig.style.setProperty("--dock-b", Math.floor(bar.getBoundingClientRect().height) + "px");
    var keys = fig.querySelector(".sc-keys");
    if (keys) fig.style.setProperty("--keys-h", Math.ceil(keys.getBoundingClientRect().height) + "px");
    S.dockWords();
  };
  /* a docked scene's backing follows the step on screen: the words area keeps the longest step's height in the page's
     flow (so nothing below the figure moves), but only the current step's words are drawn on the void */
  SP.dockWords = function () {
    if (this.fig.classList.contains("docked")) this.fig.style.setProperty("--dock-h", this.wordsH(this.wk) + "px");
    this.rowMask();
  };
  /* a docked scene's art meets its words a row at a time: a row of the art that the words' backing would cut in two (a
     line of text, a chip, a short boxed row) is clipped whole, the art's lower edge stepping up to that row's top over
     the row's own width only, so a column beside it keeps its rows; the reader never stops on a half-drawn row, and the
     row comes back whole once it clears the words */
  var ROW_MAX = 64;
  /* the painted rows of a canvas scene that declares rows: Deep.inkRows (or ink: true, for a rows function that adds
     its own to them). Every filled rectangle the scene paints is noted
     in a map of CSS pixels (a fill of the whole canvas starts it again; a fill in the ground colour
     takes its area back), and each column's runs of ink no taller than ROW_MAX are its rows, side by side runs of the
     same height joined into one. Strokes are left out: a line a pixel or two across is not a row. */
  function inkTrack(S) {
    var g = S.spec.grid, c = S.ctx;
    var w = Math.ceil(g.cols * S.pitch), h = Math.ceil(g.rows * S.pitch);
    S.ink = { cols: w, h: h, cw: S.dp / S.pitch, ys: S.dp / S.pitch, m: new Uint8Array(w * h), rows: null };
    if (c.__ink) { c.__ink = S.ink; return; }
    var raw = c.fillRect;
    c.__ink = S.ink;
    c.fillRect = function (x, y, w, h) {
      raw.call(c, x, y, w, h);
      var I = c.__ink, cw = c.canvas.width, ch = c.canvas.height;
      if (!I) return;
      I.rows = null;
      if (x <= 0 && y <= 0 && x + w >= cw && y + h >= ch) { I.m.fill(0); return; }
      if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
      if (I.bare === undefined) { var was = c.fillStyle; c.fillStyle = tokens().void || "#000"; I.bare = c.fillStyle; c.fillStyle = was; }
      var bare = c.fillStyle === I.bare;
      if (bare && c.globalAlpha < 0.5) return;
      var c0 = Math.max(0, Math.floor(x / I.cw)), c1 = Math.min(I.cols, Math.ceil((x + w) / I.cw));
      var y0 = Math.max(0, Math.floor(y / I.ys)), y1 = Math.min(I.h, Math.ceil((y + h) / I.ys)), v = bare ? 0 : 1;
      for (var cx = c0; cx < c1; cx++) for (var yy = y0; yy < y1; yy++) I.m[yy * I.cols + cx] = v;
    };
  }
  function inkRows(api) {
    var I = api.scene.ink, p = api.scene.pitch || 1;
    if (!I) return [];
    if (I.rows) return I.rows;
    var out = [], open = {};
    for (var cx = 0; cx < I.cols; cx++) {
      var now = {};
      for (var y = 0; y < I.h; y++) {
        if (!I.m[y * I.cols + cx]) continue;
        var t = y; while (y + 1 < I.h && I.m[(y + 1) * I.cols + cx]) y++;
        if (y + 1 - t > ROW_MAX) continue;
        var key = t + ":" + (y + 1), q = open[key];
        if (q && q[4] === cx) { q[2] += 1 / p; q[4]++; } else { q = [cx / p, t / p, 1 / p, (y + 1 - t) / p, cx + 1]; out.push(q); }
        now[key] = q;
      }
      open = now;
    }
    return (I.rows = out);
  }
  // the rows of the art with any part between lo and hi: boxes (tol 2: a box that only shares a border with the edge
  // stays) and lines of text (tol 0.5)
  function rowAtoms(stage, lo, hi) {
    var out = [], els = stage.querySelectorAll("*"), rg = document.createRange(), gone = [];
    for (var i = 0; i < els.length; i++) {
      var e = els[i], r = e.getBoundingClientRect();
      if (!r.height || r.top >= hi || r.bottom <= lo) continue;
      // a part inside a faded-out group draws nothing either
      if (gone.some(function (g) { return g.contains(e); })) continue;
      var c = getComputedStyle(e);
      if (+c.opacity === 0) { gone.push(e); continue; }
      if (c.visibility === "hidden") continue;
      var boxed = r.height <= ROW_MAX && (/^(CANVAS|SVG|svg|IMG|INPUT|BUTTON)$/.test(e.tagName) || c.backgroundColor !== "rgba(0, 0, 0, 0)" ||
        parseFloat(c.borderTopWidth) > 0 || parseFloat(c.borderLeftWidth) > 0 || parseFloat(c.borderBottomWidth) > 0);
      if (boxed) { out.push({ l: r.left, r: r.right, t: r.top, b: r.bottom, tol: 2 }); continue; }
      for (var t = e.firstChild; t; t = t.nextSibling) {
        if (t.nodeType !== 3 || !/\S/.test(t.nodeValue)) continue;
        rg.selectNodeContents(t);
        var ls = rg.getClientRects();
        for (var j = 0; j < ls.length; j++) if (ls[j].bottom > lo && ls[j].top < hi) out.push({ l: ls[j].left, r: ls[j].right, t: ls[j].top, b: ls[j].bottom, tol: 0.5 });
      }
    }
    return out;
  }
  SP.rowMask = function () {
    var S = this, fig = S.fig, keys = fig.querySelector(".sc-keys"), clip = "";
    if (fig.classList.contains("docked") && keys && S.stage && dockable()) {
      // the backing's top edge: deep.css draws 4 px of void above the rule over the words
      var dh = parseFloat(fig.style.getPropertyValue("--dock-h")) || 0;
      var D = keys.getBoundingClientRect().bottom - dh - 4, st = S.stage.getBoundingClientRect();
      if (D > st.top && D < st.bottom && st.bottom > 0 && st.top < root.innerHeight) {
        var atoms = rowAtoms(S.stage, D - 3 * ROW_MAX, D), steps = [], level;
        // a canvas is one tall element to the DOM, so a scene names the rows it paints: spec.rows(api) gives
        // [x, y, w, h] bands in cells, each kept whole like a boxed row
        if (S.spec.rows && S.canvas) {
          var cr = S.canvas.getBoundingClientRect(), p = S.pitch || 1;
          (S.spec.rows(S.api) || []).forEach(function (q) {
            var t = cr.top + q[1] * p, b = cr.top + (q[1] + q[3]) * p;
            if (b > D - 3 * ROW_MAX && t < D) atoms.push({ l: cr.left + q[0] * p, r: cr.left + (q[0] + q[2]) * p, t: t, b: b, tol: 2 });
          });
        }
        // the edge over a row's width: the backing's edge, or the top of a clipped row it overlaps
        level = function (a) { var y = D; steps.forEach(function (q) { if (q.r - a.l > 1 && a.r - q.l > 1) y = Math.min(y, q.t); }); return y; };
        // a row the edge cuts is clipped from its top; a row the stepped edge cuts in turn goes too
        for (var n = 0, more = true; n < 8 && more; n++) {
          more = false;
          atoms.forEach(function (a) {
            if (a.done) return;
            var y = level(a), tol = n ? a.tol : 0.5;
            if (a.t < y - tol && a.b > y + tol) { a.done = more = true; steps.push(a); }
          });
        }
        if (steps.length) {
          var d = dprInt(), W = st.width, xs = [-200, W + 200], pts = [];
          var px = function (v) { return Math.round(v * d) / d + "px"; };
          steps.forEach(function (q) { xs.push(Math.max(-200, q.l - st.left), Math.min(W + 200, q.r - st.left)); });
          xs = xs.sort(function (a, b) { return a - b; }).filter(function (x, i, a) { return !i || x > a[i - 1]; });
          pts.push("-200px -200px", px(W + 200) + " -200px");
          for (var k = xs.length - 1; k > 0; k--) {
            var m = st.left + (xs[k] + xs[k - 1]) / 2, y = D;
            steps.forEach(function (q) { if (q.l < m && q.r > m) y = Math.min(y, q.t); });
            y = Math.floor((y - st.top) * d) / d;
            pts.push(px(xs[k]) + " " + y + "px", px(xs[k - 1]) + " " + y + "px");
          }
          clip = "polygon(" + pts.join(",") + ")";
        }
      }
    }
    if (clip !== S.maskClip) { S.maskClip = clip; S.stage.style.clipPath = clip; }
  };

  /* ---------- rendering one moment ---------- */
  SP.render = function (force) {
    var S = this, tick = Math.floor(S.t + 1e-9), frac = S.t - tick;
    var k = S.mode === "live" ? S.k : S.keyAt(tick);
    if (k !== S.k || force) S.setKey(k);
    var wk = S.mode === "live" ? S.k : Math.max(k, S.wordKey(S.t));
    if (wk !== S.wk || force) S.setWords(wk);
    if (S.mode === "live") { if (S.spec.live && S.spec.live.draw) S.spec.live.draw(S.api, S.live); }
    else if (S.spec.draw && (force || tick !== S.drawnTick || S.spec.smooth)) { S.spec.draw(S.api, tick, S.spec.smooth ? frac : 0); S.drawnTick = tick; }
    S.syncBar();
    S.syncProg();
    if (S.fig.classList.contains("docked")) S.rowMask();
  };
  /* the autoplay's own clock, in ms, from its start to tick t: each stretch between steps, and each step's hold that is
     done (the one it sits on counts what has passed of it). A step at the very end gets no hold, as in advance(). */
  SP.clockAt = function (t, holdLeft) {
    var S = this, ms = 0, prev = S.startAt;
    for (var i = S.startKey; i < S.keys.length; i++) {
      var a = S.keys[i].at; if (a > t + 1e-9) break;
      ms += S.span(prev, a); prev = a;
      var h = (i === 0 && a === 0) || (a > 0 && a < S.T) ? S.holdAt(i) : 0;
      ms += a < t - 1e-9 ? h : Math.max(0, h - Math.max(0, holdLeft));
    }
    return ms + S.span(prev, Math.max(prev, t));
  };
  /* the progress rule: shown while the scene plays on its own, its length the share of the autoplay's clock gone, in
     whole pixels; when the play ends it fades out at full length */
  SP.syncProg = function () {
    var S = this, on = S.mode === "auto" && !S.ambient && !REDUCE;
    if (on) {
      if (S.clockMs === undefined) S.clockMs = S.clockAt(S.T, 0);
      var px = S.clockMs > 0 ? Math.round(S.progW * Math.min(1, S.clockAt(S.t, S.holdLeft) / S.clockMs)) : 0;
      if (px !== S.progPx) { S.progPx = px; S.progI.style.width = px + "px"; }
    }
    if (on !== S.progOn) { S.progOn = on; S.prog.classList.toggle("on", on); }
  };
  /* the words on screen, and the stepper's count, follow the step being read (see data-lead) */
  SP.setWords = function (wk) {
    var S = this; S.wk = wk;
    S.keys.forEach(function (key, i) { if (key.li) key.li.classList.toggle("on", i === wk); });
    S.dockWords();
  };
  SP.setKey = function (k) {
    var S = this; S.k = k;
    // keyed parts wait for the arrival, so the first step's parts also animate in front of the reader; a ghosted part
    // waits as its preview, and when its step comes it fades in from nothing in its own colours, not by a colour swap
    var live = S.arrived || REDUCE;
    S.keyed.forEach(function (o) {
      var on = live && k >= o.lo && k <= o.hi, e = o.e;
      e.classList.toggle("on", on);
      if (!o.ghost) return;
      var gh = !on && (k < o.lo || (!S.arrived && k <= o.lo));
      if (!gh && on && e.classList.contains("ghost") && !REDUCE) {
        e.classList.add("rv"); e.getBoundingClientRect();
        requestAnimationFrame(function () { e.classList.remove("rv"); });
      }
      e.classList.toggle("ghost", gh);
    });
    S.fig.setAttribute("data-key", S.keys[k].name);
    if (S.spec.onKey) S.spec.onKey(S.api, k, S.keys[k].name);
  };
  SP.syncBar = function () {
    var S = this, m = S.keys.length, live = S.mode === "live";
    var txt = live ? "live" : "step " + (S.wk + 1) + " of " + m;
    if (S.nEl.textContent !== txt) S.nEl.textContent = txt;
    S.prevB.disabled = !live && S.k <= 0 && S.t <= S.keys[0].at;
    S.nextB.disabled = !live && S.k >= m - 1;
    S.pips.forEach(function (p, i) {
      var cur = !live && i === S.wk;
      if (cur) p.setAttribute("aria-current", "step"); else p.removeAttribute("aria-current");
      p.classList.toggle("done", !live && i < S.wk);
    });
    // replay appears once the scene has played (or been stepped), never on a frame that is still waiting its turn,
    // whether to start or to carry on
    S.replayB.classList.toggle("idle", S.mode === "auto" || !S.played || S.queued || REDUCE);
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
      // a step not yet held: the clock may sit a hair under a step's tick after summing frame times, so a step within
      // 1e-6 of the clock still holds unless it was the last one held
      for (var i = 0; i < S.keys.length; i++) {
        var a = S.keys[i].at;
        if (a <= nt && a < S.target && (a > S.t + 1e-9 || (a > S.t - 1e-6 && S.heldAt !== a))) { nt = a; S.heldAt = a; S.holdLeft = S.holdAt(i); break; }
      }
    }
    if (nt >= S.target) { S.t = S.target; return false; }
    S.t = nt; return true;
  };
  SP.finish = function () {
    var S = this, was = S.mode;
    if (was === "auto" || was === "seg") { S.mode = "still"; S.render(true); kick(); }   // a figure waiting its turn goes next
    if (was === "auto") S.fig.dispatchEvent(new CustomEvent("scene:done", { bubbles: true }));
  };
  /* play the whole timeline from the start */
  SP.play = function () {
    var S = this; S.queued = false; S.paused = false; S.played = true; S.stop(); S.leaveLive();
    if (REDUCE) { S.show(S.keys[S.restKey].at); return; }
    var a = S.keys[S.startKey].at;
    S.mode = "auto"; S.t = S.startAt; S.target = S.T; S.holdLeft = a === S.t ? S.holdAt(S.startKey) : 0; S.heldAt = a === S.t ? a : -1; S.render(true); S.run();
  };
  /* go to step i: forward plays the segment to it; back (or a square), or a figure off screen, snaps. The last step
     runs on to the end of the timeline, where the autoplay leaves it, so what plays after its words is not lost. */
  SP.go = function (i, snap) {
    var S = this;
    i = Math.max(0, Math.min(S.keys.length - 1, i));
    var wasLive = S.mode === "live"; S.leaveLive(); S.stop(); if (!S.arrived) S.fig.dispatchEvent(new CustomEvent("deep:arrive")); S.arrived = true; S.queued = false; S.paused = false; S.played = true;
    var at = i === S.keys.length - 1 ? S.T : S.keys[i].at;
    if (snap || REDUCE || wasLive || at <= S.t || !S.visible) { S.show(at); return; }
    S.mode = "seg"; S.target = at; S.holdLeft = 0; S.run();
  };

  /* ---------- live inputs ---------- */
  SP.toggle = function (id) {
    var S = this, L = S.spec.live; if (!S.arrived) S.fig.dispatchEvent(new CustomEvent("deep:arrive")); S.arrived = true; S.queued = false; S.paused = false; S.played = true;
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

  /* ---------- arrival: one floor, staggered by a beat ----------
     The floor: 40% of a figure's stage on screen, or a fifth of the screen for a stage taller than that, as on the case
     studies, measured now. It is the one rule for a figure arriving, waiting its turn and already playing, so which
     figures play at a scroll position does not depend on how the reader got there. A figure arrives when it reaches the
     floor, so a reader who stops on it never waits over an unmoving first frame. If another figure is already playing,
     the newcomer shows its first frame and starts one beat (600 ms) later, beside it, rather than waiting for it to end;
     two figures that arrive together start a beat apart, the higher first. A figure that falls below the floor while it
     plays pauses where it is (see away) and carries on, a beat later, once it is back. A figure with a hidden stepper (an
     ambient loop, like a hero) never makes another wait and keeps its own clock. */
  var BEAT = 600, kickT = 0;
  function blocking(S) { return S.mode === "auto" && !S.ambient; }
  function onScreen(S) {
    var r = S.stage.getBoundingClientRect(), h = root.innerHeight;
    var vis = Math.max(0, Math.min(r.bottom, h) - Math.max(r.top, 0));
    return r.height > 0 && (vis / r.height >= 0.4 || vis >= h * 0.2);
  }
  // the next figure waiting on the floor starts a beat from now, the highest first; then the one after it
  function kick() {
    if (kickT) return;
    kickT = setTimeout(function () {
      kickT = 0;
      var c = scenes.filter(function (S) { return S.queued && onScreen(S); });
      if (!c.length) return;
      c.sort(function (a, b) { return a.stage.getBoundingClientRect().top - b.stage.getBoundingClientRect().top; });
      var S = c[0]; S.queued = false;
      if (S.paused) { S.paused = false; S.mode = "auto"; S.target = S.T; S.render(true); S.run(); } else S.play();
      if (c.length > 1) kick();
    }, BEAT);
  }
  /* every figure against the floor, as it stands now: run on each scroll frame, each observer crossing, a layout and
     the end of a play. Those under it are held first, so a newcomer never waits on a figure that is leaving. */
  function sched() {
    if (REDUCE) { scenes.forEach(function (S) { S.inZone = onScreen(S); if (S.inZone && !S.arrived) S.arrive(); }); return; }
    var on = scenes.map(onScreen);
    scenes.forEach(function (S, i) { S.inZone = on[i]; if (!on[i]) S.away(); });
    scenes.forEach(function (S, i) {
      if (!on[i]) return;
      if (!S.arrived) S.arrive(); else if (S.queued) kick();
    });
  }
  var sq = 0;
  function schedSoon() { if (!sq) sq = requestAnimationFrame(function () { sq = 0; sched(); }); }
  /* a figure under the floor. Left on its clock, it would play on unseen, so a reader coming back met it part-way or at
     its end. Instead, while it plays it pauses where it is and waits its turn to carry on. One its own autoplay brought
     no further than the step it starts on (the reader skimmed past) forgets that it arrived: it shows its first frame as
     it was before it arrived, its frame's corners unlit (deep:leave), and plays from the start at its next arrival. A
     figure the reader stepped, or one played to its end, is left as it is. */
  SP.away = function () {
    var S = this; if (S.ambient) return;
    var auto = S.mode === "auto";
    if (auto) { S.stop(); S.mode = "still"; S.paused = true; S.queued = true; }
    if ((auto || S.queued) && S.arrived && S.k <= S.startKey) {
      S.t = S.startAt; S.arrived = false; S.played = false; S.queued = false; S.paused = false; S.holdLeft = 0;
      S.fig.dispatchEvent(new CustomEvent("deep:leave"));
    } else if (!auto) return;
    S.render(true);
  };
  SP.arrive = function () {
    var S = this; S.arrived = true; S.fig.dispatchEvent(new CustomEvent("deep:arrive"));
    if (REDUCE) { S.render(true); return; }
    if (scenes.some(function (o) { return o !== S && blocking(o); })) { S.queued = true; S.render(true); kick(); return; }
    S.play();
  };
  SP.observe = function () {
    var S = this, bar = S.fig.querySelector(".sc-bar");
    S.ambient = !!S.spec.ambient || !bar || getComputedStyle(bar).display === "none";
    if (!("IntersectionObserver" in root)) { S.visible = S.inZone = true; if (!REDUCE) { S.arrived = true; S.play(); } return; }
    // on screen at all: the clock runs, or stops (a step played from the stepper carries on when it is back)
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        S.visible = e.isIntersecting;
        if (S.visible && (S.mode === "auto" || S.mode === "seg" || (S.mode === "live" && S.liveBudget > 0))) S.run();
        else if (!S.visible) S.stop();
      });
      sched();
    }, { threshold: [0] }).observe(S.stage);
    // crossings near the floor, and layout that moves a stage with no scroll: weigh every figure again
    new IntersectionObserver(schedSoon, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.75, 1] }).observe(S.stage);
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
  var rz = 0, laidW = root.innerWidth, laidH = root.innerHeight;
  function relayout() { rz = 0; laidW = root.innerWidth; laidH = root.innerHeight; scenes.forEach(function (s) { s.layout(); s.render(true); }); sched(); }
  root.addEventListener("resize", function () {
    clearTimeout(rz);
    rz = setTimeout(relayout, 120);
  });
  // scrolling moves a docked scene's art under its words: its row mask follows, once a frame, and every figure is
  // weighed against the floor
  var rm = 0;
  root.addEventListener("scroll", function () {
    if (rm) return;
    rm = requestAnimationFrame(function () {
      rm = 0;
      scenes.forEach(function (s) { if (s.fig.classList.contains("docked")) s.rowMask(); });
      sched();
    });
  }, { passive: true });
  // a check that runs while a resize is still settling (or before its event) lays the scenes out first, so it reads the
  // size on screen
  function settle() { if (rz || root.innerWidth !== laidW || root.innerHeight !== laidH) { clearTimeout(rz); relayout(); } }
  /* text labels measure their own width, so place them again once the fonts are in (and the words' height, which
     decides a phone scene's dock, is final). The frame is drawn again too, as relayout does: a page's own label rules
     (keeping a label inside the column, wrapping one that runs long) run in its draw, after the plain placement.
     Once is not enough: fonts.ready can resolve before this file has even loaded (a slow connection, the fonts
     preloaded) or before the faces are in use, and the page scripts add rows to a figure after it is built; so this
     runs again when the page's scripts are done (DOMContentLoaded), when it has loaded, and whenever fonts finish
     loading, and the page's layout no longer depends on which of those came first. */
  function fontsIn() { scenes.forEach(function (s) { for (var id in s.labels) s.placeLabel(s.labels[id]); s.render(true); s.dock(); }); sched(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fontsIn);
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", fontsIn);
  if (document.readyState !== "complete") root.addEventListener("load", fontsIn);

  if (COARSE) [].forEach.call(document.querySelectorAll(".verb"), function (v) { v.textContent = "tap"; });

  /* the read time in the head (dd[data-read]): the prose at 230 words a minute, plus each figure's autoplay, whose
     steps are paced to be read (their words are counted there, not twice). Same rule on every deep dive. */
  var SKIP = ".dd-rail, .sc-keys, .sc-bar, .sc-in, .sc-art, .srcs-d, .case-nav, .colo, .strip, .skip, .facts, .sr-only, title, " +
    ".lx-rail, .lx-bar, .lx-see, .lx-nextch, .lx-shot-bar, .lx-key, .lx-cn, .lx-pair, .lx-nav, .lx-cta";
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
    tokens: tokens, reduce: REDUCE, coarse: COARSE, scenes: scenes, readTime: readTime, inkRows: inkRows,
    /* from a click on a docked phone scene's own controls: bring these elements between the strip and the dock */
    reveal: function (id, els) { scenes.forEach(function (s) { if (s.id === id) s.reveal(0, [].concat(els).filter(Boolean)); }); },
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
    /* ok only when every figure.scene on the page passed its own check() and became a Scene with a stepper, every
       caption and note is in sentence case, and on an upright phone every scene either fits one screen from its stage
       to its stepper or docks its stepper, with what each step changes short enough to sit above the dock, so the
       site's case-study contract (which runs every selfCheck it finds) fails a deep dive that breaks any of them. A
       phone on its side (844x390) is held to the same. */
    selfCheck: function () {
      settle();
      var figs = [].slice.call(document.querySelectorAll("figure.scene")), built = {};
      scenes.forEach(function (s) { built[s.id] = s; });
      var failed = figs.filter(function (f) { return f.getAttribute("data-check") === "fail"; }).map(function (f) { return f.id; });
      var unbuilt = figs.filter(function (f) { return f.getAttribute("data-check") !== "fail" && !built[f.id]; }).map(function (f) { return f.id || "?"; });
      var nobar = scenes.filter(function (s) { return !s.fig.querySelector(".sc-bar"); }).map(function (s) { return s.id; });
      var caps = lowerCaps(), fit = [], under = [];
      if (dockable()) scenes.forEach(function (s) {
        var bar = s.fig.querySelector(".sc-bar");
        if (!bar || s.ambient || getComputedStyle(bar).display === "none") return;
        if (s.fig.classList.contains("docked") ? getComputedStyle(bar).position !== "sticky" : s.reach() > room()) fit.push(s.id);
        // docked: what each step changes fits between the strip and the docked words, so a stepper click can bring
        // all of it into view (see reveal)
        if (s.fig.classList.contains("docked")) s.keys.forEach(function (k, i) {
          var els = s.subject(i); if (!els.length) return;
          var b = s.bounds(els, i);
          if (b.bot - b.top > b.hi - b.lo) under.push(s.id + " " + k.name + " " + Math.round(b.bot - b.top) + ">" + Math.round(b.hi - b.lo));
        });
      });
      return { ok: figs.length > 0 && !failed.length && !unbuilt.length && !nobar.length && !caps.length && !fit.length && !under.length,
               figures: figs.length, scenes: scenes.length, failed: failed, unbuilt: unbuilt, nobar: nobar, caps: caps, fit: fit, under: under };
    }
  };
  /* sentence case: the words after a caption's number, and after each sentence end in a caption or note, start with a
     capital (or a digit or symbol). Reads the rendered text, so a verb capitalised in CSS counts as written. */
  function lowerCaps() {
    var bad = [];
    [].forEach.call(document.querySelectorAll("figcaption, .sc-note"), function (c) {
      if (c.closest(".sr-only") || !c.getClientRects().length) return;
      var t = c.innerText.replace(/\s+/g, " ").trim().replace(/^fig \d+\s*/, "").replace(/\b(e\.g|i\.e|vs)\./g, "$1");
      var starts = t.split(/[.?!]\s+/);
      if (starts.some(function (x) { return /^[a-z]/.test(x); })) bad.push((c.id || c.parentNode.id || "?") + ": " + t.slice(0, 40));
    });
    return bad;
  }
  /* the page scripts that build the scenes run before DOMContentLoaded */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { spy(); readTime(); fontsIn(); });
  else { spy(); readTime(); }
})(window);
