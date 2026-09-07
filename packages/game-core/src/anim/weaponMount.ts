import { Vector3, type Object3D } from "three";
import { RIG_SOCKET_ROTATION } from "./animationManifest";
import type { WeaponSocketTransform } from "../equipment/types";

/** Mount in world metres using the same rig convention for rendering and measurement. */
export function applyWeaponSocketTransform(mount: Object3D, socket: Object3D, transform: WeaponSocketTransform) {
  socket.updateWorldMatrix(true, false);
  const scale = socket.getWorldScale(new Vector3()).x || 1;
  mount.scale.setScalar(transform.localScale / scale);
  mount.position.fromArray(transform.localPosition);
  mount.quaternion.fromArray(RIG_SOCKET_ROTATION).normalize();
  // The item offset follows the skeleton's fixed socket convention.
  const [x, y, z, w] = transform.localRotation;
  const q = mount.quaternion.clone().set(x, y, z, w).normalize();
  mount.quaternion.multiply(q).normalize();
}
