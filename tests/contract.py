#!/usr/bin/env python3
"""The page's scroll and design contract, measured in headless Chromium.

    .venv/bin/python tests/contract.py                    # every assertion
    .venv/bin/python tests/contract.py --fast             # the quick subset, under a minute, for use between edits
    .venv/bin/python tests/contract.py --only notches     # one (comma-separate for several)
    .venv/bin/python tests/contract.py --list             # names, viewports, what each measures
    .venv/bin/python tests/contract.py --root DIR         # serve DIR instead of the repo root
    .venv/bin/python tests/contract.py --json out.json    # also dump every raw measurement

Serves the site over http.server on a free port and drives the real page.
Prints one line per assertion and viewport, PASS or FAIL with the measured
value, and exits non-zero on any FAIL. The page hooks it reads are specified
in tests/HOOKS.md; a missing hook is a FAIL, never a skip.

Every number below comes from the page as rendered: pixels read back from the
canvas, rectangles from layout, calls caught by wrappers installed before the
page's own script runs. The hooks name things (which card, which station);
they are never trusted to grade themselves.
"""
import argparse
import functools
import http.server
import json
import math
import socket
import sys
import threading
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The token table. A computed colour or canvas fill outside it is a defect.
TOKENS = {
    "void": "#0a0b14", "ant": "#ffffff", "trail": "#ff3d81", "trail-2": "#8c2a52",
    "trail-3": "#4a1a34", "signal": "#8fe6ff", "signal-2": "#2f6f86", "ink": "#e8e6f0",
    "copper": "#3a3550", "residue": "#1f1d2c", "body": "#b9b6cc", "muted": "#8a87a0",
    "rule": "#1d1b2a",
}
CONTRAST = {"copper": "#5a5672", "residue": "#2a2638", "muted": "#a3a0b8"}   # @media (prefers-contrast: more)
TRAIL_FAMILY = ("trail", "trail-2", "trail-3")
DOM_SIZES = {72, 40, 15, 13, 11, 44, 30}
CANVAS_SIZES = {13, 11}
NOTCH_TARGET = {"desktop": 140, "phone": 140}   # all the work sits before the résumé
# Native figure layers: DOM, SVG or a second canvas drawn over a station's cell box (tests/HOOKS.md).
# A layer's root carries data-native="<station id>"; the three module roots are recognised by class as well.
NATIVE_ROOTS = {"[data-native]": None, ".ff": "freeflow", ".fk": "kronos", ".cx-fig": "custos"}
NATIVE_SEL = ", ".join(NATIVE_ROOTS)
EXPECT = {                      # self-checks whose answer is known outside the page
    "nand": [1, 1, 1, 0],       # NAND truth table, cases 00 01 10 11, read from the output cell
    "em": [14, 7, 2, 0],        # mismatched blocks after EM passes 1..4
    "kronos-dd": -17.9,         # max drawdown of the 54-quarter series, percent, to the basis point
}

VIEWPORTS = {
    "desktop":     dict(viewport={"width": 1440, "height": 900}, device_scale_factor=2),
    "phone":       dict(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True),
    "phone-small": dict(viewport={"width": 360, "height": 740}, device_scale_factor=2, is_mobile=True, has_touch=True),
    "phone-small-1x": dict(viewport={"width": 360, "height": 740}, device_scale_factor=1, is_mobile=True, has_touch=True),
    "desktop-125": dict(viewport={"width": 1536, "height": 864}, device_scale_factor=1.25),
    "desktop-1280": dict(viewport={"width": 1280, "height": 800}, device_scale_factor=2),
    "desktop-1024": dict(viewport={"width": 1024, "height": 768}, device_scale_factor=2),
    "phone-se":    dict(viewport={"width": 375, "height": 667}, device_scale_factor=2, is_mobile=True, has_touch=True),
    "phone-640":   dict(viewport={"width": 360, "height": 640}, device_scale_factor=2, is_mobile=True, has_touch=True),
    # phones on their side: the words in a column beside the art
    "land":        dict(viewport={"width": 844, "height": 390}, device_scale_factor=3, is_mobile=True, has_touch=True),
    "land-small":  dict(viewport={"width": 740, "height": 360}, device_scale_factor=2, is_mobile=True, has_touch=True),
}
LANDS = ("land", "land-small")
PHONES = ("phone", "phone-small")


def hex_rgb(h):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16))


TOK_RGB = {k: hex_rgb(v) for k, v in TOKENS.items()}
CON_RGB = {k: hex_rgb(v) for k, v in CONTRAST.items()}
RGB_NAME = {v: k for k, v in TOK_RGB.items()}


def langton_lock(n=26000, period=104):
    """The first step from which every `period` steps move the ant by one constant
    offset, computed here from the rule alone so the page's own LOCK is checked
    against something it did not produce. Same convention as stepF: start facing
    up, dark cell turns right, lit cell turns left, flip, step."""
    dx, dy = (0, 1, 0, -1), (-1, 0, 1, 0)
    lit, x, y, d = set(), 0, 0, 0
    pos = [(0, 0)]
    for _ in range(n):
        if (x, y) in lit:
            d = (d + 3) & 3
            lit.discard((x, y))
        else:
            d = (d + 1) & 3
            lit.add((x, y))
        x += dx[d]
        y += dy[d]
        pos.append((x, y))
    off = (pos[n][0] - pos[n - period][0], pos[n][1] - pos[n - period][1])
    t = n - period
    while t > 0 and (pos[t - 1 + period][0] - pos[t - 1][0], pos[t - 1 + period][1] - pos[t - 1][1]) == off:
        t -= 1
    return t, off


# Installed before the page's own script. Wraps what the contract forbids or
# measures, and keeps the originals so the suite's own scrolls never count.
INIT_JS = r"""
(() => {
  if (window.__ct) return;
  const MODE = "%MODE%", NATIVE = "%NATIVE%", NATIVE_ID = %NATIVE_ID%;
  const ct = window.__ct = { mode: MODE, listeners: [], scrollCalls: [], rafMs: [], handlerMs: [], perfOn: false };
  const O = ct.orig = {
    ael: EventTarget.prototype.addEventListener, rel: EventTarget.prototype.removeEventListener,
    scrollTo: window.scrollTo, scrollBy: window.scrollBy, scroll: window.scroll, raf: window.requestAnimationFrame,
  };
  ct.scrollTo = (x, y) => O.scrollTo.call(window, x, y);
  ct.desc = t => {
    if (t === window) return 'window'; if (t === document) return 'document';
    if (!t || t.nodeType !== 1) return String(t);
    let s = t.tagName.toLowerCase(); if (t.id) s += '#' + t.id;
    const c = typeof t.className === 'string' ? t.className.trim() : '';
    if (c) s += '.' + c.split(/\s+/).slice(0, 2).join('.');
    return s;
  };
  const where = () => ((new Error()).stack || '').split('\n').slice(3, 4).join('').trim().slice(0, 140);
  const BLOCK = /^(wheel|mousewheel|DOMMouseScroll|touchstart|touchmove|touchend|touchcancel|keydown|keyup|keypress)$/;
  const wrapped = new WeakMap();
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (BLOCK.test(type)) ct.listeners.push({ type, on: ct.desc(this), passive: !!(opts && typeof opts === 'object' && opts.passive), where: where() });
    if (MODE === 'perf' && typeof fn === 'function' && /^(scroll|resize|pointerdown|click)$/.test(type)) {
      let w = wrapped.get(fn);
      if (!w) {
        w = function (e) { if (!ct.perfOn) return fn.call(this, e); const a = performance.now();
          try { return fn.call(this, e); } finally { ct.handlerMs.push([a, performance.now() - a]); } };
        wrapped.set(fn, w);
      }
      return O.ael.call(this, type, w, opts);
    }
    return O.ael.call(this, type, fn, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) { return O.rel.call(this, type, wrapped.get(fn) || fn, opts); };
  // window.onwheel = f is a listener too. Window keeps its handler attributes on the instance.
  const ON = ['onwheel', 'onmousewheel', 'ontouchstart', 'ontouchmove', 'ontouchend', 'ontouchcancel', 'onkeydown', 'onkeyup', 'onkeypress'];
  for (const P of [window, Window.prototype, Document.prototype, HTMLElement.prototype, SVGElement.prototype]) {
    for (const k of ON) {
      const d = Object.getOwnPropertyDescriptor(P, k);
      if (!d || !d.set || !d.configurable) continue;
      Object.defineProperty(P, k, { configurable: true, enumerable: d.enumerable, get: d.get,
        set: function (v) { if (v) ct.listeners.push({ type: k.slice(2), on: ct.desc(this), passive: false, where: 'property ' + k }); return d.set.call(this, v); } });
    }
  }
  // page-initiated scrolls: only a click may move the page, and a resize may put the visitor back where they were
  const noteScroll = name => { const e = window.event; if (e && e.type === 'click') return;
    if (e && e.type === 'resize') { ct.resizeScrolls = (ct.resizeScrolls || 0) + 1; return; }
    ct.scrollCalls.push({ name, during: e ? e.type : null, where: where() }); };
  for (const k of ['scrollTo', 'scrollBy', 'scroll']) { const f = O[k]; window[k] = function () { noteScroll('window.' + k); return f.apply(window, arguments); }; }
  const page = el => el === document.scrollingElement || el === document.documentElement || el === document.body;
  for (const k of ['scrollTo', 'scrollBy', 'scroll']) { const f = Element.prototype[k];
    Element.prototype[k] = function () { if (page(this)) noteScroll('element.' + k); return f.apply(this, arguments); }; }
  { const f = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = function () { noteScroll('scrollIntoView ' + ct.desc(this)); return f.apply(this, arguments); }; }
  for (const k of ['scrollTop', 'scrollLeft']) { const d = Object.getOwnPropertyDescriptor(Element.prototype, k);
    Object.defineProperty(Element.prototype, k, { configurable: true, get: d.get, set: function (v) { if (page(this)) noteScroll(k + '='); return d.set.call(this, v); } }); }

  if (MODE === 'perf') {
    window.requestAnimationFrame = function (cb) {
      return O.raf.call(window, function (ts) { if (!ct.perfOn) return cb(ts); const a = performance.now();
        try { return cb(ts); } finally { ct.rafMs.push([ts, a, performance.now() - a]); } });
    };
  }

  if (MODE === 'full') {
    const C2 = CanvasRenderingContext2D.prototype;
    const cv = ct.cv = { fill: {}, stroke: {}, stops: {}, put: {}, glow: [], filter: [], draws: 0, drawBad: [], scales: {},
      rects: 0, rectBad: [], text: {}, ntext: {} };
    const bump = (m, k, ex) => { if (!m[k]) m[k] = { n: 0, ex: ex || '' }; m[k].n++; };
    const isInt = v => Math.abs(v - Math.round(v)) < 1e-6;
    for (const [prop, bucket] of [['fillStyle', 'fill'], ['strokeStyle', 'stroke']]) {
      const d = Object.getOwnPropertyDescriptor(C2, prop);
      Object.defineProperty(C2, prop, { configurable: true, get: d.get, set: function (v) { d.set.call(this, v); if (this.canvas && this.canvas.__ctOwn) return;
        const n = d.get.call(this); bump(cv[bucket], typeof n === 'string' ? n : (n && n.constructor ? n.constructor.name : String(n))); } });
    }
    { const f = CanvasGradient.prototype.addColorStop;
      CanvasGradient.prototype.addColorStop = function (o, c) { bump(cv.stops, String(c)); return f.call(this, o, c); }; }
    { const d = Object.getOwnPropertyDescriptor(C2, 'shadowBlur');
      Object.defineProperty(C2, 'shadowBlur', { configurable: true, get: d.get, set: function (v) { if (+v > 0) cv.glow.push(+v); return d.set.call(this, v); } }); }
    { const d = Object.getOwnPropertyDescriptor(C2, 'filter');
      if (d) Object.defineProperty(C2, 'filter', { configurable: true, get: d.get, set: function (v) { if (v && v !== 'none') cv.filter.push(String(v)); return d.set.call(this, v); } }); }
    // every ImageData that reaches a canvas: its distinct packed values
    { const f = C2.putImageData;
      C2.putImageData = function (img, dx, dy, x0, y0, w, h) {
        const u = new Uint32Array(img.data.buffer, img.data.byteOffset, img.data.byteLength >> 2), W = img.width;
        let X0 = 0, Y0 = 0, X1 = W, Y1 = img.height;
        if (arguments.length >= 7) { X0 = Math.max(0, x0 | 0); Y0 = Math.max(0, y0 | 0); X1 = Math.min(W, X0 + (w | 0)); Y1 = Math.min(img.height, Y0 + (h | 0)); }
        let last = -1;
        for (let y = Y0; y < Y1; y++) for (let i = y * W + X0, e = y * W + X1; i < e; i++) { const v = u[i]; if (v !== last) { last = v; cv.put[v] = 1; } }
        return f.apply(this, arguments);
      }; }
    // every blit onto an on-screen canvas: device position and scale
    { const f = C2.drawImage;
      C2.drawImage = function (img, a, b, c, d, e, g, h, k) {
        const cvs = this.canvas;
        if (cvs && cvs.isConnected) {
          const iw = img.width || img.videoWidth || 0, ih = img.height || img.videoHeight || 0;
          let sw = iw, sh = ih, dx, dy, dw = iw, dh = ih, n = arguments.length;
          if (n === 3) { dx = a; dy = b; } else if (n === 5) { dx = a; dy = b; dw = c; dh = d; } else { sw = c; sh = d; dx = e; dy = g; dw = h; dh = k; }
          const T = this.getTransform(), X = T.a * dx + T.e, Y = T.d * dy + T.f, sx = T.a * dw / sw, sy = T.d * dh / sh;
          cv.draws++;
          const key = isInt(sx) && isInt(sy) && Math.abs(sx - sy) < 1e-9 ? String(Math.round(sx)) : sx.toFixed(3) + 'x' + sy.toFixed(3);
          cv.scales[key] = (cv.scales[key] || 0) + 1;
          const bad = !(sw > 0 && sh > 0) ? 'empty source' : !isInt(X) || !isInt(Y) ? 'offset ' + X.toFixed(3) + ',' + Y.toFixed(3)
            : !(isInt(sx) && isInt(sy) && Math.abs(sx - sy) < 1e-9 && sx >= 1) ? 'scale ' + sx.toFixed(3) + 'x' + sy.toFixed(3)
            : this.imageSmoothingEnabled && sx !== 1 ? 'smoothing on at ' + sx : null;
          if (bad && cv.drawBad.length < 12) cv.drawBad.push(bad + ' on ' + ct.desc(cvs) + ' from ' + (img.tagName ? ct.desc(img) : 'offscreen ' + iw + 'x' + ih));
          else if (bad) cv.drawBad.push(null);
        }
        return f.apply(this, arguments);
      }; }
    // cell-sized rectangles on an on-screen canvas must sit on whole device pixels
    { const f = C2.fillRect;
      C2.fillRect = function (x, y, w, h) {
        if (this.canvas && this.canvas.isConnected) {
          const T = this.getTransform(), X = T.a * x + T.e, Y = T.d * y + T.f, Wd = T.a * w, Hd = T.d * h;
          cv.rects++;
          if (!(isInt(X) && isInt(Y) && isInt(Wd) && isInt(Hd))) { if (cv.rectBad.length < 12) cv.rectBad.push([X, Y, Wd, Hd].map(v => +v.toFixed(3)).join(',') + ' on ' + ct.desc(this.canvas)); else cv.rectBad.push(null); }
        }
        return f.apply(this, arguments);
      }; }
    // a clear of the whole canvas starts a frame: the text boxes of the last frame go
    { const f = C2.clearRect;
      C2.clearRect = function (x, y, w, h) {
        const cvs = this.canvas, T = this.getTransform();
        if (cvs && Math.abs(T.a * w * T.d * h) >= 0.9 * cvs.width * cvs.height) cvs.__ctText = [];
        return f.apply(this, arguments);
      }; }
    // canvas text: size in CSS px as it lands on screen, and its device box (text is not cells)
    { const f = C2.fillText;
      C2.fillText = function (t, x, y) {
        const cvs = this.canvas;
        if (cvs && cvs.isConnected && cvs.clientWidth) {
          const m = /(\d+(?:\.\d+)?)px/.exec(this.font || ''), T = this.getTransform();
          // a native layer's canvas holds the layer's own type: DOM sizes apply there, not the art canvas's 11/13
          if (m) { const css = +m[1] * Math.abs(T.a) * cvs.clientWidth / cvs.width; bump(cvs.closest(NATIVE) ? cv.ntext : cv.text, css.toFixed(2), String(t).slice(0, 40)); }
          const mm = this.measureText(String(t)), B = cvs.__ctText || (cvs.__ctText = []);
          if (B.length < 400) B.push([T.a * (x - mm.actualBoundingBoxLeft) + T.e - 1, T.d * (y - mm.actualBoundingBoxAscent) + T.f - 1,
                                      T.a * (x + mm.actualBoundingBoxRight) + T.e + 1, T.d * (y + mm.actualBoundingBoxDescent) + T.f + 1]);
        }
        return f.apply(this, arguments);
      }; }
  }

  // ---- read-side helpers the suite calls after load ----
  ct.W = () => window.__walk || null;
  ct.has = k => { const W = ct.W(); return !!W && W[k] !== undefined && W[k] !== null; };
  ct.get = (k, ...a) => { const W = ct.W(); if (!W || W[k] === undefined || W[k] === null) return undefined; const f = W[k]; return typeof f === 'function' ? f.apply(W, a) : f; };
  ct.raf = () => new Promise(r => O.raf.call(window, r));
  ct.cards = () => {
    const c = ct.get('cards');
    if (Array.isArray(c)) return { hook: true, list: c.filter(x => x && x.el).map(x => ({ id: x.id, el: x.el })) };
    return { hook: false, list: [...document.querySelectorAll('.hero, .card')].map(el => ({ id: el.classList.contains('hero') ? 'hero' : (el.id || el.dataset.chapter || '?'), el })) };
  };
  ct.zoneCard = (z0, z1) => {
    const C = ct.cards(); let best = null, bo = 0;
    for (const c of C.list) {
      const r = c.el.getBoundingClientRect(), cs = getComputedStyle(c.el);
      if (!r.height || cs.visibility !== 'visible' || +cs.opacity === 0) continue;
      const o = Math.min(r.bottom, z1) - Math.max(r.top, z0);
      if (o > bo) { bo = o; best = c.id; }
    }
    return { id: bo >= 24 ? best : null, overlap: Math.round(bo), hook: C.hook, n: C.list.length };
  };
  // During a hold the card in the reading zone is the one stuck at its sticky top, not the one with the most
  // overlap: the next card rising from below can overlap more while the held card is still the one being read.
  // A card that scrolls natively (position not sticky, e.g. too tall for the phone text band) is never stuck;
  // then the overlap rule above decides and `how` says so.
  ct.stuckCard = (z0, z1) => {
    const C = ct.cards(), stuck = [];
    for (const c of C.list) {
      const r = c.el.getBoundingClientRect(), cs = getComputedStyle(c.el);
      if (!r.height || cs.visibility !== 'visible' || +cs.opacity === 0 || cs.position !== 'sticky') continue;
      const top = parseFloat(cs.top);
      if (Number.isFinite(top) && Math.abs(r.top - top) <= 1 && Math.min(r.bottom, z1) - Math.max(r.top, z0) >= 24) stuck.push(c.id);
    }
    if (stuck.length === 1) return { id: stuck[0], how: 'stuck' };
    const z = ct.zoneCard(z0, z1);
    return { id: z.id, how: stuck.length ? 'overlap (' + stuck.length + ' stuck: ' + stuck.join(',') + ')' : 'overlap (none stuck)' };
  };
  // native figure layers on screen now: outermost roots, their own box and the box of everything they draw
  ct.natives = () => {
    const out = [];
    for (const e of document.querySelectorAll(NATIVE)) {
      if (e.parentElement && e.parentElement.closest(NATIVE)) continue;
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      if (!e.getClientRects().length || cs.visibility !== 'visible' || +cs.opacity === 0 || !r.width || !r.height) continue;
      let id = e.getAttribute('data-native');
      if (!id) for (const k in NATIVE_ID) if (NATIVE_ID[k] && e.matches(k)) { id = NATIVE_ID[k]; break; }
      const ext = [r.left, r.top, r.right, r.bottom];
      for (const d of e.querySelectorAll('*')) {
        if (!d.getClientRects().length) continue;
        const ds = getComputedStyle(d); if (ds.visibility !== 'visible' || ds.display === 'none') continue;
        const b = d.getBoundingClientRect(); if (!b.width && !b.height) continue;
        ext[0] = Math.min(ext[0], b.left); ext[1] = Math.min(ext[1], b.top); ext[2] = Math.max(ext[2], b.right); ext[3] = Math.max(ext[3], b.bottom);
      }
      out.push({ id: id || '?', box: [r.left, r.top, r.right, r.bottom], ext, desc: ct.desc(e) });
    }
    return out;
  };
  // The world origin, found from cellTok itself: it returns -1 outside the world, so the first column and row
  // where it stops doing so, searched from a cell the walk visits, is world cell (X0, Y0) of the bitmap view() draws.
  ct.origin = () => {
    if (ct._origin) return ct._origin;
    const W = window.__walk; let p = null;
    try { p = W.walkPos(0); } catch (e) { return null; }
    if (!p || W.cellTok(p[0], p[1]) === -1) return null;
    const edge = (f) => { let lo = -(1 << 24), hi = 0; if (f(lo)) return null;
      while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (f(m)) hi = m; else lo = m; } return hi; };
    const dx = edge(d => W.cellTok(p[0] + d, p[1]) !== -1), dy = edge(d => W.cellTok(p[0], p[1] + d) !== -1);
    if (dx === null || dy === null) return null;
    return (ct._origin = [p[0] + dx, p[1] + dy]);
  };
  // Pink census over WORLD CELLS (cellTok / cellAt), never canvas pixels: the halo tints empty cells and labels
  // cover lit ones, and neither is a cell. A world cell counts when its drawn cell is on screen showing that
  // cell's token (so cells under the strip, the caption row, labels or outside the clip are not seen and not
  // counted). Ant output is what cellAt reports lit on the main ant's grid; every other lit cell is a figure,
  // a dated trail or a visitor.
  ct.cellCensus = (names) => {
    const W = window.__walk;
    for (const k of ['cellTok', 'cellAt', 'view', 'walkPos']) if (!W || typeof W[k] !== 'function') return { missing: '__walk.' + k + '() is absent' };
    const v = W.view(); if (!v || !(v.pp >= 1) || typeof v.Ox !== 'number' || typeof v.Oy !== 'number') return { missing: '__walk.view() has no pp/Ox/Oy' };
    const o = ct.origin(); if (!o) return { missing: 'world origin: cellTok never returns -1 at the world edge' };
    const c = ct.artCanvas(); if (!c) return { missing: 'no art canvas' };
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const key = names.map(n => n[1]), pp = v.pp, k = v.k || 1, h = Math.floor(pp / 2), T = names.length;
    const by = new Array(T + 1).fill(0), ant = new Array(T + 1).fill(0);
    let lit = 0, hidden = 0, drawn = 0;
    const i0 = Math.max(0, Math.ceil((0 - v.Ox - h) / pp)), j0 = Math.max(0, Math.ceil((0 - v.Oy - h) / pp));
    for (let j = j0; v.Oy + j * pp + h < c.height; j++) {
      const y = v.Oy + j * pp + h;
      for (let i = i0; v.Ox + i * pp + h < c.width; i++) {
        const x = v.Ox + i * pp + h, q = (y * c.width + x) * 4;
        const px = d[q + 3] === 255 ? (d[q] << 16) | (d[q + 1] << 8) | d[q + 2] : -1;
        const cells = [];
        let shows = false, out = 0;
        for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
          const X = o[0] + i * k + a, Y = o[1] + j * k + b, t = W.cellTok(X, Y);
          if (t === -1) { out++; continue; }
          if (t >= 2 && t <= T) { cells.push([X, Y, t]); if (key[t - 1] === px) shows = true; }
        }
        if (out === k * k) continue;
        drawn++;
        if (!cells.length) continue;
        if (!shows) { hidden += cells.length; continue; }
        for (const [X, Y, t] of cells) { lit++; by[t]++; const m = W.cellAt(X, Y); if (m && m.lit) ant[t]++; }
      }
    }
    const tokens = {}, antTok = {};
    for (let t = 1; t <= T; t++) { if (by[t]) tokens[names[t - 1][0]] = by[t]; if (ant[t]) antTok[names[t - 1][0]] = ant[t]; }
    return { lit, hidden, drawn, k, pp, origin: o, tokens, ant: antTok, antLit: ant.reduce((s, n) => s + n, 0) };
  };
  ct.lastLine = () => {
    const h = ct.get('resumeLast'); if (h && h.nodeType === 1) return { el: h, hook: true };
    const r = document.querySelector('#resume'); if (!r) return { el: null, hook: false };
    const all = [...r.querySelectorAll('*')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()));
    return { el: all[all.length - 1] || null, hook: false };
  };
  ct.lineBottom = el => { const rg = document.createRange(); rg.selectNodeContents(el); const rs = rg.getClientRects();
    return rs.length ? rs[rs.length - 1].bottom : el.getBoundingClientRect().bottom; };
  ct.artCanvas = () => {
    const c = ct.get('canvas'); if (c && c.getContext) return c;
    const w = document.querySelector('canvas#world'); if (w) return w;
    let best = null, ba = 0;
    for (const e of document.querySelectorAll('canvas')) { const r = e.getBoundingClientRect(); if (r.width * r.height > ba) { ba = r.width * r.height; best = e; } }
    return best;
  };
  // pixel census of the art canvas, classified against the token table
  ct.census = (tok) => {
    const c = ct.artCanvas(); if (!c) return null;
    const x = c.getContext('2d'); if (!x) return null;
    const d = x.getImageData(0, 0, c.width, c.height).data, names = Object.keys(tok);
    const key = names.map(n => (tok[n][0] << 16) | (tok[n][1] << 8) | tok[n][2]);
    const by = new Map(); let painted = 0, lit = 0, white = [1e9, 1e9, -1, -1, 0];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue; painted++;
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (k === key[0]) continue;      // void is ground, not a lit cell
      lit++; by.set(k, (by.get(k) || 0) + 1);
      if (k === 0xffffff) { const p = i >> 2, px = p % c.width, py = (p / c.width) | 0;
        if (px < white[0]) white[0] = px; if (py < white[1]) white[1] = py; if (px > white[2]) white[2] = px; if (py > white[3]) white[3] = py; white[4]++; }
    }
    const tally = (m) => { const tokens = {}; let other = 0; const others = [];
      for (const [k, n] of m) { const j = key.indexOf(k); if (j >= 0) tokens[names[j]] = n; else { other += n; others.push([k, n]); } }
      others.sort((a, b) => b[1] - a[1]);
      return { tokens, other, topOther: others.slice(0, 4).map(([k, n]) => ['#' + k.toString(16).padStart(6, '0'), n]) }; };
    // the spec counts lit CELLS: one sample at each cell's centre, so canvas text is not weighed as cells
    let cells = null; const v = (() => { try { return __ct.get('view'); } catch (e) { return null; } })();
    if (v && typeof v.Ox === 'number' && typeof v.Oy === 'number' && v.pp >= 1) {
      const pp = v.pp, h = Math.floor(pp / 2), cm = new Map(), TB = c.__ctText || []; let cl = 0, txt = 0;
      const inText = (x, y) => { for (const b of TB) if (x >= b[0] && x < b[2] && y >= b[1] && y < b[3]) return true; return false; };
      const i0 = Math.ceil((0 - v.Ox - h) / pp), j0 = Math.ceil((0 - v.Oy - h) / pp);
      for (let j = j0; v.Oy + j * pp + h < c.height; j++) { const y = v.Oy + j * pp + h;
        for (let i = i0; v.Ox + i * pp + h < c.width; i++) { const x = v.Ox + i * pp + h, o = (y * c.width + x) * 4;
          if (d[o + 3] === 0) continue; const k = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2]; if (k === key[0]) continue;
          if (inText(x, y)) { txt++; continue; }
          cl++; cm.set(k, (cm.get(k) || 0) + 1); } }
      cells = { lit: cl, underText: txt, textBoxes: TB.length, ...tally(cm) };
    }
    const px = tally(by);
    return { w: c.width, h: c.height, painted, lit, tokens: px.tokens, other: px.other, topOther: px.topOther, cells,
      white: white[4] ? { x0: white[0], y0: white[1], x1: white[2] + 1, y1: white[3] + 1, n: white[4] } : null,
      cssW: c.getBoundingClientRect().width, cssL: c.getBoundingClientRect().left, cssT: c.getBoundingClientRect().top };
  };
})();
"""

# Computed-style walk: every rendered colour and text size in the document. Elements inside a native figure
# layer are walked too and kept in their own buckets (ncolors, nsizes), because pink is allowed there.
STYLES_JS = r"""
() => {
  const NATIVE = "%NATIVE%";
  const out = { colors: {}, sizes: {}, ncolors: {}, nsizes: {}, n: 0, nn: 0 };
  let nat = false;
  const add = (b, k, ex) => { if (nat) b = 'n' + b; if (!out[b][k]) out[b][k] = { n: 0, ex: [] }; out[b][k].n++; if (out[b][k].ex.length < 2) out[b][k].ex.push(ex); };
  // SVG text is sized in user units; what the reader sees is that size through the element's screen transform
  const shownSize = (el, cs) => { const fs = parseFloat(cs.fontSize);
    if (typeof SVGTextContentElement !== 'undefined' && el instanceof SVGTextContentElement && el.getScreenCTM) {
      const m = el.getScreenCTM(); if (m) return (fs * Math.hypot(m.a, m.b)).toFixed(2) + 'px'; }
    return cs.fontSize; };
  const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
  const shadowCols = v => (v && v !== 'none') ? (v.match(/(?:rgba?|oklch|oklab|lab|lch|hsla?|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi) || []) : [];
  const visit = (el, cs, tag, textual) => {
    const d = tag + ' ' + __ct.desc(el);
    if (textual) { add('colors', cs.color, 'color ' + d); add('sizes', shownSize(el, cs), d + ' "' + (el.textContent || '').trim().slice(0, 30) + '"');
      if (cs.textDecorationLine && cs.textDecorationLine !== 'none') add('colors', cs.textDecorationColor, 'text-decoration ' + d); }
    if (cs.backgroundColor) add('colors', cs.backgroundColor, 'background ' + d);
    for (const s of ['Top', 'Right', 'Bottom', 'Left'])
      if (parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none') add('colors', cs['border' + s + 'Color'], 'border ' + d);
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) add('colors', cs.outlineColor, 'outline ' + d);
    for (const c of shadowCols(cs.boxShadow)) add('colors', c, 'box-shadow ' + d);
    // only shapes and text paint; an <svg> root's inherited default fill paints nothing
    const shape = (typeof SVGGeometryElement !== 'undefined' && el instanceof SVGGeometryElement) || (typeof SVGTextContentElement !== 'undefined' && el instanceof SVGTextContentElement);
    if (shape) { if (!(el instanceof SVGLineElement) && cs.fill && cs.fill !== 'none' && !/^url/.test(cs.fill)) add('colors', cs.fill, 'fill ' + d);
      if (cs.stroke && cs.stroke !== 'none' && !/^url/.test(cs.stroke) && parseFloat(cs.strokeWidth) > 0) add('colors', cs.stroke, 'stroke ' + d); }
  };
  for (const el of document.querySelectorAll('body, body *')) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || el.tagName === 'CANVAS' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    out.n++;
    nat = !!el.closest(NATIVE); if (nat) out.nn++;
    const textual = ownText(el) || (el instanceof SVGElement && el.tagName.toLowerCase() === 'text');
    visit(el, cs, '', textual);
    for (const p of ['::before', '::after']) {
      const ps = getComputedStyle(el, p);
      if (!ps.content || ps.content === 'none' || ps.content === 'normal') continue;
      visit(el, ps, p, /^["'].*\S.*["']$/.test(ps.content));
    }
  }
  const root = getComputedStyle(document.documentElement), vars = {};
  for (const k of %TOKNAMES%) vars[k] = root.getPropertyValue('--' + k).trim();
  return { ...out, vars };
}
"""

# CSSOM literal scan: catches :hover, :focus and media variants that are not on screen now.
CSSOM_JS = r"""
() => {
  const hits = [];
  const KW = /^(transparent|currentcolor|inherit|initial|unset|revert|none|auto|solid|dashed|dotted|double|inset|outset|normal|thin|medium|thick)$/i;
  const lits = v => {
    const o = [];
    for (const m of v.matchAll(/(?:rgba?|hsla?|hwb|oklab|oklch|lab|lch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi)) o.push(m[0]);
    for (const w of v.replace(/\([^()]*\)/g, ' ').split(/[\s,\/]+/)) if (/^[a-z]+$/i.test(w) && !KW.test(w) && CSS.supports('color', w)) o.push(w);
    return o;
  };
  const scan = (rules, media) => {
    for (const r of rules) {
      if (r.media && r.cssRules) { const m = r.conditionText || r.media.mediaText; if (/^\s*print\s*$/i.test(m)) continue; scan(r.cssRules, media ? media + ' and ' + m : m); continue; }
      if (r.cssRules && !r.style) { scan(r.cssRules, media); continue; }
      if (!r.style) continue;
      for (let i = 0; i < r.style.length; i++) {
        const p = r.style[i];
        if (!/color|background|border|outline|shadow|fill|stroke|^--/.test(p)) continue;
        for (const l of lits(r.style.getPropertyValue(p))) hits.push({ sel: (r.selectorText || r.keyText || '').slice(0, 60), p, lit: l, media: media || '' });
      }
      if (r.cssRules) scan(r.cssRules, media);
    }
  };
  for (const sh of document.styleSheets) { try { scan(sh.cssRules, ''); } catch (e) { hits.push({ sel: 'unreadable sheet', p: '', lit: String(e).slice(0, 40), media: '' }); } }
  return hits;
}
"""

# Resolve any CSS colour string to sRGB bytes by painting it.
RESOLVE_JS = r"""
(list) => {
  const c = document.createElement('canvas'); c.__ctOwn = true; c.width = c.height = 1; const x = c.getContext('2d', { willReadFrequently: true });
  const out = {};
  for (const v of list) {
    x.clearRect(0, 0, 1, 1); x.fillStyle = '#010203'; x.fillStyle = v;
    const ok = x.fillStyle !== '#010203' || /^#010203$/i.test(v);
    x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data;
    out[v] = ok ? [d[0], d[1], d[2], d[3]] : null;
  }
  return out;
}
"""

SETTLE_JS = r"""
async (maxMs) => {
  const t0 = performance.now(), W = window.__walk;
  await __ct.raf(); await __ct.raf();
  while (performance.now() - t0 < maxMs) {
    let busy = null; try { busy = W && typeof W.running === 'function' ? !!W.running() : null; } catch (e) {}
    if (busy === false) { await __ct.raf(); return Math.round(performance.now() - t0); }
    if (busy === null && performance.now() - t0 > 1000) return -1;
    await __ct.raf();
  }
  return -2;
}
"""

FRAME_JS = r"""
(a) => {
  const W = window.__walk, S = __ct.get('S'), s = scrollY / S;
  const safe = f => { try { return f(); } catch (e) { return 'error: ' + String(e).slice(0, 80); } };
  const v = safe(() => __ct.get('view'));
  const shown = safe(() => __ct.get('shown'));
  const out = { y: scrollY, s, S, shown,
    scene: safe(() => W.sceneId(s)), stepView: v && typeof v === 'object' ? v.step : null, pp: v && typeof v === 'object' ? v.pp : null,
    stepAtShown: typeof shown === 'number' ? safe(() => W.stepAt(shown)) : null,
    built: __ct.has('built') ? safe(() => __ct.get('built')) : undefined,
    zone: __ct.zoneCard(a.z0, a.z1), stuck: __ct.stuckCard(a.z0, a.z1), natives: __ct.natives(),
    figure: __ct.has('figure') ? safe(() => __ct.get('figure')) : undefined,
    drawn: __ct.has('drawn') ? safe(() => __ct.get('drawn')) : undefined,
    instr: __ct.has('instrAt') ? safe(() => __ct.get('instrAt', s)) : undefined };
  if (a.census) { out.census = __ct.census(a.tok); out.cells = safe(() => __ct.cellCensus(a.names)); }
  return out;
}
"""

PINK_SHARE_JS = r"""
async ([png, rgb, tol]) => {
  // device pixels of a viewport screenshot showing bright --trail: every layer at once, canvas, DOM and native
  const r = await fetch('data:image/png;base64,' + png); const bm = await createImageBitmap(await r.blob());
  const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext('2d'); x.drawImage(bm, 0, 0);
  const d = x.getImageData(0, 0, bm.width, bm.height).data;
  let n = 0, exact = 0, bb = [1e9, 1e9, -1, -1];
  for (let i = 0; i < d.length; i += 4) {
    const a = Math.abs(d[i] - rgb[0]), b = Math.abs(d[i + 1] - rgb[1]), e = Math.abs(d[i + 2] - rgb[2]);
    if (a <= tol && b <= tol && e <= tol) {
      n++; if (!a && !b && !e) exact++;
      const p = i >> 2, px = p % bm.width, py = (p / bm.width) | 0;
      if (px < bb[0]) bb[0] = px; if (py < bb[1]) bb[1] = py; if (px > bb[2]) bb[2] = px; if (py > bb[3]) bb[3] = py;
    }
  }
  return { n, exact, w: bm.width, h: bm.height, bbox: n ? bb : null };
}
"""
# A hold's pink is a visual share: bright --trail pixels over the whole viewport, the ant's head trail
# included. Per channel within PINK_TOL of #ff3d81 counts as bright; an antialiased fringe half way to the
# void does not.
HOLD_PINK_CAP = 0.015
PINK_TOL = 16

TEXT_DIFF_JS = r"""
async ([a, b, boxes]) => {
  // boxes: device-px rectangles of the clip where a difference is allowed; `n` counts the rest
  const ok = (x, y) => { for (const q of boxes || []) if (x >= q[0] && x < q[2] && y >= q[1] && y < q[3]) return true; return false; };
  const load = async s => { const r = await fetch('data:image/png;base64,' + s); const bm = await createImageBitmap(await r.blob());
    const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height); };
  const A = await load(a), B = await load(b);
  if (A.width !== B.width || A.height !== B.height) return { n: -1 };
  let n = 0, inside = 0, bb = [1e9, 1e9, -1, -1];
  for (let i = 0; i < A.data.length; i += 4) {
    if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) {
      const p = i >> 2, x = p % A.width, y = (p / A.width) | 0;
      if (ok(x, y)) { inside++; continue; }
      n++;
      if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y;
    }
  }
  return { n, inside, w: A.width, h: A.height, bbox: n ? bb : null };
}
"""
_HIDE = ("{color:transparent!important;-webkit-text-fill-color:transparent!important;"
         "text-decoration-color:transparent!important;text-shadow:none!important;"
         "transition:none!important;caret-color:transparent!important}")
_HIDE_SVG = "{fill:transparent!important;stroke:transparent!important}"
# every DOM text and SVG text made transparent
HIDE_TEXT_CSS = "*" + _HIDE + "text,tspan,textPath" + _HIDE_SVG
# only the text of native figure layers made transparent
HIDE_NATIVE_CSS = (f":is({NATIVE_SEL}),:is({NATIVE_SEL}) *" + _HIDE
                   + f":is({NATIVE_SEL}) :is(text,tspan,textPath)" + _HIDE_SVG)


class Missing(Exception):
    """A hook the contract needs is absent: the assertion fails, it is not skipped."""


def serve(root):
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Quiet, directory=str(root))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{port}/index.html"


class View:
    """One browser context at one viewport, with its sweeps and held frames cached."""

    def __init__(self, run, name, mode="full"):
        self.run, self.name, self.mode = run, name, mode
        opts = VIEWPORTS[name]
        self.ctx = run.browser.new_context(**opts)
        self.ctx.set_default_timeout(20000)
        self.page = self.ctx.new_page()
        self.errors = []
        self.page.on("pageerror", lambda e: self.errors.append("pageerror: " + str(e)[:160]))
        self.page.on("console", lambda m: m.type == "error" and self.errors.append("console.error: " + m.text[:160]))
        self.page.add_init_script(INIT_JS.replace("%MODE%", mode).replace("%NATIVE%", NATIVE_SEL)
                                  .replace("%NATIVE_ID%", json.dumps(NATIVE_ROOTS)))
        self.page.goto(run.url, wait_until="load")
        self.page.evaluate("document.fonts ? document.fonts.ready.then(() => 1) : 1")
        self.page.wait_for_timeout(600)
        self.settle(2500)
        self.cache = {}
        self.frames = {}
        self.cur = None
        g = self.page.evaluate("""() => { const b = document.createElement('div');
            b.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:52svh;visibility:hidden;pointer-events:none';
            document.documentElement.appendChild(b); const h = b.getBoundingClientRect().height; b.remove();
            return { band: h, vw: document.documentElement.clientWidth, vh: innerHeight, dpr: devicePixelRatio,
              walk: !!window.__walk, S: window.__walk && typeof __walk.S === 'function' ? __walk.S() : null }; }""")
        self.band, self.vw, self.vh, self.dpr = g["band"], g["vw"], g["vh"], g["dpr"]
        self.has_walk, self.S = g["walk"], g["S"]
        self.phone = name in PHONES

    # --- plumbing ---
    def js(self, src, arg=None):
        return self.page.evaluate(src, arg) if arg is not None else self.page.evaluate(src)

    def settle(self, ms=2500):
        return self.page.evaluate(SETTLE_JS, ms)

    def need_walk(self):
        if not self.has_walk:
            raise Missing("window.__walk is absent")
        if not self.S:
            raise Missing("__walk.S() is absent")

    def hook(self, k):
        return self.js("k => __ct.has(k)", k)

    def get(self, k):
        return self.js("k => { const v = __ct.get(k); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }", k)

    def zone(self):
        """The reading zone: where a card must be while the story runs."""
        if self.phone:
            return (self.band, self.vh)
        return (96, self.vh - 40)

    def scroll_s(self, s):
        y = round(s * self.S)
        self.js("y => __ct.scrollTo(0, y)", y)
        self.cur = None

    # --- shared measurements ---
    def geometry(self):
        if "geo" in self.cache:
            return self.cache["geo"]
        self.need_walk()
        g = self.js("""() => { const W = __walk, n = k => { const v = __ct.get(k); return typeof v === 'number' ? v : null; };
            const st = __ct.get('stations');
            return { stations: Array.isArray(st) ? st : null, PULL: n('PULL'), MAPS: n('MAPS'), DOCS: n('DOCS'),
                     end: (document.documentElement.scrollHeight - innerHeight) / __walk.S() }; }""")
        if not g["stations"]:
            raise Missing("__walk.stations is absent")
        g["PULL_fallback"] = g["PULL"] is None
        if g["PULL"] is None:
            g["PULL"] = max(st[2] for st in g["stations"])
        ranges = self.js("""(end) => { const out = {}; let prev = null, a = 0;
            for (let s = 0; s <= end + 1e-9; s += 0.01) { const id = __walk.sceneId(s);
              if (id !== prev) { if (prev !== null) (out[prev] = out[prev] || []).push([a, s]); prev = id; a = s; } }
            (out[prev] = out[prev] || []).push([a, end]); return out; }""", g["end"])
        g["scenes"] = ranges
        self.cache["geo"] = g
        return g

    def frame_at(self, s, census=False, here=False):
        """The measured frame at s, cached. `here` also guarantees the page is scrolled to s now, for callers
        that go on to screenshot or scroll from it: a cached frame alone says nothing about where the page is."""
        key = round(s, 4)
        f = self.frames.get(key)
        if f is not None and (not census or "census" in f) and (not here or self.cur == key):
            return f
        self.scroll_s(s)
        ms = self.settle(2500)
        z = self.zone()
        f = self.js(FRAME_JS, {"z0": z[0], "z1": z[1], "census": census, "tok": {k: list(v) for k, v in TOK_RGB.items()},
                               "names": [[k, (c[0] << 16) | (c[1] << 8) | c[2]] for k, c in TOK_RGB.items()]})
        f["settleMs"] = ms
        self.frames[key] = f
        self.cur = key
        return f

    def wheel_sweep(self):
        """100px wheel notches from the top, through the last résumé line, to the bottom."""
        if "sweep" in self.cache:
            return self.cache["sweep"]
        self.need_walk()
        self.js("() => __ct.scrollTo(0, 0)")
        self.settle(2500)
        if self.phone:
            self.page.mouse.move(self.vw / 2, (40 + self.band) / 2)
        else:
            self.page.mouse.move((576 + self.vw) / 2, self.vh / 2)
        line_hook = self.js("() => __ct.lastLine().hook")
        rec, stalls, reached, n = [], [], None, 0
        wait_js = """async (before) => { const t0 = performance.now();
            while (performance.now() - t0 < 400) { await __ct.raf(); if (scrollY !== before) { await __ct.raf(); break; } }
            let v = null; try { v = __ct.get('view'); } catch (e) {}
            const L = __ct.lastLine();
            return { y: scrollY, max: document.documentElement.scrollHeight - innerHeight, pp: v ? v.pp : null, step: v ? v.step : null,
                     lb: L.el ? __ct.lineBottom(L.el) : null, ih: innerHeight }; }"""
        before = self.js("scrollY")
        extra = 0
        while n < 400:
            self.page.mouse.wheel(0, 100)
            n += 1
            r = self.js(wait_js, before)
            rec.append(r)
            if r["y"] <= before and before < r["max"] - 0.5:
                stalls.append((n, before))
            if reached is None and r["lb"] is not None and r["lb"] <= r["ih"]:
                reached = n
            before = r["y"]
            if r["y"] >= r["max"] - 0.5:
                break
            if reached is not None:
                extra += 1
                if extra > 60:
                    break
        out = {"notches": n, "reached": reached, "stalls": stalls, "rec": rec, "lineHook": line_hook,
               "bottom": rec[-1]["y"] >= rec[-1]["max"] - 0.5 if rec else False}
        self.cache["sweep"] = out
        self.cur = None
        return out

    def stat(self):
        return self.js("() => ({ cv: __ct.cv || null, listeners: __ct.listeners, scrollCalls: __ct.scrollCalls })")

    def close(self):
        try:
            self.ctx.close()
        except Exception:
            pass


# ---------------------------------------------------------------- assertions
# Each returns (ok, measured). Raising Missing reports the hook that is absent.

def a_landing(v):
    v.need_walk()
    r = v.js("""() => { const W = __walk, S = W.S(), end = (document.documentElement.scrollHeight - innerHeight) / S;
        const ctl = [0, 0.01, 0.025].map(s => W.sceneId(s));
        let n = 0, bad = [], dec = [], prev = -1, maxStep = 0;
        for (let i = 0; ; i++) { const s = 0.04 + i * 0.0005; if (s > end) break; n++;
          if (W.sceneId(s) === 'landing') bad.push(+s.toFixed(4));
          const st = W.stepAt(s); if (st < prev) dec.push([+s.toFixed(4), prev, st]); prev = st; if (st > maxStep) maxStep = st; }
        return { n, end: +end.toFixed(3), ctl, bad: bad.length, firstBad: bad.slice(0, 3), dec: dec.length, firstDec: dec.slice(0, 2), maxStep }; }""")
    ctl_ok = all(c == "landing" for c in r["ctl"])
    ok = ctl_ok and r["bad"] == 0 and r["dec"] == 0 and r["n"] > 1000 and r["maxStep"] > 0
    m = (f"{r['bad']} landing samples of {r['n']} after s 0.04 (to s {r['end']}), stepAt decreases {r['dec']}x"
         f"{', first ' + str(r['firstBad'] or r['firstDec']) if not ok and (r['firstBad'] or r['firstDec']) else ''}"
         f"; control s<0.03 -> {','.join(sorted(set(r['ctl'])))}")
    return ok, m


# CSS px inside the art region on each viewport; the last one lands on the main ant itself
PLANT_CLICKS = {"desktop": [(680, 180), (1280, 180), (680, 720), (1280, 720), (960, 466)],
                "phone": [(50, 80), (340, 80), (50, 360), (340, 360), (183, 229)]}
# a visitor cell is a --muted world cell (the main ant never draws --muted), counted over the whole world
PLANT_CENSUS_JS = r"""() => { const W = __walk, names = Object.keys(W.tokens()), M = names.findIndex(n => /muted/.test(n)) + 1;
    let WW = 0, WH = 0; while (W.cellTokRaw(WW, 0) !== -1) WW++; while (W.cellTokRaw(0, WH) !== -1) WH++;
    let n = 0; for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) if (W.cellTokRaw(x, y) === M) n++;
    return { cells: n, ants: W.plants().length, muted: M }; }"""


def a_planting(v):
    v.need_walk()
    for k in ("plants", "cellTokRaw", "tokens"):
        if not v.js("k => typeof __walk[k] === 'function'", k):
            raise Missing(f"__walk.{k} is absent")
    v.scroll_s(0)
    v.settle(2500)
    c0 = v.js(PLANT_CENSUS_JS)
    ants = []
    for (x, y) in PLANT_CLICKS["phone" if v.phone else "desktop"]:
        v.page.mouse.click(x, y)
        v.page.wait_for_timeout(150)
        ants.append(v.js("() => __walk.plants().length"))
    v.page.wait_for_timeout(2600)
    c1 = v.js(PLANT_CENSUS_JS)
    v.scroll_s(0.20)
    v.settle(2500)
    c2 = v.js(PLANT_CENSUS_JS)
    v.scroll_s(0)
    v.settle(2500)
    c3 = v.js(PLANT_CENSUS_JS)
    v.cur = None
    ok = (c0["muted"] > 0 and c0["cells"] == 0 and max(ants) <= 1 and c1["ants"] == 1 and c1["cells"] > 0
          and c2["ants"] == 0 and c2["cells"] == 0 and c3["ants"] == 0 and c3["cells"] == 0)
    return ok, (f"visitor ants after each of 5 landing clicks {ants}; visitor world cells before {c0['cells']}, "
                f"2.6s after the 5th click {c1['cells']} ({c1['ants']} ant); at s 0.20 {c2['ants']} ants, {c2['cells']} cells; "
                f"back at s 0 {c3['ants']} ants, {c3['cells']} cells")


# all the work: the known answer is the explore taxonomy (projects.json, taxonomy B), not the page's own data
WORK_THEMES = ["llm", "verify", "systems", "data", "play"]
WORK_MEMBERS = {"ai-capabilities": ["llm", "verify", "play"], "carbon-hack": ["systems"], "care": ["play"], "charity-screening": ["llm", "data"], "comic-extractor": ["data"], "comic-reader": ["play"], "custos-code": ["llm", "verify"], "emergence": ["verify", "systems", "play"], "freeflow": ["verify", "systems"], "iaria-green": ["systems", "data"], "ieee-ipccc": ["llm", "systems"], "imc-prosperity-4": ["data"], "inf-mem": ["llm"], "kronos": ["verify", "data"], "matmul": ["systems"], "x86-compiler": ["systems"]}
WORK_STATE_JS = r"""() => { const w = document.getElementById('work'); if (!w) return null;
    const rows = [...w.querySelectorAll('.w-list .row')];
    return { map: w.getAttribute('data-map'), ids: rows.map(r => r.id.slice(2)), shown: rows.filter(r => r.getClientRects().length).map(r => r.id.slice(2)),
      on: Object.fromEntries(rows.map(r => [r.id.slice(2), [...r.querySelectorAll('.c.on')].map(c => c.dataset.k)])),
      pressed: [...w.querySelectorAll('.w-all[aria-pressed="true"], .w-t[aria-pressed="true"], .w-p[aria-pressed="true"]')].map(b => b.classList.contains('w-p') ? b.dataset.p : b.classList.contains('w-t') ? b.dataset.k : 'all'),
      msg: w.querySelector('.w-msg').textContent }; }"""
WORK_PICK_JS = r"""(sel) => { document.querySelector(sel).click(); return true; }"""
# every project marker and its 3 x 3 moat lie in exactly its own themes (the page's masks); the canvas draws it lit in a void moat
WORK_TERR_JS = r"""() => { const D = JSON.parse(document.getElementById('w-data').textContent), n = document.getElementById('work').getAttribute('data-map'), L = D.layouts[n];
    const dec = s => { const a = new Uint8Array(L.cols * L.rows); let at = 0, on = 0; for (const r of s.split('.')) { const v = parseInt(r, 36); if (on) a.fill(1, at, at + v); at += v; on ^= 1; } return a; };
    const M = Object.fromEntries(D.order.map(k => [k, dec(L.masks[k])])), zone = (i, j) => D.order.filter(k => M[k][j * L.cols + i]).join('+');
    const cv = document.querySelector('#work .w-cv'), c = cv.getContext('2d'), p = cv.width / L.cols, zones = {}, drawn = [];
    const px = (x, y) => [...c.getImageData(Math.floor(x), Math.floor(y), 1, 1).data].slice(0, 3);
    for (const [id, [i, j]] of Object.entries(L.at)) {
      zones[id] = [-1, 0, 1].flatMap(dy => [-1, 0, 1].map(dx => zone(i + dx, j + dy)));
      drawn.push([id, px(i * p, j * p), px((i - 1) * p + 1, (j - 1) * p + 1)]); }
    return { map: n, zones, drawn }; }"""
# what #work paints in this state: computed colours and text sizes of every element it renders, and every canvas pixel
WORK_PAINT_JS = r"""() => { const w = document.getElementById('work'), colors = {}, sizes = {};
    const add = (b, k, ex) => { if (!b[k]) b[k] = ex; };
    for (const el of [w, ...w.querySelectorAll('*')]) { if (!el.getClientRects().length || el.tagName === 'SCRIPT' || el.tagName === 'CANVAS') continue;
      const cs = getComputedStyle(el); if (cs.visibility !== 'visible') continue;
      const d = __ct.desc(el), own = [...el.childNodes].some(t => t.nodeType === 3 && t.nodeValue.trim());
      if (own) { add(colors, cs.color, 'color ' + d); add(sizes, cs.fontSize, d);
        if (cs.textDecorationLine !== 'none') add(colors, cs.textDecorationColor, 'text-decoration ' + d); }
      add(colors, cs.backgroundColor, 'background ' + d);
      for (const q of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(cs['border' + q + 'Width']) > 0 && cs['border' + q + 'Style'] !== 'none') add(colors, cs['border' + q + 'Color'], 'border ' + d);
      if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) add(colors, cs.outlineColor, 'outline ' + d);
      if (cs.boxShadow !== 'none') add(colors, 'shadow:' + cs.boxShadow, 'box-shadow ' + d);
      if (cs.backgroundImage !== 'none') add(colors, 'image:' + cs.backgroundImage, 'background-image ' + d);
      if (cs.opacity !== '1') add(colors, 'opacity:' + cs.opacity, 'opacity ' + d); }
    const cv = w.querySelector('.w-cv'), dt = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, seen = {};
    for (let i = 0; i < dt.length; i += 4) { const k = dt[i] + ',' + dt[i + 1] + ',' + dt[i + 2] + ',' + dt[i + 3]; seen[k] = (seen[k] || 0) + 1; }
    return { colors, sizes, px: seen }; }"""
WORK_TAB_JS = r"""() => { const e = document.activeElement, w = document.getElementById('work');
    if (!e || !w.contains(e)) return null;
    return e.classList.contains('w-all') ? 'all' : e.classList.contains('w-t') ? 't:' + e.dataset.k : e.classList.contains('w-p') ? 'p:' + e.dataset.p : 'other'; }"""

# phone, on a coarse pointer: the prompt names the tap; every theme name is a 32px target whose pick brings its first row
# wholly into view below the strip; a click 13px off a marker's centre (outside its 3 x 3 moat) picks that marker's project
WORK_PHONE_JS = r"""() => { const w = document.getElementById('work'), all = w.querySelector('.w-all'), out = { rows: [], marks: [] };
    all.click(); out.coarse = matchMedia('(pointer: coarse)').matches; out.prompt = w.querySelector('.w-msg').textContent;
    out.strip = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--strip')) || 0;
    for (const b of w.querySelectorAll('.w-t')) { all.click(); __ct.scrollTo(0, b.getBoundingClientRect().top + scrollY - innerHeight * 0.4); b.click();
      const r = [...w.querySelectorAll('.w-list .row')].find(x => x.getClientRects().length).getBoundingClientRect(), t = b.getBoundingClientRect();
      out.rows.push([b.dataset.k, r.top, r.bottom, innerHeight, t.width, t.height]); }
    const L = JSON.parse(document.getElementById('w-data').textContent).layouts.narrow, cv = w.querySelector('.w-cv');
    for (const id of Object.keys(L.at)) { all.click(); let r = cv.getBoundingClientRect(); const cell = r.width / L.cols;
      __ct.scrollTo(0, r.top + scrollY + (L.at[id][1] + 0.5) * cell - innerHeight / 2); r = cv.getBoundingClientRect();
      cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + (L.at[id][0] + 0.5) * cell + 13, clientY: r.top + (L.at[id][1] + 0.5) * cell - 13 }));
      out.marks.push([id, w.getAttribute('data-proj')]); }
    all.click(); return out; }"""


def a_work(v):
    st = v.js(WORK_STATE_JS)
    if st is None:
        raise Missing("section#work is absent")
    bad, n_states = [], 0
    want_ids = set(WORK_MEMBERS)
    by_theme = {k: sorted(p for p, ks in WORK_MEMBERS.items() if k in ks) for k in WORK_THEMES}
    v.js("() => document.querySelector('#work .w-all').click()")
    st = v.js(WORK_STATE_JS)
    # membership: the rows, their lit cells and every theme's listing equal the taxonomy
    if set(st["ids"]) != want_ids or set(st["shown"]) != want_ids:
        bad.append(f"rows at rest {sorted(set(st['shown']) ^ want_ids)} differ from the taxonomy")
    for pid, on in st["on"].items():
        if sorted(on) != sorted(WORK_MEMBERS.get(pid, [])):
            bad.append(f"{pid} lights {on}, belongs to {WORK_MEMBERS.get(pid)}")
    paints = [("all", v.js(WORK_PAINT_JS))]
    for k in WORK_THEMES:
        v.js(WORK_PICK_JS, f'#work .w-t[data-k="{k}"]')
        s2 = v.js(WORK_STATE_JS)
        if sorted(s2["shown"]) != by_theme[k] or s2["pressed"] != [k] or not s2["msg"].startswith(f"{len(by_theme[k])} of {len(want_ids)} in "):
            bad.append(f"{k}: lists {sorted(s2['shown'])} (want {by_theme[k]}), pressed {s2['pressed']}, status {s2['msg'][:40]!r}")
        paints.append((k, v.js(WORK_PAINT_JS)))
    v.js(WORK_PICK_JS, '#work .w-p[data-p="kronos"]')
    s3 = v.js(WORK_STATE_JS)
    if s3["shown"] != ["kronos"] or s3["pressed"] != ["kronos"]:
        bad.append(f"picking KRONOS shows {s3['shown']}, pressed {s3['pressed']}")
    paints.append(("p:kronos", v.js(WORK_PAINT_JS)))
    v.js("() => document.querySelector('#work .w-all').click()")
    # territories, from the page's own masks, and the drawn markers
    t = v.js(WORK_TERR_JS)
    void = list(TOK_RGB["void"])
    for pid, zs in t["zones"].items():
        want = "+".join(k for k in WORK_THEMES if k in WORK_MEMBERS.get(pid, []))
        if any(z != want for z in zs):
            bad.append(f"{t['map']}: {pid} sits in {sorted(set(zs))}, belongs to {want}")
    for pid, mark, moat in t["drawn"]:
        if mark == void or moat != void:
            bad.append(f"{t['map']}: {pid} marker {mark} in moat {moat}")
    if set(t["zones"]) != want_ids:
        bad.append(f"map markers {sorted(set(t['zones']) ^ want_ids)} differ from the taxonomy")
    # colours and sizes in every state: tokens only, no alpha, no shadow, image or opacity; canvas pixels tokens at alpha 255
    cols, sizes, px = {}, {}, {}
    for name, pnt in paints:
        n_states += 1
        for c, ex in pnt["colors"].items():
            cols.setdefault(c, f"{name}: {ex}")
        for z, ex in pnt["sizes"].items():
            sizes.setdefault(z, f"{name}: {ex}")
        for k2, n in pnt["px"].items():
            px[k2] = px.get(k2, 0) + n
    plain = [c for c in cols if not c.startswith(("shadow:", "image:", "opacity:"))]
    res = resolve(v, plain)
    for c in cols:
        if c.startswith(("shadow:", "image:", "opacity:")):
            bad.append(f"{c[:40]} ({cols[c]})")
            continue
        k = classify(res.get(c), TOK_RGB)
        if k != "transparent" and (k is None or k == "unparsed" or k.endswith("@alpha") or k in TRAIL_FAMILY):
            bad.append(f"colour {c} ({cols[c]})")
    off_sizes = sorted(z for z in sizes if round(float(z[:-2])) not in DOM_SIZES or abs(float(z[:-2]) - round(float(z[:-2]))) > 0.01)
    bad += [f"size {z} ({sizes[z]})" for z in off_sizes]
    tok = {tuple(c) for c in TOK_RGB.values()}
    off_px = [k2 for k2 in px if tuple(int(x) for x in k2.split(",")[:3]) not in tok or k2.split(",")[3] != "255"]
    bad += [f"canvas pixel rgba({k2}) x{px[k2]}" for k2 in off_px[:3]]
    # keyboard: Tab from 'all' reaches every theme and every project on the map, and Enter picks a theme
    v.js("() => { document.querySelector('#work .w-all').focus(); }")
    reached = {"all"}
    for _ in range(80):
        v.page.keyboard.press("Tab")
        a = v.js(WORK_TAB_JS)
        if a is None:
            break
        reached.add(a)
    need = {"all"} | {"t:" + k for k in WORK_THEMES} | {"p:" + p for p in want_ids}
    if need - reached:
        bad.append(f"Tab never reaches {sorted(need - reached)[:4]}")
    v.js("() => document.querySelector('#work .w-t[data-k=\"verify\"]').focus()")
    v.page.keyboard.press("Enter")
    s4 = v.js(WORK_STATE_JS)
    if s4["pressed"] != ["verify"] or sorted(s4["shown"]) != by_theme["verify"]:
        bad.append(f"Enter on verification: pressed {s4['pressed']}, lists {len(s4['shown'])}")
    v.page.keyboard.press("Enter")
    v.js("() => { document.activeElement && document.activeElement.blur(); document.querySelector('#work .w-all').click(); }")
    phone = ""
    if t["map"] == "narrow":
        ph = v.js(WORK_PHONE_JS)
        if ph["coarse"]:
            if ph["prompt"] != "tap a theme or a project":
                bad.append(f"phone prompt reads {ph['prompt']!r}")
            for k, top, bot, ih, tw, th in ph["rows"]:
                if tw < 32 or th < 32:
                    bad.append(f"theme {k} target {tw:.0f}x{th:.0f}px, under 32px")
                if top < ph["strip"] or bot > ih:
                    bad.append(f"theme {k}: first row at {top:.0f}..{bot:.0f}px, not wholly in view below the strip in {ih}px")
            miss = [f"{i}->{got}" for i, got in ph["marks"] if got != i]
            if miss:
                bad.append(f"13px off a marker picks {miss[:3]}")
            phone = (f"; phone: prompt checked, {len(ph['rows'])} theme picks checked for their first row in view, "
                     f"{len(ph['marks']) - len(miss)} of {len(ph['marks'])} markers picked 13px off centre")
    v.cur = None
    ok = not bad
    return ok, (f"{t['map']} map: {len(want_ids)} rows and markers, {len(WORK_THEMES)} theme listings and a project pick match the taxonomy; "
                f"markers in exactly their themes (cell and moat); {n_states} states: {len(cols)} colours, sizes {sorted(sizes, key=lambda z: float(z[:-2]))}, "
                f"{len(px)} canvas pixel values; Tab reaches {len(need & reached)} of {len(need)} map controls" + phone
                + ("; " + "; ".join(bad[:4]) if bad else ""))


def a_listeners(v):
    st = v.stat()
    inline = v.js("""() => [...document.querySelectorAll('*')].flatMap(e => [...e.attributes]
        .filter(a => /^on(wheel|mousewheel|touchstart|touchmove|touchend|touchcancel|keydown|keyup|keypress)$/i.test(a.name))
        .map(a => __ct.desc(e) + '[' + a.name + ']'))""")
    L = st["listeners"]
    kinds = sorted({l["type"] for l in L})
    ok = not L and not inline
    ex = "; e.g. " + ", ".join(f"{l['type']} on {l['on']} ({'passive' if l['passive'] else 'non-passive'})" for l in L[:3]) if L else ""
    return ok, f"{len(L)} wheel/touch/key listeners{(' [' + ','.join(kinds) + ']') if kinds else ''}, {len(inline)} inline handler attrs{ex}"


def a_scrollbars(v):
    out = []
    pos = [0.0]
    try:
        g = v.geometry()
        pos += [g["PULL"] - 0.3, (g["MAPS"] or g["PULL"]) + 0.1, g["end"]]
    except Missing:
        pos += [None]
    for s in pos:
        if s is None:
            v.js("() => __ct.scrollTo(0, document.documentElement.scrollHeight)")
        else:
            v.scroll_s(s)
        v.settle(1500)
        out += v.js("""() => [...document.querySelectorAll('*')].filter(e => {
            if (e === document.documentElement || e === document.body) return false;
            const c = getComputedStyle(e);
            return (/(auto|scroll|overlay)/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 1) ||
                   (/(auto|scroll|overlay)/.test(c.overflowX) && e.scrollWidth > e.clientWidth + 1); })
            .map(e => __ct.desc(e) + ' ' + (e.scrollHeight - e.clientHeight) + 'px')""")
    u = sorted(set(out))
    return not u, f"{len(u)} elements with an inner scrollbar at {len(pos)} scroll positions" + (": " + ", ".join(u[:3]) if u else "")


TARGETS_JS = """(min) => {
  const vw = innerWidth, vh = innerHeight, out = [], seen = [];
  const shown = e => { for (let a = e; a && a !== document.documentElement; a = a.parentElement) { const c = getComputedStyle(a);
    if (c.visibility !== 'visible' || +c.opacity === 0 || c.display === 'none') return false; } return true; };
  for (const e of document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')) {
    if (!e.getClientRects().length || e.classList.contains('park') || e.closest('.sr-only') || !shown(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    seen.push(__ct.desc(e));
    if (r.height < min - 0.01 || r.width < min - 0.01) out.push(__ct.desc(e) + ' ' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 16) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  return { small: out, seen: seen.length }; }"""


def a_targets(v):
    # every link, button and input on screen is a whole target: 32 CSS px on touch, 24 with a fine pointer (WCAG 2.5.8)
    coarse = v.js("() => matchMedia('(pointer: coarse)').matches")
    need = 32 if coarse else 24
    pos = [0.0]
    try:
        g = v.geometry()
        pos += [st[1] + 0.1 for st in g["stations"]] + [st[3][-1] + 0.05 for st in g["stations"] if st[3]]
        pos += [(g["MAPS"] or g["PULL"]) + 0.02, g["DOCS"] + 1 if g["DOCS"] else None, g["end"]]
    except Missing:
        pass
    small, seen = set(), 0
    for s in pos:
        if s is None:
            continue
        v.scroll_s(s)
        v.settle(900)
        r = v.js(TARGETS_JS, need)
        small.update(r["small"]); seen += r["seen"]
    u = sorted(small)
    return not u, (f"{len(u)} targets under {need}px of {seen} on screen at {len(pos)} scroll positions"
                   + (": " + ", ".join(u[:8]) if u else ""))


def a_tabreach(v):
    # each figure input is reached by forward Tab from the top; focusing it scrolls its beat in, where it registers live over its cells
    want = {"fn-in": "emergence", "fk-in": "kronos"}
    v.scroll_s(0)
    v.settle(800)
    v.js("() => { const e = document.activeElement; if (e && e.blur) e.blur(); }")
    got, n = {}, 0
    for n in range(1, 91):
        v.page.keyboard.press("Tab")
        cls = (v.js("() => { const e = document.activeElement; return e && typeof e.className === 'string' ? e.className : ''; }") or "").split()
        hit = [k for k in want if k in cls and k not in got]
        if not hit:
            continue
        v.settle(1800)
        r = v.js("""() => { const e = document.activeElement, r = e.getBoundingClientRect();
            return { live: !e.classList.contains('park') && +getComputedStyle(e).opacity > 0 && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight,
                     scene: __walk.sceneId(scrollY / __walk.S()), s: +(scrollY / __walk.S()).toFixed(2) }; }""")
        r["tab"] = n
        got[hit[0]] = r
        if len(got) == len(want):
            break
    bad = [k for k in want if k not in got or not got[k]["live"] or got[k]["scene"] != want[k]]
    m = "; ".join(f"{k} " + (f"tab {got[k]['tab']} s {got[k]['s']} scene {got[k]['scene']} {'live' if got[k]['live'] else 'parked'}" if k in got else "never reached")
                  for k in want)
    return not bad, f"forward Tab from the top, {n} presses: {m}"


JUMPS_JS = """() => [...document.querySelectorAll('#strip [data-go], #places .place, #work a[data-walk]')].map((e, i) => {
  e.setAttribute('data-jf', i);
  return { i, walk: e.matches('a[data-walk]'), proj: e.matches('a[data-walk]') ? e.closest('li').id.replace(/^w-/, '') : null,
           name: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 40) }; })"""
# a walk link shows once its project is picked; the strip's name once the hero has left: start each jump from where a reader meets it
JUMP_PREP = """j => { const a = document.activeElement; if (a && a.blur) a.blur();
  const w = document.querySelector('#work');
  if (j.walk || j.name === 'Oliver Zhang') __ct.scrollTo(0, Math.round(w.getBoundingClientRect().top + scrollY - 80));
  if (j.walk) { const b = document.querySelector(`#work .w-p[data-p='${j.proj}']`); if (b && b.offsetParent) b.click(); } }"""


def a_jumpfocus(v):
    # Enter on a jump (strip, map place, walk link) moves focus with the page: the next Tab stays within a screen of where it landed
    jumps = v.js(JUMPS_JS)
    bad, n, skip = [], 0, []
    for j in jumps:
        v.scroll_s(0)
        v.settle(300)
        v.js(JUMP_PREP, j)
        v.settle(400)
        ok = v.js("i => { const e = document.querySelector(`[data-jf='${i}']`); e.focus(); return document.activeElement === e; }", j["i"])
        if not ok:
            # a walk link is display:none on a phone (its row's actions are not shown there); anything else must take focus
            (skip if j["walk"] and v.phone else bad).append(f"{j['name']!r} cannot take focus")
            continue
        v.settle(300)
        v.page.keyboard.press("Enter")
        v.settle(500)
        y1 = v.js("() => scrollY")
        v.page.keyboard.press("Tab")
        v.settle(500)
        r = v.js("() => ({ y: scrollY, h: innerHeight, a: (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || '').trim().slice(0, 30) })")
        n += 1
        if abs(r["y"] - y1) >= r["h"]:
            bad.append(f"{j['name']!r} landed {y1}, Tab to {r['a']!r} moved to {r['y']}")
    m = f"{n} of {len(jumps)} jumps" + (f" ({len(skip)} walk links not shown here)" if skip else "") + "; "
    return not bad and n > 0, m + (f"{len(bad)} bad: " + "; ".join(bad[:8]) if bad else "each next Tab stays within one screen")


LINKNAMES_JS = """() => { const by = {};
  for (const a of document.querySelectorAll('a[href]')) {
    let n = a.getAttribute('aria-label');
    if (!n) { const c = a.cloneNode(true); c.querySelectorAll('[aria-hidden=true]').forEach(x => x.remove()); n = c.textContent; }
    n = n.replace(/\\s+/g, ' ').trim().toLowerCase();
    (by[n] = by[n] || new Set()).add(a.href);
  }
  const arrows = [...document.querySelectorAll('a[href]')].filter(a => !a.getAttribute('aria-label') &&
    [...a.childNodes].some(t => t.nodeType === 3 && /[\u2190-\u21ff]/.test(t.textContent))).length;
  return { names: Object.keys(by).length, dup: Object.entries(by).filter(([k, v]) => v.size > 1).map(([k, v]) => k + ' x' + v.size), arrows }; }"""


def a_linknames(v):
    # a screen reader lists links by name: two links to different places never share one, and no arrow is read aloud
    r = v.js(LINKNAMES_JS)
    return not r["dup"] and not r["arrows"] and r["names"] > 0, \
        f"{r['names']} link names; shared by different hrefs: {', '.join(r['dup'][:6]) or 'none'}; arrows read aloud: {r['arrows']}"


SWAP_READ = """() => { const L = document.querySelector('[data-native=kronos]'); if (!L || L.style.display === 'none') return null;
  const r = L.getBoundingClientRect(), cv = document.querySelector('#world'), dpr = devicePixelRatio;
  const labels = [...L.querySelectorAll('svg text')].map(t => t.textContent.replace(/[\u2212-]?\\d[\\d.,]*%?/g, '#'));
  const x0 = Math.max(0, Math.round(r.left * dpr)), y0 = Math.max(0, Math.round(r.top * dpr)), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  const d = cv.getContext('2d').getImageData(x0, y0, w, h).data; let lit = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) lit++;
  return { labels, lit: lit / (w * h), instr: __walk.instrAt(scrollY / __walk.S()) }; }"""
# each phone view's own labels (numbers masked); a settled frame shows all of one view's and none of another's
SWAP_SIG = [{"planted answer · synthetic · EM fit"}, {"# gates", "# of #", "# real-market calibration", "# synthetic, planted answer"},
            {"KRONOS", "SPY", "real prices · shipped run · log scale"}]
SWAP_INSTR = {"shaded": 0, "a gate": 1, "KRONOS": 2}


def a_swaps(v):
    # phone KRONOS: settle at every 0.01 screen of the hold, down and back up; each frame is one whole view, the one its
    # instruction names, with no engine cells left under the layer (a swap is a clip that always finishes, never a scrub)
    g = v.geometry()
    st = [x for x in g["stations"] if x[0] == "kronos"]
    if not st:
        return False, "no kronos station"
    a, h = st[0][1], st[0][2]
    n = int(round((h - a) / 0.01))
    seq = [a + 0.005 + 0.01 * i for i in range(n)]
    seq += seq[::-1]
    bad, unsettled, lit_max, seen = [], 0, 0.0, 0
    for s in seq:
        v.scroll_s(s)
        if v.settle(3000) < 0:
            unsettled += 1
        r = v.js(SWAP_READ)
        if not r:
            continue
        seen += 1
        L = set(r["labels"])
        whole = [i for i in range(3) if SWAP_SIG[i] <= L]
        part = [i for i in range(3) if SWAP_SIG[i] & L]
        want = [k for t, k in SWAP_INSTR.items() if r["instr"].startswith(t)]
        lit_max = max(lit_max, r["lit"])
        if whole != want or part != want or r["lit"] > 0.02:
            bad.append(f"s {s:.3f} want {want} whole {whole} partial {part} cells {r['lit']:.3f}")
    ok = not bad and not unsettled and seen
    return ok, (f"{len(bad)} of {seen} settled frames over {len(seq)} samples (every 0.01 screen, down and up) not one whole view"
                f"; {unsettled} never settled; engine cells under the layer at most {lit_max:.3f}" + (": " + "; ".join(bad[:3]) if bad else ""))


def a_cardfit(v):
    """Every chapter card fits the phone text band (48svh - 32) and sticks at the band's top + 16: phrase and proof
    shown, the note line read but not shown, no inner scroller, DOM sizes only. The custos native layer, and all it
    draws, stays inside its art box at every held sample."""
    r = v.js("""() => { const svh = (() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;height:100svh;visibility:hidden';
        document.body.appendChild(d); const h = d.offsetHeight; d.remove(); return h; })(), lim = svh * 0.48 - 32;
      const band = document.querySelector('#pb') ? document.querySelector('#pb').offsetHeight : null;
      return { svh, lim, band, cards: __walk.cards().filter(c => c.id !== 'hero').map(c => { const el = c.el, cs = getComputedStyle(el), h = el.offsetHeight;
        const sizes = new Set(), inner = [];
        for (const e of [el, ...el.querySelectorAll('*')]) {
          const s = getComputedStyle(e);
          if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) sizes.add(parseFloat(s.fontSize));
          if (/(auto|scroll)/.test(s.overflowY + ' ' + s.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)) inner.push(e.tagName.toLowerCase() + '.' + e.className);
        }
        const shown = sel => { const e = el.querySelector(sel); if (!e) return null; const q = e.getBoundingClientRect(); return q.height > 1 && q.width > 1; };
        return { id: c.id, h, pos: cs.position, top: parseFloat(cs.top), fits: h <= lim + 0.01, sizes: [...sizes], inner,
                 np: shown('.np'), pf: shown('.pf'), meta: shown('.meta') }; }) }; }""")
    bad, hs = [], []
    for c in r["cards"]:
        hs.append(f"{c['id']} {c['h']}")
        if not c["fits"]:
            bad.append(f"{c['id']} {c['h']}px > {r['lim']:.0f}")
        if c["pos"] != "sticky" or r["band"] is None or abs(c["top"] - (r["band"] + 16)) > 1:
            bad.append(f"{c['id']} is {c['pos']} at top {c['top']}, not the band's top + 16")
        if c["inner"]:
            bad.append(f"{c['id']} scrolls inside: {', '.join(c['inner'])}")
        off = sorted(x for x in c["sizes"] if x not in DOM_SIZES)
        if off:
            bad.append(f"{c['id']} font sizes {off}")
        if not c["np"] or not c["pf"]:
            bad.append(f"{c['id']} phrase {c['np']} proof {c['pf']}")
        if c["meta"]:
            bad.append(f"{c['id']} shows its note line")
    # the custos native layer inside its art box, at each held sample of its station
    g, seen = v.geometry(), 0
    for sid, s in station_samples(g):
        if sid != "custos":
            continue
        f = v.frame_at(s)
        fig = f["figure"]
        if not isinstance(fig, dict) or fig.get("id") != "custos" or not fig.get("art"):
            bad.append(f"custos s {s:.2f}: figure() gave {str(fig)[:60]}")
            continue
        a = fig["art"]
        for q in f.get("natives") or []:
            if q["id"] != "custos":
                continue
            seen += 1
            e = q["ext"]
            out = max(a[0] - e[0], a[1] - e[1], e[2] - a[2], e[3] - a[3], 0)
            if out > 0.5:
                bad.append(f"custos s {s:.2f}: layer {[round(x) for x in e]} vs art {[round(x) for x in a]} ({out:.1f}px out)")
    if not seen:
        bad.append("custos: no native layer at any held sample")
    return not bad, (f"band {r['lim']:.0f}px: {', '.join(hs)}px; custos layer in its art box at {seen} held samples"
                     + (": " + "; ".join(bad[:4]) if bad else ""))


def a_overflow(v):
    worst, nodes, tries = 0.0, set(), []
    pos = [0.0]
    try:
        g = v.geometry()
        pos += [g["stations"][0][1] + 0.2, (g["MAPS"] or g["PULL"]) + 0.15, g["end"]]
    except Missing:
        pass
    for s in pos:
        v.scroll_s(s)
        v.settle(1500)
        r = v.js("""() => { const cw = document.documentElement.clientWidth;
            const sw = document.documentElement.scrollWidth - cw; const y = scrollY;
            __ct.scrollTo(300, y); const sx = scrollX; __ct.scrollTo(0, y);
            const out = [];
            for (const e of document.querySelectorAll('body *')) {
              if (e.tagName === 'CANVAS' || !e.getClientRects().length) continue;
              const cs = getComputedStyle(e); if (cs.visibility !== 'visible') continue;
              if (![...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())) continue;
              const rg = document.createRange(); rg.selectNodeContents(e);
              for (const r of rg.getClientRects()) if (r.width && (r.right > cw + 0.5 || r.left < -0.5)) { out.push(__ct.desc(e) + ' x' + Math.round(r.left) + '..' + Math.round(r.right)); break; }
            }
            return { sw, sx, out }; }""")
        worst = max(worst, r["sw"], r["sx"])
        nodes.update(r["out"])
        tries.append(r["sx"])
    ok = worst <= 0 and not nodes
    return ok, (f"scrollWidth-clientWidth max {worst:g}px, scrollX after a sideways scroll {max(tries):g}px, "
                f"{len(nodes)} text boxes past the edge" + (": " + ", ".join(sorted(nodes)[:3]) if nodes else ""))


def a_notches(v):
    sw = v.wheel_sweep()
    hook = "" if sw["lineHook"] else " (resumeLast hook missing: fell back to the last text in #resume)"
    ok = not sw["stalls"] and sw["reached"] is not None and sw["lineHook"]
    first = f", first at notch {sw['stalls'][0][0]} (y {sw['stalls'][0][1]})" if sw["stalls"] else ""
    return ok, (f"{len(sw['stalls'])} stalls in {sw['notches']} notches; last résumé line on screen at notch "
                f"{sw['reached']}; page bottom {'reached' if sw['bottom'] else 'NOT reached'}{first}{hook}")


PAN_CAP = 250        # CSS px the art may move for one 100px notch in a transit (ruling whip-pan-transits)


def a_pan(v):
    """The art's largest move for one 100px notch in each transit, read from drawn frames: the world grid's origin
    (view().Ox/Oy, device px) at scroll positions 25px apart around the transit's fastest point."""
    g = v.geometry()
    if not v.hook("camAt") or not v.hook("view"):
        raise Missing("__walk.camAt / __walk.view")
    worst, rows = (0, None), []
    for st in g["stations"]:
        tr = g["scenes"].get(st[0] + "-travel")
        if not tr:
            raise Missing(f"no '{st[0]}-travel' scene from sceneId")
        a, b = tr[0]
        # the page's pose function only says where to look; the move is measured on the frames drawn there
        peak = v.js("""(r) => { const S = __walk.S(), h = 50 / S; let m = -1, at = r[0];
            for (let s = r[0] + h; s <= r[1] - h; s += 0.002) { const p = __walk.camAt(s - h), q = __walk.camAt(s + h);
              const d = Math.hypot(q[0] - p[0], q[1] - p[1]) * p[2]; if (d > m) { m = d; at = s; } }
            return at; }""", [a, b])
        ys, got = [round(peak * v.S) + 25 * k for k in range(-4, 5)], []
        for y in ys:
            v.js("y => __ct.scrollTo(0, y)", y)
            v.settle(2500)
            got.append(v.js("() => { const w = __ct.get('view'); return w && [w.Ox, w.Oy, w.pp, w.dpr]; }"))
        v.cur = None
        best = 0
        for i in range(len(ys) - 4):
            p, q = got[i], got[i + 4]
            if not p or not q or p[2] != q[2]:
                continue
            best = max(best, math.hypot(q[0] - p[0], q[1] - p[1]) / p[3])
        rows.append(f"{st[0]} {best:.0f}")
        if best > worst[0]:
            worst = (best, f"{st[0]} at y {ys[0]}..{ys[-1]}")
    ok = worst[0] <= PAN_CAP
    return ok, f"largest art move per 100px notch {worst[0]:.0f} CSS px (<= {PAN_CAP}), {worst[1]}; by transit: {', '.join(rows)}"


def a_length(v):
    sw = v.wheel_sweep()
    t = NOTCH_TARGET[v.name]
    ok = sw["reached"] is not None and sw["reached"] <= t and sw["lineHook"]
    return ok, f"{sw['reached']} notches of 100px to the last résumé line (target <= {t})" + ("" if sw["lineHook"] else ", resumeLast hook missing")


def a_monotonic(v):
    sw = v.wheel_sweep()
    steps = [r["step"] for r in sw["rec"]]
    if any(s is None for s in steps):
        raise Missing("__walk.view().step is absent")
    dec = [(i + 1, steps[i - 1], steps[i]) for i in range(1, len(steps)) if steps[i] < steps[i - 1]]
    return not dec, f"rendered step decreased {len(dec)}x over {len(steps)} downward notches (0 -> {max(steps)})" + (f", first {dec[0]}" if dec else "")


def a_scrollto(v):
    v.wheel_sweep()
    calls = v.stat()["scrollCalls"]
    return not calls, f"{len(calls)} page-initiated scrolls outside a click" + (": " + "; ".join(c["name"] + " during " + str(c["during"]) for c in calls[:3]) if calls else "")


RESIZE_TO = {"desktop": [(1024, 768), (1440, 700), (1440, 900)], "phone": [(844, 390), (390, 844)]}


def a_resize(v):
    """Resizing or rotating keeps the visitor's place: at a transit, at each hold and in the résumé, the scene after
    the resize is the scene before it, at the same fraction through it (within 0.04), and a document line at the strip
    stays there (within 24px). The page scrolls itself at most once per resize to get there. Own context."""
    w = View(v.run, v.name, mode="plain")
    try:
        w.need_walk()
        g = w.geometry()
        base = (w.vw, w.vh)
        pts = []
        for st in g["stations"]:
            sid, A, E = st[0], st[1], st[2]
            pts += [(sid, A + 0.35 * (E - A)), (sid, E - 0.08 * (E - A))]
        pts.insert(1, ("travel", g["stations"][1][1] - 0.12))
        FR = """() => { const S = __walk.S(), s = scrollY / S, id = __walk.sceneId(s), st = __walk.stations;
            for (const [k, a, e] of st) { if (id === k) return [id, (s - a) / (e - a)]; }
            for (let i = 0; i < st.length; i++) { const [k, a] = st[i], f = i ? st[i - 1][2] : null;
              if (id === k + '-travel' && f !== null) return [id, (s - f) / (a - f)]; }
            return [id, s]; }"""
        bad, n = [], 0
        for sid, s in pts:
            for size in RESIZE_TO[v.name]:
                w.page.set_viewport_size({"width": base[0], "height": base[1]})
                w.page.wait_for_timeout(250)
                w.S = w.js("__walk.S()")
                w.scroll_s(s)
                w.settle(1200)
                before = w.js(FR)
                w.js("() => { __ct.resizeScrolls = 0; }")
                w.page.set_viewport_size({"width": size[0], "height": size[1]})
                w.page.wait_for_timeout(400)
                w.settle(1200)
                after, rs = w.js(FR), w.js("__ct.resizeScrolls || 0")
                n += 1
                if after[0] != before[0] or abs(after[1] - before[1]) > 0.04 or rs > 1:
                    bad.append(f"{before[0]} {before[1]:.3f} -> {size[0]}x{size[1]}: {after[0]} {after[1]:.3f} ({rs} scrolls)")
        # the document: the line under the strip stays under it
        w.page.set_viewport_size({"width": base[0], "height": base[1]}); w.page.wait_for_timeout(250)
        y = w.js("() => { const r = document.querySelector('#resume li'); return r.getBoundingClientRect().top + scrollY - 120; }")
        w.js("y => __ct.scrollTo(0, y)", y); w.settle(800)
        # the line first under the strip before the resize, found again by its place in the document after it
        Q = "#doc h2, #doc h3, #doc p, #doc li, #doc dt, #doc dd, #doc tr"
        LINE = """q => { const els = document.querySelectorAll(q);
            for (let i = 0; i < els.length; i++) { const r = els[i].getBoundingClientRect(); if (r.height && r.bottom > 40) return [i, els[i].textContent.trim().slice(0, 40), r.top]; } return null; }"""
        AT = """([q, i]) => { const e = document.querySelectorAll(q)[i]; return e ? [i, e.textContent.trim().slice(0, 40), e.getBoundingClientRect().top] : null; }"""
        for size in RESIZE_TO[v.name]:
            w.page.wait_for_timeout(500)               # the page reads its line when idle
            before = w.js(LINE, Q)
            w.page.set_viewport_size({"width": size[0], "height": size[1]}); w.page.wait_for_timeout(400); w.settle(600)
            after = w.js(AT, [Q, before[0]]) if before else None
            n += 1
            if not before or not after or abs(after[2] - before[2]) > 24:
                bad.append(f"résumé {before} -> {size[0]}x{size[1]}: {after}")
        m = f"{n - len(bad)} of {n} resizes kept the scene, the fraction through it and the résumé line"
        return not bad, m + ("; " + "; ".join(bad[:3]) if bad else "")
    finally:
        w.close()


def a_landcards(v):
    """A phone on its side: at every hold the chapter's card sits in the text column, clear of the art box, and a
    card short enough for the column (its height <= the viewport - 64) is wholly between the strip and the bottom."""
    g = v.geometry()
    bad, n, tall, badf = [], 0, [], set()
    for sid, s in station_samples(g):
        f = v.frame_at(s, here=True)
        fig = f.get("figure")
        r = v.js("""id => { const c = __walk.cards().find(x => x.id === id); if (!c) return null;
            const b = c.el.getBoundingClientRect(), cs = getComputedStyle(c.el); return [b.left, b.top, b.right, b.bottom, cs.position, +getComputedStyle(c.el).opacity]; }""", sid)
        n += 1
        if not r or not isinstance(fig, dict) or not fig.get("art"):
            bad.append(f"{sid} s {s:.2f}: no card or no art box")
            continue
        if r[2] > fig["art"][0] + 0.5:
            bad.append(f"{sid} s {s:.2f}: card right {r[2]:.0f} past the art box left {fig['art'][0]:.0f}")
        h = r[3] - r[1]
        if h <= v.vh - 64:
            if r[4] != "sticky" or r[1] < 40 - 0.5 or r[3] > v.vh + 0.5:
                bad.append(f"{sid} s {s:.2f}: card {r[4]} at {r[1]:.0f}..{r[3]:.0f} in a {v.vh}px viewport")
        else:
            tall.append(f"{sid} {h:.0f}px")
        if bad and bad[-1].startswith(f"{sid} s {s:.2f}"):
            badf.add(s)
    m = f"{n - len(badf)} of {n} held frames with the card in its column and whole" + (f"; taller than the column, foot-sticky: {', '.join(sorted(set(tall)))}" if tall else "")
    return not bad, m + ("; " + "; ".join(bad[:2]) if bad else "")


def a_quotes(v):
    """Typeset quotes only: no U+0027 or U+0022 in the page's visible text, nor in any caption line it draws."""
    v.need_walk()
    r = v.js("""() => { const out = []; const t = document.body.innerText;
        for (const m of t.matchAll(/['"]/g)) out.push(t.slice(Math.max(0, m.index - 24), m.index + 12).replace(/\\s+/g, ' '));
        const end = (document.documentElement.scrollHeight - innerHeight) / __walk.S();
        for (let s = 0; s <= end; s += 0.02) { const i = __walk.instrAt(s) || ''; if (/['"]/.test(i)) out.push('caption: ' + i); }
        return [...new Set(out)]; }""")
    return not r, f"{len(r)} straight quotes in visible text and caption lines" + (": " + "; ".join(r[:3]) if r else "")


def a_stripname(v):
    """The strip takes the name as the hero's name goes: within 0.03 screen of the s at which the h1's bottom passes
    under the strip (desktop) or the art band (phone), the strip is unnamed just before and named just after."""
    v.need_walk()
    edge = v.band if v.phone else 40
    y0 = v.js("() => { const h = document.querySelector('.hero h1'); return h.getBoundingClientRect().bottom + scrollY; }")
    v.scroll_s(3.0); v.settle(600)
    yb = v.js("() => document.querySelector('.hero h1').getBoundingClientRect().bottom + scrollY")   # sticky: read where it is now
    v.scroll_s(0); v.settle(600)
    # the hero sticks through the lock, then scrolls: find the crossing by bisection on s
    lo, hi = 0.0, 6.0
    for _ in range(14):
        mid = (lo + hi) / 2
        v.scroll_s(mid); v.settle(300)
        if v.js("() => document.querySelector('.hero h1').getBoundingClientRect().bottom") > edge:
            lo = mid
        else:
            hi = mid
    cross = hi
    got = []
    for ds in (-0.03, 0.03):
        v.scroll_s(cross + ds); v.settle(500)
        got.append(v.js("() => document.getElementById('strip').classList.contains('named')"))
    ok = got == [False, True]
    return ok, f"h1 passes y {edge:.0f} at s {cross:.3f}; strip named {got[0]} at s-0.03 and {got[1]} at s+0.03"


def a_cardband(v):
    g = v.geometry()
    z = v.zone()
    # Two frames per sample: the page sets a card's visibility from its scroll handler, which runs only
    # when a frame lets the scroll event through. Reading in the same task would see the previous state.
    r = v.js("""async (a) => { const S = __walk.S(), step = 0.01, out = []; let run = 0, worst = 0, at = null, start = 0;
        for (let s = 0; s < a.end; s += step) { __ct.scrollTo(0, Math.round(s * S)); await __ct.raf(); await __ct.raf();
          const c = __ct.zoneCard(a.z0, a.z1);
          if (c.id === null) { if (!run) start = s; run += step; if (run > worst) { worst = run; at = start; } } else run = 0; out.push(c.id); }
        const ids = [...new Set(out.filter(x => x))]; return { worst, at, ids, n: out.length, hook: __ct.cards().hook }; }""",
             {"end": g["PULL"], "z0": z[0], "z1": z[1]})
    v.cur = None
    ok = r["worst"] <= 0.1 + 1e-9 and r["hook"] and len(r["ids"]) > 1
    exempt = (g["MAPS"] or g["PULL"]) - g["PULL"]
    return ok, (f"longest card-free band {r['worst']:.2f} screen" + (f" from s {r['at']:.2f}" if r["at"] is not None and r["worst"] > 0.1 else "")
                + f" over s 0-{g['PULL']:.2f} in zone y {z[0]:.0f}-{z[1]:.0f}; cards seen {','.join(r['ids'])}"
                + f"; pull-back exempt {exempt:.2f} screen" + ("" if r["hook"] else "; cards hook missing (fell back to .hero/.card)")
                + (" (PULL hook missing: used last hold end)" if g["PULL_fallback"] else ""))


def a_holdzone(v):
    """During each hold and the lock, the card being read is the only card showing in the reading zone."""
    g = v.geometry()
    z = v.zone()
    holds = [("lock", a, b) for a, b in g["scenes"].get("lock", [])] + [(st[0], st[1], st[2]) for st in g["stations"]]
    if not holds or not g["scenes"].get("lock"):
        raise Missing("no 'lock' scene from sceneId")
    bad, n, worst = [], 0, (0, None)
    for hid, a, b in holds:
        for i in range(6):
            s = a + (b - a) * (i + 0.5) / 6
            v.scroll_s(s)
            # the fade is 240ms: wait it out, so a card mid-fade is not read as either state
            r = v.js("""async (a) => { await __ct.raf(); await __ct.raf(); await new Promise(r => setTimeout(r, 320));
                const st = __ct.stuckCard(a.z0, a.z1), out = [];
                for (const c of __ct.cards().list) {
                  const r = c.el.getBoundingClientRect(), cs = getComputedStyle(c.el), o = Math.min(r.bottom, a.z1) - Math.max(r.top, a.z0);
                  if (o > 0 && r.height && cs.visibility === 'visible' && +cs.opacity > 0) out.push([c.id, Math.round(o), +(+cs.opacity).toFixed(2)]);
                }
                return { stuck: st.id, how: st.how, shown: out }; }""", {"z0": z[0], "z1": z[1]})
            n += 1
            want = "hero" if hid == "lock" else hid
            extra = [x for x in r["shown"] if x[0] != want]
            if r["stuck"] != want or extra:
                bad.append(f"{hid} s {s:.2f}: read {r['stuck']} ({r['how']}), also showing "
                           + (", ".join(f"{x[0]} {x[1]}px at opacity {x[2]}" for x in extra) or "nothing"))
                for x in extra:
                    if x[1] > worst[0]:
                        worst = (x[1], f"{x[0]} beside {hid} at s {s:.2f}")
    v.cur = None
    m = (f"{len(bad)} of {n} samples over the lock and {len(g['stations'])} holds with a card other than the one being "
         f"read showing in zone y {z[0]:.0f}-{z[1]:.0f}" + (f"; worst {worst[0]}px, {worst[1]}" if worst[1] else ""))
    if bad:
        m += ": " + "; ".join(bad[:2])
    return not bad, m


def a_rise(v):
    """No card fades in (spec T11): until the figure before it dims (hold end + 0.05), each card is wholly below the
    fold, and it is never at opacity under 1 nor given an opacity transition."""
    g = v.geometry()
    lock = g["scenes"].get("lock")
    if not lock:
        raise Missing("no 'lock' scene from sceneId")
    # the lock's end to the scroll px: the scene table is sampled every 0.01
    prev = v.js("""(b) => { let a = b - 0.011, c = b + 0.001; for (let i = 0; i < 40; i++) { const m = (a + c) / 2;
        if (__walk.sceneId(m) === 'lock') a = m; else c = m; } return c; }""", lock[-1][1])
    bad, low = [], []
    for st in g["stations"]:
        for f in (0.0, 0.5, 0.98):
            s = prev + 0.05 * f
            v.scroll_s(s)
            v.settle(1500)
            r = v.js("""(id) => { const c = __ct.cards().list.find(x => x.id === id); if (!c) return null;
                const b = c.el.getBoundingClientRect(), cs = getComputedStyle(c.el);
                return { top: b.top, ih: innerHeight, op: +cs.opacity, tr: cs.transitionProperty, dur: cs.transitionDuration }; }""", st[0])
            if r is None:
                raise Missing(f"no card '{st[0]}' in __walk.cards()")
            low.append(r["top"] - r["ih"])
            fade = r["op"] < 1 or (any(x in r["tr"] for x in ("opacity", "all")) and any(float(d[:-1] or 0) > 0 for d in r["dur"].split(",")))
            if r["top"] < r["ih"] - 0.5 or fade:
                bad.append(f"{st[0]} at s {s:.3f}: top {r['top']:.0f} of {r['ih']}, opacity {r['op']}"
                           + (f", transition {r['tr']} {r['dur']}" if fade else ""))
        prev = st[2]
    v.cur = None
    return not bad, (f"{len(bad)} of {len(low)} samples before the figure ahead dims with the next card above the fold or fading; "
                     f"closest card top {min(low):+.0f}px from the fold" + (": " + "; ".join(bad[:3]) if bad else ""))


DIFF_JS = r"""
async ([a, b]) => {
  // CSS pixels that differ between two viewport screenshots (any channel by more than 8)
  const load = async s => { const r = await fetch('data:image/png;base64,' + s); const bm = await createImageBitmap(await r.blob());
    const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height); };
  const A = await load(a), B = await load(b);
  if (A.width !== B.width || A.height !== B.height) return { n: -1 };
  let n = 0; const p = A.data, q = B.data;
  for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) > 8 || Math.abs(p[i + 1] - q[i + 1]) > 8 || Math.abs(p[i + 2] - q[i + 2]) > 8) n++;
  return { n, w: A.width, h: A.height };
}
"""
FIRST_NOTCH_FLOOR = 0.00075   # share of the viewport's CSS px a hold's first 100px notch must change (972px at 1440x900)


def a_firstnotch(v):
    """The first 100px notch inside each hold visibly moves the figure: screenshots at the hold's start and 100px on,
    both settled, differ by at least FIRST_NOTCH_FLOOR of the viewport. A share, since a phone's figures are a quarter
    of the area: at 390x844 the floor is 247px, where the old custos timing measured 326, so on a phone `custos` is the guard."""
    import base64
    g = v.geometry()
    rows, bad = [], []
    for st in g["stations"]:
        shots = []
        for y in (round(st[1] * v.S) + 1, round(st[1] * v.S) + 101):
            v.js("y => __ct.scrollTo(0, y)", y)
            v.settle(2500)
            v.page.wait_for_timeout(260)             # instruction crossfades run on real time
            shots.append(base64.b64encode(v.page.screenshot(scale="css")).decode())
        r = v.js(DIFF_JS, shots)
        floor = FIRST_NOTCH_FLOOR * r["w"] * r["h"]
        rows.append(f"{st[0]} {r['n']}")
        if r["n"] < floor:
            bad.append(st[0])
    v.cur = None
    return not bad, (f"CSS px changed by each hold's first notch (>= {floor:.0f}, {FIRST_NOTCH_FLOOR:.3%} of the viewport): "
                     f"{', '.join(rows)}" + (f"; under the floor: {', '.join(bad)}" if bad else ""))


CUSTOS_SPAN = 0.3          # screens: the verdict and the stop each stay on screen at least this long


def a_custos(v):
    """custos's payoff is held, not flashed: 'contradicted' and the 'blocked' chip are each on screen for at least
    CUSTOS_SPAN screen, and the caption names pink only while the claim is drawn pink."""
    g = v.geometry()
    st = [x for x in g["stations"] if x[0] == "custos"]
    if not st:
        raise Missing("no custos station")
    a, e = st[0][1], st[0][2]
    seen = {"contradicted": [], "blocked": []}
    early_pink = []
    s = a
    while s <= min(e + 0.3, g["MAPS"] or e + 0.3):
        v.scroll_s(s)
        v.settle(1500)
        r = v.js("""() => { const L = document.querySelector('[data-native="custos"]'); if (!L) return null;
            const out = {}, ih = innerHeight, band = __ct.get('PULL') !== undefined ? null : null;
            for (const p of L.querySelectorAll('p[data-run]')) {
              const t = p.textContent.trim(), k = t.startsWith('contradicted') ? 'contradicted' : t === 'blocked' ? 'blocked' : null;
              if (!k) continue;
              const b = p.getBoundingClientRect(), cs = getComputedStyle(p);
              out[k] = cs.visibility === 'visible' && p.checkVisibility() && b.height > 0 && b.top >= 0 && b.bottom <= ih;
            }
            const cap = __walk.instrAt(scrollY / __walk.S()), u = __walk.shown();
            return { out, cap }; }""")
        if r is None:
            raise Missing("no [data-native=custos] layer")
        for k in seen:
            if r["out"].get(k):
                seen[k].append(s)
        if "pink" in r["cap"] and not seen["contradicted"]:
            early_pink.append(round(s, 3))             # the caption promises pink before the claim is drawn pink
        s += 0.01
    v.cur = None
    spans = {k: (len(x) * 0.01) for k, x in seen.items()}
    bad = [k for k, x in spans.items() if x < CUSTOS_SPAN - 1e-9]
    m = ", ".join(f"'{k}' on screen {x:.2f} screen" + (f" (s {seen[k][0]:.2f}-{seen[k][-1]:.2f})" if seen[k] else "") for k, x in spans.items())
    m += f" (>= {CUSTOS_SPAN}); caption names pink before the verdict at {len(early_pink)} samples" + (f" from s {early_pink[0]}" if early_pink else "")
    return not bad and not early_pink, m


def a_places(v):
    """Through the pull-back and the map, no shown place row's text crosses a card's text (rects of text, not boxes)."""
    g = v.geometry()
    a, b = g["PULL"], (g["DOCS"] or g["PULL"] + 0.73) + 0.25
    hits, n, s, shown = [], 0, a, 0
    while s <= b + 1e-9:
        v.scroll_s(s)
        v.settle(1500)
        r = v.js("""async () => { await new Promise(r => setTimeout(r, 230));            // the rows' 200ms fade runs on real time
            const P = document.getElementById('places'); if (!P) return null;
            const op = +getComputedStyle(P).opacity, txt = el => { const out = [];
              const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let nd;
              while ((nd = w.nextNode())) { const pe = nd.parentElement;
                if (!nd.nodeValue.trim() || pe.closest('.sr-only') || !pe.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
                const rg = document.createRange(); rg.selectNodeContents(nd);
                for (const q0 of rg.getClientRects()) { const q = clip(q0, pe);   // read-not-shown text (a 1px clipped box) paints nothing
                  if (q[2] - q[0] > 1 && q[3] - q[1] > 1 && q[3] > 0 && q[1] < innerHeight) out.push(q); } }
              return out; };
            function clip(q, pe) { let l = q.left, t = q.top, r = q.right, b = q.bottom;
              for (let a = pe; a && a !== document.documentElement; a = a.parentElement) { const c = getComputedStyle(a);
                if (c.overflowX === 'visible' && c.overflowY === 'visible') continue;
                const z = a.getBoundingClientRect(); l = Math.max(l, z.left); t = Math.max(t, z.top); r = Math.min(r, z.right); b = Math.min(b, z.bottom); }
              return [l, t, r, b]; }
            if (op <= 0.01) return { op, hits: [] };
            const rows = [...P.querySelectorAll('.place')].filter(e => getComputedStyle(e).visibility === 'visible');
            const cards = __ct.cards().list.filter(c => +getComputedStyle(c.el).opacity > 0), hits = [];
            for (const e of rows) for (const q of txt(e)) for (const c of cards) for (const k of txt(c.el)) {
              const w = Math.min(q[2], k[2]) - Math.max(q[0], k[0]), h = Math.min(q[3], k[3]) - Math.max(q[1], k[1]);
              if (w > 0.5 && h > 0.5) hits.push([e.textContent.trim().slice(0, 24), c.id, Math.round(w), Math.round(h)]);
            }
            return { op, hits }; }""")
        if r is None:
            raise Missing("no #places")
        n += 1
        if r["op"] > 0.01:
            shown += 1
        for h in r["hits"]:
            hits.append(f"s {s:.2f}: '{h[0]}' over {h[1]} by {h[2]}x{h[3]}")
        s += 0.02
    v.cur = None
    return not hits, (f"{len(hits)} place-row/card text crossings over {n} samples of s {a:.2f}-{b:.2f} (rows shown at {shown})"
                      + (": " + "; ".join(hits[:3]) if hits else ""))


def station_samples(g):
    out = []
    for st in g["stations"]:
        sid, A, E = st[0], st[1], st[2]
        for s in (A + 0.06, (A + E) / 2, E - 0.03):
            out.append((sid, s))
    return out


def a_station(v):
    g = v.geometry()
    if not v.hook("built"):
        miss = "__walk.built() is absent"
    else:
        miss = None
    bad, n, seen, by_overlap = [], 0, [], 0
    for sid, s in station_samples(g):
        f = v.frame_at(s, census=True)
        n += 1
        built = f["built"] if miss is None else None
        # the card being read during a hold is the one stuck at its sticky top, not the one overlapping most
        zid = f["stuck"]["id"]
        if f["stuck"]["how"] != "stuck":
            by_overlap += 1
        seen.append(zid)
        good = (built == sid and zid == sid and f["scene"] == sid) if miss is None else (zid == sid and f["scene"] == sid)
        if f["stepView"] is not None and f["stepAtShown"] is not None and f["stepView"] != f["stepAtShown"]:
            good = False
        if not good:
            bad.append(f"s {s:.2f}: built {built} card {zid} ({f['stuck']['how']}) scene {f['scene']} step {f['stepView']}/{f['stepAtShown']}")
    m = (f"{len(bad)} of {n} held samples where built station, card in the reading zone and scene disagree; "
         f"card = the one stuck at its sticky top" + (f", by overlap at {by_overlap} (no card stuck)" if by_overlap else ""))
    if bad:
        m += ": " + "; ".join(bad[:2])
    if miss:
        return False, m + f" ({miss}; measured card vs sceneId only)"
    return not bad, m


def resolve(v, values):
    return v.js(RESOLVE_JS, sorted(set(values)))


def classify(rgba, allowed):
    if rgba is None:
        return "unparsed"
    r, g, b, a = rgba
    if a == 0:
        return "transparent"
    for name, t in allowed.items():
        tol = 0 if a == 255 else 3
        if abs(r - t[0]) <= tol and abs(g - t[1]) <= tol and abs(b - t[2]) <= tol:
            return name if a == 255 else name + "@alpha"
    return None


def style_samples(v):
    """The landing, three points in every station's hold (so each native layer is on screen at an early, a
    middle and a late u), the map and the bottom."""
    try:
        g = v.geometry()
        return [0.05] + [s for _, s in station_samples(g)] + [(g["MAPS"] or g["PULL"]) + 0.15, g["end"]]
    except Missing:
        return [0.05, None]


def merge_counts(dst, src):
    for k, e in src.items():
        d = dst.setdefault(k, {"n": 0, "ex": []})
        d["n"] += e["n"]
        d["ex"] = (d["ex"] + e["ex"])[:2]


def collect_styles(v):
    if "styles" in v.cache:
        return v.cache["styles"]
    st = {"colors": {}, "sizes": {}, "ncolors": {}, "nsizes": {}, "vars": None, "n": 0, "nn": 0, "npos": 0, "pos": 0}
    for s in style_samples(v):
        if s is None:
            v.js("() => __ct.scrollTo(0, document.documentElement.scrollHeight)")
        else:
            v.scroll_s(s)
        v.settle(1500)
        r = v.js(STYLES_JS.replace("%TOKNAMES%", json.dumps(list(TOKENS))).replace("%NATIVE%", NATIVE_SEL))
        st["n"] += r["n"]
        st["nn"] += r["nn"]
        st["pos"] += 1
        st["npos"] += 1 if r["nn"] else 0
        st["vars"] = r["vars"]
        for b in ("colors", "sizes", "ncolors", "nsizes"):
            merge_counts(st[b], r[b])
    v.cache["styles"] = st
    return st


def a_colours(v):
    st = collect_styles(v)
    colors, ncolors, varsv, n = st["colors"], st["ncolors"], st["vars"], st["n"]
    res = resolve(v, list(colors) + list(ncolors))
    bad, pink, unresolved = [], [], 0
    for val, e in colors.items():
        c = classify(res.get(val), TOK_RGB)
        if c == "transparent":
            continue
        is_halo = c == "trail@alpha" and all(x.startswith("box-shadow") for x in e["ex"])
        if c is None or c == "unparsed" or (c.endswith("@alpha") and not is_halo):
            bad.append(f"{val} x{e['n']} ({e['ex'][0]})")
        elif c in TRAIL_FAMILY:
            pink.append(f"{c} x{e['n']} ({e['ex'][0]})")
    # Native figure layers: the same token table, no alpha at all. --trail is allowed there because it is the
    # figure's 'unresolved' state (a drawdown, a contradicted claim); the two aged trail steps are the ant's
    # output and are not.
    for val, e in ncolors.items():
        c = classify(res.get(val), TOK_RGB)
        if c == "transparent":
            continue
        if c is None or c == "unparsed" or c.endswith("@alpha"):
            bad.append(f"{val} x{e['n']} (native: {e['ex'][0]})")
        elif c == "trail":
            unresolved += e["n"]
        elif c in TRAIL_FAMILY:
            pink.append(f"{c} x{e['n']} (native, only --trail may mark 'unresolved': {e['ex'][0]})")
    # :root must carry the table itself
    var_res = resolve(v, [x for x in varsv.values() if x])
    var_bad = [f"--{k}:{varsv.get(k) or 'unset'}" for k in TOKENS
               if (var_res.get(varsv[k]) if varsv.get(k) else None) != list(TOK_RGB[k]) + [255]]
    # CSSOM literals, including states and media not on screen now
    hits = v.js(CSSOM_JS)
    lit_res = resolve(v, [h["lit"] for h in hits])
    css_bad = []
    for h in hits:
        allowed = dict(TOK_RGB)
        if "prefers-contrast" in h["media"]:
            allowed.update({k + "-more": c for k, c in CON_RGB.items()})
        c = classify(lit_res.get(h["lit"]), allowed)
        halo = c == "trail@alpha" and "shadow" in h["p"]
        if c is None or c == "unparsed" or (c.endswith("@alpha") and not halo):
            css_bad.append(f"{h['lit']} in {h['sel']} {{{h['p']}}}" + (f" @media {h['media']}" if h["media"] else ""))
    css_bad = sorted(set(css_bad))
    ok = not bad and not pink and not var_bad and not css_bad
    m = (f"{len(bad)} off-token computed colours, {len(pink)} pink uses in DOM, {len(var_bad)} :root tokens wrong or missing, "
         f"{len(css_bad)} off-token literals in stylesheets ({n} elements over {st['pos']} positions; "
         + (f"native layers {st['nn']} elements at {st['npos']} positions, {unresolved} --trail uses as unresolved)"
            if st["nn"] else "no native layer on screen)"))
    if bad:
        m += "; e.g. " + "; ".join(bad[:2])
    if pink and not bad:
        m += "; e.g. " + "; ".join(pink[:2])
    if css_bad and not bad:
        m += "; e.g. " + "; ".join(css_bad[:2])
    if var_bad and not bad and not css_bad:
        m += "; e.g. " + ", ".join(var_bad[:3])
    return ok, m


def a_fontsizes(v):
    st = collect_styles(v)
    dom_bad = []
    for bucket, tag in (("sizes", ""), ("nsizes", "native: ")):
        for k, e in st[bucket].items():
            px = float(k.replace("px", ""))
            if not any(abs(px - a) < 0.01 for a in DOM_SIZES):
                dom_bad.append(f"{k} x{e['n']} ({tag}{e['ex'][0]})")
    cv = v.stat()["cv"] or {}
    cvt, nvt = cv.get("text", {}), cv.get("ntext", {})
    can_bad = [f"{k}px x{e['n']} ('{e['ex']}')" for k, e in cvt.items() if not any(abs(float(k) - a) < 0.35 for a in CANVAS_SIZES)]
    can_bad += [f"{k}px x{e['n']} (native canvas: '{e['ex']}')" for k, e in nvt.items() if not any(abs(float(k) - a) < 0.35 for a in DOM_SIZES)]
    seen = sorted({float(k.replace('px', '')) for k in st["sizes"]})
    nseen = sorted({float(k.replace('px', '')) for k in st["nsizes"]})
    ok = not dom_bad and not can_bad
    m = (f"DOM sizes {','.join(f'{x:g}' for x in seen)}"
         + (f", native layers {','.join(f'{x:g}' for x in nseen)}" if nseen else ", no native layer text on screen")
         + f" -> {len(dom_bad)} outside the set; canvas text sizes {','.join(sorted(cvt)) or 'none'}"
         + (f", native canvas {','.join(sorted(nvt))}" if nvt else "") + f" -> {len(can_bad)} outside the set")
    if dom_bad or can_bad:
        m += "; e.g. " + "; ".join((dom_bad + can_bad)[:2])
    return ok, m


def a_fills(v):
    v.wheel_sweep()
    cv = v.stat()["cv"]
    if not cv:
        return False, "canvas hooks not installed"
    styles = list(cv["fill"]) + list(cv["stroke"])
    res = resolve(v, [s for s in styles if s.startswith(("#", "rgb"))])
    bad = []
    for bucket in ("fill", "stroke"):
        for val, e in cv[bucket].items():
            if val in ("CanvasGradient", "CanvasPattern"):
                continue
            c = classify(res.get(val), TOK_RGB)
            if c is None or c == "unparsed" or c.endswith("@alpha"):
                bad.append(f"{bucket}Style {val} x{e['n']}")
    stops_res = resolve(v, list(cv["stops"]))
    for val, e in cv["stops"].items():
        c = classify(stops_res.get(val), TOK_RGB)
        if c not in ("trail", "trail@alpha", "transparent"):
            bad.append(f"gradient stop {val} (only the --trail halo may carry alpha)")
    put_bad = []
    for k in cv["put"]:
        u = int(k)
        r, g_, b, a = u & 255, (u >> 8) & 255, (u >> 16) & 255, (u >> 24) & 255
        if u == 0:
            continue
        if a != 255 or (r, g_, b) not in RGB_NAME:
            put_bad.append(f"#{r:02x}{g_:02x}{b:02x}/{a}")
    glow = len(cv["glow"]) + len(cv["filter"])
    ok = not bad and not put_bad and not glow and (cv["fill"] or cv["put"])
    m = (f"{len(styles)} distinct fill/stroke styles, {len(bad)} off-token; {len(cv['put'])} distinct bitmap values, "
         f"{len(put_bad)} not packed tokens; {glow} shadow/filter uses")
    if bad or put_bad:
        m += "; e.g. " + "; ".join((bad + put_bad)[:3])
    return ok, m


def a_pitch(v):
    if v.name == "desktop-125":
        v.need_walk()
        # scrolled, not wheeled, at 0.04 screen: view().pp is read at every sample, as the wheel run reads it per notch
        pps = v.js("""async (S) => { const end = (document.documentElement.scrollHeight - innerHeight), out = [];
            for (let y = 0; y <= end; y += Math.round(S * 0.04)) { __ct.scrollTo(0, y); await __ct.raf(); await __ct.raf();
              let p = null; try { const w = __ct.get('view'); p = w ? w.pp : null; } catch (e) {} out.push(p); }
            return out; }""", v.S)
        v.settle(2500)
    else:
        sw = v.wheel_sweep()
        pps = [r["pp"] for r in sw["rec"]]
    st = v.stat()["cv"]
    back = v.js("""() => { const c = __ct.artCanvas(); if (!c) return null; const r = c.getBoundingClientRect();
        return { w: c.width, h: c.height, cw: r.width, ch: r.height, l: r.left, t: r.top, dpr: devicePixelRatio }; }""")
    nonint = [p for p in pps if p is None or abs(p - round(p)) > 1e-9]
    bs_ok = back and abs(back["w"] - round(back["cw"] * back["dpr"])) <= 0 and abs(back["h"] - round(back["ch"] * back["dpr"])) <= 0 \
        and abs(back["l"]) < 1e-6 and abs(back["t"]) < 1e-6
    db = [b for b in st["drawBad"] if b] if st else []
    rb = [b for b in st["rectBad"] if b] if st else []
    ndb = len(st["drawBad"]) if st else 0
    nrb = len(st["rectBad"]) if st else 0
    ok = bool(st) and st["draws"] > 0 and not ndb and not nrb and not nonint and bs_ok
    scales = ",".join(sorted(st["scales"], key=lambda x: float(x.split("x")[0]))) if st else "?"
    m = (f"{st['draws'] if st else 0} blits at scales {{{scales}}}, {ndb} off-grid; {st['rects'] if st else 0} rects, {nrb} off-grid; "
         f"view().pp non-integer at {len(nonint)} of {len(pps)} {'samples' if v.name == 'desktop-125' else 'notches'}; backing "
         + (f"{back['w']}x{back['h']} for {back['cw']:g}x{back['ch']:g} css @{back['dpr']:g} at {back['l']:g},{back['t']:g}" if back else "no canvas"))
    if db or rb:
        m += "; e.g. " + "; ".join((db + rb)[:2])
    return ok, m


def chaos_samples(g):
    r = g["scenes"].get("chaos")
    if not r:
        return []
    a, b = r[0][0], r[-1][1]
    return [a + (b - a) * f for f in (0.15, 0.35, 0.55, 0.75, 0.95)]


def a_pink(v):
    """Chaos: counted over world cells through cellTok/cellAt, never pixels, so the halo is never a lit
    cell; at least 95% of lit cells are trail-family. Holds: a visual share. Bright --trail pixels in a
    screenshot of the whole viewport (canvas, DOM and native layers together, the ant's head trail
    included) are at most 1.5% of its area. The share of --trail among the ant's lit cells is printed
    beside it as a diagnostic, not a verdict: once figures resolve into native layers their cells leave
    the census, so a cell share rises while the pink on screen does not."""
    import base64
    g = v.geometry()
    ch = chaos_samples(g)
    if not ch:
        return False, "sceneId never returns 'chaos'"
    worst_chaos, worst_hold, bad, hidden, at_hold, cell_worst = 1.0, 0.0, [], 0, None, (0.0, None)

    def cells(s, here=False):
        c = v.frame_at(s, census=True, here=here).get("cells")
        if not isinstance(c, dict):
            raise Missing(f"world-cell census failed: {c}")
        if c.get("missing"):
            raise Missing(c["missing"])
        return c
    for s in ch:
        c = cells(s)
        hidden += c["hidden"]
        fam = sum(c["tokens"].get(k, 0) for k in TRAIL_FAMILY)
        fr = fam / c["lit"] if c["lit"] else 0.0
        worst_chaos = min(worst_chaos, fr)
        if not c["lit"]:
            bad.append(f"chaos s {s:.2f}: no lit cell on screen")
        elif fr < 0.95:
            other = sorted(((n, k) for k, n in c["tokens"].items() if k not in TRAIL_FAMILY), reverse=True)[:2]
            bad.append(f"chaos s {s:.2f} {fr:.1%} trail-family of {c['lit']} cells (other {', '.join(f'{k} {n}' for n, k in other)})")
    holds = station_samples(g)
    for sid, s in holds:
        c = cells(s, here=True)
        hidden += c["hidden"]
        if c["lit"]:
            cf = c["ant"].get("trail", 0) / c["lit"]
            if cf >= cell_worst[0]:
                cell_worst = (cf, f"{sid} s {s:.2f}")
        png = base64.b64encode(v.page.screenshot()).decode()
        r = v.js(PINK_SHARE_JS, [png, list(TOK_RGB["trail"]), PINK_TOL])
        share = r["n"] / (r["w"] * r["h"])
        if share >= worst_hold:
            worst_hold, at_hold = share, (sid, s, r)
        if share > HOLD_PINK_CAP:
            bb = [round(q / v.dpr) for q in r["bbox"]]
            bad.append(f"{sid} s {s:.2f}: {share:.2%} of the viewport bright --trail ({r['n']} of {r['w']}x{r['h']} device px, "
                       f"within css {bb[0]},{bb[1]}-{bb[2]},{bb[3]})")
    m = (f"chaos min {worst_chaos:.1%} trail-family over {len(ch)} frames (>= 95%); holds max {worst_hold:.2%} of the viewport "
         f"bright --trail over {len(holds)} frames (<= {HOLD_PINK_CAP:.1%})"
         + (f", worst {at_hold[0]} s {at_hold[1]:.2f} ({at_hold[2]['n']} device px, {at_hold[2]['exact']} exact)" if at_hold else "")
         + f"; ant-output --trail cell share max {cell_worst[0]:.1%}" + (f" at {cell_worst[1]}" if cell_worst[1] else "")
         + f" (diagnostic); world cells via cellTok/cellAt, {hidden} lit cells not on screen as cells")
    if bad:
        m += "; " + "; ".join(bad[:2])
    return not bad, m


def phone_samples(g):
    sc = g["scenes"]
    out = [("landing", 0.05)]
    for name in ("chaos", "lock"):
        if sc.get(name):
            a, b = sc[name][0][0], sc[name][-1][1]
            out.append((name, (a + b) / 2))
    for st in g["stations"]:
        out.append((st[0], (st[1] + st[2]) / 2))
    if g["MAPS"]:
        out.append(("pull-back", (g["PULL"] + g["MAPS"]) / 2))
        out.append(("map", g["MAPS"] + 0.15))
    return out


def a_phonetext(v):
    """Three screenshots of the art band per held frame: as is (A), with native figure text made transparent
    (B), and with all text made transparent (C). B against C is every other DOM text and must be empty. A
    against B is the native layers' own labels, which may sit only inside their own layer's box."""
    g = v.geometry()
    x0, y0, x1, y1 = 0, 40, v.vw, v.band - 44
    clip = {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}
    bad, total, native_px, native_frames = [], 0, 0, 0
    import base64

    def shot():
        return base64.b64encode(v.page.screenshot(clip=clip)).decode()

    def hide(css, el_id):
        v.js("([css, id]) => { const e = document.createElement('style'); e.id = id; e.textContent = css; document.head.appendChild(e); }", [css, el_id])
        v.js("async () => { await __ct.raf(); await __ct.raf(); }")
    for name, s in phone_samples(g):
        f = v.frame_at(s, here=True)
        nat = f.get("natives") or []
        a = shot()
        if nat:
            hide(HIDE_NATIVE_CSS, "__ct_hide_native")
            b = shot()
        else:
            b = a
        hide(HIDE_TEXT_CSS, "__ct_hide")
        c = shot()
        v.js("() => { for (const id of ['__ct_hide', '__ct_hide_native']) { const e = document.getElementById(id); if (e) e.remove(); } }")
        d = v.js(TEXT_DIFF_JS, [b, c, []])
        total += d["n"]
        if d["n"]:
            bb = [round(q / v.dpr) for q in d["bbox"]]
            bad.append(f"{name} s {s:.2f}: {d['n']} px at css {bb[0]},{bb[1] + y0}-{bb[2]},{bb[3] + y0}")
        if nat:
            native_frames += 1
            boxes = [[q["box"][0] * v.dpr, (q["box"][1] - y0) * v.dpr, q["box"][2] * v.dpr, (q["box"][3] - y0) * v.dpr] for q in nat]
            dn = v.js(TEXT_DIFF_JS, [a, b, boxes])
            native_px += dn["inside"]
            if dn["n"]:
                bb = [round(q / v.dpr) for q in dn["bbox"]]
                bad.append(f"{name} s {s:.2f}: {dn['n']} px of native figure text outside its layer's box "
                           f"({', '.join(q['id'] for q in nat)}) at css {bb[0]},{bb[1] + y0}-{bb[2]},{bb[3] + y0}")
    v.js("async () => { await __ct.raf(); }")
    m = (f"{total} DOM text pixels in the art band y {y0}-{y1:.0f} over {len(phone_samples(g))} held frames; "
         + (f"native figure labels {native_px} px inside their own box over {native_frames} frames" if native_frames
            else "no native layer on screen"))
    if bad:
        m += "; " + "; ".join(bad[:2])
    return not bad, m


def a_figclip(v):
    """Every figure cell, and every native layer with everything it draws, inside the art box at each held
    phone frame. A native layer stands for its station's cells once they have resolved into it. The ant is
    on screen at every hold too: its #ffffff cell, read back from the canvas, is whole and inside the art box."""
    g = v.geometry()
    if not v.hook("figure"):
        raise Missing("__walk.figure() is absent")
    bad, n, drawn, nat_seen, ants, full = [], 0, {}, 0, 0, []
    for sid, s in station_samples(g):
        f = v.frame_at(s, census=True)
        fig = f["figure"]
        n += 1
        w, pp = (f.get("census") or {}).get("white"), f.get("pp")
        # a figure that leaves no room for the ant's cell beside it (within 2 cells of the art box both ways) keeps
        # the figure whole and lets the ant go: counted and printed, not failed
        if isinstance(fig, dict) and fig.get("art") and fig.get("cells") and pp:
            a, c, cp = fig["art"], fig["cells"], pp / v.dpr
            if (c[3] - c[1]) + 2 * cp > a[3] - a[1] or (c[2] - c[0]) + 2 * cp > a[2] - a[0]:
                full.append(f"{sid} {c[3] - c[1]:.0f} of {a[3] - a[1]:.0f}px")
                pp = None
        if isinstance(fig, dict) and fig.get("art") and pp:
            a, d = fig["art"], v.dpr
            whole = w and w["n"] >= pp * pp and w["x1"] - w["x0"] >= pp and w["y1"] - w["y0"] >= pp
            inside = w and w["x0"] / d >= a[0] - 0.5 and w["y0"] / d >= a[1] - 0.5 and w["x1"] / d <= a[2] + 0.5 and w["y1"] / d <= a[3] + 0.5
            if whole and inside:
                ants += 1
            else:
                bad.append(f"{sid} s {s:.2f}: ant " + (f"{w['n']} px at {[round(w[k] / d) for k in ('x0', 'y0', 'x1', 'y1')]}" if w else "not drawn")
                           + f", a whole cell is {pp}x{pp} dev px inside art {[round(q) for q in a]}")
        drawn.setdefault(sid, 0)
        if not isinstance(fig, dict) or fig.get("id") != sid or not fig.get("art"):
            bad.append(f"{sid} s {s:.2f}: figure() gave {str(fig)[:60]} during {sid}'s hold")
            continue
        a = fig["art"]
        for q in f.get("natives") or []:
            if q["id"] != sid:
                bad.append(f"{sid} s {s:.2f}: native layer {q['id']} ({q['desc']}) on screen during {sid}'s hold")
                continue
            nat_seen += 1
            drawn[sid] += 1
            e = q["ext"]
            over = max(a[0] - e[0], a[1] - e[1], e[2] - a[2], e[3] - a[3], 0)
            if over > 0.5:
                bad.append(f"{sid} s {s:.2f}: native layer {q['desc']} draws {[round(x) for x in e]} vs art "
                           f"{[round(x) for x in a]} ({over:.1f}px out)")
        if not fig.get("cells"):
            continue                      # nothing drawn as cells in this beat: nothing to clip
        drawn[sid] += 1
        c = fig["cells"]
        over = max(a[0] - c[0], a[1] - c[1], c[2] - a[2], c[3] - a[3], 0)
        if over > 0.5:
            bad.append(f"{sid} s {s:.2f}: cells {[round(q) for q in c]} vs art {[round(q) for q in a]} ({over:.1f}px out)")
    empty = [k for k, c in drawn.items() if not c]
    bad += [f"{k}: no cells and no native layer at any held sample" for k in empty]
    m = (f"{len(bad)} problems over {n} held frames ({sum(drawn.values()) - nat_seen} with cells, {nat_seen} with a native layer, "
         f"{ants} with the whole ant cell in the art box" + (f", ant exempt where the figure fills the box: {', '.join(sorted(set(full)))}" if full else "")
         + "); clipped = a cell box, or anything a native layer draws, outside the art box")
    if bad:
        m += "; " + "; ".join(bad[:2])
    return not bad, m


def a_caption(v):
    """The caption row draws its instruction whole. The canvas text drawn below the art box at a hold, joined in
    line order, must equal the instruction for that scroll position: a line cut to fit the row fails here."""
    g = v.geometry()
    if not v.hook("drawn") or not v.hook("instrAt"):
        raise Missing("__walk.drawn() or __walk.instrAt() is absent")
    bad, n, most = [], 0, 0
    for sid, s in station_samples(g):
        f = v.frame_at(s)
        fig, want, dr = f.get("figure"), f.get("instr"), f.get("drawn")
        n += 1
        if not isinstance(fig, dict) or not fig.get("art") or not isinstance(dr, list) or not isinstance(want, str):
            bad.append(f"{sid} s {s:.2f}: no figure, drawn text or instruction to compare")
            continue
        rows = sorted((d for d in dr if d[2] > fig["art"][3] and d[3] > 0.5), key=lambda d: d[2])
        most = max(most, len(rows))
        got = " ".join(d[0] for d in rows)
        if got != want:
            bad.append(f"{sid} s {s:.2f}: drew {got!r} for {want!r}")
    m = f"{n - len(bad)} of {n} held frames draw the whole instruction below the art box, in at most {most} lines"
    if bad:
        m += "; " + "; ".join(bad[:2])
    return not bad, m


def a_selfchecks(v):
    v.need_walk()
    lock, off = langton_lock()
    if not v.hook("selfChecks"):
        raise Missing(f"__walk.selfChecks() is absent (independent LOCK here: {lock}, offset {off})")
    sc = v.js("() => JSON.parse(JSON.stringify(__walk.selfChecks()))")
    if not isinstance(sc, list) or not sc:
        return False, "selfChecks() returned nothing"
    by = {c.get("id"): c for c in sc}
    bad = [f"{c.get('id')} got {c.get('got')}" for c in sc if not c.get("ok")]
    want = dict(EXPECT, lock=lock)
    for k, w in want.items():
        c = by.get(k)
        if c is None:
            bad.append(f"{k} missing")
            continue
        got = c.get("got")
        if k == "kronos-dd":
            good = isinstance(got, (int, float)) and round(got, 2) == round(w, 2)
        else:
            good = got == w
        if not good:
            bad.append(f"{k} got {got}, want {w}")
    controls = v.js("""() => { const ids = (__walk.selfChecks() || []).filter(c => !c.ok).map(c => c.id);
        return ids.map(id => [id, document.querySelectorAll('[data-check="' + id + '"]').length]).filter(x => x[1] > 0); }""")
    for cid, cnt in controls:
        bad.append(f"{cid} failed but {cnt} controls remain")
    m = f"{len(sc)} self-checks, {len(bad)} problems (independent LOCK {lock})"
    if bad:
        m += ": " + "; ".join(bad[:3])
    return not bad, m


def a_handoff(v):
    g = v.geometry()
    if not g["MAPS"] or not g["DOCS"]:
        raise Missing("__walk.MAPS / __walk.DOCS are absent")
    f = v.frame_at(g["MAPS"] + 0.5 * (g["DOCS"] - g["MAPS"]), census=True)
    ant = f["census"]["white"]
    ant_m = (f"canvas ant {ant['x1'] - ant['x0']}x{ant['y1'] - ant['y0']} dev px at {ant['x0']},{ant['y0']}" if ant else "no #ffffff ant on the canvas at the map hold")
    if not v.hook("handoff"):
        raise Missing(f"__walk.handoff() is absent; {ant_m}")
    h = v.js("""() => { const h = __walk.handoff(); if (!h || !h.el) return null; const r = h.el.getBoundingClientRect();
        return { s: h.s, top: r.top + scrollY, left: r.left, w: r.width, hh: r.height }; }""")
    if not h:
        return False, "handoff() returned no square; " + ant_m
    if h["s"] is None:
        return False, f"handoff is the static fallback at {v.vw}px desktop; " + ant_m
    if not ant:
        return False, ant_m
    dpr = v.dpr
    acx, acy = (ant["x0"] + ant["x1"]) / 2, (ant["y0"] + ant["y1"]) / 2          # device px
    y_h = h["top"] + h["hh"] / 2 - acy / dpr                                       # square centre on the ant's centre
    page_y = h["s"] * v.S
    v.js("y => __ct.scrollTo(0, y)", y_h)
    v.settle(1500)
    tok = {k: list(c) for k, c in TOK_RGB.items()}
    r = v.js("""(tok) => { const h = __walk.handoff(), r = h.el.getBoundingClientRect(), d = devicePixelRatio, c = __ct.census(tok);
        return { cx: (r.left + r.width / 2) * d, cy: (r.top + r.height / 2) * d, w: r.width * d, h: r.height * d, white: c.white, sy: scrollY }; }""", tok)
    off = max(abs(r["cx"] - acx), abs(r["cy"] - acy))
    v.js("y => __ct.scrollTo(0, y)", y_h - 4)
    v.settle(1500)
    before = v.js("(tok) => __ct.census(tok).white", tok)
    v.cur = None
    ok = off <= 1.0 and r["white"] is None and before is not None and abs(page_y - y_h) * dpr <= 1.0
    return ok, (f"square centre {off:.2f} device px from the canvas ant's centre at y {r['sy']:.1f} "
                f"(square {r['w']:g}x{r['h']:g}, ant {ant['x1'] - ant['x0']}x{ant['y1'] - ant['y0']} device px); "
                f"page handoff y {page_y:.1f} vs measured {y_h:.1f}; canvas ant {'gone' if r['white'] is None else 'still drawn'} "
                f"at handoff, {'drawn' if before else 'gone'} 4px before")


def a_settle(v):
    v.need_walk()
    g = v.geometry()
    ch = chaos_samples(g) or [1.0]
    v.frame_at(ch[2], here=True)
    r = v.js("""async () => { const S = __walk.S(), y0 = scrollY; __ct.scrollTo(0, y0 + 600); const t0 = performance.now();
        let res = null; while (performance.now() - t0 < 600) await __ct.raf();
        const sh = __ct.get('shown'); res = typeof sh === 'number' ? Math.abs(sh * S - scrollY) : null;
        return { res, dt: Math.round(performance.now() - t0) }; }""")
    v.cur = None
    if r["res"] is None:
        raise Missing("__walk.shown() is absent")
    return r["res"] <= 1.0, f"600px jump: canvas {r['res']:.2f}px from the scroll position after {r['dt']}ms (<= 1px)"


def a_errors(v):
    e = v.errors
    return not e, f"{len(e)} page errors" + (": " + "; ".join(e[:2]) if e else "")


def perf_once(run, name):
    """One throttled wheel run from the top: (p95, p50, max, frames, page's own p95 or None) in ms."""
    v = View(run, name, mode="perf")
    try:
        v.need_walk()
        cdp = v.ctx.new_cdp_session(v.page)
        v.js("() => __ct.scrollTo(0, 0)")
        v.settle(2000)
        if v.phone:
            v.page.mouse.move(v.vw / 2, (40 + v.band) / 2)
        else:
            v.page.mouse.move((576 + v.vw) / 2, v.vh / 2)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
        v.js("() => { __ct.rafMs = []; __ct.handlerMs = []; __ct.perfOn = true; }")
        for _ in range(140):
            v.page.mouse.wheel(0, 100)
            v.page.wait_for_timeout(30)
            if v.js("scrollY >= document.documentElement.scrollHeight - innerHeight - 1"):
                break
        v.page.wait_for_timeout(1200)
        data = v.js("() => { __ct.perfOn = false; return { raf: __ct.rafMs, h: __ct.handlerMs, own: (__ct.get('stats') || []) }; }")
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
    finally:
        v.close()
    frames = {}
    for ts, start, ms in data["raf"]:
        fr = frames.setdefault(ts, [start, 0.0])
        fr[0] = min(fr[0], start)
        fr[1] += ms
    order = sorted(frames.values())
    hs = sorted(data["h"])
    j, prev = 0, -1e18
    for fr in order:
        while j < len(hs) and hs[j][0] <= fr[0]:
            if hs[j][0] > prev:
                fr[1] += hs[j][1]
            j += 1
        prev = fr[0]
    ms = sorted(fr[1] for fr in order)
    p = lambda q: ms[min(len(ms) - 1, int(math.ceil(q * len(ms))) - 1)] if ms else float("nan")
    own = sorted(data["own"])
    return p(0.95), p(0.5), (ms[-1] if ms else float("nan")), len(ms), (own[int(0.95 * (len(own) - 1))] if own else None)


# Measured 12 Oct: median p95 1.70ms desktop, 1.60ms phone. The slowest frames are station build and dim clips,
# where a station's cells are rebuilt and its native layer redrawn each frame.
PERF_RUNS, PERF_P95_MS = 3, 2.0


def a_perf(run, name):
    """p95 script time per frame at 4x CPU throttle, taken as the median of PERF_RUNS runs, each in a fresh
    context, so one noisy run neither passes nor fails the page on its own."""
    runs = [perf_once(run, name) for _ in range(PERF_RUNS)]
    short = [r for r in runs if r[3] < 50]
    if short:
        return False, f"only {short[0][3]} frames recorded in a run"
    med = sorted(r[0] for r in runs)[PERF_RUNS // 2]
    each = ", ".join(f"{r[0]:.2f}" for r in runs)
    own = [r[4] for r in runs if r[4] is not None]
    own_m = f"; page's own stats p95 {', '.join(f'{x:.2f}' for x in own)}ms" if own else ""
    return med <= PERF_P95_MS, (f"p95 median {med:.2f}ms of {PERF_RUNS} runs ({each}) (<= {PERF_P95_MS}ms), p50 {sorted(r[1] for r in runs)[PERF_RUNS // 2]:.2f}ms, "
                                f"max {max(r[2] for r in runs):.1f}ms script per frame over {min(r[3] for r in runs)}+ frames a run at 4x CPU throttle{own_m}")


# name -> (viewports, fn, what it measures)
ASSERTIONS = [
    ("selfchecks", ("desktop",), a_selfchecks, "every __walk.selfChecks() entry ok, and nand/em/kronos-dd/lock equal answers known outside the page"),
    ("landing", ("desktop", "phone"), a_landing, "sceneId never 'landing' after s 0.04 (every 0.0005) and stepAt never decreases; landing below 0.03 as control"),
    ("planting", ("desktop", "phone"), a_planting, "5 clicks on the landing leave at most 1 visitor ant; past the landing (s 0.20) and back, 0 visitor ants and 0 visitor world cells"),
    ("notches", ("desktop", "phone"), a_notches, "every 100px wheel notch advances scrollY, top to the last résumé line and on to the bottom"),
    ("length", ("desktop", "phone"), a_length, "notches to the last résumé line <= 140 desktop and phone (all the work sits before the résumé)"),
    ("pan", ("desktop", "desktop-1280", "desktop-1024"), a_pan, "in every transit one 100px notch moves the drawn art at most 250 CSS px (world origin read from frames 25px apart)"),
    ("monotonic", ("desktop", "phone"), a_monotonic, "the rendered step never decreases while wheeling down"),
    ("cardband", ("desktop", "phone"), a_cardband, "no band > 0.1 screen without the hero or a card in the reading zone, s 0 to the pull-back"),
    ("holdzone", ("desktop", "phone"), a_holdzone, "during the lock and every hold, only the card being read (hero at the lock) shows in the reading zone; the next card is at opacity 0"),
    ("rise", ("desktop", "phone"), a_rise, "no card fades in: until the figure before it dims (hold end + 0.05) each card is below the fold, at opacity 1, with no opacity transition"),
    ("firstnotch", ("desktop", "phone"), a_firstnotch, "the first 100px notch of every hold changes at least 0.075% of the viewport's CSS px (settled screenshots)"),
    ("custos", ("desktop", "phone"), a_custos, "custos: 'contradicted' and 'blocked' each on screen >= 0.3 screen; the caption says pink only while the verdict is shown"),
    ("places", PHONES + ("phone-small-1x",), a_places, "pull-back to the résumé every 0.02 screen: no shown place row's text crosses a card's text"),
    ("station", ("desktop", "phone"), a_station, "at holds, built() == the card stuck at its sticky top == sceneId, and the drawn step == stepAt(shown)"),
    ("pink", ("desktop", "phone"), a_pink, "chaos >= 95% trail-family over world cells (cellTok/cellAt); at holds, bright --trail <= 1.5% of the viewport's pixels, ant head trail included"),
    ("phonetext", PHONES, a_phonetext, "screenshot diffs with text made transparent: 0 DOM text pixels in the phone art band, native figure labels only inside their own box"),
    ("figclip", PHONES + LANDS, a_figclip, "every figure cell and every native layer inside the art band at every held phone frame, and the ant's whole cell with them"),
    ("caption", ("desktop",) + PHONES + LANDS, a_caption, "at every hold the caption lines drawn below the art box, joined, equal the instruction: none cut to fit"),
    ("handoff", ("desktop",), a_handoff, "the bookend square's centre lands within 1 device px of the canvas ant's; the canvas stops drawing the ant there"),
    ("settle", ("desktop",), a_settle, "a 600px jump is drawn within 1px of the scroll position by 600ms"),
    ("colours", ("desktop", "phone"), a_colours, "computed colours (native layers included) and stylesheet literals within the tokens; :root carries them; no pink in DOM outside a native layer's --trail"),
    ("fontsizes", ("desktop", "phone"), a_fontsizes, "DOM and native-layer text sizes within {72,40,15,13,11,44,30}; art canvas text 13 or 11"),
    ("stripname", ("desktop", "phone"), a_stripname, "the strip is named within 0.03 screen of the hero name leaving view, both sides"),
    ("quotes", ("desktop", "phone"), a_quotes, "no straight quote (U+0027, U+0022) in visible text or a caption line"),
    ("scrollbars", ("desktop", "phone"), a_scrollbars, "no element with an inner scrollbar"),
    ("overflow", ("desktop", "phone", "phone-small") + LANDS, a_overflow, "no horizontal scroll and no text past the viewport edge"),
    ("landcards", LANDS, a_landcards, "a phone on its side: each held card is in the text column clear of the art, and whole when it fits the viewport"),
    ("cardfit", PHONES + ("phone-se", "phone-640"), a_cardfit, "every chapter card fits the phone text band (48svh - 32) at 390x844, 360x740, 375x667 and 360x640, sticky at its top: phrase and proof shown, the note line sr-only, no inner scroll, DOM sizes only; the custos native layer inside its art box at every held sample"),
    ("swaps", PHONES, a_swaps, "phone KRONOS settled at every 0.01 screen of its hold, both ways: one whole view, the one its instruction names, no cells left under the layer"),
    ("linknames", ("desktop",), a_linknames, "no two links to different hrefs share an accessible name, and no arrow glyph is in a link's name"),
    ("jumpfocus", ("desktop", "phone"), a_jumpfocus, "Enter on each strip jump, map place and walk link, then Tab: scrollY moves less than one screen"),
    ("tabreach", ("desktop", "phone"), a_tabreach, "forward Tab from the top reaches the NAND inputs and the KRONOS switch, and each is live over its figure once focused"),
    ("targets", ("desktop", "phone", "phone-small"), a_targets, "every link, button and input on screen is at least 24 CSS px a side with a fine pointer, 32 on touch"),
    ("pitch", ("desktop", "phone", "desktop-125"), a_pitch, "every blit and cell rect lands on whole device pixels at an integer scale, every frame"),
    ("fills", ("desktop", "phone"), a_fills, "canvas fill/stroke styles and bitmap values are packed tokens; no glow, no filter"),
    ("work", ("desktop", "phone", "phone-small"), a_work, "all the work: rows, cells, theme listings and markers match the taxonomy; markers sit in exactly their themes; tokens and DOM sizes only (canvas pixels included) in every state; Tab reaches every map control and Enter picks; on a phone the prompt reads 'tap a theme or a project', theme names are 32px targets whose pick brings the first row into view, and a tap 13px off a marker picks it"),
    ("listeners", ("desktop", "phone"), a_listeners, "no wheel, touch or key listener at all, hooked before load"),
    ("scrollto", ("desktop", "phone"), a_scrollto, "no page-initiated scroll outside a click (a resize may restore the place, see resize)"),
    ("resize", ("desktop", "phone"), a_resize, "a resize or rotation at a transit, each hold and the résumé keeps the scene, its fraction and the résumé line"),
    ("errors", ("desktop", "phone", "phone-small", "desktop-125") + LANDS, a_errors, "no page errors or console errors"),
    ("perf", ("phone", "desktop"), None, "p95 script time per frame <= 2.0ms at 4x CPU throttle, median of 3 runs (rAF and scroll handlers, timed in-page)"),
]
# --fast: the checks a fixer breaks most often between edits, on fewer viewports, in under a minute.
# Everything else (sweeps of the holds, pixels, perf) needs the full run.
FAST = {
    "selfchecks": ("desktop",),
    "notches": ("desktop",),
    "planting": ("desktop",),
    "colours": ("desktop", "phone"),
    "fontsizes": ("desktop", "phone"),
    "scrollbars": ("desktop", "phone"),
    "overflow": ("desktop", "phone", "phone-small"),
    "listeners": ("desktop", "phone"),
    "work": ("desktop", "phone"),
    "errors": ("desktop", "phone", "phone-small"),
}


class Run:
    def __init__(self, root, browser):
        self.root, self.browser = root, browser
        self.srv, self.url = serve(root)
        self.views = {}

    def view(self, name):
        if name not in self.views:
            self.views[name] = View(self, name)
        return self.views[name]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default="", help="comma-separated assertion names")
    ap.add_argument("--root", default=str(ROOT), help="directory to serve (must hold index.html)")
    ap.add_argument("--viewport", default="", help="comma-separated viewports to restrict to")
    ap.add_argument("--fast", action="store_true", help="quick subset for use between edits: " + ", ".join(FAST))
    ap.add_argument("--json", default="", help="write raw results here")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--debug", action="store_true", help="print tracebacks for harness errors")
    a = ap.parse_args()
    if a.list:
        for n, vps, _, what in ASSERTIONS:
            print(f"{n:11s} {','.join(vps):34s} {what}" + (f"  [--fast: {','.join(FAST[n])}]" if n in FAST else ""))
        return 0
    plan = {n: (FAST.get(n, ()) if a.fast else vps) for n, vps, _, _ in ASSERTIONS}
    names = [n for n, *_ in ASSERTIONS]
    only = [x.strip() for x in a.only.split(",") if x.strip()]
    unknown = [x for x in only if x not in names]
    if unknown:
        print(f"unknown assertion(s): {', '.join(unknown)}; see --list")
        return 2
    vfilter = {x.strip() for x in a.viewport.split(",") if x.strip()}
    root = Path(a.root).resolve()
    if not (root / "index.html").is_file():
        print(f"no index.html under {root}")
        return 2
    from playwright.sync_api import sync_playwright
    t0 = time.time()
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb", "--disable-smooth-scrolling"])
        run = Run(root, browser)
        print(f"contract: {run.url} (serving {root}){' --fast: ' + ', '.join(FAST) if a.fast else ''}", flush=True)
        try:
            # views in a fixed order; perf last, in its own throttled contexts
            for vp in VIEWPORTS:
                if vfilter and vp not in vfilter:
                    continue
                for n, _, fn, _ in ASSERTIONS:
                    if fn is None or vp not in plan[n] or (only and n not in only):
                        continue
                    try:
                        v = run.view(vp)
                        ok, m = fn(v)
                    except Missing as e:
                        ok, m = False, f"hook missing: {e}"
                    except Exception as e:
                        ok, m = False, f"harness error: {type(e).__name__}: {str(e).splitlines()[0][:200]}"
                        if a.debug:
                            traceback.print_exc()
                    results.append({"ok": bool(ok), "name": n, "viewport": vp, "measured": m})
                    print(f"{'PASS' if ok else 'FAIL'} {n}[{vp}] {m}", flush=True)
                if vp in run.views:
                    run.views[vp].close()
            for n, _, fn, _ in ASSERTIONS:
                if n != "perf" or (only and n not in only):
                    continue
                for vp in plan[n]:
                    if vfilter and vp not in vfilter:
                        continue
                    try:
                        ok, m = a_perf(run, vp)
                    except Missing as e:
                        ok, m = False, f"hook missing: {e}"
                    except Exception as e:
                        ok, m = False, f"harness error: {type(e).__name__}: {str(e).splitlines()[0][:200]}"
                    results.append({"ok": bool(ok), "name": n, "viewport": vp, "measured": m})
                    print(f"{'PASS' if ok else 'FAIL'} {n}[{vp}] {m}", flush=True)
        finally:
            browser.close()
            run.srv.shutdown()
    fails = [r for r in results if not r["ok"]]
    print(f"\n{len(results) - len(fails)} passed, {len(fails)} failed, {time.time() - t0:.0f}s", flush=True)
    if a.json:
        Path(a.json).write_text(json.dumps({"root": str(root), "results": results, "seconds": round(time.time() - t0, 1)}, indent=1))
    return 1 if fails or not results else 0


if __name__ == "__main__":
    sys.exit(main())
