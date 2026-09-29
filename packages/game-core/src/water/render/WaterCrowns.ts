import type { Vec3, WorldWaterQuery } from "@elder-souls/contracts";
import { BufferAttribute, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry,
  Mesh, Sphere, Vector3, type Frustum } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import { sel, type TslNode } from "../../render/nodes/materialNodes";
import { sceneEyeDepthNode } from "../../render/nodes/depthNodes";
import type { WaterParticleUniforms } from "./WaterEffects";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const { attribute, clamp, cos, float, mix, positionGeometry, positionView, sin, smoothstep, varying, vec3, vec4 } =
  tsl as unknown as Record<string, TslNode>;

/** The crown sheet: a flared ring of fingers, lit like the spray, soft against the scene depth. */
function createCrownMaterial(u: WaterParticleUniforms): MeshBasicNodeMaterial {
  const n = u as unknown as Record<string, TslNode>;
  const material = new MeshBasicNodeMaterial();
  material.name = "es-water-impact-crowns";
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = DoubleSide;
  material.fog = false;   // never fogged before (no fog chunk)
  const shape = attribute("crownShape", "vec4");
  const angle = positionGeometry.x;
  const height = positionGeometry.y;
  const fingers = sin(angle.mul(9.0).add(shape.w)).mul(0.24).add(0.76);
  const radius = shape.x.mul(mix(0.64, 1.0, height));
  material.positionNode = attribute("crownPosition", "vec3")
    .add(vec3(cos(angle).mul(radius), height.mul(shape.y).mul(fingers), sin(angle).mul(radius)));
  const vCrown = varying(vec3(angle.add(shape.w), height, shape.z), "vEsCrown");
  const viewDepth = positionView.z.negate();
  const edge = float(1).sub(smoothstep(0.82, 1.0, vCrown.y)).mul(smoothstep(0.0, 0.12, vCrown.y));
  const holes = smoothstep(-0.62, 0.12, sin(vCrown.x.mul(13.0)).add(float(1).sub(vCrown.y).mul(1.8)));
  const sceneZ = sceneEyeDepthNode(n.sceneDepth, n.resolution, n.cameraNear, n.cameraFar);
  const soft = sel(n.hasDepth.greaterThan(0.5), clamp(sceneZ.sub(viewDepth).div(0.12), 0.0, 1.0), float(1));
  const alpha = vCrown.z.mul(edge).mul(holes).mul(soft).mul(n.lightVisibility);
  material.colorNode = vec4(n.lightColor, alpha);
  material.maskNode = alpha.greaterThanEqual(0.003);
  return material;
}

interface Crown { position: Vec3; bodyId: string; radius: number; lift: number; age: number; life: number; phase: number }

/** Short-lived connected liquid sheets around significant plunging entries.
 * Open flared rings, not billboard discs. Sixteen instances and one draw. */
export class WaterCrowns {
  readonly mesh: Mesh<InstancedBufferGeometry, MeshBasicNodeMaterial>;
  private readonly particles: Crown[] = [];
  private readonly positions = new InstancedBufferAttribute(new Float32Array(16 * 3), 3).setUsage(DynamicDrawUsage);
  private readonly shapes = new InstancedBufferAttribute(new Float32Array(16 * 4), 4).setUsage(DynamicDrawUsage);
  private readonly sphere = new Sphere(new Vector3(), 1);
  spawned = 0;
  visibleCandidates = 0;
  get activeCount() { return this.particles.length; }

  constructor(uniforms: WaterParticleUniforms, layer: number) {
    const vertices: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 32; i++) for (let y = 0; y <= 1; y++) vertices.push(i / 32 * Math.PI * 2, y, 0);
    for (let i = 0; i < 32; i++) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
    geometry.setIndex(indices);
    geometry.setAttribute("crownPosition", this.positions); geometry.setAttribute("crownShape", this.shapes);
    geometry.instanceCount = 0;
    const material = createCrownMaterial(uniforms);
    this.mesh = new Mesh(geometry, material); this.mesh.layers.set(layer); this.mesh.frustumCulled = false;
    this.mesh.name = "water-impact-crowns"; this.mesh.renderOrder = 2;
  }

  emit(position: Vec3, bodyId: string, radius: number, lift: number, phase: number): void {
    if (this.particles.length === 16) this.particles.shift();
    this.particles.push({ position: { ...position }, bodyId, radius, lift, phase, age: 0,
      life: Math.min(0.65, 0.24 + lift * 0.075) });
    this.spawned++;
  }

  update(dt: number, query: WorldWaterQuery, epoch: number, camera: Vec3, frustum?: Frustum, scale = 1): void {
    let write = 0; this.visibleCandidates = 0;
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life || Math.hypot(p.position.x - camera.x, p.position.z - camera.z) > 100) continue;
      const water = query.sample(p.position, epoch);
      if (water.waterBodyId !== p.bodyId || water.depth < 0.02) continue;
      p.position.x += water.flowVelocity.x * dt; p.position.z += water.flowVelocity.z * dt;
      p.position.y = water.surfaceHeight + 0.012;
      const age = p.age / p.life, opacity = Math.min(1, 0.25 + p.age / 0.035) * (1 - age) * 0.6;
      // A finite contact lip avoids a zero-area newborn draw; it decays with
      // the same lifetime and does not consume the preceding frame's time.
      const radius = p.radius * (0.6 + age * 1.5), height = Math.max(0.015 * (1 - age), p.lift * 0.22 * Math.sin(Math.PI * age));
      this.positions.setXYZ(write, p.position.x, p.position.y, p.position.z);
      this.shapes.setXYZW(write, radius, height, opacity, p.phase);
      this.sphere.center.set(p.position.x, p.position.y * scale, p.position.z);
      this.sphere.radius = radius + height * scale;
      if (opacity > 0.003 && (!frustum || frustum.intersectsSphere(this.sphere))) this.visibleCandidates++;
      this.particles[write++] = p;
    }
    this.particles.length = write; this.mesh.geometry.instanceCount = write;
    this.positions.needsUpdate = true; this.shapes.needsUpdate = true;
  }
  clear(): void { this.particles.length = 0; this.mesh.geometry.instanceCount = 0; this.visibleCandidates = 0; }
  dispose(): void { this.clear(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); }
}
