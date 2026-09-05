import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { HurtboxBone } from "./hurtbox";
import {
  closestPointOnCapsuleSurface,
  rayCapsuleEntry,
  resolveArrowPlant,
  type PosedCapsule,
} from "./arrowPlant";

/**
 * The owner's round-8 report: arrows stick "in the air around" a body as well
 * as in it. These pin the geometry that decides where a shaft is planted, with
 * no engine and no scene.
 */

function capsule(from: number[], to: number[], radius: number, name = "bone"): PosedCapsule {
  const bone = new THREE.Object3D();
  bone.name = name;
  const segment: HurtboxBone = {
    bone,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    radius,
    halfLength: new THREE.Vector3(...from).distanceTo(new THREE.Vector3(...to)) / 2,
  };
  return {
    segment,
    from: new THREE.Vector3(from[0], from[1], from[2]),
    to: new THREE.Vector3(to[0], to[1], to[2]),
  };
}

describe("rayCapsuleEntry", () => {
  it("finds the near surface of the cylinder body", () => {
    const t = rayCapsuleEntry(
      new THREE.Vector3(0, 1, -5),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 2, 0),
      0.25,
    );
    expect(t).toBeCloseTo(4.75, 6);
  });

  it("finds a cap when the line passes the end of the segment", () => {
    const t = rayCapsuleEntry(
      new THREE.Vector3(0, 2, -5),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 2, 0),
      0.25,
    );
    expect(t).toBeCloseTo(4.75, 6);
  });

  it("misses cleanly when the line passes beside the capsule", () => {
    expect(rayCapsuleEntry(
      new THREE.Vector3(1, 1, -5),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 2, 0),
      0.25,
    )).toBeNull();
  });
});

describe("closestPointOnCapsuleSurface", () => {
  it("puts a point outside the capsule back on its skin", () => {
    const point = closestPointOnCapsuleSurface(
      new THREE.Vector3(3, 1, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 2, 0),
      0.25,
      new THREE.Vector3(0, 0, -1),
    );
    expect(point.x).toBeCloseTo(0.25, 6);
    expect(point.y).toBeCloseTo(1, 6);
  });
});

describe("resolveArrowPlant", () => {
  const torso = capsule([0, 0, 0], [0, 2, 0], 0.25, "torso");
  const arm = capsule([0.6, 0, 0], [0.6, 2, 0], 0.1, "arm");
  const direction = new THREE.Vector3(0, 0, 1);

  it("plants on the surface, not where a late sensor report put the arrow", () => {
    // The report arrives with the arrow already 0.4 m past the near skin.
    const contact = new THREE.Vector3(0, 1, 0.15);
    const plant = resolveArrowPlant([torso, arm], contact, direction);
    expect(plant?.segment.bone.name).toBe("torso");
    expect(plant?.point.z).toBeCloseTo(-0.25, 6);
    expect(plant?.point.y).toBeCloseTo(1, 6);
  });

  it("plants on the surface when the report lands short of the body", () => {
    const contact = new THREE.Vector3(0, 1, -0.9);
    const plant = resolveArrowPlant([torso, arm], contact, direction);
    expect(plant?.point.z).toBeCloseTo(-0.25, 6);
  });

  it("credits the capsule the flight line actually entered, not the nearest centre", () => {
    // A shaft into the outer edge of the arm: its centre is further away than
    // the torso's, but the torso is never crossed.
    const contact = new THREE.Vector3(0.63, 1, 0.05);
    const plant = resolveArrowPlant([torso, arm], contact, direction);
    expect(plant?.segment.bone.name).toBe("arm");
  });

  it("never leaves a shaft in the air when the line misses every capsule", () => {
    // The body moved on before the report was handled: the line passes wide.
    const contact = new THREE.Vector3(0.35, 1, 0);
    const plant = resolveArrowPlant([torso], contact, direction);
    expect(plant).not.toBeNull();
    const axis = new THREE.Vector3(0, plant!.point.y, 0);
    expect(plant!.point.distanceTo(axis)).toBeCloseTo(0.25, 6);
  });

  it("answers nothing for an actor with no fitted hurtbox", () => {
    expect(resolveArrowPlant([], new THREE.Vector3(), direction)).toBeNull();
  });
});
