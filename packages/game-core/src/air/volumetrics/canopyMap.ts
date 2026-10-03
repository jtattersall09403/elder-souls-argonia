/**
 * Top-down canopy occlusion map (decision 0112 §5): 256² texels over 256 m
 * around the camera, rasterised on the CPU from crown discs (the vegetation
 * instances near the camera), with leaf-gap noise inside each crown.
 * r: canopy optical density 0..1, g: crown bottom height, b: crown top height,
 * a: forest cover (r box-averaged over COVER_BOX_M). Texels under no crown disc
 * but inside a forest (leaf gaps, ground between crowns) carry the box mean of
 * their neighbours' crown bottom and top, so the medium and the shaft march see
 * one forest roof over gaps (vol10 c9 C). Rebakes when the camera moves 32 m.
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
/** Box width (m) of the forest-cover average in channel a (8-16 m: wider than a leaf gap or the space
 * between neighbouring crowns, narrower than a glade). */
export const COVER_BOX_M = 13;

/** Deterministic value noise in 0..1 for the leaf gaps (world-anchored, 1.2 m cells, so the gaps are 0.5..2 m holes). */
function leafGap(x: number, z: number): number {
  const h = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const fx = x / 1.2, fz = z / 1.2;
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
  /** Whether the last bake rasterised any crown (the map spans +-128 m, rebaked every 32 m, so false
   * means no crown within 96 m of the camera): the volumetrics skip the shaft march when false. */
  hasCrowns = false;
  /** Box-filter scratch (cover, bottom, top, crown presence), allocated once. */
  private readonly tmp = new Float32Array(CANOPY_TEXELS * CANOPY_TEXELS * 4);
  private readonly row = new Float32Array(CANOPY_TEXELS * 4);
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
    let any = false;
    for (const c of this.crowns(x, z, CANOPY_SIZE_M * 0.75)) {
      const i0 = Math.max(0, Math.floor((c.x - c.radiusM - ox) / t)), i1 = Math.min(CANOPY_TEXELS - 1, Math.ceil((c.x + c.radiusM - ox) / t));
      const j0 = Math.max(0, Math.floor((c.z - c.radiusM - oz) / t)), j1 = Math.min(CANOPY_TEXELS - 1, Math.ceil((c.z + c.radiusM - oz) / t));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const wx = ox + (i + 0.5) * t, wz = oz + (j + 0.5) * t;
        const r = Math.hypot(wx - c.x, wz - c.z) / c.radiusM;
        if (r >= 1) continue;
        const edge = 1 - r * r;
        const gap = leafGap(wx, wz);
        const dens = Math.min(1, edge * 2.5) * Math.min(1, Math.max(0, (gap - 0.3) / 0.08));
        const o = (j * CANOPY_TEXELS + i) * 4;
        any = true;
        if (d[o + 3] === 0) { d[o + 3] = 1; d[o + 1] = c.bottomM; d[o + 2] = c.topM; } else {
          d[o + 1] = Math.min(d[o + 1], c.bottomM); d[o + 2] = Math.max(d[o + 2], c.topM);
        }
        d[o] = Math.min(1, d[o] + dens * (1 - d[o]));
      }
    }
    this.hasCrowns = any;
    this.coverPass();
    this.texture.needsUpdate = true;
    return true;
  }

  /** Channel a = r box-averaged over COVER_BOX_M; a texel under no crown disc takes the box mean of
   * its neighbours' crown bottom and top (separable running sums, two passes over the scratch). */
  private coverPass(): void {
    const N = CANOPY_TEXELS, d = this.data, tmp = this.tmp, row = this.row;
    const R = Math.max(1, Math.round((COVER_BOX_M * N) / CANOPY_SIZE_M / 2));
    // a holds crown presence (set in the raster); pack cover, presence x bottom, presence x top, presence
    for (let k = 0; k < N * N; k++) {
      const o = k * 4, pr = d[o + 3];
      tmp[o] = d[o]; tmp[o + 1] = pr * d[o + 1]; tmp[o + 2] = pr * d[o + 2]; tmp[o + 3] = pr;
    }
    const pass = (stride: number, step: number) => {
      for (let line = 0; line < N; line++) {
        const base = line * stride;
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let i = -R; i <= R; i++) if (i >= 0 && i < N) sum += tmp[(base + i * step) * 4 + c];
          for (let i = 0; i < N; i++) {
            row[i * 4 + c] = sum;
            const out = i - R, inn = i + R + 1;
            if (out >= 0) sum -= tmp[(base + out * step) * 4 + c];
            if (inn < N) sum += tmp[(base + inn * step) * 4 + c];
          }
        }
        for (let i = 0; i < N; i++) for (let c = 0; c < 4; c++) tmp[(base + i * step) * 4 + c] = row[i * 4 + c];
      }
    };
    pass(N, 1); // rows
    pass(1, N); // columns
    const area = (2 * R + 1) * (2 * R + 1);
    for (let k = 0; k < N * N; k++) {
      const o = k * 4;
      if (d[o + 3] === 0 && tmp[o + 3] > 0) { d[o + 1] = tmp[o + 1] / tmp[o + 3]; d[o + 2] = tmp[o + 2] / tmp[o + 3]; }
      d[o + 3] = tmp[o] / area;
    }
  }

  dispose(): void { this.texture.dispose(); }
}
