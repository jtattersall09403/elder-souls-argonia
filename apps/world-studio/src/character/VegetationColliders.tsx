import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import type { World, RigidBody } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  collidersFor,
  selectNearestSolids,
  type FloraCollider,
  type FloraCollisionAsset,
  type SolidInstance,
} from "@elder-souls/game-core/physics/floraSolids";

/**
 * Makes the nearby trees, boulders and root arches solid.
 *
 * A small ring of fixed Rapier bodies around the player, rebuilt as they move
 * — the same shape as `ChunkColliders`, and for the same reason: colliders
 * for a whole chunk would be thousands of bodies for a forest crossed in a
 * minute; colliders for the few dozen things within reach cost nothing and
 * are indistinguishable to the player.
 *
 * Bodies are managed IMPERATIVELY and diffed between rebuilds. The previous
 * version rendered a `<RigidBody>` element per instance, so every rebuild
 * re-created up to 1,400 React components (and their colliders) even though
 * most of the ring is unchanged by a few steps — a recurring hitch felt
 * exactly in dense forest, where rebuilds are most frequent (owner, Phase 10
 * round 10 performance report). Diffing keeps the per-rebuild work
 * proportional to what actually changed at the ring's edge.
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
 * Ceiling on simultaneous flora COLLIDERS (not bodies): a moulded willow is
 * dozens of capsules, a pebble is one, so counting instances budgets the
 * wrong thing. These are fixed bodies with no simulation, so the cost is
 * broad-phase only and a few thousand is cheap.
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

function instanceKey(instance: SolidInstance): string {
  return `${instance.species}|${instance.x.toFixed(2)}|${instance.z.toFixed(2)}|${instance.y.toFixed(2)}`;
}

function buildBody(
  world: World,
  rapier: ReturnType<typeof useRapier>["rapier"],
  instance: SolidInstance,
  shapes: FloraCollider[],
): RigidBody {
  // ONE fixed body per instance, rotated exactly as the renderer rotates the
  // mesh (same YXZ euler), so each shape's own offset is a plain local
  // position — which is also what keeps a moulded trunk's capsules following
  // the trunk once the instance is yawed.
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(instance.tiltX, instance.yaw, instance.tiltZ, "YXZ"),
  );
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.fixed()
      .setTranslation(instance.x, instance.y, instance.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );
  const s = instance.scale;
  for (const shape of shapes) {
    const desc =
      shape.kind === "capsule"
        ? rapier.ColliderDesc.capsule(shape.halfHeightM * s, shape.radiusM * s)
        : rapier.ColliderDesc.cuboid(
            shape.halfExtentsM[0] * s,
            shape.halfExtentsM[1] * s,
            shape.halfExtentsM[2] * s,
          );
    desc.setTranslation(
      shape.offsetM[0] * s, shape.offsetM[1] * s, shape.offsetM[2] * s,
    );
    if (shape.kind === "capsule") {
      desc.setRotation({
        x: shape.rotation[0], y: shape.rotation[1],
        z: shape.rotation[2], w: shape.rotation[3],
      });
    }
    world.createCollider(desc, body);
  }
  return body;
}

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
  const { world, rapier } = useRapier();
  const bodies = useRef(new Map<string, RigidBody>());
  const builtAt = useRef<{ x: number; z: number; covered: number } | null>(null);
  const assetsRef = useRef<Map<string, FloraCollisionAsset> | null>(null);

  // The same manifest `Vegetation` reads, fetched independently so the two
  // components stay uncoupled; it is a small JSON and the browser serves the
  // second request from cache.
  useEffect(() => {
    let cancelled = false;
    fetch(`${baseUrl}kits/flora-province-v1.kit.json`)
      .then((r) => r.json())
      .then((m: { assets: FloraCollisionAsset[] }) => {
        if (!cancelled) {
          assetsRef.current = new Map(m.assets.map((a) => [a.id, a]));
          builtAt.current = null; // force a rebuild now shapes exist
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [baseUrl]);

  // Shapes and per-species collider cost, cached: the manifest never changes
  // within a session and `collidersFor` allocates.
  const caches = useMemo(() => {
    const shapes = new Map<string, FloraCollider[]>();
    const shapesFor = (species: string): FloraCollider[] => {
      let cached = shapes.get(species);
      if (cached === undefined) {
        cached = collidersFor(assetsRef.current?.get(species));
        shapes.set(species, cached);
      }
      return cached;
    };
    return {
      shapesFor,
      costOf: (instance: SolidInstance) =>
        Math.max(1, shapesFor(instance.species).length),
    };
  }, []);

  // Drop every body on unmount (mode switches), not per rebuild.
  useEffect(() => {
    const live = bodies.current;
    return () => {
      for (const body of live.values()) world.removeRigidBody(body);
      live.clear();
    };
  }, [world]);

  useFrame(() => {
    if (!assetsRef.current) return;
    const focus = focusRef.current;
    const built = builtAt.current;
    if (
      built &&
      Math.hypot(focus.x - built.x, focus.z - built.z)
        < Math.max(1.5, built.covered * REBUILD_AT_COVER_FRACTION)
    ) {
      return;
    }
    const { chosen, coveredRadiusM } = selectNearestSolids(
      solidsRef.current, focus, RING_M, COLLIDER_BUDGET, caches.costOf, MAX_BODIES,
    );
    builtAt.current = { x: focus.x, z: focus.z, covered: coveredRadiusM };

    // Diff against the live set: only the ring's leading and trailing edges
    // actually change on a rebuild.
    const wanted = new Map<string, SolidInstance>();
    for (const instance of chosen) wanted.set(instanceKey(instance), instance);
    for (const [key, body] of bodies.current) {
      if (!wanted.has(key)) {
        world.removeRigidBody(body);
        bodies.current.delete(key);
      }
    }
    for (const [key, instance] of wanted) {
      if (bodies.current.has(key)) continue;
      const shapes = caches.shapesFor(instance.species);
      if (!shapes.length) continue;
      bodies.current.set(key, buildBody(world, rapier, instance, shapes));
    }
    onCount?.(bodies.current.size);
  });

  return null;
}
