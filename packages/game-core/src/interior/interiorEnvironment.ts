import * as THREE from "three";
import type { LoadedInterior } from "./interiorLoader";

const LIGHT_SWEEP_FRAMES = 30;

/**
 * The inside of a cell has no sun, sky or IBL (0103 decision 4): while the
 * player is inside, the scene's environment map, every light outside the
 * cell's own group, the sky's exposure and the scene fog are the cell's.
 * The exterior stays loaded; its drawn layers are hidden by the host, and
 * this puts back exactly what it took on `restore`.
 *
 * `frame()` runs each frame after the sky rig (which re-applies exposure and
 * may re-bake the environment): anything the rig wrote is remembered as the
 * value to restore, then overridden again.
 */
export class InteriorEnvironment {
  private readonly saved: {
    fog: THREE.Scene["fog"]; background: THREE.Scene["background"];
    environment: THREE.Scene["environment"]; exposure: number;
  };
  private readonly hidden = new Set<THREE.Light>();
  /** Frames until the next light sweep: a scene walk each frame costs more than a light ever added. */
  private sweepIn = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly gl: { toneMappingExposure: number },
    private readonly interior: LoadedInterior,
  ) {
    this.saved = {
      fog: scene.fog, background: scene.background,
      environment: scene.environment, exposure: gl.toneMappingExposure,
    };
    this.frame();
  }

  frame(): void {
    const { scene, gl, interior } = this;
    if (scene.environment) this.saved.environment = scene.environment;
    scene.environment = null;
    if (gl.toneMappingExposure !== 1) this.saved.exposure = gl.toneMappingExposure;
    gl.toneMappingExposure = 1;
    scene.fog = interior.fog;
    scene.background = interior.background;
    if (--this.sweepIn > 0) return;
    this.sweepIn = LIGHT_SWEEP_FRAMES;
    scene.traverse((o) => {
      const light = o as THREE.Light;
      if (!light.isLight || !light.visible || this.owns(light)) return;
      light.visible = false;
      this.hidden.add(light);
    });
  }

  restore(): void {
    const { scene, gl, saved } = this;
    scene.fog = saved.fog;
    scene.background = saved.background;
    scene.environment = saved.environment;
    gl.toneMappingExposure = saved.exposure;
    for (const light of this.hidden) light.visible = true;
    this.hidden.clear();
  }

  private owns(o: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === this.interior.group) return true;
    return false;
  }
}
