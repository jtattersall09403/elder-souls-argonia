/**
 * The flame system (16k walk 5): every drawn fire as instances of one flame
 * card and one ember quad, two draws for all fires in view.
 *
 * A caller hands `setEmitters` one `FireEmitter` per mined flame record (the
 * emitter's final position in `group`'s LOCAL space: the piece's full
 * draw matrix applied to the record's `offsetM`, hang and mount included,
 * expressed relative to `group`; the shaders apply the cards mesh's own
 * `modelMatrix` (the group's world matrix), so a cell-local interior system
 * hands cell-local positions and follows its cell to 4000 m). Each emitter expands by its
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
 * The volume path (decision 0110): on the WebGPU backend each
 * preset with a `volume` block whose tier draws it (`steps[tier] > 0`) also
 * draws its fires as raymarched boxes (volumeFire.ts, one draw and one shared
 * simulated field per preset), and its cards yield to them within the reach
 * (`FIRE_VOLUME_REACH_M`, or the tier's `reachM`). The nearest
 * `privateFields` fires within `FIRE_VOLUME_PRIVATE_M` of the camera own a
 * private field each (their shared instance is hidden), so the fire the
 * player stands at never matches a neighbour. The tier is the caller's
 * (`setVolumeTier`, default high). The backend is read
 * from the renderer at the first draw (or given by `setBackend`); on WebGL 2
 * nothing of the volume path is built and the cards draw every fire.
 *
 * Owned by its caller (SettlementLightFixtures, a preview harness), never a
 * module singleton.
 */
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import { activeBackend, type RendererBackend } from "../../render/createRenderer";
import { BLOOM_SOURCE_LAYER } from "../../render/post/BloomPass";
import {
  FIRE_BED_PRESETS, FIRE_PRESETS, FIRE_PRESET_ORDER, FIRE_VOLUME_PRESETS, FIRE_VOLUME_PRIVATE_M,
  FIRE_VOLUME_TIER_CONFIG, nightShareOfExposure, type FirePresetId, type FireVolumeTier,
} from "./fireTypes";
import {
  FIRE_VOLUME_REACH_M, makeEmberMaterial, makeFireUniforms, makeFlameMaterial, makeFlameQuad, type FireUniforms,
} from "./flameMaterial";
import { deferDispose, tagGeometryBuffers } from "../../render/deferDispose";
import { acquireFireCurl, makeVolumeBox, makeVolumeMaterial, releaseFireCurl, VolumeFireField } from "./volumeFire";

export interface FireEmitter {
  /** Position of the emitter (the wick, the fire bed's centre) in `group`'s local space, m. */
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
const VOLUME_FLOATS = 12;

/** One field and the mesh that draws it (WebGPU only). */
interface FieldDraw {
  field: VolumeFireField;
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry>;
}
/** A private field: one fire's row, copied out of its preset's shared rows. */
interface PrivateDraw extends FieldDraw {
  data: Float32Array;
  /** The shared row it draws, -1 when free. */
  row: number;
}
/** One preset's volume draws: the shared field and its private slots. */
interface VolumeDraw extends FieldDraw {
  privates: PrivateDraw[];
}

/** The box a volume fire is drawn in, m: `[width, height]` at piece scale `scale`. */
export function volumeBoxSize(preset: FirePresetId, scale: number): [number, number] {
  const c = FIRE_PRESETS[preset];
  const v = c.volume;
  if (!v) return [0, 0];
  const w = Math.max(c.shape.widthM * v.box.widthW, c.shape.widthM + 2 * c.layers.spreadM) * scale;
  return [w, c.shape.heightM * v.box.heightH * scale];
}

export class FlameSystem {
  readonly group = new THREE.Group();
  readonly uniforms: FireUniforms;
  private readonly flames: THREE.Mesh<THREE.InstancedBufferGeometry>;
  private readonly embers: THREE.Mesh<THREE.InstancedBufferGeometry>;
  private get flameGeometry(): THREE.InstancedBufferGeometry { return this.flames.geometry; }
  private get emberGeometry(): THREE.InstancedBufferGeometry { return this.embers.geometry; }
  private flameOwner = new Int32Array(0);
  private emberOwner = new Int32Array(0);
  private flameData = new Float32Array(0);
  private emberData = new Float32Array(0);
  private lastStrength: Float32Array = new Float32Array(0);
  private emitterList: FireEmitter[] = [];
  private backend: RendererBackend | null = null;
  private readonly layer: number | undefined;
  /** Per volume preset: its instance rows and owners (built on every backend, drawn on WebGPU). */
  private volumeData = new Map<FirePresetId, { data: Float32Array; owner: Int32Array }>();
  private readonly volumes = new Map<FirePresetId, VolumeDraw>();
  /** The fire's curl texture every field samples (made with the first volume draw, per tier size). */
  private curl: THREE.Data3DTexture | null = null;
  /** What `curl` was acquired on (the renderer, or this system before its first draw). */
  private curlKey: object | null = null;
  /** The renderer of the first draw: replaced geometry is disposed through its frame queue. */
  private renderer: object | null = null;
  private tier: FireVolumeTier = "high";
  private readonly scratch = new THREE.Vector3();
  /** Private-field selection, reused every frame (allocation-free). */
  private selectedAt = Number.NaN;
  private readonly pick = { d2: new Float64Array(4), preset: new Int32Array(4), row: new Int32Array(4) };

  constructor(uniforms: FireUniforms = makeFireUniforms(), layer?: number) {
    this.layer = layer;
    this.uniforms = uniforms;
    this.group.name = "fire-flames";
    this.flames = new THREE.Mesh(makeFlameQuad(), makeFlameMaterial(uniforms));
    this.embers = new THREE.Mesh(makeFlameQuad(), makeEmberMaterial(uniforms));
    this.flames.name = "fire-flame-cards";
    this.embers.name = "fire-embers";
    for (const mesh of [this.flames, this.embers]) {
      mesh.frustumCulled = false;
      mesh.visible = false;
      if (layer !== undefined) mesh.layers.set(layer);
      // also a glow source for the bloom pass (render/post/BloomPass.ts)
      mesh.layers.enable(BLOOM_SOURCE_LAYER);
      // reads only shared or constant uniforms: skips the per-frame node refresh (render/staticRefresh.ts)
      mesh.userData.esStatic = true;
      this.group.add(mesh);
    }
    this.embers.onBeforeRender = (renderer) => this.syncDrawState(renderer);
    this.flames.onBeforeRender = (renderer) => {
      this.syncDrawState(renderer);
      this.renderer ??= renderer;
      if (this.backend === null) this.setBackend(activeBackend(renderer as unknown as WebGPURenderer));
      // what the last draw saw, for the flames probe (tooling/visual-look/flames.mjs diag)
      const r = renderer as unknown as { currentToneMapping?: number; getRenderTarget(): { name?: string } | null };
      this.group.userData.lastDraw = { toneMapping: renderer.toneMapping, currentToneMapping: r.currentToneMapping ?? null,
        target: r.getRenderTarget()?.name ?? null };
    };
    this.group.userData.fireUniforms = this.uniforms;
    this.embers.renderOrder = 1;
  }

  /**
   * The day/night blend and tone-mapping state of the render call about to
   * draw, from the renderer's exposure (the water surface reads the same
   * `toneMappingExposure`). Called by EVERY fire draw before it draws: the
   * uniforms are shared (one renderGroup buffer per render call, written by
   * whichever fire draw refreshes first; the volumes draw before the cards).
   */
  private syncDrawState(renderer: { toneMappingExposure: number; toneMapping: THREE.ToneMapping }): void {
    this.uniforms.uNight.value = nightShareOfExposure(renderer.toneMappingExposure);
    this.uniforms.uExposure.value = renderer.toneMappingExposure;
    this.uniforms.uToneMapped.value = renderer.toneMapping === THREE.NoToneMapping ? 0 : 1;
  }

  /**
   * The backend the fires draw on. `webgpu` builds the volume draws for the
   * volume presets; `webgl` draws cards only. Read from the renderer at the
   * first draw when never set.
   */
  setBackend(backend: RendererBackend): void {
    this.backend = backend;
    this.rebuildVolumes();
  }

  /** Whether the volume path is live (WebGPU backend and at least one volume fire). */
  get volumeFires(): number {
    let n = 0;
    for (const v of this.volumes.values()) n += v.mesh.geometry.instanceCount;
    return n;
  }

  /** The emitters last set. */
  get emitters(): readonly FireEmitter[] { return this.emitterList; }
  /** Flame cards drawn (instances). */
  get flameInstances(): number { return this.flameGeometry.instanceCount; }
  /** Ember quads drawn (instances). */
  get emberInstances(): number { return this.emberGeometry.instanceCount; }
  /** Position of flame card `i` in `group`'s local space (tests, probes). */
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
          c.flicker.rateHz, c.flicker.amount, c.windResponse, this.volumeDrawn(e.preset) ? 1 : 0,
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
    const volumes = new Map<FirePresetId, { rows: number[]; owners: number[] }>();
    for (const e of emitters) {
      const c = FIRE_PRESETS[e.preset];
      if (!this.volumeDrawn(e.preset)) continue;
      const [w, h] = volumeBoxSize(e.preset, e.scale);
      const v = volumes.get(e.preset) ?? { rows: [], owners: [] };
      v.rows.push(e.position.x, e.position.y, e.position.z, e.seed,
        w, h, FIRE_PRESET_ORDER.indexOf(e.preset), 0,
        c.flicker.rateHz, c.flicker.amount, c.windResponse, 0);
      v.owners.push(e.owner);
      volumes.set(e.preset, v);
    }
    this.volumeData = new Map([...volumes].map(([id, v]) =>
      [id, { data: new Float32Array(v.rows), owner: Int32Array.from(v.owners) }]));
    this.flameData = new Float32Array(flames);
    this.emberData = new Float32Array(embers);
    this.flameOwner = Int32Array.from(flameOwner);
    this.emberOwner = Int32Array.from(emberOwner);
    this.lastStrength = new Float32Array(owners).fill(-1);
    bindInterleaved(this.renderer, this.flames, this.flameData, FLAME_FLOATS,
      [["iPosSeed", 0], ["iShape", 4], ["iParams", 8], ["iAnim", 12], ["iMotion", 16]]);
    bindInterleaved(this.renderer, this.embers, this.emberData, EMBER_FLOATS,
      [["iPosSeed", 0], ["iEmber", 4], ["iParams", 8]]);
    this.flameGeometry.instanceCount = flameOwner.length;
    this.emberGeometry.instanceCount = emberOwner.length;
    this.flames.visible = flameOwner.length > 0;
    this.embers.visible = emberOwner.length > 0;
    if (this.backend === "webgpu") this.rebuildVolumes();
  }

  /** Whether `preset` draws as a volume at the current tier (cards otherwise). */
  private volumeDrawn(preset: FirePresetId): boolean {
    const v = FIRE_PRESETS[preset].volume;
    return v !== undefined && v.steps[this.tier] > 0;
  }

  /**
   * The quality tier of the volume path (the caller maps its band; default
   * high). A change rebuilds the fields (the Jacobi count, the curl size and
   * the presets drawn as volumes are structural) and the card rows.
   */
  setVolumeTier(tier: FireVolumeTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.disposeVolumes();
    this.setEmitters(this.emitterList);
  }

  get volumeTier(): FireVolumeTier { return this.tier; }

  /**
   * Prewarm every built field now (60 solver steps), so the first drawn frame
   * already shows a burning fire. A mount or a harness calls it after
   * `compileAsync`; otherwise a field prewarms at its first step.
   */
  warmVolumes(renderer: WebGPURenderer): void {
    const t = this.uniforms.uTime.value as number;
    for (const v of this.volumes.values()) {
      v.field.warm(renderer, t);
      for (const p of v.privates) p.field.warm(renderer, t);
    }
  }

  private makeFieldDraw(id: FirePresetId, name: string, rows: number): FieldDraw {
    const t = FIRE_VOLUME_TIER_CONFIG[this.tier];
    const c = FIRE_PRESETS[id];
    if (!this.curl) {
      this.curlKey = this.renderer ?? this;
      this.curl = acquireFireCurl(this.curlKey, t.curlN);
    }
    const field = new VolumeFireField({ config: c.volume!, name, curl: this.curl, tier: t,
      steps: c.volume!.steps[this.tier], windResponse: c.windResponse, wind: this.uniforms.uWind });
    const geometry = makeVolumeBox();
    const mesh = new THREE.Mesh(geometry, makeVolumeMaterial(this.uniforms, field));
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    if (this.layer !== undefined) mesh.layers.set(this.layer);
    mesh.userData.esStatic = true; // reads only shared or constant uniforms (render/staticRefresh.ts)
    bindInterleaved(this.renderer, mesh, new Float32Array(rows * VOLUME_FLOATS), VOLUME_FLOATS, [["iPosSeed", 0], ["iBox", 4], ["iAnim", 8]]);
    this.group.add(mesh);
    return { field, mesh };
  }

  /** (Re)build the volume draws from `volumeData` (WebGPU only; fields are kept per preset). */
  private rebuildVolumes(): void {
    if (this.backend !== "webgpu") {
      this.uniforms.uVolumeOn.value = 0;
      return;
    }
    const tier = FIRE_VOLUME_TIER_CONFIG[this.tier];
    this.uniforms.uVolumeReach.value = tier.reachM ?? FIRE_VOLUME_REACH_M;
    for (const id of FIRE_VOLUME_PRESETS) {
      const rows = this.volumeData.get(id);
      let draw = this.volumes.get(id);
      if (!rows || rows.owner.length === 0) {
        if (draw) { draw.mesh.visible = false; for (const p of draw.privates) { p.mesh.visible = false; p.row = -1; } }
        continue;
      }
      if (!draw) {
        const shared = this.makeFieldDraw(id, `fire-volume-${id}`, 0);
        const privates: PrivateDraw[] = [];
        for (let k = 0; k < tier.privateFields; k++) {
          const p = this.makeFieldDraw(id, `fire-volume-${id}-private${k}`, 1);
          const pd: PrivateDraw = { ...p, data: (p.mesh.geometry.getAttribute("iPosSeed") as THREE.InterleavedBufferAttribute)
            .data.array as Float32Array, row: -1 };
          p.mesh.visible = false;
          p.mesh.onBeforeRender = (renderer, _scene, camera) => {
            this.syncDrawState(renderer);
            this.selectPrivate(camera);
            if (pd.row >= 0) pd.field.step(renderer as unknown as WebGPURenderer, this.uniforms.uTime.value as number);
          };
          privates.push(pd);
        }
        const d: VolumeDraw = { ...shared, privates };
        draw = d;
        // step the preset's shared field only when one of its fires is in reach
        shared.mesh.onBeforeRender = (renderer, _scene, camera) => {
          this.syncDrawState(renderer);
          this.selectPrivate(camera);
          const r = this.uniforms.uVolumeReach.value as number;
          const data = this.volumeData.get(id)?.data;
          if (!data) return;
          const cam = this.group.worldToLocal(camera.getWorldPosition(this.scratch));
          for (let i = 0; i < data.length; i += VOLUME_FLOATS) {
            if (data[i + 7] <= 0) continue; // hidden (a private field draws it, or strength 0)
            const dx = data[i] - cam.x, dy = data[i + 1] - cam.y, dz = data[i + 2] - cam.z;
            if (dx * dx + dy * dy + dz * dz < r * r) {
              d.field.step(renderer as unknown as WebGPURenderer, this.uniforms.uTime.value as number);
              return;
            }
          }
        };
        this.volumes.set(id, draw);
      }
      bindInterleaved(this.renderer, draw.mesh, rows.data, VOLUME_FLOATS, [["iPosSeed", 0], ["iBox", 4], ["iAnim", 8]]);
      draw.mesh.geometry.instanceCount = rows.owner.length;
      draw.mesh.visible = true;
      for (const p of draw.privates) { p.row = -1; p.mesh.visible = false; }
    }
    this.selectedAt = Number.NaN;
    this.uniforms.uVolumeOn.value = 1;
    this.writeVolumeIntensity();
  }

  /**
   * Hand the private fields to the nearest volume fires within
   * FIRE_VOLUME_PRIVATE_M of the camera, once per frame (keyed by uTime).
   * A fire with a private field is hidden in its shared draw.
   */
  private selectPrivate(camera: THREE.Camera): void {
    const t = this.uniforms.uTime.value as number;
    if (t === this.selectedAt) return;
    this.selectedAt = t;
    const n = FIRE_VOLUME_TIER_CONFIG[this.tier].privateFields;
    if (n === 0) return;
    const { d2, preset, row } = this.pick;
    d2.fill(Infinity); preset.fill(-1); row.fill(-1);
    const cam = this.group.worldToLocal(camera.getWorldPosition(this.scratch));
    const max2 = FIRE_VOLUME_PRIVATE_M * FIRE_VOLUME_PRIVATE_M;
    for (let pi = 0; pi < FIRE_VOLUME_PRESETS.length; pi++) {
      const rows = this.volumeData.get(FIRE_VOLUME_PRESETS[pi]);
      if (!rows) continue;
      for (let i = 0; i < rows.owner.length; i++) {
        if (this.lastStrength[rows.owner[i]] === 0) continue;
        const o = i * VOLUME_FLOATS;
        const dx = rows.data[o] - cam.x, dy = rows.data[o + 1] - cam.y, dz = rows.data[o + 2] - cam.z;
        const q = dx * dx + dy * dy + dz * dz;
        if (q >= max2) continue;
        for (let k = 0; k < n; k++) {
          if (q < d2[k]) {
            for (let j = n - 1; j > k; j--) { d2[j] = d2[j - 1]; preset[j] = preset[j - 1]; row[j] = row[j - 1]; }
            d2[k] = q; preset[k] = pi; row[k] = i;
            break;
          }
        }
      }
    }
    let changed = false;
    for (let pi = 0; pi < FIRE_VOLUME_PRESETS.length; pi++) {
      const draw = this.volumes.get(FIRE_VOLUME_PRESETS[pi]);
      if (!draw) continue;
      let slot = 0;
      for (let k = 0; k < n; k++) {
        if (preset[k] !== pi || slot >= draw.privates.length) continue;
        const p = draw.privates[slot++];
        if (p.row === row[k]) continue;
        p.row = row[k];
        const seed = this.volumeData.get(FIRE_VOLUME_PRESETS[pi])!.data[row[k] * VOLUME_FLOATS + 3];
        (p.field.u.seedOffset.value as THREE.Vector3).set((seed * 0.618) % 1, (seed * 0.371 + 0.5) % 1, (seed * 0.293) % 1);
        changed = true;
      }
      for (; slot < draw.privates.length; slot++) {
        if (draw.privates[slot].row !== -1) { draw.privates[slot].row = -1; changed = true; }
      }
    }
    if (changed) this.writeVolumeIntensity();
  }

  private writeVolumeIntensity(): void {
    for (const [id, draw] of this.volumes) {
      const rows = this.volumeData.get(id);
      if (!rows) continue;
      for (let i = 0; i < rows.owner.length; i++) {
        const s = this.lastStrength[rows.owner[i]];
        rows.data[i * VOLUME_FLOATS + 7] = s < 0 ? 1 : s;
      }
      for (const p of draw.privates) {
        p.mesh.visible = p.row >= 0 && p.row < rows.owner.length;
        if (!p.mesh.visible) continue;
        p.data.set(rows.data.subarray(p.row * VOLUME_FLOATS, (p.row + 1) * VOLUME_FLOATS));
        rows.data[p.row * VOLUME_FLOATS + 7] = 0; // drawn by its private field
        p.mesh.geometry.instanceCount = 1;
        (p.mesh.geometry.getAttribute("iBox") as THREE.InterleavedBufferAttribute).data.needsUpdate = true;
      }
      const attribute = draw.mesh.geometry.getAttribute("iBox") as THREE.InterleavedBufferAttribute | undefined;
      if (attribute) attribute.data.needsUpdate = true;
    }
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
    this.writeVolumeIntensity();
  }

  dispose(): void {
    this.group.removeFromParent();
    deferDispose(this.renderer, this.flameGeometry);
    deferDispose(this.renderer, this.emberGeometry);
    (this.flames.material as THREE.Material).dispose();
    (this.embers.material as THREE.Material).dispose();
    this.disposeVolumes();
    this.releaseCurl();
  }

  private releaseCurl(): void {
    if (this.curl && this.curlKey) releaseFireCurl(this.curlKey, this.curl);
    this.curl = null;
    this.curlKey = null;
  }

  private disposeVolumes(): void {
    for (const v of this.volumes.values()) {
      for (const d of [v, ...v.privates]) {
        d.mesh.removeFromParent();
        deferDispose(this.renderer, d.mesh.geometry);
        (d.mesh.material as THREE.Material).dispose();
        d.field.dispose();
      }
    }
    this.volumes.clear();
    if (this.curl && this.curl.image.width !== FIRE_VOLUME_TIER_CONFIG[this.tier].curlN) this.releaseCurl();
  }
}

/**
 * Point `mesh` at a NEW geometry carrying `data` as its instance rows (the
 * quad or box index and attributes CLONED, never shared), and dispose the old
 * one. Sharing them broke WebGPU: the old geometry's dispose handler deletes
 * every attribute in its render object's list, so shared index/position/uv
 * buffers were destroyed under the live geometry ("[Buffer] used in submit
 * while destroyed" 4440x, blank main scene; vol-diag1 row 1). Never new
 * attributes on the same geometry: three's render objects cache a geometry's
 * attribute list and detect a swapped attribute by its `id`, which an
 * InterleavedBufferAttribute does not have, and the dispose handler re-reads
 * the OLD list into that cache; so a rebind on the same geometry drew the
 * previous rows' buffer with the new instance count, and on WebGPU the
 * overrun invalidated the whole pass (walk 9 pod run: 54 rows bound, 60
 * drawn, everything in renderContext_4 gone for the frame). Disposing the old
 * geometry frees its buffers (review 2026-09-30: a rebind without it leaked).
 */
function bindInterleaved(renderer: object | null, mesh: THREE.Mesh<THREE.InstancedBufferGeometry>, data: Float32Array, stride: number,
  columns: [string, number][]): void {
  const old = mesh.geometry;
  const geometry = new THREE.InstancedBufferGeometry();
  if (old.index) geometry.setIndex(old.index.clone());
  for (const [name, attribute] of Object.entries(old.attributes)) {
    if (!(attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
      geometry.setAttribute(name, (attribute as THREE.BufferAttribute).clone());
    }
  }
  const buffer = new THREE.InstancedInterleavedBuffer(data, stride, 1);
  buffer.setUsage(THREE.DynamicDrawUsage);
  for (const [name, offset] of columns) {
    geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, 4, offset));
  }
  geometry.instanceCount = old.instanceCount;
  if (old.boundingSphere) geometry.boundingSphere = old.boundingSphere.clone();
  if (old.boundingBox) geometry.boundingBox = old.boundingBox.clone();
  mesh.geometry = geometry;
  tagGeometryBuffers(geometry, mesh.name);
  deferDispose(renderer, old); // never mid-pass: a draw already encoded may hold its buffers
}

function markDirty(geometry: THREE.InstancedBufferGeometry): void {
  const attribute = geometry.getAttribute("iParams") as THREE.InterleavedBufferAttribute | undefined;
  if (attribute) attribute.data.needsUpdate = true;
}
