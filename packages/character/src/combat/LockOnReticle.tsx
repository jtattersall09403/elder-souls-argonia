import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import * as THREE from "three";

export function LockOnReticle({
  visible,
  anchor,
}: {
  visible: boolean;
  anchor: RefObject<THREE.Object3D | null>;
}) {
  const marker = useRef<THREE.Group>(null);
  const parentWorld = useMemo(() => new THREE.Quaternion(), []);
  const anchorWorld = useMemo(() => new THREE.Vector3(), []);
  const towardCamera = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    if (!marker.current) return;
    if (anchor.current && marker.current.parent) {
      anchor.current.getWorldPosition(anchorWorld);
      towardCamera.copy(camera.position).sub(anchorWorld).normalize();
      anchorWorld.addScaledVector(towardCamera, 0.22);
      marker.current.parent.worldToLocal(anchorWorld);
      marker.current.position.copy(anchorWorld);
    }
    marker.current.parent?.getWorldQuaternion(parentWorld);
    marker.current.quaternion.copy(parentWorld.invert()).multiply(camera.quaternion);
  });
  return (
    <group ref={marker} visible={visible} position={[0, 0.3, 0]} renderOrder={20}>
      <group rotation={[0, 0, Math.PI / 4]}>
        <mesh>
          <ringGeometry args={[0.14, 0.19, 4]} />
          <meshBasicMaterial color="#d8c79c" transparent opacity={0.92} depthTest />
        </mesh>
        <mesh scale={0.48}>
          <ringGeometry args={[0.14, 0.19, 4]} />
          <meshBasicMaterial color="#b99a62" transparent opacity={0.95} depthTest />
        </mesh>
      </group>
    </group>
  );
}
