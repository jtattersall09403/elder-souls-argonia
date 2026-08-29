// Phase 8a sky/light probe: boots the built studio, pins fixed WorldInstants
// (module 55: fixed-instant screenshot probes so material A/B comparisons are
// lit identically), reads window.__STUDIO_SKY_DEBUG__ and asserts the
// ephemeris/exposure agree with expectations; screenshots each preset.
// Run from apps/combat-sandbox (owns the playwright dep):
//   node ../world-studio/scripts/probe-sky.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(studioDir, "artifacts");
mkdirSync(artifacts, { recursive: true });

const PORT = 4322;
const BASE = `http://127.0.0.1:${PORT}/elder-souls-argonia/studio/`;

// Scenarios: the four named region light presets plus a dusk check.
// Expectations are on the debug hook (deterministic), brightness is a sanity
// band on the screenshot (probe is software-GL; bands are wide).
const SCENARIOS = [
  {
    id: "blackrose-dawn",
    q: "view=fly3d&cam=orbit&x=2.40&z=6.20&ex=1&t=05:50&d=11-15&w=clear",
    sunAlt: [-10, 5],
    phase: ["civil", "sunrise", "nautical"],
    brightness: [1, 140],
  },
  {
    id: "coast-noon",
    q: "view=fly3d&cam=orbit&x=5.16&z=4.64&ex=1&t=12:00&d=8-17&w=clear",
    sunAlt: [55, 90],
    phase: ["noon"],
    brightness: [40, 235],
  },
  {
    id: "mountains-afternoon",
    q: "view=fly3d&cam=orbit&x=2.25&z=1.09&ex=1&t=15:30&d=3-10&w=clear",
    sunAlt: [20, 60],
    phase: ["afternoon"],
    brightness: [30, 235],
  },
  {
    id: "jungle-night-fullmoon",
    q: "view=fly3d&cam=orbit&x=4.01&z=4.62&ex=1&t=22:00&d=6-4&w=clear",
    sunAlt: [-90, -12],
    phase: ["night", "astronomical", "nautical"],
    moonPhaseMin: 0.95,
    brightness: [0.2, 80],
  },
  {
    id: "dusk-fast-twilight",
    q: "view=fly3d&cam=orbit&x=3.47&z=2.80&ex=1&t=18:05&d=8-17&w=clear",
    sunAlt: [-6, 0.5],
    phase: ["dusk", "sunset", "civil"],
    brightness: [1, 180],
  },
  // CHARACTER view: the walk mode has its own canvas/scene wiring (physics
  // suspense, camera, shadow flags) and the 2026-08-25 owner-gate defects
  // (leaked CSM lights, shadows off) lived ONLY there — fly-view probes all
  // passed while walk mode was broken. Every probe run must cover both.
  {
    id: "character-noon",
    q: "view=character&x=5.16&z=4.64&ex=1&t=12:00&d=8-17&w=clear",
    sunAlt: [55, 90],
    phase: ["noon"],
    brightness: [40, 235],
  },
  // Phase 8c weather scenarios: forced states exercise the full stack (dome
  // cloud deck, rain streaks, wet ground, shadow kill under overcast); the
  // auto scenario checks the calendar machine end-to-end in the browser.
  {
    id: "storm-noon-forced",
    q: "view=fly3d&cam=orbit&x=5.16&z=4.64&ex=1&t=12:00&d=7-20&w=thunderstorm",
    sunAlt: [55, 90],
    phase: ["noon"],
    weather: { state: "thunderstorm", rainMin: 0.3, shadows: false },
    brightness: [5, 175],
  },
  {
    id: "character-downpour",
    q: "view=character&x=5.16&z=4.64&ex=1&t=16:00&d=7-8&w=downpour",
    sunAlt: [10, 65],
    phase: ["afternoon"],
    weather: { state: "downpour", rainMin: 0.55, wetMin: 0.3, shadows: false },
    brightness: [4, 165],
  },
  {
    id: "auto-weather-monsoon",
    q: "view=fly3d&cam=orbit&x=2.40&z=6.20&ex=1&t=12:00&d=8-17",
    sunAlt: [55, 90],
    phase: ["noon"],
    weather: { auto: true },
    brightness: [3, 235],
  },
  {
    id: "character-night-moonless",
    q: "view=character&x=2.94&z=5.46&ex=1&t=01:08&d=6-7&w=clear",
    sunAlt: [-90, -12],
    phase: ["night", "astronomical", "nautical"],
    // Moonless night: dim-but-readable (exposure ceiling + airglow gradient,
    // owner round 2) yet nowhere near daylight — leaked scene lights showed
    // up here first (ground lit like day while the sky was black).
    brightness: [2, 70],
  },
];

const server = spawn(
  "npx",
  ["vite", "preview", "--base", "/elder-souls-argonia/studio/", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: studioDir, detached: true, stdio: "ignore" },
);

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`server never came up at ${url}`);
}

const only = process.env.SKY_SCENARIO;
const RUN = only ? SCENARIOS.filter((s) => s.id === only) : SCENARIOS;
const { chromium } = await import("playwright");
const failures = [];
const report = [];
try {
  await waitFor(BASE);
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") pageErrors.push(`console: ${m.text().slice(0, 400)}`);
  });

  for (const s of RUN) {
    await page.goto(`${BASE}?${s.q}&smsize=512`);
    // Sky debug appears once WorldSky has rendered a frame with terrain up.
    await page.waitForFunction(
      () => window.__STUDIO_SKY_DEBUG__ && window.__STUDIO_SKY_DEBUG__.envBakes >= 1,
      undefined,
      { timeout: 180_000 },
    );
    // Let chunks stream + exposure settle (paused clock ⇒ deterministic).
    await page.waitForTimeout(9_000);
    const dbg = await page.evaluate(() => window.__STUDIO_SKY_DEBUG__);
    // Light census: exactly 3 CSM cascade suns + 1 moon + 1 hemisphere. Any
    // extra directional light is a lifecycle leak (CSM remove() not called on
    // a suspense remount) — the root cause of the 2026-08-25 gate failure.
    const lightCensus = await page.evaluate(() => {
      let dir = 0, hemi = 0, other = 0;
      window.__SCENE__.traverse((o) => {
        if (!o.isLight) return;
        if (o.isDirectionalLight) dir += 1;
        else if (o.isHemisphereLight) hemi += 1;
        else other += 1;
      });
      return { dir, hemi, other };
    });
    const shot = path.join(artifacts, `sky-${s.id}.png`);
    const buf = await page.screenshot({ path: shot, timeout: 180_000 });
    const brightness = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 160;
      c.height = 90;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, 160, 90);
      const d = g.getImageData(0, 0, 160, 90).data;
      const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      let sum = 0, sky = 0, skyN = 0, ground = 0, groundN = 0;
      for (let y = 0; y < 90; y++) {
        for (let x = 0; x < 160; x++) {
          const v = lum((y * 160 + x) * 4);
          sum += v;
          if (y < 22) { sky += v; skyN++; }
          if (y > 62) { ground += v; groundN++; }
        }
      }
      return { mean: sum / (160 * 90), sky: sky / skyN, ground: ground / groundN };
    }, buf.toString("base64"));

    const checks = [];
    const fail = (msg) => {
      checks.push(`FAIL ${msg}`);
      failures.push(`${s.id}: ${msg}`);
    };
    const ok = (msg) => checks.push(`ok   ${msg}`);
    if (dbg.sunAltitudeDeg >= s.sunAlt[0] && dbg.sunAltitudeDeg <= s.sunAlt[1])
      ok(`sun altitude ${dbg.sunAltitudeDeg.toFixed(1)}° in [${s.sunAlt}]`);
    else fail(`sun altitude ${dbg.sunAltitudeDeg.toFixed(1)}° outside [${s.sunAlt}]`);
    if (s.phase.includes(dbg.dayPhase)) ok(`day phase ${dbg.dayPhase}`);
    else fail(`day phase ${dbg.dayPhase} not in ${s.phase}`);
    if (s.moonPhaseMin !== undefined) {
      if (dbg.moonPhaseFraction >= s.moonPhaseMin) ok(`moon ${(dbg.moonPhaseFraction * 100).toFixed(0)}% full`);
      else fail(`moon fraction ${dbg.moonPhaseFraction.toFixed(2)} < ${s.moonPhaseMin}`);
    }
    if (Math.abs(dbg.exposure - dbg.exposureTarget) < dbg.exposureTarget * 0.05 + 1e-6)
      ok(`exposure converged (${dbg.exposure.toExponential(2)})`);
    else fail(`exposure ${dbg.exposure.toExponential(2)} != target ${dbg.exposureTarget.toExponential(2)}`);
    // fly: 3 cascades + moon; character: 2 cascades + moon.
    const expectDir = s.q.includes("view=character") ? 3 : 4;
    if (lightCensus.dir === expectDir && lightCensus.hemi === 1)
      ok(`light census ${expectDir - 1} cascades + moon + hemi`);
    else fail(`light census wrong: ${JSON.stringify(lightCensus)} expected dir=${expectDir} (leaked CSM lights?)`);
    if (s.weather) {
      const kinds = ["clear", "haze", "overcast", "rain", "downpour", "squall", "thunderstorm"];
      if (s.weather.auto) {
        if (kinds.includes(dbg.weatherState))
          ok(`auto weather ${dbg.weatherState} (rain ${dbg.rainIntensity?.toFixed(2)}, spell ${dbg.spellKind})`);
        else fail(`auto weather state bad: ${dbg.weatherState}`);
      } else {
        if (dbg.weatherState === s.weather.state) ok(`forced state ${dbg.weatherState}`);
        else fail(`weather state ${dbg.weatherState} != forced ${s.weather.state}`);
        if (s.weather.rainMin !== undefined) {
          if (dbg.rainIntensity >= s.weather.rainMin) ok(`rain ${dbg.rainIntensity.toFixed(2)} >= ${s.weather.rainMin}`);
          else fail(`rain ${dbg.rainIntensity} < ${s.weather.rainMin}`);
        }
        if (s.weather.wetMin !== undefined) {
          if (dbg.wetness >= s.weather.wetMin) ok(`ground wet ${dbg.wetness.toFixed(2)}`);
          else fail(`wetness ${dbg.wetness} < ${s.weather.wetMin}`);
        }
        if (s.weather.shadows === false) {
          if (!dbg.sunCastsShadows) ok("sun shadows OFF under the deck");
          else fail("sun still casts shadows under a storm deck");
        }
      }
      if (Number.isFinite(dbg.visibilityM) && dbg.visibilityM > 40)
        ok(`visibility ${Math.round(dbg.visibilityM)} m`);
      else fail(`visibility bad: ${dbg.visibilityM}`);
    }
    if (brightness.mean >= s.brightness[0] && brightness.mean <= s.brightness[1])
      ok(`screen brightness ${brightness.mean.toFixed(1)} in [${s.brightness}] (sky ${brightness.sky.toFixed(0)} / ground ${brightness.ground.toFixed(0)})`);
    else fail(`screen brightness ${brightness.mean.toFixed(1)} outside [${s.brightness}] (sky ${brightness.sky.toFixed(0)} / ground ${brightness.ground.toFixed(0)})`);

    report.push(
      `## ${s.id}\nurl: ?${s.q}\n` +
        checks.join("\n") +
        `\nturbidity ${dbg.turbidity.toFixed(1)} · humidity@cam ${dbg.humidityAtCamera.toFixed(2)}` +
        ` · illuminance ${dbg.sceneIlluminance.toFixed(2)} lx · mist ${dbg.mistStrength.toFixed(2)}` +
        ` · envBakes ${dbg.envBakes}\nscreenshot: ${path.basename(shot)}\n`,
    );
  }
  if (pageErrors.length) {
    failures.push(...pageErrors.slice(0, 12));
    report.push(`## page errors\n${pageErrors.slice(0, 12).join("\n")}`);
  }
  await browser.close();
} catch (e) {
  failures.push(String(e));
  report.push(`## crash\n${String(e)}`);
} finally {
  try {
    process.kill(-server.pid);
  } catch {
    /* already gone */
  }
}

const summary = `\n\n${report.join("\n")}`;
writeFileSync(path.join(artifacts, "sky-probe-result.txt"), summary);
console.log(summary);
process.exit(failures.length ? 1 : 0);
