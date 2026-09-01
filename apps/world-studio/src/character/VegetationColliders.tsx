import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, CuboidCollider, RigidBody } from "@react-three/rapier";
import {
  colliderFor,
  selectNearestSolids,
  type FloraCollisionAsset,
  type SolidInstance,
} from "@elder-souls/game-core/physics/floraSolids";

/**
 * Makes the nearby trees, boulders and root arches solid.
 *
 * The kit has shipped collision proxies since round 1 and nothing consumed
 * them, so the player walked through trunks. This is the consumer: a small
 * ring of fixed Rapier bodies around the player, rebuilt as they move — the
 * same shape as `ChunkColliders`, and for the same reason. Colliders for a
 * whole chunk would be thousands of bodies for a forest crossed in a minute;
 * colliders for the few dozen things within reach cost nothing and are
 * indistinguishable to the player.
 *
 * What is solid is decided in `@elder-souls/game-core/physics/floraSolids`
 * from the kit manifest, not here — reeds, ferns and lily pads stay
 * walk-through, as they are in Skyrim and Morrowind.
 */

// Scratch objects for the per-body offset rotation (render-loop allocation-free).
const euler = new THREE.Euler();
const offset = new THREE.Vector3();

/** Metres. Comfortably past anything the player can reach this frame. */
const RING_M = 45;

/** Ceiling on simultaneous flora bodies, so a dense stand cannot flood Rapier. */
const MAX_BODIES = 96;

/** Rebuild when the player has walked this far since the last one. */
const REBUILD_MOVE_M = 12;

export function VegetationColliders({
  solidsRef,
  focusRef,
  baseUrl,
  onCount,
}: {
  /** Solid instances published by `Vegetation` on its last rebuild. */
  solidsRef: React.MutableRefObject<SolidInstance[]>;
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  baseUrl: string;
  /** Reports how many bodies are live, for the debug HUD. */
  onCount?: (count: number) => void;
}) {
  const [active, setActive] = useState<SolidInstance[]>([]);
  const [builtAt, setBuiltAt] = useState<{ x: number; z: number } | null>(null);
  const [assets, setAssets] = useState<FloraCollisionAsset[] | null>(null);

  // The same manifest `Vegetation` reads, fetched independently so the two
  // components stay uncoupled; it is a small JSON and the browser serves the
  // second request from cache.
  useEffect(() => {
    let cancelled = false;
    fetch(`${baseUrl}kits/flora-province-v1.kit.json`)
      .then((r) => r.json())
      .then((m: { assets: FloraCollisionAsset[] }) => {
        if (!cancelled) setAssets(m.assets);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [baseUrl]);

  const byId = useMemo(
    () => new Map((assets ?? []).map((a) => [a.id, a])),
    [assets],
  );

  useFrame(() => {
    const focus = focusRef.current;
    if (
      builtAt &&
      Math.hypot(focus.x - builtAt.x, focus.z - builtAt.z) < REBUILD_MOVE_M
    ) {
      return;
    }
    setBuiltAt({ x: focus.x, z: focus.z });
    setActive(
      selectNearestSolids(solidsRef.current, focus, RING_M, MAX_BODIES),
    );
  });

  useEffect(() => { onCount?.(active.length); }, [active, onCount]);

  return (
    <>
      {active.map((instance, i) => {
        const shape = colliderFor(byId.get(instance.species));
        if (!shape) return null;
        const s = instance.scale;
        // Position is the instance's own final world position (already sunk
        // and re-grounded by the renderer), plus the proxy's scaled offset
        // ROTATED exactly as the renderer rotates the mesh (same YXZ euler)
        // — round 5 added the offset in world axes and yawed the body about
        // its displaced centre, so off-axis trunks landed metres from their
        // trees, in a direction that changed per instance.
        euler.set(instance.tiltX, instance.yaw, instance.tiltZ, "YXZ");
        offset
          .set(shape.offsetM[0] * s, shape.offsetM[1] * s, shape.offsetM[2] * s)
          .applyEuler(euler);
        const position: [number, number, number] = [
          instance.x + offset.x,
          instance.y + offset.y,
          instance.z + offset.z,
        ];
        return (
          <RigidBody
            key={`${instance.species}|${instance.x.toFixed(2)}|${instance.z.toFixed(2)}|${i}`}
            type="fixed"
            colliders={false}
            position={position}
            rotation={[instance.tiltX, instance.yaw, instance.tiltZ, "YXZ"]}
          >
            {shape.kind === "capsule" ? (
              // Rapier's capsule half-height excludes the caps, so subtract
              // the radius — otherwise a trunk's collider stands taller than
              // the trunk and the player bumps into thin air above it.
              <CapsuleCollider
                args={[
                  Math.max(0.05, (shape.heightM / 2 - shape.radiusM) * s),
                  shape.radiusM * s,
                ]}
              />
            ) : (
              <CuboidCollider
                args={[
                  shape.halfExtentsM[0] * s,
                  shape.halfExtentsM[1] * s,
                  shape.halfExtentsM[2] * s,
                ]}
              />
            )}
          </RigidBody>
        );
      })}
    </>
  );
}
