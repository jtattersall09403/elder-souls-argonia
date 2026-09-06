import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { traceArrowSurface } from "./arrowSurface";
import { stickArrow } from "./stuckArrows";

function target() {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  root.add(bone);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-.2,-.2,0,.2,-.2,0,0,.2,0],3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(12),4));
  geometry.setAttribute("skinWeight",new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
  const mesh = new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  root.add(mesh);
  mesh.bind(new THREE.Skeleton([bone]));
  const segments = [{bone,surfaceRoot:root,from:new THREE.Vector3(0,-.2,0),to:new THREE.Vector3(0,.2,0),radius:.5,halfLength:.2}];
  return {bone,mesh,segments};
}

describe("arrow contact with visible skin",()=>{
  it("lets a near miss through the generous hurt capsule",()=>{
    const {segments}=target();
    expect(traceArrowSurface(segments,new THREE.Vector3(.3,0,1),new THREE.Vector3(0,0,-1),2)).toBeNull();
    expect(traceArrowSurface(segments,new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1),2)?.point.z).toBeCloseTo(0);
  });
  it("tests the animated skin and never accepts geometry past this step",()=>{
    const {bone,segments}=target();
    bone.position.x=1;
    expect(traceArrowSurface(segments,new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1),2)).toBeNull();
    expect(traceArrowSurface(segments,new THREE.Vector3(1,0,1),new THREE.Vector3(0,0,-1),.5)).toBeNull();
    expect(traceArrowSurface(segments,new THREE.Vector3(1,0,1),new THREE.Vector3(0,0,-1),2)?.bone).toBe(bone);
  });
  it("places the head inside the surface, accounting for the centred shaft",()=>{
    const {bone}=target();
    const shaft=new THREE.Group();
    stickArrow(bone,shaft,new THREE.Vector3(),new THREE.Quaternion());
    shaft.updateWorldMatrix(true,false);
    const tip=shaft.localToWorld(new THREE.Vector3(0,0,.375));
    expect(tip.z).toBeCloseTo(.12);
  });
});
