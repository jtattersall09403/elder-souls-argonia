import type { Vec3 } from "@elder-souls/contracts";

/** Physical flow coordinates shared by normals, foam and foam breakup/shading.
 * World metres and m/s in, texture coordinates out. Two bounded phases avoid
 * accumulated spatial shear. Apply the SAME coordinates to small-scale foam:
 * a stationary breakup mask otherwise pins the visibly salient bubbles. */
export const FLOW_CYCLE_SECONDS = 4;

export function flowAdvectionAt(worldM: Vec3, flowMps: Vec3, timeS: number,
  frequencyPerM = 1, cycleSeconds = FLOW_CYCLE_SECONDS) {
  if (!Number.isFinite(timeS) || !Number.isFinite(cycleSeconds) || cycleSeconds <= 0
    || !Number.isFinite(frequencyPerM) || frequencyPerM <= 0) throw new RangeError("Invalid flow advection clock or scale");
  const phaseA = ((timeS / cycleSeconds) % 1 + 1) % 1;
  const phaseB = (phaseA + 0.5) % 1;
  const at = (phase: number): Vec3 => ({
    x: (worldM.x - flowMps.x * phase * cycleSeconds) * frequencyPerM,
    y: (worldM.y - flowMps.y * phase * cycleSeconds) * frequencyPerM,
    z: (worldM.z - flowMps.z * phase * cycleSeconds) * frequencyPerM,
  });
  // Zero value AND derivative on the resetting phase. Unlike triangular
  // weights this also avoids a first-derivative jerk every half-cycle.
  return { a: at(phaseA), b: at(phaseB), blend: 0.5 + 0.5 * Math.cos(phaseA * 2 * Math.PI) };
}

/** `worldM.y` must be true metres (undo studio exaggeration); flow includes
 * vertical velocity. Frequency scales position AND displacement together,
 * so texture size never changes apparent physical speed. The caller may
 * project these 3D coordinates onto fixed world planes, never rotate absolute
 * kilometre coordinates by a spatially varying flow direction. */
export function flowAdvectionGlsl(): string {
  return /* glsl */ `
struct EsFlowCoordinates { vec3 a; vec3 b; float blend; };
EsFlowCoordinates esFlowAdvection(vec3 worldM, vec3 flowMps, float timeS, float frequencyPerM) {
  const float cycleSeconds = ${FLOW_CYCLE_SECONDS.toFixed(1)};
  float phaseA = fract(timeS / cycleSeconds);
  float phaseB = fract(phaseA + 0.5);
  EsFlowCoordinates result;
  result.a = (worldM - flowMps * (phaseA * cycleSeconds)) * frequencyPerM;
  result.b = (worldM - flowMps * (phaseB * cycleSeconds)) * frequencyPerM;
  result.blend = 0.5 + 0.5 * cos(phaseA * 6.283185307179586);
  return result;
}
`;
}
