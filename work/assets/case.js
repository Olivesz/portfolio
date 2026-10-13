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
