import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PRECIP_LAYER } from "../water/waterMaterial";
import { lastWeatherSample } from "./weatherState";

/**
 * Falling rain (Phase 8c; research doc §3 + §9.3): one static buffer of
 * velocity-aligned quad streaks computed in the vertex shader — each drop
 * falls with wind drift and wraps inside a camera-following volume (the
 * standard NVIDIA/ToyShop shape, no per-frame CPU work).
 *
 * Round 3 (owner: STILL no visible rain — round 2's widened quads were
 * sub-pixel beyond ~4 m, hard-edged, alpha 0.3 over bright ground, and 85 %
 * canopy-suppressed; the round-2 probe screenshot shows zero streaks).
 * The fix adopts the guarantees of the soft-sprite technique (P. Adams,
 * "Cheap, Beautiful Rain in Three.js", Antaeus AR — see research §9.3)
 * while keeping quads, whose velocity alignment gives correct foreshortening
 * without the article's UV-squash workaround:
 *  - screen-space MINIMUM width: a streak never falls below ~1.5 px, so
 *    distance can't erase it (alpha compensates so far rain reads as haze,
 *    not a white wall);
 *  - soft blurred cross-profile (the article's pre-blurred PNG, done
 *    procedurally) instead of hard quad edges;
 *  - colour rides the exposure-anchored bright-fog luminance (lightRig
 *    fogLum via the shared aerial uniforms) ×1.25 — brighter than terrain,
 *    just brighter than a storm sky, visible against both;
 *  - a tighter volume (36 m) so the budget concentrates where pixels are;
 *  - canopy suppression capped at 55 % — the raster is region-scale, not a
 *    literal roof (the real occlusion depth map lands with Phase 10 canopy
 *    geometry, decision 0032 §6).
 *
 * Round 4 (owner: "doesn't fall fast enough", "a bit less white", "vanishes
 * behind water"):
 *  - RAIN RUNS ON REAL TIME. It used to ride the shared water clock, which is
 *    scaled by the world-time rate and by wind — so the same downpour fell at
 *    a different speed depending on the studio's time-lapse setting, and at
 *    the shipping timescale it would have been wrong by construction.
 *    Raindrop fall speed is a physical constant (terminal velocity); it has
 *    nothing to do with how fast the game clock runs. See TIME_SCALE in
 *    world-time for what the clock does instead.
 *  - fall speed is now real terminal velocity for the drop size the state
 *    implies (drizzle ~4 m/s → heavy-rain 2 mm drops ~9 m/s), and the streak
 *    LENGTH is derived from it via an eye-persistence "shutter", so faster
 *    rain automatically draws longer streaks — which is what actually reads
 *    as speed on screen.
 *  - colour pulled off pure white to the blue-grey of lit rain-water.
 *  - drawn on PRECIP_LAYER, after the water surface (see waterMaterial.ts).
 *
 * Round 5 (owner: "rain still feels too slow — the actual on-screen descent
 * needs to be about double", and "rain sits in tiny patches around the player
 * with hard edges"):
 *  - fall speed floor doubled (8 m/s, up to ~14 in a downpour + gusts).
 *    Deliberately above textbook terminal velocity at the drizzle end: what
 *    must read right is the visible descent rate, and slow-but-physical read
 *    as floating. Streak length still derives from speed via the shutter.
 *  - the camera-following volume WAS the "tiny patch": a 36 m box with a
 *    hard wall of no-rain at its edge. Now 72 m across with a radial alpha
 *    fade over the outer quarter, and the streak budget scaled up so the
 *    near-field density survives. Rain now visibly falls over the landscape
 *    around you, ending in haze instead of a line.
 */

/**
 * Post-8c tweak (owner 2026-08-30): "rain surrounds you to 70 m — make it
 * like 300 m". One 300 m box would dilute the near field ~17× (or need ~17×
 * the budget), so the rain is TWO nested camera volumes: the dense 72 m core
 * as before, plus a sparse 300 m shell whose streaks read as the grey rain
 * curtains you see over a landscape. The shell's drops inside the core just
 * add a little.
 */
const VOLUME = new THREE.Vector3(72, 26, 72);
const OUTER_VOLUME = new THREE.Vector3(300, 60, 300);

/** Eye/camera persistence, seconds: how long a falling drop smears for. Streak
 * length = fall speed × this, so speed and length can never disagree. */
const SHUTTER_S = 0.09;

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
uniform float uPixelWorld; // world metres per screen pixel at 1 m depth
uniform float uShutter;   // eye-persistence smear time, seconds
varying float vAlpha;
varying vec2 vProfile;
void main() {
  vec3 vel = vec3(uWindV.x, -uFall, uWindV.y);
  vec3 rel = mod(aSeed * uSpan + vel * uTime - cameraPosition, uSpan);
  vec3 pos = cameraPosition + rel - 0.5 * uSpan;
  // fraction of drops appears as intensity rises (drop id = aSeed.x)
  float on = step(aSeed.x, uIntensity);
  // canopy shelter: capped — the forest roof is a region raster, not walls
  vec2 airUv = vec2(pos.x / uExtentM, 1.0 - pos.z / uExtentM);
  float canopy = texture2D(uAir, airUv).b;
  vAlpha = on * (1.0 - 0.55 * canopy);
  // Soft volume edge (round 5): the box must end in thinning haze, not a
  // hard wall of suddenly-no-rain around the player.
  vAlpha *= 1.0 - smoothstep(0.72, 1.0, length((rel - 0.5 * uSpan).xz) / (0.5 * uSpan.x));
  // the flyover far above the weather layer sees no streaks
  vAlpha *= 1.0 - smoothstep(500.0, 900.0, cameraPosition.y);
  vec3 velDir = normalize(vel);
  float depth = max(distance(pos, cameraPosition), 0.7);
  vec3 view = (pos - cameraPosition) / depth;
  vec3 right = normalize(cross(velDir, view) + vec3(1e-5, 0.0, 0.0));
  // Screen-space minimum width (round 3): never below ~1.5 px at this
  // depth; alpha compensates for the widening so far rain reads as grey
  // drizzle haze rather than a bright wall.
  float halfW = max(0.016, 0.75 * uPixelWorld * depth);
  vAlpha *= clamp(0.016 / halfW, 0.3, 1.0);
  // Streak length derives from the fall speed (round 4): a drop smears over
  // the eye's persistence window, so faster rain draws longer streaks. This
  // is what reads as SPEED on screen — a fast short dash looks slow.
  float len = uFall * uShutter * (0.7 + 0.6 * aSeed.z);
  vec3 quad = pos + right * (aCorner.x * halfW) + velDir * (aCorner.y * len);
  vProfile = aCorner;
  gl_Position = projectionMatrix * viewMatrix * vec4(quad, 1.0);
}`;

const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying vec2 vProfile;
void main() {
  // soft "motion-blurred" streak: smooth across, faded at both ends
  float across = 1.0 - vProfile.x * vProfile.x;
  float along = min((1.0 - vProfile.y) * vProfile.y * 5.0, 1.0);
  gl_FragColor = vec4(uColor, uOpacity * vAlpha * across * across * along);
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
  // Round 5: budgets scaled with the 36→72 m volume so near-field density
  // holds (12k quads is still trivial geometry for a desktop GPU).
  return low ? 4200 : 12000;
}

export function RainSystem({ count, extentM }: { count: number; extentM: number }) {
  // Two nested volumes (see OUTER_VOLUME): dense core + sparse far shell.
  return (
    <>
      <RainStreaks count={count} extentM={extentM} span={VOLUME} opacityScale={1} />
      <RainStreaks
        count={Math.round(count * 0.75)}
        extentM={extentM}
        span={OUTER_VOLUME}
        opacityScale={0.85}
      />
    </>
  );
}

function RainStreaks({ count, extentM, span, opacityScale }: {
  count: number;
  extentM: number;
  span: THREE.Vector3;
  opacityScale: number;
}) {
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
          uSpan: { value: span },
          uAir: { value: null },
          uExtentM: { value: extentM },
          uPixelWorld: { value: 0.0013 },
          uShutter: { value: SHUTTER_S },
          uColor: { value: new THREE.Color(0.6, 0.65, 0.7) },
          uOpacity: { value: 0.6 * opacityScale },
        },
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        transparent: true,
        depthWrite: false,
        // Billboards spun by cross(velDir, view) flip winding with the view
        // direction — FrontSide silently culled half the streaks (round 3).
        side: THREE.DoubleSide,
      }),
    // span/opacityScale are per-mount constants (core vs shell).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extentM],
  );
  const meshRef = useRef<THREE.Mesh>(null);
  // Rain's own REAL-TIME accumulator (round 4): falling water is physics, not
  // world time. The old shared water clock ran at up to 8× and scaled with
  // wind, so rain sped up and slowed down with the studio's time-lapse.
  const clock = useRef(0);

  // Drawn in the water pipeline's post-water pass — see PRECIP_LAYER.
  const { camera: defaultCamera } = useThree();
  useEffect(() => {
    defaultCamera.layers.enable(PRECIP_LAYER);
    meshRef.current?.layers.set(PRECIP_LAYER);
  }, [defaultCamera]);

  useFrame(({ camera, size, viewport }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    clock.current += Math.min(delta, 0.1);
    const wx = lastWeatherSample();
    const rain = wx?.rainIntensity ?? 0;
    mesh.visible = rain > 0.02;
    if (!mesh.visible) return;
    const u = material.uniforms;
    u.uTime.value = clock.current;
    u.uIntensity.value = rain;
    if (wx) {
      // horizontal drift follows the weather wind (gusts wobble it a little)
      const drift = 0.35 * wx.windSpeedMS;
      u.uWindV.value.set(wx.windDirXZ[0] * drift, wx.windDirXZ[1] * drift);
      // Fall speed (round 5): the round-4 textbook terminal velocities (4–9
      // m/s) READ as slow motion on screen — the owner asked for roughly
      // double the visible descent. Floor 8 m/s (brisk drizzle) to ~14 m/s
      // in a downpour plus a gust-front kick; still scaled by rain intensity
      // so heavier rain visibly falls harder.
      u.uFall.value = 8 + 6 * rain + 0.12 * wx.windSpeedMS;
    }
    // world metres per screen pixel at 1 m depth, for the min-width clamp
    const cam = camera as THREE.PerspectiveCamera;
    const fovRad = ((cam.fov ?? 60) * Math.PI) / 180;
    const pxH = size.height * Math.min(2, viewport.dpr || 1);
    u.uPixelWorld.value = (2 * Math.tan(fovRad / 2)) / Math.max(pxH, 1);
    const air = (
      window as unknown as {
        __AERIAL_UNIFORMS__?: {
          uClimateAir: { value: THREE.Texture | null };
          uFogLum: { value: THREE.Vector3 };
        };
      }
    ).__AERIAL_UNIFORMS__;
    // Streak colour rides the exposure-anchored bright-fog luminance
    // (lightRig fogLum — lit water in air) LIFTED well above it: rain reads
    // through CONTRAST, and under a storm's lifted exposure the ground
    // renders brighter than the fog colour — ×1.25 was invisible over sunlit
    // mud (round-3 debug screenshots).
    //
    // Round 4 (owner: "make the rain a bit less white"): the target screen
    // value drops 1.05 → 0.78 and the streaks take the blue-grey cast of
    // water rather than the fog's near-white. Real rain is not a light
    // source: it reads by CONTRAST and by motion, not by brightness, and a
    // near-white streak over a grey storm scene looks like static. At night
    // the cap never engages and streaks stay a dim moonlit veil.
    if (air) {
      const f = air.uFogLum.value;
      const exposure = window.__STUDIO_SKY_DEBUG__?.exposure;
      let k = 4;
      if (exposure && exposure > 0) {
        const fogScreen = Math.max(f.x, f.y, f.z) * exposure;
        k = Math.min(4, Math.max(1.0, 0.78 / Math.max(fogScreen, 1e-4)));
      }
      (u.uColor.value as THREE.Color).setRGB(f.x * k * 0.9, f.y * k * 0.95, f.z * k * 1.02);
    }
    if (air?.uClimateAir.value && !u.uAir.value) u.uAir.value = air.uClimateAir.value;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />
  );
}
