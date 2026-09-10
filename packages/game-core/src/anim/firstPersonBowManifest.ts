import manifest from "./generated/rig-skyrim-first-person.bow.json";

/**
 * The first-person bow rig's build manifest: one GLB per body the races are
 * built on, socket bone names and the clip durations
 * (`tooling/asset-pipeline/pipeline/build_first_person.py`).
 */
export type FirstPersonBowManifest = {
  schemaVersion: number;
  variants: Record<string, { asset: string; meshes: string[] }>;
  bones: { camera: string; weapon: string; shield: string; rightHand: string; leftHand: string };
  restMeasures: Record<string, number | number[]>;
  clips: Record<string, { source: string; durationSeconds: number | null }>;
};

export const FIRST_PERSON_BOW_MANIFEST = manifest as unknown as FirstPersonBowManifest;
export type FirstPersonBowClip = keyof typeof manifest.clips;

const warnedBodies = new Set<string>();

/**
 * The arms GLB for a build's body.
 *
 * The roster can name a body the first-person rig has not been built for yet
 * (the female arms are a pipeline job). Rather than let `useGLTF` request a
 * URL that 404s — which fails the whole scene, not just the arms — fall back
 * to the same race's male arms, which share the skeleton and the clip set, and
 * say so once. `female-argonian` -> `male-argonian`, `female` -> `male`.
 */
export function firstPersonBowAsset(body: string): string {
  const variants = FIRST_PERSON_BOW_MANIFEST.variants;
  const exact = variants[body];
  if (exact) return exact.asset;

  const sameRaceMale = body.startsWith("female") ? `male${body.slice("female".length)}` : "male";
  const fallback = variants[sameRaceMale] ?? variants.male;
  if (!warnedBodies.has(body)) {
    warnedBodies.add(body);
    console.warn(
      `[first-person bow] no arms built for body "${body}"; using "${
        variants[sameRaceMale] ? sameRaceMale : "male"
      }" instead.`,
    );
  }
  return fallback.asset;
}
