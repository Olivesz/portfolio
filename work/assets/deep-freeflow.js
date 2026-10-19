/* freeflow, in depth: the fourteen scenes, drawn from real pass logs. The clip is a synthesized reading (macOS say,
   voice Samantha; 16 kHz mono, 7.326 s) of three sentences from Mark Twain's Roughing It (1872), spelling modernized.
   It was replayed through the bench binary of Olivesz/freeflow at two commits with the shipped settings (whisper.cpp
   base.en, greedy, a 350 ms tick, a 3.0 / 1.5 s window): 19c0217, the streamer after the fix, and 0f70dcd, the
   streamer before it. Each run wrote one row per pass; both logs are copied below. The rules are ports of
   mac/Sources/FreeflowCore/Streamer.swift at each commit, and a self-check re-runs them over each log's passes and must
   type exactly what that log says each pass typed, or no scene draws. Cells are 4 px everywhere; the number of
   columns follows the width of the page, so time axes stretch and text rows keep their size. */
(function () {
  "use strict";
  var PIN = "Olivesz/freeflow@19c0217:";
  var D = PIN + "mac/Sources/Freeflow/Dictation.swift#L", ST = PIN + "mac/Sources/FreeflowCore/Streamer.swift#L",
    EP = PIN + "mac/Sources/FreeflowCore/Endpointing.swift#L", SE = PIN + "mac/Sources/FreeflowCore/Session.swift#L";
  function n(v, src) { return '<span data-src="' + src + '">' + v + "</span>"; }
  function pl(v) { return '<span data-src="page:passlog">' + v + "</span>"; }      // read from, or computed over, the pass log
  function bl(v) { return '<span data-src="page:prefixlog">' + v + "</span>"; }    // the same, over the log from before the fix
  function rl(v) { return '<span data-src="page:rule">' + v + "</span>"; }         // worked from the rules, no log involved
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function s2(h) { return (h / 100).toFixed(2); }                                   // hundredths of a second, as seconds
  function s1(h) { return (Math.round(h / 10) / 10).toFixed(1); }
  function th(x) { return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  /* ---------------- where you are in the loop: each build step's kicker carries the eight stages, its own lit ---------------- */
  (function () {
    var steps = [].slice.call(document.querySelectorAll("#ch-build .st"));
    steps.forEach(function (st, i) {
      var k = st.querySelector(".st-k"); if (!k) return;
      var m = document.createElement("span"); m.className = "st-map"; m.setAttribute("aria-hidden", "true");
      steps.forEach(function (_, j) { var q = document.createElement("i"); q.className = j < i ? "d" : j === i ? "on" : ""; m.appendChild(q); });
      k.appendChild(m);
    });
  })();

  /* ---------------- the pass logs ---------------- */
  // one row per pass: [audio end, window start, decode ms, hypothesis [[word, start, end]...], committed [[word, start, end]...]]
  // times are hundredths of a second, as logged (whisper.cpp times words in hundredths; the clip's own end, 7.326 s,
  // keeps its third digit); the hypothesis is the decoder's raw words with the window start added back; empty-string
  // tokens are left out; the last row is the final pass, run when the clip ends.
  // LOG: freeflow@19c0217, the streamer after the fix.
  var LOG = [
    [70,0,29,[],[]],
    [105,0,186,[["The",1,16],["Coyote",16,42],["is",42,51],["a",51,55],["living.",55,100]],[]],
    [140,0,175,[["The",1,19],["Coyote",19,57],["is",57,72],["a",72,76],["living",76,118]],[["The",1,19],["Coyote",19,57],["is",57,72],["a",72,76]]],
    [175,0,207,[["The",1,19],["Coyote",19,56],["is",56,72],["a",72,74],["living,",74,143],["breathing...",143,300]],[]],
    [210,0,228,[["The",1,16],["Coyote",16,45],["is",45,55],["a",55,60],["living,",60,100],["breathing",100,145],["allegory.",145,204]],[["living,",60,100]]],
    [245,0,265,[["The",1,16],["Coyote",16,39],["is",39,47],["a",47,51],["living,",51,85],["breathing",85,143],["allegory",143,158],["of",158,166],["Mother's",166,200],["Blood.",200,240]],[["breathing",85,143]]],
    [280,0,255,[["The",1,17],["coyote",17,51],["is",51,62],["a",62,66],["living,",66,113],["breathing",113,166],["allegory",166,212],["of",212,223],["wont.",223,272]],[["allegory",166,212],["of",212,223]]],
    [315,0,114,[["The",1,21],["coyote",21,63],["is",63,77],["a",77,84],["living,",84,143],["breathing",143,206],["allegory",206,259],["of",259,272],["want.",272,312]],[]],
    [350,0,107,[["The",1,20],["Coyote",20,60],["is",60,73],["a",73,79],["living,",79,143],["breathing",143,192],["allegory",192,245],["of",245,258],["want.",258,312]],[["want.",258,312]]],
    [385,108,226,[["breathing",108,177],["allegory",177,242],["of",242,253],["wand",253,299],["he",299,311],["is",311,314],["always",314,364],["hungry",364,388]],[]],
    [420,108,113,[["breathing",108,177],["allegory",177,242],["of",242,253],["wand.",253,311],["He",311,318],["is",318,328],["always",328,359],["hungry.",359,408]],[]],
    [455,108,111,[["breathing",108,179],["allegory",179,242],["of",242,258],["wand.",258,311],["He",311,320],["is",320,335],["always",335,376],["hungry.",376,444]],[["He",311,320],["is",320,335],["always",335,376],["hungry.",376,444]]],
    [490,226,256,[["of",226,242],["wand.",242,294],["He",294,306],["is",306,311],["always",311,344],["hungry,",344,394],["he",394,405],["is",405,445],["always--",445,478]],[]],
    [525,226,256,[["of",226,242],["wand.",242,298],["He",298,311],["is",311,311],["always",311,351],["hungry.",351,411],["He",411,437],["is",437,446],["always",446,477],["put.",477,522]],[["He",411,437],["is",437,446]]],
    [560,226,121,[["of",226,248],["wand.",248,326],["He",326,336],["is",336,346],["always",346,377],["hungry.",377,442],["He",442,446],["is",446,458],["always",458,516],["poor.",516,538]],[["always",458,516]]],
    [595,226,135,[["of",226,248],["wand.",248,326],["He",326,339],["is",339,352],["always",352,393],["hungry,",393,447],["he",447,460],["is",460,473],["always",473,516],["poor,",516,564],["out",564,575],["of",575,586],["love.",586,594]],[]],
    [630,226,126,[["of",226,242],["want,",242,301],["he",301,311],["is",311,316],["always",316,362],["hungry,",362,438],["he",438,446],["is",446,453],["always",453,499],["poor,",499,564],["out",564,581],["of",581,595],["luck.",595,626]],[["poor,",499,564],["out",564,581],["of",581,595]]],
    [665,431,233,[["He",446,448],["is",448,465],["always",465,518],["poor",518,564],["out",564,579],["of",579,596],["luck",596,651],["and-",651,671]],[]],
    [700,431,247,[["he",446,452],["is",452,473],["always",473,538],["poor,",538,602],["out",602,651],["of",651,655],["luck",655,698],["and",698,699],["friendly.",699,855]],[["luck",655,698]]],
    [732.6,431,111,[["He",446,446],["is",446,461],["always",461,516],["poor,",516,564],["out",564,571],["of",571,586],["luck,",586,651],["and",651,652],["friendless.",652,735]],[["and",651,652],["friendless.",652,732.6]]]
  ];
  // LOG0: freeflow@0f70dcd, the streamer before the fix, on the same clip with the same settings
  var LOG0 = [
    [70,0,31,[],[]],
    [105,0,183,[["The",1,16],["Coyote",16,42],["is",42,51],["a",51,55],["living.",55,100]],[]],
    [140,0,169,[["The",1,19],["Coyote",19,57],["is",57,72],["a",72,76],["living",76,118]],[["The",1,19],["Coyote",19,57],["is",57,72],["a",72,76]]],
    [175,0,208,[["The",1,19],["Coyote",19,56],["is",56,72],["a",72,74],["living,",74,143],["breathing...",143,300]],[]],
    [210,0,264,[["The",1,16],["Coyote",16,45],["is",45,55],["a",55,60],["living,",60,100],["breathing",100,145],["allegory.",145,204]],[]],
    [245,0,271,[["The",1,16],["Coyote",16,39],["is",39,47],["a",47,51],["living,",51,85],["breathing",85,143],["allegory",143,158],["of",158,166],["Mother's",166,200],["Blood.",200,240]],[["breathing",85,143]]],
    [280,0,315,[["The",1,17],["coyote",17,51],["is",51,62],["a",62,66],["living,",66,113],["breathing",113,166],["allegory",166,212],["of",212,223],["wont.",223,272]],[["allegory",166,212],["of",212,223]]],
    [315,0,131,[["The",1,21],["coyote",21,63],["is",63,77],["a",77,84],["living,",84,143],["breathing",143,206],["allegory",206,259],["of",259,272],["want.",272,312]],[]],
    [350,0,133,[["The",1,20],["Coyote",20,60],["is",60,73],["a",73,79],["living,",79,143],["breathing",143,192],["allegory",192,245],["of",245,258],["want.",258,312]],[["want.",258,312]]],
    [385,162,321,[["allegory",164,225],["of",225,242],["wand.",242,304],["He",304,310],["is",310,311],["always",311,330],["hung...",330,378]],[]],
    [420,162,223,[["allegory",164,229],["of",229,245],["wand.",245,311],["\"He",311,321],["is",321,335],["all",335,346],["was",346,361],["hungry.\"",361,414]],[]],
    [455,162,274,[["allegory",164,231],["of",231,248],["want",248,300],["he",300,311],["is",311,317],["always",317,376],["hungry",376,442],["he",442,442]],[]],
    [490,162,112,[["allegory",164,225],["of",225,242],["wand.",242,311],["He",311,311],["is",311,324],["always",324,364],["hungry.",364,446],["He",446,489],["is",489,489],["always",489,762]],[]],
    [525,162,114,[["allegory",164,225],["of",225,242],["wand.",242,310],["He",310,311],["is",311,322],["always",322,359],["hungry.",359,434],["He",434,446],["is",446,450],["always",450,498],["put.",498,522]],[["He",310,311],["is",311,322],["always",322,359],["hungry.",359,434],["He",434,446],["is",446,450],["always",450,498]]],
    [560,348,193,[["was",348,376],["hungry;",376,440],["he",440,446],["is",446,455],["always",455,501],["poor.",501,694]],[]],
    [595,348,251,[["was",348,376],["hungry",376,443],["he",443,446],["is",446,460],["always",460,516],["poor",516,553],["out",553,558],["of",558,558]],[]],
    [630,348,236,[["As",348,360],["always",360,396],["hungry,",396,446],["he",446,458],["is",458,470],["always",470,516],["poor,",516,561],["out",561,564],["of",564,573],["luck.",573,622]],[]],
    [665,348,114,[["While",348,384],["was",384,405],["hungry,",405,462],["he",462,476],["is",476,490],["always",490,532],["poor,",532,576],["out",576,597],["of",597,611],["luck,",611,648],["and",648,648]],[["poor,",532,576],["out",576,597],["of",597,611]]],
    [700,348,118,[["As",348,362],["always",362,404],["hungry,",404,460],["he",460,474],["is",474,488],["always",488,530],["poor,",530,574],["out",574,598],["of",598,613],["luck,",613,656],["and",656,674],["friendly.",674,700]],[["luck,",613,656],["and",656,674]]],
    [732.6,524,208,[["Adhavlak,",524,598],["and",598,620],["Friendless.",620,722]],[]]
  ];
  // each log's last line: what streaming typed, and its word error against the text that was read
  var STREAMED = "The Coyote is a living, breathing allegory of want. He is always hungry. He is always poor, out of luck and friendless.";
  var STREAMED0 = "The Coyote is a breathing allegory of want. He is always hungry. He is always poor, out of luck, and";
  var REF = "The coyote is a living, breathing allegory of Want. He is always hungry. He is always poor, out of luck, and friendless.";
  var CLIP = LOG[LOG.length - 1][0];                                             // the clip's end: 7.326 s
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

  /* ---------------- the rules before the fix: a port of Streamer.swift at 0f70dcd ----------------
     no cut by text and no clamp: a new word is kept only if it starts after the last typed word ends, less 0.1 s
     (then an n-gram check on the boundary), and the window is trimmed from the last typed word's END, less the context */
  function OldStreamer() { this.c = []; this.b = []; this.last = 0; this.off = 0; }
  OldStreamer.prototype.toWords = function (win) {
    var S = this;
    return win.filter(function (w) { return !nonSpeech(w[0]); }).map(function (w) { return { w: " " + w[0].trim(), s: w[1] + S.off, e: w[2] + S.off, raw: w }; });
  };
  OldStreamer.prototype.strip = function (ws) {
    var S = this, r = ws.filter(function (w) { return w.s > S.last - 10; });
    if (S.c.length && r.length) {
      var tail = S.c.slice(-6).map(function (w) { return norm(w.w); }), head = r.slice(0, 6).map(function (w) { return norm(w.w); });
      for (var k = Math.min(tail.length, head.length); k > 0; k--) {
        if (tail.slice(-k).join("\u0000") === head.slice(0, k).join("\u0000")) { r = r.slice(k); break; }
      }
    }
    return r;
  };
  OldStreamer.prototype.agree = Streamer.prototype.agree;
  OldStreamer.prototype.process = function (win) {
    var heard = this.strip(this.toWords(win)), got = this.agree(heard), trimmed = false;
    if (this.last - this.off > TRIM && this.last - CTX > this.off) { this.off = this.last - CTX; trimmed = true; }
    return { heard: heard, got: got, trimmed: trimmed };
  };
  OldStreamer.prototype.finalize = function (win) {
    var rest = this.strip(this.toWords(win));
    if (rest.length) this.last = rest[rest.length - 1].e;
    this.c = this.c.concat(rest); return { heard: rest, got: rest, trimmed: false };
  };

  function words(a) { return a.map(function (w) { return w.w.trim(); }); }
  /* a word as the app puts it on screen: the text rules capitalise the first word of each sentence (on by default) */
  function capped(list) {
    var m = new Map(), start = true;
    list.forEach(function (x) { var t = x.w.trim(); if (start && t) t = t.charAt(0).toUpperCase() + t.slice(1); m.set(x, t); start = /[.!?]$/.test(t); });
    return m;
  }
  var SHOWN = null;
  function shown(w) {
    if (!SHOWN) SHOWN = capped(WORDS);
    return SHOWN.has(w) ? SHOWN.get(w) : w.w.trim();
  }
  function text(st) { return words(st.c).join(" "); }

  /* replay a log's passes through the rules: each pass gets the log's own hypothesis, made relative to the window */
  function replay(log, make) {
    var st = make(), rows = [];
    log.forEach(function (p, i) {
      var ws = st.off, win = p[3].map(function (w) { return [w[0], w[1] - ws, w[2] - ws]; }), fin = i === log.length - 1;
      var pre = { last: st.last, tail: st.c.slice(-4), wait: st.b.slice(), typedBefore: st.c.slice() };
      var raw = st.toWords(win, p[0] - ws);
      var r = fin ? st.finalize(win, p[0] - ws) : st.process(win, p[0] - ws);
      rows.push({ ae: p[0], ws: ws, ms: p[2], win: p[0] - ws, raw: raw, heard: r.heard, typed: r.got, wait: st.b.slice(), last: st.last,
        off: st.off, trimmed: r.trimmed, final: fin, pre: pre });
    });
    return { rows: rows, st: st };
  }
  var RUN = replay(LOG, function () { return new Streamer(); }), ROWS = RUN.rows;
  var RUN0 = replay(LOG0, function () { return new OldStreamer(); }), ROWS0 = RUN0.rows;
  var BURSTS = ROWS.filter(function (r) { return r.typed.length; });
  var WORDS = RUN.st.c;                                              // the 22 typed words, timed by the pass that typed them
  function row(ae) { return ROWS.filter(function (r) { return r.ae === ae; })[0]; }
  function sum(a, f) { return a.reduce(function (x, r) { return x + f(r); }, 0); }
  var READ_TRIM = sum(ROWS, function (r) { return r.win; }), READ_ALL = sum(ROWS, function (r) { return r.ae; });
  var MAXWIN = Math.max.apply(null, ROWS.map(function (r) { return r.win; }));
  var TRIMS = ROWS.filter(function (r) { return r.trimmed; });

  /* the other way to type: retype each pass's whole guess, backspacing the part that changed. Only the passes whose
     window still starts at 0, so a whole guess is the whole sentence so far */
  var N2 = ROWS.filter(function (r) { return r.ws === 0; }).length;
  var REFKEYS = {}; REF.split(" ").forEach(function (w) { REFKEYS[key(w)] = 1; });
  var RETYPE = (function () {
    var typed = "", bs = 0, seen = {}, out = [];
    ROWS.slice(0, N2).forEach(function (r) {
      var full = r.raw.map(function (w) { return w.w.trim(); }).join(" ");
      r.raw.forEach(function (w) { if (!REFKEYS[key(w.w)]) seen[w.w] = 1; });
      var j = 0; while (j < typed.length && j < full.length && typed[j] === full[j]) j++;
      var del = typed.length - j; bs += del; typed = full;
      out.push({ ae: r.ae, raw: r.raw, del: del, bs: bs, shown: Object.keys(seen).length });
    });
    return out;
  })();

  /* the pass at 2.10 s under the old time rule: the word it re-timed early is thrown away */
  var P210 = row(210), OLD210 = (function () {
    var st = new Streamer({ timeOnly: true }); st.c = P210.pre.typedBefore.slice(); st.last = P210.pre.last; st.off = P210.ws;
    return st.strip(P210.raw);
  })();

  /* before the fix: the words of the reading, as typed after the fix, each marked kept or lost by the run before it */
  var LOST = {}, TYPED0 = RUN0.st.c, NLOST = (function () {
    var j = 0;
    WORDS.forEach(function (w, i) { if (j < TYPED0.length && key(w.w) === key(TYPED0[j].w)) j++; else LOST[i] = 1; });
    return j === TYPED0.length ? Object.keys(LOST).length : -1;
  })();
  var SHOWN0 = capped(TYPED0);

  /* self-checks: these must pass before any scene draws */
  var CHK = {};
  (function () {
    function same(a, b) { return JSON.stringify(a.map(function (w) { return [w.w.trim(), Math.round(w.s * 10) / 10, Math.round(w.e * 10) / 10]; })) === JSON.stringify(b); }
    CHK.replay = ROWS.every(function (r, i) { return r.ws === LOG[i][1] && same(r.typed, LOG[i][4]); });
    CHK.replay0 = ROWS0.every(function (r, i) { return r.ws === LOG0[i][1] && same(r.typed, LOG0[i][4]); });
    CHK.text = text(RUN.st) === STREAMED && WORDS.length === 22 && text(RUN0.st) === STREAMED0 && TYPED0.length === 20;
    CHK.bursts = BURSTS.map(function (r) { return s2(r.ae) + ":" + words(r.typed).join(" "); }).join("|") ===
      "1.40:The Coyote is a|2.10:living,|2.45:breathing|2.80:allegory of|3.50:want.|4.55:He is always hungry.|5.25:He is|5.60:always|6.30:poor, out of|7.00:luck|7.33:and friendless.";
    CHK.shown = WORDS.map(shown).join(" ") === STREAMED;
    CHK.trims = TRIMS.map(function (r) { return r.ae + ">" + r.off; }).join() === "350>108,455>226,630>431" && MAXWIN === 404 &&
      Math.round(READ_TRIM * 10) === 53006 && Math.round(READ_ALL * 10) === 80476 && ROWS.length === 20;
    var last = RETYPE[RETYPE.length - 1]; CHK.retype = N2 === 9 && last.bs === 113 && last.shown === 3;
    CHK.old210 = words(OLD210).join(" ") === "breathing allegory." && words(P210.heard).join(" ") === "living, breathing allegory." &&
      words(P210.typed).join(" ") === "living," && words(ROWS0[4].heard).join(" ") === "breathing allegory." && ROWS0[4].typed.length === 0 &&
      words(ROWS0[5].raw).indexOf("living,") >= 0 && words(ROWS0[5].heard).indexOf("living,") < 0;
    CHK.before = NLOST === 2 && LOST[4] === 1 && LOST[21] === 1;
    var F = ROWS[ROWS.length - 1]; CHK.final = F.final && words(F.typed).join(" ") === "and friendless." && F.ae === CLIP && ROWS0[ROWS0.length - 1].typed.length === 0;
    CHK.ok = Object.keys(CHK).every(function (k) { return CHK[k] === true; });
  })();
  window.__ff = { checks: CHK, rows: ROWS, rows0: ROWS0, retype: RETYPE };
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
    if (L) L.e.hidden = false;                                                                // unhide first: a hidden label measures 0 wide
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

  /* ================= S1 · a dictation, start to finish: the coyote replay =================
     Two lanes on one clock. audio: each word where the log times it, faint until the playhead reaches it, violet once
     heard, blue once typed. typed: one block per burst at the moment it was typed, as tall as the words it carried.
     The latest burst is tied back to the words it typed by an underline, a dashed run and a drop to its block. */
  (function () {
    function T(tick) { return (tick - 4) * 5; }                         // hundredths of a second
    var GAP = 0, GAP0 = 0, GAP1 = 0;                                     // the longest stretch with nothing typed, once typing starts
    BURSTS.forEach(function (r, i) { if (i && r.ae - BURSTS[i - 1].ae > GAP) { GAP = r.ae - BURSTS[i - 1].ae; GAP0 = BURSTS[i - 1].ae; GAP1 = r.ae; } });
    // the words for the clip come up as it starts to play, and the gap's words as the gap opens (deep.js, data-lead)
    var lead = { words: 5, phrase: Math.ceil(GAP0 / 5 + 4) + 1 };
    [].forEach.call(document.querySelectorAll("#sc-dictate .sc-keys li"), function (li) { var k = li.getAttribute("data-key"); if (k in lead) li.setAttribute("data-lead", lead[k]); });
    var TEND = Math.ceil(CLIP / 5) + 4;                                   // the tick the clip ends on
    scene("sc-dictate", [90, 94], {
      ticks: TEND + 8, tps: 20, pause: 900, start: "words",              // opens on the first typed word; prev shows the tap
      draw: function (api, tick) {
        var W = api.cols, t = T(tick), nar = narrow(api), listening = t >= 0 && t < CLIP, now = Math.min(t, CLIP);
        api.clear();
        api.rect(0, 0, W, 5, "residue");
        var mx = W - 6; api.rect(mx + 1, 1, 2, 2, listening ? "v-blue" : "void"); box(api, mx, 0, 4, 4, listening ? "v-blue" : "muted");
        lab(api, "mb", listening ? '<span class="k-b2">listening</span>' : "menubar", W - 8, 0, { align: "right", dx: 0, dy: 2 });
        box(api, 0, 7, W, 24, "copper"); api.rect(1, 8, W - 2, 3, "residue");
        lab(api, "win", "mail draft · another app", 2, 8, { dy: -1 });
        var done = BURSTS.filter(function (r) { return r.ae <= t; });
        var typed = done.map(function (r) { return r.typed.map(shown).join(" "); }).join(" ");
        wrap(api, "txt", '<span class="k-t">' + esc(typed) + '</span><span class="caret"></span>', 2, 13, W - 4, { cls: "i" });
        var down = tick >= 4 && tick <= 6;
        lab(api, "key", '<span class="' + (down ? "cap on" : "cap") + '">' + SRC.key + "</span> " + (tick < 4 ? "tap to start" : t < CLIP ? "tapped: listening" : "the clip ended: final pass"), 0, 33, { cls: "i" });

        var x0 = 0, x1 = W - 1, t1 = 750, YA = 44, HA = 8, YR = 70, YB = YR - 3;    // a burst sits on its own green pass tick
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
        // the long wait before 4.55 s: passes ran, none agreed, nothing typed
        var gapOn = api.key === "phrase";
        var g0 = tx(x0, x1, 0, t1, GAP0) + 2, g1 = tx(x0, x1, 0, t1, GAP1) - 3;
        if (gapOn) dash(api, g0, g1, YB, "v-amber");
        var gl = lab(api, "gap", (nar ? pl(s2(GAP)) + " s" : pl(s2(GAP)) + " s, nothing typed"), (g0 + g1) / 2 - 1, YB - 6, { align: "center" });
        // wider than the gap: it ends where the gap ends, clear of the playhead and the burst that closes the gap
        if (gapOn && gl.offsetWidth > (g1 - g0) * C) gl = lab(api, "gap", null, g1, YB - 6, { align: "right" });
        gl.hidden = !gapOn; gl.style.color = "var(--v-amber)";
        // passes as ticks on the ruler, the ruler, the playhead
        ROWS.forEach(function (r) { if (r.ae <= t) api.rect(tx(x0, x1, 0, t1, r.ae), YR - 2, 1, 2, r.typed.length ? "v-green" : "muted"); });
        api.rect(0, YR, W, 1, "copper");
        for (var s = 0; s <= 7; s++) { if (nar && s % 2) continue; var xs = tx(x0, x1, 0, t1, s * 100); api.rect(xs, YR, 1, 2, "muted"); lab(api, "r" + s, rl(s) + (s === 0 ? " s" : ""), xs, YR + 2, { align: s ? "center" : "left" }); }
        for (var q = 1; q <= 7; q += 2) if (nar) hide(api, "r" + q);
        if (t >= 0) { var xp = tx(x0, x1, 0, t1, now); api.rect(xp, YA - 2, 1, YR - YA + 2, "v-amber"); }
        var ran = ROWS.filter(function (r) { return r.ae <= t; }), lastP = ran[ran.length - 1];
        var ps = lab(api, "ps", lastP ? "pass " + pl(ran.length) + " of " + pl(ROWS.length) + " at " + pl(s2(lastP.ae)) + " s" + (lastP.final ? ", the final pass" : "") + (lastP.typed.length ? ' · typed <span class="k-t">' + esc(words(lastP.typed).join(" ")) + "</span>" : lastP.final ? ": nothing left to type" : " · nothing agreed yet") : "a pass every " + SRC.tick + " ms once there is " + SRC.min + " s of audio", 0, 78, { cls: "i" });
        ps.style.whiteSpace = nar ? "normal" : "nowrap"; if (nar) ps.style.width = W * C + "px";
        var yl = 78 + hRows(ps) + 2, rest = api.key === "rest";
        var m = lab(api, "marks", pl("22") + " of " + pl("22") + " words · " + pl("0") + " errors · backspaces " + pl("0"), 0, yl, { cls: "i" });
        m.hidden = !rest;
        lab(api, "lg", '<span class="k-v">▮</span> heard · <span class="k-b2">▮</span> typed · <span class="k-g">▮</span> a pass that typed', 0, yl, {}).hidden = rest;
      }
    });
  })();

  /* ================= S2 · the model changes its mind: retype against append-only, the passes before the first trim ================= */
  (function () {
    var COMM = [];
    ROWS.slice(0, N2).forEach(function (r, i) { COMM.push((i ? COMM[i - 1] : []).concat(r.typed.map(shown))); });   // as typed on screen
    var BSMAX = RETYPE[RETYPE.length - 1].bs;
    // a meter under each box: backspaces sent so far, on one scale; retype's jumps are its bursts, append-only stays at 0
    function meter(api, y, bs) {
      var W = api.cols, w = Math.round(bs / BSMAX * (W - 1));
      api.rect(0, y + 1, W - 1, 1, "residue");
      api.rect(0, y, Math.max(1, w), 3, w ? "v-red" : "muted");
    }
    scene("sc-mind", [58, 62], {
      ticks: N2, tps: 2, pause: 1100, start: "p105",              // opens on the first words heard; prev reaches 0.70 s
      draw: function (api, tick) {
        var W = api.cols, i = Math.min(tick, N2 - 1), R = RETYPE[i];
        api.clear();
        lab(api, "pt", "pass at " + pl(s2(R.ae)) + " s", W - 1, 0, { align: "right", cls: "i" });
        lab(api, "l1", '<span class="k-r2">retype</span> · ' + (narrow(api) ? "fix it with backspaces" : "type each guess, fix it with backspaces"), 0, 0, { cls: "i" });
        box(api, 0, 5, W, 13, "copper");
        wrap(api, "f1", (R.raw.length ? chips(R.raw, function (w) { return REFKEYS[key(w.w)] ? "k-t" : "k-r"; }) : "") + '<span class="caret"></span>', 2, 7, W - 4, {});
        var c1 = lab(api, "c1", "backspaces " + pl(R.bs) + (R.del ? ' <span class="k-r">(−' + pl(R.del) + (narrow(api) ? ")" : " this pass)") + "</span>" : "") + " · wrong words shown " + pl(R.shown), 0, 19, { cls: "i" });
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
    scene("sc-stair", [62, 65], {
      ticks: ROWS.length + 1, tps: 8, pause: 1100,
      draw: function (api, tick) {
        api.clear();
        // on a phone the readout spans the width, so the staircase starts lower and the newest pass's label clears it
        var W = api.cols, y0 = narrow(api) ? 13 : 10, H = 40, shown = Math.min(tick, ROWS.length), rows = ROWS.slice(0, shown);
        var bw = bars(api, ROWS, shown, y0, H, CLIP, function (r) { return r.ae; }, "v-violet", function (r) { return r.ae; });   // the whole staircase in copper, filled as the passes run
        var tot = sum(rows, function (r) { return r.ae; });                  // hundredths while under 10 s, so the first pass reads 0.70 s, as its step says
        lab(api, "tot", "audio re-read so far " + pl(tot < 1000 ? s2(tot) : th(Math.round(tot / 100))) + " s · passes " + pl(rows.length), 0, 0, { cls: "r" });
        var last = rows[rows.length - 1], ld = api.scene.labels.lbl;
        if (last) {
          // the newest pass's seconds, just above its bar; where the staircase still to come stands taller under the
          // words (the first passes, pushed to the left edge), they rise clear of it on a leader down to the bar
          var bx = Math.min((rows.length - 1) * bw, W - 1), top = y0 + H - Math.round(last.ae / CLIP * H);
          var e = lab(api, "lb", pl(s2(last.ae)) + " s", bx, top, { align: "right", dy: -18, cls: "i" });
          var l = parseFloat(e.style.left) || 0, r = l + e.offsetWidth, hi = top;
          ROWS.forEach(function (q, i) { var x0 = i * bw * C, x1 = x0 + (bw - 1) * C; if (x1 > l && x0 < r) hi = Math.min(hi, y0 + H - Math.max(1, Math.round(q.ae / CLIP * H))); });
          var dy = Math.min(-18, (hi - top) * C - 22);
          if (dy < -18) e = lab(api, "lb", null, bx, top, { align: "right", dy: dy, cls: "i" });
          api.lead("lbl", bx, top, top * C + dy + 20); ld = api.scene.labels.lbl; ld.e.hidden = dy >= -18;
        } else { hide(api, "lb"); if (ld) ld.e.hidden = true; }
        lab(api, "ax", "one bar per pass of the log" + (narrow(api) ? "" : " · height: seconds from the start of the clip"), 0, y0 + H + 2, {});
        var g = lab(api, "gh", "fig 10 brings this down", 0, y0 + H + 7, { cls: "a" }); g.hidden = tick < ROWS.length + 1;
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
    scene("sc-buffer", 58, {
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
        // the newest block's converted samples drop from under the converter's line to the buffer, never across its words
        var cx = 1 + (nb - 1) * blockW + (blockW >> 1);
        if (tick < 36) { vline(api, cx, 20, 25, "ink"); api.rect(cx - 1, 25, 3, 1, "ink"); }
        // each block is appended under the lock on the tick after its conversion step (step 2 is keyed to tick 3)
        var lock = tick % 4 === 3 && tick < 36;
        lab(api, "bl", "buffer " + (lock ? '<span class="k-a">locked: appending</span>' : "· one buffer, append only"), 0, 27, {});
        box(api, 0, 32, W, 8, "copper");
        var fill = Math.round((W - 2) * Math.min(1, (tick + 1) / 36));
        for (var x2 = 1; x2 <= fill; x2++) { var a2 = 0.2 + 0.8 * hash(x2 * 5), h2 = Math.max(1, Math.round(a2 * 6)); api.rect(x2, 33 + (6 - h2) / 2 | 0, 1, h2, "v-violet"); }
        var x05 = Math.round((W - 2) / 4);
        api.rect(x05, 31, 1, 11, "v-amber");                         // from under the buffer's line, clear of its words
        lab(api, "rl", n("8000", SE + "24") + " samples = " + SRC.min + " s", x05, 42, { cls: "" }).style.color = "var(--v-amber)";
        var snap = tick >= 38;
        if (snap) { box(api, 0, 50, fill + 2, 6, "muted"); for (var x3 = 1; x3 <= fill; x3++) api.rect(x3, 52, 1, 2, "copper"); }
        var s = lab(api, "sn", "snapshot: the model reads this copy, never the mic", 0, 46, { cls: "i" }); s.hidden = !snap;
      }
    });
  })();

  /* ================= S6 · the tick and its three gates ================= */
  (function () {
    var FIN = ROWS[ROWS.length - 1], LASTW = FIN.raw;                // the final pass's words, 4.31 s to the clip's end
    // the reading stops on its last word: the final pass's last word is clamped to the clip's end, so its window was
    // never shortened, and the tail gate had nothing to cut. The mark sits at the window's end.
    var END = LASTW[LASTW.length - 1].e;
    // [label, t0, t1 (hundredths), silent, tail mark at]
    var WIN = [["tick at " + rl("0.35") + " s · window " + rl("0.35") + " s", 0, 35, false],
      ["tick at " + pl("0.70") + " s · the log’s first pass", 0, 70, false],
      ["a tap with nothing said", 0, 70, true],
      ["the final pass · window " + pl(s2(FIN.ws)) + "–" + pl(s2(CLIP)) + " s", FIN.ws, CLIP, false, END],
      ["the final pass · window " + pl(s2(FIN.ws)) + "–" + pl(s2(CLIP)) + " s", FIN.ws, CLIP, false, END]];
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
      if (cut !== undefined) {
        var xc = 1 + Math.round((cut - t0) / (t1 - t0) * (x1 - 1)), edge = cut >= t1;
        api.rect(xc, 4, 1, 12, "ink");
        lab(api, "cut", edge ? (nar ? "the last word runs to the end: nothing cut" : "the last word runs to the clip’s end: no quiet tail, nothing cut") :
          "cut here: last " + n("50", EP + "20") + " ms frame over " + n("0.010", EP + "21") + ", + " + SRC.keep02 + " s", Math.min(xc, W - 1), 16, { align: xc > W / 2 ? "right" : "left", cls: "i" });
      }
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
      var cl = lab(api, "clk", k === 1 ? "it heard nothing yet: " + pl(ROWS[0].ms) + " ms, no words" : "it hears “" + esc(words(LASTW).join(" ")) + "”", 0, nar ? 58 : 48, {});
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
     down to the bar, and a time axis under them; the part of "breathing..." past the audio in red. Then the pass at
     6.65 s, whose words are timed from the window's start and slide right by the offset. Then the sieve. */
  (function () {
    function logRow(ae) { return LOG.filter(function (p) { return p[0] === ae; })[0]; }
    var A = logRow(175), B = row(665), BH = logRow(665)[3];
    var PAST = A[3].filter(function (w) { return w[2] > A[0]; })[0];         // the word timed past the end of the audio
    var SIEVE = [["[BLANK_AUDIO]", "[ ]"], ["(music)", "( )"], ["♪", "♪"], [".", "no letter or digit"], ["", "empty"],
      ["Mother's", ""], ["breathing...", ""], ["always--", ""], ["and-", ""]];
    scene("sc-times", [90, 104], {
      ticks: 40, tps: 8, pause: 1300,
      draw: function (api, tick) {
        var W = api.cols, nar = narrow(api);
        api.clear();
        var x0 = 0, x1 = W - 1, t1 = 200, hyp = A[3], END = A[0], YB = 15;
        lab(api, "h1", "pass at " + pl(s2(END)) + " s · the window is " + pl("0") + "–" + pl(s2(END)) + " s", 0, 0, { cls: "i" });
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
        var cl = lab(api, "cl", "“" + esc(PAST[0]) + "” ends at " + pl(s2(PAST[2])) + " s, past the audio: clamped to " + pl(s2(END)) + " s", 0, YA + 7, {});
        cl.style.color = "var(--v-red)"; cl.style.whiteSpace = "normal"; cl.style.width = W * C + "px";
        var ys = YA + 7 + hRows(cl) + 2;
        var set = lab(api, "set", SRC.base + " · " + SRC.greedy + " · " + n("english", D + "153") + " · " + n("one word per segment", D + "155") + " · " + n("word timestamps", D + "154"), 0, ys, { cls: "i" });
        set.classList.toggle("gh", tick < 8); set.style.whiteSpace = "normal"; set.style.width = (W * C) + "px";
        // the pass at 6.65 s: the window starts at 4.31 s, and the decoder times words from there
        var y2 = ys + hRows(set) + 3, on2 = tick >= 16, off = B.ws, slide = Math.max(0, Math.min(1, (tick - 18) / 6)), tt1 = 700;
        lab(api, "h2", "pass at " + pl(s2(B.ae)) + " s · the window starts at " + pl(s2(off)) + " s", 0, y2, { cls: on2 ? "i" : "" }).classList.toggle("gh", !on2);
        if (!on2) api.rect(0, y2 + 9, W, 1, "residue");                                      // its track, waiting
        if (on2) {
          var wx0 = tx(x0, x1, 0, tt1, off), wx1 = tx(x0, x1, 0, tt1, B.ae);
          api.rect(0, y2 + 9, W, 1, "copper");
          api.rect(wx0, y2 + 5, 1, 8, "v-amber"); api.rect(wx1, y2 + 5, 1, 8, "v-amber");
          BH.forEach(function (w) {
            var s = w[1] - off * (1 - slide), e = w[2] - off * (1 - slide);
            api.rect(tx(x0, x1, 0, tt1, s), y2 + 7, Math.max(1, tx(x0, x1, 0, tt1, e) - tx(x0, x1, 0, tt1, s)), 2, "v-cyan");
          });
          lab(api, "z1", "↑ window start " + pl(s2(off)) + " s", wx0, y2 + 13, {}).style.color = "var(--v-amber)";
          var f = BH[0];
          var fr = lab(api, "fr", "“" + esc(f[0]) + "”: " + (slide >= 1 ? pl(s2(f[1] - off)) + " s in the window + " + pl(s2(off)) + " = " + pl(s2(f[1])) + " s in the clip" : pl(s2(f[1] - off)) + " s in the window"), 0, y2 + 18, { cls: "i" });
          fr.style.whiteSpace = "normal"; fr.style.width = W * C + "px";
        } else { hide(api, "fr"); hide(api, "z1"); }
        var y3 = y2 + 18 + (on2 ? hRows(api.scene.labels.fr.e) : 4) + 3, on3 = tick >= 28;
        lab(api, "h3", "the sieve", 0, y3, { cls: on3 ? "i" : "" }).classList.toggle("gh", !on3);
        SIEVE.forEach(function (s, i) {
          var drop = !!s[1], col = nar ? (i < 5 ? 0 : 46) : (i < 5 ? 0 : 92), r = drop ? i : i - 5;
          var e = lab(api, "sv" + i, drop ? '<span class="k-x">' + (s[0] === "" ? "(empty)" : esc(s[0])) + '</span> <span class="k-a">' + esc(s[1]) + "</span>" : '<span class="k-c">' + esc(s[0]) + "</span> kept", col, y3 + 5 + r * 4, {});
          e.classList.toggle("gh", !on3 || tick < 28 + (drop ? i : i - 5));
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
      var W = api.cols, nar = narrow(api), cw = nar ? 16 : 20;
      api.clear();
      if (rest) {
        // the ladder: the five passes one under another, each word by its fate. struck: a re-hearing of typed words,
        // cut first. filled: agreed and typed by this pass. outlined: still waiting for the next pass. A row that wraps
        // on a phone pushes the rows under it down by its height
        var yl = 0;
        [105, 140, 175, 210, 245].forEach(function (ae, i) {
          var r = row(ae), cutN = r.raw.length - r.heard.length, typN = r.typed.length;
          lab(api, "lt" + i, pl(s2(ae)) + " s", 0, yl, { cls: typN ? "i" : "" });
          var e = wrap(api, "lw" + i, r.raw.map(function (w, j) { return '<span class="' + (j < cutN ? "k-x" : j < cutN + typN ? "k-b" : "k-c") + '">' + esc(w.w.trim()) + "</span>"; }).join(" "), 15, yl, W - 15, {});
          yl += Math.max(6, hRows(e) + 2);
        });
        lab(api, "tl", "typed by " + pl("2.45") + ' s · <span class="k-t">' + esc(words(row(245).pre.typedBefore.concat(row(245).typed)).join(" ")) + "</span>", 0, yl + 2, { cls: "i" });
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
      // one column per word position, both passes' words in it; a column widens only when its widest chip needs it
      for (var i = 0, x = 0; i < 6; i++) {
        var a = c.last[i], b = c.now[i];
        var ea = lab(api, "a" + i, a ? '<span class="k-c">' + esc(a.w.trim()) + "</span>" : "", x, 19, {}); ea.hidden = !a;
        var eb = lab(api, "b" + i, b ? '<span class="' + (i < k ? "k-b" : "k-c") + '">' + esc(b.w.trim()) + "</span>" : "", x, 35, {}); eb.hidden = !b;
        var m = i < k ? '<span class="k-g">✓ same</span>' : i === k && a && b ? '<span class="k-a">≠ stop</span>' : "";
        var em = lab(api, "m" + i, m, x, 25, {}); em.hidden = !m;
        var wide = Math.max(a ? ea.offsetWidth : 0, b ? eb.offsetWidth : 0, m ? em.offsetWidth : 0);
        x += Math.max(cw, Math.ceil(wide / C) + 2);
      }
      var cut = lab(api, "cut", c.cut ? pl(c.cut) + (c.cut === 1 ? " re-heard typed word" : " re-heard typed words") + " cut first (fig 9)" : "", W - 1, 30, { align: "right" }); cut.hidden = !c.cut || nar;
      var typed = words(c.now.slice(0, k)).join(" "), waits = words(c.now.slice(k)).join(" ");
      lab(api, "res", (typed ? 'typed now <span class="k-t">' + esc(typed) + "</span>" : "typed now: nothing") + (waits ? ' · waits <span class="k-c">' + esc(waits) + "</span>" : ""), 0, 42, { cls: "i" });
    }
    scene("sc-agree", [48, 60], {
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

  /* ================= S9 · never type a word twice: the pass at 2.10 s, cut by text and by time =================
     Two rows on one time axis: the last typed words, and what the pass at 2.10 s heard. Each word is a bar where its
     pass timed it, with its chip above, pushed right only as far as needed to clear the chip before it. By time, the
     amber line decides; by text, the typed run "The Coyote is a" is found in the pass (green in both rows) and cut
     after. The streamer before the fix ran this same pass and lost "living," (fig 13). */
  (function () {
    var R = P210, typedTail = R.pre.typedBefore.slice(-4), LAST = R.pre.last;
    var anchorN = R.raw.length - R.heard.length;                       // words the text cut removes: the re-heard "The Coyote is a"
    var lastW = typedTail[typedTail.length - 1].w.trim(), TAILT = esc(words(typedTail).join(" ")), RUNT = esc(words(R.raw.slice(0, anchorN)).join(" "));
    var LOSTT = R.raw.slice(anchorN).filter(function (w) { return OLD210.indexOf(w) < 0; }), LOSTS = esc(words(LOSTT).join(" "));
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
      var W = api.cols, nar = narrow(api), t0 = 0, t1 = 210, x0 = 0, x1 = W - 1, old = !!o.old || k === 2;
      var byText = !old && k >= 3, showPass = k >= 1, YT = 10, YP = 27, YX = 32, m0 = typedTail.length - anchorN;
      api.clear();
      // the axis
      api.rect(0, YX, W, 1, "copper");
      for (var s = 0; s <= 4; s++) { var xs = tx(x0, x1, t0, t1, s * 50); api.rect(xs, YX, 1, 2, "muted"); lab(api, "ax" + s, rl((s / 2).toFixed(s % 2 ? 1 : 0)) + (s ? "" : " s"), xs, YX + 2, { align: s ? "center" : "left" }); }
      // row 1: the last typed words
      // the streamer's committed words, matched without case: as heard, not as the app typed them
      lab(api, "rt", "committed so far, as the passes that committed them timed them", 0, 0, {}).style.whiteSpace = "nowrap";
      if (nar) api.scene.labels.rt.e.textContent = "committed so far";
      typedTail.forEach(function (w, i) {
        var a = tx(x0, x1, t0, t1, Math.max(t0, w.s)), b = tx(x0, x1, t0, t1, w.e), match = byText && i >= m0;
        api.rect(a + 1, YT, Math.max(1, b - a - 1), 3, match ? "v-green" : "v-blue");
      });
      chipsRow(api, "c", typedTail, 5, function (w, i) { return byText && i >= m0 ? "k-g" : "k-t"; }, x0, x1, t0, t1);
      // row 2: what the pass at 2.10 s heard
      var ph = lab(api, "rp", "the pass at " + pl(s2(R.ae)) + " s hears", 0, 16, {}); ph.hidden = !showPass;
      var keepOld = OLD210, xl = tx(x0, x1, t0, t1, LAST - 10);
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
      var ln = lab(api, "ln", (narrow(api) ? "line: " : "time line: ") + "“" + esc(lastW) + "” ends " + pl(s2(LAST)) + " s, less " + n("0.1", ST + "131") + " s = " + pl(s2(LAST - 10)) + " s", nar ? 0 : xl > W / 2 ? xl - 1 : xl, YX + 6, { align: !nar && xl > W / 2 ? "right" : "left" });
      ln.style.color = "var(--v-amber)"; ln.hidden = !showLine;
      var res = k === 0 ? "they end “" + TAILT + "” · the next pass hears those words again" :
        k === 1 ? "it hears “" + RUNT + "” again, timed earlier, and starts “" + esc(LOSTT[0].w.trim()) + "” at " + pl(s2(LOSTT[0].s)) + " s, before “" + esc(lastW) + "” ends" :
        old ? 'by time: keep only words that start after the line → <span class="k-c">' + esc(words(OLD210).join(" ")) + '</span> · <span class="k-r">“' + LOSTS + "” is lost</span>" :
        'by text: find <span class="k-g">' + RUNT + '</span> in the pass and cut after it → <span class="k-c">' + esc(words(R.heard).join(" ")) + "</span>";
      var yo = YX + (showLine ? 11 : 7);
      var out = lab(api, "out", res, 0, yo, { cls: "i" }); out.style.whiteSpace = "normal"; out.style.width = W * C + "px";
      var fin = lab(api, "fin", k >= 4 && !old ? 'the agreement step then types <span class="k-t">' + esc(words(R.typed).join(" ")) + "</span>" : k >= 4 ? "the next pass hears “" + LOSTS + "” early too, and the time rule drops it again" : "", 0, yo + hRows(out) + 1, {});
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
      var W = api.cols, nar = narrow(api), x0 = 0, x1 = W - 1, t1 = 400;
      api.clear();
      // top: the first trim, after the pass at 3.50 s
      var rT = TRIMS[0], askW = rT.typed[rT.typed.length - 1], wsNext = rT.off, tN = ROWS[ROWS.indexOf(rT) + 1].ae;
      var t = rT.ae, ws = k >= 1 ? wsNext : 0;
      lab(api, "h", k === 0 ? "pass at " + pl(s2(t)) + " s · window " + pl("0.00") + "–" + pl(s2(t)) + " s" : "next pass at " + pl(s2(tN)) + " s · window " + pl(s2(wsNext)) + "–" + pl(s2(tN)) + " s", 0, 0, { cls: "i" });
      spans(api, x0, x1, 6, 8, 0, t1, { upto: k >= 1 ? tN : t, tint: function (tt) { return tt < ws ? "residue" : "v-violet"; } });
      var wa = tx(x0, x1, 0, t1, ws), wb = tx(x0, x1, 0, t1, k >= 1 ? tN : t);
      api.rect(wa, 4, 1, 12, "v-amber"); api.rect(wb, 4, 1, 12, "v-amber"); api.rect(wa, 4, wb - wa + 1, 1, "v-amber");
      var la = tx(x0, x1, 0, t1, 0), lb = tx(x0, x1, 0, t1, askW.e);
      api.rect(la, 17, Math.max(1, lb - la), 2, "v-blue");
      if (k === 0) api.rect(tx(x0, x1, 0, t1, 300), 16, 1, 4, "v-amber");
      if (k >= 1) { var xs = tx(x0, x1, 0, t1, askW.s); vdash(api, xs, 4, 16, "v-blue"); }
      var ty = lab(api, "ty", k === 0 ? "typed audio in the window " + pl(s2(askW.e)) + " s &gt; " + SRC.trim + " s → trim" :
        "start of the last typed word, “" + esc(askW.w.trim()) + "”, " + pl(s2(askW.s)) + " − " + SRC.ctx + " = " + pl(s2(wsNext)) + " s", 0, 20, { cls: "i" });
      ty.style.whiteSpace = "normal"; ty.style.width = W * C + "px";
      // bottom: every pass of the log, the window it read
      var y0 = 34, H = 34, show = k >= 2;
      // the untrimmed staircase is on stage from the first frame, in copper; the trimmed windows fill in at their step
      lab(api, "b", nar ? "every pass · seconds its window held" : "every pass of the log · seconds of audio its window held", 0, y0 - 4, {});
      if (!show) bars(api, ROWS, 0, y0 + 4, H, CLIP, function (r) { return r.ae; }, "copper", function (r) { return r.ae; });
      if (show) {
        bars(api, ROWS, ROWS.length, y0 + 4, H, CLIP, off ? function (r) { return r.ae; } : function (r) { return r.win; },
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
    // the first burst, and the longest, with what was on screen before it as the app typed it
    var LB = BURSTS.reduce(function (a, r) { return words(r.typed).join(" ").length > words(a.typed).join(" ").length ? r : a; }, BURSTS[0]);
    var SHORT = " " + words(BURSTS[0].typed).join(" "), LONG = " " + words(LB.typed).join(" ");
    var PRIOR = BURSTS.slice(0, BURSTS.indexOf(LB)).map(function (r) { return r.typed.map(shown).join(" "); }).join(" ");
    scene("sc-type", 70, {
      ticks: 40, tps: 8, pause: 1300,
      draw: function (api, tick) {
        var W = api.cols, nar = narrow(api), long = tick >= 10, s = long ? LONG : SHORT, cw = nar ? 1 : 2, scratch = tick >= 30;
        api.clear();
        lab(api, "h", scratch ? "“scratch that” · an example of the rule" : "the pass at " + pl(s2(long ? LB.ae : BURSTS[0].ae)) + " s · " + pl(s.length) + " characters", 0, 0, { cls: "i" });
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
          html = (long ? '<span class="k-t">' + esc(PRIOR) + "</span>" : "") + '<span class="k-t">' + esc(shown) + "</span>";
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
    function paint(api, k, q) {
      var W = api.cols, nar = narrow(api);
      api.clear();
      // the endpointer, tick by tick after the last word: the rule, not a recording
      lab(api, "md", "after the last word · one quiet tick every " + SRC.tick + " ms", 0, 0, { cls: "i" });
      var cw = nar ? W - 2 : 100, by = 6;
      for (var i = 0; i < 5; i++) { var x = Math.round(cw * (i + 1) * 350 / 1750) - 2; api.rect(x, by - 2, 1, 2, i < q ? "v-amber" : "copper"); }
      api.rect(0, by, cw, 3, "residue"); api.rect(0, by, Math.round(cw * Math.min(q * 350, 1750) / 1750), 3, "v-amber");
      var xl = Math.round(cw * 1500 / 1750); api.rect(xl, by - 2, 1, 7, "ink");
      lab(api, "clk", "silence clock " + rl(th(q * 350)) + " ms · stops at " + SRC.stop + " ms", 0, 10, { cls: "i" });
      var sl = lab(api, "sl", q >= 5 ? "the fifth quiet tick: the stop flag flips, the loop finishes its turn" : "each quiet tick adds " + SRC.tick + " ms · speech resets it · " + SRC.grace + " ms grace at the start", 0, 15, {});
      sl.style.whiteSpace = "normal"; sl.style.width = W * C + "px";
      // the final pass of the replay: the clip ends at 7.33 s, and the flush types what the tail still holds
      var y = 26, on = k >= 3, t0 = FIN.ws, t1 = CLIP, x0 = 0, x1 = W - 1, cutN = FIN.raw.length - FIN.typed.length;
      lab(api, "h1", "the replay’s final pass · window " + pl(s2(FIN.ws)) + "–" + pl(s2(CLIP)) + " s", 0, y, { cls: on ? "i" : "" }).classList.toggle("gh", !on);
      spans(api, x0, x1, y + 6, 8, t0, t1, { words: FIN.raw, quiet: function () { return on ? "copper" : "residue"; }, tint: function (tt, i) { return !on ? "residue" : i >= cutN ? "v-blue" : "v-violet"; } });
      api.rect(0, y + 15, W, 1, on ? "copper" : "residue");
      var h2 = lab(api, "h2", "it hears " + chips(FIN.raw, function (w) { return FIN.raw.indexOf(w) < cutN ? "k-x" : "k-b"; }) + ": the cut by text removes what is typed already, and the flush types the rest", 0, y + 18, {});
      h2.hidden = k < 4; h2.style.whiteSpace = "normal"; h2.style.width = W * C + "px";
      var off = lab(api, "off", "the microphone goes off · " + pl("22") + " words typed, " + pl("0") + " taken back", 0, y + 18 + hRows(h2) + 1, { cls: "i" });
      off.hidden = k < 5; off.style.whiteSpace = "normal"; off.style.width = W * C + "px";
    }
    /* one timeline tick per quiet tick, at the loop's own 350 ms: the clock climbs 700, 1,050, 1,400 under the words
       that name them, reads 1,750 at the fifth, then the final pass and the stop take a tick each */
    scene("sc-stop", [54, 64], {
      ticks: 8, tps: 20 / 7, pause: 1300,
      draw: function (api, tick) {
        var q = tick <= 0 ? 1 : tick >= 5 ? 5 : Math.min(4, tick + 1), k = tick <= 0 ? 0 : tick < 5 ? 1 : Math.min(5, tick - 3);
        paint(api, k, q);
      }
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
    var SPLITS = [["held-out · 20 speakers", 19.7, 6.7, 5.4, 78, 3, 523, RM, RM], ["dev · 20 speakers + 1 reference clip", 15.8, 4.9, 3.5, 64, 2, 513, BR + "71", BR + "121"],
      ["all 41 clips", 17.8, 5.8, 4.4, 142, 5, 1036, B0 + "43", B1 + "43"]];
    var MAX = 20;
    function ease(f) { return f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; }
    function paint(api, k, o) {
      o = o || {};
      var W = api.cols, nar = narrow(api), a = o.live ? (o.after ? 1 : 0) : k >= 3 ? 1 : k === 2 ? ease(o.frac || 0) : 0;
      var after = a >= 1;
      api.clear();
      // the reading, word by word: after the fix as typed; before it as that run typed it, its lost words struck in red
      var j = 0, html = after ? '<span class="k-t">' + esc(WORDS.map(shown).join(" ")) + "</span>" : WORDS.map(function (w, i) {
        return LOST[i] ? '<span class="k-lost">' + esc(shown(w)) + "</span>" : '<span class="k-t">' + esc(SHOWN0.get(TYPED0[j++])) + "</span>";
      }).join(" ");
      // the header wraps on a narrow stage: the reading starts under however many lines it takes
      var jh = lab(api, "jh", "the reading, " + (after ? "after the fix · " + pl("0") + " dropped" : "before the fix · " + bl(NLOST) + " of " + bl(WORDS.length) + " words dropped"), 0, 0, { cls: "i" });
      jh.style.whiteSpace = "normal"; jh.style.width = W * C + "px";
      var yt = hRows(jh) + 1, jt = wrap(api, "jt", html, 0, yt, W, {}), y = yt + hRows(jt) + 3;
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
    var LG = "gate (ci-gate) job: ALL stream WER 0.046 offline WER 0.038", LC = "gate (ci-control) job: ALL stream WER 0.143 offline WER 0.038; the benchmark’s reference clip dropped 2 of its 22 words";
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
        var gh = lab(api, "gt", "gate · fails above offline + " + n("2", PIN + "bench/README.md#L38-L41") + " points " + n("or if the benchmark’s reference clip loses a word", PIN + "bench/gate.py#L5-L7"), 0, yg, { cls: on3 ? "i" : "" });
        gh.style.whiteSpace = "normal"; gh.style.width = W * C + "px";
        var y1 = yg + hRows(gh) + 2, xl = X(LINE);
        var th = lab(api, "th", "offline " + dv("3.8%", LG) + " + " + n("2", PIN + "bench/README.md#L38-L41"), xl + 2, y1, {}); th.style.color = "var(--v-amber)";
        var r0 = lab(api, "r0", "gate · " + (on3 ? dv("4.6%", LG) + ' · <span class="k-g">passed</span>' : "waiting"), 0, y1 + 5, { cls: on3 ? "i" : "" });
        var yb0 = y1 + 5 + hRows(r0);
        api.rect(0, yb0 + 1, W - 2, 1, "residue");
        if (tick > 26) api.rect(0, yb0, Math.max(1, Math.round(X(GATE) * ease((tick - 26) / 4))), 3, "v-green");   // full as its step lands
        var r1 = lab(api, "r1", "control, a " + n("0.5/0.2", CI + "48-L50") + " s window · " + (on4 ? dv("14.3%", LC) + ", the benchmark’s reference clip drops " + dv("2", LC) + ' · <span class="k-r">failed</span>, as it must' : "waiting"), 0, yb0 + 5, { cls: on4 ? "i" : "" });
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
