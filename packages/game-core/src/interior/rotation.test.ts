/**
 * The interior bundle's rotation convention, checked on real data (planner
 * ruling 7, interiors round 3). The exporter composes a Skyrim reference's
 * Euler angles as Gamebryo's Rx(-x) Ry(-y) Rz(-z) (Z applied first), and re-expresses
 * them for `Euler(pitch, -yaw, roll, 'YXZ')` in the game frame
 * (export_interior_bundle.game_rotation_deg). Here the published
 * DawnstarBrinasHouse bundle is placed as the runtime places it, and the
 * centre of a piece's own local box must land where the plugin's raw
 * position and angles put it, computed independently through three.js.
 * A wrong axis order or sign moves the centre by tenths of a metre.
 */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { parseInteriorBundle } from "./bundle";
import raw from "./__fixtures__/rotation.DawnstarBrinasHouse.json";

const BUNDLE_URL = new URL(
  "../../../../apps/world-studio/public/province/interiors/DawnstarBrinasHouse.json", import.meta.url);

/** plugin frame (x east, y north, z up) -> game frame (x east, y up, z south) */
const toGame = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.z, -v.y);

function pluginCentre(ref: (typeof raw.refs)[number], sign: 1 | -1): THREE.Vector3 {
  const [rx, ry, rz] = ref.rotRad;
  const local = new THREE.Vector3(
    ref.sizeM[0] / 2 - ref.originOffsetM[0], ref.sizeM[1] / 2 - ref.originOffsetM[1],
    ref.sizeM[2] / 2 - ref.originOffsetM[2]);
  // three's 'XYZ' order is the matrix Rx·Ry·Rz (Gamebryo Rx(-x) Ry(-y) Rz(-z)): Z applied first, X last
  local.applyEuler(new THREE.Euler(sign * rx, sign * ry, sign * rz, "XYZ"));
  const p = new THREE.Vector3(...ref.posUnits.map((u) => u * raw.metresPerUnit) as [number, number, number]);
  return toGame(p.add(local));
}

function runtimeCentre(placement: { positionM: number[]; rotationDeg: number[]; scale: number },
  ref: (typeof raw.refs)[number]): THREE.Vector3 {
  const d = THREE.MathUtils.degToRad;
  const [pitch, yaw, roll] = placement.rotationDeg;
  const o = new THREE.Object3D();
  o.position.set(placement.positionM[0], placement.positionM[1], placement.positionM[2]);
  o.rotation.set(d(pitch), -d(yaw), d(roll), "YXZ");
  o.scale.setScalar(placement.scale);
  o.updateMatrixWorld(true);
  const local = toGame(new THREE.Vector3(
    ref.sizeM[0] / 2 - ref.originOffsetM[0], ref.sizeM[1] / 2 - ref.originOffsetM[1],
    ref.sizeM[2] / 2 - ref.originOffsetM[2]));
  return local.applyMatrix4(o.matrixWorld);
}

describe("interior rotation convention on DawnstarBrinasHouse (ruling 7)", () => {
  const bundle = parseInteriorBundle(JSON.parse(readFileSync(BUNDLE_URL, "utf8")), "DawnstarBrinasHouse");

  for (const ref of raw.refs) {
    it(`${ref.base} (${ref.refId}): the box centre lands where the plugin's Gamebryo-order angles put it`, () => {
      const placement = bundle.placements.find((p) => p.id === `DawnstarBrinasHouse.${ref.refId}`);
      expect(placement?.assetId).toBe(ref.assetId);
      const tilted = placement!.rotationDeg.filter((a) => Math.abs(((a % 360) + 360) % 360) > 0.5
        && Math.abs(((a % 360) + 360) % 360 - 360) > 0.5);
      expect(tilted.length).toBeGreaterThanOrEqual(2);     // rotated on more than one axis
      const got = runtimeCentre(placement!, ref);
      const want = pluginCentre(ref, -1);
      expect(got.distanceTo(want)).toBeLessThan(0.005);
      // the opposite sense (counter-clockwise) would put it elsewhere: the check can fail
      expect(got.distanceTo(pluginCentre(ref, 1))).toBeGreaterThan(0.05);
    });
  }
});
