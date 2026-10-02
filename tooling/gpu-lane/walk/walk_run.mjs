#!/usr/bin/env node
// The agent walk of one place (tooling/gpu-lane/walk/README.md): ONE tab, ONE invocation, every pass.
//   node tooling/gpu-lane/walk/walk_run.mjs --route <route.json> --cdp 127.0.0.1:9242 --t 12,22 [--w clear] --out <dir>
// Reuses measure.mjs's exported ready gate, in-page frame sampler, stats and orphan-tab close (never edits it).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { closeOrphanPages, frameStats, isReady, pageProbe, sample } from "../measure.mjs";
import { parseHud } from "../hud-parse.mjs";
import { camYaw, coverage, isDay, legTo, parseArgs, walkBudgetS } from "./walk-lib.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const KEYS = {
  w: { key: "w", code: "KeyW", windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87, text: "w" },
  e: { key: "e", code: "KeyE", windowsVirtualKeyCode: 69, nativeVirtualKeyCode: 69, text: "e" },
};
const r2 = (x) => Math.round(x * 100) / 100;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const route = JSON.parse(readFileSync(o.route, "utf8"));
  mkdirSync(o.out, { recursive: true });
  const t0 = Date.now();
  const browser = await chromium.connectOverCDP(`http://${o.cdp}`);
  const { closed: orphansClosed } = await closeOrphanPages(browser);
  const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height } });
  await ctx.addInitScript(pageProbe);
  const page = await ctx.newPage(); // ONE tab for every pass
  const cdp = await ctx.newCDPSession(page);
  const consoleErrors = [], http404s = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("response", (r) => { if (r.status() === 404) http404s.push(r.url()); });

  const dbg = (fn, arg) => page.evaluate(([fn, arg]) => {
    const d = window.__STUDIO_CHARACTER_DEBUG__;
    if (!d) return null;
    if (fn === "state") return d.state();
    if (fn === "aim") return d.aimCamera(arg[0], arg[1]);
    if (fn === "teleport") return d.teleport(arg[0], arg[1], arg[2]);
    if (fn === "interior") return d.interior();
    return null;
  }, [fn, arg]);
  const key = (k, down) => cdp.send("Input.dispatchKeyEvent", { type: down ? "keyDown" : "keyUp", ...KEYS[k] });
  const press = async (k) => { await key(k, true); await wait(120); await key(k, false); };
  const aim = (bearing, pitch) => dbg("aim", [camYaw(bearing), pitch]);
  const state = () => dbg("state");
  const waitFor = async (pred, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const s = await state().catch(() => null); if (s && pred(s)) return s; await wait(250); }
    return null;
  };
  const shot = async (file) => {
    const p = join(o.out, file);
    await page.evaluate(() => { window.__hid = [...document.querySelectorAll("body *")].filter((e) => !e.querySelector("canvas") && e.tagName !== "CANVAS" && ["fixed", "absolute"].includes(getComputedStyle(e).position)); window.__hid.forEach((e) => { e.dataset.v = e.style.visibility; e.style.visibility = "hidden"; }); }).catch(() => {});
    await page.screenshot({ path: p, type: "jpeg", quality: 80 });
    await page.evaluate(() => window.__hid?.forEach((e) => { e.style.visibility = e.dataset.v; })).catch(() => {});
    return file;
  };
  const pos2 = (s) => (s?.pos ? [s.pos[0], s.pos[2]] : null);

  /** Real W walk towards [x, z]; falls back to a teleport after 1.5x the expected time. */
  async function walkTo(target, budgetS, stopM = 0.8) {
    const s0 = await state();
    const from = pos2(s0);
    if (!from) { await dbg("teleport", [target[0], target[1]]); return { fallback: true, reason: "no position" }; }
    const end = Date.now() + walkBudgetS(legTo(from, target).distM, o.speed) * 1000 * (budgetS ?? 1);
    await aim(legTo(from, target).bearing, -0.1);
    await key("w", true);
    let arrived = false;
    while (Date.now() < end) {
      await wait(200);
      const p = pos2(await state());
      if (!p) continue;
      const l = legTo(p, target);
      if (l.distM < stopM) { arrived = true; break; }
      await aim(l.bearing, -0.1); // steer: the character turns with the camera
    }
    await key("w", false);
    if (!arrived) { await dbg("teleport", [target[0], target[1]]); await wait(1500); }
    return { fallback: !arrived };
  }

  async function doorAction(a, pass, findings) {
    const r = { type: "door", doorId: a.doorId, cellId: a.cellId, entered: false, exited: false, shots: [] };
    const w = await walkTo(a.approach, 1, 0.4);
    r.fallback = w.fallback;
    await aim(a.faceYaw, -0.1);
    await wait(600);
    let s = await state();
    r.focusBefore = s?.focus?.id ?? null;
    if (s?.focus?.id !== a.doorId) findings.push({ pass, where: a.doorId, finding: `door not focusable from its approach (focus ${s?.focus?.id ?? "none"})` });
    await press("e");
    const tIn = Date.now();
    s = await waitFor((x) => x.insideInterior && !x.transitioning, 30000);
    if (!s) { findings.push({ pass, where: a.doorId, finding: "E did not enter the interior within 30 s" }); return r; }
    r.entered = true; r.enterS = r2((Date.now() - tIn) / 1000); r.cellShown = s.cellId;
    if (s.cellId !== a.cellId) findings.push({ pass, where: a.doorId, finding: `entered cell ${s.cellId}, route expects ${a.cellId}` });
    await wait(2500); // the cell's lights and textures settle
    for (const sh of a.interiorShots) { await aim(sh.yaw, sh.pitch); await wait(700); r.shots.push(await shot(`${pass}-${sh.name}.jpg`)); }
    // out: the exit door is the cell's own candidate, at the cell origin + its local position
    s = await state();
    if (!s.focus) {
      const probe = await dbg("interior");
      const loc = a.exitDoorLocalM;
      if (probe?.originM && loc) {
        const target = [probe.originM[0] + loc[0], probe.originM[2] + loc[2]];
        await walkTo(target, 1);
        s = await state();
      }
    }
    if (!s.focus) findings.push({ pass, where: a.cellId, finding: "exit door not focusable inside the cell" });
    r.exitFocus = s.focus?.id ?? null;
    await press("e");
    s = await waitFor((x) => !x.insideInterior && !x.transitioning, 30000);
    if (!s) { findings.push({ pass, where: a.cellId, finding: "E did not leave the interior within 30 s" }); return r; }
    r.exited = true;
    r.exitPosM = s.pos;
    await wait(1500);
    await aim(a.faceYaw + Math.PI, -0.1);
    await wait(700);
    r.shots.push(await shot(`${pass}-${a.doorId.split(".").pop()}-out.jpg`));
    return r;
  }

  const passes = [];
  const findings = [];
  for (const t of o.t) {
    const day = isDay(t);
    const pass = `t${t}`;
    const P = { pass, t, w: o.w, waypoints: [] };
    passes.push(P);
    const tp = Date.now();
    try {
      const w0 = route.waypoints[0];
      const url = `${o.origin}${o.base}?view=character&x=${(w0.xM / 1000).toFixed(4)}&z=${(w0.zM / 1000).toFixed(4)}&t=${t}&w=${o.w}`;
      P.url = url;
      await page.goto("about:blank").catch(() => {});
      await page.goto(url, { timeout: o.readyTimeout * 1000, waitUntil: "load" });
      const tr = Date.now(), samples = [];
      let ready = false;
      while (Date.now() - tr < o.readyTimeout * 1000) {
        const s = await page.evaluate(() => {
          const text = document.body.innerText; const m = /(?:^|\n)tris ([\d.]+)M/.exec(text);
          return { fps: window.__STUDIO_FPS__ ?? 0, tris: m ? Number(m[1]) * 1e6 : 0, loading: text.includes("Loading"), text };
        }).catch(() => ({ fps: 0, tris: 0, loading: true, text: "" }));
        const { text, ...rest } = s; const st = parseHud(text).cpuByStage;
        samples.push({ t: Date.now(), ...rest, pre: st ? (st.pre?.avg ?? 0) : null, gc: st ? (st.gc?.avg ?? 0) : null });
        if (isReady(samples, { startT: tr })) { ready = true; break; }
        await wait(500);
      }
      P.ready = ready; P.readyS = r2((Date.now() - tr) / 1000);
      if (!ready) findings.push({ pass, where: "load", finding: `ready gate not passed in ${o.readyTimeout} s` });
      await page.mouse.click(o.width / 2, o.height / 2).catch(() => {});
      await dbg("teleport", [w0.xM, w0.zM, camYaw(w0.yawRad)]);
      await wait(3000);
      const settle = await sample(page, o.settle);
      P.settle = { ...frameStats(settle.ts), ...settle.work };
      P.settle.hitches = undefined;
      // the 20 s turning walk along the main path: input only inside the window
      const fw = route.freeWalk;
      if (fw) {
        await dbg("teleport", [fw.startM[0], fw.startM[1], camYaw(fw.legs[0].bearing)]);
        await wait(3000);
        const s0 = await state();
        const drive = async () => {
          await key("w", true);
          for (const l of fw.legs) { await aim(l.bearing, -0.1); await wait(l.seconds * 1000); }
          await key("w", false);
        };
        const [smp] = await Promise.all([sample(page, fw.seconds), drive()]);
        const s1 = await state();
        P.freeWalk = { ...frameStats(smp.ts), ...smp.work, hitches: undefined, routeId: fw.routeId,
          movedM: s0?.pos && s1?.pos ? r2(Math.hypot(s1.pos[0] - s0.pos[0], s1.pos[2] - s0.pos[2])) : null };
        if (P.freeWalk.movedM !== null && P.freeWalk.movedM < 5) findings.push({ pass, where: "freeWalk", finding: `the 20 s walk moved only ${P.freeWalk.movedM} m (blocked or keys not reaching input)` });
        await shot(`${pass}-freewalk-end.jpg`);
      }
      // the route
      for (const [i, w] of route.waypoints.entries()) {
        const R = { id: w.id, actions: [] };
        P.waypoints.push(R);
        try {
          if (w.arrive === "walk" && i > 0) {
            const res = await walkTo([w.xM, w.zM]);
            R.fallback = res.fallback;
          } else {
            await dbg("teleport", [w.xM, w.zM, camYaw(w.yawRad)]);
            await wait(4000); // streaming round the arrival
          }
          for (const a of w.actions) {
            try {
              if (a.type === "shot") { await aim(a.yaw, a.pitch); await wait(800); R.actions.push({ type: "shot", name: a.name, file: await shot(`${pass}-${a.name}.jpg`) }); }
              else if (a.type === "fire") {
                await aim(a.yaw, a.pitch); await wait(800);
                const shots = [];
                for (let k = 0; k < a.n; k++) { shots.push(await shot(`${pass}-${a.name}-f${k}.jpg`)); await wait(a.dtS * 1000); }
                R.actions.push({ type: "fire", name: a.name, fixtureIds: a.fixtureIds, shots });
              } else if (a.type === "door") {
                if (!day) continue;
                R.actions.push(await doorAction(a, pass, findings));
              }
            } catch (e) { findings.push({ pass, where: `${w.id}/${a.type}`, finding: `harness error: ${String(e).slice(0, 200)}` }); }
          }
        } catch (e) { findings.push({ pass, where: w.id, finding: `harness error: ${String(e).slice(0, 200)}` }); }
      }
    } catch (e) { findings.push({ pass, where: "pass", finding: `harness error: ${String(e).slice(0, 300)}` }); }
    P.wallMin = r2((Date.now() - tp) / 60000);
    console.log(`walk: pass ${pass} done in ${P.wallMin} min; settle ${P.settle?.settledFps} fps, walk ${P.freeWalk?.settledFps} fps`);
  }
  const gpu = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2"); const x = gl?.getExtension("WEBGL_debug_renderer_info");
    return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : null;
  }).catch(() => null);
  const git = (a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" }).stdout.trim();
  const summary = { schemaVersion: 1, placeId: route.placeId, gitSha: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "",
    measuredAt: new Date().toISOString(), gpuAdapter: gpu, origin: o.origin, base: o.base, weather: o.w, orphansClosed,
    passes, coverage: coverage(route, passes), consoleErrors: [...new Set(consoleErrors)], http404s: [...new Set(http404s)], findings,
    wallMin: r2((Date.now() - t0) / 60000) };
  writeFileSync(join(o.out, "summary.json"), `${JSON.stringify(summary, null, 1)}\n`);
  writeFileSync(join(o.out, "route.json"), `${JSON.stringify(route, null, 1)}\n`);
  console.log(`walk: ${join(o.out, "summary.json")} coverage ${JSON.stringify(summary.coverage)} findings ${findings.length} wall ${summary.wallMin} min`);
  await page.close().catch(() => {});
  await ctx.close().catch(() => {});
  await browser.close().catch(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
