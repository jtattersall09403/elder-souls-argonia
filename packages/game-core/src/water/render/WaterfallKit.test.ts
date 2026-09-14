import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { KIT_DIMS, KIT_PIECE, KIT_SHAPE_ROLES, REQUIRED_PIECES, kitIsComplete, parseWaterfallKit, roleForShape } from "./WaterfallKit";
import { BODY16_MAX_ARC_M, CREST_OVERHANG_M, KIT_SCALE, LATERAL_STEP, STACK_STEP, THIN_BELOW_M,
  bodyFamily, bodyScale, lateralOffsets, stackFall, stackSpans } from "./WaterfallKitStack";
import { MIST_CONE, MIST_DOME, mistVolumeSite } from "./WaterfallMistVolume";
import { traceWaterfallSheet, type Cascade } from "./WaterfallSheets";

function cascade(over: Partial<Cascade> & { profile: number[] }): Cascade {
  return {
    id: "fall-test", bodyIndex: 0, riverBand: 2,
    lip: { x: 0, y: 20, z: 0 }, plunge: { x: 8, y: 0, z: 0 },
    direction: { x: 1, y: 0, z: 0 }, widthM: 8, dropM: 20, bowlRadiusM: 10,
    profileStepM: 1, profileStartM: -3, lipSpeedMS: 3,
    ...over,
  };
}
const cliffProfile = (length: number, top: number, base: number) =>
  Array.from({ length }, (_, i) => (i < 3 ? top : base));
const gorge = () => cascade({ lip: { x: 0, y: 80, z: 0 }, plunge: { x: 6, y: 0, z: 0 }, dropM: 80, widthM: 8.7,
  bowlRadiusM: 12.4, lipSpeedMS: 2.3, profile: cliffProfile(60, 80, 0) });

describe("the kit's role table (Bethesda's shader numbers per shape)", () => {
  it("names every piece the stack places and a role for each drawn shape", () => {
    for (const p of REQUIRED_PIECES) expect(KIT_SHAPE_ROLES[p].length).toBeGreaterThan(0);
    expect(roleForShape("body16", "FXWaterfallBodyTallInner01")?.kind).toBe("lit");
    expect(roleForShape("body16", "FXWaterfallBodyTallFoam")?.scroll).toEqual([0, -0.313]);
    expect(roleForShape("crest", "FXrapidsFallsTop06")?.scroll).toEqual([0, -0.5]);
    expect(roleForShape("ring", "jetPuffs")?.scroll[1]).toBe(0.375);
    expect(roleForShape("thin7", "fallsMesh")?.breathe).toBe(true);
    // editor helpers and unshipped textures are never drawn
    expect(roleForShape("groundMist", "EditorMarker")).toBeNull();
    expect(roleForShape("body16", "CurrentPlane03")).toBeNull();
  });
  it("uses the audit's soft-depth fades: 0.57 m sheets, 1.07 m spray, 0.60 m ground mist", () => {
    expect(roleForShape("thin7", "fallsMesh")?.softDepthM).toBe(0.57);
    expect(roleForShape("mistCard", "jet07:0")?.softDepthM).toBe(1.07);
    expect(roleForShape("groundMist", "FXMistLow01:0")?.softDepthM).toBe(0.6);
  });
  it("parses a GLB scene by assetId extras and pynNodeName, dropping shapes without a role", () => {
    const scene = new THREE.Group();
    const root = new THREE.Group();
    root.userData.assetId = KIT_PIECE.groundMist;
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(12, 12));
    disc.userData.pynNodeName = "FXMistLow01:0";
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    marker.userData.pynNodeName = "EditorMarker";
    root.add(disc, marker);
    scene.add(root);
    const kit = parseWaterfallKit({ scene } as never);
    expect(kit.groundMist?.shapes.map((s) => s.name)).toEqual(["FXMistLow01:0"]);
    expect(kit.groundMist?.shapes[0].triangles).toBe(2);
    expect(kitIsComplete(kit)).toBe(false);
  });
});

describe("the stack (Bethesda's placement rules on the traced path)", () => {
  it("picks the body family by width and arc, and scales it uniformly to the water's width at the lip", () => {
    expect(bodyFamily(2, 10)).toBe("thin7");
    expect(bodyFamily(2, 40)).toBe("thin29");
    expect(bodyFamily(8, 20)).toBe("body16");
    expect(bodyFamily(8, 80)).toBe("body34");
    expect(THIN_BELOW_M).toBe(4);
    expect(BODY16_MAX_ARC_M).toBe(26);
    // 8.7 m of water on a 9.6 m top edge: scale 0.91, inside Bethesda's range
    const s = bodyScale("body34", 8.7, 80);
    expect(s).toBeCloseTo(8.7 / KIT_DIMS.body34.topWidthM, 3);
    expect(s).toBeGreaterThanOrEqual(KIT_SCALE.min);
    expect(s).toBeLessThanOrEqual(KIT_SCALE.max);
    // a fall shorter than the piece shrinks the piece to the fall
    expect(bodyScale("body16", 8, 5)).toBeCloseTo(Math.max(5 / KIT_DIMS.body16.heightM, KIT_SCALE.min), 3);
    expect(bodyScale("body16", 8, 8)).toBeCloseTo(8 / KIT_DIMS.body16.heightM, 3);
    // a wide short fall: the width would ask for 4.2x, the range caps it at
    // 2.28 and the 20 m arc brings it down to a 20 m piece (lateral copies fill the width)
    expect(bodyScale("body16", 40, 20)).toBeCloseTo(20 / KIT_DIMS.body16.heightM, 3);
    expect(bodyScale("body16", 40, 60)).toBe(KIT_SCALE.max);
  });

  it("stacks pieces at 2/3 of a piece height with the last piece's foot at the plunge", () => {
    expect(STACK_STEP).toBeCloseTo(2 / 3, 6);
    const spans = stackSpans(80, 30);
    expect(spans[0]).toEqual({ startM: 0, endM: 30 });
    expect(spans[1].startM).toBeCloseTo(20, 6);
    expect(spans[spans.length - 1].endM).toBeCloseTo(80, 6);
    for (let i = 1; i < spans.length; i++) expect(spans[i].startM).toBeLessThan(spans[i - 1].endM);
    expect(stackSpans(10, 30)).toEqual([{ startM: 0, endM: 10 }]);
  });

  it("copies pieces laterally half a piece apart only when the water is wider than the piece", () => {
    expect(LATERAL_STEP).toBe(0.5);
    expect(lateralOffsets(8, 9)).toEqual([0]);
    const offs = lateralOffsets(20, 8);
    expect(offs.length).toBe(4);
    expect(offs[0]).toBeCloseTo(-6, 6);
    expect(offs[offs.length - 1]).toBeCloseTo(6, 6);
  });

  it("lays the gorge fall out as a body34 stack with crest, skirt, ring, mist cards and ground mist", () => {
    const path = traceWaterfallSheet(gorge());
    const stack = stackFall(path);
    expect(stack.body.piece).toBe("body34");
    expect(stack.body.spans).toBeGreaterThanOrEqual(4);
    expect(stack.body.lateral).toBe(1);
    expect(stack.counts.body34).toBe(stack.body.spans);
    expect(stack.counts.crest).toBeGreaterThanOrEqual(1);
    expect(stack.counts.skirt).toBe(1);
    expect(stack.counts.ring).toBe(1);
    expect(stack.counts.mistCard).toBe(8);
    expect(stack.counts.groundMist).toBeGreaterThanOrEqual(30);
    // the first piece's top edge IS the lip, and it covers the water's width
    expect(stack.body.topY).toBeCloseTo(80, 3);
    expect(stack.body.topWidthM).toBeGreaterThanOrEqual(0.8 * 8.7);
    // every body piece is yawed to the flow (+z forward = +x here) and leans
    // forward with the arc, never backward past vertical
    const v = new THREE.Vector3();
    for (const inst of stack.instances.filter((i) => i.piece === "body34")) {
      v.set(0, 0, 1).transformDirection(inst.matrix);
      expect(v.x).toBeGreaterThan(0.9);
      v.set(0, -1, 0).transformDirection(inst.matrix);
      expect(v.y).toBeLessThan(-0.9);
      expect(inst.poolY).toBe(0);
    }
    // the last piece's foot is at (or just under) the pool, never hanging above it
    const last = stack.instances.filter((i) => i.piece === "body34").pop()!;
    const foot = new THREE.Vector3(0, -KIT_DIMS.body34.heightM, KIT_DIMS.body34.footForwardM).applyMatrix4(last.matrix);
    expect(foot.y).toBeLessThan(1);
    expect(foot.y).toBeGreaterThan(-KIT_DIMS.body34.heightM * last.scale * 0.34);
  });

  it("places the crest on the strip with its far end one metre past the lip, at lip level", () => {
    const stack = stackFall(traceWaterfallSheet(cascade({ profile: cliffProfile(40, 20, 0) })));
    const crest = stack.instances.find((i) => i.piece === "crest")!;
    const origin = new THREE.Vector3().setFromMatrixPosition(crest.matrix);
    expect(origin.x).toBeLessThan(0);
    const farEnd = new THREE.Vector3(0, 0, -KIT_DIMS.crest.aheadM).applyMatrix4(crest.matrix);
    expect(farEnd.x).toBeCloseTo(CREST_OVERHANG_M, 3);
    expect(origin.y).toBeCloseTo(20.05, 3);
  });

  it("puts the skirt just upstream of the impact and the ring just downstream, flat on the pool", () => {
    const stack = stackFall(traceWaterfallSheet(cascade({ profile: cliffProfile(40, 20, 0) })));
    const skirt = new THREE.Vector3().setFromMatrixPosition(stack.instances.find((i) => i.piece === "skirt")!.matrix);
    const ring = new THREE.Vector3().setFromMatrixPosition(stack.instances.find((i) => i.piece === "ring")!.matrix);
    expect(skirt.x).toBeLessThan(8);
    expect(skirt.y).toBe(0);
    expect(ring.x).toBeGreaterThan(8);
    expect(ring.y).toBeCloseTo(0.05, 3);
  });

  it("is deterministic per fall id and its mist sits within 12 m of the impact, discs inside the basin", () => {
    const path = traceWaterfallSheet(gorge());
    const a = stackFall(path);
    const b = stackFall(path);
    expect(a.instances.map((i) => i.matrix.elements)).toEqual(b.instances.map((i) => i.matrix.elements));
    for (const inst of a.instances) {
      const p = new THREE.Vector3().setFromMatrixPosition(inst.matrix);
      if (inst.piece === "mistCard") expect(Math.hypot(p.x - 6, p.z)).toBeLessThanOrEqual(12);
      if (inst.piece === "groundMist") expect(Math.hypot(p.x - 6, p.z)).toBeLessThanOrEqual(12.4 * 1.1 + 1e-6);
    }
  });
});

describe("the mist volume (a per-fall cone + dome, not the weather's froxel fog)", () => {
  it("fans out down the fall and domes over the pool, inside a box that holds both", () => {
    const site = mistVolumeSite(traceWaterfallSheet(gorge()));
    expect(site.dropM).toBeCloseTo(80, 0);
    const footRadius = Math.min(site.widthM * MIST_CONE.lipRadiusFrac + site.dropM * MIST_CONE.growPerM, MIST_CONE.maxRadiusM);
    expect(footRadius).toBeGreaterThan(site.widthM * MIST_CONE.lipRadiusFrac);
    expect(site.max.y - site.plunge.y).toBeGreaterThanOrEqual(MIST_DOME.minHeightM);
    expect(site.min.x).toBeLessThan(site.lip.x);
    expect(site.max.x).toBeGreaterThan(site.plunge.x + site.bowlRadiusM);
    expect(site.max.y).toBeGreaterThan(site.lip.y);
  });
});
