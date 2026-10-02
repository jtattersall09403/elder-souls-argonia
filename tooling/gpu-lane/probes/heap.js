// Heap-diff probe. Injected before the page's scripts (measure.mjs --diag heap). Records the JS heap
// (performance.memory) every second; read window.__DIAG__.heap() for the series. It wraps no constructor
// (a Proxy over the typed arrays broke GLTFLoader's component-type lookup). The diff by function comes
// from measure.mjs: a CDP HeapProfiler sampling profile read at the start and end of the census window,
// reported in census.json as heap.sampledGrowth (retained MB per function, growth only).
(() => {
  const D = (window.__DIAG__ ??= {});
  const series = [];
  setInterval(() => {
    const m = performance.memory;
    if (m) series.push([Math.round(performance.now()), m.usedJSHeapSize]);
    if (series.length > 4000) series.shift();
  }, 1000);
  D.heap = () => ({ series: series.slice(-120) });
})();
