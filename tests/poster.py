"""The link preview, poster.jpg: the walk's map after a full read-through, at 1200x630, beside three lines of text.

usage: .venv/bin/python tests/poster.py            # check: poster.jpg is a fresh render of LINES beside the grown map
       .venv/bin/python tests/poster.py --render   # write poster.jpg

A read-through plays every station to its end, so every bloom has grown; then the map hold is captured with the
page's chrome and DOM labels hidden, so only the canvas remains. The map is placed whole-pixel with its lit box on the
right 64px gutter and its top at 40, and no lit map pixel may sit within 24px of the text. The check renders the
poster again and compares it with the tracked file pixel by pixel, so a poster that still carries other text, an older
map or ungrown blooms fails. Exits 1 on any FAIL.
"""
import argparse, base64, functools, http.server, os, sys, tempfile, threading

from playwright.sync_api import sync_playwright

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
POSTER = os.path.join(REPO, "poster.jpg")
W, H = 1200, 630
MAX_BYTES = 200 * 1024
# name, record line, subline: these three and nothing else
LINES = ("Oliver Zhang", "CS at UT Austin · Turing Scholars ’28", "a Langton’s ant draws the page as you scroll")
MEAN_MAX, BAD_SHARE_MAX = 0.05, 0.00002   # a re-render in the same browser build is exact; one changed glyph is ~100 px
CLEAR_PX = 24                              # no lit map pixel within this many px of the text

HIDE = ("#strip,#strip *,#step,#places,#places *,#hit,#story,#story *,#doc,#snap,#native"
        "{visibility:hidden!important;opacity:0!important}")
SETTLE = """async (ms) => { const raf = () => new Promise(r => requestAnimationFrame(r)); const t0 = performance.now();
  await raf(); await raf(); while (performance.now() - t0 < ms) { if (!__walk.running()) { await raf(); return true; } await raf(); } return false; }"""
# the poster sheet: the site's fonts and tokens, the map image and the three lines
SHEET = """<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
@font-face{font-family:"Space Grotesk";font-style:normal;font-weight:300 700;font-display:block;src:url(/work/assets/space-grotesk.woff2) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:400 800;font-display:block;src:url(/work/assets/jetbrains-mono.woff2) format("woff2")}
:root{--void:#0a0b14;--ink:#e8e6f0;--body:#b9b6cc;--muted:#8a87a0}
html,body{margin:0;padding:0;background:var(--void)}
body{width:1200px;height:630px;overflow:hidden;position:relative;-webkit-font-smoothing:antialiased}
p{margin:0;white-space:nowrap}
#art{position:absolute;left:0;top:0;image-rendering:pixelated}
#txt{position:absolute;left:64px;top:56px;z-index:2}
.pn{font:500 64px/64px "Space Grotesk";letter-spacing:-.025em;color:var(--ink)}
.pr{margin-top:24px;font:400 15px/24px "JetBrains Mono";color:var(--body)}
.ps{margin-top:4px;font:400 13px/24px "JetBrains Mono";color:var(--muted)}
</style></head><body></body></html>"""
# the lit box of the map image; the bottom 64 rows are the canvas caption row, which never ships
BBOX = """async (src) => { const im = new Image(); im.src = src; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d');
  x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, im.width, im.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const lim = im.height - 64;
  for (let y = 0; y < lim; y++) for (let i = 0; i < im.width; i++) { const o = (y * im.width + i) * 4;
    if (Math.abs(d[o] - 29) + Math.abs(d[o+1] - 27) + Math.abs(d[o+2] - 42) <= 3) continue;
    if (Math.abs(d[o] - 10) + Math.abs(d[o+1] - 11) + Math.abs(d[o+2] - 20) > 24) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  return [x0, y0, x1 + 1, y1 + 1]; }"""
COMPOSE = """async ([src, dx, dy, lines, m]) => {
  const im = document.createElement('img'); im.id = 'art'; im.src = src; im.style.left = dx + 'px'; im.style.top = dy + 'px'; document.body.appendChild(im);
  const t = document.createElement('div'); t.id = 'txt'; document.body.appendChild(t);
  lines.forEach((s, i) => { const p = document.createElement('p'); p.className = ['pn', 'pr', 'ps'][i]; p.textContent = s; t.appendChild(p); });
  await document.fonts.load('500 64px "Space Grotesk"'); await document.fonts.load('400 13px "JetBrains Mono"'); await document.fonts.ready; await im.decode();
  const r = [...t.children].map(e => { const q = document.createRange(); q.selectNodeContents(e); return q.getBoundingClientRect(); });
  const box = [Math.max(0, Math.floor(Math.min(...r.map(q => q.left))) - m), Math.max(0, Math.floor(Math.min(...r.map(q => q.top))) - m),
               Math.min(1200, Math.ceil(Math.max(...r.map(q => q.right))) + m), Math.min(630, Math.ceil(Math.max(...r.map(q => q.bottom))) + m)];
  const c = document.createElement('canvas'); c.width = 1200; c.height = 630; const x = c.getContext('2d');
  x.fillStyle = '#0a0b14'; x.fillRect(0, 0, 1200, 630); x.imageSmoothingEnabled = false; x.drawImage(im, dx, dy);
  const d = x.getImageData(box[0], box[1], box[2] - box[0], box[3] - box[1]).data; let lit = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 10) + Math.abs(d[i+1] - 11) + Math.abs(d[i+2] - 20) > 24) lit++;
  return {shown: [...t.children].map(p => p.textContent), fonts: [...document.fonts].map(f => f.status), lit}; }"""
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


def read_through(b, base):
    """Every station plays to its end, then the map hold, chrome hidden; returns the canvas frame as a PNG."""
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.set_default_timeout(30000)
    pg.goto(base + "/index.html")
    pg.wait_for_function("window.__walk && document.fonts.status === 'loaded'")
    S = pg.evaluate("() => __walk.S()")
    for sid, A, *_ in pg.evaluate("() => __walk.stations"):
        pg.evaluate("(y) => window.scrollTo(0, y)", round((A + 0.02) * S))
        pg.evaluate(SETTLE, 8000)
        pb = None
        for _ in range(80):
            pb = pg.evaluate("(id) => __walk.playback(id)", sid)
            if pb and pb["state"] == "done":
                break
            pg.wait_for_timeout(200)
        if not pb or pb["state"] != "done":
            raise SystemExit(f"FAIL poster: station {sid} never finished")
    pg.evaluate("(y) => window.scrollTo(0, y)", round((pg.evaluate("() => __walk.MAPS") + 0.01) * S))
    if not pg.evaluate(SETTLE, 12000):
        raise SystemExit("FAIL poster: the map frame never settled")
    bl = pg.evaluate("() => __walk.blooms ? __walk.blooms() : null")
    grown = (bl or {}).get("grown") or []
    if len(grown) < len(pg.evaluate("() => __walk.stations")):
        raise SystemExit(f"FAIL poster: only {len(grown)} blooms grew")
    pg.add_style_tag(content=HIDE)
    pg.evaluate(SETTLE, 4000)
    png = pg.screenshot(type="png")
    ctx.close()
    return png


def render(out):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=REPO))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            src = "data:image/png;base64," + base64.b64encode(read_through(b, base)).decode()
            ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
            pg = ctx.new_page()
            pg.route(base + "/poster-sheet", lambda r: r.fulfill(status=200, content_type="text/html", body=SHEET))
            pg.goto(base + "/poster-sheet")
            x0, y0, x1, y1 = pg.evaluate(BBOX, src)
            # the coloured map sits right on the 64px gutter with its top at 40; the road runs on past the bottom edge
            r = pg.evaluate(COMPOSE, [src, 1136 - x1, 40 - y0, list(LINES), CLEAR_PX])
            for q in (92, 90, 88, 85, 82, 78, 74, 70):
                pg.screenshot(path=out, type="jpeg", quality=q, clip={"x": 0, "y": 0, "width": W, "height": H})
                if os.path.getsize(out) <= MAX_BYTES:
                    break
            ctx.close()
            b.close()
            return r
    finally:
        srv.shutdown()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--render", action="store_true", help="write poster.jpg")
    a = ap.parse_args()
    if a.render:
        r = render(POSTER)
        print(f"wrote poster.jpg {W}x{H}, {os.path.getsize(POSTER)} bytes: " + " / ".join(r["shown"]) + f"; lit near text {r['lit']}")
        return 0
    if not os.path.exists(POSTER):
        print("FAIL poster: poster.jpg is missing"); return 1
    with tempfile.TemporaryDirectory() as td:
        fresh = os.path.join(td, "fresh.jpg")
        r = render(fresh)
        enc = lambda f: base64.b64encode(open(f, "rb").read()).decode()
        with sync_playwright() as p:
            b = p.chromium.launch(); pg = b.new_page()
            d = pg.evaluate(DIFF, [enc(POSTER), enc(fresh)])
            b.close()
    fails = []
    if list(r["shown"]) != list(LINES):
        fails.append(f"drew {r['shown']!r}")
    if any(s != "loaded" for s in r["fonts"]):
        fails.append(f"fonts {r['fonts']}")
    if r["lit"]:
        fails.append(f"{r['lit']} lit map pixels within {CLEAR_PX}px of the text")
    if os.path.getsize(POSTER) > MAX_BYTES:
        fails.append(f"poster.jpg is {os.path.getsize(POSTER)} bytes (limit {MAX_BYTES})")
    if d.get("size") != [W, H]:
        fails.append(f"size {d.get('size')} (want {W}x{H})")
    elif d["mean"] > MEAN_MAX or d["bad"] > BAD_SHARE_MAX:
        fails.append(f"poster.jpg is not a render of the current lines beside the current map: mean diff {d['mean']:.4f}, "
                     f"{d['bad'] * 100:.4f}% of pixels off by more than 48 (run tests/poster.py --render)")
    if fails:
        print("FAIL poster: " + "; ".join(fails)); return 1
    print(f"PASS poster: {W}x{H}, a render of '{' / '.join(LINES)}' beside the grown map (mean diff {d['mean']:.3f}, {d['bad'] * 100:.3f}% off)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
