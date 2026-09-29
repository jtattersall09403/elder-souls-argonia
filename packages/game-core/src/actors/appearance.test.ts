import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  applyAppearance, clearAppearance, skyrimRgbTint, SKYRIM_SKIN_DETAIL,
} from "./appearance";
import type { Appearance } from "./races";

function body(names: string[]) {
  const root = new THREE.Group();
  for (const name of names) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    mesh.name = name;
    root.add(mesh);
  }
  return root;
}

const appearance: Appearance = {
  skinTint: [0.5, 0.4, 0.3],
  hairTint: [0.1, 0.1, 0.1],
  skinMeshes: ["Body", "MaleHead:0"],
  hairMeshes: ["Hair"],
};

const colourOf = (root: THREE.Object3D, name: string) =>
  ((root.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial).color;

describe("colouring a character", () => {
  it("tints skin and hair with their own colours", () => {
    const model = body(["Body", "Hair", "Boots"]);
    applyAppearance(model, appearance);
    expect(colourOf(model, "Body").getHex()).toBe(new THREE.Color(0.5, 0.4, 0.3).getHex());
    expect(colourOf(model, "Hair").getHex()).toBe(new THREE.Color(0.1, 0.1, 0.1).getHex());
  });

  it("leaves anything it was not told about alone", () => {
    const model = body(["Body", "Boots"]);
    applyAppearance(model, appearance);
    expect(colourOf(model, "Boots").getHex()).toBe(0xffffff);
  });

  it("matches names glTF sanitises on load", () => {
    // The roster records "MaleHead:0"; three loads it as "MaleHead0".
    const model = body(["MaleHead0"]);
    applyAppearance(model, appearance);
    expect(colourOf(model, "MaleHead0").getHex()).not.toBe(0xffffff);
  });

  it("multiplies rather than replaces, so the art still shows through", () => {
    const model = body(["Body"]);
    colourOf(model, "Body").setRGB(0.5, 0.5, 0.5);
    applyAppearance(model, appearance);
    expect(colourOf(model, "Body").r).toBeCloseTo(0.25, 5);
  });

  it("uses Skyrim's FaceGen RGB overlay for a selectable skin tone", () => {
    const model = body(["Body"]);
    const mesh = model.children[0] as THREE.Mesh;
    const original = mesh.material as THREE.MeshStandardMaterial;
    const touched = applyAppearance(model, { ...appearance, skinTintMode: "skyrim-rgb-tint" });
    const tinted = mesh.material as MeshStandardNodeMaterial;
    // A node twin carries the overlay in its colour slot; the source is untouched.
    expect(tinted).not.toBe(original);
    expect(tinted.isNodeMaterial).toBe(true);
    expect(tinted.colorNode).not.toBeNull();
    expect(tinted.color.getHex()).toBe(0xffffff);
    expect(original.color.getHex()).toBe(0xffffff);
    clearAppearance(touched);
    expect(mesh.material).toBe(original);
  });

  it("the overlay is Skyrim's equation: mid grey under a tone, with the detail factor", () => {
    // b² + 2·t·b − 2·t·b², × detail. A zero tone squares the base; a full
    // tone gives 2b − b²; the mid tone leaves the base as is.
    const [r0] = skyrimRgbTint([0.5, 0.5, 0.5], [0, 0, 0]);
    expect(r0).toBeCloseTo(0.25 * SKYRIM_SKIN_DETAIL[0], 6);
    const [r1] = skyrimRgbTint([0.5, 0.5, 0.5], [1, 1, 1]);
    expect(r1).toBeCloseTo(0.75 * SKYRIM_SKIN_DETAIL[0], 6);
    const [, g] = skyrimRgbTint([0.3, 0.3, 0.3], [0.5, 0.5, 0.5]);
    expect(g).toBeCloseTo(0.3 * SKYRIM_SKIN_DETAIL[1], 6);
  });

  it("restores exactly what the asset shipped", () => {
    const model = body(["Body", "Hair"]);
    const before = colourOf(model, "Body").clone();
    clearAppearance(applyAppearance(model, appearance));
    expect(colourOf(model, "Body").getHex()).toBe(before.getHex());
  });

  it("does nothing at all when a race names no meshes", () => {
    const model = body(["Body"]);
    const touched = applyAppearance(model, {
      skinTint: [0, 0, 0], hairTint: [0, 0, 0], skinMeshes: [], hairMeshes: [],
    });
    expect(touched).toEqual([]);
    expect(colourOf(model, "Body").getHex()).toBe(0xffffff);
  });
});
