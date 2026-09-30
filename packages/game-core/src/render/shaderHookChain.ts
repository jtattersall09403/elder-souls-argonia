/**
 * Which shader patches a chained `onBeforeCompile` hook (or a chained
 * `customProgramCacheKey`) already carries, marked on the function itself.
 *
 * Why not `userData` or an "is my hook on top" identity test: two patches
 * that each re-wrap unless they are on top wrap each other again on every
 * rebuild (the settlement surface and the fixture lights did, and declared
 * their uniforms twice); and `Material.copy` JSON-copies `userData` but drops
 * the functions, so a clone kept "already keyed" flags with no key function.
 * A mark on the function travels with the chain and is gone from a clone, and
 * a hook that replaces the chain without calling it (CSM) drops the marks.
 */
type Marked = { esPatches?: ReadonlySet<string> };

/** Whether `fn` (a hook or key function) carries `patch` anywhere in its chain. */
export function chainHas(fn: unknown, patch: string): boolean {
  return Boolean((fn as Marked | null | undefined)?.esPatches?.has(patch));
}

/** Mark `fn`, which wraps `previous`, as carrying `patch` plus every mark of `previous`. */
export function markChain<F>(fn: F, previous: unknown, patch: string): F {
  const prior = (previous as Marked | null | undefined)?.esPatches;
  (fn as Marked).esPatches = new Set([...(prior ?? []), patch]);
  return fn;
}
