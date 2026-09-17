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
 *  2. **Fade is a band per species**, not one radius for all: anything under
 *     0.6 m tall is at full density to 30 m and gone by its own `fadeM` of
 *     50 m, taller species run to the ring radius. A 30 cm tuft at 60 m is a
 *     pixel that still costs a vertex.
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
/** Instances scale to zero over the last slice of their OWN fade distance,
 * so the species that stop at 50 m shrink out there rather than at the ring. */
const SCALE_FADE_FRACTION = 0.15;
/** Full density to here for species under `SHORT_SPECIES_M`, then thinned. */
const FULL_DENSITY_SHORT_M = 30;
/** …and to here for the taller ones, which run to the ring radius. */
const FULL_DENSITY_TALL_M = 55;
const SHORT_SPECIES_M = 0.6;
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
  positionJitterM: number;
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
  /** The species' own fade band. `fadeM` is authored per rule but is a
   * property of the MESH's height, so it is the same on every rule for a
   * species; the plan takes the widest, and the full-density distance from
   * the same height test the table used. */
  fadeM: number;
  fullDensityM: number;
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

if (TABLE.schemaVersion !== 3) {
  throw new Error(`groundcover.json schema ${TABLE.schemaVersion}, expected 3`);
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
            fadeM: 0,
            fullDensityM: FULL_DENSITY_TALL_M,
          };
          plans.set(rule.asset, plan);
        }
        plan.bySlot.set(slotKey(region, Number(coverId)), rule);
        plan.maxDensity = Math.max(plan.maxDensity, rule.density);
        plan.fadeM = Math.max(plan.fadeM, rule.fadeM);
        plan.fullDensityM = rule.heightM < SHORT_SPECIES_M
          ? FULL_DENSITY_SHORT_M : FULL_DENSITY_TALL_M;
        if (rule.waterRule === "below-at-least") plan.needsWater = true;
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
 * already there (the wind sway wraps this one in turn, and its CSM restore
 * carries it) and applied once per material.
 */
function applyGroundTint(material: THREE.Material): void {
  const flagged = material as THREE.Material & { esGroundTint?: boolean };
  if (flagged.esGroundTint) return;
  flagged.esGroundTint = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      #if defined( USE_INSTANCING_COLOR ) && !defined( USE_COLOR ) && !defined( USE_COLOR_ALPHA )
        diffuseColor.rgb *= vColor.rgb;
      #endif`,
    );
  };
  material.needsUpdate = true;
}

/** Fraction of a species' instances that survive at this distance. Full
 * density inside `fullDensityM`, then linear to zero at the species' own
 * `fadeM` — Bethesda's fade BAND and Unreal's per-variety cull distance. */
function distanceKeepFraction(distance: number, fadeM: number, fullM: number): number {
  if (distance <= fullM) return 1;
  if (distance >= fadeM) return 0;
  return (fadeM - distance) / (fadeM - fullM);
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

/** One cached instance. Everything here is focus-INDEPENDENT; the fade, the
 * quadrant and the budget are applied when the meshes are filled. */
interface TilePlacement {
  x: number; y: number; z: number; yaw: number;
  /** Height variance only — the distance scale fade is applied at fill. */
  scale: number;
  /** Stable roll for the budget thin. */
  keep: number;
  /** Stable roll for the distance thin, so a species thins out of the same
   * instances every frame instead of shimmering. */
  fadeRoll: number;
  /** Colour, already sampled from the ground tint and varied. */
  r: number; g: number; b: number;
}

export interface GroundcoverStats {
  instances: number;
  draws: number;
  triangles: number;
  tiles: number;
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
  const meshes = useRef<THREE.InstancedMesh[]>([]);
  const foundationScatterMesh = useRef<THREE.InstancedMesh | null>(null);
  const requested = useRef(new Set<number>());
  /** Per-tile cache (mechanism 1). A tile's instances do not depend on the
   * focus, so crossing a boundary regenerates only the tiles that entered the
   * ring and drops the ones that left. */
  const tileCache = useRef(new Map<number, TilePlacement[][]>());
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

  useFrame((state) => {
    const weather = lastWeatherSample();
    if (weather) updateWindSway(wind, state.clock.elapsedTime, weather);
    const focus = focusRef.current;
    // Ensure the chunks under the ring are decoding at LOD 1 (the store
    // dedups with the terrain's own requests); a decode arrival rebuilds.
    if (chunks) {
      // Runs every frame, so it allocates nothing: the four corner offsets are
      // a module constant and the seen-set is keyed by a packed integer rather
      // than by a freshly built `${cx},${cy}` string.
      for (let i = 0; i < CORNER_OFFSETS.length; i += 2) {
        const cx = Math.max(0, Math.min(chunks.grid[0] - 1,
          Math.floor((focus.x + CORNER_OFFSETS[i] * ringRadiusM) / chunks.chunkMetres)));
        const cy = Math.max(0, Math.min(chunks.grid[1] - 1,
          Math.floor((focus.z + CORNER_OFFSETS[i + 1] * ringRadiusM) / chunks.chunkMetres)));
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

    for (const mesh of meshes.current) {
      group.remove(mesh);
      mesh.dispose();
    }
    meshes.current = [];
    if (foundationScatterMesh.current) {
      // The geometry and material outlive the mesh now (one pair per
      // component), so only the instance buffer is dropped here.
      group.remove(foundationScatterMesh.current);
      foundationScatterMesh.current.dispose();
      foundationScatterMesh.current = null;
    }

    const focus = focusRef.current;
    const waterData = water.current;
    const tileHa = (TILE_M * TILE_M) / 10_000;
    const tileReach = Math.ceil(ringRadiusM / TILE_M);
    const [ftx, ftz] = focusTile.current;
    const cache = tileCache.current;

    // Pass one: make sure every tile touching the ring is in the cache.
    // Generation is PURE per tile — it never reads the focus — so a tile that
    // was already generated is reused verbatim and the cost of crossing a
    // boundary is one row of tiles, not the whole ring.
    let tiles = 0;
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
        if (nearest > ringRadiusM) continue;
        tiles++;
        const key = tileKey(tx, tz);
        live.add(key);
        if (cache.has(key)) continue;

        const perSpecies: TilePlacement[][] = SPECIES_PLANS.map(() => []);
        let incomplete = false;
        for (const plan of SPECIES_PLANS) {
          // Candidates on a jittered grid at the species' peak density —
          // Bethesda's GRAS placement model, jitter amplitude as authored.
          const candidates = plan.maxDensity * tileHa;
          const g = Math.max(1, Math.ceil(Math.sqrt(candidates)));
          const cell = TILE_M / g;
          const keepP = candidates / (g * g);
          // Position must exist before the cover under it can be sampled, so
          // the jitter amplitude is the plan's first rule's (they differ by
          // ≤0.15 m across covers — well under a texel).
          const jitterM = plan.anyRule.positionJitterM;
          for (let k = 0; k < g * g; k++) {
            if (u01(hash32(tx, tz, plan.index, k * 8)) >= keepP) { rej.keep++; continue; }
            const jx = (u01(hash32(tx, tz, plan.index, k * 8 + 1)) - 0.5) * 2;
            const jz = (u01(hash32(tx, tz, plan.index, k * 8 + 2)) - 0.5) * 2;
            const x = tx * TILE_M + ((k % g) + 0.5) * cell + jx * jitterM;
            const z = tz * TILE_M + (Math.floor(k / g) + 0.5) * cell + jz * jitterM;

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
              fadeRoll: u01(hash32(tx, tz, plan.index, k * 8 + 2)),
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
        if (!incomplete) cache.set(key, perSpecies);
      }
    }
    // Evict what left the ring. Without this the cache is the whole province.
    for (const key of cache.keys()) if (!live.has(key)) cache.delete(key);

    // Pass two: fade, quadrant and budget — everything the focus decides.
    // Quadrants (mechanism 5) are the four sectors around the focus; each gets
    // its own mesh with its own tight bounding sphere, so frustum culling
    // actually rejects instead of always seeing a 150 m mesh.
    const visible: TilePlacement[][][] = SPECIES_PLANS.map(() => [[], [], [], []]);
    let total = 0;
    for (const key of live) {
      const perSpecies = cache.get(key);
      if (!perSpecies) continue;
      for (const plan of SPECIES_PLANS) {
        const list = perSpecies[plan.index];
        if (list.length === 0) continue;
        const bucket = visible[plan.index];
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const distance = Math.hypot(focus.x - item.x, focus.z - item.z);
          if (distance > ringRadiusM) continue;
          // Mechanism 2: the species thins over ITS band, not the ring's.
          const fadeM = Math.min(plan.fadeM, ringRadiusM);
          const keepFraction = distanceKeepFraction(distance, fadeM, plan.fullDensityM);
          if (keepFraction <= 0 || item.fadeRoll >= keepFraction) continue;
          bucket[(item.x >= focus.x ? 1 : 0) + (item.z >= focus.z ? 2 : 0)].push(item);
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
    for (const plan of SPECIES_PLANS) {
      const entry = kit.get(plan.id);
      if (!entry) continue; // species missing from the kit: skip, never throw
      const fadeM = Math.min(plan.fadeM, ringRadiusM);
      const scaleFadeStartM = fadeM * (1 - SCALE_FADE_FRACTION);
      for (let quadrant = 0; quadrant < 4; quadrant++) {
        const list = densityScale < 1
          ? visible[plan.index][quadrant].filter((p) => p.keep < densityScale)
          : visible[plan.index][quadrant];
        if (list.length === 0) continue;
        instances += list.length;
        for (const part of entry.levels[0].parts) {
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length);
          mesh.frustumCulled = true;
          // Groundcover NEVER casts (module 65 §111 / research §4.2): tens of
          // thousands of alpha-tested casters would dominate the cascades.
          // Nor does it RECEIVE: alpha-tested double-sided cards sampling two
          // cascades is the most expensive thing this layer could do, for a
          // shadow nobody reads on a blade of grass.
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          applyGroundTint(part.material);
          applyWindSway(part.material, wind);
          for (let i = 0; i < list.length; i++) {
            const p = list[i];
            const distance = Math.hypot(focus.x - p.x, focus.z - p.z);
            const shrink = distance <= scaleFadeStartM ? 1
              : Math.max(0, 1 - (distance - scaleFadeStartM) / (fadeM - scaleFadeStartM));
            position.set(p.x, p.y, p.z);
            quaternion.setFromAxisAngle(up, p.yaw);
            scale.setScalar(p.scale * shrink);
            mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
            mesh.setColorAt(i, colour.setRGB(p.r, p.g, p.b));
          }
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          // A per-quadrant sphere is the whole point: computed from these
          // instances alone, it is a quarter-ring and can leave the frustum.
          mesh.computeBoundingSphere();
          group.add(mesh);
          meshes.current.push(mesh);
          const index = part.geometry.getIndex();
          triangles +=
            ((index ? index.count : part.geometry.attributes.position.count) / 3) * list.length;
        }
      }
    }

    // The compiler-authored foundation band is separate from ordinary flora:
    // grass/fern exclusion still accounts for the full species radius, while
    // these small rubble pieces occupy only the explicitly exported outside
    // band and never appear beneath a building floor.
    const scatter = foundationTreatments
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
    if (visibleScatter.length) {
      const { geometry, material } = foundationParts;
      const mesh = new THREE.InstancedMesh(geometry, material, visibleScatter.length);
      for (let i = 0; i < visibleScatter.length; i++) {
        const { point: p, heightM } = visibleScatter[i];
        position.set(p.x, heightM * verticalScale + 0.06 * p.scale, p.z);
        quaternion.setFromAxisAngle(up, p.yaw);
        scale.set(p.scale * 1.35, p.scale * 0.55, p.scale);
        mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = "foundation-scatter";
      group.add(mesh);
      foundationScatterMesh.current = mesh;
      triangles += (geometry.getIndex()?.count ?? geometry.attributes.position.count)
        / 3 * visibleScatter.length;
    }

    const stats: GroundcoverStats = {
      instances,
      draws: meshes.current.length + (foundationScatterMesh.current ? 1 : 0),
      triangles: Math.round(triangles),
      tiles,
      densityScale,
      rejected: rej,
      foundationScatterInstances: visibleScatter.length,
    };
    onStats?.(stats);
    // Same convention as __STUDIO_VEGETATION_DEBUG__: probes read numbers.
    (window as unknown as { __STUDIO_GROUNDCOVER_DEBUG__?: GroundcoverStats })
      .__STUDIO_GROUNDCOVER_DEBUG__ = stats;
  }, [kit, control, chunks, exclusions, foundationTreatments, clearanceIndex,
      regionRaster, tint, foundationParts, revision, verticalScale,
      onStats, focusRef, store, ringRadiusM, maxInstances, wind]);

  // Anything the cached tiles were generated FROM invalidates them: a raster
  // arriving late, a new patch list, a different vertical scale. Without this
  // the first tiles placed before the region raster loaded would keep their
  // unswapped species for as long as the player stayed near them.
  useEffect(() => {
    tileCache.current.clear();
  }, [control, regionRaster, tint, chunks, exclusions, clearanceIndex,
      verticalScale]);

  return <group ref={root} name="groundcover" />;
}
