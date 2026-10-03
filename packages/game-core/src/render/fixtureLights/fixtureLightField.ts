/**
 * Fixture lights outside three's light list (16k walk 5 perf; decision 0107
 * node port).
 *
 * A settlement's burning fixtures (up to `FIXTURE_LIGHTS_MAX`) live in one
 * small float texture per scene, `FixtureLightField` (row 0 world position +
 * radius, row 1 colour x intensity +
 * decay), with a runtime count. How they reach the
 * lit materials is the renderer's LIGHTING, chosen once per renderer by
 * `installFixtureLighting` (the studio's sky walk and the harness call it):
 *
 * - `"field"` (`FixtureFieldLighting`, both backends): the scene's lights
 *   node gains one loop over the drawn object's own list of its
 *   `FIXTURE_LIGHTS_PER_OBJECT` nearest lamps (16 for a material with
 *   `userData.esFixtureLightsPerObject = 16`, the terrain; 32 for an interior cell's parts), chosen on the CPU
 *   and handed to the draw as two per-object mat4 uniforms (`onObjectUpdate`),
 *   each lamp through three's own `directPointLight` (getDistanceAttenuation,
 *   the lamp's decay, row 1 alpha) and the material's lighting model `direct` (the same BRDF as a
 *   `PointLight`). The program never depends on the count: one program per
 *   material for 0..100 lamps.
 * - `"tiled"` (`FixtureTiledLighting`, WebGPU only): the field mirrors its
 *   slots into real `PointLight`s (no shadow, each lamp's decay) that three's
 *   `TiledLighting` bins per 32 px screen tile in a compute pass.
 * - `"plain"`: the same `PointLight`s through three's default light list (a
 *   program per light count; the measurement baseline only).
 *
 * The choice (`fixtureLightingModeFor`) is the field on both backends,
 * measured against the other two (tooling/.reports/16k/walk5/webgpu/
 * lane-L8.md): three's tiled binning drops near lamps (8 per tile, index
 * order). `"tiled"` and `"plain"` stay for the harness's `?lighting=` switch.
 *
 * One field per scene (`fixtureLightFieldOf`): the scene is the context
 * object; nothing here is a module singleton.
 */
import * as THREE from "three";
import { Lighting, LightsNode } from "three/webgpu";
import type { WebGPURenderer } from "three/webgpu";
import { TiledLighting } from "three/examples/jsm/lighting/TiledLighting.js";
import {
  Break, Fn, If, Loop, cameraViewMatrix, directPointLight, exp, getDistanceAttenuation, int, ivec2, max, positionView, textureLoad, uniform, vec4,
} from "three/tsl";
import { activeBackend } from "../createRenderer";
import { sel, type TslNode } from "../nodes/materialNodes";

/** Lamps the field holds at once: the nearest burning fixtures in the band. */
export const FIXTURE_LIGHTS_MAX = 100;
/** Lamps one drawn object (a mesh, an instanced cell) is lit by at most. */
export const FIXTURE_LIGHTS_PER_OBJECT = 8;
/** A material may raise its objects' list to this (`userData.esFixtureLightsPerObject`):
 * the terrain (16), whose near tiles are 117 m across and hold a whole place's lamps,
 * and an interior cell's parts (32: every record light of the cell, 19 in
 * KeebaHouseSnailMinder, plus its windows). */
export const FIXTURE_LIGHTS_PER_OBJECT_MAX = 32;

/** The list length a material's objects get: its `userData.esFixtureLightsPerObject`, else 8. */
export function fixtureLightsPerObject(material: THREE.Material | null | undefined): number {
  const n = material?.userData?.esFixtureLightsPerObject;
  return typeof n === "number" && n >= 1
    ? Math.min(FIXTURE_LIGHTS_PER_OBJECT_MAX, Math.floor(n)) : FIXTURE_LIGHTS_PER_OBJECT;
}
/** Set a material's fixture-light list length AND fold it into its node program cache key.
 * WebGPURenderer's RenderObject.getMaterialCacheKey skips `userData` and folds a number
 * property to on/off, but appends an own string property verbatim, so the bound rides in
 * `esFixtureLightsKey` and two materials differing only in it compile separate programs. */
export function setFixtureLightsPerObject(material: THREE.Material, n: number): void {
  material.userData.esFixtureLightsPerObject = n;
  (material as THREE.Material & { esFixtureLightsKey?: string }).esFixtureLightsKey =
    `fl${fixtureLightsPerObject(material)}`;
}
/** three's PointLight decay the fixture lights reproduce unless a lamp names its own. */
export const FIXTURE_LIGHT_DECAY = 2;
/**
 * A lamp's SCREEN gain (perf10 c12 A): the field's colour is multiplied by
 * `FIXTURE_SCREEN_GAIN / toneMappingExposure` (the field's `screenNode`
 * uniform, set per render from the renderer), so a lit wall reaches the same screen-linear value
 * at any exposure, as the F41 window emissive does (settlement/windowGlow.ts).
 * Unanchored, night exposure ~22 turned a wall 1 m from a 2 cd lantern into a
 * flat orange slab. Each lamp's irradiance E = I x gain / d^2 passes a soft
 * knee per light, E' = K tanh(E / K) with K = `FIXTURE_KNEE` (`kneeNode`, both scaled by
 * 1 / exposure on the GPU), then screen-linear for a Lambert receiver of
 * albedo a is E' x a / pi (perf-diag23 Q5): a 2 cd lantern, a 0.3, 1 m gives
 * E 5.0 -> 4.44, 0.42 (sRGB ~0.68); 3 m E 0.56, ~unchanged; a 6 cd torch at
 * the 0.8 m clamp E 23.4 -> 7.97, 0.76, not blown.
 */
export const FIXTURE_SCREEN_GAIN = 2.5;
/** The per-light soft knee, in exposure-1 screen-irradiance units (see FIXTURE_SCREEN_GAIN). */
export const FIXTURE_KNEE = 8;

/** Exposure-1 screen-linear Lambert value of one lamp, as the shader computes it (gain, knee, a / pi). */
export function fixtureScreenValue(candela: number, distanceM: number, albedo: number): number {
  const d = Math.max(distanceM, 0.8);
  const e = (candela * FIXTURE_SCREEN_GAIN) / (d * d);
  return FIXTURE_KNEE * Math.tanh(e / FIXTURE_KNEE) * albedo / Math.PI;
}

/** How fixture light reaches the lit materials (module doc). */
export type FixtureLightingMode = "field" | "tiled" | "plain";

export interface FixtureLightInput {
  position: THREE.Vector3;
  radiusM: number;
  /** three's PointLight decay for this lamp (an interior record light's `interiorLightDecay`); default `FIXTURE_LIGHT_DECAY`. */
  decay?: number;
  /** A fire's light (its slot flickers with a flame): the volumetric air halo thickens around it (froxelGrid `FIRE_HALO_SIGMA_PER_M`). */
  fire?: boolean;
}

interface ObjectSlots {
  epoch: number;
  n: number;
  x: number; y: number; z: number;
  /** An InstancedMesh's fill revision (instanceMatrix version, count): a pooled
   * mesh refilled in place with other instances needs a fresh list. */
  fill: number;
  idx: Int32Array;
  count: number;
}

/** The shortest lamp distance the attenuation sees (metres): the field's graph and its number twin. */
export const FIXTURE_LIGHT_MIN_DISTANCE_M = 0.8;

/**
 * three's point-light attenuation (LightUtils getDistanceAttenuation): the
 * plain-number twin of the graph, for tests.
 */
export function fixtureAttenuation(distanceM: number, radiusM: number, decay = FIXTURE_LIGHT_DECAY): number {
  distanceM = Math.max(distanceM, FIXTURE_LIGHT_MIN_DISTANCE_M);
  const falloff = 1 / Math.max(Math.pow(distanceM, decay), 0.01);
  if (!(radiusM > 0)) return falloff;
  const t = Math.min(1, Math.max(0, 1 - Math.pow(distanceM / radiusM, 4)));
  return falloff * t * t;
}

/** A material three lights (classic or node: Standard/Physical, Lambert, Phong). */
export function isFixtureLitMaterial(material: THREE.Material | null | undefined): boolean {
  const m = material as (THREE.Material & Record<string, unknown>) | null | undefined;
  if (!m || (m as { lights?: boolean }).lights === false) return false;
  return Boolean(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial
    || m.isMeshStandardNodeMaterial || m.isMeshLambertNodeMaterial || m.isMeshPhongNodeMaterial);
}

export class FixtureLightField {
  readonly texture: THREE.DataTexture;
  /** Per drawn object: its lamp slots 0..15 as a mat4 (column-major, slot k at
   * element k; -1 ends the list), written for each draw by `onObjectUpdate`. */
  readonly slotsNode: TslNode;
  /** Slots 16..31 (an interior cell's parts list 32), same layout. */
  readonly slotsNodeHi: TslNode;
  /** `FIXTURE_SCREEN_GAIN / exposure`, the lamps' screen anchor; one uniform, so no program changes. */
  readonly screenNode: TslNode;
  /** The renderer exposure the screen gain is anchored to. */
  exposure = 1;
  /** `FIXTURE_KNEE / exposure`, the per-lamp soft knee in the same units as the screen gain. */
  readonly kneeNode: TslNode;
  /** Bumps whenever a slot's position or radius changes: per-object lists re-chosen. */
  epoch = 0;
  private readonly data = new Float32Array(FIXTURE_LIGHTS_MAX * 2 * 4);
  private used = 0;
  private primary: readonly FixtureLightInput[] = [];
  private reserved: readonly FixtureLightInput[] = [];
  /** Per slot: 1 for a fire's light (`FixtureLightInput.fire`). */
  private readonly fireSlot = new Uint8Array(FIXTURE_LIGHTS_MAX);
  private reservedRadiance = new Float32Array(0);
  private dirty = false;
  private readonly slots = new WeakMap<THREE.Object3D, ObjectSlots>();
  private readonly attached = new WeakSet<THREE.Object3D>();
  private readonly sphere = new THREE.Sphere();
  private readonly order = new Float64Array(FIXTURE_LIGHTS_MAX);
  private readonly slotMatrix = new THREE.Matrix4();
  private readonly slotMatrixHi = new THREE.Matrix4();
  /** The `"tiled"`/`"plain"` modes' real lights (made on first use). */
  private pointLights: THREE.Group | null = null;
  /** Draw updates of the slot list so far (probes). */
  objectUpdates = 0;

  constructor() {
    this.texture = new THREE.DataTexture(this.data, FIXTURE_LIGHTS_MAX, 2, THREE.RGBAFormat, THREE.FloatType);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.name = "es-fixture-lights";
    this.texture.needsUpdate = true;
    this.slotsNode = (uniform as (value: unknown, type: string) => TslNode)(new THREE.Matrix4(), "mat4").onObjectUpdate(
      ({ object, material }: { object: THREE.Object3D; material?: THREE.Material }) => this.slotMatrixFor(object, material));
    this.slotsNodeHi = (uniform as (value: unknown, type: string) => TslNode)(new THREE.Matrix4(), "mat4").onObjectUpdate(
      ({ object, material }: { object: THREE.Object3D; material?: THREE.Material }) => this.slotMatrixFor(object, material, 16));
    this.screenNode = (uniform as (value: unknown) => TslNode)(FIXTURE_SCREEN_GAIN).onRenderUpdate(
      ({ renderer }: { renderer?: { toneMappingExposure: number } }) => this.setExposure(renderer?.toneMappingExposure ?? this.exposure));
    this.kneeNode = (uniform as (value: unknown) => TslNode)(FIXTURE_KNEE);
  }

  /** Anchor the lamps to `exposure` (toneMappingExposure); returns the screen gain. Run every render. */
  setExposure(exposure: number): number {
    const e = exposure > 1e-3 ? exposure : 1e-3;
    this.exposure = e;
    const gain = FIXTURE_SCREEN_GAIN / e;
    (this.screenNode as unknown as { value: number }).value = gain;
    (this.kneeNode as unknown as { value: number }).value = FIXTURE_KNEE / e;
    return gain;
  }

  /** Lamps held now. */
  get count(): number { return this.used; }

  /**
   * The settlement's lamp set: positions and radii; their intensities go to 0
   * until `setIntensity`. It takes the slots the reserved lights
   * (`setReserved`) leave, so the two together never pass `FIXTURE_LIGHTS_MAX`.
   */
  setLights(lights: readonly FixtureLightInput[]): void {
    this.primary = lights.slice(0, FIXTURE_LIGHTS_MAX - this.reserved.length);
    this.pack();
  }

  /**
   * Lights another owner holds beside the settlement's (an interior's window
   * panes, interiorLoader `InteriorDaylight`): packed after the settlement's
   * slots and served first from the cap. `[]` gives the slots back.
   */
  setReserved(lights: readonly FixtureLightInput[]): void {
    this.reserved = lights.slice(0, FIXTURE_LIGHTS_MAX);
    this.reservedRadiance = new Float32Array(this.reserved.length * 3);
    this.primary = this.primary.slice(0, FIXTURE_LIGHTS_MAX - this.reserved.length);
    this.pack();
  }

  /** Reserved lights held now. */
  get reservedCount(): number { return this.reserved.length; }

  /** Reserved light `j`'s linear colour x intensity (cd). */
  setReservedIntensity(j: number, colour: THREE.Color, intensity: number): void {
    if (j < 0 || j >= this.reserved.length) return;
    const k = j * 3;
    this.reservedRadiance[k] = colour.r * intensity;
    this.reservedRadiance[k + 1] = colour.g * intensity;
    this.reservedRadiance[k + 2] = colour.b * intensity;
    this.writeRadiance(this.primary.length + j, this.reservedRadiance[k], this.reservedRadiance[k + 1], this.reservedRadiance[k + 2]);
  }

  /** The slot reserved light `j` holds now (tests, probes). */
  reservedSlot(j: number): number { return this.primary.length + j; }

  private pack(): void {
    const n = this.primary.length + this.reserved.length;
    let changed = n !== this.used;
    for (let i = 0; i < n; i++) {
      const { position, radiusM, decay, fire } = i < this.primary.length ? this.primary[i] : this.reserved[i - this.primary.length];
      const o = i * 4;
      const c = (FIXTURE_LIGHTS_MAX + i) * 4 + 3;
      const d = decay ?? FIXTURE_LIGHT_DECAY;
      if (this.data[c] !== Math.fround(d)) { this.data[c] = d; this.dirty = true; }
      if (!changed && (this.data[o] !== Math.fround(position.x) || this.data[o + 1] !== Math.fround(position.y)
        || this.data[o + 2] !== Math.fround(position.z) || this.data[o + 3] !== Math.fround(radiusM))) changed = true;
      this.data[o] = position.x; this.data[o + 1] = position.y; this.data[o + 2] = position.z;
      this.data[o + 3] = radiusM;
      this.fireSlot[i] = fire ? 1 : 0;
    }
    for (let j = 0; j < this.reserved.length; j++) {
      const k = j * 3;
      this.writeRadiance(this.primary.length + j, this.reservedRadiance[k], this.reservedRadiance[k + 1], this.reservedRadiance[k + 2]);
    }
    for (let i = n; i < this.used; i++) this.writeRadiance(i, 0, 0, 0);
    this.used = n;
    if (changed) { this.epoch += 1; this.dirty = true; }
  }

  /** Settlement slot `i`'s linear colour x intensity (cd), three's PointLight `color * intensity`. */
  setIntensity(i: number, colour: THREE.Color | null, intensity: number): void {
    if (i < 0 || i >= this.primary.length) return;
    this.writeRadiance(i, colour ? colour.r * intensity : 0, colour ? colour.g * intensity : 0,
      colour ? colour.b * intensity : 0);
  }

  private writeRadiance(i: number, r: number, g: number, b: number): void {
    const o = (FIXTURE_LIGHTS_MAX + i) * 4;
    if (this.data[o] === Math.fround(r) && this.data[o + 1] === Math.fround(g) && this.data[o + 2] === Math.fround(b)) return;
    this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b;
    this.dirty = true;
  }

  /** Every slot in use: position, radius, linear colour x intensity (cd) and whether it is a fire's light, read-only (the volumetric medium's halos, 0112). */
  forEachLight(visit: (x: number, y: number, z: number, radiusM: number, r: number, g: number, b: number, fire: boolean) => void): void {
    const d = this.data;
    for (let i = 0; i < this.used; i++) {
      const o = i * 4, c = (FIXTURE_LIGHTS_MAX + i) * 4;
      visit(d[o], d[o + 1], d[o + 2], d[o + 3], d[c], d[c + 1], d[c + 2], this.fireSlot[i] === 1);
    }
  }
  /** Slot `i`'s decay as held (tests). */
  decayOf(i: number): number { return this.data[(FIXTURE_LIGHTS_MAX + i) * 4 + 3]; }

  /** Slot `i`'s colour x intensity as held (tests). */
  radianceOf(i: number): [number, number, number] {
    const o = (FIXTURE_LIGHTS_MAX + i) * 4;
    return [this.data[o], this.data[o + 1], this.data[o + 2]];
  }

  /** Upload the texture if any slot changed this frame (a 3.2 KB write), and
   * mirror the slots into the point lights when a point-light mode uses them. */
  commit(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.texture.needsUpdate = true;
    if (this.pointLights) this.syncPointLights();
  }

  /**
   * The `"tiled"`/`"plain"` modes' lights: `FIXTURE_LIGHTS_MAX` PointLights
   * (no shadow, each slot's decay) under one group added to `scene`, mirroring the
   * slots (a slot past the count, or dark, is hidden). Idempotent.
   */
  usePointLights(scene: THREE.Object3D): THREE.Group {
    if (!this.pointLights) {
      const group = new THREE.Group();
      group.name = "es-fixture-point-lights";
      for (let i = 0; i < FIXTURE_LIGHTS_MAX; i++) {
        const light = new THREE.PointLight(0xffffff, 0, 1, FIXTURE_LIGHT_DECAY);
        light.castShadow = false;
        group.add(light);
      }
      this.pointLights = group;
      this.syncPointLights();
    }
    if (this.pointLights.parent !== scene) scene.add(this.pointLights);
    return this.pointLights;
  }

  private syncPointLights(): void {
    const group = this.pointLights!;
    for (let i = 0; i < FIXTURE_LIGHTS_MAX; i++) {
      const light = group.children[i] as THREE.PointLight;
      const p = i * 4; const c = (FIXTURE_LIGHTS_MAX + i) * 4;
      const on = i < this.used && (this.data[c] > 0 || this.data[c + 1] > 0 || this.data[c + 2] > 0);
      // off is intensity 0, never visible=false: the light set keys every lit program (render/lightSwitch)
      if (!on) { light.intensity = 0; continue; }
      light.position.set(this.data[p], this.data[p + 1], this.data[p + 2]);
      light.distance = this.data[p + 3];
      light.decay = this.data[c + 3];
      light.color.setRGB(this.data[c], this.data[c + 1], this.data[c + 2], THREE.LinearSRGBColorSpace);
      light.intensity = 1;
      light.updateMatrixWorld();
    }
  }

  /** Kept for the callers of the WebGL-era API: fixture light is the
   * renderer's lighting now, so every lit material receives it with no
   * patch. Returns whether `material` is one it lights. */
  install(material: THREE.Material): boolean {
    return isFixtureLitMaterial(material);
  }

  /** Whether `material` receives fixture light (every lit material does). */
  installed(material: THREE.Material): boolean {
    return isFixtureLitMaterial(material);
  }

  /** Kept for the WebGL-era callers: the per-object list is chosen at draw
   * time for every object (`onObjectUpdate`); this only records the object. */
  attach(object: THREE.Object3D): void {
    this.attached.add(object);
  }

  isAttached(object: THREE.Object3D): boolean { return this.attached.has(object); }

  /**
   * The slots of the `n` (default `FIXTURE_LIGHTS_PER_OBJECT`) nearest lamps
   * whose radius reaches `sphere`, nearest first, into `out`; returns how many.
   */
  selectFor(sphere: THREE.Sphere, out: Int32Array, perObject = FIXTURE_LIGHTS_PER_OBJECT): number {
    const N = Math.min(perObject, FIXTURE_LIGHTS_PER_OBJECT_MAX, out.length);
    let n = 0;
    const cx = sphere.center.x; const cy = sphere.center.y; const cz = sphere.center.z;
    for (let i = 0; i < this.used; i++) {
      const o = i * 4;
      const dx = this.data[o] - cx; const dy = this.data[o + 1] - cy; const dz = this.data[o + 2] - cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - sphere.radius;
      if (d >= this.data[o + 3]) continue;
      // insertion into the nearest-N list
      let at = Math.min(n, N);
      while (at > 0 && this.order[at - 1] > d) at -= 1;
      if (at >= N) continue;
      for (let k = Math.min(n, N - 1); k > at; k--) {
        this.order[k] = this.order[k - 1]; out[k] = out[k - 1];
      }
      this.order[at] = d; out[at] = i;
      n = Math.min(n + 1, N);
    }
    for (let k = n; k < out.length; k++) out[k] = 0;
    return n;
  }

  /** The object's list now (tests, probes): re-chosen if stale. */
  slotsOf(object: THREE.Object3D, geometry?: THREE.BufferGeometry, perObject = FIXTURE_LIGHTS_PER_OBJECT): { idx: Int32Array; count: number } {
    return this.refresh(object, geometry ?? (object as THREE.Mesh).geometry, perObject);
  }

  /** The draw's slot matrix (element k = slot k, -1 past the list): what
   * `slotsNode` hands the GPU for `object` drawn with `material`. */
  slotMatrixFor(object: THREE.Object3D, material?: THREE.Material, from: 0 | 16 = 0): THREE.Matrix4 {
    const s = this.refresh(object, (object as THREE.Mesh).geometry, fixtureLightsPerObject(material));
    const m = from === 0 ? this.slotMatrix : this.slotMatrixHi;
    const e = m.elements;
    for (let k = 0; k < 16; k++) e[k] = from + k < s.count ? s.idx[from + k] : -1;
    if (from === 0) this.objectUpdates += 1;
    return m;
  }

  private refresh(object: THREE.Object3D, geometry: THREE.BufferGeometry | undefined, perObject: number): ObjectSlots {
    let s = this.slots.get(object);
    const e = object.matrixWorld.elements;
    const instanced = object as THREE.InstancedMesh;
    const fill = instanced.isInstancedMesh ? instanced.instanceMatrix.version * 65536 + instanced.count : 0;
    if (s && s.epoch === this.epoch && s.n === perObject && s.fill === fill
      && s.x === e[12] && s.y === e[13] && s.z === e[14]) return s;
    if (!s) {
      s = { epoch: -1, n: 0, x: 0, y: 0, z: 0, fill: -1, idx: new Int32Array(FIXTURE_LIGHTS_PER_OBJECT_MAX), count: 0 };
      this.slots.set(object, s);
    }
    s.epoch = this.epoch; s.n = perObject; s.fill = fill; s.x = e[12]; s.y = e[13]; s.z = e[14];
    if (this.used === 0 || !this.worldSphere(object, geometry)) {
      s.count = 0; return s;
    }
    s.count = this.selectFor(this.sphere, s.idx, perObject);
    return s;
  }

  private worldSphere(object: THREE.Object3D, geometry: THREE.BufferGeometry | undefined): boolean {
    const instanced = object as THREE.InstancedMesh;
    let local: THREE.Sphere | null = null;
    if (instanced.isInstancedMesh) {
      if (instanced.boundingSphere === null) instanced.computeBoundingSphere();
      local = instanced.boundingSphere;
    } else if (geometry) {
      if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
      local = geometry.boundingSphere;
    }
    if (!local) return false;
    this.sphere.copy(local).applyMatrix4(object.matrixWorld);
    return true;
  }

  dispose(): void {
    this.texture.dispose();
    this.pointLights?.removeFromParent();
    this.pointLights = null;
  }
}

/**
 * The scene's lights node plus the fixture-light loop: the drawn object's
 * slot list (`FixtureLightField.slotsNode`), each lamp through three's
 * `directPointLight` and the lighting model's `direct`, as a PointLight is.
 */
export class FixtureFieldLightsNode extends LightsNode {
  static get type(): string { return "FixtureFieldLightsNode"; }
  readonly field: FixtureLightField;

  constructor(field: FixtureLightField) {
    super();
    this.field = field;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setupLights(builder: any, lightNodes: any[]): void {
    const reflected = builder.context.reflectedLight;
    // declared before the loop (TiledLightsNode does the same)
    reflected.directDiffuse.toStack();
    reflected.directSpecular.toStack();
    super.setupLights(builder, lightNodes);
    const slots = this.field.slotsNode;
    const slotsHi = this.field.slotsNodeHi;
    const tex = this.field.texture;
    // a compile-constant bound of the material's list length (8 unless it names more), with the
    // count break, as dev's GLSL loop (walk 10, F1: a 32 bound cost every lit fragment)
    const n = fixtureLightsPerObject(builder.material);
    Fn(() => {
      Loop(n, ({ i }: { i: TslNode }) => {
        const k = int(i);
        const slot = n <= 16 ? slots.element(k.div(4)).element(k.mod(4))
          : sel(k.lessThan(16), slots.element(k.mod(16).div(4)).element(k.mod(4)),
            slotsHi.element(k.mod(16).div(4)).element(k.mod(4)));
        If(slot.lessThan(0), () => { Break(); });
        const index = int(slot);
        const posRadius = textureLoad(tex, ivec2(index, int(0)));
        const radiance = textureLoad(tex, ivec2(index, int(1)));
        const viewPosition = cameraViewMatrix.mul(vec4(posRadius.xyz, 1)).xyz;
        const lightVector = viewPosition.sub(positionView);
        const lightLength = lightVector.length();
        // three 0.184's runtime takes `lightVector` (its typings lag)
        // E = I x gain x attenuation, then the per-lamp soft knee K tanh(max(E) / K) (dev perf-diag23 Q5);
        // the attenuation is taken here, so three's term below runs with decay 0 and no cutoff (factor 1)
        const attenuation = (getDistanceAttenuation as (p: Record<string, TslNode>) => TslNode)({
          lightDistance: max(lightLength, FIXTURE_LIGHT_MIN_DISTANCE_M), cutoffDistance: posRadius.w, decayExponent: radiance.a });
        const e = radiance.rgb.mul(this.field.screenNode).mul(attenuation);
        const peak = max(max(e.r, e.g), e.b);
        const x = peak.div(this.field.kneeNode);
        const tanhX = exp(x.mul(-2)).oneMinus().div(exp(x.mul(-2)).add(1));
        builder.lightsNode.setupDirectLight(builder, this, (directPointLight as (p: Record<string, TslNode>) => TslNode)({
          color: e.mul(this.field.kneeNode.mul(tanhX).div(max(peak, 1e-6))),
          // distance floored at FIXTURE_LIGHT_MIN_DISTANCE_M (dev perf10: a lamp's own shell and
          // the wall beside it never take the 1/d^2 spike), direction unchanged
          lightVector: lightVector.div(max(lightLength, 1e-4)).mul(max(lightLength, FIXTURE_LIGHT_MIN_DISTANCE_M)),
          cutoffDistance: 0,
          decayExponent: 0,
        }));
      });
    }, "void")();
  }

  /** Always lit: a lamp that lights later must not change the program. */
  get hasLights(): boolean { return true; }
}

/** The renderer lighting for `"field"`: one `FixtureFieldLightsNode` per scene. */
export class FixtureFieldLighting extends Lighting {
  private readonly nodes = new WeakMap<object, LightsNode>();
  private readonly quad = new LightsNode();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getNode(scene: any): LightsNode {
    if (scene.isQuadMesh) return this.quad;
    let node = this.nodes.get(scene);
    if (!node) {
      node = new FixtureFieldLightsNode(fixtureLightFieldOf(scene));
      this.nodes.set(scene, node);
    }
    return node;
  }
}

/** The renderer lighting for `"tiled"`: three's TiledLighting, with the
 * scene's field mirrored into real PointLights; a node per scene held here
 * (three's base getNode keys a module map shared with every Lighting). */
export class FixtureTiledLighting extends TiledLighting {
  private readonly nodes = new WeakMap<object, LightsNode>();
  private readonly quad = new LightsNode();
  private readonly renderer: WebGPURenderer;
  constructor(renderer: WebGPURenderer) {
    super();
    this.renderer = renderer;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getNode(scene: any): LightsNode {
    if (scene.isQuadMesh) return this.quad;
    let node = this.nodes.get(scene);
    if (!node) {
      fixtureLightFieldOf(scene).usePointLights(scene);
      node = this.createNode() as unknown as LightsNode;
      // TiledLightsNode makes its compute pass on its first render, but its
      // cache key reads it: a compileAsync before any render threw on null
      (node as unknown as { updateProgram(r: WebGPURenderer): void }).updateProgram(this.renderer);
      this.nodes.set(scene, node);
    }
    return node;
  }
}

/** The measurement baseline: the field's PointLights through three's own light list. */
export class FixturePlainLighting extends Lighting {
  private readonly nodes = new WeakMap<object, LightsNode>();
  private readonly quad = new LightsNode();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getNode(scene: any): LightsNode {
    if (scene.isQuadMesh) return this.quad;
    let node = this.nodes.get(scene);
    if (!node) {
      fixtureLightFieldOf(scene).usePointLights(scene);
      node = this.createNode();
      this.nodes.set(scene, node);
    }
    return node;
  }
}

/**
 * The mode a renderer uses on `backend`: the field on both (16k walk 5,
 * lane L8 measurement, settlement-night harness). three 0.184's
 * TiledLightsNode keeps at most 8 lights per 32 px tile, taken in light-index
 * order rather than nearest-first, with no depth range: a street-level view
 * down a lamp-lined lane fills the centre tiles with far lamps and leaves the
 * near huts dark. `"tiled"` stays selectable for measurement.
 */
export function fixtureLightingModeFor(_backend: "webgpu" | "webgl"): FixtureLightingMode {
  return "field";
}

const LIGHTING_MODE_KEY = "esFixtureLightingMode";

/**
 * Make fixture light the renderer's lighting (idempotent; cheap to call every
 * frame). Best before a scene's first render: render lists made so far hold
 * their lights node, so they are dropped once and remade (a relink).
 * `mode` overrides the measured choice (harness measurements only).
 */
export function installFixtureLighting(renderer: WebGPURenderer, mode?: FixtureLightingMode): FixtureLightingMode {
  const r = renderer as unknown as {
    lighting: Lighting;
    _renderLists?: { lighting: Lighting; dispose(): void };
    [LIGHTING_MODE_KEY]?: FixtureLightingMode;
  };
  const backend = activeBackend(renderer);
  const want = mode ?? fixtureLightingModeFor(backend);
  const chosen: FixtureLightingMode = want === "tiled" && backend !== "webgpu" ? "field" : want;
  if (r[LIGHTING_MODE_KEY] === chosen) return chosen;
  const lighting = chosen === "tiled" ? new FixtureTiledLighting(renderer)
    : chosen === "plain" ? new FixturePlainLighting() : new FixtureFieldLighting();
  r.lighting = lighting;
  // the render lists took the renderer's lighting at init: point them at the
  // new one and drop the lists (each holds the lights node it was made with)
  if (r._renderLists) {
    r._renderLists.lighting = lighting;
    r._renderLists.dispose();
  }
  r[LIGHTING_MODE_KEY] = chosen;
  return chosen;
}

const FIELD_KEY = "esFixtureLightField";

/** The scene's fixture light field, made on first use and held on the scene (its context object). */
export function fixtureLightFieldOf(scene: THREE.Object3D): FixtureLightField {
  let field = scene.userData[FIELD_KEY] as FixtureLightField | undefined;
  if (!field) {
    field = new FixtureLightField();
    // non-enumerable: a scene's userData is JSON-copied by clone/toJSON
    Object.defineProperty(scene.userData, FIELD_KEY, { value: field, enumerable: false, configurable: true, writable: true });
  }
  return field;
}

/** The scene's field epoch (0 without a field), read without making one: a
 * static draw's per-object lamp list is current while this is unchanged. */
export function fixtureLightEpochOf(scene: THREE.Object3D): number {
  return (scene.userData[FIELD_KEY] as FixtureLightField | undefined)?.epoch ?? 0;
}

const PREPARER_KEY = "esLitPreparer";
const WAITERS_KEY = "esLitPreparerWaiters";
/** Patches every lit material under a root the way the scene's own walk does
 * (the chained node features): a layer that builds detached calls it before
 * warming the programs, so nothing is first drawn unpatched. */
export type LitPreparer = (root: THREE.Object3D) => void;

/** Register the scene's preparer (the sky's walk); returns the unregister. */
export function setLitPreparer(scene: THREE.Object3D, prepare: LitPreparer): () => void {
  Object.defineProperty(scene.userData, PREPARER_KEY, { value: prepare, enumerable: false, configurable: true, writable: true });
  const waiting = scene.userData[WAITERS_KEY] as ((p: LitPreparer) => void)[] | undefined;
  delete scene.userData[WAITERS_KEY];
  for (const resolve of waiting ?? []) resolve(prepare);
  return () => { if (scene.userData[PREPARER_KEY] === prepare) delete scene.userData[PREPARER_KEY]; };
}

/** The scene's preparer, if a sky is mounted. */
export function litPreparerOf(scene: THREE.Object3D): LitPreparer | undefined {
  return scene.userData[PREPARER_KEY] as LitPreparer | undefined;
}

/** The scene's preparer once registered (notified by `setLitPreparer`, never
 * polled), or undefined after `maxWaitMs` when no sky mounts. */
export function whenLitPreparer(scene: THREE.Object3D, maxWaitMs: number): Promise<LitPreparer | undefined> {
  const now = litPreparerOf(scene);
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    const waiting = (scene.userData[WAITERS_KEY] ??= []) as ((p: LitPreparer) => void)[];
    const done = (p: LitPreparer) => { clearTimeout(timer); resolve(p); };
    waiting.push(done);
    const timer = setTimeout(() => {
      const at = waiting.indexOf(done);
      if (at >= 0) waiting.splice(at, 1);
      resolve(undefined);
    }, maxWaitMs);
  });
}

/** Patch every lit material under `root` before its programs are warmed: the
 * scene's preparer (CSM, chained hooks, fixture lights), or with no sky the
 * fixture-light install alone. */
export function prepareLit(scene: THREE.Object3D, root: THREE.Object3D): void {
  const prepare = litPreparerOf(scene);
  if (prepare) { prepare(root); return; }
  const field = fixtureLightFieldOf(scene);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && isFixtureLitMaterial(mesh.material as THREE.Material)
      && field.install(mesh.material as THREE.Material)) field.attach(mesh);
  });
}
