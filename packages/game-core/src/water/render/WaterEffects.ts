import type { Vec3, WaterInteractionEvent, WorldWaterQuery } from "@elder-souls/contracts";
import {
  Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, Vector2,
  Sphere, Vector3, type Frustum, type ColorRepresentation, type Texture,
} from "three";
import { WaterCrowns } from "./WaterCrowns";
import { waterParticleRadiance } from "./waterParticleLighting";
import { PARTICLE_FOAM_GLSL } from "./particleFoam";
import { waterSourceDistanceSquared } from "./WaterCascadeSources";

export interface WaterEffectsOptions {
  maxParticles?: number;
  maxDistanceM?: number;
  /** The shared post-water particle pass uses layer 5. */
  layer?: number;
  seed?: number;
  /** Surface ripple input only. Reentry events are rejected by emit(). */
  onReentry?: (event: WaterInteractionEvent) => void;
}

export interface WaterEmissionOptions {
  /** 0–1 aerated mist fraction; continuous cascade/plunge sources use this. */
  mist?: number;
  /** Validated cascade lip; event.position remains the physical wet plunge. */
  fallFrom?: Vec3;
}

interface Burst { event: WaterInteractionEvent; mist: number; continuous: boolean; fallFrom?: Vec3 }
const particleKinds = ["spray", "mist", "foam", "spray"] as const;
type ParticleCounts = Record<typeof particleKinds[number] | "crown", number>;
const counts = (): ParticleCounts => ({ spray: 0, mist: 0, foam: 0, crown: 0 });
export interface WaterEffectsDiagnostics {
  received: number; queued: number; spawned: ParticleCounts; active: ParticleCounts;
  /** In-frustum, nonzero-alpha candidates; opaque-depth occlusion remains a GPU decision. */
  visibleCandidates: ParticleCounts; submittedInstances: number; pending: number;
  eventsByKind: Record<WaterInteractionEvent["kind"], number>;
  suppressed: Record<string, number>;
  illumination: { radiance: Vec3; exposure: number; exposedLinear: Vec3; visibility: number };
}
interface Particle {
  position: Vec3;
  velocity: Vec3;
  age: number;
  life: number;
  size: number;
  /** 0 droplet, 1 mist, 2 floating foam. */
  kind: number;
  opacity: number;
  phase: number;
  bodyId: string;
  reentry: boolean;
  priority: number;
  plunge?: Vec3;
  sheetSpray?: boolean;
}

const REENTRY_ACTOR = "water-fx.reentry";
const MAX_PENDING = 64;
const MAX_SOURCES = 64;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
const validVector = (v: Vec3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);


/** Converts a gameplay impulse into bounded visual energy, independent of mass units. */
export function waterEmissionProfile(event: WaterInteractionEvent) {
  const radius = clamp(finite(event.radius, 0.4), 0.025, 4);
  const velocity = event.velocity;
  const speed = velocity && validVector(velocity) ? Math.hypot(velocity.x, velocity.y, velocity.z) : 1;
  const energy = clamp(Math.sqrt(Math.max(0, finite(event.magnitude, speed * 12)) / 35), 0, 3);
  const wake = event.kind === "wake";
  const exit = event.kind === "exit";
  const suppressed = event.kind === "submerge" || energy < 0.03;
  // Wading sheds little spray; a plunging body ejects a crown and fine mist.
  const lift = clamp((wake ? 0.15 + speed * 0.1 : 0.6 + energy * 1.4) * (exit ? 0.45 : 1), 0.15, 5);
  const count = suppressed ? 0 : Math.ceil(clamp((wake ? 3 : exit ? 5 : 10) * energy * Math.sqrt(radius / 0.4), 1, 72));
  return { radius, energy, lift, count, wake, exit };
}

/**
 * Local water spray, mist and advected surface foam. One bounded instanced draw;
 * no render-target allocation, React dependency, physics ownership or global state.
 * Particle time is real seconds; epochMinutes is only for the shared water query.
 */
export class WaterEffects {
  readonly object3d: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly capacity: number;
  private readonly maxDistance: number;
  private readonly particles: Particle[] = [];
  private readonly pending: Burst[] = [];
  private readonly sources = new Map<string, { fraction: number; lastTime: number }>();
  private readonly offsets: InstancedBufferAttribute;
  private readonly appearance: InstancedBufferAttribute;
  private readonly onReentry?: WaterEffectsOptions["onReentry"];
  private randomState: number;
  private time = 0;
  private disposed = false;
  private suspended = false;
  private frustum?: Frustum;
  private viewScale = 1;
  private sphere = new Sphere(new Vector3(), 1);
  private readonly crowns: WaterCrowns;
  private stats: WaterEffectsDiagnostics = { received: 0, queued: 0, spawned: counts(), active: counts(),
    visibleCandidates: counts(), submittedInstances: 0, pending: 0,
    eventsByKind: { enter: 0, exit: 0, wake: 0, splash: 0, submerge: 0 }, suppressed: {},
    illumination: { radiance: { x: 0.5, y: 0.55, z: 0.6 }, exposure: 1, exposedLinear: { x: 0.5, y: 0.55, z: 0.6 }, visibility: 1 } };

  constructor(options: WaterEffectsOptions = {}) {
    this.capacity = clamp(Math.floor(finite(options.maxParticles, 768)), 1, 4096);
    this.maxDistance = clamp(finite(options.maxDistanceM, 100), 2, 300);
    this.randomState = (finite(options.seed, 19237) >>> 0) || 1;
    this.onReentry = options.onReentry;
    const plane = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.setIndex(plane.index!.clone());
    geometry.setAttribute("position", plane.attributes.position.clone());
    geometry.setAttribute("uv", plane.attributes.uv.clone());
    plane.dispose();
    this.offsets = new InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3).setUsage(DynamicDrawUsage);
    this.appearance = new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4).setUsage(DynamicDrawUsage);
    geometry.setAttribute("particlePosition", this.offsets);
    geometry.setAttribute("particleStyle", this.appearance);
    geometry.instanceCount = 0;
    const material = new ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: DoubleSide,
      uniforms: {
        sceneDepth: { value: null }, hasDepth: { value: 0 },
        cameraNear: { value: 0.1 }, cameraFar: { value: 2000 },
        resolution: { value: new Vector2(1, 1) }, lightColor: { value: new Color(0.5, 0.55, 0.6) },
        lightVisibility: { value: 1 },
      },
      vertexShader: /* glsl */`
        attribute vec3 particlePosition;
        attribute vec4 particleStyle;
        varying vec2 vUv;
        varying vec3 vStyle;
        varying float vViewDepth;
        void main() {
          vUv = uv;
          vStyle = particleStyle.yzw;
          vec4 centre = modelViewMatrix * vec4(particlePosition, 1.0);
          vec2 corner = position.xy * particleStyle.x;
          if (particleStyle.z > 1.5 && particleStyle.z < 2.5) {
            // Foam lives on the water, never on a camera-facing billboard.
            centre += modelViewMatrix * vec4(corner.x, 0.0, corner.y, 0.0);
          } else {
            centre.xy += corner;
          }
          vViewDepth = -centre.z;
          gl_Position = projectionMatrix * centre;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D sceneDepth;
        uniform float hasDepth;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform vec2 resolution;
        uniform vec3 lightColor;
        uniform float lightVisibility;
        varying vec2 vUv;
        varying vec3 vStyle;
        varying float vViewDepth;
        ${PARTICLE_FOAM_GLSL}
        float linearDepth(float depth) {
          return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
        }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r2 = dot(p, p);
          float kind = vStyle.y;
          float edge = 1.0 - smoothstep(0.25, 1.0, r2);
          float shape = edge;
          if (kind > 1.5 && kind < 2.5) {
            // Several tiny bubble groups, advected as a patch; no solid white discs.
            shape *= esParticleFoam(p, vStyle.z);
          } else if (kind > 0.5 && kind < 1.5) {
            shape *= exp(-r2 * 2.3) * (0.75 + 0.25 * sin(p.x * 7.0 + vStyle.z) * sin(p.y * 6.0 - vStyle.z));
          } else {
            shape *= 0.55 + 0.45 * pow(max(0.0, 1.0 - length(p + vec2(0.25, -0.3))), 3.0);
          }
          float soft = 1.0;
          if (hasDepth > 0.5) {
            float sceneZ = linearDepth(texture2D(sceneDepth, gl_FragCoord.xy / resolution).r);
            soft = clamp((sceneZ - vViewDepth) / (kind > 0.5 && kind < 1.5 ? 0.8 : 0.12), 0.0, 1.0);
          }
          float alpha = shape * vStyle.x * soft * lightVisibility;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(lightColor, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.object3d = new Mesh(geometry, material);
    this.object3d.name = "water-interaction-effects";
    this.object3d.frustumCulled = false;
    this.object3d.layers.set(options.layer ?? 5);
    this.object3d.renderOrder = 3;
    this.crowns = new WaterCrowns(material.uniforms, options.layer ?? 5);
    this.object3d.add(this.crowns.mesh);
  }

  get activeCount(): number { return this.particles.length; }
  get pendingCount(): number { return this.pending.length; }
  get diagnostics(): WaterEffectsDiagnostics { return { ...this.stats, pending: this.pending.length,
    spawned: { ...this.stats.spawned }, active: { ...this.stats.active }, visibleCandidates: { ...this.stats.visibleCandidates },
    eventsByKind: { ...this.stats.eventsByKind }, suppressed: { ...this.stats.suppressed },
    illumination: { ...this.stats.illumination, radiance: { ...this.stats.illumination.radiance }, exposedLinear: { ...this.stats.illumination.exposedLinear } } }; }
  setView(frustum?: Frustum, verticalScale = 1): void { this.frustum = frustum; this.viewScale = verticalScale; }
  private suppress(reason: string, count = 1): void { this.stats.suppressed[reason] = (this.stats.suppressed[reason] ?? 0) + count; }

  /** Copies the event: callers may safely reuse their physics scratch vectors. */
  emit(event: WaterInteractionEvent, options: WaterEmissionOptions = {}): void {
    this.queue(event, options, false);
  }

  private queue(event: WaterInteractionEvent, options: WaterEmissionOptions, continuous: boolean): void {
    this.stats.received++; this.stats.eventsByKind[event.kind]++;
    if (this.disposed) { this.suppress("disposed"); return; }
    if (this.suspended) { this.suppress('suspended'); return; }
    if (event.actorId === REENTRY_ACTOR) { this.suppress("reentry"); return; }
    if (!validVector(event.position)) { this.suppress("invalidPosition"); return; }
    if (event.kind === "submerge") { this.suppress("submerge"); return; }
    if (this.pending.length >= MAX_PENDING) { this.suppress("queueFull"); return; }
    this.pending.push({
      event: { ...event, position: { ...event.position }, velocity: event.velocity && validVector(event.velocity) ? { ...event.velocity } : undefined,
        waterVelocity: event.waterVelocity && validVector(event.waterVelocity) ? { ...event.waterVelocity } : undefined,
        sheetContact: event.sheetContact ? { ...event.sheetContact, normal: { ...event.sheetContact.normal } } : undefined },
      mist: clamp(finite(options.mist, 0), 0, 1),
      continuous,
      fallFrom: options.fallFrom && validVector(options.fallFrom) ? { ...options.fallFrom } : undefined,
    });
    this.stats.queued++;
  }

  /** Rate means bursts/second. Fractional accumulation makes sources frame-rate independent. */
  emitContinuous(id: string, event: WaterInteractionEvent, ratePerSecond: number, dt: number, options?: WaterEmissionOptions): void {
    if (this.disposed || !Number.isFinite(ratePerSecond) || ratePerSecond <= 0 || !Number.isFinite(dt) || dt <= 0) return;
    let source = this.sources.get(id);
    if (!source) {
      if (this.sources.size >= MAX_SOURCES) { this.suppress("sourceLimit"); return; }
      source = { fraction: 0, lastTime: this.time };
      this.sources.set(id, source);
    }
    source.lastTime = this.time;
    source.fraction += Math.min(ratePerSecond, 30) * Math.min(dt, 0.1);
    const count = Math.floor(source.fraction + 1e-9);
    source.fraction = Math.max(0, source.fraction - count);
    for (let i = 0; i < count; i++) this.queue(event, options ?? {}, true);
  }

  setDepth(texture: Texture | null, near: number, far: number, width: number, height: number): void {
    const u = this.object3d.material.uniforms;
    u.sceneDepth.value = texture;
    u.hasDepth.value = texture && near > 0 && far > near ? 1 : 0;
    u.cameraNear.value = near;
    u.cameraFar.value = far;
    u.resolution.value.set(Math.max(1, width), Math.max(1, height));
  }

  /** Explicit tab/canvas lifecycle, not inferred from a slow rendered frame. */
  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.particles.length = 0; this.pending.length = 0; this.sources.clear();
    this.crowns.clear(); this.object3d.geometry.instanceCount = 0;
    this.stats.active = counts(); this.stats.visibleCandidates = counts(); this.stats.submittedInstances = 0;
  }

  /** Inject the same sky/sun/moon illumination used by the water foam. */
  setLighting(color: ColorRepresentation): void { this.object3d.material.uniforms.lightColor.value.set(color); }
  setIllumination(ambient: Vec3, direct: Vec3, sunY: number, exposure: number): void {
    const lighting = this.stats.illumination;
    const c = waterParticleRadiance(ambient, direct, sunY, lighting.radiance);
    this.object3d.material.uniforms.lightColor.value.setRGB(c.x, c.y, c.z);
    lighting.exposure = exposure;
    lighting.exposedLinear.x = c.x * exposure;
    lighting.exposedLinear.y = c.y * exposure;
    lighting.exposedLinear.z = c.z * exposure;
    // Near-unlit transparent spray must transmit its background rather than
    // become opaque black dust. No emissive colour floor is introduced.
    const luminance = lighting.exposedLinear.x * 0.2126 + lighting.exposedLinear.y * 0.7152 + lighting.exposedLinear.z * 0.0722;
    lighting.visibility = clamp(luminance / 0.008, 0, 1);
    this.object3d.material.uniforms.lightVisibility.value = lighting.visibility;
  }

  update(dt: number, time: number, query: WorldWaterQuery, epochMinutes: number, camera: Vec3, wind?: Vec3): void {
    if (this.disposed || this.suspended || !validVector(camera) || !Number.isFinite(dt) || dt < 0) return;
    this.time = finite(time, this.time + dt);
    for (const [id, source] of this.sources) if (this.time - source.lastTime > 2) this.sources.delete(id);
    const cameraWater = query.sample(camera, epochMinutes);
    const underwater = cameraWater.waterBodyId !== null && camera.y < cameraWater.surfaceHeight - 0.08;
    this.object3d.visible = !underwater;
    // Expire old spray across long gaps, but preserve contacts freshly queued
    // by the current frame's bounded physics steps. Hidden tabs are handled
    // explicitly by setSuspended, not by guessing from frame duration.
    if (dt > 0.5 || underwater) {
      if (underwater) { this.suppress("cameraUnderwater", this.pending.length); this.pending.length = 0; }
      this.particles.length = 0;
      this.crowns.clear();
    }
    const step = Math.min(dt, 0.1);
    const wx = wind && validVector(wind) ? wind.x : 0;
    const wz = wind && validVector(wind) ? wind.z : 0;
    let write = 0;
    let reentries = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const oldY = p.position.y;
      const drag = p.kind === 1 ? 1.6 : p.kind === 2 ? 0 : 0.18;
      const windBlend = 1 - Math.exp(-drag * step);
      p.velocity.x += (wx - p.velocity.x) * windBlend;
      p.velocity.z += (wz - p.velocity.z) * windBlend;
      if (p.kind === 0 || p.kind === 3) p.velocity.y -= 9.81 * step;
      p.position.x += p.velocity.x * step;
      p.position.y += p.velocity.y * step;
      p.position.z += p.velocity.z * step;
      if (Math.hypot(p.position.x - camera.x, p.position.z - camera.z) > this.maxDistance) continue;
      const water = query.sample(p.position, epochMinutes);
      // Free-falling aerated spray can cross an air gap above the dry face.
      // Only explicitly compiled lip→wet-plunge trajectories receive this;
      // arbitrary gameplay impacts still require a wet emission position.
      const airborneSheet = p.sheetSpray && (!water.waterBodyId || water.depth <= 0.015 || p.position.y > water.surfaceHeight + 0.015);
      const airborneFall = airborneSheet || (p.kind === 3 && p.plunge && p.position.y > p.plunge.y + 0.04);
      if (p.sheetSpray && !airborneSheet && water.waterBodyId) { p.bodyId = water.waterBodyId; p.sheetSpray = false; }
      if (!airborneFall && (water.waterBodyId !== p.bodyId || water.depth <= 0.015)) continue;
      if (p.kind === 2) {
        p.position.y = water.surfaceHeight + 0.025;
        const blend = 1 - Math.exp(-step * 3);
        p.velocity.x += (water.flowVelocity.x - p.velocity.x) * blend;
        p.velocity.z += (water.flowVelocity.z - p.velocity.z) * blend;
      } else if (!airborneFall && (p.kind === 0 || p.kind === 3) && p.velocity.y < 0 && p.position.y <= water.surfaceHeight + 0.015) {
        if (p.reentry && oldY >= water.surfaceHeight && reentries < 4) {
          this.onReentry?.({ kind: "splash", actorId: REENTRY_ACTOR,
            position: { x: p.position.x, y: water.surfaceHeight, z: p.position.z },
            velocity: { ...p.velocity }, radius: clamp(p.size * 2, 0.025, 0.12), magnitude: 0.15 });
          reentries++;
        }
        // Droplets become tiny bubbles once; they cannot spawn more spray.
        p.kind = 2; p.position.y = water.surfaceHeight + 0.025;
        p.velocity.y = 0; p.age = 0; p.life = 0.4 + this.random() * 0.5;
        p.size *= 2.5; p.opacity *= 0.45; p.reentry = false;
      } else if (!airborneFall && p.position.y < water.surfaceHeight - 0.1) continue;
      this.particles[write++] = p;
    }
    this.particles.length = write;
    // Events were produced during this frame's physics callbacks, after the
    // elapsed interval. Advance old state first; newborns get their complete
    // lifetime and are never ballistically advanced through preceding time.
    this.crowns.update(dt, query, epochMinutes, camera, this.frustum, this.viewScale);
    while (this.pending.length) this.spawn(this.pending.shift()!, query, epochMinutes, camera);
    write = this.particles.length;
    // Alpha sprites are drawn back-to-front; bounded sort, no per-particle draw calls.
    this.particles.sort((a, b) => this.distanceSq(b.position, camera) - this.distanceSq(a.position, camera));
    this.stats.active = counts(); this.stats.visibleCandidates = counts();
    for (let i = 0; i < write; i++) {
      const p = this.particles[i];
      const age = p.age / p.life;
      // Emission is already a physical contact: publish a finite first-frame
      // silhouette without borrowing time from its lifetime for a fade-in.
      const fade = Math.min(1, 0.25 + p.age / 0.04) * Math.pow(1 - age, p.kind === 1 ? 1.3 : 0.7);
      const distanceFade = clamp((this.maxDistance - Math.sqrt(this.distanceSq(p.position, camera))) / (this.maxDistance * 0.25), 0, 1);
      this.offsets.setXYZ(i, p.position.x, p.position.y, p.position.z);
      this.appearance.setXYZW(i, p.size * (1 + age * (p.kind === 1 ? 1.8 : p.kind === 2 ? 0.6 : 0)), p.opacity * fade * distanceFade, p.kind, p.phase);
      const kind = particleKinds[p.kind];
      this.stats.active[kind]++;
      this.sphere.center.set(p.position.x, p.position.y * this.viewScale, p.position.z);
      this.sphere.radius = this.appearance.getX(i) * Math.max(1, this.viewScale);
      if (p.opacity * fade * distanceFade * this.stats.illumination.visibility > 0.003 && (!this.frustum || this.frustum.intersectsSphere(this.sphere))) this.stats.visibleCandidates[kind]++;
    }
    this.offsets.needsUpdate = true;
    this.appearance.needsUpdate = true;
    this.object3d.geometry.instanceCount = write;
    this.stats.submittedInstances = write;
    this.crowns.update(0, query, epochMinutes, camera, this.frustum, this.viewScale);
    this.stats.spawned.crown = this.crowns.spawned;
    this.stats.active.crown = this.crowns.activeCount;
    this.stats.visibleCandidates.crown = this.stats.illumination.visibility > 0.01 ? this.crowns.visibleCandidates : 0;
    this.stats.submittedInstances += this.crowns.activeCount;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.particles.length = 0; this.pending.length = 0; this.sources.clear();
    this.object3d.removeFromParent();
    this.object3d.geometry.dispose(); this.object3d.material.dispose();
    this.crowns.dispose();
  }

  private spawn(burst: Burst, query: WorldWaterQuery, epoch: number, camera: Vec3): void {
    const { event, mist, fallFrom } = burst;
    const profile = waterEmissionProfile(event);
    if (profile.count === 0) { this.suppress("zeroEnergy"); return; }
    const nearPlunge = this.distanceSq(event.position, camera) <= this.maxDistance * this.maxDistance;
    if (!nearPlunge && waterSourceDistanceSquared(camera, event.position, fallFrom) > this.maxDistance * this.maxDistance) {
      this.suppress("distance"); return;
    }
    const sheet = event.sheetContact;
    if (sheet && (!sheet.waterBodyId || !validVector(sheet.normal) || Math.hypot(sheet.normal.x, sheet.normal.y, sheet.normal.z) < 0.1)) {
      this.suppress("invalidSheetContact"); return;
    }
    const queried = query.sample(event.position, epoch);
    const current = event.waterVelocity && validVector(event.waterVelocity) ? event.waterVelocity : queried.flowVelocity;
    const water = sheet ? { ...queried, waterBodyId: sheet.waterBodyId, surfaceHeight: event.position.y, depth: 1 } : queried;
    if (!sheet && (!water.waterBodyId || water.depth <= 0.015)) { this.suppress("dryQuery"); return; }
    if (!sheet && event.position.y < water.surfaceHeight - Math.max(0.5, profile.radius)) { this.suppress("belowSurface"); return; }
    // Impacts must meet the actual surface, not splash remotely from mid-air.
    if (!sheet && event.position.y > water.surfaceHeight + Math.max(1, profile.radius)) { this.suppress("aboveSurface"); return; }
    const relativeX = (event.velocity?.x ?? 0) - current.x;
    const relativeZ = (event.velocity?.z ?? 0) - current.z;
    const sheetNormal = sheet ? new Vector3(sheet.normal.x, sheet.normal.y, sheet.normal.z).normalize() : null;
    const sheetTangent = sheetNormal ? new Vector3(Math.abs(sheetNormal.y) < 0.9 ? 0 : 1, Math.abs(sheetNormal.y) < 0.9 ? 1 : 0, 0).cross(sheetNormal).normalize() : null;
    const sheetBitangent = sheetNormal ? new Vector3().crossVectors(sheetNormal, sheetTangent!) : null;
    const angle = Math.atan2(relativeZ, relativeX);
    const downward = Math.max(0, -(event.velocity?.y ?? 0));
    if (!sheet && nearPlunge && !burst.continuous && !profile.wake && !profile.exit && downward > 0.8 && profile.radius > 0.15 && profile.energy > 0.7) {
      this.crowns.emit({ ...event.position, y: water.surfaceHeight }, water.waterBodyId!, profile.radius, profile.lift, this.random() * 100);
    }
    const aeration = Math.max(mist, clamp((downward - 2.5) / 8, 0, 0.6));
    const priority = burst.continuous ? 0 : event.actorId === "actor.player" ? 2 : 1;
    // A nearby plunge source must not occupy every slot and hide the player's
    // next jump. Replace only lower-priority ambient particles, never grow the pool.
    let needed = profile.count - (this.capacity - this.particles.length);
    for (let i = this.particles.length - 1; i >= 0 && needed > 0; i--) if (this.particles[i].priority < priority) {
      this.particles.splice(i, 1); needed--; this.suppress("ambientReplaced");
    }
    const count = Math.min(profile.count, this.capacity - this.particles.length);
    if (count < profile.count) this.suppress("particleLimit", profile.count - count);
    for (let i = 0; i < count; i++) {
      const falling = fallFrom && fallFrom.y > water.surfaceHeight + 0.5 && (!nearPlunge || i % 4 === 0);
      const kind = falling ? 3 : this.random() < aeration * 0.4 ? 1 : !sheet && this.random() < (profile.wake ? 0.75 : 0.25) ? 2 : 0;
      // Wake spray leaves the two sides of a moving hull/foot, not random forward jets.
      const theta = profile.wake ? angle + (i % 2 ? 1 : -1) * (1.5 + this.random() * 0.5) : this.random() * Math.PI * 2;
      const spread = profile.radius * (0.25 + this.random() * 0.65);
      const x = event.position.x + Math.cos(theta) * spread;
      const z = event.position.z + Math.sin(theta) * spread;
      const surface = sheet ? water : query.sample({ x, y: water.surfaceHeight, z }, epoch);
      if (!sheet && (surface.waterBodyId !== water.waterBodyId || surface.depth <= 0.015)) { this.suppress("shoreSpread"); continue; }
      const speed = profile.lift * (0.2 + this.random() * 0.35);
      const particle: Particle = {
        position: { x, y: surface.surfaceHeight + (kind === 2 ? 0.025 : 0.04), z },
        velocity: {
          x: current.x + Math.cos(theta) * speed + relativeX * (profile.wake ? -0.08 : 0.15),
          y: kind === 2 ? 0 : kind === 1 ? 0.15 + profile.energy * 0.12 : profile.lift * (0.6 + this.random() * 0.6),
          z: current.z + Math.sin(theta) * speed + relativeZ * (profile.wake ? -0.08 : 0.15),
        },
        age: 0, life: kind === 1 ? 1.3 + this.random() * 1.3 : kind === 2 ? 1 + this.random() * 2 : 0.5 + profile.lift * 0.24,
        size: kind === 1 ? profile.radius * (0.5 + this.random()) : kind === 2 ? 0.07 + profile.radius * (0.2 + this.random() * 0.45) : 0.015 + this.random() * 0.035 * Math.min(profile.energy, 1.6),
        opacity: kind === 1 ? 0.13 : kind === 2 ? 0.34 : 0.65,
        kind, phase: this.random() * 100, bodyId: water.waterBodyId!,
        reentry: kind === 0 && i % 5 === 0, priority,
      };
      if (sheet) {
        const normal = sheetNormal!, tangent = sheetTangent!, bitangent = sheetBitangent!;
        const du = Math.cos(theta) * spread, dv = Math.sin(theta) * spread;
        particle.position = { x: event.position.x + tangent.x * du + bitangent.x * dv,
          y: event.position.y + tangent.y * du + bitangent.y * dv, z: event.position.z + tangent.z * du + bitangent.z * dv };
        const side = Math.sign(-(normal.x * relativeX + normal.y * ((event.velocity?.y ?? 0) - current.y) + normal.z * relativeZ)) || 1;
        particle.velocity = { x: current.x * 0.35 + normal.x * speed * side + tangent.x * speed * Math.cos(theta) * 0.3,
          y: current.y * 0.35 + normal.y * speed * side + 0.3 + bitangent.y * speed * Math.sin(theta) * 0.3,
          z: current.z * 0.35 + normal.z * speed * side + tangent.z * speed * Math.cos(theta) * 0.3 };
        particle.sheetSpray = true;
      }
      if (falling) {
        const flight = Math.sqrt(2 * (fallFrom.y - surface.surfaceHeight) / 9.81);
        const elapsed = this.random() * flight * 0.8;
        const vx = (x - fallFrom.x) / flight, vz = (z - fallFrom.z) / flight;
        particle.position = { x: fallFrom.x + vx * elapsed,
          y: fallFrom.y - 0.5 * 9.81 * elapsed * elapsed, z: fallFrom.z + vz * elapsed };
        particle.velocity = { x: vx, y: -9.81 * elapsed, z: vz };
        particle.life = flight - elapsed + 0.15; particle.size = 0.035 + this.random() * 0.07;
        particle.plunge = { x, y: surface.surfaceHeight, z };
      }
      this.particles.push(particle);
      this.stats.spawned[particleKinds[kind]]++;
    }
  }

  private random(): number {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  private distanceSq(a: Vec3, b: Vec3): number {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
  }
}
