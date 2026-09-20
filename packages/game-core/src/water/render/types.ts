import type * as THREE from "three";
import type { CSM } from "three/examples/jsm/csm/CSM.js";
import type { ApronGround, WaterData, WaterMeta } from "../waterData";
import type { WaterWorld } from "../waterWorld";
import type { Vec3 } from "@elder-souls/contracts";
import type { WaterEffectsDiagnostics } from "./WaterEffects";
import type { UnderwaterBubbleDiagnostics } from "./UnderwaterBubbles";
import type { UnderwaterBubblePassDiagnostics } from "./UnderwaterBubblePass";
import type { WaterfallDiagnostics, WaterfallTextureSet } from "./WaterfallSheets";
import type { WaterfallKit } from "./WaterfallKit";
import type { BedRock } from "./ChannelStrips";

export interface WaterAssets {
  data: WaterData;
  world: WaterWorld;
  meta: WaterMeta;
  /** RGBA8 of water-surface.png (R,G = W16, B = depth proxy). Nearest. */
  surfaceTex: THREE.DataTexture;
  /** RGBA8 of water-flow.png. Linear. */
  flowTex: THREE.DataTexture;
  /** RGBA8 of water-class.png. Linear (class index R is CPU-only). */
  klassTex: THREE.DataTexture;
  /** Shore distance / season response / tannin (RGBA8). Linear. */
  shoreTex: THREE.DataTexture;
  /** True when the compile declared `surface.ownerFile`: the strip/fall owner
   * mask (0 field, 128 strip, 255 fall) is packed into the ALPHA of
   * `surfaceTex`'s province rows (NEAREST, so the decision stays per texel).
   * The field surface dissolves where it is set; the strip/sheet meshes draw
   * there instead. */
  hasOwner: boolean;
  /** 16f water dressing (decision 0070), read from `water-dressing.json`
   * beside the compile's outputs and absent on a build without it:
   * `habitat` RGB = standing water / wet ground / canopy fraction (the air
   * layer's habitat), `colour` RGB = algae / dark (tannin) / unused (the
   * material's colour constituents). Both on the surface grid. Linear. */
  /** The colour constituents (algae, dark) are packed into the ALPHA of
   * `shoreTex` and `klassTex` at load (16-sampler limit); the habitat
   * raster is read by the air layer, never by the water shader. */
  dressing?: { habitatTex: THREE.DataTexture; size: number; metresPerPixel: number };
  /** 16f: the bed boulders the scatter placed in steep reaches
   * (`bed-rocks.json`), for the strips' baked foam; empty without the file. */
  bedRocks: readonly BedRock[];
  tidalAmplitudeM: number;
  seasonalAmplitudeM: number;
  /** The beyond-border ground (16d): the apron's coarse height tile as the
   * RG16 texture the shader decodes, its decode range and frame, and the
   * coast class' index / turbidity / salinity the sea beyond the border
   * takes (measured from the class raster's own coast texels). Absent when
   * the apron is not delivered on this ladder. */
  apron?: {
    ground: ApronGround;
    /** The tile rides in `surfaceTex`'s rows from `atlasRow0` (no new sampler). */
    atlasRow0: number;
    minM: number;
    maxM: number;
    coastClassIndex: number;
    coastTurbidity: number;
    coastSalinity: number;
  };
  /** The vanilla waterfall FX textures (kit `waterfall-fx-textures`), by
   * shader slot; absent or null slots keep the procedural streak field. */
  waterfallTextures?: WaterfallTextureSet;
  /** The vanilla waterfall FX kit geometry (`waterfall-fx-v1.glb`, decision
   * 0064), parsed by piece; null/absent = falls are not drawn (ramps still are). */
  waterfallKit?: WaterfallKit | null;
}

export interface LocalWaterSurfaceState {
  field: THREE.Texture;
  originX: number;
  originZ: number;
  cellSizeM: number;
  size: number;
  extentM: number;
  edgeBlendM: number;
  bodyIndex: number;
  active: boolean;
}

/** Each canvas owns a runtime. All clocks, weather and sky state are injected. */
export interface WaterRuntime {
  csm: CSM | null;
  epochMinutes(): number;
  waveTimeS(): number;
  /** Unscaled visible elapsed time for m/s transport and event lifetimes.
   * Omitted by older hosts, which keep their existing wave-clock behavior. */
  transportTimeS?(): number;
  /** Full accepted visible delta; zero during explicit suspension/resume. */
  transportDeltaS?(): number;
  advanceClock(delta: number): void;
  rainIntensity(): number;
  windVelocity(): Vec3;
  /** Player/interaction focus in TRUE metres; absent in a free camera view. */
  surfaceFocus?(): Vec3 | null;
  applyAerial(material: THREE.Material): void;
  /** `wind` is the wave-energy scale (`getWindWaveScale`); `windMS` is the
   * weather's 10 m wind in m/s, which the terrain's wet-shore band needs for
   * the one surf-energy knob (`surfEnergyScale`, 16c round 2). */
  onLevels(tide: number, season: number, wind: number, windMS: number): void;
  onLocalSurface?(state: LocalWaterSurfaceState | null): void;
  sunDirection: { value: THREE.Vector3 };
  /** HDR aerial-light feeds: sky irradiance×0.1 and direct irradiance×haze scatter. */
  ambient: { value: THREE.Vector3 };
  sunLight: { value: THREE.Vector3 };
  causticsInOpaque?: boolean;
  /** Dev layer visibility; omitted hosts draw every layer. */
  waterLayers?(): WaterLayerSet;
  onDebug?(state: WaterDebugState): void;
}

export interface WaterDebugState {
  tier: string; underwater: boolean; surfaceAtCameraM: number;
  tideOffsetM: number; seasonOffsetM: number; cameraDepthM: number;
  rtSamples: number; frames: number; contextLost: boolean;
  effects?: WaterEffectsDiagnostics;
  bubbles?: UnderwaterBubbleDiagnostics;
  bubblePass?: UnderwaterBubblePassDiagnostics;
  /** Compiled steep-stream strip meshes (decision 0046 item 4); the boulder
   * bed rocks are placed by `worldgen/rock_dressing.py` and shipped as
   * `province/water/bed-rocks.json` (a scatter job). */
  strips?: { count: number; triangles: number };
  /** Compiled waterfall sheets: every sheet is free flight — ramps are
   * `chuteStrips` in the strip mesh; base quads, mist kit and per-fall budget. */
  falls?: WaterfallDiagnostics;
  /** Which water layers are currently drawing (dev toggle). */
  layers?: WaterLayerSet;
  /** The frame's camera, so a probe can project world marks to pixels:
   * projection × view (column-major, 16), drawing-buffer size, vertical scale. */
  camera?: { viewProj: number[]; width: number; height: number; verticalScale: number };
}

/* ------------------------------------------------------------------ *
 * Dev layer toggle (`?waterLayers=field,strips,falls,effects`).
 *
 * The water pass draws four independent things over the same ground — the
 * province field grid, the compiled steep-reach strips, the cascade sheets
 * and the particle stack. When one of them renders wrong, a screenshot
 * cannot say WHICH: they overlap by design. Hiding them one at a time and
 * differencing the frame is the only reliable attribution, so the switch is
 * part of the runtime rather than a probe-only hack.
 * ------------------------------------------------------------------ */

export const WATER_LAYER_NAMES = ["field", "strips", "falls", "effects"] as const;
export type WaterLayerName = (typeof WATER_LAYER_NAMES)[number];
export type WaterLayerSet = Readonly<Record<WaterLayerName, boolean>>;

export const ALL_WATER_LAYERS: WaterLayerSet = Object.freeze({
  field: true, strips: true, falls: true, effects: true,
});

/**
 * Parse a `waterLayers` spec. Absent/empty → everything on (the shipped
 * behaviour); otherwise ONLY the named layers draw. Unknown names are
 * ignored so a typo cannot silently blank the water.
 */
export function parseWaterLayers(spec: string | null | undefined): WaterLayerSet {
  if (spec == null) return ALL_WATER_LAYERS;
  const wanted = new Set(spec.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return ALL_WATER_LAYERS;
  const out = {} as Record<WaterLayerName, boolean>;
  for (const name of WATER_LAYER_NAMES) out[name] = wanted.has(name);
  return Object.freeze(out);
}
