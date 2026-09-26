/**
 * How a shipped text file names a kit: the path segment `kits/<id>`
 * (compose.mjs rule 2, decision 0073). The segment must start a path
 * component: a left word boundary, so an asset id that merely contains
 * "kits/" (`vanilla:dungeons/imperial/clutterkits/impfreewall01` in
 * province/blueprints.json) is not read as the kit `impfreewall01`.
 */
export const KIT_REF = /(?<![A-Za-z0-9_])kits\/([A-Za-z0-9_-]+)/g;

/** Every kit id `text` names, in order of first mention. */
export function kitRefs(text) {
  return [...new Set([...text.matchAll(KIT_REF)].map((m) => m[1]))];
}
