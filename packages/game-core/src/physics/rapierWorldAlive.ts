/**
 * Is the wasm rigid-body set behind a Rapier world still alive?
 *
 * react-three-rapier 2.2's `<Physics>` frees the wasm world in its OWN unmount
 * cleanup, which React runs before the cleanups of its children, and its
 * singleton world proxy lazily creates a fresh world on the next access. A
 * child calling `world.removeRigidBody(body)` after that therefore hands a
 * dangling handle to wasm, which traps as "RuntimeError: unreachable" (owner
 * report, 2026-09-20).
 *
 * The guard: capture the `RigidBodySet` at the moment the bodies are created,
 * and on cleanup skip the removals when that set has been freed — the world
 * took the bodies with it, so there is nothing left to remove.
 *
 * `RigidBodySet.free()` calls `raw.free()`, and wasm-bindgen's generated
 * `free()` zeroes `__wbg_ptr` via `__destroy_into_raw()`
 * (node_modules/@dimforge/rapier3d-compat/rapier_wasm3d.js:256-264), so a
 * zero pointer is the reliable liveness test. `ptr` is checked too: older
 * wasm-bindgen output named the field that way.
 */

/** Anything carrying a `bodies` set — Rapier's `World`, narrowed structurally
 * so this module does not depend on the react-three-rapier world type. */
export interface WorldWithBodies {
  readonly bodies: unknown;
}

/** The rigid-body set of a world, to be checked later with `bodySetAlive`. */
export function captureBodySet(world: WorldWithBodies): unknown {
  return world.bodies;
}

/** False when the captured set's wasm handle has been freed. */
export function bodySetAlive(set: unknown): boolean {
  if (!set) return false;
  const raw = (set as { raw?: unknown }).raw as
    { __wbg_ptr?: number; ptr?: number } | undefined;
  if (!raw) return false;
  if (raw.__wbg_ptr === 0 || raw.ptr === 0) return false;
  return true;
}
