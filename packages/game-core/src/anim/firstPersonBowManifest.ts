import manifest from "./generated/rig-skyrim-first-person.bow.json";

/**
 * The first-person bow rig's build manifest: asset, socket bone names and the
 * clip durations (`tooling/asset-pipeline/pipeline/build_first_person.py`).
 */
export type FirstPersonBowManifest = {
  schemaVersion: number;
  asset: string;
  bones: { camera: string; weapon: string; shield: string; rightHand: string; leftHand: string };
  restMeasures: Record<string, number | number[]>;
  clips: Record<string, { source: string; durationSeconds: number | null }>;
};

export const FIRST_PERSON_BOW_MANIFEST = manifest as unknown as FirstPersonBowManifest;
export type FirstPersonBowClip = keyof typeof manifest.clips;
