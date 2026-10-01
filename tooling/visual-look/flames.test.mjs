// node --test tooling/visual-look/flames.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFlameArgs, seenCards, verdict } from "./flames.mjs";

test("args: an interior cell with its door spot, a place at night by default", () => {
  const i = parseFlameArgs(["interior", "KeebaHouseFisher", "0.313", "3.006", "--url", "https://x/studio/", "--force"]);
  assert.equal(i.cell, "KeebaHouseFisher"); assert.equal(i.url, "https://x/studio/"); assert.equal(i.force, true); assert.equal(i.t, "12");
  const p = parseFlameArgs(["place", "1.5", "2.5", "--empty-fires"]);
  assert.equal(p.cell, null); assert.equal(p.t, "22"); assert.equal(p.emptyFires, true);
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
  // mismatched windows (camera moved) never count
  assert.equal(seenCards([px(200)], [off.flat()], [off.flat()], 12)[0].seen, false);
});
