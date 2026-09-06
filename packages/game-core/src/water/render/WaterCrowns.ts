import type { Vec3, WorldWaterQuery } from "@elder-souls/contracts";
import { BufferAttribute, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry,
  Mesh, ShaderMaterial, Sphere, Vector3, type Frustum, type IUniform } from "three";

interface Crown { position: Vec3; bodyId: string; radius: number; lift: number; age: number; life: number; phase: number }

/** Short-lived connected liquid sheets around significant plunging entries.
 * Open flared rings, not billboard discs. Sixteen instances and one draw. */
export class WaterCrowns {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly particles: Crown[] = [];
  private readonly positions = new InstancedBufferAttribute(new Float32Array(16 * 3), 3).setUsage(DynamicDrawUsage);
  private readonly shapes = new InstancedBufferAttribute(new Float32Array(16 * 4), 4).setUsage(DynamicDrawUsage);
  private readonly sphere = new Sphere(new Vector3(), 1);
  spawned = 0;
  visibleCandidates = 0;
  get activeCount() { return this.particles.length; }

  constructor(uniforms: Record<string, IUniform>, layer: number) {
    const vertices: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 32; i++) for (let y = 0; y <= 1; y++) vertices.push(i / 32 * Math.PI * 2, y, 0);
    for (let i = 0; i < 32; i++) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
    geometry.setIndex(indices);
    geometry.setAttribute("crownPosition", this.positions); geometry.setAttribute("crownShape", this.shapes);
    geometry.instanceCount = 0;
    const material = new ShaderMaterial({ uniforms, transparent: true, depthWrite: false, depthTest: true, side: DoubleSide,
      vertexShader: /* glsl */`
        attribute vec3 crownPosition;
        attribute vec4 crownShape;
        varying vec3 vCrown;
        varying float vViewDepth;
        void main() {
          float angle = position.x;
          float height = position.y;
          float fingers = 0.76 + 0.24 * sin(angle * 9.0 + crownShape.w);
          float radius = crownShape.x * mix(0.64, 1.0, height);
          vec3 p = crownPosition + vec3(cos(angle) * radius, height * crownShape.y * fingers, sin(angle) * radius);
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          vViewDepth = -view.z;
          vCrown = vec3(angle + crownShape.w, height, crownShape.z);
          gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D sceneDepth;
        uniform float hasDepth, cameraNear, cameraFar;
        uniform vec2 resolution;
        uniform vec3 lightColor;
        uniform float lightVisibility;
        varying vec3 vCrown;
        varying float vViewDepth;
        void main() {
          float edge = (1.0 - smoothstep(0.82, 1.0, vCrown.y)) * smoothstep(0.0, 0.12, vCrown.y);
          float holes = smoothstep(-0.62, 0.12, sin(vCrown.x * 13.0) + (1.0 - vCrown.y) * 1.8);
          float soft = 1.0;
          if (hasDepth > 0.5) {
            float depth = texture2D(sceneDepth, gl_FragCoord.xy / resolution).r;
            float sceneZ = cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
            soft = clamp((sceneZ - vViewDepth) / 0.12, 0.0, 1.0);
          }
          float alpha = vCrown.z * edge * holes * soft * lightVisibility;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(lightColor, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
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
      const age = p.age / p.life, opacity = Math.min(1, p.age / 0.035) * (1 - age) * 0.6;
      const radius = p.radius * (0.6 + age * 1.5), height = p.lift * 0.22 * Math.sin(Math.PI * age);
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
