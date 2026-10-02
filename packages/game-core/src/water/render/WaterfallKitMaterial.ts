import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import { sel, type TslNode } from "../../render/nodes/materialNodes";
import { createDepthPlaceholder, sceneEyeDepthNode } from "../../render/nodes/depthNodes";
import { instanceMatrixNode, matrixColumn } from "../../fx/instanceNodes";
import { STREAK_BREATHE_PERIOD_S, STREAK_BREATHE_AMPLITUDE, fallsIrradianceNode, fallsSunVisibilityNode,
  type FallsSunShadow } from "./whitewaterStreaks";
import type { KitShapeRole } from "./WaterfallKit";
import { POOL_FADE_M } from "./WaterfallKitStack";
import { sharedUniform } from "../../render/nodes/sharedUniform";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const {
  abs, attribute, cameraPosition, clamp, cos, cross, dFdx, dFdy, dot, float, max, normalize, positionLocal,
  positionView, positionWorld, pow, smoothstep, texture, uv, varying, vec2,
  vec3, vec4,
} = tsl as unknown as Record<string, TslNode>;
/**
 * The one material family every vanilla FX piece is drawn with (decision
 * 0064): Bethesda's geometry and textures, our shading. Per shape role it
 * reproduces the UV-scroll controllers the export dropped (audit §4), a
 * second layer of the same texture at a near-but-unequal rate, the slow U
 * drift and the U-scale breathe on the thin sheets; alpha blend, depth-write
 * off, double-sided; the edge-on fade (cos 0.26 → 0.09, audit §7); a soft
 * depth fade per layer against the scene depth; unlit emissive grey or white
 * times the shared falls irradiance (`whitewaterStreaks.fallsIrradianceNode`)
 * under the sun's shadow node, so a piece exposes like the strip whitewater
 * and the pool foam beside it; nothing drawn from under water; geometry
 * below the receiving pool fades out.
 *
 * The `lit` kind (the bodies' inner water shell, `fxwatertile01` + normal)
 * is the one lit surface: albedo × irradiance plus a sun highlight from the
 * scrolling normal map, so the body reads as water under the whitewater.
 *
 * Instanced: `instanceMatrix` from the stack, `aInst` = (phase s, pool y,
 * reserved, alpha scale). `uVerticalScale` is applied to the WORLD y after
 * the instance transform, like every other water mesh.
 */

/** A uniform node: `.value` is written by the owner each frame. */
export interface KitUniform<T> {
  value: T;
}

/**
 * The frame state every kit piece and the mist volume share: `uniform()`
 * nodes (one instance each, shared by every material; write `.value`).
 * `uSceneDepth` is a texture node (`.value` swaps the texture; a 1x1 depth
 * placeholder while there is none, `uHasDepth` 0). `sunShadow` holds the
 * sun's shadow node (read at build; see `fallsSunVisibilityNode`).
 */
export interface KitSharedUniforms {
  uTime: KitUniform<number>;
  uVerticalScale: KitUniform<number>;
  uAmbient: KitUniform<THREE.Vector3>;
  uSunLight: KitUniform<THREE.Vector3>;
  uSunDir: KitUniform<THREE.Vector3>;
  uSceneDepth: KitUniform<THREE.Texture>;
  uHasDepth: KitUniform<number>;
  uCamNear: KitUniform<number>;
  uCamFar: KitUniform<number>;
  uResolution: KitUniform<THREE.Vector2>;
  uOpacity: KitUniform<number>;
  uUnderwater: KitUniform<number>;
  /** Season/tide lift of the receiving pools (m). */
  uLift: KitUniform<number>;
  sunShadow: FallsSunShadow;
  /** The 1x1 depth texture `uSceneDepth` holds while no scene depth is bound. */
  depthPlaceholder: THREE.DepthTexture;
}

export function createKitSharedUniforms(): KitSharedUniforms {
  const depthPlaceholder = createDepthPlaceholder();
  return {
    uTime: sharedUniform(0),
    uVerticalScale: sharedUniform(1),
    uAmbient: sharedUniform(new THREE.Vector3(0.2, 0.2, 0.2)),
    uSunLight: sharedUniform(new THREE.Vector3(1, 1, 1)),
    uSunDir: sharedUniform(new THREE.Vector3(0, 1, 0)),
    uSceneDepth: texture(depthPlaceholder),
    uHasDepth: sharedUniform(0),
    uCamNear: sharedUniform(0.3),
    uCamFar: sharedUniform(60000),
    uResolution: sharedUniform(new THREE.Vector2(1, 1)),
    uOpacity: sharedUniform(1),
    uUnderwater: sharedUniform(0),
    uLift: sharedUniform(0),
    sunShadow: { node: null },
    depthPlaceholder,
  };
}

/** Edge-on fade: opacity 1 → 0 between cos 0.26 and cos 0.09 (audit §7). */
export const KIT_FACING_FADE = { start: 0.09, full: 0.26 } as const;

/**
 * Object-space position whose instance transform lands the world point with
 * its y remapped to `(y + lift) × verticalScale` (the old vertex shader
 * edited the world position AFTER `instanceMatrix`; `positionNode` sits
 * BEFORE it, so the world-y shift is carried back through M⁻¹: M⁻¹·e_y is
 * (c1×c2, c2×c0, c0×c1).y / det over M's columns). Exact for any affine M.
 */
export function liftedInstancePositionNode(lift: TslNode, verticalScale: TslNode): TslNode {
  const m = instanceMatrixNode();
  const c0 = matrixColumn(m, 0), c1 = matrixColumn(m, 1), c2 = matrixColumn(m, 2), c3 = matrixColumn(m, 3);
  const p = positionLocal;
  const worldY = c0.y.mul(p.x).add(c1.y.mul(p.y)).add(c2.y.mul(p.z)).add(c3.y);
  const dy = worldY.add(lift).mul(verticalScale).sub(worldY);
  const r0 = cross(c1, c2);
  const det = dot(c0, r0);
  const invEy = vec3(r0.y, cross(c2, c0).y, cross(c0, c1).y).div(det);
  return p.add(invEy.mul(dy));
}

/** mat3(instanceMatrix) · v, normalised (the old world normal of an instanced piece). */
export function instanceWorldDirectionNode(v: TslNode): TslNode {
  const m = instanceMatrixNode();
  return normalize(matrixColumn(m, 0).mul(v.x).add(matrixColumn(m, 1).mul(v.y)).add(matrixColumn(m, 2).mul(v.z)));
}

/** One material per shape role, sharing the frame uniforms by reference. */
export function createKitPieceMaterial(role: KitShapeRole, tex: THREE.Texture | null,
  normalTex: THREE.Texture | null, shared: KitSharedUniforms): MeshBasicNodeMaterial {
  const u = shared as unknown as Record<string, TslNode>;
  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  // Named so a shader-compile error in the probe/console identifies this
  // material instead of reporting a blank name (0064 bring-up).
  material.name = `es-waterfall-kit-${role.kind}-${role.match}`;

  material.positionNode = liftedInstancePositionNode(u.uLift, u.uVerticalScale);
  const inst = attribute("aInst", "vec4");
  const normalW = varying(instanceWorldDirectionNode(attribute("normal", "vec3")), "vEsKitNormalW");
  const worldPos = positionWorld;

  const t = u.uTime.add(inst.x);
  // Bethesda's controllers: the UV offset ramps linearly, forever; the thin
  // sheets also breathe their U scale 1.00 -> 1.05 -> 1.00 over 8.33 s
  const breathe = role.breathe
    ? float(1).add(float(STREAK_BREATHE_AMPLITUDE * 0.5).mul(float(1).sub(cos(t.mul(6.2831853).div(STREAK_BREATHE_PERIOD_S)))))
    : float(1);
  const vUv = uv();
  const uv1 = vec2(vUv.x.mul(breathe), vUv.y).add(vec2(role.scroll[0], role.scroll[1]).mul(t));
  const LUMW = vec3(0.2126, 0.7152, 0.0722);
  const map = texture(tex ?? new THREE.Texture());
  const s1 = map.sample(uv1);
  // coverage: alpha, or (greyscale-to-alpha textures) the grey itself
  const coverage = (s: TslNode) => (role.covFromLum ? s.a.mul(pow(dot(s.rgb, LUMW), 2)) : s.a);
  let cov = coverage(s1);
  let tone = s1.rgb;
  if (role.scroll2) {
    const s2 = map.sample(vec2(vUv.x.mul(breathe).add(0.37), vUv.y.add(0.11)).add(vec2(role.scroll2[0], role.scroll2[1]).mul(t)));
    cov = float(1).sub(float(1).sub(cov).mul(float(1).sub(coverage(s2))));
    tone = max(tone, s2.rgb);
  }
  let alpha = float(role.alpha).mul(cov).mul(inst.w).mul(u.uOpacity);
  // nothing of the kit is drawn from under the pool: that view is the field
  // water's below variant, not an opaque plane through the surface
  alpha = alpha.mul(float(1).sub(clamp(u.uUnderwater, 0, 1)));
  // geometry that dips under the receiving pool fades out (the stack lands
  // its last piece at the plunge, but the vanilla feet go a little below)
  const poolY = inst.y.add(u.uLift).mul(u.uVerticalScale);
  alpha = alpha.mul(smoothstep(poolY.sub(u.uVerticalScale.mul(POOL_FADE_M)), poolY, worldPos.y));
  // edge-on layers fade instead of showing their silhouette as a cut
  const viewDir = normalize(cameraPosition.sub(worldPos));
  const faceN = normalize(cross(dFdx(worldPos), dFdy(worldPos)));
  const facing = abs(dot(faceN, viewDir));
  alpha = alpha.mul(smoothstep(KIT_FACING_FADE.start, KIT_FACING_FADE.full, facing));
  // soft particle against the scene depth, per layer (audit §4 rule 5)
  if (role.softDepthM > 0) {
    const sceneEye = sceneEyeDepthNode(u.uSceneDepth, u.uResolution, u.uCamNear, u.uCamFar);
    const fragEye = positionView.z.negate();
    alpha = alpha.mul(sel(u.uHasDepth.greaterThan(0.5), smoothstep(0, role.softDepthM, sceneEye.sub(fragEye)), float(1)));
  }
  material.maskNode = alpha.greaterThanEqual(0.004);

  const vis = fallsSunVisibilityNode(shared.sunShadow);
  const irr = fallsIrradianceNode(u.uAmbient, u.uSunLight, u.uSunDir, float(role.upness), vis);
  let color = tone.mul(role.emissive).mul(irr);
  if (role.kind === "lit") {
    // the lit inner water shell: albedo under the shared irradiance plus a
    // sun highlight from the scrolling normal map
    let n = normalW;
    if (normalTex) {
      const nt = texture(normalTex).sample(uv1.mul(2)).xyz.mul(2).sub(1);
      n = normalize(n.add(nt.mul(0.6)));
    }
    n = sel(dot(n, viewDir).lessThan(0), n.negate(), n);
    const h = normalize(viewDir.add(u.uSunDir));
    const spec = pow(max(dot(n, h), 0), 48).mul(vis).mul(0.35);
    const sun = u.uSunLight.div(0.06);
    color = color.add(sun.mul(spec).mul(1 / Math.PI));
  }
  material.colorNode = vec4(color, alpha);
  return material;
}

/** A texture bound for the kit: repeat both axes (the offset scrolls forever), no colour management. */
export function prepareKitTexture(tex: THREE.Texture): THREE.Texture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
