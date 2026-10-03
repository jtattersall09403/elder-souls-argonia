import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ensureSinglePass } from "./singlePass";

describe("ensureSinglePass (perf10 diag10 C3a)", () => {
  it("a transparent DoubleSide material draws in one pass and keeps its version", () => {
    const m = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide });
    expect(ensureSinglePass(m)).toBe(true);
    expect(m.forceSinglePass).toBe(true);
    expect(ensureSinglePass(m)).toBe(false);
  });
  it("opaque or single-sided materials are left alone", () => {
    expect(ensureSinglePass(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))).toBe(false);
    expect(ensureSinglePass(new THREE.MeshBasicMaterial({ transparent: true }))).toBe(false);
  });
});
