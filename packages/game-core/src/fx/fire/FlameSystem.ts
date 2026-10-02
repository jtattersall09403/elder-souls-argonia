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
 * preset with a `volume` block also draws its fires as raymarched boxes
 * (volumeFire.ts, one draw and one shared simulated field per preset), and
 * its cards yield to them within `FIRE_VOLUME_REACH_M`. The backend is read
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
  FIRE_BED_PRESETS, FIRE_PRESETS, FIRE_PRESET_ORDER, FIRE_VOLUME_PRESETS, nightShareOfExposure,
  type FirePresetId,
} from "./fireTypes";
import {
  makeEmberMaterial, makeFireUniforms, makeFlameMaterial, makeFlameQuad, type FireUniforms,
} from "./flameMaterial";
import { makeVolumeBox, makeVolumeDetail, makeVolumeMaterial, VolumeFireField } from "./volumeFire";

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

/** One preset's volume draw (WebGPU only). */
interface VolumeDraw {
  field: VolumeFireField;
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry>;
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
  /** The detail noise every preset's field shares (made with the first volume draw). */
  private volumeDetail: THREE.Data3DTexture | null = null;
  private readonly scratch = new THREE.Vector3();

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
          c.flicker.rateHz, c.flicker.amount, c.windResponse, c.volume ? 1 : 0,
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
      if (!c.volume) continue;
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
    bindInterleaved(this.flames, this.flameData, FLAME_FLOATS,
      [["iPosSeed", 0], ["iShape", 4], ["iParams", 8], ["iAnim", 12], ["iMotion", 16]]);
    bindInterleaved(this.embers, this.emberData, EMBER_FLOATS,
      [["iPosSeed", 0], ["iEmber", 4], ["iParams", 8]]);
    this.flameGeometry.instanceCount = flameOwner.length;
    this.emberGeometry.instanceCount = emberOwner.length;
    this.flames.visible = flameOwner.length > 0;
    this.embers.visible = emberOwner.length > 0;
    if (this.backend === "webgpu") this.rebuildVolumes();
  }

  /** (Re)build the volume draws from `volumeData` (WebGPU only; fields are kept per preset). */
  private rebuildVolumes(): void {
    if (this.backend !== "webgpu") {
      this.uniforms.uVolumeOn.value = 0;
      return;
    }
    for (const id of FIRE_VOLUME_PRESETS) {
      const rows = this.volumeData.get(id);
      let draw = this.volumes.get(id);
      if (!rows || rows.owner.length === 0) {
        if (draw) draw.mesh.visible = false;
        continue;
      }
      if (!draw) {
        this.volumeDetail ??= makeVolumeDetail();
        const field = new VolumeFireField(FIRE_PRESETS[id].volume!, `fire-volume-${id}`, this.volumeDetail);
        const mesh = new THREE.Mesh(makeVolumeBox(), makeVolumeMaterial(this.uniforms, field));
        mesh.name = `fire-volume-${id}`;
        mesh.frustumCulled = false;
        mesh.renderOrder = -1;
        if (this.layer !== undefined) mesh.layers.set(this.layer);
        mesh.userData.esStatic = true; // reads only shared or constant uniforms (render/staticRefresh.ts)
        draw = { field, mesh };
        const d = draw;
        // step the preset's shared field only when one of its fires is in reach
        mesh.onBeforeRender = (renderer, _scene, camera) => {
          this.syncDrawState(renderer);
          const r = this.uniforms.uVolumeReach.value as number;
          const data = this.volumeData.get(id)?.data;
          if (!data) return;
          const cam = camera.getWorldPosition(this.scratch);
          for (let i = 0; i < data.length; i += VOLUME_FLOATS) {
            const dx = data[i] - cam.x, dy = data[i + 1] - cam.y, dz = data[i + 2] - cam.z;
            if (dx * dx + dy * dy + dz * dz < r * r) {
              d.field.step(renderer as unknown as WebGPURenderer, this.uniforms.uTime.value as number);
              return;
            }
          }
        };
        this.volumes.set(id, draw);
        this.group.add(mesh);
      }
      bindInterleaved(draw.mesh, rows.data, VOLUME_FLOATS, [["iPosSeed", 0], ["iBox", 4], ["iAnim", 8]]);
      draw.mesh.geometry.instanceCount = rows.owner.length;
      draw.mesh.visible = true;
    }
    this.uniforms.uVolumeOn.value = 1;
    this.writeVolumeIntensity();
  }

  private writeVolumeIntensity(): void {
    for (const [id, draw] of this.volumes) {
      const rows = this.volumeData.get(id);
      if (!rows) continue;
      for (let i = 0; i < rows.owner.length; i++) {
        const s = this.lastStrength[rows.owner[i]];
        rows.data[i * VOLUME_FLOATS + 7] = s < 0 ? 1 : s;
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
    this.flameGeometry.dispose();
    this.emberGeometry.dispose();
    (this.flames.material as THREE.Material).dispose();
    (this.embers.material as THREE.Material).dispose();
    for (const v of this.volumes.values()) {
      v.mesh.geometry.dispose();
      (v.mesh.material as THREE.Material).dispose();
      v.field.dispose();
    }
    this.volumes.clear();
    this.volumeDetail?.dispose();
    this.volumeDetail = null;
  }
}

/**
 * Point `mesh` at a NEW geometry carrying `data` as its instance rows (the
 * quad or box attributes shared), and dispose the old one. Never new
 * attributes on the same geometry: three's render objects cache a geometry's
 * attribute list and detect a swapped attribute by its `id`, which an
 * InterleavedBufferAttribute does not have, and the dispose handler re-reads
 * the OLD list into that cache; so a rebind on the same geometry drew the
 * previous rows' buffer with the new instance count, and on WebGPU the
 * overrun invalidated the whole pass (walk 9 pod run: 54 rows bound, 60
 * drawn, everything in renderContext_4 gone for the frame). Disposing the old
 * geometry frees its buffers (review 2026-09-30: a rebind without it leaked).
 */
function bindInterleaved(mesh: THREE.Mesh<THREE.InstancedBufferGeometry>, data: Float32Array, stride: number,
  columns: [string, number][]): void {
  const old = mesh.geometry;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(old.index);
  for (const [name, attribute] of Object.entries(old.attributes)) {
    if (!(attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) geometry.setAttribute(name, attribute);
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
  old.dispose();
}

function markDirty(geometry: THREE.InstancedBufferGeometry): void {
  const attribute = geometry.getAttribute("iParams") as THREE.InterleavedBufferAttribute | undefined;
  if (attribute) attribute.data.needsUpdate = true;
}
