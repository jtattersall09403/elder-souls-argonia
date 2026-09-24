import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import LIGHTS from "./generated/lights.items.json";
import { lightSourceFromRecord, type LightRecord } from "../fx/carriedLight";
import { WEAPON_STABILITY_BAND } from "./guard";
import { ONE_HANDED_ANIMATIONS } from "./movesets/oneHanded";
import { OFF_HAND_NODE_HALF_TURN } from "./weaponClasses";
import type { TorchDefinition, WeaponSocketTransform } from "./types";

/**
 * Carried lights, built from the pipeline's mined LIGH records
 * (`generated/lights.items.json`, combat-sandbox lane round 3, decision 0091).
 *
 * A torch is an off-hand item: it guards, badly, with Skyrim's torch block
 * clips and the one-handed parry, and it lights through the carried-light
 * system. Everything item-specific comes from the record; nothing here is a
 * per-torch number.
 */

type LightItemRecord = {
  asset: string;
  icon?: string | null;
  sheathSocket: string;
  sizeMeters: readonly number[];
  light: LightRecord & { weightKg: number; value: number };
};

const RECORDS = LIGHTS.items as unknown as Readonly<Record<string, LightItemRecord>>;

/**
 * Held and carried on the off-hand node, as Skyrim's torch.nif asks (its `Prn`
 * is `SHIELD`), with the half turn every item on that node takes
 * (`OFF_HAND_NODE_HALF_TURN`). Measured (`scripts/probe-off-hand-mount.mjs`,
 * round 3 §7): in TORCH_POSE the flame end points 0.97 up and 0.24 forward
 * and the grip sits 0.115 m down the left hand bone, as the main grip does in
 * the right. Identity points the flame the same way (the turn is about the
 * torch's own long axis), so the node rule decides the roll.
 */
const TORCH_MOUNT: WeaponSocketTransform = {
  socket: "Shield",
  localPosition: [0, 0, 0],
  localRotation: OFF_HAND_NODE_HALF_TURN,
  localScale: 1,
};

function buildTorch(id: string, record: LightItemRecord): TorchDefinition & { icon: string | null; value: number } {
  return {
    kind: "torch",
    id,
    label: text(CATALOGUE, "text.item.torch.name"),
    stats: {
      weightKg: record.light.weightKg,
      guard: {
        // A torch is an edge-less stick: the floor of the weapon band.
        stability: WEAPON_STABILITY_BAND.min,
        absorption: { physical: 0.5 },
      },
    },
    animations: {
      enter: "TORCH_GUARD_ENTER",
      loop: "TORCH_GUARD",
      hitVariants: ["TORCH_GUARD_HIT"],
      parry: ONE_HANDED_ANIMATIONS.parry,
    },
    poseOverlay: "TORCH_POSE",
    light: lightSourceFromRecord(id, record.light),
    visual: {
      asset: record.asset,
      // NiAlphaProperty test at 128 on the handle (part A report).
      alphaTest: 0.5,
      // Skyrim keeps a torch lit in the hand with weapons sheathed: one mount.
      held: TORCH_MOUNT,
      sheathed: TORCH_MOUNT,
      sizeMeters: record.sizeMeters as unknown as readonly [number, number, number],
    },
    icon: record.icon ?? null,
    value: record.light.value,
  };
}

export type LightItem = ReturnType<typeof buildTorch>;

/** Every carried light the pipeline built, keyed by item id. */
export const LIGHT_ITEMS: Readonly<Record<string, LightItem>> = Object.fromEntries(
  Object.entries(RECORDS).map(([id, record]) => [id, buildTorch(id, record)]),
);

export function torchById(id: string): LightItem {
  const torch = LIGHT_ITEMS[id];
  if (!torch) throw new RangeError(`unknown light: ${id}`);
  return torch;
}
