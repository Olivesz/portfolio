"""The link preview, poster.jpg: the walk's map frame at 1200x630 with three lines of text.

usage: .venv/bin/python tests/poster.py            # check: poster.jpg is a fresh render of LINES over the map frame
       .venv/bin/python tests/poster.py --render   # write poster.jpg

The check renders the poster again and compares it with the tracked file pixel by pixel, so a poster that
still carries other text, or an older map, fails. Exits 1 on any FAIL.
"""
import argparse, base64, functools, http.server, os, sys, tempfile, threading

from playwright.sync_api import sync_playwright

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
POSTER = os.path.join(REPO, "poster.jpg")
W, H = 1200, 630
# name, record line, subline: these three and nothing else
LINES = ("Oliver Zhang", "CS at UT Austin · Turing Scholars ’28", "a Langton’s ant draws the page as you scroll")
MEAN_MAX, BAD_SHARE_MAX = 0.05, 0.00002   # a re-render in the same browser build is exact; one changed glyph is ~100 px

# the page's own chrome goes; the walk moves right of the text block; the caption row is covered (it is drawn on the canvas)
HIDE = """#strip,#strip *,#step,#places,#places *,#hit,#story,#story *,#doc,#snap,#native{visibility:hidden!important;opacity:0!important}
#world{transform:translateX(520px)}
body::after{content:'';position:fixed;z-index:98;left:0;right:0;bottom:0;height:48px;background:var(--void)}"""
TEXT = """([name, rec, sub]) => {
  const d = document.createElement('div'); d.id = 'poster-text';
  d.style.cssText = 'position:fixed;z-index:99;left:64px;top:56px';
  const line = (t, css) => { const p = document.createElement('p'); p.textContent = t; p.style.cssText = 'margin:0;white-space:nowrap;' + css; d.appendChild(p); };
  line(name, 'font:500 64px/64px "Space Grotesk";letter-spacing:-.025em;color:var(--ink)');
  line(rec, 'margin-top:24px;font:400 15px/24px "JetBrains Mono";color:var(--body)');
  line(sub, 'margin-top:4px;font:400 13px/24px "JetBrains Mono";color:var(--muted)');
  document.body.appendChild(d);
  return [...d.children].map(p => p.textContent); }"""
SETTLE = """async () => { const raf = () => new Promise(r => requestAnimationFrame(r)); const t0 = performance.now();
  await raf(); await raf(); while (performance.now() - t0 < 8000) { if (!__walk.running()) { await raf(); return true; } await raf(); } return false; }"""
DIFF = """async ([a, b]) => {
  const ld = s => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/jpeg;base64,' + s; });
  const [A, B] = await Promise.all([ld(a), ld(b)]);
  if (A.width !== B.width || A.height !== B.height) return { size: [A.width, A.height, B.width, B.height] };
  const px = im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
  const da = px(A), db = px(B); let sum = 0, bad = 0;
  for (let i = 0; i < da.length; i += 4) { const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i+1] - db[i+1]), Math.abs(da[i+2] - db[i+2])); sum += d; if (d > 48) bad++; }
  const n = da.length / 4; return { size: [A.width, A.height], mean: sum / n, bad: bad / n }; }"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def render(out):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=REPO))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
            pg.set_default_timeout(30000)
            pg.goto(f"http://127.0.0.1:{srv.server_address[1]}/index.html")
            pg.wait_for_function("window.__walk && document.fonts.status === 'loaded'")
            s = pg.evaluate("() => __walk.MAPS + 0.01")
            pg.evaluate("(y) => window.scrollTo(0, y)", round(s * pg.evaluate("() => __walk.S()")))
            if not pg.evaluate(SETTLE):
                raise SystemExit("FAIL poster: the map frame never settled")
            pg.add_style_tag(content=HIDE)
            shown = pg.evaluate(TEXT, list(LINES))
            pg.evaluate(SETTLE)
            pg.screenshot(path=out, type="jpeg", quality=90)
            b.close()
            return shown
    finally:
        srv.shutdown()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--render", action="store_true", help="write poster.jpg")
    a = ap.parse_args()
    if a.render:
        shown = render(POSTER)
        print(f"wrote poster.jpg {W}x{H}: " + " / ".join(shown))
        return 0
    if not os.path.exists(POSTER):
        print("FAIL poster: poster.jpg is missing"); return 1
    with tempfile.TemporaryDirectory() as td:
        fresh = os.path.join(td, "fresh.jpg")
        shown = render(fresh)
        enc = lambda f: base64.b64encode(open(f, "rb").read()).decode()
        with sync_playwright() as p:
            b = p.chromium.launch(); pg = b.new_page()
            d = pg.evaluate(DIFF, [enc(POSTER), enc(fresh)])
            b.close()
    fails = []
    if list(shown) != list(LINES):
        fails.append(f"drew {shown!r}")
    if d.get("size") != [W, H]:
        fails.append(f"size {d.get('size')} (want {W}x{H})")
    elif d["mean"] > MEAN_MAX or d["bad"] > BAD_SHARE_MAX:
        fails.append(f"poster.jpg is not a render of the current lines over the current map: mean diff {d['mean']:.4f}, "
                     f"{d['bad'] * 100:.4f}% of pixels off by more than 48 (run tests/poster.py --render)")
    if fails:
        print("FAIL poster: " + "; ".join(fails)); return 1
    print(f"PASS poster: {W}x{H}, a render of '{' / '.join(LINES)}' over the map frame (mean diff {d['mean']:.3f}, {d['bad'] * 100:.3f}% off)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
