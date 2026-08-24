/**
 * Runtime character assets (rig, race bodies, weapon/armour/arrow GLBs and
 * icons) are served from each app's site root — `@elder-souls/character-assets`
 * copies them into every consuming app's build. This helper resolves a
 * manifest-relative asset path against the hosting app's base URL without the
 * package hard-coding a bundler: under Vite both apps get their own
 * `BASE_URL`; anywhere else it falls back to the site root.
 */
export function assetUrl(path: string): string {
  const base =
    (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return `${base}${path}`;
}
