import * as THREE from "three";
import type { LightSourceSpec } from "./carriedLight";

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

  constructor(private readonly park: THREE.Object3D, private readonly candela: number) {
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
      // The record's flicker movement: a small wander of the light, two
      // incommensurate waves per axis so it never visibly repeats.
      const phase = 2 * Math.PI * flicker.frequency * timeS;
      const reach = flicker.movementMetres / scale;
      light.position.set(
        reach * 0.5 * Math.sin(phase * 1.13 + 0.4) * Math.sin(phase * 0.37),
        reach * 0.5 * Math.sin(phase * 0.91 + 2.1),
        reach * 0.5 * Math.sin(phase * 1.47 + 4.2) * Math.cos(phase * 0.29),
      );
    }
  }

  dispose(): void {
    this.light.parent?.remove(this.light);
    this.light.dispose();
  }
}
