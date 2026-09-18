/**
 * T3 groundcover ring (module 65 §110): grass/fern/reed regenerated at
 * runtime around the focus from the land-cover raster and the authored
 * bindings in `world/sources/flora/groundcover.json` — never baked into the
 * chunk bundles. This layer carries most of the "dense jungle" read: the
 * reference mod's jungle feel is mostly dense groundcover over modest trees.
 *
 * Placement is deterministic (tile + species + index hashed, the same idea as
 * `worldgen.scatter.hash64`), so walking away and back yields the same plants.
 *
 * Six mechanisms, all of them things every shipped open world does and this
 * ring did not (research: docs/research/vegetation/…):
 *
 *  1. **A per-tile cache.** Generation is pure per 16 m tile — it cannot see
 *     the focus — so crossing a tile boundary regenerates only the new row of
 *     tiles and evicts the row that left. Everything focus-dependent (fade,
 *     quadrant, budget) happens when the meshes are filled from the cache.
 *  2. **Three quality tiers per species**, not one radius and a cliff: full
 *     mesh near, a viewer-facing baked card at the authored density to the
 *     ring radius, the same card at 35 % density out to the far radius, and
 *     every boundary dissolved by the dithered LOD crossfade. Nothing the
 *     ring places ever winks out.
 *  3. **A clump field.** A second value-noise field per species, on its own
 *     12 m wavelength, decides which of a cover's two or three species
 *     dominates where. Without it a three-species cover is an even mix
 *     everywhere and reads as one texture.
 *  4. **Colour comes from the ground.** Each instance takes the tint under it
 *     from `ground-tint.png` (the Witcher 3 pigment-map trick) so grass roots
 *     match the ground rather than floating as a separate green.
 *  5. **One mesh per species part per QUADRANT** of the ring. A mesh spanning
 *     the whole ring is never outside the frustum, so `frustumCulled` bought
 *     nothing; quartering it costs at most 4x the draws and actually culls.
 *  6. **No shadow receipt.** Tens of thousands of alpha-tested double-sided
 *     cards sampling two cascades is the single most expensive thing this
 *     layer could do, for a shadow nobody reads on a grass blade.
 *  7. **Persistent meshes.** The (species, tier, quadrant) meshes live for the
 *     component's life and grow their buffers by 1.5x when a rebuild needs
 *     more room. Destroying and recreating ~59 InstancedMeshes every 16 m was
 *     a GPU buffer reallocation storm for data that mostly did not change.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { buildFloraKit, type FloraKit, type KitManifest } from "./floraKit";
import type { QualitySettings } from "@elder-souls/game-core/core/quality";
import { sharedChunkStore, type ChunksManifest } from "../character/chunkStore";
import { PROVINCE_EXTENT_M } from "../provinceScale";
import {
  applyWindSway,
  updateWindSway,
} from "@elder-souls/game-core/fx/windSway";
import {
  applyLodFade,
  createLodFadeUniforms,
  LOD_BAND_ATTRIBUTE,
} from "@elder-souls/game-core/fx/lodFade";
import {
  applyCylindricalBillboard,
} from "@elder-souls/game-core/fx/billboardQuad";
import { sharedWindUniforms } from "./windUniforms";
import { lastWeatherSample } from "../weather/weatherState";
import { sharedWaterAssets } from "../water/waterAssets";
import { groundHeightM } from "./terrainHeight";
import {
  indexPatches,
  survivesPatches,
  type IndexedPatch,
} from "@elder-souls/game-core/vegetation/vegetationPatches";
import type { WaterData } from "@elder-souls/game-core/water/index";
import groundcoverTable from "../../../../world/sources/flora/groundcover.json";

/** Ring tiling. Tiles are world-aligned so placement is position-independent. */
const TILE_M = 16;
const RING_RADIUS_M = 75;
const RING_FAR_RADIUS_M = 165;
const SHORT_SPECIES_M = 0.6;

/**
 * Three quality tiers per species, not one radius and a cliff (owner: every
 * placed thing steps DOWN through quality bands rather than vanishing).
 * `r` is the preset's `groundcoverRadiusM`:
 *
 *  - NEAR, full mesh, out to `0.4 r`;
 *  - MID, one baked card at the authored density, to `r`;
 *  - FAR, the same card at 35 % density, to the preset's far radius — or
 *    proportionally sooner for a species under `SHORT_SPECIES_M`, because a
 *    30 cm tuft at 150 m is a pixel that still costs a vertex.
 *
 * Nothing pops at a boundary: every tier carries an `esLodBand` and dissolves
 * across it (`lodFade.ts`), and the FAR band fades to nothing at its radius.
 */
const NEAR_FRACTION = 0.4;
/** Fraction of a species' instances the FAR tier keeps. */
const FAR_THIN = 0.35;
/** Short species stop at `1.6 r` where the tall ones stop at `2.2 r`. */
const SHORT_FAR_FRACTION = 1.6 / 2.2;
/** A bed-cover species (one that stands under metres of water: the river
 * bed, the seabed, the ocean floor) runs every tier radius at this scale.
 * Visibility under water is short, so a carpet drawn to the land radius is
 * fill-rate spent inside fog nobody sees through (owner, 16f round 2). */
const SUBMERGED_RADIUS_SCALE = 0.6;
/** `maxDepthM` at or above this marks a bed cover; the wading reeds (1.5 m)
 * stand proud of the water and keep the land radii. */
const BED_COVER_DEPTH_M = 4;
const TIER_NEAR = 0;
const TIER_MID = 1;
const TIER_FAR = 2;
const TIER_COUNT = 3;
/** Crossfade half-widths, metres: (fade-in, fade-out) per tier. Wider the
 * further out, because the further band is the cheaper one to double up. */
const TIER_BAND_M: [number, number][] = [[0, 4], [4, 6], [6, 10]];
/** Hard budget. The authored densities want ~30k in jungle; if a rebuild asks
 * for more than this, every species is thinned proportionally. */
const MAX_INSTANCES = 60_000;
/** Standing water gates: `below-at-least` species need shallow water; land
 * grass should not render drowned under a metre of marsh. How deep a wading
 * species will stand is per rule (`maxDepthM`) — the marsh species wade to
 * 1.5 m, the three bed covers run to 4 m — because the river bed, the seabed
 * and the ocean floor are painted ground like any other. */
const DEFAULT_WATER_SPECIES_MAX_DEPTH_M = 1.5;
const LAND_SPECIES_MAX_DEPTH_M = 0.5;
/** A `waterRule: "above"` species only stands on ground the water has left.
 * The two bed covers carry a wet binding and a dry one: dry silt is the
 * seasonal bed, dry seabed sand is the tidal flat. */
const DRY_SPECIES_MAX_DEPTH_M = 0.02;
/** Foundation scatter is a small, local treatment, not part of the province
 * flora budget. The cap is only a corrupt-data guard for overlapping exports. */
const MAX_FOUNDATION_SCATTER = 3_000;
const FOUNDATION_SCATTER_CELL_M = 0.65;

interface SpeciesRule {
  asset: string;
  density: number; // instances per hectare
  slopeDegMax: number;
  heightVariance: number;
  waterRule?: string;
  /** The asset's own vertical size, copied from the built kit manifest. */
  heightM: number;
  /** Where this species has thinned to nothing. */
  fadeM: number;
  /** How deep a `below-at-least` species will stand. */
  maxDepthM?: number;
}

interface SpeciesPlan {
  id: string;
  index: number;
  /** Highest authored density across covers — the candidate rate; each
   * candidate then survives at (local density / max), so cover boundaries
   * stay crisp at per-instance resolution. */
  maxDensity: number;
  /** Keyed by `slotKey(region, cover)`: schema v2 binds grass to the pair,
   * not to the cover alone. */
  bySlot: Map<number, SpeciesRule>;
  /** Any rule at all, for the jitter amplitude (they differ by ≤0.15 m). */
  anyRule: SpeciesRule;
  needsWater: boolean;
  /** A bed cover (`below-at-least` to `BED_COVER_DEPTH_M` or deeper): its
   * tier radii are scaled by `SUBMERGED_RADIUS_SCALE`. */
  submerged: boolean;
  /** Under `SHORT_SPECIES_M` tall: its FAR tier stops proportionally sooner.
   * A property of the MESH, so it is the same on every rule for a species. */
  short: boolean;
}

/** groundcover.json v2: (region class, land-cover id) → species. Covers with
 * no entry are the bare list — bare ground stays bare (decision 0036 Q5). */
const TABLE = groundcoverTable as unknown as {
  schemaVersion: number;
  clumpWavelengthM: number;
  colourVariance: number;
  byLandCover: Record<string, { species: SpeciesRule[] }>;
  byRegionClass: Record<string, { swaps: Record<string, SpeciesRule[]> }>;
};

if (TABLE.schemaVersion !== 4) {
  throw new Error(`groundcover.json schema ${TABLE.schemaVersion}, expected 4`);
}

/** Wavelength of the per-species clump field, and how far an instance's
 * colour may drift from the ground tint under it. Both are table-level: they
 * describe the ring, not one plant. */
const CLUMP_WAVELENGTH_M = TABLE.clumpWavelengthM;
const COLOUR_VARIANCE = TABLE.colourVariance;

/** Region classes run 0–14; land covers 0–63. Region 0 in the key is the
 * "region unknown" slot the base land-cover table fills, used until the
 * region raster has loaded (and for anything off its edge). */
const REGION_SLOT_STRIDE = 64;
const REGION_UNKNOWN = -1;

function slotKey(region: number, cover: number): number {
  return (region + 1) * REGION_SLOT_STRIDE + cover;
}

/** The swap layer resolves per (region, cover): a region's swap REPLACES the
 * base list for that one cover, it never merges into it. */
function rulesFor(region: number, coverId: string): SpeciesRule[] {
  const swap = TABLE.byRegionClass[String(region)]?.swaps?.[coverId];
  return swap ?? TABLE.byLandCover[coverId].species;
}

function buildPlans(): SpeciesPlan[] {
  const plans = new Map<string, SpeciesPlan>();
  const regions = [REGION_UNKNOWN, ...Object.keys(TABLE.byRegionClass).map(Number)];
  for (const region of regions) {
    for (const coverId of Object.keys(TABLE.byLandCover)) {
      // The unknown-region slot is the unswapped base table.
      const rules = rulesFor(region, coverId);
      for (const rule of rules) {
        let plan = plans.get(rule.asset);
        if (!plan) {
          plan = {
            id: rule.asset,
            index: plans.size,
            maxDensity: 0,
            bySlot: new Map(),
            anyRule: rule,
            needsWater: false,
            submerged: false,
            short: false,
          };
          plans.set(rule.asset, plan);
        }
        plan.bySlot.set(slotKey(region, Number(coverId)), rule);
        plan.maxDensity = Math.max(plan.maxDensity, rule.density);
        plan.short = rule.heightM < SHORT_SPECIES_M;
        if (rule.waterRule === "below-at-least") {
          plan.needsWater = true;
          if ((rule.maxDepthM ?? 0) >= BED_COVER_DEPTH_M) plan.submerged = true;
        }
      }
    }
  }
  return [...plans.values()];
}

const SPECIES_PLANS = buildPlans();

/** Deterministic 32-bit mix; `salt` separates the random streams one
 * candidate draws (keep / jitter x / jitter z / accept / yaw / height). */
function hash32(a: number, b: number, c: number, d: number): number {
  let h = 0x9e3779b9 ^ Math.imul(a | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) ^ Math.imul(b | 0, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) ^ Math.imul(d | 0, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function u01(h: number): number {
  return h / 4294967296;
}

/** One deterministic value per integer lattice point, for the clump field.
 * Integer mixing only, so `worldgen.groundcover_ring._hash_lattice` computes
 * the identical value in numpy and a species' patches land in the same places
 * in the measurement twin as on screen. */
function latticeValue(ix: number, iz: number, salt: number): number {
  let h = (0x9e3779b9 ^ Math.imul(ix | 0, 0x85ebca6b)) >>> 0;
  h = (Math.imul(h ^ (h >>> 13), 0xc2b2ae35) ^ Math.imul(iz | 0, 0x27d4eb2f)) >>> 0;
  h = (Math.imul(h ^ (h >>> 15), 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * Bilinear value noise on a `CLUMP_WAVELENGTH_M` lattice, in [0,1].
 *
 * This is the field that stops a three-species cover reading as one texture.
 * Acceptance is scaled by `0.35 + 1.3 * clump`, whose mean over the field is
 * 1, so the AUTHORED density is preserved while the species trade dominance
 * in ~12 m patches — the separate-noise-field mechanism Unity calls Noise
 * Spread and REDengine got out of its resource simulation.
 */
function clumpAt(x: number, z: number, salt: number): number {
  const u = x / CLUMP_WAVELENGTH_M;
  const v = z / CLUMP_WAVELENGTH_M;
  const ix = Math.floor(u);
  const iz = Math.floor(v);
  const fx = u - ix;
  const fz = v - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const c00 = latticeValue(ix, iz, salt);
  const c10 = latticeValue(ix + 1, iz, salt);
  const c01 = latticeValue(ix, iz + 1, salt);
  const c11 = latticeValue(ix + 1, iz + 1, salt);
  return (c00 * (1 - sx) + c10 * sx) * (1 - sz) + (c01 * (1 - sx) + c11 * sx) * sz;
}

/**
 * Make `instanceColor` actually reach the pixel.
 *
 * three sets `USE_INSTANCING_COLOR` when a mesh has an `instanceColor`, and
 * its vertex chunk duly multiplies the instance colour into `vColor` — but
 * `color_fragment` applies `vColor` to `diffuseColor` only under `USE_COLOR`
 * / `USE_COLOR_ALPHA`, which come from `material.vertexColors`. Setting that
 * instead would define `USE_COLOR` and make the shader read a `color`
 * geometry attribute the kit meshes do not have, which is black grass. So the
 * fragment shader gets the missing two lines, chained onto whatever hook is
 * already there.
 *
 * Install/reapply is the same contract wind and the LOD fade use, and for the
 * same reason: `csm.setupMaterial` OVERWRITES `onBeforeCompile` with a plain
 * assignment, so without `reapplyGroundTint` in WorldSky's patch pass the
 * ground tint silently stopped reaching the pixel and the whole ring went
 * back to one flat kit green.
 */
interface TintPatchState {
  esGroundTint?: boolean;
  esGroundTintWrapped?: THREE.Material["onBeforeCompile"];
}

function installGroundTint(material: THREE.Material): void {
  const state = material.userData as TintPatchState;
  state.esGroundTint = true;
  const previous = material.onBeforeCompile;
  const wrapped: THREE.Material["onBeforeCompile"] = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    if (shader.fragmentShader.includes("es-ground-tint")) return;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      // es-ground-tint
      #if defined( USE_INSTANCING_COLOR ) && !defined( USE_COLOR ) && !defined( USE_COLOR_ALPHA )
        diffuseColor.rgb *= vColor.rgb;
      #endif`,
    );
  };
  material.onBeforeCompile = wrapped;
  state.esGroundTintWrapped = wrapped;
  material.needsUpdate = true;
}

function applyGroundTint(material: THREE.Material): void {
  if ((material.userData as TintPatchState).esGroundTint) return;
  installGroundTint(material);
}

/** Restore the tint hook after CSM overwrote `onBeforeCompile`. No-op on
 * materials this layer never patched, so it is safe on a whole scene. */
export function reapplyGroundTint(material: THREE.Material): void {
  const state = material.userData as TintPatchState;
  if (!state.esGroundTint) return;
  if (material.onBeforeCompile === state.esGroundTintWrapped) return;
  installGroundTint(material);
}

// --- land-cover raster -------------------------------------------------------

interface ControlRaster {
  ids: Uint8Array; // red channel = land-cover material id
  size: number;
  metresPerTexel: number;
}

type Footprint = [number, number][];

interface FoundationTreatment {
  id: string;
  footprintM: Footprint;
  foundationScatterBandM: [number, number];
}

export interface FoundationScatterPoint {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  keep: number;
}

function pointSegmentDistance(x: number, z: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]; const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

function insideFootprint(x: number, z: number, poly: Footprint): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]; const b = poly[j];
    if ((a[1] > z) !== (b[1] > z)
        && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function distanceToFootprint(x: number, z: number, poly: Footprint): number {
  let distance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < poly.length; i++) {
    distance = Math.min(distance, pointSegmentDistance(x, z, poly[i], poly[(i + 1) % poly.length]));
  }
  return distance;
}

/** Signed-footprint treatment from checklist item 21. Inside is always zero;
 * outside peaks at the band's inner edge and falls smoothly to zero. */
export function foundationScatterWeight(
  x: number, z: number, treatment: FoundationTreatment,
): number {
  const [rawInner, rawOuter] = treatment.foundationScatterBandM;
  const inner = Math.max(0, rawInner);
  const outer = Math.max(inner, rawOuter);
  if (treatment.footprintM.length < 3 || outer <= inner
      || insideFootprint(x, z, treatment.footprintM)) return 0;
  const distance = distanceToFootprint(x, z, treatment.footprintM);
  if (distance < inner || distance >= outer) return 0;
  const t = 1 - (distance - inner) / (outer - inner);
  return t * t * (3 - 2 * t);
}

function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic, world-grid-aligned rubble points. A treatment rebuild after
 * walking away and back produces byte-for-byte the same transforms. */
export function foundationScatterPoints(treatment: FoundationTreatment): FoundationScatterPoint[] {
  if (treatment.footprintM.length < 3) return [];
  const outer = treatment.foundationScatterBandM[1];
  if (!Number.isFinite(outer) || outer <= Math.max(0, treatment.foundationScatterBandM[0])) return [];
  const xs = treatment.footprintM.map((p) => p[0]);
  const zs = treatment.footprintM.map((p) => p[1]);
  const minX = Math.floor((Math.min(...xs) - outer) / FOUNDATION_SCATTER_CELL_M);
  const maxX = Math.ceil((Math.max(...xs) + outer) / FOUNDATION_SCATTER_CELL_M);
  const minZ = Math.floor((Math.min(...zs) - outer) / FOUNDATION_SCATTER_CELL_M);
  const maxZ = Math.ceil((Math.max(...zs) + outer) / FOUNDATION_SCATTER_CELL_M);
  const seed = hashString(treatment.id);
  const points: FoundationScatterPoint[] = [];
  for (let iz = minZ; iz <= maxZ; iz++) {
    for (let ix = minX; ix <= maxX; ix++) {
      const x = (ix + 0.5) * FOUNDATION_SCATTER_CELL_M
        + (u01(hash32(ix, iz, seed, 0)) - 0.5) * FOUNDATION_SCATTER_CELL_M * 0.55;
      const z = (iz + 0.5) * FOUNDATION_SCATTER_CELL_M
        + (u01(hash32(ix, iz, seed, 1)) - 0.5) * FOUNDATION_SCATTER_CELL_M * 0.55;
      const weight = foundationScatterWeight(x, z, treatment);
      if (weight <= 0 || u01(hash32(ix, iz, seed, 2)) >= weight * 0.42) continue;
      points.push({
        x, z,
        yaw: u01(hash32(ix, iz, seed, 3)) * Math.PI * 2,
        scale: 0.55 + u01(hash32(ix, iz, seed, 4)) * 1.15,
        keep: u01(hash32(ix, iz, seed, 5)),
      });
    }
  }
  return points;
}

/**
 * Is any of this treatment's scatter band within `radiusM` of the focus?
 *
 * A bbox test on the footprint, expanded by the band's outer edge. Cheap
 * enough to run over every settlement in the province each rebuild, which is
 * the point: `foundationScatterPoints` walks a 0.65 m lattice over the whole
 * band, and running that for every settlement in Black Marsh to keep the one
 * the player is standing in was the ring's worst rebuild cost.
 */
function nearTreatment(
  focus: { x: number; z: number },
  treatment: FoundationTreatment,
  radiusM: number,
): boolean {
  const poly = treatment.footprintM;
  if (poly.length < 3) return false;
  const outer = Math.max(0, treatment.foundationScatterBandM[1]);
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const [x, z] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const dx = Math.max(minX - outer - focus.x, 0, focus.x - (maxX + outer));
  const dz = Math.max(minZ - outer - focus.z, 0, focus.z - (maxZ + outer));
  return Math.hypot(dx, dz) <= radiusM;
}

/** Reject by origin PLUS species radius: a fern rooted outside a floor may
 * still put two metres of frond through it. */
export function excludedByFootprints(
  x: number, z: number, radiusM: number, footprints: readonly Footprint[],
): boolean {
  for (const poly of footprints) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]; const b = poly[j];
      if (pointSegmentDistance(x, z, a, b) <= radiusM) return true;
    }
    if (insideFootprint(x, z, poly)) return true;
  }
  return false;
}

let controlPromise: Promise<ControlRaster> | null = null;
let controlBase: string | null = null;

/** Loaded ONCE per session and sampled CPU-side; both scenes share it. */
function sharedControlRaster(baseUrl: string): Promise<ControlRaster> {
  if (!controlPromise || controlBase !== baseUrl) {
    controlBase = baseUrl;
    controlPromise = (async () => {
      const res = await fetch(`${baseUrl}province/refined/ground-control.png`);
      const bitmap = await createImageBitmap(await res.blob(), {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      bitmap.close();
      const ids = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0; i < ids.length; i++) ids[i] = px[i * 4];
      // metresPerTexel comes from the image's OWN size against the province
      // extent: ground-control ships at full resolution (4033²) while
      // meta.metresPerPixel describes the half-res height raster — using it
      // directly sampled the wrong quadrant (mountain rock under the jungle,
      // no groundcover anywhere south-east of the map centre).
      return {
        ids,
        size: canvas.width,
        metresPerTexel: PROVINCE_EXTENT_M / canvas.width,
      };
    })();
  }
  return controlPromise;
}

function coverAt(control: ControlRaster, x: number, z: number): number {
  const tx = Math.max(0, Math.min(control.size - 1, Math.floor(x / control.metresPerTexel)));
  const tz = Math.max(0, Math.min(control.size - 1, Math.floor(z / control.metresPerTexel)));
  return control.ids[tz * control.size + tx];
}

// --- ground tint -------------------------------------------------------------

interface TintRaster {
  rgb: Uint8Array; // 3 bytes per texel
  size: number;
  metresPerTexel: number;
}

let tintPromise: Promise<TintRaster> | null = null;
let tintBase: string | null = null;

/**
 * The refined ground albedo, loaded ONCE and sampled CPU-side.
 *
 * This is the Witcher 3 pigment map in its cheapest form: every instance
 * takes the colour of the ground it stands in, so a fern on red mud is not
 * the same green as a fern on moss and the ring stops reading as a separate
 * layer floating over the terrain. Its own size sets metres-per-texel, for
 * the same reason `ground-control.png` does — the hydrology meta describes a
 * different raster, and using it sampled the wrong quadrant.
 */
function sharedTintRaster(baseUrl: string): Promise<TintRaster> {
  if (!tintPromise || tintBase !== baseUrl) {
    tintBase = baseUrl;
    tintPromise = (async () => {
      const res = await fetch(`${baseUrl}province/refined/ground-tint.png`);
      const bitmap = await createImageBitmap(await res.blob(), {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      bitmap.close();
      const rgb = new Uint8Array(canvas.width * canvas.height * 3);
      for (let i = 0; i < canvas.width * canvas.height; i++) {
        rgb[i * 3] = px[i * 4];
        rgb[i * 3 + 1] = px[i * 4 + 1];
        rgb[i * 3 + 2] = px[i * 4 + 2];
      }
      return { rgb, size: canvas.width, metresPerTexel: PROVINCE_EXTENT_M / canvas.width };
    })();
  }
  return tintPromise;
}

// --- region raster -----------------------------------------------------------

let regionPromise: Promise<ControlRaster> | null = null;
let regionBase: string | null = null;

/**
 * Region classes, decoded from `hydro-regions.png` by the legend the
 * hydrology meta ships — the same colours `worldgen.regions.REGION_CLASSES`
 * writes, read rather than duplicated, so a legend change cannot silently
 * split the compiler's world from the runtime's.
 *
 * Loaded ONCE per session like the land-cover raster. Until it resolves, the
 * ring places from the unswapped base table: grass appears immediately and
 * changes species when the region arrives, rather than the ground staying
 * bare on a cold load.
 */
function sharedRegionRaster(baseUrl: string): Promise<ControlRaster> {
  if (!regionPromise || regionBase !== baseUrl) {
    regionBase = baseUrl;
    regionPromise = (async () => {
      const [meta, res] = await Promise.all([
        fetch(`${baseUrl}province/hydrology-meta.json`).then((r) => r.json()),
        fetch(`${baseUrl}province/hydro-regions.png`),
      ]);
      const legend = meta.regionsLegend as Record<string, { rgb: [number, number, number] }>;
      const byColour = new Map<number, number>();
      for (const [id, entry] of Object.entries(legend)) {
        const [r, g, b] = entry.rgb;
        byColour.set((r << 16) | (g << 8) | b, Number(id));
      }
      const bitmap = await createImageBitmap(await res.blob(), {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      bitmap.close();
      // The shipped raster carries a partial alpha (120, an overlay-style
      // PNG since 2026-09-13). A 2D canvas stores premultiplied colour and
      // getImageData un-premultiplies it with rounding, so an exact legend
      // match failed on every texel (55,175,45 read back as 55,174,45),
      // every texel decoded as region 0, and the ring bound no species
      // anywhere (measured 2026-09-16: 68 tiles, 0 instances). Match the
      // NEAREST legend colour instead; anything farther than a few units
      // from every legend entry is genuinely unknown.
      const entries = [...byColour.entries()].map(([key, id]) => [key >> 16, (key >> 8) & 255, key & 255, id]);
      const exact = new Map<number, number>();
      const ids = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0; i < ids.length; i++) {
        const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
        const key = (r << 16) | (g << 8) | b;
        let id = byColour.get(key) ?? exact.get(key);
        if (id === undefined) {
          let best = 0, bestD = 9e9;
          for (const [lr, lg, lb, lid] of entries) {
            const d = (lr - r) ** 2 + (lg - g) ** 2 + (lb - b) ** 2;
            if (d < bestD) { bestD = d; best = lid; }
          }
          id = bestD <= 48 ? best : 0;     // ≤ ~7 units per channel
          exact.set(key, id);
        }
        ids[i] = id;
      }
      return {
        ids,
        size: canvas.width,
        metresPerTexel: PROVINCE_EXTENT_M / canvas.width,
      };
    })();
  }
  return regionPromise;
}

/**
 * The baked card for each species, read from the GLB ONCE.
 *
 * The kit builder gives a billboard level two mesh children tagged
 * `cardView: "a"` and `"b"` (glTF extras, never node names). Grass uses view A
 * only: a tuft has no distinguished profile worth two atlas slots, and one
 * card per species halves the card tier's draws. `buildFloraKit` does not
 * carry the view tag through its `parts`, so it is looked up here from the
 * scene graph and cached per species for the component's life.
 *
 * A species with no card (every species in the kit as it stands today, which
 * ships no billboard level at all) simply has no entry, and its mid and far
 * tiers fall back to level 0 — the ring is correct before the rebuilt kit
 * lands, just not yet cheap.
 */
function buildCardIndex(gltf: { scene: THREE.Object3D }): Map<string, KitLevelPart> {
  const cards = new Map<string, KitLevelPart>();
  for (const root of gltf.scene.children) {
    const extras = (root.userData ?? {}) as { assetId?: string };
    const id = extras.assetId ?? (root.name ? root.name.replace("__", ":") : null);
    if (!id) continue;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || cards.has(id)) return;
      const data = (mesh.userData ?? {}) as { billboard?: boolean; cardView?: string };
      if (data.billboard !== true || data.cardView !== "a") return;
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      // A card whose material lost its texture draws as a solid untextured
      // rectangle at distance (the "grey slab" defect); skip it and let the
      // species run on its mesh.
      if (!(material as THREE.MeshStandardMaterial)?.map) return;
      cards.set(id, { geometry: mesh.geometry, material });
    });
  }
  return cards;
}

interface KitLevelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Per-SLOT geometry views, cached on the source kit geometry.
 *
 * The `esLodBand` crossfade attribute is an instanced attribute, and instanced
 * attributes live on the geometry, not on the mesh. Twelve meshes (3 tiers x 4
 * quadrants) share one kit geometry, so one shared attribute would let the
 * last slot written re-band every other slot. A view shares every real vertex
 * buffer by reference — nothing is copied or uploaded twice — and only holds
 * its own band attribute. (Vegetation.tsx solves the identical problem for its
 * neighbourhood blocks; that copy is the other agent's file this round.)
 */
const SLOT_GEOMETRIES = Symbol("esSlotGeometries");

function slotGeometry(source: THREE.BufferGeometry, slot: number): THREE.BufferGeometry {
  if (slot === 0) return source;
  const host = source as unknown as
    { [SLOT_GEOMETRIES]?: Map<number, THREE.BufferGeometry> };
  const cache = host[SLOT_GEOMETRIES] ?? (host[SLOT_GEOMETRIES] = new Map());
  const cached = cache.get(slot);
  if (cached) return cached;
  const view = new THREE.BufferGeometry();
  view.setIndex(source.getIndex());
  for (const [name, attribute] of Object.entries(source.attributes)) {
    if (name === LOD_BAND_ATTRIBUTE) continue;
    view.setAttribute(name, attribute);
  }
  for (const group of source.groups) view.addGroup(group.start, group.count, group.materialIndex);
  source.computeBoundingSphere();
  source.computeBoundingBox();
  view.boundingSphere = source.boundingSphere ? source.boundingSphere.clone() : null;
  view.boundingBox = source.boundingBox ? source.boundingBox.clone() : null;
  cache.set(slot, view);
  return view;
}

/** The `esLodBand` attribute for one slot geometry, allocated once and GROWN
 * in place: a fresh attribute every rebuild strands its GPU buffer (nothing
 * disposes a bare attribute). Over-allocation is harmless — the mesh draws
 * `count` instances, not the attribute's length. */
function bandAttribute(
  geometry: THREE.BufferGeometry, instances: number,
): THREE.InstancedBufferAttribute {
  const existing = geometry.getAttribute(LOD_BAND_ATTRIBUTE) as
    | THREE.InstancedBufferAttribute | undefined;
  if (existing && existing.count >= instances) return existing;
  const grown = new THREE.InstancedBufferAttribute(
    new Float32Array(Math.max(instances, 64) * 4), 4);
  geometry.setAttribute(LOD_BAND_ATTRIBUTE, grown);
  return grown;
}

// Terrain height: shared with the baked-scatter renderer — see terrainHeight.ts.

// --- component ---------------------------------------------------------------

/** The four ring corners, flat, so the per-frame loop allocates nothing. */
const CORNER_OFFSETS = [-1, -1, -1, 1, 1, -1, 1, 1] as const;
const CHUNK_KEY_STRIDE = 4096;
/** Tile keys are packed integers for the same reason. The province is ~7 km,
 * so a 16 m tile index never leaves +/-16384. */
const TILE_KEY_ORIGIN = 16_384;
const TILE_KEY_STRIDE = 65_536;

function tileKey(tx: number, tz: number): number {
  return (tx + TILE_KEY_ORIGIN) * TILE_KEY_STRIDE + (tz + TILE_KEY_ORIGIN);
}

/** A generated tile. `far` marks a tile generated at FAR density (the keep
 * roll thinned on the candidate lattice up front, so a tile nobody will see
 * in detail costs 35 % of the work). It is regenerated in full the moment it
 * enters the MID band. */
interface CachedTile {
  far: boolean;
  perSpecies: TilePlacement[][];
}

/** One cached instance. Everything here is focus-INDEPENDENT; the tier, the
 * quadrant and the budget are applied when the meshes are filled. */
interface TilePlacement {
  x: number; y: number; z: number; yaw: number;
  /** Height variance only — the distance scale fade is applied at fill. */
  scale: number;
  /** Stable roll for the budget thin. */
  keep: number;
  /** This candidate's own keep roll, normalised against the tile's keep
   * probability, so `farKeep < FAR_THIN` is EXACTLY the subset a far-band
   * tile generates when it is thinned up front. One rule for both, or an
   * instance would appear and disappear as its tile changed band. */
  farKeep: number;
  /** Colour, already sampled from the ground tint and varied. */
  r: number; g: number; b: number;
}

export interface GroundcoverStats {
  instances: number;
  draws: number;
  triangles: number;
  tiles: number;
  /** Instances drawn per quality tier: [near mesh, mid card, far card]. */
  byTier: [number, number, number];
  /** Tiles GENERATED this rebuild (the rest came from the cache) — the cost
   * of crossing a tile boundary, in the only unit that matters. */
  tilesGenerated: number;
  /** False while the kit ships no baked cards: every tier is then level 0. */
  cards: boolean;
  /** 1 unless the authored densities exceeded MAX_INSTANCES; then the
   * proportional thinning factor actually applied. */
  densityScale: number;
  /** Candidate rejections in the last generation pass, by filter. */
  rejected?: Record<string, number>;
  /** Deterministic foundation rubble in the exported signed-distance bands. */
  foundationScatterInstances: number;
}

export function Groundcover({
  focusRef,
  baseUrl,
  verticalScale = 1,
  onStats,
  quality,
}: {
  /** Same shape the chunk terrain uses: ground position, not a camera. */
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  baseUrl: string;
  verticalScale?: number;
  onStats?: (stats: GroundcoverStats) => void;
  quality?: QualitySettings;
}) {
  const ringRadiusM = quality?.groundcoverRadiusM ?? RING_RADIUS_M;
  const farRadiusM = quality?.groundcoverFarRadiusM ?? RING_FAR_RADIUS_M;
  const maxInstances = quality?.groundcoverMaxInstances ?? MAX_INSTANCES;
  const root = useRef<THREE.Group>(null);
  const [manifest, setManifest] = useState<KitManifest | null>(null);
  const [kit, setKit] = useState<FloraKit | null>(null);
  const [control, setControl] = useState<ControlRaster | null>(null);
  const [regionRaster, setRegionRaster] = useState<ControlRaster | null>(null);
  const [tint, setTint] = useState<TintRaster | null>(null);
  const [chunks, setChunks] = useState<ChunksManifest | null>(null);
  const [exclusions, setExclusions] = useState<Footprint[]>([]);
  const [foundationTreatments, setFoundationTreatments] = useState<FoundationTreatment[]>([]);
  const [clearanceIndex, setClearanceIndex] = useState<IndexedPatch[]>([]);
  const radii = useRef(new Map<string, number>());
  const water = useRef<WaterData | null>(null);
  const store = sharedChunkStore(baseUrl);
  /** Persistent meshes, keyed `species|tier|quadrant|part` (mechanism 7). A
   * mesh is recreated only when a rebuild needs more room than its buffers
   * hold; otherwise the rebuild writes into the buffers it already has. */
  const meshPool = useRef(new Map<string, THREE.InstancedMesh>());
  const foundationScatterMesh = useRef<THREE.InstancedMesh | null>(null);
  const requested = useRef(new Set<number>());
  /** Per-tile cache (mechanism 1). A tile's instances do not depend on the
   * focus, so crossing a boundary regenerates only the tiles that entered the
   * ring and drops the ones that left. */
  const tileCache = useRef(new Map<number, CachedTile>());
  const focusTile = useRef<[number, number]>([Number.NaN, Number.NaN]);
  const [revision, setRevision] = useState(0);

  const gltf = useLoader(GLTFLoader, `${baseUrl}kits/groundcover-province-v1.glb`);

  useEffect(() => {
    let cancelled = false;
    fetch(`${baseUrl}kits/groundcover-province-v1.kit.json`)
      .then((r) => r.json())
      .then((m: KitManifest) => {
        if (!cancelled) {
          setManifest(m);
          radii.current = new Map(m.assets.map((a) => [a.id, Math.max(a.sizeM[0], a.sizeM[1]) / 2]));
        }
      })
      .catch(() => undefined);
    fetch(`${baseUrl}province/settlements.json`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("no settlements")))
      .then((b: { groundTreatments?: FoundationTreatment[] }) => {
        if (!cancelled) {
          const treatments = (b.groundTreatments ?? []).filter((t) =>
            Array.isArray(t.footprintM) && Array.isArray(t.foundationScatterBandM));
          setExclusions(treatments.map((t) => t.footprintM));
          setFoundationTreatments(treatments);
        }
      })
      .catch(() => undefined);
    // The typed clearance patches, published beside the vegetation bundles —
    // the same list the patch stage applied to them (16f, decision 0070).
    fetch(`${baseUrl}province/vegetation-patches.json`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("no patches")))
      .then((b) => { if (!cancelled) setClearanceIndex(indexPatches(b)); })
      .catch(() => undefined);
    sharedControlRaster(baseUrl)
      .then((c) => { if (!cancelled) setControl(c); })
      .catch(() => undefined);
    sharedRegionRaster(baseUrl)
      .then((c) => { if (!cancelled) setRegionRaster(c); })
      .catch(() => undefined);
    sharedTintRaster(baseUrl)
      .then((t) => { if (!cancelled) setTint(t); })
      .catch(() => undefined);
    store.manifest()
      .then((m) => { if (!cancelled) setChunks(m); })
      .catch(() => undefined);
    // Same shared load StudioWater performs — the depth proxy gates the reed
    // species to shallow standing water. Optional: without it they place
    // everywhere their cover allows.
    sharedWaterAssets(baseUrl)
      .then((a) => {
        if (!cancelled && !water.current) {
          water.current = a.data;
          setRevision((r) => r + 1);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  useEffect(() => {
    if (manifest) setKit(buildFloraKit(gltf, manifest));
  }, [gltf, manifest]);

  // The rubble geometry and material are one pair for the component's life:
  // a rebuild used to allocate and drop a fresh dodecahedron and a fresh
  // standard material every time the focus crossed a tile. Not a module-level
  // singleton — this is app code, but the package rule's reasoning (no shared
  // mutable state between scenes) holds here too.
  const foundationParts = useMemo(() => ({
    geometry: new THREE.DodecahedronGeometry(0.13, 0),
    material: Object.assign(
      new THREE.MeshStandardMaterial({ color: 0x5b5142, roughness: 1 }),
      { userData: { esAerial: true } }),
  }), []);

  useEffect(() => () => {
    foundationParts.geometry.dispose();
    foundationParts.material.dispose();
    const mesh = foundationScatterMesh.current;
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.dispose();
    foundationScatterMesh.current = null;
  }, [foundationParts]);

  // The easy half of the wind work: groundcover casts no shadows, so there is
  // no depth-material twin to keep in step (see Vegetation.tsx).
  const wind = sharedWindUniforms;
  // The ring's own crossfade/billboard view position. Its own, not the
  // vegetation layer's: the two draw different kits, so no material is
  // shared, and one uniform object per layer keeps the dependency one-way.
  const lodFade = useMemo(() => createLodFadeUniforms(), []);
  const cards = useMemo(() => buildCardIndex(gltf), [gltf]);

  useFrame((state) => {
    const weather = lastWeatherSample();
    if (weather) updateWindSway(wind, state.clock.elapsedTime, weather);
    // The crossfade and the billboard both measure from the REAL camera, not
    // from `cameraPosition` (the light, in the shadow pass) and not from the
    // focus (the character's feet, which is a metre and a half out).
    lodFade.esLodViewPos.value.copy(state.camera.position);
    const focus = focusRef.current;
    // Ensure the chunks under the ring are decoding at LOD 1 (the store
    // dedups with the terrain's own requests); a decode arrival rebuilds.
    if (chunks) {
      // Runs every frame, so it allocates nothing: the four corner offsets are
      // a module constant and the seen-set is keyed by a packed integer rather
      // than by a freshly built `${cx},${cy}` string.
      for (let i = 0; i < CORNER_OFFSETS.length; i += 2) {
        const cx = Math.max(0, Math.min(chunks.grid[0] - 1,
          Math.floor((focus.x + CORNER_OFFSETS[i] * farRadiusM) / chunks.chunkMetres)));
        const cy = Math.max(0, Math.min(chunks.grid[1] - 1,
          Math.floor((focus.z + CORNER_OFFSETS[i + 1] * farRadiusM) / chunks.chunkMetres)));
        const key = cx * CHUNK_KEY_STRIDE + cy;
        if (requested.current.has(key)) continue;
        requested.current.add(key);
        store.load(cx, cy, "1")
          .then(() => setRevision((r) => r + 1))
          .catch(() => requested.current.delete(key));
      }
    }
    const tx = Math.floor(focus.x / TILE_M);
    const tz = Math.floor(focus.z / TILE_M);
    if (tx !== focusTile.current[0] || tz !== focusTile.current[1]) {
      focusTile.current = [tx, tz];
      setRevision((r) => r + 1);
    }
  });

  useEffect(() => {
    const group = root.current;
    if (!group || !kit || !control || !chunks) return;

    // Nothing is destroyed here (mechanism 7). Every mesh this rebuild does
    // not fill is hidden by setting its `count` to 0 at the end; the meshes
    // themselves, their buffers and their bounding spheres survive.
    const liveMeshes = new Set<string>();

    const focus = focusRef.current;
    const waterData = water.current;
    const tileHa = (TILE_M * TILE_M) / 10_000;
    const tileReach = Math.ceil(farRadiusM / TILE_M);
    const [ftx, ftz] = focusTile.current;
    const cache = tileCache.current;

    // Pass one: make sure every tile touching the ring is in the cache.
    // Generation is PURE per tile — it never reads the focus — so a tile that
    // was already generated is reused verbatim and the cost of crossing a
    // boundary is one row of tiles, not the whole ring.
    let tiles = 0;
    let tilesGenerated = 0;
    const live = new Set<number>();
    // Why candidates die, for the probe (numbers, not a screenshot).
    const rej = { keep: 0, bare: 0, accept: 0, footprint: 0, patch: 0, height: 0, slope: 0, water: 0 };
    for (let tz = ftz - tileReach; tz <= ftz + tileReach; tz++) {
      for (let tx = ftx - tileReach; tx <= ftx + tileReach; tx++) {
        const centreX = (tx + 0.5) * TILE_M;
        const centreZ = (tz + 0.5) * TILE_M;
        // Tile culled on its nearest point, so edge tiles still contribute.
        const nearest = Math.hypot(
          Math.max(0, Math.abs(focus.x - centreX) - TILE_M / 2),
          Math.max(0, Math.abs(focus.z - centreZ) - TILE_M / 2),
        );
        if (nearest > farRadiusM) continue;
        tiles++;
        const key = tileKey(tx, tz);
        live.add(key);
        // A tile wholly outside the mid radius is only ever drawn as thinned
        // far cards, so it is GENERATED thinned: 35 % of the candidates, and
        // 35 % of the ground/water/patch sampling that dominates the cost.
        // It is regenerated in full the moment it enters the mid band.
        const wantFar = nearest > ringRadiusM;
        const cached = cache.get(key);
        if (cached && !(cached.far && !wantFar)) continue;
        tilesGenerated++;

        const perSpecies: TilePlacement[][] = SPECIES_PLANS.map(() => []);
        let incomplete = false;
        for (const plan of SPECIES_PLANS) {
          // Candidates on a stratified grid at the species' peak density —
          // Bethesda's GRAS placement model, one sample uniform per cell.
          const candidates = plan.maxDensity * tileHa;
          const g = Math.max(1, Math.ceil(Math.sqrt(candidates)));
          const cell = TILE_M / g;
          const keepP = candidates / (g * g);
          const keepThreshold = wantFar ? keepP * FAR_THIN : keepP;
          for (let k = 0; k < g * g; k++) {
            const genKeep = u01(hash32(tx, tz, plan.index, k * 8));
            if (genKeep >= keepThreshold) { rej.keep++; continue; }
            // Stratified: one candidate per cell, uniform over the WHOLE cell.
            // A fixed jitter amplitude smaller than the cell left the lattice
            // visible as rows wherever the cell was wide (every rule under
            // ~7,000 /ha has a cell over 1.2 m).
            const ux = u01(hash32(tx, tz, plan.index, k * 8 + 1));
            const uz = u01(hash32(tx, tz, plan.index, k * 8 + 2));
            const x = tx * TILE_M + ((k % g) + ux) * cell;
            const z = tz * TILE_M + (Math.floor(k / g) + uz) * cell;

            // Region THEN cover: the swap layer is what stops the delta, the
            // interior swamp and the mangrove coast sharing one reed wherever
            // they share a cover id.
            const region = regionRaster
              ? coverAt(regionRaster, x, z) : REGION_UNKNOWN;
            const rule = plan.bySlot.get(slotKey(region, coverAt(control, x, z)));
            if (!rule) { rej.bare++; continue; } // bare cover, or bound to other species here
            // Acceptance is the cover's share of the species' peak density,
            // modulated by the species' own clump field (mechanism 3). The
            // field's mean is 1, so the authored density is preserved.
            const clump = clumpAt(x, z, plan.index);
            const accept = (rule.density / plan.maxDensity) * (0.35 + 1.3 * clump);
            if (u01(hash32(tx, tz, plan.index, k * 8 + 3)) >= accept) { rej.accept++; continue; }

            const speciesRadiusM = radii.current.get(plan.id) ?? 0;
            if (excludedByFootprints(x, z, speciesRadiusM, exclusions)) { rej.footprint++; continue; }
            // Vegetation patches (0041 gotcha (b)): the published bundles were
            // patched by the stage, but this layer is generated here and has to
            // obey the same patch list or grass grows through the floors.
            if (!survivesPatches(x, z, speciesRadiusM, clearanceIndex,
              u01(hash32(tx, tz, plan.index, k * 8 + 7)))) { rej.patch++; continue; }

            const h = groundHeightM(store, chunks, x, z);
            if (h === null) { incomplete = true; rej.height++; continue; }
            // Slope from the same heights (true metres — the authored limits
            // are physical, not exaggerated).
            const step = 2;
            const east = groundHeightM(store, chunks, x + step, z);
            const south = groundHeightM(store, chunks, x, z + step);
            if (east !== null && south !== null) {
              const slopeDeg = Math.atan(Math.hypot(east - h, south - h) / step) * (180 / Math.PI);
              if (slopeDeg > rule.slopeDegMax) { rej.slope++; continue; }
            }
            if (waterData) {
              const depth = waterData.depthProxy(x, z);
              if (rule.waterRule === "above") {
                if (depth > DRY_SPECIES_MAX_DEPTH_M) { rej.water++; continue; }
              } else if (plan.needsWater && rule.waterRule === "below-at-least") {
                // Reeds stand IN shallow water, kelp and coral on the bed —
                // how deep is the rule's own, not one constant for both.
                const maxDepth = rule.maxDepthM ?? DEFAULT_WATER_SPECIES_MAX_DEPTH_M;
                if (depth <= 0.02 || depth > maxDepth) { rej.water++; continue; }
              } else if (depth > LAND_SPECIES_MAX_DEPTH_M) {
                rej.water++; continue; // drowned grass under open water reads as a bug
              }
            }

            // Colour off the ground beneath (mechanism 4), varied per
            // instance so a patch is not one flat swatch.
            let r = 1; let gg = 1; let b = 1;
            if (tint) {
              const t = Math.min(tint.size - 1, Math.max(0, Math.floor(x / tint.metresPerTexel)));
              const tzz = Math.min(tint.size - 1, Math.max(0, Math.floor(z / tint.metresPerTexel)));
              const o = (tzz * tint.size + t) * 3;
              const drift = 1 + (u01(hash32(tx, tz, plan.index, k * 8 + 5)) - 0.5)
                * 2 * COLOUR_VARIANCE;
              r = Math.min(1, (tint.rgb[o] / 255) * drift);
              gg = Math.min(1, (tint.rgb[o + 1] / 255) * drift);
              b = Math.min(1, (tint.rgb[o + 2] / 255) * drift);
            }
            const vary = (u01(hash32(tx, tz, plan.index, k * 8 + 5)) - 0.5) * 2;
            perSpecies[plan.index].push({
              x,
              y: h * verticalScale,
              z,
              yaw: u01(hash32(tx, tz, plan.index, k * 8 + 4)) * Math.PI * 2,
              scale: 1 + vary * rule.heightVariance,
              keep: u01(hash32(tx, tz, plan.index, k * 8 + 6)),
              farKeep: keepP > 0 ? genKeep / keepP : 1,
              r, g: gg, b,
            });
          }
        }
        // A tile generated before the terrain chunks under it had decoded
        // rejected every candidate on a missing height. Caching that as the
        // tile's answer left the ring EMPTY for good (measured 2026-09-16:
        // 68 tiles, 0 instances in the jungle); an incomplete tile is not
        // cached, so the next rebuild (chunk arrival bumps `revision`)
        // generates it again on real ground.
        if (!incomplete) cache.set(key, { far: wantFar, perSpecies });
      }
    }
    // Evict what left the ring. Without this the cache is the whole province.
    for (const key of cache.keys()) if (!live.has(key)) cache.delete(key);

    // Pass two: tier, quadrant and budget — everything the focus decides.
    // Quadrants (mechanism 5) are the four sectors around the focus; each gets
    // its own mesh with its own tight bounding sphere, so frustum culling
    // actually rejects instead of always seeing a 150 m mesh.
    const nearRadiusM = ringRadiusM * NEAR_FRACTION;
    const shortFarRadiusM = farRadiusM * SHORT_FAR_FRACTION;
    // 12 buckets per species: tier * 4 + quadrant.
    const visible: TilePlacement[][][] = SPECIES_PLANS.map(
      () => Array.from({ length: TIER_COUNT * 4 }, () => [] as TilePlacement[]));
    let total = 0;
    for (const key of live) {
      const tile = cache.get(key);
      if (!tile) continue;
      for (const plan of SPECIES_PLANS) {
        const list = tile.perSpecies[plan.index];
        if (list.length === 0) continue;
        const radiusScale = plan.submerged ? SUBMERGED_RADIUS_SCALE : 1;
        const speciesFarM = (plan.short ? shortFarRadiusM : farRadiusM) * radiusScale;
        const speciesNearM = nearRadiusM * radiusScale;
        const speciesMidM = ringRadiusM * radiusScale;
        const bucket = visible[plan.index];
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const distance = Math.hypot(focus.x - item.x, focus.z - item.z);
          if (distance > speciesFarM) continue;
          // Mechanism 2: full mesh, card, thinned card — never a cliff.
          const tier = distance <= speciesNearM ? TIER_NEAR
            : distance <= speciesMidM ? TIER_MID : TIER_FAR;
          // The far band keeps 35 %, and it is exactly the subset a
          // far-generated tile holds, so an instance neither appears nor
          // disappears when its tile changes band.
          if (tier === TIER_FAR && item.farKeep >= FAR_THIN) continue;
          bucket[tier * 4 + (item.x >= focus.x ? 1 : 0) + (item.z >= focus.z ? 2 : 0)]
            .push(item);
          total++;
        }
      }
    }

    // Pass three: budget guard — thin every species by the same factor.
    const densityScale = total > maxInstances ? maxInstances / total : 1;

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const colour = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    let instances = 0;
    let triangles = 0;
    const byTier: [number, number, number] = [0, 0, 0];
    for (const plan of SPECIES_PLANS) {
      const entry = kit.get(plan.id);
      if (!entry) continue; // species missing from the kit: skip, never throw
      // View A of the species' baked card. Absent (the kit as it stands ships
      // no billboard level at all) every tier runs on the full mesh: correct,
      // just not yet cheap.
      const card = cards.get(plan.id) ?? null;
      const radiusScale = plan.submerged ? SUBMERGED_RADIUS_SCALE : 1;
      const speciesFarM = (plan.short ? shortFarRadiusM : farRadiusM) * radiusScale;
      const speciesNearM = nearRadiusM * radiusScale;
      const speciesMidM = ringRadiusM * radiusScale;
      const tierBands: [number, number, number, number][] = [
        [0, speciesNearM, TIER_BAND_M[0][0], TIER_BAND_M[0][1]],
        [speciesNearM, speciesMidM, TIER_BAND_M[1][0], TIER_BAND_M[1][1]],
        [speciesMidM, speciesFarM, TIER_BAND_M[2][0], TIER_BAND_M[2][1]],
      ];
      for (let tier = 0; tier < TIER_COUNT; tier++) {
        const parts = tier === TIER_NEAR || !card ? entry.levels[0].parts : [card];
        const band = tierBands[tier];
        for (let quadrant = 0; quadrant < 4; quadrant++) {
          const slot = tier * 4 + quadrant;
          const raw = visible[plan.index][slot];
          const list = densityScale < 1
            ? raw.filter((p) => p.keep < densityScale) : raw;
          if (list.length === 0) continue;
          instances += list.length;
          byTier[tier] += list.length;
          for (let partIndex = 0; partIndex < parts.length; partIndex++) {
            const part = parts[partIndex];
            const meshKey = `${plan.index}|${slot}|${partIndex}`;
            const geometry = slotGeometry(part.geometry, slot);
            applyGroundTint(part.material);
            // Cards neither sway nor take the wind's per-instance tune: at a
            // card's distance the motion is sub-pixel, and it would fight the
            // billboard rotation that shares the same vertex seam.
            if (tier === TIER_NEAR || !card) applyWindSway(part.material, wind);
            // Order is load-bearing: the fade declares `esLodViewPos`, the
            // billboard reuses that declaration (see billboardQuad.ts).
            applyLodFade(part.material, lodFade);
            if (tier !== TIER_NEAR && card) {
              applyCylindricalBillboard(part.material, lodFade);
            }
            let mesh = meshPool.current.get(meshKey);
            if (!mesh || mesh.instanceMatrix.count < list.length) {
              // Grow by 1.5x so a ring that keeps creeping up by a few
              // instances does not reallocate on every rebuild.
              if (mesh) { group.remove(mesh); mesh.dispose(); }
              mesh = new THREE.InstancedMesh(
                geometry, part.material, Math.max(64, Math.ceil(list.length * 1.5)));
              mesh.frustumCulled = true;
              // Groundcover NEVER casts (module 65 §111 / research §4.2): tens
              // of thousands of alpha-tested casters would dominate the
              // cascades. Nor does it RECEIVE: alpha-tested double-sided cards
              // sampling two cascades is the most expensive thing this layer
              // could do, for a shadow nobody reads on a blade of grass.
              mesh.castShadow = false;
              mesh.receiveShadow = false;
              mesh.name = `groundcover-${plan.id}-t${tier}-q${quadrant}`;
              group.add(mesh);
              meshPool.current.set(meshKey, mesh);
            }
            const bands = bandAttribute(geometry, list.length);
            const bandArray = bands.array as Float32Array;
            for (let i = 0; i < list.length; i++) {
              const p = list[i];
              // One band per mesh — every instance in it crosses the same two
              // boundaries — but the attribute is per instance because that is
              // the channel the shared fade shader reads.
              bandArray[i * 4] = band[0];
              bandArray[i * 4 + 1] = band[1];
              bandArray[i * 4 + 2] = band[2];
              bandArray[i * 4 + 3] = band[3];
              position.set(p.x, p.y, p.z);
              quaternion.setFromAxisAngle(up, p.yaw);
              scale.setScalar(p.scale);
              mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
              mesh.setColorAt(i, colour.setRGB(p.r, p.g, p.b));
            }
            bands.needsUpdate = true;
            mesh.count = list.length;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            // A per-quadrant sphere is the whole point: computed from these
            // instances alone, it is a quarter-ring and can leave the frustum.
            mesh.computeBoundingSphere();
            liveMeshes.add(meshKey);
            const index = part.geometry.getIndex();
            triangles +=
              ((index ? index.count : part.geometry.attributes.position.count) / 3)
              * list.length;
          }
        }
      }
    }
    // Everything the pool holds that this rebuild did not fill draws nothing
    // — `count = 0` — but keeps its buffers for the next crossing.
    for (const [meshKey, mesh] of meshPool.current) {
      if (!liveMeshes.has(meshKey)) mesh.count = 0;
    }

    // The compiler-authored foundation band is separate from ordinary flora:
    // grass/fern exclusion still accounts for the full species radius, while
    // these small rubble pieces occupy only the explicitly exported outside
    // band and never appear beneath a building floor.
    // Filter the treatments BEFORE scattering them: `foundationScatterPoints`
    // walks a lattice over a whole building's band, and re-deriving every
    // settlement in the province per rebuild — to throw all but one away on
    // distance — was the single most expensive thing a tile crossing did.
    const scatter = foundationTreatments
      .filter((t) => nearTreatment(focus, t, farRadiusM))
      .flatMap(foundationScatterPoints)
      .filter((p) => Math.hypot(focus.x - p.x, focus.z - p.z) <= ringRadiusM)
      .filter((p) => !waterData || waterData.depthProxy(p.x, p.z) <= LAND_SPECIES_MAX_DEPTH_M);
    const groundedScatter = scatter.flatMap((point) => {
      const heightM = groundHeightM(store, chunks, point.x, point.z);
      return heightM === null ? [] : [{ point, heightM }];
    });
    const scatterScale = groundedScatter.length > MAX_FOUNDATION_SCATTER
      ? MAX_FOUNDATION_SCATTER / groundedScatter.length : 1;
    const visibleScatter = groundedScatter.filter(({ point }) => point.keep < scatterScale);
    const scatterMesh = foundationScatterMesh.current;
    if (scatterMesh && scatterMesh.instanceMatrix.count < visibleScatter.length) {
      group.remove(scatterMesh);
      scatterMesh.dispose();
      foundationScatterMesh.current = null;
    }
    if (visibleScatter.length) {
      const { geometry, material } = foundationParts;
      const mesh = foundationScatterMesh.current ?? new THREE.InstancedMesh(
        geometry, material, Math.max(64, Math.ceil(visibleScatter.length * 1.5)));
      for (let i = 0; i < visibleScatter.length; i++) {
        const { point: p, heightM } = visibleScatter[i];
        position.set(p.x, heightM * verticalScale + 0.06 * p.scale, p.z);
        quaternion.setFromAxisAngle(up, p.yaw);
        scale.set(p.scale * 1.35, p.scale * 0.55, p.scale);
        mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
      }
      mesh.count = visibleScatter.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = "foundation-scatter";
      if (!foundationScatterMesh.current) {
        group.add(mesh);
        foundationScatterMesh.current = mesh;
      }
      triangles += (geometry.getIndex()?.count ?? geometry.attributes.position.count)
        / 3 * visibleScatter.length;
    } else if (foundationScatterMesh.current) {
      foundationScatterMesh.current.count = 0;
    }

    const stats: GroundcoverStats = {
      instances,
      draws: liveMeshes.size + (visibleScatter.length ? 1 : 0),
      triangles: Math.round(triangles),
      tiles,
      byTier,
      tilesGenerated,
      cards: cards.size > 0,
      densityScale,
      rejected: rej,
      foundationScatterInstances: visibleScatter.length,
    };
    onStats?.(stats);
    if (import.meta.env.DEV) {
      // What a tile crossing actually costs, in the two units that matter.
      console.debug(
        "[groundcover] rebuild",
        `tiles ${tilesGenerated}/${tiles} generated`,
        `instances ${instances} (near ${byTier[0]} / mid ${byTier[1]} / far ${byTier[2]})`,
        `draws ${stats.draws}`,
        `pool ${meshPool.current.size}`,
        `cards ${cards.size}`,
      );
    }
    // Same convention as __STUDIO_VEGETATION_DEBUG__: probes read numbers.
    (window as unknown as { __STUDIO_GROUNDCOVER_DEBUG__?: GroundcoverStats })
      .__STUDIO_GROUNDCOVER_DEBUG__ = stats;
  }, [kit, cards, control, chunks, exclusions, foundationTreatments, clearanceIndex,
      regionRaster, tint, foundationParts, revision, verticalScale,
      onStats, focusRef, store, ringRadiusM, farRadiusM, maxInstances, wind,
      lodFade]);

  // The pool outlives every rebuild, so it is dropped once, on unmount.
  useEffect(() => () => {
    for (const mesh of meshPool.current.values()) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    meshPool.current.clear();
  }, []);

  // Anything the cached tiles were generated FROM invalidates them: a raster
  // arriving late, a new patch list, a different vertical scale. Without this
  // the first tiles placed before the region raster loaded would keep their
  // unswapped species for as long as the player stayed near them.
  useEffect(() => {
    tileCache.current.clear();
  }, [control, regionRaster, tint, chunks, exclusions, clearanceIndex,
      verticalScale, ringRadiusM]);

  return <group ref={root} name="groundcover" />;
}
