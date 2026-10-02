import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { InteriorEnvironment } from "@elder-souls/game-core/interior/interiorEnvironment";
import type { LoadedInterior } from "@elder-souls/game-core/interior/interiorLoader";
import { aimSun, createSunCascades } from "./skyObjects";
import type { LightRig } from "./lightRig";

/**
 * On the node renderer castShadow, visible and the light set key every lit
 * program (engineering standard, performance checklist). Drive the sun and the
 * cell's environment through a day, weather and two doors; the keys never move.
 */
const keys = (scene: THREE.Scene) => {
  const out: string[] = [];
  scene.traverse((o) => { const l = o as THREE.Light; if (l.isLight) out.push(`${l.uuid}:${l.visible}:${l.castShadow}`); });
  return out.join("|");
};

describe("light cache keys across day, weather and doors", () => {
  it("aimSun and the interior switch light by intensity, never castShadow or visible", () => {
    const scene = new THREE.Scene();
    const { sun } = createSunCascades({ shadowMapSize: 1024, cascades: 3, maxFar: 500 });
    const cascade = { shadow: sun.shadow.clone() };
    (sun.shadow.shadowNode as unknown as { lights: unknown[] }).lights = [cascade];
    scene.add(sun, sun.target, new THREE.HemisphereLight());
    const first = keys(scene);
    const rig = (i: number, s: boolean) => ({ sunColor: [1, 1, 1], sunIntensity: i, sunCastsShadows: s }) as unknown as LightRig;
    const at = (i: number, s: boolean) => aimSun(sun, new THREE.Vector3(0, 1, 0), new THREE.Vector3(), rig(i, s));
    const renderer = { toneMappingExposure: 1, getClearColor: (c: THREE.Color) => c, getClearAlpha: () => 1, setClearColor: () => {} };
    const interior = { group: new THREE.Group(), fog: new THREE.Fog(0, 1, 30), background: new THREE.Color(0) } as unknown as LoadedInterior;

    at(3, true); expect(sun.shadow.intensity).toBe(1); expect(cascade.shadow.autoUpdate).toBe(true);
    at(2, false); expect(sun.shadow.intensity).toBe(0); expect(cascade.shadow.intensity).toBe(0); expect(cascade.shadow.autoUpdate).toBe(false);
    expect(keys(scene)).toBe(first);
    for (let door = 0; door < 2; door++) {
      const env = new InteriorEnvironment(scene, renderer, interior);
      at(3, true); env.frame();
      expect(sun.intensity).toBe(0); expect(sun.shadow.intensity).toBe(0);
      at(3, true);
      expect(sun.intensity).toBe(0);
      expect(keys(scene)).toBe(first);
      env.restore(); at(3, true);
      expect(sun.intensity).toBe(3); expect(sun.shadow.intensity).toBe(1);
      expect(keys(scene)).toBe(first);
    }
  });
});
