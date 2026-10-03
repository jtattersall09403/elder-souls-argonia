/**
 * The one owner of a perspective camera's aspect (webgpu10 fix17, diag18 C1).
 *
 * R3F builds its default camera as `PerspectiveCamera(fov, 0)` and sets the
 * aspect only when its store size changes; on the native WebGPU path that
 * left aspect 0, so every `updateProjectionMatrix()` built an Inf matrix
 * (NaN inverse) that fed bloom, the underwater blit, CSM and the froxel
 * history. Every projection rebuild of the main camera goes through
 * `updateProjection`: the aspect comes from the drawing-buffer size, a 0 or
 * not-yet-sized canvas keeps the last good aspect (1 before any), and the
 * camera never carries aspect 0 into a projection.
 */
import * as THREE from "three";
import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";

/** Aspect for a `width` x `height` drawing buffer; `previous` (or 1) when the size is not usable. */
export function aspectFor(width: number, height: number, previous: number): number {
  const a = width / height;
  if (Number.isFinite(a) && a > 0) return a;
  return Number.isFinite(previous) && previous > 0 ? previous : 1;
}

/** True when every element of the matrix is finite. */
export function matrixFinite(m: THREE.Matrix4): boolean {
  const e = m.elements;
  for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) return false;
  return true;
}

const reported = new WeakSet<THREE.Camera>();

/**
 * Set the camera's aspect from the drawing-buffer size and rebuild its
 * projection. Dev builds log once per camera, with the stack, if the result
 * is still non-finite (fov/near/far broken).
 */
export function updateProjection(camera: THREE.PerspectiveCamera, width: number, height: number): void {
  camera.aspect = aspectFor(width, height, camera.aspect);
  camera.updateProjectionMatrix();
  if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV && !reported.has(camera) && !matrixFinite(camera.projectionMatrix)) {
    reported.add(camera);
    console.error("[cameraAspect] non-finite projection", { fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far }, new Error().stack);
  }
}

/**
 * Mount once inside a `<Canvas>`: takes the default camera's aspect from
 * R3F's size and marks the camera manual, so R3F's own size-driven writer
 * (which writes width/height verbatim, 0 included) no longer touches it.
 * Other projection rebuilds call `updateProjection` with `useThree` size.
 */
export function useCameraAspectOwner(): void {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    (camera as THREE.PerspectiveCamera & { manual?: boolean }).manual = true;
    updateProjection(camera, size.width, size.height);
  }, [camera, size.width, size.height]);
}
