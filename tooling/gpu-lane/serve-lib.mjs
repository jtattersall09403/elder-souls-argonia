// Mount table for serve.mjs: every built studio at the base it was built for.
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { basisDir, characterFilesDir } from "../../apps/world-studio/scripts/lib/webgpu-static.mjs";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
/** Repo files serve.mjs runs from (its module graph). */
const SERVER_MODULES = ["tooling/gpu-lane/serve.mjs", "tooling/gpu-lane/serve-lib.mjs", "tooling/gpu-lane/pod-setup.sh",
  "apps/world-studio/scripts/lib/webgpu-static.mjs"];

/** Every repo path serve.mjs and the studio it serves read, repo-relative, for pod-sync.sh to rsync -R: the server's
 * modules, three's package.json (node resolves three through it) and basis dir (/basis/ route), the character files
 * (site-root route). The studio data rides separately (pod-sync --data). Throws naming any path that is missing. */
export function serveFiles(root = repoRoot, dirs = { basis: basisDir(), characters: characterFilesDir() }) {
  const threePkg = resolve(dirs.basis, "../../../../package.json");
  const paths = [...SERVER_MODULES.map((p) => resolve(root, p)), threePkg, dirs.basis, dirs.characters];
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length) throw new Error(`serveFiles: missing ${missing.join(", ")}`);
  return paths.map((p) => relative(root, p));
}

/** The base a built studio was built for, read from its index.html module script src. */
export function distBase(dist) {
  const m = /src="(\/[^"]*?\/)assets\//.exec(readFileSync(resolve(dist, "index.html"), "utf8"));
  if (!m) throw new Error(`no /<base>/assets/ script in ${dist}/index.html`);
  return m[1];
}

/** Where the server mounts the studio data (kits, rasters): the page fetches its kits from here whatever base its dist was built for. */
export const DATA_PREFIX = "/elder-souls-argonia/studio/";
/** The data base for a view URL: its origin plus the mounted data prefix, or null for a URL outside the site. */
export function dataBaseOf(viewUrl) {
  const m = /^(https?:\/\/[^/]+)\/elder-souls-argonia\//.exec(viewUrl);
  return m ? m[1] + DATA_PREFIX : null;
}

/** [prefix, root] pairs: each dist at its built base, then the studio data at /studio/ (after a dev
 * dist built for /studio/, as Pages composes it), then the character files at the site root. */
export function siteRoots(dists, data, characterFiles) {
  const seen = new Map();
  const roots = dists.map((d) => {
    const base = distBase(d);
    if (seen.has(base)) throw new Error(`${d} and ${seen.get(base)} were both built for ${base}`);
    seen.set(base, d);
    return [base, resolve(d)];
  });
  return [...roots, [DATA_PREFIX, resolve(data)], ["/elder-souls-argonia/", resolve(characterFiles)]];
}
