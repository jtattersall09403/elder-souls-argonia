/**
 * The two volumetric TSL helpers every material author uses (decision 0112
 * §2–§3):
 * - `applyVolumetrics`: the froxel medium applied to a lit colour, used
 *   inside `scene.fogNode` before the aerial term;
 * - `sceneRadiance`: a display colour (what it should look like on screen,
 *   0..1) turned into scene-referred radiance through the current exposure.
 *   Every unlit or emissive colour under physical exposure goes through it
 *   (docs/standards/tsl-shaders.md "Unlit colours under physical exposure").
 */
import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";

const T = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode> & Record<string, TslNode>;
const { clamp, dot, float, fract, log, max, mix, vec2, vec3, vec4 } = T;

/** ACES filmic maps scene 0.6 to about mid display; the display→scene anchor the fire and motes share. */
export const SCENE_WHITE = 0.6;

/** Display colour → scene-referred radiance at the renderer's current exposure. */
export function sceneRadiance(display: TslNode, exposure: TslNode = T.toneMappingExposure): TslNode {
  return display.mul(SCENE_WHITE).div(max(exposure, float(1e-9)));
}

/** What the fog stage needs from a live `Volumetrics`: its integrated grid and slice mapping. */
export interface VolumetricsSampler {
  /** Samples the integrated grid (rgb in-scatter, a transmittance) at uvw; the node it
   * returns follows the grid when the band changes. */
  sampleIntegrated(uvw: TslNode): TslNode;
  near: TslNode;
  far: TslNode;
  /** Grid dimensions (x, y, slices); when given, the lookup is jittered per pixel by half a froxel. */
  gridSize?: TslNode;
  /** 1 when a band is on, else 0 (the colour passes through). */
  on: TslNode;
}

/** `color` seen through the medium from the camera to `viewDepth` metres at `screenUV`. */
export function applyVolumetrics(v: VolumetricsSampler, color: TslNode, viewDepth: TslNode, screenUV: TslNode): TslNode {
  // slice coordinate: the exact inverse of the inject's exponential depth (near * (far/near)^s)
  const s = log(max(viewDepth, v.near).div(v.near)).div(log(v.far.div(v.near)));
  let uvw = vec3(screenUV.x, screenUV.y, s);
  if (v.gridSize) {
    // interleaved-gradient noise per pixel: +-half a froxel in xy and in slice, so the trilinear
    // lookup dithers the froxel edges instead of stair-stepping them
    const px = T.screenCoordinate.xy;
    const ign = (o: number) => fract(float(52.9829189).mul(fract(dot(px.add(o), vec2(0.06711056, 0.00583715))))).sub(0.5);
    uvw = uvw.add(vec3(ign(0), ign(17.3), ign(41.7)).div(v.gridSize));
  }
  // the integrated texel k holds the medium up to the far edge of slice k: shift by half a slice
  const half = v.gridSize ? float(0.5).div(v.gridSize.z) : float(0);
  const sample = v.sampleIntegrated(vec3(uvw.x, uvw.y, clamp(uvw.z.sub(half), 0, 1)));
  const lit = color.rgb.mul(sample.a).add(sample.rgb);
  return vec4(mix(color.rgb, lit, v.on), color.a);
}
