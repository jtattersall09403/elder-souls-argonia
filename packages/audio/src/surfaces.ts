/**
 * The footstep material contract (module 75 §54, decision 0011).
 *
 * Contact sound follows the PHYSICAL material under the foot, never the
 * rendered texture. Two inputs resolve to a `FootstepSurface`, the acoustic
 * key the manifest's `footstep.<footwear>.<gait>.<surface>` sets use:
 *
 * - terrain: the ground-material id of decision 0011's control map (the 40
 *   ids of `textures/ground/<set>/materials.json`, identical in every set;
 *   `id0` of the texel under the foot). `GROUND_MATERIAL_SURFACE` maps each
 *   by name; a test holds it to the shipped materials.json.
 * - colliders: the `PhysicalMaterialId` of module 75 §54 (the required list),
 *   through `PHYSICAL_MATERIAL_SURFACE`.
 *
 * Water depth at the foot overrides both: a film is `puddle`, anything
 * deeper is `water` (Skyrim's wading set). Whether the actor walks or swims
 * is the movement mode's call (decision 0093: swimming starts at 1.05 m of
 * water), never this function's: a swimming actor fires `movement.swim`,
 * not footsteps.
 */

/** Acoustic surfaces with a vanilla footstep set (Skyrim MATT -> FSTS chain, 0094). */
export type FootstepSurface = "dirt" | "mud" | "grass" | "gravel" | "stone" | "wood" | "sand" | "water" | "puddle";
export const FOOTSTEP_SURFACES: readonly FootstepSurface[] = [
  "dirt",
  "mud",
  "grass",
  "gravel",
  "stone",
  "wood",
  "sand",
  "water",
  "puddle",
];

export type Footwear = "barefoot" | "light" | "heavy";
export type Gait = "walk" | "run" | "sprint" | "sneak";

/**
 * Module 75 §54's required physical materials (collider tags). The type
 * lives here until the physical-material registry exists; it moves to
 * `packages/contracts` with it.
 */
export type PhysicalMaterialId =
  | "soil"
  | "peat"
  | "mud"
  | "wood"
  | "bark"
  | "bone"
  | "stone"
  | "metal"
  | "ceramic"
  | "foliage"
  | "water"
  | "flesh"
  | "glass"
  | "fungus";

export const PHYSICAL_MATERIAL_SURFACE: Readonly<Record<PhysicalMaterialId, FootstepSurface>> = {
  soil: "dirt",
  peat: "mud",
  mud: "mud",
  wood: "wood",
  bark: "wood",
  bone: "gravel",
  stone: "stone",
  metal: "stone",
  ceramic: "stone",
  foliage: "grass",
  water: "water",
  flesh: "mud",
  glass: "stone",
  fungus: "mud",
};

/** Decision 0011's ground materials by id -> [name, surface]. Names are checked against materials.json. */
export const GROUND_MATERIAL_SURFACE: readonly (readonly [string, FootstepSurface])[] = [
  ["water_silt", "mud"],
  ["river_mud", "mud"],
  ["bank_wet", "mud"],
  ["scum", "puddle"],
  ["black_mud", "mud"],
  ["puddle_mud", "puddle"],
  ["clay_bank", "mud"],
  ["muck", "mud"],
  ["bc_mud", "mud"],
  ["peat", "mud"],
  ["mud_leaves", "mud"],
  ["marsh_grass", "grass"],
  ["undergrowth", "grass"],
  ["bc_moss", "grass"],
  ["moss", "grass"],
  ["swamp_grass", "grass"],
  ["trop_grass", "grass"],
  ["grass_dirt", "grass"],
  ["scrub", "grass"],
  ["jungle_floor", "dirt"],
  ["forest_floor", "dirt"],
  ["leaf_litter", "dirt"],
  ["mossy_rock", "stone"],
  ["bc_rock", "stone"],
  ["tidal_sand", "sand"],
  ["salt_flat", "sand"],
  ["dry_clay", "dirt"],
  ["dirt_path", "dirt"],
  ["peat_slope", "mud"],
  ["track_mud", "mud"],
  ["bc_road", "dirt"],
  ["mountain_rock", "stone"],
  ["beach_sand", "sand"],
  ["seabed_sand", "sand"],
  ["river_pebbles", "gravel"],
  ["ocean_floor", "sand"],
  ["trop_rocks", "stone"],
  ["scree", "gravel"],
  ["cliff_rock", "stone"],
  ["cliff_dirt", "dirt"],
];

/** Water deeper than this at the foot is wading (Skyrim's water set), m. */
export const WADE_DEPTH_M = 0.08;
/** A film shallower than WADE_DEPTH_M but deeper than this is a puddle, m. */
export const PUDDLE_DEPTH_M = 0.01;

export interface FootContact {
  /** Collider material when the foot is on a placed thing; wins over the terrain. */
  physical?: PhysicalMaterialId;
  /** Terrain ground-material id under the foot (0011 control map id0). */
  groundMaterialId?: number;
  /** Water depth above the contact point (m); 0 or absent is dry. */
  waterDepthM?: number;
}

/** The surface a footstep sounds on. */
export function footstepSurface(c: FootContact): FootstepSurface {
  const depth = c.waterDepthM ?? 0;
  if (depth >= WADE_DEPTH_M) return "water";
  if (depth >= PUDDLE_DEPTH_M) return "puddle";
  if (c.physical) return PHYSICAL_MATERIAL_SURFACE[c.physical];
  if (c.groundMaterialId !== undefined) return GROUND_MATERIAL_SURFACE[c.groundMaterialId]?.[1] ?? "dirt";
  return "dirt";
}
