import manifest from "./generated/arrows.items.json";
import type { ArrowPhysics, ArrowheadId } from "../combat/ballistics";
import { ARROWHEADS } from "../combat/ballistics";
import { MATERIAL_PROFILES, type MaterialId } from "./materials";
import type { AttributeMap } from "./types";

/**
 * Arrows.
 *
 * Same two axes as everything else in the arsenal, and for the same reason: a
 * *shaft* says what the arrow is for and what it weighs, a *material* says what
 * the head is made of. Nothing is written per arrow.
 *
 * A shaft is a real archery distinction, not a rarity tier. A light flight
 * arrow goes further and arrives with less; a war shaft is thrown slower and
 * hits far harder; a broadhead is ruinous to anything not wearing metal and
 * nearly useless against anything that is.
 */

export type ArrowShaftId = "flight" | "war" | "hunting" | "blunt";

export type ArrowShaftProfile = {
  id: ArrowShaftId;
  label: string;
  massKg: number;
  shaftDiameterMeters: number;
  dragCoefficient: number;
  /** Archery's FOC: mass ahead of centre, as a fraction of shaft length. */
  forwardOfCentre: number;
  head: ArrowheadId;
  description: string;
};

/**
 * `dragCoefficient` is ~1.1 for a fletched shaft: high, because an arrow is a
 * cylinder with vanes on the back, and the number that makes a 53 m/s launch
 * fall at ~250 m rather than the 285 m a vacuum would give.
 */
export const ARROW_SHAFTS: Readonly<Record<ArrowShaftId, ArrowShaftProfile>> = {
  flight: {
    id: "flight", label: "Flight Arrow",
    massKg: 0.045, shaftDiameterMeters: 0.0095, dragCoefficient: 1.1,
    forwardOfCentre: 0.12, head: "bodkin",
    description: "A thin shaft with a small pile. For distance, and for little else.",
  },
  war: {
    id: "war", label: "War Shaft",
    massKg: 0.096, shaftDiameterMeters: 0.0111, dragCoefficient: 1.1,
    forwardOfCentre: 0.16, head: "bodkin",
    description: "Heavy ash under a square bodkin. Slower away, and it does not care.",
  },
  hunting: {
    id: "hunting", label: "Hunting Arrow",
    massKg: 0.062, shaftDiameterMeters: 0.0102, dragCoefficient: 1.15,
    forwardOfCentre: 0.14, head: "broadhead",
    description: "A broad head on a middling shaft. Meant for something that bleeds.",
  },
  blunt: {
    id: "blunt", label: "Blunt Arrow",
    massKg: 0.055, shaftDiameterMeters: 0.0105, dragCoefficient: 1.25,
    forwardOfCentre: 0.2, head: "blunt",
    description: "A stub instead of a point. Takes birds, and takes prisoners.",
  },
};

type BuiltArrow = {
  material: string;
  asset: string;
  icon: string;
  lengthMeters: number;
  /** The worn quiver GLB the pipeline built beside the projectile. */
  quiver?: string;
  /** Rig node the quiver hangs on. Data, so a future back-slot rig can move it. */
  sheathSocket?: string;
};

const BUILT = manifest.items as unknown as Record<string, BuiltArrow>;

export type ArrowDefinition = {
  id: string;
  label: string;
  shaftId: ArrowShaftId;
  materialId: MaterialId;
  physics: ArrowPhysics;
  weightKg: number;
  value: number;
  requirements: AttributeMap;
  /** In-flight GLB, relative to the deployment base URL. */
  asset: string;
  /**
   * The worn quiver, and the rig node it hangs on. Equipping arrows puts this
   * on the wearer's back — it is the same item seen from outside, so it is a
   * property of the arrow rather than a separate piece of kit to equip.
   */
  quiver: { asset: string; socket: string } | null;
  icon: string;
  description: string;
};

/**
 * Build one arrow from a shaft and a material.
 *
 * The material moves two physical things and nothing else: how heavy the head
 * is, and how well it survives contact with armour. Both feed the same impact
 * maths every other arrow uses.
 */
export function defineArrow(
  id: string,
  shaftId: ArrowShaftId,
  materialId: MaterialId,
  asset: string,
  icon: string,
  quiver: { asset: string; socket: string } | null = null,
): ArrowDefinition {
  const shaft = ARROW_SHAFTS[shaftId];
  if (!shaft) throw new RangeError(`arrow "${id}" has unknown shaft ${shaftId}`);
  const material = MATERIAL_PROFILES[materialId];
  if (!material) throw new RangeError(`arrow "${id}" has unknown material ${materialId}`);

  // A denser head on the same shaft: a fraction of the arrow's mass is the
  // point, so the material moves total mass much less than it moves a cuirass.
  const headShare = 0.22;
  const massKg = Number(
    (shaft.massKg * (1 - headShare) + shaft.massKg * headShare * material.weightScale).toFixed(5),
  );
  return {
    id,
    label: `${material.label} ${shaft.label}`,
    shaftId,
    materialId,
    physics: {
      massKg,
      shaftDiameterMeters: shaft.shaftDiameterMeters,
      dragCoefficient: shaft.dragCoefficient,
      forwardOfCentre: shaft.forwardOfCentre,
      head: shaft.head,
      headHardness: material.damageScale,
    },
    weightKg: Number((massKg + 0.005).toFixed(3)),
    value: Math.max(1, Math.round(material.valuePerKg * 0.35)),
    requirements: {},
    asset,
    quiver,
    icon,
    description: `${shaft.description} ${ARROWHEADS[shaft.head].description}`,
  };
}

/**
 * The arrow catalogue: every shaft archetype in every material the pipeline
 * built a head for.
 *
 * Four kinds of iron arrow share one GLB. The shaft is a physical archetype the
 * game composes, not a distinct mesh, so adding "flight arrows" cost nothing in
 * download size and adding a material costs one line of pipeline config.
 */
export const ARROWS: Readonly<Record<string, ArrowDefinition>> = Object.fromEntries(
  Object.values(BUILT).flatMap((built) =>
    (Object.keys(ARROW_SHAFTS) as ArrowShaftId[]).map((shaftId) => {
      const id = `${built.material}-${shaftId}-arrow`;
      const quiver = built.quiver
        ? { asset: built.quiver, socket: built.sheathSocket ?? "Quiver" }
        : null;
      return [id, defineArrow(id, shaftId, built.material as MaterialId, built.asset, built.icon, quiver)];
    })),
);

export const ARROW_IDS: readonly string[] = Object.keys(ARROWS);

export function arrowById(id: string): ArrowDefinition {
  const arrow = ARROWS[id];
  if (!arrow) throw new RangeError(`unknown arrow: ${id}`);
  return arrow;
}

/** The arrow a new character is handed, and the fallback when the quiver empties. */
export const DEFAULT_ARROW = arrowById("iron-war-arrow");
