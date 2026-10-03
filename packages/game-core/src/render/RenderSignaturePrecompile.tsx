import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { parseRenderSignatures, precompileSignatures } from "./precompileSignatures";
import type { PrecompileRenderer } from "./precompileScene";
import type { RenderSignatures } from "./renderSignatures";
import { shadowPassMaterialsOf } from "./shadowCasters";
import { SHADER_BUILDS_IN_FLIGHT } from "./shaderBuildQueue";
import { useSceneTarget } from "./useSceneTarget";

/** Frames the precompile waits for the first shadow render (the shadow-pass material) before it runs without the shadow variants. */
export const SIGNATURE_WAIT_FRAMES = 60;

/**
 * Mounted by the host's sky once its lights are in the scene: fetches
 * `<dataBase>render-signatures.json` at once and, on the first frame with a
 * shadow-pass material (the light rig has rendered its shadows) and a known
 * scene target, precompiles every signature (precompileSignatures.ts) while
 * the kits are still fetching. Runs once per mount.
 */
export function RenderSignaturePrecompile({ dataBase, inFlight = SHADER_BUILDS_IN_FLIGHT }: { dataBase: string; inFlight?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const target = useSceneTarget(scene);
  const [signatures, setSignatures] = useState<RenderSignatures | null>(null);
  const state = useRef<"wait" | "running" | "done">("wait");
  const frames = useRef(0);
  useEffect(() => {
    let live = true;
    fetch(`${dataBase}render-signatures.json`).then((r) => r.json()).then((j) => { if (live) setSignatures(parseRenderSignatures(j)); })
      .catch((e: unknown) => console.warn("[precompile] render-signatures.json not loaded; kits build on first draw", e));
    return () => { live = false; };
  }, [dataBase]);
  useFrame(() => {
    if (state.current !== "wait" || !signatures || target.current === undefined) return;
    if (shadowPassMaterialsOf(scene).length === 0 && ++frames.current < SIGNATURE_WAIT_FRAMES) return;
    state.current = "running";
    const t0 = performance.now();
    performance.mark("es:load:signatures-start");
    void precompileSignatures(gl as unknown as PrecompileRenderer, scene, camera, [target.current], signatures.signatures, inFlight)
      .then((n) => { performance.mark("es:load:signatures-done"); console.info(`[precompile] ${n} signature compiles in ${Math.round(performance.now() - t0)} ms`); })
      .finally(() => { state.current = "done"; });
  });
  return null;
}
