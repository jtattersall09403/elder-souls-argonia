import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";

/**
 * A health bar over an actor's head.
 *
 * Deliberately generic: it follows an anchor and reads a number, and knows
 * nothing about enemies, fighters or the combat FSM. The same component serves
 * a hostile, a summon, a destructible barrel and a boss — a boss just gets a
 * wider one — which is the point of replacing the single hard-coded bar this
 * grew out of.
 *
 * In the scene rather than in the HUD, on purpose. A screen-space bar has to be
 * projected and re-laid-out every frame, which means a React render per actor
 * per frame; a billboarded quad is one matrix update, occludes correctly against
 * the world, and shrinks with distance the way a marker over a body should.
 */

export type HealthReading = {
  current: number;
  max: number;
};

const WIDTH = 0.62;
const HEIGHT = 0.055;
/**
 * How far above the anchor the bar floats, in metres.
 *
 * Measured from an upper-body bone, not the floor, so it stays with the actor
 * through a crouch or a stagger. This clears the top of a standing head with a
 * little air, and no more: a marker parked half a body above its owner stops
 * reading as belonging to it.
 */
const DEFAULT_OFFSET_Y = 0.74;
/**
 * How fast the trailing "damage taken" bar catches up, per second.
 *
 * Souls games show the blow landing and then the bar settling. It reads as
 * weight, and it is the difference between a number changing and a hit landing.
 */
const LAG_CATCHUP_PER_SECOND = 0.55;
/** Seconds of stillness before the lag bar starts moving at all. */
const LAG_HOLD_SECONDS = 0.35;

export function ActorHealthBar({
  anchor,
  read,
  offsetY = DEFAULT_OFFSET_Y,
  width = WIDTH,
}: {
  /** Object to float above. An upper-body bone keeps it with the actor's motion. */
  anchor: RefObject<THREE.Object3D | null>;
  /**
   * Current and maximum health, plus whether the bar should be up at all.
   * A callback rather than props so the frame loop can read live combat state
   * without a render.
   */
  read: () => (HealthReading & { visible: boolean }) | null;
  offsetY?: number;
  width?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const fill = useRef<THREE.Mesh>(null);
  const lag = useRef<THREE.Mesh>(null);
  const tmp = useMemo(() => ({
    anchorWorld: new THREE.Vector3(),
    parentWorld: new THREE.Quaternion(),
  }), []);
  // Starts unset so the first reading *becomes* the trailing value. Seeding it
  // full would show a wound the actor never took, on anything that spawns
  // already hurt.
  const lagged = useRef<number | null>(null);
  const holding = useRef(0);

  useFrame(({ camera }, delta) => {
    const marker = group.current;
    if (!marker) return;
    const reading = read();
    const visible = Boolean(reading?.visible);
    marker.visible = visible;
    if (!reading || !visible) return;

    if (anchor.current && marker.parent) {
      anchor.current.getWorldPosition(tmp.anchorWorld);
      tmp.anchorWorld.y += offsetY;
      marker.parent.worldToLocal(tmp.anchorWorld);
      marker.position.copy(tmp.anchorWorld);
    }
    // Face the camera, in the parent's frame: the bar hangs off an actor that
    // turns, and a marker that turns with it is unreadable from behind.
    marker.parent?.getWorldQuaternion(tmp.parentWorld);
    marker.quaternion.copy(tmp.parentWorld.invert()).multiply(camera.quaternion);

    const ratio = reading.max > 0
      ? Math.min(1, Math.max(0, reading.current / reading.max))
      : 0;
    if (lagged.current === null || ratio > lagged.current) lagged.current = ratio;
    else if (ratio < lagged.current) {
      holding.current += delta;
      if (holding.current > LAG_HOLD_SECONDS) {
        lagged.current = Math.max(ratio, lagged.current - LAG_CATCHUP_PER_SECOND * delta);
      }
    } else {
      holding.current = 0;
    }

    setFill(fill.current, ratio, width);
    setFill(lag.current, lagged.current, width);
  });

  return (
    <group ref={group}>
      {/*
        Explicitly ordered, not z-offset. None of these write depth — they are
        three coplanar quads — so what draws on top is decided entirely by
        render order, and leaving it to the default sorts every transparent
        layer *after* every opaque one. That is how the trailing bar ends up
        painted over the health it is supposed to trail behind.
      */}
      <mesh renderOrder={18}>
        <planeGeometry args={[width + 0.024, HEIGHT + 0.024]} />
        <meshBasicMaterial color="#0a0908" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh ref={lag} renderOrder={19}>
        <planeGeometry args={[1, HEIGHT]} />
        <meshBasicMaterial color="#8a7050" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh ref={fill} renderOrder={20}>
        <planeGeometry args={[1, HEIGHT]} />
        <meshBasicMaterial color="#a52a2e" transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Scale a unit quad to `ratio` of the bar and shift it so it empties rightward.
 * A plane scales about its centre, so without the shift the bar would drain
 * from both ends at once.
 */
function setFill(mesh: THREE.Mesh | null, ratio: number, width: number) {
  if (!mesh) return;
  const span = Math.max(1e-4, ratio) * width;
  mesh.scale.x = span;
  mesh.position.x = (span - width) / 2;
}
