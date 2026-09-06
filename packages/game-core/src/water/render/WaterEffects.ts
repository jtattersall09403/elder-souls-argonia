import type { Vec3, WaterInteractionEvent, WorldWaterQuery } from "@elder-souls/contracts";
import {
  Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, Vector2,
  type ColorRepresentation, type Texture,
} from "three";

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
}

interface Burst { event: WaterInteractionEvent; mist: number }
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
          if (particleStyle.z > 1.5) {
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
        varying vec2 vUv;
        varying vec3 vStyle;
        varying float vViewDepth;
        float linearDepth(float depth) {
          return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
        }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r2 = dot(p, p);
          float kind = vStyle.y;
          float edge = 1.0 - smoothstep(0.25, 1.0, r2);
          float shape = edge;
          if (kind > 1.5) {
            // Several tiny bubble groups, advected as a patch; no solid white discs.
            vec2 cells = p * 4.0 + vec2(sin(vStyle.z), cos(vStyle.z));
            vec2 bubble = fract(cells) - 0.5;
            float ring = 1.0 - smoothstep(0.018, 0.09, abs(length(bubble) - 0.24));
            float breakup = 0.55 + 0.45 * sin(dot(floor(cells), vec2(17.1, 9.7)) + vStyle.z);
            shape *= ring * smoothstep(0.18, 0.65, breakup);
          } else if (kind > 0.5) {
            shape *= exp(-r2 * 2.3) * (0.75 + 0.25 * sin(p.x * 7.0 + vStyle.z) * sin(p.y * 6.0 - vStyle.z));
          } else {
            shape *= 0.55 + 0.45 * pow(max(0.0, 1.0 - length(p + vec2(0.25, -0.3))), 3.0);
          }
          float soft = 1.0;
          if (hasDepth > 0.5) {
            float sceneZ = linearDepth(texture2D(sceneDepth, gl_FragCoord.xy / resolution).r);
            soft = clamp((sceneZ - vViewDepth) / (kind > 0.5 && kind < 1.5 ? 0.8 : 0.12), 0.0, 1.0);
          }
          float alpha = shape * vStyle.x * soft;
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
  }

  get activeCount(): number { return this.particles.length; }
  get pendingCount(): number { return this.pending.length; }

  /** Copies the event: callers may safely reuse their physics scratch vectors. */
  emit(event: WaterInteractionEvent, options: WaterEmissionOptions = {}): void {
    if (this.disposed || event.actorId === REENTRY_ACTOR || !validVector(event.position) || event.kind === "submerge") return;
    if (this.pending.length >= MAX_PENDING) return;
    this.pending.push({
      event: { ...event, position: { ...event.position }, velocity: event.velocity && validVector(event.velocity) ? { ...event.velocity } : undefined },
      mist: clamp(finite(options.mist, 0), 0, 1),
    });
  }

  /** Rate means bursts/second. Fractional accumulation makes sources frame-rate independent. */
  emitContinuous(id: string, event: WaterInteractionEvent, ratePerSecond: number, dt: number, options?: WaterEmissionOptions): void {
    if (this.disposed || !Number.isFinite(ratePerSecond) || ratePerSecond <= 0 || !Number.isFinite(dt) || dt <= 0) return;
    let source = this.sources.get(id);
    if (!source) {
      if (this.sources.size >= MAX_SOURCES) return;
      source = { fraction: 0, lastTime: this.time };
      this.sources.set(id, source);
    }
    source.lastTime = this.time;
    source.fraction += Math.min(ratePerSecond, 30) * Math.min(dt, 0.1);
    const count = Math.floor(source.fraction + 1e-9);
    source.fraction = Math.max(0, source.fraction - count);
    for (let i = 0; i < count; i++) this.emit(event, options);
  }

  setDepth(texture: Texture | null, near: number, far: number, width: number, height: number): void {
    const u = this.object3d.material.uniforms;
    u.sceneDepth.value = texture;
    u.hasDepth.value = texture && near > 0 && far > near ? 1 : 0;
    u.cameraNear.value = near;
    u.cameraFar.value = far;
    u.resolution.value.set(Math.max(1, width), Math.max(1, height));
  }

  /** Inject the same sky/sun/moon illumination used by the water foam. */
  setLighting(color: ColorRepresentation): void { this.object3d.material.uniforms.lightColor.value.set(color); }

  update(dt: number, time: number, query: WorldWaterQuery, epochMinutes: number, camera: Vec3, wind?: Vec3): void {
    if (this.disposed || !validVector(camera) || !Number.isFinite(dt) || dt < 0) return;
    this.time = finite(time, this.time + dt);
    for (const [id, source] of this.sources) if (this.time - source.lastTime > 2) this.sources.delete(id);
    const cameraWater = query.sample(camera, epochMinutes);
    const underwater = cameraWater.waterBodyId !== null && camera.y < cameraWater.surfaceHeight - 0.08;
    this.object3d.visible = !underwater;
    // A paused tab should expire its local spray, not release a catch-up storm.
    if (dt > 0.5 || underwater) { this.particles.length = 0; this.pending.length = 0; }
    while (this.pending.length) this.spawn(this.pending.shift()!, query, epochMinutes, camera);
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
      if (p.kind === 0) p.velocity.y -= 9.81 * step;
      p.position.x += p.velocity.x * step;
      p.position.y += p.velocity.y * step;
      p.position.z += p.velocity.z * step;
      if (Math.hypot(p.position.x - camera.x, p.position.z - camera.z) > this.maxDistance) continue;
      const water = query.sample(p.position, epochMinutes);
      if (water.waterBodyId !== p.bodyId || water.depth <= 0.015) continue;
      if (p.kind === 2) {
        p.position.y = water.surfaceHeight + 0.025;
        const blend = 1 - Math.exp(-step * 3);
        p.velocity.x += (water.flowVelocity.x - p.velocity.x) * blend;
        p.velocity.z += (water.flowVelocity.z - p.velocity.z) * blend;
      } else if (p.kind === 0 && p.velocity.y < 0 && p.position.y <= water.surfaceHeight + 0.015) {
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
      } else if (p.position.y < water.surfaceHeight - 0.1) continue;
      this.particles[write++] = p;
    }
    this.particles.length = write;
    // Alpha sprites are drawn back-to-front; bounded sort, no per-particle draw calls.
    this.particles.sort((a, b) => this.distanceSq(b.position, camera) - this.distanceSq(a.position, camera));
    for (let i = 0; i < write; i++) {
      const p = this.particles[i];
      const age = p.age / p.life;
      const fade = Math.min(1, p.age / 0.04) * Math.pow(1 - age, p.kind === 1 ? 1.3 : 0.7);
      const distanceFade = clamp((this.maxDistance - Math.sqrt(this.distanceSq(p.position, camera))) / (this.maxDistance * 0.25), 0, 1);
      this.offsets.setXYZ(i, p.position.x, p.position.y, p.position.z);
      this.appearance.setXYZW(i, p.size * (1 + age * (p.kind === 1 ? 1.8 : p.kind === 2 ? 0.6 : 0)), p.opacity * fade * distanceFade, p.kind, p.phase);
    }
    this.offsets.needsUpdate = true;
    this.appearance.needsUpdate = true;
    this.object3d.geometry.instanceCount = write;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.particles.length = 0; this.pending.length = 0; this.sources.clear();
    this.object3d.removeFromParent();
    this.object3d.geometry.dispose(); this.object3d.material.dispose();
  }

  private spawn(burst: Burst, query: WorldWaterQuery, epoch: number, camera: Vec3): void {
    const { event, mist } = burst;
    const profile = waterEmissionProfile(event);
    if (profile.count === 0 || this.distanceSq(event.position, camera) > this.maxDistance * this.maxDistance) return;
    const water = query.sample(event.position, epoch);
    if (!water.waterBodyId || water.depth <= 0.015 || event.position.y < water.surfaceHeight - Math.max(0.5, profile.radius)) return;
    // Impacts must meet the actual surface, not splash remotely from mid-air.
    if (event.position.y > water.surfaceHeight + Math.max(1, profile.radius)) return;
    const relativeX = (event.velocity?.x ?? 0) - water.flowVelocity.x;
    const relativeZ = (event.velocity?.z ?? 0) - water.flowVelocity.z;
    const angle = Math.atan2(relativeZ, relativeX);
    const count = Math.min(profile.count, this.capacity - this.particles.length);
    for (let i = 0; i < count; i++) {
      const kind = this.random() < mist * 0.4 ? 1 : this.random() < (profile.wake ? 0.75 : 0.25) ? 2 : 0;
      // Wake spray leaves the two sides of a moving hull/foot, not random forward jets.
      const theta = profile.wake ? angle + (i % 2 ? 1 : -1) * (1.5 + this.random() * 0.5) : this.random() * Math.PI * 2;
      const spread = profile.radius * (0.25 + this.random() * 0.65);
      const x = event.position.x + Math.cos(theta) * spread;
      const z = event.position.z + Math.sin(theta) * spread;
      const surface = query.sample({ x, y: water.surfaceHeight, z }, epoch);
      if (surface.waterBodyId !== water.waterBodyId || surface.depth <= 0.015) continue;
      const speed = profile.lift * (0.2 + this.random() * 0.35);
      this.particles.push({
        position: { x, y: surface.surfaceHeight + (kind === 2 ? 0.025 : 0.04), z },
        velocity: {
          x: water.flowVelocity.x + Math.cos(theta) * speed + relativeX * (profile.wake ? -0.08 : 0.15),
          y: kind === 2 ? 0 : kind === 1 ? 0.15 + profile.energy * 0.12 : profile.lift * (0.6 + this.random() * 0.6),
          z: water.flowVelocity.z + Math.sin(theta) * speed + relativeZ * (profile.wake ? -0.08 : 0.15),
        },
        age: 0, life: kind === 1 ? 1.3 + this.random() * 1.3 : kind === 2 ? 1 + this.random() * 2 : 0.5 + profile.lift * 0.24,
        size: kind === 1 ? profile.radius * (0.5 + this.random()) : kind === 2 ? 0.07 + profile.radius * (0.2 + this.random() * 0.45) : 0.015 + this.random() * 0.035 * Math.min(profile.energy, 1.6),
        opacity: kind === 1 ? 0.13 : kind === 2 ? 0.34 : 0.65,
        kind, phase: this.random() * 100, bodyId: water.waterBodyId,
        reentry: kind === 0 && i % 5 === 0,
      });
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
