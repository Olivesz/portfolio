/* emergence, in depth: the scenes.
   Every Wireworld picture runs the exact rule (ww.js) on a layout ported cell for cell from Olivesz/emergence at ad96d38:
   the gate art of index.html (Act VIII), and the NAND and memory cells of cpu/ww_cells.py. Every netlist picture runs the
   repo's own gate-level port, cpu/wwcpu.js, unchanged. Each scene checks its claim before it is allowed to play. */
(function () {
  "use strict";
  var PHONE = window.innerWidth < 768;
  var HD = WW.HEAD, TL = WW.TAIL, WR = WW.WIRE;
  var ART = {"or": ["A######       ", "      O###### ", "B######       "], "xor": ["        B######    ", "              #    ", "              #    ", "              #    ", "              #    ", "              #    ", "       ###### #    ", " A######     #    ", "       ###### #    ", "              #    ", "              #####O"], "and": [" #######  ######################################################################################          ", " #     #  #                                                                                    #          ", " #     #  #                                                                                    #          ", " #     #  #                                                                                    #          ", " #     #  #                                                                                    #   #######", " #     #  #                                                                                    #   #     #", " #     ####                                                                                    #   #     #", " #                                                                                             #   #     #", " #                                                                                             #   #     #", " #                                                                                             #   #     #", " #                                                                                             #  ###    #", " #                                                                                             #  # #    #", " #                                                                                             #   #     #", " #            #####                                                                            #### #    #", " #   B######### #  ################################################                                 #    #", " #     #      ##                                                  #                                 #    #", " #     #                                                          #                                 #    #", " #     #                                                          #                                 #    #", " #######                                                          #                                 O    #", "       #                                                          #                                      #", "       #                                                   ###### #                                      #", "       #      #####                                        #    # #                                      #", "     A######### #  #####  ##################################     #                                       #", "              ##       #  #                                #    # #                                      #", "                       #  #                                ###### #                                      #", "                       #  #                                       #                                      #", "                       #  #                                       ########################################", "                       #  #                                                                               ", "                       ####                                                                               "], "memory": ["#~@#################", "#                  #", "#                  #", "#                  #", "####################", "        #", "        #", "        ####################"], "wire": ["~@########################"]};
  var CHECKS = {};
  window.__deep.selfChecks = CHECKS;

  /* ---------------- shared helpers ---------------- */
  function setAt(id, ats) {
    var fig = document.getElementById(id); if (!fig) return;
    [].forEach.call(fig.querySelectorAll(".sc-keys li"), function (li) {
      var k = li.getAttribute("data-key"); if (k in ats) li.setAttribute("data-at", Math.round(ats[k]));
    });
  }
  function nHeads(g, W, H, x, y) {
    var c = 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      var xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && g[yy * W + xx] === HD) c++;
    }
    return c;
  }
  /* wire cells that see 3 or more heads this tick: they stay dark on the next one */
  function crowds(g, W, H, r) {
    var out = [], x0 = r ? r[0] : 0, y0 = r ? r[1] : 0, x1 = r ? r[2] : W - 1, y1 = r ? r[3] : H - 1;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) if (g[y * W + x] === WR && nHeads(g, W, H, x, y) >= 3) out.push([x, y]);
    return out;
  }
  function anyHead(g, W, cells) { for (var i = 0; i < cells.length; i++) if (g[cells[i][1] * W + cells[i][0]] === HD) return true; return false; }
  function headsIn(g, W, r) { var n = 0; for (var y = r[1]; y <= r[3]; y++) for (var x = r[0]; x <= r[2]; x++) if (g[y * W + x] === HD) n++; return n; }
  function liveIn(g, W, r) { var n = 0; for (var y = r[1]; y <= r[3]; y++) for (var x = r[0]; x <= r[2]; x++) { var s = g[y * W + x]; if (s === HD || s === TL) n++; } return n; }
  /* a square ring one cell out from (x, y): the mark for "3 heads, so it stays dark" */
  function ring(api, x, y, tok) {
    var S = api.scene, c = S.ctx, p = S.dp, d = Math.max(S.dpr, Math.round(p / 6));
    c.fillStyle = api.tok(tok || "v-red");
    var x0 = (x - 1) * p, y0 = (y - 1) * p, s = 3 * p;
    c.fillRect(x0, y0, s, d); c.fillRect(x0, y0 + s - d, s, d); c.fillRect(x0, y0, d, s); c.fillRect(x0 + s - d, y0, d, s);
  }
  function outline(api, x, y, w, h, tok) {
    var S = api.scene, c = S.ctx, p = S.dp, d = S.dpr;
    c.fillStyle = api.tok(tok);
    c.fillRect(x * p, y * p, w * p, d); c.fillRect(x * p, (y + h) * p - d, w * p, d); c.fillRect(x * p, y * p, d, h * p); c.fillRect((x + w) * p - d, y * p, d, h * p);
  }
  var DIM = { 0: "void", 1: "copper", 2: "copper", 3: "residue" };
  function paintR(api, g, W, r, dim, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    var pal = dim ? DIM : WW.PALETTE;
    for (var y = r[1]; y <= r[3]; y++) for (var x = r[0]; x <= r[2]; x++) { var s = g[y * W + x]; if (s) api.dot(x + ox, y + oy, pal[s]); }
  }
  function paint(api, g, W, H, o) {
    o = o || {};
    if (!o.keep) api.clear();
    var r = [0, 0, W - 1, H - 1], ox = o.ox || 0, oy = o.oy || 0;
    paintR(api, g, W, r, o.dim, ox, oy);
    if (!o.dim && o.rings !== false) crowds(g, W, H).forEach(function (c) { ring(api, c[0] + ox, c[1] + oy); });
  }
  function clean(w) { for (var i = 0; i < w.g.length; i++) if (w.g[i] === HD || w.g[i] === TL) w.g[i] = WR; }
  /* index.html's gate art: '#' wire, '@' head, '~' tail; A, B, O, S are wire cells with a name */
  function parseArt(w, rows, ox, oy) {
    var p = {};
    rows.forEach(function (row, r) {
      for (var c = 0; c < row.length; c++) {
        var ch = row.charAt(c); if ("#@~ABOS".indexOf(ch) < 0) continue;
        var x = ox + c, y = oy + r;
        w.set(x, y, ch === "@" ? HD : ch === "~" ? TL : WR);
        if ("ABOS".indexOf(ch) >= 0) p[ch] = [x, y];
      }
    });
    return p;
  }
  function artW(rows) { return Math.max.apply(null, rows.map(function (r) { return r.length; })); }
  /* index.html's wwInject: a head on the input cell and a tail behind it, so it moves right */
  function inj(w, cell) { w.set(cell[0], cell[1], HD); if (cell[0] > 0) w.set(cell[0] - 1, cell[1], TL); }
  /* ww_cells.py's pack(): a 1-cell margin round the cells, ports shifted with them */
  function pack(cells, ports) {
    var xs = cells.map(function (c) { return c[0]; }).concat(ports.map(function (p) { return p[0]; }));
    var ys = cells.map(function (c) { return c[1]; }).concat(ports.map(function (p) { return p[1]; }));
    var mnx = Math.min.apply(null, xs) - 1, mny = Math.min.apply(null, ys) - 1;
    var W = Math.max.apply(null, xs) - mnx + 2, H = Math.max.apply(null, ys) - mny + 2;
    return { W: W, H: H, cells: cells.map(function (c) { return [c[0] - mnx, c[1] - mny]; }), ports: ports.map(function (p) { return [p[0] - mnx, p[1] - mny]; }) };
  }
  function Gc() { var c = []; return { c: c, put: function (x, y) { c.push([x, y]); }, hl: function (x0, x1, y) { for (var x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) c.push([x, y]); }, vl: function (y0, y1, x) { for (var y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) c.push([x, y]); } }; }
  function stampInto(w, P, ox, oy) { P.cells.forEach(function (c) { w.wire(c[0] + ox, c[1] + oy); }); return P.ports.map(function (p) { return [p[0] + ox, p[1] + oy]; }); }

  /* the clocked NAND cell: build_nand(), cpu/ww_cells.py#L163-L186 */
  var JX = 24, JY = 12, LW = 10;
  function buildNand() {
    var g = Gc(), CW = 10, CHT = 6, TAPX = 5;
    g.hl(0, CW, 0); g.hl(0, CW, CHT); g.vl(0, CHT, 0); g.vl(0, CHT, CW);
    g.vl(CHT + 1, JY - 1, TAPX); g.hl(TAPX, JX - 1, JY - 1);
    [[JX, JY], [JX - 1, JY - 1], [JX + 1, JY - 1], [JX - 1, JY + 1], [JX + 1, JY + 1]].forEach(function (p) { g.put(p[0], p[1]); });
    g.hl(JX + 2, JX + 1 + LW, JY - 1); g.hl(JX - 1 - LW, JX - 2, JY + 1); g.hl(JX + 2, JX + 8, JY + 1);
    var P = pack(g.c, [[2, 0], [1, 0], [JX - 1, JY - 1], [JX + 1 + LW, JY - 1], [JX - 1 - LW, JY + 1], [JX + 6, JY + 1], [JX, JY]]);
    return P;   // ports: seed head, seed tail, NW port, A launch, B launch, output probe, J
  }
  /* the loop memory cell: build_reg(), cpu/ww_cells.py#L250-L272 */
  var RW = 20, RH = 14, KK = 7, CLW = 8;
  function buildReg() {
    var g = Gc();
    g.hl(-8, RW, 0); g.hl(0, RW, RH); g.vl(0, KK - 1, RW); g.put(RW + 1, KK); g.vl(KK + 1, RH, RW);
    WW.DIODE_H.forEach(function (d) { g.put(0 + d[1], RH - d[0]); });          // DIODE_UP = (dy, -dx), stamped at (0, RH)
    g.vl(RH + 1, RH + 4, 6); g.hl(RW + 2, RW + 2 + CLW, KK - 1); g.hl(RW + 2, RW + 2 + CLW, KK);
    return pack(g.c, [[-8, 0], [6, RH + 4], [RW, KK - 1], [RW + 2 + CLW, KK - 1], [RW + 2 + CLW, KK], [RW + 2, KK - 1], [RW + 2, KK], [RW + 1, KK]]);
    // ports: SET, read, 'in' (cell before J), clear launch upper, lower, clear tip upper, lower, J
  }
  function lampsHTML(rows, cur) {
    return rows.map(function (r, i) {
      var v = r[2] === null ? '<span class="m">·</span>' : r[3] === false ? '<span class="rd">' + r[2] + "</span>" : String(r[2]);   // out in ink, as on the index; red only when wrong
      return '<span class="' + (i === cur ? "" : "m") + '">' + r[0] + " " + r[1] + "</span>  " + v;
    }).join("<br>");
  }
  function lbl(api, id, text, x, y, o) {
    o = o || {}; var e = api.label(id, text, x, y, o);
    var cls = o.cls === "r" ? "sc-r" : "sc-l" + (o.cls ? " " + o.cls : ""); if (e.className !== cls) e.className = cls;
    return e;
  }
  /* cells that saw 3 heads in the last few ticks: the ring stays up for a beat so it can be seen */
  function crowdsRecent(frames, tick, W, H, r, beat) {
    var out = [], seen = {};
    for (var t = Math.max(0, tick - (beat || 2)); t <= tick; t++) crowds(frames[t], W, H, r).forEach(function (c) { var k = c[0] + "," + c[1]; if (!seen[k]) { seen[k] = 1; out.push(c); } });
    return out;
  }
  function ok(name, v) { CHECKS[name] = !!v; return !!v; }
  /* autoplay pacing: ticks with no step within 4 run at 3x, so each scene reaches its point sooner */
  function fast(S) {
    if (!S) return S;
    S.advance = function (dt) {
      if (S.holdLeft > 0) { S.holdLeft -= dt; return true; }
      var nk = Infinity; for (var i = 0; i < S.keys.length; i++) if (S.keys[i].at > S.t + 1e-9) { nk = S.keys[i].at; break; }
      var lim = Math.min(nk, S.target), quick = S.mode === "auto" && lim - S.t > 4;
      var nt = S.t + dt * S.tps * (quick ? 3 : 1) / 1000;
      if (quick && nt > lim - 4) nt = lim - 4;
      if (S.mode === "auto") for (var j = 0; j < S.keys.length; j++) { var a = S.keys[j].at; if (a > S.t + 1e-9 && a <= nt && a < S.target) { nt = a; S.holdLeft = S.pause; break; } }
      if (nt >= S.target) { S.t = S.target; return false; }
      S.t = nt; return true;
    };
    return S;
  }
  /* a backward copy: an amber outline on the cell (red rings mean only "3 heads, stays dark") */
  function back(api, x, y) { outline(api, x, y, 1, 1, "v-amber"); var S = api.scene, c = S.ctx, p = S.dp, d = Math.max(S.dpr, Math.round(p / 6)); c.fillStyle = api.tok("v-amber"); c.fillRect(x * p - d, y * p - d, p + 2 * d, d); c.fillRect(x * p - d, (y + 1) * p, p + 2 * d, d); c.fillRect(x * p - d, y * p, d, p); c.fillRect((x + 1) * p, y * p, d, p); }

  /* ================= fig 2: count the neighbours ================= */
  (function () {
    var NB = [["nw", -1, -1], ["n", 0, -1], ["ne", 1, -1], ["w", -1, 0], ["e", 1, 0], ["sw", -1, 1], ["s", 0, 1], ["se", 1, 1]];
    var CFG = [[], ["nw"], ["nw", "e"], ["nw", "e", "s"]];
    function world(on) { var w = WW.world(3, 3).wire(1, 1); on.forEach(function (id) { var n = NB.filter(function (q) { return q[0] === id; })[0]; w.set(1 + n[1], 1 + n[2], HD); }); return w; }
    function draw(api, on) {
      api.clear();
      var w = world(on), before = w.g.slice(), c = on.length, crowd = c >= 3;
      w.step();
      for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) { api.dot(x, y, "residue"); api.dot(x + 6, y, "residue"); }
      api.ww(before, 3, 3, { inset: true });
      api.ww(w.g, 3, 3, { inset: true, ox: 6 });
      if (crowd) ring(api, 1, 1);
      lbl(api, "b", "now", 1, 0, { align: "center", dy: -24 });
      lbl(api, "a", "one tick later", 7, 0, { align: "center", dy: -24 });
      lbl(api, "ar", "→", 4, 1, { align: "center", dy: 8, cls: "i" });
      var fires = w.isHead(1, 1);
      var ro = lbl(api, "ro", "heads: " + c + " → " + (fires ? "fires" : "stays wire"), 4, 3, { align: "center", dy: 8, cls: "r" });
      ro.setAttribute("data-src", "page:rule-count");
    }
    Deep.scene("sc-count", {
      check: function () {
        var r = [0, 1, 2, 3].map(function (k) { var w = world(["nw", "e", "s"].slice(0, k)); w.step(); return w.isHead(1, 1); });
        return ok("rule 1 or 2 fires, 0 and 3 do not", !r[0] && r[1] && r[2] && !r[3]) && WW.selfTest().ok;
      },
      grid: { cols: 9, rows: 3, pitch: 32, pitchPhone: 32 }, space: { top: 24, bottom: 40 },
      ticks: 3, tps: 1, rest: 3,
      draw: function (api, tick) { draw(api, CFG[Math.min(3, tick)]); },
      inputs: NB.map(function (n) { return { id: n[0], label: n[0], cell: [1 + n[1], 1 + n[2], 1, 1] }; }),
      live: { start: function () { return {}; }, step: function () { return false; },
        draw: function (api) { draw(api, NB.filter(function (n) { return api.inputs[n[0]]; }).map(function (n) { return n[0]; })); } }
    });
  })();

  /* ================= fig 3: an electron, a wire, a clock ================= */
  (function () {
    var COLS = 48, ROWS = 14, TB = 30;
    var base = WW.world(COLS, ROWS);
    parseArt(base, ART.wire, 1, 1);                                   // index.html#L928: tail, head, 24 wire
    base.hline(1, 26, 5); base.hline(1, 26, 9);
    base.loop(30, 1, 40, 7).set(32, 1, HD).set(31, 1, TL);            // the NAND cell's clock loop and seed
    base.vline(8, 12, 35).hline(35, 46, 12);                          // its tap
    var at = {}; at[TB] = function (w) { w.inject(13, 5); w.inject(1, 9); };
    var TK = 120, frames = WW.record(base, TK, at);
    function hx(g, y, x0, x1) { var r = []; for (var x = x0; x <= x1; x++) if (g[y * COLS + x] === HD) r.push(x); return r; }
    var tapT = -1; for (var t = 56; t < TK; t++) if (frames[t][10 * COLS + 35] === HD) { tapT = t; break; }
    var TICKS = Math.min(TK, tapT + 7);                                // end with the copy still on the tap, not after it has gone
    setAt("sc-wire", { move: 0, oneway: 6, lone: TB + 4, loop: 48, tap: tapT });
    function paintF(api, g) {
      paint(api, g, COLS, ROWS);
      lbl(api, "la", "a wire", 1, 2, { dy: 4 }); lbl(api, "lb", "a lone head", 1, 6, { dy: 4 }); lbl(api, "lc", "a lone head at a dead end", 1, 10, { dy: 4 });
      lbl(api, "lk", "clock", 35, 4, { align: "center", dy: -4, cls: "b" }); lbl(api, "lt", "tap", 36, 9, { dx: 4 });
    }
    fast(Deep.scene("sc-wire", {
      check: function () {
        var g6 = frames[6], gL = frames[TB + 4];
        var c1 = hx(g6, 1, 1, 26).length === 1 && hx(g6, 1, 1, 26)[0] === 8;
        var c2 = hx(gL, 5, 1, 26).length === 2 && hx(gL, 9, 1, 26).length === 1;
        return ok("electron one cell per tick; lone head splits; dead-end launch goes one way", c1 && c2 && tapT > 0);
      },
      grid: { cols: COLS, rows: ROWS, pitch: 14, pitchPhone: 7 }, space: { top: 8, bottom: 8 },
      ticks: TICKS, tps: 8, pause: 1300, rest: "oneway",
      draw: function (api, tick) { paintF(api, frames[Math.min(tick, TICKS)]); },
      inputs: [{ id: "send", label: "send an electron", momentary: true }],
      live: {
        start: function (api, tick) { return WW.world(COLS, ROWS).load(frames[Math.min(tick, TICKS)], tick); },
        step: function (api, w) { w.step(); w.n0 = (w.n0 || 0) + 1; return w.n0 < 60; },
        draw: function (api, w) { paintF(api, w.g); }, budget: 200
      },
      onInput: function (api, id, on, w) { if (w) { w.n0 = 0; if (w.get(2, 1) === WR && w.get(3, 1) === WR && w.get(4, 1) === WR) w.electron(3, 1, [1, 0]); } }
    }));
  })();

  /* ================= fig 4: what the rule doesn't give you ================= */
  (function () {
    var OR = ART.or, XOR = ART.xor, MEM = ART.memory;
    var L = PHONE ? { cols: 31, rows: 31, or: [2, 2], xor: [2, 8], mem: [1, 22] } : { cols: 74, rows: 15, or: [2, 4], xor: [21, 3], mem: [45, 4] };
    var COLS = L.cols, ROWS = L.rows, base = WW.world(COLS, ROWS);
    var pO = parseArt(base, OR, L.or[0], L.or[1]), pX = parseArt(base, XOR, L.xor[0], L.xor[1]);
    parseArt(base, MEM, L.mem[0], L.mem[1]);
    var rO = [L.or[0] - 1, L.or[1] - 1, L.or[0] + artW(OR), L.or[1] + OR.length], rX = [L.xor[0] - 1, L.xor[1] - 1, L.xor[0] + artW(XOR), L.xor[1] + XOR.length];
    var rM = [L.mem[0] - 1, L.mem[1] - 1, Math.min(COLS - 1, L.mem[0] + artW(MEM)), L.mem[1] + MEM.length];
    var at = { 0: function (w) { inj(w, pO.A); inj(w, pX.A); inj(w, pX.B); } };
    var TK = 90, frames = WW.record(base, TK, at);
    var bWire = []; for (var x = pO.B[0] + 1; x <= pO.B[0] + 5; x++) bWire.push([x, pO.B[1]]);
    var tOut = -1, tLeak = -1, tThree = -1, tHold = -1, xorOut = false, t;
    for (t = 1; t < TK; t++) {
      var g = frames[t];
      if (tOut < 0 && g[pO.O[1] * COLS + pO.O[0]] === HD) tOut = t;
      if (tOut > 0 && tLeak < 0 && t > tOut && g[pO.B[1] * COLS + pO.B[0] + 3] === HD) tLeak = t;
      if (tThree < 0 && crowds(g, COLS, ROWS, rX).length) tThree = t;
      if (g[pX.O[1] * COLS + pX.O[0]] === HD) xorOut = true;
    }
    var tapRow = L.mem[1] + 7;
    for (t = Math.max(tThree + 4, 30); t < TK; t++) if (frames[t][tapRow * COLS + L.mem[0] + 14] === HD) { tHold = t; break; }
    var TICKS = Math.min(TK, tHold + 10);
    setAt("sc-gaps", { noand: tOut, leak: tLeak, three: tThree, hold: tHold });
    var regionOf = { noand: rO, leak: rO, three: rX, hold: rM };
    function draw(api, tick) {
      var g = frames[Math.min(tick, TICKS)], act = regionOf[api.key] || rO;
      api.clear();
      [rO, rX, rM].forEach(function (r) { paintR(api, g, COLS, r, r !== act); });
      crowdsRecent(frames, Math.min(tick, TICKS), COLS, ROWS, act).forEach(function (c) { ring(api, c[0], c[1]); });
      var bk = PHONE ? lbl(api, "bk", "backward copy", pO.B[0] + 7, pO.B[1], { dx: 4, dy: -3, cls: "am" }) : lbl(api, "bk", "backward copy", pO.B[0], pO.B[1] + 1, { dy: 2, cls: "am" }); bk.hidden = api.key !== "leak";
      if (api.key === "leak") bWire.concat([[pO.B[0] + 6, pO.B[1]], [pO.B[0], pO.B[1]]]).forEach(function (c) { if (g[c[1] * COLS + c[0]] === HD) back(api, c[0], c[1]); });
      var top = Math.min(rO[1], rX[1], rM[1]);                         // side by side, the three names share one row
      lbl(api, "l1", "or, a only", rO[0] + 1, PHONE ? rO[1] : top, { dy: -16, cls: act === rO ? "i" : "" });
      lbl(api, "l2", "xor, a and b", rX[0] + 1, PHONE ? rX[1] : top, { dy: -16, cls: act === rX ? "i" : "" });
      lbl(api, "l3", "a stored bit", rM[0] + 1, PHONE ? rM[1] : top, { dy: -16, cls: act === rM ? "i" : "" });
    }
    fast(Deep.scene("sc-gaps", {
      check: function () { return ok("or fires on a alone, leaks back up b; xor both is dark; memory keeps one electron", tOut > 0 && tLeak > 0 && tThree > 0 && !xorOut && tHold > 0); },
      grid: { cols: COLS, rows: ROWS, pitch: 9, pitchPhone: 11 }, space: { top: 16, bottom: 8 },
      ticks: TICKS, tps: 8, pause: 1400, rest: "three",
      draw: draw
    }));
  })();

  /* ================= fig 5: the plan ================= */
  var NAND = buildNand(), REG = buildReg();
  (function () {
    var L = PHONE ? { cols: 41, rows: 40, n: [1, 0], m: [0, 17] } : { cols: 84, rows: 22, n: [1, 3], m: [42, 0] };
    var COLS = L.cols, ROWS = L.rows, base = WW.world(COLS, ROWS);
    var pn = stampInto(base, NAND, L.n[0], L.n[1]), pm = stampInto(base, REG, L.m[0], L.m[1]);
    base.set(pn[0][0], pn[0][1], HD).set(pn[1][0], pn[1][1], TL);
    var at = { 0: function (w) { w.inject(pm[0][0], pm[0][1]); } };
    var F0 = 128, F1 = 168, TICKS = 172, frames = WW.record(base, F0, at);
    var rN = [L.n[0], L.n[1], L.n[0] + NAND.W - 1, L.n[1] + NAND.H - 1], rM = [L.m[0], L.m[1], L.m[0] + REG.W - 1, L.m[1] + REG.H - 1];
    var NN = 1446, ND = 175;
    setAt("sc-plan", { nand: 0, mem: 64, field: F0 + 16, count: TICKS });
    function draw(api, tick) {
      api.clear();
      var hideW = tick >= F0;
      ["ln", "lm"].forEach(function (id) { if (api.scene.labels[id]) api.scene.labels[id].e.hidden = hideW; });
      var lf = lbl(api, "lf", "", 0, ROWS, { dy: 8 }); lf.hidden = !hideW;
      if (!hideW) {
        var g = frames[Math.min(tick, F0)], act = tick < 64 ? rN : rM;
        paintR(api, g, COLS, rN, act !== rN); paintR(api, g, COLS, rM, act !== rM);
        crowds(g, COLS, ROWS, act).forEach(function (c) { ring(api, c[0], c[1]); });
        lbl(api, "ln", "nand cell", rN[0] + 1, rN[1], { dy: -16, cls: act === rN ? "i" : "" });
        lbl(api, "lm", "memory cell", rM[0] + 18, rM[1] + 17, { cls: act === rM ? "i" : "" });
        return;
      }
      var n = Math.min(NN + ND, Math.round((NN + ND) * Math.min(1, (tick - F0) / (F1 - F0))));
      for (var i = 0; i < n; i++) api.dot(i % COLS, (i / COLS) | 0, i < NN ? "v-green" : "v-amber");
      lf.innerHTML = '<span class="g">■</span> nand gates  <span class="am">■</span> flip-flops';
    }
    fast(Deep.scene("sc-plan", {
      check: function () { return ok("field draws one square per part", COLS * ROWS >= NN + ND); },
      grid: { cols: COLS, rows: ROWS, pitch: 8, pitchPhone: 8 }, space: { top: 16, bottom: 32 },
      ticks: TICKS, tps: 16, pause: 1400, rest: "count", draw: draw
    }));
  })();

  /* ================= fig 6: the diode ================= */
  (function () {
    var COLS = 34, ROWS = 5, TB = 40;
    var base = WW.world(COLS, ROWS).hline(1, 7, 2).stamp(WW.DIODE_H, 8, 2).hline(23, 32, 2);
    base.electron(3, 2, [1, 0]);
    var at = {}; at[TB] = function (w) { w.electron(31, 2, [-1, 0]); };
    var TK = 80, frames = WW.record(base, TK, at);
    var tSplit = -1, tOut = -1, tDie = -1, tGone = -1, back = false, t;
    for (t = 1; t < TB; t++) { if (tSplit < 0 && WW.world(COLS, ROWS).load(frames[t]).count(HD) >= 3) tSplit = t; if (tOut < 0 && frames[t][2 * COLS + 30] === HD) tOut = t; }
    for (t = TB + 1; t < TK; t++) {
      if (tDie < 0 && crowds(frames[t], COLS, ROWS).length) tDie = t;
      if (frames[t][2 * COLS + 4] === HD) back = true;
      if (tDie > 0 && tGone < 0) { var wq = WW.world(COLS, ROWS).load(frames[t]); if (wq.count(HD) + wq.count(TL) === 0) tGone = t; }
    }
    var TICKS = Math.min(TK, tGone + 4);
    setAt("sc-diode", { layout: 0, split: tSplit, out: tOut, dies: tDie, gone: tGone });
    function paintF(api, g) {
      paint(api, g, COLS, ROWS);
      lbl(api, "in", "in", 1, 2, { dy: -24 }); lbl(api, "out", "out", 32, 2, { align: "right", dy: -24 });
      lbl(api, "br", "bridge", 15, 1, { align: "center", dy: -24 });
    }
    Deep.scene("sc-diode", {
      check: function () { return ok("diode passes forward, stops backward", WW.selfTest().ok && tOut > 0 && tDie > 0 && !back && tGone > 0); },
      grid: { cols: COLS, rows: ROWS, pitch: 16, pitchPhone: 10 }, space: { top: 24, bottom: 8 },
      ticks: TICKS, tps: 8, rest: "dies",
      draw: function (api, tick) { tick = Math.min(tick, TICKS); paintF(api, frames[tick]); crowdsRecent(frames, tick, COLS, ROWS, null, tick >= tGone ? 0 : 2).forEach(function (c) { ring(api, c[0], c[1]); }); },
      inputs: [{ id: "fw", label: "send →", momentary: true }, { id: "bw", label: "send ←", momentary: true }],
      live: {
        start: function (api, tick) { return WW.world(COLS, ROWS).load(frames[Math.min(tick, TICKS)], tick); },
        step: function (api, w) { w.step(); w.n0 = (w.n0 || 0) + 1; return w.count(HD) + w.count(TL) > 0 && w.n0 < 80; },
        draw: function (api, w) { paintF(api, w.g); }, budget: 200
      },
      onInput: function (api, id, on, w) {
        if (!w) return; w.n0 = 0;
        if (id === "fw" && w.get(2, 2) === WR && w.get(3, 2) === WR) w.electron(3, 2, [1, 0]);
        if (id === "bw" && w.get(31, 2) === WR && w.get(32, 2) === WR) w.electron(31, 2, [-1, 0]);
      }
    });
  })();

  /* ================= figs 7, 8, 16: gates from index.html, cycling a and b as the act does ================= */
  function gateScene(id, rows, P, o) {
    var ox = 2, oy = o.oy || 1, COLS = artW(rows) + 4, ROWS = rows.length + 2 + (o.extraRows || 0);
    var base = WW.world(COLS, ROWS), pp = parseArt(base, rows, ox, oy);
    var lampX = pp.O[0] + 2; while (base.get(lampX - 1, pp.O[1]) === WR && lampX < COLS - 1) lampX++;
    if (base.get(lampX - 1, pp.O[1]) === WR) lampX++;
    var CASES = o.cases || [1, 2, 3], at = {}, SK = o.skew || 0;
    function launch(at2, t0, c) {
      at2[t0] = (function (f) { return function (w) { if (f) f(w); clean(w); if (c & 2) inj(w, pp.B); if ((c & 1) && !SK) inj(w, pp.A); }; })(at2[t0]);
      if ((c & 1) && SK) at2[t0 + SK] = (function (f) { return function (w) { if (f) f(w); inj(w, pp.A); }; })(at2[t0 + SK]);
    }
    CASES.forEach(function (c, i) { launch(at, i * P, c); });
    /* every case the autoplay skips is run once on its own, so its table row is real and starts filled in */
    var PRE = {}; [0, 1, 2, 3].forEach(function (c) {
      if (CASES.indexOf(c) >= 0) return;
      var a2 = {}; launch(a2, 0, c); var fr = WW.record(base, P, a2), f = false;
      for (var t = 1; t <= P; t++) if (fr[t][pp.O[1] * COLS + pp.O[0]] === HD) f = true;
      PRE[c] = f ? 1 : 0;
    });
    var TK = CASES.length * P, frames = WW.record(base, TK, at);
    var res = CASES.map(function (c, i) {
      var fire = -1, crowd = -1, lastCrowd = -1, jf = -1;
      for (var t = i * P + 1; t <= (i + 1) * P; t++) {
        if (fire < 0 && frames[t][pp.O[1] * COLS + pp.O[0]] === HD) fire = t;
        if (o.J && jf < 0 && frames[t][(o.J[1] + oy) * COLS + o.J[0] + ox] === HD) jf = t;
        if (crowds(frames[t], COLS, ROWS).length) { if (crowd < 0) crowd = t; lastCrowd = t; }
      }
      return { c: c, fire: fire, crowd: crowd, lastCrowd: lastCrowd, jf: jf, out: fire > 0 ? 1 : 0 };
    });
    var TABLE_ORDER = [0, 2, 1, 3];   // rows a b: 00, 01, 10, 11, as on the index and the case study (case bit 1 is a, bit 2 is b)
    function table(tick) {
      var ci = Math.min(CASES.length - 1, Math.floor(Math.max(0, tick - 1) / P));
      return { rows: TABLE_ORDER.map(function (c) {
        var a = c & 1, b = (c & 2) >> 1, val = c in PRE ? PRE[c] : null;
        for (var i = 0; i < 4 && i < CASES.length; i++) if (CASES[i] === c) {
          var r = res[i];
          if (i < ci || (i === ci && tick >= (i + 1) * P)) val = r.out;
          else if (i === ci && r.fire > 0 && tick >= r.fire) val = 1;
          else if (i === ci && r.fire < 0 && r.lastCrowd > 0 && tick >= r.lastCrowd) val = 0;
        }
        return [a, b, val, val === null ? null : val === o.want[c]];
      }), cur: CASES[ci] };
    }
    function lamp(api, on) { api.dot(lampX, pp.O[1], on ? "v-green" : "copper"); }
    function paintF(api, g, tbl, lit, frs, tk) {
      paint(api, g, COLS, ROWS, { rings: !frs });
      if (frs) crowdsRecent(frs, tk, COLS, ROWS).forEach(function (c) { ring(api, c[0], c[1]); });
      lamp(api, lit);
      if (o.leak && api.key === "leak") o.leak.forEach(function (c) { if (g[c[1] * COLS + c[0]] === HD) back(api, c[0], c[1]); });
      if (o.J) lbl(api, "jj", "J", o.J[0] + ox, o.J[1] + oy - 1, { dx: 4, dy: -12, cls: "i" });
      if (o.marks) o.marks.forEach(function (m, i) { lbl(api, "mk" + i, m[0], m[1] + ox, m[2] + oy, { dx: m[3] || 0, dy: m[4] || 0, cls: m[5] || "" }); });
      var pd = api.pitch, ly = Math.round((pd - 16) / 2); lbl(api, "a", "a", pp.A[0] - 1, pp.A[1], { dx: -14, dy: ly, cls: "i" }); lbl(api, "b", "b", pp.B[0] - 1, pp.B[1], { dx: -14, dy: ly, cls: "i" });
      lbl(api, "o", "out", lampX, pp.O[1], { dx: 0, dy: -20 });
      var tx = PHONE ? 0 : COLS, ty = PHONE ? ROWS : 0;
      var tb = lbl(api, "tt", null, tx, ty, { dx: PHONE ? 0 : 24, dy: PHONE ? 8 : 0, cls: "r", html: true });
      tb.innerHTML = '<span class="m">a b  out</span><br>' + lampsHTML(tbl.rows, TABLE_ORDER.indexOf(tbl.cur));
      tb.setAttribute("data-src", "page:" + id + "-table");
      if (api.scene.labels.tt) api.scene.placeLabel(api.scene.labels.tt);
    }
    function litAt(tick) { var ci = Math.min(CASES.length - 1, Math.floor(Math.max(0, tick - 1) / P)), r = res[ci]; return r.fire > 0 && tick >= r.fire && tick < r.fire + 8; }
    var ats = o.keys(res, P);
    var TICKS = o.ticks ? o.ticks(res, P) : TK;
    setAt(id, ats);
    var live0 = null;
    return fast(Deep.scene(id, {
      check: function () { var got = [0, 1, 2, 3].map(function (c) { return c in PRE ? PRE[c] : res[CASES.indexOf(c)].out; }); return ok(id + " truth table " + got.join("") + (o.skew ? " (wanted 0001)" : ""), got.join("") === (o.got || o.want).join("") && (!o.extraCheck || o.extraCheck(res, frames, pp, COLS, ROWS, base))); },
      grid: { cols: COLS, rows: ROWS, pitch: o.pitch, pitchPhone: o.pitchPhone, min: 2 },
      space: PHONE ? { top: 24, bottom: 136 } : { top: 24, bottom: 8, right: 112 },
      ticks: TICKS, tps: o.tps, pause: o.pause || 1400, rest: o.rest,
      draw: function (api, tick) { tick = Math.min(tick, TICKS); paintF(api, frames[tick], table(tick), litAt(tick), frames, tick); },
      inputs: [{ id: "a", label: "send a", momentary: true }, { id: "b", label: "send b", momentary: true }, { id: "ab", label: "send both", momentary: true }],
      live: {
        start: function (api, tick) { var w = WW.world(COLS, ROWS).load(frames[Math.min(tick, TICKS)], tick); w.tbl = table(Math.min(tick, TICKS)); w.fired = -1; w.n0 = 0; return w; },
        step: function (api, w) { if (w.skA === 0) inj(w, pp.A); w.skA--; w.step(); w.n0++; if (w.isHead(pp.O[0], pp.O[1])) w.fired = w.n0; if (w.n0 === P + SK) { var r = w.tbl.rows[TABLE_ORDER.indexOf(w.cs)]; r[2] = w.fired > 0 ? 1 : 0; r[3] = r[2] === o.want[w.cs]; } return w.n0 < P + SK; },
        draw: function (api, w) { paintF(api, w.g, w.tbl, w.fired > 0 && w.n0 < w.fired + 8); }, budget: 400
      },
      onInput: function (api, idn, on, w) {
        if (!w) return;
        var c = idn === "a" ? 1 : idn === "b" ? 2 : 3;
        clean(w); if (c & 2) inj(w, pp.B); if ((c & 1) && !SK) inj(w, pp.A);
        w.skA = (c & 1) && SK ? SK : -1;
        w.cs = c; w.n0 = 0; w.fired = -1; w.tbl.cur = c; w.tbl.rows[TABLE_ORDER.indexOf(c)][2] = null;
      }
    }));
  }

  gateScene("sc-or", ART.or, 22, {
    want: [0, 1, 1, 1], pitch: 24, pitchPhone: 16, tps: 8, pause: 1100, rest: "both", cases: [1, 2, 3, 1],
    leak: [[4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [2, 3], [3, 3]],
    keys: function (r, P) {
      var leak = -1;
      return { a: r[0].fire, b: r[1].fire, both: r[2].fire, leak: r[3].fire + 3 };
    },
    extraCheck: function (res, frames, pp, W) { var t = res[3].fire + 3; return frames[t][pp.B[1] * W + pp.B[0] + 3] === HD || frames[t][pp.B[1] * W + pp.B[0] + 2] === HD || frames[t][pp.B[1] * W + pp.B[0] + 4] === HD; }
  });
  gateScene("sc-xor", ART.xor, 30, {
    want: [0, 1, 1, 0], pitch: 20, pitchPhone: 12, tps: 8, pause: 1100, rest: "both", J: [13, 7],
    keys: function (r, P) { return { a: r[0].jf - 1, b: r[1].jf - 1, both: r[2].crowd, tuned: r[2].crowd + 3 }; },
    extraCheck: function (res) { return res[2].crowd > 0 && res[0].jf > 0 && res[1].jf > 0; }
  });

  /* ================= fig 9: the clocked NAND cell ================= */
  (function () {
    var COLS = NAND.W, ROWS = NAND.H, pt = NAND.ports;
    var SH = pt[0], ST = pt[1], FNW = pt[2], AIN = pt[3], BIN = pt[4], OUT = pt[5], J = pt[6];
    var base = WW.world(COLS, ROWS); NAND.cells.forEach(function (c) { base.wire(c[0], c[1]); });
    base.set(SH[0], SH[1], HD).set(ST[0], ST[1], TL);
    // calibration exactly as verify_nand: the clock alone, its arrivals at the NW port
    var cal = WW.record(base, 200), fnwh = [];
    for (var t = 1; t < cal.length; t++) if (cal[t][FNW[1] * COLS + FNW[0]] === HD) fnwh.push(t);
    var P = fnwh[2] - fnwh[1], cstar = fnwh.filter(function (x) { return x > 2 * LW + 10; })[0];
    var CASES = [0, 1, 2, 3, 0], at = {};
    CASES.forEach(function (c, k) { var ti = cstar + k * P - LW; at[ti] = function (w) { if (c & 1) w.inject(AIN[0], AIN[1]); if (c & 2) w.inject(BIN[0], BIN[1]); }; });
    var TK = cstar + 5 * P, frames = WW.record(base, TK, at);
    var res = CASES.map(function (c, k) {
      var c0 = cstar + k * P, fire = -1, crowd = -1;
      for (var t = c0; t < c0 + P && t <= TK; t++) {
        if (fire < 0 && frames[t][OUT[1] * COLS + OUT[0]] === HD) fire = t;
        if (crowd < 0 && crowds(frames[t], COLS, ROWS, [J[0] - 1, J[1] - 1, J[0] + 1, J[1] + 1]).length) crowd = t;
      }
      return { c: c, fire: fire, crowd: crowd, out: fire > 0 ? 1 : 0 };
    });
    var TICKS = res[4].fire + 4;
    setAt("sc-nand", { clock: cstar, n00: res[0].fire, na: res[1].fire, nb: res[2].fire, nab: res[3].crowd, rec: res[4].fire });
    var ORDER = [0, 2, 1, 3], WANT = [1, 1, 1, 0];   // rows a b: 00, 01, 10, 11
    function tableAt(tick) {
      var k = Math.max(0, Math.min(4, Math.floor((tick - cstar + 4) / P)));
      var rows = ORDER.map(function (c) {
        var val = null;
        for (var i = 0; i < 4; i++) if (CASES[i] === c) { var r = res[i], end = cstar + (i + 1) * P - 4; if (tick >= end || (r.fire > 0 && tick >= r.fire) || (r.fire < 0 && r.crowd > 0 && tick >= r.crowd)) val = r.out; }
        return [c & 1, (c & 2) >> 1, val, val === null ? null : val === WANT[c]];
      });
      return { rows: rows, cur: CASES[k] };
    }
    function litAt(tick) { for (var i = 0; i < 5; i++) { var f = res[i].fire; if (f > 0 && tick >= f && tick < f + 6) return true; } return false; }
    var lampX = OUT[0] + 4;
    function paintF(api, g, tbl, lit) {
      paint(api, g, COLS, ROWS, { rings: false });
      crowds(g, COLS, ROWS, [J[0] - 1, J[1] - 1, J[0] + 1, J[1] + 1]).forEach(function (c) { ring(api, c[0], c[1]); });
      api.dot(lampX, OUT[1], lit ? "v-green" : "copper");
      lbl(api, "k", "clock", 6, 4, { align: "center", dy: -4, cls: "b" });
      lbl(api, "a", "a", AIN[0], AIN[1], { dx: 16, dy: -4 }); lbl(api, "b", "b", BIN[0], BIN[1], { dx: -14, dy: -4 });
      // the junction is named under the b row, beside out, as on the case study
      lbl(api, "j", "junction", J[0], J[1] + 1, { dy: 12, align: "center", cls: "i" }); lbl(api, "o", "out", lampX, OUT[1], { dy: 12, align: "center" });
      var tx = PHONE ? 0 : COLS, ty = PHONE ? ROWS : 0;
      var tb = lbl(api, "tt", null, tx, ty, { dx: PHONE ? 0 : 24, dy: PHONE ? 8 : 0, cls: "r", html: true });
      tb.innerHTML = '<span class="m">a b  out</span><br>' + lampsHTML(tbl.rows, ORDER.indexOf(tbl.cur));
      tb.setAttribute("data-src", "page:nand-table"); api.scene.placeLabel(api.scene.labels.tt);
    }
    fast(Deep.scene("sc-nand", {
      check: function () { return ok("nand cell 1,1,1,0 and recovers after 1,1", res.map(function (r) { return r.out; }).join("") === "11101" && res[3].crowd > 0 && P > 0); },
      grid: { cols: COLS, rows: ROWS, pitch: 16, pitchPhone: 8 }, space: PHONE ? { top: 8, bottom: 136 } : { top: 8, bottom: 8, right: 112 },
      ticks: TICKS, tps: 16, pause: 1300, rest: "nab",
      draw: function (api, tick) { tick = Math.min(tick, TICKS); paintF(api, frames[tick], tableAt(tick), litAt(tick)); crowdsRecent(frames, tick, COLS, ROWS, [J[0] - 1, J[1] - 1, J[0] + 1, J[1] + 1]).forEach(function (c) { ring(api, c[0], c[1]); }); },
      inputs: [{ id: "a", label: "a", momentary: true }, { id: "b", label: "b", momentary: true }, { id: "ab", label: "a and b", momentary: true }, { id: "x", label: "none", momentary: true }],
      live: {
        start: function (api, tick) { var w = WW.world(COLS, ROWS).load(frames[Math.min(tick, TICKS)], Math.min(tick, TICKS)); w.tbl = tableAt(Math.min(tick, TICKS)); w.fires = []; w.until = 0; return w; },
        step: function (api, w) {
          if (w.pend && w.t === w.pend.t) { if (w.pend.c & 1) w.inject(AIN[0], AIN[1]); if (w.pend.c & 2) w.inject(BIN[0], BIN[1]); w.win = w.pend; w.pend = null; }
          w.step();
          if (w.isHead(OUT[0], OUT[1])) w.fires.push(w.t);
          if (w.win && w.t === w.win.t + LW + P - 4) { var r = w.tbl.rows[ORDER.indexOf(w.win.c)], f = w.fires.some(function (x) { return x > w.win.t + LW - 2; }); r[2] = f ? 1 : 0; r[3] = r[2] === WANT[w.win.c]; w.win = null; }
          return w.t < w.until;
        },
        draw: function (api, w) { var lit = w.fires.some(function (x) { return w.t >= x && w.t < x + 6; }); paintF(api, w.g, w.tbl, lit); }, budget: 400
      },
      onInput: function (api, id, on, w) {
        if (!w) return;
        var c = { a: 1, b: 2, ab: 3, x: 0 }[id], k = Math.ceil((w.t + 1 + LW - cstar) / P);
        var ti = cstar + k * P - LW;
        w.pend = { c: c, t: ti }; w.until = ti + LW + P; w.tbl.cur = c; w.tbl.rows[ORDER.indexOf(c)][2] = null;
      }
    }));
    /* the hero: the same cell and the same run, small, looping, no controls */
    var hero = Deep.scene("sc-hero", {
      grid: { cols: COLS, rows: ROWS, pitch: 12, pitchPhone: 8 }, space: PHONE ? { top: 8, bottom: 112 } : { top: 8, bottom: 8, right: 112 },
      ticks: TICKS, tps: 24, pause: 0,
      draw: function (api, tick) { tick = Math.min(tick, TICKS); paintF(api, frames[tick], tableAt(tick), litAt(tick)); crowdsRecent(frames, tick, COLS, ROWS, [J[0] - 1, J[1] - 1, J[0] + 1, J[1] + 1]).forEach(function (c) { ring(api, c[0], c[1]); }); }
    });
    if (hero && !Deep.reduce) hero.fig.addEventListener("scene:done", function () { setTimeout(function () { if (hero.visible) hero.play(); }, 1600); });
    if (hero && Deep.reduce) hero.show(TICKS);                       // reduced motion rests on the finished table, 1, 1, 1, 0, as the caption says
  })();

  /* ================= fig 10: memory, a bit that circles ================= */
  function regRun(base, W, H, pt, sets, clears, S) {
    var at = {};
    sets.forEach(function (t) { at[t] = (function (f) { return function (w) { if (f) f(w); w.inject(pt[0][0], pt[0][1]); }; })(at[t]); });
    clears.forEach(function (t) { at[t] = (function (f) { return function (w) { if (f) f(w); w.inject(pt[3][0], pt[3][1]); w.inject(pt[4][0], pt[4][1]); }; })(at[t]); });
    return WW.record(base, S, at);
  }
  function hitsAt(frames, W, c) { var r = []; for (var t = 1; t < frames.length; t++) if (frames[t][c[1] * W + c[0]] === HD) r.push(t); return r; }
  var REGW = REG.W, REGH = REG.H;
  var regBase = WW.world(REGW, REGH); REG.cells.forEach(function (c) { regBase.wire(c[0], c[1]); });
  var RP = REG.ports;
  var hold = regRun(regBase, REGW, REGH, RP, [0], [], 330), holdReads = hitsAt(hold, REGW, RP[1]), holdIn = hitsAt(hold, REGW, RP[2]);
  var LAP = holdReads[1] - holdReads[0];
  var calib = regRun(regBase, REGW, REGH, RP, [], [200], 240), OFF = -1;
  for (var tt = 200; tt < calib.length; tt++) if (calib[tt][RP[5][1] * REGW + RP[5][0]] === HD && calib[tt][RP[6][1] * REGW + RP[6][0]] === HD) { OFF = tt - 200; break; }
  (function () {
    var COLS = REGW, ROWS = REGH, J = RP[7];
    var tStar = holdIn.filter(function (x) { return x > 70; })[0], tInj = tStar - OFF, tRe = tInj + 80;
    var TK = tRe + 72, frames = regRun(regBase, COLS, ROWS, RP, [0, tRe], [tInj], TK);
    var reads = hitsAt(frames, COLS, RP[1]);
    var tSet = -1; for (var t = 6; t < 30; t++) if (crowds(frames[t], COLS, ROWS, [7, 0, 11, ROWS - 1]).length) { tSet = t; break; }
    var again = reads.filter(function (x) { return x > tRe; })[0];
    function empty0() { for (var u = tStar + 2; u < tRe; u++) if (liveIn(frames[u], COLS, [0, 0, COLS - 1, ROWS - 1])) return u; return true; }
    var empty = empty0() === true;
    var TICKS = Math.min(TK, again + 8);
    setAt("sc-mem", { layout: 0, set: tSet, hold: reads[0], clear: tStar, silent: tStar + 40, again: again });
    function readLit(g, t, list) { return list.some(function (x) { return t >= x && t < x + 8; }); }
    function paintF(api, g, lit, note) {
      paint(api, g, COLS, ROWS, { rings: false });
      crowds(g, COLS, ROWS).forEach(function (c) { ring(api, c[0], c[1]); });
      api.dot(RP[1][0] + 2, RP[1][1], lit ? "v-amber" : "copper");
      lbl(api, "s", "set", RP[0][0], RP[0][1], { dy: -20 }); lbl(api, "r", "read", RP[1][0] + 3, RP[1][1], { dx: 4, dy: -4 });
      lbl(api, "j", "J", J[0], J[1], { dx: 4, dy: 8, cls: "i" }); lbl(api, "c", "clear", RP[3][0], RP[3][1], { align: "right", dy: -24 });
      lbl(api, "d", "diode", 11, 9, { dx: 4, dy: -8 });
      var n = lbl(api, "n", "clear needs a stored 1: see fig 19", 8, ROWS - 1, { dy: 4, cls: "i" }); n.hidden = !note;
    }
    fast(Deep.scene("sc-mem", {
      check: function () { return ok("memory: hold, on-time clear leaves 0 electrons, set again", LAP > 0 && OFF > 0 && reads.filter(function (x) { return x < tInj; }).length >= 1 && empty && again > 0 && tSet > 0); },
      grid: { cols: COLS, rows: ROWS, pitch: 14, pitchPhone: 8 }, space: { top: 24, bottom: 24 },
      ticks: TICKS, tps: 20, pause: 1300, rest: "clear",
      draw: function (api, tick) { tick = Math.min(tick, TICKS); paintF(api, frames[tick], readLit(frames[tick], tick, reads), false); crowdsRecent(frames, tick, COLS, ROWS).forEach(function (c) { ring(api, c[0], c[1]); }); },
      inputs: [{ id: "set", label: "set", momentary: true }, { id: "clear", label: "clear", momentary: true }],
      live: {
        start: function (api, tick) { var w = WW.world(COLS, ROWS).load(frames[Math.min(tick, TICKS)], tick); w.reads = []; w.until = tick; return w; },
        step: function (api, w) {
          if (w.pend === w.t) { w.inject(RP[3][0], RP[3][1]); w.inject(RP[4][0], RP[4][1]); w.pend = -1; }
          w.step(); if (w.isHead(RP[1][0], RP[1][1])) w.reads.push(w.t);
          return w.t < w.until;
        },
        draw: function (api, w) { paintF(api, w.g, readLit(w.g, w.t, w.reads), w.note); }, budget: 400
      },
      onInput: function (api, id, on, w) {
        if (!w) return; w.note = false;
        if (id === "set") { w.inject(RP[0][0], RP[0][1]); w.until = w.t + 140; return; }
        var c = w.clone(), th = -1;
        for (var k = 1; k < 2 * LAP + OFF; k++) { c.step(); if (k >= OFF && c.isHead(RP[2][0], RP[2][1])) { th = w.t + k; break; } }
        if (th < 0) { w.note = true; w.until = w.t + 1; return; }
        w.pend = th - OFF; w.until = th + 40;
      }
    }));
  })();

  /* ================= fig 11: every other gate is NANDs (netlist level) ================= */
  (function () {
    var GATES = {
      not: { ins: { a: 7 }, nodes: [["n", 16, 6, "a", "a"]], rows: [[0], [1]] },
      and: { ins: { a: 3, b: 11 }, nodes: [["n", 12, 6, "a", "b"], ["o", 22, 6, "n", "n"]] },
      or: { ins: { a: 3, b: 11 }, nodes: [["na", 12, 2, "a", "a"], ["nb", 12, 10, "b", "b"], ["o", 24, 6, "na", "nb"]] },
      xor: { ins: { a: 2, b: 12 }, nodes: [["n", 10, 6, "a", "b"], ["p", 18, 1, "a", "n"], ["q", 18, 11, "n", "b"], ["o", 27, 6, "p", "q"]] },
      mux: { ins: { a: 1, sel: 7, b: 13 }, nodes: [["ns", 6, 6, "sel", "sel"], ["x1", 13, 1, "ns", "a"], ["x2", 13, 11, "sel", "b"], ["a1", 19, 1, "x1", "x1"], ["a2", 19, 11, "x2", "x2"], ["i1", 25, 1, "a1", "a1"], ["i2", 25, 11, "a2", "a2"], ["o", 31, 6, "i1", "i2"]] }
    };
    var ROWSET = {
      not: [{ a: 0 }, { a: 1 }],
      and: [{ a: 0, b: 0 }, { a: 1, b: 0 }, { a: 0, b: 1 }, { a: 1, b: 1 }],
      mux: [{ sel: 0, a: 1, b: 0 }, { sel: 0, a: 0, b: 1 }, { sel: 1, a: 1, b: 0 }, { sel: 1, a: 0, b: 1 }]
    };
    ROWSET.or = ROWSET.and; ROWSET.xor = ROWSET.and;
    var WANT = { not: function (v) { return 1 - v.a; }, and: function (v) { return v.a & v.b; }, or: function (v) { return v.a | v.b; }, xor: function (v) { return v.a ^ v.b; }, mux: function (v) { return v.sel ? v.b : v.a; } };
    var ORDER = ["not", "and", "or", "xor", "mux"], COLS = 40, ROWS = 15;
    function evalG(G, v) {
      var val = {}; for (var k in G.ins) val[k] = v[k] | 0;
      G.nodes.forEach(function (n) { val[n[0]] = (val[n[3]] && val[n[4]]) ? 0 : 1; });
      return val;
    }
    function src(G, s) { for (var i = 0; i < G.nodes.length; i++) if (G.nodes[i][0] === s) return [G.nodes[i][1] + 3, G.nodes[i][2] + 1]; return [3, G.ins[s]]; }
    function seg(api, x0, y0, x1, y1, tok) {
      var S = api.scene, c = S.ctx, p = S.dp, t = 2 * S.dpr;
      c.fillStyle = api.tok(tok);
      var ax = Math.min(x0, x1) * p + p / 2 - t / 2, ay = Math.min(y0, y1) * p + p / 2 - t / 2;
      c.fillRect(Math.round(ax), Math.round(ay), Math.round(Math.abs(x1 - x0) * p + t), Math.round(Math.abs(y1 - y0) * p + t));
    }
    function drawGate(api, name, v, rowsDone) {
      var G = GATES[name], val = evalG(G, v);
      api.clear();
      G.nodes.forEach(function (n) {
        [[n[3], 0, 1], [n[4], 2, 2]].forEach(function (pin) {
          var s = src(G, pin[0]), px = n[1], py = n[2] + pin[1], bx = px - pin[2], tok = val[pin[0]] ? "v-cyan" : "copper";
          seg(api, s[0], s[1], bx, s[1], tok); seg(api, bx, s[1], bx, py, tok); seg(api, bx, py, px, py, tok);
        });
      });
      G.nodes.forEach(function (n) { api.rect(n[1], n[2], 3, 3, val[n[0]] ? "v-green" : "copper"); });
      var o = G.nodes[G.nodes.length - 1], ov = val[o[0]];
      seg(api, o[1] + 3, o[2] + 1, 36, o[2] + 1, ov ? "v-cyan" : "copper");
      api.dot(37, o[2] + 1, ov ? "v-green" : "copper");
      // on a phone the 3-cell lead is shorter than "sel 1", so the input names sit just above their wires
      ["a", "b", "sel"].forEach(function (k) { var e = lbl(api, "in-" + k, k + " " + (v[k] | 0), 0, G.ins[k] || 0, { dy: api.phone ? -16 : -4, cls: "i" }); e.hidden = !(k in G.ins); });
      lbl(api, "out", "out " + ov, 37, o[2] + 2, { dy: 4, cls: "i", align: "center" });
      var IB = api.scene.inputBtns;
      ["a", "b", "sel"].forEach(function (k) { if (!IB[k]) return; IB[k].b.hidden = !(k in G.ins); if (api.mode !== "live") { api.scene.inputs[k] = !!(v[k] | 0); } });
      api.scene.syncInputs();
      var tb = lbl(api, "tt", null, PHONE ? 0 : COLS, PHONE ? ROWS : 0, { dx: PHONE ? 0 : 24, dy: PHONE ? 8 : 0, cls: "r", html: true });
      var keys = Object.keys(G.ins);
      tb.innerHTML = '<span class="m">' + keys.join(" ") + "  out</span><br>" + ROWSET[name].map(function (r, i) {
        var done = rowsDone === undefined ? true : i <= rowsDone, cur = rowsDone === i;
        return '<span class="' + (cur ? "" : "m") + '">' + keys.map(function (k) { return r[k]; }).join(" ") + "</span>  " + (done ? '<span class="g">' + WANT[name](r) + "</span>" : '<span class="m">·</span>');
      }).join("<br>");
      tb.setAttribute("data-src", "page:gates-table"); api.scene.placeLabel(api.scene.labels.tt);
    }
    Deep.scene("sc-gates", {
      check: function () {
        var good = ORDER.every(function (nm) { return ROWSET[nm].every(function (r) { var G = GATES[nm], val = evalG(G, r); return val[G.nodes[G.nodes.length - 1][0]] === WANT[nm](r); }); });
        var c = new Circuit(), a = c.net(0), b = c.net(0), x = c.xor_(a, b), n0 = c.nands.length;
        var counts = ORDER.map(function (nm) { return GATES[nm].nodes.length; }).join();   // the caption's counts (page:gate-counts)
        return ok("derived gates match their tables; xor is four nands; not, and, or, xor, mux are 1, 2, 3, 4, 8", good && n0 === 4 && counts === "1,2,3,4,8");
      },
      grid: { cols: COLS, rows: ROWS, pitch: 16, pitchPhone: 8 }, space: PHONE ? { top: 16, bottom: 136 } : { top: 16, bottom: 32, right: 120 },
      ticks: 24, tps: 3, pause: 1500,
      draw: function (api, tick) {
        var k = Math.min(4, Math.floor(tick / 5)), name = ORDER[k], last = ROWSET[name].length - 1, row = api.reduce ? last : Math.min(last, tick - 5 * k);
        drawGate(api, name, ROWSET[name][row], row);
      },
      inputs: [{ id: "a", label: "a" }, { id: "b", label: "b" }, { id: "sel", label: "sel" }],
      live: { start: function () { return {}; }, step: function () { return false; },
        draw: function (api) { drawGate(api, ORDER[api.keyIndex], { a: api.inputs.a ? 1 : 0, b: api.inputs.b ? 1 : 0, sel: api.inputs.sel ? 1 : 0 }); } }
    });
  })();

  /* ================= fig 12: flip-flop, register, RAM ================= */
  (function () {
    var COLS = 44, ROWS = 20, X0 = 7, HW = 2, NH = 18;
    var Dseq = [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
    var Eseq = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1];
    // the real flip-flop (wwcpu.js): sample on every rising edge, at the start of each odd half
    var c = new Circuit(), d = c.net(0), en = c.net(1), q = c.dff(d, en), tq = c.dff(c.GND), tff = c.dffsByQ(tq);
    tff.d = c.not_(tq); c.settle();
    var Q = [], TQ = [];
    for (var h = 0; h < NH; h++) {
      c.vals[d] = Dseq[h]; c.vals[en] = Eseq[h];
      if (h > 0 && h % 2 === 0) c.tick(); else c.settle();
      Q.push(c.get(q)); TQ.push(c.get(tq));
    }
    // a register of eight sharing load, and the RAM: 16 of them with a decoder (wwcpu.js, as sap1 wires them)
    var r = new Circuit(), bus = r.bus(8, 0), Wr = r.net(0), addr = r.bus(4, 0), sel = decoder(r, addr), RAM = [];
    for (var w = 0; w < 16; w++) { var row = []; var wen = r.and_(Wr, sel[w]); for (var b = 0; b < 8; b++) row.push(r.dff(bus[b], wen)); RAM.push(row); }
    r.setbus(bus, 0xA6); r.setbus(addr, 5); r.vals[Wr] = 1; r.settle();
    var before = RAM.map(function (rw) { return r.getbus(rw); }); r.tick();
    var after = RAM.map(function (rw) { return r.getbus(rw); });
    // local states in the signal family, each row named, so no theme hue takes on a second meaning here
    var TRACES = [["clock", 1, "ink"], ["d", 4, "v-cyan"], ["load", 7, "body"], ["q", 10, "signal"], ["toggle", 13, "signal"]];
    function level(name, h) { return name === "clock" ? 1 - h % 2 : name === "d" ? Dseq[h] : name === "load" ? Eseq[h] : name === "q" ? Q[h] : TQ[h]; }
    function seg(api, x0, y0, x1, y1, tok) {
      var S = api.scene, cx = S.ctx, p = S.dp, t = 2 * S.dpr;
      cx.fillStyle = api.tok(tok);
      cx.fillRect(Math.round(Math.min(x0, x1) * p), Math.round(Math.min(y0, y1) * p), Math.round(Math.abs(x1 - x0) * p + t), Math.round(Math.abs(y1 - y0) * p + t));
    }
    setAt("sc-ff", { wait: 3, edge: 4, toggle: 9, hold: 13, reg: 18, ram: 19 });
    function draw(api, tick) {
      api.clear();
      var lamps = tick >= 18;
      TRACES.forEach(function (tr) { var e = lbl(api, "t-" + tr[0], tr[0], 0, tr[1], { dy: 0 }); e.hidden = lamps; });
      ["rg", "rm", "ad"].forEach(function (id) { if (api.scene.labels[id]) api.scene.labels[id].e.hidden = !lamps; });
      if (!lamps) {
        var hN = Math.min(NH - 1, tick);
        var S0 = api.scene, cx0 = S0.ctx, pp0 = S0.dp;
        cx0.fillStyle = api.tok("copper");
        for (var hh = 2; hh < NH; hh += 2) cx0.fillRect((X0 + hh * HW) * pp0, 0, S0.dpr, (ROWS - 4) * pp0);    // every rising edge
        TRACES.forEach(function (tr) {
          var y = tr[1];
          for (var h2 = 0; h2 <= hN; h2++) {
            var lv = level(tr[0], h2), yy = lv ? y : y + 1, x = X0 + h2 * HW;
            seg(api, x, yy, x + HW, yy, tr[2]);
            if (h2 > 0 && level(tr[0], h2 - 1) !== lv) seg(api, x, y, x, y + 1, tr[2]);
          }
        });
        cx0.fillStyle = api.tok("muted"); cx0.fillRect((X0 + (hN + 1) * HW) * pp0, 0, S0.dpr, (ROWS - 4) * pp0);
        return;
      }
      var vals = tick >= 19 ? after : before, show = tick >= 19;
      lbl(api, "rg", "register 5, loading 1010 0110", X0, 1, { dy: -4, cls: "i" });
      for (var w2 = 0; w2 < 16; w2++) {
        var y2 = 3 + w2, hit = w2 === 5;
        api.dot(X0 - 2, y2, hit ? "v-violet" : "residue");
        for (var b2 = 0; b2 < 8; b2++) api.dot(X0 + 2 + (7 - b2) * 2, y2, (vals[w2] >> b2) & 1 ? "v-amber" : "copper");
      }
      lbl(api, "ad", "decoder", X0 - 2, PHONE ? 19 : 3, PHONE ? { align: "center" } : { align: "right", dx: -8, dy: -4 });
      lbl(api, "rm", show ? "after the edge" : "before the edge", X0 + 20, 3, { dx: 16, dy: -4 });
    }
    Deep.scene("sc-ff", {
      check: function () {
        var waits = Q[3] === 0 && Q[4] === 1, toggles = TQ.filter(function (x, i) { return i > 0 && i % 2 === 0; }).join("").indexOf("1010") === 0;
        var holds = Q[13] === 0 && Dseq[13] === 1, ram = after[5] === 0xA6 && after.every(function (v, i) { return i === 5 || v === 0; });
        return ok("flip-flop waits for the edge, toggles, holds with load off; ram writes only the addressed row", waits && toggles && holds && ram);
      },
      grid: { cols: COLS, rows: ROWS, pitch: 16, pitchPhone: 8 }, space: { top: 16, bottom: 8 },
      ticks: 19, tps: 3, pause: 1300, rest: "edge", draw: draw
    });
  })();

  /* ================= SAP-1: one run, recorded cycle by cycle on the gate-level netlist ================= */
  var PROGS = {
    fib: "top: LDA a\nOUT\nADD b\nJC done\nSTA t\nLDA b\nSTA a\nLDA t\nSTA b\nJMP top\ndone: HLT\na: DB 1\nb: DB 1\nt: DB 0",
    add: "LDA x\nADD y\nOUT\nHLT\nx: DB 5\ny: DB 3",
    sub: "LDA x\nSUB y\nOUT\nHLT\nx: DB 9\ny: DB 4",
    count: "LDI 3\nloop: OUT\nJZ done\nSUB one\nJMP loop\ndone: HLT\none: DB 1",
    sum: "LDI 4\nSTA n\nloop: LDA n\nJZ done\nADD sum\nSTA sum\nLDA n\nSUB one\nSTA n\nJMP loop\ndone: LDA sum\nOUT\nHLT\none: DB 1\nn: DB 0\nsum: DB 0"
  };
  var WANT_OUT = { fib: [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144], add: [8], sub: [5], count: [3, 2, 1, 0], sum: [10] };
  function runProg(src, keep) {
    var cpu = new SAP1(assemble(src).image), snaps = [], outs = [], at = [];
    for (var cyc = 0; cyc < 3000; cyc++) {
      var s = cpu.snapshot(); if (keep) snaps.push(s);
      if (s.halt) break;
      var lo = s.sigs.indexOf("Lo") >= 0; cpu.step();
      if (lo) { outs.push(cpu.c.getbus(cpu.O)); at.push(cyc + 1); }
    }
    return { snaps: snaps, outs: outs, at: at, cpu: cpu };
  }
  var FIB = runProg(PROGS.fib, true);
  var SAPOK = (function () {
    var all = Object.keys(PROGS).every(function (k) { return (k === "fib" ? FIB : runProg(PROGS[k])).outs.join(",") === WANT_OUT[k].join(","); });
    var c = new SAP1(assemble(PROGS.fib).image).c;
    CHECKS["netlist 1446 nand, 175 dff"] = c.nands.length === 1446 && c.dffs.length === 175;
    CHECKS["five programs' outputs"] = all;
    return all && CHECKS["netlist 1446 nand, 175 dff"];
  })();
  var DRV = { Ep: "pc", CE: "m", Ei: "ir", Ea: "a", Eu: "alu" }, LDR = { Lm: "mar", Li: "ir", La: "a", Lb: "b", Lo: "out", Wr: "m", Jl: "pc", Cp: "pc" };
  var PROWS = [["pc", 5, 4], ["mar", 7, 4], ["m", 9, 8], ["ir", 11, 8], ["a", 13, 8], ["b", 15, 8], ["alu", 17, 8], ["out", 19, 8]];
  function progLines(src) { return src.split("\n").map(function (l) { return l.replace(/^\w+:\s*/, ""); }).filter(function (l) { return !/^DB/.test(l); }); }
  function curAddrs(S) { var c = 0; return S.map(function (s) { if (s.T === 1) c = s.PC; return c; }); }
  // LX: the bits' first column; RX: the ram's. A phone gets two more columns of room for the row names ("alu 255")
  var PCOLS = PHONE ? 41 : 38, PROWN = 23, LX = PHONE ? 9 : 7, RX = PHONE ? 32 : 29;
  function aluVal(s) { var v = s.sigs.indexOf("Su") >= 0 ? (s.A - s.B) & 255 : (s.A + s.B) & 255; return v; }
  function panel(api, s, tape, o) {
    o = o || {};
    api.clear();
    for (var i = 0; i < 6; i++) api.dot(LX + 4 + i * 2, 1, s.T === i + 1 ? "v-violet" : "copper");
    lbl(api, "pT", "step T" + s.T, 0, 1, { dy: -4, cls: "i" });
    for (var b = 0; b < 8; b++) api.dot(LX + (7 - b) * 2, 3, (s.bus >> b) & 1 ? "v-green" : "copper");
    var drv = Object.keys(DRV).filter(function (k) { return s.sigs.indexOf(k) >= 0; }), ldr = Object.keys(LDR).filter(function (k) { return s.sigs.indexOf(k) >= 0; });
    lbl(api, "pB", "bus", 0, 3, { dy: -4 });
    var bi = lbl(api, "pBi", "idle", LX + 16, 3, { dy: -4 }); bi.hidden = drv.length > 0;      // in the signal column, clear of the bits
    var vals = { pc: s.PC, mar: s.MAR, m: s.ram[s.MAR], ir: s.IR, a: s.A, b: s.B, alu: aluVal(s), out: s.OUT };
    // a loading register is drawn with the value it takes at the end of the step
    if (ldr.indexOf("Lm") >= 0) vals.mar = s.bus & 15; if (ldr.indexOf("Li") >= 0) vals.ir = s.bus; if (ldr.indexOf("La") >= 0) vals.a = s.bus;
    if (ldr.indexOf("Lb") >= 0) vals.b = s.bus; if (ldr.indexOf("Lo") >= 0) vals.out = s.bus; if (ldr.indexOf("Jl") >= 0) vals.pc = s.bus & 15; else if (ldr.indexOf("Cp") >= 0) vals.pc = (s.PC + 1) & 15;
    // the data registers also say their value in decimal, so a reader can follow a, b and the sum without reading binary
    var names = { pc: "pc " + vals.pc, mar: "mar " + vals.mar, m: "ram", ir: "ir " + (MNEM[vals.ir >> 4] || "?"), a: "a " + vals.a, b: "b " + vals.b, alu: "alu " + vals.alu, out: "out " + vals.out };
    PROWS.forEach(function (r) {
      var id = r[0], y = r[1], n = r[2], v = vals[id];
      var dr = drv.filter(function (k) { return DRV[k] === id; }), ld = ldr.filter(function (k) { return LDR[k] === id; });
      for (var bb = 0; bb < n; bb++) api.dot(LX + (7 - bb) * 2, y, (v >> bb) & 1 ? "v-amber" : "copper");
      if (dr.length) api.dot(LX - 2, y, "v-green"); else if (ld.length) api.dot(LX - 2, y, "v-cyan");
      var e = lbl(api, "pn-" + id, names[id], 0, y, { dy: -4, cls: dr.length || ld.length ? "i" : "" });
      if (!e.hasAttribute("data-src")) e.setAttribute("data-src", "page:sap-regs");
      var sg = lbl(api, "ps-" + id, null, LX + 16, y, { dx: id === "alu" ? 0 : 0, dy: -4, html: true });
      sg.innerHTML = dr.map(function (k) { return '<span class="g">' + k + "</span>"; }).concat(ld.map(function (k) { return '<span class="c">' + k + "</span>"; })).join(" ");
    });
    api.dot(LX + 16, 19, s.C ? "v-cyan" : "copper");
    var cl = lbl(api, "pc-c", "carry", LX + 17, 19, { dy: -4, dx: 4 }); cl.className = "sc-l" + (s.C ? " c" : "");
    if (o.prog) {
      var pl = lbl(api, "prog", null, PHONE ? 0 : PCOLS, PHONE ? PROWN : 1, { dx: PHONE ? 0 : 16, dy: PHONE ? 8 : -4, cls: "r", html: true });
      var lines = o.prog.map(function (ln, i) { return '<span class="' + (i === o.cur ? "g" : "m") + '">' + (i < 10 ? " " : "") + i + " " + ln + "</span>"; });
      // a phone has no room beside the machine, so the listing goes under it in two columns and fits the figure
      var h2 = Math.ceil(lines.length / 2);
      pl.innerHTML = '<span class="m">program</span><br>' + (PHONE ? '<span class="pc2">' + lines.slice(0, h2).join("<br>") + '</span><span class="pc2">' + lines.slice(h2).join("<br>") + "</span>" : lines.join("<br>"));
      api.scene.placeLabel(api.scene.labels.prog);
    }
    if (o.ram) {
      for (var w = 0; w < 16; w++) {
        api.dot(RX, 3 + w, w === s.MAR ? "v-violet" : "residue");
        for (var b3 = 0; b3 < 8; b3++) api.dot(RX + 1 + (7 - b3), 3 + w, (s.ram[w] >> b3) & 1 ? "v-amber" : "copper");
      }
      var pr = lbl(api, "pR", "ram 16×8", RX + 1, 1, { dy: -4 }); pr.setAttribute("data-src", "Olivesz/emergence@ad96d38:cpu/sap1.py#L12");
    }
    // the output tape: a 13 px readout, or (o.big, fig 15) the figure's payoff in the 30 px display size; the newest
    // number is green, the colour this page gives an output that just fired
    var tp = api.label("tape", null, 0, 21, { dy: 0, cls: "r", html: true });
    if (!tp.classList.contains("tape")) { tp.classList.add("tape"); if (o.big) tp.classList.add("big"); }
    var last = tape.length - 1;
    tp.innerHTML = '<span class="m">out</span> ' + (tape.length ? tape.map(function (v, i) { return i === last ? '<span class="g">' + v + "</span>" : v; }).join(" ") : '<span class="m">·</span>');
    tp.setAttribute("data-src", "page:sap-out");
  }

  /* fig 13: the bus, and who talks when */
  (function () {
    var S = FIB.snaps, c4 = -1, jn = -1, jt = -1, CUR = curAddrs(S), PL = progLines(PROGS.fib);
    for (var i = 0; i < S.length; i++) {
      if (c4 < 0 && S[i].op === 2 && S[i].T === 4) c4 = i;
      if (S[i].op === 8 && S[i].T === 4) { if (S[i].sigs.indexOf("Jl") < 0 && jn < 0) jn = i; if (S[i].sigs.indexOf("Jl") >= 0) jt = i; }
    }
    var CYC = [c4 - 3, c4 - 2, c4 - 1, c4, c4 + 1, c4 + 2, jn, jt];
    function tapeAt(cy) { return FIB.outs.filter(function (v, k) { return FIB.at[k] <= cy; }); }
    Deep.scene("sc-bus", {
      check: function () {
        var want = [["Ep", "Lm"], ["Cp"], ["CE", "Li"], ["Ei", "Lm"], ["CE", "Lb"], ["Eu", "La"]];
        var good = want.every(function (w, k) { var sg = S[CYC[k]].sigs.filter(function (x) { return x !== "Su" && x !== "Hlt"; }); return sg.slice().sort().join() === w.slice().sort().join(); });
        return ok("ADD b runs T1 Ep+Lm, T2 Cp, T3 CE+Li, T4 Ei+Lm, T5 CE+Lb, T6 Eu+La; JC taken once", SAPOK && good && jn > 0 && jt > 0 && S[jt].C === 1);
      },
      grid: { cols: PCOLS, rows: PROWN, pitch: 16, pitchPhone: 8 }, space: PHONE ? { top: 16, bottom: 216 } : { top: 16, bottom: 16, right: 128 },
      ticks: 7, tps: 1, pause: 1200, rest: "t6",
      draw: function (api, tick) { var cy = CYC[Math.min(7, tick)]; panel(api, S[cy], tapeAt(cy), { ram: true, prog: PL, cur: CUR[cy] }); }
    });
  })();

  /* fig 14: the ALU */
  (function () {
    var c = new Circuit(), A = c.bus(8), B = c.bus(8), sub = c.net(0), carry = sub, Bx = [], CI = [], SUM = [];
    for (var k = 0; k < 8; k++) { var bx = c.xor_(B[k], sub); Bx.push(bx); CI.push(carry); var fa = fullAdder(c, A[k], bx, carry); SUM.push(fa[0]); carry = fa[1]; }
    var COUT = carry;
    // one pass in creation order is the settled value: every nand's inputs were made before it
    function evalFast(a, b, s) {
      var v = c.vals; c.setbus(A, a); c.setbus(B, b); v[sub] = s; v[c.GND] = 0; v[c.VCC] = 1;
      var N = c.nands; for (var i = 0; i < N.length; i++) { var n = N[i]; v[n[0]] = (v[n[1]] && v[n[2]]) ? 0 : 1; }
      return { sum: c.getbus(SUM), cout: v[COUT], ci: CI.map(function (x) { return v[x]; }), bx: c.getbus(Bx) };
    }
    var EX = [[100, 55, 0], [100, 55, 1], [200, 100, 0]];
    var COLS = 37, ROWS = 13, X = 7;   // X: the first bit's column, set per layout so the row labels clear the bits
    var ui = { a: 100, b: 55 };
    function draw(api, a, b, s, upto) {
      api.clear();
      X = api.phone ? 20 : 10;
      var r = evalFast(a, b, s);
      for (var k = 0; k < 8; k++) {
        var x = X + (7 - k) * 2, on = k < upto;
        api.dot(x, 1, (a >> k) & 1 ? "v-amber" : "copper");
        api.dot(x, 3, (b >> k) & 1 ? "v-amber" : "copper");
        api.dot(x, 5, (r.bx >> k) & 1 ? "v-amber" : "copper");
        api.dot(x + 1, 7, on || k === 0 ? (r.ci[k] ? "v-cyan" : "copper") : "residue");
        api.dot(x, 9, on ? ((r.sum >> k) & 1 ? "v-green" : "copper") : "residue");
      }
      var done = upto >= 8;
      api.dot(X - 2, 7, done ? (r.cout ? "v-cyan" : "copper") : "residue");
      lbl(api, "la", "a " + a, 0, 1, { dy: -4, cls: "i" }); lbl(api, "lb", "b " + b, 0, 3, { dy: -4, cls: "i" });
      lbl(api, "lx", s ? "not b, into the adder" : "b, into the adder", 0, 5, { dy: -4 }); lbl(api, "lc", "carry", 0, 7, { dy: -4 });
      var sv = lbl(api, "ls", "sum " + (done ? r.sum : "…"), 0, 9, { dy: -4, cls: "i" }); sv.setAttribute("data-src", "page:alu");
      var op = lbl(api, "op", (s ? "a − b" : "a + b") + (done ? (r.cout ? (s ? "  carry 1: no borrow" : "  carry 1: overflow") : "  carry 0") : ""), X - 2, 11, { dy: -4, cls: r.cout && done ? "c" : "" });
      if (rs && api.mode !== "live") { rs[0].value = a; rs[1].value = b; }
    }
    var rs = null;
    var TICKS = 29;
    Deep.scene("sc-alu", {
      check: function () {
        // the same nands in the same order, 32 input pairs at a time (one per bit of a word; lane l is b = 32 hi + l), so
        // all 131,072 cases run in a few ms instead of blocking the first paint
        var NF = new Int32Array(c.nands.length * 3), VF = new Int32Array(c.vals.length), bad = 0;
        var PAT = [0xAAAAAAAA | 0, 0xCCCCCCCC | 0, 0xF0F0F0F0 | 0, 0xFF00FF00 | 0, 0xFFFF0000 | 0];
        c.nands.forEach(function (n, i) { NF[3 * i] = n[0]; NF[3 * i + 1] = n[1]; NF[3 * i + 2] = n[2]; });
        for (var s = 0; s < 2; s++) for (var a = 0; a < 256; a++) for (var hi = 0; hi < 8; hi++) {
          for (var k = 0; k < 8; k++) { VF[A[k]] = (a >> k) & 1 ? -1 : 0; VF[B[k]] = k < 5 ? PAT[k] : (hi >> (k - 5)) & 1 ? -1 : 0; }
          VF[sub] = s ? -1 : 0; VF[c.GND] = 0; VF[c.VCC] = -1;
          for (var i = 0; i < NF.length; i += 3) VF[NF[i]] = ~(VF[NF[i + 1]] & VF[NF[i + 2]]);
          for (var l = 0; l < 32; l++) {
            var b = 32 * hi + l, o = 0, co = (VF[COUT] >>> l) & 1;
            for (k = 0; k < 8; k++) o |= ((VF[SUM[k]] >>> l) & 1) << k;
            if (s ? o !== ((a - b) & 255) || co !== (a >= b ? 1 : 0) : o !== ((a + b) & 255) || co !== (a + b > 255 ? 1 : 0)) bad++;
          }
        }
        var e1 = evalFast(200, 100, 0); if (e1.sum !== 44 || e1.cout !== 1) bad++;      // and the drawing's own evaluator agrees
        c.setbus(A, 77); c.setbus(B, 99); c.vals[sub] = 0; c.settle();
        return ok("adder equals 8-bit arithmetic on all 65,536 pairs, add and subtract", bad === 0 && c.getbus(SUM) === 176);
      },
      grid: { cols: COLS, rows: ROWS, pitch: 16, pitchPhone: 8 }, space: { top: 16, bottom: 8 },
      ticks: TICKS, tps: 4, pause: 1300, rest: "ripple",
      draw: function (api, tick) { var e = Math.min(2, Math.floor(tick / 10)), ex = EX[e], up = api.reduce ? 8 : Math.min(8, tick - e * 10); draw(api, ex[0], ex[1], ex[2], Math.max(1, up)); },
      inputs: [{ id: "sub", label: "subtract" }],
      live: { start: function () { return {}; }, step: function () { return false; }, draw: function (api) { draw(api, ui.a, ui.b, api.inputs.sub ? 1 : 0, 8); } }
    });
    // two native sliders for a and b; moving one puts the scene in live mode through its subtract toggle's path
    var fig = document.getElementById("sc-alu"), sc = Deep.scenes.filter(function (s) { return s.id === "sc-alu"; })[0];
    if (fig && sc) {
      var row = document.createElement("div"); row.className = "sc-in sc-rg";
      row.innerHTML = '<label><span>a</span><input type="range" min="0" max="255" value="100" aria-label="a, 0 to 255"></label><label><span>b</span><input type="range" min="0" max="255" value="55" aria-label="b, 0 to 255"></label>';
      fig.insertBefore(row, fig.querySelector(".sc-in"));
      rs = row.querySelectorAll("input");
      [].forEach.call(rs, function (inp, i) {
        inp.addEventListener("input", function () {
          ui[i ? "b" : "a"] = +inp.value;
          sc.arrived = true;
          if (sc.mode !== "live") { sc.stop(); sc.live = {}; sc.mode = "live"; }
          sc.render(true);
        });
      });
    }
  })();

  /* fig 15: SAP-1 runs Fibonacci */
  (function () {
    var S = FIB.snaps, last = S.length - 1, CUR = curAddrs(S), PL = progLines(PROGS.fib);
    var pick = [0, 1, 4, 7, 9, 11];
    var ats = {}; ["o1", "o2", "o5", "o21", "o89", "o144"].forEach(function (k, i) { ats[k] = FIB.at[pick[i]]; }); ats.halt = last;
    setAt("sc-sap", ats);
    function tapeAt(cy) { return FIB.outs.filter(function (v, k) { return FIB.at[k] <= cy; }); }
    fast(Deep.scene("sc-sap", {
      check: function () { return ok("fibonacci tape on the netlist", SAPOK && FIB.outs.join(",") === WANT_OUT.fib.join(",") && S[last].halt === 1); },
      grid: { cols: PCOLS, rows: PROWN, pitch: 16, pitchPhone: 8 }, space: PHONE ? { top: 16, bottom: 216 } : { top: 16, bottom: 16, right: 128 },
      ticks: last, tps: 60, pause: 900, rest: "halt",
      draw: function (api, tick) { var cy = Math.min(last, tick); panel(api, S[cy], tapeAt(cy), { ram: true, prog: PL, cur: CUR[cy], big: true }); },
      inputs: [{ id: "fib", label: "fibonacci", momentary: true }, { id: "add", label: "5 + 3", momentary: true }, { id: "sub", label: "9 − 4", momentary: true }, { id: "count", label: "countdown", momentary: true }, { id: "sum", label: "sum", momentary: true }],
      live: {
        start: function () { return { cpu: null }; },
        step: function (api, L) { if (!L.cpu) return false; var s = L.cpu.snapshot(); if (s.halt) return false; var lo = s.sigs.indexOf("Lo") >= 0; L.cpu.step(); if (lo) L.tape.push(L.cpu.c.getbus(L.cpu.O)); var s2 = L.cpu.snapshot(); if (s2.T === 1) L.cur = s2.PC; return true; },
        draw: function (api, L) { if (L.cpu) panel(api, L.cpu.snapshot(), L.tape, { ram: true, prog: L.prog, cur: L.cur, big: true }); }, budget: 3000
      },
      onInput: function (api, id, on, L) { if (L) { L.cpu = new SAP1(assemble(PROGS[id]).image); L.tape = []; L.prog = progLines(PROGS[id]); L.cur = 0; } }
    }));
  })();

  /* ================= fig 16: the asynchronous wall: the act's AND ================= */
  var AND_MARKS = [];
  gateScene("sc-and", ART.and, 170, {
    want: [0, 0, 0, 1], pitch: 6, pitchPhone: 3, tps: 48, pause: 1000, rest: "both", oy: 1, marks: AND_MARKS,
    keys: function (r, P) { return { a: r[0].lastCrowd > 0 ? r[0].lastCrowd : 40, b: r[1].lastCrowd > 0 ? r[1].lastCrowd : P + 40, both: r[2].fire }; },
    ticks: function (r, P) { return r[2].fire + 12; }
  });
  var SKEW = 1;
  (function () { var ks = document.querySelectorAll('[data-src="page:skew-k"]'); [].forEach.call(ks, function (e) { e.textContent = SKEW === 1 ? "one cell" : SKEW + " cells"; }); })();
  gateScene("sc-skew", ART.and, 170, {
    want: [0, 0, 0, 1], got: [0, 0, 0, 0], skew: SKEW, cases: [1, 3], pitch: 6, pitchPhone: 3, tps: 48, pause: 1000, rest: "wrong", oy: 1, marks: AND_MARKS,
    keys: function (r, P) { return { a: r[0].lastCrowd > 0 ? r[0].lastCrowd : 40, both: P + 120, wrong: 2 * P - 4 }; },
    ticks: function (r, P) { return 2 * P; },
    extraCheck: function (res, frames, pp, COLS, ROWS, base) {
      // a lead from 1 to 8 cells longer: every one of them reads 11 -> 0
      for (var k = 1; k <= 8; k++) {
        var at = {}; at[0] = function (w) { inj(w, pp.B); }; at[k] = function (w) { inj(w, pp.A); };
        var fr = WW.record(base, 170 + k, at); for (var t = 1; t < fr.length; t++) if (fr[t][pp.O[1] * COLS + pp.O[0]] === HD) return false;
      }
      return true;
    }
  });

  /* ================= fig 17: the clocked fix (a diagram) ================= */
  Deep.scene("sc-sync", { ticks: 2, tps: 1 });

  /* ================= fig 18: one tick of slack ================= */
  (function () {
    var L = PHONE ? { cols: REGW, rows: 2 * REGH + 3, b: [0, REGH + 3] } : { cols: 2 * REGW, rows: REGH, b: [REGW, 0] };
    var COLS = L.cols, ROWS = L.rows;
    var pA = RP, pB = RP.map(function (p) { return [p[0] + L.b[0], p[1] + L.b[1]]; });
    var tA = holdIn.filter(function (x) { return x > 70; })[0], t0 = tA - 14, lead = tA - t0;
    function blank() { var w = WW.world(COLS, ROWS); stampInto(w, REG, 0, 0); stampInto(w, REG, L.b[0], L.b[1]); return w; }
    function loaded(emptyB) {
      var w = blank(), snap = hold[t0];
      for (var y = 0; y < REGH; y++) for (var x = 0; x < REGW; x++) { var s = snap[y * REGW + x]; w.set(x, y, s); if (!emptyB) w.set(x + L.b[0], y + L.b[1], s); }
      return w;
    }
    function clr(w, p) { w.inject(p[3][0], p[3][1]); w.inject(p[4][0], p[4][1]); }
    var SEG = [[2, false], [-2, false], [0, true]], SL = [56, 56, 110], starts = [0, 56, 112], TK = 222;
    var at = {};
    SEG.forEach(function (sg, i) {
      var s0 = starts[i];
      at[s0] = function (w) { w.g.set(loaded(sg[1]).g); };
      var ta = s0 + lead - OFF, tb = ta + sg[0];
      at[ta] = (function (f) { return function (w) { if (f) f(w); clr(w, pA); }; })(at[ta]);
      at[tb] = (function (f) { return function (w) { if (f) f(w); clr(w, pB); }; })(at[tb]);
    });
    var frames = WW.record(blank(), TK, at);
    var rA = [0, 0, REGW - 1, REGH - 1], rB = [L.b[0], L.b[1], L.b[0] + REGW - 1, L.b[1] + REGH - 1];
    function aliveAfter(fr, r, from, to) { for (var t = from; t < to; t++) if (liveIn(fr[t], COLS, r)) return true; return false; }
    // the sweep: every offset from -2 to +2; only 0 clears
    function sweep(off) {
      var w = loaded(false), ta = lead - OFF, at2 = {}; at2[ta + off] = function (x) { clr(x, pB); };
      var fr = WW.record(w, lead + 70, at2); return !aliveAfter(fr, rB, lead + 6, lead + 70);
    }
    var sw = [-2, -1, 0, 1, 2].map(sweep);
    var lateTips = -1; for (var t = starts[0] + lead - OFF + 2; t < starts[0] + lead + 6; t++) if (frames[t][pB[5][1] * COLS + pB[5][0]] === HD && frames[t][pB[6][1] * COLS + pB[6][0]] === HD) { lateTips = t; break; }
    var flood = WW.world(COLS, ROWS).load(frames[TK]).count(HD);
    function tipsAt(s0, o2) { for (var t = s0 + lead + o2 - 3; t <= s0 + lead + o2 + 3; t++) if (frames[t][pB[5][1] * COLS + pB[5][0]] === HD && frames[t][pB[6][1] * COLS + pB[6][0]] === HD) return t; return -1; }
    var tLate = tipsAt(starts[0], 2), tEarly = tipsAt(starts[1], -2), tEmpty = tipsAt(starts[2], 0);
    if (tLate < 0) tLate = starts[0] + lead + 3; if (tEarly < 0) tEarly = starts[1] + lead - 1; if (tEmpty < 0) tEmpty = starts[2] + lead + 1;
    setAt("sc-slack", { late: tLate, early: tEarly, empty: tEmpty + 1, flood: TK });
    var off = 2;
    function words(o) { return o === 0 ? "on time" : Math.abs(o) + (Math.abs(o) === 1 ? " tick " : " ticks ") + (o > 0 ? "late" : "early"); }
    function names(api, k) {
      var right = k === "early" ? "2 ticks early" : k === "empty" || k === "flood" ? "clear, empty loop" : k === "live" ? words(off) : "2 ticks late";
      lbl(api, "nA", "on time", 1, 0, { dy: -20, cls: "i" });
      var nb = lbl(api, "nB", right, L.b[0] + 1, L.b[1], { dy: -20, cls: "i" }); if (!nb.hasAttribute("data-src")) nb.setAttribute("data-src", "page:slack-sweep");
    }
    /* during the timeline the slider shows the right clear's timing in the segment playing: 2 late, 2 early, then on
       time into an empty loop (the empty loop, not the timing, is what goes wrong there) */
    function paintF(api, g, k) {
      paint(api, g, COLS, ROWS); names(api, k);
      if (out && api.mode !== "live") { off = k === "early" ? -2 : k === "empty" || k === "flood" ? 0 : 2; inp.value = off; out.textContent = words(off); }
    }
    var out = null, inp = null;
    var sc = fast(Deep.scene("sc-slack", {
      check: function () { return ok("clear only on time: offsets -2..+2 clear only at 0; empty-loop clear floods", sw.join() === "false,false,true,false,false" && flood > 2); },
      grid: { cols: COLS, rows: ROWS, pitch: 8, pitchPhone: 8 }, space: { top: 24, bottom: 8 },
      ticks: TK, tps: 14, pause: 1400, rest: "late",
      draw: function (api, tick) { paintF(api, frames[Math.min(tick, TK)], api.key); },
      inputs: [{ id: "go", label: "clear", momentary: true }, { id: "empty", label: "clear an empty loop", momentary: true }],
      live: {
        start: function () { return { w: null }; },
        step: function (api, s) { if (!s.w) return false; if (s.at[s.w.t]) s.at[s.w.t](s.w); s.w.step(); return s.w.t < s.end; },
        draw: function (api, s) { if (s.w) { paint(api, s.w.g, COLS, ROWS); names(api, s.empty ? "empty" : "live"); } }, budget: 200
      },
      onInput: function (api, id, on, s) {
        if (!s) return;
        s.empty = id === "empty"; s.w = loaded(s.empty); s.w.t = 0; s.at = {};
        var ta = lead - OFF, tb = ta + (s.empty ? 0 : off);
        s.at[ta] = function (w) { clr(w, pA); if (tb === ta) clr(w, pB); };
        if (tb !== ta) s.at[tb] = function (w) { clr(w, pB); };
        s.end = lead + (s.empty ? 110 : 70);
      }
    }));
    var fig = document.getElementById("sc-slack");
    if (fig && sc) {
      var row = document.createElement("div"); row.className = "sc-in sc-rg";
      row.innerHTML = '<label><span>right clear: <b>2 ticks late</b></span><input type="range" min="-2" max="2" step="1" value="2" aria-label="clear timing, ticks early or late"></label>';
      fig.insertBefore(row, fig.querySelector(".sc-in"));
      inp = row.querySelector("input"); out = row.querySelector("b");
      inp.addEventListener("input", function () { off = +inp.value; out.textContent = words(off); });
    }
  })();

  /* ================= fig 19: the ladder (a diagram) ================= */
  Deep.scene("sc-ladder", { ticks: 5, tps: 1.6, pause: 400 });
  Deep.scene("sc-rule", { ticks: 2, tps: 1 });

  /* ================= one figure at a time =================
     Two short figures often share the screen (figs 3 and 4, 6 and 7, 16 and 17). Arriving figures queue in reading
     order: the highest one on screen plays first, and the next starts a beat after it ends or scrolls away, so the
     reader never reaches a figure that has already played half its steps. Replay, the stepper and the inputs always act
     at once. (Proposed for deep.js in shared-requests/emergence.md; delete this block if deep.js takes it.) */
  (function () {
    if (Deep.reduce) return;
    var user = null, lastBusy = -1e9, BEAT = 600;
    function seen(S) {                                   // the share of the stage on screen, against what could fit
      var r = S.stage.getBoundingClientRect(), h = window.innerHeight, v = Math.min(r.bottom, h) - Math.max(r.top, 0);
      return v <= 0 ? 0 : v / Math.max(1, Math.min(r.height, h));
    }
    function busy() { return Deep.scenes.some(function (o) { return o.id !== "sc-hero" && o.mode === "auto" && o.visible && seen(o) >= 0.5; }); }
    function kick() {
      if (busy()) { lastBusy = Date.now(); return; }
      if (Date.now() - lastBusy < BEAT) return;
      var c = Deep.scenes.filter(function (S) { return S.waiting && S.visible && seen(S) >= 0.5; });
      if (!c.length) return;
      c.sort(function (a, b) { return a.stage.getBoundingClientRect().top - b.stage.getBoundingClientRect().top; });
      c[0].waiting = false; c[0].play0();
    }
    Deep.scenes.forEach(function (S) {
      if (S.id === "sc-hero") return;
      S.play0 = S.play;
      S.fig.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("button"); if (!b) return;
        S.waiting = false; if (b.classList.contains("replay")) user = S;
      }, true);
      S.fig.addEventListener("input", function () { S.waiting = false; }, true);
      S.play = function () {
        if (user === S) { user = null; S.waiting = false; return S.play0(); }
        S.waiting = true; setTimeout(kick, 0);         // after every arrival in this batch has queued
      };
    });
    setInterval(kick, 200);
  })();
})();
