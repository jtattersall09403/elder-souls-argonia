import type { ChannelRibbonRecord } from './channelRibbons';

export interface WaterBodyIdentity { index: number; id: string; basinIndex?: number }

/** Compiled physical owner, not authored ecology/navigation or a named place.
 * Bounds conservatively include potential flood margins; they are not a wet
 * rectangle. Field references name the existing WaterData authorities, with
 * ribbons overriding coarse raster samples exactly as in the live query. */
export interface WaterBodyRecord extends WaterBodyIdentity {
  schemaVersion: 1;
  bounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
  semanticClasses: readonly string[];
  riverBandRange: readonly [number, number];
  surface: Readonly<{ kind: 'standing-plane'; baseHeightM: number }
    | { kind: 'channel-network'; ribbonIds: readonly string[]; field: 'surface' }
    | { kind: 'field'; field: 'surface' }>;
  fields: Readonly<{ depth: 'surface.depthProxy'; flow: 'flow+ribbons'; access: 'surface.access+ribbons';
    optics: 'klass+shore+character'; levels: 'access+shore+ribbons'; ground: 'native-terrain' }>;
  rendererProfile: 'province-semantic-v2';
}

export function isPhysicalWaterBody(body: WaterBodyIdentity): body is WaterBodyRecord {
  return 'schemaVersion' in body && body.schemaVersion === 1;
}

/** Older bundles retain identity-only records. New records must describe
 * actual owner-matching reaches and valid finite physical domains. */
export function validateWaterBodies(value: unknown, ribbons: readonly ChannelRibbonRecord[], classes: readonly string[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 65535) throw new Error('Invalid water body records');
  const indices = new Set<number>(), ids = new Set<string>();
  const reachOwners = new Map(ribbons.map(r => [r.id, r.bodyIndex]));
  const channelOwners = new Set(ribbons.map(r => r.bodyIndex));
  const reachCounts = new Map<number, number>();
  for (const r of ribbons) reachCounts.set(r.bodyIndex, (reachCounts.get(r.bodyIndex) ?? 0) + 1);
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  for (const b of value) {
    if (!b || !Number.isInteger(b.index) || b.index < 1 || b.index > 65535 || indices.has(b.index)
      || typeof b.id !== 'string' || !b.id || ids.has(b.id)
      || (b.basinIndex !== undefined && (!Number.isInteger(b.basinIndex) || b.basinIndex < 1))) throw new Error('Invalid or duplicate water body identity');
    indices.add(b.index); ids.add(b.id);
    if (b.schemaVersion === undefined) continue;
    const box = b.bounds, surface = b.surface, fields = b.fields;
    if (b.schemaVersion !== 1 || !box || ![box.minX, box.minZ, box.maxX, box.maxZ].every(finite)
      || box.minX > box.maxX || box.minZ > box.maxZ
      || !Array.isArray(b.semanticClasses) || !b.semanticClasses.every((c: unknown) => typeof c === 'string' && classes.includes(c))
      || !Array.isArray(b.riverBandRange) || b.riverBandRange.length !== 2
      || !b.riverBandRange.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 3)
      || b.riverBandRange[0] > b.riverBandRange[1] || b.rendererProfile !== 'province-semantic-v2'
      || fields?.depth !== 'surface.depthProxy' || fields?.flow !== 'flow+ribbons' || fields?.access !== 'surface.access+ribbons'
      || fields?.optics !== 'klass+shore+character' || fields?.levels !== 'access+shore+ribbons' || fields?.ground !== 'native-terrain') {
      throw new Error('Invalid physical water body fields');
    }
    if (surface?.kind === 'standing-plane') {
      if (!finite(surface.baseHeightM) || channelOwners.has(b.index)) throw new Error('Channel owner cannot have a constant standing head');
    } else if (surface?.kind === 'channel-network') {
      if (surface.field !== 'surface' || !Array.isArray(surface.ribbonIds) || !surface.ribbonIds.length
        || surface.ribbonIds.length !== reachCounts.get(b.index)
        || new Set(surface.ribbonIds).size !== surface.ribbonIds.length
        || !surface.ribbonIds.every((id: string) => reachOwners.get(id) === b.index)) throw new Error('Invalid water body channel references');
    } else if (surface?.kind !== 'field' || surface.field !== 'surface' || channelOwners.has(b.index)) throw new Error('Invalid water body surface authority');
  }
}
