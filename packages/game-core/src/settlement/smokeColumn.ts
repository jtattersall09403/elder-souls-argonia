/**
 * Chimney smoke as a runtime effect (16k fix round 2, lane effects).
 *
 * Vanilla's `effects/ambient/fxsmokechimney01/02.nif` is an editor marker plus
 * an addon node; the smoke itself is the particle system
 * `mps/mpssmokechimney01.nif`, which our kit import cannot carry (fix2-kits-r2
 * item 4). So the smoke is code, not art: a short column of camera-facing
 * quads, each drawing one puff of the vanilla atlas the particle system uses
 * (`textures/effects/smokeparticles01.dds`, 4 x 4 puffs), published once in
 * works-v1's manifest `effectTextures` by build_kit.
 *
 * Placement contract: a bundle placement of kind `"effect"` with assetId
 * `fx:smoke-column`, mounted on its shell (`parentPlacementId` +
 * `mountOffsetM` at the chimney top). The layer resolves its pose like any
 * mounted child and hands the anchors here.
 *
 * Nothing module-level is mutable: the layer owns one `SmokeColumns`, and the
 * clock (seconds) and wind are passed to `update` every frame.
 */
import * as THREE from "three";
import { PRECIP_LAYER } from "../water/render/waterMaterial";
import { lodLadder } from "../fx/lodFade";
import type { SettlementPlacement } from "./types";

export const SMOKE_COLUMN_ASSET_ID = "fx:smoke-column";
/** Beyond this the column is not drawn at all (lane brief: off beyond 150 m). */
export const SMOKE_MAX_DISTANCE_M = 150;
/** The ladder rings (0075 hard steps): full column, then fewer puffs. */
export const SMOKE_LADDER_RINGS_M: readonly number[] = [40, 90];
/** Puffs per rung of the ladder, nearest first. */
export const SMOKE_QUADS_PER_LEVEL: readonly number[] = [16, 12, 8];
export const SMOKE_MAX_QUADS = 16;
/** The final stretch over which the column's alpha ramps to nothing. */
export const SMOKE_VANISH_M = 30;
/** A puff's life, rise and growth. */
export const SMOKE_LIFETIME_S = 9;
export const SMOKE_RISE_M = 7;
export const SMOKE_START_SIZE_M = 0.7;
export const SMOKE_END_SIZE_M = 3.2;
/** Share of the wind speed a puff drifts at (smoke lags the air it rides in). */
export const SMOKE_DRIFT_SHARE = 0.35;
export const SMOKE_PEAK_ALPHA = 0.5;
/** The vanilla atlas layout: 4 x 4 puffs. */
export const SMOKE_ATLAS_TILES = 4;
/** Used when the environment carries no wind vector. */
/** The smoke's brightness at full night (the settlement night factor 1):
 * the column is unlit, so without it pale smoke glows against a dark sky
 * (16k fix 2 round 4 ruling E3). */
export const SMOKE_NIGHT_BRIGHTNESS = 0.2;
export const SMOKE_CALM_WIND: SmokeWind = { dirXZ: [1, 0], speedMS: 1 };

export interface SmokeWind {
  /** Travel direction, XZ unit vector. */
  dirXZ: readonly [number, number];
  speedMS: number;
}

export interface SmokeAnchor {
  id: string;
  /** World position of the chimney top. */
  position: THREE.Vector3;
}

export interface SmokePuff {
  offset: [number, number, number];
  sizeM: number;
  alpha: number;
  tile: number;
}

/** `true` for the placements the smoke layer spawns (and the kit draw skips). */
export function isSmokeColumnPlacement(p: Pick<SettlementPlacement, "kind" | "assetId">): boolean {
  return p.kind === "effect" && p.assetId === SMOKE_COLUMN_ASSET_ID;
}

/** Puff count at a camera distance: the 0075 ladder's level, 0 past the cap. */
export function smokeQuadsAt(distanceM: number): number {
  if (!(distanceM <= SMOKE_MAX_DISTANCE_M)) return 0;
  const ladder = lodLadder(SMOKE_LADDER_RINGS_M, SMOKE_QUADS_PER_LEVEL.length, null,
    SMOKE_MAX_DISTANCE_M);
  const rung = ladder.find((r) => distanceM >= r.lo && distanceM <= r.hi) ?? ladder[ladder.length - 1];
  return SMOKE_QUADS_PER_LEVEL[rung.level];
}

/** Column alpha multiplier: 1 until the last `SMOKE_VANISH_M`, then a ramp to 0. */
export function smokeDistanceFade(distanceM: number): number {
  const t = (SMOKE_MAX_DISTANCE_M - distanceM) / SMOKE_VANISH_M;
  return Math.min(1, Math.max(0, t));
}

/**
 * One puff of a column at time `timeS` (seconds, injected). Puffs are evenly
 * phased over the lifetime, so the column is continuous; `seed` staggers
 * neighbouring chimneys so they do not puff in step. Deterministic.
 */
export function smokePuff(
  index: number, count: number, timeS: number, wind: SmokeWind, seed = 0,
): SmokePuff {
  const age = (((timeS / SMOKE_LIFETIME_S + index / count + seed) % 1) + 1) % 1;
  const drift = wind.speedMS * SMOKE_DRIFT_SHARE * age * SMOKE_LIFETIME_S;
  // A small sideways wobble so the column is not a ruler-straight line.
  const wobble = 0.25 * age * Math.sin(index * 2.399 + timeS * 0.7 + seed * 6.283);
  const [dx, dz] = wind.dirXZ;
  return {
    offset: [dx * drift - dz * wobble, age * SMOKE_RISE_M, dz * drift + dx * wobble],
    sizeM: SMOKE_START_SIZE_M + (SMOKE_END_SIZE_M - SMOKE_START_SIZE_M) * age,
    // in over the first 15 % of life, out over the rest
    alpha: SMOKE_PEAK_ALPHA * Math.min(1, age / 0.15) * (1 - age),
    tile: index % (SMOKE_ATLAS_TILES * SMOKE_ATLAS_TILES),
  };
}

/** A stable 0..1 stagger from a placement id. */
export function smokeSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const CORNERS: readonly [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

/**
 * Every smoke column the layer has anchored, drawn as ONE mesh: a fixed-size
 * quad buffer (columns x 16 quads) rewritten each frame on the CPU, facing
 * the camera. A column past `SMOKE_MAX_DISTANCE_M` writes no quads.
 */
export class SmokeColumns {
  readonly mesh: THREE.Mesh;
  private anchors: SmokeAnchor[] = [];
  private source: readonly SmokeAnchor[] | null = null;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.MeshBasicMaterial;
  private capacity = 0;
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  /** ``night``: the settlement layer's own night-factor uniform
   * (`esSettlementNight`, 0 by day, 1 at night, `updateSettlementEnvironment`),
   * shared by reference so the smoke dims with the windows and no second
   * clock read runs per frame; absent, the smoke never dims. */
  constructor(texture: THREE.Texture, night: THREE.IUniform<number> = { value: 0 }) {
    this.material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, vertexColors: true,
      side: THREE.DoubleSide, fog: true,
    });
    this.material.name = "settlement-smoke-column";
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.esSettlementNight = night;
      shader.fragmentShader = `uniform float esSettlementNight;\n${shader.fragmentShader}`
        .replace("#include <map_fragment>", `#include <map_fragment>\n`
          + `diffuseColor.rgb *= mix(1.0, ${SMOKE_NIGHT_BRIGHTNESS.toFixed(3)}, esSettlementNight);`);
    };
    this.material.customProgramCacheKey = () => "settlement-smoke-night";
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = "settlement-smoke";
    // Walk 2 D8: on layer 0 the smoke drew in the water pipeline's pass 1
    // (depth-write free) and the water surface in pass 3 painted over it.
    // The post-water layer draws after the surface, depth-tested against the
    // scene depth and tone-mapped in this material's own shader, like rain
    // (waterMaterial.ts PRECIP_LAYER, WaterPipeline pass 3). Scene fog still
    // applies: the same scene is rendered.
    this.mesh.layers.set(PRECIP_LAYER);
  }

  /** Cheap to call every frame: the same array is a no-op. */
  setAnchors(anchors: readonly SmokeAnchor[]): void {
    if (anchors === this.source) return;
    this.source = anchors;
    this.anchors = [...anchors];
    if (anchors.length > this.capacity) this.allocate(anchors.length);
  }

  get anchorCount(): number { return this.anchors.length; }

  /** Rewrite the quads for this frame. Returns the number of quads drawn. */
  update(timeS: number, camera: THREE.Camera, wind: SmokeWind): number {
    const position = this.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!position) return 0;
    const color = this.geometry.getAttribute("color") as THREE.BufferAttribute;
    const uv = this.geometry.getAttribute("uv") as THREE.BufferAttribute;
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const cameraAt = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const tileSize = 1 / SMOKE_ATLAS_TILES;
    let quad = 0;
    for (const anchor of this.anchors) {
      const distance = cameraAt.distanceTo(anchor.position);
      const count = smokeQuadsAt(distance);
      const fade = smokeDistanceFade(distance);
      const seed = smokeSeed(anchor.id);
      for (let i = 0; i < count; i++) {
        const puff = smokePuff(i, count, timeS, wind, seed);
        const cx = anchor.position.x + puff.offset[0];
        const cy = anchor.position.y + puff.offset[1];
        const cz = anchor.position.z + puff.offset[2];
        const u0 = (puff.tile % SMOKE_ATLAS_TILES) * tileSize;
        const v0 = 1 - (Math.floor(puff.tile / SMOKE_ATLAS_TILES) + 1) * tileSize;
        for (let c = 0; c < 4; c++) {
          const [sx, sy] = CORNERS[c];
          const v = quad * 4 + c;
          position.setXYZ(v,
            cx + (this.right.x * sx + this.up.x * sy) * puff.sizeM,
            cy + (this.right.y * sx + this.up.y * sy) * puff.sizeM,
            cz + (this.right.z * sx + this.up.z * sy) * puff.sizeM);
          uv.setXY(v, u0 + (sx + 0.5) * tileSize, v0 + (sy + 0.5) * tileSize);
          color.setXYZW(v, 1, 1, 1, puff.alpha * fade);
        }
        quad += 1;
      }
    }
    this.geometry.setDrawRange(0, quad * 6);
    position.needsUpdate = true; uv.needsUpdate = true; color.needsUpdate = true;
    return quad;
  }

  /** Frees the geometry, the material and the texture it was given. */
  dispose(): void {
    this.material.map?.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }

  private allocate(columns: number): void {
    this.capacity = columns;
    const quads = columns * SMOKE_MAX_QUADS;
    const index = new Uint32Array(quads * 6);
    for (let q = 0; q < quads; q++) {
      index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    }
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
    this.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(quads * 12), 3));
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(quads * 8), 2));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(quads * 16), 4));
    this.geometry.setDrawRange(0, 0);
  }
}

/** What works-v1's manifest records per effect texture (build_kit.publish_effect_textures). */
export interface KitEffectTexture {
  file: string;
  atlas?: [number, number];
}

/**
 * The published file of an effect's texture, read from its kit manifest's
 * `effectTextures`: a URL relative to the kits folder. A manifest without the
 * row is a named error (no fallback texture: we never make art).
 */
export function effectTextureFile(manifest: unknown, assetId: string, source: string): string {
  const rows = (manifest as { effectTextures?: Record<string, KitEffectTexture> } | null)?.effectTextures;
  const row = rows?.[assetId];
  if (!row || typeof row.file !== "string" || !row.file) {
    throw new Error(`kit manifest ${source} has no effectTextures row for ${assetId}`);
  }
  return row.file;
}
