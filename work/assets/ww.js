/* ww.js: an exact Wireworld engine for the deep-dive scenes.
   States use the same numbers as emergence/cpu/ww_cells.py, so its coordinates port unchanged:
   0 empty, 1 electron head, 2 electron tail, 3 wire (conductor).
   The rule (README.md#L28): head becomes tail, tail becomes wire, and a wire becomes a head
   when exactly 1 or 2 of its 8 neighbours are heads. Nothing outside the grid counts. */
(function (root) {
  "use strict";
  var EMPTY = 0, HEAD = 1, TAIL = 2, WIRE = 3;

  /* the diode from ww_cells.py#L122-L123: enters at (0,0) heading east, leaves at (14,0) */
  var DIODE_H = [[0,0],[1,0],[2,0],[3,0],[4,0],[5,-1],[5,0],[5,1],[6,-1],[6,1],
                 [7,-1],[7,0],[8,-1],[9,-1],[10,0],[11,0],[12,0],[13,0],[14,0]];

  /* pattern transforms: a quarter turn is clockwise on screen (y grows downward) */
  function rot(cells, quarters) {
    var q = ((quarters % 4) + 4) % 4, out = cells.map(function (c) { return [c[0], c[1]]; });
    for (var k = 0; k < q; k++) out = out.map(function (c) { return [-c[1], c[0]]; });
    return out;
  }
  function flipX(cells) { return cells.map(function (c) { return [-c[0], c[1]]; }); }
  function flipY(cells) { return cells.map(function (c) { return [c[0], -c[1]]; }); }

  /* one world: a fixed W x H grid, double-buffered, with a tick counter */
  function World(w, h) {
    this.w = w; this.h = h; this.t = 0;
    this.g = new Uint8Array(w * h); this.n = new Uint8Array(w * h);
  }
  var P = World.prototype;
  P.ok = function (x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; };
  P.get = function (x, y) { return this.ok(x, y) ? this.g[y * this.w + x] : EMPTY; };
  P.set = function (x, y, s) { if (this.ok(x, y)) this.g[y * this.w + x] = s; return this; };
  P.wire = function (x, y) { return this.set(x, y, WIRE); };
  P.hline = function (x0, x1, y) { for (var x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.wire(x, y); return this; };
  P.vline = function (y0, y1, x) { for (var y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.wire(x, y); return this; };
  /* a polyline through [x,y] points; each leg is horizontal, vertical or 45 degrees */
  P.path = function (pts) {
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
      var n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      for (var k = 0; k <= n; k++) this.wire(a[0] + dx * k, a[1] + dy * k);
    }
    if (pts.length === 1) this.wire(pts[0][0], pts[0][1]);
    return this;
  };
  /* a rectangular loop with corners (x0,y0) and (x1,y1): the clock and the memory loop are this shape */
  P.loop = function (x0, y0, x1, y1) { return this.hline(x0, x1, y0).hline(x0, x1, y1).vline(y0, y1, x0).vline(y0, y1, x1); };
  /* stamp a pattern of [dx,dy] cells at (x,y), optionally turned and mirrored first */
  P.stamp = function (cells, x, y, o) {
    o = o || {};
    var c = cells;
    if (o.flipX) c = flipX(c);
    if (o.flipY) c = flipY(c);
    if (o.rot) c = rot(c, o.rot);
    for (var i = 0; i < c.length; i++) this.set(x + c[i][0], y + c[i][1], o.state || WIRE);
    return this;
  };
  /* parse a picture: '.' or ' ' empty, '#' wire, 'H' head, 't' tail; rows are strings */
  P.draw = function (rows, x, y) {
    for (var r = 0; r < rows.length; r++) for (var c = 0; c < rows[r].length; c++) {
      var ch = rows[r][c], s = ch === "#" ? WIRE : ch === "H" ? HEAD : ch === "t" ? TAIL : -1;
      if (s >= 0) this.set(x + c, y + r, s);
    }
    return this;
  };
  /* an electron at (x,y) moving in direction [dx,dy]: head there, tail one cell behind */
  P.electron = function (x, y, dir) {
    this.set(x, y, HEAD);
    this.set(x - dir[0], y - dir[1], TAIL);
    return this;
  };
  /* a lone head on a wire cell, the dead-end launch ww_cells.py uses (Sim.inject); returns whether it took */
  P.inject = function (x, y) { if (this.get(x, y) !== WIRE) return false; this.set(x, y, HEAD); return true; };
  /* one tick of the exact rule */
  P.step = function () {
    var w = this.w, h = this.h, g = this.g, n = this.n;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x, s = g[i];
        if (s === HEAD) n[i] = TAIL;
        else if (s === TAIL) n[i] = WIRE;
        else if (s === WIRE) {
          var c = 0;
          for (var dy = -1; dy <= 1; dy++) {
            var yy = y + dy; if (yy < 0 || yy >= h) continue;
            var row = yy * w;
            for (var dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              var xx = x + dx; if (xx >= 0 && xx < w && g[row + xx] === HEAD) c++;
            }
          }
          n[i] = (c === 1 || c === 2) ? HEAD : WIRE;
        } else n[i] = EMPTY;
      }
    }
    this.g = n; this.n = g; this.t++;
    return this;
  };
  P.run = function (k) { for (var i = 0; i < k; i++) this.step(); return this; };
  P.snapshot = function () { return this.g.slice(); };
  P.load = function (snap, t) { this.g.set(snap); if (t !== undefined) this.t = t; return this; };
  P.clone = function () { var c = new World(this.w, this.h); c.g.set(this.g); c.t = this.t; return c; };
  P.count = function (s) { var k = 0, g = this.g; for (var i = 0; i < g.length; i++) if (g[i] === s) k++; return k; };
  P.electrons = function () { return this.count(HEAD); };
  P.isHead = function (x, y) { return this.get(x, y) === HEAD; };

  /* record every frame: frames[t] is the grid after t ticks (frames[0] is the start).
     at is an optional map {tick: function (world)} run just before that tick's step, for injections. */
  function record(world, ticks, at) {
    var w = world.clone(), frames = [w.snapshot()];
    for (var t = 0; t < ticks; t++) {
      if (at && at[t]) at[t](w);
      w.step(); frames.push(w.snapshot());
    }
    return frames;
  }

  /* the palette: token names for each state; deep.js reads the tokens from :root.
     head and tail are the case studies' hero colours, so a reader sees the same electron on both pages. */
  var PALETTE = { 0: "void", 1: "signal", 2: "signal-2", 3: "copper" };

  /* draw a grid at an integer pitch. paint(x, y, token) fills one cell; empty cells are skipped
     (the scene clears to --void first). o.only limits drawing to cells that are not empty in o.only. */
  function draw(paint, g, w, h, o) {
    o = o || {};
    var pal = o.palette || PALETTE, ox = o.ox || 0, oy = o.oy || 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var s = g[y * w + x];
      if (s) paint(x + ox, y + oy, pal[s]);
    }
  }

  /* self-test: the rule's own claims, run in this engine.
     1. an electron moves one cell per tick along a straight wire;
     2. the repo's diode passes an electron forward and stops one going backward (25 ticks wire to wire);
     3. three heads around one wire cell leave it dark, one or two light it. */
  function selfTest() {
    var checks = [];
    var a = new World(20, 3).hline(0, 19, 1).electron(2, 1, [1, 0]).run(10);
    checks.push(["one cell per tick", a.isHead(12, 1) && a.electrons() === 1]);
    function diode(forward) {
      var w = new World(28, 7);
      w.stamp(DIODE_H, 6, 3).hline(0, 5, 3).hline(21, 26, 3);
      if (forward) w.electron(1, 3, [1, 0]); else w.electron(25, 3, [-1, 0]);
      var px = forward ? 26 : 1, hit = -1;
      for (var t = 1; t <= 60; t++) { w.step(); if (hit < 0 && w.isHead(px, 3)) hit = t; }
      return hit;
    }
    checks.push(["diode forward", diode(true) === 25]);
    checks.push(["diode reverse", diode(false) === -1]);
    function fires(k) {
      var w = new World(3, 3).wire(1, 1), spots = [[0, 0], [2, 0], [0, 2]];
      for (var i = 0; i < k; i++) w.set(spots[i][0], spots[i][1], HEAD);
      return w.step().isHead(1, 1);
    }
    checks.push(["fires on 1 or 2, not 3", fires(1) && fires(2) && !fires(3) && !fires(0)]);
    var ok = checks.every(function (c) { return c[1]; });
    return { ok: ok, checks: checks };
  }

  root.WW = {
    EMPTY: EMPTY, HEAD: HEAD, TAIL: TAIL, WIRE: WIRE,
    World: World, world: function (w, h) { return new World(w, h); },
    DIODE_H: DIODE_H, rot: rot, flipX: flipX, flipY: flipY,
    record: record, draw: draw, PALETTE: PALETTE, selfTest: selfTest
  };
})(window);
