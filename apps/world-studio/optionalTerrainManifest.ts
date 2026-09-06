import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const MANIFEST = 'province/water/v2/terrain/manifest.json';

/** Stop Vite's SPA fallback only for this optional asset's genuine absence.
 * Existing malformed/mismatched manifests still reach strict runtime validation. */
export function optionalTerrainManifestMiddleware(directory: string, base = '/') {
  const pathname = `${base.endsWith('/') ? base : `${base}/`}${MANIFEST}`;
  const filename = resolve(directory, MANIFEST);
  return async (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
    if ((request.method !== 'GET' && request.method !== 'HEAD') || request.url?.split('?')[0] !== pathname) return next();
    try { await stat(filename); return next(); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') return next(error);
      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(request.method === 'HEAD' ? undefined : '{"error":"Optional terrain manifest not installed"}');
    }
  };
}

export default function optionalTerrainManifest(): Plugin {
  return { name: 'studio-optional-terrain-manifest',
    configureServer(server) {
      if (server.config.publicDir) server.middlewares.use(optionalTerrainManifestMiddleware(server.config.publicDir, server.config.base));
    },
    configurePreviewServer(server) {
      server.middlewares.use(optionalTerrainManifestMiddleware(resolve(server.config.root, server.config.build.outDir), server.config.base));
    },
  };
}
