import * as THREE from "three";
import * as tsl from "three/tsl";
import type { LoadedInterior } from "./interiorLoader";
import type { TslNode } from "../render/nodes/materialNodes";
import type { InteriorFogProfile } from "../air/volumetrics/froxelGrid";
import { applyVolumetrics, type VolumetricsSampler } from "../air/volumetrics/volumetricNodes";
import { DUST_DENSITY, interiorLightOf, type InteriorLightRecord } from "../air/volumetrics/windowApertures";

const T = tsl as unknown as Record<string, (...a: TslNode[]) => TslNode> & Record<string, TslNode>;

/**
 * The cell's volumetric profile (decision 0112 §6) from its row in the
 * interior light record: knee-high floor mist on a damp cell (cave, mine,
 * barrow), and the dust haze its kind carries (DUST_DENSITY), so lamp halos and
 * window shafts read as strongly as the room is dusty. A cell the record lacks
 * gets medium dust and no mist. `floorY` is the arrival marker's height (it
 * stands on the floor) in the cell's placed frame.
 */
export function interiorFogProfile(interior: Pick<LoadedInterior, "bundle">, originY: number,
  record?: InteriorLightRecord): InteriorFogProfile {
  const b = interior.bundle;
  const row = interiorLightOf(b.cellId, record);
  const floorY = originY + b.arrivalMarker.positionM[1];
  const dustDensity = DUST_DENSITY[row?.dust ?? "medium"];
  return row?.floorMist
    ? { floorY, floorMistTopM: 0.9, floorMistDensity: 0.35, dustDensity }
    : { floorY, floorMistTopM: 0, floorMistDensity: 0, dustDensity };
}

/**
 * The inside's scene fog as a node: the froxel medium (floor mist, dust,
 * lamp halos) then the cell's own range fog, the same `smoothstep(near, far)`
 * three's `scene.fog` draws. One node per host; `set` swaps the cell's fog
 * through uniforms, so every cell compiles to the same program keys.
 */
export class InteriorFogNode {
  private readonly color = T.uniform(new THREE.Color() as never);
  private readonly near = T.uniform(1 as never);
  private readonly far = T.uniform(100 as never);
  readonly node: TslNode;
  constructor(v: VolumetricsSampler) {
    const depth = T.positionView.z.negate();
    this.node = T.Fn(() => {
      const lit = applyVolumetrics(v, T.output, depth, T.screenUV);
      return T.vec4(T.mix(lit.rgb, this.color, T.smoothstep(this.near, this.far, depth)), lit.a);
    })();
  }
  set(fog: THREE.Fog): void {
    (this.color as unknown as { value: THREE.Color }).value.copy(fog.color);
    (this.near as unknown as { value: number }).value = fog.near;
    (this.far as unknown as { value: number }).value = fog.far;
  }
}

const LIGHT_SWEEP_FRAMES = 30;

/** The renderer fields the cell's environment sets (the node renderer, 0107, satisfies it). */
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
 * (renderers/common/Background.js, r184 `forceClear`). The water pipeline draws the
 * scene into its target, blits it to the screen, then renders the scene
 * again three times onto the screen (water, precipitation and overlay
 * layers); a Color background wiped the blit each time, so a cell showed as
 * a flat fog-grey screen (walk 4 defect a). With the background null, those
 * passes draw over the blit, and the scene pass clears to the fog colour
 * through the clear colour.
 *
 * Scene fog: the node renderer draws `scene.fogNode` in preference to
 * `scene.fog` (NodeManager.getFogNode), and the sky sets the outdoor haze
 * as that node (decision 0107). Inside, the outdoor node is swapped for the
 * cell's (`InteriorFogNode`: the volumetric medium, then the cell's range
 * fog), or lifted so `scene.fog` draws when no medium runs; put back on
 * `restore`. Exposure inside is 1, the value `sceneRadiance` then reads.
 *
 * `frame()` runs each frame after the sky rig (which re-applies exposure and
 * may re-bake the environment): anything the rig wrote is remembered as the
 * value to restore, then overridden again.
 */
export class InteriorEnvironment {
  private readonly saved: {
    fog: THREE.Scene["fog"]; background: THREE.Scene["background"];
    environment: THREE.Scene["environment"]; fogNode: unknown; exposure: number;
    clearColor: THREE.Color; clearAlpha: number;
  };
  private readonly hidden = new Set<THREE.Light>();
  /** Frames until the next light sweep: a scene walk each frame costs more than a light ever added. */
  private sweepIn = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly gl: InteriorRenderer,
    private readonly interior: LoadedInterior,
    /** The cell's fog node (`InteriorFogNode`); null draws `scene.fog`. */
    private readonly fog: InteriorFogNode | null = null,
  ) {
    fog?.set(interior.fog);
    this.saved = {
      fog: scene.fog, background: scene.background,
      environment: scene.environment, fogNode: fogNodeOf(scene).fogNode ?? null,
      exposure: gl.toneMappingExposure,
      clearColor: gl.getClearColor(new THREE.Color()), clearAlpha: gl.getClearAlpha(),
    };
    this.frame();
  }

  frame(): void {
    const { scene, gl, interior } = this;
    if (scene.environment) this.saved.environment = scene.environment;
    scene.environment = null;
    const fogHost = fogNodeOf(scene);
    const inside = this.fog?.node ?? null;
    if (fogHost.fogNode && fogHost.fogNode !== inside) this.saved.fogNode = fogHost.fogNode;
    fogHost.fogNode = inside;
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
    fogNodeOf(scene).fogNode = saved.fogNode;
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

/** `Scene.fogNode` (three/webgpu; not in the classic Scene typings). */
function fogNodeOf(scene: THREE.Scene): { fogNode?: unknown } {
  return scene as unknown as { fogNode?: unknown };
}
