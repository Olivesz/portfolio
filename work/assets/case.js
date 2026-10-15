/* case studies: a figure marked [data-play] plays once when half of it is on screen, keeps its final state and then
   offers replay. Figures listen for case:play and case:rest on their stage and dispatch case:done when finished.
   No wheel, touch or key listeners: replay is a native button. */
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function fire(el, type) { el.dispatchEvent(new CustomEvent(type, { bubbles: true })); }
  function setup(stage) {
    var fig = stage.closest("figure"), btn = fig ? fig.querySelector(".replay") : null;
    if (btn) btn.hidden = true;
    stage.addEventListener("case:done", function () { stage.dataset.state = "done"; if (btn && !reduce) btn.hidden = false; });
    function play() { stage.dataset.state = "playing"; if (btn) btn.hidden = true; fire(stage, "case:play"); }
    if (btn) btn.addEventListener("click", play);
    if (reduce || !("IntersectionObserver" in window)) { stage.dataset.state = "rest"; fire(stage, "case:rest"); return; }
    var io = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) if (es[i].isIntersecting) { io.disconnect(); play(); return; }
    }, { threshold: 0.5 });
    io.observe(stage);
  }
  // figure scripts register their listeners first, so this runs after them (deferred, last in the body)
  var stages = document.querySelectorAll("[data-play]");
  for (var i = 0; i < stages.length; i++) setup(stages[i]);
})();

/* arrival builds: a figure marked [data-build] draws its marks (.bld grow from their start, .bld-o fade in, staggered
   by --i) the first time a sixth of it is on screen. Without IntersectionObserver, under reduced motion or with no
   script it is simply drawn whole. */
(function () {
  "use strict";
  var figs = document.querySelectorAll("[data-build]");
  if (!figs.length || !("IntersectionObserver" in window) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  var io = new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) if (es[i].isIntersecting) { io.unobserve(es[i].target); es[i].target.setAttribute("data-build", "go"); }
  }, { threshold: 0.15 });
  for (var i = 0; i < figs.length; i++) { figs[i].setAttribute("data-build", "pre"); io.observe(figs[i]); }
})();

/* inline figures marked data-reveal: armed while still below the fold, drawn once when 40% of the figure is on screen,
   or a fifth of the viewport for a figure taller than that, so a reader never pauses over a screen of empty space.
   A figure that comes into view faster than 2 px/ms (a skim, a flick or a jump; reading runs near 1) is marked .quick
   and draws its parts almost together, so a skimming reader is not shown the empty half still waiting its turn.
   Reduced motion or no IntersectionObserver: nothing is armed, so every part rests in its final state. */
(function () {
  "use strict";
  var figs = document.querySelectorAll(".ig[data-reveal]");
  if (!figs.length || !("IntersectionObserver" in window) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  var first = typeof WeakMap === "function" ? new WeakMap() : null;
  var io = new IntersectionObserver(function (es) {
    for (var i = 0; i < es.length; i++) {
      var e = es[i], r = e.intersectionRect;
      if (!e.isIntersecting) continue;
      if (first && !first.has(e.target)) first.set(e.target, { t: e.time, y: e.boundingClientRect.top });
      if (e.intersectionRatio >= 0.4 || r.height >= innerHeight * 0.2) {
        // speed from how far the figure moved since it first showed; met already this far in, it came faster than a notch
        var f = first && first.get(e.target), dt = f ? e.time - f.t : 0;
        if (f && (dt > 0 ? Math.abs(f.y - e.boundingClientRect.top) / dt > 2 : r.height > 140)) e.target.classList.add("quick");
        e.target.classList.add("on"); io.unobserve(e.target);
      }
    }
  }, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4] });
  for (var i = 0; i < figs.length; i++) {
    if (figs[i].getBoundingClientRect().top < innerHeight) continue;   // already in view at load: leave it whole
    figs[i].classList.add("armed"); io.observe(figs[i]);
  }
})();
