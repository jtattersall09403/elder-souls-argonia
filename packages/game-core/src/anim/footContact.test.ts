import { describe, expect, it } from "vitest";
import { Bone, Group, Object3D, Quaternion, Vector3 } from "three";
import { footContactChain, liftFootContact } from "./footContact";

function leg(scale = 1) {
  const pelvis = new Group();
  pelvis.scale.setScalar(scale);
  const hip = new Bone(), knee = new Bone(), foot = new Bone();
  hip.name = "NPC_Thigh_ThgL"; knee.name = "NPC_Calf_ClfL";
  pelvis.add(hip); hip.add(knee); knee.add(foot);
  hip.position.set(0, 1, 0); knee.position.set(0, -0.5, 0.1); foot.position.set(0, -0.5, -0.1);
  pelvis.updateMatrixWorld(true);
  return { pelvis, hip, knee, foot };
}

describe("foot contact during sourced pose blends", () => {
  it.each([0.8, 1, 1.2])("lifts only the penetrating foot in world metres at scale %s", scale => {
    const chain = leg(scale);
    const start = chain.foot.getWorldPosition(new Vector3());
    const hip = chain.hip.getWorldPosition(new Vector3());
    const orientation = chain.foot.getWorldQuaternion(new Quaternion());
    const saved = new Map<Object3D, Quaternion>();
    liftFootContact(chain, 0.12, saved);
    expect(chain.foot.getWorldPosition(new Vector3()).distanceTo(start.clone().add(new Vector3(0, 0.12, 0)))).toBeLessThan(1e-6);
    expect(chain.hip.getWorldPosition(new Vector3()).distanceTo(hip)).toBeLessThan(1e-9);
    expect(chain.foot.getWorldQuaternion(new Quaternion()).angleTo(orientation)).toBeLessThan(1e-6);
    for (const [bone, pose] of saved) bone.quaternion.copy(pose);
    chain.pelvis.updateMatrixWorld(true);
    expect(chain.foot.getWorldPosition(new Vector3()).distanceTo(start)).toBeLessThan(1e-6);
  });
  it("leaves an authored lifted foot alone and resolves the anatomical chain", () => {
    const chain = leg(); const saved = new Map<Object3D, Quaternion>();
    expect(footContactChain(chain.foot)).toMatchObject({ hip: chain.hip, knee: chain.knee, foot: chain.foot });
    liftFootContact(chain, 0, saved);
    expect(saved.size).toBe(0);
  });
});
