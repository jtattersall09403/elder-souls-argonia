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
 *     every boundary a HARD step (owner 2026-09-21: "jump between rungs, no
 *     gradual fade"; the ring's own far radius steps too). Nothing the
 *     ring places ever winks out. **Tier membership is decided per TILE with
 *     an overlap margin, never per instance at rebuild time** (owner, 16f
 *     round 3): a plant is in every tier's buffer it could reach before the
 *     next rebuild, and the shader — which measures the live camera distance
 *     every frame — does all the fading, in both directions. The old
 *     one-tier-per-instance assignment made a plant fade OUT as the camera
 *     walked towards it (its card copy crossed the band's inner edge and no
 *     mesh copy existed yet), then reappear all at once at the next rebuild.
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
 *  7. **Persistent meshes, block-copied.** The (species, tier, quadrant)
 *     meshes live for the component's life and grow their buffers by 1.5x
 *     when a rebuild needs more room. Every tile's instance matrices and
 *     colours are composed ONCE when the tile is generated and stored as
 *     typed arrays, so a rebuild is a handful of `array.set` copies per mesh
 *     rather than a compose per instance; the bounding sphere comes from the
 *     tile extents, never from reading the matrices back. That is what makes
 *     an 8 m rebuild cadence affordable, and the cadence is what keeps the
 *     overlap margin (and so the collapsed near-mesh copies) small.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { configureKitLoader } from "@elder-souls/game-core/assets/kitLoader";
import { useKitDecoders } from "@elder-souls/game-core/assets/useKitDecoders";
import {
  buildFloraKit,
  type FloraKit,
  type KitLevel,
  type KitManifest,
  type KitSpecies,
} from "./floraKit";
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
import { hash32, latticeValue, u01 } from "@elder-souls/game-core/vegetation/ringHash";
import {
  indexPatches,
  patchEntriesNear,
  survivesPatchesIn,
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
 * Every tier carries an `esLodBand` (`lodFade.ts`); since 2026-09-21 its
 * half-widths are 0, so each boundary is a hard step from one tier to the
 * next and the FAR band ends at its radius.
 */
const NEAR_FRACTION = 0.4;
/**
 * The full-mesh reach is proportional to what the mesh COSTS.
 *
 * `0.4 r` for every species spent the same 30 m of full mesh on a 250-triangle
 * grass clump and on a 2 298-triangle spiky-grass tuft at 12 144 per hectare —
 * measured at rest in the jungle, 2.4 M triangles for 61 376 instances, 39 a
 * plant. So the NEAR band is scaled per species by the reference cost over the
 * mesh's own cost, floored so an expensive plant still has SOME mesh near the
 * camera, and the card simply takes over where the mesh stops.
 *
 *  - `NEAR_TRI_REF` — a typical grass clump (the drjacopo grasses, 250–390):
 *    full reach, the behaviour before this rule.
 *  - `NEAR_REACH_MIN` — the floor; 0.25 x 0.4 r is 7.5 m at the high preset.
 *    No species is ever card-only: a heavy mesh keeps its mesh this close in.
 *  - `NEAR_TRI_MAX` — the cap for CHOOSING a decimated level: a species uses
 *    the coarsest level at or under it where the kit ships one (and that
 *    level's own triangle count then sets the reach), otherwise level 0.
 */
const NEAR_TRI_REF = 250;
const NEAR_REACH_MIN = 0.25;
const NEAR_TRI_MAX = 1000;

/** The NEAR band's fraction of `NEAR_FRACTION x r` for a mesh of `meshTris`. */
export function nearReachFraction(meshTris: number): number {
  if (!(meshTris > 0)) return 1;
  return Math.min(1, Math.max(NEAR_REACH_MIN, NEAR_TRI_REF / meshTris));
}

function partsTriangles(parts: readonly { geometry: THREE.BufferGeometry }[]): number {
  let total = 0;
  for (const part of parts) {
    const index = part.geometry.getIndex();
    total += (index ? index.count : part.geometry.attributes.position.count) / 3;
  }
  return total;
}

/**
 * The mesh level the NEAR tier draws: the COARSEST non-billboard level whose
 * triangle count is at or under `NEAR_TRI_MAX`, falling back to level 0 where
 * every level is over the cap — every species has a NEAR mesh tier.
 */
function nearMeshLevel(entry: KitSpecies): { parts: KitLevel["parts"]; tris: number } {
  for (let level = entry.levels.length - 1; level >= 0; level--) {
    if (level === entry.billboardIndex) continue;
    const parts = entry.levels[level].parts;
    const tris = partsTriangles(parts);
    if (tris <= NEAR_TRI_MAX) return { parts, tris };
  }
  const parts = entry.levels[0].parts;
  return { parts, tris: partsTriangles(parts) };
}

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
/** Edge half-widths, metres: (in, out) per tier. ALL ZERO from 2026-09-21
 * (owner: "jump between rungs, no gradual fade" — decision 0075 addendum): a
 * tier edge is a hard step, `esLodRamp` degenerating to `step()`, and the
 * partition between the outgoing and incoming copy stays exact. The shape is
 * kept so a half-width can be restored per tier without touching the band
 * arithmetic below. The tile overlap margin is NOT derived from these: it
 * comes from the rebuild cadence (`TIER_OVERLAP_M`). */
const TIER_BAND_M: [number, number][] = [[0, 0], [0, 0], [0, 0]];
/** Metres of focus movement between rebuilds. A tile crossing also rebuilds
 * (that is when tiles are generated); this is the finer cadence the tier
 * overlap is sized from. */
const REBUILD_MOVE_M = 8;
/** A tile joins a tier's buffer when its nearest point is within the tier's
 * outer radius PLUS this margin: the furthest the focus can move before the
 * next rebuild, plus a slack so the incoming copy is always in the buffer
 * (collapsed to nothing by the shader) before the camera reaches its edge.
 * Both copies of a crossing plant exist at the moment of the hand-over, which
 * is the whole point. Derived from the rebuild cadence, never from
 * `TIER_BAND_M` — the edges are hard steps and have no width. */
const TIER_EDGE_SLACK_M = 6;
const TIER_OVERLAP_M = REBUILD_MOVE_M + TIER_EDGE_SLACK_M;
/** Main-thread budget per frame for generating tiles (ms). A row of ~22
 * tiles entering the ring used to be generated in one go inside the rebuild
 * effect — ~18 ms a tile, half a second of stall every 16 m of walking,
 * which was the "stutter" the owner felt. Generation now runs in `useFrame`
 * nearest-tile-first within this budget, and a fill is requested when the
 * queue drains (or every FILL_INTERVAL_S while it is long); the overlap
 * margin hides the tiles still in the queue at the ring's edge. */
const GENERATE_BUDGET_MS = 5;
/** Tiles generated in ONE call, however much of the budget is left: the
 * budget is only checked BETWEEN tiles, and a single tile beside a road-track
 * clearance was measured at 110-555 ms on the owner's GPU (2026-09-21). */
const GENERATE_MAX_TILES_PER_CALL = 8;
const EMPTY_PATCHES: readonly IndexedPatch[] = [];
/** While more than this many tiles are still wanted (a spawn, a teleport,
 * a raster arriving), the budget rises to GENERATE_BUDGET_COLD_MS so the ring
 * fills in a second or two instead of creeping outward for ten. */
const GENERATE_COLD_TILES = 40;
const GENERATE_BUDGET_COLD_MS = 14;
const FILL_INTERVAL_S = 0.25;
/** Metres between the per-tile ground samples (height, slope, water depth).
 * The terrain the ring re-grounds on is 1.83 m per sample, so a 2 m grid
 * loses nothing a plant can show; it replaces three height reads and a
 * water read PER CANDIDATE with one bilinear read each. */
const TILE_GRID_M = 2;
const TILE_GRID_N = TILE_M / TILE_GRID_M + 1; // 9 samples per axis
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
/** An axis-aligned box in world metres. */
export interface MaskBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Cell size of the per-tile mask, metres. Building footprints and clearance
 * corridors are metres wide, so a 1 m cell resolves them; the mask is only a
 * REJECT filter, never the answer, so its resolution costs no accuracy. */
export const MASK_CELL_M = 1;
export const MASK_N = TILE_M / MASK_CELL_M;
/** Bit 0: a building footprint may reach this cell. Bit 1: a clearance patch
 * may. A cell with neither bit cannot fail either test for any candidate in
 * it, so both are skipped outright. */
export const MASK_EXCLUDE = 1;
export const MASK_PATCH = 2;

/** Distance from a point to an axis-aligned box, 0 inside it. */
function boxDistance(x: number, z: number, b: MaskBox): number {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

/**
 * Rasterise a tile's footprint boxes and clearance-patch bounds into a cell
 * mask, ONCE per tile, so the per-candidate tests become one array index
 * instead of a polygon walk each (2026-09-21: one tile beside a road-track
 * clearance was measured at 31 ms while walking).
 *
 * The mask is CONSERVATIVE and therefore exact: a cell is marked whenever a
 * shape's bounding box comes within `reachM` of the cell centre, where
 * `reachM` is the cell's half-diagonal plus the widest species radius — the
 * furthest any candidate in the cell can reach out of it. A marked cell still
 * runs the full `excludedByFootprints` / `survivesPatchesIn` test, so no
 * plant moves; an unmarked cell provably fails neither, so the test is
 * skipped. Rotated boxes and polygons need no special case: it is their
 * bounding box that is rasterised, never the shape.
 *
 * `out` is the caller's reused buffer (`MASK_N x MASK_N`), filled in place.
 */
export function rasteriseTileMask(
  out: Uint8Array,
  x0: number,
  z0: number,
  reachM: number,
  exclusionBounds: readonly MaskBox[],
  patchBounds: readonly MaskBox[],
): void {
  out.fill(0);
  if (exclusionBounds.length === 0 && patchBounds.length === 0) return;
  const reach = reachM + MASK_CELL_M * Math.SQRT1_2;
  for (let iz = 0; iz < MASK_N; iz++) {
    const cz = z0 + (iz + 0.5) * MASK_CELL_M;
    for (let ix = 0; ix < MASK_N; ix++) {
      const cx = x0 + (ix + 0.5) * MASK_CELL_M;
      let flags = 0;
      for (const b of exclusionBounds) {
        if (boxDistance(cx, cz, b) <= reach) { flags |= MASK_EXCLUDE; break; }
      }
      for (const b of patchBounds) {
        if (boxDistance(cx, cz, b) <= reach) { flags |= MASK_PATCH; break; }
      }
      out[iz * MASK_N + ix] = flags;
    }
  }
}

/** The mask cell holding a point at tile-local metres. */
export function maskCellIndex(lx: number, lz: number): number {
  const ix = Math.min(MASK_N - 1, Math.max(0, Math.floor(lx / MASK_CELL_M)));
  const iz = Math.min(MASK_N - 1, Math.max(0, Math.floor(lz / MASK_CELL_M)));
  return iz * MASK_N + ix;
}

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

/** Distance from the focus to the nearest point of a tile, so edge tiles
 * still count while any part of them is inside a radius. */
function tileNearestM(focus: { x: number; z: number }, tx: number, tz: number): number {
  const centreX = (tx + 0.5) * TILE_M;
  const centreZ = (tz + 0.5) * TILE_M;
  return Math.hypot(
    Math.max(0, Math.abs(focus.x - centreX) - TILE_M / 2),
    Math.max(0, Math.abs(focus.z - centreZ) - TILE_M / 2),
  );
}

/**
 * A generated tile. `far` marks a tile generated at FAR density (the keep
 * roll thinned on the candidate lattice up front, so a tile nobody will see
 * in detail costs 35 % of the work). It is regenerated in full the moment it
 * enters the MID band.
 *
 * Per species the tile holds its instances as READY-TO-COPY typed arrays:
 * `matrices` (16 floats each) and `colours` (3 floats each), ordered so that
 * the far subset (`farKeep < FAR_THIN`) comes first — `farCount` of them —
 * and each of the two blocks is sorted by the `keep` roll. The FAR tier
 * copies the first block; NEAR and MID copy both; a budget thin takes a
 * prefix of each block, which is the lowest-`keep` subset and so the same
 * plants rebuild after rebuild.
 */
interface CachedTile {
  far: boolean;
  perSpecies: TileSpecies[];
  /** World-space extents of the tile's ground, for bounding spheres. */
  minY: number;
  maxY: number;
}

interface TileSpecies {
  count: number;
  farCount: number;
  matrices: Float32Array;
  colours: Float32Array;
}

const EMPTY_TILE_SPECIES: TileSpecies = {
  count: 0, farCount: 0, matrices: new Float32Array(0), colours: new Float32Array(0),
};

/** Floats per candidate in the per-species scratch array while a tile is
 * being generated: x, y, z, yaw, scale, keep, farKeep, r, g, b. Candidates
 * were objects until 2026-09-21; a dense tile allocated a thousand of them
 * only to compose and drop them in the same call. */
const PLACEMENT_STRIDE = 10;

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
  /** Main-thread cost: tile generation since the last fill (spread over
   * frames within GENERATE_BUDGET_MS each) and this fill. */
  rebuildMs: { generate: number; fill: number };
  /** DEV per-frame instrumentation (no behaviour), republished every frame on
   * `__STUDIO_GROUNDCOVER_DEBUG__` so the HUD can poll it. */
  perf?: GroundcoverPerf;
}

/** Per-frame groundcover counters (DEV only). `fillMs`/`fillInstances` are
 * the MOST RECENT fill, which happens on a fraction of frames; the max fields
 * are over the last 120 frames. */
export interface GroundcoverPerf {
  frame: number;
  rebuildsStarted: number;
  rebuildsPerSec: number;
  generateMs: number;
  generateMaxMs: number;
  /** The last SINGLE tile's generation cost and the worst seen, ms. The 5 ms
   * budget is only checked between tiles, so one slow tile is the hitch. */
  tileMs: number;
  tileMaxMs: number;
  /** The tile generator split by phase, MAX ms over the same window as
   * `tileMaxMs`: the grid sampling, the mask rasteriser, the candidate loop
   * and the typed-array composition. `phaseExact` is the worst tile's count
   * of candidates that ran the exact footprint/patch test (the ones the cell
   * mask could not reject). */
  phaseGridMaxMs: number;
  phaseMaskMaxMs: number;
  phaseCandMaxMs: number;
  phaseComposeMaxMs: number;
  phaseExact: number;
  fillMs: number;
  fillMaxMs: number;
  fillInstances: number;
  tilesLive: number;
  tilesPending: number;
  /** Triangles of the NEAR-tier (full-mesh) instances currently live:
   * instances x their mesh's triangles, summed at the last rebuild. The HUD's
   * `mesh <n>M` — what the per-species reach rule cut. */
  nearMeshTriangles: number;
}

/**
 * A/B switch (DEV only, `?gc=0`), read once at module load: the ground-cover
 * renderer is not MOUNTED at all, so the HUD line shows what the frame costs
 * without it — the same measurement `?veg=0` makes for the tree/bush renderer.
 */
export const GROUNDCOVER_ENABLED: boolean = (() => {
  if (!import.meta.env.DEV || typeof window === "undefined") return true;
  return new URLSearchParams(window.location.search).get("gc") !== "0";
})();

export function Groundcover({
  focusRef,
  baseUrl,
  verticalScale = 1,
  onStats,
  quality,
  settlementsVisible = false,
}: {
  /** Same shape the chunk terrain uses: ground position, not a camera. */
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  baseUrl: string;
  verticalScale?: number;
  onStats?: (stats: GroundcoverStats) => void;
  quality?: QualitySettings;
  /** Whether the ladder shows the settlement layer; the footprint bundle is
   * fetched only then. */
  settlementsVisible?: boolean;
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
  /** Focus of the last rebuild REQUESTED (the 8 m cadence measures from it). */
  const lastBuildFocus = useRef<{ x: number; z: number } | null>(null);
  /** True while tiles in the ring may still need generating. */
  const genPending = useRef(true);
  const lastFillTime = useRef(0);
  const generatedSinceFill = useRef(0);
  const coldStart = useRef(true);
  /** Generation counters since the last fill, reported by the fill. */
  const genStats = useRef({ generated: 0, ms: 0, tileMs: 0, tileMaxMs: 0, rejected: { keep: 0, bare: 0, accept: 0, footprint: 0, patch: 0, height: 0, slope: 0, water: 0 } });
  /** Set once the inputs exist; `useFrame` calls it with a time budget. */
  const generateRef = useRef<((budgetMs: number) => { generated: number; remaining: number }) | null>(null);
  const [revision, setRevision] = useState(0);
  /** DEV instrumentation only: nothing here is read by the renderer. */
  const perf = useRef<GroundcoverPerf>({
    frame: 0, rebuildsStarted: 0, rebuildsPerSec: 0,
    generateMs: 0, generateMaxMs: 0, tileMs: 0, tileMaxMs: 0,
    phaseGridMaxMs: 0, phaseMaskMaxMs: 0, phaseCandMaxMs: 0, phaseComposeMaxMs: 0,
    phaseExact: 0,
    fillMs: 0, fillMaxMs: 0,
    fillInstances: 0, tilesLive: 0, tilesPending: 0, nearMeshTriangles: 0,
  });
  /** Worst per-tile phase cost since the last window reset (DEV only). One
   * reused object: the generator writes maxima into it, never allocates. */
  const phaseMax = useRef({ grid: 0, mask: 0, cand: 0, compose: 0, exact: 0 });
  /** Timestamps of the rebuilds in the last second, for `rebuildsPerSec`. */
  const rebuildTimes = useRef<number[]>([]);
  const maxWindowFrame = useRef(0);

  const decoders = useKitDecoders(baseUrl);
  const gltf = useLoader(GLTFLoader, `${baseUrl}kits/groundcover-province-v1.glb`,
    (loader) => configureKitLoader(loader, decoders));

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

  // The settlement bundle (10 MB) feeds only the building footprints the
  // grass keeps out of and their foundation scatter bands. While the ladder
  // hides the settlement layer (16f) there is nothing to keep out of, so the
  // fetch waits for the layer to be shown (16f round 4: it was 9.7 MB of
  // pure waste on every start-up).
  useEffect(() => {
    if (!settlementsVisible) return;
    let cancelled = false;
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
    return () => { cancelled = true; };
  }, [baseUrl, settlementsVisible]);

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
    const moved = lastBuildFocus.current
      ? Math.hypot(focus.x - lastBuildFocus.current.x, focus.z - lastBuildFocus.current.z)
      : Infinity;
    let fill = false;
    if (tx !== focusTile.current[0] || tz !== focusTile.current[1]) {
      focusTile.current = [tx, tz];
      genPending.current = true;
    }
    if (moved >= REBUILD_MOVE_M) fill = true;
    // Generate a few tiles a frame, nearest first, inside the budget; ask
    // for a fill when the queue drains or has been draining for a while.
    const p = perf.current;
    p.frame++;
    if (p.frame - maxWindowFrame.current >= 120) {
      maxWindowFrame.current = p.frame;
      p.generateMaxMs = 0;
      p.tileMaxMs = 0;
      genStats.current.tileMaxMs = 0;
      const pm = phaseMax.current;
      pm.grid = 0; pm.mask = 0; pm.cand = 0; pm.compose = 0; pm.exact = 0;
      p.fillMaxMs = 0;
    }
    p.generateMs = 0;
    let pendingTiles = 0;
    if (genPending.current && generateRef.current) {
      const tGen0 = performance.now();
      const { generated, remaining } = generateRef.current(
        coldStart.current ? GENERATE_BUDGET_COLD_MS : GENERATE_BUDGET_MS);
      p.generateMs = Math.round((performance.now() - tGen0) * 10) / 10;
      p.tileMs = Math.round(genStats.current.tileMs * 10) / 10;
      p.tileMaxMs = Math.round(genStats.current.tileMaxMs * 10) / 10;
      const pm = phaseMax.current;
      p.phaseGridMaxMs = Math.round(pm.grid * 10) / 10;
      p.phaseMaskMaxMs = Math.round(pm.mask * 10) / 10;
      p.phaseCandMaxMs = Math.round(pm.cand * 10) / 10;
      p.phaseComposeMaxMs = Math.round(pm.compose * 10) / 10;
      p.phaseExact = pm.exact;
      if (p.generateMs > p.generateMaxMs) p.generateMaxMs = p.generateMs;
      pendingTiles = remaining;
      coldStart.current = remaining > GENERATE_COLD_TILES;
      generatedSinceFill.current += generated;
      if (remaining === 0) genPending.current = false;
      if (generatedSinceFill.current > 0
          && (remaining === 0 || state.clock.elapsedTime - lastFillTime.current > FILL_INTERVAL_S)) {
        fill = true;
      }
    }
    p.tilesPending = pendingTiles + generatedSinceFill.current;
    if (fill) {
      lastBuildFocus.current = { x: focus.x, z: focus.z };
      lastFillTime.current = state.clock.elapsedTime;
      generatedSinceFill.current = 0;
      setRevision((r) => r + 1);
      p.rebuildsStarted++;
      const now = performance.now();
      rebuildTimes.current.push(now);
      while (rebuildTimes.current.length && now - rebuildTimes.current[0] > 1000) {
        rebuildTimes.current.shift();
      }
    } else {
      const now = performance.now();
      while (rebuildTimes.current.length && now - rebuildTimes.current[0] > 1000) {
        rebuildTimes.current.shift();
      }
    }
    p.rebuildsPerSec = rebuildTimes.current.length;
    if (import.meta.env.DEV) {
      const host = window as unknown as { __STUDIO_GROUNDCOVER_DEBUG__?: GroundcoverStats };
      if (host.__STUDIO_GROUNDCOVER_DEBUG__) host.__STUDIO_GROUNDCOVER_DEBUG__.perf = p;
      else host.__STUDIO_GROUNDCOVER_DEBUG__ = { perf: p } as unknown as GroundcoverStats;
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
    // Tiles are kept out to the far radius PLUS the overlap, so the FAR tier
    // of a tile about to enter view is already drawn (faded to nothing).
    const keepRadiusM = farRadiusM + TIER_OVERLAP_M;
    const tileReach = Math.ceil(keepRadiusM / TILE_M);
    const [ftx, ftz] = focusTile.current;
    const cache = tileCache.current;
    const stats0 = genStats.current;
    genStats.current = { generated: 0, ms: 0, tileMs: stats0.tileMs, tileMaxMs: stats0.tileMaxMs, rejected: { keep: 0, bare: 0, accept: 0, footprint: 0, patch: 0, height: 0, slope: 0, water: 0 } };
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // Pass one is no longer here: tiles are generated in `useFrame` within a
    // per-frame budget (`generateTiles`, nearest first) and this effect fills
    // the meshes from whatever the cache holds. A tile still in the queue is
    // at the ring's edge, inside the overlap margin, where the shader draws
    // it faded to nothing anyway.
    let tiles = 0;
    const live: { key: number; nearest: number; tx: number; tz: number }[] = [];
    const liveKeys = new Set<number>();
    for (let tz = ftz - tileReach; tz <= ftz + tileReach; tz++) {
      for (let tx = ftx - tileReach; tx <= ftx + tileReach; tx++) {
        const nearest = tileNearestM(focus, tx, tz);
        if (nearest > keepRadiusM) continue;
        tiles++;
        const key = tileKey(tx, tz);
        live.push({ key, nearest, tx, tz });
        liveKeys.add(key);
      }
    }
    const tilesGenerated = stats0.generated;
    const rej = stats0.rejected;
    // Evict what left the ring. Without this the cache is the whole province.
    for (const key of cache.keys()) if (!liveKeys.has(key)) cache.delete(key);
    const tGenerated = performance.now();

    // Pass two: tier membership per TILE, with the overlap, per species.
    // A tile is copied into every tier whose outer radius (plus the overlap)
    // its nearest point is within; the shader collapses the copies that are
    // outside their band this frame and dissolves the ones crossing it. The
    // quadrant is the tile centre's, so each mesh keeps a tight sphere that
    // can leave the frustum.
    const nearRadiusM = ringRadiusM * NEAR_FRACTION;
    const shortFarRadiusM = farRadiusM * SHORT_FAR_FRACTION;
    // The NEAR tier's mesh and its reach, per species, decided ONCE and used
    // by both the tile assignment below and the band/fill pass after it, so
    // the card takes over exactly where the mesh stops. A species with no card
    // (the kit before the billboard levels landed) keeps the full mesh at full
    // reach: there is nothing to hand over to.
    const nearPlans = SPECIES_PLANS.map((plan) => {
      const entry = kit.get(plan.id);
      if (!entry) return null;
      if (!cards.has(plan.id)) {
        const parts = entry.levels[0].parts;
        return { parts, reach: 1 };
      }
      const level = nearMeshLevel(entry);
      return { parts: level.parts, reach: nearReachFraction(level.tris) };
    });
    interface SlotTiles { tiles: { species: TileSpecies; far: boolean; tx: number; tz: number; minY: number; maxY: number }[]; count: number }
    const slots: SlotTiles[][] = SPECIES_PLANS.map(
      () => Array.from({ length: TIER_COUNT * 4 }, () => ({ tiles: [], count: 0 })));
    let total = 0;
    for (const entry of live) {
      const tile = cache.get(entry.key);
      if (!tile) continue;
      const centreX = (entry.tx + 0.5) * TILE_M;
      const centreZ = (entry.tz + 0.5) * TILE_M;
      const quadrant = (centreX >= focus.x ? 1 : 0) + (centreZ >= focus.z ? 2 : 0);
      for (const plan of SPECIES_PLANS) {
        const species = tile.perSpecies[plan.index];
        if (species.count === 0) continue;
        const radiusScale = plan.submerged ? SUBMERGED_RADIUS_SCALE : 1;
        const speciesFarM = (plan.short ? shortFarRadiusM : farRadiusM) * radiusScale;
        const nearPlan = nearPlans[plan.index];
        const speciesNearM = nearRadiusM * radiusScale * (nearPlan?.reach ?? 0);
        const speciesMidM = ringRadiusM * radiusScale;
        const inNear = nearPlan !== null
          && entry.nearest <= speciesNearM + TIER_OVERLAP_M;
        const inMid = entry.nearest <= speciesMidM + TIER_OVERLAP_M;
        const inFar = entry.nearest <= speciesFarM + TIER_OVERLAP_M;
        const bucket = slots[plan.index];
        const record = { species, far: false, tx: entry.tx, tz: entry.tz, minY: tile.minY, maxY: tile.maxY };
        if (inNear) { bucket[TIER_NEAR * 4 + quadrant].tiles.push(record); bucket[TIER_NEAR * 4 + quadrant].count += species.count; }
        if (inMid) { bucket[TIER_MID * 4 + quadrant].tiles.push(record); bucket[TIER_MID * 4 + quadrant].count += species.count; }
        if (inFar) {
          const farRecord = { ...record, far: true };
          bucket[TIER_FAR * 4 + quadrant].tiles.push(farRecord);
          bucket[TIER_FAR * 4 + quadrant].count += species.farCount;
        }
        // The budget counts PLANTS, not copies: a tile inside the mid band is
        // its whole list once (its extra tier copies are the overlap cost the
        // shader collapses), a far tile its thinned subset.
        total += inMid ? species.count : (inFar ? species.farCount : 0);
      }
    }

    // Pass three: budget guard — thin every species by the same factor. The
    // thin is a prefix of each tile block (sorted by `keep`), so the same
    // plants survive from one rebuild to the next.
    const densityScale = total > maxInstances ? maxInstances / total : 1;

    let instances = 0;
    let triangles = 0;
    /** Triangles the NEAR (mesh) tier contributes — the number the reach rule
     * above exists to cut. Summed at rebuild time, not per frame. */
    let nearMeshTriangles = 0;
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
      const nearPlan = nearPlans[plan.index];
      const speciesNearM = nearRadiusM * radiusScale * (nearPlan?.reach ?? 0);
      const speciesMidM = ringRadiusM * radiusScale;
      const tierBands: [number, number, number, number][] = [
        [0, speciesNearM, TIER_BAND_M[0][0], TIER_BAND_M[0][1]],
        [speciesNearM, speciesMidM, TIER_BAND_M[1][0], TIER_BAND_M[1][1]],
        [speciesMidM, speciesFarM, TIER_BAND_M[2][0], TIER_BAND_M[2][1]],
      ];
      const speciesHeightM = plan.anyRule.heightM * (1 + plan.anyRule.heightVariance) * 1.5;
      for (let tier = 0; tier < TIER_COUNT; tier++) {
        if (tier === TIER_NEAR && !nearPlan) continue;
        const parts = tier === TIER_NEAR
          ? nearPlan!.parts
          : (card ? [card] : entry.levels[0].parts);
        const band = tierBands[tier];
        for (let quadrant = 0; quadrant < 4; quadrant++) {
          const slot = tier * 4 + quadrant;
          const slotTiles = slots[plan.index][slot];
          if (slotTiles.count === 0) continue;
          // Count after the budget thin (a prefix per block).
          let drawn = 0;
          let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
          let minY = Infinity; let maxY = -Infinity;
          for (const t of slotTiles.tiles) {
            const sp = t.species;
            const farN = Math.ceil(sp.farCount * densityScale);
            const restN = t.far ? 0 : Math.ceil((sp.count - sp.farCount) * densityScale);
            drawn += farN + restN;
            if (t.tx * TILE_M < minX) minX = t.tx * TILE_M;
            if ((t.tx + 1) * TILE_M > maxX) maxX = (t.tx + 1) * TILE_M;
            if (t.tz * TILE_M < minZ) minZ = t.tz * TILE_M;
            if ((t.tz + 1) * TILE_M > maxZ) maxZ = (t.tz + 1) * TILE_M;
            if (t.minY < minY) minY = t.minY;
            if (t.maxY > maxY) maxY = t.maxY;
          }
          if (drawn === 0) continue;
          instances += drawn;
          byTier[tier] += drawn;
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
            if (!mesh || mesh.instanceMatrix.count < drawn) {
              // Grow by 1.5x so a ring that keeps creeping up by a few
              // instances does not reallocate on every rebuild.
              if (mesh) { group.remove(mesh); mesh.dispose(); }
              const capacity = Math.max(64, Math.ceil(drawn * 1.5));
              mesh = new THREE.InstancedMesh(geometry, part.material, capacity);
              // DEV triangle attribution bucket (HUD line 3).
              mesh.userData.perfTag = "gc";
              // The colour attribute is allocated up front (three would
              // create it lazily on the first `setColorAt`, one instance at
              // a time — this fill writes it in blocks).
              mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
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
            const matrices = mesh.instanceMatrix.array as Float32Array;
            const colours = mesh.instanceColor!.array as Float32Array;
            let at = 0;
            for (const t of slotTiles.tiles) {
              const sp = t.species;
              const farN = Math.ceil(sp.farCount * densityScale);
              const restN = t.far ? 0 : Math.ceil((sp.count - sp.farCount) * densityScale);
              if (farN > 0) {
                matrices.set(sp.matrices.subarray(0, farN * 16), at * 16);
                colours.set(sp.colours.subarray(0, farN * 3), at * 3);
                at += farN;
              }
              if (restN > 0) {
                matrices.set(sp.matrices.subarray(sp.farCount * 16, (sp.farCount + restN) * 16), at * 16);
                colours.set(sp.colours.subarray(sp.farCount * 3, (sp.farCount + restN) * 3), at * 3);
                at += restN;
              }
            }
            // One band per mesh — every instance in it crosses the same two
            // boundaries — but the attribute is per instance because that is
            // the channel the shared fade shader reads.
            const bands = bandAttribute(geometry, drawn);
            const bandArray = bands.array as Float32Array;
            for (let i = 0; i < drawn; i++) {
              bandArray[i * 4] = band[0];
              bandArray[i * 4 + 1] = band[1];
              bandArray[i * 4 + 2] = band[2];
              bandArray[i * 4 + 3] = band[3];
            }
            bands.needsUpdate = true;
            mesh.count = drawn;
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor!.needsUpdate = true;
            // The sphere from the tiles' extents (a quarter-ring), never by
            // reading the matrices back; the height term covers the plants.
            const sphere = mesh.boundingSphere ?? (mesh.boundingSphere = new THREE.Sphere());
            sphere.center.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
            sphere.radius = Math.hypot(maxX - minX, maxY - minY + speciesHeightM, maxZ - minZ) / 2 + speciesHeightM;
            liveMeshes.add(meshKey);
            const index = part.geometry.getIndex();
            const partTris =
              (index ? index.count : part.geometry.attributes.position.count) / 3;
            triangles += partTris * drawn;
            if (tier === TIER_NEAR) nearMeshTriangles += partTris * drawn;
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
      mesh.userData.perfTag = "gc";
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

    const tFilled = performance.now();
    const perfNow = perf.current;
    perfNow.fillMs = Math.round((tFilled - tGenerated) * 10) / 10;
    if (perfNow.fillMs > perfNow.fillMaxMs) perfNow.fillMaxMs = perfNow.fillMs;
    perfNow.fillInstances = instances;
    perfNow.nearMeshTriangles = Math.round(nearMeshTriangles);
    perfNow.tilesLive = tiles;
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
      rebuildMs: {
        generate: Math.round(stats0.ms * 10) / 10,
        fill: Math.round((tFilled - tGenerated) * 10) / 10,
      },
      perf: perfNow,
    };
    onStats?.(stats);
    if (import.meta.env.DEV) {
      // What a rebuild actually costs, in the units that matter.
      console.debug(
        "[groundcover] rebuild",
        `tiles ${tilesGenerated}/${tiles} generated`,
        `instances ${instances} (near ${byTier[0]} / mid ${byTier[1]} / far ${byTier[2]})`,
        `draws ${stats.draws}`,
        `pool ${meshPool.current.size}`,
        `cards ${cards.size}`,
        `ms generate ${stats.rebuildMs.generate} fill ${stats.rebuildMs.fill}`,
      );
    }
    // Same convention as __STUDIO_VEGETATION_DEBUG__: probes read numbers.
    (window as unknown as { __STUDIO_GROUNDCOVER_DEBUG__?: GroundcoverStats })
      .__STUDIO_GROUNDCOVER_DEBUG__ = stats;
  }, [kit, cards, control, chunks, exclusions, foundationTreatments, clearanceIndex,
      regionRaster, tint, foundationParts, revision, verticalScale,
      onStats, focusRef, store, ringRadiusM, farRadiusM, maxInstances, wind,
      lodFade]);

  // The tile generator, installed for `useFrame` whenever an input changes.
  // Pure per tile (never reads the focus) so a tile is reusable wherever the
  // focus goes; ordered nearest-first per call so the near tier fills first.
  useEffect(() => {
    if (!kit || !control || !chunks) { generateRef.current = null; return; }
    const tileHa = (TILE_M * TILE_M) / 10_000;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const grid = new Float32Array(TILE_GRID_N * TILE_GRID_N);
    const depthGrid = new Float32Array(TILE_GRID_N * TILE_GRID_N);
    const slotsPresent = new Set<number>();
    // Reused across tiles: a mask allocated per tile would be 256 bytes of
    // garbage every 16 m of walking, on the frame budget that generates them.
    const tileMask = new Uint8Array(MASK_N * MASK_N);
    const tileExclusionBounds: MaskBox[] = [];
    const tilePatchBounds: MaskBox[] = [];
    // Candidate placements per species, in ONE reused typed array each
    // (x, y, z, yaw, scale, keep, farKeep, r, g, b), grown 1.5x when a denser
    // tile needs more room and never shrunk.
    const placements: Float32Array[] = SPECIES_PLANS.map(() => new Float32Array(0));
    const placementCount: number[] = SPECIES_PLANS.map(() => 0);
    let orderBuffer = new Uint32Array(0);
    const growPlacements = (speciesIndex: number, needed: number): Float32Array => {
      const have = placements[speciesIndex];
      if (have.length >= needed * PLACEMENT_STRIDE) return have;
      const size = Math.max(64, Math.ceil(needed * 1.5)) * PLACEMENT_STRIDE;
      const grown = new Float32Array(size);
      grown.set(have);
      placements[speciesIndex] = grown;
      return grown;
    };
    const growOrder = (needed: number): Uint32Array => {
      if (orderBuffer.length < needed) {
        orderBuffer = new Uint32Array(Math.max(64, Math.ceil(needed * 1.5)));
      }
      return orderBuffer;
    };

    /** Bilinear read of a per-tile grid at local metres (0..TILE_M). */
    const gridAt = (g: Float32Array, lx: number, lz: number): number => {
      const u = Math.max(0, Math.min(TILE_GRID_N - 1.0001, lx / TILE_GRID_M));
      const v = Math.max(0, Math.min(TILE_GRID_N - 1.0001, lz / TILE_GRID_M));
      const ix = Math.floor(u); const iz = Math.floor(v);
      const fx = u - ix; const fz = v - iz;
      const i = iz * TILE_GRID_N + ix;
      return (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fz)
        + (g[i + TILE_GRID_N] * (1 - fx) + g[i + TILE_GRID_N + 1] * fx) * fz;
    };

    // Bounds of every building footprint, once per rebuild, for the per-tile
    // prefilter below.
    const exclusionBoxes = exclusions.map((poly) => {
      let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
      for (const [x, z] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      return { poly, minX, maxX, minZ, maxZ };
    });

    const DEV = import.meta.env.DEV;
    const mark = (): number => (DEV ? performance.now() : 0);

    const generateTile = (tx: number, tz: number, wantFar: boolean, rej: typeof genStats.current.rejected): CachedTile | null => {
      const tPhase0 = mark();
      let exactTests = 0;
      let maxSpeciesRadiusM = 0;
      for (const r of radii.current.values()) if (r > maxSpeciesRadiusM) maxSpeciesRadiusM = r;
      const waterData = water.current;
      const x0 = tx * TILE_M; const z0 = tz * TILE_M;
      // The tile's ground and water ONCE, on a 2 m grid, with the slope's
      // one-sample margin folded into the bilinear read below.
      let minY = Infinity; let maxY = -Infinity;
      for (let iz = 0; iz < TILE_GRID_N; iz++) {
        for (let ix = 0; ix < TILE_GRID_N; ix++) {
          const x = x0 + ix * TILE_GRID_M; const z = z0 + iz * TILE_GRID_M;
          const h = groundHeightM(store, chunks, x, z);
          // A tile generated before the terrain chunks under it had decoded
          // rejected every candidate on a missing height; caching that left
          // the ring EMPTY for good (measured 2026-09-16: 68 tiles, 0
          // instances in the jungle). An incomplete tile is not cached, so
          // it is generated again once the chunk arrives.
          if (h === null) { rej.height++; return null; }
          grid[iz * TILE_GRID_N + ix] = h;
          depthGrid[iz * TILE_GRID_N + ix] = waterData ? waterData.depthProxy(x, z) : -10;
          const y = h * verticalScale;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      // Which (region, cover) slots the tile's paint actually holds, so a
      // species bound nowhere on it costs nothing: a third of all candidate
      // work was the `bare` rejection of species the tile could never hold.
      slotsPresent.clear();
      for (let iz = 0; iz < TILE_GRID_N - 1; iz++) {
        for (let ix = 0; ix < TILE_GRID_N - 1; ix++) {
          const x = x0 + (ix + 0.5) * TILE_GRID_M; const z = z0 + (iz + 0.5) * TILE_GRID_M;
          const region = regionRaster ? coverAt(regionRaster, x, z) : REGION_UNKNOWN;
          slotsPresent.add(slotKey(region, coverAt(control, x, z)));
        }
      }
      const tPhaseGrid = mark();
      // The patch and footprint lists are narrowed ONCE per tile, not once
      // per candidate (2026-09-21): a road-track clearance carries thousands
      // of vertices, and the per-candidate grid lookup plus its array ran
      // ~1,100 times a tile. The pad is the tile's half-diagonal plus the
      // widest species radius, so the narrowed list is a superset of what
      // every candidate in the tile would have found; `survivesPatchesIn`
      // re-applies the exact per-point bounds test, so the plants are
      // unchanged.
      const tileCx = x0 + TILE_M / 2; const tileCz = z0 + TILE_M / 2;
      const tilePadM = TILE_M * Math.SQRT1_2 + maxSpeciesRadiusM;
      const tilePatches = clearanceIndex.length === 0
        ? EMPTY_PATCHES
        : patchEntriesNear(tileCx, tileCz, clearanceIndex, tilePadM);
      const tileExclusions: Footprint[] = [];
      tileExclusionBounds.length = 0;
      for (const box of exclusionBoxes) {
        const dx = Math.max(box.minX - tileCx, 0, tileCx - box.maxX);
        const dz = Math.max(box.minZ - tileCz, 0, tileCz - box.maxZ);
        if (Math.hypot(dx, dz) <= tilePadM) {
          tileExclusions.push(box.poly);
          tileExclusionBounds.push(box);
        }
      }
      // Both narrowed lists are rasterised into ONE cell mask (above), so a
      // candidate pays an array index rather than a polygon walk per test.
      tilePatchBounds.length = 0;
      for (const entry of tilePatches) tilePatchBounds.push(entry.bounds);
      rasteriseTileMask(
        tileMask, x0, z0, maxSpeciesRadiusM, tileExclusionBounds, tilePatchBounds,
      );
      const tPhaseMask = mark();
      for (let i = 0; i < placementCount.length; i++) placementCount[i] = 0;
      for (const plan of SPECIES_PLANS) {
        let bound = false;
        for (const key of slotsPresent) if (plan.bySlot.has(key)) { bound = true; break; }
        if (!bound) continue;
        // Candidates on a stratified grid at the species' peak density —
        // Bethesda's GRAS placement model, one sample uniform per cell.
        const candidates = plan.maxDensity * tileHa;
        const g = Math.max(1, Math.ceil(Math.sqrt(candidates)));
        const cell = TILE_M / g;
        const keepP = candidates / (g * g);
        const keepThreshold = wantFar ? keepP * FAR_THIN : keepP;
        const speciesRadiusM = radii.current.get(plan.id) ?? 0;
        for (let k = 0; k < g * g; k++) {
          const genKeep = u01(hash32(tx, tz, plan.index, k * 8));
          if (genKeep >= keepThreshold) { rej.keep++; continue; }
          // Stratified: one candidate per cell, uniform over the WHOLE cell.
          // A fixed jitter amplitude smaller than the cell left the lattice
          // visible as rows wherever the cell was wide (every rule under
          // ~7,000 /ha has a cell over 1.2 m).
          const ux = u01(hash32(tx, tz, plan.index, k * 8 + 1));
          const uz = u01(hash32(tx, tz, plan.index, k * 8 + 2));
          const lx = ((k % g) + ux) * cell;
          const lz = (Math.floor(k / g) + uz) * cell;
          const x = x0 + lx;
          const z = z0 + lz;

          // Region THEN cover: the swap layer is what stops the delta, the
          // interior swamp and the mangrove coast sharing one reed wherever
          // they share a cover id.
          const region = regionRaster ? coverAt(regionRaster, x, z) : REGION_UNKNOWN;
          const rule = plan.bySlot.get(slotKey(region, coverAt(control, x, z)));
          if (!rule) { rej.bare++; continue; } // bare cover, or bound to other species here
          // Acceptance is the cover's share of the species' peak density,
          // modulated by the species' own clump field (mechanism 3). The
          // field's mean is 1, so the authored density is preserved.
          const clump = clumpAt(x, z, plan.index);
          const accept = (rule.density / plan.maxDensity) * (0.35 + 1.3 * clump);
          if (u01(hash32(tx, tz, plan.index, k * 8 + 3)) >= accept) { rej.accept++; continue; }

          const maskFlags = tileMask[maskCellIndex(lx, lz)];
          if (DEV && maskFlags !== 0) exactTests++;
          if ((maskFlags & MASK_EXCLUDE) !== 0
            && excludedByFootprints(x, z, speciesRadiusM, tileExclusions)) {
            rej.footprint++; continue;
          }
          // Vegetation patches (0041 gotcha (b)): the published bundles were
          // patched by the stage, but this layer is generated here and has to
          // obey the same patch list or grass grows through the floors.
          if ((maskFlags & MASK_PATCH) !== 0
            && !survivesPatchesIn(x, z, speciesRadiusM, tilePatches,
              u01(hash32(tx, tz, plan.index, k * 8 + 7)))) { rej.patch++; continue; }

          const h = gridAt(grid, lx, lz);
          // Slope from the same grid (true metres — the authored limits are
          // physical, not exaggerated).
          const east = gridAt(grid, lx + TILE_GRID_M, lz);
          const south = gridAt(grid, lx, lz + TILE_GRID_M);
          const slopeDeg = Math.atan(Math.hypot(east - h, south - h) / TILE_GRID_M) * (180 / Math.PI);
          if (slopeDeg > rule.slopeDegMax) { rej.slope++; continue; }
          if (waterData) {
            const depth = gridAt(depthGrid, lx, lz);
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
          // Straight into the species' reused typed array: one candidate used
          // to allocate a `TilePlacement` object, and a dense tile allocated
          // a thousand of them for the collector to take back a frame later.
          const slot = placementCount[plan.index]++;
          const data = growPlacements(plan.index, slot + 1);
          const o = slot * PLACEMENT_STRIDE;
          data[o] = x;
          data[o + 1] = h * verticalScale;
          data[o + 2] = z;
          data[o + 3] = u01(hash32(tx, tz, plan.index, k * 8 + 4)) * Math.PI * 2;
          data[o + 4] = 1 + vary * rule.heightVariance;
          data[o + 5] = u01(hash32(tx, tz, plan.index, k * 8 + 6));
          data[o + 6] = keepP > 0 ? genKeep / keepP : 1;
          data[o + 7] = r;
          data[o + 8] = gg;
          data[o + 9] = b;
        }
      }
      const tPhaseCand = mark();
      // Compose the tile's arrays once: far subset first, each block sorted
      // by `keep`, so every later fill is a block copy.
      const composed: TileSpecies[] = placementCount.map((count, speciesIndex) => {
        if (count === 0) return EMPTY_TILE_SPECIES;
        const data = placements[speciesIndex];
        // Partition in place: far subset first, then each block sorted by
        // `keep`, which is what makes every later fill a block copy.
        const order = growOrder(count);
        let far = 0;
        for (let i = 0; i < count; i++) {
          if (data[i * PLACEMENT_STRIDE + 6] < FAR_THIN) order[far++] = i;
        }
        let rest = far;
        for (let i = 0; i < count; i++) {
          if (data[i * PLACEMENT_STRIDE + 6] >= FAR_THIN) order[rest++] = i;
        }
        const byKeep = (a: number, c: number) =>
          data[a * PLACEMENT_STRIDE + 5] - data[c * PLACEMENT_STRIDE + 5];
        order.subarray(0, far).sort(byKeep);
        order.subarray(far, count).sort(byKeep);
        const matrices = new Float32Array(count * 16);
        const colours = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const o = order[i] * PLACEMENT_STRIDE;
          position.set(data[o], data[o + 1], data[o + 2]);
          quaternion.setFromAxisAngle(up, data[o + 3]);
          scale.setScalar(data[o + 4]);
          matrix.compose(position, quaternion, scale);
          matrix.toArray(matrices, i * 16);
          colours[i * 3] = data[o + 7];
          colours[i * 3 + 1] = data[o + 8];
          colours[i * 3 + 2] = data[o + 9];
        }
        return { count, farCount: far, matrices, colours };
      });
      if (DEV) {
        const pm = phaseMax.current;
        const grid = tPhaseGrid - tPhase0;
        const mask = tPhaseMask - tPhaseGrid;
        const cand = tPhaseCand - tPhaseMask;
        const compose = performance.now() - tPhaseCand;
        if (grid > pm.grid) pm.grid = grid;
        if (mask > pm.mask) pm.mask = mask;
        if (cand > pm.cand) pm.cand = cand;
        if (compose > pm.compose) pm.compose = compose;
        if (exactTests > pm.exact) pm.exact = exactTests;
      }
      return {
        far: wantFar, perSpecies: composed,
        minY: Number.isFinite(minY) ? minY : 0, maxY: Number.isFinite(maxY) ? maxY : 0,
      };
    };

    generateRef.current = (budgetMs: number) => {
      const t0 = performance.now();
      const focus = focusRef.current;
      const keepRadiusM = farRadiusM + TIER_OVERLAP_M;
      const tileReach = Math.ceil(keepRadiusM / TILE_M);
      const ftx = Math.floor(focus.x / TILE_M);
      const ftz = Math.floor(focus.z / TILE_M);
      const cache = tileCache.current;
      // Everything the ring wants that the cache lacks (or holds thinned
      // where full is now wanted), nearest first.
      const wanted: { tx: number; tz: number; nearest: number; far: boolean }[] = [];
      for (let tz = ftz - tileReach; tz <= ftz + tileReach; tz++) {
        for (let tx = ftx - tileReach; tx <= ftx + tileReach; tx++) {
          const nearest = tileNearestM(focus, tx, tz);
          if (nearest > keepRadiusM) continue;
          const wantFar = nearest > ringRadiusM + TIER_OVERLAP_M;
          const cached = cache.get(tileKey(tx, tz));
          if (cached && !(cached.far && !wantFar)) continue;
          wanted.push({ tx, tz, nearest, far: wantFar });
        }
      }
      wanted.sort((a, b) => a.nearest - b.nearest);
      let generated = 0;
      let i = 0;
      const rej = genStats.current.rejected;
      for (; i < wanted.length; i++) {
        if (generated > 0 && (performance.now() - t0 > budgetMs
          || generated >= GENERATE_MAX_TILES_PER_CALL)) break;
        const w = wanted[i];
        const tileT0 = performance.now();
        const tile = generateTile(w.tx, w.tz, w.far, rej);
        const tileMs = performance.now() - tileT0;
        genStats.current.tileMs = tileMs;
        if (tileMs > genStats.current.tileMaxMs) genStats.current.tileMaxMs = tileMs;
        generated++;
        if (tile) tileCache.current.set(tileKey(w.tx, w.tz), tile);
      }
      genStats.current.generated += generated;
      genStats.current.ms += performance.now() - t0;
      // A tile that came back incomplete (chunk not decoded yet) stays
      // wanted; it is retried on a later frame rather than spun on now.
      return { generated, remaining: wanted.length - i };
    };
    genPending.current = true;
    return () => { generateRef.current = null; };
  }, [kit, control, chunks, exclusions, clearanceIndex, regionRaster, tint,
      verticalScale, ringRadiusM, farRadiusM, store, focusRef]);

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
    genPending.current = true;
  }, [control, regionRaster, tint, chunks, exclusions, clearanceIndex,
      verticalScale, ringRadiusM]);

  return <group ref={root} name="groundcover" />;
}
