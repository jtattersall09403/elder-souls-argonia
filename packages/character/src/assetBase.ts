/**
 * Runtime character assets (rig, race bodies, weapon/armour/arrow GLBs and
 * icons) are served from each app's site root — `@elder-souls/character-assets`
 * copies them into every consuming app's build. This helper resolves a
 * manifest-relative asset path against the hosting app's base URL without the
 * package hard-coding a bundler: under Vite both apps get their own
 * `BASE_URL`; anywhere else it falls back to the site root.
 *
 * `__ES_CHARACTER_ASSETS_BASE__` is a build-time constant the
 * character-assets plugin defines from its `sharedBase` option in a
 * production build: a sibling app's base on the same site that already
 * ships the files, so the composed Pages site carries one set, not one per
 * app. Undefined (dev servers, Node) means "this app's own copy".
 */
declare const __ES_CHARACTER_ASSETS_BASE__: string | undefined;

export function assetUrl(path: string): string {
  const shared = typeof __ES_CHARACTER_ASSETS_BASE__ === "string" ? __ES_CHARACTER_ASSETS_BASE__ : undefined;
  const base = shared ??
    (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return `${base}${path}`;
}
