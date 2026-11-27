// Pan/zoom for the whiteboard viewers — vanilla, no dependencies.
// One-finger drag to pan, two-finger pinch to zoom (mobile), wheel to zoom
// (desktop), double-tap/click to toggle zoom, + / − / Reset buttons.
// Transform origin is the viewer center; the math keeps the content point
// under your fingers fixed while pinching.
(function () {
  "use strict";

  var MIN = 1, MAX = 8;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function setup(viewer) {
    var inner = viewer.querySelector(".inner");
    var img = viewer.querySelector("img");
    var scale = 1, tx = 0, ty = 0;
    var pointers = new Map();
    var pinchStart = null;

    // Loading state: hide the overlay once the image is actually in, so a
    // cold load never sits as a blank white box.
    var loading = viewer.querySelector(".loading");
    function hideLoading() { viewer.classList.add("done"); }
    if (img.complete && img.naturalWidth > 0) {
      hideLoading();
    } else {
      img.addEventListener("load", hideLoading);
      img.addEventListener("error", function () {
        if (loading) loading.querySelector("span:last-child").textContent = "Image didn't load — reload the page.";
      });
    }

    function apply() {
      inner.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
    }

    function clampPan() {
      var vw = viewer.clientWidth, vh = viewer.clientHeight;
      var iw = img.clientWidth * scale, ih = img.clientHeight * scale;
      var maxX = Math.max(0, (iw - vw) / 2), maxY = Math.max(0, (ih - vh) / 2);
      tx = clamp(tx, -maxX, maxX);
      ty = clamp(ty, -maxY, maxY);
    }

    function center() {
      var r = viewer.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function zoomAt(clientX, clientY, factor) {
      var c = center();
      var px = clientX - c.x, py = clientY - c.y;
      var ns = clamp(scale * factor, MIN, MAX);
      var k = ns / scale;
      tx = px - (px - tx) * k;
      ty = py - (py - ty) * k;
      scale = ns;
      clampPan();
      apply();
    }

    function reset() { scale = 1; tx = 0; ty = 0; apply(); }

    viewer.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button")) return;
      viewer.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        var pts = Array.from(pointers.values());
        pinchStart = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
          scale: scale, tx: tx, ty: ty
        };
      }
    });

    viewer.addEventListener("pointermove", function (e) {
      if (!pointers.has(e.pointerId)) return;
      var prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        tx += e.clientX - prev.x;
        ty += e.clientY - prev.y;
        clampPan();
        apply();
      } else if (pointers.size === 2 && pinchStart) {
        var pts = Array.from(pointers.values());
        var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        var mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        var c = center();
        var cx0 = pinchStart.mid.x - c.x, cy0 = pinchStart.mid.y - c.y;
        var cx1 = mid.x - c.x, cy1 = mid.y - c.y;
        var ns = clamp(pinchStart.scale * (dist / pinchStart.dist), MIN, MAX);
        var k = ns / pinchStart.scale;
        tx = cx1 - (cx0 - pinchStart.tx) * k;
        ty = cy1 - (cy0 - pinchStart.ty) * k;
        scale = ns;
        clampPan();
        apply();
      }
    });

    function endPointer(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
    }
    viewer.addEventListener("pointerup", endPointer);
    viewer.addEventListener("pointercancel", endPointer);

    viewer.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    viewer.addEventListener("dblclick", function (e) {
      if (e.target.closest("button")) return;
      if (scale > 1.5) { reset(); }
      else { zoomAt(e.clientX, e.clientY, 3); }
    });

    var zin = viewer.querySelector("[data-zoom-in]");
    var zout = viewer.querySelector("[data-zoom-out]");
    var zreset = viewer.querySelector("[data-zoom-reset]");
    if (zin) zin.addEventListener("click", function () { var c = center(); zoomAt(c.x, c.y, 1.4); });
    if (zout) zout.addEventListener("click", function () { var c = center(); zoomAt(c.x, c.y, 1 / 1.4); });
    if (zreset) zreset.addEventListener("click", reset);
  }

  document.querySelectorAll("[data-zoom]").forEach(setup);
})();
