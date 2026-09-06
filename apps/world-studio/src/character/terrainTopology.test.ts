import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { terrainColliderData } from '@elder-souls/game-core/terrain/colliderData';
import { sampleChunkHeight } from '@elder-souls/game-core/terrain/heightfield';
import type { ChunkGrid } from '@elder-souls/game-core/terrain/chunkStore';

beforeAll(async () => { await RAPIER.init(); });
describe('native channel diagonal collider parity', () => {
  it('raycasts the existing low NW–SE bed for flipped cells and the original heightfield everywhere else', () => {
    for (const flipped of [false, true]) {
      const grid: ChunkGrid = { meta: { cx: 0, cy: 0, originM: [100, 200], lods: {} }, lod: '1', nx: 2, ny: 2,
        metresPerSample: 2, heights: new Float32Array([350, 361, 363, 350]), flippedCells: flipped ? new Set([0]) : undefined };
      const data = terrainColliderData(grid, 5), world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      try {
        const desc = data.kind === 'trimesh'
          ? RAPIER.ColliderDesc.trimesh(data.vertices, data.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
          : RAPIER.ColliderDesc.heightfield(data.rows, data.columns, data.data, data.scale, RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES);
        desc.setTranslation(...data.position);
        world.createCollider(desc); world.step();
        for (const [u, v] of [[0.5, 0.5], [0.25, 0.75], [0.75, 0.25], [0.1, 0.2], [0.9, 0.8]]) {
          const x = 100 + 2 * u, z = 200 + 2 * v;
          const hit = world.castRay(new RAPIER.Ray({ x, y: 2000, z }, { x: 0, y: -1, z: 0 }), 1000, true);
          expect(hit).not.toBeNull();
          expect(2000 - hit!.timeOfImpact).toBeCloseTo(sampleChunkHeight(grid, x, z) * 5, 3);
        }
        expect(sampleChunkHeight(grid, 101, 201)).toBe(flipped ? 350 : 362);
      } finally { world.free(); }
    }
  });
});
