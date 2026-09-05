import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OVERLAY_LAYER } from "./water/waterMaterial";
import { cityMarkers, type CityMarkerSpec } from "./cityMarkerData";
import { loadPlaces } from "./places/placesData";
import { loadBlueprints } from "./blueprints/blueprintsData";

/**
 * City beacons + name labels above the terrain, shared by the flyover and
 * (owner round 6) walk mode. Display-referred UI (toneMapped=false), or the
 * physical exposure crushes them black. Ground heights come from the caller
 * so each mode can use its own terrain source (raster vs chunk query).
 *
 * Positions come from the EXPORTED data (owner 2026-09-05): every tier 0/1
 * place in `places.json`, standing on its blueprint's centroid when a
 * blueprint exists (`cityMarkerData.cityMarkers`). Re-siting a settlement in
 * worldgen moves its beacon with no code change here.
 */
export function CityMarkers({ groundAt, baseUrl = import.meta.env.BASE_URL }: {
  /** World metres → terrain height (already vertically scaled). */
  groundAt: (xM: number, zM: number) => number;
  baseUrl?: string;
}) {
  const [specs, setSpecs] = useState<CityMarkerSpec[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const places = await loadPlaces(baseUrl);
      // A missing/older blueprint export is not fatal: beacons fall back to
      // the place anchors.
      const blueprints = await loadBlueprints(baseUrl).then((b) => b.blueprints).catch(() => []);
      if (alive) setSpecs(cityMarkers(places.places, blueprints));
    })().catch(() => { if (alive) setSpecs([]); });
    return () => { alive = false; };
  }, [baseUrl]);

  const markers = useMemo(() => specs.map((s) => {
    const ground = Math.max(groundAt(s.xM, s.zM), 0);
    const label = document.createElement("canvas");
    label.width = 512; label.height = 128;
    const g = label.getContext("2d")!;
    g.font = "bold 72px system-ui, sans-serif";
    g.textAlign = "center";
    g.lineWidth = 10; g.strokeStyle = "rgba(0,0,0,0.85)";
    g.strokeText(s.name, 256, 88);
    g.fillStyle = s.major ? "#ffd76a" : "#d9e2ea";
    g.fillText(s.name, 256, 88);
    const tex = new THREE.CanvasTexture(label);
    return { key: s.id, major: s.major, x: s.xM, z: s.zM, ground, tex };
  }), [specs, groundAt]);
  useEffect(() => () => markers.forEach((m) => m.tex.dispose()), [markers]);
  // Display-referred UI lives on the overlay layer: the water pipeline's
  // tone-mapped blit would crush toneMapped:false gold to black (8b round 1),
  // so the pipeline draws this layer in a final direct-to-screen pass. The
  // camera keeps the layer enabled as a fallback if the pipeline is absent.
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    camera.layers.enable(OVERLAY_LAYER);
    groupRef.current?.traverse((o) => o.layers.set(OVERLAY_LAYER));
  }, [camera, markers]);
  return (
    <group ref={groupRef}>
      {markers.map((m) => (
        <group key={m.key} position={[m.x, m.ground, m.z]}>
          {/* Tier 1 is now 90-odd places (it was a hand-written anchor list):
              minor beacons are shorter and thinner so the majors still read. */}
          <mesh position={[0, m.major ? 400 : 160, 0]}>
            <cylinderGeometry args={m.major ? [14, 14, 800, 6] : [7, 7, 320, 6]} />
            <meshBasicMaterial color={m.major ? "#ffd76a" : "#b9c4cc"} transparent opacity={m.major ? 0.55 : 0.4} depthWrite={false} toneMapped={false} />
          </mesh>
          <sprite position={[0, m.major ? 950 : 400, 0]} scale={m.major ? [1400, 350, 1] : [700, 175, 1]}>
            <spriteMaterial map={m.tex} transparent depthTest={false} toneMapped={false} />
          </sprite>
        </group>
      ))}
    </group>
  );
}
