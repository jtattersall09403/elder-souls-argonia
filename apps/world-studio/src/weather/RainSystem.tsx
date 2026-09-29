import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PRECIP_LAYER } from "@elder-souls/game-core/water/render/waterMaterial";
import { lastWeatherSample } from "./weatherState";
import { createRainStreaks } from "./rainMaterial";

/**
 * Falling rain (Phase 8c; research doc §3 + §9.3): one static buffer of
 * velocity-aligned quad streaks computed in the vertex stage (rainMaterial.ts) — each drop
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
  // The geometry and node material are built without React (rainMaterial.ts)
  // so the harness scene draws exactly this.
  const streaks = useMemo(
    () => createRainStreaks({ count, extentM, span, opacityScale }),
    // span/opacityScale are per-mount constants (core vs shell).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, extentM],
  );
  useEffect(() => () => streaks.dispose(), [streaks]);
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
  }, [defaultCamera, streaks]);

  useFrame(({ camera, size, viewport }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    clock.current += Math.min(delta, 0.1);
    const wx = lastWeatherSample();
    const rain = wx?.rainIntensity ?? 0;
    mesh.visible = rain > 0.02;
    if (!mesh.visible) return;
    const u = streaks.uniforms;
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
      u.uColor.value.setRGB(f.x * k * 0.9, f.y * k * 0.95, f.z * k * 1.02);
    }
    // The sky's climate raster (a texture node or a { value } holder: only
    // `.value`, the Texture, is read) replaces the blank once it exists.
    if (air?.uClimateAir.value && streaks.airIsBlank()) u.uAir.value = air.uClimateAir.value;
  });

  return (
    <primitive ref={meshRef} object={streaks.mesh} />
  );
}
