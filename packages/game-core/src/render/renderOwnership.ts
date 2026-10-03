/**
 * Who renders the frame (vol10 diag7 L2, decision 0106 rule 11).
 *
 * r3f skips its own scene render as soon as any `useFrame` hook has a
 * priority above 0, so some hook must call `renderer.render` itself. The
 * water pipeline does (it draws the scene into its own targets); when it is
 * not mounted the host's last hook must. That ownership used to be implicit
 * (the host guessed from flags whether the pipeline was mounted), and
 * unmounting the pipeline blanked every deep-linked interior.
 *
 * Now it is explicit: a pass that renders the frame claims it on mount and
 * releases it on unmount (`useClaimFrameRender`); the host renders whenever
 * nobody holds a claim (`renderIfUnowned`). One instance per canvas, provided
 * through `FrameRenderOwnerContext` (no module-level state, standard 8).
 */
import { createContext, useContext, useEffect } from "react";

export interface FrameRenderOwner {
  /** Take the frame render; call the returned function to give it back. */
  claim(): () => void;
  /** True while at least one pass holds a claim. */
  readonly claimed: boolean;
}

export function createFrameRenderOwner(): FrameRenderOwner {
  let claims = 0;
  return {
    claim() {
      claims += 1;
      let released = false;
      return () => { if (!released) { released = true; claims -= 1; } };
    },
    get claimed() { return claims > 0; },
  };
}

export const FrameRenderOwnerContext = createContext<FrameRenderOwner | null>(null);

/** Claim the frame render for the lifetime of the calling component. */
export function useClaimFrameRender(): void {
  const owner = useContext(FrameRenderOwnerContext);
  useEffect(() => owner?.claim(), [owner]);
}

/** The host's fallback: render the frame unless a pass owns it. Returns whether it rendered. */
export function renderIfUnowned(owner: FrameRenderOwner, render: () => void): boolean {
  if (owner.claimed) return false;
  render();
  return true;
}
