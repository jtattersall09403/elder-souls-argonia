import * as THREE from "three";
import type { LightSourceSpec } from "./carriedLight";
import { flickerNoise } from "./fire/fireTypes";

/**
 * The carried light's ONE PointLight and where it sits each frame (walk 5
 * perf). three.js compiles NUM_POINT_LIGHTS into every lit material, so a
 * light added when a torch is drawn and removed when it is put away (or when
 * the loadout drops the torch) recompiles every lit material in the scene,
 * twice. The rig keeps the light in the scene for the actor's whole life:
 * in the flame when a lit source is held, parked on `park` at intensity 0
 * otherwise, so the light count never changes.
 */
export class CarriedLightRig {
  readonly light: THREE.PointLight;
  private root: THREE.Object3D | null = null;
  private anchor: THREE.Object3D | null = null;
  private readonly scaleScratch = new THREE.Vector3();

  /** Lattice key of this carrier's wander noise, from its 0..1 seed. */
  private readonly seedKey: number;

  constructor(private readonly park: THREE.Object3D, private readonly candela: number, seed = 0.5) {
    this.seedKey = seed * 7919;
    this.light = new THREE.PointLight(0xffffff, 0, 1, 2);
    this.light.castShadow = false;
    this.light.name = "carried-light";
    park.add(this.light);
  }

  /**
   * One frame. `item` is the mounted off-hand item (null when nothing is
   * held), `spec` the held source (null when it is not a light), `level` the
   * 0-1 intensity, `timeS` the flicker clock.
   */
  update(item: THREE.Object3D | null, spec: LightSourceSpec | null, level: number, timeS: number): void {
    const light = this.light;
    if (!item || !spec) {
      this.root = null; this.anchor = null;
      if (light.parent !== this.park) { this.park.add(light); light.position.set(0, 0, 0); }
      light.intensity = 0;
      return;
    }
    // The AttachLight lookup walks the item's subtree: once per item, not per frame.
    if (item !== this.root) { this.root = item; this.anchor = item.getObjectByName("AttachLight") ?? item; }
    const anchor = this.anchor!;
    if (light.parent !== anchor) { anchor.add(light); light.position.set(0, 0, 0); }
    light.color.setRGB(spec.colour[0], spec.colour[1], spec.colour[2]);
    // The anchor may be scaled with the rig; keep the light's reach in metres.
    const scale = anchor.getWorldScale(this.scaleScratch).x || 1;
    light.distance = spec.radiusMetres / scale;
    light.intensity = this.candela * level;
    const flicker = spec.flicker;
    if (flicker && level > 0) {
      // The record's flicker movement: a small wander of the light, seeded
      // value noise per axis (fire/fireTypes.ts `flickerNoise`), never repeating.
      const x = flicker.frequency * timeS;
      const reach = flicker.movementMetres / scale;
      light.position.set(
        reach * 0.5 * flickerNoise(x, this.seedKey),
        reach * 0.5 * flickerNoise(x * 0.87, this.seedKey + 101),
        reach * 0.5 * flickerNoise(x * 1.13, this.seedKey + 211),
      );
    }
  }

  dispose(): void {
    this.light.parent?.remove(this.light);
    this.light.dispose();
  }
}
