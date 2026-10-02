// The static server the WebGPU checks share: the built /webgpu/ app, the
// studio DATA from the MAIN tree (never this worktree's stale public/ copy:
// a worktree keeps whatever kits and places were published when it was cut),
// and the character files at the site root, the way GitHub Pages lays them out.
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";

const appDir = resolve(new URL("../..", import.meta.url).pathname);
export const MIME = { ".js": "text/javascript", ".html": "text/html", ".json": "application/json", ".css": "text/css",
  ".wasm": "application/wasm", ".png": "image/png", ".ktx2": "image/ktx2", ".glb": "model/gltf-binary" };

/** The studio data folder: $ES_DATA_PUBLIC, else the main worktree's
 * apps/world-studio/public (git's common dir is the main tree's .git). */
export function dataPublicDir() {
  if (process.env.ES_DATA_PUBLIC) return resolve(process.env.ES_DATA_PUBLIC);
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: appDir, encoding: "utf8" });
  const main = r.status === 0 ? dirname(r.stdout.trim()) : resolve(appDir, "../..");
  return join(main, "apps/world-studio/public");
}

/** A request handler over [prefix, root] pairs plus the KTX2 transcoder.
 * `intercept(path, res)` may answer first (returns true when it did). */
export function staticHandler(roots, { intercept, onMissing } = {}) {
  const basisDir = dirname(createRequire(join(appDir, "package.json")).resolve("three/examples/jsm/libs/basis/basis_transcoder.js"));
  return (req, res) => {
    const path = decodeURIComponent(req.url.split("?")[0]);
    const basis = /\/basis\/(basis_transcoder\.(?:js|wasm))$/.exec(path);
    if (basis) { res.writeHead(200, { "Content-Type": MIME[extname(basis[1])] }); createReadStream(join(basisDir, basis[1])).pipe(res); return; }
    if (intercept?.(path, res)) return;
    // An exact file under any matching root wins (a dev studio and its data share /studio/), else the
    // first matching root's index.html (SPA fallback).
    const hits = roots.filter(([prefix]) => path.startsWith(prefix));
    const isFile = (f) => existsSync(f) && !statSync(f).isDirectory();
    const file = hits.map(([prefix, root]) => join(root, path.slice(prefix.length) || "index.html")).find(isFile)
      ?? hits.map(([, root]) => join(root, "index.html")).find(isFile);
    if (file) {
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
      return;
    }
    onMissing?.(path);
    res.writeHead(404); res.end();
  };
}

/** Pages layout: /webgpu/ = dist, /studio/ = data, site root = character files. */
export function pagesRoots(dist, data = dataPublicDir()) {
  return [["/elder-souls-argonia/webgpu/", dist], ["/elder-souls-argonia/studio/", data],
    ["/elder-souls-argonia/", resolve(appDir, "../../packages/character-assets/files")]];
}
