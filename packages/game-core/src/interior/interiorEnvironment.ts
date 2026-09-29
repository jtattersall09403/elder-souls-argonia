import * as THREE from "three";
import type { LoadedInterior } from "./interiorLoader";

const LIGHT_SWEEP_FRAMES = 30;

/** The renderer fields the cell's environment sets (a `THREE.WebGLRenderer` satisfies it). */
export interface InteriorRenderer {
  toneMappingExposure: number;
  getClearColor(target: THREE.Color): THREE.Color;
  getClearAlpha(): number;
  setClearColor(color: THREE.Color, alpha?: number): void;
}

/**
 * The inside of a cell has no sun, sky or IBL (0103 decision 4): while the
 * player is inside, the scene's environment map, every light outside the
 * cell's own group, the sky's exposure and the scene fog are the cell's.
 * The exterior stays loaded; its drawn layers are hidden by the host, and
 * this puts back exactly what it took on `restore`.
 *
 * The cell's fog colour is the renderer's CLEAR colour, never
 * `scene.background`: three clears the target on EVERY `render()` call when
 * the background is a Color, ignoring `autoClear = false`
 * (WebGLBackground.render, r184 `forceClear`). The water pipeline draws the
 * scene into its target, blits it to the screen, then renders the scene
 * again three times onto the screen (water, precipitation and overlay
 * layers); a Color background wiped the blit each time, so a cell showed as
 * a flat fog-grey screen (walk 4 defect a). With the background null, those
 * passes draw over the blit, and the scene pass clears to the fog colour
 * through the clear colour.
 *
 * `frame()` runs each frame after the sky rig (which re-applies exposure and
 * may re-bake the environment): anything the rig wrote is remembered as the
 * value to restore, then overridden again.
 */
export class InteriorEnvironment {
  private readonly saved: {
    fog: THREE.Scene["fog"]; background: THREE.Scene["background"];
    environment: THREE.Scene["environment"]; exposure: number;
    clearColor: THREE.Color; clearAlpha: number;
  };
  private readonly hidden = new Set<THREE.Light>();
  /** Frames until the next light sweep: a scene walk each frame costs more than a light ever added. */
  private sweepIn = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly gl: InteriorRenderer,
    private readonly interior: LoadedInterior,
  ) {
    this.saved = {
      fog: scene.fog, background: scene.background,
      environment: scene.environment, exposure: gl.toneMappingExposure,
      clearColor: gl.getClearColor(new THREE.Color()), clearAlpha: gl.getClearAlpha(),
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
    scene.background = null;
    gl.setClearColor(interior.background, 1);
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
    gl.setClearColor(saved.clearColor, saved.clearAlpha);
    for (const light of this.hidden) light.visible = true;
    this.hidden.clear();
  }

  private owns(o: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === this.interior.group) return true;
    return false;
  }
}
