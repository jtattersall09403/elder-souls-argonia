import type { WebGPURenderer } from "three/webgpu";

/**
 * Trim every `GPUQueue.writeTexture` source to the bytes the copy reads
 * (walk 7, webgpu-flames3). three 0.184 uploads an array or 3D texture one
 * layer per call, each call passing the WHOLE `image.data` with a byte
 * offset. Chrome serialises the full view across the Dawn wire on every
 * call, so the ground albedo array (42 layers of 512² RGBA8, 44 MB) moved
 * 42 × 44 MB = 1.8 GB: one 26.6 s writeTexture on SwiftShader, a stall on
 * phones. Passing only the span the copy reads makes each call one layer
 * (1 MB) and the whole upload 44 MB.
 */

interface Layout { offset?: number; bytesPerRow?: number; rowsPerImage?: number }
interface Size { width?: number; height?: number; depthOrArrayLayers?: number }

/** Byte span `[start, end)` of `byteLength` that a writeTexture with this layout reads (an upper bound: rows counted in texels). */
export function writeTextureSpan(byteLength: number, layout: Layout, size: Size | number[]): [number, number] {
  const s = Array.isArray(size) ? { width: size[0], height: size[1], depthOrArrayLayers: size[2] } : size;
  const start = layout.offset ?? 0;
  if (!layout.bytesPerRow) return [start, byteLength];
  const rows = layout.rowsPerImage ?? s.height ?? 1;
  const layers = s.depthOrArrayLayers ?? 1;
  return [start, Math.min(byteLength, start + layout.bytesPerRow * rows * layers)];
}

/** Install the trim on a WebGPU renderer's queue (no-op on the WebGL backend). */
export function trimTextureWrites(renderer: WebGPURenderer): void {
  const device = (renderer as unknown as { backend: { device?: GPUDevice } }).backend.device;
  if (!device) return;
  const queue = device.queue;
  const write = queue.writeTexture.bind(queue);
  queue.writeTexture = ((dst: GPUTexelCopyTextureInfo, data: BufferSource, layout: GPUTexelCopyBufferLayout, size: GPUExtent3D) => {
    const view = ArrayBuffer.isView(data) ? data : new Uint8Array(data as ArrayBuffer);
    const [a, b] = writeTextureSpan(view.byteLength, layout, size as Size | number[]);
    if (a === 0 && b === view.byteLength) return write(dst, data, layout, size);
    return write(dst, new Uint8Array(view.buffer, view.byteOffset + a, b - a), { ...layout, offset: 0 }, size);
  }) as GPUQueue["writeTexture"];
}
