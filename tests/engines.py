#!/usr/bin/env python3
"""Defects that show only in WebKit or Firefox, the two engines contract.py (headless Chromium) never runs.

  .venv/bin/python tests/engines.py               every check
  .venv/bin/python tests/engines.py --only a,b    the named checks (--list names them)
  .venv/bin/python tests/engines.py --root DIR    another copy of the site

Needs Playwright's WebKit and Firefox builds (`.venv/bin/python -m playwright install webkit firefox`).
Exit 0 clean, 1 on any FAIL, 2 when an engine is missing: a check that did not run is not a pass.
"""
import argparse
import functools
import http.server
import socket
import sys
import threading
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# a phone held upright; WebKit takes is_mobile, Firefox does not (pass FIREFOX_PHONE there)
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
FIREFOX_PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=3, has_touch=True)


class Missing(Exception):
    """An engine is not installed: the check did not run."""


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
    return srv, f"http://127.0.0.1:{port}"


class Env:
    """One served copy of the site; each engine is launched once, on first use, and every context a check opens is
    closed after it."""

    def __init__(self, p, root):
        self.p, self.root = p, root
        self.srv, self.base = serve(root)
        self.browsers, self.contexts = {}, []

    def url(self, path):
        return f"{self.base}/{path}"

    def browser(self, engine):
        if engine not in self.browsers:
            try:
                self.browsers[engine] = getattr(self.p, engine).launch()
            except Exception as e:
                raise Missing(f"{engine} would not launch ({str(e).splitlines()[0][:120]}); "
                              f"install it with `.venv/bin/python -m playwright install {engine}`")
        return self.browsers[engine]

    def page(self, engine, path, **ctx):
        """A fresh context with the given options, loaded at path; its page errors collect on page.errors."""
        c = self.browser(engine).new_context(**ctx)
        self.contexts.append(c)
        pg = c.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e).splitlines()[0][:160]))
        pg.goto(self.url(path), wait_until="load")
        return pg

    def done(self):
        for c in self.contexts:
            try:
                c.close()
            except Exception:
                pass
        self.contexts = []

    def close(self):
        self.done()
        for b in self.browsers.values():
            b.close()
        self.srv.shutdown()


LAYOUT_SIG = ("[document.documentElement.scrollHeight, document.getElementById('world').offsetHeight,"
              " __walk.stations.map(function (x) { return x[0] + ':' + x[1].toFixed(2) + '-' + x[2].toFixed(2); }).join(' ')]")


def rotate(env):
    """A phone in WebKit scrolled into KRONOS, turned on its side and back: no page error, each layout is the one a fresh
    load at that size gets, and the art still follows a later scroll. WebKit answered a kept MediaQueryList from the size
    before the turn, so the page laid itself out on its side at 390 px wide, KRONOS's box went negative, footprint()
    threw, and the frame loop stayed marked running with no frame queued: the canvas froze for the rest of the visit."""
    land = dict(PHONE, viewport={"width": 844, "height": 390})
    side = env.page("webkit", "index.html", **land)
    side.wait_for_timeout(1500)
    fresh_side = side.evaluate(LAYOUT_SIG)
    pg = env.page("webkit", "index.html", **PHONE)
    pg.wait_for_timeout(1500)
    fresh = pg.evaluate(LAYOUT_SIG)
    st = {x[0]: x for x in pg.evaluate("__walk.stations")}
    k = st["kronos"]
    pg.evaluate(f"window.scrollTo(0, Math.round({(k[1] + k[2]) / 2} * __walk.S()))")
    pg.wait_for_timeout(1500)
    pg.set_viewport_size(land["viewport"])
    pg.wait_for_timeout(1500)
    turned = pg.evaluate(LAYOUT_SIG)
    pg.set_viewport_size(PHONE["viewport"])
    pg.wait_for_timeout(1500)
    back = pg.evaluate(LAYOUT_SIG)
    step0 = pg.evaluate("__walk.view().step")
    f = {x[0]: x for x in pg.evaluate("__walk.stations")}["freeflow"]
    pg.evaluate(f"window.scrollTo(0, Math.round({(f[1] + f[2]) / 2} * __walk.S()))")
    pg.wait_for_timeout(2000)
    s, shown, step1 = pg.evaluate("[scrollY / __walk.S(), __walk.shown(), __walk.view().step]")
    bad = []
    if pg.errors:
        bad.append(f"{len(pg.errors)} page error(s): {pg.errors[0]}")
    if turned != fresh_side:
        bad.append(f"on its side height {turned[0]}, art {turned[1]} against a fresh load's {fresh_side[0]}, {fresh_side[1]}")
    if back != fresh:
        bad.append(f"upright again height {back[0]}, art {back[1]} against a fresh load's {fresh[0]}, {fresh[1]}")
    if abs(shown - s) > 0.02 or step1 == step0:
        bad.append(f"art frozen: scrolled to s {s:.2f}, drawn at {shown:.2f}, step {step0} -> {step1}")
    return not bad, "; ".join(bad) or f"0 errors, both layouts a fresh load's, art at s {shown:.2f} (step {step0} -> {step1})"


SKIP_READ = ("() => [scrollY / __walk.S(), location.hash, !!document.activeElement && !!document.activeElement.closest('#story')"
             " && !document.activeElement.matches('a.skip')]")


def skipreload(env):
    """Desktop Safari: Enter on the skip link at the top, and the next Tab (Option+Tab, Safari's Tab to links) lands in
    the story; the reader reads on to KRONOS and reloads, and comes back there. The link used to write #story, a hash that
    names no place, and WebKit's own fragment scroll ran after the page put the reader back, so the reload landed on the
    landing."""
    pg = env.page("webkit", "index.html", viewport={"width": 1280, "height": 800})
    pg.wait_for_timeout(1500)
    pg.focus("a.skip")
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(800)
    pg.keyboard.press("Alt+Tab")
    pg.wait_for_timeout(800)
    s0, hs, inside = pg.evaluate(SKIP_READ)
    k = {x[0]: x for x in pg.evaluate("__walk.stations")}["kronos"]
    pg.evaluate(f"window.scrollTo(0, Math.round({(k[1] + k[2]) / 2} * __walk.S()))")
    pg.wait_for_timeout(1500)
    s1 = pg.evaluate("scrollY / __walk.S()")
    pg.reload(wait_until="load")
    pg.wait_for_timeout(2500)
    s2, hs2, _ = pg.evaluate(SKIP_READ)
    bad = []
    if not inside or s0 > 0.01:
        bad.append(f"the Tab after Enter on the skip link landed outside the story, or at s {s0:.2f}")
    if abs(s2 - s1) > 0.02:
        bad.append(f"read on to s {s1:.2f} ({hs or 'no hash'}), the reload came back at s {s2:.2f}")
    if pg.errors:
        bad.append(f"{len(pg.errors)} page error(s): {pg.errors[0]}")
    return not bad, "; ".join(bad) or f"the next Tab in the story, address {hs or 'without a hash'}; read on to s {s1:.2f}, reloaded at s {s2:.2f}"


BLOB_AT = """() => { const a = document.activeElement; if (!a || a === document.body) return null;
  const r = a.getBoundingClientRect();
  return [a.matches('#work .k-blob') ? a.getAttribute('data-k') : '', Math.round(r.top), Math.round(r.bottom), innerHeight]; }"""


def blobring(env):
    """Firefox: Tab from the top onto the work section's theme blobs (192 to 240 px tall circles, the ring inside each):
    every blob is whole on screen when it is reached. Firefox scrolls a focused control into view only when hardly any
    of it shows, so a blob 180 px into the screen's foot was left with its ring's bottom cut off."""
    bad, seen = [], 0
    for w, h in ((1280, 800), (640, 400)):
        pg = env.page("firefox", "index.html", viewport={"width": w, "height": h}, device_scale_factor=2 if w < 1000 else 1)
        pg.wait_for_timeout(1500)
        inblobs = False
        for _ in range(90):
            pg.keyboard.press("Tab")
            pg.wait_for_timeout(350)
            r = pg.evaluate(BLOB_AT)
            if not r or not r[0]:
                if inblobs:
                    break
                continue
            inblobs = True
            seen += 1
            if r[1] < 0 or r[2] > r[3]:
                bad.append(f"{w}x{h} {r[0]} at y {r[1]}..{r[2]} on a {r[3]} px screen")
        if not inblobs:
            bad.append(f"{w}x{h}: Tab never reached a blob in 90 presses")
        if pg.errors:
            bad.append(f"{w}x{h}: {len(pg.errors)} page error(s): {pg.errors[0]}")
    return not bad, "; ".join(bad) or f"{seen} blob stops at 1280x800 and 640x400, each whole on screen"


# freeflow-deep builds a scene again when a resize changes the columns its stage holds. In WebKit and Firefox too, a page
# zoomed (1280x800 to 640x400) or a phone turned upright (667x375 to 375x667 and 844x390 to 390x844, WebKit only: Firefox
# takes no is_mobile) draws what a fresh load there draws, from the top of the page, with sc-gates' toggle still live and
# still focused.
FF_SIG_JS = """() => Object.fromEntries([...document.querySelectorAll('figure.scene')].map(f => {
  const st = f.querySelector('.sc-stage').getBoundingClientRect(), cv = f.querySelector('.sc-art > canvas'), cr = cv.getBoundingClientRect();
  const labs = [...f.querySelectorAll('.sc-art > .sc-l, .sc-art > .sc-lead')].filter(e => !e.hidden && e.getClientRects().length)
    .map(e => { const r = e.getBoundingClientRect(); return e.textContent.slice(0, 20) + '@' + Math.round(r.left - st.left) + ',' + Math.round(r.top - st.top) + ' ' + Math.round(r.width); }).sort();
  return [f.id, { canvas: [cv.width, cv.height, Math.round(cr.width)], over: Math.max(0, Math.round(cr.right - st.right)), labs,
    inputs: [...f.querySelectorAll('.sc-in button')].map(b => b.getAttribute('aria-pressed')).join() }]; }))"""
FF_TOGGLE = "#sc-gates .sc-in button"


def ff_settled(pg):
    pg.evaluate("() => __deep.selfCheck()")
    sig = pg.evaluate(FF_SIG_JS)
    for _ in range(20):
        pg.wait_for_timeout(300)
        nxt = pg.evaluate(FF_SIG_JS)
        if nxt == sig:
            return sig
        sig = nxt
    return sig


def c_ffresize(env):
    bad, n = [], 0
    for engine in ("webkit", "firefox"):
        mobile = {} if engine == "firefox" else {"is_mobile": True}
        for (fw, fh), (tw, th), dpr, extra in (((1280, 800), (640, 400), 2, {}), ((667, 375), (375, 667), 2, dict(mobile, has_touch=True)),
                                               ((844, 390), (390, 844), 3, dict(mobile, has_touch=True))):
            if engine == "firefox" and extra:
                continue
            sigs = {}
            for how, (w, h) in (("fresh", (tw, th)), ("moved", (fw, fh))):
                pg = env.page(engine, "work/freeflow-deep.html", viewport={"width": w, "height": h}, device_scale_factor=dpr,
                              reduced_motion="reduce", **extra)
                pg.wait_for_function("() => window.__deep && document.fonts.status === 'loaded'")
                pg.evaluate("(s) => { const b = document.querySelector(s); b.click(); b.focus({ preventScroll: true }); }", FF_TOGGLE)
                if how == "moved":
                    pg.evaluate("() => scrollTo(0, 0)")
                    pg.set_viewport_size({"width": tw, "height": th})
                sigs[how] = ff_settled(pg)
                if how == "moved" and not pg.evaluate("(s) => document.activeElement === document.querySelector(s)", FF_TOGGLE):
                    bad.append(f"{engine} {fw}x{fh} to {tw}x{th}: the keyboard left the sc-gates toggle")
                bad += [f"{engine} {how}: {e}" for e in pg.errors]
            n += 1
            for sid, a in sigs["fresh"].items():
                b = sigs["moved"].get(sid)
                if a != b:
                    what = [k for k in a if not b or a[k] != b[k]]
                    bad.append(f"{engine} {fw}x{fh} to {tw}x{th} {sid}: " + (f"canvas {b['over']}px past its stage, " if b and b["over"] else "") + ", ".join(what) + " differ")
    return not bad, f"{n} moves against a fresh load" + (f"; {len(bad)} bad: " + " | ".join(bad[:5]) if bad else "; every scene the same, the toggle live and focused")


# --- keyboard and jump landings on the work pages --------------------------------------------------------------------
# what the focused element is and where, against what covers the screen's top: the sticky strip and, below 1280 px, the
# road bar under it (a control in the strip, or fixed over it as the skip link is, is not covered by them)
FOCUS_JS = """() => { const e = document.activeElement, b = e.getBoundingClientRect(), st = document.querySelector('.strip');
  const bar = document.querySelector('.lx-bar'), sb = st ? st.getBoundingClientRect().bottom : 0;
  const bb = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().bottom : 0;
  return { y: scrollY, top: b.top, bottom: b.bottom, vh: innerHeight, body: e === document.body,
           cover: e.closest('.strip, .skip') ? 0 : Math.max(sb > 0 ? sb : 0, bb), strip: !!e.closest('.strip'), card: e.classList.contains('lx-deep'),
           name: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 24) }; }"""


def tab(engine, back=False):
    """WebKit's Tab skips links unless Option is held (Safari's default); the reader who walks links holds it."""
    return ("Shift+" if back else "") + ("Alt+Tab" if engine == "webkit" else "Tab")


def ctx_for(engine, w, h, dpr=2, phone=False, **kw):
    """A context at w x h; a phone is a touch phone in WebKit (Firefox has no is_mobile, and its defects here show
    without touch)."""
    a = dict(viewport={"width": w, "height": h}, device_scale_factor=dpr, **kw)
    if phone and engine != "firefox":
        a.update(is_mobile=True, has_touch=True)
    return a


def ring_cut(r):
    """How far a stop's focus ring (1 px at a 2 px offset) runs under the cover at the top or past the screen's foot."""
    return max(r["cover"] - (r["top"] - 3), (r["bottom"] + 3) - r["vh"], 0)


def strip_tab(env):
    """Mid-page on a case study and a deep dive on a phone: the skip link takes focus without moving the page, then three
    Tabs walk the sticky strip's links. The strip does not move, so neither may the page: Firefox moved it about half a
    screen per link and WebKit 68 px, the reader's place drifting away one Tab after another."""
    ok, out = True, []
    for engine in ("firefox", "webkit"):
        for path in ("work/kronos.html", "work/kronos-deep.html"):
            pg = env.page(engine, path, **ctx_for(engine, 390, 844, 3, phone=True, reduced_motion="reduce"))
            pg.evaluate("() => scrollTo(0, 2400)")
            pg.wait_for_timeout(300)
            y0 = pg.evaluate("() => { document.querySelector('a.skip').focus({preventScroll: true}); return scrollY; }")
            ys, left = [], None
            for _ in range(3):
                pg.keyboard.press(tab(engine))
                pg.wait_for_timeout(200)
                r = pg.evaluate(FOCUS_JS)
                ys.append(round(r["y"]))
                left = left or (None if r["strip"] else r["name"])
            good = not left and all(abs(y - y0) < 1 for y in ys)
            ok = ok and good
            out.append(f"{engine} {path[5:]} {round(y0)}->" + "->".join(map(str, ys)) + (f" (left the strip at '{left}')" if left else ""))
    return ok, "; ".join(out)


DOCK_JS = """i => { const s = [...document.querySelectorAll('figure.scene.js.docked')][i]; if (!s) return null;
  scrollTo(0, Math.round(s.getBoundingClientRect().top + scrollY - 60)); return s.id; }"""
DOCK_FOCUS_JS = """id => { const bar = document.querySelector('#' + id + '>.sc-bar'), b = bar.getBoundingClientRect();
  const c = [...bar.querySelectorAll('button')].filter(x => !x.disabled && x.getAttribute('aria-disabled') !== 'true' && x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
  c[0].focus({preventScroll: true}); window.__bar = bar; return { y: scrollY, stuck: Math.abs(b.bottom - innerHeight) < 1 }; }"""


def dock_tab(env):
    """A docked deep-dive scene on a phone, its top 60 px down and its stepper stuck to the screen's foot: Tab along the
    stepper from its first live control to its last. The stepper does not move, so neither may the page: WebKit walked
    it 24 px per Tab with no end on custos-code-deep's tall scene, sliding the stage up under the strip, and Firefox
    jumped it 374 px on inf-mem-deep's first."""
    ok, out = True, []
    for engine, path, i in (("webkit", "work/custos-code-deep.html", 1), ("firefox", "work/inf-mem-deep.html", 0)):
        pg = env.page(engine, path, **ctx_for(engine, 390, 844, 3, phone=True, reduced_motion="reduce"))
        pg.wait_for_function("() => window.__deep && document.fonts.status === 'loaded'")
        sid = pg.evaluate(DOCK_JS, i)
        if not sid:
            ok = False
            out.append(f"{engine} {path[5:]}: no docked scene {i}")
            continue
        pg.wait_for_timeout(400)
        f = pg.evaluate(DOCK_FOCUS_JS, sid)
        ys = [round(f["y"])]
        for _ in range(30):
            pg.keyboard.press(tab(engine))
            pg.wait_for_timeout(150)
            if not pg.evaluate("() => window.__bar.contains(document.activeElement)"):
                break
            ys.append(round(pg.evaluate("scrollY")))
        good = f["stuck"] and len(ys) > 2 and all(abs(y - ys[0]) < 1 for y in ys)
        ok = ok and good
        out.append(f"{engine} {path[5:]}#{sid}{'' if f['stuck'] else ' (stepper not stuck)'} " + "->".join(map(str, ys)))
    return ok, "; ".join(out)


def walk(pg, engine, back=False, until=None, limit=80):
    """Tab (or Shift+Tab) from where focus starts, one stop at a time, until focus leaves the page or until(r) holds."""
    rows = []
    for _ in range(limit):
        pg.keyboard.press(tab(engine, back))
        pg.wait_for_timeout(100)
        r = pg.evaluate(FOCUS_JS)
        if r["body"]:
            if rows:
                break
            continue
        rows.append(r)
        if until and until(r):
            break
    return rows


def ff_case_foot(env):
    """Firefox, Tab from the top of a case study through its end: every stop's focus ring is whole, clear of the strip
    and the screen's foot. Firefox leaves a stop where it is while a sliver of it shows, and its centring sat 20 px low
    in the page's scroll padding, so the previous and next links ran past the foot (freeflow at 390x844,
    ai-capabilities at 720x450) and the deep-dive card lost its title's last line (KRONOS at 375x667)."""
    ok, out = True, []
    for w, h, path in ((390, 844, "work/freeflow.html"), (375, 667, "work/kronos.html"), (1280, 720, "work/kronos.html"),
                       (720, 450, "work/ai-capabilities.html"), (720, 450, "work/kronos.html"), (1024, 450, "work/kronos.html")):
        pg = env.page("firefox", path, **ctx_for("firefox", w, h, 2, reduced_motion="reduce"))
        rows = walk(pg, "firefox", until=lambda r: r["name"].startswith("next"))
        cut = [f"'{r['name']}' {ring_cut(r):.0f}px" for r in rows if ring_cut(r) > 0.5]
        ok = ok and bool(rows) and rows[-1]["name"].startswith("next") and not cut
        out.append(f"{w}x{h} {path[5:-5]} {len(rows)} stops" + (f", cut: {', '.join(cut)}" if cut else ""))
    return ok, "; ".join(out)


def ff_card_back(env):
    """Firefox on a short screen (a laptop window at 200% zoom, 720x450 and 1024x450), each case study read to its end:
    Shift+Tab from the foot back to the deep-dive card. Every stop's ring is whole: the card's top rested 22 px under
    the strip and road bar, its first line clipped."""
    ok, out = True, []
    for w, h in ((720, 450), (1024, 450)):
        for path in ("work/kronos.html", "work/freeflow.html", "work/custos-code.html", "work/emergence.html", "work/inf-mem.html"):
            pg = env.page("firefox", path, **ctx_for("firefox", w, h, 2, reduced_motion="reduce"))
            pg.evaluate("() => scrollTo(0, document.scrollingElement.scrollHeight)")
            pg.wait_for_timeout(300)
            pg.mouse.click(2, h - 2)
            rows = walk(pg, "firefox", back=True, until=lambda r: r["card"], limit=10)
            cut = [f"'{r['name']}' {ring_cut(r):.0f}px" for r in rows if ring_cut(r) > 0.5]
            reached = bool(rows) and rows[-1]["card"]
            ok = ok and reached and not cut
            if cut or not reached:
                out.append(f"{w}x{h} {path[5:-5]}: " + (", ".join(cut) if cut else "the card not reached"))
    return ok, "; ".join(out) or "10 walks back to the deep-dive card, every ring whole"


JUMP_JS = """id => { const t = document.getElementById(id).getBoundingClientRect();
  return { top: t.top, pad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) }; }"""


def jump_rest(env):
    """Motion on, KRONOS at 1440x900: a rail click to a section not yet reached, and a link to it opened fresh, rest its
    heading at the scroll padding, 16 px under the strip. Its rise was counted in the landing and then played out, so it
    settled flush with the strip, in WebKit on the fresh load too."""
    ok, out = True, []
    for engine in ("webkit", "firefox"):
        for how in ("click", "load"):
            path = "work/kronos.html" + ("#s-how" if how == "load" else "")
            pg = env.page(engine, path, **ctx_for(engine, 1440, 900, 1, reduced_motion="no-preference"))
            pg.wait_for_timeout(1300)
            if how == "click":
                pg.click(".lx-rail a[href='#s-how']")
            pg.wait_for_timeout(1600)
            r = pg.evaluate(JUMP_JS, "s-how")
            good = abs(r["top"] - r["pad"]) <= 1
            ok = ok and good
            out.append(f"{engine} {how} {r['top']:.0f}/{r['pad']:.0f}")
    return ok, "heading top / scroll padding: " + ", ".join(out)


# freeflow-deep zoomed to 400% on the open page (1440x900 to 360x225) with the reader far down it: the scenes above the
# screen are built again for the narrower stage, taller, and only the browser's scroll anchoring keeps what the reader
# sees in place. Firefox and WebKit stop anchoring after ten quick adjustments that average under 2 px, and deep.js's
# docking makes three 5 px ones per scene above, so the rebuilds built one per task after the relayout landed unanchored.
# FF_PLACE_HOOK notes the first line of prose (outside the figures) on screen at the resize event itself, before any
# timer of the page's has run; FF_PLACE_READ reads where it sits, and whether every canvas fits its stage yet.
FF_PLACE_HOOK = """() => { window.__ffp = null; addEventListener('resize', () => { if (window.__ffp) return;
  let best = null;
  for (const e of document.querySelectorAll('main :is(p, h2, h3, li)')) {
    if (e.closest('figure')) continue;
    const r = e.getBoundingClientRect(); if (r.height && r.top >= 0 && r.top < innerHeight && (!best || r.top < best.top)) best = { e, top: r.top }; }
  window.__ffp = best ? { e: best.e, top: best.top, name: best.e.tagName + ' ' + best.e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 20) } : { e: null }; }); }"""
FF_PLACE_READ = """() => [window.__ffp && window.__ffp.e ? window.__ffp.e.getBoundingClientRect().top : null,
  [...document.querySelectorAll('figure.scene')].every(f => { const c = f.querySelector('.sc-art > canvas');
    return !c || c.getBoundingClientRect().right <= f.querySelector('.sc-stage').getBoundingClientRect().right + 0.5; })]"""
FF_PLACE_TOL = 12


def c_ffplace(env):
    """The reader parked at sc-gates, sc-agree and sc-type (a stage 60 px under the top), the window zoomed to 400%:
    once every scene is built for the new width, the line of prose at the top of the screen is within FF_PLACE_TOL px of
    where it was at the resize. Built one per task after the relayout, the scenes above moved it 66 to 136 px down."""
    bad, out = [], []
    for engine in ("firefox", "webkit"):
        for sid in ("sc-gates", "sc-agree", "sc-type"):
            pg = env.page(engine, "work/freeflow-deep.html", viewport={"width": 1440, "height": 900}, device_scale_factor=1,
                          reduced_motion="reduce")
            pg.wait_for_function("() => window.__deep && document.fonts.status === 'loaded'")
            pg.wait_for_timeout(800)
            pg.evaluate("id => scrollTo(0, Math.round(document.querySelector('#' + id + ' .sc-stage').getBoundingClientRect().top + scrollY - 60))", sid)
            pg.wait_for_timeout(400)
            pg.evaluate(FF_PLACE_HOOK)
            pg.set_viewport_size({"width": 360, "height": 225})
            last, top, fit = None, None, False
            for _ in range(20):
                pg.wait_for_timeout(300)
                top, fit = pg.evaluate(FF_PLACE_READ)
                if fit and top is not None and last is not None and abs(top - last) < 0.5:
                    break
                last = top
            at = pg.evaluate("() => window.__ffp ? [window.__ffp.name, window.__ffp.top] : null")
            if not at or at[0] is None or top is None:
                bad.append(f"{engine} {sid}: no line of prose on screen at the resize")
                continue
            d = top - at[1]
            out.append(f"{engine} {sid} {d:+.0f}")
            if not fit:
                bad.append(f"{engine} {sid}: a canvas still runs past its stage after 6s")
            if abs(d) > FF_PLACE_TOL:
                bad.append(f"{engine} {sid}: '{at[0]}' moved {at[1]:.0f} -> {top:.0f} ({d:+.0f} px)")
            bad += [f"{engine} {sid}: {e}" for e in pg.errors]
    return not bad, (f"{len(bad)} bad: " + " | ".join(bad[:4]) if bad else f"every reader within {FF_PLACE_TOL} px") + "; shifts " + ", ".join(out)


REPLAY_PICK_JS = """() => { const s = __deep.scenes().find(s => { const b = document.querySelector('#' + s.id + ' > .sc-bar');
  return s.of > 1 && b && b.querySelector('.replay') && getComputedStyle(b).display !== 'none'; });
  if (!s) return null; const f = document.getElementById(s.id); scrollTo(0, Math.round(f.getBoundingClientRect().top + scrollY - 80)); return s.id; }"""
REPLAY_END_JS = """id => { const q = document.querySelectorAll('#' + id + ' .sc-pip'); q[q.length - 1].click(); q[q.length - 1].focus(); }"""
REPLAY_AT_JS = """id => { const f = document.getElementById(id), r = f.querySelector('.sc-bar .replay'), a = document.activeElement, s = __deep.scenes().find(s => s.id === id), b = r.getBoundingClientRect();
  return { on: a === r, active: a === document.body ? 'body' : a === r ? 'replay' : (a.getAttribute('aria-label') || a.tagName.toLowerCase()).slice(0, 24),
    shown: getComputedStyle(r).visibility === 'visible', mode: s.mode, x: b.left + b.width / 2, y: b.top + b.height / 2 }; }"""


def replay_key(env):
    """Motion on, every deep dive at 1440x900: a scene's first stepper brought to its last step, Tab onto replay and
    Enter. The scene plays again with the keyboard still on replay, drawn: it hid itself as the play began and focus fell
    to the page, in both engines as in Chromium. Stopped with a square, a click on replay still hides it."""
    ok, out = True, []
    for engine in ("webkit", "firefox"):
        for path in ("work/custos-code-deep.html", "work/emergence-deep.html", "work/freeflow-deep.html", "work/inf-mem-deep.html", "work/kronos-deep.html"):
            pg = env.page(engine, path, **ctx_for(engine, 1440, 900, 1, reduced_motion="no-preference"))
            pg.wait_for_function("() => window.__deep && document.fonts.status === 'loaded'")
            sid = pg.evaluate(REPLAY_PICK_JS)
            if not sid:
                ok = False
                out.append(f"{engine} {path[5:]}: no scene with a replay")
                continue
            pg.wait_for_timeout(300)
            pg.evaluate(REPLAY_END_JS, sid)
            pg.wait_for_timeout(200)
            pg.keyboard.press(tab(engine))
            pg.wait_for_timeout(100)
            t = pg.evaluate(REPLAY_AT_JS, sid)
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(150)
            k = pg.evaluate(REPLAY_AT_JS, sid)
            pg.wait_for_timeout(600)
            k2 = pg.evaluate(REPLAY_AT_JS, sid)
            pg.evaluate(REPLAY_END_JS, sid)
            pg.evaluate("() => document.activeElement.blur()")
            pg.wait_for_timeout(200)
            m0 = pg.evaluate(REPLAY_AT_JS, sid)
            pg.mouse.click(m0["x"], m0["y"])
            pg.wait_for_timeout(150)
            m = pg.evaluate(REPLAY_AT_JS, sid)
            good = (t["on"] and k["on"] and k["shown"] and k["mode"] == "auto" and k2["on"] and k2["shown"]
                    and m0["shown"] and m["mode"] == "auto" and not m["shown"] and not pg.errors)
            ok = ok and good
            if not good:
                out.append(f"{engine} {path[5:-10]} {sid}: Tab -> {t['active']}; Enter -> {k['active']} ({'drawn' if k['shown'] else 'hidden'}, {k['mode']}), "
                           f"+600ms {k2['active']}; click -> {'drawn' if m['shown'] else 'hidden'}, {m['mode']}" + (f"; {pg.errors[0]}" if pg.errors else ""))
    return ok, "; ".join(out) or "10 replays by keyboard: each plays with the keyboard still on replay, drawn; a click still hides it"


# every control on a docked deep-dive stage, placed part (8 px) and wholly under the strip and reached by Shift+Tab, and
# part and wholly under the docked words and reached by Tab: where it rests, against the band the page draws (the sticky
# strip's or road bar's foot, and the top of the words' void backing, 4 px over its rule)
STAGE_LIST_JS = """() => { const ok = e => e.tabIndex >= 0 && !e.disabled && !e.closest('[inert],[aria-hidden="true"]') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  const all = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')].filter(ok); window.__tab = all;
  return all.map((e, i) => { const f = e.closest('figure.scene.js.docked'), st = f && f.querySelector(':scope>.sc-stage'); return st && st.contains(e) ? [i, f.id] : null; }).filter(Boolean); }"""
STAGE_BAND = """const band = c => { const f = c.closest('figure.scene'), k = f.querySelector(':scope>.sc-keys'), s = document.querySelector('.strip'), b = document.querySelector('.lx-bar');
    const lo = Math.max(s && getComputedStyle(s).position === 'sticky' ? s.getBoundingClientRect().bottom : 0, b && getComputedStyle(b).display !== 'none' ? b.getBoundingClientRect().bottom : 0);
    return [lo, k.getBoundingClientRect().bottom - (parseFloat(f.style.getPropertyValue('--dock-h')) || 0) - 4]; };"""
STAGE_PUT_JS = """([i, how, d]) => { """ + STAGE_BAND + """ const c = window.__tab[i];
  for (let n = 0; n < 4; n++) { const r = c.getBoundingClientRect(), [lo, hi] = band(c), dd = d < 0 ? r.height + 8 : d;
    const dy = how === 'below' ? r.top - (lo - dd) : r.bottom - (hi + dd); if (Math.abs(dy) < 1) break; scrollTo(0, Math.round(scrollY + dy)); }
  const s = window.__tab[how === 'below' ? i + 1 : i - 1]; if (!s) return false; s.focus({ preventScroll: true }); return true; }"""
STAGE_AT_JS = """i => { """ + STAGE_BAND + """ const c = window.__tab[i], r = c.getBoundingClientRect(), [lo, hi] = band(c);
  return { on: document.activeElement === c, name: (c.getAttribute('aria-label') || c.value || c.textContent || c.tagName).trim().replace(/\\s+/g, ' ').slice(0, 18),
    top: Math.round(r.top), bottom: Math.round(r.bottom), lo: Math.round(lo), hi: Math.round(hi), vh: innerHeight }; }"""


def stage_tab(env):
    """A phone (390x844), every control on a docked deep-dive stage reached by Shift+Tab from under the strip and by Tab
    from under the docked words rests with its focus ring between them. WebKit brings a text field in by its caret, to
    the page's scroll padding only, so custos-code-deep's fields rested 7 px under the road bar; Firefox leaves a control
    where it is while more than 16 px of it shows, so its check cards (54 px) rested 8 px under it."""
    ok, out, n = True, [], 0
    for engine in ("webkit", "firefox"):
        for path in ("work/custos-code-deep.html", "work/emergence-deep.html", "work/freeflow-deep.html", "work/inf-mem-deep.html", "work/kronos-deep.html"):
            pg = env.page(engine, path, **ctx_for(engine, 390, 844, 3, phone=True, reduced_motion="reduce"))
            pg.wait_for_function("() => window.__deep && document.fonts.status === 'loaded'")
            pg.wait_for_timeout(200)
            for i, sid in pg.evaluate(STAGE_LIST_JS):
                for how in ("below", "above"):
                    for d in (8, -1):
                        if not pg.evaluate(STAGE_PUT_JS, [i, how, d]):
                            continue
                        pg.wait_for_timeout(50)
                        pg.keyboard.press(tab(engine, back=how == "below"))
                        pg.wait_for_timeout(120)
                        r = pg.evaluate(STAGE_AT_JS, i)
                        n += 1
                        if not (r["on"] and r["top"] - 3 >= r["lo"] and r["bottom"] + 3 <= min(r["hi"], r["vh"])):
                            ok = False
                            out.append(f"{engine} {path[5:-5]}#{sid} '{r['name']}' from {how} ({'part' if d > 0 else 'wholly'} under): "
                                       + (f"rests {r['top']}..{r['bottom']} in {r['lo']}..{r['hi']}" if r["on"] else "focus went elsewhere"))
            ok = ok and not pg.errors
            out += [f"{engine} {path[5:]}: {e}" for e in pg.errors[:1]]
    return ok and n > 0, (f"{n} landings; " + "; ".join(out[:6]) if out else f"{n} landings in WebKit and Firefox, every control's ring between the strip and the docked words")


# (name, engines, function, what it settles); each function takes the Env and returns (ok, measured)
CHECKS = [
    ("rotate", ["webkit"], rotate, "a phone turned sideways and back mid-story: no error, a fresh layout, the art still drawn"),
    ("skipreload", ["webkit"], skipreload, "desktop: Enter on the skip link, read on, reload: back at the reader's place"),
    ("blobring", ["firefox"], blobring, "Tab onto the work section's theme blobs: each whole on screen with its ring (1280x800, 640x400)"),
    ("ffresize", ("webkit", "firefox"), c_ffresize, "freeflow-deep zoomed 1280x800 to 640x400 (and in WebKit turned 667x375 to 375x667 and 844x390 to 390x844) draws what a fresh load there draws, sc-gates' toggle still live and focused"),
    ("strip-tab", ("firefox", "webkit"), strip_tab, "mid-page Tab through the sticky strip's links leaves the page where it was"),
    ("dock-tab", ("webkit", "firefox"), dock_tab, "Tab along a docked deep-dive stepper stuck at the foot leaves the page where it was"),
    ("ff-case-foot", ("firefox",), ff_case_foot, "Tab from the top of a case study: every stop's ring whole, the case-nav and deep-dive card included"),
    ("ff-card-back", ("firefox",), ff_card_back, "on a short screen, Shift+Tab from a case study's foot to its deep-dive card: every ring whole"),
    ("jump-rest", ("webkit", "firefox"), jump_rest, "motion on: a rail click and a fresh #link rest the heading at the scroll padding"),
    ("ffplace", ("firefox", "webkit"), c_ffplace, "freeflow-deep zoomed to 400% mid-page: the scenes built again above the screen leave the reader's line where it was"),
    ("replay-key", ("webkit", "firefox"), replay_key, "motion on, every deep dive: Tab onto a scene's replay and Enter plays it with the keyboard still on replay, drawn; a click still hides it"),
    ("stage-tab", ("webkit", "firefox"), stage_tab, "a phone: every control on a docked deep-dive stage, reached by Shift+Tab from under the strip and Tab from under the docked words, rests with its ring between them"),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default="", help="comma-separated check names")
    ap.add_argument("--root", default=str(ROOT), help="directory to serve (must hold index.html)")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--debug", action="store_true", help="print tracebacks for harness errors")
    a = ap.parse_args()
    if a.list:
        for n, engines, _, what in CHECKS:
            print(f"{n:16s} {','.join(engines):16s} {what}")
        return 0
    names = [n for n, *_ in CHECKS]
    only = [x.strip() for x in a.only.split(",") if x.strip()]
    unknown = [x for x in only if x not in names]
    if unknown:
        print(f"unknown check(s): {', '.join(unknown)}; see --list")
        return 2
    root = Path(a.root).resolve()
    if not (root / "index.html").is_file():
        print(f"no index.html under {root}")
        return 2
    from playwright.sync_api import sync_playwright
    t0, results, missing = time.time(), [], []
    with sync_playwright() as p:
        env = Env(p, root)
        print(f"engines: {env.base} (serving {root})", flush=True)
        try:
            for n, engines, fn, _ in CHECKS:
                if only and n not in only:
                    continue
                try:
                    ok, m = fn(env)
                except Missing as e:
                    missing.append(n)
                    print(f"DID NOT RUN {n}: {e}", flush=True)
                    continue
                except Exception as e:
                    ok, m = False, f"harness error: {type(e).__name__}: {str(e).splitlines()[0][:200]}"
                    if a.debug:
                        traceback.print_exc()
                finally:
                    env.done()
                results.append({"ok": bool(ok), "name": n})
                print(f"{'PASS' if ok else 'FAIL'} {n}[{','.join(engines)}] {m}", flush=True)
        finally:
            env.close()
    fails = [r for r in results if not r["ok"]]
    print(f"\n{len(results) - len(fails)} passed, {len(fails)} failed"
          + (f", {len(missing)} did not run ({', '.join(missing)})" if missing else "") + f", {time.time() - t0:.0f}s", flush=True)
    return 1 if fails else 2 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
