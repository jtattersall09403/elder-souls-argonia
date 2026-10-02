import { describe, expect, it } from "vitest";
import { renderGroup } from "three/tsl";
import * as THREE from "three";
import { createWindUniforms } from "../../fx/windSway";
import { createBatchDataUniforms } from "../../fx/batchData";
import { makeFireUniforms } from "../../fx/fire/flameMaterial";
import { FlameSystem } from "../../fx/fire/FlameSystem";
import { createSettlementMaterialUniforms } from "../../settlement/materials";
import { sharedUniform } from "./sharedUniform";

describe("sharedUniform", () => {
  it("puts the uniform in renderGroup, keeping value and type", () => {
    const u = sharedUniform(3);
    expect((u as unknown as { groupNode: unknown }).groupNode).toBe(renderGroup);
    expect(u.value).toBe(3);
  });
  it("frame-wide vegetation and settlement uniforms are shared", () => {
    const groups = [...Object.values(createWindUniforms()), ...Object.values(createSettlementMaterialUniforms())]
      .map((u) => (u as { groupNode?: unknown }).groupNode);
    expect(groups.every((g) => g === renderGroup)).toBe(true);
  });
  // A static draw (render/staticRefresh.ts) re-reads only shared buffers:
  // each value the app writes after the first frame must sit in renderGroup.
  it("runtime-written fire and occlusion uniforms read by static draws are shared", () => {
    const u = makeFireUniforms();
    const written = { uTime: u.uTime, uNight: u.uNight, uExposure: u.uExposure, uToneMapped: u.uToneMapped,
      uWind: u.uWind, uVolumeOn: u.uVolumeOn, esOccParams: createBatchDataUniforms().esOccParams };
    for (const [name, node] of Object.entries(written)) {
      expect([name, (node as { groupNode?: unknown }).groupNode === renderGroup]).toEqual([name, true]);
    }
  });
  it("every fire draw writes the render call's draw state before it draws", () => {
    const fires = new FlameSystem();
    const renderer = { toneMappingExposure: 0.25, toneMapping: THREE.NoToneMapping } as unknown as Parameters<THREE.Object3D["onBeforeRender"]>[0];
    const embers = fires.group.getObjectByName("fire-embers")!;
    expect(embers.userData.esStatic).toBe(true);
    embers.onBeforeRender(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial(), null as unknown as THREE.Group);
    expect(fires.uniforms.uToneMapped.value).toBe(0);
    expect(fires.uniforms.uExposure.value).toBe(0.25);
  });
});
