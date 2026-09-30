/**
 * Terrain grids around the camera for the fog field (decision 0112 §4):
 * - near: 256 m at 2 m (128²): r ground height, g water surface height,
 *   b water mask, a ground wetness;
 * - far: 2 km at 16 m (128²): r ground height, g basin floor (min-filter of
 *   the ground over ~300 m, then a blur), b sea mask, a water mask.
 * Baked on the CPU from injected samplers, re-centred when the camera moves
 * over a quarter of a grid, and chunked by rows under a per-frame budget.
 */
import * as THREE from "three";

export interface TerrainSamplers {
  groundHeight(x: number, z: number): number;
  /** Water surface height and presence (mask 0..1) at x,z. */
  water(x: number, z: number): { height: number; mask: number };
  /** 0..1: open sea here. */
  seaMask(x: number, z: number): number;
  /** 0..1: wet ground (marsh). */
  wetness(x: number, z: number): number;
}

export const GRID_TEXELS = 128;
export const NEAR_SIZE_M = 256;
export const FAR_SIZE_M = 2048;
const BASIN_RADIUS_TEXELS = 9; // ~300 m at 16 m (half-width 144 m)

class Grid {
  readonly data = new Float32Array(GRID_TEXELS * GRID_TEXELS * 4);
  readonly texture: THREE.DataTexture;
  /** World XZ of texel (0,0)'s corner, of the grid being shown. */
  readonly origin = new THREE.Vector2(Number.NaN, Number.NaN);
  private readonly pending = new THREE.Vector2();
  private row = -1;
  constructor(readonly sizeM: number, name: string) {
    this.texture = new THREE.DataTexture(this.data, GRID_TEXELS, GRID_TEXELS, THREE.RGBAFormat, THREE.FloatType);
    this.texture.name = name;
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
  }
  get texelM(): number { return this.sizeM / GRID_TEXELS; }
  /** Starts a rebake centred on x,z when the camera left the middle quarter. */
  wants(x: number, z: number): boolean {
    if (this.row >= 0) return true;
    const cx = this.origin.x + this.sizeM / 2, cz = this.origin.y + this.sizeM / 2;
    if (Number.isFinite(cx) && Math.abs(x - cx) < this.sizeM / 4 && Math.abs(z - cz) < this.sizeM / 4) return false;
    const snap = this.texelM;
    this.pending.set(Math.round((x - this.sizeM / 2) / snap) * snap, Math.round((z - this.sizeM / 2) / snap) * snap);
    this.row = 0;
    this.scratch.fill(0);
    return true;
  }
  /** Rows are baked into a scratch copy and swapped in when complete, so a half-baked grid is never shown. */
  readonly scratch = new Float32Array(GRID_TEXELS * GRID_TEXELS * 4);
  bakeRows(deadline: number, texel: (wx: number, wz: number, out: Float32Array, o: number) => void): boolean {
    while (this.row >= 0 && this.row < GRID_TEXELS) {
      const j = this.row++;
      const wz = this.pending.y + (j + 0.5) * this.texelM;
      for (let i = 0; i < GRID_TEXELS; i++) texel(this.pending.x + (i + 0.5) * this.texelM, wz, this.scratch, (j * GRID_TEXELS + i) * 4);
      if (performance.now() > deadline) return false;
    }
    return this.row >= GRID_TEXELS;
  }
  finish(post?: (d: Float32Array) => void): void {
    post?.(this.scratch);
    this.data.set(this.scratch);
    this.origin.copy(this.pending);
    this.row = -1;
    this.texture.needsUpdate = true;
  }
}

/** Basin floor: min over a square window, then a box blur (separable passes). */
export function basinFloor(ground: Float32Array, n: number, stride: number, channel: number, radius: number): Float32Array {
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let k = Math.max(0, i - radius); k <= Math.min(n - 1, i + radius); k++) m = Math.min(m, ground[(j * n + k) * stride + channel]);
    tmp[j * n + i] = m;
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let k = Math.max(0, j - radius); k <= Math.min(n - 1, j + radius); k++) m = Math.min(m, tmp[k * n + i]);
    out[j * n + i] = m;
  }
  const r = Math.max(1, radius >> 1);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? out : tmp, dst = pass === 0 ? tmp : out;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) {
        const ii = pass === 0 ? Math.min(n - 1, Math.max(0, i + k)) : i;
        const jj = pass === 1 ? Math.min(n - 1, Math.max(0, j + k)) : j;
        s += src[jj * n + ii]; c++;
      }
      dst[j * n + i] = s / c;
    }
  }
  return out;
}

export class TerrainGrids {
  readonly near = new Grid(NEAR_SIZE_M, "es-vol-terrain-near");
  readonly far = new Grid(FAR_SIZE_M, "es-vol-terrain-far");
  constructor(private readonly s: TerrainSamplers) {}

  /** Advances any pending bake within `budgetMs`; returns true when every grid is current. */
  update(x: number, z: number, budgetMs = 1.5): boolean {
    const deadline = performance.now() + budgetMs;
    const { s } = this;
    if (this.near.wants(x, z)) {
      const done = this.near.bakeRows(deadline, (wx, wz, d, o) => {
        const w = s.water(wx, wz);
        d[o] = s.groundHeight(wx, wz); d[o + 1] = w.height; d[o + 2] = w.mask; d[o + 3] = s.wetness(wx, wz);
      });
      if (done) this.near.finish(); else return false;
    }
    if (this.far.wants(x, z)) {
      const done = this.far.bakeRows(deadline, (wx, wz, d, o) => {
        d[o] = s.groundHeight(wx, wz); d[o + 1] = 0; d[o + 2] = s.seaMask(wx, wz); d[o + 3] = s.water(wx, wz).mask;
      });
      if (!done) return false;
      this.far.finish((d) => {
        const floor = basinFloor(d, GRID_TEXELS, 4, 0, BASIN_RADIUS_TEXELS);
        for (let k = 0; k < floor.length; k++) d[k * 4 + 1] = floor[k];
      });
    }
    return true;
  }

  /** Bakes everything now (harness, teleports). */
  bakeAll(x: number, z: number): void {
    this.near.origin.set(Number.NaN, Number.NaN);
    this.far.origin.set(Number.NaN, Number.NaN);
    this.update(x, z, Infinity);
  }

  dispose(): void { this.near.texture.dispose(); this.far.texture.dispose(); }
}
