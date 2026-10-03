/**
 * Fixture lights outside three's light list (16k walk 5 perf, WebGL path).
 *
 * three compiles `NUM_POINT_LIGHTS` into every lit program and loops every
 * point light for every fragment, so each settlement lamp used to cost every
 * terrain, tree, ground-cover and wall fragment on screen, and each new count
 * cost a program per lit material. Here the lamps live in one small float
 * texture (`FIXTURE_LIGHTS_MAX` slots: row 0 world position + radius, row 1
 * colour x intensity + decay) with a runtime count, and each drawn object carries the
 * slots of its `FIXTURE_LIGHTS_PER_OBJECT` nearest lamps that reach its
 * bounding sphere. The fragment loops those few, with an early exit on the
 * count and on the radius, using three's own `getDistanceAttenuation` and
 * `RE_Direct`, so a lit wall looks exactly as it did under a `PointLight` of
 * the same colour, intensity, distance and decay (2, or the lamp's own). The shader text and the
 * program cache key never depend on the count: one program for 0 to 100.
 *
 * - `install(material)`: the fragment chunk and its uniforms, chained onto the
 *   material's `onBeforeCompile` (idempotent, re-applied after CSM overwrites
 *   the hook), with a stable `customProgramCacheKey` suffix.
 * - `attach(object)`: the per-object slot list, re-chosen on the CPU when the
 *   lamp set changes (`epoch`) or the object moves, and handed to the program
 *   in `onBeforeRender` (three uploads a built-in material's uniforms only when
 *   the material or program changes, so a changed list is written straight to
 *   the bound program; no program switch, no recompile).
 * - The texture is used, never a uniform array: 100 lights as uniforms would
 *   take ~200 of the 224 fragment vectors WebGL2 guarantees.
 *
 * One field per scene (`fixtureLightFieldOf`): the scene is the context
 * object; nothing here is a module singleton. The WebGPU path replaces this
 * with clustered lighting; this is the WebGL fallback.
 */
import * as THREE from "three";
import { chainHas, markChain } from "../shaderHookChain";

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
export function fixtureLightsPerObject(material: THREE.Material): number {
  const n = material.userData?.esFixtureLightsPerObject;
  return typeof n === "number" && n >= 1
    ? Math.min(FIXTURE_LIGHTS_PER_OBJECT_MAX, Math.floor(n)) : FIXTURE_LIGHTS_PER_OBJECT;
}
/** three's PointLight decay the fixture lights reproduce unless a lamp names its own. */
export const FIXTURE_LIGHT_DECAY = 2;
const CACHE_KEY = "es-fixture-lights-v1";
/**
 * A lamp's SCREEN gain (perf10 c12 A): the field's colour is multiplied by
 * `FIXTURE_SCREEN_GAIN / toneMappingExposure` (the shared `esFxScreen`
 * uniform, never a define), so a lit wall reaches the same screen-linear value
 * at any exposure, as the F41 window emissive does (settlement/windowGlow.ts).
 * Unanchored, night exposure ~22 turned a wall 1 m from a 2 cd lantern into a
 * flat orange slab. Each lamp's irradiance E = I x gain / d^2 passes a soft
 * knee per light, E' = K tanh(E / K) with K = `FIXTURE_KNEE` (both scaled by
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

export interface FixtureLightInput {
  position: THREE.Vector3;
  radiusM: number;
  /** three's PointLight decay for this lamp (an interior record light's `interiorLightDecay`); default `FIXTURE_LIGHT_DECAY`. */
  decay?: number;
}

interface ObjectSlots {
  epoch: number;
  n: number;
  x: number; y: number; z: number; r: number;
  /** An InstancedMesh's fill revision (instanceMatrix version, count): a pooled
   * mesh refilled in place with other instances needs a fresh list. */
  fill: number;
  idx: Int32Array;
  count: number;
  key: number;
}

type ProgramLike = { program: WebGLProgram; getUniforms(): { setValue(gl: WebGL2RenderingContext, name: string, value: unknown): void } };

/** The fragment lines: three's point-light term for each listed lamp (`n` per object). */
export const fixtureLightsFragment = (n: number): string => /* glsl */ `
#if defined( RE_Direct )
for ( int esFxI = 0; esFxI < ${n}; esFxI ++ ) {
	if ( esFxI >= esFxCount ) break;
	int esFxL = esFxIdx[ esFxI ];
	vec4 esFxP = texelFetch( esFxData, ivec2( esFxL, 0 ), 0 );
	vec3 esFxV = ( viewMatrix * vec4( esFxP.xyz, 1.0 ) ).xyz - geometryPosition;
	float esFxD = length( esFxV );
	if ( esFxD >= esFxP.w ) continue;
	IncidentLight esFxLight;
	esFxLight.direction = esFxV / max( esFxD, 1e-4 );
	vec4 esFxC = texelFetch( esFxData, ivec2( esFxL, 1 ), 0 );
	vec3 esFxE = esFxC.rgb * esFxScreen * getDistanceAttenuation( max( esFxD, 0.8 ), esFxP.w, esFxC.a );
	float esFxM = max( max( esFxE.r, esFxE.g ), esFxE.b );
	esFxLight.color = esFxM > 0.0 ? esFxE * ( esFxKnee * tanh( esFxM / esFxKnee ) / esFxM ) : esFxE;
	esFxLight.visible = true;
	RE_Direct( esFxLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}
#endif
`;

const FIXTURE_LIGHTS_MARK = "uniform highp sampler2D esFxData;";
const FIXTURE_LIGHTS_PARS = /* glsl */ `
${FIXTURE_LIGHTS_MARK}
uniform int esFxIdx[ ${FIXTURE_LIGHTS_PER_OBJECT_MAX} ];
uniform int esFxCount;
uniform float esFxScreen;
uniform float esFxKnee;
`;

/** A material three lights (the ones whose fragment runs `RE_Direct`). */
export function isFixtureLitMaterial(material: THREE.Material | null | undefined): boolean {
  const m = material as THREE.MeshStandardMaterial | undefined;
  return Boolean(m && (m.isMeshStandardMaterial
    || (m as unknown as THREE.MeshLambertMaterial).isMeshLambertMaterial
    || (m as unknown as THREE.MeshPhongMaterial).isMeshPhongMaterial));
}

export class FixtureLightField {
  readonly texture: THREE.DataTexture;
  readonly uniforms: {
    esFxData: THREE.IUniform<THREE.DataTexture>;
    esFxIdx: THREE.IUniform<Int32Array>;
    esFxCount: THREE.IUniform<number>;
    esFxScreen: THREE.IUniform<number>;
    esFxKnee: THREE.IUniform<number>;
  };
  /** Bumps whenever a slot's position or radius changes: per-object lists re-chosen. */
  epoch = 0;
  private readonly data = new Float32Array(FIXTURE_LIGHTS_MAX * 2 * 4);
  private used = 0;
  private primary: readonly FixtureLightInput[] = [];
  private reserved: readonly FixtureLightInput[] = [];
  private reservedRadiance = new Float32Array(0);
  private dirty = false;
  private readonly slots = new WeakMap<THREE.Object3D, ObjectSlots>();
  private readonly attached = new WeakSet<THREE.Object3D>();
  private readonly lastKey = new WeakMap<WebGLProgram, number>();
  private lastMaterial: THREE.Material | null = null;
  private readonly sphere = new THREE.Sphere();
  private readonly order = new Float64Array(FIXTURE_LIGHTS_MAX);
  /** Draws that wrote a changed slot list straight to the bound program (probes). */
  directUploads = 0;

  constructor() {
    this.texture = new THREE.DataTexture(this.data, FIXTURE_LIGHTS_MAX, 2, THREE.RGBAFormat, THREE.FloatType);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.name = "es-fixture-lights";
    this.texture.needsUpdate = true;
    this.uniforms = {
      esFxData: { value: this.texture },
      esFxIdx: { value: new Int32Array(FIXTURE_LIGHTS_PER_OBJECT_MAX) },
      esFxCount: { value: 0 },
      esFxScreen: { value: FIXTURE_SCREEN_GAIN },
      esFxKnee: { value: FIXTURE_KNEE },
    };
  }

  /** The renderer exposure the screen gain is anchored to (held here, per scene). */
  exposure = 1;

  /** Anchor the lamps to `exposure` (toneMappingExposure): `esFxScreen = FIXTURE_SCREEN_GAIN / exposure`.
   * Set on every draw from the renderer; the uniform is shared, so no program changes. */
  setExposure(exposure: number): void {
    const e = exposure > 1e-3 ? exposure : 1e-3;
    this.exposure = e;
    this.uniforms.esFxScreen.value = FIXTURE_SCREEN_GAIN / e;
    this.uniforms.esFxKnee.value = FIXTURE_KNEE / e;
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
      const { position, radiusM, decay } = i < this.primary.length ? this.primary[i] : this.reserved[i - this.primary.length];
      const o = i * 4;
      const c = (FIXTURE_LIGHTS_MAX + i) * 4 + 3;
      const d = decay ?? FIXTURE_LIGHT_DECAY;
      if (this.data[c] !== Math.fround(d)) { this.data[c] = d; this.dirty = true; }
      if (!changed && (this.data[o] !== Math.fround(position.x) || this.data[o + 1] !== Math.fround(position.y)
        || this.data[o + 2] !== Math.fround(position.z) || this.data[o + 3] !== Math.fround(radiusM))) changed = true;
      this.data[o] = position.x; this.data[o + 1] = position.y; this.data[o + 2] = position.z;
      this.data[o + 3] = radiusM;
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

  /** Slot `i`'s decay as held (tests). */
  decayOf(i: number): number { return this.data[(FIXTURE_LIGHTS_MAX + i) * 4 + 3]; }

  /** Slot `i`'s colour x intensity as held (tests). */
  radianceOf(i: number): [number, number, number] {
    const o = (FIXTURE_LIGHTS_MAX + i) * 4;
    return [this.data[o], this.data[o + 1], this.data[o + 2]];
  }

  /** Upload the texture if any slot changed this frame (a 3.2 KB texImage). */
  commit(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.texture.needsUpdate = true;
  }

  /**
   * Chain the fragment chunk onto `material` (a lit material only). Idempotent,
   * and safe to call again after another hook (CSM) replaced `onBeforeCompile`:
   * it re-wraps the new hook. Returns whether the material now carries it.
   */
  install(material: THREE.Material): boolean {
    if (!isFixtureLitMaterial(material)) return false;
    const m = material;
    if (chainHas(m.onBeforeCompile, CACHE_KEY)) return true;
    const previous = m.onBeforeCompile;
    const uniforms = this.uniforms;
    const perObject = fixtureLightsPerObject(m);
    const hook = markChain<THREE.Material["onBeforeCompile"]>(function (this: THREE.Material, shader, renderer) {
      previous?.call(this, shader, renderer);
      // its program carries the chunk: a later re-wrap need not relink it
      if (this) this.userData.esFixtureLinked = true;
      // never twice: a chain that holds this hook twice patches once
      if (shader.fragmentShader.includes(FIXTURE_LIGHTS_MARK)) return;
      shader.uniforms.esFxData = uniforms.esFxData;
      shader.uniforms.esFxIdx = uniforms.esFxIdx;
      shader.uniforms.esFxCount = uniforms.esFxCount;
      shader.uniforms.esFxScreen = uniforms.esFxScreen;
      shader.uniforms.esFxKnee = uniforms.esFxKnee;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${FIXTURE_LIGHTS_PARS}`)
        .replace("#include <lights_fragment_begin>", `#include <lights_fragment_begin>\n${fixtureLightsFragment(perObject)}`);
    }, previous, CACHE_KEY);
    const wasInstalled = Boolean(m.userData.esFixtureWrapped);
    m.onBeforeCompile = hook;
    m.userData.esFixtureWrapped = true;
    // marked on the key function, so a clone (default key) is keyed again
    if (!chainHas(m.customProgramCacheKey, CACHE_KEY)) {
      const priorKey = m.customProgramCacheKey;
      m.customProgramCacheKey = markChain(function (this: THREE.Material) {
        return `${priorKey.call(this)}|${CACHE_KEY}|${fixtureLightsPerObject(this)}`;
      }, priorKey, CACHE_KEY);
    }
    // A material that already compiled without the chunk must relink once.
    // One whose program already carries it (the 1 Hz sweep re-wrapping a
    // hook CSM replaced) keeps its program: its key never changed, and a
    // version bump re-derives the program parameters (perf10 f27, diag11 U2).
    if (!wasInstalled || (m.version > 0 && !m.userData.esFixtureLinked)) m.needsUpdate = true;
    return true;
  }

  /** Whether `material` carries the chunk now (its hook is the one installed). */
  installed(material: THREE.Material): boolean {
    return chainHas(material.onBeforeCompile, CACHE_KEY);
  }

  /** Give `object` its per-object lamp list at draw time. Idempotent; chains an existing `onBeforeRender`. */
  attach(object: THREE.Object3D): void {
    if (this.attached.has(object)) return;
    this.attached.add(object);
    const previous = object.onBeforeRender;
    const hasPrevious = previous !== THREE.Object3D.prototype.onBeforeRender;
    object.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      if (hasPrevious) previous.call(object, renderer, scene, camera, geometry, material, group);
      this.beforeDraw(renderer, object, geometry, material);
    };
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

  private refresh(object: THREE.Object3D, geometry: THREE.BufferGeometry | undefined, perObject: number): ObjectSlots {
    let s = this.slots.get(object);
    const e = object.matrixWorld.elements;
    const instanced = object as THREE.InstancedMesh;
    const fill = instanced.isInstancedMesh ? instanced.instanceMatrix.version * 65536 + instanced.count : 0;
    if (s && s.epoch === this.epoch && s.n === perObject && s.fill === fill
      && s.x === e[12] && s.y === e[13] && s.z === e[14]) return s;
    if (!s) {
      s = { epoch: -1, n: 0, x: 0, y: 0, z: 0, r: 0, fill: -1, idx: new Int32Array(FIXTURE_LIGHTS_PER_OBJECT_MAX), count: 0, key: 0 };
      this.slots.set(object, s);
    }
    s.epoch = this.epoch; s.n = perObject; s.fill = fill; s.x = e[12]; s.y = e[13]; s.z = e[14];
    if (this.used === 0 || !this.worldSphere(object, geometry)) {
      s.count = 0; s.key = 0; return s;
    }
    s.count = this.selectFor(this.sphere, s.idx, perObject);
    let key = s.count;
    for (let k = 0; k < s.count; k++) key = (key * 131 + s.idx[k] + 1) % 2147483647;
    s.key = key;
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

  private beforeDraw(
    renderer: THREE.WebGLRenderer, object: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
  ): void {
    if (!this.installed(material)) return;
    this.setExposure(renderer.toneMappingExposure);
    const s = this.refresh(object, geometry, fixtureLightsPerObject(material));
    this.uniforms.esFxIdx.value.set(s.idx);
    this.uniforms.esFxCount.value = s.count;
    // three re-uploads a built-in material's uniforms only when the material or
    // the program changes (and sorts opaque draws by material, so the draws of
    // one material run together). A material change uploads the values just
    // set; two draws in a row of one material keep the first list, so a list
    // that differs from what the program holds is written to it now (the
    // program is the bound one; if not, it is bound and the old one restored,
    // no three state touched).
    const program = (renderer.properties.get(material) as { currentProgram?: ProgramLike }).currentProgram;
    const sameMaterial = material === this.lastMaterial;
    this.lastMaterial = material;
    if (!program?.program) return;
    if (!sameMaterial || this.lastKey.get(program.program) === s.key) {
      this.lastKey.set(program.program, s.key);
      return;
    }
    this.lastKey.set(program.program, s.key);
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const bound = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    if (bound !== program.program) gl.useProgram(program.program);
    const u = program.getUniforms();
    u.setValue(gl, "esFxIdx", this.uniforms.esFxIdx.value);
    u.setValue(gl, "esFxCount", s.count);
    if (bound !== program.program) gl.useProgram(bound);
    this.directUploads += 1;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

const FIELD_KEY = "esFixtureLightField";

/** The scene's fixture light field, made on first use and held on the scene (its context object). */
export function fixtureLightFieldOf(scene: THREE.Object3D): FixtureLightField {
  let field = scene.userData[FIELD_KEY] as FixtureLightField | undefined;
  if (!field) {
    field = new FixtureLightField();
    scene.userData[FIELD_KEY] = field;
  }
  return field;
}

const PREPARER_KEY = "esLitPreparer";
const WAITERS_KEY = "esLitPreparerWaiters";
/** Patches every lit material under a root the way the scene's own walk does
 * (CSM, the chained hooks, fixture lights): a layer that builds detached calls
 * it before warming the programs, so nothing is first drawn unpatched. */
export type LitPreparer = (root: THREE.Object3D) => void;

/** Register the scene's preparer (the sky owns CSM); returns the unregister. */
export function setLitPreparer(scene: THREE.Object3D, prepare: LitPreparer): () => void {
  scene.userData[PREPARER_KEY] = prepare;
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
