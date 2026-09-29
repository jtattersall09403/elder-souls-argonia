/**
 * Floating dust sparkles as a TSL sprite cloud (decision 0107). Replaces
 * drei's `<Sparkles>`, whose material is a hand-written GLSL shader the node
 * renderer cannot run. Same props, same maths:
 *
 * - positions uniformly spread over `scale` (per axis), centred on the object;
 * - each point drifts by `sin/cos(time * speed + worldX * noise * 100) * 0.2`
 *   on y, z and x (drei's vertex wobble);
 * - on-screen size `size * 25 * dpr / -viewZ` pixels (drei's gl_PointSize);
 * - fragment alpha `(0.05 / distance(uv, 0.5) - 0.1) * opacity`, colour
 *   `color`, transparent, no depth write, tone mapped like any material.
 *
 * WebGPU has no point sizes, so each point is an instanced camera-facing
 * quad (`Sprite.count`, PointsNodeMaterial's sprite path). The wobble is
 * added in the object's local frame: exact for the unscaled, unrotated
 * clouds the game places (drei adds it in world space).
 */
import * as THREE from "three";
import { InstancedBufferAttribute } from "three";
import { PointsNodeMaterial } from "three/webgpu";
import {
  cos,
  distance,
  float,
  instancedBufferAttribute,
  modelWorldMatrix,
  positionView,
  sin,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { TslNode } from "../render/nodes/materialNodes";

export interface SparklesOptions {
  count?: number;
  /** Spread per axis (a number spreads all three). */
  scale?: number | [number, number, number];
  /** Per-point size; default random in [0, 1) per point like drei. */
  size?: number;
  speed?: number;
  opacity?: number;
  /** Wobble frequency multiplier (drei `noise`). */
  noise?: number;
  color?: THREE.ColorRepresentation;
  /** Deterministic stream in [0, 1) for positions and default sizes; Math.random otherwise. */
  random?: () => number;
}

export interface Sparkles {
  object: THREE.Sprite;
  /** Seconds; write every frame (drei used the R3F clock's elapsed time). */
  time: { value: number };
  dispose(): void;
}

/** drei's fragment strength at a point-quad UV (plain maths, tested). */
export function sparkleStrength(u: number, v: number): number {
  const d = Math.hypot(u - 0.5, v - 0.5);
  return 0.05 / d - 0.1;
}

/** drei's on-screen point size in pixels at view depth `viewZ` (negative). */
export function sparklePixelSize(size: number, dpr: number, viewZ: number): number {
  return (size * 25 * dpr) / -viewZ;
}

export function createSparkles(options: SparklesOptions = {}): Sparkles {
  const count = options.count ?? 100;
  const rnd = options.random ?? Math.random;
  const s = options.scale ?? 1;
  const spread: [number, number, number] = Array.isArray(s) ? s : [s, s, s];
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) positions[i * 3 + a] = spread[a] * (0.5 - rnd());
    sizes[i] = options.size ?? rnd();
  }
  const noise = options.noise ?? 1;
  const speed = options.speed ?? 1;
  const opacity = options.opacity ?? 1;
  const color = new THREE.Color(options.color ?? 0xffffff);

  const time = uniform(0);
  const center: TslNode = instancedBufferAttribute(new InstancedBufferAttribute(positions, 3));
  const size: TslNode = instancedBufferAttribute(new InstancedBufferAttribute(sizes, 1));
  const worldX: TslNode = (modelWorldMatrix as TslNode).mul(vec4(center, 1)).x;
  const phase: TslNode = (time as TslNode).mul(speed);
  const k = noise * 100;
  const wobble: TslNode = vec3(
    cos(phase.add(worldX.mul(k))).mul(0.2),
    sin(phase.add(worldX.mul(k))).mul(0.2),
    cos(phase.add(worldX.mul(k))).mul(0.2),
  );

  const material = new PointsNodeMaterial({ transparent: true, depthWrite: false });
  material.sizeAttenuation = false;
  material.positionNode = (center as TslNode).add(wobble);
  // PointsNodeMaterial multiplies by the DPR itself: size * 25 / -viewZ.
  material.sizeNode = (size as TslNode).mul(25).div((positionView as TslNode).z.negate());
  const strength: TslNode = float(0.05).div(distance(uv(), vec2(0.5))).sub(0.1);
  material.colorNode = vec4(vec3(color.r, color.g, color.b), strength.mul(opacity));

  const object = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  object.count = count;
  // The instances spread far past the sprite's own point: never cull on it.
  object.frustumCulled = false;
  object.raycast = () => {};
  return {
    object,
    time: time as unknown as { value: number },
    dispose() {
      // The quad geometry is three's shared sprite quad: never dispose it.
      material.dispose();
    },
  };
}
