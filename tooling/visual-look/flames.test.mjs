// node --test tooling/visual-look/flames.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isLampDay, parseFlameArgs, seenCards, verdict, waitOrFail, windowsFrom } from "./flames.mjs";

test("args: an interior cell with its door spot, a place at night by default", () => {
  const i = parseFlameArgs(["interior", "KeebaHouseFisher", "0.313", "3.006", "--url", "https://x/studio/", "--force"]);
  assert.equal(i.cell, "KeebaHouseFisher"); assert.equal(i.url, "https://x/studio/"); assert.equal(i.force, true); assert.equal(i.t, "12");
  const idx = join(mkdtempSync(join(tmpdir(), "flames-")), "index.json");
  writeFileSync(idx, JSON.stringify({ places: [{ id: "place.a.gang-ground", positionM: [3939, 1403] }] }));
  const p = parseFlameArgs(["place", "place.a.gang-ground", "--index", idx, "--empty-fires"]);
  assert.equal(p.cell, null); assert.equal(p.t, "22"); assert.equal(p.emptyFires, true);
  assert.deepEqual([p.x, p.z], ["3.9390", "1.4030"]); // the built centre, not the record's dot
  assert.throws(() => parseFlameArgs(["place", "place.a.none", "--index", idx]), /no built bundle/);
  assert.throws(() => parseFlameArgs(["place", "1.5", "2.5"]), /usage/);
  assert.throws(() => parseFlameArgs(["interior", "X"]), /usage/);
});

test("verdict: any zero count fails, a failure message wins", () => {
  const ok = { flameSystems: 1, emitters: 85, draws: 10, onScreen: 39, visible: 12 };
  assert.equal(verdict(ok), null);
  assert.equal(verdict({ ...ok, visible: 0 }), "zero: visible");
  assert.equal(verdict({ ...ok, failed: "boom" }), "boom");
  assert.equal(verdict({}), "zero: flameSystems, emitters, draws, onScreen, visible");
});

test("seen: a card counts only when on differs from BOTH off frames by more than the off/off noise", () => {
  const px = (l) => [l, l, l, 255];
  const off = [px(40), px(40)];
  // a flame lifts one pixel to 200: seen
  assert.equal(seenCards([[...px(40), ...px(200)]], [off.flat()], [off.flat()], 12)[0].seen, true);
  // no change: not seen (the walk-7 deployed studio: 39 cards on screen, 0 seen)
  assert.equal(seenCards([off.flat()], [off.flat()], [off.flat()], 12)[0].seen, false);
  // the background flickers by 30 between the off frames: a 35 change is noise
  const r = seenCards([[...px(40), ...px(75)]], [off.flat()], [[...px(40), ...px(70)]], 12)[0];
  assert.equal(r.seen, false);
  // a lamp flickers a wall pixel by 150 while the flame lifts ANOTHER pixel
  // by 120: seen (noise is per pixel; walk 7 night, every card hidden)
  const flick = seenCards([[...px(160), ...px(40), ...px(40)]], [[...px(40), ...px(40), ...px(40)]], [[...px(40), ...px(190), ...px(40)]], 12)[0];
  assert.equal(flick.seen, true);
  // mismatched windows (camera moved) never count
  assert.equal(seenCards([px(200)], [off.flat()], [off.flat()], 12)[0].seen, false);
});

test("verdict: a place by day needs its flames drawn, not seen (lamps out 06:30-17:30)", () => {
  assert.equal(isLampDay("12"), true); assert.equal(isLampDay("22"), false); assert.equal(isLampDay("06:00"), false);
  const day = { mode: "place", t: "12", flameSystems: 1, emitters: 61, draws: 4, onScreen: 0, visible: 0 };
  assert.equal(verdict(day), null);
  assert.equal(verdict({ ...day, t: "22" }), "zero: onScreen, visible");
  assert.equal(verdict({ ...day, mode: "interior" }), "zero: onScreen, visible");
  assert.equal(verdict({ ...day, draws: 0 }), "zero: draws");
});

test("windowsFrom: a card's window is cut from a top-down RGBA frame", () => {
  // 3 x 2 frame, pixel value = 10 * index
  const frame = []; for (let i = 0; i < 6; i++) frame.push(10 * i, 10 * i, 10 * i, 255);
  const [w] = windowsFrom(frame, 3, [{ win: [1, 0, 2, 2] }]);
  assert.deepEqual(w.filter((_, i) => i % 4 === 0), [10, 20, 40, 50]);
  assert.equal(parseFlameArgs(["interior", "C", "1", "2", "--data-base", "http://d/studio/"]).dataBase, "http://d/studio/");
});

test("a subject that never arrives fails with a reason inside the target, never hangs", async () => {
  const timeout = Object.assign(new Error("Timeout 60000ms exceeded"), { name: "TimeoutError" });
  let seen;
  const page = { waitForFunction: async (_f, _a, o) => { seen = o; throw timeout; } };
  await assert.rejects(waitOrFail(page, () => false, "no flame cards streamed at the place", 500),
    /no flame cards streamed at the place within the 60 s target/);
  assert.equal(seen.timeout, 60000);
  assert.equal(seen.polling, 500);
});
