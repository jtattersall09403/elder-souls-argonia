import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
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
 *
 * Visibility (owner 2026-09-07: "the screen is cluttered with names of far
 * away places"): a marker is culled by distance per tier, fades over the last
 * quarter of its range, only the nearest MAX_VISIBLE are shown, the label is
 * sized for the distance it is read at, and it is depth-tested so land in
 * the way hides it. The near-only parcel labels of BlueprintGround are the
 * model.
 */
/** Range per tier, metres from the camera. */
const RANGE_M = { major: 6000, minor: 1500 } as const;
/** Fade over this fraction of the range, so a name never pops. */
const FADE_FRACTION = 0.25;
/** At most this many markers on screen, nearest first. */
const MAX_VISIBLE = 10;
/** Label width as a fraction of camera distance (clamped), so a name reads
 * the same size near and far instead of a far one filling the view. */
const LABEL_WIDTH_PER_M = 0.16;
const LABEL_WIDTH_MIN_M = 40;
const LABEL_WIDTH_MAX_M = 1000;
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

  // Distance culling, fade and label sizing, every frame (cheap: ~100 groups).
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const candidates: { child: THREE.Object3D; d: number; range: number }[] = [];
    for (const child of group.children) {
      child.visible = false;
      const range = child.userData.major ? RANGE_M.major : RANGE_M.minor;
      const d = Math.hypot(child.position.x - cx, child.position.z - cz);
      if (d <= range) candidates.push({ child, d, range });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const { child, d, range } of candidates.slice(0, MAX_VISIBLE)) {
      child.visible = true;
      const fade = Math.min(1, (range - d) / (range * FADE_FRACTION));
      const width = Math.max(LABEL_WIDTH_MIN_M, Math.min(LABEL_WIDTH_MAX_M, d * LABEL_WIDTH_PER_M));
      for (const o of child.children) {
        if (o instanceof THREE.Sprite) {
          o.scale.set(width, width / 4, 1);
          (o.material as THREE.SpriteMaterial).opacity = fade;
        } else if (o instanceof THREE.Mesh) {
          const mat = o.material as THREE.MeshBasicMaterial;
          mat.opacity = (child.userData.major ? 0.55 : 0.4) * fade;
        }
      }
    }
  });
  return (
    <group ref={groupRef}>
      {markers.map((m) => (
        <group key={m.key} position={[m.x, m.ground, m.z]} userData={{ major: m.major }} visible={false}>
          {/* Tier 1 is now 90-odd places (it was a hand-written anchor list):
              minor beacons are shorter and thinner so the majors still read. */}
          <mesh position={[0, m.major ? 400 : 160, 0]}>
            <cylinderGeometry args={m.major ? [14, 14, 800, 6] : [7, 7, 320, 6]} />
            <meshBasicMaterial color={m.major ? "#ffd76a" : "#b9c4cc"} transparent opacity={m.major ? 0.55 : 0.4} depthWrite={false} toneMapped={false} />
          </mesh>
          <sprite position={[0, m.major ? 950 : 400, 0]} scale={[LABEL_WIDTH_MIN_M, LABEL_WIDTH_MIN_M / 4, 1]}>
            <spriteMaterial map={m.tex} transparent depthTest depthWrite={false} toneMapped={false} />
          </sprite>
        </group>
      ))}
    </group>
  );
}
