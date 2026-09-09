import * as THREE from "three";
import type { WaterMeta } from "../waterData";
import type { WaterRuntime } from "./types";
import { WATER_LAYER } from "./waterMaterial";
import type { ChannelStrip } from "./ChannelStrips";
import { WHITEWATER_GLSL, STREAK_LAYERS, streakSpeedGain,
  FALLS_SHADOW_VERTEX_PARS, FALLS_SHADOW_VERTEX, FALLS_SHADOW_FRAGMENT_PARS } from "./whitewaterStreaks";
import { PlungeBase, plungeBaseRadiusM } from "./PlungeBase";
import { WaterfallMist, type WaterfallMistDiagnostics } from "./WaterfallMist";

/**
 * Waterfall sheets for the compiled cascade lips (decision 0047; research
 * `waterfalls-realtime.md` §4.1: a procedural ribbon carrying Bethesda's
 * measured numbers — nobody simulates the fall, and an authored Skyrim body
 * NIF is never snapped to a computed path).
 *
 * The path is traced ONCE at load, in the vertical plane along the cascade's
 * `direction`, against the refined-terrain `profile` the compiler exports:
 * free ballistic flight from the lip, hugging the ground (+`GROUND_CLEARANCE_M`)
 * wherever the arc would pass below it, and detaching again when the ground
 * falls away faster than the arc.
 *
 * Classification (the alignment guard the two failed attempts lacked): a path
 * is a FALL only if it leaves the ground by ≥ `FREE_FLIGHT_MIN_AIR_M` over a
 * contiguous ≥ `FREE_FLIGHT_MIN_SPAN_M` of arc. Anything else is a ramp and
 * is not drawn as a free-fall body at all — `chuteStrips` hands it to the
 * strip mesh (ES_STRIP whitewater shader), so one reach is one piece.
 *
 * Geometry per fall (owner steer 2026-09-08: stack it the way Bethesda places
 * the vanilla thin sheets, not as one continuous ribbon): the traced path is
 * cut into PIECES of a family height (7.5 / 29 / 44 / 58 m, chosen by drop),
 * successive pieces overlapping by a third (they stack at 2/3 of a piece
 * height) and, for a fall wider than the piece, lateral copies with ~2x
 * width overlap. Every piece copy carries its own 0..1 UV rectangle
 * (`aPieceUv`) so the vanilla texture layout binds when the FX textures
 * arrive, its own scroll phase so copies never move in lockstep, and an
 * end fade across each overlap. Each piece has three body ribbons (front /
 * back / core); the fall as a whole gets the crest wrap (the sheet starts
 * `CREST_BACK_M` upstream of the lip at lip level, foam boosted over
 * `CREST_FOAM_M` past the lip), two mirrored side strips whose width and
 * texture pinch in toward the top (Taiji), and the plunge base kit
 * (`PlungeBase`: 12–19 flat quads on the pool, Bethesda's `CurrentPlane`
 * set) and the mist kit (`WaterfallMist`: 4–8 mist cards, 10–40 ground-mist
 * discs, a skirt at the foot). Shading is unlit aerated white x1.0 in free
 * fall, x0.75 on a chute reach, streaks scrolled down each piece's own arc in
 * metres; the base and mist use the same irradiance and tone mapping, so a
 * fall, its pool foam and its mist expose as one thing. Seen from under the
 * pool, the sheet fades out at the surface (never an opaque slab in the water).
 */

export type Cascade = NonNullable<WaterMeta["cascades"]>[number];

export const GRAVITY_MPS2 = 9.81;
/** Below this the compiler does not emit a cascade at all; guard anyway. */
export const MIN_CASCADE_DROP_M = 2.5;
/** Minimum launch speed: a lip is never truly still water. */
export const MIN_LIP_SPEED_MS = 1.5;
/** How far the sheet floats above ground while it is following it. */
export const GROUND_CLEARANCE_M = 0.12;
/** Crest wrap: sheet starts this far upstream of the lip, at lip level. */
export const CREST_BACK_M = 2.5;
/** Foam is boosted to ~1 over this much arc past the lip: Bethesda's 5.1 m
 * crest strip sits at lip + 0.5 m (vault audit §5), so ~3 m past the lip. */
export const CREST_FOAM_M = 3;
/** The sheet dissolves into the pool over its last metres of ARC (not a
 * fraction of the fall): the plunge join is measured 2 m up the sheet, and a
 * 15 % dissolve on a 20 m fall left that point one third opaque against dark
 * rock while the pool foam past the foot was solid white (42 % step). */
export const SHEET_FOOT_DISSOLVE_M = 0.8;
/**
 * Opacity of FULLY aerated water. Re-derived 2026-09-08 against the falls the
 * compiler actually emits (16 true cliffs, 6.5–131 m, 74–88°) rather than the
 * mixed ramp/fall set the old 0.9 was tuned on: a white-water jet is optically
 * thick within centimetres, so the floor at full aeration is all but 1, and the
 * rock shows through only where the aeration itself is low (the top of a short
 * fall, the feathered edges) — which is what the reference frames show
 * (docs/research/rendering/reference/). The floor now rides `aeration`, not the
 * streak-modulated `white`, so it is a property of the water, not of the noise.
 */
export const SHEET_AERATED_OPACITY = 0.95;
/**
 * The jet's LATERAL profile — why the body stopped being a card.
 *
 * Measured before the change (twins, 25 m fall, mid-body): alpha was flat at
 * 0.891–0.910 across the middle 40 % of the width, still 0.66 at 20 % in from
 * either edge, and it moved by 2 % between streak noise 0.2 and 0.8. The
 * strip a metre upstream swings 0.43 → 0.78 (81 %) over the same noise. Two
 * surfaces of the same compiled width, one uniformly opaque and one broken
 * up, read as very different widths: hence "a cream block two to three times
 * wider than the river", with straight sides.
 *
 * The shape is not picked by eye. Flow leaving the lip is critical, so the
 * discharge per unit width is q(u) ∝ h(u)^{3/2}; the transverse depth h across
 * a channel falls to zero at the banks, which for the standard parabolic
 * transverse profile gives h ∝ 1 − x² and hence q ∝ (1 − x²)^{3/2}. The
 * falling jet's thickness is t = q / v, so it carries the same shape. Opacity
 * is then Beer–Lambert on that thickness, `1 − exp(−K·t·aeration)`, with K set
 * so a fully aerated core reaches `SHEET_AERATED_OPACITY` — not a flat floor.
 *
 * `SHEET_LIP_CONTRACTION`: the compiled width is the width at the FOOT (the
 * mesh has to contain the widest part), so the jet is contracted to this
 * fraction of it at the lip and spreads to full width as it aerates — the
 * reference's "constrained at the lip, only slightly wider at the base".
 * Mass conservation thins it by the same factor as it spreads.
 *
 * `SHEET_EDGE_BREAKUP`: a nappe's edges shear into filaments and droplets, so
 * out there the coverage is fractional and time-varying — which is exactly
 * what the streak field is. Its weight rides `1 − t`, so the core stays solid
 * and the margins fizz at the strips' own amplitude.
 */
export const SHEET_OPTICAL_K = -Math.log(1 - SHEET_AERATED_OPACITY);
export const SHEET_LIP_CONTRACTION = 0.7;
export const SHEET_EDGE_BREAKUP = 1;
/**
 * Lateral twin of `aEndFade`: no drawn quad may END on a cut edge inside the
 * jet. The stack already cross-fades along the ARC where pieces overlap; the
 * same has to be true across the width, because a piece is only ever a lamina
 * of the jet. Measured: the bright core layer (`SHEET_LAYERS[2]`,
 * widthScale 0.55) stops at u = 0.775, where the jet profile is still 0.58
 * thick — it drew its own hard-sided rectangle, inset a fifth of the width,
 * as the BRIGHTEST layer. That is the straight vertical side. Each lamina now
 * fades over the outer quarter of its own across-coordinate; the lateral
 * copies overlap by 2x, so the plateau is unchanged where they add.
 */
export const SHEET_LATERAL_FADE = 0.25;
/** The top edge of the sheet fades in over this much arc (it lies on the water
 * `CREST_BACK_M` upstream of the lip), so the body has no straight top line. */
export const SHEET_CREST_FEATHER_M = 0.6;
/**
 * THE BRINK — why the crest is no longer a horizontal line drawn across the lip.
 *
 * `SHEET_CREST_FEATHER_M` is 0.6 m, about four pixels on a 16 m fall, so the
 * top of the body was a straight edge across the full width. The reference
 * frames' lip is a notch between rocks: the crest is as irregular as the stone
 * it leaves. That is not noise to be invented — the terrain is there to be
 * sampled, and it is NOT flat. Measured across the sixteen compiled lips
 * (refined height raster, 3.66 m/px, 17 stations spanning the trench) the
 * ground varies bank to bank by 0.68 m (fall-11) to 13.73 m (fall-8), median
 * ~3.1 m; nine of the sixteen have a shoulder standing ≥ 0.3 m above the
 * lowest column of their own lip. So there is a notch to find.
 *
 * What is measured is the rock's RELIEF across the lip, `ground(u) − min
 * ground`, not `ground(u) − lip.y`. Two reasons, both measured:
 *  - the lip's own y and the height raster are registered on different grids
 *    and at 3.66 m/px, so the absolute difference carries a per-site offset
 *    (fall-0 reads its whole lip line 3.3 m "proud", which would delete the
 *    fall); the relief cancels it.
 *  - beyond the banks the ground is the CLIFF FACE below the lip, so
 *    `lip.y − ground` grows to tens of metres out there and would make the
 *    jet thickest at its edges — the exact opposite of a notch.
 *
 * The relief becomes `crestArcM(u)`, capped at `BRINK_MAX_ARC_M`: a column
 * whose stone stands that far proud of the notch floor carries no water at the
 * lip, and the body only appears that far down the arc, once the nappe has
 * spread. The water's LATERAL extent stays a flow property (the compiler's
 * `wettedWidthM`), but it is centred on the lowest column of the measured lip
 * — the water runs in the notch, not down the middle of the trench.
 *
 * Without a ground sampler the crest delay is 0 and the centre is the trench's,
 * so the code is unchanged against hosts that cannot supply terrain.
 */
export const BRINK_STATIONS = 17;
/** Cap on the crest delay a proud shoulder imposes (m of arc). */
export const BRINK_MAX_ARC_M = 6;
/** Relief below this reads as a clean sill, not a notch (m) — one raster
 * texel of bilinear ripple on a 3.66 m grid is a few centimetres. */
export const BRINK_FLAT_M = 0.15;
/**
 * Aeration model (free flight). Air entrainment on a plunging jet grows with
 * how far the jet has travelled AND how fast it is going — the entrained
 * volume scales with the jet's surface interaction, so the natural variable is
 * the product `fallenM * speedMS` (m²/s), not the fraction of the drop. That
 * matters here: `frac` is per-site by construction, so a 6.5 m fall and a
 * 131 m fall used to reach the same whiteness at the same fraction of their
 * height, which is physically wrong and needed a per-site constant to hide.
 * With this form the short fall stays greyer at its foot and the tall one is
 * saturated a fifth of the way down, from one law.
 *
 *   aeration = LIP + (MAX − LIP) · (1 − exp(−fallenM · speedMS / SCALE))
 *
 * `LIP` is the broken water already coming over the lip; `SCALE` is set so a
 * 6.5 m fall (foot speed ~11 m/s) reaches ~0.75 and a 25 m fall (~22 m/s) is
 * effectively saturated by two thirds of the way down.
 */
export const AERATION_LIP = 0.55;
export const AERATION_MAX = 0.99;
export const AERATION_SCALE_M2S = 120;
/**
 * Body colour endpoints. The un-aerated end is LIT river water in daylight,
 * not deep water: a falling sheet is a thin, sunlit skin of water, and the old
 * (0.30, 0.42, 0.46) deep-water end is what made the body render as a dark
 * ribbon between the bright river above it and the bright pool foam below it
 * (probe 2026-09-08: fall/foam luminance x0.55). Fully aerated water is white.
 */
export const SHEET_WATER_ALBEDO = [0.55, 0.62, 0.66] as const;
/** The impact zone: over the last metres of arc the body goes fully white and
 * opaque, the way the vanilla skirt's foam covers the bottom 3.5 m — the pool
 * foam past the foot is solid white, and the join must not step. */
export const SHEET_FOOT_FOAM_M = 3.5;
/** Front/back layer separation — the thickness illusion. */
export const SHEET_THICKNESS_M = 0.25;
/**
 * Three body layers (owner refinement): a falling sheet has to read as a
 * plunging VOLUME. Front and back give the 0.25 m thickness; a narrower,
 * brighter core down the middle of the flow gives the body its mass.
 *
 * The back layer's tint was 0.55. With `depthWrite` off the three layers
 * composite in arbitrary order, so a back layer at nearly half brightness
 * darkened the composite wherever it landed on top — the second half of the
 * dark-ribbon defect. Aerated water is not darker on its far side; the back
 * layer is only slightly shaded, enough to read as thickness.
 */
export const SHEET_LAYERS = [
  { offsetM: 0, widthScale: 1, tint: 1 },
  { offsetM: -SHEET_THICKNESS_M, widthScale: 1, tint: 0.8 },
  { offsetM: SHEET_THICKNESS_M * 0.5, widthScale: 0.55, tint: 1.15 },
] as const;
/**
 * Vanilla thin-sheet families (vault audit §2.2; `NNNNxNNN` = drop x width
 * in game units at 70.03 u/m): 512x128, 2048x512, 3072x256, 4096x256.
 * A fall picks the smallest family that spans its drop, the tallest beyond.
 */
export const SHEET_PIECE_FAMILIES = [
  { heightM: 7.5, widthM: 1.83 },
  { heightM: 29, widthM: 7.3 },
  { heightM: 44, widthM: 3.66 },
  { heightM: 58, widthM: 3.66 },
] as const;
export type SheetPieceFamily = (typeof SHEET_PIECE_FAMILIES)[number];
/** Successive pieces overlap by this fraction of a piece (stack at 2/3 H). */
export const SHEET_PIECE_OVERLAP = 1 / 3;
/** Lateral copies are spaced half a piece width apart (~2x width overlap). */
export const SHEET_LATERAL_OVERLAP = 2;
/** Layer index of the mirrored side strips. */
export const SIDE_STRIP_LAYER = 3;
/** Side strip width at the foot of the fall (m); it pinches to 10 % at the lip. */
export const SIDE_STRIP_M = 0.6;
export const SIDE_STRIP_PINCH = 0.1;
/**
 * Per-layer alpha and soft-particle fade depth (m), from `softFalloffDepth`:
 * 75 u = 1.07 m on the spray (side strips) (vault audit §4 rule 5).
 *
 * The three BODY layers carried the sheets' measured 0.57 m and it was the
 * larger half of the dark-ribbon defect. `airM` is measured against the ground
 * profile UNDER the arc, so on a 74–88° cliff a sheet standing off the face by
 * centimetres still reports metres of air (the ground below it is the cliff
 * base). The fade therefore switched fully ON while the scene depth behind the
 * fragment was the rock face a few centimetres away — alpha x smoothstep(0,
 * 0.57, ~0.1) ≈ 0.1, so the body rendered as a ~10 % veil over dark rock.
 *
 * A plunging body is opaque water, not a particle card: it does not fade
 * because a wall is behind it. The soft fade is only for genuine soft cards,
 * so it now applies to the spray strips alone (0 = off). The body's two real
 * cut lines are already handled physically: the foot dissolves along its ARC
 * (`SHEET_FOOT_DISSOLVE_M`) and a bed-following reach is excluded by `airM`.
 */
export const SHEET_LAYER_ALPHA = [1, 0.68, 0.85, 0.7] as const;
export const SHEET_DEPTH_FADE_M = [0, 0, 0, 1.07] as const;
/**
 * Unlit emissive multiple: unit white in free fall, 0.75 on a chute reach.
 * The spray-class side strips took the thin sheets' 0.70 grey x 0.75 = 0.53,
 * but that 0.70 is a vanilla MATERIAL colour multiplied by a bright spray
 * texture; our procedural stand-in has no texture to put the light back, so at
 * 0.53 the feathered edge read as a grey fringe on a grey cliff instead of
 * spray. 0.80 is the same 0.75 chute multiple applied to spray-white.
 */
export const SHEET_EMISSIVE = { free: 1.0, chute: 0.75, side: 0.8 } as const;
/** View-angle falloff: opacity 1 → 0 between cos 0.26 and cos 0.09 (≈75°→85°
 * from the normal; vault audit §7) — edge-on layers fade out. */
export const SHEET_FACING_FADE = { start: 0.09, full: 0.26 } as const;
/**
 * Hard bounds on one traced path, independent of the cascade record: the
 * trace also stops at the end of the exported profile, but a record with a
 * kilometres-long profile (or a stalled arc) must still cost O(steps), never
 * grow without limit. Longest shipped path (fall-33, 259 m drop) is ~700 points.
 */
export const MAX_TRACE_STEPS = 4096;
export const MAX_TRACE_RUN_M = 1500;
const MAX_FALL_SPEED_MS = 40;
/**
 * Water running ON the bed loses energy to friction and aeration; only free
 * flight converts drop into speed cleanly. Without this a long chute reached
 * ~28 m/s and the next bump launched it into a 20 m flat ballistic plate that
 * never came back down.
 */
export const CHUTE_DROP_EFFICIENCY = 0.4;
/** Hard cap on bed-following speed (m/s) — a rapid, not a railgun. */
export const MAX_CHUTE_SPEED_MS = 12;
/** Consecutive path points closer than this cannot make a drawable quad. */
export const MIN_QUAD_LENGTH_M = 1e-4;
/** Air under the sheet before a reach counts as free flight rather than chute. */
export const FREE_FLIGHT_MIN_AIR_M = 0.5;
/** ... and that much air must persist over this much contiguous arc. */
export const FREE_FLIGHT_MIN_SPAN_M = 3;
/** A strip `lip`/`plunge` end within this distance of a cascade's own point
 * is the same point: the sheet snaps to it exactly. */
export const STRIP_ALIGN_TOLERANCE_M = 3;

export interface FallPathPoint {
  /** Distance from the lip along the horizontal direction (m); negative upstream. */
  s: number;
  x: number; y: number; z: number;
  /** Water speed along the path here (m/s). */
  speedMS: number;
  /** True where the water is in free flight rather than following ground. */
  free: boolean;
  /** Height above the ground it would otherwise hug (m). */
  airM: number;
}

/** Ground height (m) under a world point, or null where it is unknown. */
export type GroundSampler = (x: number, z: number) => number | null;

/**
 * The width the WATER occupies at the lip. `cascade.widthM` is the channel's
 * hydraulic width — bank to bank, `WIDTH_COEF · accum^WIDTH_EXP` — and the
 * water inside that trench does not fill it, which is why the sheet was drawn
 * as a curtain across the whole channel. The compiler ships `wettedWidthM`
 * (2026-09-09); until it does, the trench width stands in.
 */
export function cascadeWettedWidthM(fall: Cascade): number {
  const trench = Math.max(fall.widthM, 0.5);
  const wetted = fall.wettedWidthM;
  return wetted !== undefined && Number.isFinite(wetted) && wetted > 0
    ? Math.min(Math.max(wetted, 0.5), trench)
    : trench;
}

/** Per-column brink measurement across a lip (see `BRINK_STATIONS`). */
export interface BrinkProfile {
  /** Signed metres across the lip, trench centre 0, one per station. */
  acrossM: number[];
  /** Rock relief above the lowest column (m). */
  reliefM: number[];
  /** Metres of arc before water appears in this column: relief, capped. */
  crestArcM: number[];
  /** Signed metres across to the lowest column — the notch floor. */
  notchCentreM: number;
  /** Ground range across the lip (m) — the evidence a notch exists at all. */
  groundRangeM: number;
}

export interface FallPath {
  id: string;
  points: FallPathPoint[];
  /** The rock across the lip, when a ground sampler was supplied. */
  brink?: BrinkProfile;
  /** The channel's hydraulic (bank-to-bank) width (m) — the TRENCH. */
  trenchWidthM: number;
  /** True only when the water is in the air by ≥ `FREE_FLIGHT_MIN_AIR_M`
   * over a contiguous ≥ `FREE_FLIGHT_MIN_SPAN_M` of arc. A ramp is false and
   * is drawn as a chute strip, never as a fall body. */
  freeFlight: boolean;
  /** Longest contiguous arc (m) with that much air under the sheet. */
  freeSpanM: number;
  dropM: number;
  /** The DRAWN width (m): the wetted width, not the trench. */
  widthM: number;
  /** The cascade as traced (after strip alignment). */
  cascade: Cascade;
}

/**
 * Measure the rock across a lip. Stations span the TRENCH (the rock edge is a
 * property of the channel, not of the water in it); the water's own extent is
 * then whatever part of that span is below the lip water level.
 */
export function measureBrink(fall: Cascade, ground: GroundSampler,
  stations = BRINK_STATIONS): BrinkProfile | undefined {
  let dx = fall.direction.x;
  let dz = fall.direction.z;
  const dl = Math.hypot(dx, dz);
  if (!(dl > 1e-6)) return undefined;
  dx /= dl; dz /= dl;
  const nx = -dz;
  const nz = dx;
  const trench = Math.max(fall.widthM, 0.5);
  const acrossM: number[] = [];
  const groundM: number[] = [];
  for (let i = 0; i < stations; i++) {
    const u = stations === 1 ? 0 : i / (stations - 1);
    const a = (u - 0.5) * trench;
    const g = ground(fall.lip.x + nx * a, fall.lip.z + nz * a);
    if (g === null || !Number.isFinite(g)) return undefined;
    acrossM.push(a);
    groundM.push(g);
  }
  const gMin = Math.min(...groundM);
  const gMax = Math.max(...groundM);
  const notchCentreM = acrossM[groundM.indexOf(gMin)];
  const reliefM = groundM.map((g) => g - gMin);
  // A lip flat to within BRINK_FLAT_M is a clean sill: no crest delay at all
  // (and the notch centre is meaningless, so it is not used either).
  const flat = gMax - gMin <= BRINK_FLAT_M;
  const crestArcM = reliefM.map((r) => (flat ? 0 : Math.min(Math.max(r - BRINK_FLAT_M, 0), BRINK_MAX_ARC_M)));
  return { acrossM, reliefM, crestArcM, notchCentreM: flat ? 0 : notchCentreM, groundRangeM: gMax - gMin };
}

/** Linear interpolation of a per-station brink term at signed metres across. */
export function brinkAt(profile: BrinkProfile, term: "reliefM" | "crestArcM", acrossM: number): number {
  const xs = profile.acrossM;
  const ys = profile[term];
  if (acrossM <= xs[0]) return ys[0];
  if (acrossM >= xs[xs.length - 1]) return ys[ys.length - 1];
  const span = xs[1] - xs[0];
  const f = (acrossM - xs[0]) / span;
  const i = Math.min(Math.floor(f), xs.length - 2);
  const t = f - i;
  return ys[i] * (1 - t) + ys[i + 1] * t;
}

function terrainSampler(fall: Cascade): (s: number) => number | null {
  const profile = fall.profile;
  const step = fall.profileStepM ?? 1;
  const start = fall.profileStartM ?? 0;
  if (!profile || profile.length < 2 || !(step > 0)) return () => null;
  const last = profile.length - 1;
  return (s: number) => {
    const f = (s - start) / step;
    if (f < 0) return profile[0];
    if (f >= last) return null; // past the exported profile: nothing to hug
    const i = Math.floor(f);
    const t = f - i;
    return profile[i] * (1 - t) + profile[i + 1] * t;
  };
}

/** Longest contiguous arc length (m) over which the sheet has ≥ `minAirM` under it. */
export function freeFlightSpanM(points: readonly FallPathPoint[], minAirM = FREE_FLIGHT_MIN_AIR_M): number {
  let best = 0;
  let run = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const q = points[i - 1];
    if (p.free && p.airM >= minAirM && q.airM >= minAirM) {
      run += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Alignment guard: when a compiled strip ends at a `lip` (or resumes at a
 * `plunge`) within `STRIP_ALIGN_TOLERANCE_M` of the cascade's own point, the
 * sheet is traced FROM that exact point, so the ribbon and the sheet meet
 * (attempt 2's misalignment would have failed this). Returns a copy.
 */
export function alignCascadeToStrips(fall: Cascade, channels: readonly ChannelStrip[] | undefined,
  toleranceM = STRIP_ALIGN_TOLERANCE_M): Cascade {
  if (!channels?.length) return fall;
  let lip = fall.lip;
  let plunge = fall.plunge;
  let bestLip = toleranceM * toleranceM;
  let bestPlunge = toleranceM * toleranceM;
  for (const strip of channels) {
    const pts = strip.points;
    if (!pts?.length) continue;
    const last = pts[pts.length - 1];
    if (last.kind === "lip") {
      const d = (last.x - fall.lip.x) ** 2 + (last.z - fall.lip.z) ** 2;
      if (d < bestLip) { bestLip = d; lip = { x: last.x, y: last.y, z: last.z }; }
    }
    const first = pts[0];
    if (first.kind === "plunge") {
      const d = (first.x - fall.plunge.x) ** 2 + (first.z - fall.plunge.z) ** 2;
      if (d < bestPlunge) { bestPlunge = d; plunge = { x: first.x, y: first.y, z: first.z }; }
    }
  }
  if (lip === fall.lip && plunge === fall.plunge) return fall;
  return { ...fall, lip, plunge };
}

/** Ballistic sheet path from the lip, clamped onto the exported ground profile. */
export function traceWaterfallSheet(fall: Cascade,
  options: { stepM?: number; groundHeightM?: GroundSampler } = {}): FallPath {
  const stepM = Math.min(Math.max(options.stepM ?? 0.5, 0.05), 5);
  let dx = fall.direction.x;
  let dz = fall.direction.z;
  let dl = Math.hypot(dx, dz);
  if (!(dl > 1e-6)) {
    dx = fall.plunge.x - fall.lip.x;
    dz = fall.plunge.z - fall.lip.z;
    dl = Math.hypot(dx, dz) || 1;
  }
  dx /= dl; dz /= dl;
  const at = (s: number, y: number): Omit<FallPathPoint, "speedMS" | "free" | "airM"> =>
    ({ s, x: fall.lip.x + dx * s, y, z: fall.lip.z + dz * s });
  const ground = terrainSampler(fall);
  const v0 = Math.max(fall.lipSpeedMS ?? 0, MIN_LIP_SPEED_MS);
  const plungeY = fall.plunge.y;

  const points: FallPathPoint[] = [
    { ...at(-CREST_BACK_M, fall.lip.y), speedMS: v0, free: false, airM: 0 },
    { ...at(0, fall.lip.y), speedMS: v0, free: false, airM: 0 },
  ];

  let s = 0;
  let y = fall.lip.y;
  let vs = v0;      // horizontal speed
  let vy = 0;       // vertical speed (negative = falling)
  let free = true;
  /** Re-seat the water on the bed: speed grows with the height just lost. */
  const attach = (run: number, drop: number, speed: number) => {
    const newSpeed = Math.min(
      Math.sqrt(speed * speed + 2 * GRAVITY_MPS2 * Math.max(drop, 0) * CHUTE_DROP_EFFICIENCY),
      MAX_CHUTE_SPEED_MS, MAX_FALL_SPEED_MS);
    const len = Math.hypot(run, drop) || 1;
    vs = (newSpeed * run) / len;
    vy = (-newSpeed * drop) / len;
  };
  for (let step = 0; step < MAX_TRACE_STEPS; step++) {
    const speed = Math.max(Math.hypot(vs, vy), 0.05);
    let ns: number;
    let ny: number;
    let air = 0;
    if (free) {
      const dt = Math.min(stepM / speed, 0.2);
      ns = s + Math.max(vs * dt, 1e-3);
      ny = y + vy * dt - 0.5 * GRAVITY_MPS2 * dt * dt;
      const g = ground(ns);
      if (g === null) { points.push({ ...at(ns, ny), speedMS: speed, free, airM: 0 }); break; }
      const floorM = g + GROUND_CLEARANCE_M;
      if (ny < floorM) {
        // The arc met the bed: from here the water is a chute, not a fall.
        ny = floorM;
        free = false;
        attach(ns - s, y - ny, speed);
      } else {
        vy -= GRAVITY_MPS2 * dt;
        air = ny - floorM;
      }
    } else {
      ns = s + stepM;
      const g = ground(ns);
      if (g === null) { points.push({ ...at(ns, y), speedMS: speed, free, airM: 0 }); break; }
      const floorM = g + GROUND_CLEARANCE_M;
      // Launch test: hold the current heading for one step and see whether the
      // bed falls away from under it. (Comparing the arc against the NEXT bed
      // height is the only test that can fire — a path re-seated on the bed
      // every step is by construction never above it.)
      const dtFree = stepM / Math.max(vs, 0.05);
      const yFree = y + vy * dtFree - 0.5 * GRAVITY_MPS2 * dtFree * dtFree;
      if (yFree > floorM + 0.02) {
        ny = yFree;
        vy -= GRAVITY_MPS2 * dtFree;
        free = true;
        air = ny - floorM;
      } else {
        ny = floorM;
        attach(ns - s, y - ny, speed);
      }
    }
    s = ns;
    y = ny;
    points.push({ ...at(s, y), speedMS: Math.min(Math.hypot(vs, vy), MAX_FALL_SPEED_MS), free,
      airM: Math.max(air, 0) });
    // The sheet ends where it reaches the receiving level. A bed-following
    // reach sits GROUND_CLEARANCE_M above the bed, so test against that too —
    // otherwise a landed sheet ran on along the pool floor to the end of the
    // exported profile (54 m of path for a 20 m fall).
    if (y <= plungeY + GROUND_CLEARANCE_M + 1e-3) break;
    if (s >= MAX_TRACE_RUN_M) break;
  }

  const dropM = fall.lip.y - points[points.length - 1].y;
  const freeSpanM = freeFlightSpanM(points);
  const brink = options.groundHeightM ? measureBrink(fall, options.groundHeightM) : undefined;
  // The drawn width is the WATER's, not the trench's: the compiler's
  // `wettedWidthM` where it ships it, the trench where it does not.
  const wetted = cascadeWettedWidthM(fall);
  return {
    id: fall.id,
    points,
    brink,
    trenchWidthM: Math.max(fall.widthM, 0.5),
    freeFlight: freeSpanM >= FREE_FLIGHT_MIN_SPAN_M,
    freeSpanM,
    dropM,
    widthM: wetted,
    cascade: fall,
  };
}

/**
 * A ramp's path as a strip record for `buildChannelStripGeometry`: the same
 * ribbon the compiler's steep reaches use, shaded by ES_STRIP. Both ends are
 * `join`s (the first is the crest wrap upstream of the lip, on the field).
 */
export function chuteStripFromPath(path: FallPath): ChannelStrip {
  const fall = path.cascade;
  const last = path.points.length - 1;
  return {
    id: `${fall.id}:chute`,
    band: fall.riverBand,
    points: path.points.map((p, i) => ({
      x: p.x, z: p.z, y: p.y,
      bedY: p.y - GROUND_CLEARANCE_M - 0.05,
      halfWidthM: path.widthM * 0.5,
      speedMS: Math.max(p.speedMS, MIN_LIP_SPEED_MS),
      season: 0,
      kind: i === 0 || i === last ? "join" : "steep",
    })),
  };
}

export interface TracedCascades {
  /** Fall bodies: paths with real free flight. */
  sheets: FallPath[];
  /** Ramps, as strip records for the ES_STRIP ribbon mesh. */
  chutes: ChannelStrip[];
  /** Every traced path, by id (emitters spaced along a fall need the ramps too). */
  paths: FallPath[];
}

/** Trace, align to the strips and classify every compiled cascade once. */
export function traceCascades(cascades: readonly Cascade[],
  options: { stepM?: number; channels?: readonly ChannelStrip[]; groundHeightM?: GroundSampler } = {}): TracedCascades {
  const paths = cascades
    .filter((c) => Number.isFinite(c.dropM) && c.dropM >= MIN_CASCADE_DROP_M)
    .map((c) => traceWaterfallSheet(alignCascadeToStrips(c, options.channels), options))
    .filter((p) => p.points.length >= 2);
  return {
    sheets: paths.filter((p) => p.freeFlight),
    chutes: paths.filter((p) => !p.freeFlight).map(chuteStripFromPath),
    paths,
  };
}

/** The vanilla family for a drop: smallest piece that spans it, else the tallest. */
export function sheetPieceFamily(dropM: number): SheetPieceFamily {
  for (const f of SHEET_PIECE_FAMILIES) if (dropM <= f.heightM) return f;
  return SHEET_PIECE_FAMILIES[SHEET_PIECE_FAMILIES.length - 1];
}

export interface SheetPieceSpan {
  startM: number;
  endM: number;
  /** Overlap (m) with the neighbour above / below; 0 at the fall's ends. */
  overlapTopM: number;
  overlapBottomM: number;
}

/**
 * Piece spans down a path of `lengthM` for a family height: count =
 * ceil(length / (2/3 H)), piece k covers [k·2/3 H, k·2/3 H + H] clipped to the
 * path, so neighbours overlap by H/3 (the vanilla stacking, audit §5).
 */
export function sheetPieceSpans(lengthM: number, heightM: number): SheetPieceSpan[] {
  const step = heightM * (1 - SHEET_PIECE_OVERLAP);
  // one piece when it spans the path; otherwise enough that the last piece's
  // foot reaches the end (never a short stub that is all overlap)
  const count = lengthM <= heightM ? 1 : Math.ceil((lengthM - heightM) / step) + 1;
  const spans: SheetPieceSpan[] = [];
  for (let k = 0; k < count; k++) {
    const startM = k * step;
    const endM = Math.min(startM + heightM, lengthM);
    if (endM - startM < 1e-6) break;
    spans.push({ startM, endM, overlapTopM: 0, overlapBottomM: 0 });
  }
  for (let k = 0; k < spans.length; k++) {
    if (k > 0) spans[k].overlapTopM = Math.max(spans[k - 1].endM - spans[k].startM, 0);
    if (k + 1 < spans.length) spans[k].overlapBottomM = Math.max(spans[k].endM - spans[k + 1].startM, 0);
  }
  return spans;
}

/**
 * Lateral piece centres (signed metres across) for a fall `widthM` wide built
 * from pieces `pieceWidthM` wide: one piece clipped to the fall when it fits,
 * otherwise copies spaced ≤ half a piece apart spanning the width, so every
 * point is under ~2 pieces.
 */
export function sheetLateralOffsets(widthM: number, pieceWidthM: number): { offsets: number[]; pieceWidthM: number } {
  if (widthM <= pieceWidthM) return { offsets: [0], pieceWidthM: widthM };
  const span = widthM - pieceWidthM;
  const count = Math.ceil(span / (pieceWidthM / SHEET_LATERAL_OVERLAP)) + 1;
  const offsets = Array.from({ length: count }, (_, i) => -span / 2 + (span * i) / (count - 1));
  return { offsets, pieceWidthM };
}

/** Deterministic per-piece scroll phase (s) in one breathe period. */
function piecePhaseS(id: string, k: number, lateral: number): number {
  let h = 0x811c9dc5;
  for (const ch of `${id}|${k}|${lateral}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h % 8330) / 1000;
}

export interface WaterfallSheetGeometry {
  geometry: THREE.BufferGeometry;
  fallCount: number;
  /** Piece copies (vertical spans x lateral copies) over every fall. */
  pieceCount: number;
  /** Per-fall piece and triangle counts (the budget the probe reports). */
  perFall: Record<string, { pieces: number; triangles: number }>;
  /** Mirrored side strips (two per fall). */
  sideStripCount: number;
  vertexCount: number;
  triangleCount: number;
  freeFlightCount: number;
  /** Zero-area quads dropped at build time (see `MIN_QUAD_LENGTH_M`). */
  skippedQuads: number;
  paths: FallPath[];
  chutes: ChannelStrip[];
}

/** All fall bodies in one geometry; ramps come back as `chutes` instead. */
export function buildWaterfallSheetGeometry(
  cascades: readonly Cascade[],
  options: { stepM?: number; channels?: readonly ChannelStrip[]; groundHeightM?: GroundSampler } = {},
): WaterfallSheetGeometry {
  const traced = traceCascades(cascades, options);
  const paths = traced.sheets;

  const position: number[] = [];
  const uv: number[] = [];
  const speed: number[] = [];
  const layer: number[] = [];
  const tint: number[] = [];
  const frac: number[] = [];
  const air: number[] = [];
  const slope: number[] = [];
  const piece: number[] = [];    // (piece start arc m, piece height m, scroll phase s)
  const pieceUv: number[] = [];  // the piece's own 0..1 rectangle
  const fade: number[] = [];     // cross-fade across piece overlaps
  // metres of arc the proud rock delays the crest by in this column (0
  // without a ground sampler, and 0 on a lip measured flat).
  const crestArc: number[] = [];
  const index: number[] = [];
  const perFall: WaterfallSheetGeometry["perFall"] = {};
  let pieceCount = 0;
  let sideStripCount = 0;
  let skippedQuads = 0;

  for (const path of paths) {
    const totalDrop = Math.max(path.dropM, 0.01);
    const pts = path.points;
    if (pts.length < 2) continue;
    const trisBefore = index.length / 3;
    const piecesBefore = pieceCount;
    // arc length from the crest wrap start (metres) drives every UV
    const along: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      along.push(along[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
    }
    const lengthM = along[along.length - 1];
    // Local descent slope (|dy| / path length) drives the whitewater term on
    // bed-following reaches: a chute is white because it is steep and fast,
    // not because it has fallen far.
    const slopeAt: number[] = [];
    const fracAt: number[] = [];
    const frames: { tx: number; tz: number; nx: number; nz: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(i - 1, 0)];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      const run = Math.hypot(b.x - a.x, b.z - a.z);
      const drop = Math.max(a.y - b.y, 0);
      slopeAt.push(drop / Math.max(Math.hypot(run, drop), 1e-6));
      fracAt.push(Math.min(Math.max((pts[0].y - pts[i].y) / totalDrop, 0), 1));
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const tl = Math.hypot(tx, tz);
      if (tl > 1e-6) { tx /= tl; tz /= tl; } else { tx = 1; tz = 0; }
      frames.push({ tx, tz, nx: -tz, nz: tx });
    }
    const bp = path.brink;
    const pushVertex = (i: number, x: number, z: number, u: number, l: number, t: number,
      pieceStartM: number, pieceHeightM: number, phaseS: number, endFade: number, pieceU: number,
      acrossM: number) => {
      const p = pts[i];
      position.push(x, p.y, z);
      uv.push(u, along[i]);
      speed.push(p.speedMS);
      layer.push(l);
      tint.push(t);
      frac.push(fracAt[i]);
      air.push(Math.max(p.airM, 0));
      slope.push(slopeAt[i]);
      piece.push(pieceStartM, pieceHeightM, phaseS);
      pieceUv.push(pieceU, Math.min(Math.max((along[i] - pieceStartM) / pieceHeightM, 0), 1));
      fade.push(endFade);
      // The rock across the lip, sampled at this vertex's own column.
      crestArc.push(bp ? brinkAt(bp, "crestArcM", acrossM) : 0);
    };
    const pushQuads = (base: number, first: number, last: number) => {
      for (let i = first; i < last; i++) {
        // A quad between two coincident path points has zero area: it draws
        // nothing but it does stack an extra transparent layer's worth of
        // alpha where the trace stalls. Skip it.
        const p = pts[i];
        const q = pts[i + 1];
        if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < MIN_QUAD_LENGTH_M) { skippedQuads++; continue; }
        const a = base + (i - first) * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    };

    // ---- the body: a stack of vanilla-sized pieces ----------------------
    const family = sheetPieceFamily(path.dropM);
    const spans = sheetPieceSpans(lengthM, family.heightM);
    const lateral = sheetLateralOffsets(path.widthM, family.widthM);
    // The water runs in the notch, not down the middle of the trench: the
    // drawn band is centred on the lowest measured column of the lip, held
    // inside the trench.
    const room = Math.max((path.trenchWidthM - path.widthM) * 0.5, 0);
    const notchShift = Math.min(Math.max(path.brink?.notchCentreM ?? 0, -room), room);
    for (let k = 0; k < spans.length; k++) {
      const span = spans[k];
      let first = 0;
      while (first + 1 < pts.length && along[first + 1] <= span.startM) first++;
      let last = first;
      while (last + 1 < pts.length && along[last] < span.endM) last++;
      if (last - first < 1) continue;
      const height = Math.max(span.endM - span.startM, 1e-3);
      const endFadeAt = (i: number) => {
        const a = along[i];
        let f = 1;
        if (span.overlapTopM > 0) f *= smoothstep(span.startM, span.startM + span.overlapTopM, a);
        if (span.overlapBottomM > 0) f *= smoothstep(span.endM, span.endM - span.overlapBottomM, a);
        return f;
      };
      for (let c = 0; c < lateral.offsets.length; c++) {
        pieceCount++;
        const phase = piecePhaseS(path.id, k, c);
        const centre = lateral.offsets[c];
        for (let l = 0; l < SHEET_LAYERS.length; l++) {
          const spec = SHEET_LAYERS[l];
          const base = position.length / 3;
          const half = lateral.pieceWidthM * 0.5 * spec.widthScale;
          const back = -spec.offsetM;
          for (let i = first; i <= last; i++) {
            const p = pts[i];
            const { tx, tz, nx, nz } = frames[i];
            const f = endFadeAt(i);
            for (const side of [-1, 1]) {
              const across = notchShift + centre + half * side;
              // u across the WHOLE fall for the width profile; the piece's own
              // 0..1 rectangle rides aPieceUv
              const uFall = Math.min(Math.max(0.5 + (across - notchShift) / path.widthM, 0), 1);
              pushVertex(i, p.x + nx * across - tx * back, p.z + nz * across - tz * back, uFall, l, spec.tint,
                span.startM, height, phase, f, side < 0 ? 0 : 1, across);
            }
          }
          pushQuads(base, first, last);
        }
      }
    }

    // ---- mirrored side strips for the whole fall: inner edge just inside
    // the sheet edge, outer edge flaring from 10 % of SIDE_STRIP_M at the lip
    // to the full width at the foot — the taper that reads as spray rather
    // than a cut card
    for (const side of [-1, 1]) {
      sideStripCount++;
      const base = position.length / 3;
      const half = path.widthM * 0.5;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const { nx, nz } = frames[i];
        const flare = SIDE_STRIP_M * (SIDE_STRIP_PINCH + (1 - SIDE_STRIP_PINCH) * fracAt[i]);
        const inner = notchShift + half * 0.85 * side;
        const outer = notchShift + (half + flare) * side;
        pushVertex(i, p.x + nx * inner, p.z + nz * inner, 0, SIDE_STRIP_LAYER, SHEET_EMISSIVE.side,
          0, Math.max(lengthM, 1e-3), 0, 1, 0, inner);
        pushVertex(i, p.x + nx * outer, p.z + nz * outer, 1, SIDE_STRIP_LAYER, SHEET_EMISSIVE.side,
          0, Math.max(lengthM, 1e-3), 0, 1, 1, outer);
      }
      pushQuads(base, 0, pts.length - 1);
    }
    perFall[path.id] = { pieces: pieceCount - piecesBefore, triangles: index.length / 3 - trisBefore };
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("aSheetUv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speed, 1));
  geometry.setAttribute("aLayer", new THREE.Float32BufferAttribute(layer, 1));
  geometry.setAttribute("aTint", new THREE.Float32BufferAttribute(tint, 1));
  geometry.setAttribute("aFrac", new THREE.Float32BufferAttribute(frac, 1));
  geometry.setAttribute("aAir", new THREE.Float32BufferAttribute(air, 1));
  geometry.setAttribute("aSlope", new THREE.Float32BufferAttribute(slope, 1));
  geometry.setAttribute("aPiece", new THREE.Float32BufferAttribute(piece, 3));
  geometry.setAttribute("aPieceUv", new THREE.Float32BufferAttribute(pieceUv, 2));
  geometry.setAttribute("aEndFade", new THREE.Float32BufferAttribute(fade, 1));
  geometry.setAttribute("aCrestArcM", new THREE.Float32BufferAttribute(crestArc, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return {
    geometry,
    fallCount: paths.length,
    pieceCount,
    perFall,
    sideStripCount,
    vertexCount: position.length / 3,
    triangleCount: index.length / 3,
    freeFlightCount: paths.length,
    skippedQuads,
    paths: traced.paths,
    chutes: traced.chutes,
  };
}


/* ------------------------------------------------------------------ *
 * Across-width, aeration and alpha twins.
 *
 * The shader and the TS twins below MUST stay in step: the twins are what
 * the unit tests measure, and `SHEET_PROFILE_GLSL` is the literal source the
 * fragment shader compiles. Edit both or neither.
 * ------------------------------------------------------------------ */

/** Jet width as a fraction of the compiled (foot) width: contracted at the
 * lip, full width once aerated. */
export function sheetJetSpread(aeration: number): number {
  const t = clamp01((aeration - AERATION_LIP) / (AERATION_MAX - AERATION_LIP));
  return SHEET_LIP_CONTRACTION + (1 - SHEET_LIP_CONTRACTION) * t;
}

/**
 * Cross-stream jet thickness at across-coordinate `u`, normalised to 1 at the
 * centre of an uncontracted jet: `(1 − x²)^{3/2}` over the jet's own width,
 * thinned by the spread (mass conservation). Zero at and beyond the edges, so
 * the mesh silhouette is never a cut line.
 */
export function sheetJetThickness(u: number, spread = 1): number {
  const s = Math.max(spread, 1e-3);
  const x = (clamp01(u) * 2 - 1) / s;
  const h = 1 - x * x;
  return h <= 0 ? 0 : Math.pow(Math.max(h, 0), 1.5) / s;
}

/**
 * Optical coverage across the width: Beer–Lambert on the jet thickness, with
 * the streak field weighted in as the thickness falls away (filament breakup).
 */
export function sheetCoverage(i: SheetSampleInput): number {
  const remainM = i.remainM ?? SHEET_FOOT_FOAM_M;
  const foot = 1 - smoothstep(SHEET_FOOT_DISSOLVE_M, SHEET_FOOT_FOAM_M, remainM);
  const aeration = Math.max(sheetAeration(i), foot);
  const t = sheetJetThickness(i.u, sheetJetSpread(aeration));
  const noise = clamp01(i.noise ?? 0.5);
  const breakup = clamp01(1 - t);
  const texture = Math.max(1 + breakup * SHEET_EDGE_BREAKUP * (2 * noise - 1), 0);
  return 1 - Math.exp(-SHEET_OPTICAL_K * t * aeration * texture);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

export interface SheetSampleInput {
  /** Across-width coordinate, 0..1. */
  u: number;
  /** Layer index: 0..2 body layers, 3 side strip. */
  layer: number;
  /** Fraction of the total drop already fallen, 0..1 (side-strip pinch/flare). */
  frac: number;
  /** Metres actually fallen from the lip — the aeration variable. */
  fallenM?: number;
  /** Local water speed (m/s). */
  speedMS: number;
  /** Local descent slope, 0 (flat) .. 1 (sheer). */
  slope: number;
  /** Air under the sheet (m); 0 where it is running on the bed. */
  airM: number;
  /** True in free flight. */
  free: boolean;
  /** Combined streak+churn noise, 0..1 (the shader's animated term). */
  noise?: number;
  /** Scene depth behind the fragment minus fragment depth (m). */
  depthDeltaM?: number;
  /** |dot(face normal, view)|: 1 face-on, 0 edge-on. */
  facing?: number;
  opacity?: number;
  /** Metres of path left below this point (the foot dissolve); omitted = far from the foot. */
  remainM?: number;
  /** Metres of arc from the top of the sheet (the crest feather); omitted = far from the crest. */
  arcM?: number;
  /** Whiteness 0..1 (the shader's `white`); omitted = derived from the aeration. */
  white?: number;
  /** Metres of arc the proud rock delays the crest by in this column. */
  crestArcM?: number;
}

/**
 * Aeration (0..1): how white the water is here. Free flight uses the physical
 * entrainment law above — metres actually fallen x local speed — so no term in
 * it is per-site. A chute is aerated by local speed and steepness instead.
 */
export function sheetAeration(i: Pick<SheetSampleInput, "free" | "speedMS" | "slope"> & { fallenM?: number }): number {
  if (i.free) {
    const n = Math.max(i.fallenM ?? 0, 0) * Math.max(i.speedMS, 0) / AERATION_SCALE_M2S;
    return clamp01(AERATION_LIP + (AERATION_MAX - AERATION_LIP) * (1 - Math.exp(-n)));
  }
  // Whitewater: a chute is aerated by speed and steepness, all the way down.
  return clamp01(Math.min(0.42 + i.speedMS * 0.045 + smoothstep(0.08, 0.5, i.slope) * 0.45, 0.99));
}

/**
 * Whiteness (the shader's `white`): aeration, modulated only slightly by the
 * animated streak field and the width profile. It used to be
 * `aeration * (0.45 + 0.75 * streak) * (0.7 + 0.3 * profile)` — a product of
 * three sub-unity terms that pulled a fully aerated body down to ~0.2 and
 * parked its albedo at the deep-water end of the mix. Streaks are texture on
 * white water, not a brightness switch.
 */
export function sheetWhiteness(i: SheetSampleInput): number {
  if (i.white !== undefined) return clamp01(i.white);
  const noise = clamp01(i.noise ?? 0.5);
  // Same material as the strips: at the core the streak field is texture on
  // solid white water (0.85 + 0.15n), at the frayed margin it is the strips'
  // own law (0.35 + 0.65n), blended by how thin the jet is here. Two surfaces
  // that carry the same amplitude of the same noise read as one substance.
  const breakup = clamp01(1 - sheetJetThickness(i.u, sheetJetSpread(sheetAeration(i))));
  const streaked = (0.85 + 0.15 * noise) + breakup * ((0.35 + 0.65 * noise) - (0.85 + 0.15 * noise));
  return clamp01(sheetAeration(i) * streaked);
}

/** Body albedo (linear RGB) at a whiteness: lit water → white as it aerates. */
export function sheetAlbedo(white: number): [number, number, number] {
  const w = clamp01(white);
  return [
    SHEET_WATER_ALBEDO[0] + (1 - SHEET_WATER_ALBEDO[0]) * w,
    SHEET_WATER_ALBEDO[1] + (1 - SHEET_WATER_ALBEDO[1]) * w,
    SHEET_WATER_ALBEDO[2] + (1 - SHEET_WATER_ALBEDO[2]) * w,
  ];
}

/** Unlit emissive multiple: 1.0 in free fall, 0.75 running on rock (§2.4). */
export function sheetEmissive(free: boolean): number {
  return free ? SHEET_EMISSIVE.free : SHEET_EMISSIVE.chute;
}

/** Crest foam boost, 1 over the wrap and the first `CREST_FOAM_M` past the lip. */
export function sheetCrestBoost(arcM: number): number {
  return 1 - smoothstep(CREST_BACK_M, CREST_BACK_M + CREST_FOAM_M, arcM);
}

/** Side-strip texture pinch: the across coordinate converges toward the top. */
export function sideStripPinchedU(u: number, frac: number): number {
  return 0.5 + (u - 0.5) * (0.2 + 0.8 * clamp01(frac));
}

/** The fragment shader's alpha, minus tone mapping — the twin the tests read. */
export function sheetAlpha(i: SheetSampleInput): number {
  const l = Math.min(Math.max(Math.round(i.layer), 0), SHEET_LAYER_ALPHA.length - 1);
  const remainM = i.remainM ?? SHEET_FOOT_FOAM_M;
  // Opacity is Beer–Lambert on the jet's own cross-stream thickness — dense
  // core, feathering to nothing at the edges — not a flat aeration floor
  // spread edge to edge across the compiled width.
  let alpha = (i.opacity ?? 1) * sheetCoverage(i) * SHEET_LAYER_ALPHA[l];
  alpha *= smoothstep(0, SHEET_FOOT_DISSOLVE_M, remainM);
  // The crest follows the rock it leaves: in a column where the stone stands
  // proud of the lip the water only appears `crestArcM` further down the arc,
  // so a notched brink is pinched and a clean sill is not.
  if (i.arcM !== undefined) {
    alpha *= smoothstep(0, SHEET_CREST_FEATHER_M, i.arcM - (i.crestArcM ?? 0));
  }
  // faces seen edge-on fade out (no hard silhouette cut)
  alpha *= smoothstep(SHEET_FACING_FADE.start, SHEET_FACING_FADE.full, i.facing ?? 1);
  // Soft particle, but only where there IS air behind the sheet. Water running
  // on the bed is in contact with it and must not fade against it.
  const fadeM = SHEET_DEPTH_FADE_M[l];
  if (fadeM > 0) {
    const freeness = smoothstep(0.15, 1.2, i.airM);
    const depthFade = smoothstep(0, fadeM, i.depthDeltaM ?? 0);
    alpha *= 1 + freeness * (depthFade - 1);
  }
  return clamp01(alpha);
}

function clamp01(v: number): number { return Math.min(Math.max(v, 0), 1); }

/** Compiled into the fragment shader; twin of the functions above. */
export const SHEET_PROFILE_GLSL = /* glsl */ `
// KEEP IN LOCKSTEP with sheetJetSpread / sheetJetThickness / sheetCoverage
float esSheetJetSpread(float aeration){
  float t = clamp((aeration - ${AERATION_LIP.toFixed(2)})
    / ${(AERATION_MAX - AERATION_LIP).toFixed(2)}, 0.0, 1.0);
  return mix(${SHEET_LIP_CONTRACTION.toFixed(2)}, 1.0, t);
}
float esSheetJetThickness(float u, float spread){
  float s = max(spread, 1e-3);
  float x = (clamp(u, 0.0, 1.0) * 2.0 - 1.0) / s;
  float h = 1.0 - x * x;
  return h <= 0.0 ? 0.0 : pow(max(h, 0.0), 1.5) / s;
}
float esSheetCoverage(float u, float aeration, float noise){
  float t = esSheetJetThickness(u, esSheetJetSpread(aeration));
  float breakup = clamp(1.0 - t, 0.0, 1.0);
  float texture_ = max(1.0 + breakup * ${SHEET_EDGE_BREAKUP.toFixed(2)} * (2.0 * clamp(noise, 0.0, 1.0) - 1.0), 0.0);
  return 1.0 - exp(-${SHEET_OPTICAL_K.toFixed(4)} * t * aeration * texture_);
}
float esSheetAeration(float free, float speed, float fallenM, float slope){
  float jet = ${AERATION_LIP.toFixed(2)} + ${(AERATION_MAX - AERATION_LIP).toFixed(2)}
    * (1.0 - exp(-max(fallenM, 0.0) * max(speed, 0.0) / ${AERATION_SCALE_M2S.toFixed(1)}));
  float air = free > 0.5
    ? jet
    : min(0.42 + speed * 0.045 + smoothstep(0.08, 0.5, slope) * 0.45, 0.99);
  return clamp(air, 0.0, 1.0);
}
vec3 esSheetAlbedo(float white){
  return mix(vec3(${SHEET_WATER_ALBEDO[0].toFixed(2)}, ${SHEET_WATER_ALBEDO[1].toFixed(2)},
    ${SHEET_WATER_ALBEDO[2].toFixed(2)}), vec3(1.0), clamp(white, 0.0, 1.0));
}
float esSheetCrest(float arcM){
  return 1.0 - smoothstep(${CREST_BACK_M.toFixed(2)}, ${(CREST_BACK_M + CREST_FOAM_M).toFixed(2)}, arcM);
}
float esSheetLayerAlpha(float layer){
  return layer < 0.5 ? ${SHEET_LAYER_ALPHA[0].toFixed(2)} : (layer < 1.5 ? ${SHEET_LAYER_ALPHA[1].toFixed(2)}
    : (layer < 2.5 ? ${SHEET_LAYER_ALPHA[2].toFixed(2)} : ${SHEET_LAYER_ALPHA[3].toFixed(2)}));
}
float esSheetDepthFadeM(float layer){
  return layer < 0.5 ? ${SHEET_DEPTH_FADE_M[0].toFixed(2)} : (layer < 1.5 ? ${SHEET_DEPTH_FADE_M[1].toFixed(2)}
    : (layer < 2.5 ? ${SHEET_DEPTH_FADE_M[2].toFixed(2)} : ${SHEET_DEPTH_FADE_M[3].toFixed(2)}));
}
`;

const SHEET_VERTEX = /* glsl */ `
attribute vec2 aSheetUv;
attribute float aSpeed;
attribute float aLayer;
attribute float aTint;
attribute float aFrac;
attribute float aAir;
attribute float aSlope;
attribute vec3 aPiece;
attribute vec2 aPieceUv;
attribute float aEndFade;
attribute float aCrestArcM;
varying float vCrestArcM;
varying vec2 vSheetUv;
varying float vSpeed;
varying float vLayer;
varying float vTint;
varying float vFrac;
varying float vAir;
varying float vSlope;
varying vec3 vPiece;
varying vec2 vPieceUv;
varying float vEndFade;
varying vec3 vWorldPos;
uniform float uVerticalScale;
${FALLS_SHADOW_VERTEX_PARS}
void main() {
  vSheetUv = aSheetUv;
  vCrestArcM = aCrestArcM;
  vPiece = aPiece;
  vPieceUv = aPieceUv;
  vEndFade = aEndFade;
  vSpeed = aSpeed;
  vLayer = aLayer;
  vTint = aTint;
  vFrac = aFrac;
  vAir = aAir;
  vSlope = aSlope;
  vec3 transformed = vec3(position.x, position.y * uVerticalScale, position.z);
  vec3 esShadowVertex = transformed;
  ${FALLS_SHADOW_VERTEX}
  vWorldPos = worldPosition.xyz;
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SHEET_FRAGMENT = /* glsl */ `
precision highp float;
varying float vCrestArcM;
varying vec2 vSheetUv;
varying float vSpeed;
varying float vLayer;
varying float vTint;
varying float vFrac;
varying float vAir;
varying float vSlope;
varying vec3 vPiece;
varying vec2 vPieceUv;
varying float vEndFade;
varying vec3 vWorldPos;
uniform float uTime;
uniform vec3 uAmbient;
uniform vec3 uSunLight;
uniform vec3 uSunDir;
uniform sampler2D uSceneDepth;
uniform float uHasDepth;
uniform float uCamNear;
uniform float uCamFar;
uniform vec2 uResolution;
uniform float uOpacity;
uniform float uUnderwater;
uniform float uSurfaceY;
#include <common>
${FALLS_SHADOW_FRAGMENT_PARS}
${WHITEWATER_GLSL}
${SHEET_PROFILE_GLSL}

void main() {
  // Streaks: three layers scrolled DOWN THE SHEET'S OWN ARC (aSheetUv.y is
  // metres from the crest) at the measured 0.313 / 0.857 / 0.075 tiles/s x
  // speed gain, plus the U drift and U-scale breathing (whitewaterStreaks.ts).
  // Never world position x time.
  float arc = vSheetUv.y;
  float gain = esStreakGain(vSpeed);
  bool sideStrip = vLayer > 2.5;
  // side strips pinch their texture in toward the top (Taiji)
  float u = sideStrip ? 0.5 + (vSheetUv.x - 0.5) * (0.2 + 0.8 * vFrac) : vSheetUv.x;
  // each piece scrolls its OWN rectangle (arc from the piece top, own phase)
  // so stacked and side-by-side copies never move in lockstep; the width
  // profile still spans the whole fall
  float pieceArc = arc - vPiece.x;
  float foam;
  float streak = esWhitewater(sideStrip ? u : vPieceUv.x, sideStrip ? arc : pieceArc, uTime + vPiece.z, gain, vFrac, foam);

  // Aeration: free flight entrains air with the distance fallen; a chute is
  // aerated by local speed and steepness instead, so it stays white end to end.
  float freeHere = step(0.15, vAir);
  // metres actually fallen from the lip (the sheet starts CREST_BACK_M upstream
  // of it): the aeration variable, so the law is the same on every fall
  float fallenM = max(arc - ${CREST_BACK_M.toFixed(2)}, 0.0);
  float aeration = esSheetAeration(freeHere, vSpeed, fallenM, vSlope);
  // crest wrap: foam to ~1 over the wrap and the first 1.5 m past the lip
  float crest = esSheetCrest(arc);
  // the impact zone: solid white over the last metres of arc (arc / frac = the whole path)
  float remainM = arc * (1.0 / max(vFrac, 1e-3) - 1.0);
  float foot = 1.0 - smoothstep(${SHEET_FOOT_DISSOLVE_M.toFixed(2)}, ${SHEET_FOOT_FOAM_M.toFixed(2)}, remainM);
  aeration = max(aeration, foot);
  // Cross-stream jet thickness: the body is a ribbon with a dense core that
  // feathers to nothing at both edges, not a slab the full compiled width.
  float jetT = esSheetJetThickness(vSheetUv.x, esSheetJetSpread(aeration));
  float breakup = clamp(1.0 - jetT, 0.0, 1.0);
  // Same material as the strips: streak texture on solid white at the core,
  // the strips' own 0.35 + 0.65 amplitude out where the nappe frays.
  float white = clamp(aeration * mix(0.85 + 0.15 * streak, 0.35 + 0.65 * streak, breakup), 0.0, 1.0);
  white = max(white, crest * (0.75 + 0.25 * foam));
  white = max(white, foot * (1.0 - breakup));
  // Unlit aerated shading (research §2.4): emissive white x1.0 in free fall,
  // x0.75 on a chute reach; no normal term, no refraction, no shore terms.
  // The sky + sun irradiance scales it so the HDR frame exposes it like foam.
  float emissive = mix(${SHEET_EMISSIVE.chute.toFixed(2)}, ${SHEET_EMISSIVE.free.toFixed(2)}, freeHere);
  vec3 albedo = esSheetAlbedo(white);
  float churn = smoothstep(0.35, 0.85, foam);
  albedo = mix(albedo, vec3(1.0), churn * aeration * 0.4);
  // the additive crest accent (Bethesda's one SRC_ALPHA/ONE layer) at 0.25
  albedo += crest * foam * 0.25;
  albedo *= emissive * vTint;          // back layer darker, core brighter
  // Lit like the white water it is: the shared irradiance (whitewaterStreaks)
  // undoes the runtime's aerial feed scaling, so the fall, its pool foam, its
  // mist and the strip whitewater upstream all expose as one thing.
  // the fall takes the scene's own sun shadow (CSM cascades): a gorge fall is
  // not lit as if it stood in open sun. upness 0 = a near-vertical body.
  vec3 color = albedo * esFallsIrradianceG(uAmbient, uSunLight, uSunDir, 0.0, esFallsSunVisibility());

  float noise = clamp(streak + churn * 0.6, 0.0, 1.0);
  // Beer–Lambert on the jet's own thickness: an opaque core, feathering into
  // spray at both margins where the streak field carries the coverage. A flat
  // aeration floor across the compiled width is what made this read as a card.
  float alpha = uOpacity * esSheetCoverage(vSheetUv.x, aeration, noise) * esSheetLayerAlpha(vLayer);
  // dissolve into the plunge over the last metres of arc, and cross-fade
  // across each piece overlap (a third of a piece) so the stack reads as one
  alpha *= smoothstep(0.0, ${SHEET_FOOT_DISSOLVE_M.toFixed(2)}, remainM);
  // no straight top line: the sheet's top edge lies on the water upstream of
  // the lip, so it fades in over its first metre of arc
  // ...and it starts where the ROCK falls away: in a column whose stone
  // stands proud of the notch floor the water only appears vCrestArcM metres
  // of arc further down (measured across the lip; 0 without a ground sampler
  // and 0 on a lip flat to BRINK_FLAT_M).
  alpha *= smoothstep(0.0, ${SHEET_CREST_FEATHER_M.toFixed(2)}, arc - vCrestArcM);
  alpha *= vEndFade;
  // ...and its lateral twin: a lamina never ends on a cut edge inside the jet
  // (not the spray strips: their inner edge abuts the sheet and must not gap)
  if (!sideStrip) alpha *= smoothstep(0.0, ${SHEET_LATERAL_FADE.toFixed(2)}, min(vPieceUv.x, 1.0 - vPieceUv.x));
  // view-angle falloff (measured 0.42/0.09): edge-on faces fade instead of
  // showing the silhouette as a hard cut
  vec3 faceN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  float facing = abs(dot(faceN, normalize(cameraPosition - vWorldPos)));
  alpha *= smoothstep(${SHEET_FACING_FADE.start.toFixed(2)}, ${SHEET_FACING_FADE.full.toFixed(2)}, facing);
  // Seen from under the pool: nothing of the falls kit is drawn. Below the
  // surface the plunging water is the bubble pass's job, never an opaque slab;
  // ABOVE it, an air-drawn sheet reaches a submerged eye only through the
  // surface, and we render neither the refraction, the water column's
  // extinction, nor Snell's window (at the gorge probe's 30 deg up-pitch the
  // surface is past the 48.6 deg critical angle and is a mirror, so the fall
  // should not be visible at all). Drawing it raw painted the submerged frame.
  // What the surface shows from below belongs to the field water's below
  // variant; uSurfaceY is kept for that layer's own use.
  alpha *= 1.0 - clamp(uUnderwater, 0.0, 1.0);
  // Soft particle — but ONLY where there is air behind the sheet. Water running
  // on the bed sits GROUND_CLEARANCE_M above the terrain; fading it against
  // that terrain erased the middle of every chute and left its overhanging
  // edges bright, which is exactly backwards.
  float fadeM = esSheetDepthFadeM(vLayer);
  if (uHasDepth > 0.5 && fadeM > 0.0) {
    vec2 suv = gl_FragCoord.xy / uResolution;
    float d = texture2D(uSceneDepth, suv).x;
    float sceneEye = (uCamNear * uCamFar) / (uCamFar - d * (uCamFar - uCamNear));
    float fragEye = 1.0 / gl_FragCoord.w;
    float freeness = smoothstep(0.15, 1.2, vAir);
    alpha *= mix(1.0, smoothstep(0.0, fadeM, sceneEye - fragEye), freeness);
  }
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface WaterfallSheetUniforms {
  uTime: { value: number };
  uVerticalScale: { value: number };
  uAmbient: { value: THREE.Vector3 };
  uSunLight: { value: THREE.Vector3 };
  uSunDir: { value: THREE.Vector3 };
  uSceneDepth: { value: THREE.Texture | null };
  uHasDepth: { value: number };
  uCamNear: { value: number };
  uCamFar: { value: number };
  uResolution: { value: THREE.Vector2 };
  uOpacity: { value: number };
  /** 1 when the camera is under the pool; `uSurfaceY` is the surface there (scaled y). */
  uUnderwater: { value: number };
  uSurfaceY: { value: number };
  /** Sourced sheet streak texture (FX kit); null = procedural fallback. */
  uStreakTex: { value: THREE.Texture | null };
}

/**
 * The FX texture kit (`apps/world-studio/public/kits/waterfall-fx-textures/`,
 * exported separately): each slot is optional and the procedural field
 * stands in for a missing one. `sheet` feeds the falling body, `ring` the
 * plunge base quads, `mist` the mist cards + ground-mist discs, `skirt` the
 * skirt column at the foot, `foam` the field water's dissolve tile.
 */
export interface WaterfallTextureSet {
  sheet?: THREE.Texture | null;
  skirt?: THREE.Texture | null;
  mist?: THREE.Texture | null;
  ring?: THREE.Texture | null;
  /** The field water's foam dissolve/breakup tile (sea, beach, river flecks)
   * — one foam family across sheets, strips and field (study §3.1 (3)). */
  foam?: THREE.Texture | null;
}
export type WaterfallTextureSlot = keyof WaterfallTextureSet;

/** Manifest `role` → shader slot (the kit's `manifest.json` names roles, the
 * app composes URLs, this file decides what each slot means). */
export const WATERFALL_TEXTURE_ROLES: Readonly<Record<WaterfallTextureSlot, string>> = Object.freeze({
  sheet: "sheet-main",        // fxfluidtile01: thin sheets, V −0.857 / U +0.030
  ring: "plunge-ring",        // fxwhitewater: plunge-pool foam ring, puffs +0.375
  skirt: "mist-cloud-strip",  // fxcloudroundtilestrip: skirt fog strip
  mist: "mist-cloud",         // fxcloudroundtile: mist blast / skirt fog card
  foam: "foam-tile",          // foamtile01: field foam dissolve (alpha = coverage)
});

/**
 * Load the kit textures from app-composed URLs (no URL knowledge here). A
 * slot that is absent or fails to load stays null and the shader keeps its
 * procedural field — a missing texture is never an error at runtime.
 */
export async function loadWaterfallTextures(
  urls: Partial<Record<WaterfallTextureSlot, string>>,
  loader: { loadAsync(url: string): Promise<THREE.Texture> } = new THREE.TextureLoader(),
): Promise<WaterfallTextureSet> {
  const out: WaterfallTextureSet = {};
  await Promise.all((Object.keys(urls) as WaterfallTextureSlot[]).map(async (slot) => {
    const url = urls[slot];
    if (!url) return;
    try {
      const tex = await loader.loadAsync(url);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;   // scroll the offset forever
      tex.colorSpace = THREE.NoColorSpace;            // greyscale coverage, not colour
      tex.needsUpdate = true;
      out[slot] = tex;
    } catch {
      out[slot] = null;
    }
  }));
  return out;
}

export interface WaterfallDiagnostics {
  /** Fall bodies drawn as sheets. */
  count: number;
  /** Piece copies over every fall (vertical spans x lateral copies). */
  pieces: number;
  triangles: number;
  freeFlightCount: number;
  /** Ramps handed to the strip mesh instead of drawn as sheets. */
  chuteStrips: number;
  sideStrips: number;
  /** Plunge base quads over every fall, and the per-fall range. */
  baseQuads: number;
  baseQuadsPerFall: { min: number; max: number };
  baseTriangles: number;
  /** Mist kit totals (cards, discs, skirts, triangles). */
  mist: Omit<WaterfallMistDiagnostics, "perFall">;
  /** Per-fall budget: sheet + base + mist triangles, and the piece family. */
  perFall: Record<string, FallBudget>;
  /** World-space marks the numeric probe projects (unscaled metres). */
  sites: Record<string, FallSiteMarks>;
}

export interface FallBudget {
  dropM: number;
  /** The DRAWN (wetted) width — what the sheet, its strips, base and mist measure. */
  widthM: number;
  /** The channel's hydraulic width; drawn width is a fraction of it. */
  trenchWidthM: number;
  /** Ground range across the lip (m) when the rock was sampled. */
  brinkRangeM?: number;
  familyM: number;
  pieces: number;
  sheetTriangles: number;
  baseQuads: number;
  baseTriangles: number;
  mistCards: number;
  groundMist: number;
  mistTriangles: number;
  totalTriangles: number;
}

export interface FallSiteMarks {
  lip: [number, number, number];
  /** On the sheet, 2 m of arc past the lip. */
  lipPlus2M: [number, number, number];
  foot: [number, number, number];
  /** On the sheet, 2 m of arc before the foot. */
  footMinus2M: [number, number, number];
  plunge: [number, number, number];
  direction: [number, number];
  /** Sheet body samples at 15 / 35 / 50 / 65 / 85 % of the arc lip → foot. */
  samples: [number, number, number][];
  basinRadiusM: number;
}

/** A path point at a given arc length from the lip (linear between points). */
function pointAtArc(points: readonly FallPathPoint[], lipIndex: number, arcM: number): [number, number, number] {
  const sign = arcM >= 0 ? 1 : -1;
  let remaining = Math.abs(arcM);
  let i = lipIndex;
  while (i + sign >= 0 && i + sign < points.length) {
    const a = points[i];
    const b = points[i + sign];
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (len >= remaining) {
      const t = len > 0 ? remaining / len : 0;
      return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t];
    }
    remaining -= len;
    i += sign;
  }
  const p = points[i];
  return [p.x, p.y, p.z];
}

/** Probe marks for a traced fall (pure). */
export function fallSiteMarks(path: FallPath): FallSiteMarks {
  const pts = path.points;
  const lipIndex = Math.max(pts.findIndex((p) => p.s >= 0), 0);
  const last = pts.length - 1;
  let arc = 0;
  for (let i = lipIndex + 1; i <= last; i++) arc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  const c = path.cascade;
  const dl = Math.hypot(c.direction.x, c.direction.z) || 1;
  return {
    lip: [pts[lipIndex].x, pts[lipIndex].y, pts[lipIndex].z],
    lipPlus2M: pointAtArc(pts, lipIndex, Math.min(2, arc)),
    foot: [pts[last].x, pts[last].y, pts[last].z],
    footMinus2M: pointAtArc(pts, last, -Math.min(2, arc)),
    plunge: [c.plunge.x, c.plunge.y, c.plunge.z],
    direction: [c.direction.x / dl, c.direction.z / dl],
    samples: [0.15, 0.35, 0.5, 0.65, 0.85].map((f) => pointAtArc(pts, lipIndex, arc * f)),
    basinRadiusM: plungeBaseRadiusM(path.widthM, path.dropM),
  };
}

/**
 * Load-time sheet stack: one sheet mesh + the base and mist meshes (children),
 * three materials, no per-frame path work. `update` only feeds time, light,
 * season lift, the foam field and the pipeline's scene depth. Pass the
 * compiled `channels` so the sheets align to the strips' `lip`/`plunge` ends;
 * read `chuteStrips` back into the strip mesh.
 */
export class WaterfallSheets {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly uniforms: WaterfallSheetUniforms;
  readonly base: PlungeBase;
  readonly mist: WaterfallMist;
  private underwater = false;
  readonly diagnostics: WaterfallDiagnostics;
  readonly paths: FallPath[];
  /** Ramps, as strip records — merge into `buildChannelStripGeometry`. */
  readonly chuteStrips: ChannelStrip[];
  private readonly byId = new Map<string, FallPath>();

  constructor(cascades: readonly Cascade[], applyAerial: (m: THREE.Material) => void,
    options: { channels?: readonly ChannelStrip[]; textures?: WaterfallTextureSet;
      /** Ground height under a world point: the rock the crest leaves. */
      groundHeightM?: GroundSampler } = {}) {
    const built = buildWaterfallSheetGeometry(cascades,
      { channels: options.channels, groundHeightM: options.groundHeightM });
    const tex = options.textures ?? {};
    this.paths = built.paths;
    this.chuteStrips = built.chutes;
    for (const path of built.paths) this.byId.set(path.id, path);
    this.uniforms = {
      uTime: { value: 0 },
      uVerticalScale: { value: 1 },
      uAmbient: { value: new THREE.Vector3(0.2, 0.2, 0.2) },
      uSunLight: { value: new THREE.Vector3(1, 1, 1) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSceneDepth: { value: null },
      uHasDepth: { value: 0 },
      uCamNear: { value: 0.3 },
      uCamFar: { value: 60000 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uOpacity: { value: 1 },
      uUnderwater: { value: 0 },
      uSurfaceY: { value: 0 },
      uStreakTex: { value: tex.sheet ?? null },
    };
    this.material = new THREE.ShaderMaterial({
      // `lights: true` is what brings three's directional-light SHADOW block
      // into an otherwise unlit shader: the kit does its own (aerated,
      // normal-free) shading but reads the scene's CSM cascades for sun
      // visibility, so a fall in a shaded gorge is shaded (whitewaterStreaks
      // `FALLS_SHADOW_*`). No light chunk is evaluated.
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights]) as Record<string, THREE.IUniform>,
      vertexShader: SHEET_VERTEX,
      fragmentShader: SHEET_FRAGMENT,
      defines: tex.sheet ? { ES_STREAK_TEX: 1 } : {},
      lights: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    Object.assign(this.material.uniforms, this.uniforms);
    applyAerial(this.material);
    this.material.customProgramCacheKey = () => `es-waterfall-sheet${tex.sheet ? "-tex" : ""}`;
    this.mesh = new THREE.Mesh(built.geometry, this.material);
    this.mesh.name = "water-waterfall-sheets";
    this.mesh.layers.set(WATER_LAYER);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    const falls = built.paths.filter((p) => p.freeFlight);
    this.base = new PlungeBase(falls, applyAerial, { streakTexture: tex.ring ?? null });
    this.mesh.add(this.base.mesh);
    const mistSites = falls.map((p) => ({ id: p.id, plunge: p.cascade.plunge, direction: p.cascade.direction,
      widthM: p.widthM, dropM: p.dropM }));
    this.mist = new WaterfallMist(mistSites, applyAerial, { mist: tex.mist ?? null, skirt: tex.skirt ?? null });
    this.mesh.add(this.mist.mesh);
    const perFallQuads = Object.values(this.base.quadsPerFall);
    const perFall: Record<string, FallBudget> = {};
    const sites: Record<string, FallSiteMarks> = {};
    for (const p of falls) {
      const sheet = built.perFall[p.id] ?? { pieces: 0, triangles: 0 };
      const quads = this.base.quadsPerFall[p.id] ?? 0;
      const mist = this.mist.diagnostics.perFall[p.id] ?? { cards: 0, discs: 0, skirts: 0, triangles: 0 };
      perFall[p.id] = {
        dropM: p.dropM, widthM: p.widthM, trenchWidthM: p.trenchWidthM,
        brinkRangeM: p.brink?.groundRangeM, familyM: sheetPieceFamily(p.dropM).heightM,
        pieces: sheet.pieces, sheetTriangles: sheet.triangles,
        baseQuads: quads, baseTriangles: quads * 2,
        mistCards: mist.cards, groundMist: mist.discs, mistTriangles: mist.triangles,
        totalTriangles: sheet.triangles + quads * 2 + mist.triangles,
      };
      sites[p.id] = fallSiteMarks(p);
    }
    const { perFall: _mistPerFall, ...mistTotals } = this.mist.diagnostics;
    this.diagnostics = {
      count: built.fallCount,
      pieces: built.pieceCount,
      triangles: built.triangleCount,
      freeFlightCount: built.freeFlightCount,
      chuteStrips: built.chutes.length,
      sideStrips: built.sideStripCount,
      baseQuads: this.base.quadCount,
      baseQuadsPerFall: { min: perFallQuads.length ? Math.min(...perFallQuads) : 0, max: perFallQuads.length ? Math.max(...perFallQuads) : 0 },
      baseTriangles: this.base.triangleCount,
      mist: mistTotals,
      perFall,
      sites,
    };
  }

  /** The traced sheet path, for the particle emitters spaced along the fall. */
  pathFor(id: string): FallPath | undefined { return this.byId.get(id); }

  /** Bind (or unbind, with null) any of the kit's textures; unnamed slots keep theirs. */
  setTextures(textures: WaterfallTextureSet): void {
    if ("sheet" in textures) {
      const texture = textures.sheet ?? null;
      this.uniforms.uStreakTex.value = texture;
      this.material.defines = texture ? { ES_STREAK_TEX: 1 } : {};
      this.material.customProgramCacheKey = () => `es-waterfall-sheet${texture ? "-tex" : ""}`;
      this.material.needsUpdate = true;
    }
    if ("skirt" in textures || "mist" in textures) {
      const mist: { mist?: THREE.Texture | null; skirt?: THREE.Texture | null } = {};
      if ("skirt" in textures) mist.skirt = textures.skirt ?? null;
      if ("mist" in textures) mist.mist = textures.mist ?? null;
      this.mist.setTextures(mist);
    }
    if ("ring" in textures) this.base.setStreakTexture(textures.ring ?? null);
  }

  /** Per frame: time, light, season lift and (for the ground mist) the foam field. */
  update(runtime: WaterRuntime, timeS: number, verticalScale: number, seasonLiftM = 0,
    foam?: { texture: THREE.Texture | null; info: THREE.Vector4 }): void {
    this.uniforms.uTime.value = timeS;
    this.uniforms.uVerticalScale.value = verticalScale;
    this.uniforms.uAmbient.value.copy(runtime.ambient.value);
    this.uniforms.uSunLight.value.copy(runtime.sunLight.value);
    this.uniforms.uSunDir.value.copy(runtime.sunDirection.value);
    this.base.update(runtime, timeS, verticalScale, seasonLiftM);
    this.mist.update(runtime, timeS, verticalScale, seasonLiftM, foam);
  }

  /**
   * Submerged camera (`surfaceY` = the pool surface at the camera, scaled y):
   * the sheet and mist fade out at the surface, and the soft-depth fade is
   * off — under water the water layer draws INTO the scene target, so reading
   * its own depth there would be a feedback loop. Call before `setDepth`.
   */
  setUnderwater(underwater: boolean, surfaceY: number): void {
    this.underwater = underwater;
    this.uniforms.uUnderwater.value = underwater ? 1 : 0;
    this.uniforms.uSurfaceY.value = surfaceY;
    if (underwater) this.uniforms.uHasDepth.value = 0;
    this.base.setUnderwater(underwater);
    this.mist.setUnderwater(underwater, surfaceY);
  }

  setDepth(texture: THREE.Texture | null, near: number, far: number, width: number, height: number): void {
    const depth = this.underwater ? null : texture;
    this.uniforms.uSceneDepth.value = texture;
    this.uniforms.uHasDepth.value = depth && near > 0 && far > near ? 1 : 0;
    this.uniforms.uCamNear.value = near;
    this.uniforms.uCamFar.value = far;
    this.uniforms.uResolution.value.set(width, height);
    this.base.setDepth(depth, near, far, width, height);
    this.mist.setDepth(texture, near, far, width, height);
  }

  dispose(): void {
    this.mist.dispose();
    this.base.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

/** Re-exported for callers that size scroll by local speed (tests, base). */
export { STREAK_LAYERS, streakSpeedGain };
