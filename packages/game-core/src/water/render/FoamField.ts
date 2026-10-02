import * as THREE from "three";
import type { TslNode } from "../../render/nodes/materialNodes";
import { NodeMaterial, QuadMesh, RenderTarget, type WebGPURenderer } from "three/webgpu";
import { WAVES } from "../waves";
import { esShoreFrothBand } from "./shoreFroth";
import {
  esFbm, esFetchAt, esFetchExp, esSeaRms, esShoreAt, esStandingRatio, esSurfEnergy, esSurfFoam, esTideResponse,
  esWaveExposure, esWaveSampleEx, makeSurfaceAt, sel, type WaterSamplerNodes,
} from "./waterNodes";
import * as TSLNS from "three/tsl";
// TSL typings are too deep for tsc to check usefully (0107 §1): the graph is typed as TslNode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  Break, Fn, If, Loop, all, any, clamp, dot, exp, float, int, length, max, min, mix, smoothstep, texture, uniform, uniformArray, uv, vec2, vec4,
} = TSLNS as any;

/**
 * Persistent foam ENERGY field (Greenheck study §1.3, §3.1 (1), §6): one
 * camera-centred half-float ping-pong, ~512 m a side, snapped to whole
 * texels, holding foam energy E with memory. Per frame, one fullscreen pass:
 *
 *   E' = E(p − flow·dt) · exp(−dt / decayTime)
 *      + (crestEq·fold + windEq·windward + surfEq·surf) · (1 − exp(−dt / decayTime))
 *      + injections
 *
 * - **Advected by the compiled flow raster** (semi-Lagrangian back-trace):
 *   river foam drifts downstream and persists, a plunge pool looks fed.
 * - `fold` is the same wave crest the surface renders (waves.ts twin, waterNodes.ts,
 *   the fragment's `smoothstep(0.16, 0.34, height)` measure), `windward` the
 *   wind-facing slope, `surf` the bore energy inside the shoreline froth
 *   band — surf foam lingers on the sand and drains back.
 * - Decay ~0.5 s at sea, 2–4 s in sheltered/still water (a function of wave
 *   exposure), ~1 s on texels that have dried.
 * - Injections (≤ 32 a frame) are swept segments with a radius: wading and
 *   contact paths, splashes, plunge pools, strip aeration.
 *
 * The surface fragment samples it with `esFoamFieldAt` and takes
 * `max(instantaneous, field)` in front of the UNCHANGED dissolve, so beyond
 * the field the stateless path continues with no seam. Deterministic: no
 * RNG anywhere. Tier-gated by size (512 high, 256 low, or absent).
 */

export const FOAM_FIELD_M = 512;
export const MAX_FOAM_INJECTIONS = 32;
/** Longest back-trace per frame (s): bounds the semi-Lagrangian step. */
const MAX_STEP_S = 0.1;
/** Gate margin beyond the field's half-size (m): covers the field's edge
 * texel and drift of the focus within a frame; the presence query itself
 * adds the surface raster's one-texel bilinear reach. */
const FOAM_GATE_MARGIN_M = 8;

/** Energy law constants — uniforms so the probe can retune without a
 * recompile. Equilibrium energy at a sustained sharp fold / a fully
 * wind-facing face / inside the surf band, and the two decay e-folds. */
export const FOAM_LAW = {
  crestEq: 0.8,
  windwardEq: 0.3,
  surfEq: 0.7,
  decaySeaS: 0.5,
  decaySlowS: 3.0,
  decayDryS: 1.0,
  /** Slope at which a face counts as fully wind-facing. */
  windwardSlope: 0.12,
} as const;

/** CPU twin of the pass's decay time: fast at sea, slow when sheltered. */
export function foamDecayTime(exposure: number, dry: boolean): number {
  const e = Math.min(Math.max(exposure, 0), 1);
  const t = FOAM_LAW.decaySlowS + (FOAM_LAW.decaySeaS - FOAM_LAW.decaySlowS) * e;
  return dry ? Math.min(t, FOAM_LAW.decayDryS) : t;
}

/** CPU twin of one field step at a texel with no advection: returns E'.
 * Exact integration of dE/dt = −E/τ + src, so the equilibrium `src·τ` (=
 * crestEq at a sustained fold) does not depend on the frame rate. */
export function foamStep(E: number, dt: number, exposure: number, fold: number, windward: number, surf: number,
  dry = false, windWave = 1): number {
  const tau = foamDecayTime(exposure, dry);
  const expo01 = Math.min(Math.max(exposure, 0), 1);
  const gust = Math.min(Math.max(windWave - 0.8, 0), 2) * 0.5;
  const eq = (FOAM_LAW.crestEq * fold + FOAM_LAW.windwardEq * windward * gust) * expo01 + FOAM_LAW.surfEq * surf;
  const keep = Math.exp(-dt / tau);
  return Math.min(Math.max(E * keep + eq * (1 - keep), 0), 2);
}

/** CPU twin of the injection kernel: a soft disc of `radius` around the
 * nearest point of the segment, `strength` at the centre. */
export function foamInjectKernel(distM: number, radiusM: number, strength: number): number {
  const r = Math.max(radiusM, 0.05);
  const t = Math.min(Math.max((distM - 0.35 * r) / (r - 0.35 * r), 0), 1);
  return strength * (1 - t * t * (3 - 2 * t));
}

/** Snap a focus to the field's texel grid and give the uv shift that maps
 * the new frame's uv onto the previous frame's texture. */
export function foamFieldRecentre(prevCx: number, prevCz: number, focusX: number, focusZ: number, size: number,
  worldSizeM: number = FOAM_FIELD_M): { cx: number; cz: number; shiftU: number; shiftV: number } {
  const texel = worldSizeM / size;
  const cx = Math.round(focusX / texel) * texel;
  const cz = Math.round(focusZ / texel) * texel;
  const first = !Number.isFinite(prevCx) || !Number.isFinite(prevCz);
  return { cx, cz, shiftU: first ? 0 : (cx - prevCx) / worldSizeM, shiftV: first ? 0 : (cz - prevCz) / worldSizeM };
}

/** Fragment-side sampler (TSL): the water material reads the persistent
 * foam energy at `wp`; feed `uFoamField` / `uFoamFieldInfo` from
 * `FoamField.texture` / `.info`. */
export function esFoamFieldAt(u: FoamFieldUniforms, wp: TslNode): TslNode {
  const info = u.uFoamFieldInfo as TslNode;
  const uv = (wp as TslNode).sub(info.xy).div(info.z).add(0.5);
  const e = (smoothstep(0.0, 0.06, uv) as TslNode).mul(smoothstep(0.0, 0.06, (float(1.0) as TslNode).sub(uv)));
  const val = ((u.uFoamField as TslNode).sample(uv) as TslNode).r.mul(e.x).mul(e.y);
  const outside = (any(uv.lessThan(vec2(0.0))) as TslNode).or(any(uv.greaterThan(vec2(1.0))));
  return sel(info.w.lessThan(0.5).or(outside), float(0.0), val);
}

export interface FoamFieldUniforms {
  /** Texture node: set `.value` to the field's current texture. */
  uFoamField: TslNode & { value: THREE.Texture };
  uFoamFieldInfo: TslNode & { value: THREE.Vector4 };
}
export function createFoamFieldUniforms(): FoamFieldUniforms {
  const empty = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  empty.needsUpdate = true;
  return {
    uFoamField: texture(empty) as FoamFieldUniforms["uFoamField"],
    uFoamFieldInfo: uniform(new THREE.Vector4(0, 0, FOAM_FIELD_M, 0)) as FoamFieldUniforms["uFoamFieldInfo"],
  };
}

export interface FoamFieldOptions {
  /** Texels a side (512 high tier, 256 low). */
  size: number;
  worldSizeM?: number;
  /** The water material's uniform nodes (raster textures, levels, clocks):
   * the pass reads the very same nodes, so nothing is copied per frame and it
   * decodes the SAME rasters the surface does. */
  uniforms: WaterSamplerNodes & {
    uFlowTex: TslNode; uFlowMax: TslNode; uLevelTide: TslNode; uLevelSeason: TslNode;
    uWaveTime: TslNode; uWindWave: TslNode; uWindMS: TslNode;
  };
  /** Gerstner bands to evaluate (the tier's `waveBands`). */
  waveBands?: number;
  /** Compiled class order (`meta.klass.classes`) for the standing ratio. */
  classes: readonly string[];
  /** Whether any surface can draw inside a world rectangle (true metres;
   * `WaterData.anyWaterIn`). Absent: the field always steps. */
  waterIn?: (minX: number, minZ: number, maxX: number, maxZ: number) => boolean;
}

/** The pass's own uniform nodes. */
function createPassUniforms(worldSizeM: number) {
  return {
    uPrev: texture(new THREE.Texture()) as TslNode,
    uShift: uniform(new THREE.Vector2()) as TslNode,
    uField: uniform(new THREE.Vector4(0, 0, worldSizeM, 0)) as TslNode,
    uWindDir: uniform(new THREE.Vector2(WAVES.windDir[0], WAVES.windDir[1])) as TslNode,
    uFoamLaw: uniform(new THREE.Vector4(FOAM_LAW.crestEq, FOAM_LAW.windwardEq, FOAM_LAW.decaySeaS, FOAM_LAW.decaySlowS)) as TslNode,
    uFoamLaw2: uniform(new THREE.Vector3(FOAM_LAW.surfEq, FOAM_LAW.decayDryS, FOAM_LAW.windwardSlope)) as TslNode,
    uInjectA: uniformArray(Array.from({ length: MAX_FOAM_INJECTIONS }, () => new THREE.Vector4()), "vec4") as TslNode,
    uInjectB: uniformArray(Array.from({ length: MAX_FOAM_INJECTIONS }, () => new THREE.Vector4()), "vec4") as TslNode,
    uInjectCount: uniform(0) as TslNode,
  };
}
type PassUniforms = ReturnType<typeof createPassUniforms>;

/** The field step as a TSL fragment graph (the old foamFieldFragment, same maths). */
export function foamFieldNode(opts: FoamFieldOptions, p: PassUniforms): TslNode {
  const U = opts.uniforms as unknown as Record<string, TslNode>;
  const N = (v: unknown) => v as TslNode;
  const surfaceAt = makeSurfaceAt(opts.uniforms);
  return Fn(() => {
    const vUv = N(uv());
    const field = N(p.uField);
    const dt = field.w;
    const wp = field.xy.add(vUv.sub(0.5).mul(field.z)).toVar();
    const surf = N(surfaceAt(wp));
    const dUv = clamp(wp.div(U.uFlowExtentM), vec2(0.0), vec2(1.0));
    const kl = N(N(U.uKlassTex).sample(dUv)).toVar();
    const fl = N(N(U.uFlowTex).sample(dUv));
    const fetchM = N(esFetchAt(opts.uniforms, fl)).toVar();
    const ss = N(esShoreAt(opts.uniforms, wp)).toVar();
    const still = surf.x.add(N(U.uLevelTide).mul(esTideResponse(opts.classes, kl.r.mul(255.0)))).add(N(U.uLevelSeason).mul(ss.y));
    const depth = surf.y.add(still.sub(surf.x)).toVar();
    const turb = N(max(kl.g, ss.z)).toVar();
    const expo01 = N(esWaveExposure(ss.x, depth, turb)).toVar();
    const exposure = expo01.mul(esSeaRms(U.uWindMS, fetchM)).toVar();
    const flow = fl.xy.sub(0.5).mul(2.0).mul(U.uFlowMax);
    // 1. history: recentre shift + semi-Lagrangian back-trace along the flow
    const prevUv = vUv.add(p.uShift).sub(N(flow).mul(dt).div(field.z));
    const inside = N(all(prevUv.greaterThanEqual(vec2(0.0)))).and(all(prevUv.lessThanEqual(vec2(1.0))));
    const E = N(sel(inside, N(N(p.uPrev).sample(prevUv)).r, float(0.0))).toVar();
    // 2. decay: fast at sea, slow when sheltered, drained once dry
    const law = N(p.uFoamLaw), law2 = N(p.uFoamLaw2);
    const tau0 = N(mix(law.w, law.z, expo01));
    const tau = sel(depth.lessThanEqual(0.0), min(tau0, law2.y), tau0);
    const keep = N(exp(N(dt).negate().div(tau)));
    E.mulAssign(keep);
    // 3. sources: equilibrium energies, integrated exactly over dt. Each
    // source is a real branch, as dev's GLSL: the wave bands and the surf fbm
    // run only where they can contribute (ALU only, no derivatives).
    const eq = float(0.0).toVar();
    If(exposure.greaterThan(0.002), () => {
      const standing = esStandingRatio(opts.classes, kl.r.mul(255.0), ss.x);
      const w = esWaveSampleEx(wp, exposure, fetchM, standing, U.uWaveTime, opts.waveBands ?? WAVES.bands);
      const fold = smoothstep(0.16, 0.34, w.height);
      const windward = clamp(N(dot(N(w.normal).xz, N(p.uWindDir).negate())).div(law2.z), 0.0, 1.0);
      const gust = N(clamp(N(U.uWindWave).sub(0.8), 0.0, 2.0)).mul(0.5);
      eq.addAssign(law.x.mul(fold).add(law.y.mul(windward).mul(gust)).mul(expo01));
    });
    If(ss.x.lessThan(90.0).and(depth.greaterThan(-0.5)), () => {
      const fetch = esFetchExp(fetchM, turb);
      const windAmp = esSurfEnergy(U.uWindMS, fetchM);
      const bn = N(esFbm(wp.mul(0.16), 3));
      const surfE = N(esSurfFoam(ss.x.add(bn.mul(4.0)), fetch, U.uWaveTime, windAmp)).mul(esShoreFrothBand(depth, bn));
      eq.addAssign(law2.x.mul(surfE).mul(float(1.0).sub(N(clamp(turb, 0.0, 1.0)).mul(0.75))));
    });
    E.addAssign(eq.mul(float(1.0).sub(keep)));
    // 4. injections: swept segments with a soft radius
    Loop(MAX_FOAM_INJECTIONS, ({ i }: { i: TslNode }) => {
      If(N(i).greaterThanEqual(int(p.uInjectCount)), () => { Break(); });
      const A = N(N(p.uInjectA).element(i));
      const B = N(N(p.uInjectB).element(i)).xy;
      const r = N(max(B.x, 0.05));
      const ab = A.zw.sub(A.xy);
      const l2 = max(dot(ab, ab), 1e-6);
      const t = clamp(N(dot(wp.sub(A.xy), ab)).div(l2), 0.0, 1.0);
      const d = N(length(wp.sub(A.xy.add(ab.mul(t)))));
      If(d.lessThan(r), () => {
        E.addAssign(B.y.mul(float(1.0).sub(smoothstep(r.mul(0.35), r, d))));
      });
    });
    // outer ring damped so a recentre never drags a hard edge inward
    const edge = min(min(vUv.x, float(1.0).sub(vUv.x)), min(vUv.y, float(1.0).sub(vUv.y)));
    E.mulAssign(smoothstep(0.0, 0.04, edge));
    return vec4(clamp(E, 0.0, 2.0), 0.0, 0.0, 1.0);
  })();
}

interface Injection { x0: number; z0: number; x1: number; z1: number; radius: number; strength: number }

export class FoamField {
  readonly size: number;
  readonly worldSizeM: number;
  readonly center = new THREE.Vector2(NaN, NaN);
  /** Feed the water material: (centre x, centre z, world size, active). */
  readonly info = new THREE.Vector4(0, 0, FOAM_FIELD_M, 0);
  private a: RenderTarget;
  private b: RenderTarget;
  private readonly quad: QuadMesh;
  private readonly pass: NodeMaterial;
  private readonly u: PassUniforms;
  private readonly pending: Injection[] = [];
  private initialized = false;
  /** Renderer state saved around the pass, rewritten per frame (walk 5 perf). */
  private readonly savedColor = Object.assign(new THREE.Color(), { a: 1 }) as unknown as Parameters<WebGPURenderer["getClearColor"]>[0];
  private readonly savedViewport = new THREE.Vector4();
  private readonly savedScissor = new THREE.Vector4();
  private disposed = false;
  private readonly waterIn: FoamFieldOptions["waterIn"];
  /** Steps run (the inland gate's measure). */
  steps = 0;

  constructor(opts: FoamFieldOptions) {
    this.waterIn = opts.waterIn;
    this.size = Math.max(64, Math.min(1024, Math.round(opts.size)));
    this.worldSizeM = opts.worldSizeM ?? FOAM_FIELD_M;
    this.info.z = this.worldSizeM;
    const makeTarget = () => {
      const rt = new RenderTarget(this.size, this.size, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false,
      });
      rt.texture.colorSpace = THREE.NoColorSpace;
      rt.texture.generateMipmaps = false;
      return rt;
    };
    this.a = makeTarget();
    this.b = makeTarget();
    this.u = createPassUniforms(this.worldSizeM);
    this.pass = new NodeMaterial();
    this.pass.fragmentNode = foamFieldNode(opts, this.u);
    this.pass.depthTest = false;
    this.pass.depthWrite = false;
    this.pass.blending = THREE.NoBlending;
    this.pass.toneMapped = false;
    this.quad = new QuadMesh(this.pass);
  }

  get texture(): THREE.Texture { return this.a.texture; }
  /** The energy-law uniforms (probe retuning). */
  get law(): { uFoamLaw: THREE.Vector4; uFoamLaw2: THREE.Vector3 } {
    return { uFoamLaw: this.u.uFoamLaw.value as THREE.Vector4, uFoamLaw2: this.u.uFoamLaw2.value as THREE.Vector3 };
  }
  get pendingCount(): number { return this.pending.length; }

  /** Deposit `strength` energy in a soft disc (an instantaneous deposit —
   * continuous sources multiply their rate by dt themselves). */
  inject(x: number, z: number, radiusM: number, strength: number): void {
    this.injectPath(x, z, x, z, radiusM, strength);
  }

  /** Deposit along the path travelled since the last frame (a swept
   * footprint, never a dotted line of points). */
  injectPath(x0: number, z0: number, x1: number, z1: number, widthM: number, strength: number): void {
    if (this.disposed || ![x0, z0, x1, z1, widthM, strength].every(Number.isFinite)) return;
    if (widthM <= 0 || strength <= 0 || this.pending.length >= MAX_FOAM_INJECTIONS) return;
    this.pending.push({ x0, z0, x1, z1, radius: Math.min(widthM, 24), strength: Math.min(strength, 2) });
  }

  /** One field step: recentre on the focus, advect, decay, deposit. Call
   * once per rendered frame before the water pass. */
  update(renderer: WebGPURenderer, focusX: number, focusZ: number, deltaS: number): void {
    if (this.disposed || ![focusX, focusZ, deltaS].every(Number.isFinite)) return;
    const dt = Math.min(Math.max(deltaS, 0), MAX_STEP_S);
    const plan = foamFieldRecentre(this.center.x, this.center.y, focusX, focusZ, this.size, this.worldSizeM);
    // Inland gate (perf10 f4b): no surface can draw anywhere under the field
    // (plus a margin for the surface's bilinear reach), so nothing samples
    // it. Going dormant drops the history to zero at once (inactive reads 0,
    // the same as an all-zero field) and the next wet step starts cleared.
    const reach = this.worldSizeM / 2 + FOAM_GATE_MARGIN_M;
    if (this.waterIn && !this.waterIn(plan.cx - reach, plan.cz - reach, plan.cx + reach, plan.cz + reach)) {
      this.suspend();
      return;
    }
    this.center.set(plan.cx, plan.cz);
    this.info.set(plan.cx, plan.cz, this.worldSizeM, 1);
    const u = this.u;
    u.uShift.value.set(plan.shiftU, plan.shiftV);
    u.uField.value.set(plan.cx, plan.cz, this.worldSizeM, dt);
    let count = 0;
    for (const p of this.pending) {
      (u.uInjectA.array[count] as THREE.Vector4).set(p.x0, p.z0, p.x1, p.z1);
      (u.uInjectB.array[count] as THREE.Vector4).set(p.radius, p.strength, 0, 0);
      count++;
    }
    this.pending.length = 0;
    u.uInjectCount.value = count;

    const target = renderer.getRenderTarget();
    const tone = renderer.toneMapping;
    const autoClear = renderer.autoClear;
    const color = renderer.getClearColor(this.savedColor);
    const alpha = renderer.getClearAlpha();
    const viewport = renderer.getViewport(this.savedViewport);
    const scissor = renderer.getScissor(this.savedScissor);
    const scissorTest = renderer.getScissorTest();
    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = false;
      renderer.setScissorTest(false);
      if (!this.initialized) {
        renderer.setClearColor(0, 0);
        renderer.setRenderTarget(this.a); renderer.clear();
        renderer.setRenderTarget(this.b); renderer.clear();
        this.initialized = true;
      }
      u.uPrev.value = this.a.texture;
      renderer.setRenderTarget(this.b);
      this.quad.render(renderer);
      this.steps++;
      const swap = this.a; this.a = this.b; this.b = swap;
    } finally {
      renderer.setRenderTarget(target);
      renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      renderer.setClearColor(color, alpha);
      renderer.toneMapping = tone; renderer.autoClear = autoClear;
    }
  }

  /** Hidden tab / teleport: forget the history rather than replay it. */
  suspend(): void {
    this.pending.length = 0;
    this.initialized = false;
    this.center.set(NaN, NaN);
    this.info.w = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending.length = 0;
    this.a.dispose(); this.b.dispose(); this.pass.dispose();
  }
}
