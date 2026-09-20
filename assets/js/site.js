const printerVideo = document.getElementById("printer-video");
const videoFallback = document.getElementById("video-fallback");

printerVideo.addEventListener("canplay", function () {
  videoFallback.style.display = "none";
});

printerVideo.addEventListener("error", function () {
  videoFallback.style.display = "flex";
});

printerVideo.play().catch(function () {
  videoFallback.style.display = "flex";
});

/* =========================================================
   TYPED SECTION HEADINGS
   Each .section h2 types itself out the first time it
   scrolls into view. Height is measured and pinned first so
   nothing on the page shifts while it types.
========================================================= */

(function () {
  const heads = Array.prototype.slice.call(document.querySelectorAll(".section h2"));
  if (!heads.length) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;

  heads.forEach(function (h) {
    h.setAttribute("data-text", h.textContent.trim());
    h.style.minHeight = h.offsetHeight + "px";
    h.innerHTML = '<span class="type-line"></span><span class="type-caret" aria-hidden="true"></span>';
  });

  function type(h) {
    const text = h.getAttribute("data-text");
    const line = h.querySelector(".type-line");
    let i = 0;
    (function step() {
      line.textContent = text.slice(0, ++i);
      if (i < text.length) window.setTimeout(step, 20);
      else h.classList.add("is-typed");
    })();
  }

  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      type(e.target);
    });
  }, { threshold: 0.35 });

  heads.forEach(function (h) { io.observe(h); });
})();
