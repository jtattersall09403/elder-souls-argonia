import { useContext, useEffect, useMemo } from "react";
import * as THREE from "three";
import { applyAerialPerspective } from "./aerial";
import { SkyContext, sharedAerialUniforms } from "./WorldSky";

/**
 * The interim sea surface (the real water renderer is Phase 8b). Lit by the
 * shared sun/sky rig and hazed by the shared aerial term so the horizon line
 * sits in the same air as the terrain.
 */
export function SeaPlane({ extentM, levelM }: { extentM: number; levelM: number }) {
  const { csm } = useContext(SkyContext);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#2a5b8a",
      transparent: true,
      opacity: 0.82,
      roughness: 0.35,
    });
    csm?.setupMaterial(m);
    applyAerialPerspective(m, sharedAerialUniforms);
    m.customProgramCacheKey = () => "es-sea";
    return m;
  }, [csm]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    // ×8 the province: beyond the playable edge the world reads as open
    // ocean to the horizon (with the dome's sub-horizon haze band picking up
    // the landward edges) instead of ending at a visible rim (owner round 4).
    <mesh position={[extentM / 2, levelM, extentM / 2]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[extentM * 8, extentM * 8]} />
    </mesh>
  );
}
