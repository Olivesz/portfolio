/* one column (under 1024 px): the facts (year, stack, code, themes) follow the opening figure, so a phone opens on
   the figure rather than a table. The page places them at load with a small script right after its hero; this keeps
   them placed when the width changes later. The page reads whole without script. */
(function () {
  "use strict";
  var head = document.querySelector(".head"), grid = head && head.querySelector(".head-grid"), fig = head && head.nextElementSibling;
  if (!grid || !fig || !fig.classList.contains("hero-fig") || !window.matchMedia) return;
  var box = document.querySelector(".facts-after"), facts = box ? box.querySelector(".facts") : grid.querySelector(".facts");
  if (!facts) return;
  if (!box) { box = document.createElement("div"); box.className = "blk facts-after"; }
  var mq = matchMedia("(max-width:1023px)");
  function place() {
    if (mq.matches) { if (facts.parentNode !== box) { box.appendChild(facts); fig.parentNode.insertBefore(box, fig.nextSibling); } }
    else if (facts.parentNode === box) { grid.appendChild(facts); if (box.parentNode) box.parentNode.removeChild(box); }
  }
  place();
  if (mq.addEventListener) mq.addEventListener("change", place); else if (mq.addListener) mq.addListener(place);
})();

/* case studies: a figure marked [data-play] plays once when half of it is on screen (40% of the screen for a tall
   one; on the first screen, before any scroll, a sixth of the screen will do, so a phone opens on it playing rather
   than on a still frame), keeps its final state and then offers replay. Figures listen for case:play and case:rest
   on their stage and dispatch case:done when finished. No wheel, touch or key listeners: replay is a native button. */
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function fire(el, type) { el.dispatchEvent(new CustomEvent(type, { bubbles: true })); }
  var steps = [];
  for (var k = 0; k <= 20; k++) steps.push(k / 20);
  function setup(stage) {
    var fig = stage.closest("figure"), btn = fig ? fig.querySelector(".replay") : null;
    if (btn) btn.hidden = true;
    stage.addEventListener("case:done", function () { stage.dataset.state = "done"; if (btn && !reduce) btn.hidden = false; });
    function play() { stage.dataset.state = "playing"; if (btn) btn.hidden = true; fire(stage, "case:play"); }
    if (btn) btn.addEventListener("click", play);
    if (reduce || !("IntersectionObserver" in window)) { stage.dataset.state = "rest"; fire(stage, "case:rest"); return; }
    var io = new IntersectionObserver(function (es) {
      // on the first screen at load, the figure holds its first frame until the heading has risen in (0.6 s)
      for (var i = 0; i < es.length; i++) {
        var e = es[i], need = Math.min(e.boundingClientRect.height * 0.5, innerHeight * (window.scrollY < 1 ? 1 / 6 : 0.4));
        if (!e.isIntersecting || e.intersectionRect.height < need - 1) continue;
        io.disconnect();
        var wait = 600 - (window.performance && performance.now ? performance.now() : 600);
        if (wait > 0) setTimeout(play, wait); else play();
        return;
      }
    }, { threshold: steps });
    io.observe(stage);
  }
  // figure scripts register their listeners first, so this runs after them (deferred, last in the body)
  var stages = document.querySelectorAll("[data-play]");
  for (var i = 0; i < stages.length; i++) setup(stages[i]);
})();

/* arrival builds: a figure marked [data-build] draws its marks (.bld grow from their start, .bld-o fade in, staggered
   by --i) the first time a sixth of it is on screen. A figure seen approaching faster than 2 px/ms, within half a
   screen below the fold (a skim or a flick), is marked .quick and starts drawing before it arrives, its marks almost
   together, so a skimming reader is not shown it half built. Without IntersectionObserver, under reduced motion or
   with no script it is simply drawn whole. */
(function () {
  "use strict";
  var figs = document.querySelectorAll("[data-build]");
  if (!figs.length || !("IntersectionObserver" in window) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  var seen = typeof WeakMap === "function" ? new WeakMap() : null, near, io, steps = [];
  for (var k = 0; k <= 20; k++) steps.push(k / 20);
  // fast: more than 200 px travelled since first seen, above 2 px/ms, so one eased wheel notch never counts
  function fast(e) {
    var f = seen && seen.get(e.target), dt = f ? e.time - f.t : 0, dy = f ? Math.abs(f.y - e.boundingClientRect.top) : 0;
    return dt > 0 && dy > 200 && dy / dt > 2;
  }
  function go(el, quick) {
    near.unobserve(el); io.unobserve(el);
    if (el.getAttribute("data-build") !== "pre") return;
    if (quick) el.classList.add("quick");
    el.setAttribute("data-build", "go");
  }
  near = new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      var e = es[i];
      if (!e.isIntersecting || !seen) continue;
      if (!seen.has(e.target)) seen.set(e.target, { t: e.time, y: e.boundingClientRect.top });
      else if (fast(e)) go(e.target, true);
    }
  }, { rootMargin: "0px 0px 50% 0px", threshold: steps });
  io = new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      var e = es[i], r = e.intersectionRect;
      if (!e.isIntersecting || (e.intersectionRatio < 0.15 && r.height < innerHeight * 0.15)) continue;
      // met this far in on its first sighting, it came faster than a reading notch
      go(e.target, seen && seen.has(e.target) ? fast(e) : r.height > 140);
    }
  }, { threshold: [0, 0.05, 0.1, 0.15] });
  for (var i = 0; i < figs.length; i++) { figs[i].setAttribute("data-build", "pre"); near.observe(figs[i]); io.observe(figs[i]); }
})();

/* inline figures marked data-reveal: armed while still below the fold, drawn once when 40% of the figure is on screen,
   or a fifth of the viewport for a figure taller than that, so a reader never pauses over a screen of empty space.
   A figure that comes into view faster than 2 px/ms (a skim, a flick or a jump; reading runs near 1) is marked .quick
   and draws its parts almost together, so a skimming reader is not shown the empty half still waiting its turn; one
   seen approaching that fast within half a screen below the fold starts drawing before it arrives.
   Reduced motion or no IntersectionObserver: nothing is armed, so every part rests in its final state. */
(function () {
  "use strict";
  var figs = document.querySelectorAll(".ig[data-reveal]");
  if (!figs.length || !("IntersectionObserver" in window) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  var first = typeof WeakMap === "function" ? new WeakMap() : null, ahead = typeof WeakMap === "function" ? new WeakMap() : null, near, steps = [];
  for (var k = 0; k <= 20; k++) steps.push(k / 20);
  // the approach zone: more than 200 px travelled since first seen there, above 2 px/ms, so one eased wheel notch never counts
  if (ahead) near = new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      var e = es[i], f = ahead.get(e.target);
      if (!e.isIntersecting) continue;
      if (!f) { ahead.set(e.target, { t: e.time, y: e.boundingClientRect.top }); continue; }
      var dt = e.time - f.t, dy = Math.abs(f.y - e.boundingClientRect.top);
      if (dt > 0 && dy > 200 && dy / dt > 2) { e.target.classList.add("quick", "on"); near.unobserve(e.target); io.unobserve(e.target); }
    }
  }, { rootMargin: "0px 0px 50% 0px", threshold: steps });
  var io = new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      var e = es[i], r = e.intersectionRect;
      if (!e.isIntersecting) continue;
      if (first && !first.has(e.target)) first.set(e.target, { t: e.time, y: e.boundingClientRect.top });
      if (e.intersectionRatio >= 0.4 || r.height >= innerHeight * 0.2) {
        // speed from how far the figure moved since it first showed, or else since it entered the approach zone; met
        // already this far in with neither, it came faster than a notch
        var f = first && first.get(e.target), a = ahead && ahead.get(e.target), y = e.boundingClientRect.top, dt = f ? e.time - f.t : 0;
        if (!(dt > 0) && a && e.time > a.t) { f = a; dt = e.time - a.t; }
        if (f && (dt > 0 ? Math.abs(f.y - y) / dt > 2 : r.height > 140)) e.target.classList.add("quick");
        e.target.classList.add("on"); io.unobserve(e.target); if (near) near.unobserve(e.target);
      }
    }
  }, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4] });
  for (var i = 0; i < figs.length; i++) {
    if (figs[i].getBoundingClientRect().top < innerHeight) continue;   // already in view at load: leave it whole
    figs[i].classList.add("armed"); io.observe(figs[i]); if (near) near.observe(figs[i]);
  }
})();
