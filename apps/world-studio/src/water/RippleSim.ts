import * as THREE from "three";

/**
 * Local interactive ripple simulation (owner round 2): a 256² ping-pong
 * wave-equation heightfield on a ~36 m patch that follows the player,
 * texel-snapped. Wading, crates and splashes stamp impulses; the water
 * material adds the resulting gradients to its normals, so ripples spread,
 * reflect and fade like the real thing.
 *
 * The update rule is Evan Wallace's classic WebGL water simulation, as
 * ported by jeantimex/threejs-water (MIT, © 2011 Evan Wallace, © 2026
 * Yong Su) — see docs/research/water-edges-and-shore-waves.md §4. RG16F
 * (height, velocity): linear-filterable and renderable in core WebGL2 +
 * EXT_color_buffer_float, sidestepping the float32-filtering trap.
 * Skyrim ships the same architecture (a ~29 m ripple quad around actors),
 * so this is the proven low-cost shape.
 */

const SIM_SIZE = 256;
// Round 2 (owner: "rain ripples only within a few metres"): patch widened
// 36 → 64 m so simulated rings cover the water the player actually sees
// close-up; beyond it the procedural rain agitation in waterMaterial takes
// over. 256² texels over 64 m = 25 cm resolution — still ring-sharp.
export const RIPPLE_PATCH_M = 64;

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// height in .r, velocity in .g — Wallace's update: velocity += (average of
// neighbours − height); damp; height += velocity.
const UPDATE_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec2 uDelta;      // 1 / SIM_SIZE
  uniform vec2 uShift;      // uv shift from patch re-centring (texel-snapped)
  void main() {
    vec2 uv = vUv + uShift;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec2 info = texture2D(uPrev, uv).rg;
    float avg = (
      texture2D(uPrev, uv + vec2(uDelta.x, 0.0)).r +
      texture2D(uPrev, uv - vec2(uDelta.x, 0.0)).r +
      texture2D(uPrev, uv + vec2(0.0, uDelta.y)).r +
      texture2D(uPrev, uv - vec2(0.0, uDelta.y)).r) * 0.25;
    float velocity = info.g + (avg - info.r) * 2.0;
    velocity *= 0.985;                       // damping
    float height = info.r + velocity;
    // fade at the patch border so ripples never pop at the edge
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float keep = smoothstep(0.0, 0.06, edge);
    gl_FragColor = vec4(height * keep, velocity * keep, 0.0, 0.0);
  }
`;

const DROP_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec2 uCenter;     // uv
  uniform float uRadius;    // uv
  uniform float uStrength;
  void main() {
    vec4 info = texture2D(uPrev, vUv);
    float drop = max(0.0, 1.0 - length(uCenter - vUv) / uRadius);
    drop = 0.5 - cos(drop * 3.14159265) * 0.5;
    info.r += drop * uStrength;
    gl_FragColor = info;
  }
`;

function makeTarget(): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, {
    type: THREE.HalfFloatType,
    format: THREE.RGFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  return rt;
}

export class RippleSim {
  private a = makeTarget();
  private b = makeTarget();
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private update: THREE.ShaderMaterial;
  private drop: THREE.ShaderMaterial;
  /** Patch centre in world metres (texel-snapped). */
  readonly center = new THREE.Vector2();
  private pendingDrops: { x: number; z: number; radiusM: number; strength: number }[] = [];
  private accumulator = 0;

  constructor() {
    this.update = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uDelta: { value: new THREE.Vector2(1 / SIM_SIZE, 1 / SIM_SIZE) },
        uShift: { value: new THREE.Vector2() },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: UPDATE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.drop = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uCenter: { value: new THREE.Vector2() },
        uRadius: { value: 0.05 },
        uStrength: { value: 0.1 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: DROP_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.update);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get texture(): THREE.Texture {
    return this.a.texture;
  }

  /** World-space impulse (wading step, crate wake, splash). */
  addDrop(x: number, z: number, radiusM: number, strength: number): void {
    this.pendingDrops.push({ x, z, radiusM, strength });
    if (this.pendingDrops.length > 16) this.pendingDrops.shift();
  }

  /** Advance the sim (fixed 60 Hz substeps) and follow the focus point. */
  step(renderer: THREE.WebGLRenderer, focusX: number, focusZ: number, deltaS: number): void {
    const texel = RIPPLE_PATCH_M / SIM_SIZE;
    const cx = Math.round(focusX / texel) * texel;
    const cz = Math.round(focusZ / texel) * texel;
    const shiftX = (cx - this.center.x) / RIPPLE_PATCH_M;
    const shiftZ = (cz - this.center.y) / RIPPLE_PATCH_M;
    this.center.set(cx, cz);

    const prevTarget = renderer.getRenderTarget();
    const prevTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;

    // impulses
    for (const d of this.pendingDrops) {
      const ux = (d.x - this.center.x) / RIPPLE_PATCH_M + 0.5;
      const uz = (d.z - this.center.y) / RIPPLE_PATCH_M + 0.5;
      if (ux < 0 || ux > 1 || uz < 0 || uz > 1) continue;
      this.drop.uniforms.uPrev.value = this.a.texture;
      this.drop.uniforms.uCenter.value.set(ux, uz);
      this.drop.uniforms.uRadius.value = Math.max(d.radiusM / RIPPLE_PATCH_M, 0.008);
      this.drop.uniforms.uStrength.value = d.strength;
      this.quad.material = this.drop;
      renderer.setRenderTarget(this.b);
      renderer.render(this.scene, this.camera);
      [this.a, this.b] = [this.b, this.a];
    }
    this.pendingDrops.length = 0;

    // fixed-step updates (the sim speed must not depend on fps)
    this.accumulator = Math.min(this.accumulator + deltaS, 0.15);
    let shiftPending = shiftX !== 0 || shiftZ !== 0;
    while (this.accumulator >= 1 / 60) {
      this.accumulator -= 1 / 60;
      this.update.uniforms.uPrev.value = this.a.texture;
      this.update.uniforms.uShift.value.set(shiftPending ? shiftX : 0, shiftPending ? shiftZ : 0);
      shiftPending = false;
      this.quad.material = this.update;
      renderer.setRenderTarget(this.b);
      renderer.render(this.scene, this.camera);
      [this.a, this.b] = [this.b, this.a];
    }

    renderer.setRenderTarget(prevTarget);
    renderer.toneMapping = prevTone;
  }

  dispose(): void {
    this.a.dispose();
    this.b.dispose();
    this.update.dispose();
    this.drop.dispose();
  }
}
