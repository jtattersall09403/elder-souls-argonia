/**
 * The URL every studio DATA fetch resolves against (province rasters, kits,
 * settlements, water, ground textures, the KTX2 transcoder), ending in `/`.
 *
 * Normally the app's own `BASE_URL`. The webgpu branch build sets
 * `VITE_ES_DATA_BASE=/elder-souls-argonia/studio/` so its code ships at
 * /elder-souls-argonia/webgpu/ while its data comes from main's studio on the
 * same Pages site; that build sets `publicDir: false` (vite.config.ts), so
 * one copy of the data ships, never two. Code-relative URLs (the app's own
 * JS/CSS/html) keep using `BASE_URL`. Packages never read this: the app
 * passes it in as `baseUrl`.
 */
export const DATA_BASE: string = import.meta.env.VITE_ES_DATA_BASE ?? import.meta.env.BASE_URL;
