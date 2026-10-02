import { useEffect, useMemo, useState } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { createGroundMaterial, useGroundManifest, type GroundManifest, type GroundUniforms } from "./groundMaterial";
import { useGroundArray } from "@elder-souls/game-core/terrain/groundArray";
import { sharedAerialUniforms } from "./sky/WorldSky";
import type { MeshStandardNodeMaterial } from "three/webgpu";
import type { ApronManifest } from "@elder-souls/game-core/terrain/apronManifest";
import { GroundRasterLoader, groundRasterKey } from "@elder-souls/game-core/terrain/groundRasters";

/**
 * The border apron's manifest and its two ground materials (16d).
 *
 * The apron is painted by the province's own land-cover rules over its own
 * frames, so it takes the SAME splat material with the apron's control, tint
 * and gradient maps. Both sample the set's one KTX2 albedo array
 * (`useGroundArray`, the loader-cached texture the province ground holds).
 *
 * Returns null until the manifest is fetched; a build without an apron (the
 * ladder hiding the layer, or a publish before 16d ran) simply has none.
 */
export function useApronManifest(baseUrl: string, enabled: boolean): ApronManifest | null {
  const [manifest, setManifest] = useState<ApronManifest | null>(null);
  useEffect(() => {
    if (!enabled) { setManifest(null); return; }
    let alive = true;
    fetch(`${baseUrl}province/apron/apron-manifest.json`)
      .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() : null))
      .then((j) => { if (alive && j && j.schemaVersion === 1) setManifest(j as ApronManifest); })
      .catch(() => { /* no apron in this build */ });
    return () => { alive = false; };
  }, [baseUrl, enabled]);
  return manifest;
}

/** The near/far apron materials. Suspends on its textures like the ground
 * material does; mount it inside the same Suspense boundary. */
export function useApronMaterials(
  baseUrl: string,
  manifest: ApronManifest,
  matSet: string | undefined,
  verticalScale: number,
): { near: MeshStandardNodeMaterial; far: MeshStandardNodeMaterial } {
  const { set, manifest: ground } = useGroundManifest(baseUrl, matSet);
  // The same cached texture the province ground holds (16d: one array).
  const arrayTex = useGroundArray(baseUrl, set);
  const [near, far] = useLoader(GroundRasterLoader, (["near", "far"] as const).map((s) => groundRasterKey(
    ...([manifest.paint[s].control, manifest.paint[s].tint, manifest.paint[s].grad]
      .map((f) => `${baseUrl}province/apron/${f}`) as [string, string, string]))));
  const { ctrl: nearCtrl, tint: nearTint, grad: nearGrad } = near;
  const { ctrl: farCtrl, tint: farTint, grad: farGrad } = far;
  const materials = useMemo(() => {
    const build = (ctrl: THREE.Texture, tint: THREE.Texture, grad: THREE.Texture) =>
      createGroundMaterial(arrayTex, ctrl, tint, grad, ground as GroundManifest,
        verticalScale, sharedAerialUniforms,
        // No shore wetness out here: the apron has no swash band.
        { shoreWetness: false });
    return { near: build(nearCtrl, nearTint, nearGrad), far: build(farCtrl, farTint, farGrad) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrayTex, ground,
      nearCtrl, nearTint, nearGrad, farCtrl, farTint, farGrad]);
  useEffect(() => {
    const { near, far } = materials;
    return () => { near.dispose(); far.dispose(); };   // the array texture is the province's
  }, [materials]);
  useEffect(() => {
    for (const m of [materials.near, materials.far]) {
      (m.userData.groundUniforms as GroundUniforms).uVerticalScale.value = verticalScale;
    }
  }, [materials, verticalScale]);
  return materials;
}
