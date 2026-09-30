import * as THREE from "three";
import { setStripAttributes } from "./ChannelStrips";
import { poolBedAt, type LocalPoolRecord } from "../localSurfaces";

/** A place's pools as ONE strip-mode mesh: the same vertex attributes the
 * channel strips carry (`buildChannelStripGeometry`), so the ES_STRIP shader
 * draws a pool with the same water, at the level the vertex says, with no
 * flow, no drop and no rock foam. Rings from the centre to the rim; the bed
 * depth follows `poolBedAt`, so the edge reads as a shallow shore. */
export const POOL_SEGMENTS = 32;
export const POOL_RINGS = 4;

export function buildPoolGeometry(pools: readonly LocalPoolRecord[]): { geometry: THREE.BufferGeometry; triangleCount: number } | null {
  if (!pools.length) return null;
  const perPool = 1 + POOL_RINGS * POOL_SEGMENTS;
  const vertexCount = pools.length * perPool;
  const trisPerPool = POOL_SEGMENTS + (POOL_RINGS - 1) * POOL_SEGMENTS * 2;
  const triangleCount = pools.length * trisPerPool;
  const position = new Float32Array(vertexCount * 3);
  const aStill = new Float32Array(vertexCount);
  const aBedDepth = new Float32Array(vertexCount);
  const aFlow = new Float32Array(vertexCount * 2);
  const aSeason = new Float32Array(vertexCount);
  const aDrop = new Float32Array(vertexCount);
  const aSide = new Float32Array(vertexCount);
  const aSideM = new Float32Array(vertexCount);
  const aArc = new Float32Array(vertexCount);
  const aScroll = new Float32Array(vertexCount);
  const aEdge = new Float32Array(vertexCount);
  const aRockFoam = new Float32Array(vertexCount * 2);
  const index = new Uint32Array(triangleCount * 3);
  let v = 0, k = 0;
  for (const p of pools) {
    const base = v;
    const put = (r: number, angle: number) => {
      const i = v * 3;
      position[i] = p.centreM[0] + Math.cos(angle) * r;
      position[i + 1] = p.levelM;
      position[i + 2] = p.centreM[1] + Math.sin(angle) * r;
      aStill[v] = p.levelM;
      aBedDepth[v] = Math.max(p.levelM - poolBedAt(p, r), 0.05);
      // across-ribbon coordinate: the centre is the centreline, the rim the edge
      aSide[v] = r / p.radiusM;
      aSideM[v] = r;
      aArc[v] = angle * p.radiusM;
      aScroll[v] = 0.5;
      aEdge[v] = 1;
      v++;
    };
    put(0, 0);
    for (let ring = 1; ring <= POOL_RINGS; ring++) {
      const r = (ring / POOL_RINGS) * p.radiusM;
      for (let s = 0; s < POOL_SEGMENTS; s++) put(r, (s / POOL_SEGMENTS) * Math.PI * 2);
    }
    const at = (ring: number, s: number) => base + 1 + (ring - 1) * POOL_SEGMENTS + (s % POOL_SEGMENTS);
    for (let s = 0; s < POOL_SEGMENTS; s++) {
      index[k++] = base; index[k++] = at(1, s + 1); index[k++] = at(1, s);
    }
    for (let ring = 1; ring < POOL_RINGS; ring++) {
      for (let s = 0; s < POOL_SEGMENTS; s++) {
        const a = at(ring, s), b = at(ring, s + 1), c = at(ring + 1, s), d = at(ring + 1, s + 1);
        index[k++] = a; index[k++] = d; index[k++] = c;
        index[k++] = a; index[k++] = b; index[k++] = d;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  setStripAttributes(geometry, {
    aStill, aBedDepth, aFlow, aSeason, aDrop, aSide, aSideM, aArc, aScroll, aEdge, aRockFoam,
  }, vertexCount);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  return { geometry, triangleCount };
}
