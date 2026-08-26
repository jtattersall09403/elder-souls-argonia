import { useEffect, useMemo } from "react";
import * as THREE from "three";
import anchorsFile from "../../../world/sources/anchors/settlement-anchors.json";

/**
 * City beacons + name labels above the terrain, shared by the flyover and
 * (owner round 6) walk mode. Display-referred UI (toneMapped=false), or the
 * physical exposure crushes them black. Ground heights come from the caller
 * so each mode can use its own terrain source (raster vs chunk query).
 */
export function CityMarkers({ extentM, groundAt }: {
  extentM: number;
  /** World metres → terrain height (already vertically scaled). */
  groundAt: (xM: number, zM: number) => number;
}) {
  const markers = useMemo(() => {
    const anchors = anchorsFile.anchors as { name: string; u: number; v: number; rank?: string }[];
    return anchors.map((a) => {
      const x = a.u * extentM;
      const z = a.v * extentM;
      const ground = Math.max(groundAt(x, z), 0);
      const label = document.createElement("canvas");
      label.width = 512; label.height = 128;
      const g = label.getContext("2d")!;
      g.font = "bold 72px system-ui, sans-serif";
      g.textAlign = "center";
      g.lineWidth = 10; g.strokeStyle = "rgba(0,0,0,0.85)";
      g.strokeText(a.name, 256, 88);
      g.fillStyle = a.rank === "major" ? "#ffd76a" : "#d9e2ea";
      g.fillText(a.name, 256, 88);
      const tex = new THREE.CanvasTexture(label);
      return { key: a.name, major: a.rank === "major", x, z, ground, tex };
    });
  }, [extentM, groundAt]);
  useEffect(() => () => markers.forEach((m) => m.tex.dispose()), [markers]);
  return (
    <group>
      {markers.map((m) => (
        <group key={m.key} position={[m.x, m.ground, m.z]}>
          <mesh position={[0, 400, 0]}>
            <cylinderGeometry args={[14, 14, 800, 6]} />
            <meshBasicMaterial color={m.major ? "#ffd76a" : "#b9c4cc"} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
          </mesh>
          <sprite position={[0, 950, 0]} scale={[1400, 350, 1]}>
            <spriteMaterial map={m.tex} transparent depthTest={false} toneMapped={false} />
          </sprite>
        </group>
      ))}
    </group>
  );
}
