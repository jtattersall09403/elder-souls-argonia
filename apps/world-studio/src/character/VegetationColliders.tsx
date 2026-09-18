import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import type { World, RigidBody } from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  selectNearestSolids,
  type FloraCollider,
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
 *
 * Raised 2500 -> 3600 in round 11, when the trunk fitter stopped mistaking
 * leaf cards for wood (decision 0036). Slimming the capsules split splayed
 * stems into several thin discs instead of one fat drum, so the kit went
 * 2,039 -> 2,961 capsules and mean cost per species 41 -> 59. At the old
 * budget that dropped the trees covered by a ring from ~61 to ~42, which
 * shrinks the covered radius and so buys MORE frequent rebuilds — the exact
 * trade the MAX_BODIES note below warns against. 3600 restores ~61.
 */
const COLLIDER_BUDGET = 3600;

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

/**
 * Identity of a placed solid: species and its GROUND POSITION, quantised to a
 * centimetre. Y is deliberately NOT part of it. A vegetation rebuild
 * re-grounds every instance against the streamed terrain, so the same tree
 * can come back a centimetre higher; keying on Y made that a destroy-and-
 * rebuild of hundreds of bodies that had not moved. Now the height is a
 * property of the body, updated in place when only it changed.
 */
function instanceKey(instance: SolidInstance): string {
  return `${instance.species}|${instance.x.toFixed(2)}|${instance.z.toFixed(2)}`;
}

/**
 * Instance-scaled trimesh vertices, cached per (species, scale). Rapier copies
 * the array into its own storage at collider creation, but BUILDING it is a
 * few thousand multiplies per rock and the ring sees the same handful of
 * species at the same handful of scales.
 */
function scaledVertices(
  cache: Map<string, Float32Array>,
  species: string,
  vertices: Float32Array,
  scale: number,
): Float32Array {
  const key = `${species}|${scale.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const scaled = new Float32Array(vertices.length);
  for (let i = 0; i < vertices.length; i++) scaled[i] = vertices[i] * scale;
  cache.set(key, scaled);
  return scaled;
}

function buildBody(
  world: World,
  rapier: ReturnType<typeof useRapier>["rapier"],
  instance: SolidInstance,
  shapes: FloraCollider[],
  vertexCache: Map<string, Float32Array>,
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
    if (shape.kind === "trimesh") {
      // The rock's own triangles. Scale is baked into the vertices (Rapier
      // shapes carry no scale); the body already holds the rotation and the
      // translation, so the collider needs neither.
      world.createCollider(
        rapier.ColliderDesc.trimesh(
          scaledVertices(vertexCache, instance.species, shape.vertices, s),
          shape.indices,
        ),
        body,
      );
      continue;
    }
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
  shapesRef,
  focusRef,
  onCount,
}: {
  /** Solid instances published by `Vegetation` on its last rebuild. */
  solidsRef: React.MutableRefObject<SolidInstance[]>;
  /**
   * Collider shapes per species, published by `Vegetation` once its kit has
   * loaded. This component used to fetch the kit manifest itself and box every
   * rock, which is the only shape a manifest can describe. Rocks now collide
   * as their OWN TRIANGLES, and those triangles live in the kit GLB — so the
   * shapes have to come from whoever holds the kit.
   */
  shapesRef: React.MutableRefObject<Map<string, FloraCollider[]> | null>;
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  /** Reports how many bodies are live, for the debug HUD. */
  onCount?: (count: number) => void;
}) {
  const { world, rapier } = useRapier();
  const bodies = useRef(new Map<string, { body: RigidBody; y: number }>());
  const builtAt = useRef<{ x: number; z: number; covered: number } | null>(null);
  /** The shape map the current body set was built against; a change in
   * identity (the kit finishing its load) forces one rebuild. */
  const seenShapes = useRef<Map<string, FloraCollider[]> | null>(null);
  const vertexCache = useRef(new Map<string, Float32Array>());

  // Shapes and per-species collider cost, cached: the manifest never changes
  // within a session and `collidersFor` allocates.
  const caches = useMemo(() => {
    // A species absent from the map is not a defect: since 16f the renderer
    // also draws the underwater-band kit, whose bed-anchored plants and debris
    // carry no collision at all. No shapes, no body, and no log.
    const shapesFor = (species: string): FloraCollider[] =>
      shapesRef.current?.get(species) ?? [];
    return {
      shapesFor,
      costOf: (instance: SolidInstance) =>
        Math.max(1, shapesFor(instance.species).length),
    };
  }, [shapesRef]);

  // Drop every body on unmount (mode switches), not per rebuild.
  useEffect(() => {
    const live = bodies.current;
    return () => {
      for (const entry of live.values()) world.removeRigidBody(entry.body);
      live.clear();
    };
  }, [world]);

  useFrame(() => {
    const shapeMap = shapesRef.current;
    if (!shapeMap) return;
    if (seenShapes.current !== shapeMap) {
      seenShapes.current = shapeMap;
      builtAt.current = null; // the kit has arrived: rebuild against real shapes
    }
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
    for (const [key, entry] of bodies.current) {
      if (!wanted.has(key)) {
        world.removeRigidBody(entry.body);
        bodies.current.delete(key);
      }
    }
    for (const [key, instance] of wanted) {
      const live = bodies.current.get(key);
      if (live) {
        // Same plant, re-grounded: move it rather than rebuild it.
        if (Math.abs(live.y - instance.y) > 0.005) {
          live.body.setTranslation(
            { x: instance.x, y: instance.y, z: instance.z }, false);
          live.y = instance.y;
        }
        continue;
      }
      const shapes = caches.shapesFor(instance.species);
      if (!shapes.length) continue;
      bodies.current.set(
        key,
        {
          body: buildBody(world, rapier, instance, shapes, vertexCache.current),
          y: instance.y,
        },
      );
    }
    onCount?.(bodies.current.size);
  });

  return null;
}
