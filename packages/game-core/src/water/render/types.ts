import type * as THREE from "three";
import type { CSM } from "three/examples/jsm/csm/CSM.js";
import type { WaterData, WaterMeta } from "../waterData";
import type { WaterWorld } from "../waterWorld";
import type { Vec3 } from "@elder-souls/contracts";

export interface WaterAssets {
  data: WaterData;
  world: WaterWorld;
  meta: WaterMeta;
  surfaceTex: THREE.DataTexture;
  flowTex: THREE.DataTexture;
  klassTex: THREE.DataTexture;
  shoreTex: THREE.DataTexture;
  supportTex: THREE.DataTexture;
  characterTex: THREE.DataTexture;
  tidalAmplitudeM: number;
  seasonalAmplitudeM: number;
}

/** Each canvas owns a runtime. All clocks, weather and sky state are injected. */
export interface WaterRuntime {
  csm: CSM | null;
  epochMinutes(): number;
  waveTimeS(): number;
  advanceClock(delta: number): void;
  rainIntensity(): number;
  windVelocity(): Vec3;
  applyAerial(material: THREE.Material): void;
  onLevels(tide: number, season: number, wind: number): void;
  sunDirection: { value: THREE.Vector3 };
  ambient: { value: THREE.Vector3 };
  sunLight: { value: THREE.Vector3 };
  causticsInOpaque?: boolean;
  onDebug?(state: WaterDebugState): void;
}

export interface WaterDebugState {
  tier: string; underwater: boolean; surfaceAtCameraM: number;
  tideOffsetM: number; seasonOffsetM: number; cameraDepthM: number;
  rtSamples: number; frames: number; contextLost: boolean;
}
