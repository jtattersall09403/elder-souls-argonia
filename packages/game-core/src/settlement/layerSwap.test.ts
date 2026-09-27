/**
 * The layer's build swap (walk 2 D1): an empty build must not call
 * `group.add()` with no argument, and a running build keeps the live
 * build's covered radius.
 */
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { buildStartMark, flameManifestPath, swapInBuild } from "./SettlementLayer";

describe("settlement build swap", () => {
  it("swaps an empty build in without three's 'not an instance' error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const group = new THREE.Group();
    swapInBuild(group, new THREE.Group());
    expect(error).not.toHaveBeenCalled();
    expect(group.children).toHaveLength(0);
    const next = new THREE.Group();
    next.add(new THREE.Object3D(), new THREE.Object3D());
    swapInBuild(group, next);
    expect(group.children).toHaveLength(2);
    expect(next.children).toHaveLength(0);
    error.mockRestore();
  });

  it("a running build keeps the live covered radius; the first build is not restarted by 1 m", () => {
    expect(buildStartMark({ x: 1, z: 2 }, 120)).toEqual({ x: 1, z: 2, coveredRadiusM: 120 });
    expect(buildStartMark({ x: 1, z: 2 }, null).coveredRadiusM).toBe(Number.POSITIVE_INFINITY);
  });

  it("finds the flame kit's manifest whether or not the bundle lists works-v1", () => {
    expect(flameManifestPath({ "works-v1": { manifest: "kits/works-v1.kit.json" } }))
      .toBe("kits/works-v1.kit.json");
    expect(flameManifestPath({ "settlement-mud-v1": { manifest: "kits/settlement-mud-v1.kit.json" } }))
      .toBe("kits/works-v1.kit.json");
  });
});
