import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";


import type { WaterAssets, WaterRuntime } from "./types";
import { WATER_CAUSTICS_GLSL } from "./caustics";
import { createWaterUniforms, SAMPLER_GLSL, OVERLAY_LAYER, PRECIP_LAYER, WATER_LAYER, type WaterTier } from "./waterMaterial";

import type { RippleSim } from "./RippleSim";
import type { WaterSurfaceHandle } from "./WaterSurface";

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


const CAUSTICS_GLSL = /* glsl */ `
  float esCaustics(vec2 uv, float t){
    vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.0;
    vec2 i = vec2(p);
    float c = 1.0;
    float inten = 0.0045;
    for (int n = 0; n < 3; n++){
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c /= 3.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 8.0), 0.0, 1.0);
  }
`;

export function WaterPipeline({ assets, tier, verticalScale, handle, ripple, runtime }: {
  runtime: WaterRuntime;
  assets: WaterAssets;
  tier: WaterTier;
  verticalScale: number;
  handle: () => WaterSurfaceHandle | null;
  ripple?: RippleSim | null;
}) {
  const { gl } = useThree();
  const frames = useRef(0);

  const rt = useMemo(() => {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(2, Math.round(size.x * tier.rtScale));
    const h = Math.max(2, Math.round(size.y * tier.rtScale));
    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = THREE.UnsignedIntType;
    const target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      depthTexture,
      samples: tier.samples,
    });
    target.texture.colorSpace = THREE.NoColorSpace;
    return target;
  }, [gl, tier]);

  const blit = useMemo(() => {
    const uniforms = {
      ...createWaterUniforms(assets),
      uUnderwater: { value: 0 },
      uSceneDepthB: { value: rt.depthTexture as THREE.Texture },
      uCamPos: { value: new THREE.Vector3() },
      uUwAbsorb: { value: new THREE.Vector3(0.3, 0.1, 0.06) },
      uUwFog: { value: new THREE.Vector3(0, 0, 0) },
      uUwSurfaceY: { value: 0 },
      uUwTime: { value: 0 },
      uGodRays: { value: tier.godRays ? 1 : 0 },
    };
    // The blit also WRITES the scene depth to the canvas depth buffer, so the
    // water pass gets hardware z-culling of buried surface (perf) and the
    // overlay pass (markers) occludes correctly behind terrain.
    const material = new THREE.MeshBasicMaterial({
      map: rt.texture,
      depthTest: true,
      depthWrite: true,
    });
    material.depthFunc = THREE.AlwaysDepth;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          /* glsl */ `#include <common>
uniform float uUnderwater;
uniform sampler2D uSceneDepthB;
uniform mat4 uInvProjView;
uniform vec3 uCamPos;
uniform vec3 uUwAbsorb;
uniform vec3 uUwFog;
uniform float uUwSurfaceY;
uniform float uUwTime;
uniform float uGodRays;
uniform float uVerticalScale;
uniform vec3 uSunDirection;
uniform float uDirectSun;
uniform float uCausticsInOpaque;
${SAMPLER_GLSL}
${WATER_CAUSTICS_GLSL}
${CAUSTICS_GLSL}`,
        )
        .replace(
          "#include <opaque_fragment>",
          /* glsl */ `
if (uUnderwater > 0.5) {
  float esD = texture2D(uSceneDepthB, vMapUv).x;
  vec4 esClip = vec4(vMapUv * 2.0 - 1.0, esD * 2.0 - 1.0, 1.0);
  vec4 esWp = uInvProjView * esClip;
  esWp /= esWp.w;
  esWp.y /= max(uVerticalScale, 0.001);
  vec3 esToFrag = esWp.xyz - uCamPos;
  float esViewDist = min(length(esToFrag), 400.0);
  vec3 esRd = esToFrag / max(length(esToFrag), 0.0001);
  // Reconstruct the actual receiver, not the water surface or camera's
  // water class. Keep the camera-facing normal: flipping it upward would
  // put caustics onto the water underside when looking through Snell's window.
  vec3 esBedNormal = cross(dFdx(esWp.xyz), dFdy(esWp.xyz));
  esBedNormal /= max(length(esBedNormal), 0.0001);
  vec2 esBedSurface = esSurfaceAt(esWp.xz);
  vec3 esBedShore = esShoreAt(esWp.xz);
  vec3 esBedClass = texture2D(uKlassTex, esFlowUv(esWp.xz)).rgb;
  vec3 esBedSupport = esSupportAt(esWp.xz);
  vec3 esBedStage = esStageAt(esWp.xz, esBedClass.b, esBedShore.g);
  float esBedLevelOffset = uLevelTide * esBedStage.y
    + uLevelSeason * esBedStage.z;
  float esBedLevel = esBedSurface.x + esBedLevelOffset;
  float esWaterColumn = esBedSurface.y + esBedLevelOffset;
  float esBedValid = (1.0 - step(0.999999, esD)) * step(0.5, esBedSupport.r)
    * (uHasAccess < 0.5 ? 1.0 : step(esBedStage.x, esBedLevelOffset + 0.001))
    * smoothstep(0.02, 0.10, esWaterColumn)
    * smoothstep(0.06, 0.18, esBedLevel - esWp.y);
  float esBedActivity = clamp(uWindWave * 0.3 + length(esFlowAt(esWp.xz)) * 0.2, 0.15, 1.0);
  // The source already contains opaque-material shadowing. Multiplication
  // preserves that darkness; this colour/depth pass cannot isolate ambient
  // from direct illumination as a separate shadow-buffer pass could.
  float esBedCaustic = esWaterCaustics(esWp.xyz, esBedNormal, esBedLevel,
    esBedClass.g, esBedShore.b, uSunDirection, uDirectSun,
    uWaveTime, esBedActivity);
  outgoingLight *= 1.0 + esBedCaustic * esBedValid * 0.8 * (1.0 - uCausticsInOpaque)
    * (1.0 - smoothstep(80.0, 160.0, esViewDist));
  vec3 esTrans = exp(-uUwAbsorb * esViewDist);
  outgoingLight = outgoingLight * esTrans + uUwFog * (1.0 - esTrans);
  if (uGodRays > 0.5 && uSunDirection.y > 0.05) {
    float esDither = fract(sin(dot(vMapUv, vec2(12.9898, 78.233)) + uUwTime) * 43758.5453);
    float esMarch = min(esViewDist, 60.0);
    float esDt = esMarch / 14.0;
    float esAcc = 0.0;
    for (int i = 0; i < 14; i++) {
      vec3 esP = uCamPos + esRd * ((float(i) + esDither) * esDt);
      float esBelow = uUwSurfaceY - esP.y;
      if (esBelow <= 0.0) continue;
      float esProj = esBelow / max(uSunDirection.y, 0.15);
      vec2 esSxz = (esP + uSunDirection * esProj).xz;
      esAcc += esCaustics(esSxz * 0.05 + uSunDirection.xz * uUwTime * 0.2, uUwTime * 0.4) * exp(-esBelow * 0.05);
    }
    esAcc *= esDt;
    float esMu = clamp(dot(esRd, uSunDirection), -1.0, 1.0);
    float esPhase = 0.0796 * (1.0 - 0.5184) / pow(1.0 + 0.5184 - 1.44 * esMu, 1.5);
    outgoingLight += uUwFog * esAcc * 0.10 * esPhase * 12.5663706;
  }
  // multiplicative grain before tone mapping — kills the 8-bit banding the
  // smooth murk gradients otherwise show (owner round 1, defect 6)
  float esGrain = fract(sin(dot(vMapUv * vec2(1723.0, 1093.0), vec2(12.9898, 78.233)) + uUwTime * 7.0) * 43758.5453);
  outgoingLight *= 1.0 + (esGrain - 0.5) * 0.05;
}
#include <opaque_fragment>
gl_FragDepth = texture2D(uSceneDepthB, vMapUv).x;`,
        );
    };
    material.customProgramCacheKey = () => "es-water-blit-caustics-v2";
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    scene.add(quad);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { scene, camera, material, uniforms, quad };
  }, [rt, tier, assets]);

  useEffect(() => () => rt.dispose(), [rt]);
  useEffect(() => () => {
    blit.scene.remove(blit.quad);
    blit.quad.geometry.dispose();
    blit.material.dispose();
  }, [blit]);

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
  // CSM sun/moon (no glints, no shadows; owner round 1, defect 1). Enable
  // the water layer on every light, re-checked as lights come and go.
  const lightPatchTimer = useRef(0);

  useFrame(({ gl: renderer, scene, camera }, delta) => {
    const h = handle();
    lightPatchTimer.current -= delta;
    if (lightPatchTimer.current <= 0) {
      lightPatchTimer.current = 1;
      scene.traverse((o) => {
        if ((o as THREE.Light).isLight) o.layers.enable(WATER_LAYER);
      });
    }
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rw = Math.max(2, Math.round(size.x * tier.rtScale));
    const rh = Math.max(2, Math.round(size.y * tier.rtScale));
    if (rt.width !== rw || rt.height !== rh) rt.setSize(rw, rh);

    const epoch = runtime.epochMinutes();
    const cam = camera as THREE.PerspectiveCamera;
    const camPos = cam.position;
    const trueX = camPos.x;
    const trueZ = camPos.z;
    const trueY = camPos.y / Math.max(verticalScale, 1e-6);
    const camSample = assets.world.sample({ x: trueX, y: trueY, z: trueZ }, epoch);
    const camWater = assets.data.sample(trueX, trueZ);
    const levels = assets.world.levelOffsets(epoch);
    const directSun = Math.min(1, runtime.sunLight.value.length() * 0.08)
      * Math.max(0, Math.min(1, runtime.sunDirection.value.y * 5));
    const underwater = camSample.depth > 0 && trueY < camSample.surfaceHeight - 0.06;

    // feed the water material's shared per-frame camera uniforms
    if (h) {
      h.uniforms.uSceneColor.value = rt.texture;
      h.uniforms.uSceneDepth.value = rt.depthTexture as THREE.Texture;
      h.uniforms.uCamNear.value = cam.near;
      h.uniforms.uCamFar.value = cam.far;
      h.uniforms.uResolution.value.set(size.x, size.y);
      h.uniforms.uProjMatrix.value.copy(cam.projectionMatrix);
      h.uniforms.uInvProjView.value.copy(cam.projectionMatrix).multiply(cam.matrixWorldInverse).invert();
      h.uniforms.uSunDirection.value.copy(runtime.sunDirection.value);
      h.uniforms.uCausticsInOpaque.value = runtime.causticsInOpaque ? 1 : 0;
      h.uniforms.uDirectSun.value = directSun;
      h.effects.setDepth(rt.depthTexture as THREE.Texture, cam.near, cam.far, size.x, size.y);
      for (const mesh of h.meshes) mesh.material = underwater ? h.materials.below : h.materials.above;
    }

    // Restore every renderer/camera setting exactly once, including failures.
    // Taking the shadow setting AFTER disabling it left the app permanently
    // in manual-shadow mode when the water pipeline unmounted.
    const prevTone = renderer.toneMapping;
    const prevTarget = renderer.getRenderTarget();
    const prevLayers = cam.layers.mask;
    const prevAuto = renderer.autoClear;
    const prevShadow = renderer.shadowMap.autoUpdate;
    try {
      // ---- pass 0: advance the interactive ripple patch (2 tiny passes) ----
    const rippleAltitude = Math.abs(trueY - camSample.surfaceHeight);
    const rippleVisibility = 1 - THREE.MathUtils.smoothstep(rippleAltitude, 100, 160);
    if (rippleVisibility > 0) ripple?.step(renderer, camPos.x, camPos.z, delta);
    else ripple?.suspend();
    if (ripple && h) {
      h.uniforms.uRipple.value = ripple.texture;
      h.uniforms.uRippleInfo.value.set(
        Number.isFinite(ripple.center.x) ? ripple.center.x : camPos.x,
        Number.isFinite(ripple.center.y) ? ripple.center.y : camPos.z,
        ripple.patchM, rippleVisibility);
    }

      // ---- pass 1: opaques (+ underside when submerged) → RT, linear HDR ----
      // shadow maps re-render every OTHER frame — the sun moves slowly and
      // the cascade passes are a big slice of the frame (owner round 4 perf)
      renderer.shadowMap.autoUpdate = false;
      if ((frames.current & 1) === 0) renderer.shadowMap.needsUpdate = true;
      renderer.toneMapping = THREE.NoToneMapping;
      cam.layers.mask = underwater ? (1 | (1 << WATER_LAYER)) : 1;
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.toneMapping = prevTone;

      // ---- pass 2: tone-mapped blit (+ underwater fog/god rays) → screen ----
      const bu = blit.uniforms;
      bu.uUnderwater.value = underwater ? 1 : 0;
      bu.uUwTime.value = runtime.waveTimeS();
      bu.uWaveTime.value = bu.uUwTime.value;
      bu.uWindWave.value = h?.uniforms.uWindWave.value ?? 1;
      bu.uLevelTide.value = levels.tide;
      bu.uLevelSeason.value = levels.season;
      bu.uVerticalScale.value = verticalScale;
      bu.uDirectSun.value = directSun;
      bu.uCausticsInOpaque.value = runtime.causticsInOpaque ? 1 : 0;
      bu.uSunDirection.value.copy(runtime.sunDirection.value);
      bu.uCamPos.value.set(trueX, trueY, trueZ);
      bu.uInvProjView.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
      bu.uUwSurfaceY.value = camSample.surfaceHeight;
      const turb = camSample.turbidity;
      const tannin = camWater.tannin;
      // Same water chemistry as the surface refraction: crossing the waterline
      // must not make tea-dark blackwater turn into clear green water.
      bu.uUwAbsorb.value.set(
        0.30 + 1.2 * turb + 2.2 * tannin,
        0.10 + 1.7 * turb + 2.0 * tannin,
        0.06 + 2.3 * turb + 4.6 * tannin,
      );
      const amb = runtime.ambient.value;
      const tint = new THREE.Vector3(
        THREE.MathUtils.lerp(0.035 + 0.05 * turb, 0.045, tannin),
        THREE.MathUtils.lerp(0.115 - 0.06 * turb, 0.065, tannin),
        THREE.MathUtils.lerp(0.10 - 0.075 * turb, 0.022, tannin),
      );
      bu.uUwFog.value.set(
        Math.max(amb.x, 1e-4) * tint.x * 24.0,
        Math.max(amb.y, 1e-4) * tint.y * 24.0,
        Math.max(amb.z, 1e-4) * tint.z * 24.0,
      );
      renderer.setRenderTarget(null);
      renderer.render(blit.scene, blit.camera);

      // ---- pass 3: water surface, then the display-referred overlay --------
      {
        renderer.autoClear = false;
        renderer.shadowMap.autoUpdate = false;
        if (!underwater && h) {
          cam.layers.mask = 1 << WATER_LAYER;
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
          renderer.render(scene, cam);
        }
        // markers etc. draw straight to screen (no tone mapping crush),
        // depth-tested against the scene depth the blit wrote
        cam.layers.mask = 1 << OVERLAY_LAYER;
        renderer.render(scene, cam);
      }
    } finally {
      renderer.toneMapping = prevTone;
      renderer.autoClear = prevAuto;
      renderer.shadowMap.autoUpdate = prevShadow;
      cam.layers.mask = prevLayers;
      renderer.setRenderTarget(prevTarget);
    }

    frames.current += 1;
    runtime.onDebug?.({
      tier: tier.name,
      underwater,
      surfaceAtCameraM: camSample.surfaceHeight,
      tideOffsetM: levels.tide,
      seasonOffsetM: levels.season,
      cameraDepthM: Math.max(0, camSample.surfaceHeight - trueY),
      rtSamples: tier.samples,
      frames: frames.current,
      contextLost: contextLost.current,
      effects: h?.effects.diagnostics,
    });
  }, 1);

  return null;
}
