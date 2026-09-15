import { useEffect, useMemo, useState } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { createGroundMaterial, useGroundManifest, type GroundManifest } from "./groundMaterial";
import { sharedAerialUniforms } from "./sky/WorldSky";
import type { CSM } from "three/examples/jsm/csm/CSM.js";
import type { ApronManifest } from "@elder-souls/game-core/terrain/apronManifest";

/**
 * The border apron's manifest and its two ground materials (16d).
 *
 * The apron is painted by the province's own land-cover rules over its own
 * frames, so it takes the SAME splat material with the apron's control, tint
 * and gradient maps. Both borrow the province material's albedo array texture
 * (`sharedArrayTexture`): a second and third 40 MB array for ground the player
 * can never walk on would be the largest single allocation in the scene.
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
  csm: CSM | null | undefined,
  sharedArrayTexture: THREE.DataArrayTexture | undefined,
): { near: THREE.MeshStandardMaterial; far: THREE.MeshStandardMaterial } {
  const { set, manifest: ground } = useGroundManifest(baseUrl, matSet);
  const images = useLoader(THREE.ImageLoader, ground.materials.map((m) => `${baseUrl}textures/ground/${set}/${m.file}`));
  const cliffNrmFiles = ["cliff_rock", "cliff_dirt"]
    .map((name) => ground.materials.find((m) => m.name === name)?.normalFile)
    .filter((f): f is string => !!f);
  const cliffNormals = useLoader(THREE.ImageLoader, cliffNrmFiles.map((f) => `${baseUrl}textures/ground/${set}/${f}`));
  const files = (["near", "far"] as const).flatMap((s) =>
    [manifest.paint[s].control, manifest.paint[s].tint, manifest.paint[s].grad].map((f) => `${baseUrl}province/apron/${f}`));
  const [nearCtrl, nearTint, nearGrad, farCtrl, farTint, farGrad] = useLoader(THREE.TextureLoader, files);
  const materials = useMemo(() => {
    const build = (ctrl: THREE.Texture, tint: THREE.Texture, grad: THREE.Texture) =>
      createGroundMaterial(images, cliffNormals, ctrl, tint, grad, ground as GroundManifest,
        verticalScale, sharedAerialUniforms, csm,
        // No shore wetness out here: the apron has no swash band, and the four
        // texture units it costs are the ones the fragment shader has left.
        { shoreWetness: false }, sharedArrayTexture);
    return { near: build(nearCtrl, nearTint, nearGrad), far: build(farCtrl, farTint, farGrad) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, cliffNormals, ground, csm, sharedArrayTexture,
      nearCtrl, nearTint, nearGrad, farCtrl, farTint, farGrad]);
  useEffect(() => {
    const { near, far } = materials;
    return () => { near.dispose(); far.dispose(); };   // the array texture is the province's
  }, [materials]);
  useEffect(() => {
    for (const m of [materials.near, materials.far]) {
      (m.userData.groundUniforms as { uVerticalScale: { value: number } }).uVerticalScale.value = verticalScale;
    }
  }, [materials, verticalScale]);
  return materials;
}
