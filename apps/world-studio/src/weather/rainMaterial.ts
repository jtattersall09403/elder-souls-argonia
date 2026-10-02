import * as THREE from "three";
import { NodeMaterial } from "three/webgpu";
import {
  cameraPosition, cameraProjectionMatrix, cameraViewMatrix, clamp, cross, distance, float, length, max, min, mod,
  normalize, smoothstep, step, texture, varying, vec2, vec3, vec4, attribute,
} from "three/tsl";
import type { TslNode } from "@elder-souls/game-core/render/nodes/materialNodes";
import { sharedUniform } from "@elder-souls/game-core/render/nodes/sharedUniform";

/**
 * The rain streaks' geometry and node material, without React, so the
 * RainSystem component and the harness scene build the same thing. Each drop
 * is a velocity-aligned quad computed in the vertex stage; see RainSystem.tsx
 * for why every constant is what it is.
 */

/** Eye/camera persistence, seconds: how long a falling drop smears for. Streak
 * length = fall speed × this, so speed and length can never disagree. */
export const RAIN_SHUTTER_S = 0.09;

/** The streaks' uniforms: `uniform()` nodes written through `.value`. `uAir`
 * is a texture node whose `.value` is the bound climate-air raster (a 1x1
 * blank until the sky hands one over). */
export interface RainUniforms {
  uTime: { value: number } & TslNode;
  uWindV: { value: THREE.Vector2 } & TslNode;
  uFall: { value: number } & TslNode;
  uIntensity: { value: number } & TslNode;
  uSpan: { value: THREE.Vector3 } & TslNode;
  uAir: { value: THREE.Texture } & TslNode;
  uExtentM: { value: number } & TslNode;
  uPixelWorld: { value: number } & TslNode;
  uShutter: { value: number } & TslNode;
  uColor: { value: THREE.Color } & TslNode;
  uOpacity: { value: number } & TslNode;
}

export interface RainStreaks {
  mesh: THREE.Mesh;
  material: NodeMaterial;
  geometry: THREE.BufferGeometry;
  uniforms: RainUniforms;
  /** True until a real climate-air raster replaces the blank. */
  airIsBlank: () => boolean;
  dispose: () => void;
}

/** One static buffer of `count` quads, four vertices each. */
export function createRainGeometry(count: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4 * 3);
  const corners = new Float32Array(count * 4 * 2);
  const index: number[] = [];
  // deterministic seeds (no Math.random in world systems)
  let s = 0x8c17;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i += 1) {
    const sx = rnd();
    const sy = rnd();
    const sz = rnd();
    for (let c = 0; c < 4; c += 1) {
      seeds.set([sx, sy, sz], (i * 4 + c) * 3);
    }
    corners.set([-1, 0, 1, 0, 1, 1, -1, 1], i * 4 * 2);
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
  g.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2));
  g.setIndex(index);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // camera-relative
  return g;
}

function buildRainMaterial(u: RainUniforms): NodeMaterial {
  const aSeed: TslNode = attribute("aSeed", "vec3");
  const aCorner: TslNode = attribute("aCorner", "vec2");
  const cam: TslNode = cameraPosition;

  const vel: TslNode = vec3(u.uWindV.x, u.uFall.negate(), u.uWindV.y);
  const rel: TslNode = mod(aSeed.mul(u.uSpan).add(vel.mul(u.uTime)).sub(cam), u.uSpan);
  const pos: TslNode = cam.add(rel).sub(u.uSpan.mul(0.5));
  // fraction of drops appears as intensity rises (drop id = aSeed.x)
  const on: TslNode = step(aSeed.x, u.uIntensity);
  // canopy shelter: capped — the forest roof is a region raster, not walls
  const airUv: TslNode = vec2(pos.x.div(u.uExtentM), float(1.0).sub(pos.z.div(u.uExtentM)));
  // Sampled from the texture node itself so a later `.value` swap follows;
  // level 0, as the old vertex-stage texture2D read.
  const sampleAir = texture as (...args: TslNode[]) => TslNode;
  const canopy: TslNode = sampleAir(u.uAir, airUv, float(0)).b;
  // Soft volume edge (round 5): the box must end in thinning haze, not a
  // hard wall of suddenly-no-rain around the player.
  const edge: TslNode = float(1.0).sub(
    smoothstep(0.72, 1.0, length(rel.sub(u.uSpan.mul(0.5)).xz).div(u.uSpan.x.mul(0.5))),
  );
  // the flyover far above the weather layer sees no streaks
  const high: TslNode = float(1.0).sub(smoothstep(500.0, 900.0, cam.y));
  const velDir: TslNode = normalize(vel);
  const depth: TslNode = max(distance(pos, cam), 0.7);
  const view: TslNode = pos.sub(cam).div(depth);
  const right: TslNode = normalize(cross(velDir, view).add(vec3(1e-5, 0.0, 0.0)));
  // Screen-space minimum width (round 3): never below ~1.5 px at this depth;
  // alpha compensates for the widening so far rain reads as grey drizzle haze.
  const halfW: TslNode = max(0.016, u.uPixelWorld.mul(0.75).mul(depth));
  const widthFade: TslNode = clamp(float(0.016).div(halfW), 0.3, 1.0);
  const alpha: TslNode = on.mul(float(1.0).sub(canopy.mul(0.55))).mul(edge).mul(high).mul(widthFade);
  // Streak length derives from the fall speed (round 4).
  const len: TslNode = u.uFall.mul(u.uShutter).mul(aSeed.z.mul(0.6).add(0.7));
  const quad: TslNode = pos.add(right.mul(aCorner.x.mul(halfW))).add(velDir.mul(aCorner.y.mul(len)));

  const vAlpha: TslNode = varying(alpha, "vRainAlpha");
  const vProfile: TslNode = varying(aCorner, "vRainProfile");

  const material = new NodeMaterial();
  material.vertexNode = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(quad, 1.0));
  // soft "motion-blurred" streak: smooth across, faded at both ends
  const across: TslNode = float(1.0).sub(vProfile.x.mul(vProfile.x));
  const along: TslNode = min(float(1.0).sub(vProfile.y).mul(vProfile.y).mul(5.0), 1.0);
  material.fragmentNode = vec4(u.uColor, u.uOpacity.mul(vAlpha).mul(across).mul(across).mul(along));
  return material;
}

/** Build one camera-following volume of streaks (core or far shell). */
export function createRainStreaks(opts: {
  count: number;
  extentM: number;
  span: THREE.Vector3;
  opacityScale: number;
}): RainStreaks {
  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  blank.needsUpdate = true;
  const uniforms: RainUniforms = {
    uTime: sharedUniform(0),
    uWindV: sharedUniform(new THREE.Vector2(0, 0)),
    uFall: sharedUniform(9),
    uIntensity: sharedUniform(0),
    uSpan: sharedUniform(opts.span),
    uAir: texture(blank),
    uExtentM: sharedUniform(opts.extentM),
    uPixelWorld: sharedUniform(0.0013),
    uShutter: sharedUniform(RAIN_SHUTTER_S),
    uColor: sharedUniform(new THREE.Color(0.6, 0.65, 0.7)),
    uOpacity: sharedUniform(0.6 * opts.opacityScale),
  };
  const material = buildRainMaterial(uniforms);
  material.name = "weather:rain";
  material.transparent = true;
  material.depthWrite = false;
  // Billboards spun by cross(velDir, view) flip winding with the view
  // direction — FrontSide silently culled half the streaks (round 3).
  material.side = THREE.DoubleSide;
  // one uniform colour: order-free, one pass instead of back-then-front (perf10 O10)
  material.forceSinglePass = true;
  material.fog = false;
  const geometry = createRainGeometry(opts.count);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = "weather:rain";
  return {
    mesh,
    material,
    geometry,
    uniforms,
    airIsBlank: () => uniforms.uAir.value === blank,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      blank.dispose();
    },
  };
}
