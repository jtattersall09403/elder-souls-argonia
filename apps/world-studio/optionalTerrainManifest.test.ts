import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect, it, vi } from 'vitest';
import { optionalTerrainManifestMiddleware } from './optionalTerrainManifest';

it('returns real404 only for missing optional assets and preserves existing malformed files for strict validation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-optional-manifest-'));
  try {
    for (const base of ['/', '/elder-souls-argonia/studio/']) {
      const handle = optionalTerrainManifestMiddleware(directory, base);
      const response = () => ({ statusCode: 200, setHeader: vi.fn(), end: vi.fn() });
      const req = (url: string) => ({ method: 'GET', url }) as IncomingMessage;
      const res = response(), next = vi.fn();
      await handle(req(`${base}province/water/v2/terrain/manifest.json?cache=1`), res as unknown as ServerResponse, next);
      expect(res.statusCode).toBe(404); expect(next).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
      const other = response();
      await handle(req(`${base}some-studio-route`), other as unknown as ServerResponse, next);
      expect(next).toHaveBeenCalledOnce(); expect(other.end).not.toHaveBeenCalled();
    }
    const path = join(directory, 'province/water/v2/terrain');
    await mkdir(path, { recursive: true }); await writeFile(join(path, 'manifest.json'), '<html>malformed real asset</html>');
    const next = vi.fn(), end = vi.fn();
    await optionalTerrainManifestMiddleware(directory)({ method: 'GET', url: '/province/water/v2/terrain/manifest.json' } as IncomingMessage,
      { end } as unknown as ServerResponse, next);
    expect(next).toHaveBeenCalledWith(); expect(end).not.toHaveBeenCalled();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
