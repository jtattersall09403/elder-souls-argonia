/**
 * Top-down canopy occlusion map (decision 0112 §5): 256² texels over 256 m
 * around the camera, rasterised on the CPU from crown discs (the vegetation
 * instances near the camera), with leaf-gap noise inside each crown.
 * r: canopy optical density 0..1, g: crown bottom height, b: crown top height.
 * Rebakes when the camera moves 32 m.
 */
import * as THREE from "three";

export interface Crown {
  x: number; z: number;
  radiusM: number;
  bottomM: number;
  topM: number;
}

export const CANOPY_TEXELS = 256;
export const CANOPY_SIZE_M = 256;
const REBAKE_M = 32;

/** Deterministic value noise in 0..1 for the leaf gaps (world-anchored, 1.5 m cells). */
function leafGap(x: number, z: number): number {
  const h = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const fx = x / 1.5, fz = z / 1.5;
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = h(i, j) + (h(i + 1, j) - h(i, j)) * sx;
  const b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * sx;
  return a + (b - a) * sz;
}

export class CanopyMap {
  readonly data = new Float32Array(CANOPY_TEXELS * CANOPY_TEXELS * 4);
  readonly texture: THREE.DataTexture;
  readonly origin = new THREE.Vector2(Number.NaN, Number.NaN);
  constructor(private readonly crowns: (x: number, z: number, radiusM: number) => Iterable<Crown>) {
    this.texture = new THREE.DataTexture(this.data, CANOPY_TEXELS, CANOPY_TEXELS, THREE.RGBAFormat, THREE.FloatType);
    this.texture.name = "es-vol-canopy";
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
  }

  update(x: number, z: number, force = false): boolean {
    const cx = this.origin.x + CANOPY_SIZE_M / 2, cz = this.origin.y + CANOPY_SIZE_M / 2;
    if (!force && Number.isFinite(cx) && Math.hypot(x - cx, z - cz) < REBAKE_M) return false;
    const t = CANOPY_SIZE_M / CANOPY_TEXELS;
    const ox = Math.round((x - CANOPY_SIZE_M / 2) / t) * t, oz = Math.round((z - CANOPY_SIZE_M / 2) / t) * t;
    this.origin.set(ox, oz);
    const d = this.data;
    d.fill(0);
    for (const c of this.crowns(x, z, CANOPY_SIZE_M * 0.75)) {
      const i0 = Math.max(0, Math.floor((c.x - c.radiusM - ox) / t)), i1 = Math.min(CANOPY_TEXELS - 1, Math.ceil((c.x + c.radiusM - ox) / t));
      const j0 = Math.max(0, Math.floor((c.z - c.radiusM - oz) / t)), j1 = Math.min(CANOPY_TEXELS - 1, Math.ceil((c.z + c.radiusM - oz) / t));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const wx = ox + (i + 0.5) * t, wz = oz + (j + 0.5) * t;
        const r = Math.hypot(wx - c.x, wz - c.z) / c.radiusM;
        if (r >= 1) continue;
        const edge = 1 - r * r;
        const gap = leafGap(wx, wz);
        const dens = Math.min(1, edge * 1.6) * (gap < 0.3 ? gap / 0.3 * 0.4 : 1);
        const o = (j * CANOPY_TEXELS + i) * 4;
        if (d[o] === 0) { d[o + 1] = c.bottomM; d[o + 2] = c.topM; } else {
          d[o + 1] = Math.min(d[o + 1], c.bottomM); d[o + 2] = Math.max(d[o + 2], c.topM);
        }
        d[o] = Math.min(1, d[o] + dens * (1 - d[o]));
      }
    }
    this.texture.needsUpdate = true;
    return true;
  }

  dispose(): void { this.texture.dispose(); }
}
