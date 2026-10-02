// Mount table for serve.mjs: every built studio at the base it was built for.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The base a built studio was built for, read from its index.html module script src. */
export function distBase(dist) {
  const m = /src="(\/[^"]*?\/)assets\//.exec(readFileSync(resolve(dist, "index.html"), "utf8"));
  if (!m) throw new Error(`no /<base>/assets/ script in ${dist}/index.html`);
  return m[1];
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
  return [...roots, ["/elder-souls-argonia/studio/", resolve(data)], ["/elder-souls-argonia/", resolve(characterFiles)]];
}
