import type * as THREE from "three";
import type { CSM } from "three/examples/jsm/csm/CSM.js";
import type { WaterData, WaterMeta } from "../waterData";
import type { WaterWorld } from "../waterWorld";
import type { Vec3 } from "@elder-souls/contracts";
import type { WaterEffectsDiagnostics } from "./WaterEffects";
import type { UnderwaterBubbleDiagnostics } from "./UnderwaterBubbles";
import type { UnderwaterBubblePassDiagnostics } from "./UnderwaterBubblePass";

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
  /** Strip/fall owner mask (0 field, 128 strip, 255 fall), NEAREST — null
   * when the compile declared no `surface.ownerFile`. The field surface
   * discards where this is set; the strip/sheet meshes draw there instead. */
  ownerTex: THREE.DataTexture | null;
  tidalAmplitudeM: number;
  seasonalAmplitudeM: number;
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
  onLevels(tide: number, season: number, wind: number): void;
  onLocalSurface?(state: LocalWaterSurfaceState | null): void;
  sunDirection: { value: THREE.Vector3 };
  /** HDR aerial-light feeds: sky irradiance×0.1 and direct irradiance×haze scatter. */
  ambient: { value: THREE.Vector3 };
  sunLight: { value: THREE.Vector3 };
  causticsInOpaque?: boolean;
  onDebug?(state: WaterDebugState): void;
}

export interface WaterDebugState {
  tier: string; underwater: boolean; surfaceAtCameraM: number;
  tideOffsetM: number; seasonOffsetM: number; cameraDepthM: number;
  rtSamples: number; frames: number; contextLost: boolean;
  effects?: WaterEffectsDiagnostics;
  bubbles?: UnderwaterBubbleDiagnostics;
  bubblePass?: UnderwaterBubblePassDiagnostics;
  /** Compiled steep-stream strip meshes (decision 0046 item 4). */
  strips?: { count: number; triangles: number };
  /** Compiled waterfall sheets; `freeFlightCount` excludes pure rapids. */
  falls?: { count: number; triangles: number; freeFlightCount: number };
}
