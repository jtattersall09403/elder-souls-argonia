/**
 * Reader for the compiler's vegetation bundles (`worldgen/scatter.py` `encode`).
 *
 * The format is 16 bytes per instance — position as three float32s, then yaw,
 * scale and two tilt axes quantised to a byte each. Decoding happens once per
 * chunk into flat typed arrays the renderer can walk without allocating, and
 * the format version is asserted rather than assumed: a silent mismatch here
 * would place a forest at the wrong scale.
 */

const MAGIC = 0x45535647; // "ESVG" big-endian
const VERSION = 1;
export const INSTANCE_BYTES = 16;

export interface SpeciesInstances {
  /** Index into the bundle's species order, which the index JSON names. */
  readonly index: number;
  readonly count: number;
  readonly scaleMin: number;
  readonly scaleMax: number;
  /** x, y, z triples in world metres. */
  readonly positions: Float32Array;
  /** yaw, scale, tiltX, tiltZ per instance, still quantised 0-255. */
  readonly packed: Uint8Array;
}

export interface VegetationBundle {
  readonly species: SpeciesInstances[];
  readonly total: number;
}

export function decodeVegetationBundle(buffer: ArrayBuffer): VegetationBundle {
  const view = new DataView(buffer);
  if (view.getUint32(0, false) !== MAGIC) {
    throw new Error("not a vegetation bundle");
  }
  const version = view.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(`unsupported vegetation bundle version ${version}`);
  }
  const groups = view.getUint32(8, true);

  const headers: { index: number; count: number; scaleMin: number; scaleMax: number }[] = [];
  let offset = 12;
  for (let i = 0; i < groups; i++) {
    headers.push({
      index: view.getUint32(offset, true),
      count: view.getUint32(offset + 4, true),
      scaleMin: view.getFloat32(offset + 8, true),
      scaleMax: view.getFloat32(offset + 12, true),
    });
    offset += 16;
  }

  const species: SpeciesInstances[] = [];
  let total = 0;
  for (const header of headers) {
    const positions = new Float32Array(header.count * 3);
    const packed = new Uint8Array(header.count * 4);
    for (let i = 0; i < header.count; i++) {
      positions[i * 3] = view.getFloat32(offset, true);
      positions[i * 3 + 1] = view.getFloat32(offset + 4, true);
      positions[i * 3 + 2] = view.getFloat32(offset + 8, true);
      packed[i * 4] = view.getUint8(offset + 12);
      packed[i * 4 + 1] = view.getUint8(offset + 13);
      packed[i * 4 + 2] = view.getUint8(offset + 14);
      packed[i * 4 + 3] = view.getUint8(offset + 15);
      offset += INSTANCE_BYTES;
    }
    species.push({ ...header, positions, packed });
    total += header.count;
  }
  return { species, total };
}

/** Unpack one instance's transform into plain numbers, in world units. */
export function readInstance(
  group: SpeciesInstances,
  i: number,
): { x: number; y: number; z: number; yaw: number; scale: number; tiltX: number; tiltZ: number } {
  const span = group.scaleMax - group.scaleMin || 1;
  return {
    x: group.positions[i * 3],
    y: group.positions[i * 3 + 1],
    z: group.positions[i * 3 + 2],
    yaw: (group.packed[i * 4] / 255) * Math.PI * 2,
    scale: group.scaleMin + (group.packed[i * 4 + 1] / 255) * span,
    tiltX: (group.packed[i * 4 + 2] / 255 - 0.5) * Math.PI,
    tiltZ: (group.packed[i * 4 + 3] / 255 - 0.5) * Math.PI,
  };
}

export interface VegetationIndexEntry {
  chunk: [number, number];
  region: number;
  regionName: string;
  instances: number;
  tiers: Record<string, number>;
  perHectare: number;
}

export interface VegetationIndex {
  seed: number;
  chunkMetres: number;
  /** Species ids in the order every bundle's group indices refer to. */
  speciesOrder: string[];
  chunks: Record<string, VegetationIndexEntry>;
}
