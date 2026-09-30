/**
 * Where a piece's fires stand, in the piece's own frame, and the check that
 * every one lies in the piece (16k walk 5).
 *
 * The anchors are the NIF's own emitters (kit manifest `flames[].offsetM`,
 * glTF Y-up metres from the pivot, mined by build_kit mine_fire_layer). A
 * lit piece with no mined emitter gets ONE fallback anchor from its bounds:
 * - a hanging piece (`anchorClass` "hanging": the Argonian cord lanterns,
 *   pivot at the cord's top) burns at its BODY, the bottom of the piece: the
 *   body is about as tall as it is wide, so the anchor is the bottom-centre
 *   raised by half the smaller plan width (argonianlanterns03: 0.32 m above
 *   its base, 1.83 m below its pivot). The walk-4 rule put every fallback on
 *   the bounds' top, which for a hanging lantern is the top of its cord: the
 *   flame hung in the air above the lantern (walk 5, owner);
 * - any other piece burns on the top-centre of its bounds (a bare candle).
 *
 * The caller applies the piece's FINAL draw matrix (placement, mount, hang
 * and scale) to these local anchors; the check runs in the local frame, which
 * a rigid-plus-scale transform preserves, so the same answer holds in world.
 */
import * as THREE from "three";
import { FIRE_BED_PRESETS, firePresetFor, type FirePresetId } from "./fireTypes";

/** The manifest fields the anchor rule reads (a kit manifest row). */
export interface FlameAnchorMeta {
  id?: string;
  category?: string;
  anchorClass?: string;
  light?: { fixtureKind?: string } | null;
  flames?: readonly { offsetM: readonly [number, number, number] | number[]; source?: string }[] | null;
  /** The piece's additive flame-card materials (build_kit): fxfirewithembers01's. */
  flameCardMaterials?: readonly string[] | null;
}

export interface LocalFlameAnchor {
  /** Emitter in the piece's frame (glTF Y-up metres from the pivot). */
  local: THREE.Vector3;
  preset: FirePresetId;
  /** The mined record's index, or -1 for the fallback anchor. */
  record: number;
}

/** Slack (m) on the bounds for the anchor check: mined emitters sit on the
 * wick's surface, and bounds are LOD0 rounded to the millimetre. */
export const FLAME_ANCHOR_SLACK_M = 0.02;

/** The fallback anchor of a lit piece with no mined emitter (see the header). */
export function fallbackFlameAnchorLocal(meta: FlameAnchorMeta | undefined, box: THREE.Box3): THREE.Vector3 {
  const centre = box.getCenter(new THREE.Vector3());
  if (meta?.anchorClass === "hanging") {
    const size = box.getSize(new THREE.Vector3());
    const body = Math.min(size.x, size.z, size.y);
    return new THREE.Vector3(centre.x, box.min.y + body * 0.5, centre.z);
  }
  return new THREE.Vector3(centre.x, box.max.y, centre.z);
}

/**
 * A flame-card piece's bed (fxfirewithembers01, in a brazier's bowl or on a
 * hut's hearth): no mined emitter, so ONE bed at its base centre with its
 * preset (`brazier`); its cards are left undrawn by the caller
 * (`isFlameCardMaterial`), the cards alone read as a glow (walk 5, owner).
 * Null for a piece with mined emitters or no flame cards.
 */
export function flameCardBedAnchorLocal(meta: FlameAnchorMeta | undefined, box: THREE.Box3): LocalFlameAnchor | null {
  if (meta?.flames?.length || !meta?.flameCardMaterials?.length) return null;
  const centre = box.getCenter(new THREE.Vector3());
  return { local: new THREE.Vector3(centre.x, box.min.y, centre.z),
    preset: firePresetFor({ id: meta.id, category: meta.category, anchorClass: meta.anchorClass }), record: -1 };
}

/**
 * A material the flame system replaces: one of a piece's vanilla flame cards.
 * Every piece with cards burns our flame instead (its mined emitters, else
 * its bed), so its cards are never drawn: a hearth with both
 * (fireplacewood01burning: FlamesSmall01 + Flames:0/1.Mat) drew its opaque
 * cards over its own flame, and no fire showed (walk 6).
 */
export function isFlameCardMaterial(meta: FlameAnchorMeta | undefined, materialName: string): boolean {
  return Boolean(meta?.flameCardMaterials?.includes(materialName));
}

/**
 * The local fire anchors of one piece: one per mined emitter (a fire bed,
 * brazier/hearth/campfire, keeps only its first emitter: the bed is spread
 * by the preset), else one fallback anchor when `fallback` is true.
 */
export function pieceFlameAnchorsLocal(
  meta: FlameAnchorMeta | undefined, box: THREE.Box3, fallback: boolean, hostKind?: string,
): LocalFlameAnchor[] {
  const base = { id: meta?.id, category: meta?.category, anchorClass: meta?.anchorClass,
    fixtureKind: meta?.light?.fixtureKind, hostKind };
  const out: LocalFlameAnchor[] = [];
  (meta?.flames ?? []).forEach((f, i) => {
    const preset = firePresetFor({ ...base, flameSource: f.source });
    if (FIRE_BED_PRESETS.has(preset) && out.some((a) => a.preset === preset)) return;
    out.push({ local: new THREE.Vector3(f.offsetM[0], f.offsetM[1], f.offsetM[2]), preset, record: i });
  });
  if (out.length === 0 && fallback) {
    out.push({ local: fallbackFlameAnchorLocal(meta, box), preset: firePresetFor(base), record: -1 });
  }
  return out;
}

/**
 * The anchor check: every anchor inside the piece's bounds (plus
 * `FLAME_ANCHOR_SLACK_M`), and a hanging piece's inside its lower half (its
 * body, never its cord). Returns one line per failure naming the piece id.
 */
export function flameAnchorFailures(
  pieceId: string, meta: FlameAnchorMeta | undefined, box: THREE.Box3, anchors: readonly LocalFlameAnchor[],
): string[] {
  const failures: string[] = [];
  const slack = box.clone().expandByScalar(FLAME_ANCHOR_SLACK_M);
  const midY = (box.min.y + box.max.y) / 2;
  for (const a of anchors) {
    const where = `${pieceId} (${meta?.id ?? "?"}) flame ${a.record < 0 ? "fallback" : `#${a.record}`}`
      + ` at [${a.local.toArray().map((v) => v.toFixed(3)).join(", ")}]`;
    if (!slack.containsPoint(a.local)) {
      failures.push(`${where} lies outside the piece's bounds `
        + `[${box.min.toArray().map((v) => v.toFixed(3))}]..[${box.max.toArray().map((v) => v.toFixed(3))}]`);
    } else if (meta?.anchorClass === "hanging" && a.local.y > midY + FLAME_ANCHOR_SLACK_M) {
      failures.push(`${where} sits in the upper half of a hanging piece (its cord), not its body`);
    }
  }
  return failures;
}

/**
 * A kit manifest row's LOD0 bounds in the glTF Y-up piece frame: build_kit
 * measures `sizeM` and `originOffsetM` (= -bboxMin) in the z-up kit frame;
 * z-up (x, y, z) is Y-up (x, z, -y).
 */
export function manifestBoxYUp(row: { sizeM?: readonly number[]; originOffsetM?: readonly number[] }): THREE.Box3 | null {
  const s = row.sizeM;
  const o = row.originOffsetM;
  if (!s || !o || s.length < 3 || o.length < 3) return null;
  const min = new THREE.Vector3(-o[0], -o[2], -(s[1] - o[1]));
  const max = new THREE.Vector3(s[0] - o[0], s[2] - o[2], o[1]);
  return new THREE.Box3(min, max);
}
