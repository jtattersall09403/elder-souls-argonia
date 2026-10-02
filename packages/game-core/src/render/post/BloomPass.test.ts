import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import { BLOOM_DEFAULTS, BLOOM_SOURCE_LAYER, BloomPass, bloomMipSizes, bloomSource, bloomWeight, pixelRay, sunPixel } from "./BloomPass";

describe("bloomWeight", () => {
  const { threshold: t, knee: k } = BLOOM_DEFAULTS;
  it("is zero below the knee, so ordinary lit surfaces never glow", () => {
    expect(bloomWeight(0.5, t, k)).toBe(0);
    expect(bloomWeight(t - k, t, k)).toBe(0);
  });
  it("rises through the knee and tends to one far above the threshold", () => {
    const a = bloomWeight(t - k / 2, t, k);
    const b = bloomWeight(t, t, k);
    const c = bloomWeight(t + k, t, k);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(bloomWeight(1000, t, k)).toBeGreaterThan(0.99);
  });
});

describe("bloomMipSizes", () => {
  it("starts at half the buffer and halves to the 8 px floor or the cap", () => {
    expect(bloomMipSizes(1920, 1080, 5)).toEqual([[960, 540], [480, 270], [240, 135], [120, 67], [60, 33]]);
    expect(bloomMipSizes(1920, 1080, 8).length).toBe(7); // 15x8 is the last
    expect(bloomMipSizes(64, 32, 8)).toEqual([[32, 16], [16, 8]]);
    expect(bloomMipSizes(4, 4, 5)).toEqual([[2, 2]]);
  });
});

/** A renderer stand-in that records what the pass asks of it. */
function fakeRenderer(w = 1920, h = 1080, exposure = 2.5) {
  const log: { op: string; target: unknown; mask?: number; tone?: THREE.ToneMapping; space?: string }[] = [];
  let target: unknown = "prev";
  const r = {
    toneMapping: THREE.ACESFilmicToneMapping as THREE.ToneMapping,
    outputColorSpace: THREE.SRGBColorSpace as string,
    toneMappingExposure: exposure,
    autoClear: true,
    backend: { isWebGPUBackend: true },
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(w, h),
    getRenderTarget: () => target,
    setRenderTarget: (t: unknown) => { target = t; },
    clear: () => { log.push({ op: "clear", target }); },
    render: (scene: THREE.Object3D, camera: THREE.Camera) => {
      const quad = (scene as unknown as { material?: THREE.Material }).material;
      log.push({ op: quad ? quad.name : "scene", target, mask: camera.layers.mask, tone: r.toneMapping, space: r.outputColorSpace });
    },
  };
  return { r, log, renderer: r as unknown as WebGPURenderer };
}

describe("BloomPass disabled", () => {
  it("issues no renderer call, so the frame is the frame without post", () => {
    const calls: string[] = [];
    const renderer = new Proxy({}, {
      get: (_, key) => { calls.push(String(key)); return () => undefined; },
    }) as unknown as WebGPURenderer;
    const pass = new BloomPass();
    pass.enabled = false;
    pass.render(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), new THREE.Texture(), null);
    expect(calls).toEqual([]);
    expect(pass.mipCount).toBe(0);
    pass.dispose();
  });
});

describe("BloomPass node version (decision 0111)", () => {
  const frame = (depth: THREE.Texture | null) => {
    const f = fakeRenderer();
    const pass = new BloomPass();
    const camera = new THREE.PerspectiveCamera();
    camera.layers.set(0);
    const mask = camera.layers.mask;
    pass.render(f.renderer, new THREE.Scene(), camera, new THREE.Texture(), depth);
    return { ...f, pass, camera, mask };
  };

  it("filters at the renderer's exposure: the threshold sits after exposure", () => {
    const { pass } = frame(new THREE.DepthTexture(4, 4));
    expect(pass.lastExposure).toBe(2.5);
    expect(pass.uniformValues.exposure).toBe(2.5);
    expect(pass.uniformValues.sunCos).toBeCloseTo(Math.cos(THREE.MathUtils.degToRad(BLOOM_DEFAULTS.sunHaloDeg)), 12);
  });

  it("keeps dev's half-res chain and prefilter texel", () => {
    const { pass } = frame(new THREE.DepthTexture(4, 4));
    expect(pass.targetSizes).toEqual(bloomMipSizes(1920, 1080, BLOOM_DEFAULTS.maxMips));
    expect(pass.uniformValues.texel).toEqual([1 / 960, 1 / 540]);
  });

  it("masks the sky only when it has the scene depth", () => {
    expect(frame(new THREE.DepthTexture(4, 4)).pass.uniformValues.skyMask).toBe(1);
    expect(frame(null).pass.uniformValues.skyMask).toBe(0);
  });

  it("draws the bloom-source layer into mip 0 after the prefilter, then restores the camera's layers", () => {
    const { log, camera, mask } = frame(new THREE.DepthTexture(4, 4));
    const i = log.findIndex((e) => e.op === "es-bloom-prefilter");
    expect(log[i + 1].op).toBe("scene");
    expect(log[i + 1].mask).toBe(1 << BLOOM_SOURCE_LAYER);
    expect(log[i + 1].target).toBe(log[i].target);
    expect(camera.layers.mask).toBe(mask);
    expect(frame(null).log.some((e) => e.op === "scene")).toBe(false);
  });

  it("walks down then up the chain and composites onto the canvas without tone mapping, then restores state", () => {
    const { log, r } = frame(new THREE.DepthTexture(4, 4));
    const ops = log.map((e) => e.op);
    const n = bloomMipSizes(1920, 1080).length;
    expect(ops.filter((o) => o.startsWith("es-bloom-down")).length).toBe(n - 1);
    expect(ops.filter((o) => o.startsWith("es-bloom-up")).length).toBe(n - 1);
    const last = log[log.length - 1];
    expect(last.op).toBe("es-bloom-composite");
    expect(last.target).toBeNull();
    expect(last.tone).toBe(THREE.NoToneMapping);
    expect(last.space).toBe(THREE.LinearSRGBColorSpace);
    expect(r.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(r.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(r.getRenderTarget()).toBe("prev");
    expect(r.autoClear).toBe(true);
  });
});

describe("bloomSource: the sky is not scene content (walk 9 sun blob)", () => {
  const o = BLOOM_DEFAULTS;
  it("the halo outside the disc adds nothing, however bright (the dome clamps disc and halo alike)", () => {
    // dawn 06:30: the dome reads 30.4 at 2 deg from the sun, 21.0 at 8 deg (skyScreenModel)
    expect(bloomSource(30.4, false)).toBeGreaterThan(10);
    expect(bloomSource(30.4, true, o, 2)).toBe(0);
    expect(bloomSource(21.0, true, o, 8)).toBe(0);
  });
  it("the disc glows at every sun height, never by more than skyMax", () => {
    // the disc's dimmest reading across the day: 3.24 at noon (dawn 31.3, 14:30 6.0)
    expect(o.skyThreshold).toBeLessThan(3.24);
    // the rendered dome clamps the disc to its halo: noon reads 1.49 exposed at
    // the sun's own pixel (probe-bloom-sky sunBr, walk 9), so only the cone selects
    expect(o.skyThreshold + o.skyKnee).toBeLessThan(1.49);
    expect(bloomSource(1.49, true, o, 0)).toBeGreaterThan(0);
    expect(bloomSource(3.24, true, o, 0)).toBeGreaterThan(0);
    expect(bloomSource(31.3, true, o, 0)).toBe(o.skyMax);
    expect(bloomSource(o.skyThreshold - o.skyKnee, true, o, 0)).toBe(0);
    expect(o.skyMax).toBeLessThan(1);
  });
});

describe("the sun-disc cone sits on the sun in float32 (walk 9 integration)", () => {
  // the studio camera: near 0.3 m, far 60 km, looking at a low dawn sun
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 60000);
  const sun = new THREE.Vector3(0.6, Math.sin(THREE.MathUtils.degToRad(4)), -0.8).normalize();
  camera.position.set(1200, 35, -800);
  camera.lookAt(camera.position.clone().add(new THREE.Vector3(0.6, 0.12, -0.8)));
  camera.updateMatrixWorld();
  const f32 = (m: THREE.Matrix4 | THREE.Matrix3) => Float32Array.from(m.elements);
  const mul4 = (e: Float32Array, v: number[]) => [0, 1, 2, 3].map((r) =>
    Math.fround(v.reduce((s, x, c) => Math.fround(s + Math.fround(e[c * 4 + r] * x)), 0)));
  /** The shader's `inSunDisc` ray, every product rounded to float32. */
  const shaderRay = (u: number, v: number) => {
    const p = mul4(f32(camera.projectionMatrixInverse), [u * 2 - 1, v * 2 - 1, -1, 1]);
    const r = f32(new THREE.Matrix3().setFromMatrix4(camera.matrixWorld));
    const q = [0, 1, 2].map((i) => [0, 1, 2].reduce((s, c) => s + r[c * 3 + i] * Math.fround(p[c] / p[3]), 0));
    return new THREE.Vector3(q[0], q[1], q[2]).normalize();
  };
  it("the texel the sun projects to is inside sunHaloDeg, by the shader's own ray", () => {
    const [w, h] = [240, 135];
    const px = sunPixel(camera, sun, w, h);
    expect(px).not.toBeNull();
    const [x, y] = px!;
    expect(THREE.MathUtils.radToDeg(pixelRay(camera, x, y, w, h).angleTo(sun))).toBeLessThan(BLOOM_DEFAULTS.sunHaloDeg);
    expect(THREE.MathUtils.radToDeg(shaderRay((x + 0.5) / w, (y + 0.5) / h).angleTo(sun)))
      .toBeLessThan(BLOOM_DEFAULTS.sunHaloDeg);
  });
  it("a sun behind the camera has no pixel", () => {
    expect(sunPixel(camera, sun.clone().negate(), 240, 135)).toBeNull();
  });
});
