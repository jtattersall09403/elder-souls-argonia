import * as THREE from "three";
import type { HurtboxBone } from "./hurtbox";

export type ArrowSurfaceHit = { point: THREE.Vector3; bone: THREE.Object3D; distance: number; obliquityRad: number };

/** Narrow phase against the posed, visible skin, including worn armour.
 * Capsules are only a broad phase; a near miss never snaps onto their surface.
 */
export function traceArrowSurface(segments: readonly HurtboxBone[] | null, origin: THREE.Vector3,
  direction: THREE.Vector3, distance: number): ArrowSurfaceHit | null {
  const root = segments?.[0]?.surfaceRoot;
  if (!root || !segments?.length) return null;
  const ray = new THREE.Ray(origin, direction);
  const centre = new THREE.Vector3();
  const end = new THREE.Vector3();
  const near = segments.some(segment => {
    segment.bone.updateWorldMatrix(true, false);
    centre.copy(segment.from).applyMatrix4(segment.bone.matrixWorld);
    end.copy(segment.to).applyMatrix4(segment.bone.matrixWorld);
    const radius = centre.distanceTo(end) / 2 + segment.radius + 0.15;
    centre.add(end).multiplyScalar(0.5);
    return ray.distanceSqToPoint(centre) <= radius * radius
      && centre.distanceTo(origin) <= distance + radius;
  });
  if (!near) return null;
  root.updateWorldMatrix(true, true);
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverseVisible(object => {
    if (object instanceof THREE.SkinnedMesh && object.skeleton.bones.some(b => b === segments[0].bone)) {
      object.skeleton.update();
      // Three caches these bounds; they must describe this pose for raycasting.
      object.computeBoundingSphere();
      object.computeBoundingBox();
      meshes.push(object);
    }
  });
  const hit = new THREE.Raycaster(origin, direction, 0, distance).intersectObjects(meshes, false)[0];
  if (!hit || !hit.face) return null;
  const mesh = hit.object as THREE.SkinnedMesh;
  const indices = mesh.geometry.getAttribute("skinIndex");
  const weights = mesh.geometry.getAttribute("skinWeight");
  const scores = new Map<number, number>();
  for (const vertex of [hit.face.a, hit.face.b, hit.face.c]) {
    for (let component = 0; component < 4; component++) {
      const index = indices.getComponent(vertex, component);
      scores.set(index, (scores.get(index) ?? 0) + weights.getComponent(vertex, component));
    }
  }
  const boneIndex = [...scores].sort((a, b) => b[1] - a[1])[0]?.[0];
  const bone = mesh.skeleton.bones[boneIndex] ?? segments[0].bone;
  const a = mesh.getVertexPosition(hit.face.a, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  const b = mesh.getVertexPosition(hit.face.b, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  const c = mesh.getVertexPosition(hit.face.c, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  const normal = b.sub(a).cross(c.sub(a)).normalize();
  const obliquityRad = Math.acos(Math.min(1, Math.abs(normal.dot(direction))));
  return { point: hit.point, distance: hit.distance, bone, obliquityRad };
}
