import * as THREE from "three";
import { colorFromRGB, INTERIOR_AMBIENT_SCALE, type LoadedInterior } from "./interiorLoader";
import type { InteriorBundle } from "./bundle";
import { AMBIENT_CUBE_KEYS } from "./ambientCube";

const LIGHT_SWEEP_FRAMES = 30;

/**
 * Interior auto-exposure (perf10 c12 A, Skyrim's eye adaptation): exposure =
 * clamp(INTERIOR_TARGET_AMBIENT / cell ambient mean, 1, INTERIOR_EXPOSURE_MAX).
 * A vanilla-dark hut (mean ~0.04 after INTERIOR_AMBIENT_SCALE) gets 4, dim but
 * legible; a cell at 0.16 or brighter stays at 1. Fixture lights keep their
 * screen brightness at any exposure (fixtureLightField FIXTURE_SCREEN_GAIN).
 */
export const INTERIOR_TARGET_AMBIENT = 0.16;
export const INTERIOR_EXPOSURE_MAX = 6;
/** Ease time constant (s) toward the cell's exposure on enter: ~95 % in 0.5 s, no pop. */
export const INTERIOR_EXPOSURE_TAU_S = 0.17;

/** The cell's ambient as lit (linear, mean of the cube's axes and channels, or of the flat colour), times its scale. */
export function interiorAmbientMean(bundle: InteriorBundle): number {
  const scale = bundle.ambient.intensity * INTERIOR_AMBIENT_SCALE;
  const cube = bundle.lighting?.ambientCube;
  if (cube) {
    let sum = 0;
    for (const k of AMBIENT_CUBE_KEYS) sum += cube[k][0] + cube[k][1] + cube[k][2];
    return (sum / 18) * scale;
  }
  const c = colorFromRGB(bundle.ambient.colorRGB);
  return ((c.r + c.g + c.b) / 3) * scale;
}

/** The exposure a cell of ambient `mean` is drawn at. */
export function interiorExposure(mean: number): number {
  if (!(mean > 0)) return INTERIOR_EXPOSURE_MAX;
  return THREE.MathUtils.clamp(INTERIOR_TARGET_AMBIENT / mean, 1, INTERIOR_EXPOSURE_MAX);
}

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
  /** The cell's adapted exposure (`interiorExposure` of its ambient mean). */
  readonly targetExposure: number;
  /** The exposure written this frame, eased from the outside value toward `targetExposure`. */
  exposure: number;
  private lastS: number | null = null;

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
    this.targetExposure = interiorExposure(interiorAmbientMean(interior.bundle));
    this.exposure = THREE.MathUtils.clamp(gl.toneMappingExposure || 1, 1, INTERIOR_EXPOSURE_MAX);
    this.frame(0);
  }

  /** `dtS`: seconds since the last frame (default: measured on the wall clock). */
  frame(dtS?: number): void {
    const { scene, gl, interior } = this;
    if (scene.environment) this.saved.environment = scene.environment;
    scene.environment = null;
    if (gl.toneMappingExposure !== this.exposure) this.saved.exposure = gl.toneMappingExposure;
    const now = performance.now() / 1000;
    const dt = dtS ?? (this.lastS === null ? 0 : Math.min(now - this.lastS, 0.1));
    this.lastS = now;
    this.exposure += (this.targetExposure - this.exposure) * (1 - Math.exp(-dt / INTERIOR_EXPOSURE_TAU_S));
    gl.toneMappingExposure = this.exposure;
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
