import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { NodeMaterial, QuadMesh, RenderTarget, type WebGPURenderer } from "three/webgpu";
import * as TSLNS from "three/tsl";
import { sel, type TslNode } from "../../render/nodes/materialNodes";
// TSL typings are too deep for tsc to check usefully (0107 §1): the graph is typed as TslNode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  abs, clamp, cos, dot, exp, float, fract, getViewPosition, length, max, min, normalize, pow, reference, sin,
  texture, uniform, uv, vec2, vec4,
} = TSLNS as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const n = (v: TslNode): any => v;
import { ALL_WATER_LAYERS, type WaterAssets, type WaterDebugState, type WaterRuntime } from "./types";
import { OVERLAY_LAYER, PRECIP_LAYER, WATER_LAYER, type WaterTier } from "./waterMaterial";
import type { RippleSim } from "./RippleSim";
import { deferBuildsInto } from "../../render/shaderBuildQueue";
import type { WaterSurfaceHandle } from "./WaterSurface";
import { UnderwaterBubblePass } from "./UnderwaterBubblePass";
import { useFrameSegments } from "../../fx/frameSegments";
import { lightEveryLayer } from "./lightLayers";
import type { BloomPass } from "../../render/post/BloomPass";

/**
 * The shared render-pass architecture (module 60 §41, decision 0025) — ONE
 * scene render per frame:
 *
 * 1. opaques + sky (water hidden; when submerged, the water underside too)
 *    → half-float RT with a depth texture, tone mapping off (linear HDR);
 * 2. tone-mapped fullscreen blit → screen (the blit material also carries
 *    the underwater pass: per-channel Beer–Lambert fog + god rays);
 * 3. above water only: the water surface renders on top, sampling the RT for
 *    refraction, thickness, SSR and manual depth occlusion.
 *
 * Adapted from WaterThreeJS's frame pipeline (MIT, © achrefelouafi),
 * rebuilt for r3f + the 8a exposure/CSM/PMREM stack.
 */

export type { WaterDebugState } from "./types";

/** Underwater god-ray caustic pattern (the blit's `esCaustics`, TSL twin). */
function esCaustics(uv: TslNode, t: TslNode): TslNode {
  const p = n(uv).mul(6.2831853).mod(6.2831853).sub(250.0);
  let i = n(vec2(p));
  let c = n(float(1.0));
  const inten = 0.0045;
  for (let k = 0; k < 3; k++) {
    const tt = n(t).mul(1.0 - 3.5 / (k + 1));
    i = n(p.add(vec2(n(cos(tt.sub(i.x))).add(sin(tt.add(i.y))), n(sin(tt.sub(i.y))).add(cos(tt.add(i.x))))));
    c = c.add(float(1.0).div(length(vec2(p.x.div(n(sin(i.x.add(tt))).div(inten)), p.y.div(n(cos(i.y.add(tt))).div(inten))))));
  }
  c = c.div(3.0);
  c = float(1.17).sub(pow(c, 1.4));
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

function createBlit(rt: RenderTarget, tier: WaterTier, sunDirection: { value: THREE.Vector3 }) {
  const uniforms = {
    uSceneColorB: texture(rt.texture),
    uSceneDepthB: texture(rt.depthTexture as THREE.Texture),
    uUnderwater: uniform(0),
    uCamPos: uniform(new THREE.Vector3()),
    uProjInverse: uniform(new THREE.Matrix4()),
    uCamWorld: uniform(new THREE.Matrix4()),
    uUwAbsorb: uniform(new THREE.Vector3(0.3, 0.1, 0.06)),
    uUwFog: uniform(new THREE.Vector3(0, 0, 0)),
    uUwSurfaceY: uniform(0),
    uUwTime: uniform(0),
    uGodRays: uniform(tier.godRays ? 1 : 0),
    // shared with the sky rig — live sun direction, no per-frame copy
    uSunDirW: reference("value", "vec3", sunDirection),
    uBubbleColor: texture(new THREE.Texture()),
    uBubbleActive: uniform(0),
  };
  const u = uniforms as Record<string, TslNode>;
  const vUv = n(uv());
  const base = n(n(u.uSceneColorB).sample(vUv)).rgb;
  const sceneDepth = n(n(u.uSceneDepthB).sample(vUv)).x;
  // Underwater: Beer–Lambert murk over the view distance + god rays + grain
  const viewPos = n(getViewPosition(vUv, sceneDepth, u.uProjInverse));
  const worldPos = n(n(u.uCamWorld).mul(vec4(viewPos, 1.0))).xyz;
  const toFrag = worldPos.sub(u.uCamPos);
  const viewDist = n(min(length(toFrag), 400.0));
  const rd = n(normalize(toFrag));
  const trans = n(exp(n(u.uUwAbsorb).negate().mul(viewDist)));
  let under = n(base.mul(trans).add(n(u.uUwFog).mul(float(1.0).sub(trans))));
  const sun = n(u.uSunDirW);
  const dither = fract(n(sin(n(dot(vUv, vec2(12.9898, 78.233))).add(u.uUwTime))).mul(43758.5453));
  const march = min(viewDist, 60.0);
  const dt = n(march).div(14.0);
  let acc = n(float(0.0));
  for (let k = 0; k < 14; k++) {
    const P = n(u.uCamPos).add(rd.mul(n(dither).add(k).mul(dt)));
    const below = n(u.uUwSurfaceY).sub(P.y);
    const proj = below.div(max(sun.y, 0.15));
    const sxz = n(P.add(sun.mul(proj))).xz;
    const term = n(esCaustics(sxz.mul(0.05).add(sun.xz.mul(u.uUwTime).mul(0.2)), n(u.uUwTime).mul(0.4)))
      // max(below, 0): identical where the term is kept, finite where it is not (sel() multiplies both)
      .mul(exp(max(below, 0.0).mul(-0.05)));
    // `continue` above the surface in the GLSL: the sample adds nothing there
    acc = acc.add(sel(below.lessThanEqual(0.0), float(0.0), term));
  }
  acc = acc.mul(dt);
  const mu = n(clamp(dot(rd, sun), -1.0, 1.0));
  const phase = float(0.0796 * (1.0 - 0.5184)).div(pow(float(1.0 + 0.5184).sub(mu.mul(1.44)), 1.5));
  const rays = n(u.uUwFog).mul(acc).mul(0.10).mul(phase).mul(12.5663706);
  under = n(sel(n(u.uGodRays).greaterThan(0.5).and(sun.y.greaterThan(0.05)), under.add(rays), under));
  // multiplicative grain before tone mapping — kills the 8-bit banding the
  // smooth murk gradients otherwise show (owner round 1, defect 6)
  const grain = fract(n(sin(n(dot(vUv.mul(vec2(1723.0, 1093.0)), vec2(12.9898, 78.233))).add(n(u.uUwTime).mul(7.0)))).mul(43758.5453));
  under = under.mul(n(grain).sub(0.5).mul(0.05).add(1.0));
  let colour = n(sel(n(u.uUnderwater).greaterThan(0.5), under, base));
  // underwater bubble composite (premultiplied, half-res target)
  const bubbles = n(n(u.uBubbleColor).sample(vUv));
  colour = n(sel(n(u.uBubbleActive).greaterThan(0.5), colour.mul(float(1.0).sub(bubbles.a)).add(bubbles.rgb), colour));
  const material = new NodeMaterial();
  material.fragmentNode = vec4(colour, 1.0);
  // The blit also WRITES the scene depth, so the water pass gets hardware
  // z-culling of buried surface (perf) and the overlay pass (markers)
  // occludes correctly behind terrain.
  material.depthNode = sceneDepth;
  material.depthTest = true;
  material.depthWrite = true;
  material.depthFunc = THREE.AlwaysDepth;
  material.name = "es-water-blit-bubbles";
  const quad = new QuadMesh(material);
  return { quad, material, uniforms };
}

export function WaterPipeline({ runtime, assets, tier, verticalScale, handle, ripple, bloom }: {
  runtime: WaterRuntime;
  assets: WaterAssets;
  tier: WaterTier;
  verticalScale: number;
  handle: () => WaterSurfaceHandle | null;
  ripple?: RippleSim | null;
  /** The host's glow pass (render/post/BloomPass.ts), drawn above water
   * after the overlay; null/absent or disabled: no post pass at all. */
  bloom?: BloomPass | null;
}) {
  const { gl } = useThree();
  // Pass attribution only (decision 0084 round 10): the marks below change
  // no pipeline behaviour.
  const segments = useFrameSegments();
  /** Drawing-buffer size, read into this every frame (walk 5 perf). */
  const bufferSize = useMemo(() => new THREE.Vector2(), []);
  const frames = useRef(0);
  const bubblePass = useMemo(() => new UnderwaterBubblePass(tier.name === "low"), [tier.name]);
  useEffect(() => () => bubblePass.dispose(), [bubblePass]);

  const makeTarget = (w: number, h: number) => {
    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = THREE.UnsignedIntType;
    const target = new RenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      depthTexture,
      samples: tier.samples,
    });
    target.texture.colorSpace = THREE.NoColorSpace;
    return target;
  };
  const rt = useMemo(() => {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    return makeTarget(Math.max(2, Math.round(size.x * tier.rtScale)), Math.max(2, Math.round(size.y * tier.rtScale)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, tier]);
  /**
   * A second scene target, made the first time the camera goes under.
   *
   * Submerged, pass 1 draws the water's UNDERSIDE into the scene target while
   * that material refracts the scene through `uSceneColor` and soft-depths
   * against `uSceneDepth` — the same target it is being drawn into. That is a
   * framebuffer feedback loop (undefined on every GPU; ANGLE reports
   * GL_INVALID_OPERATION per draw and some drivers stall on it). Under water
   * the underside therefore samples the PREVIOUS frame's target and the two
   * targets swap each frame; one frame of refraction latency is invisible.
   */
  const rtAlt = useRef<RenderTarget | null>(null);
  const swap = useRef(false);
  /**
   * Resize a scene target AND its depth texture together. three's
   * `RenderTarget.setSize` updates the colour texture's image size and
   * disposes the GL objects, but leaves `depthTexture.image` at the old size
   * (only `setupDepthTexture` corrects it, and only when the target is next
   * RENDERED INTO). Under water the ping-pong samples the other target's
   * depth texture before that target is rendered, so after a canvas resize
   * (DevTools opening, a window drag, a DPR change) three re-uploaded that
   * depth texture at the stale size as immutable storage; next frame it was
   * attached beside a colour texture of the new size: "Framebuffer is
   * incomplete: Attachments are not all the same size" on every clear and
   * draw until the next resize. Keeping the image in step makes the first
   * upload — sampled or attached — the right size (16f round 4).
   */
  const resizeTarget = (t: RenderTarget, w: number, h: number) => {
    if (t.width === w && t.height === h) return;
    t.setSize(w, h);
    const d = t.depthTexture;
    if (d) { d.image.width = w; d.image.height = h; d.needsUpdate = true; }
  };

  const blit = useMemo(() => createBlit(rt, tier, runtime.sunDirection), [rt, tier, runtime]);

  useEffect(() => () => {
    rt.dispose();
    rtAlt.current?.dispose();
    rtAlt.current = null;
    blit.material.dispose();
  }, [rt, blit]);

  // Context-loss telemetry: a lost WebGL context looks like a freeze (the
  // last frame stays up) — record it so probes and bug reports can tell.
  const contextLost = useRef(false);
  useEffect(() => {
    const el = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
      contextLost.current = true;
      console.warn("WebGL context lost (water pipeline active)");
    };
    const onRestored = () => {
      contextLost.current = false;
    };
    el.addEventListener("webglcontextlost", onLost);
    el.addEventListener("webglcontextrestored", onRestored);
    return () => {
      el.removeEventListener("webglcontextlost", onLost);
      el.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl]);

  // three only applies lights whose layers intersect the camera's — the
  // water-only pass (mask = WATER_LAYER) was therefore rendered WITHOUT the
  // CSM sun/moon (no glints, no shadows; owner round 1, defect 1). Every
  // light is enabled on every layer (lightLayers.ts says why every pass must
  // see one light set), re-checked as lights come and go.
  const lightPatchTimer = useRef(0);
  const viewProj = useRef(new THREE.Matrix4());
  const debugState = useRef<WaterDebugState>({
    tier: "", underwater: false, surfaceAtCameraM: 0, tideOffsetM: 0, seasonOffsetM: 0, cameraDepthM: 0,
    rtSamples: 0, frames: 0, contextLost: false,
    camera: { viewProj: new Array<number>(16).fill(0), width: 0, height: 0, verticalScale: 1 },
  });
  const shadowLights = useRef<THREE.DirectionalLight[]>([]);
  // (The precip and overlay passes are never skipped: an empty-layer walk
  // costs ~0.3 ms, and a skip keyed on a 1 Hz count missed objects mounted
  // between ticks for up to a second. Not worth it.)

  useFrame(({ gl: glRenderer, scene, camera }, delta) => {
    const renderer = glRenderer as unknown as WebGPURenderer;
    const h = handle();
    lightPatchTimer.current -= delta;
    if (lightPatchTimer.current <= 0) {
      lightPatchTimer.current = 1;
      lightEveryLayer(scene);
      const lights: THREE.DirectionalLight[] = [];
      shadowLights.current = lights;
      scene.traverse((o) => {
        const shadow = (o as THREE.DirectionalLight).shadow;
        if ((o as THREE.Light).isLight && o.castShadow && shadow) lights.push(o as THREE.DirectionalLight);
      });
    }
    const size = renderer.getDrawingBufferSize(bufferSize);
    const rw = Math.max(2, Math.round(size.x * tier.rtScale));
    const rh = Math.max(2, Math.round(size.y * tier.rtScale));
    resizeTarget(rt, rw, rh);
    if (rtAlt.current) resizeTarget(rtAlt.current, rw, rh);

    // Shadow type, normalised BEFORE any material compiles this frame.
    // three r184 deprecates PCFSoftShadowMap and rewrites it to PCFShadowMap
    // inside `shadowMap.render` — but that runs only on the frames this
    // pipeline lets shadows update (every other one), and r3f's
    // `<Canvas shadows="soft">` writes PCFSoft back on every Canvas render.
    // A material compiled on a frame that still reads PCFSoft gets the
    // SHADOWMAP_TYPE_BASIC define (`sampler2D` shadow samplers) bound to the
    // PCF comparison-mode depth textures: "Mismatch between texture format
    // and sampler type (shadow)" on every draw of that material, for good,
    // because the program key never changes. One write here keeps every
    // compile and every shadow pass on PCF and stops the per-frame warning.
    if (renderer.shadowMap.type === THREE.PCFSoftShadowMap) renderer.shadowMap.type = THREE.PCFShadowMap;

    const epoch = runtime.epochMinutes();
    const cam = camera as THREE.PerspectiveCamera;
    const camPos = cam.position;
    const trueX = camPos.x;
    const trueZ = camPos.z;
    const trueY = camPos.y / Math.max(verticalScale, 1e-6);
    const camSample = assets.world.sample({ x: trueX, y: trueY, z: trueZ }, epoch);
    const underwater = camSample.depth > 0 && trueY < camSample.surfaceHeight - 0.06;

    // Which target this frame renders INTO and which one the water reads.
    // Above water both are `rt` (the surface is drawn in pass 3, after the
    // scene is complete). Under water they are the two ping-pong targets.
    if (underwater && !rtAlt.current) rtAlt.current = makeTarget(rw, rh);
    const alt = rtAlt.current;
    const drawTarget = underwater && alt && swap.current ? alt : rt;
    const readTarget = underwater && alt ? (drawTarget === rt ? alt : rt) : rt;

    // feed the water material's shared per-frame camera uniforms
    if (h) {
      h.uniforms.uSceneColor.value = readTarget.texture;
      h.uniforms.uSceneDepth.value = readTarget.depthTexture as THREE.Texture;
      h.uniforms.uCamNear.value = cam.near;
      h.uniforms.uCamFar.value = cam.far;
      // The surface, the effects and the falls read the scene at
      // gl_FragCoord / resolution, so the resolution is that of the buffer
      // they are DRAWN INTO: the canvas above water (pass 3), the
      // rtScale-sized scene target when submerged (pass 1) — the canvas size
      // there mis-registered every read by 1/rtScale (16f round 4).
      const passW = underwater ? rw : size.x;
      const passH = underwater ? rh : size.y;
      h.uniforms.uResolution.value.set(passW, passH);
      h.uniforms.uProjMatrix.value.copy(cam.projectionMatrix);
      h.setUnderwater(underwater);
      h.effects.setDepth(readTarget.depthTexture as THREE.Texture, cam.near, cam.far, passW, passH);
      // sheets + mist: fade at the surface when submerged, and no soft-depth
      // read while the water layer draws into the scene target (feedback)
      h.falls?.setUnderwater(underwater, camSample.surfaceHeight * verticalScale);
      h.falls?.setDepth(readTarget.depthTexture as THREE.Texture, cam.near, cam.far, passW, passH);
    }

    // ---- pass 0: advance the interactive ripple patch (2 tiny passes) and
    // the persistent foam energy field (one pass; advected by the flow) ----
    segments?.cpuMark("ripple"); segments?.gpuMark("ripple");
    ripple?.step(renderer, camPos.x, camPos.z, delta);
    segments?.cpuMark("foam"); segments?.gpuMark("foam");
    h?.foam?.update(renderer, camPos.x, camPos.z, runtime.transportDeltaS?.() ?? delta);

    // ---- pass 1: opaques (+ underside when submerged) → RT, linear HDR ----
    const prevTone = renderer.toneMapping;
    const prevTarget = renderer.getRenderTarget();
    const prevLayers = cam.layers.mask;
    // shadow maps re-render every OTHER frame — the sun moves slowly and
    // the cascade passes are a big slice of the frame (owner round 4 perf)
    // (node renderer: shadow updates are per light — `shadow.autoUpdate` off,
    // `needsUpdate` on alternate frames; the scene pass consumes the flag, so
    // the later water/precip/overlay passes never re-render the maps)
    for (const light of shadowLights.current) {
      light.shadow.autoUpdate = false;
      if ((frames.current & 1) === 0) light.shadow.needsUpdate = true;
    }
    renderer.toneMapping = THREE.NoToneMapping;
    cam.layers.mask = underwater ? (1 | (1 << WATER_LAYER)) : 1;
    // Above water the surface reads the SAME target pass 1 draws into. Its
    // scene-colour/depth samplers still point at that target from last
    // frame's pass 3, and a driver that validates framebuffer feedback per
    // draw (ANGLE over Metal) pays for it on every opaque draw. The
    // samplers are only read in pass 3, so they are cleared for pass 1 and
    // re-pointed after it (round 12 follow-up, owner reading 2026-09-22:
    // `scene` CPU 11.0 ms with water on against 4.2 ms without). Submerged,
    // pass 1 IS the pass that draws the water layer, and it reads the other
    // ping-pong target, so the samplers stay.
    const sceneColor = h?.uniforms.uSceneColor.value ?? null;
    const sceneDepth = h?.uniforms.uSceneDepth.value ?? null;
    if (h && !underwater) {
      h.uniforms.uSceneColor.value = h.uniforms.placeholders.color;
      h.uniforms.uSceneDepth.value = h.uniforms.placeholders.depth;
    }
    deferBuildsInto(renderer, drawTarget); // the frame's scene pass: its builds queue like the canvas's
    // ONE whole-scene matrix walk a frame (decision 0108 §7a): every render
    // below (the scene pass, each shadow cascade it renders inside it, the
    // water, precipitation and overlay passes) reuses these world matrices,
    // since nothing moves between them (webgpu10 diag20 E5b: 4+ walks).
    scene.updateMatrixWorld();
    const prevMatrixAuto = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    renderer.setRenderTarget(drawTarget);
    renderer.clear();
    segments?.cpuMark("scene"); segments?.gpuMark("scene");
    renderer.render(scene, cam);
    // The blit's uniform block below is billed to the blit, not the scene.
    segments?.cpuMark("blit"); segments?.gpuMark("blit");
    if (h) {
      if (sceneColor) h.uniforms.uSceneColor.value = sceneColor;
      if (sceneDepth) h.uniforms.uSceneDepth.value = sceneDepth;
    }
    renderer.toneMapping = prevTone;
    if (underwater && alt) swap.current = !swap.current;

    // ---- pass 2: tone-mapped blit (+ underwater fog/god rays) → screen ----
    const bu = blit.uniforms;
    bu.uSceneColorB.value = drawTarget.texture;
    bu.uSceneDepthB.value = drawTarget.depthTexture as THREE.Texture;
    bu.uUnderwater.value = underwater ? 1 : 0;
    bu.uUwTime.value = runtime.waveTimeS();
    bu.uCamPos.value.copy(camPos);
    bu.uProjInverse.value.copy(cam.projectionMatrixInverse);
    bu.uCamWorld.value.copy(cam.matrixWorld);
    bu.uUwSurfaceY.value = camSample.surfaceHeight * verticalScale;
    // Underwater visibility by clarity (16c round 2): the floor is clear
    // water (turbidity 0 sees ~20 m — an upland lake), the turbidity term
    // takes a silt river to ~3 m at 0.5. The old floor (0.10, 0.055, 0.04)
    // made every lake a murk regardless of the compiled clarity.
    const turb = camSample.turbidity;
    bu.uUwAbsorb.value.set(
      0.045 + 0.6 * turb,
      0.028 + 0.8 * turb,
      0.022 + 1.15 * turb,
    );
    const amb = runtime.ambient.value;
    // fog tint per channel, inline: no per-frame vector (walk 5 perf audit item 11)
    bu.uUwFog.value.set(
      Math.max(amb.x, 1e-4) * (0.035 + 0.055 * turb) * 24.0,
      Math.max(amb.y, 1e-4) * (0.115 - 0.064 * turb) * 24.0,
      Math.max(amb.z, 1e-4) * (0.10 - 0.078 * turb) * 24.0,
    );
    const bubbleTex = bubblePass.render(renderer, cam, h?.bubbles, underwater,
      drawTarget.depthTexture as THREE.Texture, rw, rh, bu.uUwAbsorb.value, bu.uUwFog.value);
    if (bubbleTex) bu.uBubbleColor.value = bubbleTex;
    bu.uBubbleActive.value = bubbleTex ? 1 : 0;
    renderer.setRenderTarget(null);
    blit.quad.render(renderer);

    // ---- pass 3: water surface, then the display-referred overlay --------
    {
      const prevAuto = renderer.autoClear;
      // These passes draw OVER the blit. three (r184) clears on every
      // render() when scene.background is a Color or a Texture, whatever
      // autoClear says, which wiped the whole frame to the fog colour the
      // first time a host set a background (the interior grey screen, 16k
      // walk 4). No background exists while the on-screen passes run.
      const prevBackground = scene.background;
      scene.background = null;
      renderer.autoClear = false;
      if (!underwater && h) {
        cam.layers.mask = 1 << WATER_LAYER;
        segments?.cpuMark("water"); segments?.gpuMark("water");
        renderer.render(scene, cam);
      }
      // Precipitation AFTER the water surface (round 4): rain is depth-write
      // free, so anything drawn in a later pass overpainted it — which is why
      // rain disappeared behind every ocean, river and pool. It still
      // depth-TESTS against the scene depth the blit wrote, so terrain
      // occludes it normally. Rain also tone-maps itself, so drawing it
      // straight to screen after the blit is colour-correct.
      // (Not when submerged: there is no rain to see from under the surface,
      // and this pass draws straight to screen, past the underwater fog.)
      if (!underwater) {
        cam.layers.mask = 1 << PRECIP_LAYER;
        segments?.cpuMark("precip"); segments?.gpuMark("precip");
        renderer.render(scene, cam);
      }
      // markers etc. draw straight to screen (no tone mapping crush),
      // depth-tested against the scene depth the blit wrote
      cam.layers.mask = 1 << OVERLAY_LAYER;
      segments?.cpuMark("overlay"); segments?.gpuMark("overlay");
      renderer.render(scene, cam);
      // 4. glow around bright lights (decision 0108 post row), from the
      // linear HDR target this frame drew, onto the canvas
      if (bloom?.enabled && !underwater) {
        segments?.cpuMark("bloom"); segments?.gpuMark("bloom");
        bloom.render(renderer, scene, cam, drawTarget.texture, drawTarget.depthTexture as THREE.Texture);
      }
      segments?.cpuMark("post"); segments?.gpuMark("post");
      scene.background = prevBackground;
      renderer.autoClear = prevAuto;
    }
    cam.layers.mask = prevLayers;
    scene.matrixWorldAutoUpdate = prevMatrixAuto;
    renderer.setRenderTarget(prevTarget);

    frames.current += 1;
    if (runtime.onDebug) {
      // One debug record rewritten in place (walk 5 perf): no object, camera
      // block or 16-number array per frame.
      const d = debugState.current;
      const levels = assets.world.levelOffsets(epoch);
      d.tier = tier.name;
      d.underwater = underwater;
      d.surfaceAtCameraM = camSample.surfaceHeight;
      d.tideOffsetM = levels.tide;
      d.seasonOffsetM = levels.season;
      d.cameraDepthM = Math.max(0, camSample.surfaceHeight - trueY);
      d.rtSamples = tier.samples;
      d.frames = frames.current;
      d.contextLost = contextLost.current;
      d.effects = h?.effects.diagnostics;
      d.bubbles = h?.bubbles?.diagnostics;
      d.bubblePass = bubblePass.diagnostics;
      d.strips = h ? h.stripDiagnostics : undefined;
      d.falls = h?.falls?.diagnostics;
      d.layers = runtime.waterLayers?.() ?? ALL_WATER_LAYERS;
      const c = d.camera!;
      viewProj.current.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).toArray(c.viewProj);
      c.width = size.x; c.height = size.y; c.verticalScale = verticalScale;
      runtime.onDebug(d);
    }
  }, 1);

  return null;
}
