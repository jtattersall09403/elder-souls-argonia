/**
 * Dispose streamed GPU geometry after the frame that may still draw it
 * (webgpu10 c10 fix C, destroyedInSubmit).
 *
 * A geometry disposed while three is encoding a pass (an `onBeforeRender`
 * that rebinds instance rows, a streaming job between two render calls of
 * one frame) destroys buffers a command buffer already references, and
 * WebGPU rejects the submit ("[Buffer] used in submit while destroyed").
 * `deferDispose(renderer, d)` queues `d` on a per-renderer list and frees it
 * at the renderer's next `info.reset()`: three calls that once at the start
 * of every animation frame (Animation.start, three.webgpu.js:29196), after
 * every render call of the previous frame has been submitted. A renderer
 * without `info.reset` (tests, a stub) disposes at once.
 *
 * Per-renderer state lives in a WeakMap keyed on the renderer (standard 8):
 * it dies with the renderer. Enqueueing one object twice disposes it once.
 */

import type * as THREE from "three";

export interface Disposable { dispose(): void }

interface RendererLike { info?: { reset?: () => void } }

interface Queue { pending: Set<Disposable> }

const queues = new WeakMap<object, Queue>();

function queueFor(renderer: RendererLike): Queue | null {
  const existing = queues.get(renderer);
  if (existing) return existing;
  const info = renderer.info;
  if (!info || typeof info.reset !== "function") return null;
  const queue: Queue = { pending: new Set() };
  const reset = info.reset.bind(info);
  info.reset = () => {
    reset();
    drainDeferred(renderer);
  };
  queues.set(renderer, queue);
  return queue;
}

/** Queue `d` to be disposed at the renderer's next frame start (at once without a frame hook). */
export function deferDispose(renderer: object | null | undefined, d: Disposable): void {
  const queue = renderer ? queueFor(renderer as RendererLike) : null;
  if (queue) queue.pending.add(d);
  else d.dispose();
}

/** Dispose everything queued on `renderer` now (the frame hook; unmounts may call it). */
export function drainDeferred(renderer: RendererLike): void {
  const queue = queues.get(renderer);
  if (!queue || queue.pending.size === 0) return;
  const list = [...queue.pending];
  queue.pending.clear();
  for (const d of list) d.dispose();
}

/** Disposables waiting on `renderer` (tests, probes). */
export function deferredCount(renderer: RendererLike): number {
  return queues.get(renderer)?.pending.size ?? 0;
}

/**
 * Name every unnamed attribute, interleaved buffer and index of `geometry`
 * `tag:<attribute>`: three passes `bufferAttribute.name` as the GPUBuffer
 * label (WebGPUAttributeUtils.createAttribute), so a WebGPU validation error
 * names the owner of the buffer. Named buffers (a kit's) keep their name.
 */
export function tagGeometryBuffers(geometry: THREE.BufferGeometry, tag: string): void {
  if (geometry.index && !geometry.index.name) geometry.index.name = `${tag}:index`;
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const target = ((attribute as THREE.InterleavedBufferAttribute).data ?? attribute) as { name?: string };
    if (!target.name) target.name = `${tag}:${name}`;
  }
}
