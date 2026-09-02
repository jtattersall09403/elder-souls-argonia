import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, CuboidCollider, RigidBody } from "@react-three/rapier";
import {
  collidersFor,
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

/**
 * Metres. The furthest anything is considered for a collider. Small on
 * purpose: cover only has to outlast the walk between rebuilds, and every
 * metre of radius is quadratically more bodies to reconcile.
 */
const RING_M = 20;

/**
 * Ceiling on simultaneous flora COLLIDERS (not bodies): a curved trunk is a
 * chain of up to sixteen capsules, a pebble is one, so counting instances
 * budgets the wrong thing. These are fixed bodies with no simulation, so the
 * cost is broad-phase only and a few thousand is cheap.
 */
const COLLIDER_BUDGET = 2500;

/**
 * Backstop on bodies, for the pathological case where every solid in the ring
 * is a single-capsule pebble. Measured against the densest jungle chunk this
 * essentially never binds (95th percentile is ~1,250) — and capping it lower
 * would be counter-productive, since a smaller set shrinks the covered radius
 * and buys MORE frequent rebuilds, not fewer.
 */
const MAX_BODIES = 1400;

/**
 * Fraction of the covered radius the player may cross before the set is
 * rebuilt. Proportional, not a fixed distance: a thicket can only afford
 * ~8 m of cover, so a fixed margin would either thrash the rebuild there or
 * (as in round 8, where a flat 12 m trigger met ~12 m of cover) let the
 * player walk clean out of the collided set and through every trunk in it.
 * At 0.55 the remaining cover is always at least ~45% of the radius, which
 * is metres more than arm's reach.
 */
const REBUILD_AT_COVER_FRACTION = 0.55;

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
  const [builtAt, setBuiltAt] =
    useState<{ x: number; z: number; covered: number } | null>(null);
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

  // How many colliders one instance of a species costs, so the budget is
  // spent on shapes rather than on instance count.
  const costOf = useMemo(() => {
    const cache = new Map<string, number>();
    return (instance: SolidInstance) => {
      let cost = cache.get(instance.species);
      if (cost === undefined) {
        cost = Math.max(1, collidersFor(byId.get(instance.species)).length);
        cache.set(instance.species, cost);
      }
      return cost;
    };
  }, [byId]);

  useFrame(() => {
    const focus = focusRef.current;
    if (
      builtAt &&
      Math.hypot(focus.x - builtAt.x, focus.z - builtAt.z)
        < Math.max(1.5, builtAt.covered * REBUILD_AT_COVER_FRACTION)
    ) {
      return;
    }
    const { chosen, coveredRadiusM } = selectNearestSolids(
      solidsRef.current, focus, RING_M, COLLIDER_BUDGET, costOf, MAX_BODIES,
    );
    setBuiltAt({ x: focus.x, z: focus.z, covered: coveredRadiusM });
    setActive(chosen);
  });

  useEffect(() => { onCount?.(active.length); }, [active, onCount]);

  return (
    <>
      {active.map((instance, i) => {
        const shapes = collidersFor(byId.get(instance.species));
        if (!shapes.length) return null;
        const s = instance.scale;
        // ONE rigid body per instance, carrying every shape. The body sits at
        // the instance and is rotated exactly as the renderer rotates the mesh
        // (same YXZ euler), so each shape's own offset is a plain local
        // position — which is also what keeps a curved trunk's chain of
        // capsules following the trunk once the instance is yawed. (Round 5
        // added the offset in world axes and yawed the body about its
        // displaced centre; off-axis trunks landed metres from their trees.)
        return (
          <RigidBody
            key={`${instance.species}|${instance.x.toFixed(2)}|${instance.z.toFixed(2)}|${i}`}
            type="fixed"
            colliders={false}
            position={[instance.x, instance.y, instance.z]}
            rotation={[instance.tiltX, instance.yaw, instance.tiltZ, "YXZ"]}
          >
            {shapes.map((shape, j) => {
              const local: [number, number, number] = [
                shape.offsetM[0] * s, shape.offsetM[1] * s, shape.offsetM[2] * s,
              ];
              return shape.kind === "capsule" ? (
                // Rapier's capsule half-height excludes the caps, so subtract
                // the radius — otherwise a trunk's collider stands taller than
                // the trunk and the player bumps into thin air above it.
                <CapsuleCollider
                  key={j}
                  position={local}
                  args={[
                    Math.max(0.05, (shape.heightM / 2 - shape.radiusM) * s),
                    shape.radiusM * s,
                  ]}
                />
              ) : (
                <CuboidCollider
                  key={j}
                  position={local}
                  args={[
                    shape.halfExtentsM[0] * s,
                    shape.halfExtentsM[1] * s,
                    shape.halfExtentsM[2] * s,
                  ]}
                />
              );
            })}
          </RigidBody>
        );
      })}
    </>
  );
}
