import test from "node:test";
import assert from "node:assert/strict";
import { camYaw, coverage, isDay, legTo, parseArgs, walkBudgetS } from "./walk-lib.mjs";

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
