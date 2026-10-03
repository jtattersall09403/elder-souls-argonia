// Shared by the async frame probes (bracken, jungle). Injected as its own init script before them (measure.mjs FRAME_PROBES);
// defines window.__DIAG__.grab = { R, scene, camera } (the WebGL renderer found through the instance assignment of
// renderBufferDirect, its render() wrapped to remember the last scene and camera), __DIAG__.frameLuma and __DIAG__.nextFrame.
(() => {
  const D = (window.__DIAG__ ??= {});
  if (D.grab) return;
  const grab = (D.grab = { R: null, scene: null, camera: null });
  const prev = Object.getOwnPropertyDescriptor(Object.prototype, "renderBufferDirect");
  Object.defineProperty(Object.prototype, "renderBufferDirect", { configurable: true, set(v) {
    if (prev?.set) { prev.set.call(this, v); v = this.renderBufferDirect; }
    Object.defineProperty(this, "renderBufferDirect", { value: v, writable: true, enumerable: true, configurable: true });
    if (!grab.R && typeof this.render === "function" && this.domElement) {
      grab.R = this;
      const r = this.render;
      this.render = function (scene, camera) { if (scene?.isScene) { grab.scene = scene; grab.camera = camera; } return r.call(this, scene, camera); };
    }
  }, get: prev?.get });
  // Render once now and read the canvas in the same task (the drawing buffer is cleared after compositing).
  // rect = {x0,y0,x1,y1} in 0..1 of the canvas (y down), else the whole frame. Returns mean luma 0-255.
  D.frameLuma = (rect) => {
    const { R, scene, camera } = grab;
    R.render(scene, camera);
    const c = R.domElement, w = Math.max(1, c.width >> 2), h = Math.max(1, c.height >> 2);
    const o = new OffscreenCanvas(w, h), g = o.getContext("2d", { willReadFrequently: true });
    g.drawImage(c, 0, 0, w, h);
    const r = rect ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
    const x0 = Math.floor(r.x0 * w), y0 = Math.floor(r.y0 * h), x1 = Math.max(x0 + 1, Math.ceil(r.x1 * w)), y1 = Math.max(y0 + 1, Math.ceil(r.y1 * h));
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return Math.round((s / (d.length / 4)) * 100) / 100;
  };
  D.nextFrame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
})();
