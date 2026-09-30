/**
 * A burning lantern's shell glows (16k walk 6). A closed paper or glass
 * lantern (kotm townlantern04's paper globe) hides its flame, so its fire
 * reads only if the shell itself is lit from inside. Skyrim marks such a
 * shell with the NIF shader flag OWN_EMIT, which the kit build carries into
 * the glTF material extras (`pyn_shader.Shader_Flags_1`, on `userData` once
 * loaded). The shell's emissive is the fixture light's colour times
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
}

/** Whether a material's NIF shader flags carry OWN_EMIT (glTF extras `pyn_shader`). */
export function hasOwnEmitFlag(material: THREE.Material): boolean {
  const flags = (material.userData?.pyn_shader as { Shader_Flags_1?: unknown } | undefined)?.Shader_Flags_1;
  return typeof flags === "string" && flags.split("|").some((f) => f.trim() === "OWN_EMIT");
}

/** A lantern shell: a material flagged OWN_EMIT on a piece whose light block is a lantern. */
export function isLanternShellMaterial(material: THREE.Material, meta: LanternShellMeta | undefined): boolean {
  return meta?.light?.fixtureKind === "lantern" && hasOwnEmitFlag(material);
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
