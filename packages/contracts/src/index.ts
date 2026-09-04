/**
 * @elder-souls/contracts — small stable cross-system interfaces.
 *
 * Types only; no runtime code beyond constants. Systems depend on these, never
 * on each other's internals (master plan §61). Grow this deliberately: add a
 * contract when a second consumer exists, not speculatively.
 */

// ---------------------------------------------------------------------------
// Core spatial conventions (docs/decisions/0003)
// ---------------------------------------------------------------------------

/** Metres, Y-up, right-handed; X east, Z south; sea level y = 0. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const SEA_LEVEL_Y = 0;

// ---------------------------------------------------------------------------
// Source provenance (master plan §13; docs/decisions/0002)
// ---------------------------------------------------------------------------

export type SourceConfidence =
  | "CANON_FIXED"
  | "OFFICIAL_MAP_DERIVED"
  | "GAME_DERIVED"
  | "LORE_INFERRED"
  | "COMMUNITY_CONSENSUS"
  | "PROJECT_REFERENCE"
  | "AGENT_AUTHORED"
  | "GENERATED";

export interface EraRange {
  /** e.g. "4E201"; open ranges may omit one bound. */
  from?: string;
  to?: string;
}

export interface CanonDatum<T> {
  value: T;
  era: EraRange;
  confidence: SourceConfidence;
  sources: string[];
  /** Metres of positional slack for spatial data. */
  spatialTolerance?: number;
  authorNotes?: string;
}

// ---------------------------------------------------------------------------
// Settlement anchors (master plan §14)
// ---------------------------------------------------------------------------

export interface SettlementAnchor {
  id: string;
  name: string;
  rank: "major" | "secondary";
  /**
   * Position as a fraction of the province heightfield extent:
   * u west→east in [0,1], v north→south in [0,1]. Converted to metres once the
   * province origin/scale is pinned (decisions 0003/0005).
   */
  u: number;
  v: number;
  /** Placement slack as a fraction of the province extent. */
  toleranceUV: number;
  confidence: SourceConfidence;
  sources: string[];
  notes?: string;
}

/** Candidate transport-graph edge between anchors (master plan §14.1); the
 * route compiler later decides mode and geometry, or rejects it. */
export interface SuggestedConnection {
  from: string;
  to: string;
  confidence: SourceConfidence;
  sources: string[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// Plotted places and minor tracks (Phase 11 plot; decision 0041 Part 0 item 5)
// ---------------------------------------------------------------------------
// The review projection of world/sources/catalogue written by
// `worldgen.export_places` to apps/world-studio/public/province/places.json.
// The game's map/fast-travel/journal will read the same bundle shape, so it
// lives here rather than in the studio. Tiers/danger/density vocabularies are
// owned by tooling/world-generation/worldgen/catalogue.py.

export interface PlottedPlaceWhy {
  founding: string | null;
  siteAdvantages: string | null;
  occupantsMotive: string | null;
  pressures: string | null;
  wouldChangeIf: string | null;
}

export interface PlottedPlace {
  /** Stable catalogue id: `place.<region>.<name>` (standard 2). */
  id: string;
  name: string;
  /** Region zone = catalogue file = society culture zone (e.g. `dunmer-north`). */
  region: string;
  class: string | null;
  family: string | null;
  type: string | null;
  magnitude: string | null;
  /** 0 = canon major … 4 = density fill. */
  importanceTier: number;
  /** `D0`…`D5`. */
  dangerTier: string | null;
  densityLayer: string | null;
  status: string;
  workflow: string;
  culture: string | null;
  /** Fraction of the province extent, u west→east, v north→south (as SettlementAnchor). */
  position: { u: number; v: number };
  /** Source-grid metres (unscaled), [x east, y south]. */
  positionM: [number, number] | null;
  plotFacts: Record<string, unknown> | null;
  whySiteWon: string | null;
  why: PlottedPlaceWhy;
  hardConstraints: string[];
  reachedVia: string[];
  discovery: string | null;
  valueTier: string | null;
  /** Catalogue v2 (2026-09-03): "primary (impact) + secondary…", the one-sentence hook, hostility baseline, interior summary. */
  purpose: string | null;
  hook: string | null;
  stance: HostilityStance | string | null;
  interior: string | null;
  /** Structured views of the same v2 blocks (export schemaVersion 2). */
  purposeDetail: PlottedPlacePurpose | null;
  stanceDetail: PlottedPlaceStance | null;
  interiorDetail: PlottedPlaceInterior | null;
  /** How the place is entered, e.g. `underwater-entry`. */
  entrance: string | null;
  /** `none` | `argonian-only-depth` | … — an Argonian-only underwater way in. */
  underwaterAccess: string | null;
  /** Population/loot slots, already flattened to one short line each. */
  contents: PlottedPlaceContents | null;
  travelStation: PlottedPlaceTravelStation | null;
  /** Prose provisions this place owes the quest layer (docs/quests/20). */
  questProvisions: string[];
  /** Quest tier claim, e.g. `tier-0 protected` (docs/quests/20 §Tier-0). */
  tierOwnership: string | null;
}

/** The six hostility baselines of catalogue schema v2. */
export type HostilityStance = "sanctuary" | "friendly" | "neutral" | "guarded" | "wary" | "hostile";

export interface PlottedPlacePurpose {
  primary: string | null;
  impact: string | null;
  secondary: string[];
}

export interface PlottedPlaceStance {
  baseline: HostilityStance | string | null;
  owner: string | null;
  clearable: boolean | null;
  respawn: string | null;
  /** Pre-rendered one-liners: `→ hostile when notorietyTier region.x hunted`. */
  flips: string[];
}

export interface PlottedPlaceInterior {
  /** `delve` | `dungeon` | `complex` | `warren` | `room` … (`none` is exported as null). */
  kind: string | null;
  family: string | null;
  sizeBand: string | null;
  /** 0–1 share of the interior that is underwater. */
  wetFraction: number | null;
  entranceCount: number | null;
  exteriorShell: string | null;
  verticalRelationship: string | null;
}

export interface PlottedPlaceContents {
  creatures: string[];
  npcs: string[];
  loot: string[];
}

export interface PlottedPlaceTravelStation {
  modes: string[];
  destinations: { id: string; name: string }[];
}

export interface PlottedPlacesBundle {
  schemaVersion: 2;
  source: string;
  /** Region zone → CSS hex, copied from society.CULTURES so pictures agree. */
  zoneColours: Record<string, string>;
  unsitedCount: number;
  places: PlottedPlace[];
}

// ---------------------------------------------------------------------------
// Route registry index (worldgen.export_routes → province/routes-index.json)
// ---------------------------------------------------------------------------
// Registry fields keyed by route id. The geometry bundles (routes.json,
// waterways.json, routes-minor.json) carry the ids; consumers join on them so
// no runtime reads world/sources/routes/registry.json.

export interface RegisteredRoute {
  name?: string;
  /** `road` | `boat` | `track`. */
  mode?: string;
  /** `trunk` | `road` | `lane` | `channel` | `track` | `footpath` | `boardwalk` | `causeway`. */
  class?: string;
  from?: string;
  to?: string;
  confidence?: string;
  /** Named routes with no solved geometry yet are `false`. */
  solved?: boolean;
  notes?: string;
  sources: string[];
  aliases: string[];
}

export interface RoutesIndexBundle {
  schemaVersion: 1;
  source: string;
  routes: Record<string, RegisteredRoute>;
}

/** A drawn route line on the 1345-px hydrology grid (routes.json / waterways.json). */
export interface RouteGeometry {
  id?: string;
  name?: string;
  class?: string;
  from: string;
  to: string;
  lengthKm?: number;
  px: [number, number][];
}

export interface RoadsBundle {
  routes: RouteGeometry[];
}

export interface WaterwaysBundle {
  lanes: RouteGeometry[];
}

export type MinorTrackKind = "track" | "footpath" | "boardwalk" | "causeway";

/** A local track between places; `px` are [col,row] on the 1345-px hydrology
 * grid exactly like routes.json. */
export interface MinorTrack {
  id: string;
  kind: MinorTrackKind;
  from: string;
  to: string;
  lengthKm: number;
  px: [number, number][];
}

export interface MinorTracksBundle {
  schemaVersion: 1;
  tracks: MinorTrack[];
}

// ---------------------------------------------------------------------------
// Environment and water queries (master plan §38, §61)
// ---------------------------------------------------------------------------

export interface WaterSample {
  waterBodyId: string | null;
  surfaceHeight: number;
  surfaceNormal: Vec3;
  flowVelocity: Vec3;
  depth: number;
  /** 0 dry → 1 fully submerged, measured at the query position. */
  immersion: number;
  turbidity: number;
  salinity: number;
  temperature: number;
  hazardIds: string[];
}

export type WaterInteractionKind = "enter" | "exit" | "splash" | "wake" | "submerge";

/** A disturbance of the water surface (module 60 §38) — swimmers, boats,
 * falling objects. The renderer turns these into contact foam/ripples; audio
 * (Phase 12b) and AI perception may subscribe later. */
export interface WaterInteractionEvent {
  kind: WaterInteractionKind;
  position: Vec3;
  velocity?: Vec3;
  /** Characteristic radius of the disturbance, metres. */
  radius?: number;
  /** Impact-strength proxy (≈ mass × speed) for splash/foam scaling. */
  magnitude?: number;
  actorId?: string;
}

/**
 * The one authoritative gameplay-facing water model (module 60 §38): Rapier,
 * locomotion and AI sample this on the CPU; the renderer consumes the same
 * hydrology/wave/interaction data so what you see is what you float on.
 * `epochMinutes` is world-clock time (`@elder-souls/world-time`).
 */
export interface WorldWaterQuery {
  sample(position: Vec3, epochMinutes: number): WaterSample;
  emitInteraction(event: WaterInteractionEvent): void;
}

/**
 * World time and natural light at a position (module 55 §94/§97): time-of-day
 * is a gameplay contract — night changes visibility, AI perception and danger
 * — so combat/AI and the renderer read the same authority. Produced by the
 * world clock (`@elder-souls/world-time`) + climate fields; never scaled to
 * the player (decision 0004).
 */
export interface TimeLightSample {
  /** night | astronomical | nautical | civil | sunrise | morning | noon | afternoon | sunset | dusk */
  dayPhase: string;
  sunAltitudeDeg: number;
  /** Illuminated fraction of Masser (0 new … 1 full) — the night key light. */
  moonPhaseFraction: number;
  /** Season scalar s(t) ∈ [−1 dry … +1 wet] (module 50 §33.1). */
  seasonScalar: number;
  /** Practical sight distance in metres under current air/mist (§97). */
  visibilityM?: number;
}

/**
 * Weather at a position (module 55 §98, decision 0032): world state on the
 * calendar, never scaled to the player (0004). The same deterministic sample
 * the renderer draws — AI perception, encounters and Phase 9
 * climbing/boats/traction read THIS, so what falls is what the world feels.
 */
export interface WeatherContact {
  /** clear | haze | overcast | rain | downpour | squall | thunderstorm */
  state: string;
  /** Local precipitation strength 0..1. */
  rainIntensity: number;
  /** Wind travel direction (XZ unit) and speed, m/s. */
  windDirXZ: [number, number];
  windSpeedMS: number;
  /** Practical sight distance, metres (weather + mist regimes combined). */
  visibilityM: number;
  /** Ground wetness 0..1 (decays over tens of minutes after rain). */
  wetness: number;
  /** Traction 0..1 (1 = dry grip); Phase 9 climbing/boats consume this. */
  grip: number;
}

export interface EnvironmentContact {
  groundMaterial?: string;
  /** Terrain surface height at the query (x, z), runtime metres. */
  groundHeight?: number;
  supportNormal?: Vec3;
  water?: WaterSample;
  light?: TimeLightSample;
  weather?: WeatherContact;
  mudDepth: number;
  biomeId: string;
  regionId: string;
  hazardIds: string[];
}

/**
 * The world side of the character/world boundary (master plan §61, grown as
 * consumers appear — Phase 7 lands the environment query; streaming, portals
 * and spawn search join it in later phases).
 *
 * Positions are runtime world space: metres from the province origin, X east,
 * Z south, vertical ×5 already applied where terrain became geometry
 * (decision 0006 addendum). Sea level stays y = 0 in both spaces.
 */
export interface EnvironmentQuery {
  queryEnvironment(position: Vec3): EnvironmentContact;
  /** Terrain surface height at (x, z), or null outside loaded coverage. */
  groundHeight(x: number, z: number): number | null;
}

// ---------------------------------------------------------------------------
// Locomotion (master plan §43)
// ---------------------------------------------------------------------------

export type LocomotionMode =
  | "grounded"
  | "airborne"
  | "surfaceSwim"
  | "submergedSwim"
  | "climb"
  | "boat"
  | "rootwormTransit";

export type CapabilityProfileId =
  | "minimumPlayable"
  | "baselineHuman"
  | "baselineArgonian"
  | "trainedSwimmer"
  | "advancedClimber"
  | "highBurden"
  | "boatSmall"
  | "boatCargo";

/**
 * Named movement capability data the world compilers validate against
 * (master plan §52). Values are generated from live gameplay tuning — never
 * hand-copied — so world validation cannot drift from the shipped controller.
 * Swim/climb fields stay 0 until Phase 9 implements those modes.
 */
export interface CapabilityProfile {
  id: CapabilityProfileId;
  /** Sustained flat-ground walk speed, m/s. */
  walkSpeed: number;
  sprintSpeed: number;
  /** Standing jump apex height, metres. */
  jumpApexHeight: number;
  /** Navigation capsule: cylinder half-height / radius / suspension float, metres. */
  capsuleHalfHeight: number;
  capsuleRadius: number;
  floatHeight: number;
  /** Steepest ground slope the profile can walk up, degrees. */
  maxWalkableSlopeDeg: number;
  swimSpeed: number;
  breathSeconds: number;
  climbSpeed: number;
}

// ---------------------------------------------------------------------------
// Combat actor registration (master plan §53, §61)
// ---------------------------------------------------------------------------

export type CombatActorKind = "player" | "enemy" | "npc" | "creature";

/**
 * A live actor registered with the shared actor registry: the world-side
 * handle that targeting, encounters and AI perception enumerate. Position is
 * read through a callback so registration never copies per-frame state.
 */
export interface CombatActorRef {
  id: string;
  kind: CombatActorKind;
  /** Live world position; writes into `out` and returns it. */
  position(out: Vec3): Vec3;
  /** Whether lock-on may select this actor right now. */
  targetable(): boolean;
  alive(): boolean;
}
