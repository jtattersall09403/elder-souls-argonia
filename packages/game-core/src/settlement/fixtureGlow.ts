/**
 * A burning lantern's shell glows (16k walk 6). A closed paper or glass
 * lantern (kotm townlantern04's paper globe) hides its flame, so its fire
 * reads only if the shell itself is lit from inside. Skyrim marks such a
 * shell with the NIF shader flag OWN_EMIT AND a non-black emissive colour;
 * the flag alone is not enough (CandleLanternWithCandle01 flags its metal
 * frame OWN_EMIT with a black emissive: read by the flag, the whole lantern
 * glowed, walk 9). The kit build reads both from the NIF and lists the
 * materials that really emit as the manifest row's `emissiveMaterials`
 * (nif_blocks.emitting_shapes). The shell's emissive is the fixture light's colour times
 * `LANTERN_SHELL_GAIN`, modulated by its own diffuse (emissiveMap = map).
 * Outdoors it is switched by the lamp clock (materials.ts glow kind
 * "lamp-shell"); indoors it burns steady, as the cell's lights do. It holds
 * no per-fixture flicker: one shared material draws every placement.
 * Three-only imports, so the visual-look page loads this file as it is.
 */
import * as THREE from "three";

/**
 * The ONE colour (sRGB 0-255) every settlement fixture light emits: lantern,
 * candle, sconce, torch, brazier and fire alike. It is the campfire's own LIGH
 * colour (Skyrim.esm LightCampFire01, 226/140/63), the warm orange the owner
 * approved (walk 4). The LIGH record's colour is NOT read: Skyrim tuned its
 * lantern and candle colours (242/240/223 DefaultCandleLight01NSDesat) for its
 * own tonemap, and under ours they read harsh white with a green cast (walk
 * 4). Fixtures differ only in radius (the LIGH record's) and candela.
 */
export const FIXTURE_LIGHT_RGB: readonly [number, number, number] = [226, 140, 63];

/** Emissive gain of a lit lantern shell over the fixture colour x its diffuse
 * (tuned on the look sheet of townlantern04, walk 6). */
export const LANTERN_SHELL_GAIN = 1.6;

/** The manifest fields a shell is recognised by. */
export interface LanternShellMeta {
  light?: { fixtureKind?: string } | null;
  /** The piece's materials whose NIF shader really emits (build_kit). */
  emissiveMaterials?: readonly string[] | null;
}

/** A glTF material name less three's/Blender's `.001`-style repeat suffix. */
function nifMaterialName(name: string): string {
  return name.replace(/(\.Mat)\.\d{3,}$/, "$1");
}

/** A lantern shell: a material the manifest lists as emitting, on a piece whose light block is a lantern. */
export function isLanternShellMaterial(material: THREE.Material, meta: LanternShellMeta | undefined): boolean {
  return meta?.light?.fixtureKind === "lantern"
    && (meta.emissiveMaterials ?? []).includes(nifMaterialName(material.name));
}

/** The lit shell's emissive colour (linear): the fixture colour x `gain`. */
export function lanternShellEmissive(gain = LANTERN_SHELL_GAIN, target = new THREE.Color()): THREE.Color {
  return target.setRGB(FIXTURE_LIGHT_RGB[0] / 255, FIXTURE_LIGHT_RGB[1] / 255, FIXTURE_LIGHT_RGB[2] / 255,
    THREE.SRGBColorSpace).multiplyScalar(gain);
}

/** Give a shell material its emissive (colour x its own diffuse). Idempotent. */
export function applyLanternShell(material: THREE.Material): boolean {
  const m = material as THREE.MeshStandardMaterial;
  if (!m.isMeshStandardMaterial) return false;
  lanternShellEmissive(LANTERN_SHELL_GAIN, m.emissive);
  if (m.emissiveMap !== m.map) {
    m.emissiveMap = m.map;
    m.needsUpdate = true;
  }
  m.emissiveIntensity = 1;
  return true;
}
