/* freeflow, in depth: the fourteen scenes, drawn from a real pass log. Olivesz/freeflow@19c0217 replays the public JFK
   sample through the shipped streamer (whisper.cpp base.en, greedy, a 350 ms tick, a 3.0 / 1.5 s window) and writes
   every pass to bench/results/9832030/timing/logs/jfk.jsonl. The log is copied below; the rules are a port of
   mac/Sources/FreeflowCore/Streamer.swift, and a self-check re-runs them over the log's passes and must type exactly
   what the log says each pass typed, or no scene draws. Cells are 4 px everywhere; the number of columns follows the
   width of the page, so time axes stretch and text rows keep their size. */
(function () {
  "use strict";
  var PIN = "Olivesz/freeflow@19c0217:";
  var D = PIN + "mac/Sources/Freeflow/Dictation.swift#L", ST = PIN + "mac/Sources/FreeflowCore/Streamer.swift#L",
    EP = PIN + "mac/Sources/FreeflowCore/Endpointing.swift#L", SE = PIN + "mac/Sources/FreeflowCore/Session.swift#L",
    LOGSRC = PIN + "bench/results/9832030/timing/logs/jfk.jsonl#L1-L33";
  function n(v, src) { return '<span data-src="' + src + '">' + v + "</span>"; }
  function pl(v) { return '<span data-src="page:passlog">' + v + "</span>"; }      // read from, or computed over, the pass log
  function rl(v) { return '<span data-src="page:rule">' + v + "</span>"; }         // worked from the rules, no log involved
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function s2(h) { return (h / 100).toFixed(2); }                                   // hundredths of a second, as seconds
  function s1(h) { return (Math.round(h / 10) / 10).toFixed(1); }
  function th(x) { return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  /* ---------------- where you are in the loop: each build step's kicker carries the eight stages, its own lit ---------------- */
  (function () {
    var steps = [].slice.call(document.querySelectorAll("#ch-build > .st"));
    steps.forEach(function (st, i) {
      var k = st.querySelector(".st-k"); if (!k) return;
      var m = document.createElement("span"); m.className = "st-map"; m.setAttribute("aria-hidden", "true");
      steps.forEach(function (_, j) { var q = document.createElement("i"); q.className = j < i ? "d" : j === i ? "on" : ""; m.appendChild(q); });
      k.appendChild(m);
    });
  })();

  /* ---------------- the pass log ---------------- */
  // one row per pass: [audio end, window start, decode ms, hypothesis [[word, start, end]...], committed [[word, start, end]...]]
  // times are integer hundredths of a second, as logged (whisper.cpp times words in hundredths); the hypothesis is
  // the decoder's raw words with the window start added back; empty-string tokens are left out; the last row is the
  // final pass, run when the clip ends
  var LOG = [
    [70,0,30,[],[]],
    [105,0,182,[["\"And",6,68],["so",68,91],["am",91,104],["I!\"",104,200]],[]],
    [140,0,160,[["And",32,42],["so,",42,102],["my",102,137],["fe-",137,170]],[]],
    [175,0,169,[["And",28,33],["so",33,43],["my",43,69],["fellow",69,112],["Americans",112,194]],[["And",28,33]]],
    [210,0,225,[["And",22,33],["so",33,45],["my",45,68],["fellow",68,117],["Americans.",117,200]],[["so",33,45],["my",45,68],["fellow",68,117]]],
    [245,0,214,[["and",10,33],["soul",33,68],["my",68,74],["fellow",74,123],["Americans.",123,250]],[["Americans.",123,245]]],
    [280,0,240,[["And",22,33],["so",33,45],["my",45,68],["fellow",68,117],["Americans!",117,278]],[]],
    [315,0,98,[["And",10,33],["so,",33,68],["my",68,73],["fellow",73,122],["Americans!",122,300]],[]],
    [350,0,109,[["And",22,33],["so",33,45],["my",45,68],["fellow",68,117],["Americans!",117,300]],[]],
    [385,0,122,[["And",31,33],["so",33,68],["my",68,73],["fellow",73,137],["Americans",137,328],["ask",328,400]],[]],
    [420,0,241,[["And",32,38],["so",38,69],["my",69,88],["fellow",88,164],["Americans",164,278],["ask",278,329],["not",329,355],["to...",355,500]],[["ask",278,329]]],
    [455,128,107,[["fellow",137,198],["americans",198,328],["ask",328,403],["not",403,428]],[["not",403,428]]],
    [490,128,86,[["fellow",137,207],["Americans.",207,361],["Ask",361,403],["not.",403,428]],[]],
    [525,128,86,[["fellow",137,207],["Americans.",207,361],["Ask",361,403],["not.",403,428]],[]],
    [560,128,186,[["fellow",137,328],["Americans",328,403],["ask",403,419],["not",419,470],["watch",470,552],["the",552,553],["video.",553,558]],[]],
    [595,128,141,[["fellow",137,198],["americans",198,328],["ask",328,441],["not",441,538]],[]],
    [630,128,96,[["fellow",137,198],["americans",198,328],["ask",328,441],["not",441,538]],[]],
    [665,128,108,[["fellow",137,198],["americans",198,328],["ask",328,441],["not",441,538],["watch",538,565],["your",565,597],["country",597,626],["can",626,658]],[]],
    [700,128,105,[["fellow",137,207],["Americans",207,329],["ask",329,402],["not",402,428],["what",428,490],["your",490,541],["country",541,639],["can",639,663],["do",663,680],["for",680,682],["you.",682,688]],[]],
    [735,128,110,[["fellow",137,207],["Americans",207,329],["ask",329,402],["not",402,428],["what",428,490],["your",490,541],["country",541,639],["can",639,662],["do",662,692],["for",692,704],["you.",704,728]],[["what",428,490],["your",490,541],["country",541,639],["can",639,662],["do",662,692],["for",692,704],["you.",704,728]]],
    [770,554,179,[["your",554,582],["country",582,632],["can",632,653],["do",653,667],["for",667,688],["you.",688,734]],[]],
    [805,554,186,[["your",554,622],["country",622,736],["can",736,784],["do",784,805],["for",805,805],["you.",805,924]],[]],
    [840,554,255,[["your",554,597],["country",597,653],["can",653,680],["do",680,701],["for",701,725],["you.",725,832]],[]],
    [875,554,94,[["your",554,597],["country",597,653],["can",653,680],["do",680,701],["for",701,725],["you.",725,866]],[]],
    [910,554,100,[["your",554,597],["country",597,653],["can",653,680],["do",680,701],["for",701,725],["you.",725,864],["Ask",864,864],["what",864,891],["you...",891,904]],[]],
    [945,554,108,[["What",554,597],["your",597,630],["country",630,701],["can",701,726],["do",726,745],["for",745,771],["you,",771,819],["ask",819,836],["what",836,864],["you",864,891],["can",891,909],["do.",909,946]],[["ask",819,836],["what",836,864]]],
    [980,686,280,[["ask",686,728],["what",728,819],["you",819,827],["can",827,869],["do",869,897],["for",897,944],["you.",944,1000]],[["you",819,827],["can",827,869]]],
    [1015,686,128,[["for",686,719],["you,",719,774],["ask",774,819],["what",819,864],["you",864,891],["can",891,917],["do",917,944],["for",944,976],["your",976,1009],["country.",1009,1014]],[["do",917,944],["for",944,976]]],
    [1050,686,145,[["for",686,715],["you,",715,760],["ask",760,819],["what",819,827],["you",827,863],["can",863,891],["do",891,902],["for",902,930],["your",930,972],["country.",972,1042]],[["your",930,972],["country.",972,1042]]],
    [1085,822,301,[["Ask",822,846],["what",846,891],["you",891,903],["can",903,927],["do",927,944],["for",944,973],["your",973,999],["country.",999,1086]],[]],
    [1100,822,200,[["Ask",822,844],["what",844,874],["you",874,896],["can",896,918],["do",918,933],["for",933,955],["your",955,985],["country.",985,1066]],[]]
  ];
  var REF = "And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.";
  var STREAMED = "And so my fellow Americans. ask not what your country can do for you. ask what you can do for your country.";
  var TICK = 35, MINW = 50, TRIM = 300, CTX = 150;                                // hundredths: Dictation.swift, Session.swift, Streamer.swift

  /* ---------------- the rules: a port of Streamer.swift at 19c0217 ---------------- */
  function nonSpeech(s) { var t = s.trim(); return !t || /[\[\]()♪*]/.test(t) || !/[A-Za-z0-9]/.test(t); }
  function key(s) { return s.toLowerCase().replace(/[^a-z0-9']/g, ""); }
  function norm(s) { return s.trim().toLowerCase(); }
  function Streamer(o) {
    o = o || {}; this.c = []; this.b = []; this.last = 0; this.off = 0;
    this.trimAfter = o.trimAfter || TRIM; this.ctx = o.ctx || CTX; this.timeOnly = !!o.timeOnly;
  }
  // non-speech dropped, times clamped to the window and made absolute
  Streamer.prototype.toWords = function (win, dur) {
    var S = this;
    return win.filter(function (w) { return !nonSpeech(w[0]); }).map(function (w) {
      var e = Math.min(Math.max(w[2], 0), dur), s = Math.min(Math.max(w[1], 0), e);
      return { w: " " + w[0].trim(), s: s + S.off, e: e + S.off, raw: w };
    });
  };
  // the cut, found by text: the longest run of the last four typed words this pass repeats, nearest in time
  Streamer.prototype.anchor = function (ws) {
    var tail = this.c.slice(-4).map(function (w) { return key(w.w); }), keys = ws.map(function (w) { return key(w.w); });
    for (var k = tail.length; k >= 1; k--) {
      if (keys.length < k) continue;
      var run = tail.slice(-k).join("\u0000"), tol = k === 1 ? 100 : 200, best = null;
      for (var p = 0; p <= keys.length - k; p++) {
        if (keys.slice(p, p + k).join("\u0000") !== run) continue;
        var dt = Math.abs(ws[p + k - 1].e - this.last);
        if (dt <= tol && (!best || dt < best.dt)) best = { cut: p + k, dt: dt };
      }
      if (best) return best.cut;
    }
    return null;
  };
  // only when the pass repeats none of them: the time rule (start after the last typed end, less 0.1 s), then the n-gram check
  Streamer.prototype.strip = function (ws) {
    if (!this.c.length || !ws.length) return ws;
    if (!this.timeOnly) { var cut = this.anchor(ws); if (cut !== null) return ws.slice(cut); }
    var S = this, r = ws.filter(function (w) { return w.s > S.last - 10; });
    if (r.length) {
      var tail = S.c.slice(-6).map(function (w) { return key(w.w); }), head = r.slice(0, 6).map(function (w) { return key(w.w); });
      for (var k = Math.min(tail.length, head.length); k > 0; k--) {
        if (tail.slice(-k).join("\u0000") === head.slice(0, k).join("\u0000")) { r = r.slice(k); break; }
      }
    }
    return r;
  };
  Streamer.prototype.agree = function (ws) {
    var got = [], i = 0;
    while (i < ws.length && i < this.b.length && norm(ws[i].w) === norm(this.b[i].w)) { got.push(ws[i]); this.last = ws[i].e; i++; }
    this.c = this.c.concat(got); this.b = ws.slice(i); return got;
  };
  // one live pass; the trim is cut from the last typed word's START, less the context
  Streamer.prototype.process = function (win, dur) {
    var heard = this.strip(this.toWords(win, dur)), got = this.agree(heard), trimmed = false;
    if (this.c.length && this.last - this.off > this.trimAfter) {
      var at = this.c[this.c.length - 1].s - this.ctx;
      if (at > this.off) { this.off = at; trimmed = true; }
    }
    return { heard: heard, got: got, trimmed: trimmed };
  };
  Streamer.prototype.finalize = function (win, dur) {
    var rest = this.strip(this.toWords(win, dur));
    if (rest.length) this.last = rest[rest.length - 1].e;
    this.c = this.c.concat(rest); return { heard: rest, got: rest, trimmed: false };
  };
  function words(a) { return a.map(function (w) { return w.w.trim(); }); }
  function text(st) { return words(st.c).join(" "); }

  /* replay the log's passes through the rules: each pass gets the log's own hypothesis, made relative to the window */
  function replay(o) {
    var st = new Streamer(o), rows = [];
    LOG.forEach(function (p, i) {
      var ws = st.off, win = p[3].map(function (w) { return [w[0], w[1] - ws, w[2] - ws]; }), fin = i === LOG.length - 1;
      var pre = { last: st.last, tail: st.c.slice(-4), wait: st.b.slice(), typedBefore: st.c.slice() };
      var raw = st.toWords(win, p[0] - ws);
      var r = fin ? st.finalize(win, p[0] - ws) : st.process(win, p[0] - ws);
      rows.push({ ae: p[0], ws: ws, ms: p[2], win: p[0] - ws, raw: raw, heard: r.heard, typed: r.got, wait: st.b.slice(), last: st.last,
        off: st.off, trimmed: r.trimmed, final: fin, pre: pre });
    });
    return { rows: rows, st: st };
  }
  var RUN = replay(), ROWS = RUN.rows;
  var BURSTS = ROWS.filter(function (r) { return r.typed.length; });
  var WORDS = RUN.st.c;                                              // the 22 typed words, timed by the pass that typed them
  function row(ae) { return ROWS.filter(function (r) { return r.ae === ae; })[0]; }
  function sum(a, f) { return a.reduce(function (x, r) { return x + f(r); }, 0); }
  var READ_TRIM = sum(ROWS, function (r) { return r.win; }), READ_ALL = sum(ROWS, function (r) { return r.ae; });
  var MAXWIN = Math.max.apply(null, ROWS.map(function (r) { return r.win; }));
  var TRIMS = ROWS.filter(function (r) { return r.trimmed; });

  /* the other way to type: retype each pass's whole guess, backspacing the part that changed (window still at 0) */
  var REFKEYS = {}; REF.split(" ").forEach(function (w) { REFKEYS[key(w)] = 1; });
  var RETYPE = (function () {
    var typed = "", bs = 0, shown = {}, out = [];
    ROWS.slice(0, 11).forEach(function (r) {
      var full = r.raw.map(function (w) { return w.w.trim(); }).join(" ");
      r.raw.forEach(function (w) { if (!REFKEYS[key(w.w)]) shown[w.w] = 1; });
      var j = 0; while (j < typed.length && j < full.length && typed[j] === full[j]) j++;
      var del = typed.length - j; bs += del; typed = full;
      out.push({ ae: r.ae, raw: r.raw, del: del, bs: bs, shown: Object.keys(shown).length });
    });
    return out;
  })();

  /* the pass at 9.80 s under the old time rule: the words it re-timed early are thrown away */
  var P980 = row(980), OLD980 = (function () {
    var st = new Streamer({ timeOnly: true }); st.c = P980.pre.typedBefore.slice(); st.last = P980.pre.last; st.off = P980.ws;
    return st.strip(P980.raw);
  })();

  /* the benchmark's JFK row before the fix (0f70dcd/shipped/summary.csv): the reference, word by word, and what streaming kept */
  var BEFORE = "And so my fellow Americans. ask not. country can for you? Ask what you your country.";
  var LOST = { 7: 1, 8: 1, 11: 1, 17: 1, 18: 1, 19: 1 };              // reference word indices missing from BEFORE

  /* self-checks: these must pass before any scene draws */
  var CHK = {};
  (function () {
    CHK.replay = ROWS.every(function (r, i) {
      return r.ws === LOG[i][1] && JSON.stringify(r.typed.map(function (w) { return [w.w.trim(), w.s, w.e]; })) === JSON.stringify(LOG[i][4]);
    });
    CHK.text = text(RUN.st) === STREAMED && WORDS.length === 22;
    CHK.bursts = BURSTS.map(function (r) { return s2(r.ae) + ":" + words(r.typed).join(" "); }).join("|") ===
      "1.75:And|2.10:so my fellow|2.45:Americans.|4.20:ask|4.55:not|7.35:what your country can do for you.|9.45:ask what|9.80:you can|10.15:do for|10.50:your country.";
    CHK.trims = TRIMS.map(function (r) { return r.ae + ">" + r.off; }).join() === "420>128,735>554,945>686,1050>822" && MAXWIN === 607 &&
      READ_TRIM === 10247 && READ_ALL === 18425;
    var last = RETYPE[RETYPE.length - 1]; CHK.retype = last.bs === 122 && last.shown === 5;
    CHK.old980 = words(OLD980).join(" ") === "do for you." && words(P980.heard).join(" ") === "you can do for you." && words(P980.typed).join(" ") === "you can";
    var kept = REF.split(" ").filter(function (w, i) { return !LOST[i]; });
    CHK.before = kept.map(key).join(" ") === BEFORE.split(" ").map(key).join(" ") && Object.keys(LOST).length === 6;
    CHK.final = ROWS[ROWS.length - 1].final && ROWS[ROWS.length - 1].typed.length === 0 && ROWS[ROWS.length - 1].ae === 1100;
    CHK.ok = Object.keys(CHK).every(function (k) { return CHK[k] === true; });
  })();
  window.__ff = { checks: CHK, rows: ROWS, retype: RETYPE };
  function ok() { return CHK.ok; }

  /* ---------------- drawing helpers ---------------- */
  var C = 4;                                                         // css px per cell, on every screen
  function colsFor(id) { var st = document.querySelector("#" + id + " .sc-stage"); return Math.max(72, Math.floor(Math.min(704, st ? st.clientWidth : 704) / C)); }
  function scene(id, rows, spec) {
    var cols = colsFor(id);
    if (rows instanceof Array) rows = cols < 140 ? rows[1] : rows[0];
    spec.grid = { cols: cols, rows: rows, pitch: C, pitchPhone: C, min: C };
    spec.align = "left";
    spec.check = spec.check || ok;
    return Deep.scene(id, spec);
  }
  function narrow(api) { return api.cols < 140; }
  function lab(api, id, html, x, y, o) {
    o = o || {}; o.html = true; var L = api.scene.labels[id];
    if (L) {
      L.e.hidden = false;                                                                     // unhide first: a hidden label measures 0 wide
      // deep.js sets a label's class when it is made; a label made muted must still light up when its step comes
      var want = o.cls === "r" ? "sc-r" : "sc-l" + (o.cls ? " " + o.cls : "");
      if (L.e.className !== want) L.e.className = want;
    }
    var e = api.label(id, html, x, y, o), max = api.cols * C, l = parseFloat(e.style.left) || 0, w = e.offsetWidth;
    if (l < 0) { e.style.left = "0px"; l = 0; }                                                 // never past the stage's edges
    if (l + w > max + 0.5) {
      if (max - l >= 160) { e.style.whiteSpace = "normal"; e.style.width = Math.floor(max - l) + "px"; }
      else if (w <= max) e.style.left = Math.floor(max - w) + "px";
      else { e.style.left = "0px"; e.style.whiteSpace = "normal"; e.style.width = max + "px"; }
    }
    return e;
  }
  function hide(api, id) { var L = api.scene.labels[id]; if (L) L.e.hidden = true; }
  function hRows(e) { return Math.max(4, Math.ceil(e.offsetHeight / C)); }          // a shown label's height, in cells
  function wrap(api, id, html, x, y, wCells, o) {
    var e = lab(api, id, html, x, y, o); e.style.whiteSpace = "normal"; e.style.width = Math.round(wCells * C) + "px"; return e;
  }
  function hline(api, x0, x1, y, t) { api.rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, t); }
  function vline(api, x, y0, y1, t) { api.rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, t); }
  function dash(api, x0, x1, y, t) { for (var x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 3) api.rect(x, y, Math.min(2, Math.max(x0, x1) - x + 1), 1, t); }
  function vdash(api, x, y0, y1, t) { for (var y = Math.min(y0, y1); y <= Math.max(y0, y1); y += 3) api.rect(x, y, 1, Math.min(2, Math.max(y0, y1) - y + 1), t); }
  function box(api, x, y, w, h, t) { hline(api, x, x + w - 1, y, t); hline(api, x, x + w - 1, y + h - 1, t); vline(api, x, y, y + h - 1, t); vline(api, x + w - 1, y, y + h - 1, t); }

  /* the clip drawn as its words: one solid bar per word, from the time the pass that typed it gave it, and a hairline
     between words. It is not a waveform; the log holds words and times, not audio. Times in hundredths. */
  function spans(api, x0, x1, y, h, t0, t1, o) {
    o = o || {}; var ws = o.words || WORDS;
    for (var x = x0; x <= x1; x++) {
      var t = t0 + (x - x0 + 0.5) / (x1 - x0 + 1) * (t1 - t0);
      if (o.upto !== undefined && t > o.upto) break;
      var hit = -1;
      for (var i = 0; i < ws.length; i++) if (t >= ws[i].s && t < ws[i].e) { hit = i; break; }
      if (hit < 0) { api.rect(x, y + (h - 1) / 2 | 0, 1, 1, o.quiet ? o.quiet(t) : "copper"); continue; }
      var hh = hit % 2 ? h - 2 : h;
      api.rect(x, y + (h - hh) / 2 | 0, 1, hh, o.tint ? o.tint(t, hit) : "v-violet");
    }
  }
  function tx(x0, x1, t0, t1, t) { return Math.round(x0 + (t - t0) / (t1 - t0) * (x1 - x0)); }
  function chips(ws, cls) { return ws.map(function (w) { return '<span class="' + (typeof cls === "function" ? cls(w) : cls) + '">' + esc(w.w !== undefined ? w.w.trim() : w) + "</span>"; }).join(" "); }

  var SRC = {
    tick: n("350", D + "43"), min: n("0.5", SE + "24"), floor: n("0.006", SE + "25"), keep02: n("0.2", EP + "25"),
    trim: n("3.0", ST + "44"), ctx: n("1.5", ST + "44"), khz: n("16", PIN + "mac/Sources/Freeflow/AudioCapture.swift#L3"),
    two: n("2", ST + "26"), greedy: n("greedy", EP + "59-L64"), base: n("base.en", PIN + "bench/README.md#L4"),
    stop: n("1,500", PIN + "mac/Sources/Freeflow/Settings.swift#L29"), grace: n("400", D + "45"),
    key: n("⌥Space", PIN + "mac/Sources/Freeflow/Settings.swift#L20"), chunk: n("20", PIN + "mac/Sources/Freeflow/TextInjector.swift#L15")
  };

  /* ================= S1 · a dictation, start to finish: the JFK replay =================
     Two lanes on one clock. audio: each word where the log times it, faint until the playhead reaches it, violet once
     heard, blue once typed. typed: one block per burst at the moment it was typed, as tall as the words it carried.
     The latest burst is tied back to the words it typed by an underline, a dashed run and a drop to its block. */
  (function () {
    function T(tick) { return (tick - 4) * 5; }                         // hundredths of a second
    var GAP0 = row(455).ae, GAP1 = row(735).ae;                         // the longest stretch with nothing typed
    scene("sc-dictate", [90, 94], {
      ticks: 232, tps: 20, pause: 900,
      draw: function (api, tick) {
        var W = api.cols, t = T(tick), nar = narrow(api), listening = t >= 0 && t < 1100, now = Math.min(t, 1100);
        api.clear();
        api.rect(0, 0, W, 5, "residue");
        var mx = W - 6; api.rect(mx + 1, 1, 2, 2, listening ? "v-blue" : "void"); box(api, mx, 0, 4, 4, listening ? "v-blue" : "muted");
        lab(api, "mb", listening ? '<span class="k-b2">listening</span>' : "menubar", W - 8, 0, { align: "right", dx: 0, dy: 2 });
        box(api, 0, 7, W, 24, "copper"); api.rect(1, 8, W - 2, 3, "residue");
        lab(api, "win", "mail draft · another app", 2, 8, { dy: -1 });
        var done = BURSTS.filter(function (r) { return r.ae <= t; });
        var typed = done.map(function (r) { return words(r.typed).join(" "); }).join(" ");
        wrap(api, "txt", '<span class="k-t">' + esc(typed) + '</span><span class="caret"></span>', 2, 13, W - 4, { cls: "i" });
        var down = tick >= 4 && tick <= 6;
        lab(api, "key", '<span class="' + (down ? "cap on" : "cap") + '">' + SRC.key + "</span> " + (tick < 4 ? "tap to start" : t < 1100 ? "tapped: listening" : "the clip ended: final pass"), 0, 33, { cls: "i" });

        var x0 = 0, x1 = W - 1, t1 = 1120, YA = 44, HA = 8, YR = 70, YB = YR - 3;   // a burst sits on its own green pass tick
        // lane 1: the clip as its words; ahead of the playhead faint, heard violet, typed blue
        lab(api, "la", "audio", 0, 39, {});
        spans(api, x0, x1, YA, HA, 0, t1, { tint: function (tt, i) {
          if (t < 0 || tt > now) return "residue";
          var w = WORDS[i]; return done.some(function (r) { return r.typed.indexOf(w) >= 0; }) ? "v-blue" : "v-violet";
        } });
        // lane 2: a block per burst at the moment it was typed
        lab(api, "lb", "typed", 0, 54, {});
        done.forEach(function (r) { var h = 2 + r.typed.length, x = tx(x0, x1, 0, t1, r.ae); api.rect(x - 1, YB - h + 1, 2, h, "v-blue"); });
        // the latest burst, tied to its words: underline, then a dashed run along the wait, then down to its block
        var cur = done[done.length - 1];
        if (cur) {
          var a = tx(x0, x1, 0, t1, cur.typed[0].s), b = tx(x0, x1, 0, t1, cur.typed[cur.typed.length - 1].e), xb = tx(x0, x1, 0, t1, cur.ae);
          hline(api, a, b, YA + HA + 1, "v-blue");
          if (xb - 1 > b + 1) dash(api, b + 1, xb - 1, YA + HA + 1, "v-blue");
          vline(api, xb, YA + HA + 1, YB - 2 - cur.typed.length, "v-blue");
        }
        // the long wait at 7.35 s: passes ran, none agreed, nothing typed
        var gapOn = api.key === "phrase";
        var g0 = tx(x0, x1, 0, t1, GAP0) + 2, g1 = tx(x0, x1, 0, t1, GAP1) - 3;
        if (gapOn) dash(api, g0, g1, YB, "v-amber");
        var gl = lab(api, "gap", (nar ? pl(s2(GAP1 - GAP0)) + " s" : pl(s2(GAP1 - GAP0)) + " s, nothing typed"), (g0 + g1) / 2 - 1, YB - 6, { align: "center" });
        gl.hidden = !gapOn; gl.style.color = "var(--v-amber)";
        // passes as ticks on the ruler, the ruler, the playhead
        ROWS.forEach(function (r) { if (r.ae <= t) api.rect(tx(x0, x1, 0, t1, r.ae), YR - 2, 1, 2, r.typed.length ? "v-green" : "muted"); });
        api.rect(0, YR, W, 1, "copper");
        for (var s = 0; s <= 11; s++) { if (nar && s % 2) continue; var xs = tx(x0, x1, 0, t1, s * 100); api.rect(xs, YR, 1, 2, "muted"); lab(api, "r" + s, rl(s) + (s === 0 ? " s" : ""), xs, YR + 2, { align: s ? "center" : "left" }); }
        for (var q = 1; q <= 11; q += 2) if (nar) hide(api, "r" + q);
        if (t >= 0) { var xp = tx(x0, x1, 0, t1, now); api.rect(xp, YA - 2, 1, YR - YA + 2, "v-amber"); }
        var ran = ROWS.filter(function (r) { return r.ae <= t; }), lastP = ran[ran.length - 1];
        var ps = lab(api, "ps", lastP ? "pass " + pl(ran.length) + " of " + pl(ROWS.length) + " at " + pl(s2(lastP.ae)) + " s" + (lastP.typed.length ? ' · typed <span class="k-t">' + esc(words(lastP.typed).join(" ")) + "</span>" : lastP.final ? " · final pass: nothing left to type" : " · nothing agreed yet") : "a pass every " + SRC.tick + " ms once there is " + SRC.min + " s of audio", 0, 78, { cls: "i" });
        ps.style.whiteSpace = nar ? "normal" : "nowrap"; if (nar) ps.style.width = W * C + "px";
        var yl = 78 + hRows(ps) + 2, rest = api.key === "rest";
        var m = lab(api, "marks", pl("22") + " of " + pl("22") + " words · " + pl("0") + " errors · backspaces " + pl("0"), 0, yl, { cls: "i" });
        m.hidden = !rest;
        lab(api, "lg", '<span class="k-v">▮</span> heard · <span class="k-b2">▮</span> typed · <span class="k-g">▮</span> a pass that typed', 0, yl, {}).hidden = rest;
      }
    });
  })();

  /* ================= S2 · the model changes its mind: retype against append-only, the first eleven passes ================= */
  (function () {
    var COMM = [];
    ROWS.slice(0, 11).forEach(function (r, i) { COMM.push((i ? COMM[i - 1] : []).concat(words(r.typed))); });
    var BSMAX = RETYPE[RETYPE.length - 1].bs;
    // a meter under each box: backspaces sent so far, on one scale; retype's jumps are its bursts, append-only stays at 0
    function meter(api, y, bs) {
      var W = api.cols, w = Math.round(bs / BSMAX * (W - 1));
      api.rect(0, y + 1, W - 1, 1, "residue");
      api.rect(0, y, Math.max(1, w), 3, w ? "v-red" : "muted");
    }
    scene("sc-mind", [58, 62], {
      ticks: 11, tps: 2, pause: 1100,
      draw: function (api, tick) {
        var W = api.cols, i = Math.min(tick, 10), R = RETYPE[i];
        api.clear();
        lab(api, "pt", "pass at " + pl(s2(R.ae)) + " s", W - 1, 0, { align: "right", cls: "i" });
        lab(api, "l1", '<span class="k-r2">retype</span> · ' + (narrow(api) ? "fix it with backspaces" : "type each guess, fix it with backspaces"), 0, 0, { cls: "i" });
        box(api, 0, 5, W, 13, "copper");
        wrap(api, "f1", (R.raw.length ? chips(R.raw, function (w) { return REFKEYS[key(w.w)] ? "k-t" : "k-r"; }) : "") + '<span class="caret"></span>', 2, 7, W - 4, {});
        var c1 = lab(api, "c1", "backspaces " + pl(R.bs) + (R.del ? ' <span class="k-r">(−' + pl(R.del) + " this pass)</span>" : "") + " · wrong words shown " + pl(R.shown), 0, 19, { cls: "i" });
        c1.style.whiteSpace = "normal"; c1.style.width = W * C + "px";
        var ym = 19 + hRows(c1) + 1;
        meter(api, ym, R.bs);
        var y2 = ym + 6;
        lab(api, "l2", '<span class="k-t">append-only</span> · type a word once ' + SRC.two + " passes agree", 0, y2, { cls: "i" });
        box(api, 0, y2 + 5, W, 13, "copper");
        wrap(api, "f2", '<span class="k-t">' + esc(COMM[i].join(" ")) + '</span><span class="caret"></span>', 2, y2 + 7, W - 4, {});
        var c2 = lab(api, "c2", "backspaces " + pl("0") + " · wrong words shown " + pl("0"), 0, y2 + 19, { cls: "i" });
        meter(api, y2 + 19 + hRows(c2) + 1, 0);
      }
    });
  })();

  /* ================= S3 · every pass re-reads everything (the same passes, never trimmed) ================= */
  function bars(api, rows, shown, y0, H, maxH, val, tok, ghost) {
    var W = api.cols, bw = Math.max(2, Math.floor((W - 2) / rows.length));
    if (ghost) rows.forEach(function (r, i) { var h = Math.max(1, Math.round(ghost(r) / maxH * H)); api.rect(i * bw, y0 + H - h, bw - 1, h, "copper"); });
    rows.slice(0, shown).forEach(function (r, i) {
      var h = Math.max(1, Math.round(val(r) / maxH * H));
      api.rect(i * bw, y0 + H - h, bw - 1, h, typeof tok === "function" ? tok(r) : tok);
    });
    api.rect(0, y0 + H, Math.min(W, rows.length * bw), 1, "muted");
    return bw;
  }
  (function () {
    scene("sc-stair", 62, {
      ticks: 32, tps: 8, pause: 1100,
      draw: function (api, tick) {
        api.clear();
        var W = api.cols, y0 = 10, H = 40, shown = Math.min(tick, 31), rows = ROWS.slice(0, shown);
        var bw = bars(api, ROWS, shown, y0, H, 1100, function (r) { return r.ae; }, "v-violet", function (r) { return r.ae; });   // the whole staircase in copper, filled as the passes run
        lab(api, "tot", "audio re-read so far " + pl(th(Math.round(sum(rows, function (r) { return r.ae; }) / 100))) + " s · passes " + pl(rows.length), 0, 0, { cls: "r" });
        var last = rows[rows.length - 1];
        if (last) lab(api, "lb", pl(s2(last.ae)) + " s", Math.min((rows.length - 1) * bw, W - 1), y0 + H - Math.round(last.ae / 1100 * H), { align: "right", dy: -18, cls: "i" });
        else hide(api, "lb");
        lab(api, "ax", "one bar per pass of the JFK log" + (narrow(api) ? "" : " · height: seconds from the start of the clip"), 0, y0 + H + 2, {});
        var g = lab(api, "gh", "fig 10 brings this down", 0, y0 + H + 7, { cls: "a" }); g.hidden = tick < 32;
      }
    });
  })();

  /* ================= S4 · the whole machine ================= */
  (function () {
    var LS = [
      ["key", "ink", SRC.key, "tap to start and stop, or hold to talk", 0],
      ["mic", "v-violet", "microphone", SRC.khz + " kHz · mono", 0],
      ["buf", "v-violet", "one growing buffer", "the loop only ever reads copies", 1],
      ["win", "v-amber", "the window", "a copy every " + SRC.tick + " ms", 2],
      ["gate", "v-amber", "three gates", "≥ " + SRC.min + " s · rms ≥ " + SRC.floor + " · tail +" + SRC.keep02 + " s", 3],
      ["model", "ink", "whisper.cpp", SRC.base + " · " + SRC.greedy, 4],
      ["words", "v-cyan", "words with times", "one word per segment", 4],
      ["agree", "v-green", "two passes agree?", "cut re-heard words by text; type the agreed front", 5],
      ["text", "v-green", "text rules", "fillers, “new line”, “scratch that”", 5],
      ["typed", "v-blue", "typed into the focused app", "backspaces only for “scratch that”", 5],
      ["trim", "v-amber", "trim the window", "&gt; " + SRC.trim + " s typed → keep " + SRC.ctx + " s", 6]
    ];
    // narrow: each stage's words sit under its name, and a row grows by 4 cells (one 16 px line) for every line its
    // words wrap to, so a wrapped line never prints over the next stage; 8 spare rows hold two wrapped lines
    scene("sc-loop", [11 * 9 + 4, 11 * 9 + 4 + 8], {
      ticks: 6, tps: 1.2, pause: 900,
      draw: function (api, tick) {
        var W = api.cols, nar = narrow(api), RH = 9, X = 6, y = 1, ys = [];
        api.clear();
        LS.forEach(function (s, i) {
          var lit = s[4] <= tick, now = s[4] === tick || tick >= 6, tok = lit ? s[1] : "copper";
          if (i) vline(api, X + 3, ys[i - 1] + 4, y - 1, lit ? "muted" : "residue");
          ys.push(y);
          api.rect(X + 1, y, 5, 4, tok);
          if (!now && lit) api.rect(X + 2, y + 1, 3, 2, "void");
          lab(api, "n" + i, s[2], X + 9, y, { dy: -6, cls: lit ? "i" : "" });
          var c = lab(api, "c" + i, s[3], nar ? X + 9 : X + 64, y, { dy: nar ? 10 : -6, cls: lit ? (s[1] === "ink" ? "i" : "") : "" });
          c.style.color = lit && s[1] !== "ink" ? "var(--" + s[1] + ")" : "";
          y += RH + (nar ? 4 * Math.max(0, Math.round(c.offsetHeight / 16) - 1) : 0);
        });
        var on = tick >= 6, tk = on ? "v-amber" : "residue", yw = ys[3] + 2, yt = ys[10] + 2;
        dash(api, 0, X, yt, tk); vdash(api, 0, yw, yt, tk); dash(api, 0, X - 2, yw, tk);
        api.rect(X - 1, yw - 1, 1, 3, tk); api.rect(X, yw, 1, 1, tk);
        var tl = lab(api, "tl", "every " + SRC.tick + " ms, round again from the window", 0, yt + (nar ? 6 : 4), { cls: on ? "a" : "" });
        tl.style.color = on ? "var(--v-amber)" : "";
      }
    });
  })();

  /* ================= S5 · one growing buffer ================= */
  (function () {
    function hash(k) { var x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    scene("sc-buffer", 54, {
      ticks: 40, tps: 10, pause: 1200,
      draw: function (api, tick) {
        var W = api.cols, nb = Math.min(8, Math.floor(tick / 4) + 1), blockW = Math.floor((W - 2) / 8);
        api.clear();
        lab(api, "m", "microphone · device rate · " + n("4,096", PIN + "mac/Sources/Freeflow/AudioCapture.swift#L19") + " frames a block", 0, 0, {});
        // blocks drawn as texture, not as any recording
        for (var b = 0; b < nb; b++) {
          var bx = 1 + b * blockW, fresh = b === nb - 1 && tick < 36;
          for (var x = bx; x < bx + blockW - 1; x++) { var a = 0.15 + 0.85 * hash(x * 3 + b), h = Math.max(1, Math.round(a * 8)); api.rect(x, 5 + (8 - h) / 2 | 0, 1, h, fresh ? "v-violet" : "copper"); }
        }
        lab(api, "cv", "converted on arrival → " + SRC.khz + " kHz · mono · float", 0, 15, { cls: "i" });
        var cx = 1 + (nb - 1) * blockW + (blockW >> 1);
        if (tick < 36) { vline(api, cx, 14, 21, "ink"); api.rect(cx - 1, 21, 3, 1, "ink"); }
        var lock = tick % 4 === 1 && tick < 36;
        lab(api, "bl", "buffer " + (lock ? '<span class="k-a">locked: appending</span>' : "· one buffer, append only"), 0, 23, {});
        box(api, 0, 28, W, 8, "copper");
        var fill = Math.round((W - 2) * Math.min(1, (tick + 1) / 36));
        for (var x2 = 1; x2 <= fill; x2++) { var a2 = 0.2 + 0.8 * hash(x2 * 5), h2 = Math.max(1, Math.round(a2 * 6)); api.rect(x2, 29 + (6 - h2) / 2 | 0, 1, h2, "v-violet"); }
        var x05 = Math.round((W - 2) / 4);
        api.rect(x05, 26, 1, 12, "v-amber");
        lab(api, "rl", n("8000", SE + "24") + " samples = " + SRC.min + " s", x05, 38, { cls: "" }).style.color = "var(--v-amber)";
        var snap = tick >= 38;
        if (snap) { box(api, 0, 46, fill + 2, 6, "muted"); for (var x3 = 1; x3 <= fill; x3++) api.rect(x3, 48, 1, 2, "copper"); }
        var s = lab(api, "sn", "snapshot: the model reads this copy, never the mic", 0, 42, { cls: "i" }); s.hidden = !snap;
      }
    });
  })();

  /* ================= S6 · the tick and its three gates ================= */
  (function () {
    var LASTW = ROWS[ROWS.length - 1].raw;                            // the final pass's words, 8.22 s to the clip's end
    var END = LASTW[LASTW.length - 1].e;
    // [label, t0, t1 (hundredths), silent, tail cut at]
    var WIN = [["tick at " + pl("0.35") + " s · window " + pl("0.35") + " s", 0, 35, false],
      ["tick at " + pl("0.70") + " s · the log’s first pass", 0, 70, false],
      ["a tap with nothing said", 0, 70, true],
      ["the final pass · window " + pl(s2(ROWS[ROWS.length - 1].ws)) + "–" + pl("11.00") + " s", ROWS[ROWS.length - 1].ws, 1100, false, END + 20],
      ["the final pass · window " + pl(s2(ROWS[ROWS.length - 1].ws)) + "–" + pl("11.00") + " s", ROWS[ROWS.length - 1].ws, 1100, false, END + 20]];
    function paint(api, k, o) {
      o = o || {};
      var W = api.cols, nar = narrow(api), w = WIN[k], t0 = w[1], t1 = w[2], cut = w[4];
      var span = Math.max(120, t1 - t0 + 20), x1 = Math.round((t1 - t0) / span * (W - 2));
      api.clear();
      lab(api, "w", w[0], 0, 0, { cls: "i" });
      api.rect(0, 5, 1, 10, "v-amber"); api.rect(0, 5, 2, 1, "v-amber"); api.rect(0, 14, 2, 1, "v-amber");
      api.rect(x1 + 1, 5, 1, 10, "v-amber"); api.rect(x1, 5, 2, 1, "v-amber"); api.rect(x1, 14, 2, 1, "v-amber");
      var quiet = w[3] || o.soft, ws = k >= 3 ? LASTW : WORDS;
      if (!w[3]) spans(api, 1, x1, 6, 8, t0, t1, { words: ws, tint: function (t) { return o.soft ? "copper" : cut !== undefined && t > cut ? "residue" : "v-violet"; } });
      else hline(api, 1, x1, 10, "copper");
      if (cut !== undefined) { var xc = 1 + Math.round((cut - t0) / (t1 - t0) * (x1 - 1)); api.rect(xc, 4, 1, 12, "ink"); lab(api, "cut", "cut here: last voiced " + n("50", EP + "20") + " ms frame + " + SRC.keep02 + " s", Math.min(xc, W - 1), 16, { align: xc > W / 2 ? "right" : "left", cls: "i" }); }
      else hide(api, "cut");
      var g1 = (t1 - t0) >= MINW, g2 = g1 && !quiet, g3 = g2;
      var gates = [[g1, "≥ " + SRC.min + " s", "8,000 samples"], [g2, "rms ≥ " + SRC.floor, "not silent"], [g3, "quiet tail cut", "keep +" + SRC.keep02 + " s"]];
      var gy = 26, gx = nar ? [2, 31, 60] : [2, 46, 90];
      gates.forEach(function (g, i) {
        var reached = i === 0 || gates[i - 1][0], x = gx[i], tok = reached ? "v-amber" : "copper";
        for (var d = 0; d < 4; d++) { api.rect(x + 3 - d, gy + d, 1, 1, tok); api.rect(x + 3 + d, gy + d, 1, 1, tok); api.rect(x + 3 - d, gy + 6 - d, 1, 1, tok); api.rect(x + 3 + d, gy + 6 - d, 1, 1, tok); }
        if (reached && !g[0]) api.rect(x + 2, gy + 2, 3, 3, "v-amber");
        lab(api, "g" + i, g[1], x, gy + 8, { cls: reached ? "i" : "" });
        lab(api, "s" + i, !reached ? "not reached" : g[0] ? '<span class="k-g">open</span>' : '<span class="k-a">closed: no pass</span>', x, gy + 12, {});
        if (i < 2) dash(api, x + 8, gx[i + 1] - 2, gy + 3, g[0] ? "muted" : "residue");
      });
      var mx = nar ? 2 : 134, my = nar ? 46 : 26;
      box(api, mx, my, nar ? 30 : 40, 7, g3 ? "ink" : "copper");
      lab(api, "mdl", "whisper.cpp", mx + 2, my + 1, { cls: g3 ? "i" : "" });
      if (!nar) dash(api, gx[2] + 8, mx - 2, gy + 3, g3 ? "muted" : "residue");
      var ghost = k === 2 || (o.soft && k >= 3);
      var gh = lab(api, "gh", '<span class="k-x">“thank you”</span>: what it says to silence, never typed', 0, nar ? 54 : 44, {});
      gh.hidden = !ghost; gh.style.color = "var(--v-red)";
      var cl = lab(api, "clk", k === 1 ? "it heard nothing yet: " + pl("30") + " ms, no words" : "it hears “Ask what you can do for your country.”", 0, nar ? 58 : 48, {});
      cl.hidden = !((k === 1) || (k >= 3 && !o.soft)); if (nar) { cl.style.whiteSpace = "normal"; cl.style.width = W * C + "px"; }
      var lg = lab(api, "lg", "too short · too quiet · quiet tail cut", 0, nar ? 66 : 52, { cls: "i" }); lg.hidden = k !== 4;
    }
    scene("sc-gates", [64, 70], {
      ticks: 4, tps: 1, pause: 1400,
      draw: function (api, tick) { paint(api, Math.min(4, tick)); },
      inputs: [{ id: "soft", label: "speak below the floor", states: ["off", "on"] }],
      live: { start: function () { return {}; }, step: function () { return false; }, draw: function (api) { paint(api, 4, { soft: api.inputs.soft }); } }
    });
  })();

  /* ================= S7 · words with times =================
     The pass at 1.75 s: each word a bar where whisper.cpp timed it, its chip above on one of two rows with a leader
     down to the bar, and a time axis under them; the part of "Americans" past the audio in red. Then the pass at
     4.55 s, whose words are timed from the window's start and slide right by the offset. Then the sieve. */
  (function () {
    var B = row(455);
    var SIEVE = [["[BLANK_AUDIO]", "[ ]"], ["(music)", "( )"], ["♪", "♪"], [".", "no letter or digit"], ["", "empty"],
      ["\"And", ""], ["fe-", ""], ["Americans!", ""], ["to...", ""]];
    scene("sc-times", [90, 104], {
      ticks: 40, tps: 8, pause: 1300,
      draw: function (api, tick) {
        var W = api.cols, nar = narrow(api);
        api.clear();
        var x0 = 0, x1 = W - 1, t1 = 200, hyp = LOG[3][3], END = 175, YB = 15;
        lab(api, "h1", "pass at " + pl("1.75") + " s · the window is " + pl("0") + "–" + pl("1.75") + " s", 0, 0, { cls: "i" });
        var xe = tx(x0, x1, 0, t1, END);
        api.rect(xe, 5, 1, YB - 3, "v-amber");
        hyp.forEach(function (w, i) {
          var a = tx(x0, x1, 0, t1, w[1]), b = tx(x0, x1, 0, t1, Math.min(w[2], t1)), past = w[2] > END, yc = i % 2 ? 9 : 5;
          var e = Math.min(b, xe);
          api.rect(a + 1, YB, Math.max(1, e - a - 1), 2, "v-cyan");
          if (past) api.rect(xe + 1, YB, Math.max(1, b - xe - 1), 2, "v-red");
          var xc = Math.round((a + Math.min(b, xe)) / 2);
          api.rect(xc, yc + 4, 1, YB - yc - 4, "muted");                                     // leader, chip to bar
          lab(api, "w" + i, '<span class="k-c">' + esc(w[0]) + "</span>", xc, yc, { align: "center" });
        });
        // the time axis, in seconds from the window's start
        var YA = YB + 3; api.rect(0, YA, W, 1, "copper");
        [0, 50, 100, 150, 200].forEach(function (h) {
          var xh = tx(x0, x1, 0, t1, h); api.rect(xh, YA, 1, 2, "muted");
          lab(api, "a" + h, rl((h / 100).toFixed(h % 100 ? 1 : 0)) + (h === 200 ? " s" : ""), xh, YA + 2, { align: h ? (h === 200 ? "right" : "center") : "left" });
        });
        var cl = lab(api, "cl", '“Americans” ends at ' + pl("1.94") + " s, past the audio: clamped to " + pl("1.75") + " s", 0, YA + 7, {});
        cl.style.color = "var(--v-red)"; cl.style.whiteSpace = "normal"; cl.style.width = W * C + "px";
        var ys = YA + 7 + hRows(cl) + 2;
        var set = lab(api, "set", SRC.base + " · " + SRC.greedy + " · " + n("english", D + "153") + " · " + n("one word per segment", D + "155") + " · " + n("word timestamps", D + "154"), 0, ys, { cls: "i" });
        set.hidden = tick < 8; set.style.whiteSpace = "normal"; set.style.width = (W * C) + "px";
        // the pass at 4.55 s: the window starts at 1.28 s, and the decoder times words from there
        var y2 = ys + hRows(set) + 3, on2 = tick >= 16, off = B.ws, slide = Math.max(0, Math.min(1, (tick - 18) / 6)), tt1 = 470;
        lab(api, "h2", "pass at " + pl("4.55") + " s · the window starts at " + pl(s2(off)) + " s", 0, y2, { cls: on2 ? "i" : "" }).hidden = !on2;
        if (on2) {
          var wx0 = tx(x0, x1, 0, tt1, off), wx1 = tx(x0, x1, 0, tt1, 455);
          api.rect(0, y2 + 9, W, 1, "copper");
          api.rect(wx0, y2 + 5, 1, 8, "v-amber"); api.rect(wx1, y2 + 5, 1, 8, "v-amber");
          LOG[11][3].forEach(function (w) {
            var s = w[1] - off * (1 - slide), e = w[2] - off * (1 - slide);
            api.rect(tx(x0, x1, 0, tt1, s), y2 + 7, Math.max(1, tx(x0, x1, 0, tt1, e) - tx(x0, x1, 0, tt1, s)), 2, "v-cyan");
          });
          lab(api, "z1", "↑ window start " + pl(s2(off)) + " s", wx0, y2 + 13, {}).style.color = "var(--v-amber)";
          var f = LOG[11][3][0];
          var fr = lab(api, "fr", "“" + esc(f[0]) + "”: " + (slide >= 1 ? pl(s2(f[1] - off)) + " s in the window + " + pl(s2(off)) + " = " + pl(s2(f[1])) + " s in the clip" : pl(s2(f[1] - off)) + " s in the window"), 0, y2 + 18, { cls: "i" });
          fr.style.whiteSpace = "normal"; fr.style.width = W * C + "px";
        } else { hide(api, "fr"); hide(api, "z1"); }
        var y3 = y2 + 18 + (on2 ? hRows(api.scene.labels.fr.e) : 4) + 3, on3 = tick >= 28;
        lab(api, "h3", "the sieve", 0, y3, { cls: on3 ? "i" : "" }).hidden = !on3;
        SIEVE.forEach(function (s, i) {
          var drop = !!s[1], col = nar ? (i < 5 ? 0 : 46) : (i < 5 ? 0 : 92), r = drop ? i : i - 5;
          var e = lab(api, "sv" + i, drop ? '<span class="k-x">' + (s[0] === "" ? "(empty)" : esc(s[0])) + '</span> <span class="k-a">' + esc(s[1]) + "</span>" : '<span class="k-c">' + esc(s[0]) + "</span> kept", col, y3 + 5 + r * 4, {});
          e.hidden = !on3 || tick < 28 + (drop ? i : i - 5);
        });
      }
    });
  })();

  /* ================= S8 · type only what two passes agree on ================= */
  (function () {
    var F = function (a) { return a.map(function (w) { return { w: w }; }); };
    function agree(last, now) { var i = 0; while (i < last.length && i < now.length && norm(last[i].w) === norm(now[i].w)) i++; return i; }
    var CASES = [105, 140, 175, 210, 245].map(function (ae) {
      var r = row(ae); return { name: "pass at " + s2(ae) + " s", last: r.pre.wait, now: r.heard, typed: r.pre.typedBefore, cut: r.raw.length - r.heard.length };
    });
    function paint(api, c, rest) {
      var W = api.cols, nar = narrow(api), cw = nar ? 17 : 20;
      api.clear();
      if (rest) {
        // the ladder: the five passes one under another, each word by its fate. struck: a re-hearing of typed words,
        // cut first. filled: agreed and typed by this pass. outlined: still waiting for the next pass
        [105, 140, 175, 210, 245].forEach(function (ae, i) {
          var r = row(ae), cutN = r.raw.length - r.heard.length, typN = r.typed.length;
          lab(api, "lt" + i, pl(s2(ae)) + " s", 0, i * 6, { cls: typN ? "i" : "" });
          lab(api, "lw" + i, r.raw.map(function (w, j) { return '<span class="' + (j < cutN ? "k-x" : j < cutN + typN ? "k-b" : "k-c") + '">' + esc(w.w.trim()) + "</span>"; }).join(" "), 15, i * 6, {});
        });
        lab(api, "tl", "typed by " + pl("2.45") + ' s · <span class="k-t">' + esc(words(row(245).pre.typedBefore.concat(row(245).typed)).join(" ")) + "</span>", 0, 32, { cls: "i" });
        ["tx", "lp", "np", "res", "case", "cut"].forEach(function (id) { hide(api, id); });
        for (var q = 0; q < 6; q++) { hide(api, "a" + q); hide(api, "b" + q); hide(api, "m" + q); }
        return;
      }
      for (var z = 0; z < 5; z++) { hide(api, "lt" + z); hide(api, "lw" + z); }
      var k = agree(c.last, c.now);
      lab(api, "case", c.name.replace(/[\d.]+/, function (m) { return pl(m); }), W - 1, 0, { align: "right", cls: "i" });
      lab(api, "tl", "typed so far", 0, 0, {});
      wrap(api, "tx", '<span class="k-t">' + esc(words(c.typed).join(" ")) + "</span>" + (k ? ' <span class="k-b">' + esc(words(c.now.slice(0, k)).join(" ")) + "</span>" : ""), 0, 5, W, {});
      lab(api, "lp", "last pass, still waiting", 0, 14, {}).hidden = false;
      lab(api, "np", "this pass", 0, 30, {});
      for (var i = 0; i < 6; i++) {
        var a = c.last[i], b = c.now[i], x = i * cw;
        var ea = lab(api, "a" + i, a ? '<span class="k-c">' + esc(a.w.trim()) + "</span>" : "", x, 19, {}); ea.hidden = !a;
        var eb = lab(api, "b" + i, b ? '<span class="' + (i < k ? "k-b" : "k-c") + '">' + esc(b.w.trim()) + "</span>" : "", x, 35, {}); eb.hidden = !b;
        var m = i < k ? '<span class="k-g">✓ same</span>' : i === k && a && b ? '<span class="k-a">≠ stop</span>' : "";
        var em = lab(api, "m" + i, m, x, 25, {}); em.hidden = !m;
      }
      var cut = lab(api, "cut", c.cut ? pl(c.cut) + (c.cut === 1 ? " re-heard typed word" : " re-heard typed words") + " cut first (fig 9)" : "", W - 1, 30, { align: "right" }); cut.hidden = !c.cut || nar;
      var typed = words(c.now.slice(0, k)).join(" "), waits = words(c.now.slice(k)).join(" ");
      lab(api, "res", (typed ? 'typed now <span class="k-t">' + esc(typed) + "</span>" : "typed now: nothing") + (waits ? ' · waits <span class="k-c">' + esc(waits) + "</span>" : ""), 0, 42, { cls: "i" });
    }
    scene("sc-agree", 48, {
      ticks: 5, tps: 1, pause: 1300,
      draw: function (api, tick) { paint(api, CASES[Math.min(tick, 4)], tick >= 5); },
      inputs: [{ id: "hell", label: "word 1", states: ["hello", "hell"] }, { id: "word", label: "word 2", states: ["world", "word"] }, { id: "again", label: "word 3", states: ["none", "again"] }],
      live: { start: function () { return {}; }, step: function () { return false; },
        draw: function (api) {
          var now = [api.inputs.hell ? " hell" : " hello", api.inputs.word ? " word" : " world"]; if (api.inputs.again) now.push(" again");
          paint(api, { name: "your pass", last: F([" hello", " world"]), now: F(now), typed: [], cut: 0 }, false);
        } }
    });
  })();

  /* ================= S9 · never type a word twice: the pass at 9.80 s, cut by text and by time =================
     Two rows on one time axis: the last typed words, and what the pass at 9.80 s heard. Each word is a bar where its
     pass timed it, with its chip above, pushed right only as far as needed to clear the chip before it. By time, the
     amber line decides; by text, the typed run "ask what" is found in the pass (green in both rows) and cut after. */
  (function () {
    var R = P980, typedTail = R.pre.typedBefore.slice(-4), LAST = R.pre.last;
    var anchorN = R.raw.length - R.heard.length;                       // words the text cut removes: the re-heard "ask what"
    function chipsRow(api, pre, ws, y, cls, x0, x1, t0, t1) {
      var right = -1e9, max = api.cols * C;
      ws.forEach(function (w, i) {
        var a = tx(x0, x1, t0, t1, Math.max(t0, w.s)), b = tx(x0, x1, t0, t1, w.e);
        var e = lab(api, pre + i, '<span class="' + cls(w, i) + '">' + esc(w.w.trim()) + "</span>", (a + b) / 2, y, { align: "center" });
        var l = parseFloat(e.style.left) || 0, wd = e.offsetWidth;
        if (l < right + 6) l = right + 6;
        if (l + wd > max) l = max - wd;
        e.style.left = Math.round(l) + "px"; right = l + wd;
      });
    }
    function paint(api, k, o) {
      o = o || {};
      var W = api.cols, nar = narrow(api), t0 = 640, t1 = 1000, x0 = 0, x1 = W - 1, old = !!o.old || k === 2;
      var byText = !old && k >= 3, showPass = k >= 1, YT = 10, YP = 27, YX = 32;
      api.clear();
      // the axis
      api.rect(0, YX, W, 1, "copper");
      for (var s = 7; s <= 10; s++) { var xs = tx(x0, x1, t0, t1, s * 100); api.rect(xs, YX, 1, 2, "muted"); lab(api, "ax" + s, rl(s) + " s", xs, YX + 2, { align: s === 10 ? "right" : "center" }); }
      // row 1: the last typed words
      lab(api, "rt", "typed so far, as the passes that typed them timed them", 0, 0, {}).style.whiteSpace = "nowrap";
      if (nar) api.scene.labels.rt.e.textContent = "typed so far";
      typedTail.forEach(function (w, i) {
        var a = tx(x0, x1, t0, t1, Math.max(t0, w.s)), b = tx(x0, x1, t0, t1, w.e), match = byText && i >= 2;
        api.rect(a + 1, YT, Math.max(1, b - a - 1), 3, match ? "v-green" : "v-blue");
      });
      chipsRow(api, "c", typedTail, 5, function (w, i) { return byText && i >= 2 ? "k-g" : "k-t"; }, x0, x1, t0, t1);
      // row 2: what the pass at 9.80 s heard
      var ph = lab(api, "rp", "the pass at " + pl("9.80") + " s hears", 0, 16, {}); ph.hidden = !showPass;
      var keepOld = OLD980, xl = tx(x0, x1, t0, t1, LAST - 10);
      function fate(w, i) {                                               // kept | cut (already typed) | lost (never typed)
        if (!showPass || k === 1) return "kept";
        if (old) return keepOld.indexOf(w) >= 0 ? "kept" : i >= anchorN ? "lost" : "cut";
        return i < anchorN ? "cut" : "kept";
      }
      if (showPass) {
        R.raw.forEach(function (w, i) {
          var a = tx(x0, x1, t0, t1, w.s), b = tx(x0, x1, t0, t1, w.e), f = fate(w, i);
          api.rect(a + 1, YP, Math.max(1, b - a - 1), 3, f === "lost" ? "v-red" : f === "cut" ? (byText ? "v-green" : "copper") : "v-cyan");
        });
        chipsRow(api, "n", R.raw, 21, function (w, i) { var f = fate(w, i); return f === "lost" ? "k-lost" : f === "cut" ? (byText ? "k-g k-x" : "k-x") : "k-c"; }, x0, x1, t0, t1);
      } else for (var q = 0; q < 8; q++) hide(api, "n" + q);
      // the time line: the last typed word's end, less 0.1 s
      var showLine = k === 0 || old;
      if (showLine) vdash(api, xl, 3, YX - 1, "v-amber");
      var ln = lab(api, "ln", "time line: “what” ends " + pl(s2(LAST)) + " s, less " + n("0.1", ST + "131") + " s", xl - 1, YX + 6, { align: "right" });
      ln.style.color = "var(--v-amber)"; ln.hidden = !showLine;
      var res = k === 0 ? "typed so far ends “… ask what”. the next pass hears those words again" :
        k === 1 ? "it hears “ask what” again, timed earlier, and starts “you” at " + pl(s2(R.raw[2].s)) + " s, before “what” ends" :
        old ? 'by time: keep only words that start after the line → <span class="k-c">do for you.</span> · <span class="k-r">“you can” is lost</span>' :
        'by text: find <span class="k-g">ask what</span> in the pass and cut after it → <span class="k-c">you can do for you.</span>';
      var yo = YX + (showLine ? 11 : 7);
      var out = lab(api, "out", res, 0, yo, { cls: "i" }); out.style.whiteSpace = "normal"; out.style.width = W * C + "px";
      var fin = lab(api, "fin", k >= 4 && !old ? 'the agreement step then types <span class="k-t">you can</span>' : k >= 4 ? "the next passes hear “you can” early too, and the time rule keeps dropping it" : "", 0, yo + hRows(out) + 1, {});
      fin.hidden = k < 4; fin.style.whiteSpace = "normal"; fin.style.width = W * C + "px";
    }
    scene("sc-twice", [54, 66], {
      ticks: 4, tps: 1, pause: 1500, rest: 4,
      draw: function (api, tick) { paint(api, Math.min(4, tick)); },
      inputs: [{ id: "old", label: "cut by", states: ["text", "time only"] }],
      live: { start: function () { return {}; }, step: function () { return false; }, draw: function (api) { paint(api, 4, { old: api.inputs.old }); } }
    });
  })();

  /* ================= S10 · trim the window ================= */
  (function () {
    function paint(api, k, off) {
      var W = api.cols, nar = narrow(api), x0 = 0, x1 = W - 1, t1 = 480;
      api.clear();
      // top: the trim after the pass at 4.20 s
      var r420 = row(420), askW = r420.typed[0], wsNext = r420.off;
      var t = 420, ws = k >= 1 ? wsNext : 0;
      lab(api, "h", k === 0 ? "pass at " + pl("4.20") + " s · window " + pl("0.00") + "–" + pl("4.20") + " s" : "next pass at " + pl("4.55") + " s · window " + pl(s2(wsNext)) + "–" + pl("4.55") + " s", 0, 0, { cls: "i" });
      spans(api, x0, x1, 6, 8, 0, t1, { upto: k >= 1 ? 455 : 420, tint: function (tt) { return tt < ws ? "residue" : "v-violet"; } });
      var wa = tx(x0, x1, 0, t1, ws), wb = tx(x0, x1, 0, t1, k >= 1 ? 455 : t);
      api.rect(wa, 4, 1, 12, "v-amber"); api.rect(wb, 4, 1, 12, "v-amber"); api.rect(wa, 4, wb - wa + 1, 1, "v-amber");
      var la = tx(x0, x1, 0, t1, 0), lb = tx(x0, x1, 0, t1, askW.e);
      api.rect(la, 17, Math.max(1, lb - la), 2, "v-blue");
      if (k === 0) api.rect(tx(x0, x1, 0, t1, 300), 16, 1, 4, "v-amber");
      if (k >= 1) { var xs = tx(x0, x1, 0, t1, askW.s); vdash(api, xs, 3, 16, "v-blue"); }
      var ty = lab(api, "ty", k === 0 ? "typed audio in the window " + pl(s2(askW.e)) + " s &gt; " + SRC.trim + " s → trim" :
        "start of the last typed word, “ask”, " + pl(s2(askW.s)) + " − " + SRC.ctx + " = " + pl(s2(wsNext)) + " s", 0, 20, { cls: "i" });
      ty.style.whiteSpace = "normal"; ty.style.width = W * C + "px";
      // bottom: every pass of the log, the window it read
      var y0 = 34, H = 34, show = k >= 2;
      // the untrimmed staircase is on stage from the first frame, in copper; the trimmed windows fill in at their step
      lab(api, "b", nar ? "every pass · seconds its window held" : "every pass of the JFK log · seconds of audio its window held", 0, y0 - 4, {});
      if (!show) bars(api, ROWS, 0, y0 + 4, H, 1100, function (r) { return r.ae; }, "copper", function (r) { return r.ae; });
      if (show) {
        bars(api, ROWS, ROWS.length, y0 + 4, H, 1100, off ? function (r) { return r.ae; } : function (r) { return r.win; },
          function (r) { return off ? "v-violet" : r.trimmed ? "v-amber" : "v-blue"; }, off ? null : function (r) { return r.ae; });
        var tot = Math.round((off ? READ_ALL : READ_TRIM) / 100);
        var tt = lab(api, "tt", (off ? "no trim · total " + pl(th(tot)) + " s" : "trimmed after " + pl(TRIMS.length) + " passes (amber) · longest window " + pl(s2(MAXWIN)) + " s · total " + pl(th(tot)) + " s, not " + pl(th(Math.round(READ_ALL / 100)))), 0, y0 + H + 6, { cls: "i" });
        tt.style.whiteSpace = "normal"; tt.style.width = W * C + "px";
      } else hide(api, "tt");
    }
    scene("sc-trim", 84, {
      ticks: 3, tps: 1, pause: 1500,
      draw: function (api, tick) { paint(api, Math.min(3, tick), false); },
      inputs: [{ id: "off", label: "trim", states: ["on", "off"] }],
      live: { start: function () { return {}; }, step: function () { return false; }, draw: function (api) { paint(api, 3, api.inputs.off); } }
    });
  })();

  /* ================= S11 · typing into the focused app ================= */
  (function () {
    var SHORT = " " + words(BURSTS[0].typed).join(" "), LONG = " " + words(row(735).typed).join(" ");
    scene("sc-type", 70, {
      ticks: 40, tps: 8, pause: 1300,
      draw: function (api, tick) {
        var W = api.cols, nar = narrow(api), long = tick >= 10, s = long ? LONG : SHORT, cw = nar ? 1 : 2, scratch = tick >= 30;
        api.clear();
        lab(api, "h", scratch ? "“scratch that” · an example of the rule" : long ? "the pass at " + pl("7.35") + " s · " + pl(s.length) + " characters" : "the pass at " + pl("1.75") + " s · " + pl(s.length) + " characters", 0, 0, { cls: "i" });
        var groups = []; for (var i = 0; i < s.length; i += 20) groups.push(s.slice(i, i + 20));
        var x = 0;
        if (!scratch) groups.forEach(function (g, gi) {
          for (var j = 0; j < g.length; j++) api.rect(x + j * cw, 6, cw, 4, (gi % 2) ? "v-blue" : "signal-2");
          x += g.length * cw + 3;
        });
        var landed = long ? Math.max(0, Math.min(groups.length, Math.floor((tick - 18) / 4) + 1)) : (tick >= 4 ? 1 : 0);
        groups.forEach(function (g, gi) {
          var e = lab(api, "g" + gi, "event " + (gi + 1) + (nar ? " · " : " · key down + key up · ") + '<span class="k-t">“' + esc(g) + "”</span> " + pl(g.length), 0, 13 + gi * 5, { cls: gi < landed ? "i" : "" });
          e.hidden = scratch;
        });
        for (var q = groups.length; q < 3; q++) hide(api, "g" + q);
        box(api, 0, 36, W, 16, "copper"); api.rect(1, 37, W - 2, 3, "residue");
        lab(api, "wn", "mail draft · another app", 2, 37, { dy: -1 });
        var html;
        if (scratch) {
          var gone = tick >= 34;
          html = '<span class="k-i">Notes: </span>' + (gone ? "" : '<span class="k-t">see the attached</span>');
          var sx = lab(api, "sx", gone ? "backspaces stop at the start of this dictation: “Notes: ” was there before it" : "you say “scratch that”: the processor deletes, bounded to what this dictation typed", 0, 13, { cls: "i" });
          sx.hidden = false; sx.style.whiteSpace = "normal"; sx.style.width = W * C + "px";
        } else {
          hide(api, "sx");
          var shown = long ? groups.slice(0, landed).join("") : (landed ? SHORT : "");
          html = (long ? '<span class="k-t">And so my fellow Americans. ask not</span>' : "") + '<span class="k-t">' + esc(shown) + "</span>";
        }
        wrap(api, "d", html + '<span class="caret"></span>', 2, 42, W - 4, { cls: "i" });
        var ev = lab(api, "ev", scratch ? "backspace only on a command · " + n("bounded to this dictation", PIN + "mac/Sources/FreeflowCore/TextProcessor.swift#L3-L8") :
          "key events " + pl(landed) + " · up to " + SRC.chunk + " characters each · backspaces " + pl("0"), 0, 56, { cls: "i" });
        ev.style.whiteSpace = nar ? "normal" : "nowrap"; if (nar) ev.style.width = W * C + "px";
        var p = lab(api, "pill", "the pill never takes focus; its words stay recoverable", 0, nar ? 64 : 62, {}); p.hidden = tick < 40;
      }
    });
  })();

  /* ================= S12 · stopping cleanly ================= */
  (function () {
    var FIN = ROWS[ROWS.length - 1];
    function paint(api, k) {
      var W = api.cols, nar = narrow(api);
      api.clear();
      // the endpointer, tick by tick after the last word: the rule, not a recording
      lab(api, "md", "after the last word · one quiet tick every " + SRC.tick + " ms", 0, 0, { cls: "i" });
      var q = Math.min(5, [1, 4, 5, 5, 5, 5][k]), cw = nar ? W - 2 : 100, by = 6;
      for (var i = 0; i < 5; i++) { var x = Math.round(cw * (i + 1) * 350 / 1750) - 2; api.rect(x, by - 2, 1, 2, i < q ? "v-amber" : "copper"); }
      api.rect(0, by, cw, 3, "residue"); api.rect(0, by, Math.round(cw * Math.min(q * 350, 1750) / 1750), 3, "v-amber");
      var xl = Math.round(cw * 1500 / 1750); api.rect(xl, by - 2, 1, 7, "ink");
      lab(api, "clk", "silence clock " + rl(th(q * 350)) + " ms · stops at " + SRC.stop + " ms", 0, 10, { cls: "i" });
      var sl = lab(api, "sl", q >= 5 ? "the fifth quiet tick: the stop flag flips, the loop finishes its turn" : "each quiet tick adds " + SRC.tick + " ms · speech resets it · " + SRC.grace + " ms grace at the start", 0, 15, {});
      sl.style.whiteSpace = "normal"; sl.style.width = W * C + "px";
      // the final pass of the JFK replay: the clip ends at 11 s
      var y = 26, on = k >= 3, t0 = FIN.ws, t1 = 1100, x0 = 0, x1 = W - 1;
      lab(api, "h1", "the replay’s final pass · window " + pl(s2(FIN.ws)) + "–" + pl("11.00") + " s", 0, y, { cls: on ? "i" : "" }).hidden = !on;
      if (on) {
        spans(api, x0, x1, y + 6, 8, t0, t1, { words: FIN.raw, tint: function () { return "v-violet"; } });
        api.rect(0, y + 15, W, 1, "copper");
      }
      var h2 = lab(api, "h2", "it hears " + chips(FIN.raw, "k-x") + ": all of it already typed, so nothing new is typed", 0, y + 18, {});
      h2.hidden = k < 4; h2.style.whiteSpace = "normal"; h2.style.width = W * C + "px";
      var off = lab(api, "off", "the microphone goes off · " + pl("22") + " words typed, " + pl("0") + " taken back", 0, y + 18 + hRows(h2) + 1, { cls: "i" });
      off.hidden = k < 5; off.style.whiteSpace = "normal"; off.style.width = W * C + "px";
    }
    scene("sc-stop", [54, 64], {
      ticks: 5, tps: 1, pause: 1300,
      draw: function (api, tick) { paint(api, Math.min(5, tick)); }
    });
  })();

  /* ================= S13 · what broke, measured: the benchmark before and after the fix =================
     One axis, 0 to 20% word error. Each split is a row: streamed error as a bar (red before the fix, blue after, the
     red kept as an outline behind the blue), offline decoding of the same audio as an ink tick. The bars ease from
     before to after while the scene moves to the fix. */
  (function () {
    var B0 = PIN + "bench/results/0f70dcd/shipped/summary.csv#L", B1 = PIN + "bench/results/9832030/timing/summary.csv#L",
      RM = PIN + "README.md#L59-L60", BR = PIN + "bench/README.md#L";
    // [split, before streamed, after streamed, offline, before dropped, after dropped, words, src before, src after]
    var SPLITS = [["held-out · 20 speakers", 19.7, 6.7, 5.4, 78, 3, 523, RM, RM], ["dev · 20 speakers + JFK", 15.8, 4.9, 3.5, 64, 2, 513, BR + "71", BR + "121"],
      ["all 41 clips", 17.8, 5.8, 4.4, 142, 5, 1036, B0 + "43", B1 + "43"]];
    var MAX = 20;
    function ease(f) { return f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; }
    function paint(api, k, o) {
      o = o || {};
      var W = api.cols, nar = narrow(api), a = o.live ? (o.after ? 1 : 0) : k >= 3 ? 1 : k === 2 ? ease(o.frac || 0) : 0;
      var after = a >= 1;
      api.clear();
      // the JFK clip, word by word
      var refw = REF.split(" ");
      var html = after ? '<span class="k-t">' + esc(STREAMED) + "</span>" : refw.map(function (w, i) { return '<span class="' + (LOST[i] ? "k-lost" : "k-t") + '">' + esc(w) + "</span>"; }).join(" ");
      lab(api, "jh", "JFK, " + (after ? "after the fix · " + n("0", B1 + "2") + " dropped" : "before the fix · " + n("6", B0 + "2") + " of " + n("22", B0 + "2") + " words dropped"), 0, 0, { cls: "i" });
      var jt = wrap(api, "jt", html, 0, 5, W, {}), y = 5 + hRows(jt) + 3;
      var bh = lab(api, "bh", 'streamed word error · <span class="k-r">▮</span> before the fix · <span class="k-b2">▮</span> after · <span class="k-i">┃</span> offline, same audio', 0, y, {});
      bh.style.whiteSpace = "normal"; bh.style.width = W * C + "px";
      var X = function (v) { return Math.round(v / MAX * (W - 2)); }, P = nar ? 16 : 12, y0 = y + hRows(bh) + 2;
      SPLITS.forEach(function (s, i) {
        var yy = y0 + i * P, focus = o.live || k >= 4 || i === 0;
        lab(api, "s" + i, s[0], 0, yy, { cls: focus ? "i" : "" });
        var v = s[1] + (s[2] - s[1]) * a, d = after ? s[5] : s[4], sr = after ? s[8] : s[7];
        var txt = n((after ? s[2] : s[1]).toFixed(1) + "%", sr) + (after ? ' <span class="k-x">' + n(s[1].toFixed(1) + "%", s[7]) + "</span>" : "") +
          " · offline " + n(s[3].toFixed(1) + "%", sr) + " · " + n(d, sr) + " of " + n(th(s[6]), sr) + " dropped";
        var r = lab(api, "v" + i, txt, nar ? 0 : W - 1, yy + (nar ? 4 : 0), { align: nar ? "left" : "right", cls: focus ? "i" : "" });
        r.style.whiteSpace = "nowrap";
        var yb = yy + (nar ? 9 : 5), red = focus ? "v-red" : "copper", blue = focus ? "v-blue" : "copper";
        api.rect(0, yb + 1, W - 2, 1, "residue");                                         // the track
        if (a > 0) {                                                                       // before, kept as an outline
          var xr = X(s[1]); hline(api, 0, xr, yb, red); hline(api, 0, xr, yb + 2, red); vline(api, xr, yb, yb + 2, red);
        }
        api.rect(0, yb, Math.max(1, X(v)), 3, a > 0 ? blue : red);
        api.rect(X(s[3]), yb - 1, 1, 5, focus ? "ink" : "muted");                          // offline
        // the 8 / 2 s window, the step it is talked about: worse error from the smaller window
        if (i === 0 && k === 2 && !o.live && a === 0) {
          var xw = X(15.5); api.rect(xw, yb - 1, 1, 5, "v-amber");
        }
      });
      var ya = y0 + 3 * P;
      api.rect(0, ya, W - 1, 1, "muted");
      [0, 5, 10, 15, 20].forEach(function (p) { var xp = X(p); api.rect(xp, ya, 1, 2, "muted"); lab(api, "ax" + p, rl(p) + (p ? "" : "%"), xp, ya + 2, { align: p ? (p === MAX ? "right" : "center") : "left" }); });
      var yz = ya + 8;
      var note = k === 2 && !o.live && a === 0 ? '<span class="k-a">┃</span> the 8 / 2 s window: ' + n("15.5%", BR + "71-L72") + " held out, against " + n("19.7%", BR + "71-L72") + " at 3 / 1.5 s. the smaller window was worse" :
        after ? "fixed in " + n("262c910", PIN + "README.md#L62-L63") + ": the cut is found by text, and times are clamped to the window" : "";
      var nz = lab(api, "nz", note, 0, yz, {}); nz.hidden = !note; nz.style.whiteSpace = "normal"; nz.style.width = W * C + "px";
    }
    scene("sc-skip", [72, 98], {
      ticks: 5, tps: 1, pause: 1500, smooth: true,
      draw: function (api, tick, frac) { paint(api, Math.min(5, tick), { frac: frac }); },
      inputs: [{ id: "after", label: "streamer", states: ["before the fix", "after"] }],
      live: { start: function () { return {}; }, step: function () { return false; }, draw: function (api) { paint(api, 5, { live: true, after: api.inputs.after }); } }
    });
  })();

  /* ================= S14 · tests and the CI gate =================
     Every part is on the stage from the first frame, unlit until its step: the 55 Swift tests by file, the 36 Python
     tests, then the gate and its control as two bars against one line, offline + 2 points. The gate's bar stops short of
     the line; the control's runs far past it. */
  (function () {
    // the run's job logs hold these counts; no repo line at 19c0217 does, so they carry the log line they were read from
    var CI = PIN + ".github/workflows/ci.yml#L", RUN = "CI run 38482789778, ";
    function dv(v, how) { return '<span data-derived="' + RUN + how + '">' + v + "</span>"; }
    var GROUPS = [["text processing", 32], ["stream fixtures", 14], ["session, endpointer", 5], ["scoring", 4]];
    var GATE = 4.6, CTRL = 14.3, OFF = 3.8, LINE = OFF + 2, MAX = 16;
    var LG = "gate (ci-gate) job: ALL stream WER 0.046 offline WER 0.038", LC = "gate (ci-control) job: ALL stream WER 0.143 offline WER 0.038, jfk dropped 2/22";
    function ease(f) { f = Math.max(0, Math.min(1, f)); return 1 - Math.pow(1 - f, 3); }
    scene("sc-tests", [84, 122], {
      ticks: 46, tps: 10, pause: 1300,
      draw: function (api, tick) {
        var W = api.cols, nar = narrow(api);
        api.clear();
        var lit = Math.min(55, tick * 3), idx = 0, x = 0, y = 4;
        lab(api, "h", "Swift · " + dv("55", "swift job: Executed 55 tests, with 0 failures (32 + 14 + 5 + 4)") + " XCTest cases in FreeflowCore", 0, 0, { cls: lit >= 55 ? "i" : "" });
        GROUPS.forEach(function (g, gi) {
          var gx = x, perRow = nar ? 8 : 10;
          for (var i = 0; i < g[1]; i++) { var cx = x + (i % perRow) * 4, cy = y + 2 + Math.floor(i / perRow) * 4; api.rect(cx, cy, 3, 3, idx < lit ? "v-green" : "copper"); idx++; }
          var lb = lab(api, "g" + gi, rl(g[1]) + " " + g[0], gx, y + 2 + Math.ceil(g[1] / perRow) * 4 + 1, { cls: "i" });
          lb.style.whiteSpace = "normal"; lb.style.width = Math.max(64, Math.min(g[1], perRow) * 16) + "px";
          x += Math.min(perRow, g[1]) * 4 + 6;
          if (nar && gi === 1) { x = 0; y = 30; }
        });
        var yp = nar ? 54 : 32, on2 = tick >= 20;
        lab(api, "p", (nar ? "Python · " : "Python reference · ") + dv("36", "python job: 36 passed") + (nar ? " tests" : " tests, the same stream fixtures"), 0, yp, { cls: on2 ? "i" : "" });
        for (var j = 0; j < 36; j++) api.rect((j % 18) * 4, yp + 6 + Math.floor(j / 18) * 4, 3, 3, on2 && j < (tick - 20) * 4 ? "v-green" : "copper");
        // the gate and its control, against one line
        var yg = yp + 16, on3 = tick >= 30, on4 = tick >= 38, X = function (v) { return Math.round(v / MAX * (W - 2)); };
        var gh = lab(api, "gt", "the gate: the release build replays JFK and every fifth speaker through the real model, and fails above offline + " + n("2", PIN + "bench/README.md#L38-L41") + " points", 0, yg, { cls: on3 ? "i" : "" });
        gh.style.whiteSpace = "normal"; gh.style.width = W * C + "px";
        var y1 = yg + hRows(gh) + 2, xl = X(LINE);
        var th = lab(api, "th", "offline " + dv("3.8%", LG) + " + " + n("2", PIN + "bench/README.md#L38-L41"), xl + 2, y1, {}); th.style.color = "var(--v-amber)";
        var r0 = lab(api, "r0", "gate · " + (on3 ? dv("4.6%", LG) + ' · <span class="k-g">passed</span>' : "waiting"), 0, y1 + 5, { cls: on3 ? "i" : "" });
        var yb0 = y1 + 5 + hRows(r0);
        api.rect(0, yb0 + 1, W - 2, 1, "residue");
        if (tick > 26) api.rect(0, yb0, Math.max(1, Math.round(X(GATE) * ease((tick - 26) / 4))), 3, "v-green");   // full as its step lands
        var r1 = lab(api, "r1", "control, a " + n("0.5/0.2", CI + "48-L50") + " s window · " + (on4 ? dv("14.3%", LC) + ", JFK drops " + dv("2", LC) + ' · <span class="k-r">failed</span>, as it must' : "waiting"), 0, yb0 + 5, { cls: on4 ? "i" : "" });
        r1.style.whiteSpace = "normal"; r1.style.width = W * C + "px";
        var yb1 = yb0 + 5 + hRows(r1);
        api.rect(0, yb1 + 1, W - 2, 1, "residue");
        if (tick > 33) api.rect(0, yb1, Math.max(1, Math.round(X(CTRL) * ease((tick - 33) / 5))), 3, "v-red");
        api.rect(xl, y1 + 4, 1, yb1 - y1, "v-amber");
        var nm = lab(api, "nm", "greedy decoding is pinned by a test that fails if beam search comes back", 0, yb1 + 6, {});
        nm.hidden = tick < 46; nm.style.whiteSpace = "normal"; nm.style.width = W * C + "px";
      }
    });
  })();
})();
