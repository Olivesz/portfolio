/* freeflow, in depth: the streaming rules re-run over one scripted utterance, and the fourteen scenes that draw them.
   Nothing here is a recording: every word time is script, and every number the scenes print comes from running the
   repo's rules (Olivesz/freeflow@6d541e6) over that script. Cells are 4 px everywhere; the number of columns follows
   the width of the page, so time axes stretch and text rows keep their size. */
(function () {
  "use strict";
  var PIN = "Olivesz/freeflow@6d541e6:";
  var D = PIN + "mac/Sources/Freeflow/Dictation.swift#L", WS = PIN + "mac/Sources/Freeflow/WhisperStreamer.swift#L";
  function n(v, src) { return '<span data-src="' + src + '">' + v + "</span>"; }
  function sc(v, rule) { return '<span data-src="page:scripted"' + (rule ? ' data-rule="' + rule + '"' : "") + ">" + v + "</span>"; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function f2(x) { return (Math.round(x * 100) / 100).toFixed(2); }
  function f1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function th(x) { return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  /* ---------------- the script and the rules (the rules from WhisperStreamer.swift, re-run over a scripted sentence) ---------------- */
  var WORDS = [["Send", .30, .52], ["the", .55, .64], ["draft", .66, .98], ["to", 1.02, 1.12], ["the", 1.14, 1.22],
    ["team", 1.25, 1.55], ["by", 1.62, 1.78], ["Friday,", 1.82, 2.30], ["and", 2.55, 2.68], ["ask", 2.72, 2.95],
    ["them", 2.98, 3.15], ["to", 3.18, 3.27], ["check", 3.30, 3.58], ["the", 3.61, 3.70], ["budget.", 3.74, 4.20]];
  var MIS = { 2: ["drafts", .45], 5: ["tea", .2], 6: ["buy", .2], 7: ["Fry", .35], 10: ["the", .2], 12: ["chuck", .25] };
  var HEARD = 0.12, TICK = 0.35, MINW = 0.5, MAC = [3.0, 1.5], PY = [8.0, 2.0];
  var SENT = "Send the draft to the team by Friday, and ask them to check the budget.";
  function norm(s) { return s.trim().toLowerCase(); }
  function hyp(words, t, off, mis, skip) {
    var out = [];
    words.forEach(function (w, i) {
      if (t < w[1] + HEARD || w[1] < off - 0.05) return;
      if (skip && skip(i, t)) return;
      var m = mis && mis[i];
      out.push({ i: i, w: m && t - w[1] < m[1] ? m[0] : w[0], s: w[1], e: w[2], wrong: !!(m && t - w[1] < m[1]) });
    });
    return out;
  }
  function Streamer(trimAfter, context, textCheck) {
    this.committed = []; this.buffer = []; this.last = 0; this.offset = 0;
    this.trimAfter = trimAfter; this.context = context; this.textCheck = textCheck !== false;
  }
  Streamer.prototype.strip = function (ws) {
    var S = this, r = ws.filter(function (w) { return w.s > S.last - 0.1; });
    if (S.textCheck && S.committed.length && r.length) {
      var tail = S.committed.slice(-6).map(function (w) { return norm(w.w); }), head = r.slice(0, 6).map(function (w) { return norm(w.w); });
      for (var k = Math.min(tail.length, head.length); k > 0; k--) {
        if (tail.slice(-k).join("\u0000") === head.slice(0, k).join("\u0000")) { r = r.slice(k); break; }
      }
    }
    return r;
  };
  Streamer.prototype.process = function (ws) {
    ws = this.strip(ws);
    var got = [], i = 0;
    while (i < ws.length && i < this.buffer.length && norm(ws[i].w) === norm(this.buffer[i].w)) { got.push(ws[i]); this.last = ws[i].e; i++; }
    this.committed = this.committed.concat(got); this.buffer = ws.slice(i);
    var trimmed = false;
    if (this.last - this.offset > this.trimAfter) { this.offset = Math.max(this.offset, this.last - this.context); trimmed = true; }
    return { got: got, trimmed: trimmed };
  };
  Streamer.prototype.finalize = function (ws) {
    var rest = this.strip(ws);
    if (rest.length) this.last = rest[rest.length - 1].e;
    this.committed = this.committed.concat(rest); return rest;
  };
  function run(words, trims, tStop, o) {
    o = o || {};
    var mis = o.mis === undefined ? MIS : o.mis;
    var st = new Streamer(trims[0], trims[1], o.textCheck), rows = [], k = 1, t = 0;
    while (TICK * k <= tStop + 1e-9) {
      t = r3(TICK * k);
      if (t - st.offset < MINW) { rows.push({ t: t, skip: true }); k++; continue; }
      var off0 = st.offset, h = hyp(words, t, st.offset, mis, o.skip), res = st.process(h);
      rows.push({ t: t, off0: off0, win: r3(t - off0), heard: h, typed: res.got.map(function (w) { return w.w; }), typedW: res.got,
        wait: st.buffer.map(function (w) { return w.w; }), last: r3(st.last), offset: r3(st.offset), trimmed: res.trimmed });
      k++;
    }
    var rest = st.finalize(hyp(words, tStop, st.offset, mis, o.skip));
    return { rows: rows, st: st, rest: rest.map(function (w) { return w.w; }) };
  }
  function text(st) { return st.committed.map(function (w) { return w.w; }).join(" "); }

  var MAIN = run(WORDS, MAC, 5.95);
  var PASSES = MAIN.rows.filter(function (r) { return !r.skip; });
  var OFF = run(WORDS, MAC, 5.95, { textCheck: false });
  var STEADY = []; for (var i = 0; i < 75; i++) STEADY.push(["w" + i, r3(0.3 + 0.4 * i), r3(0.6 + 0.4 * i)]);
  function steady(trims, secs) {
    var ws = STEADY.filter(function (w) { return w[1] < secs; });
    return run(ws, trims, secs + 0.3, { mis: {} }).rows.filter(function (r) { return !r.skip; });
  }
  function total(rows) { return rows.reduce(function (a, r) { return a + r.win; }, 0); }
  var ST_OFF = steady([1e9, 0], 30), ST_MAC = steady(MAC, 30), ST_PY = steady(PY, 30);
  /* the retype policy (the iOS spike's reconcile): keep the common prefix, backspace the rest, type the new ending */
  var RETYPE = (function () {
    var typed = "", bs = 0, shown = {}, out = [];
    for (var k = 1; k < 18; k++) {
      var t = r3(TICK * k); if (t < MINW) continue;
      var h = hyp(WORDS, t, 0, MIS), full = h.map(function (w) { return w.w; }).join(" ");
      h.forEach(function (w) { if (w.wrong) shown[w.i + w.w] = w.w; });
      var j = 0; while (j < typed.length && j < full.length && typed[j] === full[j]) j++;
      var del = typed.length - j; bs += del; typed = full;
      out.push({ t: t, h: h, del: del, bs: bs, shown: Object.keys(shown).length });
    }
    return out;
  })();
  var SKIPF = function (i, t) { return i >= 9 && i <= 12 && t <= 4.55; };
  var SKIP = run(WORDS, MAC, 5.95, { skip: SKIPF });
  var HOLD = run(WORDS, MAC, 4.30);

  /* self-checks: these must pass before any scene draws */
  var CHK = {};
  (function () {
    var bursts = PASSES.filter(function (r) { return r.typed.length; }).map(function (r) { return r.typed.join(" "); });
    CHK.passTable = bursts.join("|") === "Send the|draft to the|team|by|Friday,|and|ask|them to|check the|budget." &&
      PASSES[0].t === 0.7 && PASSES.filter(function (r) { return r.trimmed; }).map(function (r) { return [r.t, r.last, r.offset].join(); }).join("|") === "3.85,3.27,1.77" &&
      PASSES.filter(function (r) { return r.t === 4.2; })[0].win === 2.43 && text(MAIN.st) === SENT && MAIN.rest.length === 0;
    CHK.textOff = text(OFF.st) === "Send the the draft to the the team by Friday, and ask them to to check the budget.";
    var last = RETYPE[RETYPE.length - 1];
    CHK.retype = last.bs === 7 && last.shown === 6;
    CHK.steady = ST_OFF.length === 85 && Math.round(total(ST_OFF)) === 1309 && Math.round(total(ST_PY)) === 442 && Math.round(total(ST_MAC)) === 234 &&
      Math.max.apply(null, ST_MAC.map(function (r) { return r.win; })) === 3.85 && Math.max.apply(null, ST_PY.map(function (r) { return r.win; })) === 8.85;
    CHK.skip = text(SKIP.st) === "Send the draft to the team by Friday, and the budget." &&
      SKIP.rows.filter(function (r) { return r.trimmed; }).map(function (r) { return [r.t, r.last, r.offset].join(); }).join("|") === "4.2,3.7,2.2";
    CHK.hold = HOLD.rest.join() === "budget." && HOLD.rows[HOLD.rows.length - 1].typed.join() === "check,the";
    var whole = (" " + SENT).length; CHK.events = whole === 72;
    var b = new Streamer(8, 2);
    for (var q = 0; q < 2; q++) b.process([{ w: " hello", s: 0, e: 0.5 }, { w: " world", s: 0.5, e: 1.0 }]);
    CHK.repeat = b.strip([{ w: " world", s: 0.95, e: 1.4 }, { w: " again", s: 1.4, e: 1.8 }]).map(function (w) { return w.w; }).join() === " again";
    CHK.ok = Object.keys(CHK).every(function (k) { return CHK[k] === true; });
  })();
  window.__ff = { checks: CHK, passes: PASSES, retype: RETYPE };
  function ok() { return CHK.ok; }

  /* ---------------- drawing helpers ---------------- */
  var C = 4;                                                         // css px per cell, on every screen
  function colsFor(id) { var st = document.querySelector("#" + id + " .sc-stage"); return Math.max(72, Math.floor(Math.min(704, st ? st.clientWidth : 704) / C)); }
  function scene(id, rows, spec) {
    var cols = colsFor(id);
    if (rows instanceof Array) rows = cols < 140 ? rows[1] : rows[0];
    spec.grid = { cols: cols, rows: rows, pitch: C, pitchPhone: C, min: C };
    spec.align = "left";
    spec.read = spec.read || 200;                                    // hold each step until its words can be read
    spec.check = spec.check || ok;
    return Deep.scene(id, spec);
  }
  function narrow(api) { return api.cols < 140; }
  function lab(api, id, html, x, y, o) {
    o = o || {}; o.html = true; var L = api.scene.labels[id]; if (L) L.e.hidden = false;      // unhide first: a hidden label measures 0 wide
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
  /* a deterministic loudness for the script: loud inside a word, near zero between words */
  function hash(k) { var x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function amp(words, t) {
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (t >= w[1] && t <= w[2]) { var u = (t - w[1]) / (w[2] - w[1]); return (0.35 + 0.65 * hash(Math.round(t * 200))) * Math.sin(Math.PI * Math.min(1, Math.max(0.08, u))); }
    }
    return 0.04 * hash(Math.round(t * 200) + 7);
  }
  /* waveform of [t0, t1] over columns x0..x1, rows y..y+h-1; o.upto: time not yet spoken is left blank;
     o.tint(t) picks a token per column (default violet) */
  function wave(api, x0, x1, y, h, t0, t1, o) {
    o = o || {}; var words = o.words || WORDS;
    for (var x = x0; x <= x1; x++) {
      var t = t0 + (x - x0 + 0.5) / (x1 - x0 + 1) * (t1 - t0);
      if (o.upto !== undefined && t > o.upto) break;
      var a = o.silent ? 0.02 : amp(words, t) * (o.gain || 1);
      if (a < 0.08) { api.rect(x, y + (h - 1) / 2 | 0, 1, 1, o.quiet ? o.quiet(t) : "copper"); continue; }   // quiet: a flat hairline, never a bar
      var hh = Math.max(2, Math.round(a * h));
      if (hh % 2 !== h % 2) hh = Math.min(h, hh + 1);
      api.rect(x, y + (h - hh) / 2 | 0, 1, hh, o.tint ? o.tint(t) : "v-violet");
    }
  }
  function tx(x0, x1, t0, t1, t) { return Math.round(x0 + (t - t0) / (t1 - t0) * (x1 - x0)); }
  function chipRow(words, cls) { return words.map(function (w) { return '<span class="' + (typeof cls === "function" ? cls(w) : cls) + '">' + esc(w.w !== undefined ? w.w : w) + "</span>"; }).join(" "); }

  var SRC = {
    tick: n("350", D + "34"), min: n("0.5", D + "95"), floor: n("0.006", D + "37"), keep02: n("0.2", D + "157"),
    trim: n("3.0", WS + "28"), ctx: n("1.5", WS + "29"), khz: n("16", PIN + "mac/Sources/Freeflow/AudioCapture.swift#L9-L10"),
    two: n("2", WS + "6"), bs0: n("0", D + "28-L29")
  };

  /* ================= S1 · a dictation, start to finish ================= */
  (function () {
    var BURSTS = PASSES.filter(function (r) { return r.typed.length; });
    function T(tick) { return r2((tick - 4) * 0.05); }
    scene("sc-dictate", 74, {
      ticks: 128, tps: 20, pause: 900,
      draw: function (api, tick) {
        var W = api.cols, t = T(tick), nar = narrow(api), listening = t >= 0 && t < 5.95;
        api.clear();
        // menubar with the mic icon
        api.rect(0, 0, W, 5, "residue");
        var mx = W - 6; api.rect(mx + 1, 1, 2, 2, listening ? "v-blue" : "void"); box(api, mx, 0, 4, 4, listening ? "v-blue" : "muted");
        lab(api, "mb", listening ? '<span class="k-b2">listening</span>' : "menubar", W - 8, 0, { align: "right", dx: 0, dy: 2 });
        // the other app's draft window
        box(api, 0, 7, W, 24, "copper"); api.rect(1, 8, W - 2, 3, "residue");
        lab(api, "win", "mail draft · another app", 2, 8, { dy: -1 });
        var typed = BURSTS.filter(function (r) { return r.t <= t + 1e-9; }).map(function (r) { return r.typed.join(" "); }).join(" ");
        wrap(api, "txt", '<span class="k-t">' + esc(typed) + '</span><span class="caret"></span>', 2, 13, W - 4, { cls: "i" });
        // the key cap
        var down = tick >= 4 && tick <= 6;
        lab(api, "key", '<span class="' + (down ? "cap on" : "cap") + '">' + n("⌥Space", PIN + "mac/Sources/Freeflow/Settings.swift#L19") + "</span> " + (tick < 4 ? "tap to start" : t < 5.95 ? "tapped: listening" : "stopped"), 0, 33, { cls: "i" });
        // waveform, ruler and playhead (0 to 6.4 s)
        var x0 = 0, x1 = W - 1, t1 = 6.4;
        api.rect(0, 52, W, 1, "copper");
        if (t > 0) wave(api, x0, x1, 39, 12, 0, t1, { upto: Math.min(t, 6.4) });
        for (var s = 0; s <= 6; s++) { var xs = tx(x0, x1, 0, t1, s); api.rect(xs, 52, 1, 2, "muted"); lab(api, "r" + s, sc(s) + (s === 0 ? " s" : ""), xs, 55, { align: s ? "center" : "left" }); }
        if (t >= 0) { var xp = tx(x0, x1, 0, t1, Math.min(t, 6.4)); api.rect(xp, 38, 1, 16, "v-amber"); }
        // silence clock after the last word
        var quiet = PASSES.filter(function (r) { return r.t >= 4.55 && r.t <= t + 1e-9; }).length, clock = quiet * 350;
        var cw = nar ? W - 2 : 64, bx = 0, by = 66;
        api.rect(bx, by, cw, 2, "residue");
        api.rect(bx, by, Math.round(cw * Math.min(clock, 1750) / 1750), 2, "v-amber");
        api.rect(bx + Math.round(cw * 1500 / 1750), by - 1, 1, 4, "ink");
        lab(api, "sil", "silence clock " + sc(th(clock), D + "107-L109") + " ms · stops at " + n("1,500", PIN + "mac/Sources/Freeflow/Settings.swift#L27-L28"), 0, 69, {});
        lab(api, "bs", "backspaces " + SRC.bs0, W - 1, 60, { align: "right", cls: "i" });
        var mk = api.key === "rest";
        var m = lab(api, "marks", "tap " + sc("0") + " · words " + sc("1.05") + "–" + sc("4.55") + " s · stop " + sc("5.95") + " s", 0, 60, { cls: "i" });
        m.hidden = !mk; if (nar && mk) hide(api, "bs");
      }
    });
  })();

  /* ================= S2 · the model changes its mind ================= */
  (function () {
    var COMM = [];                                                    // typed so far after each pass, append-only
    PASSES.slice(0, 12).forEach(function (r, i) { COMM.push((i ? COMM[i - 1] : []).concat(r.typed)); });
    scene("sc-mind", 50, {
      ticks: 12, tps: 3, pause: 1000,
      draw: function (api, tick) {
        var W = api.cols, i = Math.min(tick, 11), rest = tick >= 12, R = rest ? RETYPE[RETYPE.length - 1] : RETYPE[i];
        api.clear();
        lab(api, "pt", "pass at " + sc(f2(rest ? 5.95 : PASSES[i].t)) + " s", W - 1, 0, { align: "right", cls: "i" });
        lab(api, "l1", '<span class="k-r2">retype</span> · ' + (narrow(api) ? "backspaces fix it" : "type each guess, fix it with backspaces"), 0, 0, { cls: "i" });
        box(api, 0, 5, W, 13, "copper");
        var h = rest ? hyp(WORDS, 5.95, 0, MIS) : R.h;
        wrap(api, "f1", chipRow(h, function (w) { return w.wrong ? "k-r" : "k-t"; }) + '<span class="caret"></span>', 2, 7, W - 4, {});
        lab(api, "c1", "backspaces " + sc(R.bs, PIN + "ios/Keyboard/KeyboardViewController.swift#L99-L107") + (R.del && !rest ? ' <span class="k-r">(−' + sc(R.del) + " this pass)</span>" : "") +
          " · wrong words shown " + sc(R.shown), 0, 19, { cls: "i" });
        lab(api, "l2", '<span class="k-t">append-only</span> · type a word once ' + SRC.two + " passes agree", 0, 27, { cls: "i" });
        box(api, 0, 32, W, 13, "copper");
        var cm = rest ? SENT.split(" ") : COMM[i];
        wrap(api, "f2", '<span class="k-t">' + esc(cm.join(" ")) + '</span><span class="caret"></span>', 2, 34, W - 4, {});
        lab(api, "c2", "backspaces " + SRC.bs0 + " · wrong words shown " + sc("0"), 0, 46, { cls: "i" });
      }
    });
  })();

  /* ================= S3 · every pass re-reads everything ================= */
  function stair(api, rowsA, shown, y0, H, maxS, tokA, ghost) {
    var W = api.cols, n85 = 85, bw = Math.max(1, Math.floor((W - 2) / n85));
    if (ghost) ghost.forEach(function (r, i) { var h = Math.max(1, Math.round(r.win / maxS * H)); api.rect(i * bw, y0 + H - h, bw, h, "copper"); });
    rowsA.slice(0, shown).forEach(function (r, i) {
      var h = Math.max(1, Math.round(r.win / maxS * H));
      api.rect(i * bw, y0 + H - h, Math.max(1, bw - (bw > 1 ? 1 : 0)), h, tokA);
    });
    api.rect(0, y0 + H, Math.min(W, n85 * bw), 1, "muted");
    return bw;
  }
  (function () {
    scene("sc-stair", 62, {
      ticks: 86, tps: 22, pause: 1100,
      draw: function (api, tick) { drawStair(api, ST_OFF, Math.min(tick, 85), tick >= 86, 30); },
      inputs: [{ id: "s10", label: "talk 10 s", momentary: true }, { id: "s20", label: "talk 20 s", momentary: true }, { id: "s30", label: "talk 30 s", momentary: true }],
      live: { start: function () { return { secs: 30 }; }, step: function () { return false; },
        draw: function (api, s) { drawStair(api, steady([1e9, 0], s.secs), 85, true, s.secs); } },
      onInput: function (api, id, on, s) { if (s) s.secs = +id.slice(1); }
    });
    function drawStair(api, rows, shown, rest, secs) {
      api.clear();
      var W = api.cols, y0 = 10, H = 40, bw = stair(api, rows, shown, y0, H, 30.1, "v-violet");
      var sh = rows.slice(0, shown), last = sh[sh.length - 1];
      lab(api, "tot", "audio re-read so far " + sc(th(Math.round(total(sh))), PIN + "README.md#L97-L99") + " s · passes " + sc(sh.length), 0, 0, { cls: "r" });
      if (last) {
        var lx = (sh.length - 1) * bw, ly = y0 + H - Math.round(last.win / 30.1 * H);
        lab(api, "lb", sc(f1(last.win)) + " s", Math.min(lx, W - 1), ly, { align: "right", dy: -18, cls: "i" });
      } else hide(api, "lb");
      lab(api, "ax", "one bar per pass, every " + SRC.tick + " ms" + (narrow(api) ? "" : " · height: seconds of audio it reads"), 0, y0 + H + 2, {});
      var g = lab(api, "gh", "fig 10 brings this down", 0, y0 + H + 7, { cls: "a" }); g.hidden = !rest;
    }
  })();

  /* ================= S4 · the whole machine ================= */
  (function () {
    var ST = [
      ["key", "ink", n("⌥Space", PIN + "mac/Sources/Freeflow/Settings.swift#L19"), "tap to start and stop, or hold to talk", 0],
      ["mic", "v-violet", "microphone", SRC.khz + " kHz · mono", 0],
      ["buf", "v-violet", "one growing buffer", "the loop only ever reads copies", 1],
      ["win", "v-amber", "the window", "a copy every " + SRC.tick + " ms", 2],
      ["gate", "v-amber", "three gates", "≥ " + SRC.min + " s · rms ≥ " + SRC.floor + " · tail +" + SRC.keep02 + " s", 3],
      ["model", "ink", "whisper.cpp", n("base.en", D + "9") + " · " + n("beam search", D + "45"), 4],
      ["words", "v-cyan", "words with times", "one word per segment", 4],
      ["agree", "v-green", "two passes agree?", "type only the agreed front", 5],
      ["typed", "v-blue", "typed into the focused app", "backspaces " + SRC.bs0, 5],
      ["trim", "v-amber", "trim the window", "&gt; " + SRC.trim + " s typed → keep " + SRC.ctx + " s", 6]
    ];
    scene("sc-loop", 10 * 9 + 4, {
      ticks: 6, tps: 1.2, pause: 900,
      draw: function (api, tick) {
        var W = api.cols, nar = narrow(api), RH = 9, X = 6;           // X: where the stages start; the lane left of it is the loop
        api.clear();
        ST.forEach(function (s, i) {
          var y = i * RH + 1, lit = s[4] <= tick, now = s[4] === tick || tick >= 6, tok = lit ? s[1] : "copper";
          if (i) vline(api, X + 3, y - RH + 4, y - 1, lit ? "muted" : "residue");
          api.rect(X + 1, y, 5, 4, tok);
          if (!now && lit) api.rect(X + 2, y + 1, 3, 2, "void");
          lab(api, "n" + i, s[2], X + 9, y, { dy: -6, cls: lit ? "i" : "" });
          lab(api, "c" + i, s[3], nar ? X + 9 : X + 64, y, { dy: nar ? 10 : -6, cls: lit ? (s[1] === "ink" ? "i" : "") : "" }).style.color = lit && s[1] !== "ink" ? "var(--" + s[1] + ")" : "";
        });
        // the loop: from the trim back up to the window, every 350 ms
        var on = tick >= 6, tk = on ? "v-amber" : "residue", yw = 3 * RH + 2, yt = 9 * RH + 2;
        dash(api, 0, X, yt, tk); vdash(api, 0, yw, yt, tk); dash(api, 0, X - 2, yw, tk);
        api.rect(X - 1, yw - 1, 1, 3, tk); api.rect(X, yw, 1, 1, tk);
        var tl = lab(api, "tl", "every " + SRC.tick + " ms, round again from the window", 0, yt + (nar ? 6 : 4), { cls: on ? "a" : "" });
        tl.style.color = on ? "var(--v-amber)" : "";
      }
    });
  })();

  /* ================= S5 · one growing buffer ================= */
  (function () {
    scene("sc-buffer", 54, {
      ticks: 40, tps: 10, pause: 1200,
      draw: function (api, tick) {
        var W = api.cols, nb = Math.min(8, Math.floor(tick / 4) + 1), blockW = Math.floor((W - 2) / 8);
        api.clear();
        lab(api, "m", "microphone · device rate · " + n("4,096", PIN + "mac/Sources/Freeflow/AudioCapture.swift#L19-L21") + " frames a block", 0, 0, {});
        // mic blocks: dense, the device's own rate
        for (var b = 0; b < nb; b++) {
          var bx = 1 + b * blockW, fresh = b === nb - 1 && tick < 36;
          for (var x = bx; x < bx + blockW - 1; x++) { var a = 0.15 + 0.85 * hash(x * 3 + b), h = Math.max(1, Math.round(a * 8)); api.rect(x, 5 + (8 - h) / 2 | 0, 1, h, fresh ? "v-violet" : "copper"); }
        }
        lab(api, "cv", "converted on arrival → " + SRC.khz + " kHz · mono · float", 0, 15, { cls: "i" });
        var cx = 1 + (nb - 1) * blockW + (blockW >> 1);
        if (tick < 36) { vline(api, cx, 14, 21, "ink"); api.rect(cx - 1, 21, 3, 1, "ink"); }
        // the buffer: it only grows
        var lock = tick % 4 === 1 && tick < 36;
        lab(api, "bl", "buffer " + (lock ? '<span class="k-a">locked: appending</span>' : "· one buffer, append only"), 0, 23, {});
        box(api, 0, 28, W, 8, "copper");
        var fill = Math.round((W - 2) * Math.min(1, (tick + 1) / 36));
        for (var x2 = 1; x2 <= fill; x2++) { var a2 = 0.2 + 0.8 * hash(x2 * 5), h2 = Math.max(1, Math.round(a2 * 6)); api.rect(x2, 29 + (6 - h2) / 2 | 0, 1, h2, "v-violet"); }
        var x05 = Math.round((W - 2) / 4);                            // the strip holds 2.0 s; 0.5 s is a quarter of it
        api.rect(x05, 26, 1, 12, "v-amber");
        lab(api, "rl", n("8,000", D + "95") + " samples = " + SRC.min + " s", x05, 38, { cls: "" }).style.color = "var(--v-amber)";
        var snap = tick >= 38;
        if (snap) { box(api, 0, 46, fill + 2, 6, "muted"); for (var x3 = 1; x3 <= fill; x3++) api.rect(x3, 48, 1, 2, "copper"); }
        var s = lab(api, "sn", "snapshot: the model reads this copy, never the mic", 0, 42, { cls: "i" }); s.hidden = !snap;
      }
    });
  })();

  /* ================= S6 · the tick and its three gates ================= */
  (function () {
    // windows per step: [label, t0, t1, silent, tail cut at]
    var WIN = [["tick at " + sc("0.35") + " s · window " + sc("0.35") + " s", 0, 0.35, false],
      ["tick at " + sc("0.70") + " s · window " + sc("0.70") + " s", 0, 0.70, false],
      ["a tap with nothing said · scripted", 0, 0.70, true],
      ["tick at " + sc("4.55") + " s · window " + sc("1.77") + "–" + sc("4.55") + " s", 1.77, 4.55, false, 4.40],
      ["tick at " + sc("4.55") + " s · window " + sc("1.77") + "–" + sc("4.55") + " s", 1.77, 4.55, false, 4.40]];
    function paint(api, k, o) {
      o = o || {};
      var W = api.cols, nar = narrow(api), w = WIN[k], t0 = w[1], t1 = o.tail ? w[2] + 0.5 : w[2], cut = w[4];
      var span = Math.max(1.2, t1 - t0 + 0.2), x1 = Math.round((t1 - t0) / span * (W - 2)), xs = x1;
      api.clear();
      lab(api, "w", w[0] + (o.tail ? " + " + sc("0.5") + " s quiet" : ""), 0, 0, { cls: "i" });
      // the window: amber brackets around its audio
      api.rect(0, 5, 1, 10, "v-amber"); api.rect(0, 5, 2, 1, "v-amber"); api.rect(0, 14, 2, 1, "v-amber");
      api.rect(x1 + 1, 5, 1, 10, "v-amber"); api.rect(x1, 5, 2, 1, "v-amber"); api.rect(x1, 14, 2, 1, "v-amber");
      var quiet = w[3] || o.soft, cutAt = cut !== undefined ? cut : null;
      wave(api, 1, x1, 6, 8, t0, t1, { silent: w[3], gain: o.soft ? 0.03 : 1, tint: function (t) { return cutAt !== null && k >= 3 && t > cutAt ? "residue" : "v-violet"; } });
      if (cutAt !== null && k >= 3) { var xc = 1 + Math.round((cutAt - t0) / (t1 - t0) * (x1 - 1)); api.rect(xc, 4, 1, 12, "ink"); lab(api, "cut", "cut here: last voiced " + n("50", D + "150") + " ms frame + " + SRC.keep02 + " s", Math.min(xc, W - 1), 16, { align: xc > W / 2 ? "right" : "left", cls: "i" }); }
      else hide(api, "cut");
      // gates
      var g1 = (t1 - t0) >= 0.5, g2 = g1 && !quiet, g3 = g2;
      var gates = [[g1, "≥ " + SRC.min + " s", n("8,000", D + "95") + " samples"], [g2, "rms ≥ " + SRC.floor, "not silent"], [g3, "quiet tail cut", "keep +" + SRC.keep02 + " s"]];
      var gy = 26, gx = nar ? [2, 31, 60] : [2, 46, 90];
      gates.forEach(function (g, i) {
        var reached = i === 0 || gates[i - 1][0], x = gx[i], tok = reached ? "v-amber" : "copper";
        // a diamond, 7 cells across
        for (var d = 0; d < 4; d++) { api.rect(x + 3 - d, gy + d, 1, 1, tok); api.rect(x + 3 + d, gy + d, 1, 1, tok); api.rect(x + 3 - d, gy + 6 - d, 1, 1, tok); api.rect(x + 3 + d, gy + 6 - d, 1, 1, tok); }
        if (reached && !g[0]) api.rect(x + 2, gy + 2, 3, 3, "v-amber");
        lab(api, "g" + i, g[1], x, gy + 8, { cls: reached ? "i" : "" });
        lab(api, "s" + i, !reached ? "not reached" : g[0] ? '<span class="k-g">open</span>' : '<span class="k-a">closed: no pass</span>', x, gy + 12, {});
        if (i < 2) dash(api, x + 8, gx[i + 1] - 2, gy + 3, g[0] ? "muted" : "residue");
      });
      // the model and the phrase it puts on silence
      var mx = nar ? 2 : 134, my = nar ? 46 : 26;
      box(api, mx, my, nar ? 30 : 40, 7, g3 ? "ink" : "copper");
      lab(api, "mdl", "whisper.cpp", mx + 2, my + 1, { cls: g3 ? "i" : "" });
      if (!nar) dash(api, gx[2] + 8, mx - 2, gy + 3, g3 ? "muted" : "residue");
      var ghost = k === 2 || (o.soft && k >= 3);
      var gh = lab(api, "gh", '<span class="k-x">“thank you”</span>: what it says to silence, never typed', 0, nar ? 54 : 44, {});
      gh.hidden = !ghost; gh.style.color = "var(--v-red)";
      var cl = lab(api, "clk", "a pass that runs past " + SRC.tick + " ms: the next one starts at once", 0, nar ? 58 : 48, {}); cl.hidden = k !== 1 && k !== 4; if (nar) { cl.style.whiteSpace = "normal"; cl.style.width = W * C + "px"; }
      var lg = lab(api, "lg", "too short · quiet tail cut · too quiet", 0, nar ? 66 : 52, { cls: "i" }); lg.hidden = k !== 4;
    }
    scene("sc-gates", [64, 70], {
      ticks: 4, tps: 1, pause: 1400,
      draw: function (api, tick) { paint(api, Math.min(4, tick)); },
      inputs: [{ id: "soft", label: "speak below the floor", states: ["off", "on"] }, { id: "tail", label: "add 0.5 s of quiet", states: ["off", "on"] }],
      live: { start: function () { return {}; }, step: function () { return false; }, draw: function (api) { paint(api, 4, { soft: api.inputs.soft, tail: api.inputs.tail }); } }
    });
  })();

  /* ================= S7 · words with times ================= */
  (function () {
    var P175 = PASSES.filter(function (r) { return r.t === 1.75; })[0];
    var P420 = PASSES.filter(function (r) { return r.t === 4.2; })[0];
    var SIEVE = [["[BLANK_AUDIO]", "[ ]"], ["(water splashing)", "( )"], ["♪ music ♪", "♪"], [".", "no letter or digit"], ["", "empty"], ["*sigh*", "*"],
      [" hello", ""], ["world.", ""], ["I'm", ""], [" 7pm", ""]];
    scene("sc-times", 100, {
      ticks: 40, tps: 8, pause: 1300,
      draw: function (api, tick) {
        var W = api.cols, nar = narrow(api);
        api.clear();
        // pass at 1.75 s: each word with its own start and end
        var x0 = 0, x1 = W - 1, t1 = 1.8;
        lab(api, "h1", "pass at " + sc("1.75") + " s · the window is " + sc("0") + "–" + sc("1.75") + " s", 0, 0, { cls: "i" });
        wave(api, x0, x1, 12, 8, 0, t1, { upto: 1.75 });
        P175.heard.forEach(function (w, i) {
          var a = tx(x0, x1, 0, t1, w.s), b = tx(x0, x1, 0, t1, w.e);
          api.rect(a, 21, Math.max(1, b - a), 2, w.wrong ? "v-red" : "v-cyan");
          lab(api, "w" + i, '<span class="' + (w.wrong ? "k-r" : "k-c") + '">' + esc(w.w) + "</span>", (a + b) / 2, i % 2 ? 9 : 5, { align: "center", dy: -1 });
        });
        var tm = P175.heard.map(function (w) { return esc(w.w) + " " + sc(f2(w.s).replace(/^0/, "")) + "–" + sc(f2(w.e).replace(/^0/, "")); }).join(" · ");
        wrap(api, "tm", tm, 0, 24, W, {});
        var set = lab(api, "set", n("base.en", D + "9") + " · " + n("beam search", D + "45") + " · " + n("english", D + "46") + " · " + n("one word per segment", D + "48") + " · " + n("word timestamps", D + "47"), 0, nar ? 37 : 34, { cls: "i" });
        set.hidden = tick < 8; if (nar) { set.style.whiteSpace = "normal"; set.style.width = (W * C) + "px"; }
        // pass at 4.20 s: window-relative times, moved by the window's offset
        var y2 = nar ? 48 : 44, on2 = tick >= 16, off = 1.77, slide = Math.max(0, Math.min(1, (tick - 18) / 6));
        var tt1 = 4.5, xa = 0, xb = W - 1;
        lab(api, "h2", "pass at " + sc("4.20") + " s · the window starts at " + sc("1.77") + " s", 0, y2, { cls: on2 ? "i" : "" }).hidden = !on2;
        if (on2) {
          var wx0 = tx(xa, xb, 0, tt1, off), wx1 = tx(xa, xb, 0, tt1, 4.2);
          api.rect(0, y2 + 9, W, 1, "copper");
          api.rect(wx0, y2 + 5, 1, 8, "v-amber"); api.rect(wx1, y2 + 5, 1, 8, "v-amber");
          P420.heard.forEach(function (w, i) {
            var s = w.s - off * (1 - slide), e = w.e - off * (1 - slide);
            var a = tx(xa, xb, 0, tt1, s), b = tx(xa, xb, 0, tt1, e);
            api.rect(a, y2 + 7, Math.max(1, b - a), 2, "v-cyan");
          });
          lab(api, "z1", "↑ window start " + sc("1.77") + " s", wx0, y2 + 16, {}).style.color = "var(--v-amber)";
          var f = P420.heard[0];
          lab(api, "fr", esc(f.w) + " " + sc(f2(f.s - off * (1 - slide))) + " s " + (slide >= 1 ? "in the utterance (" + sc("0.05") + " + " + sc("1.77") + ")" : "in the window"), 0, y2 + 12, { cls: "i" });
        } else { hide(api, "fr"); hide(api, "z1"); }
        // the sieve
        var y3 = nar ? 70 : 66, on3 = tick >= 28;
        lab(api, "h3", "the sieve", 0, y3, { cls: on3 ? "i" : "" }).hidden = !on3;
        SIEVE.forEach(function (s, i) {
          var drop = !!s[1], col = nar ? (i < 6 ? 0 : 46) : (i < 6 ? 0 : 92), row = drop ? i : i - 6;
          var e = lab(api, "sv" + i, drop ? '<span class="k-x">' + (s[0] === "" ? "(empty)" : esc(s[0])) + '</span> <span class="k-a">' + esc(s[1]) + "</span>" : '<span class="k-c">' + esc(s[0]) + "</span> kept", col, y3 + 5 + row * 4, {});
          e.hidden = !on3 || tick < 28 + (drop ? i : i - 6);
        });
        lab(api, "sv-h", "dropped", 0, y3 + 5, {}).hidden = true;
      }
    });
  })();

  /* ================= S8 · type only what two passes agree on ================= */
  (function () {
    var F = function (a) { return a.map(function (w) { return { w: w }; }); };
    function agree(last, now) { var i = 0; while (i < last.length && i < now.length && norm(last[i].w) === norm(now[i].w)) i++; return i; }
    function P(t) { return PASSES.filter(function (r) { return r.t === t; })[0]; }
    function prevWait(t) { var i = PASSES.indexOf(P(t)); return F(PASSES[i - 1].wait); }
    function heardAfter(t) { var r = P(t); return F(r.typed.concat(r.wait)); }
    function typedBefore(t) { var out = []; PASSES.forEach(function (r) { if (r.t < t) out = out.concat(r.typed); }); return out; }
    var CASES = [
      { name: "first pass", last: [], now: F([" hello"]), typed: [] },
      { name: "second pass", last: F([" hello"]), now: F([" hello", " world"]), typed: [] },
      { name: "a revision", last: F([" hell"]), now: F([" hello"]), typed: [] },
      { name: "pass at 1.40 s", t: 1.4 }, { name: "pass at 1.75 s", t: 1.75 }, { name: "pass at 2.10 s", t: 2.1 }, { name: "pass at 3.50 s", t: 3.5 }
    ];
    CASES.forEach(function (c) { if (c.t) { c.last = prevWait(c.t); c.now = heardAfter(c.t); c.typed = typedBefore(c.t); } });
    function paint(api, c, rest) {
      var W = api.cols, nar = narrow(api), cw = nar ? 17 : 18;
      api.clear();
      if (rest) {
        lab(api, "tl", "typed", 0, 0, {});
        wrap(api, "tx", '<span class="k-t">' + esc(SENT) + "</span>", 0, 5, W, {});
        lab(api, "lp", "", 0, 14, {}).hidden = true; lab(api, "np", "overturned before they were typed", 0, 18, { cls: "i" });
        for (var q = 0; q < 6; q++) { hide(api, "a" + q); hide(api, "b" + q); hide(api, "m" + q); }
        lab(api, "ov", ["drafts", "tea", "buy", "Fry", "the", "chuck"].map(function (w) { return '<span class="k-x">' + w + "</span>"; }).join(" · "), 0, 23, {});
        hide(api, "res"); hide(api, "case"); return;
      }
      hide(api, "ov");
      var k = agree(c.last, c.now);
      lab(api, "case", c.name.replace(/[\d.]+/, function (m) { return sc(m); }), W - 1, 0, { align: "right", cls: "i" });
      lab(api, "tl", "typed so far", 0, 0, {});
      wrap(api, "tx", '<span class="k-t">' + esc(c.typed.map(function (w) { return w.w || w; }).join(" ").trim()) + "</span>" + (k ? ' <span class="k-b">' + esc(c.now.slice(0, k).map(function (w) { return w.w.trim(); }).join(" ")) + "</span>" : ""), 0, 5, W, {});
      lab(api, "lp", "last pass, still waiting", 0, 14, {}).hidden = false;
      lab(api, "np", "this pass", 0, 30, {});
      for (var i = 0; i < 6; i++) {
        var a = c.last[i], b = c.now[i], x = i * cw;
        var ea = lab(api, "a" + i, a ? '<span class="k-c">' + esc(a.w.trim()) + "</span>" : "", x, 19, {}); ea.hidden = !a;
        var eb = lab(api, "b" + i, b ? '<span class="' + (i < k ? "k-b" : "k-c") + '">' + esc(b.w.trim()) + "</span>" : "", x, 35, {}); eb.hidden = !b;
        var m = i < k ? '<span class="k-g">✓ same</span>' : i === k && a && b ? '<span class="k-a">≠ stop</span>' : "";
        var em = lab(api, "m" + i, m, x, 25, {}); em.hidden = !m;
      }
      var typed = c.now.slice(0, k).map(function (w) { return w.w.trim(); }).join(" "), waits = c.now.slice(k).map(function (w) { return w.w.trim(); }).join(" ");
      lab(api, "res", (typed ? 'typed now <span class="k-t">' + esc(typed) + "</span>" : "typed now: nothing") + (waits ? ' · waits <span class="k-c">' + esc(waits) + "</span>" : ""), 0, 42, { cls: "i" });
    }
    scene("sc-agree", 48, {
      ticks: 7, tps: 1, pause: 1300,
      draw: function (api, tick) { paint(api, CASES[Math.min(tick, 6)], tick >= 7); },
      inputs: [{ id: "hell", label: "word 1", states: ["hello", "hell"] }, { id: "word", label: "word 2", states: ["world", "word"] }, { id: "again", label: "word 3", states: ["none", "again"] }],
      live: { start: function () { return {}; }, step: function () { return false; },
        draw: function (api) {
          var now = [api.inputs.hell ? " hell" : " hello", api.inputs.word ? " word" : " world"]; if (api.inputs.again) now.push(" again");
          paint(api, { name: "your pass", last: F([" hello", " world"]), now: F(now), typed: [] }, false);
        } }
    });
  })();

  /* ================= S9 · never type a word twice ================= */
  (function () {
    function paint(api, k, o) {
      o = o || {};
      var W = api.cols, nar = narrow(api), t1 = 2.0, x0 = 0, x1 = W - 1, start = o.early ? 0.85 : 0.95, off = !!o.off;
      api.clear();
      if (k === 5) { // the running example with the text check off
        lab(api, "e1", "the sentence with the text check off", 0, 0, { cls: "i" });
        var html = OFF.st.committed.map(function (w, i, a) { var rep = i && norm(a[i - 1].w) === norm(w.w); return '<span class="' + (rep ? "k-r" : "k-t") + '">' + esc(w.w) + "</span>"; }).join(" ");
        wrap(api, "e2", html, 0, 5, W, {});
        lab(api, "e3", "short words like “the” start under " + n("0.1", WS + "86") + " s before they end, so the time check lets them back", 0, 16, {}).style.whiteSpace = nar ? "normal" : "nowrap";
        if (nar) api.scene.labels.e3.e.style.width = W * C + "px";
        ["typ", "ln", "nw", "o2", "o1", "out"].forEach(function (id) { hide(api, id); });
        for (var q = 0; q < 4; q++) hide(api, "c" + q);
        return;
      }
      ["e1", "e2", "e3"].forEach(function (id) { hide(api, id); });
      api.rect(0, 22, W, 1, "copper");
      for (var s = 0; s <= 2; s += 0.5) { var xs = tx(x0, x1, 0, t1, s); api.rect(xs, 22, 1, 2, "muted"); }
      var typed = [[" hello", 0, 0.5], [" world", 0.5, 1.0]], neu = [[" world", start, start + 0.45], [" again", 1.4, 1.8]];
      typed.forEach(function (w, i) { var a = tx(x0, x1, 0, t1, w[1]), b = tx(x0, x1, 0, t1, w[2]); api.rect(a + 1, 6, b - a - 1, 3, "v-blue"); lab(api, "c" + i, '<span class="k-t">' + w[0].trim() + "</span>", a + 1, 0, {}); });
      lab(api, "typ", "typed", W - 1, 0, { align: "right" });
      var xl = tx(x0, x1, 0, t1, 0.9);
      if (k >= 0) { api.rect(xl, 3, 1, 21, "v-amber"); lab(api, "ln", "last typed word ends " + sc("1.0") + " s − " + n("0.1", WS + "86") + " s", xl, 24, { align: nar ? "right" : "left", dx: nar ? 0 : 2 }).style.color = "var(--v-amber)"; }
      var timeDrop = start <= 0.9 + 1e-9, textDrop = !timeDrop && !off && k >= 3;
      if (k >= 1) neu.forEach(function (w, i) {
        var a = tx(x0, x1, 0, t1, w[1]), b = tx(x0, x1, 0, t1, w[2]), dropped = i === 0 && (timeDrop || textDrop);
        api.rect(a + 1, 14, b - a - 1, 3, dropped ? "copper" : i === 0 && off && k >= 3 ? "v-red" : "v-cyan");
        lab(api, "c" + (i + 2), '<span class="' + (dropped ? "k-x" : i === 0 && off && k >= 3 ? "k-r" : "k-c") + '">' + w[0].trim() + "</span> " + sc(f2(w[1])) + " s", a + 1, nar && i === 1 ? 17 : 9, {});
      }); else { hide(api, "c2"); hide(api, "c3"); }
      lab(api, "nw", "new pass", W - 1, 9, { align: "right" }).hidden = k < 1 || nar;
      var o2 = lab(api, "o2", "text check, " + sc("2") + " words: hello world · world again → no", 0, 30, { cls: "i" }); o2.hidden = k < 2 || timeDrop || off;
      var o1 = lab(api, "o1", "text check, " + sc("1") + ' word: world · world → <span class="k-g">same, drop it</span>', 0, nar ? 39 : 35, { cls: "i" }); o1.hidden = k < 3 || timeDrop || off;
      var res = timeDrop ? '“world” starts before the line: <span class="k-a">the time check drops it</span>' :
        off && k >= 3 ? 'text check off: the field reads <span class="k-t">hello world</span> <span class="k-r">world</span> <span class="k-c">again</span>' :
        k >= 4 ? 'only <span class="k-c">again</span> goes on to the agreement step' : k >= 1 ? '“world” starts after the line: the time check keeps it' : "";
      var out = lab(api, "out", res, 0, timeDrop || off ? 30 : nar ? 44 : 40, { cls: "i" }); out.hidden = !res;
      if (nar) { out.style.whiteSpace = "normal"; out.style.width = W * C + "px"; }
    }
    scene("sc-twice", [46, 54], {
      ticks: 5, tps: 1, pause: 1400, rest: 4,
      draw: function (api, tick) { paint(api, Math.min(5, tick)); },
      inputs: [{ id: "early", label: "“world” starts", states: ["after the line", "before it"] }, { id: "off", label: "text check", states: ["on", "off"] }],
      live: { start: function () { return {}; }, step: function () { return false; }, draw: function (api) { paint(api, 4, { early: api.inputs.early, off: api.inputs.off }); } }
    });
  })();

  /* ================= S10 · trim the window ================= */
  (function () {
    function paint(api, k, mode) {
      var W = api.cols, nar = narrow(api), t1 = 4.6, x0 = 0, x1 = W - 1;
      api.clear();
      // top: the running example's buffer and the window
      var t = k <= 1 ? 3.85 : 4.2, off = k >= 2 ? 1.77 : 0, lastEnd = 3.27;
      lab(api, "h", "pass at " + sc(f2(t)) + " s · window " + sc(f2(off)) + "–" + sc(f2(t)) + " s" + (k === 1 ? "" : " · reads " + sc(f2(t - off)) + " s"), 0, 0, { cls: "i" });
      wave(api, x0, x1, 6, 8, 0, t1, { upto: t, tint: function (tt) { return tt < off ? "residue" : "v-violet"; } });
      var wa = tx(x0, x1, 0, t1, off), wb = tx(x0, x1, 0, t1, t);
      api.rect(wa, 4, 1, 12, "v-amber"); api.rect(wb, 4, 1, 12, "v-amber"); api.rect(wa, 4, wb - wa + 1, 1, "v-amber");
      // typed audio in the window, against the 3.0 s line
      if (k === 1) { var xn = tx(x0, x1, 0, t1, 1.77); vdash(api, xn, 3, 16, "v-amber"); lab(api, "nx", "next pass starts here", xn, nar ? 25 : 0, { align: "left", dx: 4 }).style.color = "var(--v-amber)"; } else hide(api, "nx");
      var la = tx(x0, x1, 0, t1, k >= 2 ? off : 0), lb = tx(x0, x1, 0, t1, k >= 2 ? 3.7 : lastEnd);
      api.rect(la, 17, Math.max(1, lb - la), 2, "v-blue");
      var l3 = tx(x0, x1, 0, t1, 3.0);
      if (k === 0) { api.rect(l3, 16, 1, 4, "v-amber"); }
      lab(api, "ty", k === 0 ? "typed audio in the window " + sc("3.27") + " s &gt; " + SRC.trim + " s → trim" :
        k === 1 ? "next pass starts at " + sc("3.27") + " − " + SRC.ctx + " = " + sc("1.77") + " s" :
        "heard: Friday, and ask them to check the budget. · new: " + '<span class="k-t">check the</span>', 0, 20, { cls: "i" }).style.whiteSpace = nar ? "normal" : "nowrap";
      if (nar) api.scene.labels.ty.e.style.width = W * C + "px";
      // bottom: thirty seconds of steady scripted speech
      var y0 = 34, H = 34, show = k >= 3;
      lab(api, "b", nar ? "30 s of steady speech · audio read per pass" : "30 s of steady scripted speech · seconds of audio each pass reads", 0, y0 - 4, {}).hidden = !show;
      if (show) {
        var rows = mode === "py" ? ST_PY : mode === "off" ? ST_OFF : ST_MAC;
        stair(api, rows, 85, y0 + 4, H, 30.1, mode === "py" ? "v-cyan" : mode === "off" ? "v-violet" : "v-blue", mode === "off" ? null : ST_OFF);
        var tot = Math.round(total(rows)), lo = mode === "py" ? "2.55" : "2.05", hi = mode === "py" ? "8.85" : "3.85";
        lab(api, "tt", (mode === "off" ? "no trim · " : (mode === "py" ? "python " + n("8.0 / 2.0", PIN + "freeflow/stt.py#L164") : "mac " + SRC.trim + " / " + SRC.ctx) + " · window " + sc(lo) + "–" + sc(hi) + " s · ") + "total " + sc(th(tot)) + " s, not " + sc("1,309") + " s", 0, y0 + H + 6, { cls: "i" }).style.whiteSpace = nar ? "normal" : "nowrap";
        if (nar) api.scene.labels.tt.e.style.width = W * C + "px";
      } else hide(api, "tt");
    }
    scene("sc-trim", 84, {
      ticks: 4, tps: 1, pause: 1500,
      draw: function (api, tick) { paint(api, Math.min(4, tick), "mac"); },
      inputs: [{ id: "py", label: "settings", states: ["mac", "python"] }, { id: "off", label: "trim", states: ["on", "off"] }],
      live: { start: function () { return {}; }, step: function () { return false; }, draw: function (api) { paint(api, 4, api.inputs.off ? "off" : api.inputs.py ? "py" : "mac"); } },
      onInput: function (api, id, on) { if (on) { if (id === "py") api.inputs.off = false; else api.inputs.py = false; api.scene.syncInputs(); } }
    });
  })();

  /* ================= S11 · typing into the focused app ================= */
  (function () {
    var BURST = " draft to the", WHOLE = " " + SENT;
    scene("sc-type", 66, {
      ticks: 40, tps: 8, pause: 1300,
      draw: function (api, tick) {
        var W = api.cols, nar = narrow(api), long = tick >= 10, s = long ? WHOLE : BURST, cw = nar ? 1 : 2;
        api.clear();
        lab(api, "h", long ? "the whole sentence at once · " + sc("72") + " characters" : "a typical burst · " + sc("13") + " characters", 0, 0, { cls: "i" });
        var groups = []; for (var i = 0; i < s.length; i += 20) groups.push(s.slice(i, i + 20));
        var x = 0;
        groups.forEach(function (g, gi) {
          for (var j = 0; j < g.length; j++) api.rect(x + j * cw, 6, cw, 4, (gi % 2) ? "v-blue" : "signal-2");
          x += g.length * cw + 3;
        });
        var landed = long ? Math.max(0, Math.min(groups.length, Math.floor((tick - 18) / 4) + 1)) : (tick >= 4 ? 1 : 0);
        groups.forEach(function (g, gi) {
          var e = lab(api, "g" + gi, "pair " + (gi + 1) + (nar ? " · " : " · key down + key up · ") + '<span class="k-t">“' + esc(g) + "”</span> " + sc(g.length), 0, 13 + gi * 5, { cls: gi < landed ? "i" : "" });
          e.hidden = false;
        });
        for (var q = groups.length; q < 4; q++) hide(api, "g" + q);
        box(api, 0, 36, W, 16, "copper"); api.rect(1, 37, W - 2, 3, "residue");
        lab(api, "wn", "mail draft · another app", 2, 37, { dy: -1 });
        var shown = long ? groups.slice(0, landed).join("") : (landed ? BURST : "");
        wrap(api, "d", (long ? "" : "Send the") + '<span class="k-t">' + esc(shown) + '</span><span class="caret"></span>', 2, 42, W - 4, { cls: "i" });
        lab(api, "ev", "key-down/up pairs " + sc(landed) + " · backspaces " + SRC.bs0 + " · up to " + n("20", PIN + "mac/Sources/Freeflow/TextInjector.swift#L11-L22") + " characters each", 0, 54, { cls: "i" }).style.whiteSpace = nar ? "normal" : "nowrap";
        if (nar) api.scene.labels.ev.e.style.width = W * C + "px";
        var p = lab(api, "pill", "the pill shows only when there is nowhere to type", 0, nar ? 62 : 59, {}); p.hidden = tick < 40;
      }
    });
  })();

  /* ================= S12 · stopping cleanly ================= */
  (function () {
    function T(tick) { return r2(3.5 + tick * 0.05); }
    function paint(api, t, k, hold) {
      var W = api.cols, nar = narrow(api), t0 = 3.5, t1 = 6.1, x0 = 0, x1 = W - 1;
      api.clear();
      var stopAt = hold ? 4.3 : 5.95, listening = t < stopAt;
      lab(api, "md", hold ? "hold mode · key up at " + sc("4.30") + " s (white line)" : "tap mode · silence ends it", 0, 0, { cls: "i" });
      wave(api, x0, x1, 6, 10, t0, t1, { upto: Math.min(t, stopAt), tint: function (tt) { return tt > 4.4 && t >= stopAt + 0.2 ? "residue" : "v-violet"; },
        quiet: function (tt) { return !hold && tt >= 4.2 && tt <= 5.95 ? "v-amber" : "copper"; } });
      api.rect(0, 17, W, 1, "copper");
      var ticks = [3.85, 4.2, 4.55, 4.9, 5.25, 5.6, 5.95];
      ticks.forEach(function (tk) { if (hold && tk > 4.3) return; var x = tx(x0, x1, t0, t1, tk); api.rect(x, 17, 1, 3, tk <= t + 1e-9 ? "v-amber" : "copper"); });
      [4, 5, 6].forEach(function (s) { lab(api, "ax" + s, sc(s) + " s", tx(x0, x1, t0, t1, s), 21, { align: "center" }); });
      if (t >= 0) { var xp = tx(x0, x1, t0, t1, Math.min(t, t1)); api.rect(xp, 5, 1, 13, listening ? "v-amber" : "muted"); }
      if (hold) {
        var xu = tx(x0, x1, t0, t1, 4.3); api.rect(xu, 4, 1, 16, "ink");
        for (var q = 0; q < 3; q++) hide(api, "q" + q);
        hide(api, "clk"); hide(api, "fl");
        var fin = t >= 4.3 + 0.15;
        lab(api, "h1", "last tick " + sc("4.20") + " s typed “check the” · “budget.” was waiting", 0, 28, { cls: "i" });
        var h2 = lab(api, "h2", 'final pass hears <span class="k-x">the</span> <span class="k-c">budget.</span> · the text check drops “the”, “budget.” is typed', 0, nar ? 37 : 33, {}); h2.hidden = !fin;
        if (nar) { h2.style.whiteSpace = "normal"; h2.style.width = W * C + "px"; }
        hide(api, "sl"); hide(api, "off");
        return;
      }
      hide(api, "h1"); hide(api, "h2");
      // the silence clock
      var quiet = ticks.filter(function (tk) { return tk >= 4.55 && tk <= t + 1e-9; }).length, clock = quiet * 350, cw = nar ? W - 2 : 100, by = 30;
      api.rect(0, by, cw, 3, "residue"); api.rect(0, by, Math.round(cw * Math.min(clock, 1750) / 1750), 3, "v-amber");
      var xl = Math.round(cw * 1500 / 1750); api.rect(xl, by - 2, 1, 7, "ink");
      lab(api, "clk", "silence clock " + sc(th(clock), D + "107-L109") + " ms", 0, nar ? 37 : 34, { cls: "i" });
      lab(api, "fl", n("1,500", PIN + "mac/Sources/Freeflow/Settings.swift#L27-L28"), xl, by - 2, { align: "center", dy: -16 });
      var flag = t >= 5.95 - 1e-9;
      var sl = lab(api, "sl", flag ? "fifth quiet tick: the stop flag flips, the loop finishes its turn" : "each quiet tick adds " + SRC.tick + " ms · speech resets it · " + n("400", D + "36") + " ms grace at the start", 0, nar ? 42 : 39, {});
      sl.hidden = false; if (nar) { sl.style.whiteSpace = "normal"; sl.style.width = W * C + "px"; } else sl.style.whiteSpace = "nowrap";
      var off = lab(api, "off", k >= 3 ? "final pass on the tail cut back to about " + sc("4.4") + " s: nothing left to type" + (k >= 4 ? " · mic off" : "") : "", 0, nar ? 54 : 44, { cls: "i" });
      off.hidden = k < 3; if (nar) { off.style.whiteSpace = "normal"; off.style.width = W * C + "px"; }
    }
    scene("sc-stop", [54, 64], {
      ticks: 62, tps: 12, pause: 1200,
      draw: function (api, tick) { paint(api, T(tick), api.keyIndex, false); },
      inputs: [{ id: "hold", label: "mode", states: ["tap", "hold"] }],
      live: { start: function () { return { t: 3.9 }; }, step: function (api, s) { s.t = r2(s.t + 0.05); return s.t < 4.6; },
        draw: function (api, s) { if (api.inputs.hold) paint(api, s.t, 0, true); else paint(api, 6.1, 5, false); }, budget: 40 }
    });
  })();

  /* ================= S13 · big windows skip, and trimming makes it permanent ================= */
  (function () {
    var LATE = [["ask", 2.72, 2.95], ["them", 2.98, 3.15], ["to", 3.18, 3.27], ["check", 3.30, 3.58]];
    function paint(api, k, o) {
      o = o || {};
      var W = api.cols, nar = narrow(api), t1 = 4.4, x0 = 0, x1 = W - 1, quiet = !!o.quiet, py = !!o.py;
      api.clear();
      // A · the capture check
      var cap = k >= 0;
      lab(api, "a", "capture: wall time " + sc("5.95") + " s · audio captured " + sc("5.95") + " s · shortfall " + sc("0.0") + " s", 0, 0, { cls: "i" }).style.whiteSpace = nar ? "normal" : "nowrap";
      if (nar) api.scene.labels.a.e.style.width = W * C + "px";
      // the words wrap to as many lines as the width needs (more on a phone), so each part is placed under the measured
      // height of the label above it: 4 cells to a 16 px line
      var la = api.scene.labels.a.e, ha = hRows(la);
      var bw = Math.round((W - 2) * 0.9);
      api.rect(0, ha + 2, bw, 1, "ink"); api.rect(0, ha + 4, bw, 1, "v-violet");
      // B · the model check: typed words on a time axis, gaps over 0.7 s
      var yb = ha + 10;
      var tb = lab(api, "b", "typed: " + '<span class="k-t">' + esc(text(SKIP.st)).replace("and the", 'and </span><span class="k-lost">ask them to check</span><span class="k-t"> the') + "</span>", 0, yb, {}); if (nar) { tb.style.whiteSpace = "normal"; tb.style.width = W * C + "px"; }
      var hb = hRows(tb); tb.hidden = k < 1;
      var v = lab(api, "gv", "gap " + sc("0.93") + " s &gt; " + n("0.7", PIN + "mac/Sources/Freeflow/Diag.swift#L37") + " s · rms " + (quiet ? "&lt; " : "&gt; ") + n("0.02", PIN + "mac/Sources/Freeflow/Diag.swift#L39") + " → " + (!quiet ? '<span class="k-r">SPEECH DROPPED</span>' : "(pause)"), 0, yb + hb + 8, {});
      v.style.color = ""; var hv = hRows(v);
      if (k >= 1) {
        api.rect(0, yb + hb + 6, W, 1, "copper");
        SKIP.st.committed.forEach(function (w) { var a = tx(x0, x1, 0, t1, w.s), b = tx(x0, x1, 0, t1, w.e); api.rect(a, yb + hb + 3, Math.max(1, b - a), 2, "v-blue"); });
        var ga = tx(x0, x1, 0, t1, 2.68), gb = tx(x0, x1, 0, t1, 3.61), red = !quiet;
        api.rect(ga, yb + hb + 1, gb - ga + 1, 1, red ? "v-red" : "muted"); api.rect(ga, yb + hb + 1, 1, 4, red ? "v-red" : "muted"); api.rect(gb, yb + hb + 1, 1, 4, red ? "v-red" : "muted");
      } else hide(api, "gv");
      // C · rule 1: later passes hear it, the time check drops it
      var yc = yb + hb + 8 + hv + 4;
      var c1 = lab(api, "c", "heard again from " + sc("4.90") + " s, but every word starts before " + sc("4.20") + " − " + n("0.1", WS + "86") + " = " + sc("4.10") + " s: the time check drops them", 0, yc, { cls: k === 2 ? "i" : "" });
      if (nar) { c1.style.whiteSpace = "normal"; c1.style.width = W * C + "px"; }
      var hc = hRows(c1); c1.hidden = k < 2;
      var yy = yc + hc + 2;
      if (k >= 2) {
        LATE.forEach(function (w, i) { var a = tx(x0, x1, 0, t1, w[1]), b = tx(x0, x1, 0, t1, w[2]); api.rect(a, yy, Math.max(1, b - a), 2, k === 2 ? "v-red" : "copper"); });
        var xl = tx(x0, x1, 0, t1, 4.1); api.rect(xl, yy - 2, 1, 6, "v-amber");
      }
      // D · rule 2: the trim moves past it
      var yd = yy + 8;
      var d1 = lab(api, "d", "the window already starts at " + sc("2.20") + " s; once typed audio passes " + sc("5.20") + " s the next trim moves it past " + sc("3.70") + " s, beyond “check” (" + sc("3.58") + " s). no pass hears them again", 0, yd, { cls: k === 3 ? "i" : "" });
      d1.style.whiteSpace = "normal"; d1.style.width = W * C + "px";
      var hd = hRows(d1); d1.hidden = k < 3;
      var y4 = yd + hd + 2;
      if (k >= 3) {
        api.rect(0, y4 + 1, W, 1, "copper");
        var s1 = tx(x0, x1, 0, t1, 2.2), s2 = tx(x0, x1, 0, t1, 3.7), hole = [tx(x0, x1, 0, t1, 2.72), tx(x0, x1, 0, t1, 3.58)];
        api.rect(hole[0], y4, hole[1] - hole[0], 3, "v-red");
        api.rect(s1, y4 - 2, 1, 7, "v-amber"); api.rect(s2, y4 - 2, 1, 7, "v-amber"); dash(api, s1, s2, y4 - 2, "v-amber");
      }
      // E · the cause and the fix: the window sizes, then and now
      var ye = y4 + (nar ? 10 : 8);
      var showPy = (k === 4 && !o.live) || py;
      var e1 = lab(api, "e", showPy ? "was " + n("8.0 / 2.0", WS + "27") + ": windows up to " + sc("8.85") + " s · the comment: “caused ~2s skips”" : "now " + SRC.trim + " / " + SRC.ctx + " and " + n("beam search", D + "45") + ": windows up to " + sc("3.85") + " s", 0, ye, { cls: k >= 4 ? "i" : "" });
      e1.style.whiteSpace = "normal"; e1.style.width = W * C + "px";
      var he = hRows(e1); e1.hidden = k < 4;
      if (k >= 4) stair(api, showPy ? ST_PY : ST_MAC, 85, ye + he + 2, 16, 30.1, showPy ? "v-cyan" : "v-blue", null);
      var e2 = lab(api, "e2", k === 4 && !o.live ? "large windows: slower than real time, and phrases skipped" : "the repo holds the fix and its comment; no log output is committed", 0, ye + he + 20, {});
      e2.hidden = k < 4; if (nar) { e2.style.whiteSpace = "normal"; e2.style.width = W * C + "px"; }
    }
    scene("sc-skip", [100, 144], {
      ticks: 6, tps: 1, pause: 1500,
      draw: function (api, tick) { paint(api, Math.min(6, tick)); },
      inputs: [{ id: "quiet", label: "the gap", states: ["loud", "quiet"] }, { id: "py", label: "window", states: ["now", "before the fix"] }],
      live: { start: function () { return {}; }, step: function () { return false; }, draw: function (api) { paint(api, 6, { quiet: api.inputs.quiet, py: api.inputs.py, live: true }); } }
    });
  })();

  /* ================= S14 · what the tests pin down ================= */
  (function () {
    var GROUPS = [["test_stt", 20, PIN + "tests/test_stt.py#L17-L139"], ["test_vad", 5, PIN + "tests/test_vad.py#L20-L58"], ["test_config", 4, PIN + "tests/test_config.py#L10-L55"]];
    var CONST = [["", "mac app", "python prototype"],
      ["tick", SRC.tick + " ms", n("350", PIN + "config.toml#L28") + " ms, was " + n("600", PIN + "config.toml#L28")],
      ["trim / keep", SRC.trim + " / " + SRC.ctx + " s", n("8.0 / 2.0", PIN + "freeflow/stt.py#L164") + " s"],
      ["no pass below rms", SRC.floor, n("0.005", PIN + "freeflow/stt.py#L165")],
      ["decoder", n("beam search", D + "45"), n("greedy (faster-whisper)", PIN + "freeflow/stt.py#L72")],
      ["silence ends it", n("1,500", PIN + "mac/Sources/Freeflow/Settings.swift#L28") + " ms, " + n("400", D + "36") + " ms grace", n("1,500", PIN + "config.toml#L24-L25") + " ms, " + n("400", PIN + "config.toml#L24-L25") + " ms grace"]];
    scene("sc-tests", [92, 106], {
      ticks: 44, tps: 10, pause: 1300,
      draw: function (api, tick) {
        var W = api.cols, nar = narrow(api);
        api.clear();
        var lit = Math.min(29, tick), idx = 0, x = 0, y = 4;
        lab(api, "h", n("29", "https://github.com/Olivesz/freeflow/actions/runs/38284608894") + " passed · CI at 6d541e6", 0, 0, { cls: lit >= 29 ? "i" : "" });
        GROUPS.forEach(function (g, gi) {
          var gx = x;
          for (var i = 0; i < g[1]; i++) { var cx = x + (i % 10) * 4, cy = y + 2 + Math.floor(i / 10) * 4; api.rect(cx, cy, 3, 3, idx < lit ? "v-green" : "copper"); idx++; }
          lab(api, "g" + gi, n(g[1], g[2]) + " " + g[0], gx, y + 11, { cls: "i" });
          x += Math.min(10, g[1]) * 4 + 5;
        });
        // the trim test: seconds of audio each pass reads (python 8.0 / 2.0)
        var on2 = tick >= 30, ty = 24;
        lab(api, "t", "the trim test: seconds read per pass · " + sc("12") + " · " + sc("12") + " · " + n("4", PIN + "tests/test_stt.py#L123"), 0, ty, { cls: on2 ? "i" : "" }).hidden = !on2;
        if (on2) [12, 12, 4].forEach(function (s, i) { api.rect(0, ty + 5 + i * 3, Math.round(s / 12 * Math.min(W - 2, 96)), 2, "v-violet"); });
        // the constants table
        var on3 = tick >= 36, cy0 = 40, c2 = nar ? 34 : 44, c3 = nar ? 60 : 100;
        CONST.forEach(function (r, i) {
          var shown = on3 && tick >= 36 + i, y2 = cy0 + i * (nar ? 9 : 5);
          var a = lab(api, "k" + i, r[0], 0, y2, {}), b = lab(api, "m" + i, r[1], c2, y2, { cls: "i" }), c = lab(api, "p" + i, r[2], c3, y2, { cls: "i" });
          a.hidden = b.hidden = c.hidden = !shown;
          if (nar) { a.style.whiteSpace = b.style.whiteSpace = c.style.whiteSpace = "normal"; a.style.width = "128px"; b.style.width = "100px"; c.style.width = "112px"; }
        });
        var nm = lab(api, "nm", "not measured anywhere in the repo: delay, word errors, CPU, battery", 0, nar ? 96 : 74, {});
        nm.hidden = tick < 44; if (nar) { nm.style.whiteSpace = "normal"; nm.style.width = W * C + "px"; }
      }
    });
  })();
})();
