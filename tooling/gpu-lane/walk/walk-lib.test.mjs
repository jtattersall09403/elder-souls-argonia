import test from "node:test";
import assert from "node:assert/strict";
import { camYaw, cdpLost, coverage, isDay, legTargets, legTo, lumaSettled, outShotPlan, parseArgs, smokeRoute, walkBudgetS } from "./walk-lib.mjs";

test("--smoke is a bare flag", () => {
  assert.equal(parseArgs(["--route", "r", "--smoke", "--out", "o"]).smoke, true);
  assert.equal(parseArgs(["--route", "r", "--out", "o"]).smoke, false);
});

test("smoke route keeps the start, the first door and the first fire, by teleport", () => {
  const route = { doors: ["d1", "d2"], fixtures: ["f1", "f2"], freeWalk: { legs: [] }, waypoints: [
    { id: "w0", xM: 0, zM: 0, arrive: "teleport", actions: [{ type: "shot", name: "o" }] },
    { id: "w1", xM: 1, zM: 0, arrive: "walk", actions: [{ type: "fire", fixtureIds: ["f1"] }, { type: "shot" }] },
    { id: "w2", xM: 2, zM: 0, arrive: "walk", actions: [{ type: "fire", fixtureIds: ["f2"] }] },
    { id: "w3", xM: 3, zM: 0, arrive: "walk", actions: [{ type: "door", doorId: "d1" }, { type: "door", doorId: "d2" }] },
  ] };
  const s = smokeRoute(route);
  assert.deepEqual(s.waypoints.map((w) => [w.id, w.arrive, w.actions.length]), [["w0", "teleport", 0], ["w1", "teleport", 1], ["w3", "teleport", 1]]);
  assert.deepEqual([s.doors, s.fixtures, s.freeWalk], [["d1"], ["f1"], null]);
});

test("luma settles under 2 % over 1 s; leg targets include detours", () => {
  assert.ok(!lumaSettled([{ t: 0, luma: 10 }, { t: 1000, luma: 40 }]));
  assert.ok(lumaSettled([{ t: 0, luma: 40 }, { t: 500, luma: 41 }, { t: 1000, luma: 40.5 }]));
  assert.ok(!lumaSettled([{ t: 0, luma: 40 }, { t: 500, luma: 40 }]));
  assert.ok(!lumaSettled([]));
  assert.deepEqual(legTargets({ xM: 1, zM: 2, detourM: [[0, 0]] }), [[0, 0], [1, 2]]);
  assert.deepEqual(legTargets({ xM: 1, zM: 2 }), [[1, 2]]);
});

test("compass bearings: north is -z, east is +x; the camera yaw is the negated bearing", () => {
  assert.equal(legTo([0, 0], [0, -5]).bearing, 0);
  assert.ok(Math.abs(legTo([0, 0], [5, 0]).bearing - Math.PI / 2) < 1e-9);
  assert.equal(legTo([0, 0], [3, 4]).distM, 5);
  // camera at player + (sin y, cos y): looking east (bearing pi/2) puts it west of the player
  const y = camYaw(Math.PI / 2);
  assert.ok(Math.sin(y) < -0.99);
});

test("walk budget is 1.5x the expected time, at least 2 s", () => {
  assert.equal(walkBudgetS(35, 3.5), 15);
  assert.equal(walkBudgetS(1, 3.5), 2);
});

test("args: t list and defaults", () => {
  const o = parseArgs(["--route", "r.json", "--out", "o", "--t", "12,22"]);
  assert.deepEqual(o.t, ["12", "22"]);
  assert.equal(o.w, "clear");
  assert.throws(() => parseArgs(["--bogus", "1"]));
});

test("day pass and coverage", () => {
  assert.ok(isDay("12")); assert.ok(!isDay("22"));
  const route = { doors: ["d1", "d2"], fixtures: ["f1", "f2", "f3"] };
  const passes = [{ waypoints: [
    { actions: [{ type: "door", doorId: "d1", entered: true, exited: true }] },
    { fallback: true, actions: [{ type: "fire", fixtureIds: ["f1", "f2"], shots: ["a.jpg"] }, { type: "fire", fixtureIds: ["f3"], shots: [] }] },
  ] }];
  assert.deepEqual(coverage(route, passes),
    { doors: 2, doorsEntered: 1, doorsExited: 1, fixtures: 3, fixturesSeen: 2, teleportFallbacks: 1 });
});

test("outShotPlan reads the door out shot, null without one", () => {
  assert.deepEqual(outShotPlan({ outShot: { standM: [1, 2], yaw: 0.5, pitch: 0.2 } }), { standM: [1, 2], yaw: 0.5, pitch: 0.2 });
  assert.equal(outShotPlan({}), null);
});

test("cdpLost tells a lost DevTools link from a page error", () => {
  assert.equal(cdpLost(new Error("page.evaluate: Target page, context or browser has been closed")), true);
  assert.equal(cdpLost(new Error("Protocol error: Target closed")), true);
  assert.equal(cdpLost(new Error("page.evaluate: TypeError: d.state is not a function")), false);
});
