/**
 * Decodes one climate raster and reads its pixels OFF the main thread
 * (walk 6: drawImage + getImageData of the 1345² climate-air.png on the main
 * thread blocked it for seconds). fetch -> createImageBitmap -> OffscreenCanvas
 * getImageData; the pixel buffer is transferred back, not copied.
 */
self.onmessage = async (e: MessageEvent<{ url: string }>) => {
  const { url } = e.data;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const w = bmp.width, h = bmp.height;
    const g = new OffscreenCanvas(w, h).getContext("2d", { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    bmp.close();
    const buf = g.getImageData(0, 0, w, h).data.buffer;
    (self as unknown as Worker).postMessage({ url, buf, w, h }, [buf]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ url, error: String(err) });
  }
};
