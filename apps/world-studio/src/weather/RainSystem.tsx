import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { waterTimeS } from "../water/waterClock";
import { lastWeatherSample } from "./weatherState";

/**
 * Falling rain (Phase 8c, research doc §3 base tier): one static buffer of
 * quad streaks whose positions are computed in the vertex shader — each drop
 * falls with wind drift and wraps inside a camera-following volume (the
 * standard NVIDIA/ToyShop shape, no per-frame CPU work). Per-drop canopy
 * suppression samples the compiled climate-air raster (module 55 §96: canopy
 * is a place property) — under the deep forest the rain thins to drips
 * without any occlusion depth map; the Lagarde top-down depth map upgrades
 * this once Phase 10 places real canopy geometry (decision 0032 §6).
 */

const VOLUME = new THREE.Vector3(44, 26, 44);

const RAIN_VERT = /* glsl */ `
attribute vec3 aSeed;     // 0..1 per drop
attribute vec2 aCorner;   // x: -1|1 across, y: 0|1 along the streak
uniform float uTime;
uniform vec2 uWindV;      // horizontal drift, m/s
uniform float uFall;      // fall speed m/s
uniform float uIntensity; // 0..1
uniform vec3 uSpan;
uniform sampler2D uAir;   // climate-air (B = canopy)
uniform float uExtentM;
varying float vAlpha;
varying float vAlong;
void main() {
  vec3 vel = vec3(uWindV.x, -uFall, uWindV.y);
  vec3 rel = mod(aSeed * uSpan + vel * uTime - cameraPosition, uSpan);
  vec3 pos = cameraPosition + rel - 0.5 * uSpan;
  // fraction of drops appears as intensity rises (drop id = aSeed.x)
  float on = step(aSeed.x, uIntensity);
  // canopy shelter: the forest roof catches most of the rain
  vec2 airUv = vec2(pos.x / uExtentM, 1.0 - pos.z / uExtentM);
  float canopy = texture2D(uAir, airUv).b;
  vAlpha = on * (1.0 - 0.85 * canopy);
  // the flyover far above the weather layer sees no streaks
  vAlpha *= 1.0 - smoothstep(500.0, 900.0, cameraPosition.y);
  vec3 velDir = normalize(vel);
  vec3 view = normalize(pos - cameraPosition);
  vec3 right = normalize(cross(velDir, view));
  float len = 0.45 + 0.25 * uIntensity;
  vec3 quad = pos + right * (aCorner.x * 0.014) + velDir * (aCorner.y * len);
  vAlong = aCorner.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(quad, 1.0);
}`;

const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vAlong;
void main() {
  float soft = (1.0 - vAlong) * vAlong * 4.0; // fade both streak ends
  gl_FragColor = vec4(uColor, uOpacity * vAlpha * soft);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Streak budget by device class (same heuristic as the water tiers; the
 * declarative weather quality row in decision 0032). */
export function rainDropBudget(): number {
  const q = new URLSearchParams(window.location.search).get("wq");
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  const low = q === "low" || (q !== "high" && (coarse || weak));
  return low ? 1200 : 3200;
}

export function RainSystem({ count, extentM }: { count: number; extentM: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4 * 3);
    const corners = new Float32Array(count * 4 * 2);
    const index: number[] = [];
    // deterministic seeds (no Math.random in world systems)
    let s = 0x8c17;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < count; i += 1) {
      const sx = rnd();
      const sy = rnd();
      const sz = rnd();
      for (let c = 0; c < 4; c += 1) {
        seeds.set([sx, sy, sz], (i * 4 + c) * 3);
      }
      corners.set([-1, 0, 1, 0, 1, 1, -1, 1], i * 4 * 2);
      const b = i * 4;
      index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    g.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2));
    g.setIndex(index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // camera-relative
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uWindV: { value: new THREE.Vector2(0, 0) },
          uFall: { value: 9 },
          uIntensity: { value: 0 },
          uSpan: { value: VOLUME },
          uAir: { value: null },
          uExtentM: { value: extentM },
          uColor: { value: new THREE.Color(0.6, 0.65, 0.7) },
          uOpacity: { value: 0.16 },
        },
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        transparent: true,
        depthWrite: false,
      }),
    [extentM],
  );
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const wx = lastWeatherSample();
    const rain = wx?.rainIntensity ?? 0;
    mesh.visible = rain > 0.02;
    if (!mesh.visible) return;
    const u = material.uniforms;
    u.uTime.value = waterTimeS();
    u.uIntensity.value = rain;
    if (wx) {
      // horizontal drift follows the weather wind (gusts wobble it a little)
      const drift = 0.35 * wx.windSpeedMS;
      u.uWindV.value.set(wx.windDirXZ[0] * drift, wx.windDirXZ[1] * drift);
      u.uFall.value = 8 + 3 * rain;
    }
    // Streak brightness is exposure-anchored (screen ≈ 0.32 grey) like the
    // clouds — a fixed HDR grey would blow out under the night exposure.
    const exposure = window.__STUDIO_SKY_DEBUG__?.exposure;
    if (exposure && exposure > 0) {
      const lum = 0.32 / exposure;
      (u.uColor.value as THREE.Color).setRGB(0.82 * lum, 0.88 * lum, 1.0 * lum);
    }
    const air = (window as unknown as { __AERIAL_UNIFORMS__?: { uClimateAir: { value: THREE.Texture | null } } })
      .__AERIAL_UNIFORMS__;
    if (air?.uClimateAir.value && !u.uAir.value) u.uAir.value = air.uClimateAir.value;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />
  );
}
