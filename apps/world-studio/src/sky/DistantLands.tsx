import { useMemo } from "react";
import * as THREE from "three";
import { applyAerialPerspective } from "./aerial";
import { sharedAerialUniforms } from "./WorldSky";

/**
 * Beyond-the-border lands (owner round 5): a single low-poly annulus of
 * procedural terrain outside the province so land horizons don't end in
 * empty haze. Lore-directed silhouettes only (dossier black-marsh-province
 * §regions): Morrowind's mountains N/NW→NE, Cyrodiil's low Blackwood hills
 * W/SW, open ocean S and E (no geometry — the sea plane owns it). Purely
 * scenery: no collision, no shadows, faded by the shared aerial haze.
 * Azimuth convention: world north = −Z (decision 0003).
 */

function ridge(a: number, seedScale: number): number {
  // Deterministic ridged pseudo-noise over azimuth (radians).
  const s =
    Math.sin(a * 7.3 * seedScale) * 0.5 +
    Math.sin(a * 13.7 * seedScale + 1.7) * 0.3 +
    Math.sin(a * 29.1 * seedScale + 4.2) * 0.2;
  return 1 - Math.abs(s); // ridged: creases at zero-crossings
}

export function DistantLands({ extentM, verticalScale }: { extentM: number; verticalScale: number }) {
  const { geometry, material } = useMemo(() => {
    const AZ = 128;
    const RAD = 9;
    const cx = extentM / 2;
    const cz = extentM / 2;
    const inner = extentM * 0.78; // just past the province corners (0.71×√2)
    const outer = extentM * 3.2;
    const pos = new Float32Array((AZ + 1) * RAD * 3);
    for (let ia = 0; ia <= AZ; ia++) {
      const az = (ia / AZ) * Math.PI * 2; // 0 = north, clockwise (compass)
      const dx = Math.sin(az);
      const dz = -Math.cos(az);
      // Sector profiles (compass degrees): Morrowind mountains 300°→60°
      // peaking due north; Blackwood hills 230°→300° peaking west.
      const deg = (az * 180) / Math.PI;
      const northDist = Math.min(Math.abs(deg - 0), Math.abs(deg - 360)); // 0 at N
      const mountains = Math.max(0, 1 - northDist / 65);
      const westDist = Math.abs(deg - 270);
      const hills = Math.max(0, 1 - westDist / 45);
      for (let ir = 0; ir < RAD; ir++) {
        const t = ir / (RAD - 1);
        const r = inner + (outer - inner) * t;
        // Height envelope: zero at both rims, broad mid-ring crest.
        const crest = Math.sin(Math.PI * Math.min(1, t * 1.6));
        const hMountain = (500 + 1400 * ridge(az, 1)) * mountains;
        const hHill = (90 + 160 * ridge(az, 2.3)) * hills;
        const y = (hMountain + hHill) * crest * verticalScale * 0.32 - 12;
        const i = (ia * RAD + ir) * 3;
        pos[i] = cx + dx * r;
        pos[i + 1] = y;
        pos[i + 2] = cz + dz * r;
      }
    }
    const idx: number[] = [];
    for (let ia = 0; ia < AZ; ia++) {
      for (let ir = 0; ir < RAD - 1; ir++) {
        const a = ia * RAD + ir;
        const b = (ia + 1) * RAD + ir;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.36, 0.36, 0.31) });
    applyAerialPerspective(m, sharedAerialUniforms);
    return { geometry: g, material: m };
  }, [extentM, verticalScale]);

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
