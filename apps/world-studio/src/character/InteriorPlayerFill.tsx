import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { PlayerMovementController } from "@elder-souls/game-core/physics/PlayerMovementController";
import type { LoadedInterior } from "@elder-souls/game-core/interior/interiorLoader";
import {
  PLAYER_FILL_DISTANCE_M, PLAYER_FILL_TOWARD_CAMERA_M, PLAYER_FILL_UP_M, cellAmbientLuminance, playerFillIntensity,
} from "@elder-souls/game-core/interior/playerFill";

export const PLAYER_FILL_NAME = "player-fill";

/**
 * Give a loaded cell its player fill (vol10 c9 I2; game-core interior/playerFill): one PointLight under the
 * cell's group, added before the cell's first link so its program set is compiled with it, never added or
 * removed after (k 0 = intensity 0). Idempotent: a cell the loader hands back again keeps its light.
 */
export function preparePlayerFill(interior: LoadedInterior, k: number): void {
  if (interior.group.getObjectByName(PLAYER_FILL_NAME)) return;
  const light = new THREE.PointLight(0xffffff, playerFillIntensity(cellAmbientLuminance(interior.bundle), k, PLAYER_FILL_TOWARD_CAMERA_M),
    PLAYER_FILL_DISTANCE_M, 2);
  light.name = PLAYER_FILL_NAME;
  light.castShadow = false;
  interior.group.add(light);
}

/** Keeps the shown cell's fill between the camera and the body centre each frame (allocation-free). */
export function InteriorPlayerFill({ interior, controller }: { interior: LoadedInterior; controller: PlayerMovementController }) {
  const camera = useThree((s) => s.camera);
  const light = useMemo(() => interior.group.getObjectByName(PLAYER_FILL_NAME) ?? null, [interior]);
  const body = useMemo(() => new THREE.Vector3(), []);
  const toward = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!light) return;
    controller.position(body);
    toward.set(camera.position.x - body.x, 0, camera.position.z - body.z);
    if (toward.lengthSq() > 1e-6) toward.normalize();
    light.position.copy(body).addScaledVector(toward, PLAYER_FILL_TOWARD_CAMERA_M);
    light.position.y += PLAYER_FILL_UP_M;
    interior.group.worldToLocal(light.position);
  });
  return null;
}
