/**
 * The flame system (16k walk 5): every drawn fire as instances of one flame
 * card and one ember quad, two draws for all fires in view.
 *
 * A caller hands `setEmitters` one `FireEmitter` per mined flame record (the
 * emitter's FINAL world position: the piece's full draw matrix applied to the
 * record's `offsetM`, hang and mount included). Each emitter expands by its
 * preset's `layers`: every preset is at least 3 cards (a candle, lantern or
 * torch 2 core + 1 outer; a brazier, hearth or campfire 2-3 core and 2-3
 * outer spread over its fire bed), each on its own seed, so each sways and
 * pulses on its own phase (`motion`) and the silhouette changes over time. Embers are `embers.count` quads
 * per emitter animated wholly in the vertex stage from the emitter's seed.
 *
 * Per frame the CPU writes only uniforms (time, wind, the day/night blend
 * read from `renderer.toneMappingExposure`) and, when a fixture's strength
 * changes, the intensity column of its instances. Instance buffers are
 * rebuilt only in `setEmitters`.
 *
 * Owned by its caller (SettlementLightFixtures, a preview harness), never a
 * module singleton.
 */
import * as THREE from "three";
import {
  FIRE_BED_PRESETS, FIRE_PRESETS, FIRE_PRESET_ORDER, nightShareOfExposure,
  type FirePresetId,
} from "./fireTypes";
import {
  makeEmberMaterial, makeFireUniforms, makeFlameMaterial, makeFlameQuad, type FireUniforms,
} from "./flameMaterial";

export interface FireEmitter {
  /** World position of the emitter (the wick, the fire bed's centre), m. */
  position: THREE.Vector3;
  preset: FirePresetId;
  /** The piece's scale: card sizes and the bed spread scale with it. */
  scale: number;
  /** 0..1, stable per emitter (hash of the fixture id and the flame index). */
  seed: number;
  /** The caller's index of the owner (a fixture): `update` reads its strength by it. */
  owner: number;
}

/** A stable 0..1 hash of a number pair (instance jitter from a seed). */
function jitter(seed: number, k: number): number {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const FLAME_FLOATS = 20;
const EMBER_FLOATS = 12;

export class FlameSystem {
  readonly group = new THREE.Group();
  readonly uniforms: FireUniforms;
  private readonly flameGeometry = makeFlameQuad();
  private readonly emberGeometry = makeFlameQuad();
  private readonly flames: THREE.Mesh;
  private readonly embers: THREE.Mesh;
  private flameOwner = new Int32Array(0);
  private emberOwner = new Int32Array(0);
  private flameData = new Float32Array(0);
  private emberData = new Float32Array(0);
  private lastStrength: Float32Array = new Float32Array(0);
  private emitterList: FireEmitter[] = [];

  constructor(uniforms: FireUniforms = makeFireUniforms(), layer?: number) {
    this.uniforms = uniforms;
    this.group.name = "fire-flames";
    this.flames = new THREE.Mesh(this.flameGeometry, makeFlameMaterial(uniforms));
    this.embers = new THREE.Mesh(this.emberGeometry, makeEmberMaterial(uniforms));
    this.flames.name = "fire-flame-cards";
    this.embers.name = "fire-embers";
    for (const mesh of [this.flames, this.embers]) {
      mesh.frustumCulled = false;
      mesh.visible = false;
      if (layer !== undefined) mesh.layers.set(layer);
      this.group.add(mesh);
    }
    // the day/night blend follows the renderer's exposure, read at draw time
    // (the water surface reads the same `toneMappingExposure`)
    this.flames.onBeforeRender = (renderer) => {
      this.uniforms.uNight.value = nightShareOfExposure(renderer.toneMappingExposure);
    };
    this.embers.renderOrder = 1;
  }

  /** The emitters last set. */
  get emitters(): readonly FireEmitter[] { return this.emitterList; }
  /** Flame cards drawn (instances). */
  get flameInstances(): number { return this.flameGeometry.instanceCount; }
  /** Ember quads drawn (instances). */
  get emberInstances(): number { return this.emberGeometry.instanceCount; }
  /** World position of flame card `i` (tests, probes). */
  flamePosition(i: number, target = new THREE.Vector3()): THREE.Vector3 {
    return target.fromArray(this.flameData, i * FLAME_FLOATS);
  }
  /** The owner index of flame card `i`. */
  flameOwnerOf(i: number): number { return this.flameOwner[i]; }
  /** Intensity column of flame card `i` as last written. */
  flameIntensity(i: number): number { return this.flameData[i * FLAME_FLOATS + 8]; }

  setEmitters(emitters: readonly FireEmitter[]): void {
    this.emitterList = [...emitters];
    const flames: number[] = [];
    const flameOwner: number[] = [];
    const embers: number[] = [];
    const emberOwner: number[] = [];
    let owners = 0;
    for (const e of emitters) {
      owners = Math.max(owners, e.owner + 1);
      const c = FIRE_PRESETS[e.preset];
      const palette = FIRE_PRESET_ORDER.indexOf(e.preset);
      const bed = FIRE_BED_PRESETS.has(e.preset);
      const cards = c.layers.core + c.layers.outer;
      for (let k = 0; k < cards; k++) {
        const outer = k >= c.layers.core ? 1 : 0;
        // core cards cluster at the centre, outer cards ring the bed
        const r = (outer ? 0.6 + 0.4 * jitter(e.seed, k) : 0.3 * jitter(e.seed, k)) * c.layers.spreadM * e.scale;
        const a = (k / Math.max(1, cards) + jitter(e.seed, k + 7)) * Math.PI * 2;
        // the first card is the full flame; the others vary in size, so the
        // cards read as separate tongues, not one sprite drawn three times
        const sizeJ = bed ? 0.8 + 0.4 * jitter(e.seed, k + 3) : k === 0 ? 1 : 0.7 + 0.25 * jitter(e.seed, k + 3);
        const seed = (e.seed + k * 0.618034) % 1;
        flames.push(
          e.position.x + Math.cos(a) * r, e.position.y, e.position.z + Math.sin(a) * r, seed,
          c.shape.widthM * e.scale * sizeJ, c.shape.heightM * e.scale * sizeJ, c.turbulence, c.riseSpeed,
          0, palette, outer, c.shape.taper,
          c.flicker.rateHz, c.flicker.amount, c.windResponse, 0,
          c.motion.swayW, c.motion.pulse, c.motion.rateHz * (0.8 + 0.4 * jitter(e.seed, k + 11)), 0,
        );
        flameOwner.push(e.owner);
      }
      for (let k = 0; k < c.embers.count; k++) {
        embers.push(
          e.position.x, e.position.y + c.shape.heightM * e.scale * 0.2, e.position.z, e.seed,
          c.embers.riseM * e.scale, c.embers.sizeM, c.embers.lifeS, Math.max(0.02, c.layers.spreadM * e.scale),
          0, palette, k, 0,
        );
        emberOwner.push(e.owner);
      }
    }
    this.flameData = new Float32Array(flames);
    this.emberData = new Float32Array(embers);
    this.flameOwner = Int32Array.from(flameOwner);
    this.emberOwner = Int32Array.from(emberOwner);
    this.lastStrength = new Float32Array(owners).fill(-1);
    bindInterleaved(this.flameGeometry, this.flameData, FLAME_FLOATS,
      [["iPosSeed", 0], ["iShape", 4], ["iParams", 8], ["iAnim", 12], ["iMotion", 16]]);
    bindInterleaved(this.emberGeometry, this.emberData, EMBER_FLOATS,
      [["iPosSeed", 0], ["iEmber", 4], ["iParams", 8]]);
    this.flameGeometry.instanceCount = flameOwner.length;
    this.emberGeometry.instanceCount = emberOwner.length;
    this.flames.visible = flameOwner.length > 0;
    this.embers.visible = emberOwner.length > 0;
  }

  /**
   * One frame: time, wind (xz direction times m/s), and each owner's
   * strength 0..1 (`strengthOf(owner)`: the lamp clock, the fire's day
   * factor). Intensity columns are rewritten only where a strength changed.
   */
  update(timeS: number, strengthOf: (owner: number) => number, windXZ?: { x: number; y: number }): void {
    this.uniforms.uTime.value = timeS;
    if (windXZ) this.uniforms.uWind.value.set(windXZ.x, windXZ.y);
    let changed = false;
    for (let o = 0; o < this.lastStrength.length; o++) {
      const s = Math.max(0, Math.min(1, strengthOf(o)));
      if (Math.abs(s - this.lastStrength[o]) > 1e-4) { this.lastStrength[o] = s; changed = true; }
    }
    if (!changed) return;
    for (let i = 0; i < this.flameOwner.length; i++) this.flameData[i * FLAME_FLOATS + 8] = this.lastStrength[this.flameOwner[i]];
    for (let i = 0; i < this.emberOwner.length; i++) this.emberData[i * EMBER_FLOATS + 8] = this.lastStrength[this.emberOwner[i]];
    markDirty(this.flameGeometry);
    markDirty(this.emberGeometry);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.flameGeometry.dispose();
    this.emberGeometry.dispose();
    (this.flames.material as THREE.Material).dispose();
    (this.embers.material as THREE.Material).dispose();
  }
}

function bindInterleaved(geometry: THREE.InstancedBufferGeometry, data: Float32Array, stride: number,
  columns: [string, number][]): void {
  // three frees an attribute's GL buffer only on the geometry's dispose
  // event; a rebind without it leaked the old instance buffers for the
  // session (review 2026-09-30). The next draw re-uploads the geometry.
  if (geometry.getAttribute(columns[0][0])) geometry.dispose();
  const buffer = new THREE.InstancedInterleavedBuffer(data, stride, 1);
  buffer.setUsage(THREE.DynamicDrawUsage);
  for (const [name, offset] of columns) {
    geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, 4, offset));
  }
}

function markDirty(geometry: THREE.InstancedBufferGeometry): void {
  const attribute = geometry.getAttribute("iParams") as THREE.InterleavedBufferAttribute | undefined;
  if (attribute) attribute.data.needsUpdate = true;
}
