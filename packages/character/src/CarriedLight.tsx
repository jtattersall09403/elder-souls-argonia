import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, type MutableRefObject, type RefObject } from "react";
import * as THREE from "three";
import type { LightSourceSpec } from "@elder-souls/game-core/fx/carriedLight";

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
  spec: LightSourceSpec;
  /** 0-1 from `carriedLightIntensity`, written every frame by the owner. */
  level: MutableRefObject<number>;
  /** Seconds, for the flicker's movement; the same clock as `level`. */
  time: MutableRefObject<number>;
}) {
  const light = useMemo(() => {
    const point = new THREE.PointLight(
      new THREE.Color(spec.colour[0], spec.colour[1], spec.colour[2]),
      0,
      spec.radiusMetres,
      2,
    );
    point.castShadow = false;
    point.name = `carried-light:${spec.id}`;
    return point;
  }, [spec]);
  const home = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => () => {
    light.parent?.remove(light);
    light.dispose();
  }, [light]);

  useFrame(() => {
    const root = item.current;
    if (!root) {
      light.parent?.remove(light);
      return;
    }
    const anchor = root.getObjectByName("AttachLight") ?? root;
    if (light.parent !== anchor) {
      anchor.add(light);
      light.position.set(0, 0, 0);
    }
    // The anchor may be scaled with the rig; keep the light's reach in metres.
    const scale = anchor.getWorldScale(home).x || 1;
    light.distance = spec.radiusMetres / scale;
    light.intensity = CARRIED_LIGHT_CANDELA * level.current;
    const flicker = spec.flicker;
    if (flicker && level.current > 0) {
      // The record's flicker movement: a small wander of the light, two
      // incommensurate waves per axis so it never visibly repeats.
      const phase = 2 * Math.PI * flicker.frequency * time.current;
      const reach = flicker.movementMetres / scale;
      light.position.set(
        reach * 0.5 * Math.sin(phase * 1.13 + 0.4) * Math.sin(phase * 0.37),
        reach * 0.5 * Math.sin(phase * 0.91 + 2.1),
        reach * 0.5 * Math.sin(phase * 1.47 + 4.2) * Math.cos(phase * 0.29),
      );
    }
  });

  return null;
}
