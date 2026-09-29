import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import type { LightSourceSpec } from "@elder-souls/game-core/fx/carriedLight";
import { CarriedLightRig } from "@elder-souls/game-core/fx/carriedLightRig";

/**
 * The light a carried source casts: a torch today, a lantern or a light spell
 * later (decision 0091). The rules live in `game-core/fx/carriedLight`; this
 * only draws their answer. Whoever owns the actor ticks the state and writes
 * the 0-1 intensity into `level` (the combat runtime does, and stealth reads
 * the same ref in round 4); this component turns it into a point light.
 *
 * The light rides the item's `AttachLight` node, which the pipeline keeps from
 * the NIF, so it sits in the flame rather than at the grip. An item without
 * one lights from its root.
 */

/**
 * Luminous intensity of a fully lit carried source, candela, at the light's
 * own record radius. Not in the LIGH record (Skyrim's lights are unitless);
 * chosen so a torch reads as the brightest thing within a couple of metres
 * under the sandbox's daylight, and tunable here in one place. 6 cd is the
 * default, owner-overridable (lane round 6).
 */
export const CARRIED_LIGHT_CANDELA = 6;

export function CarriedLight({
  item,
  spec,
  level,
  time,
}: {
  /** The mounted off-hand item (`SkyrimFighter`'s `offHandRef`). */
  item: RefObject<THREE.Object3D | null>;
  /** The held light source; null while the off-hand is not a light (the
   * light stays in the scene at intensity 0, so the light count is constant). */
  spec: LightSourceSpec | null;
  /** 0-1 from `carriedLightIntensity`, written every frame by the owner. */
  level: MutableRefObject<number>;
  /** Seconds, for the flicker's movement; the same clock as `level`. */
  time: MutableRefObject<number>;
}) {
  const scene = useThree((state) => state.scene);
  const rig = useMemo(() => new CarriedLightRig(scene, CARRIED_LIGHT_CANDELA), [scene]);
  useEffect(() => () => rig.dispose(), [rig]);
  useFrame(() => rig.update(item.current, spec, level.current, time.current));
  return null;
}
